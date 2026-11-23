import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateChildAnswer,
  isEligibleForCloudEscalation,
} from '../services/answer_evaluator.js';
import { SafariAudioManager } from '../public/js/audio_manager.js';
import { CloudCircuitBreaker } from '../services/connectivity_circuit_breaker.js';

test('Task 1.1: isEligibleForCloudEscalation correctly filters filler-only tokens', () => {
  assert.equal(isEligibleForCloudEscalation('haymow'), true);
  assert.equal(isEligibleForCloudEscalation('to hide'), true);
  assert.equal(isEligibleForCloudEscalation('um idk'), false);
  assert.equal(isEligibleForCloudEscalation(''), false);

  // Additional edge cases
  assert.equal(isEligibleForCloudEscalation('   '), false);
  assert.equal(isEligibleForCloudEscalation(null), false);
  assert.equal(isEligibleForCloudEscalation("I don't know"), false);
  assert.equal(isEligibleForCloudEscalation('uhh nothing pass'), false);
  assert.equal(isEligibleForCloudEscalation('the barn'), true);
  assert.equal(isEligibleForCloudEscalation('loud purr'), true);
  assert.equal(isEligibleForCloudEscalation('Linda and Michelle'), true);
});

test('Task 1.2: transcript_alternatives rescues garbled primary transcript with index 1 alternative', async () => {
  const payload = {
    child_transcript: 'she heard a bird',
    transcript_alternatives: ['she heard a bird', 'she purred loud', 'she heard loud'],
    checkin_question: 'Why was the kitten named Rattles?',
    target_answer_concept: 'She purred so loudly and strongly that it sounded like a rattle.',
    canonical_prototypes: [
      { type: 'colloquial', text: 'she purred loud' },
      { type: 'formal_full', text: 'Because her purr was so loud it sounded like a rattle.' },
    ],
    keyword_clusters: [
      { concept_name: 'action', synonyms: ['purred', 'purr', 'purred loud'] },
    ],
    acceptable_phrasings: ['she purred loud'],
    attempt_count: 1,
  };

  const result = await evaluateChildAnswer(payload);

  assert.equal(result.status, 'mastered');
  assert.equal(result.resolved, true);
  assert.equal(result.diagnostics.matched_alternative_index, 1);
});

test('Task 1.2: Primary transcript match sets matched_alternative_index to 0', async () => {
  const payload = {
    child_transcript: 'she purred loud',
    transcript_alternatives: ['she purred loud', 'she bird loud'],
    checkin_question: 'Why was the kitten named Rattles?',
    target_answer_concept: 'She purred so loudly and strongly that it sounded like a rattle.',
    canonical_prototypes: [
      { type: 'colloquial', text: 'she purred loud' },
    ],
    attempt_count: 1,
  };

  const result = await evaluateChildAnswer(payload);

  assert.equal(result.status, 'mastered');
  assert.equal(result.resolved, true);
  assert.equal(result.diagnostics.matched_alternative_index, 0);
});

test('Task 1.2: SafariAudioManager.stopListening() returns alternatives array while preserving backward compatibility', async () => {
  // Mock SpeechRecognition with maxAlternatives support
  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'en-US';
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onend = null;
    }
    start() {}
    stop() {
      if (this.onend) this.onend();
    }
    abort() {}
  }

  const manager = new SafariAudioManager({
    SpeechRecognition: MockSpeechRecognition,
  });

  await manager.startListening();

  // Simulate Web Speech result event with 3 alternatives
  const mockResult = [
    { transcript: 'she bird loud', confidence: 0.65 },
    { transcript: 'she purred loud', confidence: 0.62 },
    { transcript: 'she heard loud', confidence: 0.58 },
  ];
  mockResult.isFinal = true;

  const mockEvent = {
    results: [mockResult],
    resultIndex: 0,
  };

  manager._activeRecognition.onresult(mockEvent);

  const stopResult = await manager.stopListening();

  // Backward compatibility checks
  assert.equal(typeof stopResult.transcript, 'string');
  assert.equal(stopResult.transcript, 'she bird loud');
  assert.equal(stopResult.confidence, 0.65);

  // New alternatives property
  assert.ok(Array.isArray(stopResult.alternatives));
  assert.equal(stopResult.alternatives.length, 3);
  assert.equal(stopResult.alternatives[0], 'she bird loud');
  assert.equal(stopResult.alternatives[1], 'she purred loud');
  assert.equal(stopResult.alternatives[2], 'she heard loud');
});

