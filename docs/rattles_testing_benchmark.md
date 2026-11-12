# Rattles, the Barn Cat Misfit — Benchmark Test Suite (Pages 1–9)

This benchmark document provides a standardized, regression-proof test suite consisting of **8 Grade 2 reading comprehension questions** with **10 calibrated responses each** (2 correct + 8 evasive/partial, 80 total evaluated cases) derived from *Rattles, the Barn Cat Misfit*.

Use this suite to evaluate:
1. **System 1 ONNX DeBERTa NLI zero-lag accuracy** (<100ms latency, zero LLM cost).
2. **Universal Near-Miss Slot Repair** (generating generic Socratic Wh-prompts without bespoke book hardcoding).
3. **No-Spoiler Pedagogical Scaffolding** (guaranteeing Attempt 1 feedback never leaks the answer).

---

## Question Matrix Overview

| ID | Page Range | Question | Question Type | Target Concept | Primary Slots |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Q1** | Pages 1–2 | *Where did Rattles live with her family?* | `literal_fact` | Rattles lived in the haymow in the barn. | `agent`, `location` |
| **Q2** | Pages 1–3 | *How was Rattles different from all the other barn cats?* | `cause_and_effect` | Rattles loved humans and was not afraid of them, while all the other cats were wild. | `agent`, `trait`, `contrast` |
| **Q3** | Pages 3–4 | *What did Rattles do when Uncle Duane was milking the cows?* | `sequential_action` | Rattles jumped onto Uncle Duane's lap while he milked the cows. | `agent`, `action`, `target_person`, `location` |
| **Q4** | Pages 4–5 | *Why was the kitten named Rattles?* | `cause_and_effect` | She purred so loudly and strongly that it sounded like a rattle. | `agent`, `action`, `sound` |
| **Q5** | Pages 5–6 | *Who were the two children that came to visit Grandma's farm?* | `literal_fact` | The two children were Linda and Michelle. | `child1`, `child2` |
| **Q6** | Pages 6–7 | *What did the wild barn cats do when Linda climbed up the ladder into the haymow?* | `sequential_action` | All the other cats ran away, hissed 'Danger', and hid in the straw bales. | `agent`, `action`, `cause` |
| **Q7** | Pages 7–8 | *What did Rattles do when Linda came into the haymow?* | `character_motivation` | Rattles walked right out, purred, and jumped into Linda's arms. | `agent`, `action`, `target` |
| **Q8** | Pages 8–9 | *Why was Uncle Duane so surprised at the end of the story?* | `cause_and_effect` | He had never seen a wild barn cat sit in a human's lap or be friendly before. | `agent`, `feeling`, `reason` |

---

## Detailed Question Specifications

### Question 1 (Pages 1–2)
* **Check-in Question:** `"Where did Rattles live with her family?"`
* **Target Answer Concept:** `"Rattles lived in the haymow in the barn."`
* **Question Type:** `literal_fact`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Rattles", synonyms: ["the kitty", "the cat", "she"] }`
  * `location`: `{ canonical: "haymow", synonyms: ["hay mow", "hayloft", "barn", "hay bales"], distractors: ["kitchen", "house", "city", "pet shop"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"Yes, there was lots of hay! But where was her home on the farm?"`
  * `premise_echo`: `"Think about where the cats made their home!"`
  * `character_confusion`: `"Check who lived in the haymow—was it the cats, or the humans?"`
  * `distractor_misconception`: `"She did not live in a pet shop or the house! Look closely at the picture—where did the cats make their home?"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"She lived in the haymow."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Minimal]`: `"In the barn with the hay."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Location]`: `"She lived in the kitchen."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Take another look—where did that happen in the story?"*
4. `[Evasive 2 - Conflicted Agent]`: `"Uncle Duane lived in the haymow."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Check the picture—who was the one doing that?"*
5. `[Evasive 3 - Missing Core Location]`: `"She lived with her two sisters."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
6. `[Evasive 4 - Vague Location]`: `"Up where it was warm."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
7. `[Evasive 5 - Superficial Attribute]`: `"The hay was dry and brown."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
8. `[Evasive 6 - Question Echo]`: `"Where did she live with her family?"` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
9. `[Evasive 7 - Distractor Misconception]`: `"She lived in a pet shop in the city."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR` / `DISTRACTOR_MISCONCEPTION`)
10. `[Evasive 8 - Vague Fragment]`: `"In a place."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)

---

