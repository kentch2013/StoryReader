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
| **M3** | Answer Evaluation Engine (Zero-Lag Stack) | `services/answer_evaluator.js`, `services/semantic_evaluator.js`, `services/discourse_resolver.js`, `services/rubric_matcher.js` | 60/60 tests passing, 19/19 decision benchmark passing, dynamic argmax & circumlocutions | Terminal REPL testing edge-case phrases and circumlocutions |
| **M3.5** | Latency Optimization & Cross-Story Eval (Completed) | Dynamic batch padding, 2-stage cascaded probing, bidirectional character confusion, story-agnostic sanitization | Sub-35ms mastery benchmark, sub-70ms full diagnosis, 19/19 decision benchmark, 18/18 cross-story benchmark | Terminal REPL testing latency & multi-story chunks with zero subjective grading |
| **M3.6** | Grounding Fidelity Gate (Completed) | `services/grounding_verifier.js`, `verbatim_page_text` transcription, context bounding ($\le 3$ pages), lexical entity overlap, ONNX NLI premise-entailment pass | 68/68 tests passing, 4/4 grounding contract tests, automated rejection of ungrounded entities & contradictions | Scripted verification of factual entailment vs hallucinations |
| **Bench** | Rattles Real Pipeline Validation (Completed) | `prompts/book_analysis.js`, `services/discourse_resolver.js`, `services/semantic_evaluator.js`, `services/slot_delta_engine.js` | Q3 Trial: 10/10 passing (100%), Q4 Trial: 10/10 passing (100%), 68/68 regression tests | Live Gemini API + local ONNX evaluation with zero runtime LLM calls during speech |
| **M4** | Camera & Canvas Tray (NEXT ACTIVE GATE) | `public/js/camera_tray.js`, thumbnail tray, canvas downscaler | Resolution capping ($\le 1600\text{px}$), payload compression ($\le 300\text{KB}$/page) | iPhone 14 Plus camera capture: snap 3 pages, verify tray order and sharpness |
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
    - Layer 1: Grounding, Relational Resolution & Intelligibility Filter (`services/discourse_resolver.js` dynamic kinship composition, social graphs, pronoun anaphora, cross-generational mismatch detection, 3-tier Hierarchical Ambiguity Cascade with Free Clarification Micro-Turn, inquiry detector, stutter detector, shrug fast-path).
    - Layer 2: Single-pass ONNX Cross-Encoder NLI (`nli-deberta-v3-xsmall`) evaluating parallel slot consistency hypotheses with bound possessive beneficiary attribution.
    - Layer 3: Dynamic Vector Argmax & Cognitive Resolution Gate with strict forward-only causality for mastery, minimal core, partial actions, and functional circumlocutions; bidirectional correlation strictly bounded to descriptive scaffolds.
    - Robust circumlocution support: Dual-hypothesis probing (`core_entity` + `atomic_entity`) allows multi-word actions (*"the lady who puts water on the flowers so they grow"*) to achieve forward entailment ($E = 0.605, C = 0.002$) against core targets.
    - Gemini probe extraction sanitization (`services/gemini_service.js#sanitizeAnalysisProbes`) eliminates meta-cognitive prefix contamination (`"Child understands..."`).
* **2. Code Verification:**
  - Full 60-test suite passing across all 12 test suites (`npm test`): 60/60 tests passing (100%).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - 19-Case Decision Model Benchmark (`scripts/benchmark_decision_models.js`): **19/19 PASS (100%)** across *The Runaway Bunny* live chunks and Leo's Hat slot controls.
  - 50-Response Rigorous Evaluation Benchmark (`scripts/test_50_eval_cases.js`): **50/50 PASS (100%)**.
* **4. Human Verification:**
  - Verified edge-case circumlocutions and distractor collision cases without letter grading; empirical NLI output table documented in `SESSION_LOG.md`.

---

