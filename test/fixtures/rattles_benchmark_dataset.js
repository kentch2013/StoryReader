/**
 * Test dataset for "Rattles, the Barn Cat Misfit" (Pages 1-9)
 * Used to evaluate System 1 accuracy and Near-Miss Slot Repair integrity.
 */

export const rattlesBenchmarkDataset = [
  {
    id: 'Q1',
    question: "Where did Rattles live with her family?",
    target_answer_concept: "Rattles lived in the haymow in the barn.",
    semantic_slots: {
      agent: { canonical: "Rattles", synonyms: ["the kitty", "the cat", "she"] },
      location: { canonical: "haymow", synonyms: ["hay mow", "hayloft", "barn", "hay bales"] }
    },
    correct_answers: [
      { text: "She lived in the haymow.", type: "full_correct" },
      { text: "In the barn with the hay.", type: "minimal_core" }
    ],
    evasive_or_partial_answers: [
      { text: "She lived in the kitchen.", category: "conflicted_location", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Uncle Duane lived in the haymow.", category: "conflicted_agent", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "She lived with her two sisters.", category: "family_detail_missing_location", expectedDiag: "PARTIAL_ACTION" },
      { text: "Up where it was warm.", category: "vague_location", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "The hay was dry and brown.", category: "superficial_attribute", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "Where did she live with her family?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "She lived in a pet shop in the city.", category: "distractor_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "In a place.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" }
    ]
  },
  {
    id: 'Q2',
    question: "How was Rattles different from all the other barn cats?",
    target_answer_concept: "Rattles loved humans and was not afraid of them, while all the other cats were wild.",
    semantic_slots: {
      agent: { canonical: "Rattles", synonyms: ["the cat", "she"] },
      trait: { canonical: "friendly", synonyms: ["loved humans", "liked people", "not wild", "not afraid"] },
      contrast: { canonical: "wild", synonyms: ["afraid of people", "scared"] }
    },
    correct_answers: [
      { text: "She wasn't wild and she loved humans.", type: "full_correct" },
      { text: "All the other cats were afraid of people, but Rattles liked them.", type: "contrast_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "Her brother loved humans.", category: "conflicted_agent", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "She had gray fur and white paws.", category: "superficial_visual_appearance", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "The other cats were wild.", category: "half_truth_other_cats", expectedDiag: "PARTIAL_ACTION" },
      { text: "Because she lived in the barn.", category: "premise_circumstantial", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "She liked dogs instead of cats.", category: "conflicted_entity_swap", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "She was different from all the other cats.", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "She was just different.", category: "vague_tautology", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "She hated all the people on the farm.", category: "negation_contradiction", expectedDiag: "DISTRACTOR_MISCONCEPTION" }
    ]
  },
  {
    id: 'Q3',
    question: "What did Rattles do when Uncle Duane was milking the cows?",
    target_answer_concept: "Rattles jumped onto Uncle Duane's lap while he milked the cows.",
    semantic_slots: {
      agent: { canonical: "Rattles", synonyms: ["the cat", "the kitten", "she"] },
      action: { canonical: "jumped", synonyms: ["hopped", "climbed", "sat"] },
      location: { canonical: "lap", synonyms: ["knee", "on him"] },
      target_person: { canonical: "Uncle Duane", synonyms: ["Duane", "the uncle", "the farmer"] }
    },
    correct_answers: [
      { text: "She jumped right onto his lap.", type: "full_correct" },
      { text: "Rattles would sit on Uncle Duane's lap while he milked.", type: "detailed_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "She jumped on Grandma's lap.", category: "conflicted_person", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "She jumped on his shoulder.", category: "conflicted_body_part", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Uncle Duane was milking the big cow.", category: "premise_echo", expectedDiag: "PREMISE_ECHO" },
      { text: "The cow gave lots of milk.", category: "cow_attribute_tangent", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "She ran away and hid from the cows.", category: "distractor_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "What did she do when he milked?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "She did something cute.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "She bit the cow's tail.", category: "hallucination_action", expectedDiag: "DISTRACTOR_MISCONCEPTION" }
    ]
  },
  {
    id: 'Q4',
    question: "Why was the kitten named Rattles?",
    target_answer_concept: "She purred so loudly and strongly that it sounded like a rattle.",
    semantic_slots: {
      agent: { canonical: "Rattles", synonyms: ["the cat", "she"] },
      action: { canonical: "purred", synonyms: ["her purr", "purring"] },
      sound: { canonical: "rattle", synonyms: ["rattling sound", "sounded like a rattle"] }
    },
    correct_answers: [
      { text: "Because her purr was so loud it sounded like a rattle.", type: "full_correct" },
      { text: "When she purred, her whole body shook like a rattle.", type: "colloquial_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "Because her bark sounded like a rattle.", category: "conflicted_sound_action", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Because she played with a baby's rattle toy.", category: "toy_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "Michelle liked that name.", category: "actor_attribution_partial", expectedDiag: "PARTIAL_ACTION" },
      { text: "Her purr was very soft and quiet.", category: "direct_contradiction", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "Because she had a white tail tip.", category: "superficial_attribute", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "Why was the kitten named Rattles?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "Because she sounded loud.", category: "vague_sound", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "She found a rattlesnake in the barn.", category: "distractor_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" }
    ]
  },
  {
    id: 'Q5',
    question: "Who were the two children that came to visit Grandma's farm?",
    target_answer_concept: "The two children were Linda and Michelle.",
    semantic_slots: {
      child1: { canonical: "Linda", synonyms: ["the girl in yellow shorts", "the girl in red shirt"] },
      child2: { canonical: "Michelle", synonyms: ["her sister", "the other girl", "the girl in blue shirt"] }
    },
    correct_answers: [
      { text: "Linda and Michelle.", type: "minimal_core" },
      { text: "Their names were Linda and Michelle.", type: "full_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "Linda and Sarah came to visit.", category: "conflicted_second_child", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Leo and Linda came to visit.", category: "conflicted_first_child", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Just Linda.", category: "single_child_partial", expectedDiag: "PARTIAL_ACTION" },
      { text: "Two little girls arrived in a van.", category: "descriptive_omission_names", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "Grandma and Uncle Duane.", category: "conflicted_farm_characters", expectedDiag: "CHARACTER_CONFUSION" },
      { text: "Who were the two children?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "Some kids from town.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "Two boys named Jack and Ben.", category: "distractor_misconception", expectedDiag: "CHARACTER_CONFUSION" }
    ]
  },
  {
    id: 'Q6',
    question: "What did the wild barn cats do when Linda climbed up the ladder into the haymow?",
    target_answer_concept: "All the other cats ran away, hissed 'Danger', and hid in the straw bales.",
    semantic_slots: {
      agent: { canonical: "wild cats", synonyms: ["other cats", "her family", "the kittens", "they"] },
      action: { canonical: "ran and hid", synonyms: ["ran away", "hid in the straw", "hissed"] },
      cause: { canonical: "human danger", synonyms: ["scared of the human", "afraid"] }
    },
    correct_answers: [
      { text: "They ran away and hid between the straw bales.", type: "full_correct" },
      { text: "They all hissed danger and hid from the human.", type: "detailed_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "They ran and jumped into Linda's arms.", category: "conflicted_action", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Linda climbed up a tall wooden ladder.", category: "premise_echo_ladder", expectedDiag: "PREMISE_ECHO" },
      { text: "They were in the haymow.", category: "static_location_detail", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "They just sat there asleep.", category: "action_contradiction", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "The straw bales were big and yellow.", category: "superficial_attribute", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "What did the cats do when she climbed up?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "They did something fast.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "Uncle Duane chased them with a broom.", category: "character_confusion", expectedDiag: "CHARACTER_CONFUSION" }
    ]
  },
  {
    id: 'Q7',
    question: "How did Rattles react when she saw Linda in the haymow?",
    target_answer_concept: "Rattles was not afraid; she purred, put her tail straight up, and waddled over to play with Linda.",
    semantic_slots: {
      agent: { canonical: "Rattles", synonyms: ["the cat", "she"] },
      action: { canonical: "waddled over", synonyms: ["walked over to her", "went to Linda", "purred"] },
      state: { canonical: "friendly", synonyms: ["not scared", "wanted to play", "liked humans"] }
    },
    correct_answers: [
      { text: "She purred, put her tail up, and waddled over to Linda.", type: "full_correct" },
      { text: "She wasn't afraid and went right up to play with her.", type: "colloquial_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "She put her tail up and waddled over to Uncle Duane.", category: "conflicted_recipient", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Her mother cat waddled over to Linda.", category: "conflicted_agent", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "Linda picked her up and held her.", category: "child_action_partial", expectedDiag: "PARTIAL_ACTION" },
      { text: "Her tail was in the air.", category: "superficial_body_detail", expectedDiag: "SUPERFICIAL_ATTRIBUTE" },
      { text: "She hissed and scratched Linda's hand.", category: "distractor_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "How did Rattles react?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "She moved.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "She jumped out the window into the grass.", category: "hallucination_action", expectedDiag: "DISTRACTOR_MISCONCEPTION" }
    ]
  },
  {
    id: 'Q8',
    question: "What fun things did the girls do with Rattles when they played together?",
    target_answer_concept: "They played string with her, dressed her in doll clothes, and fed her milk.",
    semantic_slots: {
      agent: { canonical: "the girls", synonyms: ["Linda and Michelle", "the children", "they"] },
      activities: { canonical: "played string, dressed in doll clothes, fed milk", synonyms: ["played with string", "doll clothes", "gave her milk"] }
    },
    correct_answers: [
      { text: "They played string with her, dressed her in doll clothes, and fed her milk.", type: "full_correct" },
      { text: "They gave her milk and dressed her up in doll clothes.", type: "partial_core_correct" }
    ],
    evasive_or_partial_answers: [
      { text: "They dressed her in dog clothes and gave her milk.", category: "conflicted_clothing_slot", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "They dressed her in doll clothes and fed her juice.", category: "conflicted_food_slot", expectedDiag: "NEAR_MISS_REPAIR" },
      { text: "They just gave her milk.", category: "single_item_fragment", expectedDiag: "PARTIAL_ACTION" },
      { text: "They stayed at Grandma's house for three days.", category: "temporal_story_tangent", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "They took her swimming in the lake.", category: "hallucination_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" },
      { text: "What fun things did they do?", category: "question_echo", expectedDiag: "QUESTION_ECHO" },
      { text: "They played some games.", category: "vague_fragment", expectedDiag: "UNGROUNDED_OFF_TRACK" },
      { text: "They locked her in a cage.", category: "distractor_misconception", expectedDiag: "DISTRACTOR_MISCONCEPTION" }
    ]
  }
];

export default rattlesBenchmarkDataset;
