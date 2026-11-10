import { Type } from '@google/genai';

export const ANSWER_EVALUATION_SYSTEM_PROMPT = `
You are an objective semantic classifier for Grade 2 children's speech.
Your job is to determine if the child understood and expressed the core target concept.
You must ignore phonetic mispronunciations, stuttering, and grammatical mistakes.

Return strictly JSON matching the provided schema.
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
      enum: ['high', 'low'],
    },
  },
  required: ['understands_concept', 'confidence'],
};

export default {
  ANSWER_EVALUATION_SYSTEM_PROMPT,
  ANSWER_EVALUATION_SCHEMA,
};
