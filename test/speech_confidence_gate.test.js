import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { SafariAudioManager, AUDIO_STATE } from '../public/js/audio_manager.js';

test('Speech Confidence Gate: intercepts low-confidence muffled audio as a free microturn', async () => {
  const payload = {
    child_transcript: 'grumbled mumble',
    speech_confidence: 0.25,
    checkin_question: 'Who made Leo\'s warm hat?',
    attempt_count: 1,
    keyword_clusters: [{ name: 'actor', synonyms: ['grandma'] }],
  };

  const result = await evaluateChildAnswer(payload);
  assert.equal(result.status, 'needs_scaffold');
  assert.equal(result.is_microturn, true);
  assert.equal(result.attempt_count, 1);
  assert.match(result.spoken_feedback, /didn't quite catch that|speak a little louder|say that again/i);
  assert.equal(result.diagnostics.cognitive_diagnosis, 'LOW_SPEECH_CONFIDENCE');
  assert.equal(result.diagnostics.tier_resolved, 'SPEECH_CONFIDENCE_MICROTURN');
});

test('Speech Confidence Gate: high confidence and missing confidence proceed directly to evaluation', async () => {
  const basePayload = {
    child_transcript: 'his grandma',
    checkin_question: 'Who made Leo\'s warm hat?',
    attempt_count: 1,
    canonical_prototypes: [
      { type: 'minimal_core', text: 'his grandma' },
    ],
  };

  // 1. High confidence (>= 0.40)
  const highConfResult = await evaluateChildAnswer({
    ...basePayload,
    speech_confidence: 0.88,
  });
  assert.equal(highConfResult.status, 'mastered');
  assert.equal(highConfResult.is_microturn, false);

  // 2. Missing confidence (undefined)
  const nullConfResult = await evaluateChildAnswer({
    ...basePayload,
  });
  assert.equal(nullConfResult.status, 'mastered');
  assert.equal(nullConfResult.is_microturn, false);

  // 3. Zero confidence (0)
  const zeroConfResult = await evaluateChildAnswer({
    ...basePayload,
    speech_confidence: 0,
  });
  assert.equal(zeroConfResult.status, 'mastered');
  assert.equal(zeroConfResult.is_microturn, false);
});

test('Speech Confidence Gate: second consecutive low-confidence turn bypasses microturn to prevent child trap', async () => {
  const payload = {
    child_transcript: 'his grandma',
    speech_confidence: 0.22,
    microturn_used: true, // Already had a microturn
    consecutive_microturns: 1,
    checkin_question: 'Who made Leo\'s warm hat?',
    attempt_count: 1,
    canonical_prototypes: [
      { type: 'minimal_core', text: 'his grandma' },
    ],
  };

  const result = await evaluateChildAnswer(payload);
  // Must NOT trigger another microturn; evaluates transcript
  assert.equal(result.is_microturn, false);
  assert.equal(result.status, 'mastered');
});

test('SafariAudioManager: captures and returns speech recognition confidence', async () => {
  let mockResultHandler = null;
  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'en-US';
    }
    start() {}
    stop() {}
    abort() {}
    set onresult(fn) {
      mockResultHandler = fn;
    }
    get onresult() {
      return mockResultHandler;
    }
  }

  const manager = new SafariAudioManager({
    SpeechRecognition: MockSpeechRecognition,
  });
  await manager.unlock();

  let transcriptEvent = null;
  await manager.startListening({
    onTranscript: (data) => {
      transcriptEvent = data;
    },
  });

  // Simulate Web Speech result event with confidence score
  mockResultHandler({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: 'his grandma', confidence: 0.85 }], { isFinal: true }),
    ],
  });

  assert.ok(transcriptEvent);
  assert.equal(transcriptEvent.full, 'his grandma');
  assert.equal(transcriptEvent.confidence, 0.85);

  const stopResult = await manager.stopListening();
  assert.equal(stopResult.transcript, 'his grandma');
  assert.equal(stopResult.confidence, 0.85);
});
