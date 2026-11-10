import { AutoTokenizer, AutoModelForSequenceClassification } from '@xenova/transformers';

let nliPromise = null;

export async function getNLIModel() {
  if (!nliPromise) {
    nliPromise = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained('Xenova/nli-deberta-v3-xsmall');
      const model = await AutoModelForSequenceClassification.from_pretrained('Xenova/nli-deberta-v3-xsmall', {
        quantized: true,
      });
      // Pre-warm ONNX execution provider with a batch to eliminate dynamic buffer allocation and cold-start jitter
      const dummyA = new Array(5).fill('warmup text');
      const dummyB = new Array(5).fill('warmup target reference concept text');
      const dummy = await tokenizer(dummyA, { text_pair: dummyB, padding: true, truncation: true, max_length: 32 });
      await model(dummy);
      return { tokenizer, model };
    })();
  }
  return nliPromise;
}

export async function getExtractor() {
  const nli = await getNLIModel();
  try {
    const { createServer } = await import('../server.js');
    const app = createServer();
    const srv = app.listen(0);
    const p = srv.address().port;
    await fetch(`http://127.0.0.1:${p}/api/evaluate-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkin_question: 'Warmup question?',
        target_answer_concept: 'Warmup concept.',
        child_transcript: 'warmup transcript phrase',
        attempt_count: 1,
      }),
    }).catch(() => {});
    srv.close();
  } catch {}
  return nli;
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function normalizeKinship(text = '') {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/['’]/g, '')
    .trim()
    .replace(/\b(mothers?|fathers?|moms?|dads?)\s+(nana|grandma|grandmother|granny)\b/gi, 'great-relative')
    .replace(/\b(mothers?|fathers?|moms?|dads?)\s+(grandpa|grandfather|gramps)\b/gi, 'great-relative')
    .replace(/\b(mothers?\s+mother|fathers?\s+mother|grand\s+mother)\b/gi, 'grandmother')
    .replace(/\b(mothers?\s+father|fathers?\s+father|grand\s+father)\b/gi, 'grandfather')
    .replace(/\bgrampa\b/gi, 'grandpa');
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
    const coreEntity = rubric.keyword_clusters?.[0]?.synonyms?.[0] || 'grandma';
    pairA.push(transcript);
    pairB.push(coreEntity);
    meta.push({ type: 'minimal_core', text: coreEntity });
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

  const inputs = await tokenizer(pairA, { text_pair: pairB, padding: true, truncation: true, max_length: 32 });
  const output = await model(inputs);
  const logitsData = output.logits.data;

  let maxEntailment = 0;
  let distractorEntailment = 0;
  let topReference = null;
  let topNeutral = 0;
  const scoreTable = {};

  const coreContradictions = [];

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
      }
      if (!scoreTable[item.type] || e > scoreTable[item.type]) {
        scoreTable[item.type] = Number(e.toFixed(3));
      }
    }
  }

  const minContradiction = coreContradictions.length > 0 ? Math.min(...coreContradictions) : 0;
  const maxContradiction = coreContradictions.length > 0 ? Math.max(...coreContradictions) : 0;

  const isDistractor = distractorEntailment >= 0.60 || maxContradiction >= 0.70;
  const isMatch = !isDistractor && maxEntailment >= 0.50 && maxContradiction < 0.35 && distractorEntailment < 0.60;

  return {
    isMatch,
    isDistractor,
    entailment: Number(maxEntailment.toFixed(3)),
    contradiction: Number(maxContradiction.toFixed(3)),
    neutral: Number(topNeutral.toFixed(3)),
    topReference,
    matchedPrototype: topReference,
    scoreTable,
  };
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

  const probes = rubric.diagnostic_probes || synthesizeProbesFromRubric(rubric);

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
  const actorName = rubric.story_context?.actor || rubric.entity_graph?.characters?.[0]?.canonical_name || 'grandma';
  const recipientName = rubric.story_context?.recipient || rubric.entity_graph?.characters?.find((c) => c.gender === 'male')?.canonical_name || 'Leo';
  const objectName = rubric.story_context?.object || 'warm red hat';

  const beneficiaryHyp = rubric.story_context?.recipient
    ? `${actorName} made ${rubric.story_context.recipient}'s hat.`
    : null;

  const attributeHyp = rubric.story_context?.object
    ? `The hat was a ${rubric.story_context.object}.`
    : null;

  const wordTokens = transcript.split(/\s+/).filter(Boolean);
  const wordCount = wordTokens.length;
  const coreEntity = wordCount <= 3 ? (rubric.keyword_clusters?.[0]?.synonyms?.[0] || rubric.entity_graph?.characters?.[0]?.canonical_name) : null;

  const probeKeys = [
    'target_mastery',
    'minimal_core',
    'superficial_attribute',
    'premise_echo',
    'character_confusion',
    'distractor_misconception',
  ];

  if (coreEntity) {
    probeKeys.push('core_entity');
  }
  if (beneficiaryHyp) {
    probeKeys.push('beneficiary_consistency');
  }
  if (attributeHyp) {
    probeKeys.push('attribute_consistency');
  }

  const fullProbes = {
    ...probes,
    core_entity: { hypothesis: coreEntity || '' },
    beneficiary_consistency: { hypothesis: beneficiaryHyp || '' },
    attribute_consistency: { hypothesis: attributeHyp || '' },
  };

  const fwdA = [];
  const fwdB = [];
  const revA = [];
  const revB = [];

  for (const key of probeKeys) {
    const p = fullProbes[key];
    const hyp = typeof p === 'object' && p !== null ? (p.hypothesis || '') : String(p || '');
    fwdA.push(transcript);
    fwdB.push(hyp);
    revA.push(hyp);
    revB.push(transcript);
  }

  const pairA = [...fwdA, ...revA];
  const pairB = [...fwdB, ...revB];

  const inputs = await tokenizer(pairA, {
    text_pair: pairB,
    padding: true,
    truncation: true,
    max_length: 64,
  });
  const output = await model(inputs);
  const logitsData = output.logits.data;

  const probeScores = {};
  for (let idx = 0; idx < probeKeys.length; idx++) {
    const key = probeKeys[idx];
    const fwdOffset = idx * 3;
    const revOffset = (idx + probeKeys.length) * 3;

    const [c_fwd, e_fwd, n_fwd] = softmax([
      logitsData[fwdOffset],
      logitsData[fwdOffset + 1],
      logitsData[fwdOffset + 2],
    ]);
    const [c_rev, e_rev, n_rev] = softmax([
      logitsData[revOffset],
      logitsData[revOffset + 1],
      logitsData[revOffset + 2],
    ]);

    // Forward entailment strictly required for mastery targets, character confusion, and distractors.
    // Only descriptive echoes (superficial, premise_echo) may accept bidirectional correlation.
    const isForwardOnly = key === 'target_mastery' || key === 'minimal_core' || key === 'character_confusion' || key === 'distractor_misconception';
    const effectiveE = isForwardOnly ? e_fwd : Math.max(e_fwd, e_rev);
    const maxC = Math.max(c_fwd, c_rev);
    const bestN = effectiveE === e_fwd ? n_fwd : n_rev;

    probeScores[key] = {
      entailment: Number(effectiveE.toFixed(3)),
      contradiction: Number(maxC.toFixed(3)),
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

  const targetE = probeScores.target_mastery?.fwd_e ?? 0;
  const targetC = probeScores.target_mastery?.fwd_c ?? 1;

  let minimalE = probeScores.minimal_core?.fwd_e ?? 0;
  let minimalC = probeScores.minimal_core?.fwd_c ?? 1;

  if (coreEntity && probeScores.core_entity) {
    const ceE = probeScores.core_entity.fwd_e ?? 0;
    const ceC = probeScores.core_entity.fwd_c ?? 1;
    if (ceE >= 0.50 && ceC < 0.35) {
      if (ceE > minimalE) {
        minimalE = ceE;
        minimalC = ceC;
      }
    }
  }

  const hasVagueObject = /\b(something|anything|stuff)\b/i.test(transcript);
  const isMasteredCandidate =
    (targetE >= 0.50 && targetC < 0.35) ||
    (minimalE >= 0.50 && minimalC < 0.35 && !hasVagueObject && (wordCount <= 6 || targetE >= 0.05));

  // 1. Direct Specific Error Modes
  if ((probeScores.distractor_misconception?.entailment ?? 0) >= 0.50) {
    cognitive_diagnosis = 'DISTRACTOR_MISCONCEPTION';
    spoken_feedback = fullProbes.distractor_misconception?.scaffold || rubric.hint_level_1 || '';
    topEntailment = probeScores.distractor_misconception.entailment;
    topContradiction = probeScores.distractor_misconception.contradiction;
    topNeutral = probeScores.distractor_misconception.neutral;
  } else if ((probeScores.premise_echo?.entailment ?? 0) >= 0.50) {
    cognitive_diagnosis = 'PREMISE_ECHO';
    spoken_feedback = fullProbes.premise_echo?.scaffold || rubric.hint_level_1 || '';
    topEntailment = probeScores.premise_echo.entailment;
    topContradiction = probeScores.premise_echo.contradiction;
    topNeutral = probeScores.premise_echo.neutral;
  } else if ((probeScores.superficial_attribute?.entailment ?? 0) >= 0.50) {
    cognitive_diagnosis = 'SUPERFICIAL_ATTRIBUTE';
    spoken_feedback = fullProbes.superficial_attribute?.scaffold || rubric.hint_level_1 || '';
    topEntailment = probeScores.superficial_attribute.entailment;
    topContradiction = probeScores.superficial_attribute.contradiction;
    topNeutral = probeScores.superficial_attribute.neutral;
  } else if (
    (probeScores.character_confusion?.entailment ?? 0) >= 0.50 ||
    (probeScores.target_mastery?.fwd_c ?? 0) >= 0.70 ||
    (probeScores.minimal_core?.fwd_c ?? 0) >= 0.70
  ) {
    cognitive_diagnosis = 'CHARACTER_CONFUSION';
    spoken_feedback = fullProbes.character_confusion?.scaffold || rubric.hint_level_1 || '';
    topEntailment = probeScores.character_confusion?.entailment ?? 0;
    topContradiction = Math.max(
      probeScores.character_confusion?.contradiction ?? 0,
      probeScores.target_mastery?.fwd_c ?? 0
    );
    topNeutral = probeScores.character_confusion?.neutral ?? 0;
  } else if (beneficiaryHyp && (probeScores.beneficiary_consistency?.contradiction ?? 0) >= 0.70) {
    cognitive_diagnosis = 'CHARACTER_CONFUSION';
    spoken_feedback = 'That hat was for Leo, not someone else! Think about who made it for Leo.';
    topContradiction = probeScores.beneficiary_consistency.contradiction;
    topEntailment = 0;
  } else if (attributeHyp && (probeScores.attribute_consistency?.contradiction ?? 0) >= 0.70) {
    cognitive_diagnosis = 'DISTRACTOR_MISCONCEPTION';
    spoken_feedback = fullProbes.distractor_misconception?.scaffold || 'Look at the picture! Was the hat blue, or was it a warm red hat?';
    topContradiction = probeScores.attribute_consistency.contradiction;
    topEntailment = 0;
  } else if (isMasteredCandidate) {
    isMatch = true;
    cognitive_diagnosis = 'MASTERED';
    spoken_feedback =
      fullProbes.target_mastery?.feedback ||
      fullProbes.minimal_core?.feedback ||
      'Spot on! That is exactly right!';
    topEntailment = Math.max(targetE, minimalE);
    topContradiction = targetE >= minimalE ? targetC : minimalC;
    topNeutral = targetE >= minimalE ? probeScores.target_mastery?.neutral : probeScores.minimal_core?.neutral;
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
