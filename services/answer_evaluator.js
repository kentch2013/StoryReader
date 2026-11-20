import { normalizeTranscript, isShrugOrEmpty } from './transcript_sanitizer.js';
import { normalizeChildPhonetics } from './phonetic_matcher.js';
import {
  matchKeywordClusters,
  matchAcceptablePhrasings,
  scoreMultiReference,
  countMatchedClusters,
  isQuestionEcho,
} from './rubric_matcher.js';
import { evaluateSemanticMatch, evaluateDiagnosticProbes } from './semantic_evaluator.js';
import { getPrebakedFeedback } from './feedback_synthesizer.js';
import { classifyAnswerSemantic } from './gemini_service.js';
import { resolveDiscourse } from './discourse_resolver.js';
import { evaluateSlotDelta } from './slot_delta_engine.js';

const ADVERSARIAL_INJECTION_REGEX = /\b(ignore\s+previous|system\s+prompt|jailbreak|disregard|you\s+are\s+now|developer\s+mode)\b/i;

function makeEvalResult({
  status,
  spoken_feedback,
  follow_up_prompt = null,
  attempt_count = 1,
  resolved = false,
  is_microturn = false,
  microturn_used = false,
  diagnostics = {},
}) {
  return {
    status,
    spoken_feedback,
    follow_up_prompt,
    attempt_count,
    resolved,
    is_microturn,
    microturn_used,
    diagnostics,
  };
}

