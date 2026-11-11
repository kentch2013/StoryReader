import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const rawData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'test_output', 'bunny_10_pages_analysis.json'), 'utf8'));

const fishChunk = rawData.chunks.find((c) => /fish/i.test(c.checkin_question));
const gardenChunk = rawData.chunks.find((c) => /flower|garden|crocus/i.test(c.checkin_question));
const stayChunk = rawData.chunks.find((c) => /stay|end/i.test(c.checkin_question));

// Synthetic Leo's Hat chunk for slot-testing
const leoChunk = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  question_type: 'cause_and_effect',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
  keyword_clusters: [
    { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny'] },
    { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved'] },
  ],
  acceptable_phrasings: ['His grandma made it for him.', 'It was special because his grandmother knitted it.'],
  canonical_prototypes: [
    { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
    { type: 'colloquial', text: 'His granny knitted it so he really loved it.' },
    { type: 'minimal_core', text: 'Grandma made it.' },
    { type: 'functional_circumlocution', text: 'His nana knitted the warm red hat with love.' },
    { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
    { type: 'common_distractor', text: 'He bought it at the store.' },
  ],
  diagnostic_probes: {
    target_mastery: { hypothesis: 'Grandma made the hat and it was special.', feedback: 'Spot on!' },
    minimal_core: { hypothesis: 'Grandma made it.', feedback: 'Exactly right!' },
    superficial_attribute: { hypothesis: 'The hat is red and warm.', scaffold: 'Look at who made it.' },
    premise_echo: { hypothesis: 'The hat blew away and got lost in the wind.', scaffold: 'Think about why.' },
    character_confusion: { hypothesis: 'His grandpa or mother made the hat.', scaffold: 'Check who made it.' },
    distractor_misconception: { hypothesis: 'He bought it at a store or shop.', scaffold: 'Look at who knitted it.' },
  },
  story_context: { actor: 'grandma', recipient: 'Leo', object: 'warm red hat' },
  hint_level_1: 'Look at who made the hat for Leo.',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

export const TEST_CASES = [
  // 1. Direct keywords and formal answers
  { id: 'fish_direct', chunk: fishChunk, text: 'she will be a fisherman', expectedStatus: 'mastered', category: 'Direct Keyword' },
  { id: 'garden_formal', chunk: gardenChunk, text: 'she will be a gardener and find him', expectedStatus: 'mastered', category: 'Formal Clausal' },
  { id: 'stay_paraphrase', chunk: stayChunk, text: 'he is gonna stay right where he is with his mommy', expectedStatus: 'mastered', category: 'Paraphrase' },

  // 2. Minimal core (single noun / 2 words)
  { id: 'fish_minimal', chunk: fishChunk, text: 'a fisherman', expectedStatus: 'mastered', category: 'Minimal Core' },
  { id: 'garden_minimal', chunk: gardenChunk, text: 'a gardener', expectedStatus: 'mastered', category: 'Minimal Core' },
  { id: 'stay_minimal', chunk: stayChunk, text: 'stay home', expectedStatus: 'mastered', category: 'Minimal Core' },

  // 3. Functional Circumlocutions
  { id: 'fish_net', chunk: fishChunk, text: 'the person who catches fish with a net', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'fish_rod', chunk: fishChunk, text: 'someone who goes in the water with a fishing rod', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_can', chunk: gardenChunk, text: 'the lady who waters plants with a can', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_flowers', chunk: gardenChunk, text: 'the lady who puts water on the flowers so they grow', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_dirt', chunk: gardenChunk, text: 'someone who takes care of plants in the dirt', expectedStatus: 'mastered', category: 'Circumlocution' },

  // 4. Collision & Cascade Bias Test
  { id: 'garden_distractor_collision', chunk: gardenChunk, text: 'she will become a flower', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Collision Test' },

  // 5. True Distractors & Misconceptions
  { id: 'fish_bird', chunk: fishChunk, text: 'she becomes a bird', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Distractor' },
  { id: 'leo_store', chunk: leoChunk, text: 'he bought it at the store', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Distractor' },

  // 6. Superficial Visual Detail vs Mastered Answer
  { id: 'fish_boots', chunk: fishChunk, text: 'she gets boots and catches him', expectedStatus: 'needs_scaffold', category: 'Visual Detail' },
  { id: 'leo_red_hat', chunk: leoChunk, text: 'his hat was red', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'SUPERFICIAL_ATTRIBUTE', category: 'Visual Detail' },

  // 7. Character Confusion / Transposition
  { id: 'fish_swap', chunk: fishChunk, text: 'the bunny catches the mother', expectedStatus: 'needs_scaffold', category: 'Agent Swap' },
  { id: 'leo_grandpa', chunk: leoChunk, text: 'his grandpa made it', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'CHARACTER_CONFUSION', category: 'Character Confusion' },
  { id: 'leo_conflicting_recipient', chunk: leoChunk, text: "grandma made grampa's hat", expectedStatus: 'needs_scaffold', expectedDiagnosis: 'CHARACTER_CONFUSION', category: 'Slot Conflict' },
];

export async function runBenchmark() {
  const results = [];
  for (const tc of TEST_CASES) {
    const t0 = Date.now();
    const res = await evaluateChildAnswer({
      ...tc.chunk,
      child_transcript: tc.text,
      attempt_count: 1,
    });
    const latency = Date.now() - t0;
    const passed = res.status === tc.expectedStatus && (!tc.expectedDiagnosis || res.diagnostics?.cognitive_diagnosis === tc.expectedDiagnosis);

    results.push({
      id: tc.id,
      category: tc.category,
      text: tc.text,
      status: res.status,
      expectedStatus: tc.expectedStatus,
      diagnosis: res.diagnostics?.cognitive_diagnosis || 'NONE',
      expectedDiagnosis: tc.expectedDiagnosis || null,
      passed,
      latency,
      probeScores: res.diagnostics?.tier2_semantic?.scoreTable || {},
    });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('Running Benchmark...');
  const results = await runBenchmark();
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
  const outPath = process.argv[2] || path.join(projectRoot, 'test_output', 'benchmark_baseline.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n======================================================================`);
  console.log(`BENCHMARK REPORT: ${summary.passed}/${summary.total} PASSED`);
  console.log(`======================================================================`);
  results.forEach((r) => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} [${r.category}] "${r.text}"`);
    console.log(`   Result: ${r.status.toUpperCase()} (${r.diagnosis}) | Expected: ${r.expectedStatus.toUpperCase()}${r.expectedDiagnosis ? ` (${r.expectedDiagnosis})` : ''} [${r.latency}ms]`);
  });
  console.log(`\nSaved report to: ${outPath}`);
}
