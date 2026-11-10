import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
dotenv.config({ path: path.join(rootDir, '.env') });

import { createServer } from '../server.js';

const rubrics = {
  leos_hat: {
    checkin_question: 'Why did Leo get upset when his hat blew away?',
    target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
    keyword_clusters: [
      { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny', 'nana'] },
      { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved', 'favorite'] },
    ],
    acceptable_phrasings: [
      'His grandma made it for him.',
      'It was special because his grandmother knitted it.',
    ],
    hint_level_1: 'Look at who made the hat for Leo.',
    hint_level_2: 'Who knitted that warm red hat?',
    scaffold_hint: 'Think about who made that warm red hat for Leo!',
  },
  runaway_bunny: {
    checkin_question: 'What does the mother say she will do if the little bunny runs away?',
    target_answer_concept: 'She will run after him because he is her little bunny.',
    keyword_clusters: [
      { concept_name: 'action', synonyms: ['run after', 'chase', 'follow', 'catch'] },
      { concept_name: 'reason', synonyms: ['little bunny', 'her bunny', 'loves him', 'her baby'] },
    ],
    acceptable_phrasings: [
      'She will run after him.',
      'She will chase him because he is her bunny.',
    ],
    hint_level_1: 'Look at what the mother bunny promises on the second page.',
    hint_level_2: 'What will she do with her feet if he runs?',
    scaffold_hint: 'Look at what the mother bunny promises to do!',
  },
};

const trials = [
  {
    id: 1,
    book: 'leos_hat',
    label: 'Standard Answer with Heavy Fillers',
    transcript: 'Um, like, ah, his granny made it and it was super special to him!',
    attempt: 1,
    description: 'Tests filler-stripping and dual-cluster keyword matching.',
  },
  {
    id: 2,
    book: 'leos_hat',
    label: 'Single-Word Answer ("Grandma")',
    transcript: 'Grandma',
    attempt: 1,
    description: 'Tests Grade 2 brevity tolerance when answering a "who" or key concept question.',
  },
  {
    id: 3,
    book: 'leos_hat',
    label: 'Novel Synonyms (Out-of-Vocabulary - Triggers Live Gemini LLM)',
    transcript: "His mother's mother knitted a warm red beanie for him that he really loved.",
    attempt: 1,
    description: 'Tests Gemini semantic classification when keywords (beanie, mother\'s mother) are absent from rubric.',
  },
  {
    id: 4,
    book: 'leos_hat',
    label: 'Wild / Off-Track Imagination',
    transcript: 'A purple flying dragon flew down and took it away!',
    attempt: 1,
    description: 'Tests rejection of imaginative but ungrounded answers without negative words.',
  },
  {
    id: 5,
    book: 'runaway_bunny',
    label: 'First Attempt Shrug ("I don\'t know")',
    transcript: "I don't know",
    attempt: 1,
    description: 'Tests instant 0ms bailout returning spatial hint (hint_level_1).',
  },
  {
    id: 6,
    book: 'runaway_bunny',
    label: 'Second Attempt Failure ("Still no idea")',
    transcript: 'Still no idea',
    attempt: 2,
    description: 'Tests Attempt 2 auto-reveal to prevent infinite Socratic loops.',
  },
  {
    id: 7,
    book: 'runaway_bunny',
    label: 'Partial Answer / Near-Miss (Missing the reason)',
    transcript: 'She will follow him into the garden.',
    attempt: 1,
    description: 'Tests partial concept capture (has action, missing baby/bunny reason).',
  },
  {
    id: 8,
    book: 'leos_hat',
    label: 'Rambling Personal Narrative',
    transcript: 'Well one time my dog took my red hat outside and it was windy and i cried because i lost it.',
    attempt: 1,
    description: 'Tests long off-topic story filtering.',
  },
];

async function main() {
  console.log('================================================================');
  console.log('🚀 Running Live Trials on Module 3 Answer Evaluation Engine');
  console.log('================================================================\n');

  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/evaluate-answer`;

  const results = [];

  try {
    for (const t of trials) {
      const rubric = rubrics[t.book];
      const payload = {
        checkin_question: rubric.checkin_question,
        target_answer_concept: rubric.target_answer_concept,
        keyword_clusters: rubric.keyword_clusters,
        acceptable_phrasings: rubric.acceptable_phrasings,
        hint_level_1: rubric.hint_level_1,
        hint_level_2: rubric.hint_level_2,
        scaffold_hint: rubric.scaffold_hint,
        child_transcript: t.transcript,
        attempt_count: t.attempt,
      };

      const start = performance.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const latencyMs = Math.round(performance.now() - start);
      const json = await res.json();

      results.push({ trial: t, json, latencyMs });

      const wordCount = (json.spoken_feedback || '').trim().split(/\s+/).length;
      console.log(`[Trial ${t.id}] ${t.label}`);
      console.log(`  🗣️  Child: "${t.transcript}" (Attempt ${t.attempt})`);
      console.log(`  ⏱️  Latency: ${latencyMs}ms | Status: ${json.status} | Resolved: ${json.resolved}`);
      console.log(`  🔊 Spoken Feedback (${wordCount} words):`);
      console.log(`     "${json.spoken_feedback}"`);
      console.log('----------------------------------------------------------------\n');
    }
  } finally {
    server.close();
  }
}

main().catch(console.error);
