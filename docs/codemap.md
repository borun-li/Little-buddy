# Code map

Created by fe-engineer #1, 2026-11-14; rewritten by fe-engineer #3 (Phase 2b) with the real layout. Plan: `docs/frontend/03-queue.md` § Scaffold. Start: npm run setup once while online (builds `stt/`, warms both models), then npm start → http://127.0.0.1:4317 (PORT, BONSAI_PORT override; offline). Test: npm test. Backend map entries added by be-developer #1, 2026-11-14.

## `web/`
Does: the companion page, static files served by `server/static.js` (npm start, 127.0.0.1:4317). No build step, no npm dependency.  Entry: `web/index.html`, `web/js/app.js`  Used by: the browser; demo capture via `docs/frontend/demo-plan.json`
Invariants: no request to any host but localhost (REQ-008); hooks data-testid fake-input (input), reply (latest companion reply only, none at open), companion with data-mood in the 5 mood ids; mood changes when the reply appears, never at send.  Tests: `tests/offline.test.js`
Traps: `web/index.html` holds the 5 companion SVGs inline as <template id="mood-<mood>">, copied from `docs/frontend/evidence/design/companion/` with every id prefixed <mood>-- (ids repeat across the exports); re-copy by hand if fe-ui re-exports; `tests/companion.test.js` turns red when a copy is stale. Icons are an inline Lucide sprite (#i-mic, #i-mic-off, #i-info, #i-lock) with the ISC/MIT notice in a comment. No autofocus attribute: app.js focuses the input.

## `web/js/app.js`
Does: turn flow idle → pending → idle; Enter (not while an IME composes) sends; Enter while pending is ignored and keeps the text; pauses the talk button ≤ 1 s. Q-011: a failed respond drops the turn (log.dropFailed), returns the line to the input in front of text typed meanwhile (focused, caret at end) and shows the send-column hint for err.code in the shared .hint line; the hint clears at the next send.  Entry: module top level  Used by: `web/index.html`
Invariants: the only importer of `web/js/companion-client.js`; page memory only (A5).  Tests: `tests/fake-companion.test.js` (import seam)

## `web/js/companion-client.js`
Does: the one replaceable data layer (REQ-007), real since Q-010: respond(line, history) → {reply, mood} (POST /api/respond, aborts at 16 s), transcribe(audio) (POST /api/transcribe, 13 s; Q-014 sends the WAV), health() (GET /api/health). Failures reject with an Error whose .code is one of CODES (not_ready, unavailable, timeout, failed, bad_request, too_large).  Used by: `web/js/app.js` only
Invariants: same-origin relative paths; last 40 history entries, never the interface language; createClient({fetch, timers}) is injectable for tests; replacing this one file swaps all replies and moods; seam in `contracts/FRONTEND_BACKEND_CONTRACT.md` §2.
Traps: app.js holds the five send-hint strings (SEND_HINT_ZH) until Q-015 moves them to copy.hints; copy.hints[key] wins once present. Default timers are arrow wrappers, because window.setTimeout called as timers.setTimeout throws Illegal invocation in browsers (node does not, only a browser run shows it).  Tests: `tests/client.test.js`

## `web/js/fake/`
Does: fake-companion.js (createFakeCompanion, tests only, moved here by Q-010), presets.js (A3 replies, A1 voice lines) and mood-keywords.js (A2: keyword ending last wins, longer wins at a tie, so 不开心 is sad; no match → neutral). Keyed by language (zh only).  Used by: `tests/fake-companion.test.js`, `tests/mood.test.js`
Invariants: nothing in web/ imports `web/js/fake/`; ≥ 2 replies per mood, never the same twice in a row, ≤ 2 sentences, ≤ 1 question, ≤ 120 chars.  Tests: `tests/mood.test.js`, `tests/fake-companion.test.js`

## `web/js/copy.js`
Does: every user-visible word (hints, captions, accessible names, placeholder), keyed by language (zh only).  Used by: app, log, companion, talk-button

## `web/js/log.js`, `web/js/companion.js`
Does: log renders you / you-voice / typing / reply turns, moves data-testid=reply to the newest reply, scrolls to newest. Companion clones the mood template into a layer, crossfades 240 ms, sets data-mood (the glow colour follows it in CSS), caption and name "小伙伴，<心情>".  Used by: `web/js/app.js`

## `web/js/talk-button.js`, `web/js/mic.js`
Does: hold by pointer or Space; release on the button sends, off it or Esc cancels; < 0.5 s too-short hint; 60 s sends itself; drives the role=status hint line. mic.js reads the permission state, opens the stream only for the level bars and stops every track on release (audio never kept), maps NotAllowedError / NotFoundError / NotReadableError to hint keys.
Traps: permission granted → listening shows at press and the stream joins later (first open can take > 1 s); prompt → that hold never records; browsers without the permission query → a stream slower than 600 ms is treated as an open prompt. Headless Chromium auto-denies the prompt, so it shows the refused hint there.

## `web/css/`
Does: tokens.css (02-ui §3 tokens, @font-face "LXGW WenKai Web" → the local subset, no local() source), page.css (phone below 960 px incl. 768, laptop at 960+, turns, composer, hint, focus, talk-button states), companion.css (glow disc = background of [data-testid=companion], 600 ms; each SVG glow path hidden; per-part motions on #<mood>--<part> per 02-ui §7, pivots as fill-box % measured with getBBox; crossfade, squash).
Invariants: prefers-reduced-motion: reduce stops every animation; .tab-hidden (set on hidden tab) pauses them.

## `web/fonts/`
Does: `web/fonts/lxgw-wenkai-subset.woff2` (LXGW WenKai Regular v1.522, 7,233 glyphs, 1.58 MB: ASCII, punctuation, GB2312 hanzi, every preset and copy character) and `web/fonts/OFL.txt`.  Built by: `tools/subset-font.sh` (argument: path to LXGWWenKai-Regular.ttf) (fonttools + brotli); the TTF is not committed.
Traps: rerun the script after adding preset or copy characters outside GB2312.

## `server/`
Does: Node gateway, no npm dependency (03 DES-001..010): serves `web/`, GET /api/health, POST /api/respond, POST /api/transcribe; supervises two children (companion-stt, llama-server).  Entry: `server/main.js`:main  Used by: npm start, npm run setup (--warm-only); the page via `web/js/companion-client.js`
Invariants: listens on 127.0.0.1 only; error bodies are {"error": code} with the 6 codes of `server/errors.js`:CODES (unknown /api/* → 404 bad_request); stdout is one JSON log line per event and never carries line, history, reply, transcript or audio; deadlines respond 15 s, transcribe 12 s (`server/config.js`:CONFIG); stops only the PIDs it spawned.  Tests: `tests/server-unit.test.js`, `tests/server-fakes.test.js`, `tests/server-boot.test.js`, `tests/server-live.test.js` (be-tester)
Traps: importing `server/main.js` does not start it (entry guard). llama-server is started directly, never via `samples/bonsai-models/gguf/start.sh` (that script downloads). Every Bonsai request carries the sampling params and enable_thinking false (`server/bonsai.js`:post). The mood call falls back to neutral; only the reply call can fail a turn. `server/log.js` is the JSON logger.

## `stt/`
Does: Swift package companion-stt (argmax-oss-swift 1.1.1 exact): resident WhisperKit transcriber, stdin {"id","pcm16"} line → stdout {"id","text","lang","ms"} or {"id","error"}; first line {"event":"ready"}.  Entry: `stt/Sources/CompanionSTT/main.swift`  Used by: `server/stt.js`
Invariants: WhisperKitConfig download false with explicit model and tokenizer folders (never online); energy gate (≥ 3 frames of 0.1 s with RMS > 0.02) before decoding, since 1.1.1 hard-codes noSpeechProb 0; zh output goes through ICU Hant-Hans; audio stays in memory.
Traps: build with `swift build -c release --package-path stt`; a new binary's first model load can take minutes (ANE compile; 53 s measured 2026-11-14 with models already compiled by whisperkit-cli), so leave stt sources alone unless needed. Non-JSON stdout lines are ignored by `server/stt.js`.

## `tests/`
Does: node:test unit tests: `tests/mood.test.js`, `tests/fake-companion.test.js`, `tests/offline.test.js`, `tests/companion.test.js` (inlined art = export, every §7 part animated and present, reduced-motion block).  Entry: npm test (files named one by one; a glob matching nothing exits 0). JUnit at test-results/junit.xml (git-ignored).

## `contracts/`
Does: the frontend/backend contract; seam for the next run's real backend.

## `docs/frontend/`
Does: frontend run artifacts (requirements, UX, UI, queue, handoff, gates, design exports). Not code.

## `spikes/argmax-swift/`
Does: one-shot WhisperKit CLI spike (C-001 evidence).  Entry: `spikes/argmax-swift/Sources/ArgmaxSpike/main.swift`  Used by: nothing in the page.

## `samples/`
Does: hackathon samples, git-ignored: Bonsai GGUF models and llama-server binaries (`samples/bonsai-models/`), Argmax Pro SDK notes (`samples/argmax-pro-sdk/`). Not ours; read-only.
