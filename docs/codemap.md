# Code map

Created by fe-engineer #1, 2026-11-14; rewritten by fe-engineer #3 (Phase 2b) with the real layout. Plan: `docs/frontend/03-queue.md` § Scaffold. Start: npm start → http://localhost:4317 (also http://127.0.0.1:4317). Test: npm test.

## `web/`
Does: the companion page, static files served by `package.json` script start (python3 http.server, 127.0.0.1:4317). No build step, no npm dependency.  Entry: `web/index.html`, `web/js/app.js`  Used by: the browser; demo capture via `docs/frontend/demo-plan.json`
Invariants: no request to any host but localhost (REQ-008); hooks data-testid fake-input (input), reply (latest companion reply only, none at open), companion with data-mood in the 5 mood ids; mood changes when the reply appears, never at send.  Tests: `tests/offline.test.js`
Traps: `web/index.html` holds the 5 companion SVGs inline as <template id="mood-<mood>">, copied from `docs/frontend/evidence/design/companion/` with every id prefixed <mood>-- (ids repeat across the exports); re-copy by hand if fe-ui re-exports; `tests/companion.test.js` turns red when a copy is stale. Icons are an inline Lucide sprite (#i-mic, #i-mic-off, #i-info, #i-lock) with the ISC/MIT notice in a comment. No autofocus attribute: app.js focuses the input.

## `web/js/app.js`
Does: turn flow idle → pending → idle; Enter (not while an IME composes) sends; Enter while pending is ignored and keeps the text; pauses the talk button ≤ 1 s.  Entry: module top level  Used by: `web/index.html`
Invariants: the only importer of `web/js/companion-client.js`; page memory only (A5).  Tests: `tests/fake-companion.test.js` (import seam)

## `web/js/companion-client.js`
Does: the one replaceable data layer (REQ-007): respond(line, history) → {reply, mood} after 600 ms, transcribe() → {text} (next preset voice line, A1). Fake this round; createFakeCompanion() is exported for tests.  Used by: `web/js/app.js` only
Invariants: nothing else imports `web/js/fake/`; replacing this one file swaps all replies and moods; seam in `contracts/FRONTEND_BACKEND_CONTRACT.md` §2.  Tests: `tests/fake-companion.test.js`

## `web/js/fake/`
Does: presets.js (A3 replies, A1 voice lines) and mood-keywords.js (A2: keyword ending last wins, longer wins at a tie, so 不开心 is sad; no match → neutral). Both keyed by language (zh only; English is D-001).  Used by: `web/js/companion-client.js`
Invariants: ≥ 2 replies per mood, never the same twice in a row, ≤ 2 sentences, ≤ 1 question, ≤ 120 chars.  Tests: `tests/mood.test.js`, `tests/fake-companion.test.js`

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
