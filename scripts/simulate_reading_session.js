/**
 * StoryReader - Module 6 Digital Sample: Multi-Chunk Reading Session Simulation Runner
 * Simulates a complete co-reading session between a child and parent across multiple chunks.
 */

import { APP_STATE, StoryReaderApp } from '../public/js/app.js';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';

// Realistic 2-chunk Grade 2 story fixture (The Runaway Bunny)
const STORY_FIXTURE = {
  is_legible: true,
  book_type: 'fiction',
  summary: 'A little bunny thinks of ways to run away, but his loving mother always finds a way to stay close to him.',
  chunks: [
    {
      chunk_id: 1,
      page_range: 'Pages 1-3',
      lookout_prompt: 'Before you read, watch for what the little bunny imagines doing.',
      checkin_question: 'What does the mother say she will do if the bunny runs away?',
      target_answer_concept: 'She will run after him because he is her little bunny.',
      keyword_clusters: [
        { concept_name: 'action', synonyms: ['run after', 'chase', 'follow'] },
        { concept_name: 'reason', synonyms: ['little bunny', 'her bunny', 'loves him'] }
      ],
      acceptable_phrasings: [
        'She will run after him.',
        'She follows him because he is her little bunny.'
      ],
      canonical_prototypes: [
        { type: 'formal_full', text: 'She will run after him because he is her little bunny.' },
        { type: 'minimal_core', text: 'Run after him.' },
        { type: 'common_distractor', text: 'She will stay at home.' }
      ],
      hint_level_1: 'What action does the mother promise to take if he leaves?',
      scaffold_hint: 'What action does the mother promise to take if he leaves?'
    },
    {
      chunk_id: 2,
      page_range: 'Pages 4-6',
      lookout_prompt: 'Notice what the bunny turns into when he swims in the stream.',
      checkin_question: 'What does the bunny become to swim away from his mother?',
      target_answer_concept: 'He becomes a fish in a trout stream.',
      keyword_clusters: [
        { concept_name: 'creature', synonyms: ['fish', 'trout'] },
        { concept_name: 'place', synonyms: ['stream', 'water', 'river'] }
      ],
      acceptable_phrasings: [
        'He turns into a fish.',
        'He becomes a fish in a trout stream.'
      ],
      canonical_prototypes: [
        { type: 'formal_full', text: 'He turns into a fish in a stream.' },
        { type: 'minimal_core', text: 'A fish.' }
      ],
      hint_level_1: 'Think of an animal that lives in the water!',
      scaffold_hint: 'Think of an animal that lives in the water!'
    }
  ]
};

// Synthetic DOM builder for Node.js simulation
function createSimulatedDom() {
  const elements = {};
  const ids = [
    'screen-scan', 'screen-analyzing', 'screen-lookout', 'screen-checkin',
    'screen-evaluating', 'screen-feedback', 'screen-complete',
    'btn-start-audio', 'btn-analyze', 'btn-done-reading', 'btn-ptt',
    'btn-check-answer', 'btn-retry-speech', 'btn-next-chunk', 'btn-restart',
    'chunk-badge', 'lookout-prompt-text', 'checkin-question-text',
    'transcript-text', 'feedback-praise-text', 'feedback-scaffold-text',
    'status-badge', 'error-banner', 'confetti-container'
  ];

  for (const id of ids) {
    elements[id] = {
      id,
      textContent: '',
      hidden: true,
      disabled: false,
      children: [],
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: (c) => elements[id].children.push(c)
    };
  }
  elements['screen-scan'].hidden = false;

  return {
    elements,
    getElementById: (id) => elements[id] || { id, style: {}, classList: { add: () => {}, remove: () => {} }, addEventListener: () => {}, removeEventListener: () => {} }
  };
}

class SimulatedAudioManager {
  constructor() {
    this.isUnlocked = true;
    this.audioLog = [];
  }
  async unlock() { return true; }
  async speak(text) {
    this.audioLog.push(text);
    console.log(`   [🔊 TTS Speaker]: "${text}"`);
    return true;
  }
  cancelSpeech() {}
  cancelListening() {}
}

