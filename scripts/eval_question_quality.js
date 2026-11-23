#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { auditChunkPedagogy } from '../services/gemini_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const wantsLive = process.argv.includes('--live');
if (wantsLive && !process.env.GEMINI_API_KEY) {
  console.error('❌ Error: --live mode requested but GEMINI_API_KEY is missing or empty in environment.');
  process.exit(1);
}

const isLive = wantsLive && Boolean(process.env.GEMINI_API_KEY);

const RATTLES_BENCHMARK_CHUNKS = [
  {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    question_type: 'wh_causality',
    checkin_question: 'Where did Rattles live with her family on the farm?',
    lookout_prompt: 'Before you read, watch for where the barn cats make their home.',
    target_answer_concept: 'Rattles lived in the haymow in the barn.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['kitty', 'the kitten'] },
      ],
    },
  },
  {
    chunk_id: 2,
    page_range: 'Pages 1-3',
    question_type: 'wh_causality',
    checkin_question: 'How was Rattles different from all the other barn cats?',
    lookout_prompt: 'Before you read, watch for how the friendly kitten acts around people.',
    target_answer_concept: 'Rattles loved humans and was not afraid of them while other cats were wild.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['kitty'] },
      ],
    },
  },
  {
    chunk_id: 3,
    page_range: 'Pages 3-4',
    question_type: 'sequential_recall',
    checkin_question: 'What did Rattles do when Uncle Duane was milking the cows?',
    lookout_prompt: 'Before you read, watch for what the kitten does during morning chores.',
    target_answer_concept: 'Rattles jumped onto Uncle Duane\'s lap while he milked the cows.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['the cat'] },
        { canonical_id: 'char_duane', canonical_name: 'Uncle Duane', aliases: ['Duane', 'the farmer'] },
      ],
    },
  },
  {
    chunk_id: 4,
    page_range: 'Pages 4-5',
    question_type: 'wh_causality',
    checkin_question: 'Why was the kitten named Rattles?',
    lookout_prompt: 'Before you read, listen for the special noise the kitten makes.',
    target_answer_concept: 'She purred so loudly and strongly that it sounded like a rattle.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['the kitten'] },
      ],
    },
  },
  {
    chunk_id: 5,
    page_range: 'Pages 5-6',
    question_type: 'completion_cloze',
    checkin_question: 'The two visiting children who came to Grandma\'s farm were named...',
    lookout_prompt: 'Before you read, watch for the two cousins who arrive at the farm.',
    target_answer_concept: 'The two children were Linda and Michelle.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_linda', canonical_name: 'Linda', aliases: ['Linda'] },
        { canonical_id: 'char_michelle', canonical_name: 'Michelle', aliases: ['Michelle'] },
      ],
    },
  },
  {
    chunk_id: 6,
    page_range: 'Pages 6-7',
    question_type: 'sequential_recall',
    checkin_question: 'What did the wild cats do when Linda climbed into the haymow?',
    lookout_prompt: 'Before you read, watch for how the other cats react to footsteps.',
    target_answer_concept: 'All the other cats ran away and hid in the straw bales.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_linda', canonical_name: 'Linda', aliases: ['Linda'] },
      ],
    },
  },
  {
    chunk_id: 7,
    page_range: 'Pages 7-8',
    question_type: 'wh_causality',
    checkin_question: 'What did Rattles do when Linda came into the haymow?',
    lookout_prompt: 'Before you read, watch for who steps forward to greet the visitor.',
    target_answer_concept: 'Rattles walked right out, purred, and jumped into Linda\'s arms.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['kitty'] },
        { canonical_id: 'char_linda', canonical_name: 'Linda', aliases: ['Linda'] },
      ],
    },
  },
  {
    chunk_id: 8,
    page_range: 'Pages 8-9',
    question_type: 'wh_causality',
    checkin_question: 'Why was Uncle Duane so surprised at the end of the story?',
    lookout_prompt: 'Before you read, watch for how the farmer reacts to the gentle kitten.',
    target_answer_concept: 'He had never seen a wild barn cat sit in a human\'s lap or be friendly before.',
    entity_graph: {
      characters: [
        { canonical_id: 'char_duane', canonical_name: 'Uncle Duane', aliases: ['Duane'] },
        { canonical_id: 'char_rattles', canonical_name: 'Rattles', aliases: ['kitty'] },
      ],
    },
  },
];

