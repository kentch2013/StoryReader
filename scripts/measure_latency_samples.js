import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { getExtractor } from '../services/semantic_evaluator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const rawData = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'test_output', 'bunny_10_pages_analysis.json'), 'utf8')
);

const fishChunk = rawData.chunks.find((c) => /fish/i.test(c.checkin_question));
const gardenChunk = rawData.chunks.find((c) => /flower|garden|crocus/i.test(c.checkin_question));

const leoChunk = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  question_type: 'cause_and_effect',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
  keyword_clusters: [
    { concept_name: 'maker', synonyms: ['grandma', 'grandmother', 'granny'] },
    { concept_name: 'feeling', synonyms: ['special', 'upset', 'loved'] },
  ],
  acceptable_phrasings: ['His grandma made it for him.', 'It was special because his grandmother knitted it.'],
  canonical_prototypes: [
    { type: 'formal_full', text: 'He was upset because his grandma made it for him and it was special.' },
    { type: 'colloquial', text: 'His granny knitted it so he really loved it.' },
    { type: 'minimal_core', text: 'Grandma made it.' },
    { type: 'functional_circumlocution', text: 'His nana knitted the warm red hat with love.' },
    { type: 'partial_action', text: 'His grandma knitted the warm red hat.' },
    { type: 'common_distractor', text: 'He bought it at the store.' },
  ],
  diagnostic_probes: {
    target_mastery: { hypothesis: 'Grandma made the hat and it was special.', feedback: 'Spot on!' },
    minimal_core: { hypothesis: 'Grandma made it.', feedback: 'Exactly right!' },
    superficial_attribute: { hypothesis: 'The hat is red and warm.', scaffold: 'Look at who made it.' },
    premise_echo: { hypothesis: 'The hat blew away and got lost in the wind.', scaffold: 'Think about why.' },
    character_confusion: { hypothesis: 'His grandpa or mother made the hat.', scaffold: 'Check who made it.' },
    distractor_misconception: { hypothesis: 'He bought it at a store or shop.', scaffold: 'Look at who knitted it.' },
  },
  story_context: { actor: 'grandma', recipient: 'Leo', object: 'warm red hat' },
  hint_level_1: 'Look at who made the hat for Leo.',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

const SAMPLES = [
  {
    name: '1. Exact / Minimal Prototype',
    chunk: leoChunk,
    text: 'Grandma made it.',
    expected: 'mastered',
  },
  {
    name: '2. Short Direct Keyword',
    chunk: fishChunk,
    text: 'she will be a fisherman',
    expected: 'mastered',
  },
  {
    name: '3. Circumlocution',
    chunk: gardenChunk,
    text: 'the lady who puts water on the flowers so they grow',
    expected: 'mastered',
  },
  {
    name: '4. Long Compound Utterance (38 tokens combined)',
    chunk: leoChunk,
    text: 'he was really upset because his grandmother made the warm red hat for him and he loved it so much',
    expected: 'mastered',
  },
  {
    name: '5. Distractor Collision',
    chunk: gardenChunk,
    text: 'she will become a flower',
    expected: 'needs_scaffold',
  },
  {
    name: '6. Superficial Visual Detail',
    chunk: leoChunk,
    text: 'his hat was red',
    expected: 'needs_scaffold',
  },
];

async function measure() {
  // Prewarm
  await getExtractor();

  console.log('--- WARM LATENCY PROFILE ---');
  const results = [];
  for (const sample of SAMPLES) {
    // Run 3 warmup iterations for the specific sample to stabilize V8 JIT / memory
    for (let i = 0; i < 2; i++) {
      await evaluateChildAnswer({ ...sample.chunk, child_transcript: sample.text, attempt_count: 1 });
    }

    const runs = [];
    let lastRes = null;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      lastRes = await evaluateChildAnswer({ ...sample.chunk, child_transcript: sample.text, attempt_count: 1 });
      const duration = performance.now() - start;
      runs.push(duration);
    }
    const median = runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];
    results.push({
      sample: sample.name,
      text: sample.text,
      status: lastRes.status,
      diagnosis: lastRes.diagnostics?.cognitive_diagnosis || 'NONE',
      tier: lastRes.diagnostics?.tier_resolved,
      medianMs: Number(median.toFixed(1)),
      runs: runs.map((r) => Number(r.toFixed(1))),
    });
  }

  console.table(
    results.map((r) => ({
      Sample: r.sample,
      Result: `${r.status} (${r.diagnosis})`,
      Tier: r.tier,
      'Median Latency (ms)': r.medianMs,
    }))
  );
  return results;
}

measure();
