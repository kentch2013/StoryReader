import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  analyzeBookPages,
  clearBookAnalysisCache,
  auditChunkPedagogy,
  offsetPageRange,
  computeBookCacheKey,
} from '../services/gemini_service.js';
import bookRoutes from '../routes/book_routes.js';

test('Task 2.1: Cache hit/miss tracks _cacheHit and clearBookAnalysisCache() resets cache', async () => {
  clearBookAnalysisCache();

  const mockFile1 = {
    originalname: 'page1.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('mock-image-data-page-1-leo-adventure'),
  };
  const mockFile2 = {
    originalname: 'page2.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('mock-image-data-page-2-leo-adventure'),
  };
  const files = [mockFile1, mockFile2];

  // Call 1: Cache Miss
  const res1 = await analyzeBookPages(files);
  assert.equal(res1.is_legible, true);
  assert.equal(res1._cacheHit, false, 'First call must be a cache miss (_cacheHit: false)');

  // Call 2: Cache Hit
  const res2 = await analyzeBookPages(files);
  assert.equal(res2.is_legible, true);
  assert.equal(res2._cacheHit, true, 'Second call with identical buffers must be a cache hit (_cacheHit: true)');
  assert.equal(res2.chunks.length, res1.chunks.length);

  // Clear cache and call again: Cache Miss
  clearBookAnalysisCache();
  const res3 = await analyzeBookPages(files);
  assert.equal(res3._cacheHit, false, 'Call after clearBookAnalysisCache() must be a cache miss');

  // DISABLE_BOOK_CACHE bypass test
  const prevEnv = process.env.DISABLE_BOOK_CACHE;
  try {
    process.env.DISABLE_BOOK_CACHE = 'true';
    const res4 = await analyzeBookPages(files);
    assert.equal(res4._cacheHit, false);
    const res5 = await analyzeBookPages(files);
    assert.equal(res5._cacheHit, false, 'When DISABLE_BOOK_CACHE=true, cache is bypassed');
  } finally {
    process.env.DISABLE_BOOK_CACHE = prevEnv;
    clearBookAnalysisCache();
  }
});

test('Task 2.1: POST /api/analyze-book sets X-Analysis-Cache header (MISS then HIT)', async () => {
  clearBookAnalysisCache();

  const app = express();
  app.use('/api', bookRoutes);

  // Helper to simulate multipart POST /api/analyze-book using supertest-like mock or direct invocation
  // Creating a boundary multipart payload manually
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const fileContent = 'test-book-page-payload';
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="page1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    Buffer.from(fileContent),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // Request 1
    const res1 = await fetch(`http://localhost:${port}/api/analyze-book`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('X-Analysis-Cache'), 'MISS');
    const json1 = await res1.json();
    assert.equal(json1.is_legible, true);

    // Request 2 (identical payload)
    const res2 = await fetch(`http://localhost:${port}/api/analyze-book`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('X-Analysis-Cache'), 'HIT');
  } finally {
    server.close();
    clearBookAnalysisCache();
  }
});

test('Task 2.2: Batching guard splits >6 pages into sequential batches and merges chunks in order', async () => {
  clearBookAnalysisCache();

  // Create 8 distinct mock page files (exceeds the 6-page ceiling)
  const mockPages = [];
  for (let i = 1; i <= 8; i++) {
    mockPages.push({
      originalname: `page_${i}.jpg`,
      mimetype: 'image/jpeg',
      buffer: Buffer.from(`unique-book-content-for-page-${i}-${Date.now()}`),
    });
  }

  const analysis = await analyzeBookPages(mockPages);

  assert.equal(analysis.is_legible, true);
  assert.ok(Array.isArray(analysis.chunks), 'Analysis chunks should be an array');
  // In mock mode, each batch of files produces 2 chunks (Pages 1-2, Pages 3-4).
  // Batch 1 (pages 1-6) produces 2 chunks: Pages 1-2, Pages 3-4.
  // Batch 2 (pages 7-8) produces 2 chunks with offset +6: Pages 7-8, Pages 9-10.
  // Total merged chunks: 4 chunks.
  assert.equal(analysis.chunks.length, 4, '8 pages split across 6+2 batches should produce 4 merged chunks in mock mode');

  // Verify contiguous chunk_ids: 1, 2, 3, 4
  analysis.chunks.forEach((chunk, index) => {
    assert.equal(chunk.chunk_id, index + 1, `Chunk index ${index} should have chunk_id ${index + 1}`);
  });

  // Verify accurate page_range offset adjustment
  assert.equal(analysis.chunks[0].page_range, 'Pages 1-2');
  assert.equal(analysis.chunks[1].page_range, 'Pages 3-4');
  assert.equal(analysis.chunks[2].page_range, 'Pages 7-8');
  assert.equal(analysis.chunks[3].page_range, 'Pages 9-10');

  // Verify offsetPageRange helper directly
  assert.equal(offsetPageRange('Pages 1-2', 6), 'Pages 7-8');
  assert.equal(offsetPageRange('Page 1', 6), 'Page 7');
  assert.equal(offsetPageRange('Pages 3-4', 12), 'Pages 15-16');
  assert.equal(offsetPageRange('Pages 1-2', 0), 'Pages 1-2');
});

