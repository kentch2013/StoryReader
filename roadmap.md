# StoryScout: Roadmap to Completion

**Execution Methodology:** Every module is built and validated in an immutable 4-step progression before advancing:
1. **Pipeline Extension:** Author domain-specific module code and interfaces.
2. **Code Verification:** Automated unit/integration tests with deterministic assertions.
3. **Digital Samples & Harness:** Automated test scripts running against synthetic/digital fixture data.
4. **Human Verification:** Structured manual test protocol on hardware (Windows host + iPhone 14 Plus Safari).

---

## Module Matrix Overview

| Module | Scope | Core Deliverables | Automated Test Gate | Human Test Gate |
|---|---|---|---|---|
| **M1** | Server Foundation | `server.js`, `.env` loader, CORS, `/api/health` | HTTP 200, CORS headers, error middleware | Verify `/api/health` in desktop & mobile browser |
| **M2** | Book Analysis Engine | `services/gemini_service.js`, `prompts/book_analysis.js`, `routes/book_routes.js` (`POST /api/analyze-book`) | Schema parsing, unreadable photo handling, multipart limits | Run CLI harness with 3 sample book pages, verify Grade 2 chunking |
| **M3** | Answer Evaluation Engine (Zero-Lag Stack) | `services/answer_evaluator.js`, `services/transcript_sanitizer.js`, `services/rubric_matcher.js`, `services/feedback_synthesizer.js`, `routes/book_routes.js` (`POST /api/evaluate-answer`) | Score contracts (`mastered`, `needs_scaffold`, `off_track`), word count cap $\le 25$, shrug fast-path | Test edge-case transcripts (mumblings, fillers, out-of-vocab, shrugs) |
| **M4** | Camera & Canvas Tray | `public/js/camera_tray.js`, thumbnail tray, canvas downscaler | Resolution capping ($\le 1600\text{px}$), payload compression ($\le 300\text{KB}$/page) | iPhone 14 Plus camera capture: snap 3 pages, verify tray order and sharpness |
| **M5** | Safari Audio Coordinator | `public/js/audio_manager.js`, gesture unlock, TTS synthesizer, STT Push-to-Talk | Audio state lockouts, collision safety (`speechSynthesis.cancel()` before mic) | iPhone 14 Plus Safari: speak sentence, check for no silence cutoff and clean audio output |
| **M6** | Full SPA Orchestration | `public/index.html`, `public/style.css`, `public/js/app.js`, Cloudflare Tunnel runbook | FSM state transitions, attempt limit counter ($\le 2$), chunk progression | Full parent-child reading test with physical book over HTTPS tunnel |

---

## Detailed Module Breakdown

### Module 1: Server Foundation & Health Gateway
* **1. Pipeline Extension:**
  - Initialize `package.json` with `@google/genai`, `express`, `cors`, `dotenv`, `multer`.
  - Implement `server.js` with structured logging, CORS for tunnel origins, and JSON error handling.
  - Mount `/api/health`.
* **2. Code Verification:**
  - Automated integration test (`test/health.test.js`) verifying:
    - `GET /api/health` returns status `200` and `{ status: "ok", timestamp: ... }`.
    - Unhandled routes return structured JSON `404`.
* **3. Digital Samples:**
  - Automated curl / HTTP test script validating origin reflection and header propagation.
* **4. Human Verification:**
  - Boot server locally (`npm start`). Visit `http://localhost:3000/api/health` and verify clean JSON response.

---

### Module 2: Multimodal Book Analysis Engine
* **1. Pipeline Extension:**
  - Implement `services/gemini_service.js` with `GoogleGenAI` initialization targeting `gemini-3.1-flash` (or `gemini-3.5-flash` / `gemma4`).
  - Implement `prompts/book_analysis.js` with Grade 2 Common Core reading standards and strict JSON schema.
  - Implement `routes/book_routes.js` with `multer` memory storage handling `POST /api/analyze-book`.
  - Add `is_legible` safety valves returning HTTP `422` on blurry/blank images.
  - **Adversarial Hardening:** Strict MIME type validation (JPEG/PNG/WebP), Multer HTTP 413/400 error status mapping, `safeJsonParse` markdown stripping, and RateLimiter mutex queue serialization.
* **2. Code Verification:**
  - Unit tests with mocked Gemini responses validating schema parsing, fallback model switching, and 422 error trapping on corrupt images (`test/analyze_book.test.js`).
  - Boundary and adversarial torture suite (`test/hardening_m1_m2.test.js`): 413 oversized file trapping, 400 file overflow trapping, 400 invalid field name trapping, 400 invalid MIME rejection, and safe JSON extraction.
* **3. Digital Samples:**
  - Fixture directory `test/fixtures/book_pages/` containing:
    - 3 synthetic Grade 2 reading book pages (mixture of fiction and nonfiction).
    - 1 intentionally blurred/corrupt sample page.
  - Execution script `scripts/test_analyze_book.js` sending fixtures to API and asserting:
    - Fiction/nonfiction classification is accurate.
    - Chunks contain non-empty `lookout_prompt`, `checkin_question`, `target_answer_concept`, `scaffold_hint`.
    - Blurred page triggers `is_legible: false`.
  - Adversarial fuzz torture runner `scripts/test_adversarial_fuzz.js` asserting all 7 boundary failure modes pass.
* **4. Human Verification:**
  - Review generated questions and lookout prompts against the physical sample text to confirm Grade 2 pedagogical quality.

---

