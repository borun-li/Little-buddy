# Frontend / Backend Contract

- Owner: fe-engineer drafts (scaffold, feasibility), copying each state's words from `01-ux.md`; the Backend team confirms · The single shared truth between the teams.
- Nothing is invented: every capability is `verified` (with source), `unverified` or `new`.
- Prototype round (2026-11-14): the page uses fake data behind one client-side layer; no capability below is called yet.
- Full development run `companion-full-dev` (2026-11-14, cross-stack, backend drives): every `new` capability gets a backend `DES`; the seam below is fixed before either team builds. Re-checked by orchestrator 2026-11-14: still no backend service (`package.json:7` serves `web/` statically), seam still fake (`web/js/companion-client.js:1-4`).

## 1. Capabilities
| # | Capability | Status | Source | Needed by | Backend DES |
|---|---|---|---|---|---|
| C-001 | Speech-to-text of a recorded utterance (Argmax OSS / WhisperKit) | new | only a one-shot CLI spike exists, no service: `spikes/argmax-swift/Sources/ArgmaxSpike/main.swift:5-13`, orchestrator, 2026-11-14 | companion page | DES-006, DES-011 |
| C-002 | Chat completion from Bonsai (OpenAI-style `/v1/chat/completions` on llama-server :8080, sampling params sent per request) | verified | sample only, not wrapped: `samples/bonsai-models/gguf/start.sh:10,47`; `samples/bonsai-models/shared/index.html:54-55,117`, orchestrator, 2026-11-14 | companion page | DES-007, DES-008 |
| C-005 | Reply in the language the user spoke (zh or en), and transcription that keeps that language | new | user, /route kickoff 2026-11-14 ("跟着用户说的语言"); D-001 | companion page | DES-009, DES-011 |
| C-003 | Emotion of the user's turn: one of 4 quadrants (pleasant/unpleasant × high/low energy) + neutral | new | `idea.md` § 情绪模型, orchestrator, 2026-11-14 | companion page | DES-007, DES-010 |
| C-004 | Multi-turn conversation context | new | `idea.md` § 范围 P0, orchestrator, 2026-11-14 | companion page | DES-008 |

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

### Seam for run `companion-full-dev` (be-architect #1, `docs/backend/03-detailed-design.md` §9, DES-013..015; copied by orchestrator 2026-11-14)
Frontend keeps the function names; only `web/js/companion-client.js` (DES-013), `web/js/mic.js` (DES-014) and the UI-language switch (DES-015) change on the frontend side.

Transport：同源，页面与接口都在 `http://127.0.0.1:4317`（`PORT` 可改），无 CORS（O-4）。浏览器从不直连 llama-server。

| Name | Type | Nullable | Who computes | Endpoint / field |
|---|---|---|---|---|
| `respond(line, history)` in | `line` 字符串，去空白后 1–500；`history` 至多最后 40 条 `{role: user\|companion, text 1–1000}` | no | frontend | `POST /api/respond`，`Content-Type: application/json`，体 ≤ 131072 B |
| `reply` out | 字符串，`line` 的语言（zh/en），≤ 2 句、≤ 1 问，zh ≤ 120 字、en ≤ 40 词 | no | backend（Bonsai 2 9B） | 200 `{reply, mood}` |
| `mood` out | `pleasant-high`\|`pleasant-low`\|`unpleasant-high`\|`unpleasant-low`\|`neutral` | no（拿不准为 `neutral`） | backend，同一响应（O-3） | 同上 |
| `transcribe(audio)` in | WAV：PCM 16-bit LE、单声道、16000 Hz，≤ 2,000,000 B（60 s = 1,920,044 B）；只在内存，转写后丢弃（O-2） | no | frontend 录 | `POST /api/transcribe`，`Content-Type: audio/wav`，体 = WAV 字节 |
| `text` out | 所说语言的文字 | 空串 = 没听到：不成一轮、不调 `respond` | backend（WhisperKit） | 200 `{text}` |
| `health()` out | `{ready: boolean, stt, bonsai}`，后两者 `starting`\|`ready`\|`down` | no | backend | `GET /api/health`，总是 200 |
| failure / slow | `.code` ∈ 下表 | — | backend 码；前端 `fetch` 失败记 `unavailable`、30 s 记 `timeout` | 体 `{"error": code}` |
| UI copy language | `zh`\|`en` | no | frontend only | 不发给后端 |

