import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load .env from project root
dotenv.config({ path: path.join(projectRoot, '.env') });

// Explicitly disable mock to run against live Gemini API
delete process.env.MOCK_AI;

async function runLiveBookAnalysis() {
  const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');
  if (!fs.existsSync(fixturesDir)) {
    console.error('❌ Fixtures directory not found at:', fixturesDir);
    process.exit(1);
  }

  const sampleFiles = fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
    .sort();

  if (sampleFiles.length === 0) {
    console.error('❌ No image fixtures found in:', fixturesDir);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`StoryScout Live Multimodal Analysis Verification`);
  console.log(`======================================================`);
  console.log(`Model Target : ${process.env.GEMINI_MODEL || 'gemini-3.1-flash'}`);
  console.log(`API Key set  : ${Boolean(process.env.GEMINI_API_KEY)}`);
  console.log(`Found ${sampleFiles.length} sample page(s):`);
  sampleFiles.forEach((file, idx) => {
    const size = Math.round(fs.statSync(path.join(fixturesDir, file)).size / 1024);
    console.log(`  [${idx + 1}] ${file} (${size} KB)`);
  });

  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}/api/analyze-book`;

  try {
    console.log(`\n[1/2] Submitting all ${sampleFiles.length} pages to ${endpoint}...`);
    const formData = new FormData();

    for (const fileName of sampleFiles) {
      const filePath = path.join(fixturesDir, fileName);
      const buffer = fs.readFileSync(filePath);
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      formData.append('images', blob, fileName);
    }

    const startTime = Date.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const result = await res.json();

    console.log(`\n--- Response Received (${duration}s, HTTP ${res.status}) ---`);

    if (res.status === 200) {
      console.log(`✅ Status       : 200 OK`);
      console.log(`📖 Legible      : ${result.is_legible}`);
      console.log(`📚 Book Type    : ${result.book_type}`);
      console.log(`📝 Summary      : ${result.summary}\n`);
      console.log(`🧩 Chunks Generated (${(result.chunks || []).length}):`);

      (result.chunks || []).forEach((chunk) => {
        console.log(`\n  --------------------------------------------------`);
        console.log(`  Chunk #${chunk.chunk_id} (${chunk.page_range}) [${chunk.chunk_type}]`);
        console.log(`  👀 Lookout Prompt : "${chunk.lookout_prompt}"`);
        console.log(`  ❓ Check-in Q    : "${chunk.checkin_question}"`);
        console.log(`  🎯 Target Answer : "${chunk.target_answer_concept}"`);
        console.log(`  💡 Scaffold Hint : "${chunk.scaffold_hint}"`);
      });
      console.log(`  --------------------------------------------------\n`);
      console.log(`✅ [GATE 3 PASS] Digital book analysis completed successfully.`);
    } else if (res.status === 422) {
      console.log(`⚠️ Status       : 422 Unprocessable Content (Legibility Gate Triggered)`);
      console.log(`📖 Legible      : ${result.is_legible}`);
      console.log(`💬 Error Message: ${result.error_message}`);
    } else {
      console.error(`❌ Unexpected status ${res.status}:`, result);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Request error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runLiveBookAnalysis().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
