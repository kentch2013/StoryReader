# Project Specification: StoryScout (Grade 2 Reading Comprehension Webapp)

## 1. Overview
StoryScout is a local, lightweight web application designed for a parent and child (Grade 2 level) using a single device (iPhone 14 Plus) communicating with a local Windows PC server.
- Parent scans physical book pages using the iPhone camera.
- The app sends images to Gemini to determine reading chunks, pre-reading lookout prompts, and post-reading questions.
- Child reads the physical book in small chunks.
- Child hears pre-reading questions, reads, and then answers comprehension questions verbally using the browser's built-in Web Speech API (zero external voice API cost).

---

## 2. Tech Stack & Constraints
- **Backend:** Node.js with Express. Minimal dependencies:
  - `@google/genai` (Official Google Gen AI SDK for Gemini)
  - `cors`, `dotenv`, `multer` (for handling multi-image uploads from iPhone)
- **Frontend:** Vanilla HTML5, CSS3, and JavaScript (No React, No Tailwind, zero build step). 
  - Standard CSS custom properties for a child-friendly, modern UI.
  - Native browser `window.speechSynthesis` for Text-to-Speech (TTS).
  - Native browser `webkitSpeechRecognition` for Speech-to-Text (STT).
- **Environment:** Windows PC hosting the server, accessed via HTTPS (via local tunnel or self-signed cert) on iPhone 14 Plus Safari.

---

## 3. Core Architecture & API Endpoints

### Endpoint 1: `POST /api/analyze-book`
- **Input:** Multi-part form data containing an array of image files (book pages in sequence, up to 20 pages per batch).
- **Gemini Processing:**
  - Gemini receives the images in order.
  - Uses `gemini-3.1-flash-lite` (with `gemini-3.5-flash-lite` fallback) with multimodal vision and a strict JSON schema.
- **Output JSON Schema:**
```json
{
  "is_legible": true,
  "error_message": null,
  "book_type": "fiction" | "nonfiction",
  "summary": "Brief 2-sentence summary for context",
  "chunks": [
    {
      "chunk_id": 1,
      "page_range": "Pages 1-3",
      "chunk_type": "scene" | "page",
      "lookout_prompt": "Before you read, watch for what the little bunny imagines doing.",
      "checkin_question": "What does the mother say she will do if the bunny runs away?",
      "question_type": "sequential_recall",
      "target_answer_concept": "She will run after him because he is her little bunny.",
      "keyword_clusters": [
        { "concept_name": "action", "synonyms": ["run after", "chase", "follow"] },
        { "concept_name": "reason", "synonyms": ["little bunny", "her bunny", "loves him"] }
      ],
      "acceptable_phrasings": [
        "She will run after him.",
        "She follows him because he is her little bunny."
      ],
      "canonical_prototypes": [
        { "type": "formal_full", "text": "She will run after him because he is her little bunny." },
        { "type": "colloquial", "text": "She chases him cause she loves her baby." },
        { "type": "minimal_core", "text": "Run after him." },
        { "type": "functional_circumlocution", "text": "The mother chases her child so he does not get lost." },
        { "type": "partial_action", "text": "She will use her feet to run." },
        { "type": "common_distractor", "text": "She will stay at home." }
      ],
      "verbatim_page_text": "If you run away, said his mother, I will run after you. For you are my little bunny.",
      "hint_level_1": "Look at the text at the bottom of the second page.",
      "hint_level_2": "What action does the mother promise to take if he leaves?",
      "scaffold_hint": "Look at the text at the bottom of the second page.",
      "entity_graph": {
        "characters": [
          { "canonical_id": "char_mom", "canonical_name": "mother bunny", "gender": "female", "aliases": ["mom", "mother"], "kinship_compositions": ["mom's mom", "mother's mother"] }
        ],
        "social_relations": [
          { "subject_id": "char_mom", "relation": "mother_of", "target_id": "char_bunny", "aliases": ["his mother"] }
        ],
        "discourse_referents": {
          "she": "mother bunny",
          "her": "mother bunny",
          "he": "little bunny",
          "him": "little bunny"
        }
      }
    }
  ]
}
```

