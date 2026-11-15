# Architecture — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文

- Author: be-architect #1；revised be-architect #2（round 2：设计矛盾 1–6）；amended be-architect #3（step 4：前文窗口按时延定、语言多数规则、缺文件提示） · Input: `01-requirements.md` · Status: draft · 2026-11-14
- 证据：`docs/backend/logs/be-architect-1-bench.log`（4B/9B 基准）、`docs/backend/logs/be-architect-1-stt-check.log`（WhisperKit 检查）、`docs/backend/logs/be-architect-2-stt60.log`（约 60 s 转写耗时、繁转简）、`docs/backend/logs/be-architect-3-window.log`（前文长度与冷请求时延）。

## 1. Components
一条 `npm start` 起一个 Node 进程；它在 127.0.0.1:4317 同源提供页面和 `/api/*`，并拉起两个子进程。浏览器只和 Node 说话。

```
浏览器 (web/, 127.0.0.1:4317) ──HTTP 同源──> Node 网关 server/main.js ──stdin/stdout JSON 行──> companion-stt (Swift + WhisperKit)
                                                        └──HTTP 127.0.0.1:4318──> llama-server (Bonsai 2 9B)
```

| Component | Responsibility (one sentence) | Serves |
|---|---|---|
| 网关 `server/main.js` | 检查本机文件、监听 127.0.0.1:4317、分派 `/api/*` 与静态文件、退出时停掉自己的子进程。 | REQ-009, REQ-010, REQ-011 |
| 子进程看护 `server/supervisor.js` | 启动、预热、标记状态、意外退出后重启（每个子进程最多 5 次）。 | REQ-010, REQ-011 |
| 静态文件 `server/static.js` | 只从 `web/` 读文件返回页面，挡住越界路径。 | REQ-009, REQ-010 |
| 转写客户端 `server/wav.js` + `server/stt.js` | 校验 WAV、取出 PCM、按 id 和 Swift 助手一问一答、12 s 截止。 | REQ-001, REQ-002, REQ-003, REQ-011 |
| 回复客户端 `server/bonsai.js` + `server/prompts.js` + `server/lang.js` | 判定这句话的语言、并行发"回复"和"情绪"两次请求、整形回复、情绪失败给 `neutral`。 | REQ-004..REQ-008, REQ-011 |
| 错误表 `server/errors.js` | 6 个错误码及其 HTTP 状态，网关和契约共用这一份。 | REQ-011 |
| 转写助手 `stt/`（Swift，WhisperKit 1.1.1） | 常驻、离线加载 large-v3、能量门挡静音、只在中/英之间定语言、内存里转写、中文结果转简体。 | REQ-001, REQ-002, REQ-003, REQ-009 |
| llama-server（PrismML 分支，外部） | 运行 Bonsai 2 9B，OpenAI 风格接口，2 个槽位各自缓存前缀。 | REQ-004..REQ-008 |
| 前端数据层 `web/js/companion-client.js`（side: frontend） | 把 `respond`/`transcribe`/`health` 接到 `/api/*`，错误变成 `code`。 | REQ-001, REQ-003..REQ-008, REQ-011 |
| 录音 `web/js/mic.js`（side: frontend） | 把按住的这段话录成 16 kHz 单声道 16-bit WAV，交给 `transcribe` 后丢弃。 | REQ-001, REQ-003 |
| 界面语言开关（side: frontend） | 只换界面文字，不发给后端。 | REQ-012, REQ-005 |

## 2. Data model
无持久化：对话只在页面内存（BD-002），声音和文字只在请求内存里，转写后丢弃（A9）。

| Entity | Key fields | Owner | Stored in |
|---|---|---|---|
| 一轮请求 | `line`（1–1500 字符，去首尾空白）、`history`（≤ 40 条；进提示的合计权重 ≤ 2000，权重 = 字符数 + 1.5 × 汉字数） | 页面 | 页面内存；网关请求内存 |
| 前文条目 | `role`: `user`\|`companion`，`text`（1–1500 字符） | 页面 | 页面内存 |
| 一轮结果 | `reply`（非空）、`mood`（5 个 id 之一） | 网关（由 Bonsai 生成） | 页面内存 |
| 一段语音 | WAV 字节，≤ 2,000,000 B | 页面录音 → 网关 → 助手 | 只在内存，转写后丢弃 |
| 转写结果 | `text`（`""` = 没听到） | 转写助手 | 页面内存（成为一轮） |
| 子进程状态 | `name`、`state`、`pid`、`restarts` | 看护 | 网关进程内存 |

