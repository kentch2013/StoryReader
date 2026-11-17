import { getNLIModel, tokenizeDynamicBatch } from './semantic_evaluator.js';

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

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

  const { tokenizer, model } = await getNLIModel();

  // Multi-probe hypothesis check for semantic retry intent
  const hypotheses = [
    'The speaker is asking to redo or correct their response.',
    'The speaker wants to try again or change their answer.',
  ];

  const premiseList = [clean, clean];
  const encoded = await tokenizeDynamicBatch(tokenizer, premiseList, hypotheses, 48);
  const output = await model(encoded);
  const logitsData = output.logits.data;

  // Pair 1
  const [c1, e1, n1] = softmax([logitsData[0], logitsData[1], logitsData[2]]);
  // Pair 2
  const [c2, e2, n2] = softmax([logitsData[3], logitsData[4], logitsData[5]]);

  const maxEntailment = Math.max(e1, e2);
  const minContradiction = Math.min(c1, c2);
  const avgNeutral = (n1 + n2) / 2;

  const entailment = Number(maxEntailment.toFixed(3));
  const contradiction = Number(minContradiction.toFixed(3));
  const neutral = Number(avgNeutral.toFixed(3));

  const isRetry = entailment >= 0.50 && contradiction < 0.35;

  return {
    isRetry,
    entailment,
    contradiction,
    neutral,
    method: 'NLI_SYSTEM_ONE',
    confidence: entailment,
  };
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

  // 3. Layer 2: ONNX System 1 DeBERTa NLI evaluation
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
