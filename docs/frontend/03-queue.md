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
- **Status:** built (fe-engineer #11)

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
- **Files:** `app.js`, `log.js`, `companion-client.js`
- **Observable:** After release your turn shows tagged 语音 with "正在转成文字…", then the words replace it, then reply and mood follow
- **Acceptance:** Placeholder ≤ 0.3 s, words ≤ 13 s, reply ≤ 10 s; send paused meanwhile; 1440, 390
- **Priority:** P1
- **Side:** both (backend first)
- **Depends on:** Q-013, Q-011, Q-012
- **Status:** queued

### Q-018 — Silence and voice failures are told
- **Page:** PAGE-001
- **Frame:** FRAME-016, FRAME-013
- **States:** empty · nothing heard, error · voice, warming
- **REQ:** REQ-003, REQ-011
- **DES:** DES-013
- **Files:** `app.js`, `log.js`, `copy.js`
- **Observable:** Silence adds no turn and says nothing was heard; each voice failure shows its own hint; typing still works
- **Acceptance:** No `respond` on empty text; note Q-018; 1440, 390
- **Priority:** P1
- **Side:** both for the live check
- **Depends on:** Q-014
- **Status:** queued

### Q-015 — Switch the interface language
- **Page:** PAGE-001
- **Frame:** FRAME-012..016
- **States:** success
- **REQ:** REQ-012, REQ-005
- **DES:** DES-015
- **Files:** `copy.js`, `index.html`, `page.css`, `app.js`
- **Observable:** `中文 | EN` at the stage top-right switches every word outside the chat at once; focus stays; a non-Chinese browser opens in English
- **Acceptance:** No Chinese outside chat in English; note Q-015; 1440, 390
- **Priority:** P1
- **Side:** frontend
- **Depends on:** Q-001, Q-007
- **Status:** queued

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
- **Status:** queued

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
