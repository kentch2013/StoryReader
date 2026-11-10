import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

async function testSpecializedPipeline() {
  console.log(`======================================================================`);
  console.log(`Specialized Multi-Model Pipeline Experiment`);
  console.log(`Job 1: Gemini 3.5 Flash-Lite -> Fast Vision & OCR (Image -> Structured Chunks)`);
  console.log(`Job 2: Gemma 4 26B           -> Socratic Tone & Voice Coach (Text -> Child Feedback)`);
  console.log(`======================================================================\n`);

  // Step 1: Fast Vision using Gemini 3.5 Flash-Lite
  console.log(`[Step 1] Running Gemini 3.5 Flash-Lite for Vision & Structured Chunks...`);
  const t0 = Date.now();
  const img1 = fs.readFileSync(path.join(fixturesDir, 'sample_page_1.jpg'));
  const visionRes = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [
      { inlineData: { mimeType: 'image/jpeg', data: img1.toString('base64') } },
      'Identify the main event in this Grade 2 book page in 2 sentences.',
    ],
  });
  const visionElapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const storyContext = visionRes.text.trim();
  console.log(`  ✅ Vision Complete (${visionElapsed}s):\n  "${storyContext}"\n`);

  // Step 2: Socratic Voice & Scaffolding using Gemma 4 26B (Text-only, no responseSchema)
  console.log(`[Step 2] Passing story context to Gemma 4 26B for Grade 2 Socratic Coach Role...`);
  const t1 = Date.now();
  const gemmaRes = await ai.models.generateContent({
    model: 'gemma-4-26b-a4b-it',
    contents: `
You are a warm, encouraging Grade 2 reading coach.
The child just read this scene:
"${storyContext}"

The child answered the question "Why was Dog Man sad?":
Child transcript: "because the nurse called his flowers slobbery and dirty"

Evaluate the child's answer:
1. Did they get the concept?
2. Give them warm, conversational spoken feedback (under 25 words).
Format as:
UNDERSTOOD: yes/no
FEEDBACK: <spoken response>
`.trim(),
  });
  const gemmaElapsed = ((Date.now() - t1) / 1000).toFixed(2);
  console.log(`  ✅ Gemma 4 Socratic Evaluation Complete (${gemmaElapsed}s):\n`);
  console.log(gemmaRes.text.trim());
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`Total Pipeline Time: ${(parseFloat(visionElapsed) + parseFloat(gemmaElapsed)).toFixed(2)}s`);
}

testSpecializedPipeline().catch(console.error);
