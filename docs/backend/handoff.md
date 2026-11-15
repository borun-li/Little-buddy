# Handoff — run companion-full-dev

## be-analyst #2 · Phase 2 · round 1 · 2026-11-14T23:03:23Z
Task: place FX-001..FX-008 under tests/fixtures/candidates/FX-nnn/ with expected outputs from the REQs; list where 02/03 miss or contradict REQ-001..REQ-012.
Changed: tests/fixtures/candidates/FX-001..FX-008/ (new) — input.json|input.wav, expected.json, meta.json each (24 files).
Result: 8/8 fixtures have input, expected, meta (req, source, compare valid per gatelib _valid_compare); 4 WAVs parsed: fmt 1/mono/16000/16-bit (+FLLR chunk on afconvert output); 6 design contradictions returned to the orchestrator. Gate p2 not run.
Next agent must know:
- Pitfalls: replies are checked by computed properties (meta `rules`), compared exact; mood exact; audio uses numeric:0.15 on WER/CER vs 0. FX-003 scores no mood (not a REQ-006 fixture).
- Pitfalls: zsh `==` in an echo argument fails ("= not found"); quote it.
- Tried, did not work: nothing.
- Left open: FX-005 text_reference [unverified] (only source is whisperkit-cli output, be-analyst-1-whisperkit-hello.log:3) — user confirms at Plan. FX-004 cases 05/10 neutral vs bench pleasant-low (REQ-006 margin 1).
- Left open: history replies are verbatim raw Bonsai (pre-shapeReply), bench-raw-9B.log:146 and :148.
Read beyond the list: docs/frontend/00-requirements.md A1; idea.md § 情绪模型 — mood labels; ~/.claude/gates/gatelib/checks.py:812-881 — meta/compare rules.
Next agent reads: tests/fixtures/candidates/FX-00n/meta.json (rules, runs, pass, manual)

## be-architect #3 · step 4 (design amendment) · round 1 · 2026-11-15T00:32:17Z
Task: resolve be-developer #1's design gaps 1–3 (08 § Design gaps) with one rule each.
Changed: docs/backend/03-detailed-design.md (+26/-10) — DES-002 `historyBudget: 2000` (replaces historyBudgetChars 6000) + `missingHints()`; DES-007 windowOf weight = len + 1.5 × Han; DES-009 `hanCount()` export, zh when ceil(han/2) ≥ English words, example "I love 火锅" → en (1:2); DES-001 step 1 prints missingHints; §9 respond row (seam text changed). docs/backend/02-architecture.md (+7/-5) — §2 row, §4 new row 前文窗口 + 语言 row, §5 rows. docs/backend/logs/be-architect-3-window.log (new).
Result: cold reply+mood on idle instance A: 6000-char-class windows 13.3 s–504; weighted 2000 → zh 6.7–7.1 s, en 6.5–7.0 s (n=4 each); prefill ≈ 130 token/s dominates (direct timings). New lang rule passes all TC-008 cases + TC-037 (node eval, not a test run). DES ≤ 117 words, prose > 50 = [] (gatelib parsers). Gate p2 not run.
Next agent must know:
- Code to change: `server/config.js` (limits key + missingHints), `server/bonsai.js` windowOf, `server/lang.js` (hanCount, ceil(han/2)), `server/main.js` step 1 hints.
- Tests to change: TC-013 (expected 40; 10; 10 stays; 20; 5×1500 → 1; Han case 21×'好'×40 → 20), TC-015 (limits deepEqual `historyBudget: 2000`), TC-031 fakes (40×200 → 1+10+1 messages); TC-016 should add missingHints cases; TC-008/TC-037 code unchanged, 04 text + TC-037 comment stale.
- Pitfalls: latency drifted ~20 % slower over 15 min of back-to-back runs (thermal?); en 1000-char run 1 = 10.5 s outlier (1/30, unexplained).
- Tried, did not work: plain char budget (zh needs ~850, starves en); block-wise window (page sends last 40, backend cannot align blocks without a seam change).
- Left open: 60 s zh voice line (300 chars) at the new window unmeasured (old window 12.2–13.4 s respond); orchestrator re-copies 03 §9 respond row into contract §2.
Read beyond the list: ~/.claude/gates/gatelib/docs.py:48-51 (CJK counted 2 per word); docs/backend/04-test-plan.md TC-008/013/031/037.
Next agent reads: docs/backend/03-detailed-design.md DES-001 step 1, DES-002, DES-007 windowOf comment, DES-009; docs/backend/logs/be-architect-3-window.log

