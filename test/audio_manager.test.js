import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_STATE,
  SafariAudioManager,
} from '../public/js/audio_manager.js';

// Mock Web Audio Context
class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.bufferSourceCreated = false;
    this.bufferStarted = false;
  }
  async resume() {
    this.state = 'running';
  }
  createBuffer(channels, length, sampleRate) {
    return { channels, length, sampleRate };
  }
  createBufferSource() {
    this.bufferSourceCreated = true;
    return {
      buffer: null,
      connect: () => {},
      start: () => {
        this.bufferStarted = true;
      },
    };
  }
  get destination() {
    return {};
  }
}

// Mock SpeechSynthesis
class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.pending = false;
    this.paused = false;
    this.activeUtterance = null;
    this.cancelled = false;
  }
  getVoices() {
    return [
      { name: 'Samantha', lang: 'en-US', default: true },
      { name: 'Daniel', lang: 'en-GB', default: false },
    ];
  }
  speak(utterance) {
    this.speaking = true;
    this.cancelled = false;
    this.activeUtterance = utterance;
    if (utterance.onstart) {
      setTimeout(() => utterance.onstart({ type: 'start' }), 5);
    }
    // Simulate speech finishing unless cancelled
    setTimeout(() => {
      if (this.speaking && this.activeUtterance === utterance) {
        this.speaking = false;
        if (utterance.onend) utterance.onend({ type: 'end' });
      }
    }, 20);
  }
  cancel() {
    this.cancelled = true;
    this.speaking = false;
    if (this.activeUtterance && this.activeUtterance.onerror) {
      this.activeUtterance.onerror({ error: 'interrupted' });
    }
    this.activeUtterance = null;
  }
}

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  constructor(text = '') {
    this.text = text;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.lang = 'en-US';
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

// Mock SpeechRecognition
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.started = false;
    this.aborted = false;
    this.stopped = false;
  }
  start() {
    this.started = true;
    this.aborted = false;
    this.stopped = false;
    if (this.onstart) setTimeout(() => this.onstart({ type: 'start' }), 5);
  }
  stop() {
    this.stopped = true;
    this.started = false;
    if (this.onend) setTimeout(() => this.onend({ type: 'end' }), 5);
  }
  abort() {
    this.aborted = true;
    this.started = false;
    if (this.onend) setTimeout(() => this.onend({ type: 'end' }), 5);
  }
  // Helper to simulate speech events in tests
  simulateResult(results, resultIndex = 0) {
    if (this.onresult) {
      this.onresult({
        resultIndex,
        results,
      });
    }
  }
  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
  simulatePrematureEnd() {
    this.started = false;
    if (this.onend) {
      this.onend({ type: 'end' });
    }
  }
}

function createTestManager(customOptions = {}) {
  const mockAudioContext = new MockAudioContext();
  const mockSpeechSynthesis = new MockSpeechSynthesis();
  let latestRecognition = null;

  class FactoryRecognition extends MockSpeechRecognition {
    constructor() {
      super();
      latestRecognition = this;
    }
  }

  const manager = new SafariAudioManager({
    audioContext: mockAudioContext,
    speechSynthesis: mockSpeechSynthesis,
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    SpeechRecognition: FactoryRecognition,
    settlingDelayMs: 0, // fast in test
    ...customOptions,
  });

  return {
    manager,
    mockAudioContext,
    mockSpeechSynthesis,
    getLatestRecognition: () => latestRecognition,
  };
}

test('AUDIO_STATE enumeration contains all required lifecycle states', () => {
  assert.equal(AUDIO_STATE.LOCKED, 'LOCKED');
  assert.equal(AUDIO_STATE.IDLE, 'IDLE');
  assert.equal(AUDIO_STATE.SPEAKING, 'SPEAKING');
  assert.equal(AUDIO_STATE.LISTENING, 'LISTENING');
  assert.equal(AUDIO_STATE.PROCESSING, 'PROCESSING');
  assert.equal(AUDIO_STATE.ERROR, 'ERROR');
});

test('SafariAudioManager initializes in LOCKED state by default', () => {
  const { manager } = createTestManager();
  assert.equal(manager.state, AUDIO_STATE.LOCKED);
  assert.equal(manager.isUnlocked, false);
});

