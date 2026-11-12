/**
 * Discourse Resolver Service
 *
 * Implements:
 * 1. Kinship compositional mapping (e.g. "mothers mother" -> "grandma")
 * 2. Cross-generational mismatch detection (flagging CHARACTER_CONFUSION)
 * 3. Social relational mapping (e.g. "jims friend" -> "john")
 * 4. Anaphora / pronoun resolution (e.g. "she" -> "grandma", "it" -> "the hat", "he" -> "Leo")
 * 5. Hierarchical Ambiguity Cascade with Free Micro-Turn
 */

const CROSS_GEN_REGEX = /\b(mothers?|fathers?|moms?|dads?)\s+(nana|grandma|grandmother|granny|grandpa|grandfather|gramps)\b/i;

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * When a character's name collides with a naming-origin question or non-agent sound/object concept
 * (e.g., character named "Rattles" when the question asks why she was named Rattles or the sound is a rattle),
 * pronoun replacement must use a descriptive alias (e.g., "the kitten", "the cat") rather than the proper name
 * to prevent injecting the target answer root into child speech.
 */
function getSafeReferentReplacement(referentName = '', rubric = {}) {
  if (!referentName || typeof referentName !== 'string') return referentName;
  const checkinQ = (rubric.checkin_question || '').toLowerCase();
  const isNamingQuestion = /why\s+(?:was|is)\s+.*\bnamed\b/i.test(checkinQ);

  const cleanName = referentName.toLowerCase().trim();
  const stemName = cleanName.replace(/s$/, '');

  const objectName = (rubric.story_context?.object || rubric.semantic_slots?.object?.canonical || '').toLowerCase();
  const soundName = (rubric.story_context?.sound || rubric.semantic_slots?.sound?.canonical || '').toLowerCase();
  const isSoundOrObjectCollision =
    (stemName.length >= 4 && (objectName.includes(stemName) || soundName.includes(stemName)));

  const hasConceptCollision = isNamingQuestion || isSoundOrObjectCollision;

  if (hasConceptCollision && rubric.entity_graph && Array.isArray(rubric.entity_graph.characters)) {
    const char = rubric.entity_graph.characters.find(
      (c) => (c.canonical_name || c.canonical_id || '').toLowerCase() === cleanName
    );
    if (char && Array.isArray(char.aliases)) {
      const descAlias = char.aliases.find(
        (a) => a.toLowerCase().startsWith('the ') || a.toLowerCase() !== cleanName
      );
      if (descAlias) {
        return descAlias;
      }
    }
  }
  return referentName;
}

/**
 * Resolves relational discourse, kinship compositions, social relations,
 * anaphora / pronouns, and hierarchical ambiguity cascade with micro-turns.
 *
 * @param {string} normalizedTranscript - The sanitized child transcript.
 * @param {object} rubric - The evaluation rubric (containing entity_graph, checkin_question, etc.).
 * @param {object} options - Options such as microturn_used, attempt_count.
 * @returns {object}
 */
