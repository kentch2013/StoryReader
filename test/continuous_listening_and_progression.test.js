import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATE,
  StoryReaderApp,
} from '../public/js/app.js';

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
      listeners[event] = listeners[event].filter((h) => h !== handler);
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type || event] || [];
      for (const h of handlers) h(event);
      return true;
    },
    click: () => {
      if (!el.disabled && listeners['click']) {
        for (const h of listeners['click']) h({ type: 'click', target: el, stopPropagation: () => {} });
      }
    },
    setAttribute: (name, val) => {
      el.attributes[name] = val;
    },
    getAttribute: (name) => el.attributes[name] || null,
    querySelector: (selector) => {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.id === id) return el;
        const findIn = (nodes) => {
          for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
              const res = findIn(node.children);
              if (res) return res;
            }
          }
          return null;
        };
        return findIn(children);
      }
      return null;
    },
    querySelectorAll: () => [],
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    closest: () => el,
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

    drawerQuestionsSection: createMockElement('div', { id: 'drawer-questions-section' }),
    drawerQuestionsList: createMockElement('div', { id: 'drawer-questions-list' }),
    reviewDrawer: createMockElement('aside', { id: 'review-drawer' }),
    drawerBackdrop: createMockElement('div', { id: 'drawer-backdrop' }),

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
      case 'drawer-questions-section': return elements.drawerQuestionsSection;
      case 'drawer-questions-list': return elements.drawerQuestionsList;
      case 'review-drawer': return elements.reviewDrawer;
      case 'drawer-backdrop': return elements.drawerBackdrop;
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

class MockAudioManager {
  constructor() {
    this.isUnlocked = false;
    this.spokenTexts = [];
    this.isListening = false;
  }
  async unlock() {
    this.isUnlocked = true;
    return true;
  }
  async speak(text) {
    this.spokenTexts.push(text);
    return { completed: true, text };
  }
  cancelSpeech() {}
  async startListening({ onTranscript }) {
    this.isListening = true;
    this._onTranscript = onTranscript;
  }
  async stopListening() {
    this.isListening = false;
    return { transcript: '' };
  }
  cancelListening() {
    this.isListening = false;
  }
}

const TWO_PAGE_BOOK = {
  is_legible: true,
  summary: 'A story of a red ball that flew.',
  chunks: [
    {
      chunk_id: 1,
      page_range: 'Page 1',
      lookout_prompt: 'Where did the ball fly?',
      checkin_question: 'Where did the ball go?',
      target_answer_concept: 'the ball flew out of the yard',
      scaffold_hint: 'Did it fly inside or outside?',
    },
    {
      chunk_id: 2,
      page_range: 'Page 2',
      lookout_prompt: 'Who retrieved the ball?',
      checkin_question: 'Who found the ball in the yard?',
      target_answer_concept: 'the friendly dog found it',
      scaffold_hint: 'Think of a pet that barks!',
    },
  ],
};

test('Requirement 1: Drawer questions are minimized by default in panels after analyze', () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
  });

  app.setBookData(TWO_PAGE_BOOK);

  // Check that drawer-q-card-body is minimized with display: none by default
  const html = elements.drawerQuestionsList.innerHTML;
  assert.ok(html.includes('style="display: none;"'), 'Question body must be minimized by default');
  assert.ok(html.includes('btn-toggle-q-card'), 'Toggle button must be present for user to click to expand');
  assert.ok(html.includes('View Questions'), 'Must have button to view questions on demand');
});

test('Requirement 2: Microphone is automatically enabled and audio unlocked on analyze', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();

  const mockApiClient = {
    analyzeBook: async () => TWO_PAGE_BOOK,
  };

  const cameraTray = {
    getPages: () => [{ id: 'p1', pageNumber: 1 }, { id: 'p2', pageNumber: 2 }],
    createFormData: () => ({}),
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  assert.equal(audioManager.isUnlocked, false, 'Audio starts locked before gesture');
  await app.handleAnalyzeBook();

  assert.equal(audioManager.isUnlocked, true, 'Audio must be automatically unlocked on analyze');
  assert.ok(elements.btnStartAudio.classList.contains('audio-active'), 'Audio button must show active');
});

