import { createServer } from '../server.js';

async function runSample() {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[SAMPLE] Testing POST /api/analyze-book at ${baseUrl}...`);

  try {
    // 1. Valid pages test
    const formData = new FormData();
    const fakeJpeg = new Blob(
      [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])],
      { type: 'image/jpeg' }
    );
    formData.append('images', fakeJpeg, 'leo_page_1.jpg');
    formData.append('images', fakeJpeg, 'leo_page_2.jpg');

    const resValid = await fetch(`${baseUrl}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });
    const validJson = await resValid.json();

    console.log(`[SAMPLE] Valid upload status: ${resValid.status}`);
    console.log(`[SAMPLE] Valid response:`, JSON.stringify(validJson, null, 2));

    if (resValid.status !== 200 || !validJson.is_legible || !Array.isArray(validJson.chunks)) {
      throw new Error('Valid upload sample failed assertion');
    }

    // 2. Blurry page rejection test
    const blurryData = new FormData();
    blurryData.append('images', fakeJpeg, 'blurry_page_1.jpg');

    const resBlurry = await fetch(`${baseUrl}/api/analyze-book`, {
      method: 'POST',
      body: blurryData,
    });
    const blurryJson = await resBlurry.json();

    console.log(`[SAMPLE] Blurry upload status: ${resBlurry.status}`);
    console.log(`[SAMPLE] Blurry response:`, JSON.stringify(blurryJson, null, 2));

    if (resBlurry.status !== 422 || blurryJson.is_legible !== false) {
      throw new Error('Blurry upload sample failed assertion');
    }

    console.log('✅ [SAMPLE PASS] Multimodal book analysis endpoint verified.');
  } finally {
    server.close();
  }
}

runSample().catch((err) => {
  console.error('Fatal sample test error:', err);
  process.exit(1);
});
