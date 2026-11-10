import { normalizeTranscript, isShrugOrEmpty } from './transcript_sanitizer.js';
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

export async function evaluateChildAnswer(data = {}) {
  const attempt = Number(data.attempt_count) || 1;
  const feedback = getPrebakedFeedback(data);
  const normalized = normalizeTranscript(data.child_transcript);

  const diagnostics = {
    normalized_transcript: normalized,
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
  };

  // Parallel Diagnostic Probing Architecture (System 1 Single-Pass Diagnostic Evaluator)
  if (data.diagnostic_probes) {
    const result = await evaluateDiagnosticProbes(normalized, data);
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
      return {
        status: 'mastered',
        spoken_feedback: result.spoken_feedback,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }

    if (attempt >= 2) {
      return {
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }

    return {
      status: 'needs_scaffold',
      spoken_feedback: result.spoken_feedback,
      follow_up_prompt: result.spoken_feedback,
      attempt_count: attempt,
      resolved: false,
      diagnostics,
    };
  }

  // Tier 1 Screener: Shrug or Empty Transcript
  if (isShrugOrEmpty(normalized)) {
    diagnostics.tier_resolved = 'TIER_1_SHRUG';
    diagnostics.tier1.is_shrug = true;

    if (attempt >= 2) {
      return {
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }

    return {
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      diagnostics,
    };
  }

  // Tier 1 Fast-Path: Question Premise Echo
  const isEcho = isQuestionEcho(normalized, data.checkin_question);
  diagnostics.tier1.question_echo = isEcho;

  if (isEcho) {
    diagnostics.tier_resolved = 'TIER_1_QUESTION_ECHO_SCAFFOLD';
    if (attempt >= 2) {
      return {
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }
    return {
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      diagnostics,
    };
  }

  // Tier 1 Deterministic: Canonical Prototypes Token Matcher
  if (Array.isArray(data.canonical_prototypes) && data.canonical_prototypes.length > 0) {
    const protoResult = scoreMultiReference(normalized, data.canonical_prototypes);
    diagnostics.tier1.prototype_token_match = protoResult;

    if (protoResult.isDistractor) {
      diagnostics.tier_resolved = 'TIER_1_DISTRACTOR_TOKEN_MATCH';
      if (attempt >= 2) {
        return {
          status: 'off_track',
          spoken_feedback: feedback.reveal_attempt_2,
          follow_up_prompt: null,
          attempt_count: attempt,
          resolved: true,
          diagnostics,
        };
      }

      return {
        status: 'needs_scaffold',
        spoken_feedback: feedback.hint_attempt_1,
        follow_up_prompt: feedback.hint_attempt_1,
        attempt_count: attempt,
        resolved: false,
        diagnostics,
      };
    }

    if (protoResult.matched) {
      diagnostics.tier_resolved = `TIER_1_PROTOTYPE_${protoResult.prototypeType?.toUpperCase()}`;
      return {
        status: 'mastered',
        spoken_feedback: feedback.praise,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }
  }

  // Tier 1 Deterministic: Exact Keyword Clusters or Acceptable Phrasings Match
  const clusterMatch = matchKeywordClusters(normalized, data.keyword_clusters);
  const phrasingMatch = matchAcceptablePhrasings(normalized, data.acceptable_phrasings);
  diagnostics.tier1.phrasing_match = phrasingMatch;

  if (clusterMatch || phrasingMatch) {
    diagnostics.tier_resolved = clusterMatch ? 'TIER_1_CLUSTER_ALL_MATCH' : 'TIER_1_PHRASING_MATCH';
    return {
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      diagnostics,
    };
  }

  // Record cluster counts in diagnostics for transparency
  const { matchedCount, totalCount } = countMatchedClusters(normalized, data.keyword_clusters);
  diagnostics.tier1.matched_clusters = matchedCount;
  diagnostics.tier1.total_clusters = totalCount;

  // Tier 2: System 1 Local Cross-Encoder NLI Evaluator (<50ms, zero cloud network calls)
  const semanticResult = await evaluateSemanticMatch(data.child_transcript || normalized, data);
  diagnostics.tier2_semantic = semanticResult;

  if (semanticResult.isDistractor) {
    diagnostics.tier_resolved = semanticResult.contradiction >= 0.80
      ? 'TIER_2_NLI_CONTRADICTION_REJECTION'
      : 'TIER_2_NLI_DISTRACTOR_REJECTION';

    if (attempt >= 2) {
      return {
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }

    return {
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
      diagnostics,
    };
  }

  if (semanticResult.isMatch) {
    diagnostics.tier_resolved = 'TIER_2_NLI_ENTAILMENT_MATCH';
    return {
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      diagnostics,
    };
  }

  diagnostics.tier_resolved = 'TIER_2_NLI_BELOW_THRESHOLD';

  // Tier 3: Emergency Fallback for highly ambiguous, complex long speech (>= 6 words)
  const wordTokens = normalized.split(' ').filter(Boolean);
  if (wordTokens.length >= 6 && process.env.ENABLE_CLOUD_FALLBACK === 'true') {
    diagnostics.tier3_gemini.invoked = true;
    diagnostics.tier3_gemini.reason = 'Invoked for complex unmapped speech >= 6 words';

    const classification = await classifyAnswerSemantic({
      checkin_question: data.checkin_question,
      target_answer_concept: data.target_answer_concept,
      child_transcript: data.child_transcript,
    });
    diagnostics.tier3_gemini.result = classification;

    if (classification && classification.understands_concept) {
      diagnostics.tier_resolved = 'TIER_3_GEMINI_MASTERED';
      return {
        status: 'mastered',
        spoken_feedback: feedback.praise,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
        diagnostics,
      };
    }

    diagnostics.tier_resolved = 'TIER_3_GEMINI_NEEDS_SCAFFOLD';
  }

  if (attempt >= 2) {
    return {
      status: 'off_track',
      spoken_feedback: feedback.reveal_attempt_2,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
      diagnostics,
    };
  }

  return {
    status: 'needs_scaffold',
    spoken_feedback: feedback.hint_attempt_1,
    follow_up_prompt: feedback.hint_attempt_1,
    attempt_count: attempt,
    resolved: false,
    diagnostics,
  };
}

export default {
  evaluateChildAnswer,
};
