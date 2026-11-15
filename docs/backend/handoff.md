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

## be-architect #4 · step 5 (design revision) · round 1 · 2026-11-15T02:32:27Z
Task: one rule each for TC-081 (FX-002 context use, REQ-007) and TC-073 (stt_warm not in 03 §6), measured.
Changed: docs/backend/03-detailed-design.md (+30/-4) — DES-008 toMessages appends RECALL[lang](prev) to the last user message when the window has a user entry (prev = newest user text); DES-010 new export RECALL {en, zh} + steps 2-3; §6 +8 events already emitted by code (stt_warm, stt_error, stt_bad_line, stt_stdin_error, child_error, child_warm_failed, static_read_failed, boot_failed). REPLY_SYSTEM, sampling, MOOD_* unchanged. Logs: docs/backend/logs/be-architect-4-context.log (summary), -raw.log, -bench-script.log.
Result: FX-002 refers back: current prompt 21/54 (live 4400 5/20, 4401 4/10, own 12/24); RECALL 34/34 (own 24/24, 4401 10/10). FX-003 mentions 考 29/30 vs 14/30. FX-004 2 rounds mood 9/10 each (05 only), langs 20/20; FX-001 3/3; all shape checks pass. DES-008 119 words (gatelib), prose > 50 = []. Gate p2 not run.
Next agent must know:
- Code: server/prompts.js add RECALL (03 DES-010 text verbatim); server/bonsai.js toMessages last message per DES-008 code block.
- Tests: TC-012 (tests/server-unit.test.js:175) and TC-031 (tests/server-fakes.test.js:198) assert last content === line; must expect line + "\n" + RECALL[lang](prev). TC-073 allow-list tests/server-boot.test.js:62 must hold the 16 events of 03 §6.
- Pitfalls: Bonsai's chat template raises on a system message not first, so the reminder must live in the user turn; wording is fragile (a "begin with that earlier thing" rule gave 1/12).
- Tried, did not work: system-prompt rewrites alone (c1/c4/c5/c6/c8: 8-83 %); quoting prev before the line as "(Earlier I said …)" 5/12.
- Left open: zh+RECALL one Latin word leak in 46 replies ("reconciled"; base 0/36, n too small to attribute) and 2/30 zh replies misstate the exam as 没过; unrelated follow-ups now name the earlier topic 6/6.
Read beyond the list: ~/.claude/gates/gatelib/docs.py (word count); stt/Sources/CompanionSTT/main.swift:76-100 (stt_error values); bonsai chat template via 4451 /props.
Next agent reads: docs/backend/03-detailed-design.md DES-008, DES-010, §6; docs/backend/logs/be-architect-4-context.log

## fe-ux #5 · step 4 (frontend review fix, UX) · round 1 · increment 1 · 2026-11-15T01:46:57Z
Task: decide FND-003 (what a screen-reader user hears when listening starts; reword `hints.micOpening`) and the hint-rule conflict behind FND-001, in 01-ux.md § Increment 1.
Changed: docs/frontend/01-ux.md § Increment 1 (+18/-9) — Author line; PAGE-001 (increment 1) rows mic opening, listening (announces `listeningNow`, not shown), error · reply / voice / down; warming table "both ready" row; Hint rules paragraph retired in place → 7 bullets (action / health / hold hints, awake rule, 2 s first check); Words `hints.micOpening` reworded (old words in a "retired words" bullet under the table), new top-level row `listeningNow` 在听 / Listening.
Feedback: none raised; FND-003 decided (owner fe-ux); FND-001 rule stated for fe-engineer.
Result: gatelib docs.prose_units > 50 words = []; FLOW blocks unchanged (FLOW-005 80); first PAGE-001 block 196 (unchanged); new glyphs “ ” 在 听 present in web/fonts/lxgw-wenkai-subset.woff2 (fontTools cmap) — evidence: commands run in this session. Gate fe-ux not run by me. 0 Figma calls.
Next agent must know:
- Pitfalls: awake now requires a health hint (warming, voiceNotReady, unreachable, stillDown) to be on the line when both parts turn ready; `watch.failed()` after `unavailable` must not arm it (FND-001 cause). `not_ready` code hints are health hints, so awake may follow them.
- Pitfalls: an action hint (Codes send/voice columns except not_ready, tooShort, nothingHeard, mic prompt/refused/noMic/busy) is replaced by a health check only with stillDown; first check after a code runs 2 s later, not at once.
- Pitfalls: `listeningNow` goes into the role=status line visually hidden, every hold (focused aria-label changes are not reliably announced); it replaces `hints.micOpening`; both clear at hold end.
- Pitfalls: tests/verify-r1.test.js (Words vs copy.js) now fails only on `hints.micOpening` until fe-engineer updates web/js/copy.js; `listeningNow` is top-level, not under `hints.`, so its 29-key count holds.
- Left open: the micOpening rewording changes words the user confirmed in DFB-005 at Plan (2026-11-14) — needs the user's yes at the next stop; if no, keep the old words and the announcement still fixes WCAG 4.1.3 but not 1.3.3. web/js/copy.js not edited (fe-engineer's).
Read beyond the list: ~/.claude/gates/gatelib/frontend.py:128-200, docs.py:40-75 — which blocks are length-checked and how prose units are cut.
Next agent reads: docs/frontend/01-ux.md § Increment 1 "PAGE-001 — Talk with the companion (increment 1)" (rows listening, error ·), warming table, Hint rules, Words `hints.micOpening` / `listeningNow`

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

