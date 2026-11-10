import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';

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

const baseRubric = {
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

async function testCases() {
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  const cases = [
    { id: 9, text: "he loved that warm hat because his grandma made it" },
    { id: 12, text: "because she used red yarn to make it" },
    { id: 18, text: "she made something for him" },
    { id: 32, text: "grandma made a hat for the dog" },
  ];

  for (const c of cases) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseRubric,
        child_transcript: c.text,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    console.log(`\n=== CASE ${c.id}: "${c.text}" ===`);
    console.log("Status:", data.status);
    console.log("Diagnosis:", data.diagnostics?.cognitive_diagnosis);
    console.log("Tier:", data.diagnostics?.tier_resolved);
    console.log("Probe Scores:", data.diagnostics?.probe_scores);
  }
  server.close();
}

testCases();
