import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { analyzeBookPages } from '../services/gemini_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
delete process.env.MOCK_AI;

async function runBunnyAnalysis() {
  const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');
  const filesToLoad = [];

  for (let i = 1; i <= 10; i++) {
    const fileName = `bunny${i}.png`;
    const filePath = path.join(fixturesDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    filesToLoad.push({
      buffer,
      mimetype: 'image/png',
      originalname: fileName,
    });
  }

  console.log(`Loaded ${filesToLoad.length} bunny screenshots:`);
  filesToLoad.forEach((f, idx) => {
    console.log(`  [${idx + 1}] ${f.originalname} (${Math.round(f.buffer.length / 1024)} KB)`);
  });

  console.log('\nInvoking analyzeBookPages via Gemini...');
  const t0 = Date.now();
  const analysis = await analyzeBookPages(filesToLoad);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(`Analysis complete in ${elapsed}s.\n`);

  const outputPath = path.join(projectRoot, 'test_output', 'bunny_10_pages_analysis.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf8');
  console.log(`Saved raw analysis JSON to ${outputPath}\n`);

  console.log('======================================================================');
  console.log('STORY ANALYSIS RESULTS: "THE RUNAWAY BUNNY" (10 PAGES)');
  console.log('======================================================================');
  console.log(`Legible   : ${analysis.is_legible}`);
  console.log(`Book Type : ${analysis.book_type}`);
  console.log(`Summary   : ${analysis.summary}`);
  console.log(`\nTotal Reading Chunks: ${(analysis.chunks || []).length}\n`);

  (analysis.chunks || []).forEach((chunk) => {
    console.log(`----------------------------------------------------------------------`);
    console.log(`CHUNK #${chunk.chunk_id}: ${chunk.page_range} (${chunk.chunk_type || 'scene'})`);
    console.log(`Question Type : ${chunk.question_type}`);
    console.log(`👀 Lookout    : "${chunk.lookout_prompt}"`);
    console.log(`❓ Question   : "${chunk.checkin_question}"`);
    console.log(`🎯 Target     : "${chunk.target_answer_concept}"`);
    console.log(`🔑 Keywords   :`, JSON.stringify(chunk.keyword_clusters));
    console.log(`🗣️ Examples   :`, JSON.stringify(chunk.acceptable_phrasings));
    console.log(`💡 Scaffold   : "${chunk.scaffold_hint}"`);
    if (chunk.diagnostic_probes) {
      console.log(`🩺 Diagnostic Probes:`);
      for (const [key, val] of Object.entries(chunk.diagnostic_probes)) {
        console.log(`   - [${key}]: ${val.hypothesis} -> ${val.feedback || val.scaffold}`);
      }
    }
    console.log(`----------------------------------------------------------------------\n`);
  });
}

runBunnyAnalysis().catch((err) => {
  console.error('Analysis error:', err);
  process.exit(1);
});
