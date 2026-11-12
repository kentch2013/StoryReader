import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import { rattlesBenchmarkDataset } from '../test/fixtures/rattles_benchmark_dataset.js';

const q2 = rattlesBenchmarkDataset[1];

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
    {
      canonical_id: 'brother',
      canonical_name: 'brother',
      gender: 'male',
      aliases: ['her brother', 'the brother cat'],
    },
  ],
  social_relations: [],
  discourse_referents: {
    she: 'Rattles',
    her: 'Rattles',
    they: 'the cats',
  },
};

const rubricQ2 = {
  checkin_question: q2.question,
  question_type: 'cause_and_effect',
  target_answer_concept: q2.target_answer_concept,
  semantic_slots: {
    agent: { canonical: 'Rattles', synonyms: ['she', 'the cat', 'the kitten'] },
    attribute: { canonical: 'friendly', synonyms: ['loved humans', 'liked people', 'not wild', 'not afraid', 'friendly with humans', 'liked them', 'loved them'], distractors: ['wild', 'scared', 'afraid of people', 'hated people'] },
  },
  canonical_prototypes: [
    { type: 'formal_full', text: 'Rattles loved humans and was not afraid of them, while all the other cats were wild.' },
    { type: 'colloquial', text: 'All the other cats were afraid of people, but Rattles liked them.' },
    { type: 'minimal_core', text: 'She loved humans.' },
    { type: 'partial_action', text: 'The other cats were wild.' },
    { type: 'common_distractor', text: 'She liked dogs instead of cats.' },
  ],
  diagnostic_probes: {
    target_mastery: {
      hypothesis: 'Rattles was friendly, loved humans, and was not wild.',
      feedback: 'Spot on! Rattles loved humans and was not afraid of people like the other cats!',
    },
    minimal_core: {
      hypothesis: 'She loved humans.',
      feedback: 'Exactly right! Rattles was friendly and loved humans!',
    },
    superficial_attribute: {
      hypothesis: 'She had gray fur and white paws or lived on the farm.',
      scaffold: 'You noticed how she looked! But think about her actions—what did Rattles do that the other cats would never do?',
    },
    premise_echo: {
      hypothesis: 'How was Rattles different from all the other barn cats?',
      scaffold: 'Think about how Rattles acted compared to all the other wild cats!',
    },
    character_confusion: {
      hypothesis: 'Her brother or mother loved humans instead of Rattles.',
      scaffold: 'Check who was different—was it Rattles, or the other cats?',
    },
    distractor_misconception: {
      hypothesis: 'She liked dogs instead of cats.',
      scaffold: 'Think about the other wild cats! When someone came near, how did Rattles act compared to them?',
    },
  },
  entity_graph: entityGraphRattles,
  story_context: {
    actor: 'Rattles',
    object: 'humans',
  },
  hint_level_1: 'Think about how Rattles felt about humans compared to the wild cats.',
  scaffold_hint: 'How did Rattles act around people compared to the other barn cats?',
};

async function testQ2Pipeline() {
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  console.log('=================================================================');
  console.log('🐾 REAL PIPELINE TRIAL EVALUATION: RATTLES QUESTION 2');
  console.log('Question:       "' + q2.question + '"');
  console.log('Target Concept: "' + q2.target_answer_concept + '"');
  console.log('Engine:         System 1 Transformers ONNX (Xenova/nli-deberta-v3-xsmall)');
  console.log('=================================================================\n');

  const testCases = [
    ...q2.correct_answers.map((a, i) => ({
      label: `[Correct ${i + 1}]`,
      transcript: a.text,
      expectedStatus: 'mastered',
    })),
    ...q2.evasive_or_partial_answers.map((a, i) => ({
      label: `[Evasive ${i + 1} - ${a.category}]`,
      transcript: a.text,
      expectedStatus: 'needs_scaffold',
    })),
  ];

  const results = [];

  for (const tc of testCases) {
    const t0 = performance.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricQ2,
        child_transcript: tc.transcript,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    const latency = (performance.now() - t0).toFixed(1);

    const pass = data.status === tc.expectedStatus;

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

testQ2Pipeline().catch(console.error);
