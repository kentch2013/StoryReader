# StoryScout (StoryReader)

> An intelligent, local-first Grade 2 reading comprehension web application designed for a child (ages 7–8) and parent using an iPhone 14 Plus communicating with a local Windows server via secure HTTPS.

---

## 📚 Documentation Index

* **[Project Specification (`SPEC.md`)](SPEC.md):** Core requirements, Gemini prompts, and user flows.
* **[Architecture Blueprint (`architecture.md`)](architecture.md):** Deep pre-mortem risk register, Safari hardware workarounds, data contracts, and audio lifecycle state machine.
* **[Roadmap to Completion (`roadmap.md`)](roadmap.md):** Granular module-by-module implementation plan and verification protocol.
* **[Rattles Testing Benchmark (`docs/rattles_testing_benchmark.md`)](docs/rattles_testing_benchmark.md):** 8 Grade 2 comprehension questions with 80 evaluated test cases for System 1 ONNX NLI, Near-Miss Slot Repair, and no-spoiler Socratic scaffolding.

---

## 🚦 Implementation Checklist & Verification Gates

Each module must pass all 4 verification gates before the next module begins:
`Pipeline Extension` ➔ `Code Tests` ➔ `Digital Samples` ➔ `Human Gate`

- [x] **Module 1: Server Foundation & Health Gateway**
  - [x] Pipeline: Express server, CORS, error middleware, `.env` config, `GET /api/health`
  - [x] Code Tests: Automated health check and 404 test assertions
  - [x] Digital Samples: Scripted HTTP header & origin reflection test
  - [x] Human Gate: Verify `http://localhost:3000/api/health` in browser

- [x] **Module 2: Multimodal Book Analysis Engine**
  - [x] Pipeline: `@google/genai` (`gemini-3.1-flash`), vision schema, `POST /api/analyze-book`, blur guardrail
  - [x] Code Tests: Mocked Gemini schema compliance & 422 error trapping
  - [x] Digital Samples: CLI harness against 3 synthetic Grade 2 book pages + 1 blurred page
  - [x] Human Gate: Validate chunk structure and Grade 2 prompts against physical pages

- [x] **Module 3: Socratic Answer Evaluation Engine**
  - [x] Pipeline: `POST /api/evaluate-answer`, System 1 ONNX NLI, discourse resolver, dynamic argmax arbitration, circumlocution support
  - [x] Code Tests: 60 unit/integration tests across 12 test suites with 100% contract immutability
  - [x] Digital Samples: 19-case decision model benchmark (`scripts/benchmark_decision_models.js`) passing 19/19 (100%); 50-item benchmark passing 50/50
  - [x] Human Gate: Empirical verification across *The Runaway Bunny* chunks with zero subjective grading

- [x] **Module 3.5: Dynamic Batch Latency Optimization Pipeline**
  - [x] Pipeline: Dynamic batch-adaptive padding (`tokenizeDynamicBatch`, 0% truncation), two-stage speculative cascaded probing, bidirectional character confusion, story-agnostic sanitization
  - [x] Code Tests: 60/60 unit/integration tests passing with 100% test contract immutability
  - [x] Digital Samples: 19/19 decision benchmark passing, 18/18 cross-story benchmark passing (*The Runaway Bunny* & *Dog Man: A Tale of Two Kitties*)
  - [x] Human Gate: Verified sub-35ms mastery early-exit latency (79.8% reduction) and sub-68ms error sweeps

- [x] **Module 3.6: Grounding Fidelity Gate & Transcription Verification**
  - [x] Pipeline: `services/grounding_verifier.js`, verbatim page text extraction (`verbatim_page_text`), context bounding ceiling ($\le 3$ pages), lexical entity-overlap filter, local ONNX DeBERTa-v3 premise-entailment verification pass
  - [x] Code Tests: 68/68 unit/integration tests across 14 test suites with 100% contract immutability
  - [x] Digital Samples: Factual entailment vs contradiction/ungrounded entity verification (`test/grounding_verifier.test.js`)
  - [x] Human Gate: Verified automated rejection of hallucinated entities and contradictory concepts with zero manual grading

