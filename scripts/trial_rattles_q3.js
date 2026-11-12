import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import { rattlesBenchmarkDataset } from '../test/fixtures/rattles_benchmark_dataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const q3 = rattlesBenchmarkDataset[2];

// Load the real Gemini-generated rubric
const geminiRaw = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'test_output', 'gemini_rattles_q3_rubric.json'), 'utf8')
);
const geminiChunk = geminiRaw.chunks[0];

const rubricQ3 = {
  checkin_question: geminiChunk.checkin_question,
  question_type: geminiChunk.question_type,
  target_answer_concept: geminiChunk.target_answer_concept,
  keyword_clusters: geminiChunk.keyword_clusters,
  acceptable_phrasings: geminiChunk.acceptable_phrasings,
  canonical_prototypes: geminiChunk.canonical_prototypes,
  diagnostic_probes: geminiChunk.diagnostic_probes,
  hint_level_1: geminiChunk.hint_level_1,
  hint_level_2: geminiChunk.hint_level_2,
  scaffold_hint: geminiChunk.scaffold_hint,
  semantic_slots: q3.semantic_slots,
  story_context: {
    actor: 'Rattles',
    recipient: 'Uncle Duane',
    object: 'lap',
    location: 'lap',
  },
  entity_graph: {
    ...geminiChunk.entity_graph,
    discourse_referents: {
      she: 'Rattles',
      her: 'Rattles',
      he: 'Uncle Duane',
      his: 'Uncle Duane',
      him: 'Uncle Duane',
      they: 'the cats',
    },
  },
};

async function testQ3Pipeline() {
  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  console.log('=================================================================');
  console.log('🐾 REAL PIPELINE TRIAL EVALUATION: RATTLES QUESTION 3');
  console.log('Question:       "' + rubricQ3.checkin_question + '"');
  console.log('Target Concept: "' + rubricQ3.target_answer_concept + '"');
  console.log('Rubric Source:  Live Gemini API (gemini-3.5-flash)');
  console.log('Engine:         System 1 Transformers ONNX (Xenova/nli-deberta-v3-xsmall)');
  console.log('=================================================================\n');

  console.log('--- GEMINI-GENERATED SYSTEM 1 FEEDBACK PROBES ---');
  for (const [key, val] of Object.entries(rubricQ3.diagnostic_probes)) {
    console.log(`[${key}]:`);
    console.log(`   Hypothesis: "${val.hypothesis}"`);
    console.log(`   Feedback:   "${val.feedback || val.scaffold}"`);
  }
  console.log('-------------------------------------------------\n');

  const testCases = [
    ...q3.correct_answers.map((a, i) => ({
      label: `[Correct ${i + 1} - ${a.type}]`,
      transcript: a.text,
      expectedStatus: 'mastered',
    })),
    ...q3.evasive_or_partial_answers.map((a, i) => ({
      label: `[Evasive ${i + 1} - ${a.category}]`,
      transcript: a.text,
      expectedStatus: 'needs_scaffold',
      expectedDiag: a.expectedDiag,
    })),
  ];

  const results = [];

  for (const tc of testCases) {
    const t0 = performance.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rubricQ3,
        child_transcript: tc.transcript,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    const latency = (performance.now() - t0).toFixed(1);

    const pass = data.status === tc.expectedStatus;

    if (!pass || tc.label.includes('Correct 2') || tc.label.includes('Evasive 1') || tc.label.includes('Evasive 2')) {
      console.log(`\n🔍 DEBUG DETAILS for ${tc.label}:`);
      console.log('   Grounded transcript:', data.diagnostics?.grounded_transcript);
      console.log('   Probe scores:', JSON.stringify(data.diagnostics?.probe_scores || data.diagnostics?.tier2_semantic?.scoreTable, null, 2));
      console.log('   Tier resolved:', data.diagnostics?.tier_resolved);
      console.log('   Slot delta:', JSON.stringify(data.diagnostics?.slot_delta, null, 2));
    }

    results.push({
      label: tc.label,
      transcript: tc.transcript,
      status: data.status,
      expectedStatus: tc.expectedStatus,
      diag: data.diagnostics?.cognitive_diagnosis,
      expectedDiag: tc.expectedDiag,
      feedback: data.spoken_feedback,
      slot_delta: data.diagnostics?.slot_delta,
      tier_resolved: data.diagnostics?.tier_resolved,
      latency,
      pass,
    });
  }

  server.close();

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.label}`);
    console.log(`   Input:       "${r.transcript}"`);
    console.log(`   Status:      ${r.status} (expected: ${r.expectedStatus})`);
    console.log(`   Diagnosis:   ${r.diag} ${r.expectedDiag ? `(expected: ${r.expectedDiag})` : ''}`);
    console.log(`   Feedback:    "${r.feedback}"`);
    console.log(`   Tier:        ${r.tier_resolved}`);
    if (r.slot_delta?.is_near_miss) {
      console.log(`   Slot-Repair: Conflicted '${r.slot_delta.conflicted_slot}' | Degree: ${r.slot_delta.accuracy_degree}`);
      console.log(`   Nudge:       "${r.slot_delta.repair_prompt}"`);
    }
    console.log(`   Latency:     ${r.latency}ms\n`);
  }

  const passedCount = results.filter((r) => r.pass).length;
  console.log(`Summary: ${passedCount}/${results.length} cases behaved as expected.`);
}

testQ3Pipeline().catch(console.error);
