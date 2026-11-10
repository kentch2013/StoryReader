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

// Load bunny1.png through bunny6.png in sequence
const bunnyFiles = ['bunny1.png', 'bunny2.png', 'bunny3.png', 'bunny4.png', 'bunny5.png', 'bunny6.png'];

const imageContents = bunnyFiles.map((file) => {
  const filePath = path.join(fixturesDir, file);
  const buffer = fs.readFileSync(filePath);
  return {
    inlineData: {
      mimeType: 'image/png',
      data: buffer.toString('base64'),
    },
  };
});

// Variant C Prompt & Schema
const PROMPT_VARIANT_C = `
You are StoryScout, an expert AI reading coach for Grade 2 children (ages 7-8).
Analyze sequential book pages and break them into logical, engaging reading chunks (group 2-3 pages together if text is light).
Your output will be evaluated by an automated speech judge in Module 3. Subjectivity is strictly forbidden. Every question and answer must be objectively gradeable based solely on text and illustrations.

Strict Generation Rules:
1. "lookout_prompt":
   - Format: "Before you read, look for [observable visual/text clue]."
   - Must NOT reveal the answer or plot resolution (No spoilers).
   - Word count: Under 16 words (for TTS spoken playback).
2. "checkin_question":
   - Must be a factual who, what, where, or why question directly resolving the lookout prompt.
   - Grounded 100% in printed text or explicit illustration details.
   - Word count: Under 14 words.
3. "target_answer_concept":
   - A single factual clause containing the necessary and sufficient facts for full credit.
   - Maximum 15 words.
4. "essential_keywords":
   - Exactly 2 to 4 must-have root words or short phrases that a child's spoken answer must contain (or direct synonyms) to demonstrate mastery.
5. "scaffold_hint":
   - Must cite the exact page, panel, or visual landmark on the page to find the clue.
   - Word count: Under 18 words.
`.trim();

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
        required: [
          'chunk_id',
          'page_range',
          'chunk_type',
          'lookout_prompt',
          'checkin_question',
          'target_answer_concept',
          'essential_keywords',
          'scaffold_hint',
        ],
      },
    },
  },
  required: ['is_legible', 'book_type', 'summary', 'chunks'],
};

async function testBunnyBook() {
  console.log('======================================================================');
  console.log('StoryScout Live Test: Bunny Story (bunny1.png - bunny6.png)');
  console.log('Model  : gemini-3.1-flash-lite');
  console.log('Prompt : Variant C (Objective Semantic Kernel & Keyword Rubric)');
  console.log(`Pages  : ${bunnyFiles.length} sequential screenshots`);
  bunnyFiles.forEach((file) => {
    const size = Math.round(fs.statSync(path.join(fixturesDir, file)).size / 1024);
    console.log(`  - ${file} (${size} KB)`);
  });
  console.log('======================================================================\n');

  const t0 = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        ...imageContents,
        'Analyze these book pages in sequence according to Grade 2 reading standards.',
      ],
      config: {
        systemInstruction: PROMPT_VARIANT_C,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_VARIANT_C,
      },
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const data = JSON.parse(response.text);

    console.log(`⏱️ Analysis Latency : ${elapsed}s for all 6 pages in 1 batch request`);
    console.log(`📖 Legible          : ${data.is_legible}`);
    console.log(`📚 Book Type        : ${data.book_type}`);
    console.log(`📝 Story Summary    : "${data.summary}"\n`);
    console.log(`🧩 Chunks Generated (${data.chunks.length}):\n`);

    data.chunks.forEach((chunk) => {
      const lookoutWords = chunk.lookout_prompt.trim().split(/\s+/).length;
      const qWords = chunk.checkin_question.trim().split(/\s+/).length;
      const targetWords = chunk.target_answer_concept.trim().split(/\s+/).length;

      console.log(`----------------------------------------------------------------------`);
      console.log(`Chunk #${chunk.chunk_id} | ${chunk.page_range} [${chunk.chunk_type}]`);
      console.log(`👀 Lookout Prompt   (${lookoutWords} words) : "${chunk.lookout_prompt}"`);
      console.log(`❓ Check-in Question (${qWords} words) : "${chunk.checkin_question}"`);
      console.log(`🎯 Target Concept   (${targetWords} words) : "${chunk.target_answer_concept}"`);
      console.log(`🔑 Essential Keywords     : [${chunk.essential_keywords.map((k) => `"${k}"`).join(', ')}]`);
      console.log(`💡 Scaffold Hint           : "${chunk.scaffold_hint}"`);
    });
    console.log(`----------------------------------------------------------------------\n`);
    console.log(`✅ [BUNNY TEST COMPLETE] Successfully analyzed full 6-page sequence.`);
  } catch (err) {
    console.error('❌ Bunny test failed:', err);
    process.exit(1);
  }
}

testBunnyBook().catch(console.error);