test('SafariAudioManager.unlock() plays zero-volume buffer and transitions to IDLE', async () => {
  const { manager, mockAudioContext } = createTestManager();
  let stateReceived = null;
  manager.onStateChange = (s) => {
    stateReceived = s;
  };

  const result = await manager.unlock();
  assert.equal(result.unlocked, true);
  assert.equal(mockAudioContext.state, 'running');
  assert.equal(mockAudioContext.bufferSourceCreated, true);
  assert.equal(mockAudioContext.bufferStarted, true);
  assert.equal(manager.state, AUDIO_STATE.IDLE);
  assert.equal(manager.isUnlocked, true);
  assert.equal(stateReceived, AUDIO_STATE.IDLE);
});

test('SafariAudioManager.speak() sets state to SPEAKING, applies 0.9x rate, and resolves to IDLE on completion', async () => {
  const { manager, mockSpeechSynthesis } = createTestManager();
  await manager.unlock();

  const speakPromise = manager.speak('What did the little bunny say?');
  assert.equal(manager.state, AUDIO_STATE.SPEAKING);

  const result = await speakPromise;
  assert.equal(result.completed, true);
  assert.equal(result.text, 'What did the little bunny say?');
  assert.equal(mockSpeechSynthesis.activeUtterance?.rate, 0.9);
  assert.equal(mockSpeechSynthesis.activeUtterance?.lang, 'en-US');
  assert.equal(manager.state, AUDIO_STATE.IDLE);
});

test('SafariAudioManager.speak() respects custom options (rate, pitch, volume, voiceName)', async () => {
  const { manager, mockSpeechSynthesis } = createTestManager();
  await manager.unlock();

  await manager.speak('Hello world', {
    rate: 0.85,
    pitch: 1.1,
    volume: 0.95,
    voiceName: 'Daniel',
  });

  const utt = mockSpeechSynthesis.activeUtterance;
  assert.equal(utt.rate, 0.85);
  assert.equal(utt.pitch, 1.1);
  assert.equal(utt.volume, 0.95);
  assert.equal(utt.voice?.name, 'Daniel');
});

test('SafariAudioManager.cancelSpeech() immediately aborts speech and restores IDLE', async () => {
  const { manager, mockSpeechSynthesis } = createTestManager();
  await manager.unlock();

  const speakPromise = manager.speak('Long sentence being spoken...');
  assert.equal(manager.state, AUDIO_STATE.SPEAKING);

  manager.cancelSpeech();
  assert.equal(mockSpeechSynthesis.cancelled, true);
  assert.equal(manager.state, AUDIO_STATE.IDLE);

  // The speak promise should resolve cleanly without crashing
  const result = await speakPromise;
  assert.equal(result.completed, false);
});

test('SafariAudioManager.startListening() cancels active TTS before opening microphone (Mutual Exclusivity 1)', async () => {
  const { manager, mockSpeechSynthesis } = createTestManager();
  await manager.unlock();

  manager.speak('Check-in question being read aloud...');
  assert.equal(manager.state, AUDIO_STATE.SPEAKING);

  await manager.startListening();
  assert.equal(mockSpeechSynthesis.cancelled, true);
  assert.equal(manager.state, AUDIO_STATE.LISTENING);
});

test('SafariAudioManager.speak() cancels active STT before speaking (Mutual Exclusivity 2)', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  await manager.startListening();
  const rec = getLatestRecognition();
  assert.equal(rec.started, true);
  assert.equal(manager.state, AUDIO_STATE.LISTENING);

  const speakPromise = manager.speak('Feedback being spoken...');
  assert.equal(rec.aborted, true);
  assert.equal(manager.state, AUDIO_STATE.SPEAKING);

  await speakPromise;
  assert.equal(manager.state, AUDIO_STATE.IDLE);
});

