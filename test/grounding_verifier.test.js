import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyGroundingFidelity,
  checkLexicalEntityOverlap,
  checkNliEntailment,
} from '../services/grounding_verifier.js';

test('Grounding Verifier: passes on factual concept strictly entailed by verbatim page text', async () => {
  const pageText = 'Once there was a little bunny who wanted to run away. So he said to his mother, "I am running away." "If you run away," said his mother, "I will run after you. For you are my little bunny."';
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    verbatim_page_text: pageText,
    checkin_question: 'What will the mother do if the little bunny runs away?',
    target_answer_concept: 'The mother will run after him because he is her little bunny.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_mom', canonical_name: 'mother bunny', aliases: ['mother', 'mom'] },
        { canonical_id: 'char_bunny', canonical_name: 'little bunny', aliases: ['bunny'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, true);
  assert.equal(result.lexical_pass, true);
  assert.ok(result.nli_score.entailment >= 0.50);
  assert.ok(result.nli_score.contradiction < 0.25);
  assert.equal(result.flagged_for_review, false);
});

test('Grounding Verifier: rejects hallucinated entity not present in text or entity graph', async () => {
  const pageText = 'Once there was a little bunny who wanted to run away. So he said to his mother, "I am running away."';
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    verbatim_page_text: pageText,
    checkin_question: 'What did the father dog give the bunny to eat?',
    target_answer_concept: 'The father dog gave him chocolate ice cream.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_bunny', canonical_name: 'little bunny', aliases: ['bunny'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, false);
  assert.equal(result.lexical_pass, false);
  assert.equal(result.failure_reason, 'UNGROUNDED_ENTITY');
  assert.equal(result.flagged_for_review, true);
});

test('Grounding Verifier: rejects factual contradiction against verbatim page text', async () => {
  const pageText = '"If you run away," said his mother, "I will run after you. For you are my little bunny."';
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    verbatim_page_text: pageText,
    checkin_question: 'What will the mother do if the bunny leaves?',
    target_answer_concept: 'The mother will stay home in bed and let him go.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_mom', canonical_name: 'mother', aliases: ['mother'] },
      ],
    },
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, false);
  assert.equal(result.lexical_pass, true);
  assert.ok(result.nli_score.contradiction > 0.30 || result.nli_score.entailment < 0.40);
  assert.equal(result.failure_reason, 'FACTUAL_CONTRADICTION_OR_UNENTAILED');
  assert.equal(result.flagged_for_review, true);
});

test('Grounding Verifier: rejects chunk when page range exceeds context boundary ceiling of 3 pages', async () => {
  const chunk = {
    chunk_id: 1,
    page_range: 'Pages 1-5',
    verbatim_page_text: 'Some short text on page one.',
    checkin_question: 'What happened?',
    target_answer_concept: 'Something happened.',
  };

  const result = await verifyGroundingFidelity(chunk);
  assert.equal(result.is_grounded, false);
  assert.equal(result.failure_reason, 'CONTEXT_BOUNDING_EXCEEDED');
  assert.equal(result.flagged_for_review, true);
});
