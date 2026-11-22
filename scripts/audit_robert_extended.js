/**
 * StoryReader - Real Pipeline Execution & Pedagogical Audit: "Robert the Rose Horse"
 * 
 * Ingests all 6 real iPhone HEIC screenshots through live Express HTTP /api/analyze-book,
 * then subjects each generated chunk question to a comprehensive battery of 11 distinct
 * Grade 2 cognitive answer archetypes through live /api/evaluate-answer.
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
delete process.env.MOCK_AI;

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is missing from environment.');
  process.exit(1);
}

import { createServer } from '../server.js';

const FIXTURES_DIR = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

async function runRobertAudit() {
  console.log('================================================================================');
  console.log('🐴 STORYREADER - LIVE REAL PIPELINE EXECUTION: "ROBERT THE ROSE HORSE"');
  console.log('================================================================================');
  console.log(`Target: All 6 raw iPhone screenshots (robert1.HEIC - robert6.HEIC)`);
  console.log(`Vision Model: ${process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'}`);
  console.log(`Semantic Model: Google Gemini Decision 1 (gemini-decision-1)`);
  console.log(`Mode: 100% LIVE AI (No mocks)\n`);

  // 1. Boot local Express server
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[HTTP Server] Listening on ${baseUrl}`);

  try {
    // 2. Prepare multipart upload of all 6 HEIC screenshots
    console.log('\n[Stage 1] Loading raw iPhone HEIC screenshots...');
    const formData = new FormData();
    for (let i = 1; i <= 6; i++) {
      const fileName = `robert${i}.HEIC`;
      const filePath = path.join(FIXTURES_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing fixture: ${filePath}`);
      }
      const buffer = fs.readFileSync(filePath);
      console.log(`  • Loaded ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
      formData.append('images', new Blob([buffer], { type: 'image/heic' }), fileName);
    }

    // 3. Issue live HTTP POST /api/analyze-book
    console.log('\n[Stage 2] Submitting multi-page book to POST /api/analyze-book (Gemini Vision)...');
    const tVisionStart = performance.now();
    const analyzeRes = await fetch(`${baseUrl}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });
    const visionLatency = Math.round(performance.now() - tVisionStart);

    if (analyzeRes.status !== 200) {
      const errText = await analyzeRes.text();
      throw new Error(`Analyze book failed with status ${analyzeRes.status}: ${errText}`);
    }

    const bookData = await analyzeRes.json();
    console.log(`\n✅ Vision Analysis Complete in ${visionLatency}ms!`);
    console.log(`   Legibility: ${bookData.is_legible}`);
    console.log(`   Book Type: ${bookData.book_type}`);
    console.log(`   Summary: "${bookData.summary}"`);
    console.log(`   Total Reading Chunks: ${bookData.chunks?.length || 0}`);

    if (!bookData.chunks || bookData.chunks.length === 0) {
      throw new Error('Vision pipeline returned 0 reading chunks.');
    }

    // 4. Test each chunk with a diverse spectrum of child answers
    console.log('\n[Stage 3] Testing Diverse Child Answers on Each Chunk via POST /api/evaluate-answer...');
    const allEvaluationResults = [];

    for (let chunkIdx = 0; chunkIdx < bookData.chunks.length; chunkIdx++) {
      const chunk = bookData.chunks[chunkIdx];
      console.log(`\n================================================================================`);
      console.log(`📖 CHUNK ${chunk.chunk_id} | Page Range: ${chunk.page_range}`);
      console.log(`================================================================================`);
      console.log(`👁️ Lookout Prompt: "${chunk.lookout_prompt}"`);
      console.log(`❓ Check-in Question: "${chunk.checkin_question}"`);
      console.log(`🎯 Target Concept: "${chunk.target_answer_concept}"`);
      if (chunk.story_facts && chunk.story_facts.length > 0) {
        console.log(`📜 Story Facts:`);
        chunk.story_facts.slice(0, 3).forEach((f, i) => console.log(`    [F${i+1}] ${f}`));
      }

      // Generate context-aware child answer variants based on this specific chunk
      const testCases = generateAnswerBatteryForChunk(chunk);

      console.log(`\n  Executing ${testCases.length} child answer archetypes through live semantic pipeline:`);

      for (const tc of testCases) {
        const payload = {
          ...chunk,
          child_transcript: tc.transcript,
          attempt_count: tc.attempt_count || 1,
        };

        const tEvalStart = performance.now();
        const evalRes = await fetch(`${baseUrl}/api/evaluate-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const evalLatency = Math.round(performance.now() - tEvalStart);

        if (evalRes.status !== 200) {
          const errBody = await evalRes.text();
          console.error(`  ❌ HTTP error ${evalRes.status}: ${errBody}`);
          continue;
        }

        const evalData = await evalRes.json();
        const isExpected = (evalData.status === tc.expected_status);
        const icon = isExpected ? '✅' : '⚠️ [MISMATCH]';

        console.log(`\n  ${icon} [${tc.archetype}] (Attempt ${tc.attempt_count || 1})`);
        console.log(`     Child Utterance: "${tc.transcript}"`);
        console.log(`     Expected: ${tc.expected_status} | Got: ${evalData.status} (resolved: ${evalData.resolved})`);
        console.log(`     Spoken Feedback: "${evalData.spoken_feedback}"`);
        console.log(`     Tier: ${evalData.diagnostics?.tier_resolved || 'N/A'} | Slot: ${evalData.diagnostics?.cognitive_diagnosis || 'N/A'} | Latency: ${evalLatency}ms`);

        allEvaluationResults.push({
          chunk_id: chunk.chunk_id,
          page_range: chunk.page_range,
          question: chunk.checkin_question,
          target_concept: chunk.target_answer_concept,
          archetype: tc.archetype,
          transcript: tc.transcript,
          attempt_count: tc.attempt_count || 1,
          expected_status: tc.expected_status,
          actual_status: evalData.status,
          resolved: evalData.resolved,
          is_match: isExpected,
          spoken_feedback: evalData.spoken_feedback,
          tier_resolved: evalData.diagnostics?.tier_resolved,
          cognitive_diagnosis: evalData.diagnostics?.cognitive_diagnosis,
          latency_ms: evalLatency,
        });
      }
    }

    // 5. Save detailed JSON artifact
    const reportArtifact = {
      timestamp: new Date().toISOString(),
      visionLatencyMs: visionLatency,
      summary: bookData.summary,
      totalChunks: bookData.chunks.length,
      totalTests: allEvaluationResults.length,
      matches: allEvaluationResults.filter(r => r.is_match).length,
      mismatches: allEvaluationResults.filter(r => !r.is_match).length,
      bookData,
      evaluations: allEvaluationResults,
    };

    const outPath = path.join(projectRoot, 'scripts', 'robert_live_audit_results.json');
    fs.writeFileSync(outPath, JSON.stringify(reportArtifact, null, 2), 'utf8');
    console.log(`\n💾 Saved detailed audit run to: ${outPath}`);

  } finally {
    server.close();
  }
}

/**
 * Generates an exhaustive battery of 11 distinct Grade 2 cognitive answer archetypes
 * customized to the chunk's question, target concept, prototypes, and distractors.
 */