## 3. External contracts
| Interface | Signature / endpoint | Auth | Errors | Limits | Source |
|---|---|---|---|---|---|
| 页面 → 网关：回复 | `POST /api/respond` JSON `{line, history}` → 200 `{reply, mood}` | 无；只听 127.0.0.1；必须 `Content-Type: application/json` | `{error: code}`，码见 03 §3 | 请求体 ≤ 256 KB（262144 B）；15 s 截止 | 本设计（契约 §2 seam） |
| 页面 → 网关：转写 | `POST /api/transcribe` 体 = WAV 字节，`Content-Type: audio/wav` → 200 `{text}` | 同上 | 同上 | ≤ 2,000,000 B；16 kHz 单声道 PCM 16-bit；12 s 截止 | 本设计；16 kHz = `WhisperKit.sampleRate`（`WhisperKit.swift:44`） |
| 页面 → 网关：就绪 | `GET /api/health` → 200 `{ready, stt, bonsai}` | 同上 | — | — | 本设计 |
| 网关 → llama-server | `POST /v1/chat/completions`，每次带采样参数和 `chat_template_kwargs.enable_thinking=false`；情绪用 `response_format.json_schema` | 无（只听 127.0.0.1） | 非 200 → `failed`；连不上 → `unavailable` | 2 槽位，`-c 32768` | `samples/bonsai-models/shared/index.html:51-55,117-124`；基准 0 次 JSON 解析失败、0 次思考泄漏（bench.log） |
| 网关 → llama-server 健康 | `GET /health` 200 `{"status":"ok"}`，加载中 503 | 无 | — | — | llama.cpp `tools/server/README.md` |
| 网关 → 转写助手 | stdin 一行 `{"id":n,"pcm16":"<base64>"}` → stdout 一行 `{"id":n,"text":"…","lang":"zh"\|"en"\|null,"ms":…}` 或 `{"id":n,"error":"…"}`；启动后一行 `{"event":"ready",…}` | 进程内管道 | `error` 行 → `failed`；进程退出 → `unavailable` | 一次一段，按序处理 | 本设计；WhisperKit API 见 03 DES-011 |
| 转写助手 → WhisperKit | `WhisperKitConfig(modelFolder:, tokenizerFolder:, download: false)`、`detectLangauge(audioArray:)`、`transcribe(audioArray:decodeOptions:)`、`EnergyVAD` | — | 抛错 → `error` 行 | 本机模型 | `Configurations.swift:7-133`；`WhisperKit.swift:546,1017`；`EnergyVAD.swift:7-41` |
| 转写助手 → Foundation 繁转简 | `String.applyingTransform(StringTransform("Hant-Hans"), reverse: false)` | — | 返回 nil → 原文 | 系统自带 ICU | ICU 用户指南 General Transforms（Hans/Hant 行）；本机实测 `be-architect-2-stt60.log` |

