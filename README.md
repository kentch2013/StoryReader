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
  - [x] Code Tests: 64/64 unit/integration tests across 13 test suites with 100% contract immutability
  - [x] Digital Samples: Factual entailment vs contradiction/ungrounded entity verification (`test/grounding_verifier.test.js`)
  - [x] Human Gate: Verified automated rejection of hallucinated entities and contradictory concepts with zero manual grading

- [ ] **Module 4: Mobile Camera Tray & Canvas Compression Engine (NEXT IMMEDIATE OBJECTIVE)**
  - [ ] Pipeline: `public/js/camera_tray.js`, sequential capture, filmstrip tray, canvas downscaler ($\le 1600\text{px}$)
  - [ ] Code Tests: Canvas compression tests ($\le 300\text{KB}$/page, $\le 1600\text{px}$)
  - [ ] Digital Samples: Standalone camera harness page (`test_camera.html`)
  - [ ] Human Gate: iPhone 14 Plus Safari capture test (snap 3 pages, verify tray & payload)

- [ ] **Module 5: Safari Audio Coordinator (TTS & STT)**
  - [ ] Pipeline: Web Audio unlock, `speechSynthesis` natural voice selector, `webkitSpeechRecognition` Push-to-Talk, audio cancel barrier
  - [ ] Code Tests: State machine mutual exclusivity assertions
  - [ ] Digital Samples: Standalone audio test harness page (`test_audio.html`)
  - [ ] Human Gate: iPhone 14 Plus Safari mic & speaker test (no silence cutoff, clear TTS)

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
