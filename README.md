# StoryScout (StoryReader)

> An intelligent, local-first Grade 2 reading comprehension web application designed for a child (ages 7–8) and parent using an iPhone 14 Plus communicating with a local Windows server via secure HTTPS.

---

## 📚 Documentation Index

* **[Project Specification (`SPEC.md`)](SPEC.md):** Core requirements, Gemini prompts, and user flows.
* **[Architecture Blueprint (`architecture.md`)](architecture.md):** Deep pre-mortem risk register, Safari hardware workarounds, data contracts, and audio lifecycle state machine.
* **[Roadmap to Completion (`roadmap.md`)](roadmap.md):** Granular module-by-module implementation plan and verification protocol.

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
  - [x] Pipeline: `POST /api/evaluate-answer`, System 1 ONNX NLI, discourse resolver, $\le 25$ word cap, attempt tracking & free microturn
  - [x] Code Tests: 55 unit/integration tests across 11 test suites with 100% contract immutability
  - [x] Digital Samples: 50-item benchmark runner (`scripts/test_50_eval_cases.js`) passing 50/50 (100%)
  - [x] Human Gate: Interactive terminal REPL (`scripts/interactive_eval_test.js`) testing edge-case child phrases for tone

- [ ] **Module 4: Mobile Camera Tray & Canvas Compression Engine**
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

### 3. Start Local Host & Cloudflare Tunnel
```bash
# Terminal 1: Node.js server
npm install
npm start

# Terminal 2: Cloudflare HTTPS Tunnel (for iPhone 14 Plus access)
npx cloudflared tunnel --url http://localhost:3000
```
Open the generated `https://*.trycloudflare.com` URL on your iPhone 14 Plus in Safari.
