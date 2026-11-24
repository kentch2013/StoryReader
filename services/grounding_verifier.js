import { callGeminiDecision, verifyVisualGroundingWithDecision } from './gemini_decision_service.js';
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
  'each', 'few', 'more', 'most', 'other', 'some', 'such',
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

  // Ground strictly on verbatim_page_text when present to eliminate circular grounding
  const hasVerbatim = typeof chunk.verbatim_page_text === 'string' && chunk.verbatim_page_text.trim().length > 0;
  const factsText = Array.isArray(chunk.story_facts) ? chunk.story_facts.join(' ') : '';
  const fallbackText = [chunk.paraphrased_story_facts, factsText].filter(Boolean).join(' ');
  const rawTextToGround = (hasVerbatim ? chunk.verbatim_page_text : fallbackText).toLowerCase().trim();

  if (!rawTextToGround) return false;

  const subjects = extractKeySubjects(chunk);
  if (subjects.length === 0) {
    return hasVerbatim;
  }

  // Tokenize grounded text once into a Set
  const groundedTokens = new Set(rawTextToGround.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || []);

  for (const subject of subjects) {
    const words = subject.split(/\s+/).filter((w) => !STOPWORDS.has(w) && w.length > 2);
    if (words.length === 0) continue;
    const hasMatch = words.some((w) => groundedTokens.has(w));
    if (!hasMatch) {
      return false;
    }
  }

  return true;
}

export async function checkNliEntailment(premise, hypothesis) {
  const isMock = process.env.MOCK_AI === 'true' || !process.env.GEMINI_API_KEY;
  if (isMock) {
    const normP = (premise || '').toLowerCase();
    const normH = (hypothesis || '').toLowerCase();
    const wordsH = normH.split(/\s+/).filter((w) => !STOPWORDS.has(w) && w.length > 2);
    const matches = wordsH.filter((w) => normP.includes(w)).length;
    const isEntailed = wordsH.length === 0 || (matches / wordsH.length >= 0.4);
    return {
      entailment: isEntailed ? 0.95 : 0.10,
      contradiction: isEntailed ? 0.05 : 0.85,
      neutral: 0,
    };
  }

  try {
    const result = await defaultDecisionBreaker.execute(async (signal) => {
      return await callGeminiDecision({
        input: `Premise: ${premise}\nHypothesis: ${hypothesis}`,
        questions: {
          entailment: {
            type: 'choice',
            instructions: 'Does the premise factually support or entail the hypothesis?',
            criteria: {
              ENTAILED: 'The hypothesis is factually supported or implied by the premise.',
              NOT_ENTAILED: 'The hypothesis contradicts or is not supported by the premise.',
            },
          },
        },
        signal,
      });
    });

    const ans = result?.answers?.entailment;
    const isEntailed = ans?.choice === 'ENTAILED';
    const entailment = Number((ans?.probabilities?.ENTAILED ?? (isEntailed ? (ans?.confidence ?? 0.95) : 0)).toFixed(3));
    const contradiction = Number((ans?.probabilities?.NOT_ENTAILED ?? (!isEntailed ? (ans?.confidence ?? 0.95) : 0)).toFixed(3));
    return {
      entailment,
      contradiction,
      neutral: 0,
    };
  } catch (err) {
    console.warn('⚠️ checkNliEntailment Decision 1 call failed:', err?.message);
    // Fail closed on NLI API failure
    return { entailment: 0, contradiction: 0, neutral: 1, error: true };
  }
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
  // Premise strictly grounded against verbatim_page_text when available
  const hasVerbatim = typeof chunk.verbatim_page_text === 'string' && chunk.verbatim_page_text.trim().length > 0;
  const factsText = Array.isArray(chunk.story_facts) ? chunk.story_facts.join(' ') : '';
  const fallbackPremise = [chunk.paraphrased_story_facts, factsText].filter(Boolean).join(' ');
  const premise = hasVerbatim ? chunk.verbatim_page_text.trim() : fallbackPremise;
  const hypothesis = chunk.target_answer_concept || '';
  const nliScore = await checkNliEntailment(premise, hypothesis);
  const { entailment, contradiction, neutral, error } = nliScore;

  if (error) {
    return {
      is_grounded: false,
      verification_status: 'unverified',
      lexical_pass: true,
      nli_score: { entailment, contradiction, neutral, error: true },
      failure_reason: 'NLI_VERIFICATION_FAILED',
      flagged_for_review: true,
    };
  }

  // Zero dead zone: fail closed below 0.40 or on contradiction >= 0.30
  if (contradiction >= 0.30 || entailment < 0.40) {
    return {
      is_grounded: false,
      lexical_pass: true,
      nli_score: { entailment, contradiction, neutral },
      failure_reason: 'FACTUAL_CONTRADICTION_OR_UNENTAILED',
      flagged_for_review: true,
    };
  }

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

export default {
  verifyGroundingFidelity,
  checkLexicalEntityOverlap,
  checkNliEntailment,
  parsePageSpan,
};
