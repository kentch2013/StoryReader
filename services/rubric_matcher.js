function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'it',
  'he', 'she', 'him', 'her', 'his', 'was', 'is', 'and'
]);

const VAGUE_WORDS = new Set(['something', 'stuff', 'anything']);

const NEGATION_WORDS = new Set([
  'not', "didn't", 'didnt', 'never', 'no', "don't", 'dont',
  "wasn't", 'wasnt', "isn't", 'isnt', "won't", 'wont',
  "couldn't", 'couldnt', 'cannot', "can't", 'cant'
]);

/**
 * Checks whole-word or token-sequence presence in cleaned text.
 */
function hasExactPhrase(cleanText = '', cleanPhrase = '') {
  if (!cleanText || !cleanPhrase) return false;
  const regex = new RegExp(`(?:^|\\s)${escapeRegex(cleanPhrase)}(?:$|\\s)`, 'i');
  return regex.test(cleanText);
}

function hasNegationContradiction(textWords, protoWordsSet) {
  for (const nw of NEGATION_WORDS) {
    if (textWords.has(nw) && !protoWordsSet.has(nw)) {
      return true;
    }
  }
  return false;
}

export function matchKeywordClusters(normalizedText, clusters = []) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(clusters) || clusters.length === 0) {
    return false;
  }

  const cleanNormText = normalizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = new Set(cleanNormText.split(' ').filter(Boolean));

  return clusters.every((cluster) => {
    if (!cluster || !Array.isArray(cluster.synonyms) || cluster.synonyms.length === 0) {
      return false;
    }

    return cluster.synonyms.some((synonym) => {
      if (!synonym || typeof synonym !== 'string') {
        return false;
      }

      const normSyn = synonym.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!normSyn) {
        return false;
      }

      if (normSyn.includes(' ')) {
        return hasExactPhrase(cleanNormText, normSyn);
      }

      return words.has(normSyn);
    });
  });
}

export function matchAcceptablePhrasings(normalizedText, phrasings = []) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(phrasings) || phrasings.length === 0) {
    return false;
  }

  const cleanNormText = normalizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = new Set(cleanNormText.split(' ').filter(Boolean));

  return phrasings.some((phrase) => {
    if (!phrase || typeof phrase !== 'string') {
      return false;
    }

    const normPhrase = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normPhrase) {
      return false;
    }

    if (hasExactPhrase(cleanNormText, normPhrase)) {
      const phraseWords = normPhrase.split(/\s+/).filter(Boolean);
      if (hasNegationContradiction(words, new Set(phraseWords))) return false;
      return true;
    }

    const phraseWords = normPhrase.split(/\s+/).filter(Boolean);
    if (phraseWords.length === 0) {
      return false;
    }

    if (hasNegationContradiction(words, new Set(phraseWords))) return false;

    const contentWords = phraseWords.filter((w) => !STOP_WORDS.has(w));
    if (contentWords.length > 0) {
      const matches = contentWords.filter((w) => words.has(w)).length;
      return matches / contentWords.length >= 0.6;
    }

    const matches = phraseWords.filter((w) => words.has(w)).length;
    return matches / phraseWords.length >= 0.6;
  });
}

