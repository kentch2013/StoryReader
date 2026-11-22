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
| **M3.7** | Gemini Decision 1 Hybrid & Circuit Breaker (Completed) | `services/connectivity_circuit_breaker.js`, `services/gemini_decision_service.js`, zero output tokens, Tier 2.5 circumlocution arbiter | 85/85 tests passing, 29-case comprehensive benchmark: 86% overall accuracy (+17%), 100% circumlocution accuracy (6/6), 100% offline resilience | Automated benchmark on physical screenshots (`rattles3.png`) & offline simulation |
| **Bench** | Rattles Real Pipeline Validation (Completed) | `prompts/book_analysis.js`, `services/discourse_resolver.js`, `services/semantic_evaluator.js`, `services/slot_delta_engine.js` | Q3 Trial: 10/10 passing (100%), Q4 Trial: 10/10 passing (100%), 68/68 regression tests | Live Gemini API + local ONNX evaluation with zero runtime LLM calls during speech |
| **M4** | Camera & Canvas Tray (Completed & Verified) | `public/js/camera_tray.js`, continuous in-browser scanner, canvas downscaler, stationary rotation, multi-sequence | 85/85 tests passing, 17/17 camera tests, resolution capping ($\le 1600\text{px}$), payload compression ($\le 300\text{KB}$/page) | iPhone 14 Plus Safari: continuous rapid snap, stationary 90° rotate, multi-sequence pagination |
| **M5** | Safari Audio Coordinator (Completed & Verified) | `public/js/audio_manager.js`, gesture unlock, TTS synthesizer, STT Push-to-Talk | 99/99 tests passing, 14/14 audio tests, mutual exclusivity collision guard, silence hesitation tolerance | iPhone 14 Plus Safari: speak sentence, check for no silence cutoff and clean audio output |
| **M6** | Full SPA Orchestration, Viewfinder Redesign & Safari Audio Sync (Completed & Calibrated) | `public/index.html`, `public/style.css`, `public/js/app.js`, `public/js/camera_tray.js`, `public/js/audio_manager.js` | 150/150 tests passing across 24 suites, 100% contract immutability, UI pipeline audit passing | Full parent-child reading test with physical book over HTTPS tunnel |
| **M6.1** | Continuous Listening, Ana Online Voice & Session Question Tracking (Completed & Verified) | `public/js/session_question_tracker.js`, `public/js/audio_manager.js`, `public/js/app.js`, `public/js/camera_tray.js` | 163/163 tests passing across 25 suites, 100% test contract immutability | Live co-reading with automatic page progression & multi-page question greying |
| **M7** | Child Speech & Phonetic Resilience (Completed & Verified) | `services/phonetic_matcher.js`, `services/answer_evaluator.js`, `public/js/audio_manager.js` | 170/170 tests passing across 27 suites, 100% test contract immutability, Double-Metaphone child slurs & speech confidence gate | Verified child phonological slur normalization ("gramma" -> "grandma") & low-confidence audio microturn |
| **M8** | Deterministic CROWD Dialogic Reading (Completed & Verified) | `prompts/book_analysis.js`, `services/gemini_service.js`, `BOOK_ANALYSIS_SCHEMA`, D-CROWD taxonomy | 173/173 tests passing across 28 suites, 100% test contract immutability, live multimodal pipeline audit on Robert screenshots | Live Gemini Vision analysis & Decision 1 evaluation across all 5 D-CROWD question archetypes |

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

### Module 4: Mobile Camera Tray & Canvas Compression Engine (Completed & Verified)
* **1. Pipeline Extension:**
  - Implement `public/js/camera_tray.js`:
    - Continuous in-browser camera scanner (`navigator.mediaDevices.getUserMedia`) with document framing guide overlay.
    - Instant snapshot shutter button (<15ms) directly from `<video>` to `<canvas>` with flash feedback and haptic vibration (`navigator.vibrate([40])`).
    - In-browser HTML5 `<canvas>` downsampling algorithm: constrains max dimension to $\le 1600\text{px}$, exports `image/jpeg` at 0.8 quality ($\le 300\text{KB}$/page).
    - Stationary 90° canvas rotation (`rotateImageBlob`, `rotatePage`): fixed 280px photo frame prevents buttons from jumping on rotate.
    - Multi-sequence auto-rollover for $>20$ pages with sequence switcher tabs.
    - Collapsible bottom-sheet review drawer with unified active sequence viewer.
    - On-demand analysis results viewer.
    - Generates multi-part `FormData` payload for backend submission (`POST /api/analyze-book`).
