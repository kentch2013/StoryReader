/**
 * StoryReader - Full SPA Orchestration Engine (Module 6)
 * Orchestrates camera scanning, book chunking, push-to-talk audio,
 * answer evaluation, celebratory feedback, and multi-chunk story progression.
 */

import { SafariAudioManager } from './audio_manager.js';
import { CameraTrayUI } from './camera_tray.js';
import { SessionQuestionTracker } from './session_question_tracker.js';

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
  constructor({ getElementById, audioManager, cameraTray, apiClient, storage, sessionQuestionTracker } = {}) {
    this.getElementById = getElementById || (typeof document !== 'undefined' ? (id) => document.getElementById(id) : () => null);
    this.audioManager = audioManager || null;
    this.cameraTray = cameraTray || null;
    this.apiClient = apiClient || null;
    this.storage = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    this.sessionQuestionTracker = sessionQuestionTracker || new SessionQuestionTracker({ storage: this.storage });
    this._actionLock = false;

    // Session state
    this.state = APP_STATE.SCAN;
    this.currentChunkIndex = 0;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.bookData = null;
    this.transcript = '';
    this.transcriptAlternatives = [];
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

      // Top menu & saved books elements
      btnSavedBooks: this.getElementById('btn-saved-books'),
      savedBooksModal: this.getElementById('saved-books-modal'),
      savedBooksBackdrop: this.getElementById('saved-books-backdrop'),
      btnCloseSavedModal: this.getElementById('btn-close-saved-modal'),
      btnSaveCurrentBook: this.getElementById('btn-save-current-book'),
      savedBooksList: this.getElementById('saved-books-list'),

      // Drawer questions elements
      drawerQuestionsSection: this.getElementById('drawer-questions-section'),
      drawerQuestionsList: this.getElementById('drawer-questions-list'),

      // Question reading & chapter progression controls
      btnSpeakLookout: this.getElementById('btn-speak-lookout'),
      btnAskQuestionDirect: this.getElementById('btn-ask-question-direct'),
      btnPrevChapterLookout: this.getElementById('btn-prev-chapter-lookout'),
      btnNextChapterLookout: this.getElementById('btn-next-chapter-lookout'),
      chapterIndicatorLookout: this.getElementById('chapter-indicator-lookout'),

      btnSpeakQuestion: this.getElementById('btn-speak-question'),
      btnPrevChapterCheckin: this.getElementById('btn-prev-chapter-checkin'),
      btnNextChapterCheckin: this.getElementById('btn-next-chapter-checkin'),
      chapterIndicatorCheckin: this.getElementById('chapter-indicator-checkin'),
      checkinChapterBadge: this.getElementById('checkin-chapter-badge'),

      btnStartQuestionsOutloud: this.getElementById('btn-start-questions-outloud'),
    };

    this._bindEvents();

    if (this.cameraTray) {
      this.cameraTray.isQuestionReadyForPage = (index, page) => {
        return this.hasQuestionForPage(index, page);
      };
      this.cameraTray.isQuestionCompleted = (index, page) => {
        return this.isPageQuestionCompleted(index, page);
      };
      this.cameraTray.onAskPageQuestion = (page, index) => {
        this.askQuestionsAboutPage(index, page);
      };
      this.cameraTray.onActivePageChange = (newIndex) => {
        if (this.activePageIndex !== newIndex) {
          if (this.audioManager) {
            this.audioManager.cancelListening();
            this.audioManager.cancelSpeech();
          }
          if (typeof document !== 'undefined') {
            document.querySelectorAll('.slide-question-card').forEach((el) => {
              el.style.display = 'none';
            });
          }
        }
      };
      this.cameraTray.onAnalyzeSuccess = async (data) => {
        await this.onAnalyzeComplete(data);
      };
      this.cameraTray.onStartReading = (data) => {
        this.setBookData(data);
        this.transitionTo(APP_STATE.LOOKOUT);
      };
    }

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
        completedQuestions: this.sessionQuestionTracker ? this.sessionQuestionTracker.serialize() : null,
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
        if (session.completedQuestions && this.sessionQuestionTracker) {
          this.sessionQuestionTracker.restore(session.completedQuestions);
        }
        this._updateDrawerQuestions();
        this.transitionTo(session.state);
        return true;
      }
    } catch (_) {}
    return false;
  }

  _bindEvents() {
    // Automatically enable sound and microphone on any user interaction without requiring an enable button
    if (typeof document !== 'undefined') {
      const autoUnlockAudio = () => {
        if (this.audioManager && !this.audioManager.isUnlocked) {
          this.audioManager.unlock().catch(() => {});
        }
        if (this.elements.btnStartAudio) {
          this.elements.btnStartAudio.classList?.add('audio-active');
          this.elements.btnStartAudio.setAttribute?.('aria-pressed', 'true');
          this.elements.btnStartAudio.title = 'Sound & Speech Active';
        }
      };
      document.addEventListener('pointerdown', autoUnlockAudio, { once: true });
      document.addEventListener('click', autoUnlockAudio, { once: true });
    }

    this.elements.btnStartAudio?.addEventListener('click', () => this.handleStartAudio());
    this.elements.btnAnalyze?.addEventListener('click', () => {
      if (this.cameraTray?.handleAnalyze && !this.cameraTray.isAnalyzing) {
        return;
      }
      this.handleAnalyzeBook();
    });
    this.elements.btnDoneReading?.addEventListener('click', () => this.handleDoneReading());
    this.elements.btnCheckAnswer?.addEventListener('click', () => this.handleCheckAnswer());
    this.elements.btnRetrySpeech?.addEventListener('click', () => this.handleRetryAttempt());
    this.elements.btnNextChunk?.addEventListener('click', () => this.handleNextChunk());
    this.elements.btnRestart?.addEventListener('click', () => this.handleRestart());

    // Top menu & Saved books modal events
    this.elements.btnSavedBooks?.addEventListener('click', () => this.openSavedBooksModal());
    this.elements.btnCloseSavedModal?.addEventListener('click', () => this.closeSavedBooksModal());
    this.elements.savedBooksBackdrop?.addEventListener('click', () => this.closeSavedBooksModal());
    this.elements.btnSaveCurrentBook?.addEventListener('click', () => this.saveCurrentBook());

    // Question reading & chapter progression controls
    this.elements.btnSpeakLookout?.addEventListener('click', () => this.speakLookoutClue());
    this.elements.btnAskQuestionDirect?.addEventListener('click', () => this.askQuestionDirect());
    this.elements.btnPrevChapterLookout?.addEventListener('click', () => this.prevChapter());
    this.elements.btnNextChapterLookout?.addEventListener('click', () => this.nextChapter());

    this.elements.btnSpeakQuestion?.addEventListener('click', () => this.speakCheckinQuestion());
    this.elements.btnPrevChapterCheckin?.addEventListener('click', () => this.prevChapter());
    this.elements.btnNextChapterCheckin?.addEventListener('click', () => this.nextChapter());

    this.elements.btnStartQuestionsOutloud?.addEventListener('click', () => this.startQuestionsFromDrawer());

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

  getChunkForPageNumber(pageNum) {
    const book = this.bookData || this.cameraTray?.lastAnalysisData;
    if (!book || !Array.isArray(book.chunks) || book.chunks.length === 0) {
      return null;
    }
    const match = book.chunks.find((c) => {
      if (!c.page_range) return false;
      const digits = c.page_range.match(/(\d+)(?:\s*-\s*(\d+))?/);
      if (digits) {
        const start = parseInt(digits[1], 10);
        const end = digits[2] ? parseInt(digits[2], 10) : start;
        return pageNum >= start && pageNum <= end;
      }
      return false;
    });
    if (match) return match;

    const byId = book.chunks.find((c) => c.chunk_id === pageNum);
    if (byId) return byId;

    const totalChunks = book.chunks.length;
    const totalPages = this.cameraTray?.state?.pages?.length || totalChunks;
    const idx = Math.min(Math.max(0, Math.floor(((pageNum - 1) / Math.max(1, totalPages)) * totalChunks)), totalChunks - 1);
    return book.chunks[idx] || null;
  }

  hasQuestionForPage(pageIndex, page) {
    if (!this.bookData && this.cameraTray?.lastAnalysisData) {
      this.bookData = this.cameraTray.lastAnalysisData;
    }
    const pageNum = page?.pageNumber || (pageIndex + 1);
    const chunk = this.getChunkForPageNumber(pageNum);
    return Boolean(chunk && chunk.checkin_question && chunk.checkin_question.trim().length > 0);
  }

  setBookData(data) {
    this.bookData = data;
    if (this.cameraTray) {
      this.cameraTray.lastAnalysisData = data;
    }
    this._persistSession();
    this._updateDrawerQuestions();
    if (this.cameraTray?.renderCarousel) {
      this.cameraTray.renderCarousel();
    }
    if (this.cameraTray?.updateQuestionButtonStates) {
      this.cameraTray.updateQuestionButtonStates();
    }
  }

  setTranscript(text, alternatives = null) {
    this.transcript = text || '';
    if (Array.isArray(alternatives)) {
      this.transcriptAlternatives = alternatives;
    }
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

    // Turn off camera when in chapters, questions, evaluation, feedback or complete panels.
    // Keep camera active only when on the main scan panel.
    if (nextState !== APP_STATE.SCAN) {
      if (this.cameraTray && typeof this.cameraTray.stopCamera === 'function') {
        this.cameraTray.stopCamera();
      }
    } else {
      if (this.cameraTray && typeof this.cameraTray.startCamera === 'function') {
        const isDrawerOpen = typeof this.cameraTray.isDrawerOpen === 'function' ? this.cameraTray.isDrawerOpen() : false;
        if (!isDrawerOpen) {
          this.cameraTray.startCamera(this.cameraTray.videoElement);
        }
      }
    }

    this._persistSession();
  }

  renderLookout() {
    const chunk = this.getCurrentChunk();
    if (!chunk) return;

    const total = this.bookData?.chunks?.length || 1;
    const chIdx = this.currentChunkIndex + 1;

    if (this.elements.chunkBadge) {
      this.elements.chunkBadge.textContent = chunk.page_range
        ? `Chapter ${chIdx}: ${chunk.page_range}`
        : `Chapter ${chIdx}`;
    }

    if (this.elements.chapterIndicatorLookout) {
      this.elements.chapterIndicatorLookout.textContent = `Chapter ${chIdx} of ${total}`;
    }

    if (this.elements.btnPrevChapterLookout) {
      this.elements.btnPrevChapterLookout.disabled = this.currentChunkIndex === 0;
    }

    if (this.elements.btnNextChapterLookout) {
      this.elements.btnNextChapterLookout.disabled = this.currentChunkIndex >= total - 1;
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

    const total = this.bookData?.chunks?.length || 1;
    const chIdx = this.currentChunkIndex + 1;

    if (this.elements.checkinChapterBadge) {
      this.elements.checkinChapterBadge.textContent = `Chapter ${chIdx}`;
    }

    if (this.elements.chunkBadge) {
      this.elements.chunkBadge.textContent = chunk.page_range
        ? `Chapter ${chIdx}: ${chunk.page_range}`
        : `Chapter ${chIdx}`;
    }

    if (this.elements.chapterIndicatorCheckin) {
      this.elements.chapterIndicatorCheckin.textContent = `Chapter ${chIdx} of ${total}`;
    }

    if (this.elements.btnPrevChapterCheckin) {
      this.elements.btnPrevChapterCheckin.disabled = this.currentChunkIndex === 0;
    }

    if (this.elements.btnNextChapterCheckin) {
      this.elements.btnNextChapterCheckin.disabled = this.currentChunkIndex >= total - 1;
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
        this.elements.btnStartAudio.classList?.add('audio-active');
        this.elements.btnStartAudio.setAttribute?.('aria-pressed', 'true');
        this.elements.btnStartAudio.title = 'Sound & Speech Active';
      }
      try {
        await this.audioManager.speak('Sound is on! Tap the question button to hear questions.');
      } catch (_) {}
    }
  }

  async handleAnalyzeBook() {
    if (this._actionLock) return;

    if (this.audioManager && !this.audioManager.isUnlocked) {
      this.audioManager.unlock().catch(() => {});
    }
    if (this.elements.btnStartAudio) {
      this.elements.btnStartAudio.classList?.add('audio-active');
      this.elements.btnStartAudio.setAttribute?.('aria-pressed', 'true');
      this.elements.btnStartAudio.title = 'Sound & Speech Active';
    }

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

    let pauseTimer = null;

    try {
      await this.audioManager.startListening({
        onTranscript: (t) => {
          const text = typeof t === 'string' ? t : (t?.full || t?.final || t?.interim || '');
          if (text) {
            this.setTranscript(text);
            clearTimeout(pauseTimer);
            pauseTimer = setTimeout(() => {
              if (this.state === APP_STATE.RECORDING || this.state === APP_STATE.CHECKIN) {
                this.handleCheckAnswer();
              }
            }, 500);
          }
        },
        onInterim: (t) => {
          if (this.elements.transcriptText && t) this.elements.transcriptText.textContent = t;
        },
        onFinal: (t) => {
          if (t) {
            this.setTranscript(t);
            clearTimeout(pauseTimer);
            pauseTimer = setTimeout(() => {
              if (this.state === APP_STATE.RECORDING || this.state === APP_STATE.CHECKIN) {
                this.handleCheckAnswer();
              }
            }, 500);
          }
        },
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
        const stopRes = await this.audioManager.stopListening();
        const finalTranscript = typeof stopRes === 'string' ? stopRes : stopRes?.transcript;
        const alts = Array.isArray(stopRes?.alternatives) ? stopRes.alternatives : [];
        if (finalTranscript) {
          this.setTranscript(finalTranscript, alts);
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
      transcript_alternatives: this.transcriptAlternatives || [],
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

      if (result.status === 'mastered' || result.resolved) {
        if (chunk?.checkin_question) {
          this.markQuestionCompleted(chunk.checkin_question, {
            chunkId: chunk.chunk_id,
            pageIndex: this.activePageIndex,
          });
        }
        if (this.activePageIndex !== null && this.activePageIndex !== undefined) {
          this.onPageQuestionDone(this.activePageIndex);
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
    if (this.sessionQuestionTracker) {
      this.sessionQuestionTracker.clear();
    }
    this.bookData = null;
    this.currentChunkIndex = 0;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;
    this.hideError();
    this._updateDrawerQuestions();

    if (this.cameraTray?.reset) {
      this.cameraTray.reset();
    }

    this.transitionTo(APP_STATE.SCAN);
  }

  speakLookoutClue() {
    const chunk = this.getCurrentChunk();
    const text = chunk?.lookout_prompt || 'Watch for what happens in this part of the story!';
    if (this.audioManager) {
      this.audioManager.speak(text);
    }
  }

  speakCheckinQuestion() {
    const chunk = this.getCurrentChunk();
    const text = chunk?.checkin_question || 'What happened in the story?';
    if (this.audioManager) {
      this.audioManager.speak(text);
    }
  }

  askQuestionDirect() {
    const drawer = this.getElementById('review-drawer');
    const backdrop = this.getElementById('drawer-backdrop');
    if (drawer) {
      drawer.classList?.add('collapsed');
      if (drawer.style) drawer.style.display = 'none';
    }
    if (backdrop && backdrop.style) backdrop.style.display = 'none';

    this.transitionTo(APP_STATE.CHECKIN);
    this.speakCheckinQuestion();
  }

  startQuestionsFromDrawer() {
    this.askQuestionDirect();
  }

  goToChapter(targetIndex) {
    const total = this.bookData?.chunks?.length || 0;
    if (targetIndex < 0 || targetIndex >= total) return;
    this.currentChunkIndex = targetIndex;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;

    const drawer = this.getElementById('review-drawer');
    const backdrop = this.getElementById('drawer-backdrop');
    if (drawer) {
      drawer.classList?.add('collapsed');
      if (drawer.style) drawer.style.display = 'none';
    }
    if (backdrop && backdrop.style) backdrop.style.display = 'none';

    this.transitionTo(APP_STATE.LOOKOUT);
    this.speakLookoutClue();
  }

  prevChapter() {
    if (this.currentChunkIndex > 0) {
      this.goToChapter(this.currentChunkIndex - 1);
    }
  }

  nextChapter() {
    const total = this.bookData?.chunks?.length || 0;
    if (this.currentChunkIndex + 1 < total) {
      this.goToChapter(this.currentChunkIndex + 1);
    }
  }

  async onAnalyzeComplete(data) {
    if (!data) return;
    this.setBookData(data);
    if (this.cameraTray) {
      this.cameraTray.lastAnalysisData = data;
      if (typeof this.cameraTray.updateQuestionButtonStates === 'function') {
        this.cameraTray.updateQuestionButtonStates();
      }
    }
    // When the question button is available and active (because the analysis was properly processed and is ready),
    // read the question, wait for the answer for the first uncompleted page:
    const pages = this.cameraTray?.pages || this.cameraTray?.state?.pages || [];
    let targetIdx = -1;
    for (let i = 0; i < pages.length; i++) {
      if (this.hasQuestionForPage(i, pages[i]) && !this.isPageQuestionCompleted(i, pages[i])) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx !== -1) {
      await this.askQuestionsAboutPage(targetIdx, pages[targetIdx]);
    }
  }

  isPageQuestionCompleted(pageIndex, page) {
    if (!this.sessionQuestionTracker) return false;
    const pageNum = page?.pageNumber || (pageIndex + 1);
    const chunk = this.getChunkForPageNumber(pageNum);
    if (!chunk || !chunk.checkin_question) return false;
    return this.sessionQuestionTracker.isCompleted(chunk.checkin_question);
  }

  markQuestionCompleted(questionText, metadata = {}) {
    if (!this.sessionQuestionTracker) return;
    this.sessionQuestionTracker.markCompleted(questionText, metadata);
    this._persistSession();
    if (this.cameraTray?.updateQuestionButtonStates) {
      this.cameraTray.updateQuestionButtonStates();
    }
    this._updateDrawerQuestions();
  }

  getNextUnansweredPageIndex(fromIndex = 0) {
    const pages = this.cameraTray?.state?.pages || this.cameraTray?.pages || [];
    for (let i = fromIndex + 1; i < pages.length; i++) {
      const p = pages[i];
      if (this.hasQuestionForPage(i, p) && !this.isPageQuestionCompleted(i, p)) {
        return i;
      }
    }
    return -1;
  }

  async askQuestionsAboutPage(pageIndex, page) {
    if (!this.bookData && this.cameraTray?.lastAnalysisData) {
      this.bookData = this.cameraTray.lastAnalysisData;
    }
    this.activePageIndex = pageIndex;
    const pageNum = page?.pageNumber || (pageIndex + 1);

    // 1. Only allow asking if question is ready for this page!
    if (!this.hasQuestionForPage(pageIndex, page)) {
      return;
    }

    // 2. Unlock audio coordinator in background without awaiting (preserves synchronous user gesture for speech)
    if (this.audioManager && !this.audioManager.isUnlocked) {
      this.audioManager.unlock().catch(() => {});
    }

    // 3. Resolve specific Gemini question for this page
    const chunk = this.getChunkForPageNumber(pageNum);
    const questionText = chunk.checkin_question;

    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;

    // 4. Present UI, speak out loud, then start waiting for child's answer
    await this._presentAndAskPageQuestion(pageIndex, pageNum, page, questionText, chunk);
  }

  async _presentAndAskPageQuestion(pageIndex, pageNum, page, questionText, chunk) {
    // Hide ALL slide cards first so ONLY the active page slide card is ever displayed and listening
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.slide-question-card').forEach((el) => {
        el.style.display = 'none';
      });
    }

    const slideId = page?.id;
    const slideCard = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-question-card-${slideId}`) : null;
    const slideStatus = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-status-${slideId}`) : null;
    const slideText = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-text-${slideId}`) : null;
    const slidePttBtn = slideId && typeof document !== 'undefined' ? document.getElementById(`btn-slide-ptt-${slideId}`) : null;
    const slideTranscriptBox = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-transcript-${slideId}`) : null;
    const slideFeedbackBox = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-feedback-${slideId}`) : null;

    if (slideCard) {
      slideCard.style.display = 'flex';
      if (slideText) {
        slideText.textContent = questionText;
        slideText.style.cursor = 'pointer';
        slideText.title = 'Tap to read question aloud again';
        slideText.onclick = () => {
          this.audioManager?.speak(questionText);
        };
      }
      if (slideStatus) {
        slideStatus.textContent = '🔊 Speaking Question...';
        slideStatus.className = 'slide-q-status speaking';
        slideStatus.onclick = null;
        slideStatus.style.cursor = 'default';
      }
      if (slideTranscriptBox) slideTranscriptBox.style.display = 'none';
      if (slideFeedbackBox) slideFeedbackBox.style.display = 'none';
    }

    // Also update review drawer question card if present
    this._presentDrawerPageQuestion(pageIndex, pageNum, questionText, chunk);

    // Speak question aloud synchronously on user tap (reads only question text, no question number or preamble)
    let speechSucceeded = false;
    if (this.audioManager) {
      try {
        const speechRes = await this.audioManager.speak(questionText);
        speechSucceeded = Boolean(speechRes?.completed);
      } catch (err) {
        console.warn('Speech synthesis warning:', err);
      }
    }

    // If speech was blocked or failed, allow user to tap status badge to speak aloud
    if (!speechSucceeded && this.audioManager?.state !== AUDIO_STATE.SPEAKING) {
      if (slideStatus) {
        slideStatus.textContent = '🔊 Tap here to speak question aloud';
        slideStatus.className = 'slide-q-status scaffold';
        slideStatus.style.cursor = 'pointer';
        slideStatus.onclick = () => {
          this._presentAndAskPageQuestion(pageIndex, pageNum, page, questionText, chunk);
        };
      }
    }

    // Automatically transition to waiting for the child's answer and enable microphone
    await this.startWaitingForAnswer(pageIndex, pageNum, page, questionText, chunk);
  }

  async startWaitingForAnswer(pageIndex, pageNum, page, questionText, chunk) {
    // Guarantee only active page card is visible
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.slide-question-card').forEach((el) => {
        el.style.display = 'none';
      });
    }

    const slideId = page?.id;
    const slideCard = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-question-card-${slideId}`) : null;
    const slideStatus = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-status-${slideId}`) : null;
    const slidePttBtn = slideId && typeof document !== 'undefined' ? document.getElementById(`btn-slide-ptt-${slideId}`) : null;
    const slideTranscriptBox = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-transcript-${slideId}`) : null;
    const slideTranscriptText = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-transcript-text-${slideId}`) : null;
    const slideFeedbackBox = slideId && typeof document !== 'undefined' ? document.getElementById(`slide-q-feedback-${slideId}`) : null;

    const drawerTranscriptBox = typeof document !== 'undefined' ? document.getElementById('drawer-q-transcript') : null;
    const drawerTranscriptText = typeof document !== 'undefined' ? document.getElementById('drawer-transcript-content') : null;
    const drawerPttBtn = typeof document !== 'undefined' ? document.getElementById('btn-drawer-ptt') : null;
    const drawerFeedback = typeof document !== 'undefined' ? document.getElementById('drawer-q-feedback') : null;

    if (slideCard) slideCard.style.display = 'flex';

    if (slideStatus) {
      slideStatus.textContent = '🎙️ Listening... (Speak your answer)';
      slideStatus.className = 'slide-q-status listening';
    }
    if (slidePttBtn) {
      slidePttBtn.classList.add('listening');
      slidePttBtn.setAttribute('aria-pressed', 'true');
      const label = slidePttBtn.querySelector('.slide-ptt-label');
      if (label) label.textContent = 'Listening... (Speak your answer)';
    }
    if (drawerPttBtn) {
      drawerPttBtn.classList.add('listening');
      drawerPttBtn.setAttribute('aria-pressed', 'true');
    }
    if (slideTranscriptBox) slideTranscriptBox.style.display = 'flex';
    if (slideTranscriptText) slideTranscriptText.textContent = 'Listening... Speak your answer now!';
    if (drawerTranscriptBox) drawerTranscriptBox.style.display = 'flex';
    if (drawerTranscriptText) drawerTranscriptText.textContent = 'Listening...';

    // Clear transcript for new answer
    this.setTranscript('');
    this._accumulatedChildAnswer = '';
    let speechSilenceTimer = null;
    let scaffoldDelayTimer = null;
    let isQuestionDone = false;
    let lastEvaluatedAnswer = '';
    let inFlightAbortController = null;

    const submitCandidateAnswer = async (textToSubmit) => {
      if (isQuestionDone) return;
      const cleanCandidate = (textToSubmit || '').trim();
      if (!cleanCandidate || cleanCandidate === lastEvaluatedAnswer) return;

      lastEvaluatedAnswer = cleanCandidate;

      // Abort prior candidate request if still in flight to prevent pipeline queueing
      if (inFlightAbortController) {
        try { inFlightAbortController.abort(); } catch (_) {}
      }
      inFlightAbortController = new AbortController();
      const currentSignal = inFlightAbortController.signal;

      // Update subtle status pill only - do NOT plaster a blocking feedback box on mid-sentence pauses
      if (slideStatus) {
        slideStatus.textContent = '🧠 Checking...';
        slideStatus.className = 'slide-q-status checking';
      }

      const diagnosticProbes = (chunk?.diagnostic_probes && Object.keys(chunk.diagnostic_probes).length > 0)
        ? chunk.diagnostic_probes
        : undefined;

      const payload = {
        child_transcript: cleanCandidate,
        checkin_question: chunk?.checkin_question || questionText,
        target_answer_concept: chunk?.target_answer_concept || '',
        scaffold_hint: chunk?.scaffold_hint || '',
        canonical_prototypes: chunk?.canonical_prototypes || [],
        keyword_clusters: chunk?.keyword_clusters || [],
        acceptable_phrasings: chunk?.acceptable_phrasings || [],
        entity_graph: chunk?.entity_graph || {},
        diagnostic_probes: diagnosticProbes,
        semantic_slots: chunk?.semantic_slots || undefined,
        hint_level_1: chunk?.hint_level_1 || '',
        hint_level_2: chunk?.hint_level_2 || '',
        story_facts: chunk?.story_facts || [],
        verbatim_page_text: chunk?.verbatim_page_text || '',
        attempt_count: this.attemptCount,
        microturn_used: this.microturnUsed,
        transcript_alternatives: this.transcriptAlternatives || [],
      };

      try {
        let result = null;
        if (chunk && chunk.target_answer_concept && this.apiClient?.evaluateAnswer) {
          result = await this.apiClient.evaluateAnswer(payload, currentSignal);
          this.activeEvaluation = result;
        } else {
          const isMastered = cleanCandidate.split(/\s+/).length >= 2;
          result = {
            status: isMastered ? 'mastered' : 'needs_scaffold',
            spoken_feedback: isMastered ? 'Awesome answer! That is right!' : 'Tell me what you see!',
            resolved: isMastered,
          };
        }

        if (isQuestionDone || currentSignal.aborted) return;

        const isMastered = Boolean(result.status === 'mastered' || result.resolved);
        const spokenFeedback = result.spoken_feedback || (isMastered ? 'Awesome job! That is right!' : '');

        if (isMastered) {
          isQuestionDone = true;
          this.markQuestionCompleted(chunk?.checkin_question || questionText, {
            chunkId: chunk?.chunk_id,
            pageIndex,
            pageNum,
          });
          clearTimeout(speechSilenceTimer);
          clearTimeout(scaffoldDelayTimer);

          if (slideStatus) {
            slideStatus.textContent = '🎉 That is right!';
            slideStatus.className = 'slide-q-status success';
          }
          if (slideFeedbackBox) {
            slideFeedbackBox.style.display = 'block';
            slideFeedbackBox.className = 'slide-q-feedback success';
            slideFeedbackBox.innerHTML = `🎉 <strong>Super Reader!</strong> ${spokenFeedback}`;
          }
          if (drawerFeedback) {
            drawerFeedback.style.display = 'block';
            drawerFeedback.className = 'active-q-feedback success';
            drawerFeedback.innerHTML = `🎉 <strong>Super Reader!</strong> ${spokenFeedback}`;
          }
          this.triggerConfetti();

          if (this.audioManager) {
            try {
              await this.audioManager.stopListening();
            } catch (_) {}
            if (spokenFeedback) {
              this.audioManager.speak(spokenFeedback);
            }
          }

          this.onPageQuestionDone(pageIndex);
          return;
        }

        // If not mastered:
        // Clear any evaluating box immediately so "checking your answer..." never lingers on screen!
        if (slideFeedbackBox && slideFeedbackBox.classList.contains('evaluating')) {
          slideFeedbackBox.style.display = 'none';
          slideFeedbackBox.textContent = '';
        }
        if (drawerFeedback && drawerFeedback.classList.contains('evaluating')) {
          drawerFeedback.style.display = 'none';
          drawerFeedback.textContent = '';
        }

        // Check if the user continued speaking since cleanCandidate was submitted
        const currentHeard = (this.transcript || this._accumulatedChildAnswer || '').trim();
        if (currentHeard !== cleanCandidate) {
          if (slideStatus) {
            slideStatus.textContent = '👂 Hearing you...';
            slideStatus.className = 'slide-q-status listening';
          }
          return;
        }

        // User paused on an incomplete answer, but we keep listening for more!
        if (slideStatus) {
          slideStatus.textContent = '🎙️ Listening... keep going!';
          slideStatus.className = 'slide-q-status listening';
        }

        // Only after an extended silence (3.5s) without any further speech, provide the clue
        clearTimeout(scaffoldDelayTimer);
        scaffoldDelayTimer = setTimeout(() => {
          if (isQuestionDone) return;
          const checkHeard = (this.transcript || this._accumulatedChildAnswer || '').trim();
          if (checkHeard !== cleanCandidate) return;

          const clue = result.follow_up_prompt || chunk?.scaffold_hint || 'Look closely at the story and tell me what you see!';
          if (slideStatus) {
            slideStatus.textContent = '💡 Try again!';
            slideStatus.className = 'slide-q-status scaffold';
          }
          if (slideFeedbackBox) {
            slideFeedbackBox.style.display = 'block';
            slideFeedbackBox.className = 'slide-q-feedback scaffold';
            slideFeedbackBox.innerHTML = `💡 <strong>Clue:</strong> ${clue}<br><small>Listening again for your answer...</small>`;
          }
          if (drawerFeedback) {
            drawerFeedback.style.display = 'block';
            drawerFeedback.className = 'active-q-feedback scaffold';
            drawerFeedback.innerHTML = `💡 <strong>Clue:</strong> ${clue}<br><small>Listening again for your answer...</small>`;
          }
          if (this.audioManager) {
            this.audioManager.speak(`Good try! Here is a clue: ${clue}`);
          }
          this.attemptCount++;
        }, 3500);

      } catch (err) {
        if (err.name === 'AbortError' || currentSignal.aborted) {
          return;
        }
        console.warn('Evaluation attempt notice:', err);
        if (slideStatus) {
          slideStatus.textContent = '🎙️ Listening...';
          slideStatus.className = 'slide-q-status listening';
        }
        if (slideFeedbackBox && slideFeedbackBox.classList.contains('evaluating')) {
          slideFeedbackBox.style.display = 'none';
        }
        if (drawerFeedback && drawerFeedback.classList.contains('evaluating')) {
          drawerFeedback.style.display = 'none';
        }
      }
    };

    if (this.audioManager) {
      try {
        await this.audioManager.startListening({
          onTranscript: ({ interim, final, full }) => {
            if (isQuestionDone) return;
            const heard = (full || final || interim || '').trim();
            if (heard) {
              this._accumulatedChildAnswer = heard;
              this.setTranscript(heard);
              if (slideTranscriptText) slideTranscriptText.textContent = heard;
              if (drawerTranscriptText) drawerTranscriptText.textContent = heard;

              // Hide previous feedback/scaffold card immediately when user speaks new words
              if (slideFeedbackBox) slideFeedbackBox.style.display = 'none';
              if (drawerFeedback) drawerFeedback.style.display = 'none';

              if (slideStatus) {
                slideStatus.textContent = '👂 Hearing you...';
                slideStatus.className = 'slide-q-status listening';
              }

              // Reset pause and scaffold timers on every new word
              clearTimeout(speechSilenceTimer);
              clearTimeout(scaffoldDelayTimer);

              // Snappy pause detection (500ms):
              // As soon as user pauses, immediately submit that answer to see if it is correct.
              // Don't hesitate. But keep listening for a more complete answer!
              speechSilenceTimer = setTimeout(() => {
                submitCandidateAnswer(heard);
              }, 500);
            }
          },
          onError: (err) => {
            console.warn('Speech recognition notice:', err);
          },
        });
      } catch (err) {
        console.warn('Microphone activation notice:', err);
      }
    }

    if (slidePttBtn) {
      slidePttBtn.onclick = (e) => {
        e.preventDefault();
        clearTimeout(speechSilenceTimer);
        const text = (this.transcript || this._accumulatedChildAnswer || '').trim();
        if (text) submitCandidateAnswer(text);
      };
    }
    if (drawerPttBtn) {
      drawerPttBtn.onclick = (e) => {
        e.preventDefault();
        clearTimeout(speechSilenceTimer);
        const text = (this.transcript || this._accumulatedChildAnswer || '').trim();
        if (text) submitCandidateAnswer(text);
      };
    }
  }

  async evaluatePageAnswer(pageIndex, pageNum, page, questionText, chunk, uiRefs = {}) {
    const { slideStatus, slideFeedbackBox, slideTranscriptText } = uiRefs;
    const drawerFeedback = typeof document !== 'undefined' ? document.getElementById('drawer-q-feedback') : null;

    const transcript = (this.transcript || this._accumulatedChildAnswer || '').trim();
    if (!transcript) {
      if (slideStatus) {
        slideStatus.textContent = '❓ Waiting for answer...';
        slideStatus.className = 'slide-q-status scaffold';
      }
      if (slideTranscriptText) slideTranscriptText.textContent = "(Take your time, speak when you're ready!)";
      if (this.audioManager) {
        this.audioManager.speak("I didn't hear your answer yet. Tell me what happened on this page!");
      }
      setTimeout(() => {
        this.startWaitingForAnswer(pageIndex, pageNum, page, questionText, chunk);
      }, 2500);
      return;
    }

    if (slideStatus) {
      slideStatus.textContent = '🧠 Checking your answer...';
      slideStatus.className = 'slide-q-status checking';
    }
    if (slideFeedbackBox) {
      slideFeedbackBox.style.display = 'block';
      slideFeedbackBox.className = 'slide-q-feedback evaluating';
      slideFeedbackBox.textContent = '🧠 Checking your answer...';
    }
    if (drawerFeedback) {
      drawerFeedback.style.display = 'block';
      drawerFeedback.className = 'active-q-feedback evaluating';
      drawerFeedback.textContent = '🧠 Checking your answer...';
    }

    let isMastered = false;
    let spokenFeedback = '';
    let followUpPrompt = '';

    if (chunk && chunk.target_answer_concept && this.apiClient?.evaluateAnswer) {
      const payload = {
        child_transcript: transcript,
        checkin_question: chunk.checkin_question || questionText,
        target_answer_concept: chunk.target_answer_concept || '',
        scaffold_hint: chunk.scaffold_hint || '',
        canonical_prototypes: chunk.canonical_prototypes || [],
        keyword_clusters: chunk.keyword_clusters || [],
        acceptable_phrasings: chunk.acceptable_phrasings || [],
        entity_graph: chunk.entity_graph || {},
        diagnostic_probes: chunk.diagnostic_probes || {},
        semantic_slots: chunk.semantic_slots || undefined,
        hint_level_1: chunk.hint_level_1 || '',
        hint_level_2: chunk.hint_level_2 || '',
        story_facts: chunk.story_facts || [],
        verbatim_page_text: chunk.verbatim_page_text || '',
        attempt_count: this.attemptCount,
        microturn_used: this.microturnUsed,
        transcript_alternatives: this.transcriptAlternatives || [],
      };

      try {
        const result = await this.apiClient.evaluateAnswer(payload);
        this.activeEvaluation = result;
        isMastered = Boolean(result.status === 'mastered' || result.resolved);
        spokenFeedback = result.spoken_feedback || (isMastered ? 'Awesome job! That is right!' : '');
        followUpPrompt = result.follow_up_prompt || chunk.scaffold_hint || '';
      } catch (err) {
        isMastered = transcript.split(/\s+/).length >= 2;
        spokenFeedback = isMastered ? 'Great reading! You noticed what happened!' : 'Tell me a little more!';
      }
    } else {
      isMastered = transcript.split(/\s+/).length >= 2;
      spokenFeedback = isMastered ? 'Awesome answer! You are a super story reader!' : 'Tell me what you see!';
    }

    if (isMastered) {
      this.markQuestionCompleted(chunk?.checkin_question || questionText, {
        chunkId: chunk?.chunk_id,
        pageIndex,
      });
      if (slideStatus) {
        slideStatus.textContent = '';
        slideStatus.style.display = 'none';
      }
      if (slideFeedbackBox) {
        slideFeedbackBox.className = 'slide-q-feedback success';
        slideFeedbackBox.innerHTML = `🎉 <strong>Super Reader!</strong> ${spokenFeedback}`;
      }
      if (drawerFeedback) {
        drawerFeedback.className = 'active-q-feedback success';
        drawerFeedback.innerHTML = `🎉 <strong>Super Reader!</strong> ${spokenFeedback}`;
      }
      this.triggerConfetti();
      if (this.audioManager && spokenFeedback) {
        this.audioManager.speak(spokenFeedback);
      }

      this.onPageQuestionDone(pageIndex);
    } else {
      const clue = followUpPrompt || chunk?.scaffold_hint || 'Look at the picture closely and tell me what you see!';
      if (slideStatus) {
        slideStatus.textContent = '💡 Try again!';
        slideStatus.className = 'slide-q-status scaffold';
      }
      if (slideFeedbackBox) {
        slideFeedbackBox.className = 'slide-q-feedback scaffold';
        slideFeedbackBox.innerHTML = `💡 <strong>Clue:</strong> ${clue}<br><small>Listening again for your answer...</small>`;
      }
      if (drawerFeedback) {
        drawerFeedback.className = 'active-q-feedback scaffold';
        drawerFeedback.innerHTML = `💡 <strong>Clue:</strong> ${clue}<br><small>Listening again for your answer...</small>`;
      }
      if (this.audioManager) {
        this.audioManager.speak(`Good try! Here is a clue: ${clue}`);
      }
      this.attemptCount++;
      setTimeout(() => {
        this.startWaitingForAnswer(pageIndex, pageNum, page, questionText, chunk);
      }, 3000);
    }
  }

  _presentDrawerPageQuestion(pageIndex, pageNum, customQuestion = '', customChunk = null) {
    const section = this.elements.drawerQuestionsSection;
    const list = this.elements.drawerQuestionsList;
    const chunk = customChunk || this.getCurrentChunk();

    if (section && section.style) {
      section.style.display = 'block';
    }

    const questionText = customQuestion || chunk?.checkin_question || 'What happened on this page?';

    if (list) {
      const activeCardHtml = `
        <div class="drawer-active-page-question" id="drawer-active-page-question">
          <div class="active-q-header">
            <button type="button" class="touch-btn btn-speak-active-q" id="btn-speak-drawer-q" aria-label="Listen to question again" title="Listen Again">
              🔊 Listen
            </button>
          </div>
          <p class="active-q-text">${questionText}</p>
          <div class="active-q-mic-bar">
            <button type="button" class="touch-btn btn-active-ptt" id="btn-drawer-ptt" aria-label="Hold or tap to speak answer" aria-pressed="false">
              <span class="active-ptt-icon">🎙️</span>
              <span class="active-ptt-label">Listening...</span>
            </button>
            <button type="button" class="touch-btn btn-fullscreen-q" id="btn-open-fullscreen-q" aria-label="Open Full Screen Reading Mode">
              📖 Full Screen
            </button>
          </div>
          <div class="active-q-transcript" id="drawer-q-transcript" style="display: none;">
            <span>🗣️ </span><span id="drawer-transcript-content">Listening...</span>
          </div>
          <div class="active-q-feedback" id="drawer-q-feedback" style="display: none;"></div>
        </div>
      `;

      this._updateDrawerQuestions();
      const existing = list.querySelector('#drawer-active-page-question');
      if (existing) existing.remove();
      if (typeof list.insertAdjacentHTML === 'function') {
        list.insertAdjacentHTML('afterbegin', activeCardHtml);
      } else {
        list.innerHTML = activeCardHtml + (list.innerHTML || '');
      }

      const speakBtn = list.querySelector('#btn-speak-drawer-q');
      speakBtn?.addEventListener('click', () => {
        if (this.audioManager) {
          this.audioManager.speak(questionText);
        }
      });

      const fullScreenBtn = list.querySelector('#btn-open-fullscreen-q');
      fullScreenBtn?.addEventListener('click', () => {
        this.askQuestionDirect();
      });
    }
  }

  async evaluateDrawerAnswer(pageIndex, feedbackBox) {
    const chunk = this.getCurrentChunk();
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
      attempt_count: this.attemptCount,
      microturn_used: this.microturnUsed,
    };

    try {
      const result = await this.apiClient.evaluateAnswer(payload);
      this.activeEvaluation = result;

      if (result.status === 'mastered' || result.resolved) {
        if (feedbackBox) {
          feedbackBox.className = 'active-q-feedback success';
          feedbackBox.innerHTML = `🎉 <strong>Super Reader!</strong> ${result.spoken_feedback || 'Awesome answer!'}`;
        }
        if (this.audioManager && result.spoken_feedback) {
          this.audioManager.speak(result.spoken_feedback);
        }
        this.triggerConfetti();

        // When question is done, auto swipe to next page on the right
        this.onPageQuestionDone(pageIndex);
      } else {
        const clue = result.follow_up_prompt || chunk?.scaffold_hint || 'Listen closely to the story clue!';
        if (feedbackBox) {
          feedbackBox.className = 'active-q-feedback scaffold';
          feedbackBox.innerHTML = `💡 <strong>Clue:</strong> ${clue}<br><small>Hold the mic to try again!</small>`;
        }
        if (this.audioManager) {
          this.audioManager.speak(`Here is your clue: ${clue}`);
        }
      }
    } catch (err) {
      if (feedbackBox) {
        feedbackBox.className = 'active-q-feedback error';
        feedbackBox.textContent = `Evaluation failed: ${err.message}`;
      }
    }
  }

  onPageQuestionDone(pageIndex) {
    const pageNum = this.cameraTray?.state?.pages?.[pageIndex]?.pageNumber || (pageIndex + 1);
    const currentChunk = this.getChunkForPageNumber(pageNum);
    if (currentChunk?.checkin_question) {
      this.markQuestionCompleted(currentChunk.checkin_question, {
        chunkId: currentChunk.chunk_id,
        pageIndex,
        pageNumber: pageNum,
      });
    }

    const nextIdx = this.getNextUnansweredPageIndex(pageIndex);

    const proceedToNext = () => {
      // Hide all slide cards before swiping so ONLY active page can listen
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.slide-question-card').forEach((el) => {
          el.style.display = 'none';
        });
      }

      if (nextIdx !== -1) {
        if (this.cameraTray?.scrollToPageIndex) {
          this.cameraTray.scrollToPageIndex(nextIdx);
        } else if (this.cameraTray?.swipeToNextPage) {
          this.cameraTray.swipeToNextPage(nextIdx);
        }

        this.activePageIndex = nextIdx;
        this.currentChunkIndex = Math.min(nextIdx, (this.bookData?.chunks?.length || 1) - 1);

        if (this.elements.statusBadge) {
          this.elements.statusBadge.textContent = `📖 Swiped to Page ${nextIdx + 1}!`;
        }
        const nextSlide = this.cameraTray?.state?.pages?.[nextIdx];
        if (nextSlide) {
          setTimeout(() => {
            this.askQuestionsAboutPage(nextIdx, nextSlide);
          }, 350);
        }
      } else {
        if (this.elements.statusBadge) {
          this.elements.statusBadge.textContent = `🏆 Finished all questions in story!`;
        }
        if (this.audioManager) {
          this.audioManager.speak("You finished all the questions! Great job reading this story!");
        }
      }
    };

    setTimeout(proceedToNext, 650);
  }

  _updateDrawerQuestions() {
    const section = this.elements.drawerQuestionsSection;
    const list = this.elements.drawerQuestionsList;
    if (!section || !list) return;

    const chunks = this.bookData?.chunks;
    const hasPages = this.cameraTray?.state?.pages?.length > 0;

    if (!Array.isArray(chunks) || chunks.length === 0) {
      if (hasPages) {
        if (section.style) section.style.display = 'block';
        list.innerHTML = `
          <div class="drawer-unready-banner">
            <p class="unready-text">📖 You captured book pages! Tap below to analyze with Gemini and unlock specific story questions:</p>
            <button type="button" class="touch-btn btn-primary btn-cta btn-drawer-analyze" id="btn-drawer-analyze">
              🚀 Analyze Story & Create Questions
            </button>
          </div>
        `;
        const analyzeBtn = list.querySelector('#btn-drawer-analyze');
        analyzeBtn?.addEventListener('click', () => {
          this.handleAnalyzeBook();
        });
      } else {
        if (section.style) section.style.display = 'none';
        list.innerHTML = '';
      }
      return;
    }

    if (section.style) section.style.display = 'block';
    list.innerHTML = chunks.map((chunk, idx) => {
      const isCompleted = this.sessionQuestionTracker?.isCompleted(chunk.checkin_question);
      const pageInfo = chunk.page_range ? ` (${chunk.page_range})` : '';
      const prompt = chunk.lookout_prompt ? `<div class="drawer-q-item-lookout"><span class="q-label">👀 Lookout:</span> ${chunk.lookout_prompt}</div>` : '';
      const question = chunk.checkin_question ? `<div class="drawer-q-item-question"><span class="q-label">❓ Question:</span> ${chunk.checkin_question}</div>` : '';
      const hint = chunk.scaffold_hint ? `<div class="drawer-q-item-hint"><span class="q-label">💡 Clue:</span> ${chunk.scaffold_hint}</div>` : '';
      const askBtnLabel = isCompleted ? '✅ Answered' : '🗣️ Ask Out Loud';
      const askBtnDisabled = isCompleted ? 'disabled aria-disabled="true"' : '';
      const askBtnClass = isCompleted ? 'touch-btn btn-ask-this-chapter is-completed is-disabled' : 'touch-btn btn-ask-this-chapter';
      return `
        <div class="drawer-question-card ${isCompleted ? 'is-completed' : ''}" data-chunk-index="${idx}">
          <div class="drawer-q-card-header">
            <span class="drawer-q-chunk-title">📖 Chapter ${idx + 1}${pageInfo}${isCompleted ? ' ✅' : ''}</span>
            <div class="drawer-q-card-actions">
              <button type="button" class="touch-btn btn-toggle-q-card" data-chunk-index="${idx}" aria-expanded="false" title="Click to view question">
                👁️ View Questions ▾
              </button>
              <button type="button" class="${askBtnClass}" data-chapter-index="${idx}" aria-label="Ask Chapter ${idx + 1} Question Out Loud" ${askBtnDisabled}>
                ${askBtnLabel}
              </button>
            </div>
          </div>
          <div class="drawer-q-card-body" id="drawer-q-card-body-${idx}" style="display: none;">
            ${prompt}
            ${question}
            ${hint}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll?.('.btn-toggle-q-card')?.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = btn.getAttribute('data-chunk-index');
        const body = list.querySelector(`#drawer-q-card-body-${idx}`);
        if (!body) return;
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'flex' : 'none';
        btn.innerHTML = isHidden ? '🙈 Hide Questions ▴' : '👁️ View Questions ▾';
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    });

    list.querySelectorAll?.('.drawer-q-card-header')?.forEach((header) => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const card = header.closest('.drawer-question-card');
        const toggleBtn = card?.querySelector('.btn-toggle-q-card');
        toggleBtn?.click();
      });
    });

    list.querySelectorAll?.('.btn-ask-this-chapter')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-chapter-index') || '0', 10);
        this.goToChapter(idx);
        this.askQuestionDirect();
      });
    });
  }

  getSavedBooks() {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : this.storage;
      if (!storage) return [];
      const raw = storage.getItem('storyreader_saved_books_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  saveCurrentBook() {
    if (!this.bookData || !Array.isArray(this.bookData.chunks) || this.bookData.chunks.length === 0) {
      this.showError('No analyzed book questions to save yet. Snap and analyze pages first!');
      return;
    }

    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : this.storage;
      if (!storage) {
        this.showError('Storage is not available on this device.');
        return;
      }

      const savedList = this.getSavedBooks();
      const title = this.bookData.title || `Storybook (${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`;
      const newBook = {
        id: 'book_' + Date.now(),
        title,
        savedAt: new Date().toISOString(),
        pageCount: this.bookData.total_pages || this.bookData.chunks.length,
        questionCount: this.bookData.chunks.length,
        chunks: this.bookData.chunks,
        bookData: this.bookData,
      };

      const updatedList = [newBook, ...savedList.filter((b) => b.id !== newBook.id)].slice(0, 30);
      storage.setItem('storyreader_saved_books_v1', JSON.stringify(updatedList));

      this.renderSavedBooksList();
      if (this.elements.statusBadge) {
        this.elements.statusBadge.textContent = '💾 Story & Questions Saved!';
      }
    } catch (err) {
      this.showError('Could not save book: ' + (err.message || 'Storage full'));
    }
  }

  loadSavedBook(bookId) {
    const list = this.getSavedBooks();
    const target = list.find((b) => b.id === bookId);
    if (!target || !target.bookData) {
      this.showError('Saved book could not be loaded.');
      return;
    }

    this.setBookData(target.bookData);
    this.currentChunkIndex = 0;
    this.attemptCount = 1;
    this.microturnUsed = false;
    this.setTranscript('');
    this.activeEvaluation = null;
    this.closeSavedBooksModal();
    this.hideError();

    this.transitionTo(APP_STATE.LOOKOUT);
    if (this.audioManager) {
      this.audioManager.speak(`Loaded saved story: ${target.title}. Starting Chunk 1!`);
    }
  }

  deleteSavedBook(bookId) {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : this.storage;
      if (!storage) return;
      const list = this.getSavedBooks().filter((b) => b.id !== bookId);
      storage.setItem('storyreader_saved_books_v1', JSON.stringify(list));
      this.renderSavedBooksList();
    } catch (_) {}
  }

  openSavedBooksModal() {
    const modal = this.elements.savedBooksModal;
    const backdrop = this.elements.savedBooksBackdrop;
    if (!modal) return;

    if (modal.style) modal.style.display = 'flex';
    modal.classList?.remove('collapsed');
    if (backdrop && backdrop.style) backdrop.style.display = 'block';

    if (this.elements.btnSaveCurrentBook) {
      const hasCurrentBook = Boolean(this.bookData && Array.isArray(this.bookData.chunks) && this.bookData.chunks.length > 0);
      if (this.elements.btnSaveCurrentBook.style) {
        this.elements.btnSaveCurrentBook.style.display = hasCurrentBook ? 'block' : 'none';
      }
    }

    this.renderSavedBooksList();
  }

  closeSavedBooksModal() {
    const modal = this.elements.savedBooksModal;
    const backdrop = this.elements.savedBooksBackdrop;
    if (modal) {
      modal.classList?.add('collapsed');
      if (modal.style) modal.style.display = 'none';
    }
    if (backdrop && backdrop.style) backdrop.style.display = 'none';
  }

  renderSavedBooksList() {
    const container = this.elements.savedBooksList;
    if (!container) return;

    const list = this.getSavedBooks();
    if (list.length === 0) {
      container.innerHTML = `
        <div class="saved-empty-placeholder">
          <span class="empty-icon" aria-hidden="true">💾</span>
          <p class="empty-text">No saved books yet.<br>When you analyze a storybook, save it here to re-open its questions anytime!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((item) => {
      const dateFormatted = new Date(item.savedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <div class="saved-book-item" data-id="${item.id}">
          <div class="saved-book-meta">
            <h4 class="saved-book-title">${item.title}</h4>
            <div class="saved-book-sub">
              <span>📅 ${dateFormatted}</span>
              <span>•</span>
              <span>❓ ${item.questionCount || item.chunks?.length || 0} Questions</span>
            </div>
          </div>
          <div class="saved-book-actions">
            <button type="button" class="touch-btn btn-load-book" data-action="load" data-id="${item.id}" aria-label="Load ${item.title}">
              📖 Open
            </button>
            <button type="button" class="touch-btn btn-delete-saved" data-action="delete" data-id="${item.id}" aria-label="Delete saved book" title="Delete">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll?.('.btn-load-book')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) this.loadSavedBook(id);
      });
    });

    container.querySelectorAll?.('.btn-delete-saved')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) {
          const proceed = typeof confirm !== 'undefined' ? confirm('Delete this saved book and its questions?') : true;
          if (proceed) this.deleteSavedBook(id);
        }
      });
    });
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

    if (opts?.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer);
        const abortErr = new Error('The user aborted a request.');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const res = await fetchFn(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        if (opts?.signal?.aborted) {
          const callerAbort = new Error('The user aborted a request.');
          callerAbort.name = 'AbortError';
          throw callerAbort;
        }
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

    async evaluateAnswer(payload, signal = null) {
      const response = await fetchWithTimeout('/api/evaluate-answer', {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify(payload),
        signal,
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
