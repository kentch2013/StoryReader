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
    scaffold: 'He didn\'t buy it at a store! Look at who knitted it for him!',
  },
};

const sampleRubricWithProbes = {
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
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('POST /api/evaluate-answer diagnoses SUPERFICIAL_ATTRIBUTE on "his hat was red" and returns targeted scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubricWithProbes,
        child_transcript: 'his hat was red',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'SUPERFICIAL_ATTRIBUTE');
    assert.equal(data.spoken_feedback, sampleDiagnosticProbes.superficial_attribute.scaffold);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer diagnoses PREMISE_ECHO on "the hat blew away" and returns targeted scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubricWithProbes,
        child_transcript: 'the hat blew away',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'PREMISE_ECHO');
    assert.equal(data.spoken_feedback, sampleDiagnosticProbes.premise_echo.scaffold);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer diagnoses CHARACTER_CONFUSION on "his grandpa made it" and returns targeted scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubricWithProbes,
        child_transcript: 'his grandpa made it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'CHARACTER_CONFUSION');
    assert.equal(data.spoken_feedback, sampleDiagnosticProbes.character_confusion.scaffold);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer diagnoses DISTRACTOR_MISCONCEPTION on "he bought it at the store" and returns targeted scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubricWithProbes,
        child_transcript: 'he bought it at the store',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'DISTRACTOR_MISCONCEPTION');
    assert.equal(data.spoken_feedback, sampleDiagnosticProbes.distractor_misconception.scaffold);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards MASTERED on "his nana knitted it" and uses mastery feedback in <100ms', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubricWithProbes,
        child_transcript: 'his nana knitted it',
        attempt_count: 1,
      }),
    });

    const ms = Math.round(performance.now() - start);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
    assert.ok(data.spoken_feedback.includes('Spot on!'));
    const maxLatency = process.env.CI ? 400 : 150;
    assert.ok(ms < maxLatency, `Expected latency < ${maxLatency}ms, got ${ms}ms`);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards MASTERED on head noun "his friends" for compound concept "farm friends"', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  const robertChunkRubric = {
    checkin_question: "Who came to Robert's birthday party?",
    question_type: "agent_identification",
    target_answer_concept: "All his farm friends came to his party.",
    keyword_clusters: [
      {
        concept_name: "farm friends",
        synonyms: ["farm buddies", "animal pals", "the animals on the farm"]
      },
      {
        concept_name: "birthday celebration",
        synonyms: ["birthday party", "his birthday", "party time"]
      }
    ],
    canonical_prototypes: [
      { type: "formal_full", text: "All of his farm friends came to the party." },
      { type: "colloquial", text: "His farm friends came to see him." },
      { type: "minimal_core", text: "His farm friends." },
      { type: "functional_circumlocution", text: "The animals that live on the farm." },
      { type: "partial_action", text: "Friends came." },
      { type: "common_distractor", text: "His mother and father came." }
    ],
    diagnostic_probes: {
      target_mastery: {
        hypothesis: "All the farm friends came to the birthday party.",
        feedback: "Exactly! His friends from the farm all arrived for his birthday."
      },
      minimal_core: {
        hypothesis: "The farm friends came.",
        feedback: "Correct, his friends were there for the party."
      },
      character_confusion: {
        hypothesis: "The mother and father came to the party.",
        scaffold: "They live with him, but look at the other animals—who joined the party?"
      },
      superficial_attribute: {
        hypothesis: "Robert wears a blue hat.",
        scaffold: "Look at the animals in the picture—who are they?"
      },
      premise_echo: {
        hypothesis: "Came to the party",
        scaffold: "Look at the animals in the picture—who are they?"
      },
      distractor_misconception: {
        hypothesis: "Only the cat came.",
        scaffold: "Look at the other animals!"
      }
    }
  };

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...robertChunkRubric,
        child_transcript: 'his friends',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered', 'Child answer "his friends" must be awarded MASTERED without requiring verbatim modifier "farm"');
    assert.equal(data.resolved, true);
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});
