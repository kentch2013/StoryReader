import { getNLIModel } from './semantic_evaluator.js';
import { verifyVisualGroundingWithDecision } from './gemini_decision_service.js';
import defaultDecisionBreaker from './connectivity_circuit_breaker.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'what', 'who', 'whom', 'whose', 'which', 'where', 'when', 'why', 'how',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto',
  'out', 'over', 'to', 'up', 'with', 'about', 'against', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'own', 'same', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now',
  'because', 'if', 'as', 'until', 'while', 'let', 'get', 'got', 'give', 'gave', 'given'
]);

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function parsePageSpan(pageRange) {
  if (!pageRange || typeof pageRange !== 'string') return 1;
  const matchRange = pageRange.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (matchRange) {
    const start = parseInt(matchRange[1], 10);
    const end = parseInt(matchRange[2], 10);
    return Math.max(1, end - start + 1);
  }
  const matchSingle = pageRange.match(/(\d+)/);
  if (matchSingle) {
    return 1;
  }
  return 1;
}

function extractKeySubjects(chunk = {}) {
  const subjects = [];

  // Question subject extraction
  if (typeof chunk.checkin_question === 'string') {
    const qMatch = chunk.checkin_question.match(
      /(?:what|who|why|where|when|how)\s+(?:did|will|does|can|could|would|is|was|are|were)\s+(?:the\s+|a\s+|an\s+|his\s+|her\s+|their\s+)?([a-zA-Z0-9\s]+?)\s+(?:do|give|say|feel|see|find|get|go|knitted|knit|made|make|leaves|leave|run|runs|eat|take|have|want|happen|lose|lost)\b/i
    );
    if (qMatch && qMatch[1]) {
      const subj = qMatch[1].trim().toLowerCase();
      if (subj && !STOPWORDS.has(subj)) {
        subjects.push(subj);
      }
    }
  }

  // Target answer subject extraction
  if (typeof chunk.target_answer_concept === 'string') {
    const tMatch = chunk.target_answer_concept.match(
      /^(?:the\s+|a\s+|an\s+|his\s+|her\s+|their\s+)?([a-zA-Z0-9\s]+?)\s+(?:will|did|gave|gives|made|makes|said|says|went|goes|is|was|were|felt|feels|wanted|wants|stayed|stays|stay|runs|ran|run|knitted|knit|lost|loses)\b/i
    );
    if (tMatch && tMatch[1]) {
      const subj = tMatch[1].trim().toLowerCase();
      if (subj && !STOPWORDS.has(subj)) {
        subjects.push(subj);
      }
    }
  }

  return subjects;
}

export function checkLexicalEntityOverlap(chunk = {}) {
  if (!chunk) return false;
  const factsText = Array.isArray(chunk.story_facts) ? chunk.story_facts.join(' ') : '';
  const pageText = [chunk.paraphrased_story_facts, factsText, chunk.verbatim_page_text].filter(Boolean).join(' ').toLowerCase();
  if (!pageText.trim()) return false;

  const graphEntities = [];
  if (chunk.entity_graph?.characters && Array.isArray(chunk.entity_graph.characters)) {
    for (const char of chunk.entity_graph.characters) {
      if (char.canonical_name) graphEntities.push(char.canonical_name.toLowerCase());
      if (Array.isArray(char.aliases)) {
        for (const alias of char.aliases) {
          if (alias) graphEntities.push(alias.toLowerCase());
        }
      }
    }
  }

  const keywordEntities = [];
  if (Array.isArray(chunk.keyword_clusters)) {
    for (const cluster of chunk.keyword_clusters) {
      if (cluster.concept_name) keywordEntities.push(cluster.concept_name.toLowerCase());
      if (Array.isArray(cluster.synonyms)) {
        for (const syn of cluster.synonyms) {
          if (syn) keywordEntities.push(syn.toLowerCase());
        }
      }
    }
  }

  const groundedText = [pageText, ...graphEntities, ...keywordEntities].join(' ');
  const subjects = extractKeySubjects(chunk);

  if (subjects.length === 0) return true;

  for (const subject of subjects) {
    const words = subject.split(/\s+/).filter((w) => !STOPWORDS.has(w) && w.length > 2);
    if (words.length === 0) continue;
    const hasMatch = words.some((w) => groundedText.includes(w));
    if (!hasMatch) {
      return false;
    }
  }

  return true;
}

