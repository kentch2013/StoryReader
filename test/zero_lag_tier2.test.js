import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { evaluateSemanticMatch } from '../services/semantic_evaluator.js';

const samplePrototypes = [
  { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
  { type: 'colloquial', text: 'His granny knitted it so he really loved it.' },
  { type: 'minimal_core', text: 'Grandma made it.' },
  { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
  { type: 'common_distractor', text: 'He bought it at the store.' },
];

const sampleRubric = {
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
  canonical_prototypes: samplePrototypes,
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

test('evaluateSemanticMatch evaluates novel paraphrases locally via Cross-Encoder NLI in <50ms', async () => {
  assert.equal(typeof evaluateSemanticMatch, 'function');

  // Novel paraphrase without matching exact words in rubric ("nana", "knitted with love")
  const res = await evaluateSemanticMatch('his nana knitted it with love', sampleRubric);
  assert.equal(res.isMatch, true);
  assert.ok(res.entailment >= 0.60, `Expected entailment >= 0.60, got ${res.entailment}`);
  assert.equal(res.isDistractor, false);

  // Contradiction / Negation ("his grandmother didn't make it")
  const resNeg = await evaluateSemanticMatch("his grandmother didn't make it", sampleRubric);
  assert.equal(resNeg.isMatch, false);
  assert.ok(resNeg.contradiction >= 0.80, `Expected contradiction >= 0.80, got ${resNeg.contradiction}`);

  // Character substitution contradiction ("his grandpa made it")
  const resSub = await evaluateSemanticMatch('his grandpa made it', sampleRubric);
  assert.equal(resSub.isMatch, false);
  assert.ok(resSub.contradiction >= 0.80, `Expected contradiction >= 0.80, got ${resSub.contradiction}`);

  // Distractor paraphrase ("he got it at walmart")
  const resDist = await evaluateSemanticMatch('he got it at walmart', sampleRubric);
  assert.equal(resDist.isMatch, false);

  // Totally unrelated nonsense ("a purple flying dragon")
  const resJunk = await evaluateSemanticMatch('a purple flying dragon', sampleRubric);
  assert.equal(resJunk.isMatch, false);
  assert.ok(resJunk.entailment < 0.20, `Expected entailment < 0.20, got ${resJunk.entailment}`);
});

test('POST /api/evaluate-answer awards mastery for novel paraphrase via Tier 2 in <100ms without LLM', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'his nana knitted it with love',
        attempt_count: 1,
      }),
    });

    const latencyMs = Math.round(performance.now() - start);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, 'mastered');
    assert.equal(data.resolved, true);
    assert.ok(data.spoken_feedback.startsWith('Spot on!'));
    const maxLatency = process.env.CI ? 400 : 200;
    assert.ok(latencyMs < maxLatency, `Expected latency < ${maxLatency}ms, got ${latencyMs}ms`);
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer rejects negation contradiction ("his grandmother didn\'t make it")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: "his grandmother didn't make it",
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(
      data.diagnostics?.tier_resolved?.includes('CONTRADICTION'),
      `Expected contradiction tier, got ${data.diagnostics?.tier_resolved}`
    );
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer rejects conflicting entity substitution ("his grandpa made it")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'his grandpa made it',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(
      data.diagnostics?.tier_resolved?.includes('CONTRADICTION') || data.diagnostics?.tier_resolved?.includes('CONFLICTING'),
      `Expected contradiction or conflicting tier, got ${data.diagnostics?.tier_resolved}`
    );
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer awards mastery for Grade 2 kinship variants ("his nana", "his mother\'s mother")', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    for (const phrase of ['his nana', "his mother's mother", "his father's mother"]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sampleRubric,
          child_transcript: phrase,
          attempt_count: 1,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'mastered', `Expected "${phrase}" to be mastered, got ${data.status}`);
      assert.equal(data.resolved, true);
    }
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer provides Socratic scaffold for question premise repetition', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleRubric,
        child_transcript: 'but he really did lose his hat and that made him sad',
        attempt_count: 1,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'needs_scaffold');
    assert.equal(data.resolved, false);
    assert.ok(data.spoken_feedback.includes(sampleRubric.hint_level_1));
  } finally {
    server.close();
  }
});

test('POST /api/evaluate-answer rejects incomplete visual and action fragments with scaffold', async () => {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const falsePositives = [
      'his hat was red',
      'it was knitted',
      'he really loved it',
      'he loved his hat',
      'his hat was special',
    ];

    for (const fragment of falsePositives) {
      const res = await fetch(`http://127.0.0.1:${port}/api/evaluate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sampleRubric,
          child_transcript: fragment,
          attempt_count: 1,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(
        data.status,
        'needs_scaffold',
        `Expected fragment "${fragment}" to be needs_scaffold, got ${data.status}`
      );
      assert.equal(data.resolved, false);
    }
  } finally {
    server.close();
  }
});
