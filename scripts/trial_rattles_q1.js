import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import { rattlesBenchmarkDataset } from '../test/fixtures/rattles_benchmark_dataset.js';

const q1 = rattlesBenchmarkDataset[0];

const entityGraphRattles = {
  characters: [
    {
      canonical_id: 'rattles',
      canonical_name: 'Rattles',
      gender: 'female',
      aliases: ['rattles', 'the cat', 'the kitten', 'the kitty'],
    },
    {
      canonical_id: 'grandma',
      canonical_name: 'Grandma',
      gender: 'female',
      aliases: ['grandma', 'grandmother'],
    },
    {
      canonical_id: 'uncle_duane',
      canonical_name: 'Uncle Duane',
      gender: 'male',
      aliases: ['uncle duane', 'duane', 'uncle'],
    },
  ],
  social_relations: [],
  discourse_referents: {
    she: 'Rattles',
    her: 'Rattles',
    they: 'the cats',
  },
};

const rubricQ1 = {
  checkin_question: q1.question,
  question_type: 'fact_retrieval',
  target_answer_concept: q1.target_answer_concept,
  semantic_slots: {
    agent: { canonical: 'Rattles', synonyms: ['the cat', 'the kitty', 'she'] },
    location: { canonical: 'haymow', synonyms: ['hay mow', 'hayloft', 'barn', 'hay bales'], distractors: ['kitchen', 'house', 'city', 'pet shop'] },
  },
  canonical_prototypes: [
    { type: 'formal_full', text: 'Rattles lived in the haymow with her family.' },
    { type: 'minimal_core', text: 'In the haymow.' },
    { type: 'common_distractor', text: 'She lived in a pet shop in the city.' },
  ],
  diagnostic_probes: {
    target_mastery: {
      hypothesis: 'Rattles lived in the haymow in the barn with her family.',
      feedback: 'Spot on! Rattles lived right up in the haymow with all the other cats!',
    },
    minimal_core: {
      hypothesis: 'In the haymow.',
      feedback: 'Exactly right! In the haymow!',
    },
    superficial_attribute: {
      hypothesis: 'The hay was dry and brown.',
      scaffold: 'Yes, there was lots of hay! But where was her home on the farm?',
    },
    premise_echo: {
      hypothesis: 'Where did Rattles live with her family?',
      scaffold: 'Think about where the cats made their home!',
    },
    character_confusion: {
      hypothesis: 'Uncle Duane or Grandma lived in the haymow.',
      scaffold: 'Check who lived in the haymow—was it the cats, or the humans?',
    },
    distractor_misconception: {
      hypothesis: 'She lived in a pet shop or the kitchen.',
      scaffold: 'She did not live in a pet shop or the house! Look closely at the picture—where did the cats make their home?',
    },
  },
  entity_graph: entityGraphRattles,
  story_context: {
    actor: 'Rattles',
    object: 'haymow',
    location: 'haymow',
  },
  hint_level_1: 'Look at where the cats slept in the barn.',
  scaffold_hint: 'Where in the barn did Rattles and her family live?',
};

async function testQ1Pipeline() {
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  console.log('=================================================================');
  console.log('🐾 RATTLES Q1 PIPELINE TRIAL EVALUATION');
  console.log('Question: "' + q1.question + '"');
  console.log('Target Concept: "' + q1.target_answer_concept + '"');
  console.log('=================================================================\n');

  const testCases = [
    ...q1.correct_answers.map((a, i) => ({
      label: `[Correct ${i + 1}]`,
      transcript: a.text,
      expectedStatus: 'mastered',
      expectedDiag: ['MASTERED'],
    })),
    ...q1.evasive_or_partial_answers.map((a, i) => ({
      label: `[Evasive ${i + 1} - ${a.category}]`,
      transcript: a.text,
      expectedStatus: 'needs_scaffold',
      expectedDiag: [a.expectedDiag, 'UNGROUNDED_OFF_TRACK', 'NEAR_MISS_REPAIR', 'CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION', 'SUPERFICIAL_ATTRIBUTE', 'QUESTION_ECHO', 'PREMISE_ECHO'],
    })),
  ];

  const results = [];

  for (const tc of testCases) {
    const t0 = performance.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricQ1,
        child_transcript: tc.transcript,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    const latency = (performance.now() - t0).toFixed(1);

    if (tc.label.includes('Evasive 1')) {
      console.log('DEBUG Evasive 1 data:', JSON.stringify(data, null, 2));
    }

    const statusMatch = data.status === tc.expectedStatus;
    const diagMatch = tc.expectedDiag.includes(data.diagnostics?.cognitive_diagnosis);
    const pass = statusMatch && diagMatch;

    results.push({
      label: tc.label,
      transcript: tc.transcript,
      status: data.status,
      expectedStatus: tc.expectedStatus,
      diag: data.diagnostics?.cognitive_diagnosis,
      feedback: data.spoken_feedback,
      slot_delta: data.diagnostics?.slot_delta,
      latency,
      pass,
    });
  }

  server.close();

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.label}`);
    console.log(`   Input:    "${r.transcript}"`);
    console.log(`   Status:   ${r.status} (expected: ${r.expectedStatus})`);
    console.log(`   Diag:     ${r.diag}`);
    console.log(`   Feedback: "${r.feedback}"`);
    if (r.slot_delta?.is_near_miss) {
      console.log(`   Slot-Repair: Conflicted '${r.slot_delta.conflicted_slot}' | Degree: ${r.slot_delta.accuracy_degree}`);
    }
    console.log(`   Latency:  ${r.latency}ms\n`);
  }

  const passedCount = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passedCount}/${results.length} cases behaved as expected.`);
}

testQ1Pipeline().catch(console.error);