## 4. Decisions
| Decision | Chosen | Rejected (why) |
|---|---|---|
| 进程布局（a） | Node 网关（无 npm 依赖）+ Swift stdio 助手 + llama-server 子进程 | Swift 一体服务器（要 Vapor/Hummingbird 新依赖，每次改代码重编译后首转写约 390 s）；`whisperkit-cli serve`（每段上传写进临时目录且不删，`OpenAIHandler.swift:140-147`，违反 A9）；每句起一次 `whisperkit-cli`（每次重载模型、声音落盘） |
| 启动 llama-server | 网关直接执行二进制，参数固定，缺文件就报错退出 | 调 `start.sh`（缺文件时联网下载，`start.sh:26-45`；带示例页 `--path`） |
| 传输（b, O-4） | 同源：页面和 `/api/*` 都在 127.0.0.1:4317，Node 转发到 127.0.0.1:4318 | 浏览器直连 llama-server + CORS（提示词和采样参数落到浏览器；转写仍需服务端；两个源） |
| 音频（c, O-2） | 16 kHz 单声道 PCM 16-bit WAV，≤ 2,000,000 B（60 s = 1,920,044 B） | MediaRecorder webm/opus（AVFoundation 读不了 webm，需解码依赖）；Float32 / 24 kHz（体积翻倍、要重采样；页面从不发送，FX-005 用 `afconvert` 转成的 16 kHz 副本） |
| 错误码（d, O-1） | 6 个码：`not_ready` `unavailable` `timeout` `failed` `bad_request` `too_large` | 只用 HTTP 状态（503 分不清"预热中"和"挂了"，fe-ux 要不同的话） |
| 情绪（e, O-3） | 同一次 `/api/respond` 内并行两次 Bonsai 调用：自由文本回复 + 枚举情绪（temperature 0） | 单次 JSON `{mood, reply}`（9B 情绪 8/10、前文 2/6）；关键词（REQ-006 禁止） |
| 语言（f, C-005） | 转写：WhisperKit 先判语言，只取 zh/en，再定语言转写；回复：网关按 `line` 的中文词数（汉字数 ÷ 2 向上取整）与英文词数取多数，平局 zh，写进系统提示 | 纯自动检测（静音成俄文，已观察）；跟随界面语言（违反 REQ-005） |
| 简体（REQ-002、A4） | 助手对 zh 结果做 ICU `Hant-Hans` 转换（确定、离线、系统自带） | 只靠中文提示词引导（不确定，无法保证 6/6）；Node 侧自带繁简对照表（新数据文件，要维护） |
| 截止（REQ-011、A11） | 服务端转写 12 s、回复 15 s；页面每次请求在服务端截止 + 1 s 自停（13 s / 16 s）；语音一轮最坏 29 s ≤ 30 s | 页面整轮一个 30 s 计时器经接缝传 `signal`（改接口签名，页面中止后服务端仍在生成、占槽位） |
| `line` 上限 | 1500 字符：60 s 快语速英文约 1100 字符（估计，200 词/分 × 5.5 字符）；实测 52 s 合成英文 933 字符 | 500（60 s 英文会被 400，REQ-001/004 断开）；不设上限（前文撑爆上下文） |
| 静音（REQ-003） | 助手里先过能量门（RMS > 0.02 的 0.1 s 帧 < 3 个 → `""`，不解码） | `noSpeechThreshold`（1.1.1 把 noSpeechProb 写死为 0，`TextDecoder.swift:820`，永不触发） |
| 前文窗口（REQ-007/008） | 最近 40 条里从新往旧取，合计权重 ≤ 2000（权重 = 字符数 + 1.5 × 汉字数 ≈ 4 × token）；冷请求实测 zh 6.7–7.1 s、en 6.5–7.0 s，加转写约 1.5 s ≤ 10 s（window.log） | 6000 字符（冷请求 14.3 s 或 504）；纯字符预算（中文每字 token 是英文 2.6 倍：够中文就饿英文，够英文中文超 10 s）；成块前移（页面每轮只发最后 40 条，后端对不齐块，要改接缝；块切换那一轮仍是冷请求）；换 4B（Plan 已定 9B，前文 1/6） |
| 模型（g） | Bonsai 2 9B | 4B：冷启动快（3.9–4.1 s），但前文 1/6、情绪 8/10（bench.log） |
| 转写模型 | `openai_whisper-large-v3-v20240930_626MB`（spike 同款，已在本机） | 1.5 GB 完整版：同一句同样听错"晚上"，内存多一倍 |

