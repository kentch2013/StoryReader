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
    she: 'grandma',
    her: 'grandma',
    it: 'the hat',
  },
};

const rubricWithEntityGraph = {
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

test('Relational Resolution: awards MASTERED for compositional kinship ("his mother\'s mother made it")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithEntityGraph,
        child_transcript: "his mother's mother made it",
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

test('Relational Resolution: rejects generational confusion ("his mother\'s grandma made it") with CHARACTER_CONFUSION', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithEntityGraph,
        child_transcript: "his mother's grandma made it",
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

test('Pronoun Resolution: resolves unambiguous anaphora ("she made it for him") to MASTERED', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricWithEntityGraph,
        child_transcript: 'she made it for him',
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

test('Social Relational Resolution: resolves "Jim\'s friend" to John and awards MASTERED', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  const rubricFriends = {
    checkin_question: 'Who helped Jim find his missing bike?',
    question_type: 'literal_fact',
    target_answer_concept: 'John helped him find his bike.',
    keyword_clusters: [
      { concept_name: 'helper', synonyms: ['john', 'friend', 'jims friend'] },
      { concept_name: 'action', synonyms: ['helped', 'found', 'looked'] },
    ],
    acceptable_phrasings: [
      'John helped him.',
      "Jim's friend helped him find it.",
    ],
    canonical_prototypes: [
      { type: 'formal_full', text: 'John helped him find his bike.' },
      { type: 'colloquial', text: "His friend John helped." },
      { type: 'minimal_core', text: 'John helped.' },
      { type: 'common_distractor', text: 'He found it all by himself.' },
    ],
    diagnostic_probes: {
      target_mastery: { hypothesis: 'John helped Jim find his bike.', feedback: 'Spot on! John helped him!' },
      minimal_core: { hypothesis: 'John helped.', feedback: 'Exactly right!' },
      superficial_attribute: { hypothesis: 'The bike was blue.', scaffold: 'Think about who helped him.' },
      premise_echo: { hypothesis: 'The bike was missing.', scaffold: 'Who helped him find it?' },
      character_confusion: { hypothesis: 'His brother helped.', scaffold: 'Check the picture for who was there!' },
      distractor_misconception: { hypothesis: 'He was alone.', scaffold: 'Someone helped him!' },
    },
    entity_graph: {
      characters: [
        { canonical_id: 'jim', canonical_name: 'Jim', gender: 'male', aliases: ['jim'] },
        { canonical_id: 'john', canonical_name: 'John', gender: 'male', aliases: ['john'] },
      ],
      social_relations: [
        {
          subject_id: 'jim',
          relation: 'friend',
          target_id: 'john',
          aliases: ["jims friend", "his friend", "the other boy", "his buddy"],
        },
      ],
      discourse_referents: {
        he: 'John',
        him: 'Jim',
      },
    },
    hint_level_1: 'Look at the boy standing next to Jim.',
    scaffold_hint: 'Who was with Jim?',
  };

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricFriends,
        child_transcript: "Jim's friend",
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

test('Hierarchical Ambiguity Cascade: grants a Free Micro-Turn when ambiguity cannot be resolved silently', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  // Ambiguous setup: Both Mom and Grandma made things, question mentions neither uniquely
  const ambiguousRubric = {
    ...rubricWithEntityGraph,
    checkin_question: 'Who was in the kitchen baking cookies?',
    target_answer_concept: 'Grandma was baking cookies.',
    entity_graph: {
      characters: [
        { canonical_id: 'mom', canonical_name: 'Mom', gender: 'female', aliases: ['mom'] },
        { canonical_id: 'grandma', canonical_name: 'Grandma', gender: 'female', aliases: ['grandma'] },
      ],
      social_relations: [],
      discourse_referents: {
        // Discursive ambiguity: both females active in current context
        she: null,
      },
      active_female_candidates: ['Mom', 'Grandma'],
    },
  };

  try {
    // Turn 1: Attempt 1 with microturn_used: false
    const res1 = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...ambiguousRubric,
        child_transcript: 'she was',
        attempt_count: 1,
        microturn_used: false,
      }),
    });

    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.status, 'needs_scaffold');
    assert.equal(data1.is_microturn, true);
    assert.equal(data1.attempt_count, 1, 'Attempt count must remain 1 (not consumed)');
    assert.equal(data1.microturn_used, true);
    assert.equal(data1.diagnostics?.cognitive_diagnosis, 'AMBIGUOUS_REFERENT');
    assert.ok(data1.spoken_feedback.toLowerCase().includes('mom') && data1.spoken_feedback.toLowerCase().includes('grandma'));

    // Turn 2: Repeat ambiguous answer with microturn_used: true -> no second micro-turn
    const res2 = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...ambiguousRubric,
        child_transcript: 'she was',
        attempt_count: 1,
        microturn_used: true,
      }),
    });

    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.is_microturn, false, 'Must not grant second microturn');
  } finally {
    server.close();
  }
});
