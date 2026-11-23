/**
 * Slot Delta Engine (Frame Semantics & Slot-Filling Verification)
 *
 * Implements universal semantic role verification:
 * - Compares transcript against target semantic slots:
 *   { agent, action, theme, recipient, attribute, location }
 * - Classifies slots into MATCH, MISSING, or CONFLICT
 * - Calculates degree of correctness
 * - Synthesizes tailored "affirm + isolate + contrast" repair prompts
 */

const VERB_STEM_MAP = {
  sit: ['sat', 'sitting', 'sits', 'sit'],
  sat: ['sit', 'sitting', 'sits', 'sat'],
  sitting: ['sit', 'sat', 'sits', 'sitting'],
  jump: ['jumped', 'jumping', 'jumps', 'jump'],
  jumped: ['jump', 'jumping', 'jumps', 'jumped'],
  jumping: ['jump', 'jumped', 'jumps', 'jumping'],
  hop: ['hopped', 'hopping', 'hops', 'hop'],
  hopped: ['hop', 'hopping', 'hops', 'hopped'],
  climb: ['climbed', 'climbing', 'climbs', 'climb'],
  climbed: ['climb', 'climbing', 'climbs', 'climbed'],
  purr: ['purred', 'purring', 'purrs', 'purr'],
  purred: ['purr', 'purring', 'purrs', 'purred'],
  purring: ['purr', 'purred', 'purrs', 'purring'],
  sound: ['sounded', 'sounding', 'sounds', 'sound'],
  sounded: ['sound', 'sounding', 'sounds', 'sounded'],
  shake: ['shook', 'shaking', 'shakes', 'shake'],
  shook: ['shake', 'shaking', 'shakes', 'shook'],
  make: ['made', 'making', 'makes', 'make'],
  made: ['make', 'making', 'makes', 'made'],
  making: ['make', 'made', 'makes', 'making'],
  knit: ['knitted', 'knitting', 'knits', 'knit'],
  knitted: ['knit', 'knitting', 'knits', 'knitted'],
  knitting: ['knit', 'knitted', 'knits', 'knitting'],
  sew: ['sewed', 'sewing', 'sews', 'sewn', 'sew'],
  sewed: ['sew', 'sewing', 'sews', 'sewn', 'sewed'],
  wear: ['wore', 'wearing', 'wears', 'worn', 'wear'],
  wore: ['wear', 'wearing', 'wears', 'worn', 'wore'],
  run: ['ran', 'running', 'runs', 'run'],
  ran: ['run', 'running', 'runs', 'ran'],
  fly: ['flew', 'flying', 'flies', 'flown', 'fly'],
  flew: ['fly', 'flying', 'flies', 'flown', 'flew'],
  blow: ['blew', 'blowing', 'blows', 'blown', 'blow'],
  blew: ['blow', 'blowing', 'blows', 'blown', 'blew'],
  give: ['gave', 'giving', 'gives', 'given', 'give'],
  gave: ['give', 'giving', 'gives', 'given', 'gave'],
  drop: ['dropped', 'dropping', 'drops', 'drop'],
  dropped: ['drop', 'dropping', 'drops', 'dropped'],
  play: ['played', 'playing', 'plays', 'play'],
  played: ['play', 'playing', 'plays', 'played'],
  bark: ['barked', 'barking', 'barks', 'bark'],
  barked: ['bark', 'barking', 'barks', 'barked'],
  meow: ['meowed', 'meowing', 'meows', 'meow'],
  meowed: ['meow', 'meowing', 'meows', 'meowed'],
};

const NEGATION_CUES = new Set([
  'not',
  "didn't",
  'didnt',
  'never',
  'no',
  "don't",
  'dont',
  "wasn't",
  'wasnt',
  "isn't",
  'isnt',
  "won't",
  'wont',
  "couldn't",
  'couldnt',
  'cannot',
  "can't",
  'cant',
]);

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLemmaVariants(word = '') {
  const w = word.toLowerCase().trim();
  const set = new Set([w]);
  if (VERB_STEM_MAP[w]) {
    for (const v of VERB_STEM_MAP[w]) set.add(v);
  }
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    set.add(base);
    set.add(base + 'e');
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      set.add(base.slice(0, -1));
    }
  } else if (w.endsWith('ed') && w.length > 4) {
    const base = w.slice(0, -2);
    set.add(base);
    set.add(base + 'e');
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
      set.add(base.slice(0, -1));
    }
  } else if (w.endsWith('es') && w.length > 4) {
    set.add(w.slice(0, -2));
    set.add(w.slice(0, -1));
  } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    set.add(w.slice(0, -1));
  }
  return set;
}

