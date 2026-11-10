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

export default {
  matchKeywordClusters,
  matchAcceptablePhrasings,
};