## be-developer #2 · step 5 (fix) · round 1 · 2026-11-15T02:39:42Z
Task: implement be-architect #4's revision (RECALL in server/prompts.js, toMessages last message per DES-008) for TC-081; restart instance A.
Changed: server/prompts.js (+7/-0) — exports RECALL {en, zh} (03 DES-010 verbatim); server/bonsai.js (+4/-2) — toMessages appends `\n` + RECALL[lang](newest window user text) to the last user message, line alone when the window has no user entry; docs/backend/08-implementation-log.md (Fix rounds § Round 4); docs/codemap.md (server/ traps line).
Result: npm test 84/84; backend unit+fakes 36/38, TC-012 and TC-031 red only on the old `last content === line` expectation (be-tester updates them); FX-002 curl on new instance A names the internship — evidence: docs/backend/logs/be-developer-2-npm-test.log, docs/backend/logs/be-developer-2-unit-fakes.log, docs/backend/08-implementation-log.md § Round 4
Next agent must know:
- Pitfalls: instance A is now node 91736 (stt 91742, llama 91743) on PORT=4400 BONSAI_PORT=4401, PID in the session scratchpad server.pid, log docs/backend/logs/be-developer-2-server.log; stop only 91736. stt cold load took 78.7 s this boot.
- Pitfalls: fixture input.json wraps the request in {endpoint, content_type, body}; POST only .body (posting the whole file gives 400 bad_request).
- Tried, did not work: nothing.
- Left open: TC-012, TC-031 expectations and the TC-073 allow-list (be-tester); live re-run of TC-081 and FX-004 with RECALL (be-tester).
Read beyond the list: tests/fixtures/approved/FX-002/input.json — curl body.
Next agent reads: server/bonsai.js:25-33 (toMessages); server/prompts.js RECALL; docs/backend/03-detailed-design.md DES-008, DES-010
## fe-tester #5 · step 4 (FE4.capture recapture) · round 4 · increment 1 · 2026-11-15T09:00:00Z
Task: re-point docs/frontend/04-verification.md to evidence/verify-3/manifest.md and confirm the 19 verdicts against the verify-3 files.
Changed: docs/frontend/04-verification.md only (header, round note, Q-010 row). Verdicts: done 7 (Q-001, 002, 003, 005, 008, 015, 017), not observable 12. Q-010 done to not observable: in verify-3 the sad follow-up reply does not show recall of the first line (mood and English reply do hold).
Result: every backticked filename in the file exists in verify-3 or design (script check); manifest named as evidence/verify-3/manifest.md; no verify-2 left. 0 Figma calls. No tests added or edited.
Next agent must know:
- Pitfalls: the model's reply text changes per capture run, so recall-type observables (Q-010) are flaky evidence; a fixed-reply stub check would settle it.
- Left open: the not-observable rows still need a mic, a failing backend, reduce-motion emulation or a network log (user check at Acceptance).
Next agent reads: docs/frontend/04-verification.md

