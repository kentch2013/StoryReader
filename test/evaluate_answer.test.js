import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

const mockRubric = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
  keyword_clusters: [
    { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny'] },
    { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved'] },
  ],
  acceptable_phrasings: [
    'His grandma made it for him.',
    'It was special because his grandmother knitted it.',
  ],
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('POST /api/evaluate-answer returns 400 if required fields are missing', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child_transcript: 'his grandma',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer handles shrug ("i don\'t know") on Attempt 1 deterministically', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mockRubric,
        child_transcript: "I don't know",
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.equal(data.attempt_count, 1);
    assert.ok(data.spoken_feedback.includes(mockRubric.hint_level_1));
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer handles shrug or empty transcript on Attempt 2 with auto-reveal', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mockRubric,
        child_transcript: '',
        attempt_count: 2,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'off_track');
    assert.equal(data.resolved, true);
    assert.equal(data.attempt_count, 2);
    assert.ok(data.spoken_feedback.includes(mockRubric.target_answer_concept));
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards mastery on exact keyword cluster match despite speech fillers', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mockRubric,
        child_transcript: 'Um, like, his grandma made it and it was very special!',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
    assert.ok(data.spoken_feedback.startsWith('Spot on!'));
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards mastery on acceptable phrasing match', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mockRubric,
        child_transcript: 'His grandma made it for him',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer enforces brevity cap and bans negative words in feedback', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mockRubric,
        child_transcript: 'A purple flying elephant',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.spoken_feedback);

    const words = data.spoken_feedback.trim().split(/\s+/);
    assert.ok(words.length <= 25, `Feedback exceeds 25 words: ${words.length}`);

    const lower = data.spoken_feedback.toLowerCase();
    assert.ok(!lower.includes('wrong'), 'Feedback contains negative word "wrong"');
    assert.ok(!lower.includes('incorrect'), 'Feedback contains negative word "incorrect"');
    assert.ok(!lower.startsWith('no,'), 'Feedback starts with negative word "no,"');
  } finally {
    server.close();
  }
});
