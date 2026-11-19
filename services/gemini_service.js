import { GoogleGenAI, Type } from '@google/genai';
import {
  BOOK_ANALYSIS_SYSTEM_PROMPT,
  BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT,
  BOOK_ANALYSIS_SCHEMA,
} from '../prompts/book_analysis.js';
import { ANSWER_EVALUATION_SYSTEM_PROMPT, ANSWER_EVALUATION_SCHEMA } from '../prompts/answer_evaluation.js';
import { rateLimiter } from './rate_limiter.js';
import { verifyGroundingFidelity } from './grounding_verifier.js';
import { classifyWithDecisionModel } from './gemini_decision_service.js';
import defaultDecisionBreaker from './connectivity_circuit_breaker.js';

export function safeJsonParse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid JSON received from model: empty response text');
  }

  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Invalid JSON received from model: ${err.message}`);
  }
}

/**
 * Classifies Gemini model output for error diagnosis, retryability, and health tracking.
 *
 * @param {Object} response - Gemini API response object
 * @returns {{ status: 'ok'|'retryable'|'error', code?: string, message?: string, retryableStatus?: number, text?: string }}
 */
export function classifyModelResponse(response) {
  if (!response) {
    return {
      status: 'retryable',
      retryableStatus: 503,
      message: 'Invalid JSON received from model: empty response text',
    };
  }

  // 1. Check prompt-level blocks
  if (response.promptFeedback && response.promptFeedback.blockReason) {
    return {
      status: 'error',
      code: 'PROMPT_BLOCKED',
      message: `Prompt was blocked by safety filters: ${response.promptFeedback.blockReason}`,
    };
  }

  // 2. Check candidate-level finish reasons
  const candidate = response.candidates && response.candidates[0];
  const finishReason = candidate ? candidate.finishReason : null;

  if (finishReason === 'SAFETY') {
    return {
      status: 'error',
      code: 'SAFETY_BLOCKED',
      message: 'Model response was blocked due to safety policy violations.',
    };
  }

  if (finishReason === 'RECITATION') {
    return {
      status: 'error',
      code: 'RECITATION_BLOCKED',
      message: 'Model response was blocked due to recitation/copyright policy.',
    };
  }

  if (finishReason === 'MAX_TOKENS') {
    return {
      status: 'error',
      code: 'MAX_TOKENS_EXCEEDED',
      message: 'Model response exceeded maximum token allocation.',
    };
  }

  if (finishReason === 'PROMPT_BLOCKED' || finishReason === 'BLOCKLIST' || finishReason === 'PROHIBITED_CONTENT') {
    return {
      status: 'error',
      code: 'PROMPT_BLOCKED',
      message: `Model candidate was blocked with reason: ${finishReason}`,
    };
  }

  // 3. Check for empty response text (transient model dropout)
  const rawText = typeof response.text === 'string' ? response.text.trim() : '';
  if (!rawText) {
    return {
      status: 'retryable',
      retryableStatus: 503,
      message: 'Invalid JSON received from model: empty response text',
    };
  }

  return {
    status: 'ok',
    text: response.text,
  };
}

export function getMockBookAnalysis(files = []) {
  const hasBlurry = files.some((file) =>
    (file.originalname || '').toLowerCase().includes('blurry')
  );

  if (hasBlurry) {
    return {
      is_legible: false,
      error_message: 'Image appears too blurry or poorly lit to read.',
    };
  }

  const mockAnalysis = {
    is_legible: true,
    error_message: null,
    book_type: 'fiction',
    summary:
      'Leo goes on an adventure to find his lost hat in the park. Along the way, he learns how to ask his friends for help.',
    chunks: [
      {
        chunk_id: 1,
        page_range: 'Pages 1-2',
        chunk_type: 'scene',
        paraphrased_story_facts:
          'Leo was upset when his hat blew away in the park because his grandmother knitted the warm red hat for him and it was special.',
        story_facts: [
          'Leo was playing outside in the park on a windy day.',
          'Leo was wearing a warm red hat that his grandmother knitted for him.',
          'A strong gust of wind blew the red hat right off Leo\'s head.',
          'Leo became very upset because the hat was a special gift from his grandmother.',
        ],
        verbatim_page_text:
          'Leo was upset when his hat blew away in the park because his grandmother knitted the warm red hat for him and it was special.',
        lookout_prompt:
          'Before you read, keep an eye out for how Leo feels when he loses his favorite hat.',
        checkin_question: 'Why did Leo get upset when his hat blew away?',
        question_type: 'cause_and_effect',
        target_answer_concept:
          'He was upset because his grandmother made it for him and it was special.',
        keyword_clusters: [
          { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny'] },
          { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved'] },
        ],
        acceptable_phrasings: [
          'His grandma made it for him.',
          'It was special because his grandmother knitted it.',
        ],
        canonical_prototypes: [
          { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
          { type: 'colloquial', text: 'His granny knitted it so he really loved it.' },
          { type: 'minimal_core', text: 'Grandma made it.' },
          { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
          { type: 'common_distractor', text: 'He bought it at the store.' },
        ],
        diagnostic_probes: {
          target_mastery: {
            hypothesis: 'Grandma made the hat and it was special.',
            feedback: 'Spot on! His grandma knitted that warm red hat just for him!',
          },
          minimal_core: {
            hypothesis: 'Grandma made it.',
            feedback: 'Exactly right! His grandma made it!',
          },
          superficial_attribute: {
            hypothesis: 'The hat is red and warm.',
            scaffold: 'Yes, it was a warm red hat! But think about who made that hat for Leo.',
          },
          premise_echo: {
            hypothesis: 'The hat blew away and got lost in the wind.',
            scaffold: 'Yes, his hat blew away! But why was that hat so special to Leo?',
          },
          character_confusion: {
            hypothesis: 'His grandpa or mother made the hat.',
            scaffold: 'Check the picture! Did his grandpa make it, or was it someone else?',
          },
          distractor_misconception: {
            hypothesis: 'He bought it at a store or shop.',
            scaffold: 'He didn\'t buy it at a store! Look at who knitted it for him!',
          },
        },
        hint_level_1: 'Look at who made the hat for Leo.',
        hint_level_2: 'Who knitted that warm red hat?',
        scaffold_hint: 'Think about who made that warm red hat for Leo!',
        entity_graph: {
          characters: [
            { canonical_id: 'char_leo', canonical_name: 'Leo', aliases: ['Leo'] },
            { canonical_id: 'char_grandma', canonical_name: 'grandmother', aliases: ['grandma', 'granny', 'nana'] },
          ],
        },
      },
    ],
  };

  if (Array.isArray(mockAnalysis.chunks)) {
    for (const chunk of mockAnalysis.chunks) {
      if (!chunk.paraphrased_story_facts && chunk.verbatim_page_text) {
        chunk.paraphrased_story_facts = chunk.verbatim_page_text;
      }
    }
  }

  return mockAnalysis;
}

export function sanitizeAnalysisProbes(analysis) {
  if (!analysis || !Array.isArray(analysis.chunks)) return analysis;
  const META_COGNITIVE_REGEX = /^(?:(?:the\s+)?(?:child|student|user|reader|speaker)\s+)?(?:understands|identifies|identified|knows|confuses|confused|repeats|repeated|focused\s+on|believes|thinks|recalls|says|said|states|stated|mentions|mentioned)\s+(?:that\s+)?/i;
  const LEADING_INTERROGATIVE_REGEX = /^(?:who|what|why|where|when|how|did|does|do|is|are|was|were|can|could|would)\s+(?:did\s+|does\s+|will\s+|was\s+|is\s+)?/i;

  for (const chunk of analysis.chunks) {
    if (chunk.diagnostic_probes) {
      for (const [key, probe] of Object.entries(chunk.diagnostic_probes)) {
        if (probe && typeof probe.hypothesis === 'string') {
          let hyp = probe.hypothesis.trim();
          if (META_COGNITIVE_REGEX.test(hyp)) {
            hyp = hyp.replace(META_COGNITIVE_REGEX, '').trim();
          }
          if (LEADING_INTERROGATIVE_REGEX.test(hyp)) {
            hyp = hyp.replace(LEADING_INTERROGATIVE_REGEX, '').trim();
            hyp = hyp.replace(/\?+$/, '').trim();
          }
          if (/^['"]/.test(hyp)) {
            hyp = hyp.replace(/^['"]+/, '').replace(/['"]+$/, '').trim();
          }
          if (hyp.length > 0) {
            probe.hypothesis = hyp.charAt(0).toUpperCase() + hyp.slice(1);
          }
        }
      }
    }
  }
  return analysis;
}

/**
 * Executes a book analysis API function with primary model and automatic fallback on 503 high demand.
 * Safely parses and sanitizes the response.
 *
 * @param {Function} apiFn - Async function (modelName) => rawResponse
 * @param {Object} [options]
 * @param {string} [options.primaryModel]
 * @param {string} [options.fallbackModel]
 * @returns {Promise<Object>} Parsed and sanitized analysis object
 */
export async function executeBookAnalysisWithFallback(apiFn, options = {}) {
  const primaryModel = options.primaryModel || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const fallbackModel = options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

  let rawResponse;
  try {
    rawResponse = await apiFn(primaryModel);
  } catch (err) {
    const errMsg = (err && typeof err.message === 'string') ? err.message : '';
    const is503 = err?.status === 503 ||
      errMsg.includes('503') ||
      errMsg.toLowerCase().includes('high demand') ||
      err?.status === 404 ||
      errMsg.includes('404');

    if (is503) {
      console.warn(`⚠️ [GEMINI FALLBACK] Primary model '${primaryModel}' unavailable (${err?.status || '503/high demand'}). Falling back to '${fallbackModel}'. Reason: ${errMsg}`);
      rawResponse = await apiFn(fallbackModel);
    } else {
      throw err;
    }
  }

  const responseText = rawResponse && typeof rawResponse.text === 'string'
    ? rawResponse.text
    : (typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse));

  const parsed = safeJsonParse(responseText);
  return sanitizeAnalysisProbes(parsed);
}

export async function analyzeBookPages(files) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('No files provided');
  }

  const isMock = process.env.MOCK_AI === 'true' || !process.env.GEMINI_API_KEY;
  if (isMock) {
    if (!process.env.GEMINI_API_KEY && process.env.MOCK_AI !== 'true') {
      console.warn('⚠️ [GEMINI WARNING] GEMINI_API_KEY is missing or empty. Falling back to offline mock mode.');
    }
    const analysis = sanitizeAnalysisProbes(getMockBookAnalysis(files));
    if (analysis && Array.isArray(analysis.chunks)) {
      for (const chunk of analysis.chunks) {
        chunk.grounding_verification = await verifyGroundingFidelity(chunk, {
          imageBuffer: files[0]?.buffer,
        });
      }
    }
    return analysis;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const contents = files.map((file) => ({
    inlineData: {
      mimeType: file.mimetype || 'image/jpeg',
      data: file.buffer.toString('base64'),
    },
  }));

  contents.push('Analyze these book pages in sequence according to Grade 2 reading standards.');

  const analysis = await executeBookAnalysisWithFallback(async (modelName) => {
    // Adaptive Anti-Recitation Pipeline:
    // Pass 1: Try Direct Extraction to preserve the author's exact sentences and story text without forced paraphrasing.
    // Pass 2: If and ONLY if model blocks on copyright RECITATION, catch it and fall back to anti-recitation paraphrasing.
    const invokeModel = async (systemInstruction, isFallback = false) => {
      return await rateLimiter.executeWithRetry(async () => {
        const config = {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: BOOK_ANALYSIS_SCHEMA,
          maxOutputTokens: 8192,
        };
        if (typeof modelName === 'string' && (modelName.includes('3.1') || modelName.includes('thinking'))) {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const res = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });

        const outcome = classifyModelResponse(res);
        if (outcome.status === 'retryable') {
          const err = new Error(outcome.message);
          err.status = outcome.retryableStatus || 503;
          throw err;
        }
        if (outcome.status === 'error') {
          const err = new Error(outcome.message);
          err.code = outcome.code;
          throw err;
        }

        return res;
      }, 1);
    };

    try {
      return await invokeModel(BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT, false);
    } catch (err) {
      if (err.code === 'RECITATION_BLOCKED' || (typeof err.message === 'string' && err.message.toLowerCase().includes('recitation'))) {
        console.warn('⚡ [RECITATION DETECTED] Copyright recitation filter triggered on verbatim text. Falling back to anti-recitation paraphrasing prompt...');
        return await invokeModel(BOOK_ANALYSIS_SYSTEM_PROMPT, true);
      }
      throw err;
    }
  });

  if (analysis && Array.isArray(analysis.chunks)) {
    for (const chunk of analysis.chunks) {
      chunk.grounding_verification = await verifyGroundingFidelity(chunk, {
        imageBuffer: files[0]?.buffer,
        mimeType: files[0]?.mimetype,
      });
    }
  }
  return analysis;
}

export function getMockAnswerClassification(data = {}) {
  const text = (data.child_transcript || '').toLowerCase();
  if (text.includes('special') || text.includes('grandma') || text.includes('made')) {
    return { understands_concept: true, confidence: 'high' };
  }
  return { understands_concept: false, confidence: 'high' };
}

export async function classifyAnswerSemantic(data = {}) {
  const isMock = process.env.MOCK_AI === 'true' || !process.env.GEMINI_API_KEY;
  if (isMock) {
    if (!process.env.GEMINI_API_KEY && process.env.MOCK_AI !== 'true') {
      console.warn('⚠️ [GEMINI WARNING] GEMINI_API_KEY is missing or empty. Falling back to offline mock mode.');
    }
    return getMockAnswerClassification(data);
  }

  // 1. Fast Zero-Output-Token Evaluation via Gemini Decision 1 (Protected by Circuit Breaker)
  if (process.env.DISABLE_DECISION_MODEL !== 'true') {
    try {
      const decision = await defaultDecisionBreaker.execute(
        async (signal) => {
          return await classifyWithDecisionModel({
            checkin_question: data.checkin_question,
            target_answer_concept: data.target_answer_concept,
            child_transcript: data.child_transcript,
            story_context: data.story_context,
            signal,
          });
        },
        (fallbackReason) => {
          console.warn(`⚡ [DECISION FALLBACK] Circuit skipped (${fallbackReason}).`);
          return null;
        }
      );

      if (decision && decision.category) {
        return {
          understands_concept: decision.category === 'MASTERED',
          confidence: decision.confidence >= 0.70 ? 'high' : 'medium',
          cognitive_diagnosis: decision.category,
          probabilities: decision.probabilities,
          model_used: 'gemini-decision-1',
          output_tokens: 0,
        };
      }
    } catch (err) {
      console.warn(`⚠️ [DECISION ERROR] ${err.message}. Falling back to generative classifier.`);
    }
  }

  // 2. Generative Flash Fallback
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const prompt = `Question: "${data.checkin_question}"\nTarget Concept: "${data.target_answer_concept}"\nChild Spoke: "${data.child_transcript}"\nDid the child express the target concept?`;

  try {
    const response = await rateLimiter.executeWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: [prompt],
        config: {
          systemInstruction: ANSWER_EVALUATION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: ANSWER_EVALUATION_SCHEMA,
        },
      })
    );

    return safeJsonParse(response.text);
  } catch (err) {
    console.warn(`⚠️ [GEMINI FALLBACK] classifyAnswerSemantic error: ${err.message}. Falling back to mock classifier.`);
    return getMockAnswerClassification(data);
  }
}

export default {
  analyzeBookPages,
  classifyAnswerSemantic,
  classifyModelResponse,
  executeBookAnalysisWithFallback,
  getMockAnswerClassification,
  getMockBookAnalysis,
  safeJsonParse,
};
