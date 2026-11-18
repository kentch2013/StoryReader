import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATE,
  StoryReaderApp,
  createDefaultApiClient,
} from '../public/js/app.js';

// Minimal mock DOM Element helper for Node.js unit testing
function createMockElement(tagName = 'div', attributes = {}) {
  const listeners = {};
  const classListSet = new Set();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attributes: { ...attributes },
    textContent: '',
    innerHTML: '',
    style: {},
    hidden: false,
    disabled: false,
    children,
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      contains: (cls) => classListSet.has(cls),
      toggle: (cls, force) => {
        if (force === true) classListSet.add(cls);
        else if (force === false) classListSet.delete(cls);
        else if (classListSet.has(cls)) classListSet.delete(cls);
        else classListSet.add(cls);
      },
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type || event] || [];
      for (const h of handlers) h(event);
      return true;
    },
    click: () => {
      if (!el.disabled && listeners['click']) {
        for (const h of listeners['click']) h({ type: 'click', target: el });
      }
    },
    setAttribute: (name, val) => {
      el.attributes[name] = val;
    },
    getAttribute: (name) => el.attributes[name] || null,
    appendChild: (child) => {
      children.push(child);
      return child;
    },
  };
  if (attributes.id) el.id = attributes.id;
  return el;
}

function createMockDom() {
  const elements = {
    screenScan: createMockElement('section', { id: 'screen-scan' }),
    screenAnalyzing: createMockElement('section', { id: 'screen-analyzing' }),
    screenLookout: createMockElement('section', { id: 'screen-lookout' }),
    screenCheckin: createMockElement('section', { id: 'screen-checkin' }),
    screenEvaluating: createMockElement('section', { id: 'screen-evaluating' }),
    screenFeedback: createMockElement('section', { id: 'screen-feedback' }),
    screenComplete: createMockElement('section', { id: 'screen-complete' }),

    btnStartAudio: createMockElement('button', { id: 'btn-start-audio' }),
    btnAnalyze: createMockElement('button', { id: 'btn-analyze' }),
    btnDoneReading: createMockElement('button', { id: 'btn-done-reading' }),
    btnPtt: createMockElement('button', { id: 'btn-ptt' }),
    btnCheckAnswer: createMockElement('button', { id: 'btn-check-answer' }),
    btnRetrySpeech: createMockElement('button', { id: 'btn-retry-speech' }),
    btnNextChunk: createMockElement('button', { id: 'btn-next-chunk' }),
    btnRestart: createMockElement('button', { id: 'btn-restart' }),

    chunkBadge: createMockElement('span', { id: 'chunk-badge' }),
    lookoutPromptText: createMockElement('p', { id: 'lookout-prompt-text' }),
    checkinQuestionText: createMockElement('p', { id: 'checkin-question-text' }),
    transcriptText: createMockElement('p', { id: 'transcript-text' }),
    feedbackPraiseText: createMockElement('p', { id: 'feedback-praise-text' }),
    feedbackScaffoldText: createMockElement('p', { id: 'feedback-scaffold-text' }),
    statusBadge: createMockElement('span', { id: 'status-badge' }),
    errorBanner: createMockElement('div', { id: 'error-banner' }),
    confettiContainer: createMockElement('div', { id: 'confetti-container' }),
  };

  const getElementById = (id) => elements[id] || elements[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] || null;

  return { elements, getElementById };
}

class MockAudioManager {
  constructor() {
    this.isUnlocked = true;
    this.spokenTexts = [];
    this.isListening = false;
  }
  async unlock() { return true; }
  async speak(text) {
    this.spokenTexts.push(text);
    return true;
  }
  cancelSpeech() {}
  cancelListening() {}
}

class MockSessionStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const RICH_MOCK_CHUNK = {
  chunk_id: 1,
  page_range: 'Pages 1-3',
  lookout_prompt: 'Watch for what the mother promises.',
  checkin_question: 'What does the mother say she will do?',
  target_answer_concept: 'She will run after him because he is her bunny.',
  scaffold_hint: 'What action does the mother promise?',
  keyword_clusters: [
    { concept_name: 'action', synonyms: ['run after', 'chase', 'follow'] }
  ],
  acceptable_phrasings: ['She will run after him.'],
  canonical_prototypes: [{ type: 'minimal_core', text: 'Run after him.' }],
  entity_graph: {
    characters: [{ canonical_id: 'char_mom', canonical_name: 'mother bunny' }]
  },
  diagnostic_probes: {
    character_confusion: { scaffold: 'Who was running?' }
  },
  semantic_slots: { actor: 'mother bunny', action: 'run after' },
  hint_level_1: 'Look at page 2.',
  hint_level_2: 'What will she do with her feet?',
  story_facts: ['Mother bunny will run after little bunny.'],
  verbatim_page_text: 'If you run away, said his mother, I will run after you.',
};