### Question 2 (Pages 1–3)
* **Check-in Question:** `"How was Rattles different from all the other barn cats?"`
* **Target Answer Concept:** `"Rattles loved humans and was not afraid of them, while all the other cats were wild."`
* **Question Type:** `cause_and_effect`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Rattles", synonyms: ["the cat", "the kitten", "she"] }`
  * `trait`: `{ canonical: "friendly", synonyms: ["loved humans", "liked people", "not wild", "not afraid", "friendly with humans", "liked them", "loved them"], distractors: ["wild", "scared", "afraid of people", "hated people"] }`
  * `contrast`: `{ canonical: "wild", synonyms: ["afraid of people", "scared"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"You noticed how she looked! But think about her actions—what did Rattles do that the other cats would never do?"`
  * `premise_echo`: `"Think about how Rattles acted compared to all the other wild cats!"`
  * `character_confusion`: `"Check who was different—was it Rattles, or the other cats?"`
  * `distractor_misconception`: `"Think about the other wild cats! When someone came near, how did Rattles act compared to them?"`
  * `partial_action`: `"How did Rattles act around people compared to the other barn cats?"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"She wasn't wild and she loved humans."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Contrast]`: `"All the other cats were afraid of people, but Rattles liked them."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Agent]`: `"Her brother loved humans."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Check the picture—who was the one doing that?"*
4. `[Evasive 2 - Superficial Visual]`: `"She had gray fur and white paws."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
5. `[Evasive 3 - Partial Action]`: `"The other cats were wild."` $\rightarrow$ `needs_scaffold` (`PARTIAL_ACTION`)
6. `[Evasive 4 - Circumstantial]`: `"Because she lived in the barn."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
7. `[Evasive 5 - Entity Swap]`: `"She liked dogs instead of cats."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
8. `[Evasive 6 - Question Echo]`: `"She was different from all the other cats."` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
9. `[Evasive 7 - Vague Tautology]`: `"She was just different."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Direct Contradiction]`: `"She hated all the people on the farm."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)

---

### Question 3 (Pages 3–4)
* **Check-in Question:** `"What did Rattles do when Uncle Duane was milking the cows?"`
* **Target Answer Concept:** `"Rattles jumped onto Uncle Duane's lap while he milked the cows."`
* **Question Type:** `sequential_action`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Rattles", synonyms: ["the cat", "the kitten", "she"] }`
  * `action`: `{ canonical: "jumped", synonyms: ["hopped", "climbed", "sat"] }`
  * `location`: `{ canonical: "lap", synonyms: ["knee", "on him"] }`
  * `target_person`: `{ canonical: "Uncle Duane", synonyms: ["Duane", "the uncle", "the farmer"], distractors: ["Grandma", "Michelle", "Linda"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"Yes, the cows gave milk! But look closely at what the little kitten did!"`
  * `premise_echo`: `"Think about what happened while Uncle Duane was sitting on his milking stool!"`
  * `character_confusion`: `"Look closely at whose lap she hopped on!"`
  * `distractor_misconception`: `"Rattles wasn't scared of the barn chores! Look at where she hopped!"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"She jumped right onto his lap."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Detailed]`: `"Rattles would sit on Uncle Duane's lap while he milked."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Person]`: `"She jumped on Grandma's lap."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Take another look—who was that for?"*
4. `[Evasive 2 - Conflicted Location]`: `"She jumped on his shoulder."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Take another look—where did that happen in the story?"*
5. `[Evasive 3 - Premise Echo]`: `"Uncle Duane was milking the big cow."` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
6. `[Evasive 4 - Tangent Detail]`: `"The cow gave lots of milk."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
7. `[Evasive 5 - Distractor]`: `"She ran away and hid from the cows."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
8. `[Evasive 6 - Question Echo]`: `"What did she do when he milked?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Fragment]`: `"She did something cute."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Hallucinated Action]`: `"She bit the cow's tail."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)

---

### Question 4 (Pages 4–5)
* **Check-in Question:** `"Why was the kitten named Rattles?"`
* **Target Answer Concept:** `"She purred so loudly and strongly that it sounded like a rattle."`
* **Question Type:** `cause_and_effect`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Rattles", synonyms: ["the cat", "she"] }`
  * `action`: `{ canonical: "purred", synonyms: ["her purr", "purring"] }`
  * `sound`: `{ canonical: "rattle", synonyms: ["rattling sound", "shook like a rattle"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"You noticed her tail tip! But listen closely to what sound she made!"`
  * `premise_echo`: `"Think about what happened whenever someone petted her!"`
  * `character_confusion`: `"Michelle liked the kitten! But why did that name fit her sound?"`
  * `distractor_misconception`: `"She wasn't named after a toy or a snake! Think about the sound she made when she was happy!"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"Because her purr was so loud it sounded like a rattle."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Colloquial]`: `"When she purred, her whole body shook like a rattle."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Action]`: `"Because her bark sounded like a rattle."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Think about what they did in the story—what was the action?"*
4. `[Evasive 2 - Misconception]`: `"Because she played with a baby's rattle toy."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
5. `[Evasive 3 - Partial Action]`: `"Michelle liked that name."` $\rightarrow$ `needs_scaffold` (`PARTIAL_ACTION`)
6. `[Evasive 4 - Direct Contradiction]`: `"Her purr was very soft and quiet."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
7. `[Evasive 5 - Superficial Detail]`: `"Because she had a white tail tip."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
8. `[Evasive 6 - Question Echo]`: `"Why was the kitten named Rattles?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Sound]`: `"Because she sounded loud."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Wild Hallucination]`: `"She found a rattlesnake in the barn."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)

---

### Question 5 (Pages 5–6)
* **Check-in Question:** `"Who were the two children that came to visit Grandma's farm?"`
* **Target Answer Concept:** `"The two children were Linda and Michelle."`
* **Question Type:** `literal_fact`
* **Semantic Slots:**
  * `child1`: `{ canonical: "Linda", synonyms: ["the girl in yellow shorts", "the older girl"] }`
  * `child2`: `{ canonical: "Michelle", synonyms: ["her sister", "the other girl", "the girl in blue"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"They did arrive in a van! But what were the two girls' names?"`
  * `premise_echo`: `"Think about the two sisters who got out of the car!"`
  * `character_confusion`: `"Grandma and Uncle Duane live on the farm! Who were the two visitors?"`
  * `distractor_misconception`: `"Look at the story text when the van arrives—what did Grandma call them?"`

#### Test Responses:
1. `[Correct 1 - Minimal Core]`: `"Linda and Michelle."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Full]`: `"Their names were Linda and Michelle."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Name]`: `"Linda and Sarah came to visit."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Check the picture—who was the one doing that?"*
4. `[Evasive 2 - Conflicted Name]`: `"Leo and Linda came to visit."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Check the picture—who was the one doing that?"*
5. `[Evasive 3 - Partial Answer]`: `"Just Linda."` $\rightarrow$ `needs_scaffold` (`PARTIAL_ACTION`)
6. `[Evasive 4 - Visual Appearance]`: `"Two little girls arrived in a van."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
7. `[Evasive 5 - Farm Characters]`: `"Grandma and Uncle Duane."` $\rightarrow$ `needs_scaffold` (`CHARACTER_CONFUSION`)
8. `[Evasive 6 - Question Echo]`: `"Who were the two children?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Fragment]`: `"Some kids from town."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Conflicted Gender/Names]`: `"Two boys named Jack and Ben."` $\rightarrow$ `needs_scaffold` (`CHARACTER_CONFUSION`)

