import test from 'node:test';
import assert from 'node:assert/strict';
import {
  doubleMetaphone,
  matchPhoneticKeyword,
  normalizeChildPhonetics,
} from '../services/phonetic_matcher.js';
import { scoreMultiReference } from '../services/rubric_matcher.js';

test('Double Metaphone: encodes standard words and child phonological variants into dual codes', () => {
  const [grandmaPri, grandmaSec] = doubleMetaphone('grandma');
  const [grammaPri, grammaSec] = doubleMetaphone('gramma');
  assert.ok(
    grandmaPri === grammaPri || grandmaSec === grammaSec || grandmaPri === grammaSec || grandmaSec === grammaPri,
    `grandma (${grandmaPri}/${grandmaSec}) and gramma (${grammaPri}/${grammaSec}) must share at least one phonetic code`
  );

  const [friendPri, friendSec] = doubleMetaphone('friend');
  const [frenPri, frenSec] = doubleMetaphone('fren');
  assert.ok(
    friendPri === frenPri || friendSec === frenSec || friendPri === frenSec || friendSec === frenPri,
    `friend (${friendPri}/${friendSec}) and fren (${frenPri}/${frenSec}) must share at least one phonetic code`
  );

  const [rabbitPri, rabbitSec] = doubleMetaphone('rabbit');
  const [wabbitPri, wabbitSec] = doubleMetaphone('wabbit');
  assert.ok(
    rabbitPri === wabbitPri || rabbitSec === wabbitSec || rabbitPri === wabbitSec || rabbitSec === wabbitPri,
    `rabbit (${rabbitPri}/${rabbitSec}) and child gliding wabbit (${wabbitPri}/${wabbitSec}) must share a code`
  );

  const [runningPri, runningSec] = doubleMetaphone('running');
  const [runninPri, runninSec] = doubleMetaphone('runnin');
  assert.ok(
    runningPri === runninPri && runningSec === runninSec,
    'running and runnin must match identical phonetic codes'
  );

  // Minimal pair and distinct word protection
  const [catPri] = doubleMetaphone('cat');
  const [hatPri] = doubleMetaphone('hat');
  assert.notEqual(catPri, hatPri, 'cat and hat must NOT share primary phonetic codes');

  const [dogPri] = doubleMetaphone('dog');
  const [frogPri] = doubleMetaphone('frog');
  assert.notEqual(dogPri, frogPri, 'dog and frog must NOT share phonetic codes');
});

test('matchPhoneticKeyword: matches slur-affected child tokens against target keywords with dual constraints', () => {
  const targets = ['grandma', 'friend', 'running', 'rabbit'];

  assert.equal(matchPhoneticKeyword('gramma', targets), 'grandma');
  assert.equal(matchPhoneticKeyword('fren', targets), 'friend');
  assert.equal(matchPhoneticKeyword('wabbit', targets), 'rabbit');
  assert.equal(matchPhoneticKeyword('runnin', targets), 'running');

  // Short words (<= 3 chars) are protected and require exact equality
  assert.equal(matchPhoneticKeyword('cat', ['hat', 'bat']), null);
  assert.equal(matchPhoneticKeyword('dog', ['frog', 'fog']), null);

  // Distractor collision guard
  const targetsWithDistractor = ['grandpa'];
  const distractorKeywords = ['grandma'];
  // Token 'gramma' phonetically matches distractor 'grandma', so it must NOT project to target 'grandpa'
  assert.equal(
    matchPhoneticKeyword('gramma', targetsWithDistractor, { distractors: distractorKeywords }),
    null
  );
});

test('normalizeChildPhonetics: normalizes transcript utterances and elevates Tier 1 fastpath hit rate', () => {
  const keywordClusters = [
    { name: 'actor', synonyms: ['grandma', 'grandmother', 'nana'] },
    { name: 'action', synonyms: ['knitted', 'made'] },
  ];

  const rawTranscript = 'his gramma made it';
  const normalized = normalizeChildPhonetics(rawTranscript, keywordClusters);
  assert.equal(normalized, 'his grandma made it');

  // Multi-reference prototype matching on normalized child utterance
  const prototypes = [
    { type: 'minimal_core', text: 'his grandma' },
    { type: 'common_distractor', text: 'his grandpa' },
  ];

  const result = scoreMultiReference(normalized, prototypes);
  assert.equal(result.matched, true);
  assert.equal(result.isDistractor, false);
  assert.equal(result.prototypeType, 'minimal_core');

  // Latency benchmark: normalization must execute in <= 0.5ms
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    normalizeChildPhonetics('his fren was runnin with the wabbit', [
      { name: 'actor', synonyms: ['friend'] },
      { name: 'action', synonyms: ['running'] },
      { name: 'target', synonyms: ['rabbit'] },
    ]);
  }
  const avgDurationMs = (performance.now() - start) / 100;
  assert.ok(avgDurationMs < 0.5, `Execution latency (${avgDurationMs}ms) must be <= 0.5ms`);
});
