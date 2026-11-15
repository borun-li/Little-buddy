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

## Build log (Phase 2b round 2, fe-engineer #4, 2026-11-14) — DFB-003, Q-003
Rows "Glow change" and "Part motions" above are now built (new art has part ids). Files: `index.html` (5 templates re-copied), `companion.css`, `companion.js`, new `tests/companion.test.js` (named in `package.json` script test). Deviations:

| Item | Planned (02-ui §7, CMP-001) | Built | Why |
|---|---|---|---|
| Glow | each export's `glow` disc, colour change 600 ms | one disc = background of `[data-testid=companion]` (5 % inset, content-box), 600 ms transition; the SVG `glow` paths are hidden | layers crossfade in 240 ms, so a per-layer glow cannot take 600 ms. Side effect: demo-plan `open` capture of background-color now reads the glow (rgb 230 218 202), not transparent |
| Neutral blink | every 4–6 s | 10 s loop, blinks 4 s then 6 s apart | no JS randomness for a loop |
| Wave | ±12°, alternating, 600 ms | one full swing −12°→12°→−12° per 600 ms, arms half a cycle apart | §7 does not say whether 600 ms is one way or a full swing |
| Paw rub | ±1.5 px, no duration | 600 ms loop, paws opposite | assumption [unverified]; FRAME-009 gives no duration |
| Tremble | flashes with each burst | opacity 1 during the 3-move burst, 0.2 between, same 1.6 s clock | reading of "flashes"; reduced motion keeps the marks fully visible |
| unpleasant-low | sink 8 px + scaleY 0.97, slow breath | as planned; round-1 1° lean removed | §7 has no lean |
| Neutral breath | `body` 1→1.02 | `body` group only; face and paws do not scale | literal §7; ~2 px at 540 px |
| Mood entry | fade 240 ms | `is-entering` removed only on the layer's own animationend | bug found: the 150 ms squash's bubbling animationend cut the 240 ms fade short (round 1) |

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

## Increment 1 — 2026-11-14

