import { callGeminiDecision } from './gemini_decision_service.js';
import defaultDecisionBreaker from './connectivity_circuit_breaker.js';

const RETRY_KEYWORD_REGEX = /\b(retry|try\s+again|start\s+over|let\s+me\s+try\s+again|can\s+i\s+try\s+again|can\s+i\s+start\s+over|wait\s+start\s+over|restart|redo|scratch\s+that|clear\s+that|erase\s+that)\b/i;

const MID_UTTERANCE_SPLIT_REGEX = /\b(?:wait\s+no\s+start\s+over|wait\s+start\s+over|no\s+wait\s+try\s+again|start\s+over|try\s+again|scratch\s+that|erase\s+that)\b/i;

export function isRetryCommandFastPath(text = '') {
  if (!text || typeof text !== 'string') return { isRetry: false };
  const clean = text.trim();
  if (!clean) return { isRetry: false };

  // Fast regex match
  const match = clean.match(RETRY_KEYWORD_REGEX);
  if (!match) return { isRetry: false };

  // If the utterance is short (<= 8 words) or consists predominantly of the command, it's a fastpath command
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 8) {
    return {
      isRetry: true,
      method: 'REGEX_FASTPATH',
      confidence: 0.99,
      matched: match[0],
    };
  }

  return { isRetry: false };
}

export function splitTranscriptOnRetry(text = '') {
  if (!text || typeof text !== 'string') return { hasRetry: false, remainingTranscript: '' };
  const clean = text.trim();
  if (!clean) return { hasRetry: false, remainingTranscript: '' };

  const match = clean.match(MID_UTTERANCE_SPLIT_REGEX);
  if (!match) {
    return { hasRetry: false, remainingTranscript: clean };
  }

  const splitIdx = clean.toLowerCase().lastIndexOf(match[0].toLowerCase());
  const afterText = clean.slice(splitIdx + match[0].length).replace(/^[^a-zA-Z0-9]+/, '').trim();

  return {
    hasRetry: true,
    matchedCommand: match[0],
    remainingTranscript: afterText,
  };
}

export async function evaluateRetryWithNLI(text = '') {
  if (!text || typeof text !== 'string') return { isRetry: false, entailment: 0, contradiction: 1 };
  const clean = text.trim();
  if (!clean) return { isRetry: false, entailment: 0, contradiction: 1 };

  const isMock = process.env.MOCK_AI === 'true' || !process.env.GEMINI_API_KEY;
  if (isMock) {
    const isRetry = /\b(mistake|say that again|erase|redo|wrong|change\s+(it|my|answer)|start\s+over|try\s+again)\b/i.test(clean);
    return {
      isRetry,
      entailment: isRetry ? 0.95 : 0.05,
      contradiction: isRetry ? 0.05 : 0.95,
      neutral: 0,
      method: 'NLI_SYSTEM_ONE',
      confidence: isRetry ? 0.95 : 0,
    };
  }

  try {
    const result = await defaultDecisionBreaker.execute(async (signal) => {
      return await callGeminiDecision({
        input: `Speaker said: "${clean}"`,
        questions: {
          retry: {
            type: 'choice',
            instructions: 'Is the speaker asking to redo, change, or correct their answer?',
            criteria: {
              RETRY: 'The speaker expresses intent to redo, change, try again, or correct their response.',
              NOT_RETRY: 'The speaker is answering a question, telling a story, or making unrelated statements.',
            },
          },
        },
        signal,
      });
    });

    const ans = result?.answers?.retry;
    const isRetry = ans?.choice === 'RETRY';
    const entailment = Number((ans?.probabilities?.RETRY ?? (isRetry ? (ans?.confidence ?? 0.95) : 0)).toFixed(3));
    const contradiction = Number((ans?.probabilities?.NOT_RETRY ?? (!isRetry ? (ans?.confidence ?? 0.95) : 0)).toFixed(3));

    return {
      isRetry,
      entailment,
      contradiction,
      neutral: 0,
      method: 'NLI_SYSTEM_ONE',
      confidence: entailment,
    };
  } catch (err) {
    console.warn('⚠️ evaluateRetryWithNLI Decision 1 call failed:', err?.message);
    return { isRetry: false, entailment: 0, contradiction: 1, method: 'NLI_SYSTEM_ONE', confidence: 0 };
  }
}

export async function detectRetryCommand(text = '') {
  if (!text || typeof text !== 'string') {
    return { isRetry: false, method: 'NONE', confidence: 0, remainingTranscript: '' };
  }

  // 1. Layer 1: 0ms Fastpath regex check
  const fastPath = isRetryCommandFastPath(text);
  if (fastPath.isRetry) {
    return {
      isRetry: true,
      method: 'REGEX_FASTPATH',
      confidence: fastPath.confidence,
      matched: fastPath.matched,
      remainingTranscript: '',
    };
  }

  // 2. Check for mid-utterance retry splice
  const midSplit = splitTranscriptOnRetry(text);
  if (midSplit.hasRetry && midSplit.remainingTranscript) {
    return {
      isRetry: true,
      method: 'MID_UTTERANCE_SPLICE',
      confidence: 0.95,
      matched: midSplit.matchedCommand,
      remainingTranscript: midSplit.remainingTranscript,
    };
  }

  // 3. Layer 2: Decision 1 semantic evaluation
  const nliRes = await evaluateRetryWithNLI(text);
  if (nliRes.isRetry) {
    return {
      isRetry: true,
      method: 'NLI_SYSTEM_ONE',
      confidence: nliRes.entailment,
      remainingTranscript: '',
    };
  }

  return {
    isRetry: false,
    method: 'NONE',
    confidence: 0,
    remainingTranscript: text.trim(),
  };
}

export default {
  isRetryCommandFastPath,
  splitTranscriptOnRetry,
  evaluateRetryWithNLI,
  detectRetryCommand,
};
