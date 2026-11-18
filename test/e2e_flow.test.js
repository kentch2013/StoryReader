import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATE,
  StoryReaderApp,
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
    querySelector: (selector) => {
      // Simple selector matching id or class
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return children.find(c => c.id === id) || null;
      }
      return null;
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
  };
  if (attributes.id) el.id = attributes.id;
  return el;
}

// Mock DOM Container mapping elements required by StoryReaderApp
function createMockDom() {
  const elements = {
    screenScan: createMockElement('section', { id: 'screen-scan' }),
    screenAnalyzing: createMockElement('section', { id: 'screen-analyzing' }),
    screenLookout: createMockElement('section', { id: 'screen-lookout' }),
    screenCheckin: createMockElement('section', { id: 'screen-checkin' }),
    screenEvaluating: createMockElement('section', { id: 'screen-evaluating' }),
    screenFeedback: createMockElement('section', { id: 'screen-feedback' }),
    screenComplete: createMockElement('section', { id: 'screen-complete' }),

    // Controls & Displays
    btnStartAudio: createMockElement('button', { id: 'btn-start-audio' }),
    btnAnalyze: createMockElement('button', { id: 'btn-analyze' }),
    btnDoneReading: createMockElement('button', { id: 'btn-done-reading' }),
    btnPtt: createMockElement('button', { id: 'btn-ptt' }),
    btnCheckAnswer: createMockElement('button', { id: 'btn-check-answer' }),
    btnRetrySpeech: createMockElement('button', { id: 'btn-retry-speech' }),
    btnNextChunk: createMockElement('button', { id: 'btn-next-chunk' }),
    btnRestart: createMockElement('button', { id: 'btn-restart' }),

    // Content Display Elements
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

  const getElementById = (id) => {
    switch (id) {
      case 'screen-scan': return elements.screenScan;
      case 'screen-analyzing': return elements.screenAnalyzing;
      case 'screen-lookout': return elements.screenLookout;
      case 'screen-checkin': return elements.screenCheckin;
      case 'screen-evaluating': return elements.screenEvaluating;
      case 'screen-feedback': return elements.screenFeedback;
      case 'screen-complete': return elements.screenComplete;
      case 'btn-start-audio': return elements.btnStartAudio;
      case 'btn-analyze': return elements.btnAnalyze;
      case 'btn-done-reading': return elements.btnDoneReading;
      case 'btn-ptt': return elements.btnPtt;
      case 'btn-check-answer': return elements.btnCheckAnswer;
      case 'btn-retry-speech': return elements.btnRetrySpeech;
      case 'btn-next-chunk': return elements.btnNextChunk;
      case 'btn-restart': return elements.btnRestart;
      case 'chunk-badge': return elements.chunkBadge;
      case 'lookout-prompt-text': return elements.lookoutPromptText;
      case 'checkin-question-text': return elements.checkinQuestionText;
      case 'transcript-text': return elements.transcriptText;
      case 'feedback-praise-text': return elements.feedbackPraiseText;
      case 'feedback-scaffold-text': return elements.feedbackScaffoldText;
      case 'status-badge': return elements.statusBadge;
      case 'error-banner': return elements.errorBanner;
      case 'confetti-container': return elements.confettiContainer;
      default: return createMockElement('div', { id });
    }
  };

  return { elements, getElementById };
}

// Mock AudioManager
class MockAudioManager {
  constructor() {
    this.isUnlocked = false;
    this.spokenTexts = [];
    this.isListening = false;
    this.activeTranscript = '';
  }
  async unlock() {
    this.isUnlocked = true;
    return true;
  }
  async speak(text) {
    this.spokenTexts.push(text);
    return true;
  }
  cancelSpeech() {}
  async startListening({ onTranscript }) {
    this.isListening = true;
    this._onTranscript = onTranscript;
  }
  async stopListening() {
    this.isListening = false;
    return this.activeTranscript;
  }
  cancelListening() {
    this.isListening = false;
  }
}

// Mock CameraTrayUI
class MockCameraTrayUI {
  constructor() {
    this.pages = [];
  }
  getPages() {
    return this.pages;
  }
  createFormData() {
    return { hasData: true };
  }
  reset() {
    this.pages = [];
  }
}

// Fixture Book Analysis
const MOCK_BOOK_ANALYSIS = {
  is_legible: true,
  summary: 'A runaway bunny tells his mother he will run away, and she follows him with love.',
  book_type: 'fiction',
  chunks: [
    {
      chunk_id: 1,
      page_range: 'Pages 1-3',
      lookout_prompt: 'Watch for what the little bunny imagines doing.',
      checkin_question: 'What does the mother say she will do if the bunny runs away?',
      target_answer_concept: 'She will run after him because he is her little bunny.',
      scaffold_hint: 'What action does the mother promise to take if he leaves?',
      canonical_prototypes: [
        { type: 'minimal_core', text: 'Run after him.' }
      ]
    },
    {
      chunk_id: 2,
      page_range: 'Pages 4-6',
      lookout_prompt: 'Notice what the bunny turns into when he swims in the stream.',
      checkin_question: 'What does the bunny become to swim away from his mother?',
      target_answer_concept: 'He becomes a fish in a trout stream.',
      scaffold_hint: 'Think of an animal that lives in the water!',
      canonical_prototypes: [
        { type: 'minimal_core', text: 'A fish.' }
      ]
    }
  ]
};

test('APP_STATE enumeration contains all required lifecycle states', () => {
  assert.equal(APP_STATE.SCAN, 'STATE_SCAN');
  assert.equal(APP_STATE.ANALYZING, 'STATE_ANALYZING');
  assert.equal(APP_STATE.LOOKOUT, 'STATE_LOOKOUT');
  assert.equal(APP_STATE.CHECKIN, 'STATE_CHECKIN');
  assert.equal(APP_STATE.RECORDING, 'STATE_RECORDING');
  assert.equal(APP_STATE.TRANSCRIPT_REVIEW, 'STATE_TRANSCRIPT_REVIEW');
  assert.equal(APP_STATE.EVALUATING, 'STATE_EVALUATING');
  assert.equal(APP_STATE.FEEDBACK, 'STATE_FEEDBACK');
  assert.equal(APP_STATE.COMPLETE, 'STATE_COMPLETE');
});

test('StoryReaderApp initializes in STATE_SCAN with clean session state', () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
  });

  assert.equal(app.state, APP_STATE.SCAN);
  assert.equal(app.currentChunkIndex, 0);
  assert.equal(app.attemptCount, 1);
  assert.equal(app.bookData, null);
  assert.equal(elements.screenScan.hidden, false);
  assert.equal(elements.screenLookout.hidden, true);
});

