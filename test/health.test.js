import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('GET /api/health returns 200 and health status payload', async () => {
  const app = createServer();
  const server = app.listen(0);
  const address = server.address();
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'StoryReader');
    assert.ok(typeof data.timestamp === 'string');
    assert.ok(typeof data.uptime === 'number');
  } finally {
    server.close();
  }
});

test('GET /api/unknown-endpoint returns 404 JSON error payload', async () => {
  const app = createServer();
  const server = app.listen(0);
  const address = server.address();
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/unknown-endpoint`);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.error, 'Not Found');
    assert.equal(data.path, '/api/unknown-endpoint');
  } finally {
    server.close();
  }
});

test('GET /api/health includes CORS headers', async () => {
  const app = createServer();
  const server = app.listen(0);
  const address = server.address();
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'https://preview.trycloudflare.com' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  } finally {
    server.close();
  }
});