export async function evaluateChildAnswer(data = {}) {
  // System 1 Adversarial Gate: Intercept prompt injection attacks
  if (data.child_transcript && ADVERSARIAL_INJECTION_REGEX.test(data.child_transcript)) {
    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: "Let's focus on our story! Tell me what happened in the book.",
      follow_up_prompt: data.checkin_question,
      attempt_count: data.attempt_count || 1,
      resolved: false,
      is_microturn: false,
      microturn_used: false,
      diagnostics: { adversarial_intercept: true },
    });
  }

  const attempt = Number(data.attempt_count) || 1;
  const feedback = getPrebakedFeedback(data);
  let normalized = normalizeTranscript(data.child_transcript);
  normalized = normalizeChildPhonetics(normalized, data.keyword_clusters, {
    canonicalPrototypes: data.canonical_prototypes,
  });

  // 1. Discourse & Relational Resolution
  const discourseResult = resolveDiscourse(normalized, data, {
    microturn_used: data.microturn_used === true,
    attempt_count: attempt,
  });

  const grounded = discourseResult.grounded_transcript || normalized;
  const wordTokens = grounded.split(' ').filter(Boolean);
  const cloudAllowed = (data.enable_cloud_fallback === true || process.env.ENABLE_CLOUD_FALLBACK === 'true') &&
    process.env.OFFLINE_MODE !== 'true';

  const diagnostics = {
    normalized_transcript: normalized,
    grounded_transcript: grounded,
    raw_transcript: data.child_transcript || '',
    tier_resolved: null,
    tier1: {
      is_shrug: false,
      question_echo: false,
      matched_clusters: 0,
      total_clusters: Array.isArray(data.keyword_clusters) ? data.keyword_clusters.length : 0,
      phrasing_match: false,
      prototype_token_match: null,
    },
    tier2_semantic: null,
    tier3_gemini: {
      invoked: false,
      reason: 'Bypassed - resolved locally by Tier 1 or Tier 2',
    },
    discourse: discourseResult,
  };

  // Speech Confidence Gate: Intercept low-confidence muffled audio as a free microturn
  const hasLowConfidence = typeof data.speech_confidence === 'number' &&
    data.speech_confidence > 0 &&
    data.speech_confidence < 0.40;
  const microturnUsed = data.microturn_used === true || (data.consecutive_microturns && data.consecutive_microturns >= 1);

  if (hasLowConfidence && !microturnUsed) {
    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: "I didn't quite catch that. Could you say that again a little louder?",
      follow_up_prompt: data.checkin_question || "Could you say that again a little louder?",
      attempt_count: attempt,
      resolved: false,
      is_microturn: true,
      microturn_used: true,
      diagnostics: {
        ...diagnostics,
        cognitive_diagnosis: 'LOW_SPEECH_CONFIDENCE',
        tier_resolved: 'SPEECH_CONFIDENCE_MICROTURN',
      },
    });
  }

  // If Microturn Clarification was triggered
  if (discourseResult.is_microturn) {
    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: discourseResult.spoken_prompt,
      follow_up_prompt: discourseResult.spoken_prompt,
      attempt_count: attempt,
      resolved: false,
      is_microturn: true,
      microturn_used: true,
      diagnostics: {
        ...diagnostics,
        cognitive_diagnosis: 'AMBIGUOUS_REFERENT',
        tier_resolved: 'HIERARCHICAL_AMBIGUITY_MICROTURN',
      },
    });
  }

  // If Cross-Generational Mismatch or Conflicting Beneficiary was detected
  if (discourseResult.character_confusion) {
    // If explicit semantic slots are provided and child matched other core slots, evaluate for Near-Miss Slot Repair
    if (data.semantic_slots) {
      const slotDelta = evaluateSlotDelta(grounded, data);
      if (slotDelta.is_near_miss && slotDelta.repair_prompt) {
        diagnostics.cognitive_diagnosis = 'NEAR_MISS_REPAIR';
        diagnostics.slot_delta = slotDelta;
        diagnostics.tier_resolved = 'SLOT_DELTA_NEAR_MISS_REPAIR';

        return makeEvalResult({
          status: 'needs_scaffold',
          spoken_feedback: slotDelta.repair_prompt,
          follow_up_prompt: slotDelta.repair_prompt,
          attempt_count: attempt,
          resolved: false,
          is_microturn: true,
          microturn_used: true,
          diagnostics,
        });
      }
    }

    const confusionFeedback =
      data.diagnostic_probes?.character_confusion?.scaffold ||
      discourseResult.spoken_prompt ||
      feedback.hint_attempt_1;
    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: confusionFeedback,
      follow_up_prompt: confusionFeedback,
      attempt_count: attempt,
      resolved: false,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics: {
        ...diagnostics,
        cognitive_diagnosis: 'CHARACTER_CONFUSION',
        tier_resolved: 'DISCOURSE_CHARACTER_CONFUSION',
      },
    });
  }

  // Layer 1 0ms Fast-Path: Shrug or Empty Transcript
  if (isShrugOrEmpty(grounded)) {
    diagnostics.tier_resolved = 'TIER_1_SHRUG';
    diagnostics.tier1.is_shrug = true;
    diagnostics.cognitive_diagnosis = 'UNGROUNDED_OFF_TRACK';

    if (attempt >= 2) {
      return makeEvalResult({
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }

    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  // Universal Slot Delta Gate: Check for explicit slot conflicts before or alongside semantic evaluation
  if (data.semantic_slots) {
    const slotDelta = evaluateSlotDelta(grounded, data);
    if (slotDelta.is_near_miss && slotDelta.repair_prompt) {
      diagnostics.cognitive_diagnosis = 'NEAR_MISS_REPAIR';
      diagnostics.slot_delta = slotDelta;
      diagnostics.tier_resolved = 'SLOT_DELTA_NEAR_MISS_REPAIR';

      return makeEvalResult({
        status: 'needs_scaffold',
        spoken_feedback: slotDelta.repair_prompt,
        follow_up_prompt: slotDelta.repair_prompt,
        attempt_count: attempt,
        resolved: false,
        is_microturn: true,
        microturn_used: true,
        diagnostics,
      });
    }

    // Fast-path: When all semantic slots match with zero conflicts or missing slots
    const activeSlotCount = Object.keys(slotDelta.matched_slots).length;
    if (
      activeSlotCount >= 3 &&
      slotDelta.accuracy_degree === 1 &&
      slotDelta.missing_slots.length === 0 &&
      Object.keys(slotDelta.conflicted_slots).length === 0
    ) {
      diagnostics.cognitive_diagnosis = 'MASTERED';
      diagnostics.slot_delta = slotDelta;
      diagnostics.tier_resolved = 'SLOT_FRAME_ALL_MATCH';
      return makeEvalResult({
        status: 'mastered',
        spoken_feedback:
          data.diagnostic_probes?.target_mastery?.feedback ||
          data.diagnostic_probes?.minimal_core?.feedback ||
          feedback.praise,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }
  }

  // Tier 1 Deterministic: Canonical Prototypes Token Matcher (0ms)
  if (Array.isArray(data.canonical_prototypes) && data.canonical_prototypes.length > 0) {
    const protoResult = scoreMultiReference(grounded, data.canonical_prototypes);
    diagnostics.tier1.prototype_token_match = protoResult;

    if (protoResult.isDistractor) {
      diagnostics.tier_resolved = 'TIER_1_DISTRACTOR_TOKEN_MATCH';
      diagnostics.cognitive_diagnosis = 'DISTRACTOR_MISCONCEPTION';

      if (attempt >= 2) {
        return makeEvalResult({
          status: 'off_track',
          spoken_feedback: feedback.reveal_attempt_2,
          follow_up_prompt: null,
          attempt_count: attempt,
          resolved: true,
          is_microturn: false,
          microturn_used: data.microturn_used === true,
          diagnostics,
        });
      }

      const distractorScaffold =
        data.diagnostic_probes?.distractor_misconception?.scaffold ||
        feedback.hint_attempt_1;

      return makeEvalResult({
        status: 'needs_scaffold',
        spoken_feedback: distractorScaffold,
        follow_up_prompt: distractorScaffold,
        attempt_count: attempt,
        resolved: false,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }

    if (protoResult.matched) {
      diagnostics.tier_resolved = `TIER_1_PROTOTYPE_${protoResult.prototypeType?.toUpperCase()}`;
      diagnostics.cognitive_diagnosis = 'MASTERED';
      const spokenFeedback =
        data.diagnostic_probes?.target_mastery?.feedback ||
        feedback.praise;

      return makeEvalResult({
        status: 'mastered',
        spoken_feedback: spokenFeedback,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }
  }

  // Parallel Diagnostic Probing Architecture (System 1 Single-Pass Diagnostic Evaluator)
  const hasDiagnosticProbes = Boolean(
    data.diagnostic_probes &&
    typeof data.diagnostic_probes === 'object' &&
    Object.keys(data.diagnostic_probes).length > 0
  );
  if (hasDiagnosticProbes) {
    let result = null;
    try {
      result = await evaluateDiagnosticProbes(grounded, data);
    } catch (err) {
      console.warn('⚠️ evaluateDiagnosticProbes failed, falling through:', err?.message);
    }

    if (result) {
      diagnostics.tier_resolved = 'PARALLEL_DIAGNOSTIC_PROBING';
      diagnostics.cognitive_diagnosis = result.cognitive_diagnosis;
      diagnostics.probe_scores = result.probeScores;
      diagnostics.tier2_semantic = {
        isMatch: result.isMatch,
        cognitive_diagnosis: result.cognitive_diagnosis,
        entailment: result.entailment,
        contradiction: result.contradiction,
        neutral: result.neutral,
        scoreTable: result.probeScores,
      };

      if (result.isMatch) {
        return makeEvalResult({
          status: 'mastered',
          spoken_feedback: result.spoken_feedback,
          follow_up_prompt: null,
          attempt_count: attempt,
          resolved: true,
          is_microturn: false,
          microturn_used: data.microturn_used === true,
          diagnostics,
        });
      }

      // Check Slot Delta for Near-Miss single-slot isolation repair
      if (data.semantic_slots) {
        const slotDelta = evaluateSlotDelta(grounded, data);
        if (slotDelta.is_near_miss && slotDelta.repair_prompt) {
          diagnostics.cognitive_diagnosis = 'NEAR_MISS_REPAIR';
          diagnostics.slot_delta = slotDelta;
          diagnostics.tier_resolved = 'SLOT_DELTA_NEAR_MISS_REPAIR';

          return makeEvalResult({
            status: 'needs_scaffold',
            spoken_feedback: slotDelta.repair_prompt,
            follow_up_prompt: slotDelta.repair_prompt,
            attempt_count: attempt,
            resolved: false,
            is_microturn: true,
            microturn_used: true,
            diagnostics,
          });
        }
      }

      // Check Decision Model for Functional Circumlocutions when diagnosis is UNGROUNDED_OFF_TRACK
      if (result.cognitive_diagnosis === 'UNGROUNDED_OFF_TRACK' && cloudAllowed && wordTokens.length >= 3) {
        const classification = await classifyAnswerSemantic({
          checkin_question: data.checkin_question,
          target_answer_concept: data.target_answer_concept,
          child_transcript: data.child_transcript,
          story_context: data.story_context,
        });

        if (classification && classification.understands_concept) {
          diagnostics.tier_resolved = 'TIER_2_5_DECISION_CIRCUMLOCUTION_MASTERED';
          diagnostics.cognitive_diagnosis = 'MASTERED';
          return makeEvalResult({
            status: 'mastered',
            spoken_feedback: feedback.praise,
            follow_up_prompt: null,
            attempt_count: attempt,
            resolved: true,
            is_microturn: false,
            microturn_used: data.microturn_used === true,
            diagnostics,
          });
        }
      }

      if (attempt >= 2) {
        return makeEvalResult({
          status: 'off_track',
          spoken_feedback: feedback.reveal_attempt_2,
          follow_up_prompt: null,
          attempt_count: attempt,
          resolved: true,
          is_microturn: false,
          microturn_used: data.microturn_used === true,
          diagnostics,
        });
      }

      return makeEvalResult({
        status: 'needs_scaffold',
        spoken_feedback: result.spoken_feedback,
        follow_up_prompt: result.spoken_feedback,
        attempt_count: attempt,
        resolved: false,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }
  }

  // Tier 1 Fast-Path: Question Premise Echo
  const isEcho = isQuestionEcho(grounded, data.checkin_question);
  diagnostics.tier1.question_echo = isEcho;

  if (isEcho) {
    diagnostics.tier_resolved = 'TIER_1_QUESTION_ECHO_SCAFFOLD';
    diagnostics.cognitive_diagnosis = 'PREMISE_ECHO';
    if (attempt >= 2) {
      return makeEvalResult({
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }
    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  // Tier 1 Deterministic: Exact Keyword Clusters or Acceptable Phrasings Match (0ms)
  // Gated: When story_context slot constraints exist (e.g. recipient/object), bypass to Layer 2 for slot validation
  const hasSlotContext = Boolean(data.story_context?.recipient || data.story_context?.object);
  const clusterMatch = matchKeywordClusters(grounded, data.keyword_clusters);
  const phrasingMatch = matchAcceptablePhrasings(grounded, data.acceptable_phrasings);
  diagnostics.tier1.phrasing_match = phrasingMatch;

  if (!hasSlotContext && (clusterMatch || phrasingMatch)) {
    diagnostics.tier_resolved = clusterMatch ? 'TIER_1_CLUSTER_ALL_MATCH' : 'TIER_1_PHRASING_MATCH';
    diagnostics.cognitive_diagnosis = 'MASTERED';
    return makeEvalResult({
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  // Record cluster counts in diagnostics for transparency
  const { matchedCount, totalCount } = countMatchedClusters(grounded, data.keyword_clusters);
  diagnostics.tier1.matched_clusters = matchedCount;
  diagnostics.tier1.total_clusters = totalCount;

  // Tier 2: System 1 Local Cross-Encoder NLI Evaluator (<50ms, zero cloud network calls)
  let semanticResult = null;
  try {
    semanticResult = await evaluateSemanticMatch(grounded, data);
  } catch (err) {
    console.warn('⚠️ evaluateSemanticMatch failed, falling through:', err?.message);
  }
  diagnostics.tier2_semantic = semanticResult;

  if (semanticResult && semanticResult.isDistractor) {
    diagnostics.tier_resolved = semanticResult.contradiction >= 0.80
      ? 'TIER_2_NLI_CONTRADICTION_REJECTION'
      : 'TIER_2_NLI_DISTRACTOR_REJECTION';

    if (attempt >= 2) {
      return makeEvalResult({
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }

    return makeEvalResult({
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  if (semanticResult && semanticResult.isMatch) {
    diagnostics.tier_resolved = 'TIER_2_NLI_ENTAILMENT_MATCH';
    return makeEvalResult({
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  diagnostics.tier_resolved = 'TIER_2_NLI_BELOW_THRESHOLD';

  // Tier 2.5 / Tier 3: Zero-token Decision Arbiter & Cloud Fallback
  // Invoked for unmapped or ambiguous speech >= 3 words when cloud decision/fallback is explicitly requested
  if (wordTokens.length >= 3 && cloudAllowed) {
    diagnostics.tier3_gemini.invoked = true;
    diagnostics.tier3_gemini.reason = 'Invoked for unmapped or ambiguous speech >= 3 words';

    const classification = await classifyAnswerSemantic({
      checkin_question: data.checkin_question,
      target_answer_concept: data.target_answer_concept,
      child_transcript: data.child_transcript,
      story_context: data.story_context,
    });
    diagnostics.tier3_gemini.result = classification;

    if (classification && classification.understands_concept) {
      diagnostics.tier_resolved = classification.model_used === 'gemini-decision-1'
        ? 'TIER_2_5_DECISION_MASTERED'
        : 'TIER_3_GEMINI_MASTERED';
      diagnostics.cognitive_diagnosis = 'MASTERED';
      return makeEvalResult({
        status: 'mastered',
        spoken_feedback: feedback.praise,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }

    if (classification?.cognitive_diagnosis && classification.cognitive_diagnosis !== 'OFF_TRACK') {
      diagnostics.cognitive_diagnosis = classification.cognitive_diagnosis;
      diagnostics.tier_resolved = classification.model_used === 'gemini-decision-1'
        ? `TIER_2_5_DECISION_${classification.cognitive_diagnosis}`
        : `TIER_3_GEMINI_${classification.cognitive_diagnosis}`;

      const diagKey = classification.cognitive_diagnosis.toLowerCase();
      const customScaffold = data.diagnostic_probes?.[diagKey]?.scaffold;
      const scaffoldPrompt = customScaffold || feedback.hint_attempt_1;

      if (attempt >= 2) {
        return makeEvalResult({
          status: 'off_track',
          spoken_feedback: feedback.reveal_attempt_2,
          follow_up_prompt: null,
          attempt_count: attempt,
          resolved: true,
          is_microturn: false,
          microturn_used: data.microturn_used === true,
          diagnostics,
        });
      }

      return makeEvalResult({
        status: 'needs_scaffold',
        spoken_feedback: scaffoldPrompt,
        follow_up_prompt: scaffoldPrompt,
        attempt_count: attempt,
        resolved: false,
        is_microturn: false,
        microturn_used: data.microturn_used === true,
        diagnostics,
      });
    }

    diagnostics.tier_resolved = 'TIER_3_GEMINI_NEEDS_SCAFFOLD';
  }

  if (attempt >= 2) {
    return makeEvalResult({
      status: 'off_track',
      spoken_feedback: feedback.reveal_attempt_2,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      is_microturn: false,
      microturn_used: data.microturn_used === true,
      diagnostics,
    });
  }

  return makeEvalResult({
    status: 'needs_scaffold',
    spoken_feedback: feedback.hint_attempt_1,
    follow_up_prompt: feedback.hint_attempt_1,
    attempt_count: attempt,
    resolved: false,
    is_microturn: false,
    microturn_used: data.microturn_used === true,
    diagnostics,
  });
}

export default {
  evaluateChildAnswer,
};