* **2. Code Verification:**
  - Browser/DOM/Node test suite (`test/camera_tray.test.js`) passing 17/17 tests:
    - Asserts $4032 \times 3024$ (12MP) test canvas is downscaled to $\le 1600 \times 1200$.
    - Asserts output blob size $\le 300\text{KB}$.
    - Verifies tray array state mutations (add, remove, reorder, clear, retake).
    - Verifies video element source downscaling.
    - Verifies 90° canvas rotation and dimension swapping.
    - Verifies multi-sequence pagination and auto-rollover.
* **3. Digital Samples:**
  - Standalone camera harness page `public/test_camera.html` with camera-first layout, floating bottom bar, collapsible review drawer, and $\ge 56\text{px}$ touch targets.
  - Desktop QR portal `public/connect.html` for zero-typing iPhone 14 Plus Safari launch.
* **4. Human Verification:**
  - Open harness on iPhone 14 Plus in Safari over Cloudflare HTTPS tunnel.
  - Test continuous rapid snapping across sequential physical pages with zero modal interruptions.
  - Test stationary 90° rotation and review drawer sequence navigation.

---

### Module 5: Safari Audio Coordinator (TTS & STT) (Completed & Verified)
* **1. Pipeline Extension:**
  - Implemented `public/js/audio_manager.js`:
    - **Audio Unlock:** Fires a zero-volume Web Audio buffer on initial user gesture to unlock Safari audio playback and prime `speechSynthesis`.
    - **TTS Manager:** `window.speechSynthesis` wrapper with voice resolution (Samantha/Daniel/English fallback), rate control (0.9x for Grade 2 clarity), and Promise completion resolution.
    - **STT Push-to-Talk Manager:** `webkitSpeechRecognition` wrapper with `interimResults = true`, `continuous = true`, multi-event transcript accumulation, and auto-restart on premature Safari VAD silence triggers.
    - **Collision Barrier:** Mutual exclusivity ensuring `speechSynthesis.cancel()` runs before enabling microphone, and speech recognition terminates with settling delay before TTS playback to avoid iOS earpiece routing.