test('StoryReaderApp transitions SCAN -> ANALYZING -> LOOKOUT upon successful book analysis', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();
  cameraTray.pages = [{ id: 'p1' }, { id: 'p2' }];

  const mockApiClient = {
    analyzeBook: async () => MOCK_BOOK_ANALYSIS,
    evaluateAnswer: async () => ({ status: 'mastered', spoken_feedback: 'Spot on!' }),
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  await app.handleAnalyzeBook();

  assert.equal(app.state, APP_STATE.LOOKOUT);
  assert.equal(app.bookData.chunks.length, 2);
  assert.equal(app.currentChunkIndex, 0);
  assert.equal(elements.screenLookout.hidden, false);
  assert.equal(elements.screenScan.hidden, true);
  assert.match(elements.chunkBadge.textContent, /Pages 1-3/);
  assert.equal(elements.lookoutPromptText.textContent, 'Watch for what the little bunny imagines doing.');
  assert.ok(audioManager.spokenTexts.some(t => t.includes('Watch for what the little bunny imagines doing.')));
});

test('StoryReaderApp transitions ANALYZING -> SCAN with error banner if analysis is illegible (422)', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();
  cameraTray.pages = [{ id: 'p1' }];

  const mockApiClient = {
    analyzeBook: async () => {
      const err = new Error('Book page is illegible');
      err.status = 422;
      throw err;
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  await app.handleAnalyzeBook();

  assert.equal(app.state, APP_STATE.SCAN);
  assert.equal(elements.screenScan.hidden, false);
  assert.equal(elements.screenLookout.hidden, true);
  assert.ok(elements.errorBanner.textContent.length > 0);
});

test('StoryReaderApp transitions LOOKOUT -> CHECKIN when child taps "Done Reading"', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
  });

  app.setBookData(MOCK_BOOK_ANALYSIS);
  app.transitionTo(APP_STATE.LOOKOUT);

  app.handleDoneReading();

  assert.equal(app.state, APP_STATE.CHECKIN);
  assert.equal(elements.screenCheckin.hidden, false);
  assert.equal(elements.screenLookout.hidden, true);
  assert.equal(elements.checkinQuestionText.textContent, 'What does the mother say she will do if the bunny runs away?');
  assert.ok(audioManager.spokenTexts.some(t => t.includes('What does the mother say she will do')));
});