### 3.1. Deterministic CROWD (D-CROWD) Dialogic Reading Framework
To prevent repetitive factual recall while strictly ensuring objective, automated speech grading in Module 3, check-in questions are classified into 5 deterministic CROWD dialogic reading types:
1. `completion_cloze`: Cloze sentence stem or refrain/rhyme completion where the child supplies a 1-2 word minimal core answer.
2. `sequential_recall`: Immediate chronological step or specific tool/instrument recall directly grounded in story facts.
3. `observable_visual`: Verifiable concrete visual detail, character facial expression, or spatial feature in the illustration.
4. `wh_causality`: Motive or causal mechanism answering why or how a character resolved an obstacle (RL.2.3).
5. `distancing_schema`: Universal real-world schema, category, or reality vs. fantasy check connecting story concepts to shared world knowledge.

**Pedagogical Constraints:**
- **Chunk Variety Mandate:** Sequential chunks must rotate question types; consecutive chunks must never use the same `question_type`.
- **Determinism Rule:** Distancing and Observable prompts must NEVER ask open-ended or subjective personal questions about the child's private life ("your room", "your mom") or unbounded scene explorations ("what is happening?"). All answers must be verifiable through story facts, picture details, or universal real-world schemas.

### Endpoint 2: `POST /api/evaluate-answer` (The Zero-Lag Socratic Stack)
- **Input JSON:**
  - *Authentication:* When `AUTH_SECRET` is set in the environment, requests must include `Authorization: Bearer <AUTH_SECRET>`.
  - *Input Safety Gate:* Transcripts pass through a System 1 adversarial input gate intercepting injection attacks prior to semantic evaluation.
```json
{
  "checkin_question": "string (required)",
  "target_answer_concept": "string (required)",
  "keyword_clusters": [
    { "concept_name": "string", "synonyms": ["string"] }
  ],
  "acceptable_phrasings": ["string"],
  "canonical_prototypes": [
    { "type": "string", "text": "string" }
  ],
  "diagnostic_probes": {
    "target_mastery": { "hypothesis": "string", "feedback": "string" },
    "minimal_core": { "hypothesis": "string", "feedback": "string" },
    "superficial_attribute": { "hypothesis": "string", "scaffold": "string" },
    "premise_echo": { "hypothesis": "string", "scaffold": "string" },
    "character_confusion": { "hypothesis": "string", "scaffold": "string" },
    "distractor_misconception": { "hypothesis": "string", "scaffold": "string" }
  },
  "entity_graph": {
    "characters": [],
    "social_relations": [],
    "discourse_referents": {}
  },
  "hint_level_1": "string (optional)",
  "hint_level_2": "string (optional)",
  "scaffold_hint": "string (optional)",
  "child_transcript": "string",
  "attempt_count": 1,
  "microturn_used": false
}
```
- **Execution Architecture (Coarse-to-Fine Semantic Slot Funnel & 4-Layer Latency Stack):**
  0. *Grounding Fidelity Gate (Server-Side, Pre-Delivery):* When pages are analyzed via `POST /api/analyze-book`, each chunk's `verbatim_page_text` is verified against `target_answer_concept` and `checkin_question` via lexical entity overlap and ONNX DeBERTa NLI ($E \ge 0.50, C < 0.25$). Context bounding limits chunks to $\le 3$ pages. Ungrounded entities or factual contradictions trigger automatic review flags.
  1. *Layer 1: Discourse & Relational Resolution & Intelligibility Gate (0ms):* Grounding through chunk `entity_graph` (kinship composition, cross-generational mismatch detection, possessive modifier isolation e.g. `[Character]'s brother`, social relations, pronoun anaphora). Executes 3-tier Hierarchical Ambiguity Cascade (Question Salience $\rightarrow$ Predicate Exclusivity $\rightarrow$ Free Clarification Micro-Turn with `is_microturn: true` without consuming attempt). Screens inquiry questions (`"who made the hat"`), word stutters, and catches shrugs (`"i don't know"`, `""`).
  1.5. *Universal Slot Delta Gate (Near-Miss Repair, <5ms):* If `semantic_slots` are defined, calculates frame-semantic slot overlap. If exactly one slot is conflicted and at least one core slot is matched (`accuracy_degree >= 0.50`), intercepts with generic Socratic Wh-prompts without bespoke book hardcoding (e.g., location: *"Where did that happen?"*, agent: *"Who was the one doing that?"*, action: *"What was the action?"*).
  2. *Layer 2: Parallel Diagnostic Probing & Canonical Prototype Expansion (ONNX Batch, ~25ms):* In a single forward pass via `Xenova/nli-deberta-v3-xsmall`, evaluates parallel hypotheses covering `target_mastery`, `minimal_core`, positive prototypes (`formal_full`, `colloquial`), actor, beneficiary consistency, and attribute consistency. Wh-question grounding strictly forbids non-agent questions from awarding minimal core mastery on character names alone.
  2.5. *Layer 2.5: Zero-Token Decision Arbiter & Cloud Circuit Breaker (Fail-Fast Fallback):* When local NLI scores speech as ambiguous or ungrounded ($0.35 \le E < 0.50$ or unmapped functional circumlocutions $\ge 3$ words), routes to `gemini-decision-1` via `CloudCircuitBreaker`. Evaluates typed `choice` questions across cognitive categories with **0 output tokens billed**. If offline or timeout exceeds $400 - 800\text{ms}$, automatically degrades to local Socratic scaffolding heuristics without child-facing lag.
  3. *Layer 3: Dynamic Argmax & Strict Contradiction Guard:* Enforces target mastery contradiction guard ($C_{target} < 0.35$). Evaluates dynamic argmax across competing error modes (`DISTRACTOR_MISCONCEPTION`, `CHARACTER_CONFUSION`, `SUPERFICIAL_ATTRIBUTE`, `PREMISE_ECHO`, `PARTIAL_ACTION`, `AMBIGUOUS_REFERENT`). Attempts 1 scaffolds strictly follow the **No-Spoiler Pedagogical Rule** (guiding inquiries without leaking the answer noun or action).
  4. *Attempt 2 Auto-Reveal (0ms):* On Attempt 2 failure, cheerful reveal is emitted and `resolved: true` is returned to prevent infinite Socratic loops.
  5. *Pre-Module 4 Latency Optimization Objective:* The pipeline implements a 4-layer latency stack (dynamic token clamping to `max_length: 36`, 2-stage cascaded early-exit probing, native C++ SIMD, and synchronous Tier 1 0ms gate) targeting $\le 35\text{ms}$ mastery and $\le 90\text{ms}$ full error diagnosis.
