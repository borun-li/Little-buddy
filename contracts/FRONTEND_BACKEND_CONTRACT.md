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
- Increment 2 (`01-ux.md` § Increment 2): `respond(line, history, name)` → `{ reply, mood, lang, crisis, speech }`; `speak(text, lang)` → WAV Blob; `health()` also returns `tts` (the seam table "Seam for increment 2" below is the truth)
- `transcribe(audio)` → `{ text }` (C-001; audio = WAV from `mic.js`, O-2 answered) · `health()` → `{ ready, stt, bonsai }` (increment 1; the seam table below is the truth)

### PAGE-001 · send a line (typed, or a transcribed voice line)  (states and words from `01-ux.md`)
| Field | Meaning (business terms) | Capability | Required | Empty / absent shape |
|---|---|---|---|---|
| `line` | what the user said or typed, trimmed, 1–1500 characters (seam); the input still caps at 500 | — (client input) | yes | empty line is never sent (FLOW-001 boundary) |
| `history` | earlier turns in order, each `{ role: user \| companion, text }`, page memory only (A5) | C-004 | yes | `[]` at the first turn |
| `reply` | the companion's answer in the line's language (zh/en), warm, ≤ 2 sentences, ≤ 1 question, zh ≤ 120 characters, en ≤ 40 words (REQ-004, REQ-005) | C-002, C-005 | yes | never empty in a 200, otherwise a code |
| `mood` | the mood of the user's line: `pleasant-high` \| `pleasant-low` \| `unpleasant-high` \| `unpleasant-low` \| `neutral` (REQ-006) | C-003 | yes | `neutral` when unsure |
| `name` | the saved companion name, cleaned (≤ 12 characters, letters, numbers, space, `-'·`); the companion calls itself by it (REQ-030, REQ-031) | — (client state, `localStorage`) | no | absent or `null` → default name per language |
| `lang` | `zh` or `en`: the language of the reply, used to pick the voice | C-005 | yes | never empty in a 200 |
| `crisis` | the line matched the fixed crisis list; the page shows the help card and never judges it (REQ-025) | — (backend) | yes | `false` when not matched |
| `speech` | the reply cut into parts read in order | — (backend) | yes | `[]` → nothing read |
| `voice` | the turn came from hold-to-talk, so it is tagged "语音" / "Voice" | — (client state) | no | absent → typed turn |

| State | What renders | Copy |
|---|---|---|
| loading | own turn, typing dots under it; send and hold paused until the reply or a code (page stops at 16 s); input keeps its text | screen reader: "小伙伴正在回复" / "Little Buddy is replying" |
| empty | companion `neutral`; empty log with a hint; input focused; no `reply` hook | "想说什么都可以。按住说话，或者直接打字。" · "聊天只留在这台电脑上，刷新就清空。" |
| success | turns in order, newest in view; latest reply carries `reply`; companion shows that turn's `mood` | reply text; voice turns tagged "语音" / "Voice" |
| failure | own turn leaves the log, its text back in the input, hint per code (`01-ux.md` Increment 1, Codes, send column) | `hints.sendUnavailable` · `sendTimeout` · `sendFailed` · `sendDefect` · `warming` |
| success · speaking / muted | reply and mood at once; the voice ≤ 3 s later, parts in order; muted → text only, a reading stops ≤ 0.5 s | `speakerOn` · `speakerOff` |
| success · breathing offer | newest reply `unpleasant-high` and `crisis` false: chip under it | `breathOffer` |
| success · crisis | `crisis` true: the help card under the reply, in the interface language | `crisisLabel` · `crisisTitle` · `crisis988` · `crisis911` · `crisisClose` |
| empty · cleared | clear: log empty, `history` `[]`, companion `neutral`; a reply still on its way is dropped when it lands | `hints.cleared` |
| warming · voice reply not ready | `health().tts` is not `ready` or a speak failed: silent, toggle shows not ready, no hint | `speakerNotReady` |
| warming | reply side not ready: Enter keeps the text, warming hint, caption 还在醒来 | `hints.warming`; `moods.waking` |
| permission-denied | n/a for this action | — |
| conflict | n/a: one user, page memory only | — |
| boundary | empty line → nothing; Enter during a pending reply → ignored, text kept | — |

