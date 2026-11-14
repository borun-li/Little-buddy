# Queue — 离线情绪陪伴小伙伴 P0 原型（本地网页，假数据）

- **Author:** fe-engineer #1 · **Status:** draft (feasibility + queue, round 1, 2026-11-14)
- One row per independently buildable, observable piece. Row ids start at Q-001: no earlier round exists.
- Inputs: `01-ux.md` PAGE-001, `02-ui.md` CMP-001..005 and FRAME-001..010 (exported PNGs only, 0 Figma calls), `00-requirements.md` REQ-001..008 and A1–A6, `demo-plan.json`.

## Stack and commands (decided for Phase 2b)
Simplest thing that runs offline (Constitution §2.10): static files, no framework, no bundler, no npm dependency.

| Item | Decision | Why / evidence |
|---|---|---|
| Page | one `index.html`, plain CSS with custom properties for the §3 tokens, vanilla ES modules loaded by the browser | one page, five components, no routing; nothing to compile |
| Serve | `npm start` → `python3 -m http.server 4317 --bind 127.0.0.1 --directory web` | port and URL from `demo-plan.json` `base_url`; Python 3.13.5 maps `.js` → `text/javascript`, `.woff2` → `font/woff2`, `.svg` → `image/svg+xml` (checked with `mimetypes.guess_type`); localhost is a secure context, so the mic works |
| Test | `npm test` → `mkdir -p test-results && node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results/junit.xml tests/mood.test.js tests/fake-companion.test.js tests/offline.test.js` | Node v24.13.0 built-in runner. Files are named one by one on purpose: a glob matching no file exits 0 with "tests 0", a missing named file exits 1 (both checked in a scratch dir). The gate's runner parses no `node --test` summary, so the JUnit file is the per-test report |
| `.claude/gates.json` (orchestrator writes) | `"stack": "static html + vanilla js (node:test)"`, `"test": "npm test"`, `"junit": "test-results/junit.xml"`, `build`/`lint`/`typecheck`: `null` | there is no build step; the page is served as written |
| Breakpoint | laptop layout at ≥ 960 px wide (stage flexes, log column 640 px); below it the phone layout (stage pinned on top, 280 px) | frames exist at 1440 and 390 only; 768 (harness `viewports`) gets the phone layout — assumption E1 |

## Scaffold
One-stop run: the scaffold is built inside the Phase 2b prototype, not before the UI stop. Nothing below exists yet.

