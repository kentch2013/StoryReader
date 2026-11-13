import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { verifyGroundingFidelity } from '../services/grounding_verifier.js';

const bunnyAnalysis = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'test_output', 'bunny_10_pages_analysis.json'), 'utf8')
);

const fishChunk = bunnyAnalysis.chunks.find((c) => /fish/i.test(c.checkin_question));
const gardenChunk = bunnyAnalysis.chunks.find((c) => /flower|garden|crocus/i.test(c.checkin_question));

const rattlesChunk = {
  checkin_question: 'What did Rattles do when Uncle Duane was milking the cows?',
  question_type: 'action',
  target_answer_concept: 'Rattles jumped onto Uncle Duane\'s lap.',
  verbatim_page_text: 'When Uncle Duane was milking the cows in the barn, Rattles climbed up and jumped right onto his lap.',
  story_context: { actor: 'rattles', recipient: 'uncle duane', action: 'jumped', location: 'lap' },
  keyword_clusters: [
    { concept_name: 'agent', synonyms: ['rattles', 'cat', 'kitty'] },
    { concept_name: 'action', synonyms: ['jumped', 'climbed', 'leaped', 'sat'] },
    { concept_name: 'location', synonyms: ['lap', 'uncle duane'] },
  ],
  acceptable_phrasings: [
    'She jumped onto his lap.',
    'Rattles jumped on Uncle Duane\'s lap.',
  ],
  canonical_prototypes: [
    { type: 'formal_full', text: 'Rattles jumped onto Uncle Duane\'s lap.' },
    { type: 'colloquial', text: 'The kitty leaped on his lap while he milked.' },
    { type: 'minimal_core', text: 'Jumped on his lap.' },
    { type: 'functional_circumlocution', text: 'She climbed up and sat on the person milking.' },
  ],
  diagnostic_probes: {
    target_mastery: { hypothesis: 'Rattles jumped onto Uncle Duane\'s lap.', feedback: 'Spot on!' },
    minimal_core: { hypothesis: 'She jumped on his lap.', feedback: 'Exactly right!' },
    superficial_attribute: { hypothesis: 'The cow had lots of milk and black spots.', scaffold: 'Look at what the cat did.' },
    premise_echo: { hypothesis: 'Uncle Duane was milking the cows.', scaffold: 'Think about what Rattles did.' },
    character_confusion: { hypothesis: 'Grandma or the dog jumped on Uncle Duane.', scaffold: 'Look at who jumped.' },
    distractor_misconception: { hypothesis: 'Rattles ran outside to catch mice.', scaffold: 'Look where Rattles went.' },
  },
  hint_level_1: 'Look at where the cat jumped.',
  scaffold_hint: 'Where did Rattles jump while Uncle Duane was milking?',
};

