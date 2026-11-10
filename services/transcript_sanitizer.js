const SHRUG_RESPONSES = new Set([
  'i dont know',
  'idk',
  'nothing',
  'no idea',
  'pass',
  'what',
  'i forget',
  'dunno',
  'not sure',
]);

const NEGATION_REGEX = /\b(not|no|didnt|did\s+not|never|wasnt|was\s+not|isnt|is\s+not|dont|do\s+not|cant|cannot|wont|wouldnt|aint)\b/i;

export function normalizeTranscript(text = '') {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/^\s*(um+|uh+|well|so|you know)\b\s*/gi, '');
  } while (cleaned !== prev);

  cleaned = cleaned.replace(/\b(um+|uh+)\b/gi, ' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

export function hasNegation(normalizedText = '') {
  if (!normalizedText || typeof normalizedText !== 'string') {
    return false;
  }
  return NEGATION_REGEX.test(normalizedText);
}

export function isShrugOrEmpty(normalizedText = '') {
  if (!normalizedText || typeof normalizedText !== 'string') {
    return true;
  }

  const trimmed = normalizedText.trim();
  if (trimmed.length < 2) {
    return true;
  }

  return SHRUG_RESPONSES.has(trimmed);
}

export default {
  normalizeTranscript,
  hasNegation,
  isShrugOrEmpty,
};