| File | What it does |
|---|---|
| `package.json` | `"type": "module"`, scripts `start` and `test`, zero dependencies |
| `.gitignore` | adds `test-results/` |
| `web/index.html` | the page: stage with the inline companion SVG (`data-testid=companion`, `data-mood`, `role=img`), caption, `role=log` list, hint line (`role=status`), talk button, input (`data-testid=fake-input`, focused at open, maxlength 500) |
| `web/css/tokens.css` | `02-ui.md` §3 tokens as CSS custom properties; `@font-face` for the local WenKai subset |
| `web/css/page.css` | laptop and phone layout, turns, composer, hint line, focus rings, talk-button states |
| `web/css/companion.css` | five expressions, glow disc, mood crossfade, per-mood loops, `prefers-reduced-motion` and hidden-tab pause |
| `web/js/app.js` | entry: turn flow (idle → pending → idle), pauses send/hold ≤ 1 s, calls only `companion-client.js` |
| `web/js/companion-client.js` | **the one replaceable data layer (REQ-007)**: `respond(line, history)` → `{reply, mood}` after ~600 ms; `transcribe()` → `{text}` (next preset line, A1). This round it is fake; swapping this file swaps the data |
| `web/js/fake/mood-keywords.js` | A2: keyword → mood, last keyword in the line wins, no match → `neutral` |
| `web/js/fake/presets.js` | A3: ≥ 2 Chinese replies per mood (≤ 2 sentences, ≤ 1 question, ≤ 120 chars); A1 voice lines covering all 5 moods |
| `web/js/copy.js` | every user-visible word from `01-ux.md` §4 and `02-ui.md` (hints, captions, accessible names) in one place |
| `web/js/log.js` | renders turns (you, you-voice, reply, typing), moves `data-testid=reply` to the latest reply only, keeps the newest in view |
| `web/js/companion.js` | sets `data-mood`, caption and accessible name "小伙伴，<心情>" when a reply appears |
| `web/js/talk-button.js` | hold to talk by pointer or Space; Esc / release off the button cancels; seconds, level bars, < 0.5 s and 60 s rules; drives the hint line |
| `web/js/mic.js` | opens the mic per hold, reads the input level, stops all tracks on release (audio never kept); maps `NotAllowedError` / `NotFoundError` / `NotReadableError` to hint keys |
| `web/assets/icons/` | Lucide `mic`, `mic-off`, `info`, `lock` SVGs, vendored with their ISC licence |
| `web/fonts/lxgw-wenkai-subset.woff2` | LXGW WenKai v1.530 Regular, subset to ASCII + CJK punctuation + GB2312 hanzi + every preset character, WOFF2 |
| `web/fonts/OFL.txt` | the font licence, shipped beside the font as OFL requires |
| `tools/subset-font.sh` | one-off, build-time: `pyftsubset` (fonttools 4.55.3 + brotli, both installed) turns a downloaded TTF into the subset; never runs at page time |
| `tests/mood.test.js` | keyword mapping: each mood's keywords, last keyword wins, no match → neutral, the two demo lines |
| `tests/fake-companion.test.js` | the fake layer: mood per line, reply ≤ 1 s, ≥ 2 replies per mood, never the same twice in a row, length and sentence limits, `transcribe()` covers all 5 moods; `app.js` is the only importer of `companion-client.js` and nothing outside it imports `fake/` |
| `tests/offline.test.js` | REQ-008: no file under `web/` names a host other than localhost; `@font-face` and icons point to local files that exist |

## Dependencies
No npm package. Two vendored asset sets, no manifest entry.

| Package | Version | Why |
|---|---|---|
| LXGW WenKai (font file, vendored subset) | v1.530 (GitHub release 2026-10-17, `LXGWWenKai-Regular.ttf` 25,928,940 bytes) | companion's voice face (`font.voice`). Licence OFL-1.1 (GitHub licence API); its OFL.txt explicitly allows WOFF/WOFF2 subsets for web delivery under the reserved name. Fallback stack: Kaiti SC, STKaiti, serif |
| Lucide icons (4 SVG files, vendored) | latest at build time | `02-ui.md` §4 icon set; ISC licence; inlined or served from `web/assets/icons/` |

## Feasibility notes
- Mood motion: all loops are CSS transforms/opacity on SVG groups (`transform-box: fill-box`), one mood's loop active at a time; cheap. Blink runs on a fixed 5 s cycle (inside the drawn 4–6 s range). Hidden tab: `visibilitychange` sets `animation-play-state: paused`.
- Companion art: drawn as vectors in Figma, not in the repo. Phase 2b needs the five expressions as SVG with layer ids (ears, tail, sparkles, sweat drop, tear) to animate parts. Cheapest: one `use_figma` call on FRAME-009 (node 7:305) running `exportAsync({format: 'SVG_STRING', svgIdAttribute: true})` per mood. Without it: redraw from `FRAME-009.png` and have fe-ui check the redraw. Figma calls left this run: 2.
- Mic: no `MediaRecorder`; the stream is only read for the level bars, then stopped. The browser prompt can stay unanswered: a hold that started before permission never records (FLOW-003).
- Mock copy is not fake data: FRAME-003's second reply has 3 sentences; presets follow REQ-003 (≤ 2).
- Assumption E1 [unverified]: at 768 px (harness viewport, no frame) the phone layout applies. If wrong: fe-ui draws a 768 frame.

