import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRetryCommand,
  isRetryCommandFastPath,
  evaluateRetryWithNLI,
  splitTranscriptOnRetry,
} from '../services/voice_command_detector.js';

test('isRetryCommandFastPath detects common direct retry keywords (0ms fastpath)', () => {
  const directPhrases = [
    'retry',
    'try again',
    'try again please',
    'can i try again',
    'let me try again',
    'start over',
    'can i start over',
    'wait start over',
    'restart',
    'redo',
    'scratch that',
    'clear that',
    'erase that',
  ];

  for (const phrase of directPhrases) {
    const res = isRetryCommandFastPath(phrase);
    assert.equal(res.isRetry, true, `Expected "${phrase}" to be recognized as retry fastpath`);
  }
});

test('isRetryCommandFastPath rejects genuine story answers as non-retry', () => {
  const answers = [
    'The mother bunny will run after him because she loves him.',
    'She lived in the haymow in the barn.',
    'Rattles jumped onto Uncle Duane lap while he milked cows.',
    'He lost his red hat.',
    'I do not know.',
    'The dog chased the cat.',
  ];

  for (const answer of answers) {
    const res = isRetryCommandFastPath(answer);
    assert.equal(res.isRetry, false, `Expected "${answer}" NOT to be recognized as retry fastpath`);
  }
});

test('evaluateRetryWithNLI uses System 1 DeBERTa NLI to identify semantic retry variations', async () => {
  const semanticRetries = [
    'i made a mistake let me say that again',
    'wait erase what i just said',
    'hold on let me redo my answer',
    'no that is wrong i want to change it',
  ];

  for (const phrase of semanticRetries) {
    const res = await evaluateRetryWithNLI(phrase);
    assert.equal(res.isRetry, true, `Expected "${phrase}" to be classified as retry via NLI (entailment=${res.entailment})`);
    assert.ok(res.entailment >= 0.50, `Expected entailment >= 0.50, got ${res.entailment}`);
  }
});

test('evaluateRetryWithNLI rejects normal story answers with high contradiction or low entailment', async () => {
  const storyAnswers = [
    'She hopped into the vegetable garden to eat lettuce.',
    'His grandmother knitted him a blue and red hat.',
  ];

  for (const answer of storyAnswers) {
    const res = await evaluateRetryWithNLI(answer);
    assert.equal(res.isRetry, false, `Expected story answer "${answer}" NOT to be classified as retry via NLI`);
  }
});

test('detectRetryCommand integrates fastpath and System 1 NLI into a unified pipeline', async () => {
  // 1. Fastpath match
  const res1 = await detectRetryCommand('try again');
  assert.equal(res1.isRetry, true);
  assert.equal(res1.method, 'REGEX_FASTPATH');

  // 2. NLI semantic match
  const res2 = await detectRetryCommand('i made a mistake let me redo');
  assert.equal(res2.isRetry, true);
  assert.ok(res2.method === 'NLI_SYSTEM_ONE' || res2.method === 'REGEX_FASTPATH');

  // 3. Normal story speech
  const res3 = await detectRetryCommand('She lived in the barn with the hay.');
  assert.equal(res3.isRetry, false);
});

test('splitTranscriptOnRetry discards preceding text when a child changes their mind mid-utterance', () => {
  const sentence = 'she went into the kitchen wait no start over she lived in the barn';
  const split = splitTranscriptOnRetry(sentence);

  assert.equal(split.hasRetry, true);
  assert.equal(split.remainingTranscript, 'she lived in the barn');
});
