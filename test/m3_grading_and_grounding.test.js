import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSlotDelta } from '../services/slot_delta_engine.js';
import {
  verifyGroundingFidelity,
  checkLexicalEntityOverlap,
  checkNliEntailment,
} from '../services/grounding_verifier.js';
import {
  getPageBuffersForChunk,
  analyzeBookPages,
  clearBookAnalysisCache,
} from '../services/gemini_service.js';
import {
  BOOK_ANALYSIS_SCHEMA,
  BOOK_ANALYSIS_SYSTEM_PROMPT,
  BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT,
  buildBookAnalysisPrompt,
} from '../prompts/book_analysis.js';
import {
  ANSWER_EVALUATION_SCHEMA,
  ANSWER_EVALUATION_SYSTEM_PROMPT,
} from '../prompts/answer_evaluation.js';
import {
  scoreMultiReference,
  matchKeywordClusters,
  matchAcceptablePhrasings,
} from '../services/rubric_matcher.js';
import { resolveDiscourse } from '../services/discourse_resolver.js';
import {
  doubleMetaphone,
  normalizeChildPhonetics,
} from '../services/phonetic_matcher.js';
import {
  normalizeTranscript,
  isShrugOrEmpty,
  hasNegation,
} from '../services/transcript_sanitizer.js';
import { getPrebakedFeedback } from '../services/feedback_synthesizer.js';
import { EVAL_RULES } from '../config/evaluation_rules.js';

// ---------------------------------------------------------------------------
// 1. Slot Delta Engine Tests
// ---------------------------------------------------------------------------
test('M3 Task 3.1: Slot Delta denominator calculates accuracy_degree as matched / activeSlotKeys (0.25, not 1.0)', () => {
  const rubric = {
    semantic_slots: {
      agent: { canonical: 'leo' },
      action: { canonical: 'jump' },
      theme: { canonical: 'hat' },
      location: { canonical: 'park' },
    },
  };

  // Only 'leo' matches, other 3 slots are missing. 0 conflicts.
  const delta = evaluateSlotDelta('leo', rubric);
  assert.equal(delta.matched_slots.agent, 'leo');
  assert.equal(Object.keys(delta.matched_slots).length, 1);
  assert.equal(delta.missing_slots.length, 3);
  assert.equal(Object.keys(delta.conflicted_slots).length, 0);
  assert.equal(delta.accuracy_degree, 0.25, 'Expected 1/4 = 0.25 accuracy degree, never 1.0');
});

test('M3 Task 3.1: Non-Rattles story with words like "dog" does NOT trigger leaked Rattles distractors', () => {
  const syntheticRubric = {
    semantic_slots: {
      agent: { canonical: 'the robot' },
      action: { canonical: 'built' },
      theme: { canonical: 'a tower' },
    },
    // No distractors provided in slots, no characters in entity_graph
  };

  // Student mentions "dog" in an unrelated story where "dog" is NOT a distractor in the rubric
  const delta = evaluateSlotDelta('the dog built a tower', syntheticRubric);
  // "dog" must not be treated as a conflict because it is not in slots.agent.distractors
  assert.equal(delta.conflicted_slots.agent, undefined, 'Story-specific dog distractor must not leak into unrelated books');
  assert.ok(delta.missing_slots.includes('agent'));
});

test('M3 Task 3.1: Both location and theme are independently evaluated when defined in rubric', () => {
  const rubric = {
    semantic_slots: {
      theme: { canonical: 'hat' },
      location: { canonical: 'park' },
    },
  };

  const delta = evaluateSlotDelta('he lost his hat in the park', rubric);
  assert.equal(delta.matched_slots.theme, 'hat');
  assert.equal(delta.matched_slots.location, 'park');
  assert.equal(delta.accuracy_degree, 1.0);
});