## fe-ux #4 · step 2 (frontend feedback, increment) · round 1 · increment 1 · 2026-11-14T23:43:51Z
Task: decide DFB-005 (listening starts when the mic stream opens) and, if accepted, update FLOW-005 / PAGE-001 (increment 1) listening rows.
Changed: docs/frontend/06-feedback.md — DFB-005 decision, decided-by, needs-user filled. docs/frontend/01-ux.md § Increment 1 — FLOW-005 step "Mic open → listening + seconds", Boundary "under 0.5 s listening" (80 words); PAGE-001 (increment 1) rows "loading · mic opening" and "listening"; hint rule for `hints.micOpening`; Words row `hints.micOpening` zh/en; contract §2 "hold to talk" state-loading row.
Feedback: DFB-005 accepted, pending user at Plan; needs user: yes (changes the listening moment confirmed at the Prototype stop 2026-11-14). One-line recommendation is in the DFB-005 decision cell.
Result: gatelib docs.words: FLOW-005 80, first PAGE-001 block 196 (unchanged); prose units > 50 words = []; DFB-005 row parses to 9 cells — evidence: scratchpad wc.py run in this session. Gate not run by me. 0 Figma calls.
Next agent must know:
- Pitfalls: the 0.5 s and 60 s rules now count from the stream opening, not the press; release before it opens → `hints.tooShort`; `hints.micOpening` shows only if the stream is still closed 0.2 s after press (no flash on fast opens).
- Pitfalls: codemap mic trap "no permission query → stream slower than 600 ms is treated as a prompt" may now misread a slow granted first open; fe-engineer decides how Q-013 tells them apart (FLOW-003 rule stands: a hold that raised the prompt never records).
- Tried, did not work: keeping the stream open between holds (would keep the mic indicator on; Q-013 needs it off at release) — rejected.
- Left open: user's answer at the Plan stop; fe-ui may need to check the English hint width (hint line wraps, so likely none); Q-013 "Depends on DFB-005" clears once the user answers.
Read beyond the list: ~/.claude/gates/gatelib/frontend.py:57,150-199,308-383 — block, length and feedback parsers.
Next agent reads: docs/frontend/06-feedback.md DFB-005; docs/frontend/01-ux.md § Increment 1 FLOW-005, PAGE-001 (increment 1) rows "loading · mic opening" / "listening", Words `hints.micOpening`

## fe-ui #5 · step 2 (frontend UI, increment) · round 2 · increment 1 · 2026-11-14T23:36:23Z
Task: fix FE2.components (CMP-006 focus state readable) and FE2.prose (5 units over 50 words in 02-ui.md § Increment 1); round 1: switch, English frames, DFB-004, D-004.
Changed: docs/frontend/02-ui.md — round 2: CMP-006 `**States:**` line now inline "default, hover, focus (…FRAME-016 "EN focused"), active = selected"; CMP-006 Behaviour, you-transcribing, Caption, Phone English (DFB-004) and the Frames (increment 1) lead paragraph split into bullets, meaning unchanged. Round 1: § Increment 1, D-004 in place, DFB-004 decided, FRAME-012..016 exports; Figma FRAME-012 28:576, 013 28:627, 014 28:654, 015 28:669, sheet 016 27:565 (CMP-006 set 27:568).
Feedback: DFB-004 accepted (round 1; English phone button hugs label 154 px, input 196 px); needs user: no.
Result: gatelib parsers run by me on 02-ui.md: prose units > 50 words = [], components without focus in States = [] — evidence: docs/frontend/gates/fe-ui-latest.json (round 1 fail, gate not re-run by me). Figma calls: 12 in round 1, 0 in round 2.
Next agent must know:
- Pitfalls: gatelib docs.field reads only the text on the `**States:**` line itself; sub-bullets do not count.
- Pitfalls: Figma CMP-002 main still shows the retired tag "语音 · 示例文字" (FRAME-003, FRAME-010); spec and FRAME-012 win.
- Tried, did not work: phone switch at 12 px inset sat over the pleasant-high sparkle; 8 px used.
- Left open: FRAME-001..011 do not show the switch (not redrawn, budget); English laptop listening and laptop warming not drawn (words/caption swap only); longest English caption width is an estimate.
Read beyond the list: ~/.claude/gates/gatelib/docs.py:54-70, 115-119 — prose and field parsers.
Next agent reads: docs/frontend/02-ui.md § Increment 1 (CMP-006, CMP-003 increment 1, Frames (increment 1)); docs/frontend/06-feedback.md DFB-004

