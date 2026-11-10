import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('POST /api/analyze-book returns 200 and structured chunk schema for valid book pages', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const fakeJpeg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])], {
      type: 'image/jpeg',
    });
    formData.append('images', fakeJpeg, 'page_1.jpg');
    formData.append('images', fakeJpeg, 'page_2.jpg');

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.is_legible, true);
    assert.ok(data.book_type === 'fiction' || data.book_type === 'nonfiction');
    assert.ok(typeof data.summary === 'string' && data.summary.length > 0);
    assert.ok(Array.isArray(data.chunks) && data.chunks.length > 0);

    const firstChunk = data.chunks[0];
    assert.ok(typeof firstChunk.chunk_id === 'number');
    assert.ok(typeof firstChunk.page_range === 'string');
    assert.ok(firstChunk.chunk_type === 'scene' || firstChunk.chunk_type === 'page');
    assert.ok(typeof firstChunk.lookout_prompt === 'string' && firstChunk.lookout_prompt.length > 0);
    assert.ok(typeof firstChunk.checkin_question === 'string' && firstChunk.checkin_question.length > 0);
    assert.ok(typeof firstChunk.target_answer_concept === 'string' && firstChunk.target_answer_concept.length > 0);
    assert.ok(typeof firstChunk.scaffold_hint === 'string' && firstChunk.scaffold_hint.length > 0);
  } finally {
    server.close();
  }
});

test('POST /api/analyze-book returns 400 Bad Request when no images are provided', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('POST /api/analyze-book returns 422 Unprocessable Content when book page is illegible', async () => {
  process.env.MOCK_AI = 'true';
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const formData = new FormData();
    const fakeJpeg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    formData.append('images', fakeJpeg, 'blurry_page.jpg');

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-book`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 422);
    const data = await res.json();
    assert.equal(data.is_legible, false);
    assert.ok(typeof data.error_message === 'string' && data.error_message.length > 0);
  } finally {
    server.close();
  }
});
