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

export function normalizeTranscript(text = '') {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(um|uh|like|well|wait|so|you\s+know)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  isShrugOrEmpty,
};