- **Author:** fe-engineer #5 · **Status:** draft (feasibility + queue, step 2 round 2) · run `companion-full-dev`. Ids Q-010… continue; never reused.
- Inputs: `01-ux.md` and `02-ui.md` § Increment 1, FRAME-012..016 (exported PNGs, 0 Figma calls), `docs/backend/01-requirements.md` REQ-001..013 (ids below are that file's), `docs/backend/03-detailed-design.md` DES-013..015 and §9, contract §2 (rows replaced this round) and seam table.
- Backend half: the seam's other side is DES-001..012 (be-developer). Rows marked **backend first** cannot be seen end to end until it runs; their client logic is built and tested against an injected `fetch` and must not wait. No `server/` exists yet (checked: `ls` shows no `server/`; `package.json` still serves `web/` statically).

### Earlier approved rows this round may change (PLAYBOOK §3I)
No `OBS-###` registry exists yet (no `OBS-` in `docs/frontend`), so rows stand in for observables. Hooks `fake-input`, `reply`, `companion` stay (`docs/backend/demo-plan.json`).

| Earlier row | What may change | Why |
|---|---|---|
| Q-001 empty page | words follow the interface language (browser default, A12); the page now also calls `health()` at open, so with no backend the hint line shows `hints.unreachable` at open | REQ-010/011/012; DES-013 |
| Q-002 typed line | "reply ≤ 1 s" becomes ≤ 10 s; a send can now fail and return the text | REQ-008, REQ-011 |
| Q-003 moods | caption `moods.waking` while the reply side warms (art stays `neutral`); English captions | REQ-010, REQ-012 |
| Q-004 hold to talk | the hold is recorded; after release a transcribing turn, then real words; tag "语音" | REQ-001, REQ-003 |
| Q-005 fake layer | `companion-client.js` becomes real; `createFakeCompanion` moves to `web/js/fake/`; `tests/fake-companion.test.js` imports change | DES-013 |
| Q-006 offline | the only new requests are same-origin `/api/*`; `offline.test.js` must still pass; font gains Latin-1 letters (Q-017) | REQ-009 |
| Q-007 mic hints | same words, now in two languages; the granted-state "listening at press" timing changes (DFB-005) | REQ-012; recording needs the stream |
| Q-009 reduce motion | transcribing dots are a static "…" | `01-ux.md` loading · transcribing |
Q-008 (20 turns) is untouched except that `history` is capped at 40 entries when sent.

### Scaffold (increment 1)
Stack unchanged: static files, vanilla ES modules, `node:test`. No new package.

| File | What it does |
|---|---|
| `web/js/companion-client.js` | rewritten: `respond`, `transcribe(audio)`, `health()` over same-origin `/api/*`; aborts 16 s / 13 s → `timeout`; failed `fetch` → `unavailable`; non-2xx → body `error`, unknown → `failed`; sends the last 40 `history` entries, never the language; `createClient({fetch, timers})` exported so tests inject both |
| `web/js/fake/fake-companion.js` | the old `createFakeCompanion` moved here, tests only; nothing in `web/` imports it |
| `web/js/mic.js` | adds recording: capture while held, downsample to 16 kHz mono, `encodeWav` → `Blob audio/wav` (PCM16 LE, 44-byte header, ≤ 1,920,044 B at 60 s); tracks stopped on release; audio only in page memory (A9) |
| `web/js/recorder-worklet.js` | AudioWorklet processor posting raw mic frames to `mic.js`; the one file the browser must fetch separately |
| `web/js/health-watch.js` | the warming state machine: checks at open and every 2 s until both parts are ready, applies the `01-ux.md` warming table (Enter / hold / hint / caption), 30 s → `stillDown`, `awake` for 4 s only if a not-ready hint was shown; clock and `health()` injected |
| `web/js/copy.js` | both languages in one file (zh unchanged but `voiceTag` "语音"); `setLang`, `onLang`, `t(key)`; `lang` on `<html>`; default from `navigator.language` (zh* → zh, else en, A12), not stored |
| `web/index.html`, `web/css/page.css` | CMP-006 switch (`role=group`, two `button`s, `aria-pressed`, own `lang`); English phone composer (button hugs 154 px, input 196 px); hint line up to 3 lines at 358 px |
| `web/js/app.js`, `log.js`, `companion.js`, `talk-button.js` | wire the above: failure returns the text; transcribing turn; re-render on language change; hold records and sends the WAV |
| `tests/client.test.js`, `tests/wav.test.js`, `tests/health-watch.test.js`, `tests/copy.test.js` | named one by one in the `package.json` `test` script (same reason as before: a glob matching nothing exits 0) |

### Feasibility notes (increment 1)
- Recording: capture at the context's native rate and downsample in JS (box average to 16 kHz), not `AudioContext({sampleRate: 16000})`. Reason [unverified]: Firefox rejects connecting a stream of another rate to a context at 16 kHz. 60 s × 16,000 × 2 B + 44 = 1,920,044 B, under the 2,000,000 B cap (arithmetic). `encodeWav` and the downsampler are pure functions, so `node --test` covers them with no microphone.
- Mic first-open lag (`docs/codemap.md` `mic.js` traps: first open can take > 1 s) now loses speech: the frames before the stream opens are never captured. Raised as DFB-005 (accepted by fe-ux #4, pending user at Plan).
- Fonts: the vendored subset has `— – ’ ‘ “ ” … · •` (checked with fontTools cmap on `web/fonts/lxgw-wenkai-subset.woff2`) but not `é ü € ™ → ✓` or emoji. Real replies are free text, so these can appear and fall back to Kaiti SC (no missing-glyph box, a visible change of face). Row Q-017.
- Real replies break one earlier assumption: copy and presets were all known characters, generated text is not. No change to the layer; `overflow-wrap: anywhere` on turns is already in `web/css/page.css:64` for long lines.
- Timing is the backend's: `docs/backend/handoff.md` (be-architect #2) says after 20 turns every turn is cold, ≈ 10 s with STT. The page waits up to 16 s / 13 s, so it never ends before the server's own 15 s / 12 s.
- A transcript is passed to `respond` as is; a spoken 60 s line is ≈ 1,000 characters in English (estimate, not measured), under the 1,500 cap. Anything longer is cut at 1,500 characters before sending, [unverified] default; otherwise `bad_request` shows `hints.sendDefect` for a normal line.
- Until `server/` exists the page at `npm start` shows the unreachable hint and cannot send: that is correct behaviour, so the first runnable check of Q-010..Q-014 is the node tests plus the backend's `npm start` once be-developer lands.

### Design feedback raised (for the orchestrator to file in `06-feedback.md`; id provisional)
| DFB | To | Item | Reason and evidence | Cheaper alternative |
|---|---|---|---|---|
| DFB-005 | fe-ux | FLOW-005 step 1 / `docs/codemap.md` "permission granted → listening shows at press, the stream joins later" | Recording starts when the stream opens, so with the old timing the first words of a hold (up to the first-open lag, unmeasured, "> 1 s" in the codemap) are lost and the user sees "listening" while nothing is captured | Show "listening" and start the seconds when the stream opens; the button already looks pressed from the pointer-down. Other holds reopen fast (unmeasured). If fe-ux keeps "at press", the first words of a first hold can be missing |

### Q-010 — Typed line gets a real reply and mood
- **Page:** PAGE-001
- **Frame:** FRAME-002, FRAME-006, FRAME-014
- **States:** loading, success
- **REQ:** REQ-004..008
- **DES:** DES-013
- **Files:** `companion-client.js`, `app.js`
- **Observable:** Offline, an English line gets a Bonsai-written English reply and the matching mood; a sad follow-up recalls the first
- **Acceptance:** Reply and mood ≤ 10 s; note Q-010; 1440, 390
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-002, Q-005
- **Status:** queued

### Q-011 — A failed send gives your words back
- **Page:** PAGE-001
- **Frame:** FRAME-010, FRAME-013
- **States:** error · reply
- **REQ:** REQ-011
- **DES:** DES-013
- **Files:** `companion-client.js`, `app.js`, `log.js`
- **Observable:** With the reply side stopped, the sent line leaves the chat, returns to the input, and a hint says why
- **Acceptance:** Hint per code ≤ 2 s; note Q-011; 1440, 390
- **Priority:** P1
- **Side:** both for the live check
- **Depends on:** Q-010
- **Status:** queued

### Q-012 — Companion wakes up, page says so
- **Page:** PAGE-001
- **Frame:** FRAME-013
- **States:** warming, error · down
- **REQ:** REQ-010, REQ-011
- **DES:** DES-013
- **Files:** `health-watch.js`, `app.js`, `companion.js`
- **Observable:** Opened while Bonsai loads: caption "还在醒来", warming hint, Enter keeps the text; ready shows the awake hint; down shows the restart hint
- **Acceptance:** Warming table passes with a fake clock; note Q-012; 1440, 390
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-010, Q-011
- **Status:** built

### Q-013 — The held voice is recorded as 16 kHz WAV
- **Page:** PAGE-001
- **Frame:** n/a — shows through Q-014 (FRAME-003, FRAME-011)
- **States:** success
- **REQ:** REQ-001, REQ-003
- **DES:** DES-014
- **Files:** `mic.js`, `recorder-worklet.js`
- **Observable:** a 2 s hold posts a valid 16 kHz mono WAV (≈ 64,044 B in the network log); the mic light goes off at release
- **Acceptance:** WAV header, size cap and downsampling; note Q-013
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-004
- **Status:** queued

### Q-019 — Listening starts when the mic opens
- **Page:** PAGE-001
- **Frame:** FRAME-003, FRAME-011
- **States:** loading · mic opening, listening
- **REQ:** REQ-001
- **DES:** DFB-005
- **Files:** `talk-button.js`, `mic.js`, `copy.js`
- **Observable:** pressing holds the button; "listening" and its seconds appear when the mic opens, and a slow first open shows `hints.micOpening` after 0.2 s
- **Acceptance:** 0.5 s and 60 s count from open; release before open shows `hints.tooShort`; note Q-013; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-013, Q-007
- **Status:** queued

### Q-014 — Spoken line becomes real words
- **Page:** PAGE-001
- **Frame:** FRAME-012, FRAME-016
- **States:** loading · transcribing, success
- **REQ:** REQ-001, REQ-002, REQ-008
- **DES:** DES-013, DES-014
- **Files:** `app.js`, `log.js`, `companion-client.js`, `voice-turn.js`, `copy.js`, `page.css`
- **Observable:** After release your turn shows tagged 语音 with "正在转成文字…", then the words replace it, then reply and mood
- **Acceptance:** Placeholder ≤ 0.3 s, words ≤ 13 s, reply ≤ 10 s; send paused meanwhile; 1440, 390
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-013, Q-011, Q-012
- **Status:** built

### Q-018 — Silence and voice failures are told
- **Page:** PAGE-001
- **Frame:** FRAME-016, FRAME-013
- **States:** empty · nothing heard, error · voice, warming
- **REQ:** REQ-003, REQ-011
- **DES:** DES-013
- **Files:** `app.js`, `copy.js`, `tests/voice-hints.test.js`
- **Observable:** Silence adds no turn and says nothing was heard; each voice failure shows its own hint; typing still works
- **Acceptance:** No `respond` on empty text; note Q-018; 1440, 390
- **Priority:** P1
- **Side:** both for the live check
- **Depends on:** Q-014
- **Status:** built

### Q-015 — Switch the interface language
- **Page:** PAGE-001
- **Frame:** FRAME-012..016
- **States:** success
- **REQ:** REQ-012, REQ-005
- **DES:** DES-015
- **Files:** `copy.js`, `index.html`, `page.css`, `app.js`, `companion.js`, `log.js`, `talk-button.js`
- **Observable:** `中文 | EN` at the stage top-right switches every word outside the chat at once; focus stays; a non-Chinese browser opens in English
- **Acceptance:** No Chinese outside chat in English; note Q-015; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-001, Q-007
- **Status:** built

### Q-016 — English layout fits both sizes
- **Page:** PAGE-001
- **Frame:** FRAME-014, FRAME-015, FRAME-016
- **States:** success, error (longest hint)
- **REQ:** REQ-012
- **DES:** DES-015
- **Files:** `page.css`, `index.html`
- **Observable:** On the phone in English the button reads "Hold to talk" whole; the longest caption stays on one line; the longest hint wraps without hiding the newest turn
- **Acceptance:** Widths in note Q-016; 1440, 768, 390, 375
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-015
- **Status:** built

### Q-017 — Latin accents render in the companion's face
- **Page:** PAGE-001
- **Frame:** n/a — no visual of its own
- **States:** success
- **REQ:** REQ-005
- **DES:** n/a
- **Files:** `subset-font.sh`, `lxgw-wenkai-subset.woff2`
- **Observable:** An English reply with "café" shows the accent in the same face as the rest
- **Acceptance:** Subset cmap has U+00C0–U+00FF; `offline.test.js` green
- **Priority:** P3
- **Side:** frontend
- **Depends on:** Q-006; the TTF (not committed)
- **Status:** queued

### Notes the rows point to
- **Q-010:** acceptance also names `fake-companion.test.js` repointed; body has `line` and the last 40 `history` entries, no language; `client.test.js` also covers the 200 parse. `fake-companion.test.js` imports move to `fake/fake-companion.js`; the importer rule still holds.
- **Q-011:** the six codes plus the page's own 16 s `timeout` and failed `fetch` → `unavailable` map to the send column of `01-ux.md` Codes. Text typed meanwhile keeps the failed line in front, joined by a space. Mood and older turns unchanged; the hint is `role=status`, up to 3 lines at 390.
- **Q-012:** checks at open and every 2 s until both parts are ready; 30 s down → `stillDown`; `awake` 4 s only if a not-ready hint was shown. Typed text is never lost.
- **Q-013, Q-019:** `wav.test.js` covers header fields, 2 s and 60 s lengths (60 s = 1,920,044 B, never more), 48 kHz and 44.1 kHz downsampling, silence stays silence. Nothing keeps the audio after the call (A9). Q-019 is DFB-005 (accepted, pending user at Plan): press only holds the button; listening starts when the stream opens. Trap, `docs/codemap.md` `mic.js`: browsers without the permission query treat a stream slower than 600 ms as an open prompt, and `hints.micOpening` shows at 0.2 s, so the two thresholds must not collide: the 0.2 s hint shows first, then 600 ms decides "prompt".
- **Q-018:** empty text → `hints.nothingHeard`; voice-column key per code; voice not ready → `hints.voiceNotReady` and nothing recorded; a voice line whose reply fails returns as text; a transcript over 1,500 characters is cut before sending [unverified default].
- **Q-015:** `copy.test.js` checks key parity zh/en; page check covers `aria-label`s, `html lang`, `aria-pressed`, Enter and Space, Shift+Tab from the input, working while pending, re-render of hint and caption, request has no language field.
- **Q-014:** the Q-010 request follows; static "…" under reduced motion; hold and send paused while transcribing and replying (≤ 13 s and ≤ 16 s page stops).
- **Q-016:** English phone button 154 px, input 196 px, Chinese button 124 px, no jump while listening; caption "Little Buddy · sad with you for a while" on one line at 390 (design estimate ≈ 341 px in 358 px, to be measured); `hints.sendDefect` in English ≤ 3 lines at 358 px, 2 at 559 px; 768 uses the phone layout (assumption E1).

### Dependencies (increment 1)
No new package. Browser APIs only: `fetch` + `AbortController`, `AudioContext` + `AudioWorklet`, `navigator.language`.

| Row | Waits for | Why |
|---|---|---|
| Q-015, Q-016, Q-017 | nothing from the backend | client-only |
| Q-013, Q-019 | nothing from the backend | recorder and encoder are tested without a server |
| Q-010, Q-011, Q-012, Q-014, Q-018 | be-developer: DES-001..010, 012 (+ DES-011 for voice) | each replaces fake data; client logic is unit-tested first, live check needs `server/` |

## Increment 2 — 2026-11-15

- **Author:** fe-engineer #17 · **Status:** draft (feasibility + queue, step 2 round 1) · run `companion-full-dev`. Ids Q-020… continue; never reused. No product code this round.
- Inputs: `01-ux.md` and `02-ui.md` § Increment 2, FRAME-017..025 (exported PNGs, 0 Figma calls), `docs/backend/01-requirements.md` REQ-014..031 (ids below are that file's), `docs/backend/03-detailed-design.md` DES-024..028, contract "Seam for increment 2".
- Backend half: DES-016..023 (`/api/speak`, `crisis`, `speech`, `lang`, `name`, health `tts`) are be-developer's; `server/` has no `speak`, `tts` or `crisis` yet (checked: `grep` over `server/main.js` finds none). Rows marked **backend first** are built and unit-tested against an injected `fetch` / fake client and must not wait; their live check does.
- **Memory (FLOW-014, FRAME-025, CMP-012, REQ-032..035, DES-029/030) is design only: tracked as skipped row Q-034 (no build), deferred to the user's judgement at Plan.** Its entry button, panel and `memory*` words are not built; the memory words stay out of `copy.js`.

### Earlier approved rows this round may change (PLAYBOOK §3I)
No `OBS-###` registry exists; rows stand in for observables. Hooks `fake-input`, `reply`, `companion` stay; `companion` keeps `data-mood` (the turn's mood) through breathing and pokes.

| Earlier row | What may change | Why |
|---|---|---|
| Q-001 empty page | a 清空 button, a name button and a speaker toggle appear; tab order gains them; the empty state must come back after clear | REQ-026, 028, 016; Q-022, Q-023, Q-026 |
| Q-003 moods / Q-009 reduce motion | `role=img` becomes a button; caption is no longer `aria-hidden` (holds buttons); caption `{name} · phrase`; new loops (swell, pokes) need the reduced-motion twin | REQ-027, 022, 028; `companion.test.js` may pin the old role |
| Q-004 / Q-019 hold to talk | pressing the button first stops reading, before the mic opens | REQ-018; Q-027 |
| Q-008 20 turns | a clear empties the log; chip and card sit inside a reply's log item | REQ-026, 025, 019 |
| Q-010 / Q-011 respond and failure | `respond` takes `name`, returns `lang`, `crisis`, `speech`; a reply arriving after a clear is dropped, its failure shows nothing | REQ-030, 025, 026; Q-020, Q-022 |
| Q-012 warming | `health()` gains `tts`; polling goes on after bonsai and stt are ready; tts adds no hint | `01-ux.md` rules; Q-026 |
| Q-015 / Q-016 language, English layout | new words in both languages; `{name}` keys; the English caption row and card must fit | REQ-012; Q-021, Q-032 |
| Q-006 offline | `/api/speak` is a same-origin request; audio from a Blob URL | REQ-014; Q-033 |

### Scaffold (increment 2)
Stack unchanged: static files, vanilla ES modules, `node:test`, no new package. New files: `web/js/name.js`, `web/js/poke.js`, `web/js/speaker.js`, `web/js/breath.js`, `tests/name.test.js`, `tests/poke.test.js`, `tests/speaker.test.js`, `tests/breath.test.js`, each named one by one in `package.json` `test`. Lucide icons added to the inline sprite in `web/index.html`: volume-2, volume-x, volume, wind, square (ISC notice already there).

### Feasibility notes (increment 2)
- Reuse of art: pokes and breathing only swap the existing mood layer (`companion.js` `render`) without touching `data-mood`; the glow stays because it is the root's background by `data-mood` (codemap `companion.css`). Swell scales the root element from the bottom centre, so the glow and art scale together; the focus ring scales with it (3 px, small). No new SVG but the 3-stroke pop ticks.
- Playback: `speak` returns a WAV Blob; one reusable `Audio` element, `URL.createObjectURL`, revoked after each part. Autoplay after a click or key is allowed in Chrome; Safari may refuse a first `play()` outside a gesture [unverified]. Mitigation in Q-025: unlock the element silently at the first Enter, click or press. A refused `play()` is a silent failure, per DES-025.
- Prefetch one part: 24 kHz mono 16-bit is 48,000 B/s of speech (arithmetic); 200 characters of speech is a few hundred KB, held in memory only.
- Health: `health-watch.js` stops at bonsai + stt. It must go on at 2 s until `tts` is `ready`. Trap: `onChange` then fires when only `tts` changes, with the same `hint`; `app.js healthHint(null)` clears `awake` early. Q-026 passes tts through a separate callback.
- Words: `copy.js` holds static strings; the 11 `{name}` keys keep their default-name text in the zh/en tables (so `verify-r1.test.js` stays true) and the live `copy` object gets the name substituted at `setLang` / `setName`.
- Font: every new character is in the subset (fe-ux #6, fontTools cmap); memory words stay out. Names may use any letter the user types; a character outside the subset falls back to Kaiti SC (see Q-017).
- Phone fit: fe-ui measured the longest caption row 297 px of 358 (FRAME-022, from the PNG); Q-032 re-measures in the browser.

### Design feedback raised
None. Checked and found fitting: clear at 8 px inset, caption row with toggle (297 / 358 px), 228 px phone art, chip and card in the log, memory design-only. Open assumptions below (A-I2-1..4) need no design change.

### Rows

### Q-020 — Client carries name, speech, crisis, tts
- **Page:** PAGE-001
- **Frame:** n/a — shows through Q-025, Q-030
- **States:** success, error
- **REQ:** REQ-014, REQ-025, REQ-030
- **DES:** DES-024
- **Files:** `companion-client.js`, `client.test.js`
- **Observable:** `respond` sends `name` when set and returns `lang`, `crisis`, `speech`; `speak` returns a WAV Blob; `health()` returns `tts`
- **Acceptance:** injected `fetch`; `speak` stops at 11 s; an abort stays an `AbortError`; note Q-020
- **Priority:** P1
- **Side:** both (backend first for the live check)
- **Depends on:** Q-010
- **Status:** built

### Q-021 — Increment 2 words in both languages
- **Page:** PAGE-001
- **Frame:** FRAME-023
- **States:** success
- **REQ:** REQ-012, REQ-028
- **DES:** DES-027
- **Files:** `copy.js`, `copy.test.js`
- **Observable:** every key of Words (increment 2), memory words excluded, reads in zh and en; the 11 `{name}` keys follow the saved name
- **Acceptance:** zh and en key parity; default name reads exactly as Words (increment 1); note Q-021
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-015
- **Status:** built

### Q-022 — Clear in one click
- **Page:** PAGE-001
- **Frame:** FRAME-017, FRAME-020, FRAME-023
- **States:** empty · cleared
- **REQ:** REQ-026, REQ-029
- **DES:** DES-028
- **Files:** `index.html`, `page.css`, `app.js`, `log.js`
- **Observable:** 清空 empties the log at once; empty state returns, companion neutral, cleared hint, focus in the input; next `history` is `[]`
- **Acceptance:** works while a reply is pending (dropped); name and input text kept; note Q-022; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-021
- **Status:** built

### Q-023 — Rename in place
- **Page:** PAGE-001
- **Frame:** FRAME-019, FRAME-023
- **States:** renaming, success
- **REQ:** REQ-028, REQ-029, REQ-030, REQ-031
- **DES:** DES-027
- **Files:** `index.html`, `page.css`, `companion.js`, `app.js`, `name.js`, `name.test.js`, `package.json`
- **Observable:** clicking the caption's name opens a field; Enter saves, Esc keeps; the name shows everywhere, survives reload and clear, rides each request
- **Acceptance:** `name.test.js` per FX-012; note Q-023; 1440, 390
- **Priority:** P1
- **Side:** both (backend first for Bonsai using it)
- **Depends on:** Q-020, Q-021
- **Status:** built

### Q-024 — Poke the companion
- **Page:** PAGE-001
- **Frame:** FRAME-024
- **States:** poke
- **REQ:** REQ-027, REQ-022
- **DES:** DES-028
- **Files:** `index.html`, `companion.js`, `companion.css`, `poke.js`, `poke.test.js`, `app.js`, `package.json`, `companion.test.js`
- **Observable:** clicking the companion (or Enter) plays one of three reactions with its caption word, then the mood returns
- **Acceptance:** six pokes give three or more reactions, none twice running; back ≤ 2 s; note Q-024; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-023
- **Status:** built

### Q-025 — The reply is read aloud
- **Page:** PAGE-001
- **Frame:** FRAME-017, FRAME-020
- **States:** success · speaking, error · one reading
- **REQ:** REQ-014, REQ-015, REQ-017
- **DES:** DES-025
- **Files:** `speaker.js`, `speaker.test.js`, `app.js`, `package.json`
- **Observable:** a reply appears, then its voice, parts in order, in its language; a failed part stays silent
- **Acceptance:** text and mood never wait; one part ahead; a new reply stops the old; note Q-025
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-020
- **Status:** built

### Q-026 — Speaker toggle and voice-not-ready
- **Page:** PAGE-001
- **Frame:** FRAME-017, FRAME-019, FRAME-023
- **States:** success · muted, warming · voice reply not ready
- **REQ:** REQ-016, REQ-017
- **DES:** DES-025
- **Files:** `index.html`, `page.css`, `speaker.js`, `health-watch.js`, `app.js`, `health-watch.test.js`
- **Observable:** the toggle mutes in ≤ 0.5 s, unmutes without replay; not-ready shows a bare icon and tooltip, Enter and hold still work
- **Acceptance:** on at open; polling goes on until tts ready; no tts hint; note Q-026
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-025, Q-023
- **Status:** built

### Q-027 — Talking or sending stops the voice
- **Page:** PAGE-001
- **Frame:** n/a — no visual of its own
- **States:** success · speaking
- **REQ:** REQ-018
- **DES:** DES-025
- **Files:** `talk-button.js`, `app.js`, `talk-button.test.js`
- **Observable:** press of the talk button or a send stops a reading in ≤ 0.5 s, before the mic opens
- **Acceptance:** the transcript holds none of the reply's words; a stopped part's request is aborted; note Q-027
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-025
- **Status:** built

### Q-028 — Breathing offered after a worried reply
- **Page:** PAGE-001
- **Frame:** FRAME-017, FRAME-020
- **States:** success · breathing offer
- **REQ:** REQ-019
- **DES:** DES-028
- **Files:** `log.js`, `page.css`, `app.js`
- **Observable:** an `unpleasant-high` reply (not crisis) carries 一起深呼吸？ under it; other moods and crisis do not; the next send removes it
- **Acceptance:** chip in view after the reply; clear removes it; note Q-028; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-021
- **Status:** built

### Q-029 — Breathing guide
- **Page:** PAGE-001
- **Frame:** FRAME-018, FRAME-021, FRAME-024
- **States:** breathing
- **REQ:** REQ-020, REQ-021, REQ-022
- **DES:** DES-028
- **Files:** `breath.js`, `breath.test.js`, `companion.js`, `companion.css`, `log.js`, `app.js`, `package.json`
- **Observable:** chip starts it: calm face, swell 4 s, settle 6 s, three times, caption counts; 停下, Esc, send or talk ends it ≤ 1 s
- **Acceptance:** fake-clock test; reading stopped; pokes ignored; `data-mood` kept; note Q-029
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-028, Q-024, Q-025
- **Status:** built

### Q-030 — Help card under a crisis reply
- **Page:** PAGE-001
- **Frame:** FRAME-019, FRAME-022
- **States:** success · crisis
- **REQ:** REQ-025, REQ-024
- **DES:** DES-026
- **Files:** `index.html`, `log.js`, `page.css`, `app.js`
- **Observable:** a reply with `crisis: true` shows the 988 / 911 card under it in the interface language; 收起 removes it; keep talking works
- **Acceptance:** one card; none without the flag; focus unmoved on arrival; note Q-030; 1440, 390
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-020, Q-021
- **Status:** queued

### Q-031 — Reduce motion for the new moves
- **Page:** PAGE-001
- **Frame:** FRAME-024
- **States:** breathing · reduce motion, poke
- **REQ:** REQ-022
- **DES:** DES-028
- **Files:** `companion.css`, `page.css`
- **Observable:** with OS reduce motion on, breathing and pokes change face and word only; chip and card appear at once; speaking waves are still
- **Acceptance:** emulated `prefers-reduced-motion: reduce`: no running animation after each; 1440, 390
- **Priority:** P2
- **Side:** frontend
- **Depends on:** Q-024, Q-026, Q-029, Q-030
- **Status:** queued

### Q-032 — New controls fit both sizes and both languages
- **Page:** PAGE-001
- **Frame:** FRAME-020, FRAME-021, FRAME-022
- **States:** success, error (longest caption row)
- **REQ:** REQ-012, REQ-028
- **DES:** n/a
- **Files:** `page.css`, `index.html`
- **Observable:** on the phone a long name plus the toggle stays one line or wraps without hiding the face; clear never covers it
- **Acceptance:** widths in note Q-032 at 1440, 768, 390, 375
- **Priority:** P2
- **Side:** frontend
- **Depends on:** Q-022, Q-023, Q-026, Q-030
- **Status:** queued

### Q-033 — Still offline with voice
- **Page:** PAGE-001
- **Frame:** n/a — offline looks like success
- **States:** offline
- **REQ:** REQ-014, REQ-029
- **DES:** n/a
- **Files:** `offline.test.js`
- **Observable:** with Wi-Fi off a session with a reply read aloud works; the only new requests are same-origin `/api/speak`
- **Acceptance:** no new external host in `web/`; `offline.test.js` green; network log lists only localhost
- **Priority:** P2
- **Side:** both for the live check
- **Depends on:** Q-025
- **Status:** queued

### Q-034 — Memory panel (design only)
- **Page:** PAGE-001
- **Frame:** FRAME-025
- **States:** memory off, memory on, memory · forget
- **REQ:** REQ-032, REQ-033, REQ-034, REQ-035
- **DES:** DES-029, DES-030
- **Files:** none — nothing is built this increment
- **Observable:** none: drawn for the user to judge at Plan
- **Acceptance:** none; not verified
- **Priority:** P3
- **Side:** both
- **Depends on:** none
- **Status:** skipped — design only, not built in increment 2 (user 2026-11-14)

### Increment 2 notes the rows point to
- **A-I2-1 (assumptions [unverified]):** a clear while a reply is pending ends the pending state at once; the late reply or failure is dropped with no hint and no words returned (A24). The card stays under its own crisis reply until 收起, clear, or a later crisis reply moves it ("one card"). Names already in earlier turns are never rewritten.
- **Q-020:** `respond(line, history, name)`: `name` null or absent is left out of the body; a fresh `speak` aborts itself at 11 s → `timeout`; non-2xx → body `error`; `health()` returns `tts` as given. A 200 body missing `speech` reads as `[]` (silent), missing `crisis` as `false`; the page never guesses `lang`. Built (fe-engineer #18): a caller abort rethrows the fetch's own AbortError (its `.code` is not one of CODES); `speak` rejects `failed` on an empty 200 body; `respond` keeps `lang` as given (undefined if absent); live check against :4400 passed (health tts ready, respond, speak 57644 B audio/wav).
- **Q-021:** `{name}` keys: `title`, `inputLabel`, `typing`, `companionCaption`, `companionName`, `hints.warming`, `awake`, `unreachable`, `stillDown`, `sendUnavailable`, `sendTimeout`. Memory words are not added. `setName(name)` re-substitutes and the app re-renders. Built (fe-engineer #19): `copy.js` adds the 24 increment-2 keys + `hints.cleared`, `setName`/`getName`; `breathName` and `renameName` are functions of the name; `tests/copy-increment2.test.js` (7 tests, in `package.json` test); app.js does not call setName yet (Q-023).
- **Q-022:** `log.js` gains `clear()`, which puts the original empty state back (kept already as `emptyOriginal`). `app.js` keeps a generation counter: a reply or transcript from an earlier generation is dropped. A callback list lets later rows (reading, breathing, chip, card) register what clear stops. Pending voice transcript: the transcribing turn is removed. Built (fe-engineer #20): `onClear(fn)` is exported from `app.js`; `clearChat` bumps the generation, empties history, `log.clear()`, `setPending(false)`, mood neutral, runs callbacks, shows `hints.cleared`, focuses the input; a stale respond or transcript returns silently (per-utterance guards, `voice-turn.js` untouched); `tests/clear.test.js` (2 tests, in `package.json` test); live check against :4400 at 1440 and 390 passed, including a clear while a reply was pending.
- **Q-023:** `name.js` = DES-021 `cleanName` (keep `[\p{L}\p{N} \-'·]`, NFC, 12 code points, default names → absent), `localStorage['companion.name']`; both languages and the default names tested against FX-012 expectations. The caption becomes a row (name button, " · phrase", speaker slot) and loses `aria-hidden` as a whole; the mood phrase stays announced from the companion's own name. Names shown by `textContent` only. Emptied or default-named → default for the interface language. Built (fe-engineer #21): `web/js/name.js` (cleanName = DES-021 rule, loadName/saveName on `companion.name` with a throwing or missing storage tolerated, typingFilter, createRename: name button becomes a field with the text selected and `nameNote` under it, Enter or click away saves, Esc keeps, emptied or default-named → default); the caption is `.companion__caption` = name button · phrase (aria-hidden) · empty speaker slot (Q-025), row not aria-hidden; app.js loads the name before the first render, every `respond(line, history, savedName)` carries it, a save re-renders through applyCopy, clear leaves it; the phone note sits above the row because the 280 px stage clips below it; `tests/name.test.js` (8 tests, FX-012 7/7, page rule equals gateway rule).
- **Q-024:** `poke.js` `nextPoke(prev, random)` never repeats; `companion.js` gains `showFace(mood)` that swaps the layer without touching `data-mood` or the glow; ignored while breathing; a poke during a poke plays the next one; a reply's mood change during a poke applies when it ends. `role=button`, described by `pokeHelp`; `companion.test.js` is updated if it pins `role=img` (listed, with the reason, in the build). Built (fe-engineer #22): `web/js/poke.js` (POKES tickle/oops/here with borrowed faces, `nextPoke`, `createPoker({showFace,setMotion,isBlocked})` holding 1.5 s then a 240 ms crossfade back, a poke mid-poke plays the next, `reset()` for clear); `companion.js` `showFace(face|null, wordFn)` and `setMotion(id)`, `setMood` waits while a poke shows; the companion is `role=button tabindex=0` described by `#poke-help` (pokeHelp), click, Enter, Space (no repeat) poke; ticks svg for oops, focus ring 3 px Cocoa 2 px outside the disc; reduced motion keeps face, word and still ticks; no existing test pinned `role=img`; `tests/poke.test.js` (6 tests, in `package.json` test); live check against :4400 at 1440 and 390 passed (back in about 1.55 s). The breathing row must pass `isBlocked` to `createPoker` (poker is internal to app.js).
- **Q-025:** `speaker.js` `createSpeaker({speak, audio, now})`: `say(speech, lang)` plays part 1 at once, prefetches part 2, plays on end; `stop()` pauses, revokes, aborts in-flight and drops the rest; any failure ends silently. Gate: toggle on and `tts` ready. Unlock: first user gesture plays a silent clip [unverified for Safari]. Built (fe-engineer #23): `web/js/speaker.js` `createSpeaker({speak, createAudio, url, makeBlob, isEnabled})` → `{say(speech, lang), stop(), unlock(), active}`; one reusable Audio element and object URLs revoked after each part; part 1 asked at once, part n+1 asked when part n arrives (one ahead); a failed, refused or timed-out part ends that reading silently (no hint, no throw; rest dropped); `stop()` pauses, revokes, aborts the in-flight `speak`. app.js calls `say(speech, lang)` after `log.addReply` and `setMood`; `speaker.stop()` runs at every send, at a press-to-talk (inside the `isPaused` callback) and in `onClear`; the first pointerdown or keydown calls `unlock()` (silent 10 ms WAV built in code). `isEnabled` defaults true: Q-026 passes the toggle and the tts gate. `tests/speaker.test.js` (12 tests). Live check: reply text and speak part 1 in the same tick, part 2 requested when part 1 arrived, parts played in order (headless Chrome, autoplay flag, fetch and play hooks).
- **Q-026:** toggle `aria-pressed` is the user's choice even when not ready; tooltip is the `aria-describedby` and shows at 500 ms hover or focus. `health-watch.js` adds `speakReady` and keeps polling every 2 s until it is true; `onChange` for a tts-only change must not call `healthHint`. Existing watch tests keep passing. Built (fe-engineer #24): toggle `.speaker-toggle` (button, `data-testid=speaker`, `aria-pressed`, name `copy.speaker`) in the caption slot, tooltip `#speaker-tip` (hover after 500 ms via CSS delay, instant at `:focus-visible`; opens upward on the phone because the stage clips below the row); three Lucide symbols volume-2 / volume-x / volume; on at every open, not remembered; classes is-muted, is-notready, is-speaking (waves fade in turn, still with reduce motion). `health-watch.js`: state shape unchanged; new `onTts(on)` callback, `ttsReady` getter (named `ttsReady`, not `speakReady`), `ttsFailed(code)`; checks go on every 2 s after bonsai+stt are ready until `tts` is `ready` (a body without `tts` counts as ready); tts never sets a hint or touches state. `speaker.js` gains `onActive(bool)`. app.js: `isEnabled = speakerOn && watch.ttsReady`; mute calls `speaker.stop()`; a speak failing with not_ready/unavailable calls `watch.ttsFailed`. Tests: 4 cases in health-watch.test.js, 2 in speaker.test.js, `tests/speaker-toggle.test.js` (3).
- **Q-027:** `talk-button.js` gets an `onPress` callback called before the stream opens; Enter-send and clear also call `speaker.stop()`. Built (fe-engineer #25): `createTalkButton` takes `onPress`, called first in `press()` (before the permission read and the stream, before `isPaused`, in a try so it never breaks a press); app.js passes `onPress: () => speaker.stop()` and keeps the `speaker.stop()` in `isPaused` (the Q-025 wiring test pins it). Send, Enter, voice send and clear already stopped it (Q-025). A stop aborts the part's request and pauses audio (speaker.js). +3 tests in talk-button.test.js.
- **Q-028, Q-029:** chip shown only when the newest reply is `unpleasant-high` and not crisis; `breath.js` (fake clock): inhale 4 s, exhale 6 s, ×3, phase word announced once, seconds never announced; Esc, 停下, send, talk, clear and a new reply end it, restoring the turn's face; pokes ignored; starting stops the reading. Built (fe-engineer #26, Q-028 only): `log.js` `showOffer(onStart)` / `removeOffer()` / `offerShown` (chip in its own `li.turn--offer`, 36 px, 12 px under the reply, 16 px indent; one at a time; a new reply, a clear and a language switch handled); `app.js` `shouldOfferBreath(mood, crisis)` after `setMood`, `log.removeOffer()` at every send and in `onClear`, and `onBreathStart(fn)` is the hook for Q-029 (click calls `fn({chip, mood})`; the chip stays the offer until Q-029 swaps it to 停下); `i-wind` Lucide symbol and `.breath-chip` CSS; `tests/breath-offer.test.js` (6 tests, in `package.json` test); live check against :4400 at 1440 and 390 (reply unpleasant-high, chip 12 px under, in view, clear removes it). Built (fe-engineer #27, Q-029): `breath.js` (`createBreath`, `stepAt`; fake-clock tests; one tick a second, 4 in / 6 out ×3, ends `done` at 30 s, `stop` ends at once); `app.js` wiring (start = `poker.reset`, `speaker.stop`, calm face, chip → 停下; ends on chip, Esc, send, talk press, clear, new reply or 30 s; `createPoker` now has `isBlocked: () => breath.active`); `companion.js` `setBreathing` / `announce` (name `breathName`, sr-only status says the phase word once per phase, never the seconds); `log.js` `setOfferStop`; `companion.css` `.is-breathing` swell (1.08, phone 1.04, from the bottom centre, glow disc with it; part loops stopped; none under reduced motion); `i-square` symbol; `tests/breath.test.js` (9). Live (headless Chrome, :4400 page, respond stubbed): 1440 swell 1.08 at 4 s and back to 1 at 10 s, phone 1.04; caption 吸气… 4 → 呼气… 6; pokes ignored; Esc and clear end it; 30 s ends by itself, face and chip back; reduced motion: no swell, caption still counts.
- **Q-030:** `role=region` named `crisisLabel`, three lines, no links, no focus move on arrival; 收起 moves focus to the input.
- **Q-031:** every new animation has its reduced-motion twin from `02-ui.md` Motion (increment 2); speaking waves stay shown.
- **Q-032:** target widths: caption row 297 of 358 px at 390 (fe-ui, to re-measure); 334 px card; English card 4 lines; phone name target ≥ 28 px tall; a long name wraps the phrase to a second line and the art shrinks 20 px.
- **Q-033:** `offline.test.js` already scans `web/` for hosts; add `/api/speak` as the same-origin case if it names paths.
- **Deferred (design only, no row):** FLOW-014 memory, FRAME-025, CMP-012, `memory*` words, DES-029/030, REQ-032..035; to be judged at Plan.

### Dependencies (increment 2)
No new package. Browser APIs: `Audio` + `URL.createObjectURL`, `localStorage`, `matchMedia`.

| Row | Waits for | Why |
|---|---|---|
| Q-021, Q-022, Q-024, Q-027, Q-028, Q-029, Q-031, Q-032 | nothing from the backend | page-only |
| Q-020, Q-023, Q-025, Q-026, Q-030, Q-033 | be-developer: DES-016..023 (`/api/speak`, `crisis`, `speech`, `lang`, `name`, health `tts`) for the live check | client logic is unit-tested first |
| Build order | Q-020, Q-021, then Q-022, Q-023, Q-024, Q-025, Q-026, Q-027, Q-028, Q-029, Q-030, Q-031..033 | `app.js`, `companion.js`, `copy.js` are shared, so one row at a time |