| Error | User sees | Raw value (admin only, where) |
|---|---|---|
| `not_ready` | `hints.warming`; checks resume | never on the page |
| `unavailable` | `hints.sendUnavailable`; checks resume | never on the page |
| `timeout` | `hints.sendTimeout` | never on the page |
| `failed` | `hints.sendFailed` | never on the page |
| `bad_request` | `hints.sendDefect` | never on the page |
| `too_large` | `hints.sendDefect` | never on the page |

### PAGE-001 · hear the reply — `speak(text, lang)`  (increment 2, `01-ux.md` FLOW-008)
| Field | Meaning (business terms) | Capability | Required | Empty / absent shape |
|---|---|---|---|---|
| `text` | one part of the reply to read aloud, trimmed, 1–200 characters | — (backend cut it into `speech`) | yes | no part, no call |
| `lang` | `zh` or `en`, from the reply's `lang` | C-005 | yes | — |
| audio | WAV, PCM 16-bit LE, mono, 24000 Hz, played from page memory and dropped (never kept) | — (backend TTS) | yes | failure → silence |

| State | What renders | Copy |
|---|---|---|
| loading | nothing: text and mood never wait; the next part is fetched while one plays | — |
| success | the voice plays; the toggle shows speaking | `speakerOn` |
| warming | not ready: silent, toggle shows not ready; checks go on until ready | `speakerNotReady` |
| failure | that reply stays silent, no hint, toggle unchanged | — |
| boundary | muted, a press to talk, a send, clear, breathing or a new reply stops it and aborts the call | `speakerOff` |

| Error | User sees | Raw value (admin only, where) |
|---|---|---|
| any code (`not_ready`, `unavailable`, `timeout`, `failed`, `bad_request`, `too_large`) | silence, no hint (page stops at 11 s) | never on the page |

### PAGE-001 · hold to talk — `transcribe(audio)`
| Field | Meaning (business terms) | Capability | Required | Empty / absent shape |
|---|---|---|---|---|
| `text` | the real words of the held utterance in the spoken language, zh Simplified (REQ-001, REQ-002); audio is the WAV from `mic.js`, dropped after the call (A9) | C-001, C-005 | yes | empty = nothing heard: no turn, no `respond` (REQ-003) |

| State | What renders | Copy |
|---|---|---|
| loading | pressed: button held, nothing recorded; listening and its seconds start when the mic stream opens, `hints.micOpening` until then (DFB-005); button shows seconds and level bars; after release, own turn "正在转成文字…", send and hold paused ≤ 13 s | "在听… N 秒" · "松开发送 · 移开或 Esc 取消" (laptop; phone see DFB on CMP-003) · `transcribing` · `hints.micOpening` |
| success | the placeholder becomes the voice turn, then as "send a line" | "语音" / "Voice" |
| warming | voice not ready: nothing recorded | `hints.voiceNotReady` |
| boundary (increment 2) | pressing the button first stops a reading, before the mic opens, so the voice is not recorded | — |
| failure | nothing heard → `hints.nothingHeard`; a code → the voice-column key in Codes; mic absent or busy: hint by the button, typing works | "没找到麦克风，打字也一样能聊。" / "麦克风被别的程序占用了，关掉再试，或者先打字。" |
| permission-denied | prompt open: hint, no recording; refused: hint on each press | "请在浏览器弹窗里允许麦克风，再按住说话。" / "麦克风没打开。可在地址栏左侧允许，或者直接打字。" |
| conflict | n/a | — |
| boundary | hold < 0.5 s → hint; 60 s → sends itself; release off the button or Esc → nothing added | "说得太快啦，按住久一点。" |

| Error | User sees | Raw value (admin only, where) |
|---|---|---|
| `not_ready` | `hints.voiceNotReady`; checks resume | never on the page |
| `unavailable` | `hints.voiceUnavailable`; checks resume | never on the page |
| `timeout` | `hints.voiceTimeout` | never on the page |
| `failed` | `hints.voiceFailed` | never on the page |
| `bad_request` | `hints.voiceFailed` | never on the page |
| `too_large` | `hints.voiceFailed` | never on the page |
| browser `NotFoundError` | no-mic hint | none shown; not logged (no observability this round) |
| browser `NotReadableError` | mic-busy hint | same |
| browser `NotAllowedError` | refused hint | same |

