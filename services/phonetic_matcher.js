/**
 * StoryReader - Child Speech & Phonetic Resilience (Module 7)
 * Double Metaphone phonetic encoder with child phonological rules,
 * Levenshtein string distance, and resilient phonetic keyword matching.
 */

function isVowel(c) {
  return c === 'A' || c === 'E' || c === 'I' || c === 'O' || c === 'U' || c === 'Y';
}

/**
 * Encodes an uppercase string into a single Metaphone phonetic code.
 * @param {string} str
 * @returns {string}
 */
function encodeMetaphoneCode(str) {
  if (!str) return '';

  let code = '';
  const len = str.length;
  let i = 0;

  // Initial silent letters
  if (
    str.startsWith('GN') ||
    str.startsWith('KN') ||
    str.startsWith('PN') ||
    str.startsWith('WR') ||
    str.startsWith('PS')
  ) {
    i = 1;
  }

  // Initial vowel
  if (i === 0 && isVowel(str[0])) {
    code += 'A';
    i++;
  }

  while (i < len && code.length < 5) {
    const ch = str[i];
    const next = i + 1 < len ? str[i + 1] : '';
    const next2 = i + 2 < len ? str[i + 2] : '';

    switch (ch) {
      case 'B':
        code += 'P';
        if (next === 'B') i++;
        break;

      case 'C':
        if (next === 'H') {
          code += 'X';
          i++;
        } else if (next === 'I' && (next2 === 'A' || next2 === 'O')) {
          code += 'X';
          i += 2;
        } else if (next === 'E' || next === 'I' || next === 'Y') {
          code += 'S';
        } else if (next === 'K' || next === 'G') {
          code += 'K';
          i++;
        } else {
          code += 'K';
        }
        if (str[i + 1] === 'C') i++;
        break;

      case 'D':
        if (next === 'G' && (next2 === 'E' || next2 === 'I' || next2 === 'Y')) {
          code += 'J';
          i += 2;
        } else if (next === 'T' || next === 'D') {
          code += 'T';
          i++;
        } else {
          code += 'T';
        }
        break;

      case 'F':
        code += 'F';
        if (next === 'F') i++;
        break;

      case 'G':
        if (next === 'H') {
          if (i > 0 && !isVowel(str[i - 1])) {
            code += 'K';
          }
          i++;
        } else if (next === 'N' && (i + 2 === len || !isVowel(next2))) {
          // silent G in GN at end
        } else if (next === 'E' || next === 'I' || next === 'Y') {
          code += 'J';
        } else {
          code += 'K';
        }
        if (str[i + 1] === 'G') i++;
        break;

      case 'H':
        if (isVowel(next) && (i === 0 || !isVowel(str[i - 1]))) {
          code += 'H';
        }
        break;

      case 'J':
        code += 'J';
        if (next === 'J') i++;
        break;

      case 'K':
        code += 'K';
        if (next === 'K') i++;
        break;

      case 'L':
        code += 'L';
        if (next === 'L') i++;
        break;

      case 'M':
        code += 'M';
        if (next === 'M') i++;
        break;

      case 'N':
        code += 'N';
        if (next === 'N') i++;
        break;

      case 'P':
        if (next === 'H') {
          code += 'F';
          i++;
        } else {
          code += 'P';
        }
        if (str[i + 1] === 'P') i++;
        break;

      case 'Q':
        code += 'K';
        break;

      case 'R':
        code += 'R';
        if (next === 'R') i++;
        break;

      case 'S':
        if (next === 'H') {
          code += 'X';
          i++;
        } else if (next === 'I' && (next2 === 'O' || next2 === 'A')) {
          code += 'X';
          i += 2;
        } else if (next === 'C') {
          if (next2 === 'E' || next2 === 'I' || next2 === 'Y') {
            code += 'S';
          } else {
            code += 'SK';
          }
          i += 2;
        } else {
          code += 'S';
        }
        if (str[i + 1] === 'S') i++;
        break;

      case 'T':
        if (next === 'H') {
          code += '0';
          i++;
        } else if (next === 'C' && next2 === 'H') {
          code += 'X';
          i += 2;
        } else if (next === 'I' && (next2 === 'A' || next2 === 'O')) {
          code += 'X';
          i += 2;
        } else {
          code += 'T';
        }
        if (str[i + 1] === 'T') i++;
        break;

      case 'V':
        code += 'F';
        if (next === 'V') i++;
        break;

      case 'W':
        if (i === 0 && isVowel(next)) {
          code += 'W';
        }
        break;

      case 'X':
        if (i === 0) {
          code += 'S';
        } else {
          code += 'KS';
        }
        break;

      case 'Z':
        code += 'S';
        if (next === 'Z') i++;
        break;

      default:
        // Ignore unmapped punctuation / vowels
        break;
    }
    i++;
  }

  return code;
}

