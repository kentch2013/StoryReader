import crypto from 'node:crypto';
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

const PEDAGOGY_STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'they', 'them', 'their', 'theirs',
  'there', 'these', 'those', 'then', 'than', 'when', 'where', 'which',
  'what', 'who', 'whom', 'whose', 'why', 'how', 'have', 'having', 'had',
  'been', 'were', 'being', 'will', 'would', 'could', 'should', 'about',
  'above', 'below', 'under', 'again', 'further', 'once', 'here', 'more',
  'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'before', 'after', 'read', 'watch', 'look',
  'keep', 'find', 'does', 'doing', 'done', 'because', 'into', 'through',
  'during', 'each', 'both', 'between', 'while',
]);

/**
 * Audits a chunk's pedagogical soundness, lookout spoiler risk, and question brevity.
 *
 * @param {Object} chunk
 * @returns {{ spoiler_leak: boolean, is_trivia_only: boolean, word_count_ok: boolean, passed: boolean, shared_words: string[] }}
 */
export function auditChunkPedagogy(chunk = {}) {
  const lookoutPrompt = typeof chunk.lookout_prompt === 'string' ? chunk.lookout_prompt : '';
  const targetConcept = typeof chunk.target_answer_concept === 'string' ? chunk.target_answer_concept : '';
  const checkinQuestion = typeof chunk.checkin_question === 'string' ? chunk.checkin_question : '';
  const questionType = chunk.question_type || '';

  // Extract character names and aliases from entity_graph to exclude them from content-word spoiler detection
  const characterWords = new Set();
  if (Array.isArray(chunk.entity_graph?.characters)) {
    for (const char of chunk.entity_graph.characters) {
      if (typeof char.canonical_name === 'string') {
        char.canonical_name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach((w) => {
          if (w.length >= 4) characterWords.add(w);
        });
      }
      if (Array.isArray(char.aliases)) {
        for (const alias of char.aliases) {
          if (typeof alias === 'string') {
            alias.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach((w) => {
              if (w.length >= 4) characterWords.add(w);
            });
          }
        }
      }
    }
  }

  function extractContentWords(text) {
    const words = new Set();
    const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    for (const token of tokens) {
      if (token.length >= 4 && !PEDAGOGY_STOPWORDS.has(token) && !characterWords.has(token)) {
        words.add(token);
      }
    }
    return words;
  }

  const lookoutWords = extractContentWords(lookoutPrompt);
  const targetWords = extractContentWords(targetConcept);

  const sharedWords = [];
  for (const word of lookoutWords) {
    if (targetWords.has(word)) {
      sharedWords.push(word);
    }
  }

  // 1. spoiler_leak: true if lookout_prompt shares >= 2 content words with target_answer_concept
  const spoiler_leak = sharedWords.length >= 2;

  // 2. is_trivia_only: true if checkin_question matches /^(what color|how many|what size)\b/i and question_type !== 'observable_visual'
  const triviaRegex = /^(what color|how many|what size)\b/i;
  const is_trivia_only = triviaRegex.test(checkinQuestion.trim()) && questionType !== 'observable_visual';

  // 3. word_count_ok: checkin_question <= 15 words and lookout_prompt <= 16 words
  const qWordCount = checkinQuestion.trim() ? checkinQuestion.trim().split(/\s+/).filter(Boolean).length : 0;
  const lWordCount = lookoutPrompt.trim() ? lookoutPrompt.trim().split(/\s+/).filter(Boolean).length : 0;
  const word_count_ok = qWordCount <= 15 && lWordCount <= 16;

  // 4. passed: !spoiler_leak && !is_trivia_only && word_count_ok
  const passed = !spoiler_leak && !is_trivia_only && word_count_ok;

  return {
    spoiler_leak,
    is_trivia_only,
    word_count_ok,
    passed,
    shared_words: sharedWords,
    word_counts: {
      question: qWordCount,
      lookout: lWordCount,
    },
  };
}

const MAX_BOOK_CACHE_ENTRIES = 25;
const bookAnalysisCache = new Map();

export function computeBookCacheKey(files = []) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file.mimetype || 'image/jpeg');
    hash.update(file.buffer || Buffer.alloc(0));
  }
  return hash.digest('hex');
}

export function clearBookAnalysisCache() {
  bookAnalysisCache.clear();
}

