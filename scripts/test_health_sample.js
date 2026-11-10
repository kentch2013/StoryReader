import { createServer } from '../server.js';

async function runSample() {
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[SAMPLE] Testing live HTTP connection to ${baseUrl}/api/health...`);

  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://preview.trycloudflare.com' },
    });
    const json = await res.json();

    console.log(`[SAMPLE] Status: ${res.status}`);
    console.log(`[SAMPLE] Access-Control-Allow-Origin: ${res.headers.get('access-control-allow-origin')}`);
    console.log(`[SAMPLE] Response Payload:`, JSON.stringify(json, null, 2));

    if (res.status === 200 && json.status === 'ok' && json.service === 'StoryReader') {
      console.log('✅ [SAMPLE PASS] Server foundation and health gateway verified.');
    } else {
      console.error('❌ [SAMPLE FAIL] Unexpected response');
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runSample().catch(err => {
  console.error('Fatal sample test error:', err);
  process.exit(1);
});
