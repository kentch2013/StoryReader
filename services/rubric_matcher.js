export function matchKeywordClusters(normalizedText, clusters = []) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(clusters) || clusters.length === 0) {
    return false;
  }

  const words = new Set(normalizedText.split(' ').filter(Boolean));

  return clusters.every((cluster) => {
    if (!cluster || !Array.isArray(cluster.synonyms) || cluster.synonyms.length === 0) {
      return false;
    }

    return cluster.synonyms.some((synonym) => {
      if (!synonym || typeof synonym !== 'string') {
        return false;
      }

      const normSyn = synonym.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (!normSyn) {
        return false;
      }

      if (normSyn.includes(' ')) {
        return normalizedText.includes(normSyn);
      }

      return words.has(normSyn);
    });
  });
}

export function matchAcceptablePhrasings(normalizedText, phrasings = []) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(phrasings) || phrasings.length === 0) {
    return false;
  }

  const words = new Set(normalizedText.split(' ').filter(Boolean));

  return phrasings.some((phrase) => {
    if (!phrase || typeof phrase !== 'string') {
      return false;
    }

    const normPhrase = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!normPhrase) {
      return false;
    }

    if (normalizedText.includes(normPhrase)) {
      return true;
    }

    const phraseWords = normPhrase.split(' ').filter(Boolean);
    if (phraseWords.length === 0) {
      return false;
    }

    const matches = phraseWords.filter((w) => words.has(w)).length;
    return matches / phraseWords.length >= 0.6;
  });
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'it', 'he', 'she', 'him', 'her', 'his', 'was', 'is']);

export function scoreMultiReference(normalizedText, canonicalPrototypes = [], threshold = 0.6) {
  if (!normalizedText || typeof normalizedText !== 'string' || !Array.isArray(canonicalPrototypes) || canonicalPrototypes.length === 0) {
    return { matched: false, isDistractor: false, prototypeType: null };
  }

  const textWords = new Set(normalizedText.split(' ').filter(Boolean));
  if (textWords.size === 0) {
    return { matched: false, isDistractor: false, prototypeType: null };
  }

  // 1. Check common distractor first to prevent false mastery
  const distractor = canonicalPrototypes.find((p) => p && p.type === 'common_distractor');
  if (distractor && typeof distractor.text === 'string') {
    const normDist = distractor.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (normDist) {
      if (normalizedText.includes(normDist)) {
        return { matched: false, isDistractor: true, prototypeType: 'common_distractor' };
      }
      const distWords = normDist.split(' ').filter(Boolean);
      if (distWords.length > 0) {
        const distMatches = distWords.filter((w) => textWords.has(w)).length;
        if (distMatches / distWords.length >= 0.7) {
          return { matched: false, isDistractor: true, prototypeType: 'common_distractor' };
        }
      }
    }
  }

  // 2. Check positive canonical prototypes in order
  for (const prototype of canonicalPrototypes) {
    if (!prototype || prototype.type === 'common_distractor' || typeof prototype.text !== 'string') {
      continue;
    }

    const normProto = prototype.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!normProto) {
      continue;
    }

    if (normalizedText.includes(normProto)) {
      return { matched: true, isDistractor: false, prototypeType: prototype.type };
    }

    const protoWords = normProto.split(' ').filter(Boolean);
    if (protoWords.length === 0) {
      continue;
    }

    const protoContent = protoWords.filter((w) => !STOP_WORDS.has(w));
    if (protoContent.length > 0) {
      const contentMatches = protoContent.filter((w) => textWords.has(w)).length;
      if (contentMatches / protoContent.length >= threshold) {
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

  const words = new Set(normalizedText.split(' ').filter(Boolean));

  let matchedCount = 0;
  for (const cluster of clusters) {
    if (!cluster || !Array.isArray(cluster.synonyms) || cluster.synonyms.length === 0) {
      continue;
    }

    const hasMatch = cluster.synonyms.some((synonym) => {
      if (!synonym || typeof synonym !== 'string') return false;
      const normSyn = synonym.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (!normSyn) return false;
      if (normSyn.includes(' ')) {
        return normalizedText.includes(normSyn);
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

  const normQuestion = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const questionWords = new Set(normQuestion.split(' ').filter((w) => w.length > 2));
  if (questionWords.size === 0) {
    return false;
  }

  const textWords = normalizedText.split(' ').filter(Boolean);
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
