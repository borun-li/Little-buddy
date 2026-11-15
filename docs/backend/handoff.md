# Handoff — run companion-full-dev

## be-analyst #5 · step 2 (fixture answers) · round 2 · increment 2 · 2026-11-15T06:10:29Z
Task: add one crisis-true row to FX-009 for the user's Plan addition (活着没什么意思 family, DES-019) before the user locks FX-009..013.
Changed: tests/fixtures/candidates/FX-009/input.json (+2/-1) — new case FX-009-09 "有时候觉得活着没什么意思，想就这样消失。" (FRAME-019 line), history []; expected.json (+14) — FX-009-09 status 200, crisis true, zh reply_checks same shape as 01/02/03/08; meta.json (+2/-2) — source and list_dependency name row 09 and its phrase. Existing cases, FX-010..013, 01, 03, code and tests untouched.
Result: json.tool parses all 3 files; gate p2 PASS (exit 0) — evidence: docs/backend/gates/p2-latest.json. Row 09 label from the user's Plan decision; rule result crisis x10 in docs/backend/logs/be-architect-8-crisis.log §C (line 26).
Next agent must know:
- Pitfalls: FX-009 now has 9 cases (5 zh, 4 en); FX-009-09 is the only row that depends on the user's addition, not on REQ-023's original list.
- Pitfalls: FX-009 still runs 10 (crisis) with reply_checks in runs 1-3 (REQ-024); unchanged.
- Left open: 01-requirements.md § Increment 2 Fixtures table row FX-009 (line 417) does not list the new line; out of my brief (no edits to requirements). Orchestrator decides whether to dispatch that one-cell edit.
- Left open (from #4, still for the user): FX-011-03 小伙伴 or Little Buddy [unverified]; FX-013-02 emoji skipped [unverified].
Read beyond the list: docs/backend/logs/be-architect-8-crisis.log §C — measured rule result for the new row.
Next agent reads: tests/fixtures/candidates/FX-009/meta.json; 03 § Increment 2 DES-019 (Interface block)

## be-architect #8 · step 2 (user decisions at Plan) · round 3 · increment 2 · 2026-11-15T06:08:48Z
Task: apply the user's Plan decisions to 03 § Increment 2 (DES-019 活着没什么意思 family; voice serena; UD-1 (a); crisis list approved).
Changed: 03-detailed-design.md (+20/-13) — DES-016 (+speaker = serena line), DES-017 (+voice = cfg.tts.voice 'serena' line), DES-019 (list marked approved; +6 zh phrases 活着 + 没有/没什么/没啥/没 + 意思/意义; TRAD_FOLD +麼,麽 -> 么; fires/not rows; step 6 "15 个繁体字"), DES-020 (words: Plan approved; UD-1 = (a) recorded, (b) kept as one "rejected" line; step 3 ref). docs/backend/logs/be-architect-8-crisis.log (new).
Result: scratch rule x10: FX-009 8/8 true, FX-010 6/6 false, FRAME-019 line true, 13 variants true, 8 near misses false (37/37, exit 0) — evidence: docs/backend/logs/be-architect-8-crisis.log. gatelib docs.designs: DES-016 92, DES-017 97, DES-019 104, DES-020 86 words; no prose unit > 50. Gates p2/p3 not run by me.
Next agent must know:
- Pitfalls: 想消失 / 想就这样消失 deliberately NOT added ('尴尬得想消失' idiom); the FRAME-019 line fires on 活着没什么意思. If the user wants them, it is one list edit.
- Pitfalls: TRAD_FOLD now 15 chars; 什么 in Traditional is 什麼 (or variant 什麽) - without the fold '活著沒什麼意思' would miss.
- Left open (outside my brief, "only DES-016/017/019/020"): DES-023 line `voice: envVoice()` comment and § 5 `TTS_VOICE` row still say "pending the user's choice at Plan, Q6"; § 9 `crisis` row still says "UD-1 推荐 (a)，Plan 定；选 (b) 删此句" — wording only, behaviour already matches; orchestrator decides whether to dispatch the edit (then re-copy the seam).
- Left open: FX-009 has no row for the new phrases; analyst may add the FRAME-019 line as a crisis-true row.
Read beyond the list: docs/frontend/evidence/design/FRAME-019.png — the example line's exact text.
Next agent reads: 03 § Increment 2 DES-019 (Interface block), DES-020 (UD-1 lines); docs/backend/logs/be-architect-8-crisis.log

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

## be-developer #5 · step 4 (build) · round 1 · increment 2 · 2026-11-15T07:03:10Z
Task: build the backend half of increment 2 (DES-016..023): TTS helper + /api/speak, crisis rule + crisis reply (UD-1 (a)), name, respond lang/crisis/speech, health tts; fix TC-137 (orchestrator, same round).
Changed: stt/Package.swift (+6) + stt/Sources/CompanionTTS/main.swift (new, 100): companion-tts, serena, maxNewTokens 120, zh/en caches. server/tts.js (new, 191): createTts queue + speechParts. server/crisis.js (new, 41), server/name.js (new, 19). server/prompts.js (+19), server/bonsai.js (+43/-14): SENTENCE export, crisisReply, respond(line, history, name). server/main.js (+58/-14): parseTurn name, parseSpeak, /api/speak, health tts, missing-TTS path, warm-only waits for tts. server/config.js (+34/-2). tests/dev-increment2.test.js (new, 11 unit tests, not in npm test). 08 § Increment 2 (deviations 10–15), codemap server/ + stt/, logs/be-developer-5-inc2.log.
Result: live FX-009 27/27 crisis true + 988 (FX-009-09 3/3), FX-010 6/6 false, FX-011 9/9, FX-012 7/7 200, FX-013 15/15 speak 200 24 kHz, read back CER/WER 0. Aborted queued part never reached the helper. Unit 11/11; unit+fakes 68/68 incl. TC-137. npm test 185/187: TC-052 latency (HEAD code equally slow, A/B) and TC-054 504 (passes alone). Evidence: docs/backend/logs/be-developer-5-inc2.log
Next agent must know:
- Pitfalls: instance A is now node 37595 (stt 37602, bonsai 37603, tts 37604) on 4400/4401. PID in the session scratchpad server.pid, log in scratchpad instanceA.log. Boots in ~10 s.
- Pitfalls: on a timeout or in-flight abort the tts slot is freed and the next line is written. Late answers are dropped by id, and helper id -1 is never paired (08 dev. 10–11).
- Pitfalls: npm run setup does NOT fetch the TTS model (design says never download). The brief said it should, so this is logged as a contradiction in 08 for the user/architect.
- Pitfalls: the machine is slower now (27% memory free under npm test), so REQ-008 TC-052 fails for old and new code alike.
- Tried, did not work: nothing.
- Left open: REQ-015 page timing; REQ-024 tone (FX-009-03 replies ask one question despite CRISIS_RULE); Wi-Fi-off run with tts; the stale "pending Plan" text in 03 DES-023 / § 5 / § 9.
Read beyond the list: scratchpad arch6/pkg/Sources/CompanionTTS/main.swift (architect's measurement helper).
Next agent reads: server/tts.js:9-140; server/bonsai.js crisisReply + respond; docs/backend/08-implementation-log.md § Increment 2

## fe-tester #6 · step 3 (client tests for Q-020) · round 1 · increment 2 · 2026-11-15T08:10:00Z
Task: write tests/client.test.js for Q-020 (2 updated Q-010 assertions + 7 Q-020 tests) after the gate restored HEAD.
Changed: tests/client.test.js only. Engineer's test diff reviewed: both Q-010 changes are required by the contract (respond now returns lang/crisis/speech; health returns tts) and stay deepEqual, not weakened. Strengthened: respond body now deepEqual {line, history, name} (was name only); speak checks Content-Type application/json.
Result: with HEAD client the file fails to load (no SPEAK_TIMEOUT_MS export), so all 14 fail until the engineer's client is restored. With the engineer's client copied to a scratch dir: 14/14 pass; mutation 11000 to 12000 turns the speak timeout test red.
Next agent must know: orchestrator restores web/js/companion-client.js then runs the gate; no existing fe-tester #6 section existed, this one is new.
Next agent reads: tests/client.test.js (Q-020 block at the end)
Earlier entry (fe-tester #5, increment 1) follows.
Task: re-point docs/frontend/04-verification.md to evidence/verify-3/manifest.md and confirm the 19 verdicts against the verify-3 files.
Changed: docs/frontend/04-verification.md only (header, round note, Q-010 row). Verdicts: done 7 (Q-001, 002, 003, 005, 008, 015, 017), not observable 12. Q-010 done to not observable: in verify-3 the sad follow-up reply does not show recall of the first line (mood and English reply do hold).
Result: every backticked filename in the file exists in verify-3 or design (script check); manifest named as evidence/verify-3/manifest.md; no verify-2 left. 0 Figma calls. No tests added or edited.
Next agent must know:
- Pitfalls: the model's reply text changes per capture run, so recall-type observables (Q-010) are flaky evidence; a fixed-reply stub check would settle it.
- Left open: the not-observable rows still need a mic, a failing backend, reduce-motion emulation or a network log (user check at Acceptance).
Next agent reads: docs/frontend/04-verification.md

## fe-engineer #21 · step 3 (build Q-023) · round 1 · increment 2 · 2026-11-15T09:30:00Z
Task: Q-023 — rename in place.
Changed: web/js/name.js (new), tests/name.test.js (new, 8 tests), web/index.html (caption row), web/css/page.css (row, name button, field, note), web/js/companion.js (writes name button + phrase), web/js/app.js (loadName/setName at open, savedName on every respond, rename wiring), package.json (test list), docs/codemap.md, docs/frontend/03-queue.md.
Result: name.test 8/8 (FX-012 7/7); frontend unit files 107/108, the 1 failure is tests/fnd-r1-fix.test.js "FND-001/002 app.js wiring" (expects `onUtterance: (audio) => pending ? false`; Q-022 changed that line, not this row). Headless Chrome on :4400 at 1440 and 390: name saved, shown in button, companion label, title, input label; survives reload and clear; Esc keeps; click away saves; emptied -> default; live respond body carried name "团子" and the reply used it.
Next agent must know:
- Pitfalls: caption row = name button, aria-hidden phrase, empty `.caption__speaker` slot for Q-025. The phone note sits above the row (the 280 px stage clips below it). copy.hints is rebuilt on setName, so always applyCopy after.
- Left open: fnd-r1-fix test needs a fe-tester update (see Result).
Next agent reads: docs/frontend/03-queue.md Q-024

## be-tester #6 · step 4 (gate fix) · round 2 · increment 2 · 2026-11-15
Round 2 (be-tester #6, gate fix):
Task: fix p4 P4.plan-coverage and CTX.codemap.
Changed: docs/backend/04-test-plan.md line 572 (TC-136 Verifies lists REQ-019..022, 025..029 one by one; the gate does not parse ranges); docs/codemap.md line 56 (ready without backticks).
Result: docs.testcases now gives TC-136 the REQs 015, 016, 018, 019-022, 025-029. Gate not re-run (17 min suite).
Next agent must know: the plan parser reads only single REQ-nnn ids, so never write REQ-019..022 in a Verifies line.
Round 1 entry (be-tester #5) follows.
Task: plan and write the increment-2 backend tests (REQ-014..031, FX-009..013) to the design's interfaces, in parallel with the build.
Changed: docs/backend/04-test-plan.md (§ Increment 2, TC-090..TC-137); tests/server-unit.test.js (TC-090..108; TC-015 gains speak limits/deadlines), tests/server-fakes.test.js (TC-109..117, 137; TC-029 gains lang, crisis), tests/server-live.test.js (TC-040 gains tts; TC-120..132), tests/server-boot.test.js (TC-073 allow-list 23 events), new tests/support/fake-tts.cjs. No server, stt, web, package.json or fixtures touched.
Result: written 46 TCs (automated 42 across unit 19, fakes 10, live 13; manual 4: TC-133..136). Run against the partly built code: unit+fakes 67 pass, 1 fail (TC-137: tts.js waits for a hung helper's answer, so one HANG blocks later speaks until the process dies; tts.js:134). Live TC-120..132 not run to completion: instance A on 4400 still runs the old build (health has no tts, /api/speak 404).
Next agent must know:
- Live TTS tests FAIL (not skip) if health tts is not ready after 300 s: the server at COMPANION_URL needs the compiled companion-tts and models. FX-009 + FX-010 live need about 150 respond calls (5 to 8 min).
- TC-111 requires only "an aborted speak gives no audio and settles"; DES-017 does not say reject vs resolve. TC-094 skips U+00B4 (NFKC makes it unreachable in normalizeForCrisis).
- Frontend-only REQs (016, 019..022, 026..029, page halves of 015, 018, 025) are TC-136, fe-tester.
Next agent reads: docs/backend/04-test-plan.md § Increment 2 (I2.2, I2.5)

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