const RICH_MOCK_BOOK = {
  is_legible: true,
  chunks: [RICH_MOCK_CHUNK],
};

test('Safeguard #1: handleCheckAnswer forwards complete chunk rubric in payload', async () => {
  const { getElementById } = createMockDom();
  const audioManager = new MockAudioManager();
  let receivedPayload = null;

  const mockApiClient = {
    evaluateAnswer: async (p) => {
      receivedPayload = p;
      return { status: 'mastered', spoken_feedback: 'Spot on!' };
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    apiClient: mockApiClient,
  });

  app.setBookData(RICH_MOCK_BOOK);
  app.transitionTo(APP_STATE.CHECKIN);
  app.setTranscript('she will run after him');

  await app.handleCheckAnswer();

  assert.ok(receivedPayload, 'API should have been called');
  assert.deepEqual(receivedPayload.keyword_clusters, RICH_MOCK_CHUNK.keyword_clusters);
  assert.deepEqual(receivedPayload.acceptable_phrasings, RICH_MOCK_CHUNK.acceptable_phrasings);
  assert.deepEqual(receivedPayload.entity_graph, RICH_MOCK_CHUNK.entity_graph);
  assert.deepEqual(receivedPayload.diagnostic_probes, RICH_MOCK_CHUNK.diagnostic_probes);
  assert.deepEqual(receivedPayload.semantic_slots, RICH_MOCK_CHUNK.semantic_slots);
  assert.deepEqual(receivedPayload.story_facts, RICH_MOCK_CHUNK.story_facts);
  assert.equal(receivedPayload.verbatim_page_text, RICH_MOCK_CHUNK.verbatim_page_text);
  assert.equal(receivedPayload.hint_level_1, RICH_MOCK_CHUNK.hint_level_1);
  assert.equal(receivedPayload.hint_level_2, RICH_MOCK_CHUNK.hint_level_2);
});

test('Safeguard #2: handleCheckAnswer guards against empty or whitespace-only transcript', async () => {
  const { getElementById } = createMockDom();
  const audioManager = new MockAudioManager();
  let apiCalled = false;

  const mockApiClient = {
    evaluateAnswer: async () => {
      apiCalled = true;
      return { status: 'mastered', spoken_feedback: 'Spot on!' };
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    apiClient: mockApiClient,
  });

  app.setBookData(RICH_MOCK_BOOK);
  app.transitionTo(APP_STATE.CHECKIN);

  // Attempt with empty transcript
  app.setTranscript('');
  await app.handleCheckAnswer();

  assert.equal(apiCalled, false, 'API must not be called on empty transcript');
  assert.equal(app.state, APP_STATE.CHECKIN, 'State must remain in CHECKIN');
  assert.equal(app.attemptCount, 1, 'Attempt count must not increment');
  assert.ok(audioManager.spokenTexts.some(t => t.includes('microphone') || t.includes('answer')),
    'TTS should prompt child to hold mic and speak');

  // Attempt with whitespace-only transcript
  audioManager.spokenTexts = [];
  app.setTranscript('    ');
  await app.handleCheckAnswer();

  assert.equal(apiCalled, false, 'API must not be called on whitespace-only transcript');
  assert.equal(app.attemptCount, 1);
});

