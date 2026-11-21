import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import defaultDecisionBreaker from './connectivity_circuit_breaker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DECISIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';
const DECISION_MODEL = process.env.GEMINI_DECISION_MODEL || 'gemini-decision-1';

/**
 * Raw call to Gemini Decisions API (v1beta)
 * Zero output tokens, returns calibrated confidence & probabilities
 */
export async function callGeminiDecision({ input, questions, signal }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const payload = {
    model: DECISION_MODEL,
    input,
    questions,
  };

  const response = await fetch(DECISIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Connection': 'keep-alive',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Decisions API error (${response.status} ${response.statusText}): ${errorText}`);
  }

  return response.json();
}

const decisionCache = new Map();

/**
 * High-precision categorical answer classification for ambiguous transcripts.
 * Evaluates semantic mastery (including circumlocutions) vs specific cognitive error modes.
 */
export async function classifyWithDecisionModel({
  checkin_question,
  target_answer_concept,
  child_transcript,
  story_context = null,
  signal,
}) {
  const cacheKey = `${checkin_question || ''}::${target_answer_concept || ''}::${child_transcript || ''}`;
  if (decisionCache.has(cacheKey)) {
    return decisionCache.get(cacheKey);
  }
  const promptLines = [
    `Question: "${checkin_question}"`,
    `Target Answer Concept: "${target_answer_concept}"`,
  ];
  if (story_context && typeof story_context === 'object') {
    promptLines.push(`Story Context: ${JSON.stringify(story_context)}`);
  }
  promptLines.push(`Child Transcript: "${child_transcript}"`);
  const prompt = promptLines.join('\n');

  const questions = {
    classification: {
      type: 'choice',
      instructions: 'Which diagnostic category best describes the child\'s response to the question?',
      criteria: {
        MASTERED:
          'The child correctly answers the question or captures the key actor or cause (e.g. "grandma made it", "his nana knitted it", "she made it for him"), including functional circumlocutions (e.g. describing a fisherman as "person who catches fish with a net" or a gardener as "lady who waters plants"), direct paraphrases, or core noun phrases.',
        CHARACTER_CONFUSION:
          'The child confuses who did what, naming the wrong character, wrong agent, wrong animal, or wrong recipient (e.g., naming a dog instead of a cat, grandpa instead of grandma).',
        DISTRACTOR_MISCONCEPTION:
          'The child states a contradiction, contradictory story detail (e.g. saying a red hat was a blue hat), negation of the fact (e.g. saying grandma didn\'t make it), plausible distractor, misconception, or contrary event (e.g. buying it at a store, becoming a flower).',
        SUPERFICIAL_ATTRIBUTE:
          'The child only mentions superficial visual attributes, appearance, or isolated feelings without identifying the key actor or explaining the cause (e.g. "his hat was red", "warm hat", "he loved his hat", "he really loved it").',
        PREMISE_ECHO:
          'The child merely repeats parts of the question premise or the story setup without giving an answer.',
        OFF_TRACK:
          'The child is completely off topic, unrelated to the story, or unintelligible.',
      },
    },
  };

  const result = await callGeminiDecision({
    input: prompt,
    questions,
    signal,
  });

  const answer = result?.answers?.classification;
  const classificationResult = {
    category: answer?.choice || 'OFF_TRACK',
    confidence: answer?.confidence || 0,
    probabilities: answer?.probabilities || {},
    usage: result?.usage || { total_output_tokens: 0 },
  };

  if (decisionCache.size >= 500) {
    const firstKey = decisionCache.keys().next().value;
    decisionCache.delete(firstKey);
  }
  decisionCache.set(cacheKey, classificationResult);

  return classificationResult;
}

/**
 * Multimodal Visual Grounding Verification via Gemini Decision 1
 * Validates whether the book page image text/illustrations factually support the target concept.
 */
export async function verifyVisualGroundingWithDecision({
  imageBuffer,
  mimeType = 'image/png',
  target_answer_concept,
  checkin_question,
  signal,
}) {
  const imageBase64 = Buffer.isBuffer(imageBuffer)
    ? imageBuffer.toString('base64')
    : imageBuffer;

  const input = [
    {
      type: 'image',
      data: imageBase64,
      mime_type: mimeType,
    },
    {
      type: 'text',
      text: 'This is a photographed page from a children\'s Grade 2 reading book.',
    },
  ];

  const questions = {
    is_grounded: {
      type: 'noul',
      instructions: `Does the text or illustration on this page factually support or show that: ${target_answer_concept}?`,
    },
    is_legible: {
      type: 'noul',
      instructions: 'Is the page text legible and readable without severe blur or heavy occlusions?',
    },
  };

  const result = await callGeminiDecision({
    input,
    questions,
    signal,
  });

  const isGrounded = result?.answers?.is_grounded;
  const isLegible = result?.answers?.is_legible;

  return {
    grounded: (isGrounded?.noul || 0) >= 0.60,
    groundedConfidence: isGrounded?.confidence || 0,
    groundedProbability: isGrounded?.noul || 0,
    legible: (isLegible?.noul || 0) >= 0.50,
    legibleConfidence: isLegible?.confidence || 0,
    usage: result?.usage || { total_output_tokens: 0 },
  };
}

export default {
  callGeminiDecision,
  classifyWithDecisionModel,
  verifyVisualGroundingWithDecision,
};