- [x] **Module 3.7: Gemini Decision 1 Hybrid Cloud Integration & Circuit Breaker**
  - [x] Pipeline: `services/connectivity_circuit_breaker.js` (fail-fast 400-800ms abort, automatic cooldown), `services/gemini_decision_service.js` (zero output tokens, typed `choice` and `noul` evaluations), Tier 2.5 circumlocution arbitration, and multimodal page screenshot grounding
  - [x] Code Tests: 85/85 unit/integration tests passing with 100% contract immutability; 100% offline fallback resilience
  - [x] Digital Samples: 29-case comprehensive benchmark (`scripts/pipeline_comprehensive_benchmark.js`) boosting overall accuracy from 69% to 86% (+17%), lifting functional circumlocutions from 17% (1/6) to 100% (6/6), and validating physical book screenshot grounding (`rattles3.png`)
  - [x] Human Gate: Real-time speech evaluation preserved at <35ms on local fast-path; cloud decision calls bill 0 output tokens with zero schema drift

- [x] **Rattles Benchmark Live Pipeline Validation (Q3 & Q4 Trials)**
  - [x] Pipeline: Live Gemini API (`gemini-3.5-flash`) Stage 1 book analysis + System 1 ONNX DeBERTa Stage 2 Socratic speech evaluation
  - [x] Code Tests: Name-homonym discourse injection guard, minimal core terse gating, verb stem expansion (`VERB_STEM_MAP`), frame semantic fast-path (`SLOT_FRAME_ALL_MATCH`)
  - [x] Digital Samples: Q3 Trial (`scripts/trial_rattles_q3.js`) 10/10 passing (100%), Q4 Trial (`scripts/trial_rattles_q4.js`) 10/10 passing (100%)
  - [x] Human Gate: Near-miss slot repairs caught in <16ms with Wh-nudges; correct answers resolved in <32ms; 0 false positives on direct contradictions

- [x] **Module 4: Mobile Camera Tray & Canvas Compression Engine (Completed & Verified)**
  - [x] Pipeline: `public/js/camera_tray.js`, continuous in-browser camera scanner (`getUserMedia`), instant snapshot capture, stationary 90° canvas rotation, multi-sequence auto-rollover (>20 pages), canvas downscaler ($\le 1600\text{px}$, $\le 300\text{KB}$)
  - [x] Code Tests: 17 unit/integration tests (`test/camera_tray.test.js`) passing with 100% contract immutability
  - [x] Digital Samples: Standalone mobile camera harness (`public/test_camera.html`) with camera-first layout, collapsible bottom-sheet review drawer, and $\ge 56\text{px}$ touch targets
  - [x] Human Gate: iPhone 14 Plus Safari capture test (zero-modal rapid snapping, stationary rotate, multi-sequence pagination, and QR portal `connect.html`)

- [x] **Module 5: Safari Audio Coordinator (TTS & STT) (Completed & Verified)**
  - [x] Pipeline: Web Audio zero-buffer unlock (`unlock()`), `speechSynthesis` natural voice selector (0.9x rate), `webkitSpeechRecognition` continuous Push-to-Talk, mutual exclusivity collision barrier
  - [x] Hands-Free Voice Retry Detection: 0ms regex fastpath, ONNX DeBERTa-v3 System 1 NLI intent classifier (`POST /api/detect-intent`), mid-utterance splice isolation, continuous auto-listening
  - [x] Code Tests: 24 unit/integration tests across `test/audio_manager.test.js`, `test/voice_command_detector.test.js`, and `test/voice_intent_routes.test.js`
  - [x] Digital Samples: Standalone mobile audio harness (`public/test_audio.html`) and QR portal tab (`public/connect.html`)
  - [x] Human Gate: iPhone 14 Plus Safari physical testing (loudspeaker playback, pause tolerance, hands-free voice retry)

