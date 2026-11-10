import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { BOOK_ANALYSIS_SYSTEM_PROMPT, BOOK_ANALYSIS_SCHEMA } from '../prompts/book_analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

// Test with 2 sequential sample pages
const sampleFiles = ['sample_page_1.jpg', 'sample_page_2.jpg'];
const contents = sampleFiles.map((fileName) => {
  const filePath = path.join(fixturesDir, fileName);
  const buffer = fs.readFileSync(filePath);
  return {
    inlineData: {
      mimeType: 'image/jpeg',
      data: buffer.toString('base64'),
    },
  };
});
contents.push('Analyze these book pages in sequence according to Grade 2 reading standards.');

const candidateModels = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B IT (A4B)' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B IT' },
];

async function runBenchmark() {
  console.log(`======================================================================`);
  console.log(`StoryScout 4-Model Head-to-Head Benchmark`);
  console.log(`Target Models: 3.1 Flash-Lite | 3.5 Flash-Lite | Gemma 4 26B | Gemma 4 31B`);
  console.log(`Input        : 2 real camera pages (${sampleFiles.join(', ')})`);
  console.log(`Metrics      : Latency, OCR & Character Recognition, Grade 2 Pedagogy,`);
  console.log(`               Chunk Segmentation, and Schema Compliance.`);
  console.log(`======================================================================\n`);

  const results = [];

  for (const candidate of candidateModels) {
    console.log(`>>> Running [${candidate.label}] (${candidate.id})...`);
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: candidate.id,
        contents,
        config: {
          systemInstruction: BOOK_ANALYSIS_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: BOOK_ANALYSIS_SCHEMA,
        },
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      const parsed = JSON.parse(response.text);

      const recognizedDogMan = /dog\s*man/i.test(response.text);
      const recognizedPetey = /petey/i.test(response.text);

      results.push({
        id: candidate.id,
        label: candidate.label,
        status: 'SUCCESS',
        latencySec: parseFloat(elapsed),
        bookType: parsed.book_type,
        chunksCount: (parsed.chunks || []).length,
        recognizedCharacters: `${recognizedDogMan ? 'Dog Man ✅' : 'Dog Man ❌'} | ${recognizedPetey ? 'Petey ✅' : 'Petey ❌'}`,
        summary: parsed.summary,
        sampleChunk: parsed.chunks?.[0] || null,
        error: null,
      });

      console.log(`    ✅ SUCCESS in ${elapsed}s | Chunks: ${(parsed.chunks || []).length}`);
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      results.push({
        id: candidate.id,
        label: candidate.label,
        status: 'FAILED',
        latencySec: parseFloat(elapsed),
        error: err.message || String(err),
      });
      console.log(`    ❌ FAILED in ${elapsed}s: ${err.message || err}`);
    }
    console.log(`----------------------------------------------------------------------\n`);
  }

  console.log(`\n======================================================================`);
  console.log(`BENCHMARK SUMMARY & METRICS`);
  console.log(`======================================================================`);
  console.log(JSON.stringify(results, null, 2));
}

runBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