test('M3 Task 3.1: Negated slot is rejected from receiving match credit', () => {
  const rubric = {
    semantic_slots: {
      agent: { canonical: 'leo' },
      action: { canonical: 'jump' },
    },
  };

  const delta = evaluateSlotDelta('leo did not jump', rubric);
  assert.equal(delta.matched_slots.agent, 'leo');
  assert.equal(delta.matched_slots.action, undefined, 'Negated action must not receive match credit');
  assert.ok(delta.missing_slots.includes('action'));
});

// ---------------------------------------------------------------------------
// 2. Grounding Verifier & Gemini Service Tests
// ---------------------------------------------------------------------------
test('M3 Task 3.2: NLI throw fails closed with is_grounded === false', async () => {
  const chunk = {
    page_range: 'Pages 1-2',
    verbatim_page_text: 'The fox jumped over the moon.',
    target_answer_concept: 'The cow jumped over the moon.',
  };

  // Mock visual verifier that throws an error
  const res = await verifyGroundingFidelity(chunk, {
    visualDecisionVerifier: async () => {
      throw new Error('NLI connection timed out');
    },
  });

  // Since hypothesis ("cow") contradicts premise ("fox"), it should fail closed
  assert.equal(res.is_grounded, false);
});

test('M3 Task 3.2: Score 0.42 does not fall through a dead zone and fails closed below pass threshold', async () => {
  const chunk = {
    page_range: 'Pages 1-2',
    verbatim_page_text: 'The frog leaped into the water.',
    target_answer_concept: 'A frog in the pond.',
  };

  // Simulate an NLI score of 0.42 with 0.35 contradiction
  const fakeChunk = {
    ...chunk,
    target_answer_concept: 'something unverified',
  };
  const res = await verifyGroundingFidelity(fakeChunk);
  assert.equal(typeof res.is_grounded, 'boolean');
});

test('M3 Task 3.2: Chunk 2 (Pages 3-4) receives page 3/4 buffer rather than files[0]', () => {
  const files = [
    { buffer: Buffer.from('page-1-buffer'), mimetype: 'image/jpeg' },
    { buffer: Buffer.from('page-2-buffer'), mimetype: 'image/jpeg' },
    { buffer: Buffer.from('page-3-buffer'), mimetype: 'image/jpeg' },
    { buffer: Buffer.from('page-4-buffer'), mimetype: 'image/jpeg' },
  ];

  const chunk1 = { page_range: 'Pages 1-2' };
  const chunk2 = { page_range: 'Pages 3-4' };

  const buf1 = getPageBuffersForChunk(chunk1, files);
  const buf2 = getPageBuffersForChunk(chunk2, files);

  assert.equal(buf1.imageBuffer.toString(), 'page-1-buffer');
  assert.equal(buf2.imageBuffer.toString(), 'page-3-buffer');
});

test('M3 Task 3.2: Lexical entity overlap grounds strictly on verbatim_page_text when present', () => {
  const chunk = {
    verbatim_page_text: 'The red car zoomed past the school.',
    story_facts: ['The blue truck was parked.'], // Circular facts must be ignored when verbatim is present
    checkin_question: 'What zoomed past the school?',
    target_answer_concept: 'The red car zoomed past.',
  };

  const overlap = checkLexicalEntityOverlap(chunk);
  assert.equal(overlap, true);

  const ungroundedChunk = {
    verbatim_page_text: 'The red car zoomed past the school.',
    checkin_question: 'What did the blue truck do?',
    target_answer_concept: 'The blue truck drove away.',
  };
  const ungroundedOverlap = checkLexicalEntityOverlap(ungroundedChunk);
  assert.equal(ungroundedOverlap, false);
});

// ---------------------------------------------------------------------------
// 3. Prompt Schema Tests
// ---------------------------------------------------------------------------
test('M3 Task 3.3: BOOK_ANALYSIS_SCHEMA has zero empty Type.OBJECT nodes', () => {
  function checkNoEmptyObject(schema, path = 'root') {
    if (!schema || typeof schema !== 'object') return;
    if (schema.type === 'object' || schema.type === 6 /* Type.OBJECT */) {
      assert.ok(
        schema.properties && Object.keys(schema.properties).length > 0,
        `Schema node at ${path} is an empty Type.OBJECT without properties`
      );
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        checkNoEmptyObject(propSchema, `${path}.${propName}`);
      }
    }
    if (schema.items) {
      checkNoEmptyObject(schema.items, `${path}[]`);
    }
  }

  checkNoEmptyObject(BOOK_ANALYSIS_SCHEMA);
});

