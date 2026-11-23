export function getPrebakedFeedback(data = {}) {
  const safeData = data && typeof data === 'object' ? data : {};
  const target = (safeData.target_answer_concept || 'that is what happened in the book').trim();
  const hint1 = safeData.hint_level_1 || safeData.scaffold_hint || 'Look closely at the page for clues.';
  const hint2 = safeData.hint_level_2 || 'Think about what happened right before this.';

  // Strip trailing punctuation
  const targetNoDot = target.replace(/[.!?]+$/, '').trim();

  return {
    praise: `Spot on! ${target.endsWith('.') ? target : target + '.'}`,
    hint_attempt_1: hint1,
    hint_attempt_2: hint2,
    reveal_attempt_2: `Great effort! In the story, ${targetNoDot}. Let's keep reading!`,
  };
}

export default {
  getPrebakedFeedback,
};
