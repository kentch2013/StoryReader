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
    {
      canonical_id: 'grandpa',
      canonical_name: 'grandpa',
      gender: 'male',
      aliases: ['grandpa', 'grandfather', 'gramps'],
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

const rubricWithSlots = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  question_type: 'cause_and_effect',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
  semantic_slots: {
    agent: { canonical: 'grandma', synonyms: ['grandmother', 'granny', 'nana'] },
    action: { canonical: 'made', synonyms: ['knitted', 'sewed'] },
    theme: { canonical: 'hat', synonyms: ['cap'] },
    recipient: { canonical: 'Leo', synonyms: ['him', 'the boy'] },
    attribute: { canonical: 'red', distractors: ['blue', 'green', 'yellow', 'purple', 'black'] },
  },
  canonical_prototypes: [
    { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
    { type: 'minimal_core', text: 'Grandma made it.' },
    { type: 'common_distractor', text: 'He bought it at the store.' },
  ],
  diagnostic_probes: {
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
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('Near-Miss Slot Repair: isolates single attribute conflict ("his grandma made the blue hat")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithSlots,
        child_transcript: 'his grandma made the blue hat',
        attempt_count: 1,
      }),
    });

    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'NEAR_MISS_REPAIR');
    assert.equal(data.diagnostics?.slot_delta?.conflicted_slot, 'attribute');
    assert.match(data.spoken_feedback, /look/i);
  } finally {
    server.close();
  }
});

test('Near-Miss Slot Repair: isolates single actor conflict ("his mom made the hat")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithSlots,
        child_transcript: 'his mom made the hat',
        attempt_count: 1,
      }),
    });

    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'NEAR_MISS_REPAIR');
    assert.equal(data.diagnostics?.slot_delta?.conflicted_slot, 'agent');
    assert.match(data.spoken_feedback, /who/i);
  } finally {
    server.close();
  }
});

test('Near-Miss Slot Repair: isolates single recipient conflict ("grandma made a hat for his sister")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithSlots,
        child_transcript: 'grandma made a hat for his sister',
        attempt_count: 1,
      }),
    });

    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'NEAR_MISS_REPAIR');
    assert.equal(data.diagnostics?.slot_delta?.conflicted_slot, 'recipient');
    assert.match(data.spoken_feedback, /who/i);
  } finally {
    server.close();
  }
});

test('Near-Miss Slot Repair: passes 100% correct answers directly to MASTERED without repair trigger', async () => {
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithSlots,
        child_transcript: 'his grandma knitted the red hat for him',
        attempt_count: 1,
      }),
    });

    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.diagnostics?.cognitive_diagnosis, 'MASTERED');
  } finally {
    server.close();
  }
});
