# Feedback — 离线情绪陪伴小伙伴 P0 原型

See PLAYBOOK §3A.

## Design feedback
`Needs user` is yes when the change alters a confirmed flow, page, state, or anything visible in a
confirmed frame. `Decision` is accepted or rejected; pending items block the UI or Prototype stop.

| DFB | Raised by | To | Item | Reason and evidence | Decision | Decided by | Needs user | User decision |
|---|---|---|---|---|---|---|---|---|
| DFB-001 | fe-engineer #1 | fe-ui | CMP-003 phone listening label | "60 秒 · 松开发送" ≈131 px text vs 124 px phone button (≈175 px needed with icon/bars); no frame draws this state. Proposal: phone shows icon + "N 秒" + level bars (≈117 px); release/cancel words on laptop only. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | pending | — | — | — |
| DFB-002 | fe-engineer #1 | fe-ui | CMP-004 "disabled (paused)" | `02-ui.md` says disabled; `01-ux.md` loading row says "keep typing (text kept)". Proposal: input stays editable and focused, only Enter ignored, not faded; FRAME-010 note "(发送中，文字先留着)" stays. Evidence: `docs/frontend/03-queue.md` § Design feedback raised | pending | — | — | — |

## Post-launch
