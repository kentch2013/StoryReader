import { Type } from '@google/genai';

export const ANSWER_EVALUATION_SYSTEM_PROMPT = `
You are an objective semantic classifier for Grade 2 children's speech (ages 7-8).
Your job is to determine whether the child understood and expressed the core target concept.

Evaluation Guidelines:
1. Generous on Child Speech: Ignore phonetic mispronunciations, dialect variations, minor stuttering, and ungrammatical syntax.
2. Partial Understanding: If the child conveys the essential core kernel of the concept, award credit generously. If critical core elements are missing, do not credit.
3. Negated & Evasive Answers: If the child says "I don't know", "I forgot", "not sure", or contradicts the core fact ("not X", "he didn't"), mark understands_concept as false.
4. STT Real-Word Homophones: Compensate for automatic speech recognition homophone errors (e.g., "for" instead of "four", "to"/"too" instead of "two", "their" instead of "there").
5. Question Echoing: If the child merely parrots or echoes the premise of the question without supplying the answer concept, mark understands_concept as false.
`.trim();

export const ANSWER_EVALUATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    understands_concept: {
      type: Type.BOOLEAN,
      description: 'True if child conveyed the target concept, false otherwise',
    },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
      description: 'Confidence level in the semantic classification',
    },
    missing_concept: {
      type: Type.STRING,
      description: 'Optional brief description of what concept was missing if not understood',
      nullable: true,
    },
  },
  required: ['understands_concept', 'confidence'],
};

export default {
  ANSWER_EVALUATION_SYSTEM_PROMPT,
  ANSWER_EVALUATION_SCHEMA,
};