---

### Question 6 (Pages 6–7)
* **Check-in Question:** `"What did the wild barn cats do when Linda climbed up the ladder into the haymow?"`
* **Target Answer Concept:** `"All the other cats ran away, hissed 'Danger', and hid in the straw bales."`
* **Question Type:** `sequential_action`
* **Semantic Slots:**
  * `agent`: `{ canonical: "wild cats", synonyms: ["other cats", "her family", "the kittens", "they"] }`
  * `action`: `{ canonical: "ran and hid", synonyms: ["ran away", "hid in the straw", "hissed"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"The straw bales were big! But what did the cats do when they saw a human?"`
  * `premise_echo`: `"Think about what happened when Linda's head popped up into the haymow!"`
  * `character_confusion`: `"Uncle Duane was downstairs! What did the frightened cats do?"`
  * `distractor_misconception`: `"The wild cats were scared of humans! Where did they go?"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"They ran away and hid between the straw bales."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Detailed]`: `"They all hissed danger and hid from the human."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Action]`: `"They ran and jumped into Linda's arms."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Think about what they did in the story—what was the action?"*
4. `[Evasive 2 - Premise Echo]`: `"Linda climbed up a tall wooden ladder."` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
5. `[Evasive 3 - Static Location]`: `"They were in the haymow."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
6. `[Evasive 4 - Contradiction]`: `"They just sat there asleep."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
7. `[Evasive 5 - Superficial Detail]`: `"The straw bales were big and yellow."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
8. `[Evasive 6 - Question Echo]`: `"What did the cats do when she climbed up?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Fragment]`: `"They did something fast."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Confused Actor]`: `"Uncle Duane chased them with a broom."` $\rightarrow$ `needs_scaffold` (`CHARACTER_CONFUSION`)