## 5. Risks
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| 前文冷请求超过 10 s 或 15 s 截止 | 高（满 40 条后窗口每轮前移，每轮都冷；预填充约 130 token/s，window.log） | REQ-008 不达标；长前文 504 | 窗口按时延定：权重预算 2000（实测冷请求 ≤ 7.1 s）；系统提示仍进前缀缓存 | 日志 `respond_done.ms` > 8000 |
| 长 `line`（打字 1500 汉字 ≈ 1000 token）冷请求接近 15 s | 低（60 s 中文语音约 300 字；旧窗口下实测 12.2–13.4 s，新窗口未测） | 这一轮 504（REQ-011 有交代） | 不在 REQ-008 范围；截止照旧 | `api_error` `timeout` 且 `history_n` 小 |
| 新 Swift 二进制首次转写约 390 s（ANE 编译） | 高（每次重编译） | 每次改 `stt/` 要等数分钟 | 先建 `stt/` 并冻结；`npm run setup` 编译后即预热 | `stt` 就绪 `warm_ms` > 60000 |
| WhisperKit 或分词器运行时联网 | 低 | REQ-009 失败 | `download: false`、显式模型和分词器目录、启动前检查文件 | 构建第 1 步断网跑 + `lsof -i` |
| 噪声超过能量门被转成幻觉文字 | 已发生（FND-002：12/25 次噪声出 Okay./so/you） | 多出一轮假话 | 解码后判空：语言判定 logprob < -0.5 且 WhisperKit 退回了非零温度才判为噪声（03 DES-011 6a，实测噪声与语音各自完全分开，`be-architect-5-fixes.log`）；前端 < 0.5 s 不发 | FX-008 + 噪声夹具（be-tester） |
| "刚到家"被判 `pleasant-low` | 高（每轮 1 句） | REQ-006 只剩 1 句余量 | 分类提示带例句；构建时调 | FX-004 得分 < 9/10 |
| 合成中文"晚上"听成"婉娃/婉双" | 高（合成音） | CER 13%，接近 15% | 用真人录音复核（A15）；可加中文提示词 | FX-007 CER |
| 回复语言与这句话不一致 | 低（9B 两次调用 42/42，所有变体 0 次不一致，bench.log） | REQ-005 达不到 30/30 | 语言规则写进系统提示（DES-010）；若出现不一致，回设计加一次重试（`languageOf(reply) ≠ lang`） | FX-004 × 3 中任一回复语言不一致 |
| 60 s 语音转写超过 12 s 截止 | 低（52–55 s 合成语音 CLI 含加载 4.3–5.3 s，stt60.log） | 长语音被 504 | 截止留 2 倍余量；助手常驻不重载模型；判不出 zh/en 时转两次约翻倍（估计仍 < 12 s） | `stt_done.ms` > 8000 |
| 浏览器录不出 16 kHz WAV | 低 | 转写 400 | 前端在浏览器里重采样；网关校验头 | `bad_request` 来自 `/api/transcribe` |
| 4317 或 4318 被占用 | 中（用户预览在 4317） | `npm start` 起不来 | 启动时检测，打印占用端口和环境变量名后退出 | 启动日志 |

## 6. Failure model
| Dependency | Fails how | System does |
|---|---|---|
| llama-server | 加载中 | `/api/respond` 503 `not_ready` |
| llama-server | 进程退出 / 连不上 | 503 `unavailable`（立即）；看护 2 s 后重启，最多 5 次 |
| llama-server | 慢 | 15 s 截止 → 504 `timeout` |
| llama-server | 回复非 200、空或整形后为空 | 502 `failed` |
| llama-server | 只有情绪调用失败 | `mood: "neutral"`，回复照常（REQ-006） |
| 转写助手 | 预热中 | `/api/transcribe` 503 `not_ready` |
| 转写助手 | 退出 | 在途请求 503 `unavailable`；重启同上 |
| 转写助手 | 卡住 | 12 s 截止 → 504 `timeout`，迟到的回答按 id 丢弃 |
| 转写助手 | 返回 `error` 行 | 502 `failed` |
| 模型 / 二进制文件 | 缺失 | 不启动，打印缺哪个文件和 `npm run setup`；从不下载 |
| 网关本身 | 没起 | 浏览器请求立即失败 → 前端记为 `unavailable` |

## 7. Cost of the next one
| Growing family | Adding a member changes | Goes red if forgotten |
|---|---|---|
| 语言（zh/en，BD-005） | `server/lang.js` 判定、`server/prompts.js` 语言句、助手允许的语言集合、前端界面文字 | 回复或转写用错语言；无测试量化，属估计 |
| 错误码（6 个） | `server/errors.js` 一处 + 契约表 + 前端文字映射 | 页面显示通用失败；be-tester 的接缝测试逐个比对 `CODES` 与契约表 |
| 情绪（5 个，契约固定） | `server/prompts.js` 的 `MOODS` 与分类提示 + 前端表情模板 | JSON schema 拒绝新 id；`tests/companion.test.js` 缺模板变红 |