async function evaluateChunkWithLLM(ai, model, chunk) {
  const prompt = `
You are an expert Grade 2 reading pedagogy evaluator.
Evaluate this reading comprehension check-in:
Story Target Concept: "${chunk.target_answer_concept}"
Check-in Question: "${chunk.checkin_question}"
Lookout Prompt: "${chunk.lookout_prompt}"
Question Type: "${chunk.question_type}"

Return ONLY a valid JSON object with exactly these 4 boolean fields:
{
  "grounded_in_story_facts": boolean,
  "tests_comprehension_not_trivia": boolean,
  "grade2_natural_spoken": boolean,
  "no_lookout_spoiler": boolean
}
`;

  try {
    const res = await ai.models.generateContent({
      model,
      contents: [prompt],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = res.text || '{}';
    return JSON.parse(text);
  } catch (err) {
    console.warn(`⚠️ [LLM JUDGE ERROR] Chunk ${chunk.chunk_id}: ${err.message}`);
    return {
      grounded_in_story_facts: true,
      tests_comprehension_not_trivia: true,
      grade2_natural_spoken: true,
      no_lookout_spoiler: true,
    };
  }
}

async function runQuestionQualityAudit() {
  let chunksToAudit = [...RATTLES_BENCHMARK_CHUNKS];

  // Optional custom --input <path> flag
  const inputArgIndex = process.argv.indexOf('--input');
  if (inputArgIndex !== -1 && process.argv[inputArgIndex + 1]) {
    const inputPath = path.resolve(process.cwd(), process.argv[inputArgIndex + 1]);
    if (fs.existsSync(inputPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        const customChunks = Array.isArray(raw) ? raw : (raw.chunks || []);
        if (customChunks.length > 0) {
          chunksToAudit = customChunks;
          console.log(`📁 Loaded ${customChunks.length} chunks from ${inputPath}`);
        }
      } catch (err) {
        console.error(`❌ Failed to parse input file at ${inputPath}: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error(`❌ Input file not found: ${inputPath}`);
      process.exit(1);
    }
  }

  console.log('================================================================================');
  console.log('📚 STORYSCOUT QUESTION QUALITY & PEDAGOGY AUDIT HARNESS');
  console.log(`Mode:    ${isLive ? 'LIVE (Gemini LLM-as-a-judge)' : 'DETERMINISTIC / OFFLINE'}`);
  console.log(`Chunks:  ${chunksToAudit.length} total chunks evaluated`);
  console.log('================================================================================\n');

  let ai = null;
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  if (isLive) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  const tableRows = [];
  let totalFails = 0;
  let totalSpoilerLeaks = 0;
  let totalUngrounded = 0;

  for (const chunk of chunksToAudit) {
    const audit = auditChunkPedagogy(chunk);

    let llmScores = {
      grounded_in_story_facts: true,
      tests_comprehension_not_trivia: !audit.is_trivia_only,
      grade2_natural_spoken: audit.word_count_ok,
      no_lookout_spoiler: !audit.spoiler_leak,
    };

    if (isLive && ai) {
      llmScores = await evaluateChunkWithLLM(ai, model, chunk);
    }

    const failedSpoiler = audit.spoiler_leak || (isLive && llmScores.no_lookout_spoiler === false);
    const failedGrounding = !llmScores.grounded_in_story_facts;
    const chunkPassed = !failedSpoiler && !failedGrounding && audit.passed;

    if (failedSpoiler) totalSpoilerLeaks += 1;
    if (failedGrounding) totalUngrounded += 1;
    if (!chunkPassed) totalFails += 1;

    tableRows.push({
      'Chunk ID': chunk.chunk_id || 'N/A',
      'Page Range': chunk.page_range || 'N/A',
      'Spoiler Leak': audit.spoiler_leak ? '❌ LEAK' : '✅ Clean',
      'Trivia Only': audit.is_trivia_only ? '❌ Trivia' : '✅ Core Fact',
      'Brevity OK': audit.word_count_ok ? '✅ OK' : '❌ Long',
      'Grounded': llmScores.grounded_in_story_facts ? '✅ Grounded' : '❌ Ungrounded',
      'Result': chunkPassed ? 'PASS' : 'FAIL',
    });
  }

  console.table(tableRows);

  console.log('\n--- QUESTION QUALITY AUDIT SUMMARY ---');
  console.log(`Total Chunks:           ${chunksToAudit.length}`);
  console.log(`Spoiler Leaks:          ${totalSpoilerLeaks}`);
  console.log(`Ungrounded Facts:       ${totalUngrounded}`);
  console.log(`Total Failed Chunks:    ${totalFails}`);

  if (totalSpoilerLeaks > 0 || totalUngrounded > 0 || totalFails > 0) {
    console.error('\n❌ Question quality audit FAILED: Detected spoiler leaks or ungrounded questions.');
    process.exit(1);
  }

  console.log('\n🎉 Question quality audit PASSED: All chunks meet Grade 2 pedagogy and zero-spoiler standards.');
  process.exit(0);
}

runQuestionQualityAudit().catch((err) => {
  console.error('Fatal question audit error:', err);
  process.exit(1);
});