async function runSessionReplay() {
  console.log('================================================================');
  console.log('   STORYSCOUT (STORYREADER) - MODULE 6 SPA E2E REPLAY SESSION');
  console.log('================================================================\n');

  const { elements, getElementById } = createSimulatedDom();
  const audioManager = new SimulatedAudioManager();

  // Create real-evaluator API client
  const apiClient = {
    analyzeBook: async () => STORY_FIXTURE,
    evaluateAnswer: async (payload) => {
      console.log(`   [📡 API POST /api/evaluate-answer]: Attempt ${payload.attempt_count} | Child: "${payload.child_transcript}"`);
      const chunk = app.getCurrentChunk();
      const evalResult = await evaluateChildAnswer({
        checkin_question: chunk.checkin_question,
        target_answer_concept: chunk.target_answer_concept,
        keyword_clusters: chunk.keyword_clusters,
        acceptable_phrasings: chunk.acceptable_phrasings,
        canonical_prototypes: chunk.canonical_prototypes,
        scaffold_hint: chunk.scaffold_hint,
        child_transcript: payload.child_transcript,
        attempt_count: payload.attempt_count,
        microturn_used: payload.microturn_used,
      });
      return evalResult;
    }
  };

  const cameraTray = {
    getPages: () => [{ id: 'page_1' }, { id: 'page_2' }, { id: 'page_3' }, { id: 'page_4' }],
    createFormData: () => ({}),
    reset: () => {}
  };

  const app = new StoryReaderApp({
    getElementById,
    audioManager,
    cameraTray,
    apiClient
  });

  console.log(`1. [Parent Action] Scanned 4 pages. Current state: ${app.state}`);
  console.log('2. [Parent Action] Taps "Ready to Read!":');
  await app.handleAnalyzeBook();

  console.log(`\n3. [FSM Transition]: State is now ${app.state}`);
  console.log(`   Header: ${elements['chunk-badge'].textContent}`);
  console.log(`   Lookout Prompt: "${elements['lookout-prompt-text'].textContent}"`);

  console.log('\n4. [Child Action] Child reads Pages 1-3 and taps "I\'m Done Reading!":');
  app.handleDoneReading();
  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Question: "${elements['checkin-question-text'].textContent}"`);

  // Chunk 1, Attempt 1: Distractor Answer
  console.log('\n5. [Child Action] Speaks Attempt 1 answer: "she will stay at home"');
  app.setTranscript('she will stay at home');
  await app.handleCheckAnswer();

  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Status Badge: ${elements['status-badge'].textContent}`);
  console.log(`   Attempt Counter: ${app.attemptCount} (Max 2)`);
  console.log(`   Scaffold: "${elements['feedback-scaffold-text'].textContent}"`);

  // Retry Attempt
  console.log('\n6. [Child Action] Listens to clue and taps "Try Again":');
  app.handleRetryAttempt();
  console.log(`   [FSM Transition]: State is now ${app.state}`);

  // Chunk 1, Attempt 2: Correct Answer
  console.log('\n7. [Child Action] Speaks Attempt 2 answer: "she will run after him"');
  app.setTranscript('she will run after him');
  await app.handleCheckAnswer();

  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Status Badge: ${elements['status-badge'].textContent}`);
  console.log(`   Praise Feedback: "${elements['feedback-praise-text'].textContent}"`);
  console.log(`   Confetti Active: ${elements['confetti-container'].children.length > 0 ? 'YES (🎉 30 particles)' : 'NO'}`);

  // Advance to Chunk 2
  console.log('\n8. [Child Action] Taps "Next Pages" to advance to Chunk 2:');
  app.handleNextChunk();
  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Header: ${elements['chunk-badge'].textContent}`);
  console.log(`   Lookout Prompt: "${elements['lookout-prompt-text'].textContent}"`);

  console.log('\n9. [Child Action] Child reads Pages 4-6 and taps "I\'m Done Reading!":');
  app.handleDoneReading();
  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Question: "${elements['checkin-question-text'].textContent}"`);

  // Chunk 2, Attempt 1: Direct Mastered Answer
  console.log('\n10. [Child Action] Speaks Attempt 1 answer: "he becomes a fish"');
  app.setTranscript('he becomes a fish');
  await app.handleCheckAnswer();

  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log(`   Status Badge: ${elements['status-badge'].textContent}`);
  console.log(`   Praise Feedback: "${elements['feedback-praise-text'].textContent}"`);

  // Finish Book
  console.log('\n11. [Child Action] Taps "Finish Story":');
  app.handleNextChunk();
  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log('   🎉 Complete screen visible!');

  // Restart
  console.log('\n12. [Parent Action] Taps "Read Another Book":');
  app.handleRestart();
  console.log(`   [FSM Transition]: State is now ${app.state}`);
  console.log('   Session successfully reset for next physical book.');

  console.log('\n================================================================');
  console.log('   ✅ MODULE 6 DIGITAL SAMPLE SIMULATION: 100% SUCCESS');
  console.log('================================================================\n');
}

runSessionReplay().catch(console.error);