## fe-engineer #16 · step 4 (FE4.row-tests) · round 3 · increment 1 · 2026-11-15T06:30:00Z
Round 3: package.json test script + tests/verify-r2.test.js (all other entries kept); web/js/talk-button.js:9 comment now says wait until it says Listening. npm test: 84 tests, 84 pass, 0 fail. No other files touched.
Round 2 follows.
Round 2: only docs/codemap.md, backticks removed from non-path words (listeningNow, setPaused, healthHint, hint.key, is-shown); the one backticked path left is tests/fnd-r1-fix.test.js. No code or tests touched. micOpening reword approval confirmed by coordinator (human conditional #172).
Round 1 follows.
Task: fix FND-001, FND-002, FND-003 to the 01-ux.md Hint rules; reword hints.micOpening (user's yes relayed by the coordinator).
Changed: web/js/health-watch.js (failed(): awake armed only by not_ready; first check one poll later), web/js/app.js (healthHint gate by hint.key; utterance dropped while pending), web/js/talk-button.js (listeningNow announced, cleared at hold end; setPaused(true) cancels a hold), web/js/copy.js (listeningNow, micOpening new words), tests/fnd-r1-fix.test.js (new, 7 tests), package.json (+verify-r1, +fnd-r1-fix in test), docs/frontend/03-queue.md (Fix lines), docs/codemap.md. evidence/build/FND-001-*.png, FND-002-race.png, FND-003-listening.png.
Feedback: none. FND-004 also fixed (awake clears only itself): browser check, tooShort survives the awake timer.
FND-002 choice: drop, not queue (01-ux "pending → Enter ignored"; audio never kept, A9): Enter during a hold cancels the hold (mic closed); a hold that ends while pending sends nothing.
Result: new tests 7/7 green; 5 red on the old web/js copy. Browser 4399: send/voice unavailable keep their hint after 6.5 s; race sends one request, no stray typing node; status line says "Listening" while held, empty after release. Full frontend suite 77/79: TWO EXISTING TESTS NOW RED, made wrong by the confirmed rules, not edited (dispatch forbids): tests/health-watch.test.js "a failed send ... resumes checks" (expects check at once; rule is 2 s later) and tests/talk-button.test.js "slow open ..." (expects last hint 'clear'; now 'clear','listeningNow'). verify-r1 fully green incl. micOpening. 0 Figma calls.
Next agent must know:
- Pitfalls: those two tests need a one-line update by whoever may edit tests; npm test is red until then.
- Pitfalls: mocked Date starts at 0, so talk-button.t0 === 0 reads as "not open"; tick before opening the stream in tests.
- Left open: stillDown over an action hint is allowed by the rules; not covered by a browser check (unit rule in healthHint only).
Next agent reads: web/js/app.js healthHint, tests/fnd-r1-fix.test.js

## be-tester #3 · step 5 (test run) · round 2 · 2026-11-15T02:55:00Z
Task: update TC-012, TC-031, TC-073 to DES-008/DES-010/section 6; wire backend suites into `npm test`; re-run; rewrite 05-test-report.md.
Changed: tests/server-unit.test.js, tests/server-fakes.test.js, tests/server-boot.test.js; package.json (test script: + server-unit, server-fakes, server-live, COMPANION_URL default 4400); docs/backend/04-test-plan.md (boot TCs TC-070..076 now Mode manual, gate wiring); docs/backend/05-test-report.md; logs docs/backend/logs/be-tester-3-*.log. No server/, fixtures or .claude touched.
Result: 57 pass, 0 fail, 11 blocked. `npm test` 142/142, 0 skipped, exit 0; all 54 automated TCs and FX-001..008 in test-results/junit.xml. Live x3: TC-081 passes 3/3, 2/3, 3/3; FX-002 x3 ok; FX-004 9 rounds all 9/10. Blocked: TC-070..076 (boot suite, not run: third 9B instance, memory), TC-083..086 (Wi-Fi/page).
Next agent must know:
- Pitfalls: `npm test` needs 4400 up (else live TCs skip = not executed); takes ~130 s. TC-052 ran 5.0-8.96 s depending on machine load (limit 10 s). backend-replies.jsonl holds only this round (old one is .prev.jsonl).
- Left open: boot group TC-070..076 unrun (incl. TC-073 against the 16-event list); FX-004 line 05 mislabels every round (9/10).
Next agent reads: docs/backend/05-test-report.md sections 3 and 5

## fe-reviewer #2 · step 4 (frontend review) · round 2 · increment 1 · 2026-11-15T02:04:20Z
Task: re-check FND-001..004 (fix commit 1ae2fab) against 4399 and the code; record in 05-review.md §5 (filed by orchestrator from the return)
Changed: docs/frontend/05-review.md — FND-001..004 Status "fixed in round 2"; §5 re-check table
Result: 4/4 fixed, 0 open; unit tests 26/0 — evidence: session scratchpad fe-reviewer-2/recheck.out, unit.out
Next agent must know:
- Pitfalls: 4399 serves web/ directly; "Listening" sits in the hint line without .is-shown (visually hidden, role=status) — read hint.key / ARIA, not visibility
- Left open: FND-005..009 minors deferred (§4); stale comment web/js/talk-button.js:9 ("wait for the seconds")
Next agent reads: docs/frontend/05-review.md §5
