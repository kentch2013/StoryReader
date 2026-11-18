import { evaluateChildAnswer } from '../services/answer_evaluator.js';

async function verifyRobertCalibration() {
  const chunk = {
    checkin_question: 'Who attended the birthday party that Robert held?',
    target_answer_concept: 'all his farm friends',
    canonical_prototypes: [
      { type: 'formal_full', text: 'All his farm friends came to the party.' },
      { type: 'colloquial', text: 'His farm friends were there.' },
      { type: 'minimal_core', text: 'his friends' },
      { type: 'common_distractor', text: 'his mother and father' },
    ],
    diagnostic_probes: {
      target_mastery: { hypothesis: 'His farm friends attended.', feedback: 'Spot on!' },
      minimal_core: { hypothesis: 'The reader says friends.', feedback: 'Correct!' },
      distractor_misconception: { hypothesis: 'His mother and father.', scaffold: 'Look at the guests!' },
      superficial_attribute: { hypothesis: 'The cake was red.', scaffold: 'Look closer.' },
    },
    entity_graph: {
      characters: [{ canonical_id: 'robert', canonical_name: 'Robert', gender: 'male' }],
    },
  };

  const t1 = Date.now();
  const res1 = await evaluateChildAnswer({
    ...chunk,
    child_transcript: 'his friends',
    attempt_count: 1,
  });
  const d1 = Date.now() - t1;

  console.log('Result 1 ("his friends"):');
  console.log(`  Status: ${res1.status}`);
  console.log(`  Tier: ${res1.diagnostics.tier_resolved}`);
  console.log(`  Spoken Feedback: "${res1.spoken_feedback}"`);
  console.log(`  Latency: ${d1}ms`);

  const t2 = Date.now();
  const res2 = await evaluateChildAnswer({
    ...chunk,
    child_transcript: 'his mother and father',
    attempt_count: 1,
  });
  const d2 = Date.now() - t2;

  console.log('\nResult 2 ("his mother and father"):');
  console.log(`  Status: ${res2.status}`);
  console.log(`  Tier: ${res2.diagnostics.tier_resolved}`);
  console.log(`  Spoken Feedback: "${res2.spoken_feedback}"`);
  console.log(`  Latency: ${d2}ms`);
}

verifyRobertCalibration().catch(console.error);
