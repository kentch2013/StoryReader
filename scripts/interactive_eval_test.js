import readline from 'node:readline';
import { createServer } from '../server.js';
import { getNLIModel, getExtractor } from '../services/semantic_evaluator.js';

const sampleDiagnosticProbes = {
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
};

const sampleRubric = {
  checkin_question: 'Why did Leo get upset when his hat blew away?',
  question_type: 'cause_and_effect',
  target_answer_concept: 'He was upset because his grandma made it for him and it was special.',
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
  diagnostic_probes: sampleDiagnosticProbes,
  hint_level_1: 'Look at who made the hat for Leo.',
  hint_level_2: 'Who knitted that warm red hat?',
  scaffold_hint: 'Think about who made that warm red hat for Leo!',
};

async function startRepl() {
  const app = createServer();
  const server = app.listen(0);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/evaluate-answer`;

  console.log('⏳ Pre-warming Tier 2 System 1 Cross-Encoder NLI Evaluator in RAM...');
  await getNLIModel();
  console.log('✅ Tier 2 Ready (System 1 Active).\n');

  console.log('================================================================');
  console.log('🎙️  StoryScout Module 3: Zero-Lag Answer Evaluator (Interactive REPL)');
  console.log('================================================================');
  console.log(`Question: "${sampleRubric.checkin_question}"`);
  console.log(`Target:   "${sampleRubric.target_answer_concept}"`);
  console.log('Prototypes:');
  sampleRubric.canonical_prototypes.forEach((p) => {
    console.log(`  - [${p.type}]: "${p.text}"`);
  });
  console.log('----------------------------------------------------------------');
  console.log('Type child transcript and press Enter. (Type "exit" to quit)');
  console.log('Prefix with "2:" for Attempt 2 (e.g. "2: idk"). Type "verbose" to toggle raw metrics.\n');

  let verboseMode = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Child Answer > ',
  });

  const DIAGNOSIS_EXPLANATIONS = {
    MASTERED: 'Understood target concept (who made the hat / why it was special).',
    SUPERFICIAL_ATTRIBUTE: 'Child focused on visible details (color/warmth) instead of who made it.',
    PREMISE_ECHO: 'Child repeated the question setup (hat blew away) without answering why.',
    CHARACTER_CONFUSION: 'Child named the wrong person/relative (e.g. grandpa instead of grandma).',
    DISTRACTOR_MISCONCEPTION: 'Child cited a known distractor misconception (e.g. bought at store).',
    UNGROUNDED_OFF_TRACK: 'Answer is incomplete or unrelated to the target concept.',
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const raw = line.trim();
    if (raw.toLowerCase() === 'exit') {
      rl.close();
      server.close();
      process.exit(0);
    }

    if (raw.toLowerCase() === 'verbose') {
      verboseMode = !verboseMode;
      console.log(`\n  🔍 Detailed metrics view: ${verboseMode ? 'ENABLED' : 'DISABLED'}\n`);
      rl.prompt();
      return;
    }

    let attempt = 1;
    let transcript = raw;
    if (raw.startsWith('2:')) {
      attempt = 2;
      transcript = raw.slice(2).trim();
    } else if (raw.startsWith('1:')) {
      attempt = 1;
      transcript = raw.slice(2).trim();
    }

    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sampleRubric,
          child_transcript: transcript,
          attempt_count: attempt,
        }),
      });

      const latencyMs = Math.round(performance.now() - start);
      const data = await res.json();

      console.log(`\n  ⏱️  Latency: ${latencyMs}ms | Attempt: ${attempt}`);
      console.log(`  📊 Status: ${data.status.toUpperCase()} | Resolved: ${data.resolved}`);
      if (data.diagnostics?.cognitive_diagnosis) {
        const diagCode = data.diagnostics.cognitive_diagnosis;
        const expl = DIAGNOSIS_EXPLANATIONS[diagCode] || diagCode;
        console.log(`  🧠 Diagnosis: ${diagCode}`);
        console.log(`     ↳ ${expl}`);
      }
      console.log(`  🔊 Spoken Feedback: "${data.spoken_feedback}"`);
      console.log(`  🏷️  Pipeline Tier: ${data.diagnostics?.tier_resolved || 'UNKNOWN'}`);

      if (verboseMode && data.diagnostics) {
        const diag = data.diagnostics;
        console.log('\n  ┌────────────────────────────────────────────────────────────');
        console.log(`  │ 🔍 RAW SAUSAGE FACTORY METRICS (${diag.tier_resolved})`);
        console.log('  ├────────────────────────────────────────────────────────────');
        console.log(`  │ 🧹 Sanitized: "${diag.normalized_transcript}"`);

        if (diag.probe_scores) {
          console.log('  │');
          console.log('  │ [PARALLEL DIAGNOSTIC PROBES BREAKDOWN]');
          console.log('  │   ┌───────────────────────────┬────────────┬──────────────┬─────────┐');
          console.log('  │   │ Probe                     │ Entailment │ Contradict.  │ Neutral │');
          console.log('  │   ├───────────────────────────┼────────────┼──────────────┼─────────┤');
          for (const [key, val] of Object.entries(diag.probe_scores)) {
            if (typeof val === 'object' && val !== null) {
              const e = String(val.entailment ?? val.e ?? 0).padEnd(10);
              const c = String(val.contradiction ?? val.c ?? 0).padEnd(12);
              const n = String(val.neutral ?? val.n ?? 0).padEnd(7);
              console.log(`  │   │ ${key.padEnd(25)} │ ${e} │ ${c} │ ${n} │`);
            } else {
              console.log(`  │   │ ${key.padEnd(25)} │ ${String(val).padEnd(10)} │ -            │ -       │`);
            }
          }
          console.log('  │   └───────────────────────────┴────────────┴──────────────┴─────────┘');
        }

        console.log('  │');
        console.log('  │ [TIER 1: Deterministic Screeners & Fast-Paths]');
        console.log(`  │   - Shrug/Silence:        ${diag.tier1?.is_shrug ? 'YES (Bailout)' : 'NO'}`);
        console.log(`  │   - Question Echo:        ${diag.tier1?.question_echo ? 'YES (Scaffold)' : 'NO'}`);
        console.log(`  │   - Keyword Clusters:     ${diag.tier1?.matched_clusters}/${diag.tier1?.total_clusters} matched`);
        console.log(`  │   - Phrasing Match:       ${diag.tier1?.phrasing_match ? 'YES' : 'NO'}`);

        console.log('  │');
        console.log('  │ [TIER 2: System 1 Local Cross-Encoder NLI]');
        if (diag.tier2_semantic) {
          const sem = diag.tier2_semantic;
          console.log(`  │   - Is Match:             ${sem.isMatch ? 'YES (MASTERED)' : 'NO'}`);
          console.log(`  │   - Is Distractor:        ${sem.isDistractor ? 'YES (REJECTED)' : 'NO'}`);
          console.log(`  │   - Entailment:           ${sem.entailment ?? 0}`);
          console.log(`  │   - Contradiction:        ${sem.contradiction ?? 0}`);
        } else {
          console.log('  │   - Status: BYPASSED (Resolved early in Tier 1)');
        }

        console.log('  │');
        console.log('  │ [TIER 3: Cloud Gemini LLM]');
        console.log(`  │   - Invoked:              ${diag.tier3_gemini?.invoked ? 'YES' : 'NO'}`);
        console.log(`  │   - Status:               ${diag.tier3_gemini?.reason}`);
        console.log('  └────────────────────────────────────────────────────────────\n');
      } else {
        console.log('');
      }
    } catch (err) {
      console.error('Error during evaluation:', err);
    }

    rl.prompt();
  });
}

startRepl().catch(console.error);
