function deepFreeze(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

export const EVAL_RULES = deepFreeze({
  MAX_ATTEMPTS: 2,
  MAX_TRANSCRIPT_WORDS: 35,
  NLI_THRESHOLDS: {
    ENTAILMENT_PASS: 0.50,
    CONTRADICTION_CEILING: 0.35,
    DISTRACTOR_TRIGGER: 0.60,
    CHARACTER_CONFUSION_CONTRADICTION: 0.70,
  },
  TOKEN_MATCHING: {
    PROTOTYPE_SIMILARITY: 0.60,
    DISTRACTOR_SIMILARITY: 0.70,
    QUESTION_ECHO_RATIO: 0.60,
  },
});

export default EVAL_RULES;