### Seam for run `companion-full-dev` (be-architect #2, `docs/backend/03-detailed-design.md` §9, DES-013..015; copied by orchestrator 2026-11-14)
Frontend keeps the function names; only `web/js/companion-client.js` (DES-013), `web/js/mic.js` (DES-014) and the UI-language switch (DES-015) change on the frontend side. Where §2 PAGE-001 above disagrees (e.g. reply "Chinese, ≤120 characters", "failure: none"), this table wins; fe-ux/fe-engineer update §2 in this run.

Transport：同源，页面与接口都在 `http://127.0.0.1:4317`（`PORT` 可改），无 CORS（O-4）。浏览器从不直连 llama-server。

| Name | Type | Nullable | Who computes | Endpoint / field |
|---|---|---|---|---|
| `respond(line, history)` in | `line` 字符串，去空白后 1–1500（JS `.length`）；`history` 至多最后 40 条 `{role: user\|companion, text 1–1500}`；后端只用最近若干条，合计权重 ≤ 2000（权重 = 字符数 + 1.5 × 汉字数；约 2000 英文字符或 800 汉字） | no | frontend | `POST /api/respond`，`Content-Type: application/json`，体 ≤ 262144 B |
| `reply` out | 字符串，`line` 的语言（zh/en），≤ 2 句、≤ 1 问，zh ≤ 120 字、en ≤ 40 词 | no | backend（Bonsai 2 9B） | 200 `{reply, mood}` |
| `mood` out | `pleasant-high`\|`pleasant-low`\|`unpleasant-high`\|`unpleasant-low`\|`neutral` | no（拿不准为 `neutral`） | backend，同一响应（O-3） | 同上 |
| `transcribe(audio)` in | WAV：PCM 16-bit LE、单声道、16000 Hz，≤ 2,000,000 B（60 s = 1,920,044 B）；只在内存，转写后丢弃（O-2） | no | frontend 录 | `POST /api/transcribe`，`Content-Type: audio/wav`，体 = WAV 字节 |
| `text` out | 所说语言的文字；中文为简体 | 空串 = 没听到：不成一轮、不调 `respond` | backend（WhisperKit） | 200 `{text}` |
| `health()` out | `{ready: boolean, stt, bonsai}`，后两者 `starting`\|`ready`\|`down` | no | backend | `GET /api/health`，总是 200 |
| failure / slow | `.code` ∈ 下表 | — | backend 码；前端 `fetch` 失败记 `unavailable`；`transcribe` 13 s、`respond` 16 s 未完成自停记 `timeout` | 体 `{"error": code}` |
| UI copy language | `zh`\|`en` | no | frontend only | 不发给后端 |

| Code | HTTP | Meaning (for fe-ux words, O-1) |
|---|---|---|
| `not_ready` | 503 | 还在预热（启动后约数秒到 2 分钟） |
| `unavailable` | 503 | 后端没起或刚崩，正在重启；页面也用于网络失败 |
| `timeout` | 504 | 太慢：回复 15 s / 转写 12 s 未完成；页面 16 s / 13 s 自己也会停（语音一轮 ≤ 29 s 必有交代） |
| `failed` | 502 | 这次没成功，可再发 |
| `bad_request` | 400 | 请求不合格（页面缺陷） |
| `too_large` | 413 | 录音或前文太大（页面缺陷） |

### Seam for increment 2 (be-architect #6, `docs/backend/03-detailed-design.md` § Increment 2 — 9. Seam; frontend DES-024..028, DES-030; copied by orchestrator 2026-11-15)
The increment-1 seam above stays valid except where this table extends it (respond gains `name` in and `lang`, `crisis`, `speech` out; new `/api/speak`; health gains `tts`).

Transport 不变：同源 `http://127.0.0.1:4317`，无 CORS。前端 DES：DES-024（client）、DES-025（朗读播放）、DES-026（危机卡片）、DES-027（改名）、DES-028（深呼吸、戳一戳、清空）；DES-030（本地记忆，design only，本增量不建，无接口变化；查看记录只读页面的 `companion.memory`）。