## fe-engineer #7 · step 3 (frontend build Q-013) · round 1 · increment 1 · 2026-11-15T00:50:00Z
Task: Q-013 — the held voice recorded as WAV PCM16 LE mono 16 kHz, in memory only.
Changed: web/js/mic.js (+downsample, encodeWav, wavFromChunks, WAV_RATE, MAX_SECONDS; meter() now records through an AudioWorklet and has wav()); web/js/recorder-worklet.js (new); tests/wav.test.js (new, 7 tests); package.json (wav.test.js added to `test`).
Feedback: none.
Result: `npm test` 30 pass / 0 fail. Real check: WAV from encoder (2 s 440 Hz tone at 48 kHz, two chunks, 64,044 B) POSTed to http://127.0.0.1:4400/api/transcribe -> 200 `{"text":""}`; control (non-WAV bytes) -> 400 bad_request. Not run in a browser: no mic here, so the worklet path and the mic light are unverified. 0 Figma calls.
Next agent must know:
- Call `await hold.mic.wav()` (Blob audio/wav, or null if the worklet failed/nothing heard) BEFORE `close()`. wav() stops the tracks at once (mic light off), waits up to 300 ms for the worklet flush, then closes the context and drops the chunks. close() alone discards the audio. talk-button.js `stop()` currently calls close() first: Q-019/Q-014 must call wav() there (talk-button.js not touched by me).
- Pitfalls: the worklet module loads after the stream opens (async addModule, local file); the first few ms of speech can be missed. Recording is capped at 60 s of input; encodeWav never exceeds 1,920,044 B.
- Pitfalls: 600 ms prompt rule untouched (talk-button.js unchanged).
- Tried, did not work: nothing.
- Left open: browser check of the worklet (Chrome/Safari/Firefox) at Q-019/Q-014.
Next agent reads: web/js/mic.js; tests/wav.test.js

## fe-engineer #6 · step 3 (frontend build Q-010) · round 1 · increment 1 · 2026-11-15T00:58:00Z
Task: Q-010 — a typed line gets a real reply and mood through web/js/companion-client.js (DES-013). Placed beside #7's section, not over it: two fe-engineers ran in parallel.
Changed: web/js/companion-client.js (rewritten: createClient({fetch, timers}), respond / transcribe(audio) / health, CODES, MOODS); web/js/fake/fake-companion.js (createFakeCompanion moved here, tests only, `git mv` was blocked so the old path is a plain move: git sees delete + new); web/js/app.js (transcribe(audio) passthrough; send catches respond errors via onSendFailed); tests/client.test.js (new, 7 tests); tests/fake-companion.test.js (imports); package.json (client.test.js added to `test`); docs/codemap.md (companion-client, fake); docs/frontend/evidence/build/Q-010-1440.png, Q-010-390.png.
Feedback: none (the frames FRAME-014/015 are what is built; the CMP-006 switch, English words and caption are Q-015/Q-016, so the page still shows Chinese chrome).
Result: `npm test` 37 pass / 0 fail. Live at 127.0.0.1:4400 (Chromium, en-US, 1440 and 390): "I passed my exam today, so happy!" -> reply in English, mood pleasant-high, 1.8 s; follow-up "Now I feel really sad." -> unpleasant-low, reply recalls the success; only POST /api/respond, no console error. Latency measured with Playwright from Enter to the reply element.
Next agent must know:
- Pitfalls: window.setTimeout called as timers.setTimeout throws Illegal invocation in browsers; node does not, so only a browser run found it. Default timers are arrow wrappers.
- Pitfalls: app.js onSendFailed is the Q-011 hook: today it only removes the typing dots (`.turn--typing`, DOM query, replace with a log.js method), unpauses, console.warn; the own turn stays and the text is not given back, no hint. A failed send still shows nothing to the user until Q-011.
- Pitfalls: onUtterance now calls transcribe(audio) with no audio (talk-button does not pass it): voice is broken until Q-014 wires mic.wav(); the catch swallows it. Voice demo does not work between Q-010 and Q-014.
- Tried, did not work: nothing.
- Left open: Latin glyphs in the WenKai subset (Q-017); hint/caption English (Q-015/016).
Next agent reads: web/js/companion-client.js; tests/client.test.js; app.js onSendFailed and onUtterance