test('StoryReaderApp handles verbal check-in with mastery, confetti, and advances to next chunk', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  let evaluatedTranscript = null;
  const mockApiClient = {
    analyzeBook: async () => MOCK_BOOK_ANALYSIS,
    evaluateAnswer: async (payload) => {
      evaluatedTranscript = payload.child_transcript;
      return {
        status: 'mastered',
        spoken_feedback: 'Spot on! She will run after him because he is her little bunny.',
        resolved: true,
      };
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(MOCK_BOOK_ANALYSIS);
  app.transitionTo(APP_STATE.CHECKIN);

  // Set transcript and trigger evaluation
  app.setTranscript('she will run after him');
  await app.handleCheckAnswer();

  assert.equal(evaluatedTranscript, 'she will run after him');
  assert.equal(app.state, APP_STATE.FEEDBACK);
  assert.equal(elements.statusBadge.textContent, '🎉 Super Reader!');
  assert.equal(elements.feedbackPraiseText.textContent, 'Spot on! She will run after him because he is her little bunny.');
  assert.equal(elements.confettiContainer.children.length > 0, true);

  // Advance to next chunk
  app.handleNextChunk();
  assert.equal(app.currentChunkIndex, 1);
  assert.equal(app.state, APP_STATE.LOOKOUT);
  assert.match(elements.chunkBadge.textContent, /Pages 4-6/);
});

test('StoryReaderApp provides scaffold on Attempt 1 and auto-reveals on Attempt 2 (No-Loop Rule)', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  let attemptCountPassed = 0;
  const mockApiClient = {
    evaluateAnswer: async (payload) => {
      attemptCountPassed = payload.attempt_count;
      if (payload.attempt_count === 1) {
        return {
          status: 'needs_scaffold',
          spoken_feedback: 'Almost there! What action does the mother promise to take if he leaves?',
          follow_up_prompt: 'Think about what she does with her feet!',
          attempt_count: 1,
          resolved: false,
        };
      }
      return {
        status: 'needs_scaffold',
        spoken_feedback: 'Good try! She said she will run after him. Let’s see what happens next!',
        attempt_count: 2,
        resolved: true,
      };
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(MOCK_BOOK_ANALYSIS);
  app.transitionTo(APP_STATE.CHECKIN);
  assert.equal(app.attemptCount, 1);

  // Attempt 1: Needs scaffold
  app.setTranscript('she stays at home');
  await app.handleCheckAnswer();

  assert.equal(attemptCountPassed, 1);
  assert.equal(app.attemptCount, 2);
  assert.equal(app.state, APP_STATE.FEEDBACK);
  assert.equal(elements.statusBadge.textContent, '💡 Great Clue!');

  // Child tries again
  app.handleRetryAttempt();
  assert.equal(app.state, APP_STATE.CHECKIN);

  // Attempt 2: Auto-reveal resolution
  app.setTranscript('i do not know');
  await app.handleCheckAnswer();

  assert.equal(attemptCountPassed, 2);
  assert.equal(app.state, APP_STATE.FEEDBACK);
  assert.equal(elements.statusBadge.textContent, '🌟 Story Mystery Solved!');
  assert.equal(elements.btnNextChunk.hidden, false); // Unlocked next chunk without infinite loop
});

test('StoryReaderApp handles free microturn without consuming attempt count', async () => {
  const { getElementById } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  const mockApiClient = {
    evaluateAnswer: async () => ({
      status: 'needs_scaffold',
      spoken_feedback: 'Who was the one who ran?',
      is_microturn: true,
      microturn_used: true,
      attempt_count: 1,
      resolved: false,
    }),
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(MOCK_BOOK_ANALYSIS);
  app.transitionTo(APP_STATE.CHECKIN);
  assert.equal(app.attemptCount, 1);

  app.setTranscript('he did it');
  await app.handleCheckAnswer();

  // Attempt count must remain 1 on micro-turn
  assert.equal(app.attemptCount, 1);
  assert.equal(app.microturnUsed, true);
});

test('StoryReaderApp completes reading flow and enables restart to new book', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();
  const cameraTray = new MockCameraTrayUI();

  const mockApiClient = {
    evaluateAnswer: async () => ({
      status: 'mastered',
      spoken_feedback: 'Amazing reading!',
      resolved: true,
    }),
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(MOCK_BOOK_ANALYSIS);
  app.currentChunkIndex = 1; // Last chunk
  app.transitionTo(APP_STATE.CHECKIN);

  app.setTranscript('a fish');
  await app.handleCheckAnswer();

  // Tapping next on final chunk advances to COMPLETE
  app.handleNextChunk();
  assert.equal(app.state, APP_STATE.COMPLETE);
  assert.equal(elements.screenComplete.hidden, false);

  // Restart resets app back to SCAN
  app.handleRestart();
  assert.equal(app.state, APP_STATE.SCAN);
  assert.equal(app.bookData, null);
  assert.equal(app.currentChunkIndex, 0);
  assert.equal(elements.screenScan.hidden, false);
});
