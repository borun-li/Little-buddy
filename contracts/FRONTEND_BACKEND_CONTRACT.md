# Frontend / Backend Contract

- Owner: fe-engineer drafts (scaffold, feasibility), copying each state's words from `01-ux.md`; the Backend team confirms · The single shared truth between the teams.
- Nothing is invented: every capability is `verified` (with source), `unverified` or `new`.
- Prototype round (2026-11-14): the page uses fake data behind one client-side layer; no capability below is called yet.

## 1. Capabilities
| # | Capability | Status | Source | Needed by | Backend DES |
|---|---|---|---|---|---|
| C-001 | Speech-to-text of a recorded utterance (Argmax OSS / WhisperKit) | new | only a one-shot CLI spike exists, no service: `spikes/argmax-swift/Sources/ArgmaxSpike/main.swift:5-13`, orchestrator, 2026-11-14 | companion page | — |
| C-002 | Chat completion from Bonsai (OpenAI-style `/v1/chat/completions` on llama-server :8080, sampling params sent per request) | verified | sample only, not wrapped: `samples/bonsai-models/gguf/start.sh:10,47`; `samples/bonsai-models/shared/index.html:54-55,117`, orchestrator, 2026-11-14 | companion page | — |
| C-003 | Emotion of the user's turn: one of 4 quadrants (pleasant/unpleasant × high/low energy) + neutral | new | `idea.md` § 情绪模型, orchestrator, 2026-11-14 | companion page | — |
| C-004 | Multi-turn conversation context | new | `idea.md` § 范围 P0, orchestrator, 2026-11-14 | companion page | — |

## 2. Per page and action
Draft by fe-engineer #1, 2026-11-14, from `01-ux.md` PAGE-001 and `00-requirements.md`. Checked against the backend first: no `docs/backend/` exists and no service runs; C-001 is a one-shot CLI (`spikes/argmax-swift/Sources/ArgmaxSpike/main.swift:5-13`), C-002 a sample page calling llama-server (`samples/bonsai-models/shared/index.html:117`). This round both actions are served by the fake layer `web/js/companion-client.js` (planned, `docs/frontend/03-queue.md` § Scaffold); a real backend later replaces only that file.

