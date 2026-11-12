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

const trialCases = [
  {
    id: 1,
    text: "she made something for him",
    expected: "needs_scaffold",
    note: "Vague object fragment: 'something' lacks object grounding",
  },
  {
    id: 2,
    text: "because she used red yarn to make it",
    expected: "needs_scaffold",
    note: "Manner/material fragment: red yarn does not explain why he was upset",
  },
  {
    id: 3,
    text: "the hat was red and warm",
    expected: "needs_scaffold",
    note: "Superficial attribute without causation",
  },
  {
    id: 4,
    text: "he bought it at the store",
    expected: "needs_scaffold",
    note: "Direct distractor misconception",
  },
  {
    id: 5,
    text: "because his grandma knitted it",
    expected: "mastered",
    note: "Core causal answer with valid synonym",
  },
  {
    id: 6,
    text: "he loved that warm hat because his grandma made it",
    expected: "mastered",
    note: "Compound answer with emotion and maker",
  },
];

async function runTrial() {
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  console.log("=================================================================");
  console.log("🔬 PRE-IMPLEMENTATION TRIAL RESULTS (CURRENT SYSTEM 1 BEHAVIOR)");
  console.log("=================================================================\n");

  const summary = [];

  for (const c of trialCases) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubric,
        child_transcript: c.text,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    const passed = data.status === c.expected;

    summary.push({
      id: c.id,
      text: c.text,
      status: data.status,
      expected: c.expected,
      passed,
      diagnosis: data.diagnostics?.cognitive_diagnosis,
      targetE: data.diagnostics?.probe_scores?.target_mastery?.entailment,
      minimalE: data.diagnostics?.probe_scores?.minimal_core?.entailment,
    });

    console.log(`[Case ${c.id}] "${c.text}"`);
    console.log(`  -> Actual:   ${data.status.toUpperCase()} (${data.diagnostics?.cognitive_diagnosis})`);
    console.log(`  -> Expected: ${c.expected.toUpperCase()}`);
    console.log(`  -> Result:   ${passed ? '✅ PASS' : '❌ FAIL (POOR CHOICE)'}`);
    console.log(`  -> Scores:   target_mastery E=${data.diagnostics?.probe_scores?.target_mastery?.entailment ?? 'N/A'}, minimal_core E=${data.diagnostics?.probe_scores?.minimal_core?.entailment ?? 'N/A'}`);
    console.log(`  -> Note:     ${c.note}\n`);
  }

  const passCount = summary.filter((s) => s.passed).length;
  console.log(`Trial Summary: ${passCount}/${trialCases.length} Passed`);
  server.close();
}

runTrial();
