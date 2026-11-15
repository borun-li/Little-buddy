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

## be-architect #5 · step 6 (review fix design) · round 2 · 2026-11-15T03:49:10Z
Task: P3.des-length (DES-004/007/011 > 120 words) and P3.prose (4 units > 50 words), meaning unchanged.
Changed: docs/backend/03-detailed-design.md (+83/-11 vs HEAD, rounds 1+2) — round 2 only moves text: DES-004 steps 6-7 and DES-011 step 4 triggers + 6a into ```text blocks (same rules, values, strings); DES-007 step 1 pointer shortened; Author line split into sub-bullets; step-6 file list now a table; §6 Round 4 note split into 2 bullets ("最后 8 行" now names stt_warm..boot_failed, since child_gave_up is appended). Round 1 content unchanged: FND-002 isNoise(langLogprob < -0.5 && fellBack); FND-003 --cors-origins none, --no-cors-credentials, --no-slots, LLAMA_API_KEY env + Bearer; FND-004 stderr tail 20, causeOf, one zh+en stderr line, child_gave_up; FND-005 bonsaiBootMs 300000.
Result: gatelib docs.words/prose_units locally: DES-004 <= 100, DES-007 116, DES-011 119, DES-008 119; no prose unit > 50. Gate p2 not run by me.
Next agent must know:
- Code: server/supervisor.js (DES-004 code block steps 6-7), server/bonsai.js (DES-007 code block), server/config.js (300000), stt/Sources/CompanionSTT/main.swift (DES-011 fellBack/isNoise/6a). server/main.js untouched by this design.
- Pitfalls: rebuild stt with swift build -c release --package-path stt (my scratch copy relinked in 62 s, loaded in 1.3 s, no ANE recompile). Noise text varies per call because the fallback decode samples (T > 0).
- Tests (be-tester): noise fixture from be-review-behavior-1/noise.mjs (seed 1) -> "" every call; foreign-Origin no matching ACAO, keyless POST 401; stderr line on a bad model; TC-073 allow-list +child_gave_up (17 events).
- Left open: short-7..10 (0.46-0.6 s English) decode to zero segments (pre-existing); 9B cold load unmeasured.
Read beyond the list: ~/.claude/gates/gatelib/docs.py (words: CJK 2 chars = 1 word, fenced code excluded).
Next agent reads: docs/backend/03-detailed-design.md DES-002, DES-004, DES-007, DES-011, §6; docs/backend/logs/be-architect-5-fixes.log

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

## orchestrator · Phase 6 · panel returned, session may end · 2026-11-15T03:26:34Z
State: backend p1,p2,p4,p5 pass (p5 user waiver TC-050/052/055); frontend fe-ux/ui/queue/plan/build/review/verify pass (review waiver scoped to round 2). Branch companion-full-dev, PR #2 draft. Instance A on 4400 = node 91736 (be-developer #2; PID in session scratchpad server.pid); user preview 4317 = PID 23757 (user's, never stop). My 4399 instance stopped.
Decided: user accepted TC-050/052/055 as known issues; user approved micOpening reword + hint rules; increment 2 = P1 (TTS voice reply, deep breathing, 988 safety, one-click clear) after P0 Acceptance; sidechat + P2 memory deferred (BD-007/008); video work tomorrow morning (draft docs/video/plan.md, untracked).
Open: backend review round 1 — candidates docs/backend/logs/review-r1-candidates.md (blocker S-1/R-1; majors S-2, B-1, R-2; minors S-3, S-4, B-2, B-3, R-3..R-6).
Next: run any gate (so the hook re-marks be-reviewer), dispatch fresh be-reviewer #1 to merge → 06-review-report.md, gate p6; fixes for blocker/majors (be-developer; R-2/R-3 may need be-architect); minors → deferred.md; re-run p4/p5; then demo after (start own instance on 4399, gate.py demo after), 07-acceptance.md, p7, Acceptance stop with the user (Wi-Fi off, real mic); then increment 2 at Phase 1 (be-analyst).
Trap: docs/backend/logs/be-developer-2-server.log is instance A's live log in a tracked file — it trips P6 tree-unchanged; restart instance A with its log outside the project before the coordinator runs.

## be-developer #4 · step 6 (fix) · round 1 · 2026-11-15T03:55:56Z
Task: implement be-architect #5's 03 amendment for FND-002..005, rebuild stt/, restart instance A with the new code.
Changed: stt/Sources/CompanionSTT/main.swift (+18/-5) — fellBack + isNoise → "" / null (DES-011 6a); server/bonsai.js (+10/-3) — cors none, no-cors-credentials, no-slots, per-run LLAMA_API_KEY via env, Bearer on post, stderr pipe; server/supervisor.js (+37/-3) — env opt, 20-line stderr tail, causeOf, zh+en operator line, child_gave_up; server/config.js (+1/-1) bonsaiBootMs 300000; 08 § Round 7; codemap server/ + stt/ invariants.
Result: noise clips 30/30 "" (5 kinds ×5 + empty); FX-005/006/007 ×3 transcribe as before; 4401 foreign Origin → ACAO none, keyless POST/props/slots 401; FX-001 ×3 200; npm test 141/142, fail TC-015 (expects old bonsaiBootMs 60000; be-tester's test) — evidence: docs/backend/logs/be-developer-4-fnd002-005.log, be-developer-4-npmtest.log
Next agent must know:
- Pitfalls: instance A is now node 61506 (stt 61513, llama 61514) on 4400/4401, PID in the session scratchpad server.pid, log scratchpad instanceA.log; it boots in ~4 s now (stt rebuild did not trigger an ANE recompile).
- Pitfalls: a manual llama-server probe now needs the key, so use /health (keyless) or go through the gateway; the key exists only in the child's env.
- Pitfalls: FX-001 input.json is a wrapper {endpoint, body}; post .body, not the file (my first probe got 400 for that).
- Tried, did not work: nothing.
- Left open: TC-015 must move to 300000 and TC-073 allow-list needs child_gave_up (be-tester); the operator line text takes policy.max/delayMs (= 03's literal 5 / 2 s with CONFIG); FND-009 still open.
Read beyond the list: scratchpad arch5/stt main.swift (architect's probe diff, for det.langProbs use).
Next agent reads: server/supervisor.js:14-60; server/bonsai.js:75-90,145-160; stt/Sources/CompanionSTT/main.swift:53-115; docs/backend/08-implementation-log.md § Round 7

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

## be-tester #5 · step 5 (test report) · round 4 · 2026-11-15T04:30:00Z
Task: bring tests in line with the review-fix design (DES-002, 03 §6) and add FND-001/002/003 regressions; re-run npm test.
Changed: tests/server-unit.test.js (TC-015 -> bonsaiBootMs 300000; new TC-087), tests/server-boot.test.js (TC-073 allow-list 17 events), tests/server-live.test.js (new TC-088, TC-089), docs/backend/04-test-plan.md, 05-test-report.md, logs/be-tester-5-npm-test.log. No server, stt, web, package.json or fixtures touched.
Result: 60 pass, 0 fail, 11 blocked. npm test 145/145, skipped 0, exit 0 (202 s). TC-050, 052, 055 passed (recorded pass + flaky, known issues accepted 2026-11-15). TC-073 stays blocked (boot group, manual).
Next agent must know:
- Pitfalls: TC-087 sends "//" only to its own throwaway server; TC-088 targets llama-server at live port + 1 (BONSAI_URL overrides); TC-089 builds noise in the test (seeded), no fixtures. llama-server sends Access-Control-Allow-Credentials: false, not absent.
- Left open: boot group TC-070..076 and TC-083..086 blocked; TC-073 allow-list updated but not run.
Next agent reads: docs/backend/05-test-report.md sections 1, 3, 5

## fe-reviewer #2 · step 4 (frontend review) · round 2 · increment 1 · 2026-11-15T02:04:20Z
Task: re-check FND-001..004 (fix commit 1ae2fab) against 4399 and the code; record in 05-review.md §5 (filed by orchestrator from the return)
Changed: docs/frontend/05-review.md — FND-001..004 Status "fixed in round 2"; §5 re-check table
Result: 4/4 fixed, 0 open; unit tests 26/0 — evidence: session scratchpad fe-reviewer-2/recheck.out, unit.out
Next agent must know:
- Pitfalls: 4399 serves web/ directly; "Listening" sits in the hint line without .is-shown (visually hidden, role=status) — read hint.key / ARIA, not visibility
- Left open: FND-005..009 minors deferred (§4); stale comment web/js/talk-button.js:9 ("wait for the seconds")
Next agent reads: docs/frontend/05-review.md §5


## be-reviewer #2 · step 6 re-check · round 2 · 2026-11-15T04:18:53Z
Task: re-check FND-001..005 against HEAD 518a58c and live node 61506 (filed by orchestrator from the return).
Changed: docs/backend/06-review-report.md §5 + Status of FND-001..005 = fixed in round 2.
Result: 5/5 fixed, each reproduced (FND-001 with a mutation check); npm test 145/145; p6 pass.
Next agent must know:
- FND-006..012 open as minors, deferred BD-009..015; 9B cold load vs 300 s unmeasured; TC-073 not in npm test (boot suite manual).
- noticed: per-run LLAMA_API_KEY visible to the same user via ps eww (design only promises out of argv); causeOf cuts at 200 chars.
Next agent reads: docs/backend/06-review-report.md §5
