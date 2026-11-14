# Feedback — 离线情绪陪伴小伙伴 P0 原型

See PLAYBOOK §3A.

## Design feedback
`Needs user` is yes when the change alters a confirmed flow, page, state, or anything visible in a
confirmed frame. `Decision` is accepted or rejected; pending items block the UI or Prototype stop.

| DFB | Raised by | To | Item | Reason and evidence | Decision | Decided by | Needs user | User decision |
|---|---|---|---|---|---|---|---|---|
| DFB-001 | fe-engineer #1 | fe-ui | CMP-003 phone listening label | "60 秒 · 松开发送" ≈131 px text vs 124 px phone button (≈175 px needed with icon/bars); no frame draws this state. Proposal: phone shows icon + "N 秒" + level bars (≈117 px); release/cancel words on laptop only. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | accepted — phone listening shows mic icon + "N 秒" + level bars (92 px content at "60 秒" in 124 px, measured in Figma); release/cancel words laptop-only; accessible name keeps "在听，N 秒，松开发送". Drawn as FRAME-011 (node 13:305); CMP-003 updated | fe-ui #2 | no — the UI stop has not been held, so no confirmed frame changes; FRAME-011 is shown at that stop | — |
| DFB-002 | fe-engineer #1 | fe-ui | CMP-004 "disabled (paused)" | `02-ui.md` says disabled; `01-ux.md` loading row says "keep typing (text kept)". Proposal: input stays editable and focused, only Enter ignored, not faded; FRAME-010 note "(发送中，文字先留着)" stays. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | accepted — paused input stays editable and focused, keeps its text, only Enter is ignored; no fade, not `disabled`; FRAME-010 paused sample already draws it unfaded. CMP-004 updated | fe-ui #2 | no — brings `02-ui.md` in line with the `01-ux.md` loading row; no frame changes | — |
| DFB-003 | user (Prototype stop) | fe-ui | CMP-001 moods, FRAME-009 | User 2026-11-14: "小伙伴难过、焦虑、开心等情绪的表达可以更加夸张，区分度更为明显一些". Also: SVG exports have no part ids, so part motions (blink, ears, tail, sparkles, sweat) were not built (`docs/frontend/03-queue.md` § Build log #4) | accepted — 5 moods redrawn (CMP-001 4:19…4:115) with distinct poses: jump, raised arms, laugh; 9° lean, closed smiling eyes; hunched clasp, wide eyes, sweat (worried, not angry); sunk, drooping ears, tear. Stronger glow; named part groups in each SVG. CMP-001, §5, §7 updated; FRAME-009 (7:305), 001…008, 011 re-exported | fe-ui #3 | yes | requested by user 2026-11-14 |

## Post-launch