## Design feedback raised (for the orchestrator to file in `06-feedback.md`; ids provisional)
| DFB | To | Item | Reason and evidence | Cheaper alternative |
|---|---|---|---|---|
| DFB-001 | fe-ui | CMP-003 phone listening label | "N 秒 · 松开发送" does not fit the 124 px phone button: the text alone is 130.9 px ("60 秒 · 松开发送", 17 px PingFang SC Semibold, summed hmtx advances via fontTools; 120.7 px for "4 秒"); with mic icon, level bars and padding it needs ~175 px. No frame draws this state | phone listening shows mic icon + "N 秒" (43.1 px) + level bars (~117 px with 12 px padding); release/cancel words stay laptop-only |
| DFB-002 | fe-ui | CMP-004 state "disabled (paused)" | `02-ui.md` CMP-004 says "disabled (paused: text kept, Enter ignored)"; `01-ux.md` PAGE-001 loading row says "Can do next: keep typing (text kept)". A disabled input cannot be typed in and drops focus | paused input stays editable and focused, only Enter is ignored, with the FRAME-010 note "(发送中，文字先留着)"; no 50 % fade on the input |

## Build log (Phase 2b, fe-engineer #3, 2026-11-14)
Rows Q-001..Q-009 built to prototype depth. Deviations from § Scaffold and the rows, each with its reason:

| Item | Planned | Built | Why |
|---|---|---|---|
| Font source | LXGW WenKai v1.530 TTF downloaded | v1.522 TTF already installed on this machine; same Regular face and OFL | no download needed; subset covers every preset and copy character (checked with fontTools cmap) |
| Icons | `web/assets/icons/` SVG files | inline `<symbol>` sprite in `index.html` with the Lucide ISC and Feather MIT notices | four icons; no extra requests or files |
| Glow change | glow colour 600 ms | glow fades with the 240 ms expression crossfade | the glow is part of each mood's exported SVG |
| Part motions | blink, ear twitch, tail swish, sparkle twinkle, sweat-drop slide | whole-body loop per mood (breathe, hop+bounce, sway, fidget, sink+lean) | the SVG exports name only stage, glow, ground, character; parts need ids from fe-ui |
| Paused note | after the text in the input | laptop only | FRAME-007 (phone) draws no note and 124 px leaves no room |
| Hold with mic granted | listening once the stream opens | listening at press; the stream joins for the level bars | a 2 s hold once added no turn in headless Chromium (cause not isolated; a slow first stream open is the likely one); two later full runs passed |

### Q-001 — Empty page at open
- **Page:** PAGE-001
- **Frame:** FRAME-001, FRAME-005
- **States:** empty
- **REQ:** REQ-001, REQ-004
- **Files:** `index.html`, `tokens.css`, `page.css`, `copy.js`, `app.js`
- **Observable:** page opens with a neutral companion, the empty hint and privacy line in the log, the cursor already in the input, and no reply
- **Acceptance:** at 1440, 768, 390, 375: words match the empty row; `data-mood=neutral`; input focused; no `data-testid=reply`
- **Priority:** P1
- **Side:** frontend
- **Depends on:** none
- **Status:** built

### Q-002 — Typed line gets reply and mood
- **Page:** PAGE-001
- **Frame:** FRAME-002, FRAME-006, FRAME-007
- **States:** loading, success
- **REQ:** REQ-001, REQ-003, REQ-004
- **Files:** `app.js`, `log.js`, `companion.js`, `companion-client.js`
- **Observable:** a typed happy line, sent with Enter, shows as own turn, then typing dots, a warm reply, a smiling companion; sad lines sadden it
- **Acceptance:** turn ≤ 0.3 s, reply ≤ 1 s, mood ≤ 1 s after; empty Enter: nothing; pending Enter keeps text; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-001
- **Status:** built

