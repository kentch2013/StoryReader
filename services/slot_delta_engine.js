/**
 * Slot Delta Engine (Frame Semantics & Slot-Filling Verification)
 *
 * Implements universal semantic role verification:
 * - Compares transcript against target semantic slots:
 *   { agent, action, theme, recipient, attribute }
 * - Classifies slots into MATCH, MISSING, or CONFLICT
 * - Calculates degree of correctness
 * - Synthesizes tailored "affirm + isolate + contrast" repair prompts
 */

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a word/phrase exists in text as whole tokens.
 */
function containsToken(text = '', token = '') {
  if (!text || !token) return false;
  const re = new RegExp(`\\b${escapeRegex(token.toLowerCase().trim())}\\b`, 'i');
  return re.test(text);
}

/**
 * Evaluates the slot delta between the child transcript and the rubric's semantic slots.
 *
 * @param {string} transcript - Grounded or normalized child transcript.
 * @param {object} rubric - Evaluation rubric containing semantic_slots or story_context.
 * @returns {object} Slot delta analysis.
 */
export function evaluateSlotDelta(transcript = '', rubric = {}) {
  const text = (transcript || '').toLowerCase().trim();
  const rawSlots = rubric.semantic_slots || {};

  // Normalize slots from rubric or fallback to story_context / entity_graph
  const slots = {
    agent: rawSlots.agent || (rubric.story_context?.actor ? { canonical: rubric.story_context.actor } : null),
    action: rawSlots.action || null,
    theme: rawSlots.theme || (rubric.story_context?.object ? { canonical: rubric.story_context.object } : null),
    location: rawSlots.location || (rubric.story_context?.location ? { canonical: rubric.story_context.location } : null),
    recipient: rawSlots.recipient || (rubric.story_context?.recipient ? { canonical: rubric.story_context.recipient } : null),
    attribute: rawSlots.attribute || rawSlots.trait || null,
  };

  const matches = {};
  const conflicts = {};
  const missing = [];

  // If no semantic slots are configured or inferred, return zero-delta
  const activeSlotKeys = Object.keys(slots).filter((k) => slots[k] && slots[k].canonical);
  if (activeSlotKeys.length === 0) {
    return {
      is_near_miss: false,
      accuracy_degree: 0,
      matched_slots: {},
      conflicted_slots: {},
      missing_slots: [],
      repair_prompt: null,
    };
  }

  // 1. Attribute Slot Check (e.g., color, size, material)
  if (slots.attribute) {
    const canonical = (slots.attribute.canonical || '').toLowerCase().trim();
    const synonyms = (slots.attribute.synonyms || []).map((s) => s.toLowerCase().trim());
    const distractors = (slots.attribute.distractors || [
      'blue', 'red', 'green', 'yellow', 'purple', 'black', 'white', 'orange', 'pink'
    ]).map((d) => d.toLowerCase().trim());

    if (containsToken(text, canonical) || synonyms.some((s) => containsToken(text, s))) {
      matches.attribute = canonical;
    } else {
      // Find conflicting attribute mention
      const matchedDistractor = distractors.find((d) => d !== canonical && containsToken(text, d));
      if (matchedDistractor) {
        conflicts.attribute = { stated: matchedDistractor, canonical };
      } else {
        missing.push('attribute');
      }
    }
  }

  // 2. Agent / Actor Slot Check
  if (slots.agent) {
    const canonical = (slots.agent.canonical || '').toLowerCase().trim();
    const synonyms = (slots.agent.synonyms || []).map((s) => s.toLowerCase().trim());
    
    // Check kinship/aliases from entity_graph if available
    let allValid = [canonical, ...synonyms];
    const char = rubric.entity_graph?.characters?.find(
      (c) => (c.canonical_name || c.canonical_id).toLowerCase() === canonical
    );
    if (char && Array.isArray(char.aliases)) {
      allValid = [...allValid, ...char.aliases.map((a) => a.toLowerCase().trim())];
    }

    // Check if canonical agent is only mentioned as a possessive modifier of another entity (e.g. "Rattles' brother", "Rattles brother", "her brother")
    const possessivePattern = new RegExp(`\\b(?:${allValid.map(escapeRegex).join('|')})('s)?\\s+(brother|sister|mother|father|mom|dad|friend|cousin|uncle|aunt|grandma|grandpa)\\b`, 'i');
    const possessiveMatch = text.match(possessivePattern);

    if (possessiveMatch) {
      conflicts.agent = { stated: possessiveMatch[2].toLowerCase(), canonical };
    } else if (allValid.some((v) => containsToken(text, v))) {
      matches.agent = canonical;
    } else {
      // Check if another known character or person entity was mentioned
      const otherChars = (rubric.entity_graph?.characters || [])
        .map((c) => (c.canonical_name || c.canonical_id).toLowerCase().trim())
        .filter((c) => c !== canonical && c !== (slots.recipient?.canonical || '').toLowerCase().trim());
      
      const commonEntities = ['mom', 'mother', 'dad', 'father', 'grandpa', 'grandfather', 'sister', 'brother', 'friend', 'cat', 'dog', 'teacher'];
      const candidateConfused = [...new Set([...otherChars, ...commonEntities])];

      const statedAgent = candidateConfused.find((cand) => cand !== canonical && containsToken(text, cand));
      if (statedAgent) {
        conflicts.agent = { stated: statedAgent, canonical };
      } else {
        missing.push('agent');
      }
    }
  }

  // 3. Recipient / Beneficiary Slot Check
  if (slots.recipient) {
    const canonical = (slots.recipient.canonical || '').toLowerCase().trim();
    const synonyms = (slots.recipient.synonyms || ['him', 'her', 'the boy', 'the girl']).map((s) => s.toLowerCase().trim());

    if (containsToken(text, canonical) || synonyms.some((s) => containsToken(text, s))) {
      matches.recipient = canonical;
    } else {
      // Check for conflicting beneficiary phrases ("for [X]", "[X]'s hat")
      const beneficiaryConflict = text.match(
        /\b(?:for\s+(?:a\s+|the\s+|his\s+|her\s+|my\s+)?(dog|cat|pet|grampa|grandpa|friend|someone\s+else|sister|brother|dad|father)|(?:a\s+|the\s+|his\s+|her\s+|my\s+)?(dog|cat|pet|grampa|grandpa|friend|someone\s+else|sister|brother|dad|father)'s)\b/i
      );
      if (beneficiaryConflict) {
        const stated = (beneficiaryConflict[1] || beneficiaryConflict[2]).toLowerCase().trim();
        if (stated !== canonical) {
          conflicts.recipient = { stated, canonical };
        }
      } else {
        missing.push('recipient');
      }
    }
  }

  // 4. Action / Verb Slot Check
  if (slots.action) {
    const canonical = (slots.action.canonical || '').toLowerCase().trim();
    const synonyms = (slots.action.synonyms || []).map((s) => s.toLowerCase().trim());

    if (containsToken(text, canonical) || synonyms.some((s) => containsToken(text, s))) {
      matches.action = canonical;
    } else {
      missing.push('action');
    }
  }

  // 5. Theme / Object / Location Slot Check
  const slotKey = slots.location ? 'location' : 'theme';
  const themeSlot = slots.location || slots.theme;
  if (themeSlot) {
    const canonical = (themeSlot.canonical || '').toLowerCase().trim();
    const synonyms = (themeSlot.synonyms || ['it']).map((s) => s.toLowerCase().trim());
    const distractors = (themeSlot.distractors || []).map((d) => d.toLowerCase().trim());

    if (containsToken(text, canonical) || synonyms.some((s) => containsToken(text, s)) || (containsToken(text, 'it') && !distractors.some((d) => containsToken(text, d)))) {
      matches[slotKey] = canonical;
    } else {
      const matchedDistractor = distractors.find((d) => d !== canonical && containsToken(text, d));
      if (matchedDistractor) {
        conflicts[slotKey] = { stated: matchedDistractor, canonical };
      } else {
        missing.push(slotKey);
      }
    }
  }

  const matchCount = Object.keys(matches).length;
  const conflictCount = Object.keys(conflicts).length;
  const totalEvaluated = matchCount + conflictCount;

  const accuracyDegree = totalEvaluated > 0 ? matchCount / totalEvaluated : 0;
  
  // A NEAR_MISS occurs when the child has at least one confirmed correct slot
  // and EXACTLY ONE conflicted slot
  const isNearMiss = matchCount >= 1 && conflictCount === 1;

  let conflictedSlot = null;
  let repairPrompt = null;

  if (isNearMiss) {
    conflictedSlot = Object.keys(conflicts)[0];
    const conflictData = conflicts[conflictedSlot];

    repairPrompt = generateRepairPrompt({
      conflictedSlot,
      conflictData,
      matches,
      rubric,
    });
  }

  return {
    is_near_miss: isNearMiss,
    accuracy_degree: Number(accuracyDegree.toFixed(2)),
    conflicted_slot: conflictedSlot,
    matched_slots: matches,
    conflicted_slots: conflicts,
    missing_slots: missing,
    repair_prompt: repairPrompt,
  };
}

const GENERIC_ROLE_PROMPTS = {
  location: "You're so close! Take another look—where did that happen in the story?",
  theme: "You're so close! Look at the story—what thing was that?",
  agent: "You're so close! Check the picture—who was the one doing that?",
  recipient: "You're so close! Think about who that was for!",
  attribute: "You're so close! Look closely at the picture—what did it look like?",
  action: "You're so close! Think about what they were doing!",
  time: "You're so close! Think about when that happened in the story!",
};

/**
 * Generates an affirmative, strictly generic Wh-role Socratic repair prompt:
 * Never exposes book-specific nouns, adjectives, or candidate answers.
 */
export function generateRepairPrompt({ conflictedSlot }) {
  return GENERIC_ROLE_PROMPTS[conflictedSlot] || "You're so close! Take another look at the story!";
}

export default {
  evaluateSlotDelta,
};