## 8. Coverage
| REQ | Component(s) |
|---|---|
| REQ-001 | 录音、转写客户端、转写助手 |
| REQ-002 | 转写助手（语言判定、繁转简） |
| REQ-003 | 转写助手（能量门）、前端数据层（`""` 不成一轮） |
| REQ-004 | 回复客户端、llama-server |
| REQ-005 | 回复客户端（`lang.js`）、界面语言开关（不外发） |
| REQ-006 | 回复客户端（情绪调用） |
| REQ-007 | 回复客户端（最近 40 条）、llama-server |
| REQ-008 | 回复客户端（并行、前缀缓存）、看护（预热）、转写助手 |
| REQ-009 | 网关、静态文件、转写助手、看护（只回环、不下载） |
| REQ-010 | 网关、看护、`package.json` |
| REQ-011 | 错误表、网关（12 s + 15 s 截止）、看护、前端数据层（13 s / 16 s 自停） |
| REQ-012 | 界面语言开关 |

## Increment 2 — 2026-11-15

- Author: be-architect #6 · step 2, round 1 · Input: `01-requirements.md` § Increment 2（REQ-014..035，A16–A30，Q5–Q9） · Status: draft
- 证据：`docs/backend/logs/be-architect-6-tts.log`（TTS 时延、内存、回读、规则原型）；试听：`docs/backend/evidence/tts-voices/`。
- REQ-032..035（本地记忆）只设计、本增量不建：见 03 DES-029、DES-030。

### 1. Components (increment 2)
```
浏览器 ──POST /api/speak {text, lang}──> 网关 server/tts.js ──stdin/stdout JSON 行──> companion-tts (Swift + TTSKit, Qwen3-TTS 0.6B)
        <── audio/wav (PCM16 24 kHz) ──
```

| Component | Responsibility (one sentence) | Serves |
|---|---|---|
| 朗读助手 `stt/` 的第二个目标 `companion-tts`（Swift，TTSKit 1.1.1） | 常驻、离线加载 Qwen3-TTS、预热 zh/en 提示缓存、把一段文字合成为内存里的 16-bit WAV。 | REQ-014, REQ-015, REQ-017 |
| 朗读客户端 `server/tts.js` | 看护助手、一次一段排队、页面中止的段不生成、10 s 截止；把回复切成朗读段。 | REQ-014..REQ-018 |
| 危机规则 `server/crisis.js` | 按固定中英文词句表判这一句是不是危机，结果确定。 | REQ-023, REQ-025 |
| 危机回复（`server/bonsai.js` + `server/prompts.js`） | 危机轮让 Bonsai 写一句温柔的话，再接上固定的 988 句；Bonsai 出错时用固定句。 | REQ-024, REQ-025 |
| 名字规则 `server/name.js` + `replySystem` | 清理名字（≤ 12 字、允许集），以引号内数据放进系统提示。 | REQ-030, REQ-031 |
| 网关 `server/main.js`（增改） | `/api/speak`、respond 收 `name` 回 `lang`/`crisis`/`speech`、health 加 `tts`、缺 TTS 文件不挡启动。 | REQ-014, REQ-017, REQ-025, REQ-030 |
| 朗读播放（side: frontend） | 喇叭开时逐段请求并播放，预取一段；关喇叭、按住、发送、清空即停。 | REQ-014..REQ-018 |
| 危机卡片（side: frontend） | 读 `crisis` 显示 988/911 卡片，可关。 | REQ-025 |
| 改名（side: frontend） | 原地改名，同一规则清理，存本机浏览器，随 respond 发 `name`。 | REQ-028..REQ-031 |
| 深呼吸、戳一戳、一键清空（side: frontend） | 只在页面，读已有 `mood` 与新 `crisis`，无新接口。 | REQ-019..REQ-022, REQ-026, REQ-027 |
| 本地记忆（design only，两侧） | 页面存心情记录与摘要；网关多一个无状态的摘要调用。 | REQ-032..REQ-035 |

### 2. Data model (increment 2)
| Entity | Key fields | Owner | Stored in |
|---|---|---|---|
| 名字 | 清理后 1–12 码点，或缺省 = 默认名 | 页面 | 浏览器 localStorage `companion.name`（REQ-029、A27）；网关只在请求内存 |
| 一轮结果（增） | `lang` zh\|en、`crisis` boolean、`speech` 朗读段数组 | 网关 | 页面内存；`crisis` 不记日志（A9） |
| 朗读段 | 文字 1–200 字符 + `lang` → WAV PCM16 单声道 24 kHz | 页面请求 → 网关 → 助手 | 只在内存，播完丢弃 |
| 朗读队列项 | `id`、`text`、`lang`、`signal`、计时器 | 网关 | 进程内存 |
| 记忆（design only） | `on`、`moods[{date, mood}]`、`summary` ≤ 400 字符 | 页面 | 浏览器 localStorage `companion.memory`；默认无此键 |