function matchPhraseInTokens(textTokens, phrase = '', checkNegation = true) {
  if (!textTokens || textTokens.length === 0 || !phrase) return { matched: false, isNegated: false };
  const pTokens = phrase.toLowerCase().trim().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
  if (pTokens.length === 0) return { matched: false, isNegated: false };

  let foundMatch = false;
  let nonNegatedMatch = false;

  for (let i = 0; i <= textTokens.length - pTokens.length; i++) {
    let matchesAll = true;
    for (let j = 0; j < pTokens.length; j++) {
      const t = textTokens[i + j];
      const p = pTokens[j];
      if (t === p || t === p + "'s" || p === t + "'s") {
        continue;
      }
      if (pTokens.length === 1 && getLemmaVariants(p).has(t)) {
        continue;
      }
      matchesAll = false;
      break;
    }

    if (matchesAll) {
      foundMatch = true;
      let isNegated = false;
      if (checkNegation) {
        if (i > 0 && NEGATION_CUES.has(textTokens[i - 1])) {
          isNegated = true;
        } else if (
          i > 1 &&
          NEGATION_CUES.has(textTokens[i - 2]) &&
          ['a', 'the', 'his', 'her', 'their', 'an', 'really', 'did'].includes(textTokens[i - 1])
        ) {
          isNegated = true;
        }
      }
      if (!isNegated) {
        nonNegatedMatch = true;
        break;
      }
    }
  }

  if (nonNegatedMatch) {
    return { matched: true, isNegated: false };
  }
  if (foundMatch) {
    return { matched: true, isNegated: true };
  }
  return { matched: false, isNegated: false };
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
  const textTokens = text.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
  const rawSlots = rubric.semantic_slots || {};

  // Normalize slots from rubric or fallback to story_context / entity_graph
  const slots = {
    agent: rawSlots.agent || (rubric.story_context?.actor ? { canonical: rubric.story_context.actor } : null),
    action: rawSlots.action || null,
    theme: rawSlots.theme || rawSlots.sound || rawSlots.cause || (rubric.story_context?.object ? { canonical: rubric.story_context.object } : null),
    location: rawSlots.location || (rubric.story_context?.location ? { canonical: rubric.story_context.location } : null),
    recipient: rawSlots.recipient || rawSlots.target_person || (rubric.story_context?.recipient ? { canonical: rubric.story_context.recipient } : null),
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

  const checkMatch = (phrase, checkNegation = true) => {
    const res = matchPhraseInTokens(textTokens, phrase, checkNegation);
    return res.matched && (!checkNegation || !res.isNegated);
  };

  // 1. Attribute Slot Check (e.g., color, size, material)
  if (slots.attribute) {
    const canonical = (slots.attribute.canonical || '').toLowerCase().trim();
    const synonyms = (slots.attribute.synonyms || []).map((s) => s.toLowerCase().trim());
    const distractors = (slots.attribute.distractors || []).map((d) => d.toLowerCase().trim());

    if ((canonical && checkMatch(canonical)) || synonyms.some((s) => checkMatch(s))) {
      matches.attribute = canonical;
    } else {
      const matchedDistractor = distractors.find((d) => d !== canonical && checkMatch(d, false));
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
      (c) => (c.canonical_name || c.canonical_id || '').toLowerCase() === canonical
    );
    if (char && Array.isArray(char.aliases)) {
      allValid = [...allValid, ...char.aliases.map((a) => a.toLowerCase().trim())];
    }

    const validTokens = allValid
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.toLowerCase().trim());

    let possessiveMatch = null;
    if (validTokens.length > 0) {
      const possessivePattern = new RegExp(
        `\\b(?:${validTokens.map(escapeRegex).join('|')})('s)?\\s+(brother|sister|mother|father|mom|dad|friend|cousin|uncle|aunt|grandma|grandpa)\\b`,
        'i'
      );
      possessiveMatch = text.match(possessivePattern);
    }

    let hasIndependentMatch = false;
    if (possessiveMatch) {
      // Check whether canonical or synonyms appear independently outside the possessive phrase
      const textWithoutPossessive = (
        text.slice(0, possessiveMatch.index) +
        ' ' +
        text.slice(possessiveMatch.index + possessiveMatch[0].length)
      ).trim();
      const tokensWithoutPossessive = textWithoutPossessive.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
      hasIndependentMatch = validTokens.some(
        (v) =>
          matchPhraseInTokens(tokensWithoutPossessive, v, true).matched &&
          !matchPhraseInTokens(tokensWithoutPossessive, v, true).isNegated
      );
    }

    if (possessiveMatch && !hasIndependentMatch) {
      conflicts.agent = { stated: possessiveMatch[2].toLowerCase(), canonical };
    } else if (validTokens.some((v) => checkMatch(v))) {
      matches.agent = canonical;
    } else {
      // Check distractors supplied by rubric and other known characters from entity_graph
      const explicitDistractors = (slots.agent.distractors || []).map((d) => d.toLowerCase().trim());
      const otherChars = (rubric.entity_graph?.characters || [])
        .map((c) => (c.canonical_name || c.canonical_id || '').toLowerCase().trim())
        .filter((c) => c && c !== canonical && c !== (slots.recipient?.canonical || '').toLowerCase().trim());

      const candidateConfused = [...new Set([...explicitDistractors, ...otherChars])].filter(Boolean);
      const statedAgent = candidateConfused.find((cand) => cand !== canonical && checkMatch(cand, false));
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
    const synonyms = (slots.recipient.synonyms || []).map((s) => s.toLowerCase().trim());

    if ((canonical && checkMatch(canonical)) || synonyms.some((s) => checkMatch(s))) {
      matches.recipient = canonical;
    } else {
      const explicitDistractors = (slots.recipient.distractors || []).map((d) => d.toLowerCase().trim());
      const otherChars = (rubric.entity_graph?.characters || [])
        .map((c) => (c.canonical_name || c.canonical_id || '').toLowerCase().trim())
        .filter((c) => c && c !== canonical && c !== (slots.agent?.canonical || '').toLowerCase().trim());
      const allDistractors = [...new Set([...explicitDistractors, ...otherChars])].filter(Boolean);
      const matchedDistractor = allDistractors.find((d) => d && checkMatch(d, false));

      if (matchedDistractor) {
        conflicts.recipient = { stated: matchedDistractor, canonical };
      } else {
        // Check for conflicting beneficiary phrases ("for [X]", "[X]'s hat/lap")
        const beneficiaryConflict = text.match(
          /\b(?:for\s+(?:a\s+|the\s+|his\s+|her\s+|my\s+)?([a-z]+)|(?:a\s+|the\s+|his\s+|her\s+|my\s+)?([a-z]+)'s)\b/i
        );
        if (beneficiaryConflict) {
          const stated = (beneficiaryConflict[1] || beneficiaryConflict[2]).toLowerCase().trim();
          if (stated !== canonical && !synonyms.includes(stated)) {
            conflicts.recipient = { stated, canonical };
          } else {
            missing.push('recipient');
          }
        } else {
          missing.push('recipient');
        }
      }
    }
  }

  // 4. Action / Verb Slot Check
  if (slots.action) {
    const canonical = (slots.action.canonical || '').toLowerCase().trim();
    const synonyms = (slots.action.synonyms || []).map((s) => s.toLowerCase().trim());
    const distractors = (slots.action.distractors || []).map((d) => d.toLowerCase().trim());

    const allActionVariants = [canonical, ...synonyms].filter(Boolean);
    if (allActionVariants.some((s) => checkMatch(s))) {
      matches.action = canonical;
    } else {
      const matchedDistractor = distractors.find((d) => d !== canonical && checkMatch(d, false));
      if (matchedDistractor) {
        conflicts.action = { stated: matchedDistractor, canonical };
      } else {
        missing.push('action');
      }
    }
  }

  // 5. Theme / Object Slot Check
  if (slots.theme) {
    const canonical = (slots.theme.canonical || '').toLowerCase().trim();
    const synonyms = (slots.theme.synonyms || []).map((s) => s.toLowerCase().trim());
    const distractors = (slots.theme.distractors || []).map((d) => d.toLowerCase().trim());

    if ((canonical && checkMatch(canonical)) || synonyms.some((s) => checkMatch(s))) {
      matches.theme = canonical;
    } else {
      const matchedDistractor = distractors.find((d) => d !== canonical && checkMatch(d, false));
      if (matchedDistractor) {
        conflicts.theme = { stated: matchedDistractor, canonical };
      } else {
        missing.push('theme');
      }
    }
  }

  // 6. Location Slot Check
  if (slots.location) {
    const canonical = (slots.location.canonical || '').toLowerCase().trim();
    const synonyms = (slots.location.synonyms || []).map((s) => s.toLowerCase().trim());
    const distractors = (slots.location.distractors || []).map((d) => d.toLowerCase().trim());

    if ((canonical && checkMatch(canonical)) || synonyms.some((s) => checkMatch(s))) {
      matches.location = canonical;
    } else {
      const matchedDistractor = distractors.find((d) => d !== canonical && checkMatch(d, false));
      if (matchedDistractor) {
        conflicts.location = { stated: matchedDistractor, canonical };
      } else {
        // Universal prepositional location extraction ("in the [X]", "at [X]")
        const locationMatch = text.match(
          /\b(?:in|at|into|inside|on|near)\s+(?:the\s+|a\s+|an\s+|his\s+|her\s+|my\s+)?([a-z]+)\b/i
        );
        if (locationMatch) {
          const stated = locationMatch[1].toLowerCase().trim();
          if (stated !== canonical && !synonyms.includes(stated) && !['a', 'the', 'it', 'his', 'her', 'my'].includes(stated)) {
            conflicts.location = { stated, canonical };
          } else {
            missing.push('location');
          }
        } else {
          missing.push('location');
        }
      }
    }
  }

  const matchCount = Object.keys(matches).length;
  const conflictCount = Object.keys(conflicts).length;
  const totalSlots = activeSlotKeys.length;

  const accuracyDegree = totalSlots > 0 ? matchCount / totalSlots : 0;

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
  generateRepairPrompt,
};