function generateAnswerBatteryForChunk(chunk) {
  const formalMastery = chunk.canonical_prototypes?.find(p => p.type === 'formal_full')?.text || chunk.target_answer_concept;
  const colloquialMastery = chunk.canonical_prototypes?.find(p => p.type === 'colloquial')?.text || chunk.acceptable_phrasings?.[0] || formalMastery;
  const minimalCore = chunk.canonical_prototypes?.find(p => p.type === 'minimal_core')?.text || chunk.keyword_clusters?.[0]?.synonyms?.[0] || 'friends';
  const commonDistractor = chunk.canonical_prototypes?.find(p => p.type === 'common_distractor')?.text || 'he was at a pet shop in the big city';

  // Extract head nouns/words for custom variants
  const words = chunk.target_answer_concept.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const coreNoun = words[words.length - 1] || 'roses';

  return [
    {
      archetype: '1. Formal Target Mastery',
      transcript: formalMastery,
      expected_status: 'mastered',
      attempt_count: 1,
    },
    {
      archetype: '2. Colloquial / Child Speech Variation',
      transcript: colloquialMastery,
      expected_status: 'mastered',
      attempt_count: 1,
    },
    {
      archetype: '3. Minimal Core / Head Noun Only',
      transcript: minimalCore,
      expected_status: 'mastered',
      attempt_count: 1,
    },
    {
      archetype: '4. Character / Actor Substitution Confusion',
      transcript: 'his mother and father did it',
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '5. Near-Miss / Minor Slot Defect',
      transcript: `it was because of yellow ${coreNoun} on the table`,
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '6. Distractor Misconception',
      transcript: commonDistractor,
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '7. Premise Echo (Question Repetition)',
      transcript: chunk.checkin_question.replace(/\?$/, ''),
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '8. Superficial / Visual Tangent',
      transcript: 'he is a big brown horse with horseshoes',
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '9. Hesitation / Uncertainty (Shrug)',
      transcript: "i don't know maybe something happened",
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '10. Direct Contradiction / Negation',
      transcript: `no ${coreNoun} were there and nothing happened`,
      expected_status: 'needs_scaffold',
      attempt_count: 1,
    },
    {
      archetype: '11. Attempt 2 Socratic Auto-Reveal (No-Loop Rule)',
      transcript: "i still don't know",
      expected_status: 'needs_scaffold', // Note: on attempt 2, status is needs_scaffold but resolved: true with auto-reveal feedback
      attempt_count: 2,
    },
  ];
}

runRobertAudit().catch((err) => {
  console.error('\n❌ Robert audit failed:', err);
  process.exit(1);
});
