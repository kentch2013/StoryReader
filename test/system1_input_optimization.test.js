import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';

before(async () => {
  await getExtractor();
});

const sampleEntityGraphLeo = {
  characters: [
    {
      canonical_id: 'grandma',
      canonical_name: 'grandma',
      gender: 'female',
      aliases: ['grandma', 'grandmother', 'granny', 'nana'],
      kinship_compositions: ['mothers mother', 'moms mom', 'fathers mother'],
    },
    {
      canonical_id: 'leo',
      canonical_name: 'Leo',
      gender: 'male',
      aliases: ['leo', 'the boy', 'little boy'],
    },
    {
      canonical_id: 'mom',
      canonical_name: 'Mom',
      gender: 'female',
      aliases: ['mom', 'mother'],
    },
  ],
  social_relations: [],
  discourse_referents: {
    he: 'Leo',
    him: 'Leo',
    his: 'Leo',
    she: 'grandma',
    her: 'grandma',
    it: 'the hat',
  },
};

const rubric = {
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
    { type: 'minimal_core', text: 'Grandma made the hat for Leo.' },
    { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
    { type: 'common_distractor', text: 'He bought it at the store.' },
  ],
  diagnostic_probes: {
    target_mastery: {
      hypothesis: 'Grandma made the hat for Leo and it was special.',
      feedback: 'Spot on! His grandma knitted that warm red hat just for him!',
    },
    minimal_core: {
      hypothesis: 'Grandma made the hat for Leo.',
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
      hypothesis: 'Someone other than grandma made the hat.',
      scaffold: 'Check the picture! Did his grandma make it, or was it someone else?',
    },
    distractor_misconception: {
      hypothesis: 'He bought it at a store or shop.',
      scaffold: "He didn't buy it at a store! Look at who knitted it for him!",
    },
  },
  entity_graph: sampleEntityGraphLeo,
  story_context: {
    actor: 'grandma',
    recipient: 'Leo',
    object: 'warm red hat',
  },
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('Input Optimization: rejects conflicting recipient ("grandma made a hat for the dog") with CHARACTER_CONFUSION', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: 'grandma made a hat for the dog',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'CHARACTER_CONFUSION');
  } finally {
    server.close();
  }
});

test('Input Optimization: rejects vague object ("she made something for him") with scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: 'she made something for him',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.notEqual(data.status, 'mastered');
  } finally {
    server.close();
  }
});

test('Input Optimization: rejects manner fragment ("because she used red yarn to make it") with scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: 'because she used red yarn to make it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.notEqual(data.status, 'mastered');
  } finally {
    server.close();
  }
});

test('Input Optimization: awards MASTERED for compound answer ("he loved that warm hat because his grandma made it")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: 'he loved that warm hat because his grandma made it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});

test('Input Optimization: classifies non-human agent ("the cat made it") as CHARACTER_CONFUSION', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: 'the cat made it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'CHARACTER_CONFUSION');
  } finally {
    server.close();
  }
});