test('Task 2.3: auditChunkPedagogy catches deliberate lookout spoiler leaks', () => {
  // Deliberate leak: lookout prompt leaks "knitted" and "warm" from target concept
  const leakyChunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    question_type: 'wh_causality',
    lookout_prompt: 'Before you read, watch for the warm knitted hat in the yard.',
    checkin_question: 'Why did Leo get upset when his hat blew away?',
    target_answer_concept: 'He was upset because his grandma knitted the warm hat for him.',
    entity_graph: {
      characters: [{ canonical_name: 'Leo' }],
    },
  };

  const audit = auditChunkPedagogy(leakyChunk);
  assert.equal(audit.spoiler_leak, true, 'Should detect >= 2 shared content words as a spoiler leak');
  assert.equal(audit.passed, false, 'Leaky chunk must not pass audit');
  assert.ok(audit.shared_words.includes('warm'));
  assert.ok(audit.shared_words.includes('knitted'));
});

test('Task 2.3: auditChunkPedagogy flags visual trivia questions unless observable_visual', () => {
  // Trivia question with wh_causality -> is_trivia_only: true
  const triviaChunk = {
    chunk_id: 1,
    page_range: 'Pages 1-2',
    question_type: 'wh_causality',
    lookout_prompt: 'Before you read, look at the big red barn.',
    checkin_question: 'What color was the barn?',
    target_answer_concept: 'The barn was painted red.',
    entity_graph: { characters: [] },
  };

  const audit1 = auditChunkPedagogy(triviaChunk);
  assert.equal(audit1.is_trivia_only, true, 'What color question with wh_causality must be flagged as trivia_only');
  assert.equal(audit1.passed, false);

  // Same question with observable_visual -> is_trivia_only: false
  const visualChunk = {
    ...triviaChunk,
    question_type: 'observable_visual',
  };
  const audit2 = auditChunkPedagogy(visualChunk);
  assert.equal(audit2.is_trivia_only, false, 'Observable visual questions are permitted to ask what color');
  assert.equal(audit2.passed, true);
});

test('Task 2.3: auditChunkPedagogy enforces brevity limits and passes clean Rattles chunk', () => {
  // Clean Rattles causal chunk
  const cleanChunk = {
    chunk_id: 4,
    page_range: 'Pages 4-5',
    question_type: 'wh_causality',
    checkin_question: 'Why was the kitten named Rattles?',
    lookout_prompt: 'Before you read, listen for the special noise the kitten makes.',
    target_answer_concept: 'She purred so loudly and strongly that it sounded like a rattle.',
    entity_graph: {
      characters: [{ canonical_name: 'Rattles', aliases: ['kitty'] }],
    },
  };

  const audit = auditChunkPedagogy(cleanChunk);
  assert.equal(audit.spoiler_leak, false);
  assert.equal(audit.is_trivia_only, false);
  assert.equal(audit.word_count_ok, true);
  assert.equal(audit.passed, true);

  // Word count overflow test (>15 words in question)
  const longQuestionChunk = {
    ...cleanChunk,
    checkin_question: 'Why did the little kitten get named Rattles by Uncle Duane when she was purring very loudly on his lap?',
  };
  const auditLong = auditChunkPedagogy(longQuestionChunk);
  assert.equal(auditLong.word_count_ok, false, 'Questions with >15 words must fail word_count_ok');
  assert.equal(auditLong.passed, false);
});