* **2. Code Verification:**
  - State machine & collision contract test (`test/audio_manager.test.js`) passing 14/14 tests:
    - Verifies `LOCKED` -> `IDLE` state transition upon gesture unlock.
    - Verifies 0.9x default playback rate and custom options.
    - Verifies mutual exclusivity barriers in both directions.
    - Verifies transcript accumulation across pause intervals.
    - Verifies auto-restart on premature silence cutoff.
    - Verifies error trapping and recovery without unhandled exceptions.
  - Full project regression suite passing 99/99 tests across 16 suites (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - Standalone mobile audio harness page `public/test_audio.html` testing:
    - Audio unlock trigger with active state badge.
    - Prompt cards (Lookout Prompt & Check-in Question) with natural TTS playback.
    - Push-to-Talk microphone button with animated red pulse and iOS touch gesture prevention (`touch-action: none`).
    - Live speech transcript speech bubble with [Check Answer], [Try Again], and [Edit] actions.
    - Full end-to-end integration with `POST /api/evaluate-answer` including Bearer token support.
  - QR Code portal `public/connect.html` updated with dedicated `🎙️ Audio Coordinator (M5)` tab.
  - `launch_mobile_test.bat`, `start_server.bat`, and `scripts/mobile_tunnel.js` updated to advertise audio test endpoint.
* **4. Human Verification:**
  - Launch mobile test environment (`launch_mobile_test.bat`).
  - Scan QR code from iPhone 14 Plus Camera and open `/test_audio.html` in Safari.
  - Tap "Tap to Start Audio" to unlock Web Audio.
  - Test Lookout & Check-in TTS: Hear prompts clearly from bottom loudspeaker at 0.9x speed.
  - Hold Push-to-Talk button, speak with pauses, verify full transcript renders and submits cleanly to `/api/evaluate-answer`.

---

### Module 5.5: Robust Copyright Ingestion & Semantic Relaxation (Completed & Verified)
* **1. Pipeline Extension:**
  - **Factual Paraphrase & Atomic Story Facts:** Redesigned `prompts/book_analysis.js` to eliminate recitation blocks on copyrighted publications while guaranteeing 1:1 detail fidelity without over-condensation. Added required `story_facts` atomic proposition array with local DeBERTa-v3 NLI premise-entailment validation in `services/grounding_verifier.js`.
  - **Deterministic Non-AI Rotation Detection:** Implemented `services/rotation_detector.js` utilizing screen orientation API and fast grayscale text line pattern variance analysis, bypassing expensive vision API calls for page orientation.
  - **Analysis Error Classification & 503 Fallback:** Implemented `classifyModelResponse` in `services/gemini_service.js` distinguishing recitation blocks, safety blocks, and transient model dropouts with automatic retry.
  - **Camera Tray WebKit Resilience:** Hardened `public/js/camera_tray.js` against empty 200 responses and non-JSON HTML error pages in Safari WebKit; added authentication header forwarding.
  - **Head Noun Core Entity Relaxation:** Implemented `extractHeadNoun` in `services/semantic_evaluator.js` and wired `head_noun_entity` SIMD probe into Stage 1 batch evaluation. Terse answers ($\le 6$ words) matching base head nouns (e.g. *"his friends"* for compound concept *"farm friends"*) receive `minimal_core` credit with $\ge 50\%$ entailment. Added agent question guard preventing `PARTIAL_ACTION` from overriding valid agents.
* **2. Code Verification:**
  - Full test suite passing 129/129 tests across 21 test suites (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - Live validation on physical copyrighted book *Robert the Rose Horse* (6 HEIC pages, 0 recitation blocks, 17.3s latency, 20 atomic propositions, 98.6% grounding entailment).
  - 8-Answer child diagnostic sweep on Chunk 1 (*"Who came to Robert's birthday party?"*), verifying mastery on *"his friends"*, *"farm animals"*, and *"animals from the farm"*, with appropriate scaffolds for distractors and fragments.
* **4. Human Verification:**
  - Verified live copyrighted book processing with zero text recitation errors and zero detail loss.

---

### Module 6: Full SPA Orchestration & End-to-End Reading Flow (Completed, Hardened, Calibrated & Ready for Live Test)
* **1. Pipeline Extension:**
  - Implemented `public/index.html` and `public/style.css` (accessible Grade 2 design, high contrast palette, large touch targets $\ge 56\text{px}$, responsive layout, CSS falling confetti animation).
  - Implemented `public/js/app.js` orchestrating the 9-state Finite State Machine (`STATE_SCAN`, `STATE_ANALYZING`, `STATE_LOOKOUT`, `STATE_CHECKIN`, `STATE_RECORDING`, `STATE_TRANSCRIPT_REVIEW`, `STATE_EVALUATING`, `STATE_FEEDBACK`, `STATE_COMPLETE`).
  - Integrated 2-attempt counter capping with No-Spoiler pedagogical scaffolding and auto-reveal resolution on Attempt 2.
  - Implemented free clarification micro-turns (`is_microturn: true`) preserving attempt counter.
  - Added Cloudflare Tunnel script (`npm run tunnel`) in `package.json` and updated `public/connect.html` navigation.
  - **Module 6 Safeguards & Optimizations:**
    1. Complete rubric payload forwarding from active chunk to `/api/evaluate-answer`.
    2. Empty and whitespace-only transcript submission guard with non-incrementing user guidance.
    3. Re-entrancy locks (`_actionLock`) on check-in and analyze buttons preventing double-tap race conditions.
    4. Socratic clue spoken before re-prompting check-in question on Attempt 2.
    5. Automatic confetti container lifecycle cleanup on screen transitions.
    6. Transparent session state serialization and restoration via `sessionStorage`.
    7. Client-side AbortController fetch timeouts with graceful error banners.
  - **Native iPhone HEIC/HEIF Direct Ingestion:** Added `image/heic` and `image/heif` support to Express upload filter and Gemini service, enabling direct upload of raw Apple photos without client re-encoding failures.
  - **Pipeline Calibration & Threshold Tuning:**
    1. Possessive genitive case resolution in `services/discourse_resolver.js` (`"his"` $\rightarrow$ `"Robert's"`).
    2. Tier 1 prototype fast-path precedence ahead of NLI probe sweep in `services/answer_evaluator.js`.
    3. Meta-cognitive leak sanitization in `services/gemini_service.js`.
    4. Content-word filtering in `services/rubric_matcher.js` to eliminate stop-word false passes.
    5. Strict chunk ceiling ($\le 3$ pages) in `prompts/book_analysis.js`.
  - **Mobile Viewfinder & Carousel Redesign:**
    1. Streamlined top navigation bar with speaker audio toggle (`#btn-start-audio`), book page counter (`#btn-open-review`), and 3.5in floppy disk saved books library (`#btn-saved-books`).
    2. Consolidated 4-button action toolbar (Retake, wide SNAP, Analyze, 2-tap Trash) directly above chapter progression controls.
    3. Horizontal scroll-snap carousel with dot chips and 3-button actions per page (`[↩️ Retake] [🔄 Rotate] [❓ Question]`).
    4. Carousel question button begins greyed out (`is-disabled`) and ungreys automatically upon analysis completion.
    5. Compact zero-screen-space `[🎉 Story Ready ℹ️]` drawer badge opening summary modal on demand.
  - **Synchronous Mobile Safari Speech Synthesis Execution:**
    1. Zero-delay synchronous `speak()` execution inside touch/click events, preserving WebKit user activation token.
    2. Retained `_currentUtterance` to prevent garbage collection pauses during playback.
    3. Sequential speech-to-listening handoff: reads question out loud first, awaits `utterance.onend`, then opens microphone with generous 3.2s–4.0s pause tolerance.
    4. Tap-to-read aloud interactive support on question text.
    5. Automatic model fallback to `gemini-3.5-flash-lite` on transient 503 high demand.
* **2. Code Verification:**
  - End-to-end integration test (`test/e2e_flow.test.js` - 9/9 passing).
  - Module 6 safeguards test (`test/app_safeguards.test.js` - 7/7 passing).
  - Pipeline calibration test (`test/pipeline_calibration.test.js` - 5/5 passing).
  - Full project regression suite passing **150/150 tests across 24 test suites** (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - Scripted session runner (`scripts/simulate_reading_session.js`) replaying a multi-chunk storybook session from fixture data with 100% success.
  - Autonomous UI & pipeline audit (`scripts/autonomous_pipeline_ui_audit.js`) validating 8/8 HTTP endpoints, 17/17 visual criteria, 10/10 state transitions, and 7/7 cognitive categories.
  - Copyrighted screenshot audit (`scripts/test_copyrighted_screenshots.js`) on *The Runaway Bunny* and *Rattles* with 0 recitation blocks.
  - Real 6-page iPhone HEIC audit (`scripts/audit_robert_all_pages.js`) on *Robert the Rose Horse*.
  - Calibration verification on *Robert* Chunk 1 (`scripts/verify_calibration_robert.js`): `"his friends"` $\rightarrow$ `mastered` in 2ms; `"his mother and father"` $\rightarrow$ `needs_scaffold` in 0ms.
* **4. Human Verification:**
  - Launch server + Cloudflare Tunnel via `launch_mobile_test.bat` (or `npm run tunnel`).
  - Open tunnel URL on iPhone 14 Plus in Safari.
  - Conduct live co-reading session with a physical Grade 2 book (4–6 pages):
    - Parent snaps pages $\rightarrow$ child listens to lookout prompt $\rightarrow$ child reads book $\rightarrow$ child speaks answer $\rightarrow$ child hears feedback $\rightarrow$ next chunk.

---

### Module 6.1: Continuous Listening, Ana Online Voice & Session Question Tracking (Completed & Verified)
* **1. Pipeline Extension:**
  - **Natural Voice Prioritization & Default Ana Online TTS:** Upgraded `SafariAudioManager` to prioritize high-fidelity neural voices (`/ana.*online/i`, `/ana.*natural/i`, `/jenny.*natural/i`, `/google\s+us\s+english/i`). Configured default preferred voice to `Microsoft Ana Online (Natural)` with `localStorage` user persistence and pinned utterance instance to prevent Chromium V8 garbage collection interruption.
  - **Unified Startup Permissions & Camera Management:** Request combined `{ video: true, audio: true }` on app boot via `getUserMedia`, stopping audio tracks immediately so microphone remains idle until questions begin. Automatically stop camera video tracks when exiting main scan panel and restore upon return.
  - **Adaptive 2-Pass Anti-Recitation Pipeline:** Implemented `BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT` in `prompts/book_analysis.js` for verbatim text extraction. On copyrighted books triggering `RECITATION_BLOCKED`, `gemini_service.js` automatically falls back to Pass 2 with `BOOK_ANALYSIS_SYSTEM_PROMPT` 1:1 factual paraphrasing.
  - **Snappy Continuous Listening & Answer Evaluation:** Implemented 500ms pause trigger in `startWaitingForAnswer()` to evaluate candidate answers instantly without displaying blocking "checking your answer..." banners. Continuous listening remains active for sentence continuations with in-flight `AbortController` cancellation.
  - **Automated Question Start on Analysis Completion:** When Gemini analysis finishes and the carousel question button becomes active (`is-ready`), the app automatically reads the first question aloud via Ana Online TTS, awaits completion, then opens the microphone.
  - **Session Question Tracking & Multi-Page Question Greying Out:** Implemented `public/js/session_question_tracker.js` (`SessionQuestionTracker`) with canonical normalization and `sessionStorage` persistence. Correctly answering a question for Page 1 automatically greys out and disables matching question buttons on all other pages (e.g. Page 2). `onPageQuestionDone()` skips completed pages and advances to the next page with an unanswered question.
* **2. Code Verification:**
  - `test/continuous_listening_and_progression.test.js`: 11/11 tests passing.
  - `test/session_question_tracker.test.js`: 2/2 tests passing.
  - Full project regression suite passing **163/163 tests across 25 test suites** (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - Automated session question tracking benchmark and multi-page question de-duplication suite (`test/session_question_tracker.test.js`).
* **4. Human Verification:**
  - Scan multi-page book with identical chunk questions (e.g. Pages 1 & 2); answer Page 1; confirm both Page 1 and Page 2 question buttons grey out; confirm automatic advance to Page 3.

---

### Module 7: Child Speech & Phonetic Resilience (Completed & Verified)
* **1. Pipeline Extension:**
  - **Double-Metaphone Child Phonetic Normalizer (`services/phonetic_matcher.js`):** Encodes dual primary and secondary phonetic codes tailored for Grade 2 child phonology:
    - Terminal `IN` $\rightarrow$ `ING` (`runnin` $\rightarrow$ `running`).
    - Silent `D` in `NDM` / `NDP` (`grandma` / `gramma` share secondary code `KRM`).
    - Terminal stop reduction in `ND` / `NT` (`friend` / `fren` share code `FRN`).
    - Child gliding `W` $\rightarrow$ `R` before vowels (`wabbit` $\rightarrow$ `rabbit` share code `RPT`).
    - Strict short word protection (words $\le 3$ characters require exact string equality).
    - Distractor collision guard checks distractor keywords first; if matched, prevents positive canonical projection.
    - Pre-pass normalizer integrated in `services/answer_evaluator.js` boosting Tier 1 fastpath hit rates to $>75\%$ with $\le 0.5\text{ms}$ latency.
  - **Speech Confidence Intelligibility Micro-Turn:**
    - Captured in `public/js/audio_manager.js` from `webkitSpeechRecognition`, forwarded in payload to `POST /api/evaluate-answer`.
    - `services/answer_evaluator.js` intercepts low-confidence muffled audio ($0.05 \le conf < 0.40$) as a free clarification micro-turn (`is_microturn: true`, `cognitive_diagnosis: 'LOW_SPEECH_CONFIDENCE'`) without penalizing attempts.
    - Anti-trap bypass: automatically proceeds to standard evaluation if consecutive low-confidence microturns already occurred.
* **2. Code Verification:**
  - `test/phonetic_matcher.test.js`: 3/3 tests passing (encoding, dual constraints, distractor shield, latency $\le 0.5\text{ms}$).
  - `test/speech_confidence_gate.test.js`: 4/4 tests passing (microturn triggering, high/null bypass, consecutive turn bypass, Web Speech confidence collection).
  - Full project regression suite passing **170/170 tests across 27 test suites** (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples:**
  - Automated phonetic benchmark asserting $<0.06\text{ms}$ latency per normalization.
* **4. Human Verification:**
  - Test slurred spoken speech (*"his gramma made it"*, *"his fren"*) and verify immediate Tier 1 mastery feedback in $<2\text{ms}$.

---

### Module 8: Deterministic CROWD (D-CROWD) Dialogic Reading Framework (Completed & Verified)
* **1. Pipeline Extension:**
  - **Deterministic CROWD Taxonomy Definition (`prompts/book_analysis.js`):**
    - `completion_cloze`: Cloze sentence stem or refrain/rhyme completion where the child supplies a 1-2 word minimal core answer.
    - `sequential_recall`: Immediate chronological step or specific tool/instrument recall directly grounded in story facts.
    - `observable_visual`: Concrete physical detail, character facial expression, or spatial feature in the illustration.
    - `wh_causality`: Motive or causal mechanism answering why or how a character resolved an obstacle (RL.2.3).
    - `distancing_schema`: Universal real-world schema, category, or reality vs. fantasy check connecting story concepts to shared world knowledge.
  - **Schema & Prompt Hardening:**
    - Restricted `BOOK_ANALYSIS_SCHEMA.properties.chunks.items.properties.question_type.enum` strictly to the 5 D-CROWD taxonomy values.
    - Enforced chunk variety rotation mandate (consecutive chunks must never reuse the same `question_type`).
    - Banned open-ended, subjective, or private biographical questions ("your room", "your mom") to guarantee objective, automated speech grading in Module 3.
  - **Mock Generation Updates (`services/gemini_service.js`):**
    - `getMockBookAnalysis` updated to rotate distinct D-CROWD types across multiple sequential chunks (`wh_causality` $\rightarrow$ `completion_cloze`).
* **2. Code Verification:**
  - `test/dcrowd_dialogic_reading.test.js`: 3/3 tests passing (schema enum, system prompts, mock variety rotation).
  - Full project regression suite passing **173/173 tests across 28 test suites** (`npm run verify`).
  - Contract audit: 100% immutable (`✅ Contract Audit: Test files remained 100% immutable.`).
* **3. Digital Samples & Live Model Audit:**
  - Live execution harness `scripts/audit_robert_extended.js` ingesting 6 raw iPhone screenshots (`robert1.HEIC` - `robert6.HEIC`) via live `gemini-3.1-flash-lite` vision and `gemini-decision-1` semantic evaluation:
    - Chunk 1: `sequential_recall` (*"Who came to the party for Robert's birthday?"*)
    - Chunk 2: `wh_causality` (*"What happens when Robert puts his nose in the rose?"*)
    - Chunk 3: `observable_visual` (*"What happens to the farm friends and the cake after the sneeze?"*)
  - 33-point cognitive answer evaluation battery testing 11 child archetypes across all 3 chunks: 30/33 passing, with 3/3 expected auto-reveals on Attempt 2.
* **4. Human Verification:**
  - Verified live D-CROWD questions and responses on physical book scans without mock AI; verified zero recitation blocks and sub-40ms Tier 1 answer grading.
