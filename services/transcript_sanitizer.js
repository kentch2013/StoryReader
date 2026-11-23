const SHRUG_RESPONSES = new Set([
  'i dont know',
  'i do not know',
  'idk',
  'nothing',
  'no idea',
  'pass',
  'what',
  'i forget',
  'i forgot',
  'dunno',
  'not sure',
  'im not sure',
  'i am not sure',
]);

const NEGATION_REGEX = /\b(not|no|none|nothing|nobody|nowhere|neither|nor|didnt|did\s+not|never|wasnt|was\s+not|isnt|is\s+not|dont|do\s+not|cant|cannot|wont|wouldnt|aint|couldnt|shouldnt|havent|hasnt|hadnt|arent|werent)\b/i;

export function normalizeTranscript(text = '') {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

  // Single anchored regex replacing do/while loop: strips leading filler sequences (um, uh, well, so, you know)
  cleaned = cleaned.replace(/^(?:\s*(?:um+|uh+|you\s+know|ah+|well|so)\b\s*)+/gi, '');

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
  // Allow valid 1-character alphanumeric answers (e.g., "5", "a")
  if (trimmed.length === 0) {
    return true;
  }

  return SHRUG_RESPONSES.has(trimmed);
}

export default {
  normalizeTranscript,
  hasNegation,
  isShrugOrEmpty,
};