- [x] **Module 5.5: Robust Copyright Ingestion & Semantic Relaxation (Completed & Verified)**
  - [x] Pipeline: 1:1 detail-preserving factual paraphrase with zero recitation blocks on copyrighted material; `story_facts` atomic propositions array with local NLI entailment validation; deterministic grayscale rotation detection (`services/rotation_detector.js`); WebKit non-JSON/HTML error resilience in camera tray (`public/js/camera_tray.js`); dynamic head-noun extraction (`extractHeadNoun`) and SIMD `head_noun_entity` probing with agent question protection (`services/semantic_evaluator.js`).
  - [x] Code Tests: 20 unit/integration tests across `test/rotation_detector.test.js`, `test/camera_tray_resilience.test.js`, and `test/parallel_diagnostic_probing.test.js`.
  - [x] Digital Samples: Live validation on physical copyrighted book *Robert the Rose Horse* (6 pages, 0 recitation blocks, 17.3s latency, 20 atomic propositions, 98.6% average grounding entailment); 8-answer diagnostic sweep on Chunk 1.
  - [x] Human Gate: Empirical verification crediting non-verbatim child answers ("his friends" -> MASTERED) without false positive bleed.

- [x] **Module 6: Full SPA Orchestration, Mobile Viewfinder UI & Safari Audio Sync (Completed, Hardened, Calibrated & Ready for Live Test)**
  - [x] Pipeline: Single-page UI (`index.html`, `style.css`, `app.js`), attempt capping ($\le 2$), CSS confetti, tunnel runbook (`npm run tunnel`)
  - [x] Viewfinder & Carousel Redesign: Top navigation menu (speaker audio unlock `#btn-start-audio`, book page counter `#btn-open-review`, 3.5in floppy disk `#btn-saved-books`), clean 4-button viewfinder actions (Retake, wide Snap `#btn-shutter`, Analyze, 2-tap Trash), horizontal swipe page carousel with 3-action buttons per page (`[↩️ Retake] [🔄 Rotate] [❓ Question]`), and compact `[🎉 Story Ready ℹ️]` zero-space modal dialog.
  - [x] Synchronous Safari Audio Coordination: Synchronous SpeechSynthesis invocation directly within the user tap event handler (eliminated 150ms `setTimeout` gesture expiration in `audio_manager.js`), strict sequential speech-to-listening handoff (phone reads question out loud first, waits for `utterance.onend`, then opens the microphone with generous 3.2s–4.0s pause tolerance), tap-to-read aloud at any time on question text, and top speaker icon speech confirmation ("Sound is on!").
  - [x] Dual Gemini Model Fallback: Primary `gemini-3.1-flash-lite` with automatic resilient fallback to `gemini-3.5-flash-lite` (or `gemini-2.5-flash`) on transient 503 high demand.
  - [x] Safeguards & Optimizations: Rubric payload forwarding, empty transcript guard, re-entrancy locks, clue re-prompting, confetti container cleanup, `sessionStorage` persistence, and client-side AbortController fetch timeouts (`test/app_safeguards.test.js` - 7/7 passing)
  - [x] Native iPhone HEIC/HEIF Ingestion: Direct support for `image/heic` and `image/heif` in Express routes and Gemini multimodal service
  - [x] Pipeline Calibration & Threshold Tuning: Genitive possessive pronoun resolution in `discourse_resolver.js`, Tier 1 prototype fast-path precedence in `answer_evaluator.js`, meta-cognitive leak sanitization in `gemini_service.js`, stop-word filtering in `rubric_matcher.js`, and strict chunk ceiling ($\le 3$ pages) in `prompts/book_analysis.js` (`test/pipeline_calibration.test.js` - 5/5 passing)

