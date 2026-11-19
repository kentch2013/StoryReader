import { AutoTokenizer, AutoModelForSequenceClassification } from '@xenova/transformers';
import { EVAL_RULES } from '../config/evaluation_rules.js';

let nliPromise = null;

export async function getNLIModel() {
  if (!nliPromise) {
    nliPromise = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained('Xenova/nli-deberta-v3-xsmall');
      const model = await AutoModelForSequenceClassification.from_pretrained('Xenova/nli-deberta-v3-xsmall', {
        quantized: true,
      });
      // Pre-warm ONNX execution provider with a batch to eliminate dynamic buffer allocation and cold-start jitter
      const dummyA = new Array(6).fill('warmup text');
      const dummyB = new Array(6).fill('warmup target reference concept text');
      const dummy = await tokenizer(dummyA, { text_pair: dummyB, padding: true, truncation: true, max_length: EVAL_RULES.TOKENIZER.MAX_LENGTH_PROBE });
      await model(dummy);
      return { tokenizer, model };
    })();
  }
  return nliPromise;
}

export async function getExtractor() {
  const nli = await getNLIModel();
  try {
    const { evaluateChildAnswer } = await import('./answer_evaluator.js');
    await evaluateChildAnswer({
      checkin_question: 'Warmup question?',
      target_answer_concept: 'Warmup concept.',
      child_transcript: 'warmup transcript phrase',
      attempt_count: 1,
    });
  } catch {}
  return nli;
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export async function tokenizeDynamicBatch(tokenizer, pairA, pairB, maxCeiling = 64) {
  const rawEnc = pairA.map((p, i) => tokenizer._encode_plus(p, pairB[i]));
  const naturalMax = Math.max(...rawEnc.map((x) => x.input_ids.length));
  const effectiveMax = Math.min(naturalMax, maxCeiling);
  return tokenizer(pairA, {
    text_pair: pairB,
    padding: true,
    truncation: true,
    max_length: effectiveMax,
  });
}

export function detectInquiryOrStutter(text = '') {
  if (!text || typeof text !== 'string') return { isInquiry: false, isStutter: false };
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { isInquiry: false, isStutter: false };

  const questionStarters = ['who', 'what', 'why', 'where', 'when', 'how', 'is', 'did', 'does', 'can', 'could', 'would'];
  const isInquiry = questionStarters.includes(words[0]) && words.length <= 6;

  const half = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, half).join(' ');
  const secondHalf = words.slice(half).join(' ');
  const isStutter = words.length >= 2 && firstHalf === secondHalf;

  return { isInquiry, isStutter };
}

