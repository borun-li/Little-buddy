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
