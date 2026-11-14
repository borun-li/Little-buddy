# Feedback — 离线情绪陪伴小伙伴 P0 原型

See PLAYBOOK §3A.

## Design feedback
`Needs user` is yes when the change alters a confirmed flow, page, state, or anything visible in a
confirmed frame. `Decision` is accepted or rejected; pending items block the UI or Prototype stop.

| DFB | Raised by | To | Item | Reason and evidence | Decision | Decided by | Needs user | User decision |
|---|---|---|---|---|---|---|---|---|
| DFB-001 | fe-engineer #1 | fe-ui | CMP-003 phone listening label | "60 秒 · 松开发送" ≈131 px text vs 124 px phone button (≈175 px needed with icon/bars); no frame draws this state. Proposal: phone shows icon + "N 秒" + level bars (≈117 px); release/cancel words on laptop only. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | accepted — phone listening shows mic icon + "N 秒" + level bars (92 px content at "60 秒" in 124 px, measured in Figma); release/cancel words laptop-only; accessible name keeps "在听，N 秒，松开发送". Drawn as FRAME-011 (node 13:305); CMP-003 updated | fe-ui #2 | no — the UI stop has not been held, so no confirmed frame changes; FRAME-011 is shown at that stop | — |
| DFB-002 | fe-engineer #1 | fe-ui | CMP-004 "disabled (paused)" | `02-ui.md` says disabled; `01-ux.md` loading row says "keep typing (text kept)". Proposal: input stays editable and focused, only Enter ignored, not faded; FRAME-010 note "(发送中，文字先留着)" stays. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | accepted — paused input stays editable and focused, keeps its text, only Enter is ignored; no fade, not `disabled`; FRAME-010 paused sample already draws it unfaded. CMP-004 updated | fe-ui #2 | no — brings `02-ui.md` in line with the `01-ux.md` loading row; no frame changes | — |

## Post-launch