export async function evaluateSemanticMatch(normalizedTranscript, rubric = {}) {
  if (!normalizedTranscript || typeof normalizedTranscript !== 'string' || !normalizedTranscript.trim()) {
    return {
      isMatch: false,
      isDistractor: false,
      entailment: 0,
      contradiction: 0,
      neutral: 1,
      topReference: null,
      matchedPrototype: null,
      scoreTable: {},
    };
  }

  const { tokenizer, model } = await getNLIModel();
  const transcript = (normalizedTranscript || '').trim();

  // 1. Gather positive mastery reference texts and deduplicate
  const positiveReferences = [];
  const seenTexts = new Set();

  function addPositive(type, text) {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim();
    const key = clean.toLowerCase();
    if (!seenTexts.has(key)) {
      seenTexts.add(key);
      positiveReferences.push({ type, text: clean });
    }
  }

  if (rubric.target_answer_concept) {
    addPositive('target_concept', rubric.target_answer_concept);
  }
  if (Array.isArray(rubric.canonical_prototypes)) {
    for (const p of rubric.canonical_prototypes) {
      // Exclude partial_action and common_distractor from mastery references
      if (p && p.type !== 'common_distractor' && p.type !== 'partial_action' && p.text) {
        addPositive(p.type, p.text);
      }
    }
  }
  if (Array.isArray(rubric.acceptable_phrasings)) {
    for (const phrase of rubric.acceptable_phrasings) {
      addPositive('acceptable_phrasing', phrase);
    }
  }

  // 2. Gather distractor and partial_action reference texts
  let distractorText = null;
  let partialActionText = null;
  if (Array.isArray(rubric.canonical_prototypes)) {
    const dist = rubric.canonical_prototypes.find((p) => p && p.type === 'common_distractor' && p.text);
    if (dist) distractorText = dist.text.trim();
    const part = rubric.canonical_prototypes.find((p) => p && p.type === 'partial_action' && p.text);
    if (part) partialActionText = part.text.trim();
  }

  // 3. Assemble pairs: Child Answer is always PREMISE (pairA), Target is HYPOTHESIS (pairB)
  const pairA = [];
  const pairB = [];
  const meta = [];

  for (const pos of positiveReferences) {
    pairA.push(transcript);
    pairB.push(pos.text);
    meta.push({ type: pos.type, text: pos.text });
  }

  // For short entity answers (<= 3 words, e.g. "his nana", "his grandma"),
  // test against the core entity noun from the primary keyword cluster
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) {
    const coreEntity = rubric.keyword_clusters?.[0]?.synonyms?.[0] || rubric.target_answer_concept || null;
    if (coreEntity) {
      pairA.push(transcript);
      pairB.push(coreEntity);
      meta.push({ type: 'minimal_core', text: coreEntity });
    }
  }

  // Distractor pair
  if (distractorText) {
    pairA.push(transcript);
    pairB.push(distractorText);
    meta.push({ type: 'common_distractor', text: distractorText });
  }

  // Partial action pair for telemetry / diagnostics only
  if (partialActionText) {
    pairA.push(transcript);
    pairB.push(partialActionText);
    meta.push({ type: 'partial_action', text: partialActionText });
  }

  const inputs = await tokenizeDynamicBatch(tokenizer, pairA, pairB, EVAL_RULES.TOKENIZER.MAX_LENGTH_PROBE || 64);
  const output = await model(inputs);
  const logitsData = output.logits.data;

  let maxEntailment = 0;
  let distractorEntailment = 0;
  let topReference = null;
  let topNeutral = 0;
  const scoreTable = {};

  const coreContradictions = [];

  let topContradiction = null;

  for (let i = 0; i < meta.length; i++) {
    const offset = i * 3;
    // Softmax: idx 0 = contradiction, idx 1 = entailment, idx 2 = neutral
    const [c, e, n] = softmax([logitsData[offset], logitsData[offset + 1], logitsData[offset + 2]]);
    const item = meta[i];

    if (item.type === 'common_distractor') {
      distractorEntailment = e;
      scoreTable['common_distractor'] = Number(distractorEntailment.toFixed(3));
    } else if (item.type === 'partial_action') {
      scoreTable['partial_action'] = Number(e.toFixed(3));
    } else {
      coreContradictions.push(c);
      if (e > maxEntailment) {
        maxEntailment = e;
        topReference = item.text;
        topNeutral = n;
        topContradiction = c;
      }
      if (!scoreTable[item.type] || e > scoreTable[item.type]) {
        scoreTable[item.type] = Number(e.toFixed(3));
      }
    }
  }

  const minContradiction = coreContradictions.length > 0 ? Math.min(...coreContradictions) : 0;
  const maxContradiction = coreContradictions.length > 0 ? Math.max(...coreContradictions) : 0;
  const effectiveContradiction = topContradiction !== null ? topContradiction : maxContradiction;

  // Distractor triggers if explicit distractor matches, or if every positive prototype is contradicted,
  // or if the highest-entailing prototype itself is contradicted.
  const isDistractor = distractorEntailment >= 0.60 || minContradiction >= 0.70 || effectiveContradiction >= 0.50;
  const isMatch = !isDistractor && maxEntailment >= 0.50 && effectiveContradiction < 0.35 && distractorEntailment < 0.60;

  return {
    isMatch,
    isDistractor,
    entailment: Number(maxEntailment.toFixed(3)),
    contradiction: Number(effectiveContradiction.toFixed(3)),
    neutral: Number(topNeutral.toFixed(3)),
    topReference,
    matchedPrototype: topReference,
    scoreTable,
  };
}

