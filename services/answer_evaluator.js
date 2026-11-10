import { normalizeTranscript, isShrugOrEmpty } from './transcript_sanitizer.js';
import { matchKeywordClusters, matchAcceptablePhrasings } from './rubric_matcher.js';
import { getPrebakedFeedback } from './feedback_synthesizer.js';
import { classifyAnswerSemantic } from './gemini_service.js';

export async function evaluateChildAnswer(data = {}) {
  const attempt = Number(data.attempt_count) || 1;
  const feedback = getPrebakedFeedback(data);
  const normalized = normalizeTranscript(data.child_transcript);

  if (isShrugOrEmpty(normalized)) {
    if (attempt >= 2) {
      return {
        status: 'off_track',
        spoken_feedback: feedback.reveal_attempt_2,
        follow_up_prompt: null,
        attempt_count: attempt,
        resolved: true,
      };
    }

    return {
      status: 'needs_scaffold',
      spoken_feedback: feedback.hint_attempt_1,
      follow_up_prompt: feedback.hint_attempt_1,
      attempt_count: attempt,
      resolved: false,
    };
  }

  const isMasteredLocally =
    matchKeywordClusters(normalized, data.keyword_clusters) ||
    matchAcceptablePhrasings(normalized, data.acceptable_phrasings);

  if (isMasteredLocally) {
    return {
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
    };
  }

  if (attempt >= 2) {
    return {
      status: 'off_track',
      spoken_feedback: feedback.reveal_attempt_2,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
    };
  }

  // Call Gemini classifier for Attempt 1 ambiguous speech
  const classification = await classifyAnswerSemantic({
    checkin_question: data.checkin_question,
    target_answer_concept: data.target_answer_concept,
    child_transcript: data.child_transcript,
  });

  if (classification && classification.understands_concept) {
    return {
      status: 'mastered',
      spoken_feedback: feedback.praise,
      follow_up_prompt: null,
      attempt_count: attempt,
      resolved: true,
    };
  }

  return {
    status: 'needs_scaffold',
    spoken_feedback: feedback.hint_attempt_1,
    follow_up_prompt: feedback.hint_attempt_1,
    attempt_count: attempt,
    resolved: false,
  };
}

export default {
  evaluateChildAnswer,
};
