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
- **Input:** Multi-part form data containing an array of image files (book pages in sequence).
- **Gemini Processing:**
  - Gemini receives the images in order.
  - Uses `gemini-2.5-flash` with multimodal vision and a strict JSON schema.
- **Output JSON Schema:**
```json
{
  "book_type": "fiction" | "nonfiction",
  "summary": "Brief 2-sentence summary for context",
  "chunks": [
    {
      "chunk_id": 1,
      "page_range": "Pages 1-3",
      "chunk_type": "scene" | "page",
      "lookout_prompt": "Before you read, keep an eye out for how Leo feels when he loses his hat.",
      "checkin_question": "Why did Leo get upset when his hat blew away?",
      "target_answer_concept": "He was upset because his grandmother made it for him and it was special.",
      "scaffold_hint": "Think about who gave Leo that hat!"
    }
  ]
}
```

### Endpoint 2: `POST /api/evaluate-answer`
- **Input JSON:**
```json
{
  "checkin_question": "string",
  "target_answer_concept": "string",
  "scaffold_hint": "string",
  "child_transcript": "string"
}
```
- **Gemini Processing:**
  - Evaluates the child's spoken answer against the target concept.
  - Generates warm, conversational Grade 2 feedback.
- **Output JSON Schema:**
```json
{
  "status": "mastered" | "needs_scaffold" | "off_track",
  "spoken_feedback": "Spot on! He loved that hat because his grandma made it.",
  "follow_up_prompt": null | "You're so close! Who gave Leo the hat?"
}
```

---

## 4. Step-by-Step User Flow & Screen States

### Screen 1: Scan Mode (Parent)
- A clean camera capture interface: `<input type="file" accept="image/*" capture="environment" multiple>`.
- Displays a thumbnail grid of captured pages with page numbers so the parent can verify they are in order.
- A prominent button: **"Ready to Read!"**
- Uploads images to `/api/analyze-book` and displays a child-friendly loading spinner ("Reading the book...").

### Screen 2: Pre-Reading "Lookout" (Child)
- Displays current chunk header (e.g., "📖 Read Pages 1 to 3").
- Displays the **Lookout Prompt** in large, readable, friendly font.
- Automatically speaks the prompt aloud using `window.speechSynthesis` (triggered on a "Start Chunk" tap to satisfy iOS Safari audio policy).
- Prominent button: **"I'm Done Reading!"** which advances to Screen 3.

### Screen 3: Verbal Check-in (Child)
- Displays the **Check-in Question** and reads it aloud.
- Large, colorful **Push-to-Talk / Tap-to-Talk Microphone Button**:
  - Tapping starts `webkitSpeechRecognition`.
  - Visual pulse animation while listening.
  - Child speaks their answer.
  - Tapping again (or pausing) stops recognition and displays what the app heard in friendly text.
- App sends transcript to `/api/evaluate-answer`.
- The app speaks the `spoken_feedback` aloud.
  - If `status == "mastered"`: Plays a cheerful sound effect, shows confetti/stars, and displays **"Next Pages"** button.
  - If `status == "needs_scaffold"`: Speaks the gentle hint and prompts the child to try once more.

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