/**
 * Computes Double Metaphone dual phonetic codes [primary, secondary] for a word,
 * incorporating child phonological transformation rules:
 * - terminal IN -> ING (e.g. runnin -> running)
 * - silent D in NDM / NDP (e.g. grandma / grandpa)
 * - terminal consonant stop reduction in ND / NT (e.g. friend -> fren)
 * - child gliding W -> R at start of word before vowel (e.g. wabbit -> rabbit)
 * - handles empty, non-string, lowercase/uppercase
 *
 * @param {string} word
 * @returns {[string, string]} [primaryCode, secondaryCode]
 */
export function doubleMetaphone(word) {
  if (!word || typeof word !== 'string') {
    return ['', ''];
  }

  let clean = word.trim().toUpperCase();
  if (!clean) {
    return ['', ''];
  }

  // Child Rule 1: Terminal IN -> ING (e.g. runnin -> running)
  if (clean.length >= 4 && clean.endsWith('IN')) {
    clean = clean.slice(0, -2) + 'ING';
  }

  // Build Primary Word variant
  // Silent D in NDM / NDP: grandma -> granma, grandpa -> granpa
  let primaryStr = clean.replace(/NDM/g, 'NM').replace(/NDP/g, 'NP');

  // Build Secondary Word variant
  // In child speech:
  // - grandma -> gramma (NDM -> M), grandpa -> grapa (NDP -> P)
  let secondaryStr = clean.replace(/NDM/g, 'M').replace(/NDP/g, 'P');

  // Child Rule 2b: Plural S reduction in child speech (e.g. friends -> friend, wabbits -> rabbit)
  if (secondaryStr.length >= 4 && secondaryStr.endsWith('S') && !secondaryStr.endsWith('SS')) {
    secondaryStr = secondaryStr.slice(0, -1);
  }

  // Child Rule 3: Terminal consonant stop reduction in ND / NT (e.g. friend -> fren)
  if (secondaryStr.length >= 4 && (secondaryStr.endsWith('ND') || secondaryStr.endsWith('NT'))) {
    secondaryStr = secondaryStr.slice(0, -1); // FRIEND -> FRIEN
  }

  // Child Rule 4: Gliding W -> R at start of word before vowel (e.g. wabbit -> rabbit)
  if (/^W[AEIOUY]/.test(secondaryStr)) {
    secondaryStr = 'R' + secondaryStr.slice(1);
  }

  const primaryCode = encodeMetaphoneCode(primaryStr);
  const secondaryCode = encodeMetaphoneCode(secondaryStr);

  return [primaryCode, secondaryCode];
}

/**
 * Calculates the Levenshtein edit distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a || !a.length) return b ? b.length : 0;
  if (!b || !b.length) return a ? a.length : 0;

  const al = a.length;
  const bl = b.length;
  const prevRow = new Array(bl + 1);
  const currRow = new Array(bl + 1);

  for (let j = 0; j <= bl; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= al; i++) {
    currRow[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    for (let j = 0; j <= bl; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[bl];
}

/**
 * Calculates string similarity ratio between 0.0 and 1.0 using Levenshtein distance.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function stringSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}

/**
 * Matches a single transcript token against target keywords with phonetic resilience.
 * - If options.distractors provided, checks distractors first; returns null if matched.
 * - Words <= 3 characters require exact equality (protects cat/hat, dog/fog).
 * - Matches if token and target share at least one non-empty Double Metaphone code
 *   AND stringSimilarity >= 0.65 (or common child substitution pattern).
 *
 * @param {string} transcriptToken
 * @param {string[]} targetKeywords
 * @param {Object} [options={}]
 * @param {string[]} [options.distractors]
 * @returns {string|null} Matched target keyword or null
 */