export const COMPREHENSIVE_TEST_CASES = [
  // --- Category 1: Direct Keyword & Formal Mastery (5 cases) ---
  { id: 'fish_formal', chunk: fishChunk, text: 'she will be a fisherman and catch him', expectedStatus: 'mastered', category: 'Formal Mastery' },
  { id: 'garden_formal', chunk: gardenChunk, text: 'she will be a gardener and find him', expectedStatus: 'mastered', category: 'Formal Mastery' },
  { id: 'rattles_formal', chunk: rattlesChunk, text: 'Rattles jumped onto Uncle Duane\'s lap', expectedStatus: 'mastered', category: 'Formal Mastery' },
  { id: 'fish_direct', chunk: fishChunk, text: 'she will be a fisherman', expectedStatus: 'mastered', category: 'Formal Mastery' },
  { id: 'rattles_colloquial', chunk: rattlesChunk, text: 'the kitty leaped right on his lap', expectedStatus: 'mastered', category: 'Formal Mastery' },

  // --- Category 2: Minimal Core Answers (1-3 words) (4 cases) ---
  { id: 'fish_min', chunk: fishChunk, text: 'a fisherman', expectedStatus: 'mastered', category: 'Minimal Core' },
  { id: 'garden_min', chunk: gardenChunk, text: 'a gardener', expectedStatus: 'mastered', category: 'Minimal Core' },
  { id: 'rattles_min', chunk: rattlesChunk, text: 'on his lap', expectedStatus: 'mastered', category: 'Minimal Core' },
  { id: 'rattles_action_min', chunk: rattlesChunk, text: 'jumped on lap', expectedStatus: 'mastered', category: 'Minimal Core' },

  // --- Category 3: Functional Circumlocutions (Child explains concept without target noun) (6 cases) ---
  { id: 'fish_circ_net', chunk: fishChunk, text: 'the person who catches fish with a net', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'fish_circ_rod', chunk: fishChunk, text: 'someone who goes in the water with a fishing rod', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_circ_can', chunk: gardenChunk, text: 'the lady who waters plants with a can', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_circ_grow', chunk: gardenChunk, text: 'the lady who puts water on the flowers so they grow', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'garden_circ_dirt', chunk: gardenChunk, text: 'someone who takes care of plants in the dirt', expectedStatus: 'mastered', category: 'Circumlocution' },
  { id: 'rattles_circ_person', chunk: rattlesChunk, text: 'she climbed on the man who was getting the milk', expectedStatus: 'mastered', category: 'Circumlocution' },

  // --- Category 4: Near-Miss & Slot Conflicts (4 cases) ---
  { id: 'rattles_actor_conflict', chunk: rattlesChunk, text: 'the dog jumped on his lap', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'CHARACTER_CONFUSION', category: 'Slot Conflict' },
  { id: 'rattles_recipient_conflict', chunk: rattlesChunk, text: 'Rattles jumped on grandma\'s lap', expectedStatus: 'needs_scaffold', category: 'Slot Conflict' },
  { id: 'rattles_loc_conflict', chunk: rattlesChunk, text: 'she jumped on Uncle Duane\'s shoulder', expectedStatus: 'needs_scaffold', category: 'Slot Conflict' },
  { id: 'fish_agent_swap', chunk: fishChunk, text: 'the bunny will catch the mother', expectedStatus: 'needs_scaffold', category: 'Slot Conflict' },

  // --- Category 5: Superficial Visual Attributes & Tangents (3 cases) ---
  { id: 'rattles_cow_spots', chunk: rattlesChunk, text: 'the cow was big and had spots', expectedStatus: 'needs_scaffold', category: 'Superficial Detail' },
  { id: 'fish_boots', chunk: fishChunk, text: 'she gets boots and catches him', expectedStatus: 'needs_scaffold', category: 'Superficial Detail' },
  { id: 'garden_sun', chunk: gardenChunk, text: 'the flowers were in the sunny dirt', expectedStatus: 'needs_scaffold', category: 'Superficial Detail' },

  // --- Category 6: Premise & Question Echoes (3 cases) ---
  { id: 'rattles_premise_echo', chunk: rattlesChunk, text: 'Uncle Duane was milking the big cows', expectedStatus: 'needs_scaffold', category: 'Echo' },
  { id: 'fish_question_echo', chunk: fishChunk, text: 'what will the mother do if he runs away', expectedStatus: 'needs_scaffold', category: 'Echo' },
  { id: 'rattles_question_echo', chunk: rattlesChunk, text: 'what did rattles do when he milked', expectedStatus: 'needs_scaffold', category: 'Echo' },

  // --- Category 7: True Distractors & Hallucinated Actions (4 cases) ---
  { id: 'fish_bird', chunk: fishChunk, text: 'she becomes a bird and flies in a tree', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Distractor' },
  { id: 'garden_flower', chunk: gardenChunk, text: 'she will become a flower in the garden', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Distractor' },
  { id: 'rattles_mice', chunk: rattlesChunk, text: 'she ran away outside to hunt for barn mice', expectedStatus: 'needs_scaffold', expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION', category: 'Distractor' },
  { id: 'rattles_sleep', chunk: rattlesChunk, text: 'she fell asleep in the warm hay', expectedStatus: 'needs_scaffold', category: 'Distractor' },
];

export async function runBenchmarkMode(modeName, enableDecision) {
  console.log(`\n======================================================================`);
  console.log(`BENCHMARK RUN: [${modeName}] (Decision Model Enabled: ${enableDecision})`);
  console.log(`======================================================================\n`);

  let passedCount = 0;
  const categoryStats = {};
  const latencies = [];

  for (const tc of COMPREHENSIVE_TEST_CASES) {
    if (!categoryStats[tc.category]) {
      categoryStats[tc.category] = { total: 0, passed: 0 };
    }
    categoryStats[tc.category].total++;

    const t0 = Date.now();
    const res = await evaluateChildAnswer({
      ...tc.chunk,
      child_transcript: tc.text,
      attempt_count: 1,
      enable_cloud_fallback: enableDecision,
    });
    const latency = Date.now() - t0;
    latencies.push(latency);

    const statusMatch = res.status === tc.expectedStatus;
    const diagMatch = !tc.expectedDiagnosis || (res.diagnostics?.cognitive_diagnosis === tc.expectedDiagnosis);
    const passed = statusMatch && diagMatch;

    if (passed) {
      passedCount++;
      categoryStats[tc.category].passed++;
      console.log(`✅ [${tc.category}] "${tc.text}"`);
      console.log(`   Status: ${res.status} | Diag: ${res.diagnostics?.cognitive_diagnosis || 'NONE'} | Tier: ${res.diagnostics?.tier_resolved || 'N/A'} [${latency}ms]`);
    } else {
      console.log(`❌ [${tc.category}] "${tc.text}"`);
      console.log(`   Got: status=${res.status}, diag=${res.diagnostics?.cognitive_diagnosis || 'NONE'}, tier=${res.diagnostics?.tier_resolved || 'N/A'}`);
      console.log(`   Expected: status=${tc.expectedStatus}${tc.expectedDiagnosis ? ', diag=' + tc.expectedDiagnosis : ''} [${latency}ms]`);
    }
  }

  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const accuracyPct = Math.round((passedCount / COMPREHENSIVE_TEST_CASES.length) * 100);

  console.log(`\n--- SUMMARY FOR [${modeName}] ---`);
  console.log(`OVERALL SCORE: ${passedCount}/${COMPREHENSIVE_TEST_CASES.length} (${accuracyPct}%)`);
  console.log(`AVERAGE LATENCY: ${avgLatency}ms`);
  for (const [cat, stats] of Object.entries(categoryStats)) {
    console.log(`  - ${cat.padEnd(20)}: ${stats.passed}/${stats.total} (${Math.round((stats.passed / stats.total) * 100)}%)`);
  }

  return { modeName, passedCount, total: COMPREHENSIVE_TEST_CASES.length, accuracyPct, avgLatency, categoryStats };
}

async function main() {
  console.log('Gemini API Key active:', Boolean(process.env.GEMINI_API_KEY));

  // 1. Run Baseline Mode (Pure Local System 1, Offline-safe)
  const baselineResults = await runBenchmarkMode('BASELINE (Local System 1 Only)', false);

  // 2. Run Hybrid Mode (Local System 1 + Gemini Decision 1 for unmapped edge cases)
  const hybridResults = await runBenchmarkMode('HYBRID (System 1 + Gemini Decision 1)', true);

  // 3. Multimodal Visual Grounding Test on Real Screenshots
  console.log('\n======================================================================');
  console.log('MULTIMODAL BOOK SCREENSHOT GROUNDING AUDIT (Gemini Decision 1)');
  console.log('======================================================================\n');

  const rattlesImgPath = path.join(projectRoot, 'test', 'fixtures', 'book_pages', 'rattles3.png');
  const rattlesImgBuffer = fs.readFileSync(rattlesImgPath);

  // Test 3A: Factual Concept with actual screenshot
  const factualChunkWithImage = {
    ...rattlesChunk,
    image_buffer: rattlesImgBuffer,
    image_mime_type: 'image/png',
  };
  const factualGrounding = await verifyGroundingFidelity(factualChunkWithImage);
  console.log('1. Real Screenshot Factual Chunk Grounding:');
  console.log('   Grounded:', factualGrounding.is_grounded, '| Flagged for review:', factualGrounding.flagged_for_review);

  // Test 3B: Hallucinated Concept with actual screenshot
  const hallucinatedChunkWithImage = {
    ...rattlesChunk,
    target_answer_concept: 'Rattles flew an airplane in the barn sky.',
    verbatim_page_text: 'When Uncle Duane was milking the cows in the barn, Rattles climbed up and jumped right onto his lap.',
    image_buffer: rattlesImgBuffer,
    image_mime_type: 'image/png',
  };
  const hallucinatedGrounding = await verifyGroundingFidelity(hallucinatedChunkWithImage);
  console.log('2. Real Screenshot Hallucinated Concept:');
  console.log('   Grounded:', hallucinatedGrounding.is_grounded, '| Failure Reason:', hallucinatedGrounding.failure_reason, '| Flagged for review:', hallucinatedGrounding.flagged_for_review);

  // 4. Comparison Summary
  console.log('\n======================================================================');
  console.log('PRE-TEST vs POST-TEST IMPROVEMENT COMPARISON');
  console.log('======================================================================');
  console.log(`Baseline Accuracy (Local Only): ${baselineResults.accuracyPct}% (${baselineResults.passedCount}/${baselineResults.total}) | Avg Latency: ${baselineResults.avgLatency}ms`);
  console.log(`Hybrid Accuracy (+ Decision 1): ${hybridResults.accuracyPct}% (${hybridResults.passedCount}/${hybridResults.total}) | Avg Latency: ${hybridResults.avgLatency}ms`);
  console.log(`Accuracy Delta: +${hybridResults.accuracyPct - baselineResults.accuracyPct}%`);
  console.log(`Circumlocution Accuracy: ${baselineResults.categoryStats['Circumlocution']?.passed || 0}/${baselineResults.categoryStats['Circumlocution']?.total || 6} (Baseline) -> ${hybridResults.categoryStats['Circumlocution']?.passed || 0}/${hybridResults.categoryStats['Circumlocution']?.total || 6} (Hybrid)`);
  console.log('======================================================================\n');
}

main().catch(console.error);
