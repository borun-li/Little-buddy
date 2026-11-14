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

## Design feedback decided

| DFB | Decision | By | Needs you |
|---|---|---|---|
| DFB-001 | pending | — | — |
| DFB-002 | pending | — | — |

## Queue — expected results you approve

| Row | Priority | Frame | Observable |
|---|---|---|---|
| Q-001 | P1 | FRAME-001, FRAME-005 | page opens with a neutral companion, the empty hint and privacy line in the log, the cursor already in the input, and no reply |
| Q-002 | P1 | FRAME-002, FRAME-006, FRAME-007 | a typed happy line, sent with Enter, shows as own turn, then typing dots, a warm reply, a smiling companion; sad lines sadden it |
| Q-003 | P1 | FRAME-009 | each mood has its own face, glow, caption and movement; it switches with a short squash when the reply appears, never at send |
| Q-004 | P1 | FRAME-003, FRAME-010 | holding the button (or Space) shows listening with seconds and level bars; release adds a tagged voice turn and a reply; Esc or sliding off adds nothing |
| Q-005 | P1 | n/a — no visual of its own; shows through Q-002 | with `companion-client.js` replaced by a stub returning reply X and neutral, three sent lines all show X and a neutral companion |
| Q-006 | P1 | n/a — offline looks like success (`02-ui.md` §5) | with Wi-Fi off, a 3-turn session works and replies render in WenKai, not a fallback face |
| Q-007 | P2 | FRAME-004, FRAME-008, FRAME-010 | prompt open, mic refused, no mic, or mic busy each shows its own hint line by the button, and typing still works |
| Q-008 | P2 | FRAME-002, FRAME-006 | after 20 turns every turn is readable in order by scrolling the log; the companion and composer never scroll away |
| Q-009 | P2 | FRAME-009 | with OS reduce motion on, a sad line makes the companion look sad and nothing keeps moving; typing dots are a static … |