test('Requirements 3 & 4: Snappy pause submits immediately, keeps listening for more words, and auto-switches to page 2', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();

  const submittedTranscripts = [];
  const mockApiClient = {
    evaluateAnswer: async (payload) => {
      submittedTranscripts.push(payload.child_transcript);
      if (payload.child_transcript.includes('out of the yard')) {
        return {
          status: 'mastered',
          spoken_feedback: 'Awesome job! That is right!',
          resolved: true,
        };
      }
      return {
        status: 'needs_scaffold',
        spoken_feedback: 'Tell me where it went!',
        follow_up_prompt: 'Did it fly inside or outside?',
        resolved: false,
      };
    },
  };

  let swipedToIndex = null;
  const cameraTray = {
    state: {
      pages: [
        { id: 'page_1', pageNumber: 1 },
        { id: 'page_2', pageNumber: 2 },
      ],
    },
    scrollToPageIndex: (idx) => {
      swipedToIndex = idx;
    },
    swipeToNextPage: (idx) => {
      swipedToIndex = idx + 1;
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient: mockApiClient,
  });

  app.setBookData(TWO_PAGE_BOOK);

  // Start question for Page 1
  let nextAskedPage = null;
  app.askQuestionsAboutPage = (idx, page) => {
    nextAskedPage = { idx, page };
  };

  const page1 = cameraTray.state.pages[0];
  const chunk1 = TWO_PAGE_BOOK.chunks[0];

  // Initiate waiting for answer on Page 1
  await app.startWaitingForAnswer(0, 1, page1, chunk1.checkin_question, chunk1);

  assert.equal(audioManager.isListening, true, 'Microphone must be automatically listening without pressing enable');

  // 1. Child says "the ball flew"
  audioManager._onTranscript({ interim: '', final: 'the ball flew', full: 'the ball flew' });

  // 2. Child pauses. Wait 550ms for pause timer to fire
  await new Promise((r) => setTimeout(r, 600));

  // Verify "the ball flew" was submitted immediately to Decision 1 without hesitation
  assert.ok(submittedTranscripts.includes('the ball flew'), 'Should immediately submit "the ball flew" on pause');
  assert.equal(audioManager.isListening, true, 'Microphone must KEEP LISTENING for a more complete answer');

  // 3. Child continues after pause: "out of the yard"
  audioManager._onTranscript({
    interim: '',
    final: 'the ball flew out of the yard',
    full: 'the ball flew out of the yard',
  });

  // 4. Child pauses again. Wait 550ms
  await new Promise((r) => setTimeout(r, 600));

  // Verify "the ball flew out of the yard" was submitted as the answer
  assert.ok(submittedTranscripts.includes('the ball flew out of the yard'),
    'Should submit "the ball flew out of the yard" after child continues');

  // Wait for auto-progression to complete (1200ms)
  await new Promise((r) => setTimeout(r, 1400));

  // Verify automatic switch to next question (Page 2)
  assert.equal(swipedToIndex, 1, 'Must automatically swipe/switch to Page 2');
  assert.ok(nextAskedPage, 'Must automatically ask question for Page 2');
  assert.equal(nextAskedPage.idx, 1, 'Next asked question must be Page 2 (index 1)');
  assert.equal(nextAskedPage.page.pageNumber, 2, 'Next asked page must be Page 2');
});

