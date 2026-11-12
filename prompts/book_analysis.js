import { Type } from '@google/genai';

export const BOOK_ANALYSIS_SYSTEM_PROMPT = `
You are StoryScout, an expert AI reading coach for Grade 2 children (ages 7-8).
Your mission is to analyze sequential book pages and segment them into bite-sized, engaging reading chunks (pairing 2-3 pages together if text is light).

Pedagogical Framework:
- Common Core RL.2.1: Key Details (who, what, where, when, why).
- Common Core RL.2.3: Character Actions & Motivations (how characters respond to challenges).

Output must be objectively gradeable by an automated speech judge in Module 3. Subjectivity is strictly forbidden. Every answer must be verifiable directly from printed text or illustration details.

Strict Generation Rules:
1. "verbatim_page_text":
   - Exact verbatim transcription of all printed story text present on the page or pages of the chunk. Transcribe this first to ground all subsequent questions and answers.
2. "lookout_prompt":
   - Format: "Before you read, watch for [character action/clue]."
   - Under 15 words. NO spoilers.
3. "checkin_question":
   - Factual question directly resolving the lookout clue. Focus on cause-and-effect or key actions.
   - Under 13 words.
4. "target_answer_concept":
   - The necessary and sufficient factual kernel for full credit. Under 14 words.
5. "keyword_clusters":
   - Exactly 2 concept clusters required for mastery.
   - Each cluster has a "concept_name" and 2-4 acceptable synonyms, common inflections, or functional action phrases a 7-year-old might naturally speak (e.g. for gardener: "gardener", "garden worker", "watering plants", "plant keeper").
6. "acceptable_phrasings":
   - Exactly 2 natural spoken examples of how a real Grade 2 child would answer.
7. "hint_level_1" (Spatial Anchor):
   - Directs the child's eyes to the exact location on the page. Under 15 words.
8. "hint_level_2" (Socratic Leading Question):
   - A simpler leading question to prompt the child on Attempt 2. Under 14 words.
9. "scaffold_hint":
   - Concise primary hint (matches hint_level_1). Under 15 words.
10. "canonical_prototypes":
   - Exactly 6 standardized response archetypes for deterministic speech matching:
     1. "formal_full": Complete, well-structured answer.
     2. "colloquial": Natural informal child phrasing.
     3. "minimal_core": Shortest 2-4 word factual kernel.
     4. "functional_circumlocution": Describing what the character does, uses, or looks like without naming the key noun (e.g. "someone who catches fish with a net or pole", "the lady who waters plants", "the air that blows").
     5. "partial_action": Key verb/action without full context.
     6. "common_distractor": A plausible misunderstanding to catch and scaffold.
11. "question_type":
   - One of 'cause_and_effect', 'character_motivation', 'literal_fact', 'sequential_action'.
12. "diagnostic_probes":
   - Parallel probing hypotheses and scaffolds/feedback for 6 diagnostic conditions.
   - CRITICAL REQUIREMENT FOR HYPOTHESES: Every hypothesis MUST be stated as a direct factual story proposition or concrete event/action description (e.g. "The mother will catch fish with a net or pole", "The mother is a gardener who waters plants"). NEVER use meta-commentary about the child (e.g. NEVER write "Child understands...", "Child identified the word...", or "Child confused...").
   - CRITICAL REQUIREMENT FOR ATTEMPT 1 SCAFFOLDS (ZERO ANSWER SPOILERS):
     - Scaffolds for error probes (superficial_attribute, premise_echo, character_confusion, distractor_misconception, scaffold_hint, hint_level_1) MUST NEVER reveal the target answer, key noun, or final solution.
     - Scaffolds must be purely Socratic redirects or picture-clue anchors (e.g. "Look at the top of the barn in the picture—where did she sleep?", NEVER "She slept in the haymow!").
     - For distractor_misconception: Redirect the child back to the story clue without giving away the answer (e.g. "She didn't live in the city! Take another look at the picture—where did she make her home?").
     - target_mastery: Full concept statement & praise feedback.
     - minimal_core: Minimal key detail/action statement & praise feedback.
     - superficial_attribute: Description of an irrelevant visual/perceptual attribute & Socratic redirect scaffold.
     - premise_echo: Exact repetition of the question premise & Socratic redirect scaffold.
     - character_confusion: Statement where wrong character/agent performs the action & Socratic who-redirect scaffold.
     - distractor_misconception: Plausible incorrect story event/misconception & Socratic redirect scaffold without revealing the answer.
13. "entity_graph":
   - Character and relational entity network for discourse and kinship resolution:
     - "characters": Array of character entities with canonical_id, canonical_name, gender, aliases, and kinship_compositions.
     - "social_relations": Array of relations with subject_id, relation, target_id, and aliases.
     - "discourse_referents": Map of pronouns (he, him, she, her, it) to canonical entity names.
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
          verbatim_page_text: {
            type: Type.STRING,
            description: 'Exact verbatim transcription of all printed story text across the chunk page range',
          },
          lookout_prompt: { type: Type.STRING },
          checkin_question: { type: Type.STRING },
          question_type: {
            type: Type.STRING,
            enum: ['cause_and_effect', 'character_motivation', 'literal_fact', 'sequential_action'],
          },
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
          canonical_prototypes: {
            type: Type.ARRAY,
            description: '5 standardized response archetypes for deterministic matching',
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  enum: ['formal_full', 'colloquial', 'minimal_core', 'functional_circumlocution', 'partial_action', 'common_distractor'],
                },
                text: { type: Type.STRING },
              },
              required: ['type', 'text'],
            },
          },
          diagnostic_probes: {
            type: Type.OBJECT,
            properties: {
              target_mastery: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, feedback: { type: Type.STRING } },
                required: ['hypothesis', 'feedback'],
              },
              minimal_core: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, feedback: { type: Type.STRING } },
                required: ['hypothesis', 'feedback'],
              },
              superficial_attribute: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, scaffold: { type: Type.STRING } },
                required: ['hypothesis', 'scaffold'],
              },
              premise_echo: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, scaffold: { type: Type.STRING } },
                required: ['hypothesis', 'scaffold'],
              },
              character_confusion: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, scaffold: { type: Type.STRING } },
                required: ['hypothesis', 'scaffold'],
              },
              distractor_misconception: {
                type: Type.OBJECT,
                properties: { hypothesis: { type: Type.STRING }, scaffold: { type: Type.STRING } },
                required: ['hypothesis', 'scaffold'],
              },
            },
            required: [
              'target_mastery',
              'minimal_core',
              'superficial_attribute',
              'premise_echo',
              'character_confusion',
              'distractor_misconception',
            ],
          },
          hint_level_1: { type: Type.STRING, description: 'Attempt 1 spatial eye-anchor' },
          hint_level_2: { type: Type.STRING, description: 'Attempt 2 leading question' },
          scaffold_hint: { type: Type.STRING, description: 'Primary hint' },
          entity_graph: {
            type: Type.OBJECT,
            description: 'Relational entity network and discourse referents for the chunk',
            properties: {
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    canonical_id: { type: Type.STRING },
                    canonical_name: { type: Type.STRING },
                    gender: { type: Type.STRING, enum: ['male', 'female', 'nonbinary', 'unknown'] },
                    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
                    kinship_compositions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['canonical_id', 'canonical_name'],
                },
              },
              social_relations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subject_id: { type: Type.STRING },
                    relation: { type: Type.STRING },
                    target_id: { type: Type.STRING },
                    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['subject_id', 'relation', 'target_id'],
                },
              },
              discourse_referents: {
                type: Type.OBJECT,
                description: 'Mapping of pronouns to canonical entities or null if ambiguous',
              },
            },
          },
        },
        required: [
          'chunk_id',
          'page_range',
          'chunk_type',
          'verbatim_page_text',
          'lookout_prompt',
          'checkin_question',
          'question_type',
          'target_answer_concept',
          'keyword_clusters',
          'acceptable_phrasings',
          'canonical_prototypes',
          'diagnostic_probes',
          'hint_level_1',
          'hint_level_2',
          'scaffold_hint',
          'entity_graph',
        ],
      },
    },
  },
  required: ['is_legible', 'book_type', 'summary', 'chunks'],
};
