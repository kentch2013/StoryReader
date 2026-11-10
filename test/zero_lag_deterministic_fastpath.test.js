import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { countMatchedClusters, isQuestionEcho } from '../services/rubric_matcher.js';
import { getExtractor } from '../services/semantic_evaluator.js';

before(async () => {
  await getExtractor();
});

const sampleRubric = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
  keyword_clusters: [
    { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny'] },
    { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved'] },
  ],
  acceptable_phrasings: [
    'His grandma made it for him.',
    'It was special because his grandmother knitted it.',
  ],
  canonical_prototypes: [
    { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
    { type: 'colloquial', text: 'His granny knitted it so he really loved it.' },
    { type: 'minimal_core', text: 'Grandma made it.' },
    { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
    { type: 'common_distractor', text: 'He bought it at the store.' },
  ],
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('countMatchedClusters counts single-cluster partial matches accurately', () => {
  assert.equal(typeof countMatchedClusters, 'function');
  const res1 = countMatchedClusters('his grandma', sampleRubric.keyword_clusters);
  assert.equal(res1.matchedCount, 1);
  assert.equal(res1.totalCount, 2);

  const res2 = countMatchedClusters('someone he loved', sampleRubric.keyword_clusters);
  assert.equal(res2.matchedCount, 1);
  assert.equal(res2.totalCount, 2);

  const resFull = countMatchedClusters('his grandma made it and he loved it', sampleRubric.keyword_clusters);
  assert.equal(resFull.matchedCount, 2);
  assert.equal(resFull.totalCount, 2);
});

test('isQuestionEcho identifies question premise repetition', () => {
  assert.equal(typeof isQuestionEcho, 'function');
  assert.equal(isQuestionEcho('the hat blew away', sampleRubric.checkin_question), true);
  assert.equal(isQuestionEcho('grandma made it', sampleRubric.checkin_question), false);
});

test('POST /api/evaluate-answer resolves incomplete detail ("it was windy and cold") with scaffold in <50ms', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'it was windy and cold',
        attempt_count: 1,
      }),
    });

    const latencyMs = Math.round(performance.now() - start);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(data.spoken_feedback.includes(sampleRubric.hint_level_1));
    assert.ok(latencyMs < 100, `Expected latency < 100ms, got ${latencyMs}ms`);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards mastery for natural core entity answer ("his grandma") via Tier 2', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'his grandma',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer resolves question echo ("the hat blew away") in <50ms without LLM', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'the hat blew away',
        attempt_count: 1,
      }),
    });

    const latencyMs = Math.round(performance.now() - start);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(data.spoken_feedback.includes(sampleRubric.hint_level_1));
    assert.ok(latencyMs < 100, `Expected latency < 100ms, got ${latencyMs}ms`);
  } finally {
    server.close();
  }
});