export async function checkNliEntailment(premise, hypothesis) {
  const { tokenizer, model } = await getNLIModel();
  const inputs = await tokenizer([premise || ''], {
    text_pair: [hypothesis || ''],
    padding: true,
    truncation: true,
    max_length: 256,
  });
  const output = await model(inputs);
  const logitsData = output.logits.data;
  const [c, e, n] = softmax([logitsData[0], logitsData[1], logitsData[2]]);
  return {
    entailment: e,
    contradiction: c,
    neutral: n,
  };
}

export async function verifyGroundingFidelity(chunk = {}, options = {}) {
  // 1. Context Bounding Ceiling
  const span = parsePageSpan(chunk.page_range);
  if (span > 3) {
    return {
      is_grounded: false,
      failure_reason: 'CONTEXT_BOUNDING_EXCEEDED',
      flagged_for_review: true,
    };
  }

  // 2. Lexical Entity Overlap Pass
  const lexicalPass = checkLexicalEntityOverlap(chunk);
  if (!lexicalPass) {
    return {
      is_grounded: false,
      lexical_pass: false,
      failure_reason: 'UNGROUNDED_ENTITY',
      flagged_for_review: true,
    };
  }

  // 3. NLI Entailment Pass
  const factsText = Array.isArray(chunk.story_facts) ? chunk.story_facts.join(' ') : '';
  const premise = [chunk.paraphrased_story_facts, factsText, chunk.verbatim_page_text].filter(Boolean).join(' ');
  const hypothesis = chunk.target_answer_concept || '';
  const nliScore = await checkNliEntailment(premise, hypothesis);
  const { entailment, contradiction, neutral } = nliScore;

  if (contradiction > 0.30 || entailment < 0.40) {
    return {
      is_grounded: false,
      lexical_pass: true,
      nli_score: { entailment, contradiction, neutral },
      failure_reason: 'FACTUAL_CONTRADICTION_OR_UNENTAILED',
      flagged_for_review: true,
    };
  }

  if (entailment >= 0.45 && contradiction < 0.30) {
    // 4. Multimodal Visual Grounding Pass via Gemini Decision 1
    if (options.visualDecisionVerifier || (options.imageBuffer && process.env.DISABLE_DECISION_MODEL !== 'true')) {
      try {
        if (options.visualDecisionVerifier || (process.env.GEMINI_API_KEY && process.env.MOCK_AI !== 'true')) {
          const verifier = options.visualDecisionVerifier || ((args) => {
            return defaultDecisionBreaker.execute(
              (signal) => verifyVisualGroundingWithDecision({ ...args, signal }),
              () => null
            );
          });

          const visualDecision = await verifier({
            imageBuffer: options.imageBuffer,
            mimeType: options.mimeType || chunk.image_mime_type || 'image/png',
            target_answer_concept: hypothesis,
            checkin_question: chunk.checkin_question || '',
          });

          if (visualDecision && visualDecision.grounded === false) {
            return {
              is_grounded: false,
              failure_reason: 'VISUAL_GROUNDING_FAILED',
              flagged_for_review: true,
            };
          }
        }
      } catch (err) {
        console.warn('⚠️ Visual grounding check error, preserving text NLI verdict:', err?.message);
      }
    }

    return {
      is_grounded: true,
      lexical_pass: true,
      nli_score: { entailment, contradiction, neutral },
      flagged_for_review: false,
    };
  }

  return {
    is_grounded: false,
    lexical_pass: true,
    nli_score: { entailment, contradiction, neutral },
    failure_reason: 'FACTUAL_CONTRADICTION_OR_UNENTAILED',
    flagged_for_review: true,
  };
}

export default {
  verifyGroundingFidelity,
  checkLexicalEntityOverlap,
  checkNliEntailment,
  parsePageSpan,
};