- **Output JSON Schema:**
```json
{
  "status": "mastered" | "needs_scaffold" | "off_track",
  "spoken_feedback": "Spot on! She will run after him because he is her little bunny.",
  "follow_up_prompt": null,
  "attempt_count": 1,
  "resolved": false,
  "is_microturn": false,
  "microturn_used": false,
  "diagnostics": {
    "tier_resolved": "PARALLEL_DIAGNOSTIC_PROBING" | "SLOT_DELTA_NEAR_MISS_REPAIR",
    "cognitive_diagnosis": "MASTERED" | "NEAR_MISS_REPAIR" | "CHARACTER_CONFUSION" | "DISTRACTOR_MISCONCEPTION" | "SUPERFICIAL_ATTRIBUTE" | "PREMISE_ECHO" | "QUESTION_ECHO" | "PARTIAL_ACTION" | "AMBIGUOUS_REFERENT" | "UNGROUNDED_OFF_TRACK",
    "probe_scores": {},
    "slot_delta": {}
  }
}
```

---

## 4. Step-by-Step User Flow & Screen States

### Screen 1: Scan Mode (Parent & Child Viewfinder)
- **Top Utility Navigation:**
  - 🔊 **Speaker Icon (`#btn-start-audio`):** Unlocks Web Audio and speaks a quick confirmation ("Sound is on!") to verify speaker volume.
  - 📖 **Book Icon (`#btn-open-review`):** Displays current snapped page count; opens the review drawer and questions list.
  - 💾 **3.5in Floppy Disk (`#btn-saved-books`):** Opens saved books and questions library.
- **Continuous Camera Viewfinder:**
  - Full-width camera feed with no vertical clutter or intrusive instruction headers.
  - **4-Button Action Toolbar:** Directly positioned above chapter controls:
    - ↩️ **Retake:** Discards active snapshot frame.
    - 📷 **SNAP (`#btn-shutter`):** Wide central capture button.
    - ✨ **Analyze (`#btn-analyze`):** Triggers Gemini multimodal analysis.
    - 🗑️ **Trash (`#btn-clear`):** Requires two-step confirmation to clear all active sequence pages.