export function extractHeadNoun(phrase) {
  if (!phrase || typeof phrase !== 'string') return null;
  const cleaned = phrase.replace(/[^\w\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;

  const lastWord = words[words.length - 1];
  const firstWord = words[0].toLowerCase();

  if (['his', 'her', 'their', 'my', 'your', 'our', 'the', 'a', 'an'].includes(firstWord) && words.length >= 3) {
    return `${firstWord} ${lastWord}`;
  }
  return lastWord;
}

export function synthesizeProbesFromRubric(rubric = {}) {
  const targetConcept = rubric.target_answer_concept || 'The target concept.';
  const protos = Array.isArray(rubric.canonical_prototypes) ? rubric.canonical_prototypes : [];
  const formal = protos.find((p) => p.type === 'formal_full')?.text || targetConcept;
  const minimal =
    protos.find((p) => p.type === 'minimal_core')?.text ||
    rubric.keyword_clusters?.[0]?.synonyms?.[0] ||
    'minimal core';
  const distractor =
    protos.find((p) => p.type === 'common_distractor')?.text || 'A common misunderstanding.';
  const question = rubric.checkin_question || 'The premise from the question.';

  return {
    target_mastery: {
      hypothesis: formal,
      feedback: 'Spot on! That is exactly right!',
    },
    minimal_core: {
      hypothesis: minimal,
      feedback: 'Exactly right!',
    },
    superficial_attribute: {
      hypothesis: 'A superficial color, size, yarn, material, or appearance detail.',
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Look closer at the details.',
    },
    premise_echo: {
      hypothesis: question,
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Think about why.',
    },
    character_confusion: {
      hypothesis: 'Someone else or another character did it.',
      scaffold: rubric.hint_level_1 || rubric.scaffold_hint || 'Check who was involved.',
    },
    distractor_misconception: {
      hypothesis: distractor,
      scaffold: rubric.scaffold_hint || rubric.hint_level_1 || 'Not quite! Look again.',
    },
  };
}

export async function evaluateDiagnosticProbes(normalizedTranscript, rubric = {}) {
  if (!normalizedTranscript || typeof normalizedTranscript !== 'string' || !normalizedTranscript.trim()) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'UNGROUNDED_OFF_TRACK',
      spoken_feedback: rubric.hint_level_1 || rubric.scaffold_hint || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  const hasExplicitProbes = Boolean(
    rubric.diagnostic_probes &&
    typeof rubric.diagnostic_probes === 'object' &&
    Object.keys(rubric.diagnostic_probes).length > 0
  );
  const probes = hasExplicitProbes ? rubric.diagnostic_probes : synthesizeProbesFromRubric(rubric);

  // =========================================================================
  // LAYER 1: Grounding & Intelligibility Filter (Inquiry & Stutter Screener)
  // =========================================================================
  const { isInquiry, isStutter } = detectInquiryOrStutter(normalizedTranscript);
  if (isInquiry) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'QUESTION_ECHO',
      spoken_feedback: probes.premise_echo?.scaffold || rubric.scaffold_hint || rubric.hint_level_1 || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  if (isStutter) {
    return {
      isMatch: false,
      cognitive_diagnosis: 'SUPERFICIAL_ATTRIBUTE',
      spoken_feedback: probes.superficial_attribute?.scaffold || rubric.hint_level_1 || '',
      probeScores: {},
      entailment: 0,
      contradiction: 0,
      neutral: 1,
    };
  }

  const { tokenizer, model } = await getNLIModel();
  const transcript = (normalizedTranscript || '').trim();

  // =========================================================================
  // LAYER 2: Semantic Slot & Component Decomposition (Single Parallel Batch)
  // =========================================================================
  const characters = rubric.entity_graph?.characters || [];
  const primaryChar = characters[0]?.canonical_name || characters[0]?.canonical_id || '';
  const secondaryChar = characters.find((c) => c !== characters[0])?.canonical_name || characters.find((c) => c !== characters[0])?.canonical_id || '';

  const actorName = rubric.story_context?.actor || '';
  const recipientName = rubric.story_context?.recipient || '';
  const objectName = rubric.story_context?.object || '';
  const itemNoun = objectName ? objectName.split(/\s+/).pop() : '';

  const beneficiaryHyp = (actorName && recipientName && itemNoun && actorName.toLowerCase() !== recipientName.toLowerCase())
    ? `${actorName} made ${recipientName}'s ${itemNoun}.`
    : null;

  const attributeHyp = (objectName && itemNoun && objectName.toLowerCase() !== itemNoun.toLowerCase())
    ? `The ${itemNoun} was a ${objectName}.`
    : null;

  const wordTokens = transcript.split(/\s+/).filter(Boolean);
  const wordCount = wordTokens.length;
  const minimalCoreText = rubric.canonical_prototypes?.find((p) => p && p.type === 'minimal_core')?.text || null;
  const isAgentQuestion = rubric.question_type === 'agent_identification' || /^(who|whose)\b/i.test(rubric.checkin_question || '');
  const atomicKeyword = (rubric.keyword_clusters?.[0]?.synonyms?.[0] || (isAgentQuestion ? (rubric.entity_graph?.characters?.[0]?.canonical_name || rubric.story_context?.actor) : null)) || null;
  const coreEntity = minimalCoreText || atomicKeyword || null;
  const atomicEntity = (atomicKeyword && atomicKeyword !== coreEntity) ? atomicKeyword : null;
  const rawCandidate = minimalCoreText || rubric.target_answer_concept || atomicKeyword;
  const headNoun = extractHeadNoun(rawCandidate);

  // Find if child matched any approved synonym from keyword clusters
  let matchedClusterSynonym = null;
  if (Array.isArray(rubric.keyword_clusters)) {
    const cleanLower = transcript.toLowerCase();
    for (const cluster of rubric.keyword_clusters) {
      if (!cluster || !Array.isArray(cluster.synonyms)) continue;
      for (const syn of cluster.synonyms) {
        if (syn && typeof syn === 'string' && cleanLower.includes(syn.toLowerCase().trim())) {
          matchedClusterSynonym = syn.trim();
          break;
        }
      }
      if (matchedClusterSynonym) break;
    }
  }

  const circumlocutionText = Array.isArray(rubric.canonical_prototypes)
    ? rubric.canonical_prototypes.find((p) => p && p.type === 'functional_circumlocution')?.text || null
    : null;
  const partialActionText = Array.isArray(rubric.canonical_prototypes)
    ? rubric.canonical_prototypes.find((p) => p && p.type === 'partial_action')?.text || null
    : null;
  const commonDistractorText = Array.isArray(rubric.canonical_prototypes)
    ? rubric.canonical_prototypes.find((p) => p && p.type === 'common_distractor')?.text || null
    : null;

  const positiveProtos = [];
  if (Array.isArray(rubric.canonical_prototypes)) {
    for (let i = 0; i < rubric.canonical_prototypes.length; i++) {
      const p = rubric.canonical_prototypes[i];
      if (p && p.text && p.type !== 'common_distractor' && p.type !== 'partial_action') {
        // minimal_core is evaluated under core_entity / minimal_core with strict terse gating (wordCount <= 6).
        // Exclude it from positiveProtos to prevent long distractor sentences from matching terse fragment prototypes.
        if (p.type === 'minimal_core') continue;
        const key = `proto_${p.type || i}`;
        positiveProtos.push({ key, text: p.text.trim() });
      }
    }
  }

  if (Array.isArray(rubric.acceptable_phrasings)) {
    for (let i = 0; i < rubric.acceptable_phrasings.length; i++) {
      const phrase = rubric.acceptable_phrasings[i];
      if (phrase && typeof phrase === 'string' && phrase.trim()) {
        const key = `phrase_${i}`;
        positiveProtos.push({ key, text: phrase.trim() });
      }
    }
  }

  const stage1Keys = [
    'target_mastery',
    'minimal_core',
    'character_confusion',
    'distractor_misconception',
    'superficial_attribute',
  ];
  for (const pr of positiveProtos) {
    stage1Keys.push(pr.key);
  }
  if (coreEntity) {
    stage1Keys.push('core_entity');
  }
  if (atomicEntity) {
    stage1Keys.push('atomic_entity');
  }
  if (headNoun) {
    stage1Keys.push('head_noun_entity');
  }
  if (matchedClusterSynonym) {
    stage1Keys.push('matched_cluster_synonym');
  }
  if (circumlocutionText) {
    stage1Keys.push('functional_circumlocution');
  }
  if (beneficiaryHyp) {
    stage1Keys.push('beneficiary_consistency');
  }
  if (attributeHyp) {
    stage1Keys.push('attribute_consistency');
  }

  const stage2Keys = [
    'superficial_attribute',
    'premise_echo',
    'character_confusion',
    'distractor_misconception',
  ];
  if (commonDistractorText) {
    stage2Keys.push('common_distractor');
  }
  if (partialActionText) {
    stage2Keys.push('partial_action');
  }

  const fullProbes = {
    ...probes,
    core_entity: { hypothesis: coreEntity || '' },
    atomic_entity: { hypothesis: atomicEntity || '' },
    head_noun_entity: { hypothesis: headNoun ? (headNoun.includes(' ') ? headNoun : `It was ${headNoun}.`) : '' },
    matched_cluster_synonym: { hypothesis: matchedClusterSynonym ? `It was ${matchedClusterSynonym}.` : '' },
    partial_action: { hypothesis: partialActionText || '' },
    functional_circumlocution: { hypothesis: circumlocutionText || '' },
    common_distractor: { hypothesis: commonDistractorText || '' },
    beneficiary_consistency: { hypothesis: beneficiaryHyp || '' },
    attribute_consistency: { hypothesis: attributeHyp || '' },
  };
  for (const pr of positiveProtos) {
    fullProbes[pr.key] = { hypothesis: pr.text };
  }

  // -------------------------------------------------------------------------
  // STAGE 1: Positive Mastery Sweep & Negative Anchors (Batch-Adaptive SIMD)
  // -------------------------------------------------------------------------
  const stage1A = [];
  const stage1B = [];
  for (let idx = 0; idx < stage1Keys.length; idx++) {
    const key = stage1Keys[idx];
    const p = fullProbes[key];
    const hyp = typeof p === 'object' && p !== null ? (p.hypothesis || '') : String(p || '');
    stage1A.push(transcript);
    stage1B.push(hyp);
  }

  const inputs1 = await tokenizeDynamicBatch(tokenizer, stage1A, stage1B, EVAL_RULES.TOKENIZER.MAX_LENGTH_PROBE || 64);
  const output1 = await model(inputs1);
  const logitsData1 = output1.logits.data;

  const probeScores = {};
  for (let idx = 0; idx < stage1Keys.length; idx++) {
    const key = stage1Keys[idx];
    const fwdOffset = idx * 3;
    const [c_fwd, e_fwd, n_fwd] = softmax([
      logitsData1[fwdOffset],
      logitsData1[fwdOffset + 1],
      logitsData1[fwdOffset + 2],
    ]);

    probeScores[key] = {
      entailment: Number(e_fwd.toFixed(3)),
      contradiction: Number(c_fwd.toFixed(3)),
      neutral: Number(n_fwd.toFixed(3)),
      fwd_e: Number(e_fwd.toFixed(3)),
      fwd_c: Number(c_fwd.toFixed(3)),
      valueOf() {
        return this.entailment;
      },
      toString() {
        return String(this.entailment);
      },
    };
  }

  const targetE = probeScores.target_mastery?.fwd_e ?? 0;
  const targetC = probeScores.target_mastery?.fwd_c ?? 1;

  let minimalE = probeScores.minimal_core?.fwd_e ?? 0;
  let minimalC = probeScores.minimal_core?.fwd_c ?? 1;

  for (const entityKey of ['core_entity', 'atomic_entity', 'head_noun_entity']) {
    if (probeScores[entityKey]) {
      const ceE = probeScores[entityKey].entailment ?? 0;
      const ceC = probeScores[entityKey].contradiction ?? 1;
      const isTerseEntity = (entityKey === 'core_entity' || entityKey === 'head_noun_entity') ? (wordCount <= 6) : (wordCount <= 3);
      if (isTerseEntity && ceE >= 0.50 && ceC < 0.35) {
        if (ceE > minimalE) {
          minimalE = ceE;
          minimalC = ceC;
        }
      }
    }
  }

  const clusterMatchE = probeScores.matched_cluster_synonym?.entailment ?? 0;
  const clusterMatchC = probeScores.matched_cluster_synonym?.contradiction ?? 1;
  const isClusterCandidate =
    clusterMatchE >= 0.60 &&
    clusterMatchC < 0.20 &&
    (wordCount <= 3 || (probeScores.beneficiary_consistency?.entailment ?? 0) >= 0.50 || (wordCount <= 8 && targetC < 0.50));
  if (isClusterCandidate && clusterMatchE > minimalE) {
    minimalE = clusterMatchE;
    minimalC = clusterMatchC;
  }

  const circumE = probeScores.functional_circumlocution?.entailment ?? 0;
  const circumC = probeScores.functional_circumlocution?.contradiction ?? 1;

  let protoMaxE = 0;
  let protoMaxC = 1;
  for (const pr of positiveProtos) {
    const pE = probeScores[pr.key]?.entailment ?? 0;
    const pC = probeScores[pr.key]?.contradiction ?? 1;
    if (pE > protoMaxE) {
      protoMaxE = pE;
      protoMaxC = pC;
    }
  }

  const winningE = Math.max(targetE, minimalE, circumE, protoMaxE);
  const winningC =
    winningE === targetE
      ? targetC
      : winningE === minimalE
      ? minimalC
      : winningE === protoMaxE
      ? protoMaxC
      : circumC;
  const masteryScore = winningE;

  const hasVagueObject = /\b(something|anything|stuff|a\s+place|someplace|somewhere)\b/i.test(transcript) || /\b(something|anything|stuff|a\s+place|someplace|somewhere)\b/i.test(normalizedTranscript);
  const hasMannerCueOnly =
    /\b(yarn|color|red\s+yarn|blue\s+yarn|wool|needles?)\b/i.test(transcript) &&
    !/\b(love|loved|special|sad|cried|upset|favorite)\b/i.test(transcript) &&
    targetE < 0.10;

  const isMasteredCandidate =
    (targetE >= 0.50 && targetC < 0.35) ||
    (protoMaxE >= 0.50 && protoMaxC < 0.35) ||
    (minimalE >= 0.50 && minimalC < 0.35 && !hasVagueObject && !hasMannerCueOnly && (wordCount <= 6 || targetE >= 0.05)) ||
    (circumE >= 0.50 && circumC < 0.35);

  const benC = probeScores.beneficiary_consistency?.contradiction ?? 0;
  const attrC = probeScores.attribute_consistency?.contradiction ?? 0;
  const stage1CharConfusionE = probeScores.character_confusion?.entailment ?? 0;
  const stage1DistractorE = probeScores.distractor_misconception?.entailment ?? 0;
  const stage1SuperficialE = probeScores.superficial_attribute?.entailment ?? 0;

  // Speculative Early-Exit Gate:
  // Awards mastery immediately if high-confidence entailment, low contradiction (<0.20),
  // winning candidate is not contradicted (<0.20), no vague objects, and error probes are low (<0.40)
  const canEarlyExit =
    isMasteredCandidate &&
    winningE >= 0.50 &&
    winningC < 0.20 &&
    targetC < 0.35 &&
    !hasVagueObject &&
    !hasMannerCueOnly &&
    benC < 0.50 &&
    attrC < 0.50 &&
    stage1CharConfusionE < 0.40 &&
    stage1DistractorE < 0.40 &&
    stage1SuperficialE < 0.40;

  if (canEarlyExit) {
    return {
      isMatch: true,
      cognitive_diagnosis: 'MASTERED',
      spoken_feedback:
        fullProbes.target_mastery?.feedback ||
        fullProbes.minimal_core?.feedback ||
        'Spot on! That is exactly right!',
      probeScores,
      entailment: masteryScore,
      contradiction: winningC,
      neutral: targetE >= minimalE ? (probeScores.target_mastery?.neutral ?? 0) : (probeScores.minimal_core?.neutral ?? 0),
    };
  }

  // -------------------------------------------------------------------------
  // STAGE 2: Fallback Diagnostic Error Sweep & Collision Arbitration
  // -------------------------------------------------------------------------
  const stage2FwdA = [];
  const stage2FwdB = [];
  const stage2RevA = [];
  const stage2RevB = [];
  const stage2RevKeyIndices = {};

  for (let idx = 0; idx < stage2Keys.length; idx++) {
    const key = stage2Keys[idx];
    const p = fullProbes[key];
    const hyp = typeof p === 'object' && p !== null ? (p.hypothesis || '') : String(p || '');
    stage2FwdA.push(transcript);
    stage2FwdB.push(hyp);
    // Descriptive echoes and character confusion accept bidirectional correlation
    if (key === 'superficial_attribute' || key === 'premise_echo' || key === 'character_confusion') {
      stage2RevKeyIndices[key] = stage2RevA.length;
      stage2RevA.push(hyp);
      stage2RevB.push(transcript);
    }
  }

  const stage2PairA = [...stage2FwdA, ...stage2RevA];
  const stage2PairB = [...stage2FwdB, ...stage2RevB];

  const inputs2 = await tokenizeDynamicBatch(tokenizer, stage2PairA, stage2PairB, EVAL_RULES.TOKENIZER.MAX_LENGTH_PROBE || 64);
  const output2 = await model(inputs2);
  const logitsData2 = output2.logits.data;

  for (let idx = 0; idx < stage2Keys.length; idx++) {
    const key = stage2Keys[idx];
    const fwdOffset = idx * 3;

    const [c_fwd, e_fwd, n_fwd] = softmax([
      logitsData2[fwdOffset],
      logitsData2[fwdOffset + 1],
      logitsData2[fwdOffset + 2],
    ]);

    let c_rev = c_fwd;
    let e_rev = e_fwd;
    let n_rev = n_fwd;

    if (stage2RevKeyIndices[key] !== undefined) {
      const revOffset = (stage2Keys.length + stage2RevKeyIndices[key]) * 3;
      [c_rev, e_rev, n_rev] = softmax([
        logitsData2[revOffset],
        logitsData2[revOffset + 1],
        logitsData2[revOffset + 2],
      ]);
    }

    const isForwardOnly = stage2RevKeyIndices[key] === undefined || hasVagueObject;
    const effectiveE = isForwardOnly ? e_fwd : Math.max(e_fwd, e_rev);
    const effectiveC = isForwardOnly ? c_fwd : (effectiveE === e_rev ? c_rev : c_fwd);
    const bestN = effectiveE === e_fwd ? n_fwd : n_rev;

    probeScores[key] = {
      entailment: Number(effectiveE.toFixed(3)),
      contradiction: Number(effectiveC.toFixed(3)),
      neutral: Number(bestN.toFixed(3)),
      fwd_e: Number(e_fwd.toFixed(3)),
      fwd_c: Number(c_fwd.toFixed(3)),
      valueOf() {
        return this.entailment;
      },
      toString() {
        return String(this.entailment);
      },
    };
  }

  // =========================================================================
  // LAYER 3: Cognitive Resolution & Socratic Scaffolding Gate
  // =========================================================================
  let isMatch = false;
  let cognitive_diagnosis = 'UNGROUNDED_OFF_TRACK';
  let spoken_feedback = rubric.hint_level_1 || rubric.scaffold_hint || '';
  let topEntailment = 0;
  let topContradiction = 0;
  let topNeutral = 1;

  const distractorE = Math.max(
    probeScores.distractor_misconception?.entailment ?? 0,
    probeScores.common_distractor?.entailment ?? 0
  );
  const premiseEchoE = probeScores.premise_echo?.entailment ?? 0;
  const superficialE = probeScores.superficial_attribute?.entailment ?? 0;
  const charConfusionE = probeScores.character_confusion?.entailment ?? 0;

  // Vector of competing error modes for dynamic argmax
  const errorCandidates = [
    {
      type: 'DISTRACTOR_MISCONCEPTION',
      score: distractorE,
      contradiction: probeScores.distractor_misconception?.contradiction ?? 0,
      neutral: probeScores.distractor_misconception?.neutral ?? 0,
      feedback: fullProbes.distractor_misconception?.scaffold || rubric.hint_level_1 || '',
    },
    {
      type: 'PREMISE_ECHO',
      score: premiseEchoE,
      contradiction: probeScores.premise_echo?.contradiction ?? 0,
      neutral: probeScores.premise_echo?.neutral ?? 0,
      feedback: fullProbes.premise_echo?.scaffold || rubric.hint_level_1 || '',
    },
    {
      type: 'SUPERFICIAL_ATTRIBUTE',
      score: superficialE,
      contradiction: probeScores.superficial_attribute?.contradiction ?? 0,
      neutral: probeScores.superficial_attribute?.neutral ?? 0,
      feedback: fullProbes.superficial_attribute?.scaffold || rubric.hint_level_1 || '',
    },
    {
      type: 'CHARACTER_CONFUSION',
      score: charConfusionE,
      contradiction: probeScores.character_confusion?.contradiction ?? 0,
      neutral: probeScores.character_confusion?.neutral ?? 0,
      feedback: fullProbes.character_confusion?.scaffold || rubric.hint_level_1 || '',
    },
    {
      type: 'PARTIAL_ACTION',
      score: probeScores.partial_action?.entailment ?? 0,
      contradiction: probeScores.partial_action?.contradiction ?? 0,
      neutral: probeScores.partial_action?.neutral ?? 0,
      feedback: rubric.scaffold_hint || rubric.hint_level_1 || 'You got part of it! What else happened in the story?',
    },
  ];

  errorCandidates.sort((a, b) => b.score - a.score);
  const topError = errorCandidates[0];
  const margin = masteryScore - topError.score;

  const isMasteredCandidatePostStage2 =
    targetC < 0.35 &&
    ((targetE >= 0.50) ||
      (protoMaxE >= 0.50 && protoMaxC < 0.35) ||
      (minimalE >= 0.50 && minimalC < 0.35 && !hasVagueObject && !hasMannerCueOnly && (wordCount <= 6 || targetE >= 0.05 || margin >= 0.25)) ||
      (circumE >= 0.50 && circumC < 0.35));

  // 1. Dynamic Argmax: highest-confidence explicit error probe wins
  const skipPartialAction = isAgentQuestion && isMasteredCandidatePostStage2 && topError.type === 'PARTIAL_ACTION';
  if (!skipPartialAction && topError.score >= 0.50 && topError.score >= masteryScore) {
    cognitive_diagnosis = topError.type;
    spoken_feedback = topError.feedback;
    topEntailment = topError.score;
    topContradiction = topError.contradiction;
    topNeutral = topError.neutral;
  } else if (beneficiaryHyp && (probeScores.beneficiary_consistency?.contradiction ?? 0) >= 0.70) {
    cognitive_diagnosis = 'CHARACTER_CONFUSION';
    spoken_feedback =
      fullProbes.character_confusion?.scaffold ||
      (recipientName ? `That was for ${recipientName}, not someone else!` : rubric.hint_level_1 || rubric.scaffold_hint || '');
    topContradiction = probeScores.beneficiary_consistency.contradiction;
    topEntailment = 0;
  } else if (attributeHyp && (probeScores.attribute_consistency?.contradiction ?? 0) >= 0.70) {
    cognitive_diagnosis = 'DISTRACTOR_MISCONCEPTION';
    spoken_feedback =
      fullProbes.distractor_misconception?.scaffold ||
      (objectName ? `Look closely at the details in the story!` : rubric.hint_level_1 || rubric.scaffold_hint || '');
    topContradiction = probeScores.attribute_consistency.contradiction;
    topEntailment = 0;
  } else if (
    !isMasteredCandidatePostStage2 &&
    ((probeScores.character_confusion?.fwd_e ?? 0) >= 0.40 ||
      (charConfusionE >= 0.15 && (probeScores.target_mastery?.fwd_c ?? 0) >= 0.70 && (probeScores.minimal_core?.fwd_c ?? 0) >= 0.70) ||
      (/\b(grandpa|grandfather|grandma|grandmother|mom|mother|dad|father|brother|sister|someone|somebody|friend)\b/i.test(transcript) && (probeScores.target_mastery?.fwd_c ?? 0) >= 0.70 && (probeScores.minimal_core?.fwd_c ?? 0) >= 0.70))
  ) {
    cognitive_diagnosis = 'CHARACTER_CONFUSION';
    spoken_feedback = fullProbes.character_confusion?.scaffold || rubric.hint_level_1 || '';
    topEntailment = probeScores.character_confusion?.entailment ?? 0;
    topContradiction = Math.max(
      probeScores.character_confusion?.contradiction ?? 0,
      probeScores.target_mastery?.fwd_c ?? 0
    );
    topNeutral = probeScores.character_confusion?.neutral ?? 0;
  } else if (
    !isMasteredCandidatePostStage2 &&
    (probeScores.target_mastery?.fwd_c ?? 0) >= 0.70 &&
    (distractorE >= 0.30 || (probeScores.common_distractor?.entailment ?? 0) >= 0.30)
  ) {
    cognitive_diagnosis = 'DISTRACTOR_MISCONCEPTION';
    spoken_feedback = fullProbes.distractor_misconception?.scaffold || rubric.hint_level_1 || '';
    topEntailment = 0;
    topContradiction = probeScores.target_mastery.fwd_c;
    topNeutral = 0;
  } else if (!hasVagueObject && !hasMannerCueOnly && targetC < 0.35 && (isMasteredCandidatePostStage2 || (winningE >= 0.45 && margin >= 0.20 && winningC < 0.35))) {
    isMatch = true;
    cognitive_diagnosis = 'MASTERED';
    spoken_feedback =
      fullProbes.target_mastery?.feedback ||
      fullProbes.minimal_core?.feedback ||
      'Spot on! That is exactly right!';
    topEntailment = masteryScore;
    topContradiction = winningC;
    topNeutral = targetE >= minimalE ? probeScores.target_mastery?.neutral : probeScores.minimal_core?.neutral;
  } else if (!hasVagueObject && topError.score >= 0.40) {
    cognitive_diagnosis = topError.type;
    spoken_feedback = topError.feedback;
    topEntailment = topError.score;
    topContradiction = topError.contradiction;
    topNeutral = topError.neutral;
  } else {
    cognitive_diagnosis = 'UNGROUNDED_OFF_TRACK';
    spoken_feedback = rubric.hint_level_1 || rubric.scaffold_hint || '';
    topEntailment = 0;
    topContradiction = 0;
    topNeutral = 1;
  }

  return {
    isMatch,
    cognitive_diagnosis,
    spoken_feedback,
    probeScores,
    entailment: topEntailment,
    contradiction: topContradiction,
    neutral: topNeutral,
  };
}

export default {
  evaluateSemanticMatch,
  evaluateDiagnosticProbes,
  synthesizeProbesFromRubric,
  getNLIModel,
  getExtractor,
};