function getFromCache(cacheKey) {
  if (process.env.DISABLE_BOOK_CACHE === 'true') return null;
  if (!bookAnalysisCache.has(cacheKey)) return null;
  const entry = bookAnalysisCache.get(cacheKey);
  // Re-insert to mark as MRU
  bookAnalysisCache.delete(cacheKey);
  bookAnalysisCache.set(cacheKey, entry);
  return JSON.parse(JSON.stringify(entry));
}

function setInCache(cacheKey, analysis) {
  if (process.env.DISABLE_BOOK_CACHE === 'true') return;
  if (bookAnalysisCache.has(cacheKey)) {
    bookAnalysisCache.delete(cacheKey);
  } else if (bookAnalysisCache.size >= MAX_BOOK_CACHE_ENTRIES) {
    const oldestKey = bookAnalysisCache.keys().next().value;
    bookAnalysisCache.delete(oldestKey);
  }
  const entryToStore = JSON.parse(JSON.stringify(analysis));
  delete entryToStore._cacheHit;
  bookAnalysisCache.set(cacheKey, entryToStore);
}

export function offsetPageRange(pageRangeStr, pageOffset) {
  if (!pageRangeStr || typeof pageRangeStr !== 'string' || !pageOffset) {
    return pageRangeStr;
  }
  return pageRangeStr.replace(/\b(\d+)\b/g, (match) => {
    const pageNum = parseInt(match, 10);
    return String(pageNum + pageOffset);
  });
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
        question_type: 'wh_causality',
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
      {
        chunk_id: 2,
        page_range: 'Pages 3-4',
        chunk_type: 'scene',
        paraphrased_story_facts:
          'Leo looked up and saw his hat caught in a tall oak tree. A friendly squirrel was sitting on the branch next to the red hat.',
        story_facts: [
          'Leo ran across the grass to look for his lost hat.',
          'The red hat was caught high up in a tall oak tree.',
          'A friendly squirrel was sitting on the branch right next to the red hat.',
        ],
        verbatim_page_text:
          'Leo looked up and saw his hat caught in a tall oak tree. A friendly squirrel was sitting on the branch next to the red hat.',
        lookout_prompt:
          'Before you read, watch for what animal Leo spots high in the branches.',
        checkin_question: 'Leo looked up into the branches and saw a bushy-tailed...',
        question_type: 'completion_cloze',
        target_answer_concept: 'A squirrel sitting near his hat.',
        keyword_clusters: [
          { concept_name: 'animal', synonyms: ['squirrel', 'tree squirrel'] },
          { concept_name: 'location', synonyms: ['branch', 'tree', 'high up'] },
        ],
        acceptable_phrasings: [
          'A squirrel in the tree.',
          'He saw a little squirrel.',
        ],
        canonical_prototypes: [
          { type: 'formal_full', text: 'He saw a bushy-tailed squirrel sitting on the branch.' },
          { type: 'colloquial', text: 'A little tree squirrel.' },
          { type: 'minimal_core', text: 'a squirrel' },
          { type: 'partial_action', text: 'sitting in the tree' },
          { type: 'common_distractor', text: 'a big black bird' },
        ],
        diagnostic_probes: {
          target_mastery: {
            hypothesis: 'A squirrel was sitting on the branch.',
            feedback: 'Spot on! He spotted a squirrel right next to his hat!',
          },
          minimal_core: {
            hypothesis: 'A squirrel.',
            feedback: 'Exactly right! A squirrel!',
          },
          superficial_attribute: {
            hypothesis: 'The tree is very tall.',
            scaffold: 'Yes, the tree was tall! But look at what furry animal was in the branches.',
          },
          premise_echo: {
            hypothesis: 'He saw something bushy-tailed.',
            scaffold: 'Yes! What was that bushy-tailed animal in the tree?',
          },
          character_confusion: {
            hypothesis: 'He saw a dog or cat in the tree.',
            scaffold: 'Look closely at the picture! Can dogs climb up trees like that?',
          },
          distractor_misconception: {
            hypothesis: 'He saw a bird in the tree.',
            scaffold: 'It was not a bird! What animal with a bushy tail was up there?',
          },
        },
        hint_level_1: 'Look at the branch near the hat in the picture.',
        hint_level_2: 'What animal is sitting in the oak tree?',
        scaffold_hint: 'Look for the little animal with a bushy tail in the tree!',
        entity_graph: {
          characters: [
            { canonical_id: 'char_leo', canonical_name: 'Leo', aliases: ['Leo'] },
            { canonical_id: 'char_squirrel', canonical_name: 'squirrel', aliases: ['bushy-tailed squirrel', 'little squirrel'] },
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
      chunk.pedagogy_audit = auditChunkPedagogy(chunk);
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

        if ((key === 'target_mastery' || key === 'minimal_core') && typeof probe.feedback === 'string') {
          const trimmed = probe.feedback.trim();
          if (trimmed.endsWith('?') || LEADING_INTERROGATIVE_REGEX.test(trimmed)) {
            probe.feedback = 'Spot on! That is exactly right!';
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

export async function analyzeBookBatch(files) {
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
        chunk.pedagogy_audit = auditChunkPedagogy(chunk);
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

  const thinkingBudget = parseInt(process.env.BOOK_ANALYSIS_THINKING_BUDGET || '512', 10);

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

        if (thinkingBudget >= 0) {
          config.thinkingConfig = { thinkingBudget };
        }

        let res;
        try {
          res = await ai.models.generateContent({
            model: modelName,
            contents,
            config,
          });
        } catch (err) {
          const errMsg = (err && typeof err.message === 'string') ? err.message : '';
          const isThinkingErr = (err?.status === 400 || (err?.code && String(err.code).includes('INVALID'))) &&
            (errMsg.toLowerCase().includes('thinkingbudget') || errMsg.toLowerCase().includes('thinkingconfig'));

          if (isThinkingErr && config.thinkingConfig && config.thinkingConfig.thinkingBudget !== 0) {
            console.warn('⚠️ [THINKING RETRY] Invalid argument for thinkingConfig/thinkingBudget. Retrying with thinkingBudget: 0');
            config.thinkingConfig = { thinkingBudget: 0 };
            res = await ai.models.generateContent({
              model: modelName,
              contents,
              config,
            });
          } else {
            throw err;
          }
        }

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
      if (process.env.DIRECT_PARAPHRASE_MODE === 'true') {
        return await invokeModel(BOOK_ANALYSIS_SYSTEM_PROMPT, true);
      }
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
      chunk.pedagogy_audit = auditChunkPedagogy(chunk);
    }
  }
  return analysis;
}

export async function analyzeBookPages(files) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('No files provided');
  }

  const cacheKey = computeBookCacheKey(files);
  const cached = getFromCache(cacheKey);
  if (cached) {
    cached._cacheHit = true;
    return cached;
  }

  let analysis;
  if (files.length > 6) {
    const BATCH_SIZE = 6;
    const batchResults = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batchFiles = files.slice(i, i + BATCH_SIZE);
      const batchAnalysis = await analyzeBookBatch(batchFiles);
      if (!batchAnalysis || !batchAnalysis.is_legible) {
        batchAnalysis._cacheHit = false;
        return batchAnalysis;
      }
      batchResults.push({ analysis: batchAnalysis, pageOffset: i });
    }

    const mergedChunks = [];
    const summaries = [];
    let bookType = 'fiction';

    for (const { analysis: bAnalysis, pageOffset } of batchResults) {
      if (bAnalysis.summary) summaries.push(bAnalysis.summary);
      if (bAnalysis.book_type) bookType = bAnalysis.book_type;
      if (Array.isArray(bAnalysis.chunks)) {
        for (const chunk of bAnalysis.chunks) {
          const adjustedChunk = {
            ...chunk,
            page_range: offsetPageRange(chunk.page_range, pageOffset),
          };
          mergedChunks.push(adjustedChunk);
        }
      }
    }

    mergedChunks.forEach((chunk, idx) => {
      chunk.chunk_id = idx + 1;
    });

    analysis = {
      is_legible: true,
      error_message: null,
      book_type: bookType,
      summary: summaries.join(' '),
      chunks: mergedChunks,
    };
  } else {
    analysis = await analyzeBookBatch(files);
  }

  analysis._cacheHit = false;
  setInCache(cacheKey, analysis);
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
  analyzeBookBatch,
  analyzeBookPages,
  auditChunkPedagogy,
  clearBookAnalysisCache,
  classifyAnswerSemantic,
  classifyModelResponse,
  computeBookCacheKey,
  executeBookAnalysisWithFallback,
  getMockAnswerClassification,
  getMockBookAnalysis,
  offsetPageRange,
  safeJsonParse,
};
