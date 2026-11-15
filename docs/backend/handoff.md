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

## be-architect #9 · step 6 (review fixes) · round 1 · increment 2 · 2026-11-15T10:16:00Z
Task: design review round 1 fixes FND-013, 014, 015, 016, 019, 020 and TC-125 in 03 § Increment 2 (no code).
Changed: 03-detailed-design.md (+44/-19): DES-016 (chunkingStrategy .none; RTF up to 2.7), DES-017 (slot held until helper answers; overdue kill 30 s; id -1 = slot answer; queue cap 4), DES-019 (GREETING_EXCEPTIONS end-of-clause only), DES-020 (CRISIS_MARK), DES-021 (NAME_RULE bans the words), DES-022 (isWellFormed), DES-023 (speakQueue 4, ttsOverdueMs 30000), § 3/§ 4/§ 9 rows. docs/backend/logs/be-architect-9-fixes.log (new).
Result: FND-014 scratch rule x10: 36/36 as expected (FX-009 9/9 true, FX-010 6/6 false); plain substring removal fails '我想死我了真的撑不下去' (same log). gate p2 PASS (output in scratchpad arch9/p2.txt). DES words: 016 92, 017 111, 019 107.
Next agent must know:
- Deviations #10 and #11 (08:117-118) are replaced by DES-017; settle() must no longer pump; only an answer (id or -1) or the child's exit frees the slot.
- Overdue kill uses proc.child.kill('SIGKILL'); no new log event (child_exit records it; TC-073 allow-list stays 23).
- Each overdue kill spends one of 5 restarts that never reset (BD-011).
- Seam § 9 speak row changed ("合法 UTF-16") -> orchestrator re-copies the contract.
- Tester: TC-137 and the abort test change; needs a one-at-a-time fake (reads the next line only after answering); TC-125 wording unmeasured.
Next agent reads: 03 § Increment 2 DES-017, DES-019, DES-023; docs/backend/logs/be-architect-9-fixes.log

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

