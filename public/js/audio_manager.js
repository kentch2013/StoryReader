/**
 * StoryReader - Safari Audio Coordinator (Module 5)
 * iOS Safari Web Audio & Web Speech mutual-exclusivity coordinator.
 */

export const AUDIO_STATE = Object.freeze({
  LOCKED: 'LOCKED',
  IDLE: 'IDLE',
  SPEAKING: 'SPEAKING',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
});

export class SafariAudioManager {
  /**
   * @param {Object} [options={}]
   * @param {AudioContext} [options.audioContext]
   * @param {SpeechSynthesis} [options.speechSynthesis]
   * @param {Function} [options.SpeechSynthesisUtterance]
   * @param {Function} [options.SpeechRecognition]
   * @param {number} [options.settlingDelayMs=150]
   * @param {number} [options.defaultRate=0.9]
   * @param {number} [options.defaultPitch=1.0]
   * @param {string} [options.defaultLang='en-US']
   */
  constructor(options = {}) {
    const hasWindow = typeof window !== 'undefined';
    const AudioCtxClass = options.audioContextClass || (hasWindow ? (window.AudioContext || window.webkitAudioContext) : null);

    this._audioContext = options.audioContext || (AudioCtxClass ? new AudioCtxClass() : null);
    this._speechSynthesis = options.speechSynthesis || (hasWindow ? window.speechSynthesis : null);
    this._SpeechSynthesisUtterance = options.SpeechSynthesisUtterance || (hasWindow ? window.SpeechSynthesisUtterance : null);
    this._SpeechRecognition = options.SpeechRecognition || (hasWindow ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);

    this._settlingDelayMs = options.settlingDelayMs !== undefined ? options.settlingDelayMs : 150;
    this._defaultRate = options.defaultRate !== undefined ? options.defaultRate : 0.9;
    this._defaultPitch = options.defaultPitch !== undefined ? options.defaultPitch : 1.0;
    this._defaultLang = options.defaultLang || 'en-US';
    this._preferredVoice = options.preferredVoice !== undefined ? options.preferredVoice : 'Microsoft Ana Online (Natural)';

    this._state = AUDIO_STATE.LOCKED;
    this._isUnlocked = false;
    this.onStateChange = null;
    this.onError = null;

    // Speech synthesis tracking
    this._activeSpeech = null;

    // Speech recognition tracking
    this._activeRecognition = null;
    this._isListening = false;
    this._activeListenOptions = null;
    this._finalizedTranscripts = [];
    this._sessionFinals = new Map();
    this._sessionInterim = '';
  }

  get state() {
    return this._state;
  }

