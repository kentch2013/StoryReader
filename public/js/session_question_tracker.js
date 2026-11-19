/**
 * StoryReader - Session Question Tracker
 * Manages completed questions across pages in a reading session,
 * normalizes question text for canonical comparison, and persists to sessionStorage.
 */

export class SessionQuestionTracker {
  /**
   * @param {Object} [options={}]
   * @param {Storage} [options.storage]
   * @param {string} [options.storageKey='storyreader_completed_questions_v1']
   */
  constructor(options = {}) {
    this.storage = options.storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    this.storageKey = options.storageKey || 'storyreader_completed_questions_v1';
    this._completedQuestions = new Set();
    this._completedRecords = [];
    this.restore();
  }

  /**
   * Normalizes question text for canonical exact-match comparison.
   * Strips surrounding whitespace, lowercases, and removes trailing punctuation.
   *
   * @param {string} text
   * @returns {string}
   */
  normalizeQuestion(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/[?!.,;:'"“”]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Marks a question completed.
   *
   * @param {string} questionText
   * @param {Object} [metadata={}]
   * @returns {boolean} True if newly marked
   */
  markCompleted(questionText, metadata = {}) {
    const key = this.normalizeQuestion(questionText);
    if (!key) return false;

    const isNew = !this._completedQuestions.has(key);
    this._completedQuestions.add(key);
    if (isNew) {
      this._completedRecords.push({
        key,
        questionText: questionText.trim(),
        completedAt: Date.now(),
        ...metadata,
      });
      this.persist();
    }
    return isNew;
  }

  /**
   * Checks if a question has been completed in this session.
   *
   * @param {string} questionText
   * @returns {boolean}
   */
  isCompleted(questionText) {
    const key = this.normalizeQuestion(questionText);
    if (!key) return false;
    return this._completedQuestions.has(key);
  }

  /**
   * Checks if a given page's question is completed.
   *
   * @param {number} pageIndex
   * @param {Object} page
   * @param {Object} bookData
   * @returns {boolean}
   */
  isPageCompleted(pageIndex, page, bookData) {
    if (!bookData || !Array.isArray(bookData.chunks)) return false;
    const pageNum = page?.pageNumber || (pageIndex + 1);
    const chunk = this._findChunkForPage(pageNum, bookData);
    if (!chunk || !chunk.checkin_question) return false;
    return this.isCompleted(chunk.checkin_question);
  }

  _findChunkForPage(pageNum, bookData) {
    if (!bookData?.chunks) return null;
    return bookData.chunks.find((c) => {
      if (!c.page_range) return false;
      const digits = c.page_range.match(/(\d+)(?:\s*-\s*(\d+))?/);
      if (digits) {
        const s = parseInt(digits[1], 10);
        const e = digits[2] ? parseInt(digits[2], 10) : s;
        return pageNum >= s && pageNum <= e;
      }
      return false;
    }) || bookData.chunks.find((c) => c.chunk_id === pageNum);
  }

  getCompletedCount() {
    return this._completedQuestions.size;
  }

  getAllCompleted() {
    return Array.from(this._completedQuestions);
  }

  getCompletedRecords() {
    return [...this._completedRecords];
  }

  clear() {
    this._completedQuestions.clear();
    this._completedRecords = [];
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (_) {}
    }
  }

  serialize() {
    return {
      keys: Array.from(this._completedQuestions),
      records: this._completedRecords,
    };
  }

  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.serialize()));
    } catch (_) {}
  }

  restore(customData = null) {
    try {
      let data = customData;
      if (!data && this.storage) {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) data = JSON.parse(raw);
      }
      if (data) {
        const keys = Array.isArray(data) ? data : (data.keys || []);
        this._completedQuestions = new Set(
          keys.map((k) => (typeof k === 'string' ? this.normalizeQuestion(k) : '')).filter(Boolean)
        );
        this._completedRecords = Array.isArray(data.records) ? data.records : [];
        return true;
      }
    } catch (_) {}
    return false;
  }
}
