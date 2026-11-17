import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('POST /api/detect-intent identifies direct voice retry keywords', async () => {
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/detect-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'try again' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isRetry, true);
    assert.equal(data.method, 'REGEX_FASTPATH');
  } finally {
    server.close();
  }
});

test('POST /api/detect-intent identifies semantic retry variations using NLI', async () => {
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/detect-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'i made a mistake let me say that again' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isRetry, true);
    assert.ok(data.confidence >= 0.50);
  } finally {
    server.close();
  }
});

test('POST /api/detect-intent returns isRetry false for normal story answers', async () => {
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/detect-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'His grandmother knitted him a blue and red hat.' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isRetry, false);
  } finally {
    server.close();
  }
});

test('POST /api/detect-intent handles empty or missing payload gracefully', async () => {
  const app = createServer();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/detect-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isRetry, false);
  } finally {
    server.close();
  }
});
