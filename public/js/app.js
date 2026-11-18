/**
 * StoryReader - Full SPA Orchestration Engine (Module 6)
 * Orchestrates camera scanning, book chunking, push-to-talk audio,
 * answer evaluation, celebratory feedback, and multi-chunk story progression.
 */

import { SafariAudioManager } from './audio_manager.js';
import { CameraTrayUI } from './camera_tray.js';

export const APP_STATE = Object.freeze({
  SCAN: 'STATE_SCAN',
  ANALYZING: 'STATE_ANALYZING',
  LOOKOUT: 'STATE_LOOKOUT',
  CHECKIN: 'STATE_CHECKIN',
  RECORDING: 'STATE_RECORDING',
  TRANSCRIPT_REVIEW: 'STATE_TRANSCRIPT_REVIEW',
  EVALUATING: 'STATE_EVALUATING',
  FEEDBACK: 'STATE_FEEDBACK',
  COMPLETE: 'STATE_COMPLETE',
});

export class StoryReaderApp {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.getElementById]
   * @param {Object} [options.audioManager]
   * @param {Object} [options.cameraTray]
   * @param {Object} [options.apiClient]
   * @param {Object} [options.storage]
   */
  constructor({ getElementById, audioManager, cameraTray, apiClient, storage } = {}) {
    this.getElementById = getElementById || (typeof document !== 'undefined' ? (id) => document.getElementById(id) : () => null);
    this.audioManager = audioManager || null;
    this.cameraTray = cameraTray || null;
    this.apiClient = apiClient || null;
    this.storage = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    this._actionLock = false;

    // Session state
    this.state = APP_STATE.SCAN;
    this.currentChunkIndex = 0;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.bookData = null;
    this.transcript = '';
    this.activeEvaluation = null;

    // Cache elements mapping
    this.elements = {
      screenScan: this.getElementById('screen-scan'),
      screenAnalyzing: this.getElementById('screen-analyzing'),
      screenLookout: this.getElementById('screen-lookout'),
      screenCheckin: this.getElementById('screen-checkin'),
      screenEvaluating: this.getElementById('screen-evaluating'),
      screenFeedback: this.getElementById('screen-feedback'),
      screenComplete: this.getElementById('screen-complete'),

      // Interactive controls
      btnStartAudio: this.getElementById('btn-start-audio'),
      btnAnalyze: this.getElementById('btn-analyze'),
      btnDoneReading: this.getElementById('btn-done-reading'),
      btnPtt: this.getElementById('btn-ptt'),
      btnCheckAnswer: this.getElementById('btn-check-answer'),
      btnRetrySpeech: this.getElementById('btn-retry-speech'),
      btnNextChunk: this.getElementById('btn-next-chunk'),
      btnRestart: this.getElementById('btn-restart'),

      // Display and status elements
      chunkBadge: this.getElementById('chunk-badge'),
      lookoutPromptText: this.getElementById('lookout-prompt-text'),
      checkinQuestionText: this.getElementById('checkin-question-text'),
      transcriptText: this.getElementById('transcript-text'),
      feedbackPraiseText: this.getElementById('feedback-praise-text'),
      feedbackScaffoldText: this.getElementById('feedback-scaffold-text'),
      statusBadge: this.getElementById('status-badge'),
      errorBanner: this.getElementById('error-banner'),
      confettiContainer: this.getElementById('confetti-container'),
    };

    this._bindEvents();
    if (!this._restoreSession()) {
      this.transitionTo(APP_STATE.SCAN);
    }
  }

  _persistSession() {
    if (!this.storage) return;
    try {
      if (!this.bookData || this.state === APP_STATE.SCAN) {
        this.storage.removeItem('storyreader_session_v1');
        return;
      }
      const sessionData = {
        state: this.state,
        bookData: this.bookData,
        currentChunkIndex: this.currentChunkIndex,
        attemptCount: this.attemptCount,
        microturnUsed: this.microturnUsed,
      };
      this.storage.setItem('storyreader_session_v1', JSON.stringify(sessionData));
    } catch (_) {}
  }

  _restoreSession() {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem('storyreader_session_v1');
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (session && session.bookData && session.state && session.state !== APP_STATE.SCAN) {
        this.bookData = session.bookData;
        this.currentChunkIndex = session.currentChunkIndex || 0;
        this.attemptCount = session.attemptCount || 1;
        this.microturnUsed = Boolean(session.microturnUsed);
        this.transitionTo(session.state);
        return true;
      }
    } catch (_) {}
    return false;
  }

  _bindEvents() {
    this.elements.btnStartAudio?.addEventListener('click', () => this.handleStartAudio());
    this.elements.btnAnalyze?.addEventListener('click', () => this.handleAnalyzeBook());
    this.elements.btnDoneReading?.addEventListener('click', () => this.handleDoneReading());
    this.elements.btnCheckAnswer?.addEventListener('click', () => this.handleCheckAnswer());
    this.elements.btnRetrySpeech?.addEventListener('click', () => this.handleRetryAttempt());
    this.elements.btnNextChunk?.addEventListener('click', () => this.handleNextChunk());
    this.elements.btnRestart?.addEventListener('click', () => this.handleRestart());

    if (this.elements.btnPtt) {
      const ptt = this.elements.btnPtt;
      // Pointer events for modern touch & desktop pointer support
      ptt.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.handlePttDown();
      });
      ptt.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.handlePttUp();
      });
      ptt.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this.handlePttUp();
      });

      // Fallback touch events for iOS Safari
      ptt.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.handlePttDown();
      }, { passive: false });
      ptt.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.handlePttUp();
      }, { passive: false });
    }
  }

  getCurrentChunk() {
    if (!this.bookData || !Array.isArray(this.bookData.chunks)) {
      return null;
    }
    return this.bookData.chunks[this.currentChunkIndex] || null;
  }

  setBookData(data) {
    this.bookData = data;
    this._persistSession();
  }

  setTranscript(text) {
    this.transcript = text || '';
    if (this.elements.transcriptText) {
      this.elements.transcriptText.textContent = this.transcript;
    }
  }

  showError(message) {
    if (this.elements.errorBanner) {
      this.elements.errorBanner.textContent = message || '';
      this.elements.errorBanner.hidden = false;
      if (this.elements.errorBanner.style) {
        this.elements.errorBanner.style.display = 'block';
      }
    }
  }

  hideError() {
    if (this.elements.errorBanner) {
      this.elements.errorBanner.textContent = '';
      this.elements.errorBanner.hidden = true;
      if (this.elements.errorBanner.style) {
        this.elements.errorBanner.style.display = 'none';
      }
    }
  }

  transitionTo(nextState) {
    this.state = nextState;

    if (this.elements.confettiContainer) {
      this.elements.confettiContainer.innerHTML = '';
      if (this.elements.confettiContainer.children) {
        this.elements.confettiContainer.children.length = 0;
      }
    }

    const allScreens = [
      this.elements.screenScan,
      this.elements.screenAnalyzing,
      this.elements.screenLookout,
      this.elements.screenCheckin,
      this.elements.screenEvaluating,
      this.elements.screenFeedback,
      this.elements.screenComplete,
    ];

    allScreens.forEach((screen) => {
      if (screen) {
        screen.hidden = true;
        screen.classList?.remove('screen-active');
      }
    });

    let activeScreen = null;
    switch (nextState) {
      case APP_STATE.SCAN:
        activeScreen = this.elements.screenScan;
        break;
      case APP_STATE.ANALYZING:
        activeScreen = this.elements.screenAnalyzing;
        break;
      case APP_STATE.LOOKOUT:
        activeScreen = this.elements.screenLookout;
        this.renderLookout();
        break;
      case APP_STATE.CHECKIN:
      case APP_STATE.RECORDING:
      case APP_STATE.TRANSCRIPT_REVIEW:
        activeScreen = this.elements.screenCheckin;
        if (nextState === APP_STATE.CHECKIN) {
          this.renderCheckin();
        }
        break;
      case APP_STATE.EVALUATING:
        activeScreen = this.elements.screenEvaluating;
        break;
      case APP_STATE.FEEDBACK:
        activeScreen = this.elements.screenFeedback;
        this.renderFeedback();
        break;
      case APP_STATE.COMPLETE:
        activeScreen = this.elements.screenComplete;
        this.renderComplete();
        break;
    }

    if (activeScreen) {
      activeScreen.hidden = false;
      activeScreen.classList?.add('screen-active');
    }

    this._persistSession();
  }

  renderLookout() {
    const chunk = this.getCurrentChunk();
    if (!chunk) return;

    if (this.elements.chunkBadge) {
      this.elements.chunkBadge.textContent = chunk.page_range
        ? `Chunk ${this.currentChunkIndex + 1}: ${chunk.page_range}`
        : `Chunk ${this.currentChunkIndex + 1}`;
    }

    if (this.elements.lookoutPromptText) {
      this.elements.lookoutPromptText.textContent = chunk.lookout_prompt || '';
    }

    if (this.audioManager && chunk.lookout_prompt) {
      this.audioManager.speak(chunk.lookout_prompt);
    }
  }

  renderCheckin() {
    const chunk = this.getCurrentChunk();
    if (!chunk) return;

    if (this.elements.chunkBadge) {
      this.elements.chunkBadge.textContent = chunk.page_range
        ? `Chunk ${this.currentChunkIndex + 1}: ${chunk.page_range}`
        : `Chunk ${this.currentChunkIndex + 1}`;
    }

    if (this.elements.checkinQuestionText) {
      this.elements.checkinQuestionText.textContent = chunk.checkin_question || '';
    }

    if (this.elements.transcriptText) {
      this.elements.transcriptText.textContent = this.transcript || '';
    }

    if (this.audioManager && chunk.checkin_question) {
      this.audioManager.speak(chunk.checkin_question);
    }
  }

  renderFeedback() {
    const result = this.activeEvaluation;
    if (!result) return;

    if (result.status === 'mastered') {
      if (this.elements.statusBadge) {
        this.elements.statusBadge.textContent = '🎉 Super Reader!';
      }
      this.triggerConfetti();
      if (this.elements.btnNextChunk) this.elements.btnNextChunk.hidden = false;
      if (this.elements.btnRetrySpeech) this.elements.btnRetrySpeech.hidden = true;
    } else if (result.resolved) {
      // Auto-reveal / mystery solved on Attempt 2
      if (this.elements.statusBadge) {
        this.elements.statusBadge.textContent = '🌟 Story Mystery Solved!';
      }
      if (this.elements.btnNextChunk) this.elements.btnNextChunk.hidden = false;
      if (this.elements.btnRetrySpeech) this.elements.btnRetrySpeech.hidden = true;
    } else {
      // Needs scaffold (Attempt 1)
      if (this.elements.statusBadge) {
        this.elements.statusBadge.textContent = '💡 Great Clue!';
      }
      if (this.elements.btnNextChunk) this.elements.btnNextChunk.hidden = true;
      if (this.elements.btnRetrySpeech) this.elements.btnRetrySpeech.hidden = false;
    }

    if (this.elements.feedbackPraiseText) {
      this.elements.feedbackPraiseText.textContent = result.spoken_feedback || '';
    }

    if (this.elements.feedbackScaffoldText) {
      if (result.follow_up_prompt) {
        this.elements.feedbackScaffoldText.textContent = result.follow_up_prompt;
        this.elements.feedbackScaffoldText.hidden = false;
      } else {
        this.elements.feedbackScaffoldText.textContent = '';
        this.elements.feedbackScaffoldText.hidden = true;
      }
    }

    if (this.audioManager && result.spoken_feedback) {
      this.audioManager.speak(result.spoken_feedback);
    }
  }

  renderComplete() {
    if (this.elements.statusBadge) {
      this.elements.statusBadge.textContent = '🏆 Story Complete!';
    }
    this.triggerConfetti();
    if (this.audioManager) {
      this.audioManager.speak('Congratulations! You finished the entire story! You are a super reader!');
    }
  }

  async handleStartAudio() {
    if (this.audioManager) {
      await this.audioManager.unlock();
      if (this.elements.btnStartAudio) {
        this.elements.btnStartAudio.hidden = true;
        if (this.elements.btnStartAudio.style) {
          this.elements.btnStartAudio.style.display = 'none';
        }
      }
    }
  }

  async handleAnalyzeBook() {
    if (this._actionLock) return;

    const pages = this.cameraTray?.getPages ? this.cameraTray.getPages() : (this.cameraTray?.pages || []);
    if (!pages || pages.length === 0) {
      this.showError('Please capture at least one book page before analyzing.');
      return;
    }

    this._actionLock = true;
    if (this.elements.btnAnalyze) {
      this.elements.btnAnalyze.disabled = true;
      this.elements.btnAnalyze.setAttribute?.('aria-busy', 'true');
    }

    this.hideError();
    this.transitionTo(APP_STATE.ANALYZING);

    try {
      const payload = this.cameraTray?.createFormData ? this.cameraTray.createFormData() : pages;
      const analysis = await this.apiClient.analyzeBook(payload);

      if (!analysis || analysis.is_legible === false) {
        const err = new Error(analysis?.error_message || 'Book page is illegible or blurry. Please retake.');
        err.status = 422;
        throw err;
      }

      this.setBookData(analysis);
      this.currentChunkIndex = 0;
      this.attemptCount = 1;
      this.microturnUsed = false;
      this.transitionTo(APP_STATE.LOOKOUT);
    } catch (err) {
      this.showError(err.message || 'Book analysis failed. Please try again.');
      this.transitionTo(APP_STATE.SCAN);
    } finally {
      this._actionLock = false;
      if (this.elements.btnAnalyze) {
        this.elements.btnAnalyze.disabled = false;
        this.elements.btnAnalyze.setAttribute?.('aria-busy', 'false');
      }
    }
  }

  handleDoneReading() {
    this.transitionTo(APP_STATE.CHECKIN);
  }

  handlePttDown() {
    this.handleStartRecording();
  }

  handlePttUp() {
    this.handleStopRecording();
  }

  async handleStartRecording() {
    if (!this.audioManager) return;
    this.transitionTo(APP_STATE.RECORDING);

    if (this.elements.btnPtt) {
      this.elements.btnPtt.classList?.add('listening');
      this.elements.btnPtt.setAttribute?.('aria-pressed', 'true');
    }

    try {
      await this.audioManager.startListening({
        onTranscript: (t) => this.setTranscript(t),
        onInterim: (t) => {
          if (this.elements.transcriptText) this.elements.transcriptText.textContent = t;
        },
        onFinal: (t) => this.setTranscript(t),
        onError: (err) => {
          console.warn('Speech recognition warning:', err);
          this.handleStopRecording();
        },
      });
    } catch (err) {
      console.error('Error starting audio recording:', err);
      this.handleStopRecording();
    }
  }

  async handleStopRecording() {
    if (this.elements.btnPtt) {
      this.elements.btnPtt.classList?.remove('listening');
      this.elements.btnPtt.setAttribute?.('aria-pressed', 'false');
    }

    if (this.audioManager) {
      try {
        const finalTranscript = await this.audioManager.stopListening();
        if (finalTranscript) {
          this.setTranscript(finalTranscript);
        }
      } catch (err) {
        console.warn('Error stopping speech recording:', err);
      }
    }

    this.transitionTo(APP_STATE.TRANSCRIPT_REVIEW);
  }

  async handleCheckAnswer() {
    if (this._actionLock) return;

    if (!this.transcript || !this.transcript.trim()) {
      if (this.audioManager) {
        this.audioManager.speak("Hold the microphone button and say your answer!");
      }
      return;
    }

    this._actionLock = true;
    if (this.elements.btnCheckAnswer) {
      this.elements.btnCheckAnswer.disabled = true;
      this.elements.btnCheckAnswer.setAttribute?.('aria-busy', 'true');
    }

    const chunk = this.getCurrentChunk();
    const currentAttempt = this.attemptCount;

    const payload = {
      child_transcript: this.transcript,
      checkin_question: chunk?.checkin_question || '',
      target_answer_concept: chunk?.target_answer_concept || '',
      scaffold_hint: chunk?.scaffold_hint || '',
      canonical_prototypes: chunk?.canonical_prototypes || [],
      keyword_clusters: chunk?.keyword_clusters || [],
      acceptable_phrasings: chunk?.acceptable_phrasings || [],
      entity_graph: chunk?.entity_graph || {},
      diagnostic_probes: chunk?.diagnostic_probes || {},
      semantic_slots: chunk?.semantic_slots || undefined,
      hint_level_1: chunk?.hint_level_1 || '',
      hint_level_2: chunk?.hint_level_2 || '',
      story_facts: chunk?.story_facts || [],
      verbatim_page_text: chunk?.verbatim_page_text || '',
      attempt_count: currentAttempt,
      microturn_used: this.microturnUsed,
    };

    this.transitionTo(APP_STATE.EVALUATING);

    try {
      const result = await this.apiClient.evaluateAnswer(payload);
      this.activeEvaluation = result;

      if (result.is_microturn || result.microturn_used) {
        this.microturnUsed = true;
      } else {
        if (result.status === 'needs_scaffold' && !result.resolved) {
          if (this.attemptCount === 1) {
            this.attemptCount = 2;
          }
        }
      }

      this.transitionTo(APP_STATE.FEEDBACK);
    } catch (err) {
      this.showError(`Evaluation failed: ${err.message}`);
      this.transitionTo(APP_STATE.CHECKIN);
    } finally {
      this._actionLock = false;
      if (this.elements.btnCheckAnswer) {
        this.elements.btnCheckAnswer.disabled = false;
        this.elements.btnCheckAnswer.setAttribute?.('aria-busy', 'false');
      }
    }
  }

  handleRetryAttempt() {
    this.setTranscript('');
    this.transitionTo(APP_STATE.CHECKIN);

    if (this.audioManager) {
      const clue = this.activeEvaluation?.follow_up_prompt || this.getCurrentChunk()?.scaffold_hint;
      const question = this.getCurrentChunk()?.checkin_question;
      let promptToSpeak = '';
      if (clue && question) {
        promptToSpeak = `Here is your clue: ${clue}. ${question}`;
      } else {
        promptToSpeak = clue || question || '';
      }
      if (promptToSpeak) {
        this.audioManager.speak(promptToSpeak);
      }
    }
  }

  handleNextChunk() {
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;

    if (this.bookData && this.currentChunkIndex + 1 < this.bookData.chunks.length) {
      this.currentChunkIndex++;
      this.transitionTo(APP_STATE.LOOKOUT);
    } else {
      this.transitionTo(APP_STATE.COMPLETE);
    }
  }

  handleRestart() {
    if (this.storage) {
      try { this.storage.removeItem('storyreader_session_v1'); } catch (_) {}
    }
    this.bookData = null;
    this.currentChunkIndex = 0;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;
    this.hideError();

    if (this.cameraTray?.reset) {
      this.cameraTray.reset();
    }

    this.transitionTo(APP_STATE.SCAN);
  }

  triggerConfetti() {
    const container = this.elements.confettiContainer;
    if (!container) return;

    container.innerHTML = '';
    if (container.children) container.children.length = 0;
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const piece = typeof document !== 'undefined' && document.createElement
        ? document.createElement('div')
        : {
            tagName: 'DIV',
            className: 'confetti-piece',
            style: {},
            classList: { add: () => {} },
          };

      piece.className = 'confetti-piece';
      if (piece.style) {
        piece.style.backgroundColor = colors[i % colors.length];
        piece.style.left = `${(i * (100 / count)).toFixed(1)}%`;
        piece.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
        piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
      }
      container.appendChild(piece);
    }

    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (container && (this.state === APP_STATE.FEEDBACK || this.state === APP_STATE.COMPLETE)) {
          container.innerHTML = '';
          if (container.children) container.children.length = 0;
        }
      }, 3500);
    }
  }
}

