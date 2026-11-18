/**
 * StoryReader - Exhaustive Real Pipeline Audit: "Robert the Rose Horse" (All 6 Screenshots)
 * 
 * Runs all 6 real iPhone HEIC screenshots (robert1.HEIC - robert6.HEIC) through:
 * 1. Multimodal Gemini 3.1 Flash-Lite ingestion (no mock AI)
 * 2. Recitation policy and anti-recitation paraphrase verification
 * 3. Atomic story facts & diagnostic probe inspection
 * 4. Local ONNX DeBERTa-v3 NLI Grounding Verification
 * 5. Full Socratic Answer Evaluation across all cognitive diagnostic archetypes
 * 6. Live Express HTTP POST /api/analyze-book multipart form upload
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables explicitly from project root .env
dotenv.config({ path: path.join(projectRoot, '.env') });

// Enforce real pipeline execution
delete process.env.MOCK_AI;

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in environment or .env');
  process.exit(1);
}

import { createServer } from '../server.js';
import { analyzeBookPages } from '../services/gemini_service.js';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { detectRetryCommand } from '../services/voice_command_detector.js';

const FIXTURES_DIR = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

function loadHeicFixture(filename) {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  return {
    originalname: filename,
    mimetype: 'image/heic',
    buffer,
    size: buffer.length,
  };
}

async function auditRobertAllPages() {
  console.log('================================================================');
  console.log('🐴 STORYREADER - REAL PIPELINE AUDIT: "ROBERT THE ROSE HORSE"');
  console.log('================================================================');
  console.log(`Target: All 6 raw iPhone screenshots (robert1.HEIC - robert6.HEIC)`);
  console.log(`Model: ${process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'}`);
  console.log(`Pipeline Mode: LIVE AI (process.env.MOCK_AI = undefined)\n`);

  // 1. Load all 6 files
  const files = [];
  for (let i = 1; i <= 6; i++) {
    const f = loadHeicFixture(`robert${i}.HEIC`);
    files.push(f);
    console.log(`[Input ${i}/6] ${f.originalname} | Size: ${(f.size / 1024).toFixed(1)} KB | MIME: ${f.mimetype}`);
  }

  // 2. Multimodal Ingestion through Gemini 3.1
  console.log('\n----------------------------------------------------------------');
  console.log('📡 STEP 1: Multimodal Vision Ingestion & Chunking');
  console.log('----------------------------------------------------------------');
  const tStart = Date.now();
  const analysis = await analyzeBookPages(files);
  const ingestionDuration = Date.now() - tStart;

  console.log(`⏱️ Multimodal Ingestion Latency: ${ingestionDuration}ms`);
  console.log(`Legibility: ${analysis.is_legible}`);
  console.log(`Book Type: ${analysis.book_type}`);
  console.log(`Summary: "${analysis.summary}"`);
  console.log(`Total Chunks Generated: ${analysis.chunks?.length || 0}`);

  assert.equal(analysis.is_legible, true, 'All 6 pages must be legible');
  assert.ok(analysis.chunks && analysis.chunks.length > 0, 'Must produce reading chunks');

  // 3. Detailed Per-Chunk Inspection & Socratic Evaluation
  console.log('\n----------------------------------------------------------------');
  console.log('🔍 STEP 2: Exact Chunk Content & Pedagogical Rubrics');
  console.log('----------------------------------------------------------------');

  const chunkEvals = [];

  for (let i = 0; i < analysis.chunks.length; i++) {
    const chunk = analysis.chunks[i];
    console.log(`\n==================== CHUNK ${chunk.chunk_id} (${chunk.page_range}) ====================`);
    console.log(`Chunk Type: ${chunk.chunk_type}`);
    console.log(`Lookout Prompt: "${chunk.lookout_prompt}"`);
    console.log(`Check-in Question: "${chunk.checkin_question}"`);
    console.log(`Target Answer Concept: "${chunk.target_answer_concept}"`);
    console.log(`\n--- Paraphrased Story Facts (Anti-Recitation): ---`);
    console.log(chunk.paraphrased_story_facts);

    console.log(`\n--- Atomic Story Facts (${chunk.story_facts?.length || 0} propositions): ---`);
    if (Array.isArray(chunk.story_facts)) {
      chunk.story_facts.forEach((fact, idx) => console.log(`  [F${idx + 1}] ${fact}`));
    }

    console.log(`\n--- Keyword Concept Clusters: ---`);
    if (Array.isArray(chunk.keyword_clusters)) {
      chunk.keyword_clusters.forEach((c) => {
        console.log(`  • Concept: "${c.concept_name}" -> Synonyms: [${c.synonyms?.join(', ')}]`);
      });
    }

    console.log(`\n--- Acceptable Spoken Phrasings: ---`);
    if (Array.isArray(chunk.acceptable_phrasings)) {
      chunk.acceptable_phrasings.forEach((p, idx) => console.log(`  [P${idx + 1}] "${p}"`));
    }

    console.log(`\n--- Canonical Prototypes: ---`);
    if (Array.isArray(chunk.canonical_prototypes)) {
      chunk.canonical_prototypes.forEach((cp) => {
        console.log(`  • [${cp.type}]: "${cp.text}"`);
      });
    }

    console.log(`\n--- Diagnostic Probes (Zero-Spoiler Scaffolds): ---`);
    if (chunk.diagnostic_probes) {
      for (const [key, probe] of Object.entries(chunk.diagnostic_probes)) {
        console.log(`  • [${key}]:`);
        console.log(`      Hypothesis: "${probe.hypothesis}"`);
        if (probe.feedback) console.log(`      Feedback: "${probe.feedback}"`);
        if (probe.scaffold) console.log(`      Scaffold: "${probe.scaffold}"`);
      }
    }

    console.log(`\n--- Local ONNX DeBERTa-v3 Grounding Verification: ---`);
    if (chunk.grounding_verification) {
      const gv = chunk.grounding_verification;
      console.log(`  is_grounded: ${gv.is_grounded}`);
      console.log(`  lexical_pass: ${gv.lexical_pass}`);
      if (gv.nli_score) {
        console.log(`  NLI Scores -> Entailment: ${gv.nli_score.entailment?.toFixed(3)} | Contradiction: ${gv.nli_score.contradiction?.toFixed(3)} | Neutral: ${gv.nli_score.neutral?.toFixed(3)}`);
      }
      if (gv.failure_reason) {
        console.log(`  Failure Reason / Tag: ${gv.failure_reason}`);
      }
    }

    // 4. Live Socratic Evaluation on this Chunk
    console.log(`\n--- Live Socratic Evaluation Trials on Chunk ${chunk.chunk_id}: ---`);
    
    // Trial A: Formal Full Mastery
    const masteryUtterance = chunk.canonical_prototypes?.find((p) => p.type === 'formal_full')?.text || chunk.target_answer_concept;
    const tA = Date.now();
    const resA = await evaluateChildAnswer({
      ...chunk,
      child_transcript: masteryUtterance,
      attempt_count: 1,
    });
    console.log(`  [Trial A - Target Mastery]: "${masteryUtterance}"`);
    console.log(`     -> Status: ${resA.status} | Spoken Feedback: "${resA.spoken_feedback}" | Latency: ${Date.now() - tA}ms`);
    assert.equal(resA.status, 'mastered', 'Mastery answer must be awarded mastered');

    // Trial B: Minimal Core
    const minCoreUtterance = chunk.canonical_prototypes?.find((p) => p.type === 'minimal_core')?.text || 'with his mother and father';
    const tB = Date.now();
    const resB = await evaluateChildAnswer({
      ...chunk,
      child_transcript: minCoreUtterance,
      attempt_count: 1,
    });
    console.log(`  [Trial B - Minimal Core]: "${minCoreUtterance}"`);
    console.log(`     -> Status: ${resB.status} | Spoken Feedback: "${resB.spoken_feedback}" | Latency: ${Date.now() - tB}ms`);

    // Trial C: Superficial / Tangent Answer (Attempt 1 -> Needs Scaffold)
    const superficialUtterance = 'He had a red saddle and brown spots.';
    const tC = Date.now();
    const resC = await evaluateChildAnswer({
      ...chunk,
      child_transcript: superficialUtterance,
      attempt_count: 1,
    });
    console.log(`  [Trial C - Superficial / Tangent]: "${superficialUtterance}"`);
    console.log(`     -> Status: ${resC.status} | Scaffold Spoken: "${resC.spoken_feedback}" | Latency: ${Date.now() - tC}ms`);
    assert.equal(resC.status, 'needs_scaffold');

    // Trial D: Distractor Misconception (Attempt 1 -> Socratic Redirect)
    const distractorUtterance = chunk.canonical_prototypes?.find((p) => p.type === 'common_distractor')?.text || 'He lived in a pet shop in the big city.';
    const tD = Date.now();
    const resD = await evaluateChildAnswer({
      ...chunk,
      child_transcript: distractorUtterance,
      attempt_count: 1,
    });
    console.log(`  [Trial D - Distractor Misconception]: "${distractorUtterance}"`);
    console.log(`     -> Status: ${resD.status} | Scaffold Spoken: "${resD.spoken_feedback}" | Latency: ${Date.now() - tD}ms`);
    assert.equal(resD.status, 'needs_scaffold');

    chunkEvals.push({
      chunk_id: chunk.chunk_id,
      page_range: chunk.page_range,
      lookout: chunk.lookout_prompt,
      question: chunk.checkin_question,
      target: chunk.target_answer_concept,
      resA,
      resB,
      resC,
      resD,
    });
  }

  // 5. Live Express HTTP POST /api/analyze-book Verification
  console.log('\n----------------------------------------------------------------');
  console.log('🌐 STEP 3: Live Express HTTP Server Ingestion Test');
  console.log('----------------------------------------------------------------');
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  console.log(`Express server listening on port ${port}`);

  try {
    const formData = new FormData();
    for (let i = 1; i <= 6; i++) {
      const buffer = fs.readFileSync(path.join(FIXTURES_DIR, `robert${i}.HEIC`));
      formData.append('images', new Blob([buffer], { type: 'image/heic' }), `robert${i}.HEIC`);
    }

    const tHttp = Date.now();
    const httpRes = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });
    const httpDuration = Date.now() - tHttp;
    console.log(`HTTP POST /api/analyze-book returned status ${httpRes.status} in ${httpDuration}ms`);
    assert.equal(httpRes.status, 200, 'HTTP analyze-book endpoint must return 200 OK');

    const httpData = await httpRes.json();
    console.log(`HTTP Response: ${httpData.chunks?.length} chunks returned, is_legible=${httpData.is_legible}`);
    assert.equal(httpData.is_legible, true);
    assert.ok(httpData.chunks.length > 0);
  } finally {
    server.close();
  }

  // Save the full raw output to a persistent JSON artifact for auditability
  const artifactPath = path.join(projectRoot, 'scripts', 'robert_pipeline_run.json');
  fs.writeFileSync(artifactPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ingestionDurationMs: ingestionDuration,
    analysis,
    chunkEvals,
  }, null, 2), 'utf8');
  console.log(`\n💾 Full JSON dump saved to: ${artifactPath}`);

  console.log('\n================================================================');
  console.log('🎯 REAL PIPELINE AUDIT COMPLETED SUCCESSFULLY WITH 0 ERRORS');
  console.log('================================================================');
}

auditRobertAllPages().catch((err) => {
  console.error('\n❌ Audit script failed:', err);
  process.exit(1);
});
