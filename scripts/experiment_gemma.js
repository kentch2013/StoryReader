import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const gemmaModels = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'];

async function runGemmaExperiments() {
  console.log('================================================================');
  console.log('Gemma 4 Diagnostic Experiments: Isolate Capabilities & 503/500');
  console.log('================================================================\n');

  for (const model of gemmaModels) {
    console.log(`\n================================================`);
    console.log(`TESTING MODEL: ${model}`);
    console.log(`================================================`);

    // Trial 1: Pure text prompt (no images, no schema)
    console.log(`[Trial 1] Simple Text-Only Prompt...`);
    try {
      const t0 = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: 'You are a Grade 2 reading coach. In one sentence, say hello to a child.',
      });
      console.log(`  ✅ SUCCESS (${((Date.now() - t0)/1000).toFixed(2)}s):`, res.text.trim());
    } catch (e) {
      console.log(`  ❌ FAILED:`, e.message || e);
    }

    // Trial 2: Text-only WITH structured JSON (no image)
    console.log(`\n[Trial 2] Text-Only WITH responseMimeType="application/json" & Schema...`);
    try {
      const t0 = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: 'A boy named Leo lost his favorite knit hat in the park. Generate 1 Grade 2 question.',
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              question: { type: 'STRING' },
              target_concept: { type: 'STRING' },
            },
            required: ['question', 'target_concept'],
          },
        },
      });
      console.log(`  ✅ SUCCESS (${((Date.now() - t0)/1000).toFixed(2)}s):`, res.text.trim());
    } catch (e) {
      console.log(`  ❌ FAILED:`, e.message || e);
    }

    // Trial 3: Single Image (Vision Capability Check)
    console.log(`\n[Trial 3] Single Image Multimodal Input (Does Gemma support vision?)...`);
    try {
      const imgPath = path.join(projectRoot, 'test', 'fixtures', 'book_pages', 'sample_page_1.jpg');
      const imgBuffer = fs.readFileSync(imgPath);
      const t0 = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imgBuffer.toString('base64'),
            },
          },
          'What is visible in this image in one sentence?',
        ],
      });
      console.log(`  ✅ SUCCESS (${((Date.now() - t0)/1000).toFixed(2)}s):`, res.text.trim());
    } catch (e) {
      console.log(`  ❌ FAILED:`, e.message || e);
    }

    // Trial 4: Two Images with NO schema (Is it the schema or the payload size?)
    console.log(`\n[Trial 4] 2 Images with Plain Text Output (No JSON schema)...`);
    try {
      const img1 = fs.readFileSync(path.join(projectRoot, 'test', 'fixtures', 'book_pages', 'sample_page_1.jpg'));
      const img2 = fs.readFileSync(path.join(projectRoot, 'test', 'fixtures', 'book_pages', 'sample_page_2.jpg'));
      const t0 = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: img1.toString('base64') } },
          { inlineData: { mimeType: 'image/jpeg', data: img2.toString('base64') } },
          'Briefly summarize these pages.',
        ],
      });
      console.log(`  ✅ SUCCESS (${((Date.now() - t0)/1000).toFixed(2)}s):`, res.text.trim());
    } catch (e) {
      console.log(`  ❌ FAILED:`, e.message || e);
    }
  }
}

runGemmaExperiments().catch(console.error);