export function createDefaultApiClient(options = {}) {
  const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  const analyzeTimeoutMs = options.analyzeTimeoutMs || 25000;
  const evalTimeoutMs = options.evalTimeoutMs || 8000;

  const getHeaders = (isJson = false) => {
    const headers = {};
    if (typeof window !== 'undefined') {
      const secret = new URLSearchParams(window.location.search).get('auth') ||
        sessionStorage.getItem('storyreader_auth') || '';
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
    }
    if (isJson) headers['Content-Type'] = 'application/json';
    return headers;
  };

  async function fetchWithTimeout(url, opts, timeoutMs) {
    if (!fetchFn) throw new Error('Fetch API not available in this environment');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchFn(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms. Please check your connection and try again.`);
        timeoutErr.name = 'TimeoutError';
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw err;
    }
  }

  return {
    async analyzeBook(formData) {
      const response = await fetchWithTimeout('/api/analyze-book', {
        method: 'POST',
        headers: getHeaders(false),
        body: formData,
      }, analyzeTimeoutMs);
      if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch (_) {}
        const err = new Error(errData?.error_message || errData?.error || `Analysis failed (${response.status})`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    },

    async evaluateAnswer(payload) {
      const response = await fetchWithTimeout('/api/evaluate-answer', {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify(payload),
      }, evalTimeoutMs);
      if (!response.ok) {
        let errData;
        try { errData = await response.json(); } catch (_) {}
        const err = new Error(errData?.error || errData?.message || `Evaluation failed (${response.status})`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    },
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('screen-scan') && !window.__storyReaderApp) {
      const audioManager = new SafariAudioManager();

      const authSecret = new URLSearchParams(window.location.search).get('auth') ||
        sessionStorage.getItem('storyreader_auth') || '';
      if (new URLSearchParams(window.location.search).get('auth')) {
        sessionStorage.setItem('storyreader_auth', authSecret);
      }

      const cameraTray = new CameraTrayUI({
        videoElement: '#camera-feed',
        viewfinderElement: '#camera-viewfinder',
        shutterButton: '#btn-shutter',
        retakeButton: '#btn-retake-viewfinder',
        rotateViewfinderButton: '#btn-rotate-viewfinder',
        autoStraightenButton: '#btn-auto-straighten',
        toggleFallbackButton: '#btn-toggle-fallback',
        drawerElement: '#review-drawer',
        backdropElement: '#drawer-backdrop',
        closeDrawerButton: '#btn-close-drawer',
        openReviewButton: '#btn-open-review',
        latestPreviewPill: '#pill-latest-preview',
        drawerCountBadge: '#drawer-count-badge',
        nextStepPromptElement: '#next-step-prompt',
        latestCardElement: '#latest-page-card',
        sequenceSwitcherElement: '#sequence-switcher-container',
        activeSequenceBadge: '#active-sequence-badge',
        toggleResultsButton: '#btn-toggle-results',
        resultsDisplay: '#results-display',
        trayElement: '#filmstrip-tray',
        carouselElement: '#book-carousel',
        carouselDotsElement: '#book-carousel-dots',
        metricsElement: '#metrics-container',
        statusElement: '#status-panel',
        analyzeButton: '#btn-analyze',
        clearButton: '#btn-clear',
        cameraInput: '#camera-input',
        fileInput: '#file-input',
        apiEndpoint: '/api/analyze-book',
        getHeaders: () => {
          const secret = sessionStorage.getItem('storyreader_auth') || authSecret;
          return secret ? { Authorization: `Bearer ${secret}` } : {};
        },
      });

      const apiClient = createDefaultApiClient();

      const app = new StoryReaderApp({
        getElementById: (id) => document.getElementById(id),
        audioManager,
        cameraTray,
        apiClient,
      });

      window.__storyReaderApp = app;
      window.__audioManager = audioManager;
      window.__cameraTrayUI = cameraTray;
    }
  });
}
