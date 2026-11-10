import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { rateLimiter } from '../services/rate_limiter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const fixturesDir = path.join(projectRoot, 'test', 'fixtures', 'book_pages');

// Test on the full 6-page Runaway Bunny sequence
const bunnyFiles = ['bunny1.png', 'bunny2.png', 'bunny3.png', 'bunny4.png', 'bunny5.png', 'bunny6.png'];
const imageContents = bunnyFiles.map((file) => {
  const filePath = path.join(fixturesDir, file);
  return {
    inlineData: {
      mimeType: 'image/png',
      data: fs.readFileSync(filePath).toString('base64'),
    },
  };
});

// ============================================================================
// VARIANT C: Baseline Candidate (Semantic Kernel + Flat Keyword Array)
// ============================================================================
const PROMPT_C = `
You are StoryScout, an AI reading coach for Grade 2 (ages 7-8).
Divide pages into reading chunks. Output must be objectively gradeable by an automated speech judge without subjectivity.
Rules:
1. "lookout_prompt": "Before you read, look for [observable visual/text clue]." Under 16 words. No spoilers.
2. "checkin_question": Factual who/what/where/why question resolving the lookout prompt. Under 14 words.
3. "target_answer_concept": Necessary and sufficient factual answer. Under 15 words.
4. "essential_keywords": 2 to 4 must-have root words child's spoken answer must contain.
5. "scaffold_hint": Exact page, panel, or visual landmark. Under 18 words.
`.trim();

const SCHEMA_C = {
  type: Type.OBJECT,
  properties: {
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          essential_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          scaffold_hint: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'essential_keywords', 'scaffold_hint'],
      },
    },
  },
  required: ['book_type', 'summary', 'chunks'],
};

// ============================================================================
// VARIANT D: Multi-Group Keyword Clusters & Natural Child Phrasings
// Solves: Child speech variation (e.g. "fishing" vs "fisherman", "went after" vs "run after")
// ============================================================================
const PROMPT_D = `
You are StoryScout, an AI reading specialist for Grade 2.
Your goal is to produce reading chunks whose comprehension checks can be reliably scored by an automated speech recognition engine evaluating a 7-year-old child.

Rules:
1. "lookout_prompt": Warm focus prompt directing attention to an observable detail. Under 15 words. Zero spoilers.
2. "checkin_question": Direct comprehension question resolving the lookout prompt. Under 12 words.
3. "target_answer_concept": One concise factual sentence stating the complete answer. Under 15 words.
4. "keyword_clusters": Exactly 2 concept clusters. Each cluster has 2-4 acceptable synonyms/inflections that a child might naturally speak (e.g. Cluster 1: ["fisherman", "fishing", "fisher"], Cluster 2: ["catch", "fish", "water"]). The child's transcript must hit at least one word from each cluster for full mastery.
5. "acceptable_phrasings": 2 natural examples of how a real 7-year-old would speak this answer aloud.
6. "scaffold_hint": Direct spatial location clue where the answer lives on the page. Under 18 words.
`.trim();

const SCHEMA_D = {
  type: Type.OBJECT,
  properties: {
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          keyword_clusters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                concept_name: { type: Type.STRING },
                synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['concept_name', 'synonyms'],
            },
          },
          acceptable_phrasings: { type: Type.ARRAY, items: { type: Type.STRING } },
          scaffold_hint: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'keyword_clusters', 'acceptable_phrasings', 'scaffold_hint'],
      },
    },
  },
  required: ['book_type', 'summary', 'chunks'],
};

// ============================================================================
// VARIANT E: 2-Tier Progressive Scaffolding (Visual Anchor + Socratic Leading Question)
// Solves: 2-attempt scaffolding loop (Attempt 1 hint vs Attempt 2 hint)
// ============================================================================
const PROMPT_E = `
You are StoryScout, an expert Grade 2 reading intervention coach.
Design reading chunks with progressive 2-stage scaffolding so a child who misses Attempt 1 receives an eye-direction hint, and on Attempt 2 receives a leading question.

Rules:
1. "lookout_prompt": Specific observable focus goal. Format: "Before you read, watch for [clue]." Under 15 words.
2. "checkin_question": Objective question testing the lookout clue. Under 13 words.
3. "target_answer_concept": Clear, factual answer kernel. Under 12 words.
4. "essential_keywords": 2 to 3 required root words.
5. "hint_level_1": Spatial eye-anchor for Attempt 1 failure (e.g. "Look closely at the right page near the river."). Under 15 words.
6. "hint_level_2": Simpler leading question for Attempt 2 failure (e.g. "What tool does the mother hold in her hands?"). Under 14 words.
`.trim();

const SCHEMA_E = {
  type: Type.OBJECT,
  properties: {
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          essential_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          hint_level_1: { type: Type.STRING },
          hint_level_2: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'essential_keywords', 'hint_level_1', 'hint_level_2'],
      },
    },
  },
  required: ['book_type', 'summary', 'chunks'],
};

