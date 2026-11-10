export function getPrebakedFeedback(data = {}) {
  const target = data.target_answer_concept || 'that is what happened in the book';
  const hint1 = data.hint_level_1 || data.scaffold_hint || 'Look closely at the page for clues.';
  const hint2 = data.hint_level_2 || 'Think about what happened right before this.';
  const targetNoDot = target.endsWith('.') ? target.slice(0, -1) : target;

  return {
    praise: `Spot on! ${target}`,
    hint_attempt_1: hint1,
    hint_attempt_2: hint2,
    reveal_attempt_2: `Great effort! In the story, ${targetNoDot}. Let's keep reading!`,
  };
}

export default {
  getPrebakedFeedback,
};
