# Prototype review

Try the prototype, then confirm the expected results below, or say what to change. Rows are built after you confirm.

Figma file: https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI

## Pages

| Page | Job |
|---|---|
| PAGE-001 | Say a line and see the companion reply and feel it with you |

## Frames

| Frame | Page | State | Size | Link |
|---|---|---|---|---|
| FRAME-001 | PAGE-001 | empty (neutral, input focused) | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-2 |
| FRAME-002 | PAGE-001 | success, pleasant-high (also offline) | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-45 |
| FRAME-003 | PAGE-001 | success, unpleasant-low, voice turn | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-111 |
| FRAME-004 | PAGE-001 | permission refused (hint line) | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-186 |
| FRAME-005 | PAGE-001 | empty | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-261 |
| FRAME-006 | PAGE-001 | success, pleasant-high (also offline) | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-304 |
| FRAME-007 | PAGE-001 | loading (mood still the last reply's) | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-370 |
| FRAME-008 | PAGE-001 | error, mic busy (hint wraps) | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=6-452 |
| FRAME-009 | PAGE-001 | companion, all 5 moods, motion notes | sheet | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=7-305 |
| FRAME-010 | PAGE-001 | component states (turns, button, input, hints) | sheet | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=7-345 |
| FRAME-011 | PAGE-001 | listening (phone talk button: icon, "4 秒", level bars) | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=13-305 |
| FRAME-012 | PAGE-001 | loading · transcribing; talk button paused; mood still the last reply's; switch 中文 | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=28-576 |
| FRAME-013 | PAGE-001 | warming: caption 还在醒来, `hints.warming` wrapping, input focused; switch 中文 | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=28-627 |
| FRAME-014 | PAGE-001 | success, pleasant-high, English; switch EN | 1440 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=28-654 |
| FRAME-015 | PAGE-001 | success, pleasant-high, English; talk button hugs "Hold to talk" (DFB-004); switch EN | 390 | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=28-669 |
| FRAME-016 | PAGE-001 | sheet: CMP-006 states, you-transcribing zh/en, longest English hint at 559 and 358 px, English phone composer | sheet | https://www.figma.com/design/foHz6I49GOMa5owcWtW7vG/Companion-P0-UI?node-id=27-565 |

## Design feedback decided

| DFB | Decision | By | Needs you |
|---|---|---|---|
| DFB-001 | accepted — phone listening shows mic icon + "n 秒" + level bars (92 px content at "60 秒" in 124 px, measured in figma); release/cancel words laptop-only; accessible name keeps "在听，n 秒，松开发送". drawn as frame-011 (node 13:305); cmp-003 updated | fe-ui #2 | no — the ui stop has not been held, so no confirmed frame changes; frame-011 is shown at that stop |
| DFB-002 | accepted — paused input stays editable and focused, keeps its text, only enter is ignored; no fade, not `disabled`; frame-010 paused sample already draws it unfaded. cmp-004 updated | fe-ui #2 | no — brings `02-ui.md` in line with the `01-ux.md` loading row; no frame changes |
| DFB-003 | accepted — 5 moods redrawn (cmp-001 4:19…4:115) with distinct poses: jump, raised arms, laugh; 9° lean, closed smiling eyes; hunched clasp, wide eyes, sweat (worried, not angry); sunk, drooping ears, tear. stronger glow; named part groups in each svg. cmp-001, §5, §7 updated; frame-009 (7:305), 001…008, 011 re-exported | fe-ui #3 | yes |
| DFB-004 | accepted — the proposal, not the fallback: in english only the phone button hugs its label, keeping the chinese button's 56 px of icon, gap and side space: 154 px at "hold to talk" (98 px measured in figma, noto sans sc bold 17); the input fills the rest, 196 px, and the english placeholder (150 px measured) fits. listening keeps the 154 px. chinese stays 124 px. drawn as frame-015 (28:669) and frame-016 (27:565); cmp-003 (increment 1) in `02-ui.md` | fe-ui #5 | no — chinese frames are unchanged; english is new and first drawn in frame-015, shown at the next stop |
| DFB-005 | accepted, pending user at plan — listening and its seconds start when the mic stream opens, not at the press; 0.5 s and 60 s count from there. press → button held, nothing recorded; still closed after 0.2 s → new hint `hints.micopening` "麦克风正在打开，看到秒数再开口。" / "opening the mic. start talking when the seconds appear."; release before it opens → `hints.tooshort`, off or esc → nothing. rejected: keeping the stream open between holds (mic indicator stays on; q-013 needs it off at release). `01-ux.md` increment 1: flow-005, page-001 rows "loading · mic opening" and "listening", words, contract row. recommendation for the plan stop: "hold to talk: start 'listening' and the seconds when the mic is really open, not at the press, so the first words are never cut off; the first hold may wait about 1 s with the hint 'opening the mic. start talking when the seconds appear.' recommended: yes." | fe-ux #4 | yes — changes the listening moment the user confirmed at the prototype stop (2026-11-14) and adds a hint; no newer user decision replaces it |

## Queue — expected results you approve

| Row | Priority | Frame | Observable |
|---|---|---|---|
| Q-001 | P1 | FRAME-001, FRAME-005 | page opens with a neutral companion, the empty hint and privacy line in the log, the cursor already in the input, and no reply |
| Q-002 | P1 | FRAME-002, FRAME-006, FRAME-007 | a typed happy line, sent with Enter, shows as own turn, then typing dots, a warm reply, a smiling companion; sad lines sadden it |
| Q-003 | P1 | FRAME-009 | each mood has its own face, glow, caption and movement; it switches with a short squash when the reply appears, never at send |
| Q-004 | P1 | FRAME-003, FRAME-010, FRAME-011 | holding the button (or Space) shows listening with seconds and level bars (phone: icon, "N 秒", bars; name "在听，N 秒，松开发送"); release sends; Esc adds nothing |
| Q-005 | P1 | n/a — no visual of its own; shows through Q-002 | with `companion-client.js` replaced by a stub returning reply X and neutral, three sent lines all show X and a neutral companion |
| Q-006 | P1 | n/a — offline looks like success (`02-ui.md` §5) | with Wi-Fi off, a 3-turn session works and replies render in WenKai, not a fallback face |
| Q-007 | P2 | FRAME-004, FRAME-008, FRAME-010 | prompt open, mic refused, no mic, or mic busy each shows its own hint line by the button, and typing still works |
| Q-008 | P2 | FRAME-002, FRAME-006 | after 20 turns every turn is readable in order by scrolling the log; the companion and composer never scroll away |
| Q-009 | P2 | FRAME-009 | with OS reduce motion on, a sad line makes the companion look sad and nothing keeps moving; typing dots are a static … |
| Q-010 | P1 | FRAME-002, FRAME-006, FRAME-014 | Offline, an English line gets a Bonsai-written English reply and the matching mood; a sad follow-up recalls the first |
| Q-011 | P1 | FRAME-010, FRAME-013 | With the reply side stopped, the sent line leaves the chat, returns to the input, and a hint says why |
| Q-012 | P1 | FRAME-013 | Opened while Bonsai loads: caption "还在醒来", warming hint, Enter keeps the text; ready shows the awake hint; down shows the restart hint |
| Q-013 | P1 | n/a — shows through Q-014 (FRAME-003, FRAME-011) | a 2 s hold posts a valid 16 kHz mono WAV (≈ 64,044 B in the network log); the mic light goes off at release |
| Q-019 | P1 | FRAME-003, FRAME-011 | pressing holds the button; "listening" and its seconds appear when the mic opens, and a slow first open shows `hints.micOpening` after 0.2 s |
| Q-014 | P1 | FRAME-012, FRAME-016 | After release your turn shows tagged 语音 with "正在转成文字…", then the words replace it, then reply and mood follow |
| Q-018 | P1 | FRAME-016, FRAME-013 | Silence adds no turn and says nothing was heard; each voice failure shows its own hint; typing still works |
| Q-015 | P1 | FRAME-012..016 | `中文 | EN` at the stage top-right switches every word outside the chat at once; focus stays; a non-Chinese browser opens in English |
| Q-016 | P1 | FRAME-014, FRAME-015, FRAME-016 | On the phone in English the button reads "Hold to talk" whole; the longest caption stays on one line; the longest hint wraps without hiding the newest turn |
| Q-017 | P3 | n/a — no visual of its own | An English reply with "café" shows the accent in the same face as the rest |