## be-developer #6 · step 6 (review fixes) · round 1 · increment 2 · 2026-11-15T10:26:00Z
Task: fix FND-013, 014, 015, 016, 019, 020 and TC-125 to be-architect #9's revised DES-016, 017, 019..023.
Changed: server/tts.js (slot held until the helper answers id or -1; abort or timeout settles at once and writes nothing; 30 s overdue → SIGKILL → restart; queue cap 4), server/config.js (speakQueue 4, ttsOverdueMs 30000), server/main.js:72 (isWellFormed), server/crisis.js (GREETING_RE end of clause), server/prompts.js (CRISIS_MARK, NAME_RULE), server/bonsai.js:86, stt/Sources/CompanionTTS/main.swift:16 (rebuilt), tests/dev-increment2.test.js (12 tests). 08 fix round 1 (deviations 16–17; #10/#11 superseded), codemap.
Result: swift build pass, 0 warnings. unit + fakes + dev + tester's server-tts-serial: 90/90. Live on new instance A: crisis rows ok, name 988 → CRISIS_LINE, lone surrogate → 400, a part aborted at 0.5 s then a short part → 200 (queued_ms 2364), name 团子 ×5 → 0 with 小伙伴.
Next agent must know:
- Pitfalls: instance A is now node 31464 on 4400/4401 (PID in scratchpad server.pid, log in scratchpad instanceA.log). The old 37595 tree is stopped.
- Pitfalls: in main.swift a bare `.none` for `chunkingStrategy` is Optional.none (nil → `.sentence`). Keep `.none as TextChunkingStrategy` (08 dev. 16).
- Pitfalls: npm run setup does NOT fetch the TTS model (design: never download); the brief contradiction is still open in 08.
- Tried, did not work: `TextChunkingStrategy.none` is correct Swift, but TC-147's regex wants the literal `.none`, so it was replaced by the `as` form.
- Left open: npm test (live suites) not run this round; REQ-015 page timing; REQ-024 tone; Wi-Fi-off run with tts.
Next agent reads: server/tts.js:9-160; docs/backend/08-implementation-log.md § Fix round 1 (step 6, be-developer #6)

## fe-tester #9 · step 4 (verify increment 2) · round 1 · increment 2 · 2026-11-15T10:20:00Z
Task: one verdict per row Q-020..Q-033 from evidence/verify-4 (76 captures), plus TC-084, TC-085, TC-086, TC-136 page halves.
Changed: docs/frontend/04-verification.md (Increment 2 section appended), tests/verify-i2.test.js (new, 7 tests, not in the package.json script).
Result: done 7 (Q-020, 021, 022, 023, 028, 029, 030), not done 1 (Q-024), not observable 6 (Q-025, 026, 027, 031, 032, 033). 15 increment-2 unit files by name: 118/118 green. verify-i2.test.js: 6 green, 1 red on purpose (Q-024). Mutations on a scratch copy of the captures turned the Q-022, Q-026, Q-029, Q-030 tests red; an unrelated edit stayed green.
Q-024 defect: nextPoke draws freely among the two reactions that are not the last, so six pokes show only two reactions in 6.3 % of runs (200,000 simulated; theory 6.25 %). tests/poke.test.js "six pokes" is flaky because the code is wrong, not the test; fix the code (shuffled bag of three, new bag never starts with the last played) and that test then always passes. Do not weaken the test.
TC verdicts: TC-084 still manual (zh-UI plus English line and silence need a mic; client sends no language: client.test.js green); TC-085 partly verified (no Han outside the log in every English dump) and the switch-with-existing-reply step still manual; TC-086 still manual (needs a stopped test server); TC-136 partly verified: toggle muted, breathing, card, clear, rename seen; read-aloud timing, stop-on-talk, reduced motion manual; poke fails on the six-poke rule.
Next agent must know: verify-i2.test.js reads captures (VERIFY_DIR overrides) and is red until Q-024 is fixed; add it to the package.json test list after the fix. Live :4400 used for 3 calls (health, one speak, one respond), nothing stopped.
Next agent reads: docs/frontend/04-verification.md § Increment 2; web/js/poke.js:12-17; tests/verify-i2.test.js
(Earlier fe-tester entries: git history of this file.)

## fe-engineer #33 · step 4 (review fixes) · round 1 · increment 2 · 2026-11-15T10:33:45Z
- FND-010: `web/js/log.js` showCrisisCard fills the card words, then scrolls (was scroll then fill). 6 turns: card 911 bottom 703 vs log bottom 736 at 1440x900 (also reduced motion), 731 vs 764 at 390x844.
- FND-011: `web/js/name.js` size() measures the text in the field's font (hidden span, fieldWidthPx); ch only as fallback. 小伙伴 / 团子团子: client = scroll width (72 / 94 at 1440, 48 / 63 at 390), zh and en.
- FND-012: `web/js/poke.js` createBag (shuffled bag of three, new bag never opens with the last); nextPoke and createPoker use it. verify-i2 and poke tests pass; 200k pokes: every 3 and every 6 cover all three, no repeat.
- FND-013: `web/css/page.css` @media (max-width: 959px) and (max-height: 520px): stage clamp(120px, 32vh, 280px), art = stage - 52. Log at 640x400 was 168 with a 280 stage (about 40 with the composer under old rule) -> 192; 640x360 -> 160; card whole in view at both. 390x844, 375x667, 1440x900 unchanged (stage 280 / log 484, 307 / 736). Note for fe-ui: art is 75 / 67 px at those heights (floor 120 px stage chosen so the 128 px card fits at 360).
- FND-020: `web/js/speaker.js` reading() aborts its controller when it ends early.
- Tests: new `tests/fnd-i2-r1-fix.test.js` (7); `tests/verify-i2.test.js` added to the package.json test script before `tests/crisis-card.test.js`. 27 frontend files: 185 pass, 0 fail. No existing test edited.
- `docs/codemap.md` updated. Figma calls: 0.

## be-tester #9 · step 6 (tests for review fixes) · round 1 · increment 2 · 2026-11-15T10:35:00Z
Task: tests for review round 1 design changes FND-013/014/015/016/019/020 (03 § Increment 2); plan rows TC-138..147.
Changed: tests/support/fake-tts-serial.cjs (new, one-at-a-time helper: SLOW/HANG/NEG/ERR); tests/server-tts-serial.test.js (new, TC-138..143; in package.json `test` and `test:backend` after server-fakes); tests/server-unit.test.js (TC-144 surrogates, TC-145 bare 988, TC-146 FND-014 rows + FX-009/010, TC-147 static .none; TC-093 reads GREETING_EXCEPTIONS, TC-099 two assertions moved to the CRISIS_MARK rule, TC-015 gains speakQueue/ttsOverdueMs); tests/server-fakes.test.js (TC-137 rewritten); docs/backend/04-test-plan.md (rows, matrix).
Result (explicit file lists, developer's code as landed at run time): server-tts-serial + server-unit + server-fakes 78/78 pass. Not run: server-live, server-boot (start servers), the p5 gate, full `npm test`.
Next agent must know:
- TC-137/TC-093/TC-099/TC-015 changed because the design changed (deviation #10 superseded, greetings moved, bare-988 rule, new config keys), not relaxed.
- Pitfalls: TC-147 is a source check; it passes a bare `.none` (Optional.none = nil in Swift) as well as `.none as TextChunkingStrategy`. Real proof is live audio length (TC-134).
- The serial fake logs arrival time of each line (stdin drained at once) so a server writing early is visible; processing is strictly serial.
- Left open: 05 report not updated (p5 re-run is step 5's job); TC-125 wording still unmeasured.
Read beyond the list: none.
Next agent reads: docs/backend/04-test-plan.md TC-137..TC-147; tests/server-tts-serial.test.js

## fe-reviewer #3 · step 4 (review, increment 2) · round 1 · increment 2 · 2026-11-15T10:15:22Z
Task: coordinate the increment-2 panel (E-1..4, A-1..6, I-1..3) plus fe-tester #9's not-done row Q-024.
Changed: docs/frontend/05-review.md, appended "Increment 2 — round 1" (FND-010..022). Nothing else.
Result: 13 findings (0 blocker, 4 major, 9 minor), 0 dropped, E-1 and A-2 merged. Verdict: send back. Evidence is in the session scratchpad fe-reviewer-3/ (crisis.out, zoom.out, rename.out, misc.out, poke.out, verify-i2.out). All /api/* were stubbed, so 0 live calls. :4400 serves web/ byte-identical to the tree (cmp).
Next agent must know:
- Fix round (majors):
  - FND-010 (fe-engineer): crisis card scrolled before it is filled (log.js:220-221). This one shows in the demo.
  - FND-011 (fe-engineer): rename field width in ch (name.js:60).
  - FND-012 (fe-engineer): Q-024, use a shuffled bag of three (poke.js:14). Turns tests/verify-i2.test.js green.
  - FND-013 (fe-ui rule first, then fe-engineer): fixed 280 px stage row at 200 % zoom (page.css:26).
- Frontend FND-010..022 are not backend FND-010..013. Backend FND-013 (TTS keeps generating after an abort) is not filed in the frontend doc.
- Deferred: FND-014..022, plus fe-tester #9's 3 minor deviations (05-review.md Increment 2 §4).
- Pitfall: crisis-card probes need about 6 earlier turns. A crisis turn on an empty log fits and hides the bug.
Next agent reads: docs/frontend/05-review.md § Increment 2 — round 1


## be-reviewer #2 · step 6 re-check · round 2 · 2026-11-15T04:18:53Z
Task: re-check FND-001..005 against HEAD 518a58c and live node 61506 (filed by orchestrator from the return).
Changed: docs/backend/06-review-report.md §5 + Status of FND-001..005 = fixed in round 2.
Result: 5/5 fixed, each reproduced (FND-001 with a mutation check); npm test 145/145; p6 pass.
Next agent must know:
- FND-006..012 open as minors, deferred BD-009..015; 9B cold load vs 300 s unmeasured; TC-073 not in npm test (boot suite manual).
- noticed: per-run LLAMA_API_KEY visible to the same user via ps eww (design only promises out of argv); causeOf cuts at 200 chars.
Next agent reads: docs/backend/06-review-report.md §5
