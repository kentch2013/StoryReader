import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiscourse } from '../services/discourse_resolver.js';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { sanitizeAnalysisProbes } from '../services/gemini_service.js';
import { matchAcceptablePhrasings } from '../services/rubric_matcher.js';
import { BOOK_ANALYSIS_SYSTEM_PROMPT } from '../prompts/book_analysis.js';

test('Calibration #1: Discourse resolver inflects possessive pronouns with genitive case', () => {
  const rubric = {
    checkin_question: 'Who attended the birthday party that Robert held?',
    target_answer_concept: 'all his farm friends',
    entity_graph: {
      characters: [
        { canonical_id: 'robert', canonical_name: 'Robert', gender: 'male' },
      ],
    },
  };

  const res = resolveDiscourse('his friends', rubric);
  assert.equal(
    res.grounded_transcript,
    "robert's friends",
    'Possessive pronoun "his" must be resolved to genitive "robert\'s", not bare ungrammatical "robert friends"'
  );
});

test('Calibration #2: Tier 1 prototype matching takes precedence for exact minimal core matches', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: '179-180',
    checkin_question: 'Who attended the birthday party that Robert held?',
    target_answer_concept: 'all his farm friends',
    canonical_prototypes: [
      { type: 'formal_full', text: 'All his farm friends came to the party.' },
      { type: 'colloquial', text: 'His farm friends were there.' },
      { type: 'minimal_core', text: 'his friends' },
      { type: 'common_distractor', text: 'his mother and father' },
    ],
    diagnostic_probes: {
      target_mastery: { hypothesis: 'His farm friends attended.', feedback: 'Spot on!' },
      minimal_core: { hypothesis: 'The reader says friends.', feedback: 'Correct!' },
      distractor_misconception: { hypothesis: 'His mother and father.', scaffold: 'Look at the guests!' },
      superficial_attribute: { hypothesis: 'The cake was red.', scaffold: 'Look closer.' },
    },
    entity_graph: {
      characters: [{ canonical_id: 'robert', canonical_name: 'Robert', gender: 'male' }],
    },
  };

  const evalRes = await evaluateChildAnswer({
    ...chunk,
    child_transcript: 'his friends',
    attempt_count: 1,
  });

  assert.equal(evalRes.status, 'mastered', 'Exact minimal core match must be awarded mastered');
  assert.match(
    evalRes.diagnostics.tier_resolved,
    /TIER_1_PROTOTYPE/,
    'Must resolve via Tier 1 prototype fast-path'
  );
});

test('Calibration #3: sanitizeAnalysisProbes cleans "The reader says" meta-commentary', () => {
  const analysis = {
    chunks: [
      {
        diagnostic_probes: {
          minimal_core: {
            hypothesis: "The reader says 'friends' or 'farm friends'.",
            feedback: 'Correct!',
          },
          target_mastery: {
            hypothesis: 'The student states that his friends came to the party.',
            feedback: 'Great!',
          },
        },
      },
    ],
  };

  const sanitized = sanitizeAnalysisProbes(analysis);
  const minHyp = sanitized.chunks[0].diagnostic_probes.minimal_core.hypothesis;
  const targetHyp = sanitized.chunks[0].diagnostic_probes.target_mastery.hypothesis;

  assert.ok(!minHyp.toLowerCase().includes('the reader says'), 'Must strip "the reader says"');
  assert.ok(!targetHyp.toLowerCase().includes('the student states'), 'Must strip "the student states"');
});

test('Calibration #4: matchAcceptablePhrasings filters stop words to prevent false leniency', () => {
  const phrasings = ['he was upset because of it'];

  // Utterance with only stop words matching
  const stopWordEcho = 'he was in it';
  const matchStopWordsOnly = matchAcceptablePhrasings(stopWordEcho, phrasings);
  assert.equal(matchStopWordsOnly, false, 'Must reject echo containing only stop words');

  // Utterance with core content words matching
  const contentMatch = 'upset because of it';
  const matchContent = matchAcceptablePhrasings(contentMatch, phrasings);
  assert.equal(matchContent, true, 'Must accept utterance matching key content words');
});

test('Calibration #5: BOOK_ANALYSIS_SYSTEM_PROMPT enforces strict chunk ceiling <= 3 pages', () => {
  assert.match(
    BOOK_ANALYSIS_SYSTEM_PROMPT,
    /maximum (?:of )?2-3 pages|never group 4|ceiling/i,
    'System prompt must mandate a strict 2-3 page chunk ceiling'
  );
});