## orchestrator · Phase 2 · Plan stop · 2026-11-14T23:46:52Z
State: p1 pass, p2 pass; frontend increment 1 gates fe-ux (user waiver FE1.flow-length FLOW-001/002 only), fe-ui, fe-queue, fe-plan pass. Branch companion-full-dev. Figma 12/15 this run.
Decided: risk normal (user, kickoff); 9B, setup step, argmax-oss-swift 1.1.1, port 4317 = be-architect recommendations, pending user; DFB-004 by fe-ui #5; DFB-005 accepted by fe-ux #4 pending user; PAGE-001 increment block accepted as increment structure (orchestrator).
Open: Plan answers (design + 4 decisions, fixtures FX-001..008 lock, DFB-005, defaults in state.json open_questions).
Next: on yes → gate.py fixtures-approve --by user; log human --stop Plan; Phase 4 build: baseline, mark be-tester then be-developer, dispatch be-developer (DES-001..012, build order 03 §8; stt first for the ~390 s warm-up) and be-tester (plan) in one message; frontend rows Q-015/016/017/013/019 can follow once backend writer is back (one team's writers at a time).

## be-tester #1 · Phase 4 (plan + tests) · round 1 · 2026-11-15T00:20:00Z
Task: write 04-test-plan.md from 01 and 03 only, covering REQ-001..012 and FX-001..008, and implement the tests under tests/ so Phase 5 can run them.
Changed: docs/backend/04-test-plan.md (new); tests/server-helpers.js, server-unit.test.js, server-fakes.test.js, server-live.test.js, server-boot.test.js, tests/support/fake-stt.cjs, fake-llama.cjs (new); package.json (+1 script line `test:backend`).
Result: 62 automated TCs (TC-001..037, 040..059, 070..076) + 7 manual (TC-080..086). Trial run, not the Phase 5 run: `npm run test:backend` passed 53/56 on a first pass while a server answered on 127.0.0.1:4400 (live suite ran), boot suite skipped (needs COMPANION_BOOT=1). Since then TC-017 (my regex bug) and TC-008 (case moved) fixed; TC-037 fails by design (see below).
Next agent must know:
- Command: `npm run test:backend`; live needs COMPANION_URL (default http://127.0.0.1:4400; skips with reason if nothing answers, refuses 4317); boot suite `COMPANION_BOOT=1` starts its own server on free ports and stops only that PID.
- Design contradiction (unresolved): DES-009 example "I love 火锅" -> en (3:2) vs its rule han>=words -> zh (2 Han, 2 words). The code follows the rule; TC-037 asserts the example and fails. Orchestrator / architect decide; TC-008/051 use unambiguous lines.
- Pitfalls: replies land in test-results/backend-replies.jsonl for the manual TCs 080-082; the full live run takes ~4 min (FX-004 = 30 calls).
- Left open: REQ-012 manual only (frontend); FX-005 text_reference [unverified].
Read beyond the list: server/*.js was NOT read for the plan; only grepped in TC-017 and run in the trial.
Next agent reads: docs/backend/04-test-plan.md §2, §6

## be-developer #1 · Phase 4 (build) · round 2 · 2026-11-15T00:15:24Z
Task: round 2 — CTX.codemap: `docs/codemap.md` had companion-stt in backticks (read as a path). Round 1: built DES-001..012 (03 §8).
Changed: round 2: docs/codemap.md line 46 — backticks dropped around the process name companion-stt (nothing else). Round 1: server/ (11 files), stt/ (Package.swift, Package.resolved, Sources/CompanionSTT/main.swift), package.json (setup, start), docs/codemap.md (server/, stt/), docs/backend/08-implementation-log.md.
Result: CTX.codemap parser replayed locally (gatelib checks.py:390-393 logic): 0 missing paths, 63 lines; gate p4 not re-run by me. Round 1: swift build pass, npm test 23/23, REQ-008 voice turn 3.6–7.1 s — evidence: docs/backend/08-implementation-log.md, docs/backend/logs/be-developer-1-*.log
Next agent must know:
- Pitfalls: in docs/codemap.md backticks hold existing repo paths only; process names, commands and identifiers go unquoted (CTX.codemap reads every backticked token as a path).
- Pitfalls: my instance A runs on PORT=4400 BONSAI_PORT=4401 (node 51774 → stt 51780, llama 51781) for be-tester; stop only node 51774. 4317 is the user's preview.
- Pitfalls: time latency on an idle instance; concurrent requests on 2 llama slots push cold turns to 7–9.5 s.
- Tried, did not work: sed -i on a live server log (server keeps writing the unlinked file) — instance A restarted in round 1.
- Left open: design gaps 1–3 in 08 (6000-char window vs 15 s deadline; DES-009 "I love 火锅" rule vs example; setup hint for missing models) — to a fresh be-architect.
Read beyond the list: ~/.claude/gates/gatelib/checks.py:373-397 — codemap check.
Next agent reads: docs/backend/08-implementation-log.md § Design gaps; docs/codemap.md § server/, § stt/
## fe-tester #1 · step 3 (fake-layer test repoint) · round 1 · increment 1 · 2026-11-15T01:10:00Z
- Changed only `tests/fake-companion.test.js`: imports `createFakeCompanion` from `web/js/fake/fake-companion.js`.
- REQ-003 1 s check now runs on `createFakeCompanion()` default delay (600 ms); the default (real) layer is left to `tests/client.test.js`. Dropped the real-`transcribe()` assertion (it would hit fetch).
- Seam rule tightened: nothing in `web/` outside `fake/` imports `fake/` (true now). Importer rule (app.js only imports companion-client.js) unchanged.
- `npm test`: 37 tests, 37 pass, 0 fail.