test('Requirement: Camera turns off in review drawer & non-scan screens, and turns on only in main panel or photo tasks', async () => {
  const { CameraTrayUI } = await import('../public/js/camera_tray.js');
  const drawerEl = createMockElement('aside', { id: 'review-drawer' });
  const videoEl = createMockElement('video', { id: 'camera-feed' });
  const scanScreen = createMockElement('section', { id: 'screen-scan' });
  scanScreen.classList.add('screen-active');

  let cameraStarted = false;
  let cameraStopped = false;

  const tray = new CameraTrayUI({
    autoStartCamera: false,
    drawerElement: drawerEl,
    videoElement: videoEl,
  });

  tray.startCamera = async () => {
    cameraStarted = true;
    cameraStopped = false;
    tray.cameraActive = true;
    return true;
  };
  tray.stopCamera = () => {
    cameraStopped = true;
    cameraStarted = false;
    tray.cameraActive = false;
  };

  // Initially in scan panel
  await tray.startCamera(videoEl);
  assert.equal(cameraStarted, true, 'Camera active in scan panel');

  // Open review drawer (chapters & questions panel)
  tray.openDrawer();
  assert.equal(cameraStopped, true, 'Camera must be stopped when review drawer opens');
  assert.equal(tray.isDrawerOpen(), true);

  // Close review drawer while on main scan panel
  tray._isMainScanActive = () => true;
  tray.closeDrawer();
  assert.equal(cameraStarted, true, 'Camera resumes when closing drawer back to main scan panel');

  // Retaking a photo starts camera
  tray.state.addPage({ blob: {} });
  tray.stopCamera();
  assert.equal(cameraStopped, true);
  tray.retakeLastPage();
  assert.equal(cameraStarted, true, 'Retake last page restarts camera for photo capture');
});

test('Requirement: App requests microphone permission at startup simultaneously with camera, without turning on listening', async () => {
  const { CameraTrayUI } = await import('../public/js/camera_tray.js');
  const videoEl = createMockElement('video', { id: 'camera-feed' });

  let requestedConstraints = null;
  let audioTracksStopped = false;

  const originalMediaDevices = globalThis.navigator?.mediaDevices;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async (constraints) => {
        requestedConstraints = constraints;
        return {
          getTracks: () => [{ stop: () => {} }],
          getVideoTracks: () => [{ stop: () => {} }],
          getAudioTracks: () => [
            {
              stop: () => {
                audioTracksStopped = true;
              },
            },
          ],
        };
      },
    },
    configurable: true,
    writable: true,
  });

  try {
    const tray = new CameraTrayUI({
      autoStartCamera: false,
      videoElement: videoEl,
    });

    await tray.startCamera(videoEl);

    assert.ok(requestedConstraints, 'getUserMedia must have been called');
    assert.equal(requestedConstraints.audio, true, 'Must request audio (mic) permission alongside video at startup');
    assert.equal(audioTracksStopped, true, 'Must stop audio tracks immediately so microphone is NOT listening yet');
  } finally {
    if (originalMediaDevices) {
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
        writable: true,
      });
    } else {
      delete globalThis.navigator.mediaDevices;
    }
  }
});

test('Requirement: Pipeline does not hold up with lingering "checking your answer..." evaluating banner', async () => {
  const { getElementById, elements } = createMockDom();
  const audioManager = new MockAudioManager();

  let evaluatedTranscript = null;
  const mockApiClient = {
    evaluateAnswer: async (payload) => {
      evaluatedTranscript = payload.child_transcript;
      return {
        status: 'needs_scaffold',
        spoken_feedback: 'Look closely!',
        resolved: false,
      };
    },
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    apiClient: mockApiClient,
  });

  const page = { id: 'page_test_1', pageNumber: 1 };
  const chunk = {
    checkin_question: 'Where did the ball fly?',
    target_answer_concept: 'out of the yard',
  };

  // Mock slide UI elements
  const slideStatus = createMockElement('span', { id: 'slide-q-status-page_test_1' });
  const slideFeedback = createMockElement('div', { id: 'slide-q-feedback-page_test_1' });
  slideFeedback.style.display = 'none';

  globalThis.document = {
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (id === 'slide-q-status-page_test_1') return slideStatus;
      if (id === 'slide-q-feedback-page_test_1') return slideFeedback;
      return null;
    },
  };

  await app.startWaitingForAnswer(0, 1, page, chunk.checkin_question, chunk);

  // Child says initial phrase
  audioManager._onTranscript({ interim: '', final: 'the ball flew', full: 'the ball flew' });

  // Wait 550ms for pause evaluation
  await new Promise((r) => setTimeout(r, 600));

  assert.equal(evaluatedTranscript, 'the ball flew');
  // Evaluating banner must NOT linger on the screen
  assert.notEqual(slideFeedback.textContent, '🧠 Checking your answer...', 'Evaluating banner must not linger on screen');
  assert.equal(slideFeedback.style.display, 'none', 'Feedback box must remain hidden during continuous listening');
  assert.match(slideStatus.textContent, /Listening/i, 'Status must return to listening');
});