| Code | HTTP | Meaning (for fe-ux words, O-1) |
|---|---|---|
| `not_ready` | 503 | 还在预热（启动后约数秒到 2 分钟） |
| `unavailable` | 503 | 后端没起或刚崩，正在重启；页面也用于网络失败 |
| `timeout` | 504 | 太慢：回复 25 s / 转写 20 s 未完成；页面 30 s 自己也会停 |
| `failed` | 502 | 这次没成功，可再发 |
| `bad_request` | 400 | 请求不合格（页面缺陷） |
| `too_large` | 413 | 录音或前文太大（页面缺陷） |

## 3. Open items
| # | Question | Owner | Impact | Status |
|---|---|---|---|---|
| O-1 | When `respond` can fail or be slow (real Bonsai), what does the page show, and which backend error codes map to which words? `01-ux.md` has no failure state for replies | fe-ux (state), be-architect (codes) | next run: a UX failure state and a contract error table before the real layer replaces the fake | answered — 6 error codes in seam table (be-architect #1, 03 §9); words: fe-ux |
| O-2 | Real `transcribe` needs the held audio: format (e.g. WAV/PCM 16 kHz), size cap, and whether audio may leave page memory at all (A1 discards it) | be-architect | changes `transcribe()` to take audio; `web/js/mic.js` must then record | answered — see seam table (be-architect #1, 03 §9) |
| O-3 | Who decides `mood` in the real system: the backend classifier (C-003) per user line, returned with `reply`? The seam assumes yes | be-architect | if mood comes separately, the seam shape changes | answered — see seam table (be-architect #1, 03 §9) |
| O-4 | llama-server listens on :8080, the page on :4317: a direct call is cross-origin; a backend proxy on the page's origin or CORS on the server is needed | be-architect | decides where `respond` sends its request | answered — see seam table (be-architect #1, 03 §9) |

## 4. Changes
| Date | Change | Who | Impact on the other team |
|---|---|---|---|
| 2026-11-14 | Capability table seeded by /route recon | orchestrator | none yet (prototype uses fake data) |
| 2026-11-14 | §1 C-001/C-002 status cell reduced to the bare status (qualifier moved to Source, meaning unchanged) so the gate parses it; §2 drafted for PAGE-001 (send a line, hold to talk), seam `respond`/`transcribe`, O-1..O-4 | fe-engineer #1 | none this round; O-1..O-4 are the backend team's inputs for the next run |
| 2026-11-14 | Seam implemented as `web/js/companion-client.js` (fake: preset replies, keyword moods, preset voice lines; reply after 600 ms); §2 fields and states unchanged | fe-engineer #3 | none this round; the real layer replaces that one file |
| 2026-11-14 | Run `companion-full-dev`: C-005 added (reply/transcript follow the user's language); seam for this run written (mood from backend with reply; `transcribe` takes audio); O-1/O-2/O-4 left to be-architect | orchestrator | frontend keeps `respond`/`transcribe` names; replaces only `companion-client.js`, records audio in `mic.js`, adds zh/en UI switch |
| 2026-11-14 | Seam replaced by be-architect #1's final text (same-origin `/api/respond`, `/api/transcribe`, `/api/health` on 4317; WAV 16 kHz mono ≤ 2 MB; six error codes); O-1..O-4 answered; C-001..C-005 linked to DES | orchestrator | frontend: DES-013/014/015; fe-ux owes words/states for the six codes, warming, empty transcript, voice tag copy, zh/en switch |