// ============================================================================
// VARIANT F: Character Agency & Cause-Effect (Common Core RL.2.3 Focus)
// Solves: Surface-level spotting vs. true Grade 2 cause-and-effect comprehension
// ============================================================================
const PROMPT_F = `
You are StoryScout, specializing in Grade 2 Common Core RL.2.3 (how characters respond to challenges and events).
Analyze sequential pages. Every chunk must focus on the cause-and-effect dynamic between characters.

Rules:
1. "lookout_prompt": Focus child on what challenge or choice the character faces. Format: "Watch how [character] responds when [event]." Under 16 words.
2. "checkin_question": Ask WHY the character took that action or WHAT caused their decision. Under 13 words.
3. "target_answer_concept": The objective cause-and-effect fact shown in the text. Under 14 words.
4. "essential_keywords": 2-3 core factual words explaining the cause or action.
5. "scaffold_hint": Direct the child to the dialogue or panel showing the character's choice. Under 18 words.
`.trim();

const SCHEMA_F = {
  type: Type.OBJECT,
  properties: {
    book_type: { type: Type.STRING, enum: ['fiction', 'nonfiction'] },
    summary: { type: Type.STRING },
    chunks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunk_id: { type: Type.INTEGER },
          page_range: { type: Type.STRING },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          target_answer_concept: { type: Type.STRING },
          essential_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          scaffold_hint: { type: Type.STRING },
        },
        required: ['chunk_id', 'page_range', 'lookout_prompt', 'checkin_question', 'target_answer_concept', 'essential_keywords', 'scaffold_hint'],
      },
    },
  },
  required: ['book_type', 'summary', 'chunks'],
};

const candidateVariants = [
  { id: 'C', name: 'Variant C: Baseline Keyword Rubric', prompt: PROMPT_C, schema: SCHEMA_C },
  { id: 'D', name: 'Variant D: Multi-Group Clusters & Child Phrasings', prompt: PROMPT_D, schema: SCHEMA_D },
  { id: 'E', name: 'Variant E: 2-Tier Progressive Scaffolding', prompt: PROMPT_E, schema: SCHEMA_E },
  { id: 'F', name: 'Variant F: Cause-Effect & Character Agency (RL.2.3)', prompt: PROMPT_F, schema: SCHEMA_F },
];

async function callModelWithFallback(config) {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
  for (const model of models) {
    try {
      return await rateLimiter.executeWithRetry(() =>
        ai.models.generateContent({
          model,
          contents: [...imageContents, 'Analyze these book pages in sequence.'],
          config,
        })
      );
    } catch (err) {
      console.warn(`[FALLBACK] Model ${model} returned error (${err.message || err}). Trying fallback...`);
    }
  }
  throw new Error('All model fallbacks failed.');
}

async function runComparativeTrials() {
  console.log(`======================================================================`);
  console.log(`ADVANCED PROMPT OPTIMIZATION TRIALS: 4 COMPETING ARCHITECTURES`);
  console.log(`Target Models: gemini-3.1-flash-lite (primary) -> gemini-3.5-flash-lite (fallback)`);
  console.log(`Test Set     : The Runaway Bunny (6 Pages in 1 Batch)`);
  console.log(`======================================================================\n`);

  for (const v of candidateVariants) {
    console.log(`>>> Testing [${v.name}]...`);
    const t0 = Date.now();
    try {
      const response = await callModelWithFallback({
        systemInstruction: v.prompt,
        responseMimeType: 'application/json',
        responseSchema: v.schema,
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      const data = JSON.parse(response.text);

      console.log(`    Status  : SUCCESS in ${elapsed}s | Chunks: ${data.chunks.length}`);
      
      // Print first 2 chunks for deep inspection
      data.chunks.slice(0, 2).forEach((c) => {
        console.log(`    --------------------------------------------------`);
        console.log(`    Chunk #${c.chunk_id} (${c.page_range})`);
        console.log(`    👀 Lookout : "${c.lookout_prompt}"`);
        console.log(`    ❓ Checkin : "${c.checkin_question}"`);
        console.log(`    🎯 Target  : "${c.target_answer_concept}"`);
        if (c.keyword_clusters) {
          const clusters = c.keyword_clusters.map(k => `${k.concept_name}: [${k.synonyms.join(', ')}]`).join(' & ');
          console.log(`    🗂️ Clusters: ${clusters}`);
        }
        if (c.acceptable_phrasings) {
          console.log(`    🗣️ Phrasings: "${c.acceptable_phrasings.join('" OR "')}"`);
        }
        if (c.essential_keywords) {
          console.log(`    🔑 Keywords : [${c.essential_keywords.join(', ')}]`);
        }
        if (c.hint_level_1) {
          console.log(`    💡 Hint L1 (Spatial): "${c.hint_level_1}"`);
          console.log(`    💡 Hint L2 (Leading): "${c.hint_level_2}"`);
        } else if (c.scaffold_hint) {
          console.log(`    💡 Scaffold: "${c.scaffold_hint}"`);
        }
      });
      console.log(`    --------------------------------------------------\n`);

      // 4-second breather between variants to stay within 15 RPM
      await new Promise(r => setTimeout(r, 4000));
    } catch (err) {
      console.log(`    ❌ FAILED: ${err.message || err}\n`);
    }
  }
}

runComparativeTrials().catch(console.error);