### 3. External contracts (increment 2)
| Interface | Signature / endpoint | Auth | Errors | Limits | Source |
|---|---|---|---|---|---|
| 页面 → 网关：回复（增） | `POST /api/respond` `{line, history, name?}` → `{reply, mood, lang, crisis, speech}` | 同 §3 | 同 §3；危机轮不报错 | `name` 任何长度的字符串进、清理后 ≤ 12 码点；非字符串 400 | 本设计 |
| 页面 → 网关：朗读 | `POST /api/speak` `{text, lang}` → 200 `audio/wav` | 同上；`application/json` | 6 个码，同 §3 | 体 ≤ 4096 B；`text` 去空白 1–200；10 s 截止 | 本设计 |
| 页面 → 网关：就绪（增） | `GET /api/health` → `{ready, stt, bonsai, tts}`；`ready` 不含 `tts` | 同上 | — | — | A18 |
| 网关 → 朗读助手 | stdin `{"id","text","lang"}` → stdout `{"id","wav":"<base64>","ms","audio_ms"}` 或 `{"id","ms","error"}`；首行 `{"event":"ready","load_ms","warm_ms"}` | 进程内管道 | `error` → `failed`；退出 → `unavailable` | 一次一段 | 本设计 |
| 朗读助手 → TTSKit | `TTSKitConfig(modelFolder:, tokenizerFolder:, download: false)`、`buildPromptCache(voice:language:)`、`promptCache`、`generate(text:voice:language:options:)` → `SpeechResult{audio,sampleRate}` | — | 抛错 → `error` 行 | 本机模型；`maxNewTokens` 120 帧（每帧 80 ms） | `Qwen3Config.swift:114-305`；`TTSKit.swift:104,375-386,555-567,628-642,779-785`；`Models.swift:431-449` |
| 浏览器有声自动播放 | 页面有过用户操作后才能出声；发送、按住都算 | — | 被拦 → 不出声 | — | https://developer.chrome.com/blog/autoplay |

### 4. Decisions (increment 2)
| Decision | Chosen | Rejected (why) |
|---|---|---|
| TTS 进程 | 常驻 `companion-tts`（同 `stt/` 模式），启动时预热 | 每次 `whisperkit-cli tts`：5.4–5.6 s 一句（加载占大头），且把音频写进文件（log §A） |
| 放在哪个包 | `stt/` 包加第二个可执行目标，同一 pin，无需重新解析依赖 | 新建 `tts/` 包（再克隆一份依赖、两份 Package.resolved 要同步） |
| 谁出声 | 页面播放网关返回的 WAV | 助手直接用 Mac 喇叭播（停、静音要另开控制通道；页面开关管不到） |
| 整条还是分段 | 回复切段，页面逐段请求、预取一段；首段 zh ≤ 10 字、en ≤ 7 词 | 整条一次合成：zh 3.0–3.9 s、en 3.4–3.6 s，超过 3 s（log §D）；助手流式回多段（要 HTTP 分块和页面拼流） |
| 段从哪来 | 网关算好 `speech` 随 respond 返回（一个生产者） | 页面自己切句（规则写两份） |
| 英文数字 | en 段把数字念成单词（988 → nine eight eight） | 原样：serena 把 988 念成乱音（log §I） |
| 音频格式 | WAV PCM 16-bit 单声道 24 kHz（模型原生采样率） | Float32 WAV（大一倍）；m4a（要编码、流程多一步） |
| 危机识别 | 固定词句表 + 例外表，规范化后子串/词界匹配 | Bonsai 打分（不确定，REQ-023 要 10/10 一致） |
| 回复必提 988 | Bonsai 第一句 + 固定 988 句；Bonsai 失败用固定句 | 只靠提示词（REQ-024 要 3/3，不可保证）；整条固定回复（失去 Bonsai 的回应） |
| 名字进提示 | 后端再清理，放在引号内；允许集无引号/换行 | 原样信任页面（直接 POST 可注入） |
| 名字存哪 | 浏览器 localStorage | 网关写本机文件（要新的写盘路径与权限，A27 已定浏览器） |
| 记忆存哪（design only） | 浏览器 localStorage，网关保持无状态 | 网关写 `~/Library/Application Support/…` 文件（忘掉我要删文件，服务端首次有状态） |

