import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyGroundingFidelity,
} from '../services/grounding_verifier.js';
import {
  BOOK_ANALYSIS_SYSTEM_PROMPT,
  BOOK_ANALYSIS_SCHEMA,
} from '../prompts/book_analysis.js';
import {
  verifyVisualGroundingWithDecision,
} from '../services/gemini_decision_service.js';
import {
  getMockBookAnalysis,
} from '../services/gemini_service.js';

test('BOOK_ANALYSIS_SCHEMA and SYSTEM_PROMPT mandate paraphrased_story_facts to prevent recitation blocks', () => {
  const chunkProps = BOOK_ANALYSIS_SCHEMA.properties.chunks.items.properties;
  assert.ok(
    chunkProps.paraphrased_story_facts,
    'Schema must define paraphrased_story_facts to ground chunks without verbatim recitation'
  );
  assert.match(
    BOOK_ANALYSIS_SYSTEM_PROMPT,
    /paraphrased_story_facts/i,
    'System prompt must mandate paraphrased_story_facts'
  );
  assert.match(
    BOOK_ANALYSIS_SYSTEM_PROMPT,
    /do not copy|never copy|paraphrase/i,
    'System prompt must instruct model to paraphrase to prevent copyright recitation blocks'
  );
});

test('Grounding Verifier: verifies chunks using paraphrased_story_facts without verbatim text', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    paraphrased_story_facts: 'A young bunny informs his mother that he plans to run away. The mother replies that she will follow him anywhere because he is her beloved bunny.',
    checkin_question: 'What will the mother do if the little bunny runs away?',
    target_answer_concept: 'The mother will follow him because he is her little bunny.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_mom', canonical_name: 'mother', aliases: ['mom'] },
        { canonical_id: 'char_bunny', canonical_name: 'bunny', aliases: ['little bunny'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, true);
  assert.equal(result.lexical_pass, true);
  assert.ok(result.nli_score.entailment >= 0.45);
  assert.ok(result.nli_score.contradiction < 0.30);
  assert.equal(result.flagged_for_review, false);
});

test('Grounding Verifier: rejects ungrounded entity when using paraphrased_story_facts', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    paraphrased_story_facts: 'A young bunny informs his mother that he plans to run away.',
    checkin_question: 'What did the father dog give the bunny to eat?',
    target_answer_concept: 'The father dog gave him chocolate ice cream.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_bunny', canonical_name: 'bunny', aliases: ['little bunny'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, false);
  assert.equal(result.lexical_pass, false);
  assert.equal(result.failure_reason, 'UNGROUNDED_ENTITY');
});

test('verifyGroundingFidelity integrates Decision 1 visual grounding when image and option provided', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    paraphrased_story_facts: 'Leo is sad because his grandmother knitted a warm red hat for him and it blew away.',
    checkin_question: 'Why was Leo sad?',
    target_answer_concept: 'His grandmother knitted a special warm red hat for him.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_leo', canonical_name: 'Leo', aliases: ['Leo'] },
        { canonical_id: 'char_grandma', canonical_name: 'grandmother', aliases: ['grandma'] },
      ],
    },
  };

  // Mock Decision 1 returning ungrounded (hallucination detected in image)
  const mockDecisionVerifier = async () => ({
    grounded: false,
    groundedProbability: 0.20,
    legible: true,
  });

  const result = await verifyGroundingFidelity(chunk, {
    visualDecisionVerifier: mockDecisionVerifier,
    imageBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  });

  assert.equal(result.is_grounded, false);
  assert.equal(result.failure_reason, 'VISUAL_GROUNDING_FAILED');
  assert.equal(result.flagged_for_review, true);
});

test('BOOK_ANALYSIS_SCHEMA and SYSTEM_PROMPT mandate story_facts array with 1:1 detail retention', () => {
  const chunkProps = BOOK_ANALYSIS_SCHEMA.properties.chunks.items.properties;
  assert.ok(
    chunkProps.story_facts,
    'Schema must define story_facts array for granular atomic proposition retention'
  );
  assert.match(
    BOOK_ANALYSIS_SYSTEM_PROMPT,
    /story_facts/i,
    'System prompt must mandate story_facts array'
  );
  assert.match(
    BOOK_ANALYSIS_SYSTEM_PROMPT,
    /1:1|zero detail loss|all\s+(?:events|details|sentences)/i,
    'System prompt must mandate 1:1 coverage or zero detail loss to prevent over-condensing'
  );
});

test('Grounding Verifier: verifies chunks using story_facts array when testing granular details', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    paraphrased_story_facts: 'Pip the mouse departs his cozy teapot home under the oak tree and ventures into the garden.',
    story_facts: [
      'Pip the mouse woke up inside an old teapot.',
      'The teapot sat underneath a tall oak tree beside the garden fence.',
      'Pip was wearing bright yellow boots on his feet.',
      'He smelled a sweet blueberry pie cooling on Mrs. Higgins windowsill.',
    ],
    checkin_question: 'What color boots was Pip wearing?',
    target_answer_concept: 'Pip was wearing bright yellow boots.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_pip', canonical_name: 'Pip', aliases: ['Pip the mouse', 'mouse'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, true);
  assert.equal(result.lexical_pass, true);
  assert.ok(result.nli_score.entailment >= 0.45);
  assert.equal(result.flagged_for_review, false);
});

test('getMockBookAnalysis provides story_facts array for each chunk matching schema', () => {
  const mockAnalysis = getMockBookAnalysis([{ buffer: Buffer.from('test') }]);
  assert.ok(Array.isArray(mockAnalysis.chunks));
  assert.ok(mockAnalysis.chunks.length > 0);
  for (const chunk of mockAnalysis.chunks) {
    assert.ok(
      Array.isArray(chunk.story_facts),
      'Each mock chunk must provide story_facts array'
    );
    assert.ok(
      chunk.story_facts.length >= 3,
      'story_facts must contain at least 3 granular atomic propositions'
    );
  }
});

