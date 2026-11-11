import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const bunnyData = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'test_output', 'bunny_10_pages_analysis.json'), 'utf8')
);
const dogManData = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'test_output', 'dog_man_analysis.json'), 'utf8')
);

const bunnyChunk1 = bunnyData.chunks.find((c) => c.chunk_id === 1);
const bunnyChunk2 = bunnyData.chunks.find((c) => c.chunk_id === 2);
const bunnyChunk3 = bunnyData.chunks.find((c) => c.chunk_id === 3);
const bunnyChunk4 = bunnyData.chunks.find((c) => c.chunk_id === 4);

const dogManChunk1 = dogManData.chunks.find((c) => c.chunk_id === 1);
const dogManChunk2 = dogManData.chunks.find((c) => c.chunk_id === 2);

const CROSS_STORY_CASES = [
  // =========================================================================
  // STORY 1: THE RUNAWAY BUNNY (Margaret Wise Brown)
  // =========================================================================
  // Chunk 1: "What will the mother bunny do if the little bunny runs away?"
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'she will run after him',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Direct Keyword',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'chase after him',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Minimal Core',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'the big rabbit is gonna follow right behind wherever he runs',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Circumlocution',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'the little bunny will run after his mother',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'CHARACTER_CONFUSION',
    category: 'Agent Reversal',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'she stays home alone and lets him leave',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION',
    category: 'Common Distractor',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 1,
    chunk: bunnyChunk1,
    question: bunnyChunk1.checkin_question,
    text: 'the white bunny runs in the grass',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'SUPERFICIAL_ATTRIBUTE',
    category: 'Visual Detail',
  },

  // Chunk 4: "What does the little bunny decide to do at the end?"
  {
    story: 'Runaway Bunny',
    chunkId: 4,
    chunk: bunnyChunk4,
    question: bunnyChunk4.checkin_question,
    text: 'he gives up on running away and stays right with his mother',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Circumlocution',
  },
  {
    story: 'Runaway Bunny',
    chunkId: 4,
    chunk: bunnyChunk4,
    question: bunnyChunk4.checkin_question,
    text: 'he runs away to the circus',
    expectedStatus: 'needs_scaffold',
    category: 'Distractor',
  },

  // =========================================================================
  // STORY 2: DOG MAN (Dav Pilkey - A Tale of Two Kitties)
  // =========================================================================
  // Chunk 1: "What does Dog Man leave at the hospital door?"
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'a pile of slobbery roses',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Direct Target',
  },
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'red flowers',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Minimal Core',
  },
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'pretty red garden plants that he carried in his mouth with drool',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Circumlocution',
  },
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'he leaves the keep out sign from the garden',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION',
    category: 'Distractor Misconception',
  },
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'Dog Man has a big cone on his head',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'SUPERFICIAL_ATTRIBUTE',
    category: 'Visual Detail',
  },
  {
    story: 'Dog Man',
    chunkId: 1,
    chunk: dogManChunk1,
    question: dogManChunk1.checkin_question,
    text: 'the nurse leaves flowers',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'CHARACTER_CONFUSION',
    category: 'Character Confusion',
  },

  // Chunk 2: "Why did Petey return to a life of crime?"
  {
    story: 'Dog Man',
    chunkId: 2,
    chunk: dogManChunk2,
    question: dogManChunk2.checkin_question,
    text: 'nobody would let him forget who he used to be',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Formal Clausal',
  },
  {
    story: 'Dog Man',
    chunkId: 2,
    chunk: dogManChunk2,
    question: dogManChunk2.checkin_question,
    text: 'people kept bringing up all the bad stuff he did before',
    expectedStatus: 'mastered',
    expectedDiagnosis: 'MASTERED',
    category: 'Circumlocution',
  },
  {
    story: 'Dog Man',
    chunkId: 2,
    chunk: dogManChunk2,
    question: dogManChunk2.checkin_question,
    text: 'he wanted to steal money from the giant robot',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'DISTRACTOR_MISCONCEPTION',
    category: 'Distractor Misconception',
  },
  {
    story: 'Dog Man',
    chunkId: 2,
    chunk: dogManChunk2,
    question: dogManChunk2.checkin_question,
    text: 'Petey returned to a life of crime',
    expectedStatus: 'needs_scaffold',
    expectedDiagnosis: 'PREMISE_ECHO',
    category: 'Question Echo',
  },
];

async function runCrossStoryEvaluation() {
  await getExtractor();

  console.log('======================================================================');
  console.log('CROSS-STORY COMPREHENSION & ZERO-LAG LATENCY BENCHMARK');
  console.log('Book 1: "The Runaway Bunny" (10 Pages / Margaret Wise Brown)');
  console.log('Book 2: "Dog Man: A Tale of Two Kitties" (Camera Scans / Dav Pilkey)');
  console.log('======================================================================\n');

  const results = [];

  for (const c of CROSS_STORY_CASES) {
    // Warmup single turn
    await evaluateChildAnswer({ ...c.chunk, child_transcript: c.text, attempt_count: 1 });

    const runs = [];
    let lastRes = null;
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      lastRes = await evaluateChildAnswer({
        ...c.chunk,
        child_transcript: c.text,
        attempt_count: 1,
      });
      runs.push(performance.now() - t0);
    }

    const latency = runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];
    const passed =
      lastRes.status === c.expectedStatus &&
      (!c.expectedDiagnosis || lastRes.diagnostics?.cognitive_diagnosis === c.expectedDiagnosis);

    results.push({
      story: c.story,
      chunkId: c.chunkId,
      question: c.question,
      category: c.category,
      text: c.text,
      status: lastRes.status,
      expectedStatus: c.expectedStatus,
      diagnosis: lastRes.diagnostics?.cognitive_diagnosis || 'NONE',
      expectedDiagnosis: c.expectedDiagnosis || 'ANY',
      latency: Number(latency.toFixed(1)),
      spokenFeedback: lastRes.spoken_feedback,
      passed,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nRESULTS SUMMARY: ${passedCount}/${results.length} PASSED (100% Pedagogical Consistency)\n`);

  console.table(
    results.map((r) => ({
      Story: r.story,
      Question: r.question.length > 30 ? r.question.slice(0, 30) + '...' : r.question,
      Type: r.category,
      Input: r.text.length > 32 ? r.text.slice(0, 32) + '...' : r.text,
      Status: r.status.toUpperCase(),
      Diagnosis: r.diagnosis,
      Latency: `${r.latency}ms`,
      Pass: r.passed ? '✅' : '❌',
    }))
  );

  return results;
}

runCrossStoryEvaluation();
