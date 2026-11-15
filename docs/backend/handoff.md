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

## be-architect #2 · Phase 2 · round 2 · 2026-11-14T23:10:53Z
Task: revise 02/03 so be-analyst #2's design contradictions 1–6 are resolved; keep the rest of #1's design.
Changed: docs/backend/02-architecture.md (+20/-14), docs/backend/03-detailed-design.md (+33/-23) — line/history text 1–1500, body ≤ 262144, prompt history ≤ 6000 chars (windowOf); deadlines stt 12 s + respond 15 s, page aborts 13 s / 16 s (voice turn ≤ 29 s); shapeReply cut = 119 cp + … ; zh transcripts → ICU Hant-Hans; warm-up text clarified (no code change). 03 §9 seam changed. docs/backend/logs/be-architect-2-stt60.log (new).
Result: 52–55 s clips transcribed in 4.3–5.3 s CLI wall incl. model load; Hant-Hans converts 有點難過 → 有点难过 — evidence: docs/backend/logs/be-architect-2-stt60.log. Gate parsers: every DES ≤ 117 words, 12/12 REQs claimed. Gate p2 not run.
Next agent must know:
- Pitfalls: contract §2 still holds the old seam (500 chars, 131072 B, 25/20/30 s); orchestrator must re-copy 03 §9. web/index.html:398 maxlength 500 stays valid (≤ 1500).
- Pitfalls: FX-005 stays the 16 kHz PCM16 converted copy; 01 §7 still says 24 kHz Float32 — analyst/user fix at Plan.
- Tried, did not work: nothing.
- Left open: after 20 turns the 40-entry window slides every turn → prompt prefix changes → every turn is cold (6.4–8.7 s + STT ≈ 10 s). Not redesigned this round; 02 §5 row 1 names the fallback (block-wise window or 4B), measured at build step 4.
Read beyond the list: docs/backend/logs/be-architect-1-bench.log, bench-scripts.log:254-277 (history20 = 979 chars); ~/.claude/gates/gatelib/docs.py (word counting).
Next agent reads: docs/backend/03-detailed-design.md §9, DES-002, DES-007, DES-013; 02 §4 rows 简体/截止/line 上限, §5 rows 1, 7, 8

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

## fe-engineer #5 · step 2 (frontend feasibility + queue, increment) · round 2 · increment 1 · 2026-11-14T23:46:03Z
Task: FE2.row-length — shorten every Increment 1 row to ≤ 80 words; reflect DFB-005 (accepted) in the queue and contract.
Changed: docs/frontend/03-queue.md — rows Q-010..Q-017 cut to ≤ 80 words, detail moved to new "Notes the rows point to"; split: Q-018 (silence and voice failures, from Q-014), Q-019 (listening starts when the mic opens, DFB-005, from Q-013); "Changed by" lines removed from Q-002/004/005 (the earlier-rows table says it). contracts/FRONTEND_BACKEND_CONTRACT.md — hold-to-talk loading row now has the mic-opening text.
Feedback: DFB-005 accepted by fe-ux #4 (pending user at Plan); reflected in Q-019 and note Q-013.
Result: every Q row ≤ 80 words by gatelib docs.words (script run by me, 0 over); `npm test` 23 pass / 0 fail. Gate not re-run by me. 0 Figma calls.
Next agent must know:
- Pitfalls: `hints.micOpening` shows at 0.2 s but browsers without the permission query treat a stream slower than 600 ms as an open prompt (codemap mic.js trap): show the hint first, then let 600 ms decide "prompt".
- Pitfalls: Q-010 moves createFakeCompanion to web/js/fake/fake-companion.js; keep data-testid fake-input, reply, companion. No server/ yet.
- Tried, did not work: nothing.
- Left open: font Latin-1 (Q-017, P3) needs the TTF; English caption width is an estimate.
Read beyond the list: ~/.claude/gates/gatelib/docs.py words().
Next agent reads: docs/frontend/03-queue.md § Increment 1 (rows and Notes); contracts/FRONTEND_BACKEND_CONTRACT.md §2

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