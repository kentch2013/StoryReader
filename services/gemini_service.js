import { GoogleGenAI, Type } from '@google/genai';
import { BOOK_ANALYSIS_SYSTEM_PROMPT, BOOK_ANALYSIS_SCHEMA } from '../prompts/book_analysis.js';
import { rateLimiter } from './rate_limiter.js';

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
        lookout_prompt:
          'Before you read, keep an eye out for how Leo feels when he loses his favorite hat.',
        checkin_question: 'Why did Leo get upset when his hat blew away?',
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
        hint_level_1: 'Look at who made the hat for Leo.',
        hint_level_2: 'Who knitted that warm red hat?',
        scaffold_hint: 'Think about who made that warm red hat for Leo!',
      },
    ],
  };
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
    return getMockBookAnalysis(files);
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

  return safeJsonParse(response.text);
}

export default {
  analyzeBookPages,
  getMockBookAnalysis,
  safeJsonParse,
};