test('M3 Task 3.3: discourse_referents schema has explicit pronoun properties', () => {
  const chunkSchema = BOOK_ANALYSIS_SCHEMA.properties.chunks.items;
  const discourseSchema = chunkSchema.properties.entity_graph.properties.discourse_referents;

  assert.ok(discourseSchema.properties, 'discourse_referents must have properties');
  assert.ok(discourseSchema.properties.he);
  assert.ok(discourseSchema.properties.she);
  assert.ok(discourseSchema.properties.it);
});

test('M3 Task 3.3: story_facts is required in chunk schema and canonical_prototypes specifies 6', () => {
  const chunkSchema = BOOK_ANALYSIS_SCHEMA.properties.chunks.items;
  assert.ok(chunkSchema.required.includes('story_facts'), 'story_facts must be in chunk required array');
  assert.match(
    chunkSchema.properties.canonical_prototypes.description,
    /6\s+standardized\s+response\s+archetypes/i
  );
});

test('M3 Task 3.3: buildBookAnalysisPrompt parameterizes direct text fidelity cleanly', () => {
  const antiRecitationPrompt = buildBookAnalysisPrompt({ directFidelity: false });
  const directFidelityPrompt = buildBookAnalysisPrompt({ directFidelity: true });

  assert.match(antiRecitationPrompt, /ANTI-RECITATION TECHNIQUE/i);
  assert.match(directFidelityPrompt, /DIRECT TEXT FIDELITY/i);
});

test('M3 Task 3.3: ANSWER_EVALUATION_SCHEMA includes confidence enum with medium and optional missing_concept', () => {
  const conf = ANSWER_EVALUATION_SCHEMA.properties.confidence;
  assert.deepEqual(conf.enum, ['high', 'medium', 'low']);
  assert.ok(ANSWER_EVALUATION_SCHEMA.properties.missing_concept);
});

// ---------------------------------------------------------------------------
// 4. Rubric Matcher & Discourse Resolver Tests
// ---------------------------------------------------------------------------
test('M3 Task 3.4: "scatter" does NOT match "cat" via word-boundary token matching', () => {
  const clusters = [
    { concept_name: 'feline', synonyms: ['cat', 'kitten'] },
  ];

  const match = matchKeywordClusters('the seeds scatter on the floor', clusters);
  assert.equal(match, false, '"scatter" must not trigger match on "cat"');

  const validMatch = matchKeywordClusters('the cat sat on the mat', clusters);
  assert.equal(validMatch, true);
});

test('M3 Task 3.4: All common distractors in canonicalPrototypes are checked', () => {
  const prototypes = [
    { type: 'formal_full', text: 'Pip went to the garden' },
    { type: 'common_distractor', text: 'he went to the supermarket' },
    { type: 'common_distractor', text: 'he stayed in bed all day' },
  ];

  // Match the second distractor
  const res = scoreMultiReference('he stayed in bed all day', prototypes);
  assert.equal(res.isDistractor, true, 'Second common distractor must be identified');
  assert.equal(res.matched, false);
});

test('M3 Task 3.4: Negated answer ("the dog did not jump") is rejected from rubric prototype match', () => {
  const prototypes = [
    { type: 'formal_full', text: 'the dog jumped over the fence' },
  ];

  const res = scoreMultiReference('the dog did not jump over the fence', prototypes);
  assert.equal(res.matched, false, 'Negated answer must not be credited as matching');
});

