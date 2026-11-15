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
## fe-tester #3 · step 4 (test alignment) · round 1 · increment 1 · 2026-11-15T06:00:00Z
Task: bring two tests in line with fe-ux #5's Hint rules (confirmed 2026-11-15) so `npm test` is green.
Changed: tests/health-watch.test.js ("a failed send ... resumes checks": after `not_ready` no check at 0 ms or 1999 ms, check at 2000 ms, then awake), tests/talk-button.test.js ("slow open ...": last two hints are `clear`, `listeningNow`). Nothing else touched.
Result: `npm test` 81/81 (was 77/79; two now green). Expectations from 01-ux.md Hint rules and the PAGE-001 listening row, not from code. Not mutation-run; fnd-r1-fix.test.js already guards the same rules from other angles.
Next agent must know:
- Earlier fe-tester #2 findings (verify-1 empty style probes; 12 not observable; recapture list) still stand and are not re-done here.
Next agent reads: docs/frontend/01-ux.md Hint rules

## fe-engineer #16 · step 4 (CTX.codemap fix) · round 2 · increment 1 · 2026-11-15T06:00:00Z
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

## be-tester #2 · step 5 (test run) · round 1 · 2026-11-15T01:35:00Z
Task: run TC-001..086, write 05-test-report.md, seam check from the backend side.
Changed: docs/backend/05-test-report.md (new); docs/backend/logs/be-tester-2-live.log, be-tester-2-boot.log (new). No code or fixtures touched.
Result: 66 pass, 2 fail, 4 blocked. Live `npm run test:backend` (4400) 58/58; `COMPANION_BOOT=1` 64/65. Fail TC-073: server/stt.js:68 logs event `stt_warm`, not in 03 section 6 list. Fail TC-081 (manual): 1/3 replies use the internship context, flaky across runs. Blocked: TC-083 (Wi-Fi), 084/085 (frontend), 086 (needs page + server stop). Seam matches contract; FX-001..008 all pass.
Next agent must know:
- Pitfalls: node --test runs the 4 files in parallel, so the boot file overlaps the live file; TC-052 rose to ~6.3 s (alone ~5.0 s). backend-replies.jsonl accumulates across runs; judge by timestamp.
- Left open: TC-073 fix is either add stt_warm to 03 section 6 (and the test list) or stop emitting it; FX-004 line 05 misses every round (9/10, margin 1).
Next agent reads: docs/backend/05-test-report.md section 4
- Carried from be-tester #1 (trimmed by orchestrator): plan 04 has 70 TCs (63 automated); suites tests/server-unit, server-fakes, server-live (COMPANION_URL, refuses 4317), server-boot (COMPANION_BOOT=1); `npm run test:backend` → test-results/junit-backend.xml.

## fe-reviewer #1 · step 4 (review coordinator) · round 2 · increment 1 · 2026-11-15T01:43:17Z
Task: FE4.findings format fix (filed by orchestrator from the return).
Changed: docs/frontend/05-review.md — findings table back to template columns; owner as a "- **Owner:**" line per FND.
Result: 9 FND (0 blocker, 3 major FND-001..003, 6 minor FND-004..009); fe-review gate pass.
Next agent must know:
- Pitfalls: fe-review reads the 4th table column as Where; FND-002 needs a pointer hold plus Enter in the focused input; Chrome input clientWidth excludes padding.
- Left open: FND-001, FND-002 (fe-engineer), FND-003 (fe-ux then fe-engineer); 01-ux.md "failure hint stays until next send" vs warming table "newest wins" needs a fe-ux ruling.
Next agent reads: docs/frontend/05-review.md §2; web/js/health-watch.js:59-104; web/js/app.js:24-118; web/js/talk-button.js:103-177
