import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { scoreMultiReference } from '../services/rubric_matcher.js';
import { getMockBookAnalysis } from '../services/gemini_service.js';

const samplePrototypes = [
  { type: 'formal_full', text: 'She will run after him because he is her little bunny.' },
  { type: 'colloquial', text: 'She chases him cause she loves her baby.' },
  { type: 'minimal_core', text: 'Run after him.' },
  { type: 'partial_action', text: 'She will use her feet to run.' },
  { type: 'common_distractor', text: 'She will stay at home.' },
];

const rubricWithPrototypes = {
  checkin_question: 'What does the mother say she will do if the little bunny runs away?',
  target_answer_concept: 'She will run after him because he is her little bunny.',
  keyword_clusters: [
    { concept_name: 'action', synonyms: ['run after', 'chase', 'follow'] },
    { concept_name: 'reason', synonyms: ['little bunny', 'her bunny', 'loves him'] },
  ],
  acceptable_phrasings: [
    'She will run after him.',
    'She follows him because he is her little bunny.',
  ],
  canonical_prototypes: samplePrototypes,
  hint_level_1: 'Look at what the mother bunny promises on the second page.',
  hint_level_2: 'What will she do with her feet if he runs?',
  scaffold_hint: 'Look at what the mother bunny promises to do!',
};

test('scoreMultiReference matches positive canonical prototypes deterministically', () => {
  assert.equal(typeof scoreMultiReference, 'function');

  // Match colloquial prototype
  const resColloquial = scoreMultiReference('she chases him cause she loves her baby', samplePrototypes);
  assert.equal(resColloquial.matched, true);
  assert.equal(resColloquial.isDistractor, false);
  assert.equal(resColloquial.prototypeType, 'colloquial');

  // Match minimal core prototype
  const resMinimal = scoreMultiReference('run after him', samplePrototypes);
  assert.equal(resMinimal.matched, true);
  assert.equal(resMinimal.isDistractor, false);

  // Match distractor
  const resDistractor = scoreMultiReference('she will stay at home and wait', samplePrototypes);
  assert.equal(resDistractor.matched, false);
  assert.equal(resDistractor.isDistractor, true);
});

test('POST /api/evaluate-answer awards mastery for colloquial canonical prototype match', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithPrototypes,
        child_transcript: 'she chases him cause she loves her baby',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
    assert.ok(data.spoken_feedback.startsWith('Spot on!'));
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards mastery for minimal core prototype match', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithPrototypes,
        child_transcript: 'run after him',
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

test('POST /api/evaluate-answer rejects common distractor with scaffold hint on Attempt 1', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithPrototypes,
        child_transcript: 'she will stay at home and not go',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(data.spoken_feedback.includes(rubricWithPrototypes.hint_level_1));
  } finally {
    server.close();
  }
});

test('getMockBookAnalysis provides 5 canonical prototypes per chunk matching schema', () => {
  const mock = getMockBookAnalysis();
  assert.ok(Array.isArray(mock.chunks));
  assert.ok(mock.chunks.length > 0);

  const chunk = mock.chunks[0];
  assert.ok(Array.isArray(chunk.canonical_prototypes), 'canonical_prototypes must be an array');
  assert.equal(chunk.canonical_prototypes.length, 5, 'Must have exactly 5 prototypes');

  const types = chunk.canonical_prototypes.map((p) => p.type);
  assert.ok(types.includes('formal_full'));
  assert.ok(types.includes('colloquial'));
  assert.ok(types.includes('minimal_core'));
  assert.ok(types.includes('partial_action'));
  assert.ok(types.includes('common_distractor'));
});
