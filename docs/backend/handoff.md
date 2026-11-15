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
## fe-tester #2 · step 4 (verification) · round 1 · increment 1 · 2026-11-15T02:00:00Z
- Wrote `docs/frontend/04-verification.md`: 7 done (Q-001, 002, 003, 005, 010, 015, 017), 0 not done, 12 not observable (Q-004, 006, 007, 008, 009, 011, 012, 013, 014, 016, 018, 019). Evidence `evidence/verify-1/manifest.md`.
- Found: every `*.styles.json` in verify-1 is empty (`elements: [{}]`), so no computed style, width or font could be cited; the capture plan's style probes did not return values. Fix the probe before round 2.
- Recapture wanted: Q-008 with 20 turns; Q-016 with a failed send and sizes 375/768; Q-006 with a request log and computed font; Q-009 with reduce-motion emulation. Q-004, 007, 011, 012, 013, 014, 018, 019 need a fake mic or a stopped/cold backend, otherwise the user's real-mic check at Acceptance.
- Added `tests/verify-r1.test.js` (5 tests, Q-ids in titles, all pass, mutation-checked on a scratch copy). Not in the `package.json` test script: orchestrator to add it. Words test reads the 01-ux.md Words table as its independent source.
- No design defects. Minor deviations listed in the file. No `web/`, `server/` or existing test touched.

## fe-engineer #15 · step 3 (frontend build Q-016) · round 1 · increment 1 · 2026-11-15T04:30:00Z
Task: Q-016 — English layout fits both sizes (REQ-012, DES-015, DFB-004).
Changed: web/css/page.css only (`html[lang="en"] .composer` columns 1fr 154px below 960 px; laptop rule also overrides it); 03-queue Q-016 built. index.html, js unchanged (lang attribute already set by app.js).
Feedback: none.
Measured (Playwright vs 127.0.0.1:4400, headless chromium): 390 en button 154, input 196; zh 124/226 unchanged. 375 en 154/181. 768 en 154/574 (phone layout). Longest English hint (sendDefect) 3 lines, 72 px, pushes the log up, no overlap; 2 lines at 1440 (560 px). Longest caption "Little Buddy · sad with you for a while" 253.7 px at 390 (13 px), 390.3 px at 1440 (20 px) — design estimate 341 was wrong, fits easily on one line. Lang switch 98x36 at top-right, clear of caption; sits over the face box corner as in Q-015/FRAME-015. No horizontal overflow at 375/390/768/1440. npm test 69/69.
Evidence: docs/frontend/evidence/build/Q-016-{390,1440,375,768}-{zh,en}.png (hint and longest caption forced into the DOM), compared by eye to FRAME-015/014.
Not checked: listening state width in a browser (grid column is fixed, so it cannot change); real mic.
Next agent must know: Chinese layout untouched (same widths as before).
Next agent reads: web/css/page.css (composer)

## be-tester #2 · step 5 (test run) · round 1 · 2026-11-15T01:35:00Z
Task: run TC-001..086, write 05-test-report.md, seam check from the backend side.
Changed: docs/backend/05-test-report.md (new); docs/backend/logs/be-tester-2-live.log, be-tester-2-boot.log (new). No code or fixtures touched.
Result: 66 pass, 2 fail, 4 blocked. Live `npm run test:backend` (4400) 58/58; `COMPANION_BOOT=1` 64/65. Fail TC-073: server/stt.js:68 logs event `stt_warm`, not in 03 section 6 list. Fail TC-081 (manual): 1/3 replies use the internship context, flaky across runs. Blocked: TC-083 (Wi-Fi), 084/085 (frontend), 086 (needs page + server stop). Seam matches contract; FX-001..008 all pass.
Next agent must know:
- Pitfalls: node --test runs the 4 files in parallel, so the boot file overlaps the live file; TC-052 rose to ~6.3 s (alone ~5.0 s). backend-replies.jsonl accumulates across runs; judge by timestamp.
- Left open: TC-073 fix is either add stt_warm to 03 section 6 (and the test list) or stop emitting it; FX-004 line 05 misses every round (9/10, margin 1).
Next agent reads: docs/backend/05-test-report.md section 4
- Carried from be-tester #1 (trimmed by orchestrator): plan 04 has 70 TCs (63 automated); suites tests/server-unit, server-fakes, server-live (COMPANION_URL, refuses 4317), server-boot (COMPANION_BOOT=1); `npm run test:backend` → test-results/junit-backend.xml.

## fe-reviewer #1 · step 4 (review coordinator) · round 1 · increment 1 · 2026-11-15T01:41:35Z
Task: merge panel candidates A-1..A-3, I-1..I-4, E-1..E-4 and fe-tester #2's verdicts into docs/frontend/05-review.md; disprove or rank.
Changed: docs/frontend/05-review.md (new) — 9 findings (3 major, 6 minor), 0 dropped; verdict send back. Nothing else.
Result: every candidate reproduced against 127.0.0.1:4399. Merged I-2+E-1 → FND-001, A-3+E-4 → FND-008. Fix round: FND-001 (health-watch.js:100 failed() fakes a shown not-ready hint → "awake" replaces the failure hint), FND-002 (app.js:100 standing voice turn bypasses pending → overlapping turns, stuck typing dots), both fe-engineer; FND-003 (listening start not announced; mic-opening words are visual) fe-ux first, then fe-engineer. Deferred: FND-004..009 + tester minors Q-001..003 — evidence: scratchpad fe-reviewer-1/probe.out, hang.out
Next agent must know:
- Pitfalls: Chrome's input clientWidth already excludes padding; the panel's placeholder box figures (a11y/p3.out, my probe.out boxPx) subtract it twice — corrected numbers are in FND-008.
- Pitfalls: FND-002 needs a pointer hold with the input focused, then Enter, then release; Space holds move focus to the button and cannot reproduce it.
- Left open: FND-001 also covers unreachable replacing sendUnavailable after ~400 ms when health reports down; the UX "failure hint stays" rule and the warming-table hints overlap there — fe-ux may need to say which wins.
Read beyond the list: web/js/companion-client.js:12 (5 s health timeout, for FND-005).
Next agent reads: docs/frontend/05-review.md §2; web/js/health-watch.js:59-104; web/js/app.js:24-118; web/js/talk-button.js:103-177
