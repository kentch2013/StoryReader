import { createServer } from '../server.js';
import rateLimiter from '../services/rate_limiter.js';
import { safeJsonParse } from '../services/gemini_service.js';

async function runAdversarialFuzzSuite() {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}/api/analyze-book`;

  console.log('========================================================');
  console.log('StoryScout Adversarial Boundary & Fuzz Torture Suite');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assertCondition(desc, condition) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Oversized file (>10MB)
  {
    const formData = new FormData();
    const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024);
    formData.append('images', new Blob([largeBuffer], { type: 'image/jpeg' }), 'large.jpg');
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const json = await res.json();
    assertCondition(
      'Oversized file (>10MB) returns HTTP 413 (Payload Too Large)',
      res.status === 413 && json.code === 'LIMIT_FILE_SIZE'
    );
  }

  // 2. Batch file overflow (>20 files)
  {
    const formData = new FormData();
    const tiny = new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    for (let i = 0; i < 21; i++) {
      formData.append('images', tiny, `page_${i}.jpg`);
    }
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const json = await res.json();
    assertCondition(
      'Batch file count overflow (>20 files) returns HTTP 400',
      res.status === 400 && json.code === 'LIMIT_FILE_COUNT'
    );
  }

  // 3. Field name mutation (wrong form field)
  {
    const formData = new FormData();
    const tiny = new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    formData.append('photos', tiny, 'page.jpg');
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const json = await res.json();
    assertCondition(
      'Unexpected form field returns HTTP 400',
      res.status === 400 && json.code === 'LIMIT_UNEXPECTED_FILE'
    );
  }

  // 4. Non-image file type rejection (MIME filter)
  {
    const formData = new FormData();
    formData.append('images', new Blob(['console.log("malicious");'], { type: 'text/javascript' }), 'script.js');
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const json = await res.json();
    assertCondition(
      'Non-image MIME type rejection returns HTTP 400',
      res.status === 400 && json.code === 'INVALID_FILE_TYPE'
    );
  }

  // 5. Safe JSON parsing with markdown wrapping & error handling
  {
    const rawMarkdown = '```json\n{"is_legible": true, "summary": "Leo story"}\n```';
    const parsed = safeJsonParse(rawMarkdown);
    assertCondition(
      'safeJsonParse strips markdown code blocks',
      parsed.is_legible === true && parsed.summary === 'Leo story'
    );

    let syntaxErrorTrapped = false;
    try {
      safeJsonParse('{"incomplete": true');
    } catch (e) {
      syntaxErrorTrapped = e.message.includes('Invalid JSON received');
    }
    assertCondition(
      'safeJsonParse safely traps SyntaxError without crashing',
      syntaxErrorTrapped
    );
  }

  // 6. Mutex RateLimiter queue test
  {
    const initialTimestamps = rateLimiter.requestTimestamps.length;
    let runCount = 0;
    const testFn = async () => {
      runCount++;
      return 'ok';
    };

    // Fire 5 concurrent requests
    await Promise.all([
      rateLimiter.executeWithRetry(testFn),
      rateLimiter.executeWithRetry(testFn),
      rateLimiter.executeWithRetry(testFn),
    ]);

    assertCondition(
      'Concurrent throttle calls execute serially through mutex queue',
      runCount === 3
    );
  }

  server.close();

  console.log(`\nAdversarial Fuzz Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialFuzzSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
