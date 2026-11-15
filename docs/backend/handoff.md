# Handoff — run companion-full-dev

## be-analyst #4 · step 2 (fixture answers) · round 1 · increment 2 · 2026-11-15T05:20:46Z
Task: place FX-009..013 under tests/fixtures/candidates/ with input, expected (from REQs) and meta.json; list where 03 § Increment 2 misses or contradicts REQ-014..035.
Changed: tests/fixtures/candidates/FX-009..FX-013/ (new; input.json, expected.json, meta.json each). Nothing else.
Result: PLAN.inputs/expected/meta conditions replicated with gatelib.docs parsers: 5/5 have input, expected, meta (req in declared set, valid compare, source). Gate not run by me. FX-012 values computed from REQ-031/A26 by an independent 6-line rule; equal to DES-021 / log §J on all 7 rows.
Next agent must know:
- Pitfalls: FX-009/010/011/013 are property checks like FX-001 (reply varies); FX-009 runs 10 (crisis), reply_checks only runs 1-3 (REQ-024 says 3). FX-013 input is text; the test calls speechParts -> /api/speak -> afconvert 16 kHz -> /api/transcribe.
- Pitfalls: every FX-009/010 row hinges on the crisis list approved at Plan (meta list_dependency names the draft phrase per row); FX-009-08 flips to false if the user answers Q9 'no'.
- Pitfalls: gatelib reads REQ-015 'Fixtures: n/a — … 借用 FX-013' as declaring FX-013, so traceability will show FX-013 for REQ-015 although FX-013 checks no timing.
- Left open (user at Plan): crisis list + Q9; FX-011-03 accepts 小伙伴 or Little Buddy [unverified]; FX-013-02 reference skips the emoji [unverified]; DES-020 step 3 (silent fixed reply when Bonsai fails on a crisis turn) vs REQ-011/REQ-004.
- Left open: design gaps returned to the orchestrator (REQ-031 >200-char name -> 400; space collapse; REQ-015 in-flight part up to ~4 s vs '≤ ~2.5 s'; REQ-033/034 viewing and 4-line summary cadence; Traditional crisis words).
Read beyond the list: docs/backend/logs/be-architect-6-tts.log §E, §F, §I, §J — measured timings and draft rule results; ~/.claude/gates/gatelib/docs.py _fixtures — parser behaviour.
Next agent reads: tests/fixtures/candidates/FX-009..013/meta.json; 03 § Increment 2 DES-019..021

## be-architect #7 · step 2 (design, analyst contradictions) · round 2 · increment 2 · 2026-11-15T05:25:08Z
Task: resolve be-analyst #4's six design contradictions in 03 § Increment 2 with the smallest edits.
Changed: 03-detailed-design.md — DES-018 (+lang source line), DES-019 (+TRAD_FOLD 13 chars, step 6), DES-020 (+UD-1 block in Interface, step 3 ref), DES-021 (step 1: any string length cleaned, non-string 400; A26 details as code comments), DES-030 (+summarize triggers, +read-only view, steps renumbered), §3 bad_request row, §9 rows `name`, `lang`, `crisis` and the DES-030 intro line. 02-architecture.md line 161 (`name` any length). Nothing else.
Result: gatelib docs.designs/prose_units on 03 § Increment 2: all DES ≤ 120 words (max DES-008 119, DES-030 115), no prose unit > 50. Gates p2/p3 not run by me.
Next agent must know:
- Pitfalls: §9 seam text changed (rows respond-in `name`, `lang`, `crisis`; intro DES-030 clause) - contract file must be re-copied by the orchestrator.
- Pitfalls: DES-019 now folds Traditional before matching; FX-009 has no Traditional row - analyst may add '我想自殺。' (expected crisis) and '跳樓價' (not).
- Pitfalls: a > 200-char name now gets 200 and is cleaned, not 400 (DES-021); FX-012 meta 'status 200' still holds; no row tests a long name ('x'.repeat(5000) -> 'xxxxxxxxxxxx' in the code comment).
- Left open (user at Plan): UD-1 crisis-turn fallback (a) fixed sentence + 988, no error [recommended] vs (b) REQ-011 error, no 988/card.
- Left open: memory viewing/summary cadence are design-only (DES-030 Interface block); looks are fe-ux/fe-ui's.
Read beyond the list: nothing
Next agent reads: 03 § Increment 2 DES-019..021, DES-030, § 9 Seam (increment 2)

## fe-ux #6 · step 1 (frontend UX) · round 1 · increment 2 · 2026-11-15T05:35:13Z
Task: append `## Increment 2 — 2026-11-15` to docs/frontend/01-ux.md: flows, state rows and zh/en words for P1 (voice reply, breathing, 988 card, clear, poke, rename) and memory (design only).
Changed: docs/frontend/01-ux.md (+231/-3) — § Increment 2: Pages row (all active [interface] REQs + REQ-032..035 design only), Navigation, FLOW-008..014 (014 design only), PAGE-001 (increment 2) rows + rules, Words (increment 2) incl. memory words, moods, text wireframes, decisions for Plan; increment-1 Global/Keyboard nav lines and wireframe priority line retired in place.
Feedback: no DFB raised: no confirmed layout changes (new controls in free stage corners / caption row, new content in the log).
Result: gatelib parsers: FLOW-008..014 = 80/78/79/66/65/72/71 words, prose units > 50 = [], first PAGE-001 block 196, unserved active REQs = []; all new user-visible characters in web/fonts/lxgw-wenkai-subset.woff2 (fontTools cmap); node --test tests/verify-r1.test.js 5/5. Gate fe-ux not run by me. 0 Figma calls.
Next agent must know:
- Pitfalls: tests/verify-r1.test.js reads every "| `key` | zh | en |" row from the increment-1 Words heading to file end and expects 29 hints.* + named keys; increment-2 Words tables start with a "Where" column so they are not captured. Keep that shape.
- Pitfalls: `{name}` keys (title, inputLabel, typing, companionCaption/Name, 6 hints) read exactly as increment 1 with the default name, so the increment-1 table stays true.
- Pitfalls: health polling must continue until tts is ready (health-watch now stops at bonsai+stt); tts never adds a hint or blocks Enter/hold. Reading stops at talk-button press, before the mic opens.
- Pitfalls: `data-mood` stays the turn's mood during breathing and pokes; companion becomes a focusable button (pokeHelp description); caption row holds the name button and speaker toggle, so it cannot stay aria-hidden as a whole.
- Left open: phone fit of clear (stage top-left, 8 px inset) and the speaker toggle in the 280 px stage caption row is fe-ui's to check; a DFB if it needs a layout change. Six decisions for the user at Plan (01-ux § Increment 2 "Decided here").
Read beyond the list: tests/verify-r1.test.js:15-38 — how the Words table is parsed.
Next agent reads: docs/frontend/01-ux.md § Increment 2 (Navigation, PAGE-001 (increment 2), Words (increment 2), Wireframe additions)

