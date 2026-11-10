import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { safeJsonParse } from '../services/gemini_service.js';

test('POST /api/analyze-book returns 413 Payload Too Large when image exceeds 10MB limit', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024);
    formData.append('images', new Blob([largeBuffer], { type: 'image/jpeg' }), 'large.jpg');

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.code, 'LIMIT_FILE_SIZE');
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('POST /api/analyze-book returns 400 Bad Request when upload exceeds 20 files limit', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const tinyJpeg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    for (let i = 0; i < 21; i++) {
      formData.append('images', tinyJpeg, `page_${i}.jpg`);
    }

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'LIMIT_FILE_COUNT');
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('POST /api/analyze-book returns 400 Bad Request when form field name is unexpected', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const tinyJpeg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    formData.append('photos', tinyJpeg, 'page.jpg');

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'LIMIT_UNEXPECTED_FILE');
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('POST /api/analyze-book returns 400 Bad Request when non-image MIME type is submitted', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const textBlob = new Blob(['Not a book page'], { type: 'text/plain' });
    formData.append('images', textBlob, 'notes.txt');

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'INVALID_FILE_TYPE');
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('safeJsonParse strips markdown code blocks and handles syntax errors safely', () => {
  assert.ok(typeof safeJsonParse === 'function', 'safeJsonParse should be exported');

  // Test standard JSON
  const valid = safeJsonParse('{"is_legible": true}');
  assert.deepEqual(valid, { is_legible: true });

  // Test markdown-wrapped JSON
  const markdownWrapped = safeJsonParse('```json\n{"is_legible": true, "summary": "Leo"}\n```');
  assert.deepEqual(markdownWrapped, { is_legible: true, summary: 'Leo' });

  // Test truncated or invalid JSON
  assert.throws(() => {
    safeJsonParse('{"is_legible": true, "summary": "unterminated');
  }, /Invalid JSON received from model/);
});