- **Horizontal Page Carousel:**
  - Swipes left and right (CSS scroll-snap) with dot navigation chips.
  - **3 Actions Per Slide:**
    - ↩️ **Retake:** Removes the specific slide page.
    - 🔄 **Rotate:** Rotates the image 90° stationary in place.
    - ❓ **Question:** Greyed out by default (`is-disabled`); automatically ungreys (`is-ready`) once analysis completes.
- **Zero-Screen-Space Summary Modal:**
  - Replaces large analysis summary cards with a compact `[🎉 Story Ready ℹ️]` drawer badge opening an overlay modal dialog on tap.

### Screen 2: Pre-Reading "Lookout" (Child)
- Displays current chunk header (e.g., "📖 Read Pages 1 to 3").
- Displays the **Lookout Prompt** in large, readable, friendly font.
- Automatically speaks the prompt aloud using `window.speechSynthesis` (triggered on a "Start Chunk" tap to satisfy iOS Safari audio policy).
- Prominent button: **"I'm Done Reading!"** which advances to Screen 3.

### Screen 3: Verbal Check-in & Audio Interaction (Child)
- **Synchronous Speech -> Listening Flow:**
  - Tapping the ungreyed `[❓ Question]` button executes `window.speechSynthesis.speak()` synchronously within the touch event stack.
  - Badge displays `🔊 Speaking Question...` while reading strictly the question text (no preambles or question numbers).
  - Only after speech ends (`utterance.onend`) does the app transition to listening mode.
  - If speech is muted or blocked, the status pill offers `🔊 Tap here to speak question aloud`.
  - Tapping question text at any time re-reads the question aloud.
- **Generous Speech Recognition:**
  - Microphone listens with a 3.2s–4.0s pause tolerance so children are not cut off mid-thought.
  - Child can pause between thoughts or tap the microphone button to submit early.
- **Evaluation & Mastery Feedback:**
  - Submits transcript to `/api/evaluate-answer`.
  - If `status == "mastered"`: Triggers celebratory confetti and speaks enthusiastic praise.
  - If `status == "needs_scaffold"`: Speaks the gentle Socratic clue and allows the child to answer again.

---

## 5. System Prompts for Gemini

### Analysis Prompt (`POST /api/analyze-book`):
```text
You are an expert Grade 2 reading specialist. You are analyzing sequential photos of a book read by a 7-8 year old child.
1. Determine if the text is fiction or nonfiction.
2. Group the pages into sensible "reading chunks":
   - If pages have minimal text (like comics or picture books), group 2 to 4 pages into one chunk.
   - If a page has multiple paragraphs, treat each page as its own chunk.
3. For each chunk:
   - Provide a "lookout_prompt": A single sentence telling the child what important clue or feeling to notice while reading.
   - Provide a "checkin_question": A comprehension question focused on Grade 2 skills (cause-and-effect, character feelings, problem/solution, or key details).
   - Provide the "target_answer_concept": The core idea the child must understand.
   - Provide a "scaffold_hint": A gentle hint in case they get stuck.
Return only valid JSON matching the provided schema.
```

### Evaluation Prompt (`POST /api/evaluate-answer`):
```text
You are a warm, encouraging reading buddy for a 2nd grader.
The child was asked: "${checkin_question}"
Target concept: "${target_answer_concept}"
Scaffold hint: "${scaffold_hint}"
The child verbally answered: "${child_transcript}"

Evaluate their answer:
- 2nd graders speak with simple vocabulary and filler words. Judge based on their conceptual grasp, not grammar.
- If they understood the main concept, set status to "mastered" and provide enthusiastic, concise praise.
- If they are partially correct or vague, set status to "needs_scaffold" and provide a warm encouraging nudge using the scaffold hint.
- Keep spoken feedback under 25 words so the child stays engaged.
Return only valid JSON matching the provided schema.
```

---

## 6. Project Directory Structure
```text
storyscout/
├── .env                  # GEMINI_API_KEY, PORT=3000
├── package.json
├── server.js             # Express server, multer setup, Gemini SDK calls
├── public/
│   ├── index.html        # Single-page UI with screen transitions
│   ├── style.css         # Clean, responsive, kid-friendly CSS
│   └── app.js            # Audio recording, TTS, STT, and UI orchestration
└── README.md             # Instructions to run and access on iPhone
```