## fe-ui #6 · step 2 (frontend UI, increment) · round 1 · increment 2 · 2026-11-15T05:57:36Z
Task: draw increment 2 frames (speaker toggle, clear, breathing, 988 card, pokes, rename, memory design-only), export FRAME-017..025, append § Increment 2 to docs/frontend/02-ui.md.
Changed: docs/frontend/02-ui.md (+177/-2) — § Increment 2: plan, self-check, revisions, CMP-007..012, CMP-001/002/005 (increment 2), Frames, a11y, motion; CMP-001 phone 240 px and role=img retired in place. Figma section 48:832: FRAME-017 49:842, 018 49:1009, 019 49:1163, 020 50:1091, 021 50:1241, 022 50:1378, sheets 023 48:833, 024 51:1310, 025 52:1507. evidence/design/FRAME-017..025.png (1x).
Feedback: no DFB: phone caption row + muted toggle measures 297 px of 358 (FRAME-022); clear fits at 8 px inset.
Result: gatelib prose units > 50 = []; every new CMP States line names focus; 9/9 crops edge-checked against the render. Gate fe-ui not run by me. Figma calls: 15 (2 failed and rolled back) + 1 denied by the auto-mode classifier before reaching Figma.
Next agent must know:
- Pitfalls: pokes and breathing reuse the 5 mood SVGs (face swap); data-mood and the glow stay the turn's. Only new art: the pop-ticks SVG inline in CMP-001 (increment 2).
- Pitfalls: phone art is 228 px now (stage 6+228+4+36+6); breathing swell is 1.04 on phone, 1.08 on laptop.
- Pitfalls: exports are cut from one section render (get_screenshot adds a 40 px margin; scale 1).
- Left open: not drawn — phone renaming (note costs 20 px of art), caption wrap overflow, English laptop increment-2 states, memory phone sheet, toggle hover.
- Left open: decided here for Plan — 收起 moves focus to the input; 删掉 is a filled Cocoa button (design only).
Read beyond the list: ~/.claude/gates/gatelib/docs.py:54-119 — prose and field parsers.
Next agent reads: docs/frontend/02-ui.md § Increment 2 (CMP-001 increment 2 poke table, Motion (increment 2), Frames (increment 2))

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

## fe-engineer #17 · step 2 (feasibility + queue) · round 2 · increment 2 · 2026-11-15T06:10:00Z
Task: append `## Increment 2 — 2026-11-15` to docs/frontend/03-queue.md (rows Q-020.. from the design), extend contract §2 PAGE-001 per 01-ux; no product code.
Changed: docs/frontend/03-queue.md (+~250/-0) — § Increment 2: changed-earlier-rows table, scaffold, feasibility notes, Q-020..Q-034 (15 rows; Q-034 = FRAME-025 skipped, design only), notes, dependencies; contracts/FRONTEND_BACKEND_CONTRACT.md — §2 PAGE-001: name/lang/crisis/speech fields, speaking/offer/crisis/cleared/tts states, new `speak` action, change-log row.
Feedback: no DFB: phone caption row, clear inset, 228 px art fit as fe-ui measured; assumptions A-I2-1 (clear while pending drops the late reply silently; card stays under its reply) need no design change.
Result: round 2: Q-012/014/015/018/019/020 trimmed (status/Fix parentheticals dropped, history is in git), all rows ≤ 80 by gatelib docs.words; Q-034 added for FRAME-025 (skipped); 0 Figma calls.
Next agent must know:
- Pitfalls: health-watch must keep polling until tts is ready, but onChange then fires on a tts-only change; app.js healthHint(null) would clear `awake` early, so Q-026 uses a separate callback.
- Pitfalls: the 11 {name} keys stay default-name text in the zh/en tables (verify-r1.test.js reads them); substitute into the live copy object at setLang/setName.
- Pitfalls: companion becomes a button; caption loses aria-hidden; keep data-testid fake-input, reply, companion; pokes and breathing swap the face layer only, never data-mood or the glow.
- Pitfalls: app.js, companion.js, copy.js are shared by most rows: build one row at a time in the Dependencies order.
- Left open: Safari first-play autoplay [unverified]; phone caption row re-measure (Q-032).
Read beyond the list: web/index.html, web/js/copy.js, web/js/log.js, web/js/health-watch.js, tests/verify-r1.test.js — structure and tests the rows touch.
Next agent reads: docs/frontend/03-queue.md § Increment 2 (rows and notes), contract §2 PAGE-001

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
