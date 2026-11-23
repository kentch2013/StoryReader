#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { defaultDecisionBreaker } from '../services/connectivity_circuit_breaker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const isLive = process.argv.includes('--live') && Boolean(process.env.GEMINI_API_KEY);
if (!isLive) {
  process.env.MOCK_AI = 'true';
}

async function runEval() {
  const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'rattles_non_verbatim_eval.json');
  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ Fixture file not found: ${fixturePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(fixturePath, 'utf8');
  const testCases = JSON.parse(rawData);

  console.log('================================================================================');
  console.log('🧪 RATTLES NON-VERBATIM & SPEECH EVALUATION HARNESS');
  console.log(`Mode:    ${isLive ? 'LIVE (Gemini API)' : 'LOCAL / OFFLINE (MOCK_AI=true)'}`);
  console.log(`Cases:   ${testCases.length} total test cases`);
  console.log('================================================================================\n');

  const latencies = [];
  const results = [];
  const bucketStats = {};
  const failures = [];

  let totalMasteredExpected = 0;
  let falseRejects = 0;

  let totalNonMasteredExpected = 0;
  let falseAccepts = 0;

  for (const tc of testCases) {
    const bucket = tc.bucket || 'default';
    if (!bucketStats[bucket]) {
      bucketStats[bucket] = { total: 0, passed: 0 };
    }
    bucketStats[bucket].total += 1;

    const expectsMastered = tc.expected_status === 'mastered';
    if (expectsMastered) {
      totalMasteredExpected += 1;
    } else {
      totalNonMasteredExpected += 1;
    }

    const t0 = performance.now();
    let evalOutput;
    try {
      evalOutput = await evaluateChildAnswer({
        child_transcript: tc.child_transcript,
        transcript_alternatives: tc.transcript_alternatives || [],
        checkin_question: tc.checkin_question,
        target_answer_concept: tc.target_answer_concept,
        canonical_prototypes: tc.canonical_prototypes || [],
        keyword_clusters: tc.keyword_clusters || [],
        acceptable_phrasings: tc.acceptable_phrasings || [],
        semantic_slots: tc.semantic_slots,
        diagnostic_probes: tc.diagnostic_probes,
        story_context: tc.story_context,
        attempt_count: tc.attempt_count || 1,
      });
    } catch (err) {
      evalOutput = {
        status: 'error',
        error: err.message,
        diagnostics: {},
      };
    }
    const elapsed = performance.now() - t0;
    latencies.push(elapsed);

    const actualStatus = evalOutput?.status;
    let passed = false;

    if (expectsMastered) {
      passed = actualStatus === 'mastered';
      if (!passed) {
        falseRejects += 1;
      }
    } else {
      // Must NOT be mastered
      passed = actualStatus !== 'mastered';
      if (!passed) {
        falseAccepts += 1;
      }
    }

    if (passed) {
      bucketStats[bucket].passed += 1;
    } else {
      failures.push({
        id: tc.id,
        bucket,
        transcript: tc.child_transcript,
        expected: tc.expected_status,
        actual: actualStatus,
        tier: evalOutput?.diagnostics?.tier_resolved || 'N/A',
      });
    }

    results.push({
      id: tc.id,
      bucket,
      passed,
      latencyMs: elapsed,
      actualStatus,
    });
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

  const frr = totalMasteredExpected > 0 ? falseRejects / totalMasteredExpected : 0;
  const far = totalNonMasteredExpected > 0 ? falseAccepts / totalNonMasteredExpected : 0;

  console.log('--- PER-BUCKET EVALUATION SUMMARY ---');
  const summaryTable = Object.entries(bucketStats).map(([bucket, stats]) => ({
    Bucket: bucket,
    Total: stats.total,
    Passed: stats.passed,
    'Pass Rate': `${((stats.passed / stats.total) * 100).toFixed(1)}%`,
  }));
  console.table(summaryTable);

  console.log('\n--- OVERALL METRICS ---');
  console.log(`Total Cases:              ${testCases.length}`);
  console.log(`Expected Mastered:        ${totalMasteredExpected}`);
  console.log(`False Rejects (FRR count):${falseRejects}`);
  console.log(`False Reject Rate (FRR):  ${(frr * 100).toFixed(2)}% (Target: <= 15.0%)`);
  console.log(`Expected Non-Mastered:    ${totalNonMasteredExpected}`);
  console.log(`False Accepts (FAR count):${falseAccepts}`);
  console.log(`False Accept Rate (FAR):  ${(far * 100).toFixed(2)}% (Target: <= 5.0%)`);
  console.log(`Latency p50:              ${p50.toFixed(2)} ms`);
  console.log(`Latency p95:              ${p95.toFixed(2)} ms`);

  const breakerStats = defaultDecisionBreaker.getStats();
  console.log('\n--- CIRCUIT BREAKER TELEMETRY ---');
  console.log(`State:                    ${breakerStats.state}`);
  console.log(`Calls:                    ${breakerStats.calls}`);
  console.log(`Successes:                ${breakerStats.successes}`);
  console.log(`Timeouts:                 ${breakerStats.timeouts}`);
  console.log(`Failures:                 ${breakerStats.failures}`);
  console.log(`Circuit Open Skips:       ${breakerStats.circuitOpenSkips}`);

  if (failures.length > 0) {
    console.log(`\n❌ FAILING CASES (${failures.length}):`);
    console.table(failures);
  } else {
    console.log('\n✅ All test cases satisfied their behavioral contracts.');
  }

  const farExceeded = far > 0.05;
  const frrExceeded = frr > 0.15;

  if (farExceeded || frrExceeded) {
    console.error(`\n❌ Gate Check Failed: FAR (${(far * 100).toFixed(1)}% > 5%) or FRR (${(frr * 100).toFixed(1)}% > 15%) exceeded limits.`);
    process.exit(1);
  }

  console.log('\n🎉 Gate Check Passed: FAR <= 0.05 and FRR <= 0.15.');
  process.exit(0);
}

runEval().catch((err) => {
  console.error('Fatal evaluation runner error:', err);
  process.exit(1);
});