export function scoreMultiReference(normalizedText, canonicalPrototypes = [], threshold = 0.6) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(canonicalPrototypes) || canonicalPrototypes.length === 0) {
    return { matched: false, isDistractor: false, prototypeType: null };
  }

  const cleanNormText = normalizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const textWordsList = cleanNormText.split(/\s+/).filter(Boolean);
  const textWords = new Set(textWordsList);
  if (textWords.size === 0) {
    return { matched: false, isDistractor: false, prototypeType: null };
  }

  // Pre-check for vague tokens in text
  const vagueTokensPresent = Array.from(VAGUE_WORDS).filter((vw) => textWords.has(vw));

  // 1. Check all common distractors first to prevent false mastery
  const distractors = canonicalPrototypes.filter((p) => p && p.type === 'common_distractor');
  for (const distractor of distractors) {
    if (typeof distractor.text !== 'string') continue;
    const normDist = distractor.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normDist) continue;

    if (hasExactPhrase(cleanNormText, normDist)) {
      return { matched: false, isDistractor: true, prototypeType: 'common_distractor' };
    }

    const distWords = normDist.split(/\s+/).filter(Boolean);
    if (distWords.length > 0) {
      const distMatches = distWords.filter((w) => textWords.has(w)).length;
      if (distMatches / distWords.length >= 0.7) {
        return { matched: false, isDistractor: true, prototypeType: 'common_distractor' };
      }
      const distContent = distWords.filter((w) => !STOP_WORDS.has(w));
      if (distContent.length > 0) {
        const contentMatches = distContent.filter((w) => textWords.has(w)).length;
        if (contentMatches / distContent.length >= 0.75) {
          return { matched: false, isDistractor: true, prototypeType: 'common_distractor' };
        }
      }
    }
  }

  // 2. Check positive canonical prototypes in order (excluding distractor and partial_action)
  for (const prototype of canonicalPrototypes) {
    if (!prototype || prototype.type === 'common_distractor' || prototype.type === 'partial_action' || typeof prototype.text !== 'string') {
      continue;
    }

    const normProto = prototype.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normProto) {
      continue;
    }

    const protoWords = normProto.split(/\s+/).filter(Boolean);
    if (protoWords.length === 0) {
      continue;
    }
    const protoWordsSet = new Set(protoWords);

    // Negation contradiction guard: cannot match an affirmative prototype if utterance contains negation
    if (hasNegationContradiction(textWords, protoWordsSet)) {
      continue;
    }

    if (hasExactPhrase(cleanNormText, normProto)) {
      return { matched: true, isDistractor: false, prototypeType: prototype.type };
    }

    // Fix hasVagueToken to use Set membership against prototype tokens
    const hasVagueToken = vagueTokensPresent.some((vw) => !protoWordsSet.has(vw));

    const protoContent = protoWords.filter((w) => !STOP_WORDS.has(w));
    if (protoContent.length > 0) {
      const contentMatches = protoContent.filter((w) => textWords.has(w)).length;
      const ratio = contentMatches / protoContent.length;

      // If vague token is present, only match if the content is complete without substitution
      if (hasVagueToken && ratio < 1.0) {
        continue;
      }

      if (ratio >= threshold) {
        return { matched: true, isDistractor: false, prototypeType: prototype.type };
      }
    } else {
      const matches = protoWords.filter((w) => textWords.has(w)).length;
      if (matches / protoWords.length >= threshold) {
        return { matched: true, isDistractor: false, prototypeType: prototype.type };
      }
    }
  }

  return { matched: false, isDistractor: false, prototypeType: null };
}

export function countMatchedClusters(normalizedText, clusters = []) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(clusters) || clusters.length === 0) {
    return { matchedCount: 0, totalCount: 0 };
  }

  const cleanNormText = normalizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = new Set(cleanNormText.split(' ').filter(Boolean));

  let matchedCount = 0;
  for (const cluster of clusters) {
    if (!cluster || !Array.isArray(cluster.synonyms) || cluster.synonyms.length === 0) {
      continue;
    }

    const hasMatch = cluster.synonyms.some((synonym) => {
      if (!synonym || typeof synonym !== 'string') return false;
      const normSyn = synonym.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!normSyn) return false;
      if (normSyn.includes(' ')) {
        return hasExactPhrase(cleanNormText, normSyn);
      }
      return words.has(normSyn);
    });

    if (hasMatch) {
      matchedCount++;
    }
  }

  return { matchedCount, totalCount: clusters.length };
}

export function isQuestionEcho(normalizedText, question = '') {
  if (!normalizedText || typeof normalizedText !== 'string' || !question || typeof question !== 'string') {
    return false;
  }

  const normQuestion = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const questionWords = new Set(normQuestion.split(' ').filter((w) => w.length > 2));
  if (questionWords.size === 0) {
    return false;
  }

  const textWords = normalizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (textWords.length === 0) {
    return false;
  }

  const matches = textWords.filter((w) => questionWords.has(w)).length;
  return matches / textWords.length >= 0.6;
}

export default {
  matchKeywordClusters,
  matchAcceptablePhrasings,
  scoreMultiReference,
  countMatchedClusters,
  isQuestionEcho,
};