  get isUnlocked() {
    return this._isUnlocked;
  }

  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(newState);
      } catch (err) {
        console.error('Error in onStateChange callback:', err);
      }
    }
  }

  async unlock() {
    if (this._audioContext) {
      if (this._audioContext.state === 'suspended') {
        try {
          await this._audioContext.resume();
        } catch (e) {
          console.warn('AudioContext resume error:', e);
        }
      }
      try {
        const buffer = this._audioContext.createBuffer(1, 1, 22050);
        const source = this._audioContext.createBufferSource();
        source.buffer = buffer;
        if (this._audioContext.destination) {
          source.connect(this._audioContext.destination);
        }
        source.start(0);
      } catch (e) {
        console.warn('Buffer play error:', e);
      }
    }

    if (this._speechSynthesis && typeof this._speechSynthesis.getVoices === 'function') {
      try {
        this._speechSynthesis.getVoices();
      } catch (e) {
        // ignore
      }
    }

    this._isUnlocked = true;
    this._setState(AUDIO_STATE.IDLE);
    return { unlocked: true };
  }

  /**
   * Retrieves all available voices, annotating modern natural/neural voices.
   *
   * @returns {Array<{ name: string, lang: string, default: boolean, isNatural: boolean }>}
   */
  getAvailableVoices() {
    if (!this._speechSynthesis || typeof this._speechSynthesis.getVoices !== 'function') {
      return [];
    }
    const voices = this._speechSynthesis.getVoices() || [];
    return voices
      .filter((v) => v.lang && (v.lang.startsWith('en') || v.lang === ''))
      .map((v) => ({
        name: v.name,
        lang: v.lang,
        default: Boolean(v.default),
        isNatural: /natural|neural|google|premium|enhanced/i.test(v.name || ''),
      }))
      .sort((a, b) => {
        if (a.isNatural && !b.isNatural) return -1;
        if (!a.isNatural && b.isNatural) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Sets preferred voice by name and persists to localStorage.
   *
   * @param {string|null} voiceName
   */
  setPreferredVoice(voiceName) {
    this._preferredVoice = voiceName || null;
    try {
      if (typeof localStorage !== 'undefined') {
        if (voiceName) {
          localStorage.setItem('storyreader_preferred_voice', voiceName);
        } else {
          localStorage.removeItem('storyreader_preferred_voice');
        }
      }
    } catch (_) {}
  }

  /**
   * Returns currently preferred voice name (persisted or in-memory).
   *
   * @returns {string|null}
   */
  getPreferredVoice() {
    if (this._preferredVoice !== undefined && this._preferredVoice !== null) {
      return this._preferredVoice;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('storyreader_preferred_voice');
        if (stored) return stored;
      }
    } catch (_) {}
    return 'Microsoft Ana Online (Natural)';
  }

  _selectVoice(preferredName) {
    if (!this._speechSynthesis || typeof this._speechSynthesis.getVoices !== 'function') {
      return null;
    }
    const voices = this._speechSynthesis.getVoices() || [];
    if (voices.length === 0) return null;

    const targetName = preferredName || this.getPreferredVoice();

    if (targetName) {
      const direct = voices.find(
        (v) => v.name && v.name.toLowerCase() === targetName.toLowerCase()
      );
      if (direct) return direct;
      const partial = voices.find(
        (v) => v.name && v.name.toLowerCase().includes(targetName.toLowerCase())
      );
      if (partial) return partial;

      // Special handling for Ana online variants
      if (/ana/i.test(targetName)) {
        const ana = voices.find((v) => v.name && /ana/i.test(v.name));
        if (ana) return ana;
      }
    }

    // 1. High-fidelity Neural / Natural voices (prioritizing Ana online):
    // Edge/Windows: "Microsoft Ana Online (Natural)" (child-friendly story voice), "Microsoft Jenny Online (Natural)"
    // Chrome: "Google US English", "Google UK English Female"
    // Safari/macOS/iOS: "Ava (Premium)", "Samantha (Enhanced)", "Zoe (Premium)"
    const naturalVoicePatterns = [
      /ana.*online/i,           // Microsoft Ana Online
      /ana.*natural/i,          // Microsoft Ana Online (Natural) - child story voice
      /ana/i,                   // Any Ana voice
      /jenny.*natural/i,        // Microsoft Jenny Online (Natural) - warm conversational tone
      /aria.*natural/i,         // Microsoft Aria Online (Natural)
      /guy.*natural/i,          // Microsoft Guy Online (Natural)
      /natural/i,               // Any Microsoft Natural voice
      /neural/i,                // Neural TTS engines
      /google\s+us\s+english/i, // Google US English (Chrome)
      /google\s+uk\s+english/i, // Google UK English (Chrome)
      /google/i,                // Any Google voice
      /premium/i,               // Apple Premium
      /enhanced/i,              // Apple Enhanced
    ];

    for (const pattern of naturalVoicePatterns) {
      const match = voices.find(
        (v) => v.lang && v.lang.startsWith('en') && pattern.test(v.name || '')
      );
      if (match) return match;
    }

    // 2. Fallback to priority names
    const priorityNames = ['ana', 'jenny', 'aria', 'guy', 'ava', 'samantha', 'daniel', 'karen', 'moira', 'tessa'];
    for (const name of priorityNames) {
      const match = voices.find(
        (v) => v.name && v.name.toLowerCase().includes(name)
      );
      if (match) return match;
    }

    const enUs = voices.find(
      (v) => v.lang && (v.lang === 'en-US' || v.lang === 'en_US')
    );
    if (enUs) return enUs;

    const anyEn = voices.find((v) => v.lang && v.lang.startsWith('en'));
    if (anyEn) return anyEn;

    const def = voices.find((v) => v.default);
    return def || voices[0] || null;
  }

  speak(text, options = {}) {
    if (this._isListening || this._state === AUDIO_STATE.LISTENING) {
      this.cancelListening();
    }
    if (this._activeSpeech || (this._speechSynthesis && this._speechSynthesis.speaking)) {
      this.cancelSpeech();
    }

    this._setState(AUDIO_STATE.SPEAKING);

    return new Promise((resolve) => {
      if (!this._speechSynthesis || !this._SpeechSynthesisUtterance) {
        this._setState(AUDIO_STATE.IDLE);
        return resolve({ completed: false, text, error: 'SpeechSynthesis not supported' });
      }

      const utterance = new this._SpeechSynthesisUtterance(text);
      utterance.text = text;
      utterance.rate = options.rate !== undefined ? options.rate : this._defaultRate;
      utterance.pitch = options.pitch !== undefined ? options.pitch : this._defaultPitch;
      utterance.volume = options.volume !== undefined ? options.volume : 1.0;
      utterance.lang = options.lang || this._defaultLang;

      const voice = this._selectVoice(options.voiceName);
      if (voice) {
        utterance.voice = voice;
      }

      let settled = false;
      let speechTimer = null;

      const record = {
        utterance,
        resolve: (val) => {
          if (!settled) {
            settled = true;
            if (speechTimer) {
              clearTimeout(speechTimer);
              speechTimer = null;
            }
            this._activeSpeech = null;
            this._currentUtterance = null;
            resolve(val);
          }
        },
      };
      this._activeSpeech = record;
      this._currentUtterance = utterance;
      if (typeof window !== 'undefined') {
        window.__storyReaderUtterance = utterance;
      }

      utterance.onend = () => {
        if (!settled) {
          this._setState(AUDIO_STATE.IDLE);
          record.resolve({ completed: true, text });
        }
      };

      utterance.onerror = (err) => {
        if (!settled) {
          this._setState(AUDIO_STATE.IDLE);
          record.resolve({ completed: false, text, error: err?.error || 'speech-error' });
        }
      };

      // Safety timeout: resolve cleanly if onend hangs on mobile Safari
      const wordCount = (text || '').split(/\s+/).filter(Boolean).length;
      const timeoutMs = Math.max(12000, wordCount * 1200);
      speechTimer = setTimeout(() => {
        if (!settled) {
          this._setState(AUDIO_STATE.IDLE);
          record.resolve({ completed: true, text, timedOut: true });
        }
      }, timeoutMs);

      try {
        if (typeof this._speechSynthesis.resume === 'function') {
          this._speechSynthesis.resume();
        }
        this._speechSynthesis.speak(utterance);
      } catch (err) {
        this._setState(AUDIO_STATE.IDLE);
        record.resolve({ completed: false, text, error: err.message });
      }
    });
  }

  cancelSpeech() {
    this._currentUtterance = null;
    if (this._activeSpeech) {
      const record = this._activeSpeech;
      this._activeSpeech = null;
      if (this._speechSynthesis) {
        try {
          this._speechSynthesis.cancel();
        } catch (e) {
          // ignore
        }
      }
      this._setState(AUDIO_STATE.IDLE);
      record.resolve({ completed: false, text: record.utterance?.text || '' });
    } else if (this._speechSynthesis) {
      try {
        this._speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
      if (this._state === AUDIO_STATE.SPEAKING) {
        this._setState(AUDIO_STATE.IDLE);
      }
    }
  }

  async startListening(options = {}) {
    if (this._speechSynthesis && (this._speechSynthesis.speaking || this._state === AUDIO_STATE.SPEAKING)) {
      this.cancelSpeech();
      if (this._settlingDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this._settlingDelayMs));
      }
    }

    if (this._activeRecognition || this._isListening) {
      this.cancelListening();
      await new Promise((r) => setTimeout(r, 50));
    }

    this._activeListenOptions = options;
    this._isListening = true;
    this._finalizedTranscripts = [];
    this._sessionFinals.clear();
    this._sessionInterim = '';

    this._setState(AUDIO_STATE.LISTENING);
    this._startRecognitionSession();
    return { listening: true };
  }

  clearTranscript() {
    this._finalizedTranscripts = [];
    this._sessionFinals.clear();
    this._sessionInterim = '';
  }

  async restartListening(options = null) {
    const opts = options || this._activeListenOptions || {};
    this.cancelListening();
    await new Promise((r) => setTimeout(r, 50));
    return this.startListening(opts);
  }

  _startRecognitionSession() {
    if (!this._SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this environment');
      this._setState(AUDIO_STATE.ERROR);
      const err = { error: 'not-supported', message: 'SpeechRecognition not supported' };
      if (this._activeListenOptions?.onError) this._activeListenOptions.onError(err);
      if (typeof this.onError === 'function') this.onError(err);
      return;
    }

    const rec = new this._SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (this._activeListenOptions && this._activeListenOptions.lang) || this._defaultLang;

    rec.onresult = (event) => {
      if (!event || !event.results) return;

      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const idx = (event.results.length === 1 && event.resultIndex > 0) ? event.resultIndex : i;
        const alt = result && result[0];
        const transcript = alt && alt.transcript ? alt.transcript : '';

        if (result && result.isFinal) {
          this._sessionFinals.set(idx, transcript);
        } else {
          interim = transcript;
        }
      }
      this._sessionInterim = interim;

      const allFinals = [...this._finalizedTranscripts, ...Array.from(this._sessionFinals.values())];
      const finalStr = allFinals.filter(Boolean).join(' ').trim();
      const fullParts = [...allFinals, this._sessionInterim].filter(Boolean);
      const fullStr = fullParts.join(' ').trim();

      if (this._activeListenOptions && typeof this._activeListenOptions.onTranscript === 'function') {
        this._activeListenOptions.onTranscript({
          interim: this._sessionInterim,
          final: finalStr,
          full: fullStr,
        });
      }
    };

    rec.onerror = (event) => {
      const errType = event?.error;
      const fatalErrors = ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'bad-grammar'];
      const benignErrors = ['no-speech', 'aborted'];

      if (fatalErrors.includes(errType)) {
        this._isListening = false;
        this._setState(AUDIO_STATE.ERROR);
        if (this._activeListenOptions && typeof this._activeListenOptions.onError === 'function') {
          this._activeListenOptions.onError(event);
        }
        if (typeof this.onError === 'function') {
          this.onError(event);
        }
      } else if (!benignErrors.includes(errType)) {
        if (this._activeListenOptions && typeof this._activeListenOptions.onError === 'function') {
          this._activeListenOptions.onError(event);
        }
      }
    };

    rec.onend = () => {
      if (this._isListening) {
        // Auto-restart if Safari VAD prematurely cut off while still in hold-to-talk mode
        for (const finalVal of this._sessionFinals.values()) {
          if (finalVal) this._finalizedTranscripts.push(finalVal);
        }
        this._sessionFinals.clear();
        this._sessionInterim = '';

        this._startRecognitionSession();
      }
    };

    this._activeRecognition = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  }

  async stopListening() {
    this._isListening = false;
    this._setState(AUDIO_STATE.PROCESSING);

    if (this._activeRecognition) {
      try {
        this._activeRecognition.stop();
      } catch (e) {
        // ignore
      }
    }

    for (const finalVal of this._sessionFinals.values()) {
      if (finalVal) this._finalizedTranscripts.push(finalVal);
    }
    this._sessionFinals.clear();
    if (this._sessionInterim) {
      this._finalizedTranscripts.push(this._sessionInterim);
      this._sessionInterim = '';
    }

    const transcript = this.getFullTranscript();
    this._setState(AUDIO_STATE.IDLE);
    return { transcript };
  }

  cancelListening() {
    this._isListening = false;
    if (this._activeRecognition) {
      try {
        this._activeRecognition.abort();
      } catch (e) {
        // ignore
      }
      this._activeRecognition = null;
    }
    this._finalizedTranscripts = [];
    this._sessionFinals.clear();
    this._sessionInterim = '';
    this._setState(AUDIO_STATE.IDLE);
  }

  getFullTranscript() {
    const all = [
      ...this._finalizedTranscripts,
      ...Array.from(this._sessionFinals.values()),
      this._sessionInterim,
    ].filter(Boolean);
    return all.join(' ').replace(/\s+/g, ' ').trim();
  }

  reset() {
    this.cancelSpeech();
    this.cancelListening();
    this._setState(this._isUnlocked ? AUDIO_STATE.IDLE : AUDIO_STATE.LOCKED);
  }
}