| Name | Type | Nullable | Who computes | Endpoint / field |
|---|---|---|---|---|
| `respond(line, history, name)` in | `line`、`history` 同前；`name` 字符串，任何长度都收，后端按 DES-021 再清理（≤ 12 码点，字母/数字/空格/`-'·`）；不是字符串 → 400 `bad_request` | `name` 可缺省或 `null` = 默认名 | frontend（DES-027 清理后保存的名字） | `POST /api/respond` |
| `reply` out | 同前；危机轮必含 "988"，至多 2 句 | no | backend | 200 `{reply, mood, lang, crisis, speech}` |
| `mood` out | 同前 5 个 id | no | backend | 同上 |
| `lang` out | `zh`\|`en`，回复的语言（= `line` 的语言，REQ-005 保证二者相同；朗读用它） | no | backend（`languageOf(line)`） | 同上 |
| `crisis` out | boolean：本句命中固定危机词句表（DES-019） | no | backend；页面不自判 | 同上；危机轮即使 Bonsai 出错也是 200（UD-1 推荐 (a)，Plan 定；选 (b) 删此句） |
| `speech` out | 字符串数组，按顺序朗读的段；可为 `[]` | no | backend（DES-018） | 同上 |
| `speak(text, lang)` in | `text` 去空白 1–200 字符；`lang` `zh`\|`en`（用 respond 给的 `lang`） | no | frontend（`speech` 的一段） | `POST /api/speak`，`application/json`，体 ≤ 4096 B |
| `speak` out | WAV：PCM 16-bit LE、单声道、24000 Hz | 失败 = 不出声 | backend（TTSKit Qwen3-TTS） | 200 `audio/wav`；10 s 截止，页面 11 s 自停 |
| `health()` out | `{ready, stt, bonsai, tts}`；`ready` 仍只看 stt 与 bonsai | no | backend | `GET /api/health` |
| failure / slow | `.code` 同 6 个码；`speak` 的任何失败页面都静音、不提示 | — | backend | `{"error": code}` |
| 名字存储 | 清理后的名字 | 缺省 = 默认名 | frontend only | localStorage `companion.name`，不发 `transcribe`/`speak` |
| UI copy language | `zh`\|`en` | no | frontend only | 不发给后端 |

错误码表同 §9（`not_ready` 用于朗读时 = 朗读还在预热，页面静音）。

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
| 2026-11-14 | Seam re-copied after be-architect #2: line/history text 1–1500, body ≤ 262144 B, server deadlines STT 12 s / respond 15 s, page aborts at 13 s / 16 s; zh transcripts forced Simplified | orchestrator | frontend DES-013 timing and limits changed |
| 2026-11-14 | §2 PAGE-001 rows replaced per `01-ux.md` Increment 1 (line 1–1500, reply language/limits, mood REQ-006, voice tag, loading/failure/warming states, six-code error tables, `transcribe(audio)` and nothing-heard); seam table untouched | fe-engineer #5 | none; fields now match the seam; `Backend DES` column unchanged |
| 2026-11-15 | Seam respond row re-copied after be-architect #3: backend keeps recent history up to weight 2000 (chars + 1.5 × Han); page still sends last 40 | orchestrator | none — page unchanged |
| 2026-11-15 | Increment 2 seam copied (be-architect #6): respond `name` in, `lang`/`crisis`/`speech` out; POST /api/speak; health `tts` | orchestrator | frontend DES-024..028, DES-030 |
| 2026-11-15 | Increment 2 seam re-copied after be-architect #7 (name any length cleaned server-side; lang = line language; crisis 200 per UD-1 pending Plan) | orchestrator | frontend DES-024..028, DES-030 |
| 2026-11-15 | §2 PAGE-001 rows extended per `01-ux.md` § Increment 2: send a line gains `name`, `lang`, `crisis`, `speech` and the speaking, breathing offer, crisis, cleared and tts-warming states; new action `speak(text, lang)`; the seam table is untouched | fe-engineer #17 | none: fields match the seam for increment 2; memory (design only) adds nothing |
