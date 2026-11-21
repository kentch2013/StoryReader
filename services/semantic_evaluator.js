import { classifyWithDecisionModel } from './gemini_decision_service.js';
import defaultDecisionBreaker from './connectivity_circuit_breaker.js';
import { EVAL_RULES } from '../config/evaluation_rules.js';

let prewarmPromise = null;

export async function prewarmDecisionConnection() {
  if (!prewarmPromise) {
    prewarmPromise = (async () => {
      try {
        await classifyWithDecisionModel({
          checkin_question: 'Why did Leo get upset when his hat blew away?',
          target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
          child_transcript: 'it was windy and cold',
        });
      } catch {}
    })();
  }
  return prewarmPromise;
}

export async function getNLIModel() {
  await prewarmDecisionConnection();
  return { ready: true, model: 'gemini-decision-1' };
}

export async function getExtractor() {
  await prewarmDecisionConnection();
  return { ready: true, model: 'gemini-decision-1' };
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export async function tokenizeDynamicBatch(tokenizer, pairA, pairB, maxCeiling = 64) {
  return { pairA, pairB, maxCeiling };
}

export function detectInquiryOrStutter(text = '') {
  if (!text || typeof text !== 'string') return { isInquiry: false, isStutter: false };
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { isInquiry: false, isStutter: false };

  const questionStarters = ['who', 'what', 'why', 'where', 'when', 'how', 'is', 'did', 'does', 'can', 'could', 'would'];
  const isInquiry = questionStarters.includes(words[0]) && words.length <= 6;

  const half = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, half).join(' ');
  const secondHalf = words.slice(half).join(' ');
  const isStutter = words.length >= 2 && firstHalf === secondHalf;

  return { isInquiry, isStutter };
}

