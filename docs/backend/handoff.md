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

## orchestrator · Phase 2 · Plan stop · 2026-11-14T23:46:52Z
State: p1 pass, p2 pass; frontend increment 1 gates fe-ux (user waiver FE1.flow-length FLOW-001/002 only), fe-ui, fe-queue, fe-plan pass. Branch companion-full-dev. Figma 12/15 this run.
Decided: risk normal (user, kickoff); 9B, setup step, argmax-oss-swift 1.1.1, port 4317 = be-architect recommendations, pending user; DFB-004 by fe-ui #5; DFB-005 accepted by fe-ux #4 pending user; PAGE-001 increment block accepted as increment structure (orchestrator).
Open: Plan answers (design + 4 decisions, fixtures FX-001..008 lock, DFB-005, defaults in state.json open_questions).
Next: on yes → gate.py fixtures-approve --by user; log human --stop Plan; Phase 4 build: baseline, mark be-tester then be-developer, dispatch be-developer (DES-001..012, build order 03 §8; stt first for the ~390 s warm-up) and be-tester (plan) in one message; frontend rows Q-015/016/017/013/019 can follow once backend writer is back (one team's writers at a time).

## be-tester #1 · step 4 (plan + tests) · round 2 · 2026-11-15T00:50:00Z
Task: update tests and 04 to be-architect #3's amendment (weight budget 2000, missingHints, new DES-009 rule).
Changed: docs/backend/04-test-plan.md (TC-008, 013, 015, 031, 037 text; new TC-038); tests/server-unit.test.js (TC-008 cases, TC-013 weight expectations, TC-015 `historyBudget: 2000`, TC-037 rewritten, new TC-038 missingHints); tests/server-fakes.test.js (TC-031: 40x200 -> 1+10+1 messages).
Result: `node --test tests/server-unit.test.js tests/server-fakes.test.js` -> 38 pass, 0 fail (server code had already landed). Live (4400) and boot suites not run this round, as instructed. Expectations were computed from 03 by hand (e.g. 21 x 40 Han = 100 weight each -> 20; 801 Han = 2002.5 -> []), not from server code.
Next agent must know:
- missingHints is TC-038 (not folded into TC-016); asserts on keywords (npm run setup / BONSAI_MODEL / STT_MODEL_DIR), order stt, Bonsai, WhisperKit, one line per kind.
- FX-005 [unverified] note removed from the plan.
- TC-052 (REQ-008 timing) and TC-049 should be re-run live after the new window; unmeasured: 60 s zh voice line.
Next agent reads: docs/backend/04-test-plan.md §2

## be-developer #1 · Phase 4 (build) · round 3 · 2026-11-15T00:47:37Z
Task: implement be-architect #3's amendment: weighted window historyBudget 2000 (DES-002/007), languageOf ceil(han/2) + hanCount (DES-009), missingHints (DES-001/002); restart instance A; re-measure cold 20-turn zh/en.
Changed: server/config.js (+15/-1: historyBudget 2000, missingHints), server/bonsai.js (+6/-3: weighted windowOf), server/lang.js (+7/-2: hanCount, ceil(han/2)), server/main.js (+2/-2: prints hints); docs/backend/08-implementation-log.md (Fix rounds 2–3, gaps 1–3 resolved); earlier rounds: server/, stt/, package.json scripts, docs/codemap.md.
Result: all 03 examples hold (windowOf 10/10/20/1/0; lang zh/en/zh/en/zh; hints 0/1/3); npm test 37/37; tests/server-unit.test.js 22/22; cold 20-turn respond on A: en 4362 ms, zh 5485 ms (history_n 40) — evidence: docs/backend/logs/be-developer-1-round3.log
Next agent must know:
- Pitfalls: instance A now node 82765 (stt 82771, llama 82772) on PORT=4400 BONSAI_PORT=4401, left up for the frontend; stop only node 82765. 4317 is the user's preview.
- Pitfalls: time latency on an idle instance (2 llama slots; concurrent traffic doubles cold turns). In docs/codemap.md backticks hold existing paths only.
- Tried, did not work: sed -i on a live server log (server keeps writing the unlinked file).
- Left open: 60 s zh voice line at the new window unmeasured (be-architect #3); 4B switch unmeasured.
Read beyond the list: nothing.
Next agent reads: docs/backend/08-implementation-log.md § Fix rounds; docs/backend/03-detailed-design.md DES-002, DES-007, DES-009
## fe-tester #1 · step 3 (fake-layer test repoint) · round 1 · increment 1 · 2026-11-15T01:10:00Z
- Changed only `tests/fake-companion.test.js`: imports `createFakeCompanion` from `web/js/fake/fake-companion.js`.
- REQ-003 1 s check now runs on `createFakeCompanion()` default delay (600 ms); the default (real) layer is left to `tests/client.test.js`. Dropped the real-`transcribe()` assertion (it would hit fetch).
- Seam rule tightened: nothing in `web/` outside `fake/` imports `fake/` (true now). Importer rule (app.js only imports companion-client.js) unchanged.
- `npm test`: 37 tests, 37 pass, 0 fail.
## fe-engineer #13 · step 3 (frontend build Q-018) · round 1 · increment 1 · 2026-11-15T03:10:00Z
Task: Q-018 — silence and voice failures are told (REQ-003, REQ-011, DES-013).
Changed: web/js/app.js (onVoiceProblem shows the voice-column hint; transcript cut to 1500 chars before send); web/js/copy.js (hints.nothingHeard, voiceUnavailable, voiceTimeout, voiceFailed; voiceHintKey, MAX_VOICE_CHARS); tests/voice-hints.test.js (new, 3 tests); docs/frontend/03-queue.md Q-018 built; docs/codemap.md; evidence docs/frontend/evidence/build/Q-018-{nothing-heard,voice-error}-{1440,390}.png. log.js not needed.
Feedback: none.
Result: new test file 3/3 pass run directly; npm test 61/61 (unchanged: package.json is outside this task's files, so voice-hints.test.js is NOT in its list; add it there). Playwright vs 127.0.0.1:4400, fake mic fed FX-008/input.wav: real silence hold -> POST /api/transcribe only, no respond, 0 turns, nothingHeard hint. Route-injected /api/transcribe: timeout, failed, bad_request, too_large, unavailable show their hints, 0 turns added. not_ready injected shows the awake hint after ~150 ms because the real health says ready (artifact of injection; with a truly not-ready server the watch keeps voiceNotReady). 390 hint fits one line. Unverified: real not_ready live; 1500-char cut has no test (logic is one slice in app.js).
Next agent must know:
- Q-015 (English) must add the same new hint keys to en; copy.js now also exports voiceHintKey and MAX_VOICE_CHARS.
- no_audio maps to nothingHeard (talk-button already handles too-short holds with tooShort).
- A stray `watch.start();` inside onSendFailed (pre-existing) still there.
Next agent reads: web/js/copy.js; web/js/app.js onVoiceProblem