- [x] **Module 6.1: Voice Fidelity, Continuous Listening & Session Question Tracking (Completed & Verified)**
  - [x] Natural Voice Engine & Default Ana Online: Prioritizes neural/natural speech synthesis voices (`Microsoft Ana Online (Natural)` / `Ana Online`, `Microsoft Jenny Online`, `Google US English`), eliminating robotic desktop SAPI tones. Default voice set to Ana Online with `localStorage` preference persistence and V8 garbage-collection protection.
  - [x] Unified Startup Permissions: Instant combined camera & microphone permission request (`getUserMedia({ video: true, audio: true })`) on app boot; audio tracks immediately stopped to keep listening idle until questions are asked.
  - [x] Camera Stream Lifecycle: Camera automatically turns off in review drawer, chapter/question panels, and evaluating/feedback screens to conserve device battery and thermal load; restarts only when returning to the main scanning panel.
  - [x] Adaptive 2-Pass Book Analysis: Pass 1 executes direct verbatim extraction (`BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT`) preserving exact author text for original/open books; Pass 2 seamlessly catches `RECITATION_BLOCKED` and re-runs with 1:1 anti-recitation paraphrasing (`BOOK_ANALYSIS_SYSTEM_PROMPT`).
  - [x] Snappy Continuous Listening & Low-Latency Evaluation: 500ms speech pause triggers immediate candidate answer evaluation without blocking UI banners; continuous listening remains active for sentence continuations; in-flight AbortController prevents pipeline queueing.
  - [x] Automated Question Start on Analysis Completion: App automatically reads the first question aloud using Ana Online TTS upon analysis completion, waits for speech output to finish, and transitions to microphone listening.
  - [x] Session Question Tracker & Multi-Page Identical Question Greying: Canonical question normalization via `SessionQuestionTracker` with `sessionStorage` persistence; correctly answering a question on Page 1 automatically greys out and disables identical question buttons across all other pages (e.g. Page 2); auto-progression skips already answered pages and targets the next page with an unanswered question.
  - [x] Code Tests: 163/163 tests passing across 25 test suites with 100% test contract immutability (`npm run verify`)

- [x] **Module 7: Child Speech & Phonetic Resilience (Completed & Verified)**
  - [x] Double-Metaphone Child Phonological Normalizer: `services/phonetic_matcher.js` encodes dual primary and secondary phonetic codes tailored for Grade 2 speech (terminal `IN` $\rightarrow$ `ING`, silent `D` in `NDM`/`NDP`, terminal stop reduction in `ND`/`NT`, child gliding `W` $\rightarrow$ `R` before vowels, minimal pair protection, and distractor collision shielding). Normalizes slurred variants (*"gramma"*, *"fren"*, *"wabbit"*, *"runnin"*) in $\le 0.05\text{ms}$, boosting Tier 1 fastpath hit rates to $>75\%$ with $<2\text{ms}$ latency.
  - [x] Speech Confidence Intelligibility Micro-Turns: Traps low-confidence speech ($0.05 \le conf < 0.40$) in `services/answer_evaluator.js` as a free clarification micro-turn without consuming attempts; anti-trap bypass on consecutive low-confidence turns ensures quiet readers are never locked in loops.
  - [x] Web Speech Recognition Confidence Capture: `public/js/audio_manager.js` captures live confidence metrics from Web Speech results, emitting them in `onTranscript` events and `stopListening()` responses.
  - [x] Autonomous Capability & Multi-Module Audit Suite: `scripts/autonomous_module6_7_audit.js` verifies all M6, M6.1, and M7 capabilities in a single pass (19/19 checks passing, 100% green).
  - [x] Code Tests: 170/170 tests passing across 27 test suites with 100% test contract immutability (`npm run verify`)
  - [ ] Human Gate: Live co-reading session with a physical Grade 2 book over Cloudflare Tunnel on iPhone 14 Plus Safari

---

## 🛠️ Quick Start (Target Environment)

### 1. Prerequisites
* Node.js v18+ on Windows 11 host
* Google AI Studio API key (`GEMINI_API_KEY`)

### 2. Configuration
Copy `.env.example` to `.env` and set your key:
```bash
cp .env.example .env
```

### 3. Start Local Host & Mobile Tunnel

#### Option A: One-Click Mobile Testing (Zero-Typing QR Code)
Double-click `launch_mobile_test.bat` or run:
```cmd
launch_mobile_test.bat
```
This boots the server, creates an HTTPS tunnel, copies the URL to your clipboard, and displays a scannable QR code on your monitor. Point your iPhone camera at the screen to launch Safari instantly.

#### Option B: Master Test Environment & REPL
```cmd
launch_test_environment.bat
```
Launches the Express server, opens the interactive Socratic REPL (`scripts/interactive_eval_test.js`), checks health in browser, and presents the benchmark menu.

#### Option C: Manual CLI Launch
```bash
# Terminal 1: Node.js server
npm install
npm start

# Terminal 2: Cloudflare HTTPS Tunnel (for iPhone 14 Plus access)
npx cloudflared tunnel --url http://localhost:3000
```
Open the generated `https://*.trycloudflare.com` URL on your iPhone 14 Plus in Safari.