export function resolveDiscourse(normalizedTranscript = '', rubric = {}, options = {}) {
  let transcript = (normalizedTranscript || '').toLowerCase().trim();
  const microturnUsed = options?.microturn_used === true || rubric?.microturn_used === true;
  const entityGraph = rubric?.entity_graph;

  const result = {
    grounded_transcript: transcript,
    is_ambiguous: false,
    is_microturn: false,
    microturn_used: microturnUsed,
    candidate_names: [],
    spoken_prompt: '',
    character_confusion: false,
    cognitive_diagnosis: null,
  };

  if (!transcript) {
    return result;
  }

  // =========================================================================
  // 1. Cross-Generational Mismatch Detection
  // =========================================================================
  if (CROSS_GEN_REGEX.test(transcript)) {
    let isAllowedComposition = false;
    if (entityGraph && Array.isArray(entityGraph.characters)) {
      for (const char of entityGraph.characters) {
        if (Array.isArray(char.kinship_compositions)) {
          for (const comp of char.kinship_compositions) {
            const normComp = comp.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            if (transcript.includes(normComp)) {
              isAllowedComposition = true;
              break;
            }
          }
        }
        if (isAllowedComposition) break;
      }
    }

    if (!isAllowedComposition) {
      result.character_confusion = true;
      result.cognitive_diagnosis = 'CHARACTER_CONFUSION';
      return result;
    }
  }

  // Conflicting recipient detection against story_context.recipient
  const storyRecipient = (rubric.story_context?.recipient || rubric.entity_graph?.discourse_referents?.him || '').toLowerCase().trim();
  if (storyRecipient) {
    const beneficiaryMatch = transcript.match(
      /\b(?:for\s+(?:a\s+|the\s+|his\s+|her\s+|my\s+)?(dog|cat|pet|grampa|grandpa|friend|someone\s+else|sister|brother|dad|father)|(?:a\s+|the\s+|his\s+|her\s+|my\s+)?(dog|cat|pet|grampa|grandpa|friend|someone\s+else|sister|brother|dad|father)'s\s+(?:hat|item|thing|stuff|one))\b/i
    );
    if (beneficiaryMatch) {
      const statedBeneficiary = (beneficiaryMatch[1] || beneficiaryMatch[2]).toLowerCase();
      result.character_confusion = true;
      result.cognitive_diagnosis = 'CHARACTER_CONFUSION';
      const recipientLabel = rubric.story_context?.recipient || storyRecipient || 'them';
      result.spoken_prompt = `That was for ${recipientLabel}, not ${statedBeneficiary}!`;
      return result;
    }
  }

  // =========================================================================
  // 2. Kinship Compositional Mapping
  // =========================================================================
  if (entityGraph && Array.isArray(entityGraph.characters)) {
    for (const char of entityGraph.characters) {
      if (Array.isArray(char.kinship_compositions)) {
        for (const comp of char.kinship_compositions) {
          const normComp = comp.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          if (!normComp) continue;
          const canonicalName = (char.canonical_name || char.canonical_id || '').toLowerCase();

          // Guard against stutter if normComp is already a prefix of canonicalName (e.g. "uncle" in "uncle duane")
          if (canonicalName && canonicalName !== normComp && canonicalName.startsWith(normComp + ' ')) {
            const suffix = canonicalName.slice(normComp.length).trim();
            const guardedRegex = new RegExp(`\\b${escapeRegex(normComp)}\\b(?!\\s+${escapeRegex(suffix)})`, 'gi');
            transcript = transcript.replace(guardedRegex, canonicalName);
            continue;
          }

          const regex = new RegExp(`\\b${escapeRegex(normComp)}\\b`, 'gi');
          if (regex.test(transcript)) {
            transcript = transcript.replace(regex, canonicalName);
          }
        }
      }
    }
  } else {
    // Fallback kinship normalization for rubrics without entity_graph
    transcript = transcript
      .replace(/\b(mothers?\s+mother|fathers?\s+mother|moms?\s+mom|dads?\s+mom|grand\s+mother)\b/gi, 'grandmother')
      .replace(/\b(mothers?\s+father|fathers?\s+father|moms?\s+dad|dads?\s+dad|grand\s+father)\b/gi, 'grandfather')
      .replace(/\bgrampa\b/gi, 'grandpa');
  }

  // =========================================================================
  // 3. Social Relational Mapping
  // =========================================================================
  if (entityGraph && Array.isArray(entityGraph.social_relations)) {
    for (const rel of entityGraph.social_relations) {
      let targetName = rel.target_id;
      if (Array.isArray(entityGraph.characters)) {
        const found = entityGraph.characters.find(
          (c) =>
            c.canonical_id === rel.target_id ||
            c.canonical_name?.toLowerCase() === rel.target_id?.toLowerCase()
        );
        if (found) {
          targetName = found.canonical_name || found.canonical_id;
        }
      }

      if (Array.isArray(rel.aliases)) {
        for (const alias of rel.aliases) {
          const normAlias = alias.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
          if (!normAlias) continue;
          const regex = new RegExp(`\\b${escapeRegex(normAlias)}\\b`, 'gi');
          if (regex.test(transcript)) {
            transcript = transcript.replace(regex, targetName);
          }
        }
      }
    }
  }

  // =========================================================================
  // 4. Anaphora / Pronoun Resolution & Hierarchical Ambiguity Cascade
  // =========================================================================
  const discourseReferents = entityGraph?.discourse_referents;

  const femalePronouns = ['she', 'her'];
  const malePronouns = ['he', 'him', 'his'];

  const containsFemalePronoun = femalePronouns.some((p) => new RegExp(`\\b${p}\\b`, 'i').test(transcript));
  const containsMalePronoun = malePronouns.some((p) => new RegExp(`\\b${p}\\b`, 'i').test(transcript));

  let ambiguousPronounFound = false;
  let activeCandidates = [];
  let activeGender = null;

  if (discourseReferents) {
    if (containsFemalePronoun && discourseReferents.she === null) {
      ambiguousPronounFound = true;
      activeGender = 'female';
      activeCandidates = entityGraph.active_female_candidates || [];
      if (activeCandidates.length === 0 && Array.isArray(entityGraph.characters)) {
        activeCandidates = entityGraph.characters
          .filter((c) => c.gender === 'female')
          .map((c) => c.canonical_name || c.canonical_id);
      }
    } else if (containsMalePronoun && discourseReferents.he === null) {
      ambiguousPronounFound = true;
      activeGender = 'male';
      activeCandidates = entityGraph.active_male_candidates || [];
      if (activeCandidates.length === 0 && Array.isArray(entityGraph.characters)) {
        activeCandidates = entityGraph.characters
          .filter((c) => c.gender === 'male')
          .map((c) => c.canonical_name || c.canonical_id);
      }
    }
  }

  // Resolve unambiguous single-candidate gender pronouns if not explicitly provided in discourseReferents
  if (containsFemalePronoun && !discourseReferents?.she && discourseReferents?.she !== null) {
    const femaleChars = entityGraph?.characters?.filter((c) => c.gender === 'female') || [];
    if (femaleChars.length === 1) {
      const rawName = femaleChars[0].canonical_name || femaleChars[0].canonical_id;
      const name = getSafeReferentReplacement(rawName, rubric);
      femalePronouns.forEach((p) => {
        transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), name);
      });
    }
  }

  if (containsMalePronoun && !discourseReferents?.he && discourseReferents?.he !== null) {
    const maleChars = entityGraph?.characters?.filter((c) => c.gender === 'male') || [];
    if (maleChars.length === 1) {
      const rawName = maleChars[0].canonical_name || maleChars[0].canonical_id;
      const name = getSafeReferentReplacement(rawName, rubric);
      malePronouns.forEach((p) => {
        transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), name);
      });
    }
  }

  if (ambiguousPronounFound && activeCandidates.length >= 2) {
    // Cascade Tier 1: Salience / Discourse Focus
    const question = (rubric.checkin_question || '').toLowerCase();
    const mentionedCandidates = activeCandidates.filter((cand) =>
      question.includes(cand.toLowerCase())
    );

    if (mentionedCandidates.length === 1) {
      const resolvedName = getSafeReferentReplacement(mentionedCandidates[0], rubric);
      const char = entityGraph.characters?.find(
        (c) => (c.canonical_name || c.canonical_id).toLowerCase() === mentionedCandidates[0].toLowerCase()
      );
      if (char?.gender === 'female' || activeGender === 'female') {
        femalePronouns.forEach((p) => {
          transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), resolvedName);
        });
      } else if (char?.gender === 'male' || activeGender === 'male') {
        malePronouns.forEach((p) => {
          transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), resolvedName);
        });
      }
    } else {
      // Cascade Tier 2: Predicate & Action Exclusivity
      let uniqueActionCandidate = null;
      if (Array.isArray(entityGraph.characters)) {
        const matchingActionCandidates = [];
        for (const candName of activeCandidates) {
          const char = entityGraph.characters.find(
            (c) => (c.canonical_name || c.canonical_id).toLowerCase() === candName.toLowerCase()
          );
          if (char && Array.isArray(char.actions)) {
            const hasAction = char.actions.some((act) => transcript.includes(act.toLowerCase()));
            if (hasAction) {
              matchingActionCandidates.push(candName);
            }
          }
        }
        if (matchingActionCandidates.length === 1) {
          uniqueActionCandidate = matchingActionCandidates[0];
        }
      }

      if (uniqueActionCandidate) {
        const resolvedActionCandidate = getSafeReferentReplacement(uniqueActionCandidate, rubric);
        const char = entityGraph.characters?.find(
          (c) => (c.canonical_name || c.canonical_id).toLowerCase() === uniqueActionCandidate.toLowerCase()
        );
        if (char?.gender === 'female' || activeGender === 'female') {
          femalePronouns.forEach((p) => {
            transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), resolvedActionCandidate);
          });
        } else if (char?.gender === 'male' || activeGender === 'male') {
          malePronouns.forEach((p) => {
            transcript = transcript.replace(new RegExp(`\\b${p}\\b`, 'gi'), resolvedActionCandidate);
          });
        }
      } else {
        // Cascade Tier 3: Free Clarification Micro-Turn
        result.is_ambiguous = true;
        result.candidate_names = activeCandidates;

        if (!microturnUsed) {
          result.is_microturn = true;
          result.microturn_used = true;
          result.cognitive_diagnosis = 'AMBIGUOUS_REFERENT';
          const cand1 = activeCandidates[0];
          const cand2 = activeCandidates[1];
          result.spoken_prompt = `Do you mean ${cand1} or ${cand2}? Tell me which one!`;
          result.grounded_transcript = transcript;
          return result;
        } else {
          result.is_microturn = false;
          result.microturn_used = true;
          result.grounded_transcript = transcript;
          return result;
        }
      }
    }
  }

  // Resolve unambiguous discourse referents
  if (discourseReferents) {
    for (const [pronoun, referent] of Object.entries(discourseReferents)) {
      if (typeof referent === 'string' && referent.trim()) {
        const safeReferent = getSafeReferentReplacement(referent, rubric);
        const regex = new RegExp(`\\b${escapeRegex(pronoun)}\\b`, 'gi');
        transcript = transcript.replace(regex, safeReferent);
      }
    }
  }

  // Normalize prepositional beneficiary phrases ("hat for [the] [X]" -> "[X]'s hat")
  transcript = transcript.replace(/\b(?:a|the)?\s*hat\s+for\s+(?:the\s+|a\s+)?([a-z0-9]+)\b/gi, "$1's hat");

  result.grounded_transcript = transcript.trim();
  return result;
}

export default {
  resolveDiscourse,
};