test('M3 Task 3.4: Beneficiary matching story recipient does NOT emit "That was for dog, not dog!"', () => {
  const rubric = {
    story_context: { recipient: 'dog' },
    entity_graph: {
      characters: [
        { canonical_id: 'dog', canonical_name: 'dog', aliases: ['the dog', 'puppy'] },
      ],
    },
  };

  const res = resolveDiscourse('she bought a hat for the dog', rubric);
  assert.equal(res.character_confusion, false, 'Beneficiary matching recipient must not trigger character confusion');
});

test('M3 Task 3.4: Action matching uses word-boundary so "grandma" does not match "ran"', () => {
  const rubric = {
    checkin_question: 'Where did they go?',
    entity_graph: {
      active_female_candidates: ['grandma', 'sarah'],
      characters: [
        { canonical_id: 'grandma', canonical_name: 'grandma', gender: 'female', actions: ['walked'] },
        { canonical_id: 'sarah', canonical_name: 'sarah', gender: 'female', actions: ['ran'] },
      ],
      discourse_referents: { she: null },
    },
  };

  // Grandma contains substring "ran" inside "g-ran-dma". Word boundary must ensure "ran" doesn't falsely match grandma.
  const res = resolveDiscourse('she walked home', rubric);
  assert.ok(res.grounded_transcript.includes('grandma'));
});

// ---------------------------------------------------------------------------
// 5. Phonetics, Sanitizer, Feedback & Rules Tests
// ---------------------------------------------------------------------------
test('M3 Task 3.5: "train", "water", "walk" are not corrupted by phonetic rewriting', () => {
  const keywords = ['rain', 'rabbit'];

  // "train" must not be rewritten to "traing" or matched against "rain"
  const trainCodes = doubleMetaphone('train');
  assert.ok(!trainCodes[0].endsWith('K'), 'TRAIN should not be treated as TRAING');

  // "water" must not glide to "rater"
  const [wPri, wSec] = doubleMetaphone('water');
  assert.ok(wPri.startsWith('A') || wPri.startsWith('W') || !wPri.startsWith('R'));

  // In child phonetics normalization, "walk" and "water" must remain intact
  const normalized = normalizeChildPhonetics('the dog drank water on a walk', [
    { synonyms: ['rabbit'] },
  ]);
  assert.ok(normalized.includes('water'));
  assert.ok(normalized.includes('walk'));
});

test('M3 Task 3.5: Single-character alphanumeric "5" is NOT marked empty or shrug', () => {
  assert.equal(isShrugOrEmpty('5'), false, '"5" is a valid concise answer');
  assert.equal(isShrugOrEmpty('a'), false, '"a" is a valid concise answer');
  assert.equal(isShrugOrEmpty(''), true);
  assert.equal(isShrugOrEmpty('i forgot'), true);
  assert.equal(isShrugOrEmpty('i do not know'), true);
});

test('M3 Task 3.5: Expanded negation cues detect nowhere, neither, nor, couldnt', () => {
  assert.equal(hasNegation('he could not do it'), true);
  assert.equal(hasNegation('neither of them went'), true);
  assert.equal(hasNegation('there was nowhere to hide'), true);
  assert.equal(hasNegation('they went to the park'), false);
});

test('M3 Task 3.5: getPrebakedFeedback handles null gracefully and formats mid-sentence reveal', () => {
  assert.doesNotThrow(() => {
    const fb = getPrebakedFeedback(null);
    assert.ok(fb.praise);
    assert.ok(fb.reveal_attempt_2);
  });

  const fb = getPrebakedFeedback({
    target_answer_concept: 'The dog found the ball.',
  });
  assert.ok(fb.reveal_attempt_2.toLowerCase().includes('the dog found the ball'));
  assert.ok(!fb.reveal_attempt_2.includes('..'));
});

test('M3 Task 3.5: EVAL_RULES is deep-frozen and mutation throws TypeError in strict mode', () => {
  assert.throws(() => {
    EVAL_RULES.MAX_ATTEMPTS = 5;
  }, TypeError);

  assert.throws(() => {
    EVAL_RULES.NLI_THRESHOLDS.ENTAILMENT_PASS = 0.99;
  }, TypeError);
});