test('Safeguard #3: handleCheckAnswer and handleAnalyzeBook enforce re-entrancy locks', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  let evalCallCount = 0;

  const mockApiClient = {
    evaluateAnswer: async () => {
      evalCallCount++;
      await new Promise(r => setTimeout(r, 50));
      return { status: 'mastered', spoken_feedback: 'Spot on!' };
    },
    analyzeBook: async () => {
      await new Promise(r => setTimeout(r, 50));
      return RICH_MOCK_BOOK;
    },
  };

  const cameraTray = {
    getPages: () => [{ id: 'p1' }],
    createFormData: () => ({}),
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(RICH_MOCK_BOOK);
  app.transitionTo(APP_STATE.CHECKIN);
  app.setTranscript('she will run after him');

  // Fire two evaluate calls concurrently
  const p1 = app.handleCheckAnswer();
  assert.equal(elements.btnCheckAnswer.disabled, true, 'btnCheckAnswer should be disabled during inflight call');
  const p2 = app.handleCheckAnswer(); // Duplicate concurrent call

  await Promise.all([p1, p2]);

  assert.equal(evalCallCount, 1, 'Duplicate concurrent call must be dropped by action lock');
  assert.equal(elements.btnCheckAnswer.disabled, false, 'btnCheckAnswer must be restored after completion');
});

test('Safeguard #4: handleRetryAttempt speaks scaffold clue before re-prompts', async () => {
  const { getElementById } = createMockDom();
  const audioManager = new MockAudioManager();

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
  });

  app.setBookData(RICH_MOCK_BOOK);
  app.activeEvaluation = {
    status: 'needs_scaffold',
    spoken_feedback: 'Almost there!',
    follow_up_prompt: 'Look at the bottom of the page!',
  };
  app.transitionTo(APP_STATE.FEEDBACK);

  audioManager.spokenTexts = [];
  app.handleRetryAttempt();

  assert.equal(app.state, APP_STATE.CHECKIN);
  assert.ok(
    audioManager.spokenTexts.some(t => t.includes('Look at the bottom of the page!')),
    'handleRetryAttempt must speak the scaffold clue'
  );
});

test('Safeguard #5: Confetti container is cleared on screen transitions and auto-cleanup', () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
  });

  // Populate confetti
  app.triggerConfetti();
  assert.ok(elements.confettiContainer.children.length > 0);

  // Transition away from FEEDBACK
  app.transitionTo(APP_STATE.CHECKIN);
  assert.equal(elements.confettiContainer.children.length, 0, 'Confetti must be wiped on transition away');
});

test('Safeguard #6: Session state persists to sessionStorage and restores transparently', () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const sessionStorageMock = new MockSessionStorage();

  const app1 = new StoryReaderApp({
    getElementById,
    audioManager,
    storage: sessionStorageMock,
  });

  app1.setBookData(RICH_MOCK_BOOK);
  app1.currentChunkIndex = 0;
  app1.attemptCount = 2;
  app1.transitionTo(APP_STATE.CHECKIN);

  // Verify stored state in mock storage
  const storedRaw = sessionStorageMock.getItem('storyreader_session_v1');
  assert.ok(storedRaw, 'Session state must be written to storage');
  const parsed = JSON.parse(storedRaw);
  assert.equal(parsed.currentChunkIndex, 0);
  assert.equal(parsed.attemptCount, 2);
  assert.equal(parsed.state, APP_STATE.CHECKIN);

  // Simulate page reload: new instance should restore
  const dom2 = createMockDom();
  const app2 = new StoryReaderApp({
    getElementById: dom2.getElementById,
    audioManager: new MockAudioManager(),
    storage: sessionStorageMock,
  });

  assert.equal(app2.state, APP_STATE.CHECKIN, 'Restored app must be in CHECKIN state');
  assert.equal(app2.attemptCount, 2, 'Restored app must maintain attemptCount');
  assert.ok(app2.bookData, 'Restored app must have bookData');

  // Calling restart clears storage
  app2.handleRestart();
  assert.equal(sessionStorageMock.getItem('storyreader_session_v1'), null, 'Restart must clear stored session');
});

test('Safeguard #7: createDefaultApiClient applies timeouts and handles abort errors gracefully', async () => {
  // Test with mock fetch that times out
  const timeoutFetch = (url, opts) => {
    return new Promise((_, reject) => {
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };

  const client = createDefaultApiClient({
    fetchFn: timeoutFetch,
    evalTimeoutMs: 10,
    analyzeTimeoutMs: 10,
  });

  await assert.rejects(
    async () => {
      await client.evaluateAnswer({ child_transcript: 'test' });
    },
    /timed out/i,
    'Client evaluateAnswer should throw readable timeout error on AbortError'
  );
});
