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

const ambiguousEntityGraph = {
  characters: [
    { canonical_id: 'mom', canonical_name: 'Mom', gender: 'female', aliases: ['mom'] },
    { canonical_id: 'grandma', canonical_name: 'Grandma', gender: 'female', aliases: ['grandma'] },
  ],
  social_relations: [],
  discourse_referents: {
    she: null,
  },
  active_female_candidates: ['Mom', 'Grandma'],
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
      hypothesis: 'The hat is red, made of yarn, or warm.',
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

const ambiguousRubric = {
  ...baseRubric,
  checkin_question: 'Who was in the kitchen baking cookies?',
  target_answer_concept: 'Grandma was baking cookies.',
  entity_graph: ambiguousEntityGraph,
};

const TEST_CASES = [
  // Tier 1: Full Mastery (1-10)
  { id: 1, transcript: 'he was upset because his grandma made it for him and it was special', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 2, transcript: 'his granny knitted it so he really loved it', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 3, transcript: 'grandma made it', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 4, transcript: "his mother's mother made it", expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 5, transcript: 'his nana made it for him', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 6, transcript: 'she made it for him', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 7, transcript: 'because it was special and his grandmother made that hat', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 8, transcript: "his mom's mom knitted it with love", expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 9, transcript: 'he loved that warm hat because his grandma made it', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },
  { id: 10, transcript: 'like um his grandma knitted it for leo', expectedStatus: 'mastered', expectedDiag: ['MASTERED'] },

  // Tier 2: Partial Action & Missing Clauses (11-18)
  { id: 11, transcript: 'his grandma knitted the warm red hat', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 12, transcript: 'because she used red yarn to make it', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK', 'CHARACTER_CONFUSION'] },
  { id: 13, transcript: 'because it was special', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 14, transcript: 'he really loved that hat', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 15, transcript: 'grandma knitted', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 16, transcript: 'someone in his family made it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 17, transcript: 'because it was a present', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 18, transcript: 'she made something for him', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },

  // Tier 3: Character & Subject Substitutions (19-26)
  { id: 19, transcript: 'his grandpa made it for him', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 20, transcript: "his mother's grandma made the hat", expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 21, transcript: 'his mom made it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 22, transcript: 'the cat made it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 23, transcript: 'his teacher knitted the hat', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 24, transcript: 'his friend made it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 25, transcript: 'his dad bought it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 26, transcript: 'leo made the hat himself', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },

  // Tier 4: Recipient & Attribute Attribution Conflicts (27-34)
  { id: 27, transcript: "grandma made grampa's hat", expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 28, transcript: 'grandma made the hat for her friend', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'UNGROUNDED_OFF_TRACK'] },
  { id: 29, transcript: 'his nana made the blue hat', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 30, transcript: 'his grandma bought the red shoes', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 31, transcript: 'she made a green sweater for him', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 32, transcript: 'grandma made a hat for the dog', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 33, transcript: 'his grandma gave it to someone else', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },
  { id: 34, transcript: "he lost his sister's hat", expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION'] },

  // Tier 5: Echoes, Inquiries, Stutter & Ambiguity (35-42)
  { id: 35, transcript: 'the hat blew away', expectedStatus: 'needs_scaffold', expectedDiag: ['PREMISE_ECHO'] },
  { id: 36, transcript: 'it blew away in the wind', expectedStatus: 'needs_scaffold', expectedDiag: ['PREMISE_ECHO'] },
  { id: 37, transcript: 'why did his hat blow away', expectedStatus: 'needs_scaffold', expectedDiag: ['QUESTION_ECHO'] },
  { id: 38, transcript: 'who made the hat', expectedStatus: 'needs_scaffold', expectedDiag: ['QUESTION_ECHO'] },
  { id: 39, transcript: 'the hat the hat', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE'] },
  { id: 40, transcript: 'she made it', rubricOverride: ambiguousRubric, expectedStatus: 'needs_scaffold', expectedDiag: ['AMBIGUOUS_REFERENT'] },
  { id: 41, transcript: 'she was', rubricOverride: ambiguousRubric, expectedStatus: 'needs_scaffold', expectedDiag: ['AMBIGUOUS_REFERENT'] },
  { id: 42, transcript: 'it was for him', expectedStatus: 'needs_scaffold', expectedDiag: ['SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },

  // Tier 6: Distractors, Contradictions & Off-Track (43-50)
  { id: 43, transcript: 'he bought it at the store', expectedStatus: 'needs_scaffold', expectedDiag: ['DISTRACTOR_MISCONCEPTION'] },
  { id: 44, transcript: 'he got it at walmart for five dollars', expectedStatus: 'needs_scaffold', expectedDiag: ['DISTRACTOR_MISCONCEPTION', 'CHARACTER_CONFUSION'] },
  { id: 45, transcript: "his grandmother didn't make it", expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 46, transcript: 'nobody made it for him', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'DISTRACTOR_MISCONCEPTION'] },
  { id: 47, transcript: 'a purple flying dragon took it', expectedStatus: 'needs_scaffold', expectedDiag: ['CHARACTER_CONFUSION', 'UNGROUNDED_OFF_TRACK'] },
  { id: 48, transcript: 'it was windy and cold outside', expectedStatus: 'needs_scaffold', expectedDiag: ['DISTRACTOR_MISCONCEPTION', 'SUPERFICIAL_ATTRIBUTE', 'UNGROUNDED_OFF_TRACK'] },
  { id: 49, transcript: "i don't know", expectedStatus: 'needs_scaffold', expectedDiag: ['UNGROUNDED_OFF_TRACK'] },
  { id: 50, transcript: '', expectedStatus: 'needs_scaffold', expectedDiag: ['UNGROUNDED_OFF_TRACK', null] },
];

async function runBenchmark() {
  console.log('⏳ Pre-warming System 1 Model in RAM...');
  await getExtractor();

  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/evaluate-answer`;

  let passed = 0;
  let failed = 0;
  const failures = [];
  const startAll = performance.now();

  for (const tc of TEST_CASES) {
    const payload = {
      ...(tc.rubricOverride || baseRubric),
      child_transcript: tc.transcript,
      attempt_count: 1,
      microturn_used: false,
    };

    const start = performance.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const latency = Math.round(performance.now() - start);

    if (res.status !== 200) {
      failed++;
      failures.push({ id: tc.id, transcript: tc.transcript, error: `HTTP ${res.status}` });
      continue;
    }

    const data = await res.json();
    const statusMatch = data.status === tc.expectedStatus;
    const diagMatch =
      tc.expectedDiag.includes(data.diagnostics?.cognitive_diagnosis) ||
      (tc.expectedStatus === 'mastered' && data.status === 'mastered');

    if (statusMatch && diagMatch) {
      passed++;
      console.log(`[PASS] #${tc.id.toString().padStart(2, '0')}: "${tc.transcript.slice(0, 35).padEnd(35)}" -> ${data.status} [${data.diagnostics?.cognitive_diagnosis || 'OK'}] (${latency}ms)`);
    } else {
      failed++;
      failures.push({
        id: tc.id,
        transcript: tc.transcript,
        expectedStatus: tc.expectedStatus,
        actualStatus: data.status,
        expectedDiag: tc.expectedDiag,
        actualDiag: data.diagnostics?.cognitive_diagnosis,
        latency,
      });
      console.error(`[FAIL] #${tc.id.toString().padStart(2, '0')}: "${tc.transcript}"`);
      console.error(`       Expected: status=${tc.expectedStatus}, diag=${JSON.stringify(tc.expectedDiag)}`);
      console.error(`       Actual:   status=${data.status}, diag=${data.diagnostics?.cognitive_diagnosis}`);
    }
  }

  const totalTime = Math.round(performance.now() - startAll);
  server.close();

  console.log('\n======================================================');
  console.log(`BENCHMARK RESULTS: ${passed}/${TEST_CASES.length} PASS (${failed} FAIL) in ${totalTime}ms`);
  console.log('======================================================');

  if (failures.length > 0) {
    console.error('\nFailures summary:');
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
