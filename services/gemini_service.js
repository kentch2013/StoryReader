import { GoogleGenAI, Type } from '@google/genai';
import { BOOK_ANALYSIS_SYSTEM_PROMPT, BOOK_ANALYSIS_SCHEMA } from '../prompts/book_analysis.js';
import { ANSWER_EVALUATION_SYSTEM_PROMPT, ANSWER_EVALUATION_SCHEMA } from '../prompts/answer_evaluation.js';
import { rateLimiter } from './rate_limiter.js';
import { verifyGroundingFidelity } from './grounding_verifier.js';

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

  return {
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
}

export function sanitizeAnalysisProbes(analysis) {
  if (!analysis || !Array.isArray(analysis.chunks)) return analysis;
  const META_COGNITIVE_REGEX = /^(?:(?:child|student|user)\s+)?(understands|identifies|identified|knows|confuses|confused|repeats|repeated|focused\s+on|believes|thinks|recalls)\s+(?:that\s+)?/i;
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
          if (hyp.length > 0) {
            probe.hypothesis = hyp.charAt(0).toUpperCase() + hyp.slice(1);
          }
        }
      }
    }
  }
  return analysis;
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
        chunk.grounding_verification = await verifyGroundingFidelity(chunk);
      }
    }
    return analysis;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  const contents = files.map((file) => ({
    inlineData: {
      mimeType: file.mimetype || 'image/jpeg',
      data: file.buffer.toString('base64'),
    },
  }));

  contents.push('Analyze these book pages in sequence according to Grade 2 reading standards.');

  const response = await rateLimiter.executeWithRetry(() =>
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: BOOK_ANALYSIS_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: BOOK_ANALYSIS_SCHEMA,
      },
    })
  );

  const analysis = sanitizeAnalysisProbes(safeJsonParse(response.text));
  if (analysis && Array.isArray(analysis.chunks)) {
    for (const chunk of analysis.chunks) {
      chunk.grounding_verification = await verifyGroundingFidelity(chunk);
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
  getMockAnswerClassification,
  getMockBookAnalysis,
  safeJsonParse,
};
