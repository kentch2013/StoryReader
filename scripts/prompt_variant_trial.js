import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

const sampleFiles = ['sample_page_1.jpg', 'sample_page_2.jpg'];
const imageContents = sampleFiles.map((fileName) => {
  const filePath = path.join(fixturesDir, fileName);
  const buffer = fs.readFileSync(filePath);
  return {
    inlineData: {
      mimeType: 'image/jpeg',
      data: buffer.toString('base64'),
    },
  };
});

// ============================================================================
// VARIANT A: Baseline (Current V1 Prompt)
// ============================================================================
const PROMPT_VARIANT_A = `
You are StoryScout, an expert Grade 2 reading comprehension specialist.
Analyze uploaded book pages in sequence and break them into bite-sized reading chunks.
Pedagogical Framework: Common Core RL.2 (RL.2.1 key details, RL.2.2 central message, RL.2.3 character reactions).
For each chunk:
- "lookout_prompt": A warm pre-reading focus goal that directs the child's attention before reading.
- "checkin_question": A Grade 2 comprehension question targeting key details or feelings.
- "target_answer_concept": The key idea or fact that constitutes a correct understanding.
- "scaffold_hint": A gentle hint if the child gets stuck.
`.trim();

// ============================================================================
// VARIANT B: Fact-Anchored Inquiry Chain (No Spoilers, Direct Pairing)
// ============================================================================
const PROMPT_VARIANT_B = `
You are StoryScout, a Grade 2 reading specialist.
Analyze sequential book pages and divide them into reading chunks.

Rules for Objective & Enforceable Output:
1. Zero Subjectivity: Questions and answers must be strictly grounded in observable text or illustrations on the page. Never ask for speculation or subjective opinions.
2. Unbroken Inquiry Chain:
   - "lookout_prompt": Tell the child what specific object, character action, or clue to watch for, WITHOUT spoiling the outcome. (e.g. "Watch for what Dog Man picks up in the garden.") Maximum 18 words.
   - "checkin_question": Must directly ask about the specific clue primed in the lookout prompt. (e.g. "What did Dog Man pick up in the garden, and where did he take it?") Maximum 15 words.
3. "target_answer_concept": State the exact factual answer in one clear sentence. Must be concrete and verifiable from the page.
4. "scaffold_hint": Must provide an explicit visual or textual location clue (e.g. "Look at the sign Dog Man crashes through" or "Read what the nurse says in the last panel").
`.trim();

// ============================================================================
// VARIANT C: Objective Semantic Kernel & Keyword Rubric (AI-Enforceable)
// ============================================================================
const PROMPT_VARIANT_C = `
You are StoryScout, an AI reading coach for Grade 2 (ages 7-8).
Your output will be evaluated by an automated speech judge. Subjectivity is strictly forbidden. Every answer must be objectively gradeable based solely on text and illustrations.

Strict Generation Rules:
1. "lookout_prompt":
   - Format: "Before you read, look for [observable visual/text element]."
   - Must NOT reveal the answer or plot resolution (No spoilers).
   - Word count: Under 16 words (for TTS playback).
2. "checkin_question":
   - Must be a factual who, what, where, or why question directly resolving the lookout prompt.
   - Grounded 100% in printed text or explicit panel art.
   - Word count: Under 14 words.
3. "target_answer_concept":
   - A single factual clause containing the necessary and sufficient facts for full credit.
   - Maximum 15 words.
4. "essential_keywords":
   - Exactly 2 to 4 must-have root words or short phrases that a child's spoken answer must contain (or direct synonyms) to demonstrate mastery.
5. "scaffold_hint":
   - Must cite the exact panel, speech bubble, or visual landmark on the page to find the answer.
   - Word count: Under 18 words.
`.trim();

// Base schema for Variant A & B
const SCHEMA_STANDARD = {
  type: Type.OBJECT,
  properties: {
    is_legible: { type: Type.BOOLEAN },
    error_message: { type: Type.STRING, nullable: true },
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          chunk_type: { type: Type.STRING, enum: ['scene', 'page'] },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          scaffold_hint: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'chunk_type', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'scaffold_hint'],
      },
    },
  },
  required: ['is_legible', 'book_type', 'summary', 'chunks'],
};

// Extended schema for Variant C (adds essential_keywords for deterministic grading)
const SCHEMA_VARIANT_C = {
  type: Type.OBJECT,
  properties: {
    is_legible: { type: Type.BOOLEAN },
    error_message: { type: Type.STRING, nullable: true },
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          chunk_type: { type: Type.STRING, enum: ['scene', 'page'] },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          essential_keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 4 required factual keywords/phrases for deterministic scoring',
          },
          scaffold_hint: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'chunk_type', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'essential_keywords', 'scaffold_hint'],
      },
    },
  },
  required: ['is_legible', 'book_type', 'summary', 'chunks'],
};

const variants = [
  { name: 'Variant A: Baseline V1', prompt: PROMPT_VARIANT_A, schema: SCHEMA_STANDARD },
  { name: 'Variant B: Fact-Anchored Inquiry Chain', prompt: PROMPT_VARIANT_B, schema: SCHEMA_STANDARD },
  { name: 'Variant C: Objective Semantic Kernel & Keyword Rubric', prompt: PROMPT_VARIANT_C, schema: SCHEMA_VARIANT_C },
];

async function runOptimizationTrial() {
  console.log('======================================================================');
  console.log('StoryScout Prompt Optimization Trial: Enforceability & Objectivity');
  console.log('Model: gemini-3.1-flash-lite');
  console.log('Input: 2 real camera pages (Dog Man & Petey)');
  console.log('======================================================================\n');

  for (const variant of variants) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`TESTING: ${variant.name}`);
    console.log(`----------------------------------------------------------------------`);

    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [...imageContents, 'Analyze these pages in sequence.'],
        config: {
          systemInstruction: variant.prompt,
          responseMimeType: 'application/json',
          responseSchema: variant.schema,
        },
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      const data = JSON.parse(response.text);

      console.log(`  ⏱️ Latency: ${elapsed}s | Chunks: ${data.chunks.length}`);
      console.log(`  📖 Summary: "${data.summary}"\n`);

      data.chunks.forEach((chunk, i) => {
        const lookoutWords = chunk.lookout_prompt.trim().split(/\s+/).length;
        const qWords = chunk.checkin_question.trim().split(/\s+/).length;
        const targetWords = chunk.target_answer_concept.trim().split(/\s+/).length;

        console.log(`  [Chunk ${chunk.chunk_id}] (${chunk.page_range})`);
        console.log(`    👀 Lookout Prompt   (${lookoutWords} words): "${chunk.lookout_prompt}"`);
        console.log(`    ❓ Check-in Q       (${qWords} words)      : "${chunk.checkin_question}"`);
        console.log(`    🎯 Target Concept   (${targetWords} words) : "${chunk.target_answer_concept}"`);
        if (chunk.essential_keywords) {
          console.log(`    🔑 Keywords Rubric  : [${chunk.essential_keywords.map(k => `"${k}"`).join(', ')}]`);
        }
        console.log(`    💡 Scaffold Hint    : "${chunk.scaffold_hint}"`);
        console.log('');
      });
    } catch (err) {
      console.error(`  ❌ Failed:`, err.message || err);
    }
  }
}

runOptimizationTrial().catch(console.error);
