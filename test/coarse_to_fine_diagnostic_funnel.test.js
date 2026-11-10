import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';

before(async () => {
  await getExtractor();
});

const sampleDiagnosticProbes = {
  target_mastery: {
    hypothesis: 'Grandma made the hat and it was special.',
    feedback: 'Spot on! His grandma knitted that warm red hat just for him!',
  },
  minimal_core: {
    hypothesis: 'Grandma made it.',
    feedback: 'Exactly right! His grandma made it!',
  },
  superficial_attribute: {
    hypothesis: 'The hat is red and warm.',
    scaffold: 'Yes, it was a warm red hat! But think about who made that hat for Leo.',
  },
  premise_echo: {
    hypothesis: 'The hat blew away and got lost in the wind.',
    scaffold: 'Yes, his hat blew away! But why was that hat so special to Leo?',
  },
  character_confusion: {
    hypothesis: 'His grandpa or mother made the hat.',
    scaffold: 'Check the picture! Did his grandpa make it, or was it someone else?',
  },
  distractor_misconception: {
    hypothesis: 'He bought it at a store or shop.',
    scaffold: "He didn't buy it at a store! Look at who knitted it for him!",
  },
};

const sampleRubric = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  question_type: 'cause_and_effect',
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
  diagnostic_probes: sampleDiagnosticProbes,
  story_context: {
    actor: 'grandma',
    recipient: 'Leo',
    object: 'warm red hat',
  },
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('Layer 1 Gate: rejects inquiry questions ("who made the hat") with scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'who made the hat',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.notEqual(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});

test('Layer 1 Gate: rejects token stutter / repetitive fragment ("the hat the hat") with scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'the hat the hat',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.notEqual(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});

test('Layer 2 Slot Diagnosis: rejects conflicting recipient ("grandma made grampa\'s hat")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: "grandma made grampa's hat",
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'CHARACTER_CONFUSION');
  } finally {
    server.close();
  }
});

test('Layer 2 Slot Diagnosis: rejects contradictory attribute ("his nana made the blue hat")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'his nana made the blue hat',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'DISTRACTOR_MISCONCEPTION');
  } finally {
    server.close();
  }
});

test('Layer 2 Slot Diagnosis: rejects generational confusion ("his mother\'s nana made the hat")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: "his mother's nana made the hat",
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.notEqual(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});

test('Layer 3 Gate: awards MASTERED on legitimate minimal core answer ("grandma made it")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'grandma made it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});
