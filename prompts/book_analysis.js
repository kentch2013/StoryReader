import { Type } from '@google/genai';

export const BOOK_ANALYSIS_SYSTEM_PROMPT = `
You are StoryScout, an expert AI reading coach for Grade 2 children (ages 7-8).
Your mission is to analyze sequential book pages and segment them into bite-sized, engaging reading chunks (pairing 2-3 pages together if text is light).

Pedagogical Framework:
- Common Core RL.2.1: Key Details (who, what, where, when, why).
- Common Core RL.2.3: Character Actions & Motivations (how characters respond to challenges).

Output must be objectively gradeable by an automated speech judge in Module 3. Subjectivity is strictly forbidden. Every answer must be verifiable directly from printed text or illustration details.

Strict Generation Rules:
1. "lookout_prompt":
   - Format: "Before you read, watch for [character action/clue]."
   - Under 15 words. NO spoilers.
2. "checkin_question":
   - Factual question directly resolving the lookout clue. Focus on cause-and-effect or key actions.
   - Under 13 words.
3. "target_answer_concept":
   - The necessary and sufficient factual kernel for full credit. Under 14 words.
4. "keyword_clusters":
   - Exactly 2 concept clusters required for mastery.
   - Each cluster has a "concept_name" and 2-4 acceptable synonyms/inflections a 7-year-old might naturally speak.
5. "acceptable_phrasings":
   - Exactly 2 natural spoken examples of how a real Grade 2 child would answer.
6. "hint_level_1" (Spatial Anchor):
   - Directs the child's eyes to the exact location on the page. Under 15 words.
7. "hint_level_2" (Socratic Leading Question):
   - A simpler leading question to prompt the child on Attempt 2. Under 14 words.
8. "scaffold_hint":
   - Concise primary hint (matches hint_level_1). Under 15 words.
`.trim();

export const BOOK_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_legible: {
      type: Type.BOOLEAN,
      description: 'True if book pages are legible, false if blurry or unreadable',
    },
    error_message: {
      type: Type.STRING,
      description: 'Actionable explanation if pages are unreadable',
      nullable: true,
    },
    book_type: {
      type: Type.STRING,
      enum: ['fiction', 'nonfiction'],
      description: 'Book classification',
    },
    summary: {
      type: Type.STRING,
      description: '2-sentence child-friendly high-level summary',
    },
    chunks: {
      type: Type.ARRAY,
      description: 'Sequential reading chunks',
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          chunk_type: { type: Type.STRING, enum: ['scene', 'page'] },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          keyword_clusters: {
            type: Type.ARRAY,
            description: '2 concept clusters for objective speech scoring',
            items: {
              type: Type.OBJECT,
              properties: {
                concept_name: { type: Type.STRING },
                synonyms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['concept_name', 'synonyms'],
            },
          },
          acceptable_phrasings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Natural spoken examples from a 7-year-old',
          },
          hint_level_1: { type: Type.STRING, description: 'Attempt 1 spatial eye-anchor' },
          hint_level_2: { type: Type.STRING, description: 'Attempt 2 leading question' },
          scaffold_hint: { type: Type.STRING, description: 'Primary hint' },
        },
        required: [
          'chunk_id',
          'page_range',
          'chunk_type',
          'lookout_prompt',
          'checkin_question',
          'target_answer_concept',
          'keyword_clusters',
          'acceptable_phrasings',
          'hint_level_1',
          'hint_level_2',
          'scaffold_hint',
        ],
      },
    },
  },
  required: ['is_legible', 'book_type', 'summary', 'chunks'],
};

export const bookAnalysisPrompt = BOOK_ANALYSIS_SYSTEM_PROMPT;
export const bookAnalysisSchema = BOOK_ANALYSIS_SCHEMA;
