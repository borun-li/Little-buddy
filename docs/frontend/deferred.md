# Deferred

| # | Item | Source | For |
|---|---|---|---|
| D-001 | English replies (and English UI copy) must be possible — needed for the competition demo | user, UI stop 2026-11-14: "回复目前做中文，后续为比赛必须允许英文" | in run companion-full-dev (docs/backend) |
| D-002 | Real STT (WhisperKit), Bonsai replies, emotion classification; contract open items O-1..O-4 | Prototype tier scope, kickoff 2026-11-14 | in run companion-full-dev (docs/backend) |
| D-003 | Reply quality: real conversational replies to any line/question (fake presets only answer by keyword) | user, Prototype stop 2026-11-14 | next run (Full development, Bonsai) |
| D-004 | 02-ui.md §3 mood alpha tokens (50/24/34/20 %) and §6 contrast row (8.5:1) are stale after DFB-003; CMP-001 values (Honey 64/30 %, Tide 46/30 %; 7.2:1) win | fe-ui #3, 2026-11-14 | closed — fixed in place by fe-ui #5, increment 1, 2026-11-14 |
| D-005 | 01-ux.md mood table says pleasant-high never "over the top"; superseded by user's DFB-003 request | fe-ui #3, 2026-11-14 | closed — retired in place by fe-ux #3, increment 1, 2026-11-14 |
| D-006 | FND-004 awake timer wipes a newer talk-button hint (`web/js/app.js:30`) | fe-reviewer #1, 2026-11-15, minor | closed — fixed with FND-001 (fe-engineer #16), re-checked fe-reviewer #2, 2026-11-15 |
| D-007 | FND-005 stillDown at ~40 s when health hangs, not 30 s (`web/js/health-watch.js:44`) | fe-reviewer #1, minor | later run |
| D-008 | FND-006 >1500-char transcript shown in full, 1500 sent; failure returns it to a maxlength-500 input | fe-reviewer #1, minor | later run |
| D-009 | FND-007 phone: after a failed send the field shows the start, caret at the end | fe-reviewer #1, minor | later run |
| D-010 | FND-008 English placeholder cut below 390 px (fe-ui) | fe-reviewer #1, minor | later run |
| D-011 | FND-009 switch visible "EN" vs accessible name "English" (CMP-006 design, fe-ui) | fe-reviewer #1, minor | later run |
| D-012 | fe-tester #2 minor deviations: Q-001 disc 460 vs 486 px; Q-002 reply art pose; Q-003 faint second sweat drop | fe-tester #2, minor | later run |