test('SafariAudioManager.startListening() accumulates multiple interim and final speech recognition events', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  let transcriptReported = null;
  await manager.startListening({
    onTranscript: (t) => {
      transcriptReported = t;
    },
  });

  const rec = getLatestRecognition();

  // 1. First word spoken (interim)
  rec.simulateResult([[{ transcript: 'he' }]], 0);
  assert.equal(transcriptReported.interim, 'he');
  assert.equal(transcriptReported.full, 'he');

  // 2. Phrase finalized
  rec.simulateResult(
    [
      Object.assign([{ transcript: 'he ran after' }], { isFinal: true }),
    ],
    0
  );
  assert.equal(transcriptReported.final, 'he ran after');

  // 3. Child pauses 2 seconds, then continues speaking next words (interim)
  rec.simulateResult([[{ transcript: 'the bunny' }]], 1);
  assert.equal(transcriptReported.interim, 'the bunny');
  assert.equal(transcriptReported.full, 'he ran after the bunny');

  // 4. Stop listening returns complete cohesive transcript
  const finalResult = await manager.stopListening();
  assert.equal(finalResult.transcript, 'he ran after the bunny');
  assert.equal(manager.state, AUDIO_STATE.IDLE);
});

test('SafariAudioManager auto-restarts recognition if Safari VAD prematurely fires onend while hold-to-talk is active', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  await manager.startListening();
  const firstRec = getLatestRecognition();
  assert.equal(firstRec.started, true);

  // First phrase finalized
  firstRec.simulateResult(
    [Object.assign([{ transcript: 'she loved him' }], { isFinal: true })],
    0
  );

  // Safari VAD prematurely cuts off after silence
  firstRec.simulatePrematureEnd();

  // Manager should have auto-restarted a new recognition session while holding state
  assert.equal(manager.state, AUDIO_STATE.LISTENING);
  const secondRec = getLatestRecognition();
  assert.notEqual(firstRec, secondRec);
  assert.equal(secondRec.started, true);

  // Child speaks second part after hesitation
  secondRec.simulateResult(
    [Object.assign([{ transcript: 'because he is little' }], { isFinal: true })],
    0
  );

  const res = await manager.stopListening();
  assert.equal(res.transcript, 'she loved him because he is little');
});

test('SafariAudioManager.stopListening() transitions to PROCESSING then IDLE and returns trimmed transcript', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  await manager.startListening();
  const rec = getLatestRecognition();
  rec.simulateResult(
    [Object.assign([{ transcript: '  the mother bunny  ' }], { isFinal: true })],
    0
  );

  const states = [];
  manager.onStateChange = (s) => states.push(s);

  const res = await manager.stopListening();
  assert.equal(res.transcript, 'the mother bunny');
  assert.ok(states.includes(AUDIO_STATE.PROCESSING));
  assert.equal(manager.state, AUDIO_STATE.IDLE);
});

test('SafariAudioManager.cancelListening() aborts recognition and resets state without error', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  await manager.startListening();
  const rec = getLatestRecognition();
  assert.equal(rec.started, true);

  manager.cancelListening();
  assert.equal(rec.aborted, true);
  assert.equal(manager.state, AUDIO_STATE.IDLE);
  assert.equal(manager.getFullTranscript(), '');
});

test('SafariAudioManager.reset() cancels both speech and listening and returns state to IDLE', async () => {
  const { manager, mockSpeechSynthesis, getLatestRecognition } = createTestManager();
  await manager.unlock();

  manager.speak('Some question');
  manager.reset();
  assert.equal(mockSpeechSynthesis.cancelled, true);
  assert.equal(manager.state, AUDIO_STATE.IDLE);

  await manager.startListening();
  const rec = getLatestRecognition();
  manager.reset();
  assert.equal(rec.aborted, true);
  assert.equal(manager.state, AUDIO_STATE.IDLE);
});

test('SafariAudioManager handles fatal recognition errors (network, not-allowed) gracefully', async () => {
  const { manager, getLatestRecognition } = createTestManager();
  await manager.unlock();

  let errorEvent = null;
  await manager.startListening({
    onError: (err) => {
      errorEvent = err;
    },
  });

  const rec = getLatestRecognition();
  rec.simulateError('not-allowed');

  assert.equal(errorEvent.error, 'not-allowed');
  assert.equal(manager.state, AUDIO_STATE.ERROR);
});