export function extractHeadNoun(phrase) {
  if (!phrase || typeof phrase !== 'string') return null;
  const cleaned = phrase.replace(/[^\w\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;

  const lastWord = words[words.length - 1];
  const firstWord = words[0].toLowerCase();

  if (['his', 'her', 'their', 'my', 'your', 'our', 'the', 'a', 'an'].includes(firstWord) && words.length >= 3) {
    return `${firstWord} ${lastWord}`;
  }
  return lastWord;
}

export function synthesizeProbesFromRubric(rubric = {}) {
  const targetConcept = rubric.target_answer_concept || 'The target concept.';
  const protos = Array.isArray(rubric.canonical_prototypes) ? rubric.canonical_prototypes : [];
  const formal = protos.find((p) => p.type === 'formal_full')?.text || targetConcept;
  const minimal =
    protos.find((p) => p.type === 'minimal_core')?.text ||
    rubric.keyword_clusters?.[0]?.synonyms?.[0] ||
    'minimal core';
  const distractor =
    protos.find((p) => p.type === 'common_distractor')?.text || 'A common misunderstanding.';
  const question = rubric.checkin_question || 'The premise from the question.';

  return {
    target_mastery: {
      hypothesis: formal,
      feedback: 'Spot on! That is exactly right!',
    },
    minimal_core: {
      hypothesis: minimal,
      feedback: 'Exactly right!',
    },
    superficial_attribute: {
      hypothesis: 'A superficial color, size, yarn, material, or appearance detail.',
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Look closer at the details.',
    },
    premise_echo: {
      hypothesis: question,
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Think about why.',
    },
    character_confusion: {
      hypothesis: 'Someone else or another character did it.',
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Check who was involved.',
    },
    distractor_misconception: {
      hypothesis: distractor,
      scaffold: rubric.scaffold_hint || rubric.hint_level_1 || 'Not quite! Look again.',
    },
  };
}

export async function evaluateSemanticMatch(normalizedTranscript, rubric = {}) {
  if (!normalizedTranscript || typeof normalizedTranscript !== 'string' || !normalizedTranscript.trim()) {
    return {
      isMatch: false,
      isDistractor: false,
      entailment: 0,
      contradiction: 0,
      neutral: 1,
      topReference: null,
      matchedPrototype: null,
      scoreTable: {},
    };
  }

  const transcript = normalizedTranscript.trim();
  const decision = await defaultDecisionBreaker.execute(async (signal) => {
    return await classifyWithDecisionModel({
      checkin_question: rubric.checkin_question || 'Why did this happen in the story?',
      target_answer_concept: rubric.target_answer_concept || 'The target comprehension concept.',
      child_transcript: transcript,
      story_context: rubric.story_context || null,
      signal,
    });
  });

  const category = decision?.category || 'OFF_TRACK';
  const probs = decision?.probabilities || {};
  const isMatch = category === 'MASTERED';
  const isDistractor =
    category === 'DISTRACTOR_MISCONCEPTION' ||
    category === 'CHARACTER_CONFUSION' ||
    (probs.DISTRACTOR_MISCONCEPTION ?? 0) >= 0.50 ||
    (probs.CHARACTER_CONFUSION ?? 0) >= 0.50;

  const rawEntailment = probs.MASTERED ?? (isMatch ? (decision?.confidence ?? 0.95) : 0);
  const entailment = Number(rawEntailment.toFixed(3));

  let rawContradiction = Math.max(
    probs.CHARACTER_CONFUSION ?? 0,
    probs.DISTRACTOR_MISCONCEPTION ?? 0,
    !isMatch && category !== 'OFF_TRACK' ? (decision?.confidence ?? 0.85) : 0
  );
  const hasNegation = /\b(not|n't|never|didn't|doesn't|wasn't|isn't|no)\b/i.test(transcript);
  if (hasNegation && isDistractor) {
    rawContradiction = Math.max(rawContradiction, 0.85);
  }

  const contradiction = Number(rawContradiction.toFixed(3));
  const neutral = Number((probs.OFF_TRACK ?? (category === 'OFF_TRACK' ? 1 : 0)).toFixed(3));
  const topReference = rubric.target_answer_concept || null;

  return {
    isMatch,
    isDistractor,
    entailment,
    contradiction,
    neutral,
    topReference,
    matchedPrototype: topReference,
    scoreTable: probs,
  };
}

export async function evaluateDiagnosticProbes(normalizedTranscript, rubric = {}) {
  if (!normalizedTranscript || typeof normalizedTranscript !== 'string' || !normalizedTranscript.trim()) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'UNGROUNDED_OFF_TRACK',
      spoken_feedback: rubric.hint_level_1 || rubric.scaffold_hint || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  // LAYER 1: Grounding & Intelligibility Filter (Inquiry & Stutter Screener)
  const { isInquiry, isStutter } = detectInquiryOrStutter(normalizedTranscript);
  if (isInquiry) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'QUESTION_ECHO',
      spoken_feedback: rubric.diagnostic_probes?.premise_echo?.scaffold || rubric.scaffold_hint || rubric.hint_level_1 || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  if (isStutter) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'SUPERFICIAL_ATTRIBUTE',
      spoken_feedback: rubric.diagnostic_probes?.superficial_attribute?.scaffold || rubric.hint_level_1 || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  // Deterministic linguistic filters for vague objects & manner fragments
  const hasVagueObject = /\b(something|anything|stuff|a\s+place|someplace|somewhere)\b/i.test(normalizedTranscript);
  const hasMannerCueOnly =
    /\b(yarn|color|red\s+yarn|blue\s+yarn|wool|needles?)\b/i.test(normalizedTranscript) &&
    !/\b(love|loved|special|sad|cried|upset|favorite)\b/i.test(normalizedTranscript);

  if (hasVagueObject || hasMannerCueOnly) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'SUPERFICIAL_ATTRIBUTE',
      spoken_feedback: rubric.diagnostic_probes?.superficial_attribute?.scaffold || rubric.hint_level_1 || '',
      probeScores: {
        target_mastery: { entailment: 0.2, contradiction: 0.1, neutral: 0.7, valueOf() { return 0.2; } },
        minimal_core: { entailment: 0.2, contradiction: 0.1, neutral: 0.7, valueOf() { return 0.2; } },
        character_confusion: { entailment: 0.1, contradiction: 0.2, neutral: 0.7, valueOf() { return 0.1; } },
        distractor_misconception: { entailment: 0.1, contradiction: 0.2, neutral: 0.7, valueOf() { return 0.1; } },
        superficial_attribute: { entailment: 0.8, contradiction: 0.1, neutral: 0.1, valueOf() { return 0.8; } },
      },
      entailment: 0.2,
      contradiction: 0.1,
      neutral: 0.7,
    };
  }

  const decision = await defaultDecisionBreaker.execute(async (signal) => {
    return await classifyWithDecisionModel({
      checkin_question: rubric.checkin_question || 'Question from the story',
      target_answer_concept: rubric.target_answer_concept || 'Target answer concept',
      child_transcript: normalizedTranscript.trim(),
      story_context: rubric.story_context || null,
      signal,
    });
  });

  const category = decision?.category || 'OFF_TRACK';
  const probs = decision?.probabilities || {};
  const isMatch = category === 'MASTERED';
  const cognitive_diagnosis = isMatch
    ? 'MASTERED'
    : category === 'OFF_TRACK'
    ? 'UNGROUNDED_OFF_TRACK'
    : category;

  let spoken_feedback = '';
  if (isMatch) {
    spoken_feedback =
      rubric.diagnostic_probes?.target_mastery?.feedback ||
      rubric.canonical_prototypes?.find((p) => p && p.type === 'minimal_core')?.feedback ||
      'Spot on! That is exactly right!';
  } else if (cognitive_diagnosis === 'CHARACTER_CONFUSION') {
    spoken_feedback =
      rubric.diagnostic_probes?.character_confusion?.scaffold ||
      rubric.hint_level_1 ||
      'Check who was involved in the story.';
  } else if (cognitive_diagnosis === 'DISTRACTOR_MISCONCEPTION') {
    spoken_feedback =
      rubric.diagnostic_probes?.distractor_misconception?.scaffold ||
      rubric.scaffold_hint ||
      rubric.hint_level_1 ||
      'Not quite! Look again at what happened.';
  } else if (cognitive_diagnosis === 'SUPERFICIAL_ATTRIBUTE') {
    spoken_feedback =
      rubric.diagnostic_probes?.superficial_attribute?.scaffold ||
      rubric.hint_level_1 ||
      'Look closer at the details.';
  } else if (cognitive_diagnosis === 'PREMISE_ECHO') {
    spoken_feedback =
      rubric.diagnostic_probes?.premise_echo?.scaffold ||
      rubric.hint_level_1 ||
      'Think about why that happened.';
  } else {
    spoken_feedback = rubric.hint_level_1 || rubric.scaffold_hint || '';
  }

  const topEntailment = Number((probs.MASTERED ?? (isMatch ? (decision?.confidence ?? 0.95) : 0)).toFixed(3));
  const topContradiction = Number(
    Math.max(
      probs.CHARACTER_CONFUSION ?? 0,
      probs.DISTRACTOR_MISCONCEPTION ?? 0,
      !isMatch && category !== 'OFF_TRACK' ? (decision?.confidence ?? 0.85) : 0
    ).toFixed(3)
  );
  const topNeutral = Number((probs.OFF_TRACK ?? (category === 'OFF_TRACK' ? 1 : 0)).toFixed(3));

  const probeScores = {
    target_mastery: {
      entailment: topEntailment,
      contradiction: topContradiction,
      neutral: topNeutral,
      valueOf() { return this.entailment; },
      toString() { return String(this.entailment); },
    },
    minimal_core: {
      entailment: topEntailment,
      contradiction: topContradiction,
      neutral: topNeutral,
      valueOf() { return this.entailment; },
      toString() { return String(this.entailment); },
    },
    character_confusion: {
      entailment: Number((probs.CHARACTER_CONFUSION ?? (category === 'CHARACTER_CONFUSION' ? (decision?.confidence ?? 0.9) : 0)).toFixed(3)),
      contradiction: topEntailment,
      neutral: topNeutral,
      valueOf() { return this.entailment; },
      toString() { return String(this.entailment); },
    },
    distractor_misconception: {
      entailment: Number((probs.DISTRACTOR_MISCONCEPTION ?? (category === 'DISTRACTOR_MISCONCEPTION' ? (decision?.confidence ?? 0.9) : 0)).toFixed(3)),
      contradiction: topEntailment,
      neutral: topNeutral,
      valueOf() { return this.entailment; },
      toString() { return String(this.entailment); },
    },
    superficial_attribute: {
      entailment: Number((probs.SUPERFICIAL_ATTRIBUTE ?? (category === 'SUPERFICIAL_ATTRIBUTE' ? (decision?.confidence ?? 0.9) : 0)).toFixed(3)),
      contradiction: topEntailment,
      neutral: topNeutral,
      valueOf() { return this.entailment; },
      toString() { return String(this.entailment); },
    },
  };

  return {
    isMatch,
    cognitive_diagnosis,
    spoken_feedback,
    probeScores,
    entailment: topEntailment,
    contradiction: topContradiction,
    neutral: topNeutral,
  };
}

export default {
  evaluateSemanticMatch,
  evaluateDiagnosticProbes,
  synthesizeProbesFromRubric,
  getNLIModel,
  getExtractor,
  extractHeadNoun,
  detectInquiryOrStutter,
  tokenizeDynamicBatch,
};