test('Requirement: SafariAudioManager prioritizes natural neural voices and allows user voice selection', async () => {
  const { SafariAudioManager } = await import('../public/js/audio_manager.js');

  const mockVoices = [
    { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', default: true },
    { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US', default: false },
    { name: 'Google US English', lang: 'en-US', default: false },
    { name: 'Samantha', lang: 'en-US', default: false },
  ];

  const mockSpeech = {
    getVoices: () => mockVoices,
    speak: () => {},
    cancel: () => {},
  };

  const manager = new SafariAudioManager({
    speechSynthesis: mockSpeech,
  });

  // Without user override, natural neural voice must take priority over robotic desktop David
  const selectedVoice = manager._selectVoice();
  assert.ok(selectedVoice, 'Must select a voice');
  assert.equal(
    selectedVoice.name,
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Must select modern natural neural voice over robotic desktop voice'
  );

  // User explicitly selects Google US English
  manager.setPreferredVoice('Google US English');
  assert.equal(manager.getPreferredVoice(), 'Google US English');
  const userVoice = manager._selectVoice();
  assert.equal(userVoice.name, 'Google US English', 'Must respect user-chosen preferred voice');

  // getAvailableVoices lists natural voices first
  const available = manager.getAvailableVoices();
  assert.equal(available[0].isNatural, true, 'Top voice must be marked natural');
});

test('Requirement: BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT is exported for adaptive non-recitation analysis', async () => {
  const { BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT, BOOK_ANALYSIS_SYSTEM_PROMPT } = await import('../prompts/book_analysis.js');

  assert.ok(BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT, 'BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT must be exported');
  assert.match(BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT, /DIRECT TEXT FIDELITY|verbatim/i);
  assert.match(BOOK_ANALYSIS_SYSTEM_PROMPT, /ANTI-RECITATION TECHNIQUE|paraphrase/i);
});

test('Requirement: SafariAudioManager defaults preferred voice to Microsoft Ana Online (Natural)', async () => {
  const { SafariAudioManager } = await import('../public/js/audio_manager.js');

  const mockVoices = [
    { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', default: true },
    { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US', default: false },
    { name: 'Microsoft Ana Online (Natural) - English (United States)', lang: 'en-US', default: false },
    { name: 'Google US English', lang: 'en-US', default: false },
  ];

  const mockSpeech = {
    getVoices: () => mockVoices,
    speak: () => {},
    cancel: () => {},
  };

  const manager = new SafariAudioManager({
    speechSynthesis: mockSpeech,
  });

  // Default voice must be Ana Online (Natural)
  assert.equal(manager.getPreferredVoice(), 'Microsoft Ana Online (Natural)');
  const selectedVoice = manager._selectVoice();
  assert.ok(selectedVoice, 'Must select a voice');
  assert.equal(
    selectedVoice.name,
    'Microsoft Ana Online (Natural) - English (United States)',
    'Must select Microsoft Ana Online (Natural) by default'
  );
});

test('Requirement: App requests camera and microphone permissions immediately at bootup', async () => {
  let requestedConstraints = null;
  let audioTracksStopped = false;

  const mockStream = {
    getAudioTracks: () => [
      {
        stop: () => {
          audioTracksStopped = true;
        },
      },
    ],
    getVideoTracks: () => [{ stop: () => {} }],
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          requestedConstraints = constraints;
          return mockStream;
        },
      },
    },
    configurable: true,
  });

  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
  };

  const { CameraTrayUI } = await import('../public/js/camera_tray.js');
  const dummyVideo = createMockElement('video');

  const tray = new CameraTrayUI({
    videoElement: dummyVideo,
    autoStartCamera: true,
  });

  // Allow startup getUserMedia promise chain to resolve
  await new Promise((r) => setTimeout(r, 20));

  // At boot, getUserMedia must have requested both video and audio
  assert.ok(requestedConstraints, 'getUserMedia must be called at startup');
  assert.ok(requestedConstraints.video, 'Must request video permission at startup');
  assert.ok(requestedConstraints.audio, 'Must request audio (microphone) permission at startup');
  assert.equal(audioTracksStopped, true, 'Must immediately stop audio track so microphone is not listening until needed');
});