---

### Question 7 (Pages 7–8)
* **Check-in Question:** `"What did Rattles do when Linda came into the haymow?"`
* **Target Answer Concept:** `"Rattles walked right out, purred, and jumped into Linda's arms."`
* **Question Type:** `character_motivation`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Rattles", synonyms: ["the kitten", "she"] }`
  * `action`: `{ canonical: "jumped into arms", synonyms: ["hopped in her lap", "came right up", "purred"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"Linda did have yellow shorts! But what did Rattles do when Linda held out her hands?"`
  * `premise_echo`: `"Think about how Rattles acted differently from all the hiding cats!"`
  * `character_confusion`: `"Her brother stayed hidden! What did brave little Rattles do?"`
  * `distractor_misconception`: `"Rattles didn't scratch or run away! Look at how friendly she was!"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"She purred and jumped right into Linda's arms."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Detailed]`: `"Rattles walked out from the straw and let Linda hold her."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Action]`: `"She hissed and bit Linda's hand."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Think about what they did in the story—what was the action?"*
4. `[Evasive 2 - Misconception]`: `"She hid under the hay like the other cats."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
5. `[Evasive 3 - Conflicted Person]`: `"She jumped into Michelle's arms."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Take another look—who was that for?"*
6. `[Evasive 4 - Superficial Detail]`: `"Linda was wearing yellow shorts."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
7. `[Evasive 5 - Premise Echo]`: `"Linda came up into the haymow."` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
8. `[Evasive 6 - Question Echo]`: `"What did Rattles do when she came up?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Fragment]`: `"She was being a kitty."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Hallucination]`: `"She fell through a hole in the floor."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)

---

### Question 8 (Pages 8–9)
* **Check-in Question:** `"Why was Uncle Duane so surprised at the end of the story?"`
* **Target Answer Concept:** `"He had never seen a wild barn cat sit in a human's lap or be friendly before."`
* **Question Type:** `cause_and_effect`
* **Semantic Slots:**
  * `agent`: `{ canonical: "Uncle Duane", synonyms: ["the farmer", "he"] }`
  * `reason`: `{ canonical: "wild cat friendly", synonyms: ["barn cats never let people hold them", "never saw a cat act like that", "cats are always wild"] }`
* **No-Spoiler Scaffolds:**
  * `superficial_attribute`: `"He did hold his milk pail! But why was he so surprised by the kitten?"`
  * `premise_echo`: `"Think about what Uncle Duane knows about barn cats on the farm!"`
  * `character_confusion`: `"Grandma smiled! But what made Uncle Duane stop and stare?"`
  * `distractor_misconception`: `"He wasn't angry about the milk! Think about how barn cats usually behave around humans!"`

#### Test Responses:
1. `[Correct 1 - Full]`: `"Because he had never seen a barn cat let a human hold it before."` $\rightarrow$ `mastered` (`MASTERED`)
2. `[Correct 2 - Colloquial]`: `"Barn cats are always wild, but Rattles was sitting right in Linda's lap."` $\rightarrow$ `mastered` (`MASTERED`)
3. `[Evasive 1 - Conflicted Reason]`: `"Because a cow escaped from the barn."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
4. `[Evasive 2 - Misconception]`: `"Because the cat spilled all his fresh milk."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
5. `[Evasive 3 - Conflicted Agent]`: `"Grandma was surprised because the cat was friendly."` $\rightarrow$ `needs_scaffold` (`NEAR_MISS_REPAIR`)  
   *Nudge:* *"You're so close! Check the picture—who was the one doing that?"*
6. `[Evasive 4 - Superficial Detail]`: `"He was holding two heavy metal milk pails."` $\rightarrow$ `needs_scaffold` (`SUPERFICIAL_ATTRIBUTE`)
7. `[Evasive 5 - Premise Echo]`: `"Uncle Duane was surprised at the end."` $\rightarrow$ `needs_scaffold` (`PREMISE_ECHO`)
8. `[Evasive 6 - Question Echo]`: `"Why was he so surprised?"` $\rightarrow$ `needs_scaffold` (`QUESTION_ECHO`)
9. `[Evasive 7 - Vague Fragment]`: `"Because something weird happened."` $\rightarrow$ `needs_scaffold` (`UNGROUNDED_OFF_TRACK`)
10. `[Evasive 8 - Direct Contradiction]`: `"He expected every barn cat to love cuddles."` $\rightarrow$ `needs_scaffold` (`DISTRACTOR_MISCONCEPTION`)