export function matchPhoneticKeyword(transcriptToken, targetKeywords, options = {}) {
  if (!transcriptToken || typeof transcriptToken !== 'string') return null;
  const token = transcriptToken.trim().toLowerCase();
  if (!token) return null;

  if (!Array.isArray(targetKeywords) || targetKeywords.length === 0) return null;

  // 1. Distractor collision guard: check distractors first
  if (Array.isArray(options.distractors) && options.distractors.length > 0) {
    const distractorMatch = matchPhoneticKeyword(token, options.distractors, {
      ...options,
      distractors: null,
    });
    if (distractorMatch !== null) {
      return null;
    }
  }

  // 2. Short words (<= 3 chars) require exact equality
  if (token.length <= 3) {
    for (const target of targetKeywords) {
      if (typeof target === 'string' && target.trim().toLowerCase() === token) {
        return target;
      }
    }
    return null;
  }

  // 3. Exact match check
  for (const target of targetKeywords) {
    if (typeof target === 'string' && target.trim().toLowerCase() === token) {
      return target;
    }
  }

  // 4. Phonetic + similarity match
  const [tPri, tSec] = doubleMetaphone(token);
  let bestMatch = null;
  let bestSimilarity = -1;

  for (const target of targetKeywords) {
    if (!target || typeof target !== 'string') continue;
    const tgt = target.trim().toLowerCase();
    if (tgt.length <= 3) continue; // Short targets require exact equality

    const [kPri, kSec] = doubleMetaphone(tgt);
    const sharesCode = Boolean(
      (tPri && (tPri === kPri || tPri === kSec)) ||
      (tSec && (tSec === kPri || tSec === kSec))
    );

    if (!sharesCode) continue;

    const sim = Math.max(
      stringSimilarity(token, tgt),
      stringSimilarity(token.replace(/s$/, ''), tgt.replace(/s$/, ''))
    );
    if (sim >= 0.65) {
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = target;
      }
    }
  }

  return bestMatch;
}

/**
 * Normalizes slurred or child-mispronounced utterances against target keyword clusters.
 *
 * @param {string} transcript
 * @param {Array<Object>} [keywordClusters=[]]
 * @param {Object} [options={}]
 * @param {Array<Object>} [options.canonicalPrototypes]
 * @param {string[]} [options.distractors]
 * @returns {string} Normalized transcript
 */
export function normalizeChildPhonetics(transcript, keywordClusters = [], options = {}) {
  if (!transcript || typeof transcript !== 'string') return '';
  const trimmed = transcript.trim();
  if (!trimmed) return '';

  // Collect target words from clusters and canonical prototypes
  const targetWords = [];
  const targetWordSet = new Set();

  if (Array.isArray(keywordClusters)) {
    for (const cluster of keywordClusters) {
      if (Array.isArray(cluster.synonyms)) {
        for (const syn of cluster.synonyms) {
          if (typeof syn === 'string') {
            const clean = syn.trim().toLowerCase();
            if (clean && !targetWordSet.has(clean)) {
              targetWordSet.add(clean);
              targetWords.push(clean);
            }
          }
        }
      }
    }
  }

  const prototypes = options.canonicalPrototypes || options.canonical_prototypes;
  if (Array.isArray(prototypes)) {
    for (const proto of prototypes) {
      if (proto && typeof proto.text === 'string') {
        const words = proto.text.split(/\s+/).map((w) => w.trim().toLowerCase());
        for (const w of words) {
          if (w && !targetWordSet.has(w)) {
            targetWordSet.add(w);
            targetWords.push(w);
          }
        }
      }
    }
  }

  if (targetWords.length === 0) {
    return transcript;
  }

  const tokens = transcript.split(/\s+/);
  const normalizedTokens = [];

  for (const token of tokens) {
    if (!token) continue;
    // Strip leading and trailing punctuation for matching
    const match = token.match(/^([^\w]*)([\w'-]+)([^\w]*)$/);
    if (!match) {
      normalizedTokens.push(token);
      continue;
    }

    const leading = match[1];
    const word = match[2];
    const trailing = match[3];

    const matchedTarget = matchPhoneticKeyword(word, targetWords, {
      distractors: options.distractors,
    });

    if (matchedTarget) {
      normalizedTokens.push(leading + matchedTarget + trailing);
    } else {
      normalizedTokens.push(token);
    }
  }

  return normalizedTokens.join(' ');
}

export default {
  doubleMetaphone,
  levenshteinDistance,
  stringSimilarity,
  matchPhoneticKeyword,
  normalizeChildPhonetics,
};