test('Requirement: When question button is available and active after analysis, automatically read question then wait for answer', async () => {
  const { getElementById } = createMockDom();

  let spokenText = null;
  let speechFinished = false;
  let listeningStarted = false;
  let speechPrecedesListening = false;

  const mockAudioManager = {
    isUnlocked: true,
    state: 'IDLE',
    unlock: async () => ({ unlocked: true }),
    speak: async (text) => {
      spokenText = text;
      // Simulate speech duration
      await new Promise((r) => setTimeout(r, 20));
      speechFinished = true;
      return { completed: true, text };
    },
    startListening: async () => {
      if (speechFinished) {
        speechPrecedesListening = true;
      }
      listeningStarted = true;
      return { listening: true };
    },
    cancelListening: () => {},
    cancelSpeech: () => {},
  };

  globalThis.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {},
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager: mockAudioManager,
  });

  const mockAnalysisData = {
    chunks: [
      {
        chunk_id: 1,
        page_range: 'Pages 1-1',
        checkin_question: 'What made the hat fly away in the wind?',
        target_answer_concept: 'the wind',
      },
    ],
  };

  const page = { id: 'p1', pageNumber: 1 };
  app.cameraTray = {
    pages: [page],
    state: { pages: [page] },
    lastAnalysisData: mockAnalysisData,
    isQuestionReady: () => true,
  };

  const slideCard = createMockElement('div', { id: 'slide-question-card-p1' });
  const slideStatus = createMockElement('span', { id: 'slide-q-status-p1' });
  const slideText = createMockElement('p', { id: 'slide-q-text-p1' });
  const slidePtt = createMockElement('button', { id: 'btn-slide-ptt-p1' });
  const slideTranscript = createMockElement('div', { id: 'slide-q-transcript-p1' });
  const slideTranscriptText = createMockElement('span', { id: 'slide-transcript-text-p1' });
  const slideFeedback = createMockElement('div', { id: 'slide-q-feedback-p1' });

  globalThis.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    getElementById: (id) => {
      if (id === 'slide-question-card-p1') return slideCard;
      if (id === 'slide-q-status-p1') return slideStatus;
      if (id === 'slide-q-text-p1') return slideText;
      if (id === 'btn-slide-ptt-p1') return slidePtt;
      if (id === 'slide-q-transcript-p1') return slideTranscript;
      if (id === 'slide-transcript-text-p1') return slideTranscriptText;
      if (id === 'slide-q-feedback-p1') return slideFeedback;
      return null;
    },
  };

  // Trigger analysis complete (which makes question button available and active)
  await app.onAnalyzeComplete(mockAnalysisData);

  assert.equal(spokenText, 'What made the hat fly away in the wind?', 'Must read the question out loud');
  assert.equal(speechPrecedesListening, true, 'Must finish reading the question before starting to listen for answer');
  assert.equal(listeningStarted, true, 'Must transition to waiting for answer after reading question');
});

