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

- [ ] **Module 6: Full SPA Orchestration & End-to-End Reading Flow (NEXT IMMEDIATE OBJECTIVE)**

- [ ] **Module 6: Full SPA Orchestration & End-to-End Reading Flow**
  - [ ] Pipeline: Single-page UI (`index.html`, `style.css`, `app.js`), attempt capping ($\le 2$), CSS confetti, tunnel runbook
  - [ ] Code Tests: State transition and DOM rendering lifecycle tests
  - [ ] Digital Samples: Scripted simulation running a multi-chunk session replay
  - [ ] Human Gate: Live co-reading session with a physical Grade 2 book over Cloudflare Tunnel

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
