import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionQuestionTracker } from '../public/js/session_question_tracker.js';
import { StoryReaderApp } from '../public/js/app.js';
import { CameraTrayUI } from '../public/js/camera_tray.js';

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
      add: (...classes) => classes.forEach((cls) => classListSet.add(cls)),
      remove: (...classes) => classes.forEach((cls) => classListSet.delete(cls)),
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
    removeAttribute: (name) => {
      delete el.attributes[name];
    },
    querySelector: (selector) => {
      const findIn = (nodes) => {
        for (const node of nodes) {
          if (selector.startsWith('#') && node.id === selector.slice(1)) return node;
          if (selector.startsWith('.') && node.classList?.contains(selector.slice(1))) return node;
          if (node.children) {
            const res = findIn(node.children);
            if (res) return res;
          }
        }
        return null;
      };
      return findIn(children);
    },
    querySelectorAll: (selector) => {
      const results = [];
      const traverse = (nodes) => {
        for (const node of nodes) {
          if (selector.startsWith('.') && node.classList?.contains(selector.slice(1))) {
            results.push(node);
          }
          if (node.children) traverse(node.children);
        }
      };
      traverse(children);
      return results;
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    closest: () => el,
  };
  if (attributes.id) el.id = attributes.id;
  if (attributes.className) {
    attributes.className.split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
  }
  return el;
}

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

test('SessionQuestionTracker tracks and normalizes completed questions per session with persistence', () => {
  const storage = createMockStorage();
  const tracker = new SessionQuestionTracker({ storage });

  assert.equal(tracker.getCompletedCount(), 0);
  assert.equal(tracker.isCompleted("Who went to robert's party?"), false);

  // Mark question completed
  const isNew = tracker.markCompleted("Who went to robert's party?", { pageNumber: 1 });
  assert.equal(isNew, true);
  assert.equal(tracker.getCompletedCount(), 1);

  // Exact same question with different punctuation or casing should match as completed
  assert.equal(tracker.isCompleted("Who went to robert's party?"), true);
  assert.equal(tracker.isCompleted("who went to robert's party"), true);
  assert.equal(tracker.isCompleted("  WHO WENT TO ROBERT'S PARTY?!  "), true);

  // Different question remains uncompleted
  assert.equal(tracker.isCompleted("What did Robert eat at the party?"), false);

  // Restore into a fresh tracker instance from storage
  const restoredTracker = new SessionQuestionTracker({ storage });
  assert.equal(restoredTracker.getCompletedCount(), 1);
  assert.equal(restoredTracker.isCompleted("Who went to robert's party?"), true);
});

test('Correctly answering a question greys out identical questions across all pages in carousel and advances past them', async () => {
  const storage = createMockStorage();
  const sessionQuestionTracker = new SessionQuestionTracker({ storage });

  const bookData = {
    chunks: [
      {
        chunk_id: 1,
        page_range: 'Pages 1-2',
        checkin_question: "Who went to robert's party?",
        target_answer_concept: 'his friends',
      },
      {
        chunk_id: 2,
        page_range: 'Pages 3-3',
        checkin_question: 'What did they eat at the party?',
        target_answer_concept: 'birthday cake',
      },
    ],
  };

  const pages = [
    { id: 'page_1', pageNumber: 1 },
    { id: 'page_2', pageNumber: 2 },
    { id: 'page_3', pageNumber: 3 },
  ];

  // Carousel container with 3 slides
  const carousel = createMockElement('div', { id: 'book-carousel' });

  pages.forEach((p, idx) => {
    const slide = createMockElement('div', { id: `carousel-slide-${p.id}`, className: 'carousel-slide' });
    slide.setAttribute('data-page-id', p.id);
    slide.setAttribute('data-page-index', idx);

    const btn = createMockElement('button', { className: 'btn-question-slide is-ready' });
    btn.innerHTML = '❓ Question';
    slide.appendChild(btn);
    carousel.appendChild(slide);
  });

  const app = new StoryReaderApp({
    sessionQuestionTracker,
    storage,
  });
  app.bookData = bookData;

  const cameraTray = {
    state: { pages },
    pages,
    carouselElement: carousel,
    lastAnalysisData: bookData,
    updateQuestionButtonStates: () => {
      // Logic executed by CameraTrayUI
      const slides = carousel.querySelectorAll('.carousel-slide');
      slides.forEach((slide) => {
        const idx = parseInt(slide.getAttribute('data-page-index') || '0', 10);
        const p = pages[idx];
        const isCompleted = app.isPageQuestionCompleted(idx, p);
        const isReady = !isCompleted && app.hasQuestionForPage(idx, p);
        const qBtn = slide.querySelector('.btn-question-slide');
        if (qBtn) {
          if (isCompleted) {
            qBtn.disabled = true;
            qBtn.setAttribute('aria-disabled', 'true');
            qBtn.classList.remove('is-ready');
            qBtn.classList.add('is-completed', 'is-disabled');
          } else if (isReady) {
            qBtn.disabled = false;
            qBtn.removeAttribute('aria-disabled');
            qBtn.classList.remove('is-completed', 'is-disabled');
            qBtn.classList.add('is-ready');
          }
        }
      });
    },
  };
  app.cameraTray = cameraTray;

  // Initially: Page 1, Page 2, Page 3 questions are all ready and NOT completed
  cameraTray.updateQuestionButtonStates();

  const btnPage1 = carousel.children[0].querySelector('.btn-question-slide');
  const btnPage2 = carousel.children[1].querySelector('.btn-question-slide');
  const btnPage3 = carousel.children[2].querySelector('.btn-question-slide');

  assert.equal(btnPage1.disabled, false);
  assert.equal(btnPage2.disabled, false);
  assert.equal(btnPage3.disabled, false);

  // User correctly answers Page 1's question: "Who went to robert's party?"
  app.markQuestionCompleted("Who went to robert's party?", { pageNumber: 1 });

  // Both Page 1 and Page 2 share the exact same question, so BOTH must now be greyed out!
  assert.equal(btnPage1.disabled, true, 'Page 1 button must be disabled/greyed out');
  assert.equal(btnPage1.classList.contains('is-completed'), true, 'Page 1 button must have is-completed class');
  assert.equal(btnPage2.disabled, true, 'Page 2 button must be disabled/greyed out because it has the exact same question');
  assert.equal(btnPage2.classList.contains('is-completed'), true, 'Page 2 button must have is-completed class');

  // Page 3 has a different question ("What did they eat at the party?"), so it must remain active!
  assert.equal(btnPage3.disabled, false, 'Page 3 button must remain active');
  assert.equal(btnPage3.classList.contains('is-ready'), true, 'Page 3 button must remain is-ready');

  // Auto-progression test: when Page 1 is done, next question should skip Page 2 (completed) and target Page 3 (index 2)
  const nextTargetIdx = app.getNextUnansweredPageIndex(0);
  assert.equal(nextTargetIdx, 2, 'Auto-progression must skip Page 2 and target Page 3');
});