Seam (the client layer's interface, kept when the fake is replaced):
- `respond(line, history)` → `{ reply, mood }` (C-002, C-003, C-004)
- `transcribe()` → `{ text }` (C-001; this round returns the next preset line, A1; the real version will need the audio, see O-2)

### PAGE-001 · send a line (typed, or a transcribed voice line)  (states and words from `01-ux.md`)
| Field | Meaning (business terms) | Capability | Required | Empty / absent shape |
|---|---|---|---|---|
| `line` | what the user said or typed, trimmed, 1–500 characters | — (client input) | yes | empty line is never sent (FLOW-001 boundary) |
| `history` | earlier turns in order, each `{ role: user \| companion, text }`, page memory only (A5) | C-004 | yes | `[]` at the first turn |
| `reply` | the companion's answer: Chinese, warm, ≤ 2 sentences, ≤ 1 question, ≤ 120 characters (REQ-003, A3) | C-002 | yes | never empty; the fake layer always returns one |
| `mood` | the mood of the user's line: `pleasant-high` \| `pleasant-low` \| `unpleasant-high` \| `unpleasant-low` \| `neutral` (REQ-004) | C-003 | yes | `neutral` when nothing matches (A2) |
| `voice` | the turn came from hold-to-talk, so it is tagged "语音 · 示例文字" | — (client state) | no | absent → typed turn |

| State | What renders | Copy |
|---|---|---|
| loading | own turn, typing dots under it; send and hold paused ≤ 1 s; input keeps its text | screen reader: "小伙伴正在回复" |
| empty | companion `neutral`; empty log with a hint; input focused; no `reply` hook | "想说什么都可以。按住说话，或者直接打字。" · "聊天只留在这台电脑上，刷新就清空。" |
| success | turns in order, newest in view; latest reply carries `reply`; companion shows that turn's `mood` | reply text; voice turns tagged "语音 · 示例文字" |
| failure | none this round: the fake layer cannot fail (FLOW-001 failure: none) | — (O-1) |
| permission-denied | n/a for this action | — |
| conflict | n/a: one user, page memory only | — |
| boundary | empty line → nothing; Enter during a pending reply → ignored, text kept | — |

| Error | User sees | Raw value (admin only, where) |
|---|---|---|
| none this round | — | — |

### PAGE-001 · hold to talk (mic in the browser; no backend call this round)
| Field | Meaning (business terms) | Capability | Required | Empty / absent shape |
|---|---|---|---|---|
| `text` | the words of the held utterance; this round the next line of a preset list covering all 5 moods, audio discarded (A1) | C-001 | yes | never empty in the fake |

| State | What renders | Copy |
|---|---|---|
| loading | button shows listening with seconds and level bars | "在听… N 秒" · "松开发送 · 移开或 Esc 取消" (laptop; phone see DFB on CMP-003) |
| success | the line becomes a voice turn, then as "send a line" | "语音 · 示例文字" |
| failure | mic absent or busy: hint by the button, typing works | "没找到麦克风，打字也一样能聊。" / "麦克风被别的程序占用了，关掉再试，或者先打字。" |
| permission-denied | prompt open: hint, no recording; refused: hint on each press | "请在浏览器弹窗里允许麦克风，再按住说话。" / "麦克风没打开。可在地址栏左侧允许，或者直接打字。" |
| conflict | n/a | — |
| boundary | hold < 0.5 s → hint; 60 s → sends itself; release off the button or Esc → nothing added | "说得太快啦，按住久一点。" |

| Error | User sees | Raw value (admin only, where) |
|---|---|---|
| browser `NotFoundError` | no-mic hint | none shown; not logged (no observability this round) |
| browser `NotReadableError` | mic-busy hint | same |
| browser `NotAllowedError` | refused hint | same |

## 3. Open items
| # | Question | Owner | Impact | Status |
|---|---|---|---|---|
| O-1 | When `respond` can fail or be slow (real Bonsai), what does the page show, and which backend error codes map to which words? `01-ux.md` has no failure state for replies | fe-ux (state), be-architect (codes) | next run: a UX failure state and a contract error table before the real layer replaces the fake | open — not needed this round |
| O-2 | Real `transcribe` needs the held audio: format (e.g. WAV/PCM 16 kHz), size cap, and whether audio may leave page memory at all (A1 discards it) | be-architect | changes `transcribe()` to take audio; `web/js/mic.js` must then record | open — next run |
| O-3 | Who decides `mood` in the real system: the backend classifier (C-003) per user line, returned with `reply`? The seam assumes yes | be-architect | if mood comes separately, the seam shape changes | open — next run |
| O-4 | llama-server listens on :8080, the page on :4317: a direct call is cross-origin; a backend proxy on the page's origin or CORS on the server is needed | be-architect | decides where `respond` sends its request | open — next run |

## 4. Changes
| Date | Change | Who | Impact on the other team |
|---|---|---|---|
| 2026-11-14 | Capability table seeded by /route recon | orchestrator | none yet (prototype uses fake data) |
| 2026-11-14 | §1 C-001/C-002 status cell reduced to the bare status (qualifier moved to Source, meaning unchanged) so the gate parses it; §2 drafted for PAGE-001 (send a line, hold to talk), seam `respond`/`transcribe`, O-1..O-4 | fe-engineer #1 | none this round; O-1..O-4 are the backend team's inputs for the next run |
| 2026-11-14 | Seam implemented as `web/js/companion-client.js` (fake: preset replies, keyword moods, preset voice lines; reply after 600 ms); §2 fields and states unchanged | fe-engineer #3 | none this round; the real layer replaces that one file |