### Module 3.5: Dynamic Batch Latency Optimization & Cross-Story Pipeline (Completed & Verified)
* **1. Pipeline Extension:**
  - **Dynamic Batch-Adaptive Padding:** Implemented `tokenizeDynamicBatch` in `services/semantic_evaluator.js`. Replaces static `max_length: 64` and eliminates padding bloat while avoiding arbitrary token clamping (`max_length: 36`), guaranteeing 0% truncation on compound child utterances.
  - **Two-Stage Speculative Cascaded Probing:** Implemented Stage 1 positive sweep + slot consistency anchors (6 pairs, ~35ms) with speculative early-exit threshold ($E \ge 0.50, C < 0.20$); fallback to Stage 2 (8 diagnostic error probes, ~68ms) and Dynamic Argmax arbitration on non-mastery/collisions.
  - **Bidirectional Character Confusion:** Evaluates $\max(E_{fwd}, E_{rev})$ for character confusion, resolving simplified child utterances (e.g. *"the nurse leaves flowers"*) without compromising contradiction integrity ($C = 0.998$).
  - **Dynamic Propositional Synonym Framing:** Single-noun synonyms evaluate as neutral against noun phrases in DeBERTa NLI; framing dynamically as `"It was <synonym>."` yields 98.3% entailment.
  - **Story-Agnostic Sanitization:** Eliminated residual hardcoded fallback literals (`|| 'grandma'`, `|| 'Leo'`) in `services/semantic_evaluator.js` and `services/discourse_resolver.js`.
* **2. Code Verification:**
  - Full 60-test regression suite passing with 100% test contract immutability (`npm test`).
  - Contract audit: `node scripts/audit-contract.js` confirms 100% immutability.
* **3. Digital Samples:**
  - Re-run `scripts/benchmark_decision_models.js`:
    - 19/19 cases passing (100%).
    - Stage 1 mastery latency: **30–35ms** (79.8% reduction from 173ms).
    - Stage 2 full error diagnosis: **56–68ms** (61.6% reduction from 177ms).
  - Cross-Story Evaluation Suite (`scripts/test_cross_story_eval.js`):
    - **18/18 cases passing (100%)** across *The Runaway Bunny* (4 chunks) and *Dog Man: A Tale of Two Kitties* (2 camera scan chunks).
* **4. Human Verification:**
  - Verified edge cases across multiple stories with zero perceptible latency and zero story-specific hardcoding.

---

### Module 3.6: Grounding Fidelity Gate & Transcription Verification (Completed & Verified)
* **1. Pipeline Extension:**
  - Author `services/grounding_verifier.js` containing `verifyGroundingFidelity`, `checkLexicalEntityOverlap`, and `checkNliEntailment`.
  - Add required `verbatim_page_text` field to `BOOK_ANALYSIS_SCHEMA` and `BOOK_ANALYSIS_SYSTEM_PROMPT` in `prompts/book_analysis.js`.
  - Enforce context bounding ceiling ($\le 3$ pages per chunk).
  - Expand `sanitizeAnalysisProbes` in `services/gemini_service.js` to strip cognitive prefixes (`believes`, `thinks`, `recalls`) and leading interrogatives.
  - Wire `verifyGroundingFidelity` into `services/gemini_service.js` across generated chunks.
* **2. Code Verification:**
  - Immutable test specification contract `test/grounding_verifier.test.js` validating:
    - Entailment pass for factual target concepts grounded in verbatim text.
    - Automated rejection (`UNGROUNDED_ENTITY`) for hallucinated actors/entities.
    - Automated rejection (`FACTUAL_CONTRADICTION_OR_UNENTAILED`) for factual contradictions.
    - Automated rejection (`CONTEXT_BOUNDING_EXCEEDED`) when chunk span exceeds 3 pages.
* **3. Digital Samples:**
  - Synthetic test chunks based on *The Runaway Bunny* validated with 100% test immutability audit pass.
* **4. Human Verification:**
  - Zero-subjectivity automated grounding audit verified locally.

---

### Module 4: Mobile Camera Tray & Canvas Compression Engine (NEXT IMMEDIATE OBJECTIVE)
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
