import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer } from '../server.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import { BOOK_ANALYSIS_SYSTEM_PROMPT, BOOK_ANALYSIS_SCHEMA } from '../prompts/book_analysis.js';
import { sanitizeAnalysisProbes, safeJsonParse } from '../services/gemini_service.js';
import { rattlesBenchmarkDataset } from '../test/fixtures/rattles_benchmark_dataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
delete process.env.MOCK_AI;

const q4 = rattlesBenchmarkDataset[3];

async function generateGeminiQ4Rubric() {
  const outputPath = path.join(projectRoot, 'test_output', 'gemini_rattles_q4_rubric.json');
  if (fs.existsSync(outputPath)) {
    console.log(`Loading cached Gemini Q4 rubric from ${outputPath}...`);
    const cached = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return cached.chunks[0];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');
  const files = [
    { name: 'rattles4.png', buffer: fs.readFileSync(path.join(fixturesDir, 'rattles4.png')) },
    { name: 'rattles5.png', buffer: fs.readFileSync(path.join(fixturesDir, 'rattles5.png')) },
  ];

  const contents = files.map((f) => ({
    inlineData: {
      mimeType: 'image/png',
      data: f.buffer.toString('base64'),
    },
  }));

  contents.push(
    `Analyze these book pages according to Grade 2 reading standards. ` +
    `Focus specifically on the scene where the kitten is named, generating the reading chunk and diagnostic probes for the check-in question: "Why was the kitten named Rattles?"`
  );

  console.log(`Querying Gemini (${model}) for Question 4 rubric & diagnostic probes...`);
  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: BOOK_ANALYSIS_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: BOOK_ANALYSIS_SCHEMA,
    },
  });

  console.log(`Gemini completed in ${((Date.now() - t0) / 1000).toFixed(2)}s\n`);
  const parsed = safeJsonParse(response.text);
  const sanitized = sanitizeAnalysisProbes(parsed);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(sanitized, null, 2), 'utf8');
  console.log(`Saved live Gemini rubric to ${outputPath}\n`);

  return sanitized.chunks[0];
}

async function runQ4Pipeline() {
  const geminiChunk = await generateGeminiQ4Rubric();

  const rubricQ4 = {
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
    semantic_slots: q4.semantic_slots,
    story_context: {
      actor: 'Rattles',
      object: 'purr',
      sound: 'rattle',
    },
    entity_graph: {
      ...geminiChunk.entity_graph,
      discourse_referents: {
        she: 'Rattles',
        her: 'Rattles',
        it: 'her purr',
      },
    },
  };

  await getExtractor();
  const app = createServer();
  const server = app.listen(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/evaluate-answer`;

  console.log('=================================================================');
  console.log('🐾 REAL PIPELINE TRIAL EVALUATION: RATTLES QUESTION 4');
  console.log('Question:       "' + rubricQ4.checkin_question + '"');
  console.log('Target Concept: "' + rubricQ4.target_answer_concept + '"');
  console.log('Rubric Source:  Live Gemini API (gemini-3.5-flash)');
  console.log('Engine:         System 1 Transformers ONNX (Xenova/nli-deberta-v3-xsmall)');
  console.log('=================================================================\n');

  console.log('--- GEMINI-GENERATED SYSTEM 1 FEEDBACK PROBES ---');
  for (const [key, val] of Object.entries(rubricQ4.diagnostic_probes)) {
    console.log(`[${key}]:`);
    console.log(`   Hypothesis: "${val.hypothesis}"`);
    console.log(`   Feedback:   "${val.feedback || val.scaffold}"`);
  }
  console.log('-------------------------------------------------\n');

  const testCases = [
    ...q4.correct_answers.map((a, i) => ({
      label: `[Correct ${i + 1} - ${a.type}]`,
      transcript: a.text,
      expectedStatus: 'mastered',
    })),
    ...q4.evasive_or_partial_answers.map((a, i) => ({
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
        ...rubricQ4,
        child_transcript: tc.transcript,
        attempt_count: 1,
      }),
    });
    const data = await res.json();
    const latency = (performance.now() - t0).toFixed(1);

    const pass = data.status === tc.expectedStatus;

    if (!pass || tc.label.includes('Correct 1') || tc.label.includes('Evasive 2') || tc.label.includes('Evasive 4') || tc.label.includes('Evasive 8')) {
      console.log(`\n🔍 DEBUG DETAILS for ${tc.label}:`);
      console.log('   Grounded transcript:', data.diagnostics?.grounded_transcript);
      console.log('   Tier resolved:', data.diagnostics?.tier_resolved);
      console.log('   Cognitive diag:', data.diagnostics?.cognitive_diagnosis);
      console.log('   Probe scores:', JSON.stringify(data.diagnostics?.probe_scores || data.diagnostics?.tier2_semantic?.scoreTable, null, 2));
      console.log('   Tier 1 diagnostic:', JSON.stringify(data.diagnostics?.tier1, null, 2));
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

runQ4Pipeline().catch((err) => {
  console.error('Q4 pipeline error:', err);
  process.exit(1);
});