### Q-003 — Five companion moods
- **Page:** PAGE-001
- **Frame:** FRAME-009
- **States:** success
- **REQ:** REQ-004
- **Files:** `index.html`, `companion.css`, `companion.js`
- **Observable:** each mood has its own face, glow, caption and movement; it switches with a short squash when the reply appears, never at send
- **Acceptance:** per `data-mood`: face and caption match FRAME-009, accessible name says the mood; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-002; companion SVG export (orchestrator, 1 Figma call) or a redraw fe-ui checks
- **Status:** built

### Q-004 — Hold to talk
- **Page:** PAGE-001
- **Frame:** FRAME-003, FRAME-010, FRAME-011
- **States:** success
- **REQ:** REQ-002
- **Files:** `talk-button.js`, `mic.js`, `log.js`, `companion-client.js`, `page.css`
- **Observable:** holding the button (or Space) shows listening with seconds and level bars (phone: icon, "N 秒", bars; name "在听，N 秒，松开发送"); release sends; Esc adds nothing
- **Acceptance:** 2 s hold → turn ≤ 1 s after release; < 0.5 s → too-short hint; 60 s auto-sends; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-002, DFB-001
- **Status:** built

### Q-005 — Fake data behind one replaceable layer
- **Page:** PAGE-001
- **Frame:** n/a — no visual of its own; shows through Q-002
- **States:** success
- **REQ:** REQ-007
- **Files:** `companion-client.js`, `presets.js`, `mood-keywords.js`, `fake-companion.test.js`, `mood.test.js`
- **Observable:** with `companion-client.js` replaced by a stub returning reply X and neutral, three sent lines all show X and a neutral companion
- **Acceptance:** stub swap touches one file; `npm test` green, covering keyword mapping and the fake layer
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-002
- **Status:** built

### Q-006 — Runs with Wi-Fi off
- **Page:** PAGE-001
- **Frame:** n/a — offline looks like success (`02-ui.md` §5)
- **States:** offline
- **REQ:** REQ-008
- **Files:** `lxgw-wenkai-subset.woff2`, `OFL.txt`, `subset-font.sh`, `icons/`, `offline.test.js`
- **Observable:** with Wi-Fi off, a 3-turn session works and replies render in WenKai, not a fallback face
- **Acceptance:** network log lists only localhost; computed font of a reply is the local WenKai; `offline.test.js` green
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-002
- **Status:** built

### Q-007 — Mic problems told by the button
- **Page:** PAGE-001
- **Frame:** FRAME-004, FRAME-008, FRAME-010
- **States:** permission, error
- **REQ:** REQ-002
- **Files:** `mic.js`, `talk-button.js`, `copy.js`, `page.css`
- **Observable:** prompt open, mic refused, no mic, or mic busy each shows its own hint line by the button, and typing still works
- **Acceptance:** each case's words match the permission and error rows; hint is `role=status`; wraps to two lines at 390 like FRAME-008
- **Priority:** P2
- **Side:** frontend
- **Depends on:** Q-004
- **Status:** built

### Q-008 — Long conversation stays readable
- **Page:** PAGE-001
- **Frame:** FRAME-002, FRAME-006
- **States:** success
- **REQ:** REQ-005
- **Files:** `log.js`, `page.css`
- **Observable:** after 20 turns every turn is readable in order by scrolling the log; the companion and composer never scroll away
- **Acceptance:** 20 turns at 1440 and 390: order kept, newest in view after each send, only the latest reply has the hook
- **Priority:** P2
- **Side:** frontend
- **Depends on:** Q-002
- **Status:** built

### Q-009 — Reduce motion
- **Page:** PAGE-001
- **Frame:** FRAME-009
- **States:** success, loading
- **REQ:** REQ-006
- **Files:** `companion.css`, `page.css`
- **Observable:** with OS reduce motion on, a sad line makes the companion look sad and nothing keeps moving; typing dots are a static …
- **Acceptance:** emulated `prefers-reduced-motion: reduce`: no running animation on the page after the mood swap; at 1440 and 390
- **Priority:** P2
- **Side:** frontend
- **Depends on:** Q-003
- **Status:** built