test('Task 1.3: CloudCircuitBreaker.getStats() tracks calls, successes, timeouts, circuitOpenSkips, and reset()', async () => {
  const breaker = new CloudCircuitBreaker({
    timeoutMs: 50,
    maxFailures: 2,
    coolDownMs: 10000,
    name: 'TestBreaker',
  });

  // Verify initial stats
  const initialStats = breaker.getStats();
  assert.equal(initialStats.calls, 0);
  assert.equal(initialStats.successes, 0);
  assert.equal(initialStats.timeouts, 0);
  assert.equal(initialStats.failures, 0);
  assert.equal(initialStats.circuitOpenSkips, 0);
  assert.equal(initialStats.state, 'CLOSED');
  assert.equal(initialStats.failureCount, 0);

  // 1. Successful execution
  await breaker.execute(async () => 'ok');
  const statsAfterSuccess = breaker.getStats();
  assert.equal(statsAfterSuccess.calls, 1);
  assert.equal(statsAfterSuccess.successes, 1);
  assert.equal(statsAfterSuccess.failures, 0);

  // 2. Timeout execution (abort)
  await breaker.execute(async (signal) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve('late'), 100);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  const statsAfterTimeout = breaker.getStats();
  assert.equal(statsAfterTimeout.calls, 2);
  assert.equal(statsAfterTimeout.timeouts, 1);
  assert.equal(statsAfterTimeout.failureCount, 1);

  // 3. Second failure to trip the circuit to OPEN
  await breaker.execute(async () => {
    throw new Error('Network error');
  });

  const statsAfterTrip = breaker.getStats();
  assert.equal(statsAfterTrip.calls, 3);
  assert.equal(statsAfterTrip.failures, 1);
  assert.equal(statsAfterTrip.state, 'OPEN');

  // 4. Circuit is open -> short circuits execution (circuitOpenSkips)
  const fallbackVal = await breaker.execute(
    async () => 'never_called',
    (reason) => `fallback:${reason}`
  );
  assert.equal(fallbackVal, 'fallback:OFFLINE_OR_CIRCUIT_OPEN');

  const statsAfterSkip = breaker.getStats();
  assert.equal(statsAfterSkip.calls, 4);
  assert.equal(statsAfterSkip.circuitOpenSkips, 1);

  // 5. Reset resets stats and state
  breaker.reset();
  const statsAfterReset = breaker.getStats();
  assert.equal(statsAfterReset.calls, 0);
  assert.equal(statsAfterReset.successes, 0);
  assert.equal(statsAfterReset.timeouts, 0);
  assert.equal(statsAfterReset.failures, 0);
  assert.equal(statsAfterReset.circuitOpenSkips, 0);
  assert.equal(statsAfterReset.state, 'CLOSED');
  assert.equal(statsAfterReset.failureCount, 0);
});

test('Task 1.5: Multi-turn flow simulation: free microturn -> Attempt 1 scaffold -> Attempt 2 mastered', async () => {
  const commonRubric = {
    checkin_question: 'Where did Rattles live with her family?',
    target_answer_concept: 'Rattles lived in the haymow in the barn.',
    canonical_prototypes: [
      { type: 'colloquial', text: 'She lived in the haymow.' },
      { type: 'formal_full', text: 'Rattles lived in the haymow in the barn.' },
      { type: 'functional_circumlocution', text: 'Her family made their little home up in the barn.' },
    ],
    keyword_clusters: [
      { concept_name: 'location', synonyms: ['haymow', 'hay mow', 'barn'] },
    ],
    acceptable_phrasings: [
      'She lived in the haymow.',
      'Her family made their little home up in the barn.',
    ],
    semantic_slots: {
      agent: { canonical: 'Rattles', synonyms: ['the cat', 'she'] },
      location: { canonical: 'haymow', synonyms: ['hay mow', 'barn'] },
    },
    hint_level_1: 'Think about where the cats made their home in the barn!',
  };

  // Step 1: Low speech confidence muffled audio triggers free microturn
  const turn1 = await evaluateChildAnswer({
    ...commonRubric,
    child_transcript: 'grumbled mumble',
    speech_confidence: 0.25,
    attempt_count: 1,
    microturn_used: false,
  });

  assert.equal(turn1.status, 'needs_scaffold');
  assert.equal(turn1.is_microturn, true);
  assert.equal(turn1.attempt_count, 1);
  assert.equal(turn1.resolved, false);
  assert.equal(turn1.diagnostics.tier_resolved, 'SPEECH_CONFIDENCE_MICROTURN');

  // Step 2: Attempt 1 partial answer returns needs_scaffold
  const turn2 = await evaluateChildAnswer({
    ...commonRubric,
    child_transcript: 'She lived in the kitchen.',
    attempt_count: 1,
    microturn_used: true,
  });

  assert.equal(turn2.status, 'needs_scaffold');
  assert.equal(turn2.is_microturn, true); // Near-miss repair is free microturn in slot delta
  assert.equal(turn2.attempt_count, 1);
  assert.equal(turn2.resolved, false);

  // Step 3: Attempt 2 valid paraphrase returns mastered and resolved: true
  const turn3 = await evaluateChildAnswer({
    ...commonRubric,
    child_transcript: 'Her family made their little home up in the barn.',
    attempt_count: 2,
    microturn_used: true,
  });

  assert.equal(turn3.status, 'mastered');
  assert.equal(turn3.resolved, true);
  assert.equal(turn3.is_microturn, false);
  assert.equal(turn3.attempt_count, 2);
});
