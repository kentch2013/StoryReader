import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';

const sampleRubric = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
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
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

const trials = [
  {
    name: 'Instant Deterministic Shrug ("i dunno")',
    transcript: 'i dunno',
    attempt: 1,
    expectedStatus: 'needs_scaffold',
    expectedResolved: false,
    maxLatencyMs: 150,
  },
  {
    name: 'Instant Deterministic Silence ("")',
    transcript: '',
    attempt: 1,
    expectedStatus: 'needs_scaffold',
    expectedResolved: false,
    maxLatencyMs: 150,
  },
  {
    name: 'Instant Deterministic Keyword Cluster Match with Fillers',
    transcript: 'um like his granny made it and he loved it',
    attempt: 1,
    expectedStatus: 'mastered',
    expectedResolved: true,
    maxLatencyMs: 150,
  },
  {
    name: 'Instant Deterministic Acceptable Phrasing Match',
    transcript: 'his grandma made it for him',
    attempt: 1,
    expectedStatus: 'mastered',
    expectedResolved: true,
    maxLatencyMs: 150,
  },
  {
    name: 'Tier 1 Canonical Prototype Match - Colloquial',
    transcript: 'his granny knitted it so he really loved it',
    attempt: 1,
    expectedStatus: 'mastered',
    expectedResolved: true,
    maxLatencyMs: 50,
  },
  {
    name: 'Tier 1 Canonical Prototype Match - Minimal Core',
    transcript: 'grandma made it',
    attempt: 1,
    expectedStatus: 'mastered',
    expectedResolved: true,
    maxLatencyMs: 50,
  },
  {
    name: 'Tier 1 Canonical Prototype Match - Common Distractor Rejection',
    transcript: 'he bought it at the store',
    attempt: 1,
    expectedStatus: 'needs_scaffold',
    expectedResolved: false,
    maxLatencyMs: 50,
  },
  {
    name: 'Tier 2 System 1 Semantic Match - Novel Paraphrase ("his nana knitted it with love")',
    transcript: 'his nana knitted it with love',
    attempt: 1,
    expectedStatus: 'mastered',
    expectedResolved: true,
    maxLatencyMs: 100,
  },
  {
    name: 'Tier 2 System 1 Semantic Match - Distractor Paraphrase ("he got it at walmart")',
    transcript: 'he got it at walmart',
    attempt: 1,
    expectedStatus: 'needs_scaffold',
    expectedResolved: false,
    maxLatencyMs: 100,
  },
  {
    name: 'Attempt 2 Auto-Reveal on Shrug',
    transcript: 'idk',
    attempt: 2,
    expectedStatus: 'off_track',
    expectedResolved: true,
    maxLatencyMs: 150,
  },
];

async function runBenchmark() {
  console.log('🧪 Starting Module 3 Digital Samples Benchmark...\n');
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;

  try {
    for (const trial of trials) {
      const start = performance.now();
      const res = await fetch(`${baseUrl}/api/evaluate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sampleRubric,
          child_transcript: trial.transcript,
          attempt_count: trial.attempt,
        }),
      });

      const latency = Math.round(performance.now() - start);
      const data = await res.json();

      const statusMatch = data.status === trial.expectedStatus;
      const resolvedMatch = data.resolved === trial.expectedResolved;
      const latencyMatch = latency <= trial.maxLatencyMs;

      if (statusMatch && resolvedMatch && latencyMatch) {
        console.log(`✅ [PASS] ${trial.name}`);
        console.log(`   ⏱️  Latency: ${latency}ms (Cap: ${trial.maxLatencyMs}ms) | Status: ${data.status} | Resolved: ${data.resolved}`);
        console.log(`   🔊 Spoken Feedback: "${data.spoken_feedback}"\n`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${trial.name}`);
        console.error(`   Expected: status=${trial.expectedStatus}, resolved=${trial.expectedResolved}, latency<=${trial.maxLatencyMs}ms`);
        console.error(`   Actual: status=${data.status}, resolved=${data.resolved}, latency=${latency}ms\n`);
      }
    }

    console.log(`📊 Benchmark Summary: ${passed}/${trials.length} trials passed.`);
    if (passed !== trials.length) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
