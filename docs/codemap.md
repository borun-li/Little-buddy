# Code map

Created by fe-engineer #1, 2026-11-14 (frontend Phase 2, before any product code). Planned modules are written without backticks because they do not exist yet; the Phase 2b engineer puts each path in backticks when it creates the file. Plan: `docs/frontend/03-queue.md` § Scaffold.

## web/ (planned, Phase 2b)
Does: the companion page, static files served at http://localhost:4317 by npm start (python3 http.server, 127.0.0.1 only).  Entry: web/index.html, web/js/app.js  Used by: the browser; demo capture via `docs/frontend/demo-plan.json`
Invariants: no request to any host but localhost (REQ-008); fonts and icons are local files; hooks fake-input, reply (latest companion reply only), companion with data-mood in the 5 mood ids; mood changes when the reply appears, never at send.  Tests: tests/offline.test.js (planned)  Traps: mic needs a secure context (localhost is one); paused input behaviour pending DFB-002.

## web/js/companion-client.js (planned, Phase 2b)
Does: the one replaceable data layer (REQ-007): respond(line, history) → {reply, mood}, transcribe() → {text}; fake this round.  Entry: its two exports  Used by: web/js/app.js only
Invariants: nothing else imports web/js/fake/; replacing this one file swaps all replies and moods; seam shape in `contracts/FRONTEND_BACKEND_CONTRACT.md` §2.  Tests: tests/fake-companion.test.js, tests/mood.test.js (planned)  Traps: none yet.

## web/js/fake/ (planned, Phase 2b)
Does: preset replies and voice lines (A1, A3) and keyword → mood mapping (A2, last keyword wins).  Entry: mood-keywords.js, presets.js  Used by: web/js/companion-client.js
Invariants: ≥ 2 replies per mood, never the same twice in a row, ≤ 2 sentences, ≤ 1 question, ≤ 120 chars.

## web/fonts/ (planned, Phase 2b)
Does: LXGW WenKai v1.530 subset (WOFF2) plus its OFL.txt.  Entry: the @font-face in web/css/tokens.css  Used by: replies and the mood caption
Traps: built once by tools/subset-font.sh from a downloaded TTF (needs network at build time only); the TTF itself is not committed.

## tests/ (planned, Phase 2b)
Does: node --test unit tests for the fake layer, the keyword mapping and the offline rule.  Entry: npm test (files named one by one; a glob matching nothing exits 0)

## `contracts/`
Does: the frontend/backend contract; seam for the next run's real backend.

## `docs/frontend/`
Does: frontend run artifacts (requirements, UX, UI, queue, handoff, gates, design exports). Not code.

## `spikes/argmax-swift/`
Does: one-shot WhisperKit CLI spike (C-001 evidence).  Entry: `spikes/argmax-swift/Sources/ArgmaxSpike/main.swift`  Used by: nothing in the page.

## `samples/`
Does: hackathon samples, git-ignored: Bonsai GGUF models and llama-server binaries (`samples/bonsai-models/`), Argmax Pro SDK notes (`samples/argmax-pro-sdk/`). Not ours; read-only.