### Module 3: Socratic Answer Evaluation Engine (Completed & Verified)
* **1. Pipeline Extension:**
  - Implemented Coarse-to-Fine Semantic Slot Diagnostic Funnel:
    - Layer 1: Grounding & Intelligibility Filter (Inquiry detector, stutter detector, shrug fast-path).
    - Layer 2: Single-pass ONNX Cross-Encoder NLI (`nli-deberta-v3-xsmall`) evaluating 8 parallel slot consistency hypotheses.
    - Layer 3: Cognitive Resolution & Socratic Scaffolding Gate with forward-only causality for mastery.
  - Mounted `POST /api/evaluate-answer` in `routes/book_routes.js` with sub-30ms execution.
* **2. Code Verification:**
  - Comprehensive 45-test suite passing across all 9 test suites (`test/health.test.js`, `test/analyze_book.test.js`, `test/hardening_m1_m2.test.js`, `test/evaluate_answer.test.js`, `test/zero_lag_deterministic_fastpath.test.js`, `test/zero_lag_tier1.test.js`, `test/zero_lag_tier2.test.js`, `test/parallel_diagnostic_probing.test.js`, `test/coarse_to_fine_diagnostic_funnel.test.js`). Contract audit: 100% immutable.
* **3. Digital Samples:**
  - Synthetic transcript benchmarks (`scripts/test_evaluate_sample.js`) verifying latencies between 2ms and 40ms.
* **4. Human Verification:**
  - Streamlined REPL (`scripts/interactive_eval_test.js`) and `launch_test_environment.bat` ready for rigorous human QA testing across all 6 cognitive error modes.

---

### Module 4: Mobile Camera Tray & Canvas Compression Engine
* **1. Pipeline Extension:**
  - Implement `public/js/camera_tray.js`:
    - Handles `<input type="file" accept="image/*">` single-shot capture.
    - Renders an interactive page tray filmstrip with thumbnails, page tags (`Page 1`, `Page 2`), re-order handles, and delete buttons.
    - In-browser HTML5 `<canvas>` downsampling algorithm: constrains max dimension to $1600\text{px}$, exports `image/jpeg` at 0.8 quality.
    - Generates multi-part `FormData` payload for backend submission.
* **2. Code Verification:**
  - Browser/DOM harness test verifying canvas compression:
    - Asserts $4032 \times 3024$ (12MP) test canvas is downscaled to $\le 1600 \times 1200$.
    - Asserts output blob size $\le 300\text{KB}$.
    - Verifies tray array state mutations (add, remove, reorder).
* **3. Digital Samples:**
  - Standalone harness page `public/test_camera.html` allowing upload of high-res test images and measuring compression ratio and duration.
* **4. Human Verification:**
  - Open harness on iPhone 14 Plus. Take 3 real photos of book pages.
  - Verify camera returns immediately after each shot without crashing Safari.
  - Verify thumbnail tray accurately shows all 3 pages with delete/retake controls.

---

### Module 5: Safari Audio Coordinator (TTS & STT)
* **1. Pipeline Extension:**
  - Implement `public/js/audio_manager.js`:
    - **Audio Unlock:** Fires a zero-volume Web Audio buffer on initial user gesture to unlock Safari audio playback.
    - **TTS Manager:** `window.speechSynthesis` wrapper with voice resolution (selecting natural English voice), rate control (0.9x for Grade 2 clarity), and error recovery.
    - **STT Push-to-Talk Manager:** `webkitSpeechRecognition` wrapper with `interimResults = true`, manual start/stop, and silence protection.
    - **Collision Barrier:** Automatically invokes `window.speechSynthesis.cancel()` before enabling the microphone.
* **2. Code Verification:**
  - State machine tests validating mutual exclusivity between listening and speaking states.
* **3. Digital Samples:**
  - Audio harness page `public/test_audio.html` testing:
    - Sequential speech triggers without audio lockup.
    - Live transcript rendering in DOM element.
* **4. Human Verification:**
  - Test on iPhone 14 Plus Safari:
    - Tap "Test TTS": Hear prompt clearly at 0.9x speed.
    - Tap "Hold to Speak": Speak test phrase ("Leo lost his favorite hat"). Verify transcript displays accurately in speech bubble without premature cutoff.

---

### Module 6: Full SPA Orchestration & End-to-End Reading Flow
* **1. Pipeline Extension:**
  - Implement `public/index.html` and `public/style.css` (accessible Grade 2 design, large touch targets $\ge 56\text{px}$, readable typography).
  - Implement `public/js/app.js` managing the Finite State Machine:
    `STATE_SCAN` $\rightarrow$ `STATE_ANALYZING` $\rightarrow$ `STATE_LOOKOUT` $\rightarrow$ `STATE_CHECKIN` $\rightarrow$ `STATE_FEEDBACK` $\rightarrow$ `STATE_COMPLETE`.
  - Integrate attempt counter (max 2 attempts before gentle resolution).
  - Add celebration animations (CSS confetti / stars) on mastery.
  - Add Cloudflare Tunnel startup scripts (`npm run tunnel`).
* **2. Code Verification:**
  - End-to-end integration test (`test/e2e_flow.test.js`) simulating the complete lifecycle with mocked AI endpoints.
* **3. Digital Samples:**
  - Scripted session runner replaying a multi-chunk storybook session from fixture data.
* **4. Human Verification:**
  - Launch server + Cloudflare Tunnel.
  - Open tunnel URL on iPhone 14 Plus Safari.
  - Conduct live co-reading session with a physical Grade 2 book (4–6 pages):
    - Parent snaps pages $\rightarrow$ child listens to lookout prompt $\rightarrow$ child reads book $\rightarrow$ child speaks answer $\rightarrow$ child hears feedback $\rightarrow$ next chunk.