### 5. Risks (increment 2)
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| 首段超过 3 s | 中（采样随机；8 词段实测到 3.1 s） | REQ-015 | 首段上限 zh 10 字 / en 7 词；12 字段实测 ≤ 2.37 s | 日志 `tts_done.ms` > 2500 |
| 段与段之间有停顿 | 中（后段比前段长时） | 听感 | 只预取一段；后段上限 zh 24 / en 16 | 人工听 FX-013 |
| 朗读与 Bonsai 抢算力 | 低（只有发新一句时在途的那一段） | 下一条回复慢 ≤ 一段 | 排队的段被中止即不生成 | `respond_done.ms` 上升 |
| 采样跑飞（长时间乱音） | 低 | 一段卡住 | `maxNewTokens` 120 帧（≤ 9.6 s）；10 s 截止 | `tts_done.audio_ms` ≫ 段长 |
| 危机漏判 | 中（表外说法） | 没有卡片 | 表可审、可加；否定也判（A22） | 用户在 Plan 审表 |
| 危机误判（如 "Suicide Squad"） | 中 | 多出一张卡片 | 接受（A22：漏判更糟）；例外表 | FX-010 |
| 改名后仍自称默认名 | 未测 | REQ-030 | NAME_RULE 明说"不要叫自己小伙伴"；构建时跑 FX-011 × 3 | FX-011 |
| 内存 | 低 | 换页变慢 | 实测：Bonsai 9.5 GB + STT 166 MB + TTS 171 MB ≈ 9.9 GB / 24 GB | `memory_pressure` |

### 6. Failure model (increment 2)
| Dependency | Fails how | System does |
|---|---|---|
| 朗读助手 | 缺文件 | 不启动，打印缺的路径和一行提示；`tts: "down"`，聊天照常 |
| 朗读助手 | 预热中 / 退出 / 卡住 / `error` 行 | `/api/speak` 503 `not_ready` / 503 `unavailable` / 504 `timeout` / 502 `failed`；页面只是不出声；看护重启同 §6 |
| 朗读助手 | 页面中止 | 排队的段不写给助手；在途的答案丢弃 |
| llama-server | 危机轮出错或没起 | 不报错：固定温柔句 + 988 句，`crisis: true` |

### 7. Cost of the next one (increment 2)
| Growing family | Adding a member changes | Goes red if forgotten |
|---|---|---|
| 危机词句 | `server/crisis.js` 一处表 | FX-009/010 用例；新词要加正反各一句 |
| 声音 | 环境变量 `TTS_VOICE`（9 个之一，config 校验） | 启动时报错退出 |
| 朗读语言 | `LANGUAGE` 表（Swift）+ `speechParts` 计数规则 + `server/lang.js` | 助手回 `bad_request`；无测试量化，属估计 |

### 8. Coverage (increment 2)
| REQ | Component(s) |
|---|---|
| REQ-014 | 朗读助手、朗读客户端、网关、朗读播放 |
| REQ-015 | 朗读助手（常驻预热）、朗读客户端（分段）、朗读播放（预取） |
| REQ-016 | 朗读播放、朗读客户端（中止不生成） |
| REQ-017 | 网关（`ready` 不含 tts、缺文件不挡）、朗读播放 |
| REQ-018 | 朗读播放、朗读客户端 |
| REQ-019, REQ-020, REQ-021, REQ-022 | 深呼吸（页面） |
| REQ-023 | 危机规则 |
| REQ-024 | 危机回复 |
| REQ-025 | 危机规则、网关 `crisis`、危机卡片 |
| REQ-026 | 一键清空（页面） |
| REQ-027 | 戳一戳（页面） |
| REQ-028, REQ-029 | 改名（页面） |
| REQ-030 | 名字规则、网关 |
| REQ-031 | 名字规则、改名（页面） |
| REQ-032..REQ-035 | 本地记忆（design only） |
