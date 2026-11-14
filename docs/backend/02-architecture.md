# Architecture — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文

- Author: be-architect #1 · Input: `01-requirements.md` · Status: draft · 2026-11-14
- 证据：`docs/backend/logs/be-architect-1-bench.log`（4B/9B 基准）、`docs/backend/logs/be-architect-1-stt-check.log`（WhisperKit 检查）。

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
| 转写客户端 `server/wav.js` + `server/stt.js` | 校验 WAV、取出 PCM、按 id 和 Swift 助手一问一答、20 s 截止。 | REQ-001, REQ-002, REQ-003, REQ-011 |
| 回复客户端 `server/bonsai.js` + `server/prompts.js` + `server/lang.js` | 判定这句话的语言、并行发"回复"和"情绪"两次请求、整形回复、情绪失败给 `neutral`。 | REQ-004..REQ-008, REQ-011 |
| 错误表 `server/errors.js` | 6 个错误码及其 HTTP 状态，网关和契约共用这一份。 | REQ-011 |
| 转写助手 `stt/`（Swift，WhisperKit 1.1.1） | 常驻、离线加载 large-v3、能量门挡静音、只在中/英之间定语言、内存里转写。 | REQ-001, REQ-002, REQ-003, REQ-009 |
| llama-server（PrismML 分支，外部） | 运行 Bonsai 2 9B，OpenAI 风格接口，2 个槽位各自缓存前缀。 | REQ-004..REQ-008 |
| 前端数据层 `web/js/companion-client.js`（side: frontend） | 把 `respond`/`transcribe`/`health` 接到 `/api/*`，错误变成 `code`。 | REQ-001, REQ-003..REQ-008, REQ-011 |
| 录音 `web/js/mic.js`（side: frontend） | 把按住的这段话录成 16 kHz 单声道 16-bit WAV，交给 `transcribe` 后丢弃。 | REQ-001, REQ-003 |
| 界面语言开关（side: frontend） | 只换界面文字，不发给后端。 | REQ-012, REQ-005 |

## 2. Data model
无持久化：对话只在页面内存（BD-002），声音和文字只在请求内存里，转写后丢弃（A9）。

| Entity | Key fields | Owner | Stored in |
|---|---|---|---|
| 一轮请求 | `line`（1–500 字符，去首尾空白）、`history`（≤ 40 条） | 页面 | 页面内存；网关请求内存 |
| 前文条目 | `role`: `user`\|`companion`，`text`（1–1000 字符） | 页面 | 页面内存 |
| 一轮结果 | `reply`（非空）、`mood`（5 个 id 之一） | 网关（由 Bonsai 生成） | 页面内存 |
| 一段语音 | WAV 字节，≤ 2,000,000 B | 页面录音 → 网关 → 助手 | 只在内存，转写后丢弃 |
| 转写结果 | `text`（`""` = 没听到） | 转写助手 | 页面内存（成为一轮） |
| 子进程状态 | `name`、`state`、`pid`、`restarts` | 看护 | 网关进程内存 |

## 3. External contracts
| Interface | Signature / endpoint | Auth | Errors | Limits | Source |
|---|---|---|---|---|---|
| 页面 → 网关：回复 | `POST /api/respond` JSON `{line, history}` → 200 `{reply, mood}` | 无；只听 127.0.0.1；必须 `Content-Type: application/json` | `{error: code}`，码见 03 §3 | 请求体 ≤ 128 KB；25 s 截止 | 本设计（契约 §2 seam） |
| 页面 → 网关：转写 | `POST /api/transcribe` 体 = WAV 字节，`Content-Type: audio/wav` → 200 `{text}` | 同上 | 同上 | ≤ 2,000,000 B；16 kHz 单声道 PCM 16-bit；20 s 截止 | 本设计；16 kHz = `WhisperKit.sampleRate`（`WhisperKit.swift:44`） |
| 页面 → 网关：就绪 | `GET /api/health` → 200 `{ready, stt, bonsai}` | 同上 | — | — | 本设计 |
| 网关 → llama-server | `POST /v1/chat/completions`，每次带采样参数和 `chat_template_kwargs.enable_thinking=false`；情绪用 `response_format.json_schema` | 无（只听 127.0.0.1） | 非 200 → `failed`；连不上 → `unavailable` | 2 槽位，`-c 32768` | `samples/bonsai-models/shared/index.html:51-55,117-124`；基准 0 次 JSON 解析失败、0 次思考泄漏（bench.log） |
| 网关 → llama-server 健康 | `GET /health` 200 `{"status":"ok"}`，加载中 503 | 无 | — | — | llama.cpp `tools/server/README.md` |
| 网关 → 转写助手 | stdin 一行 `{"id":n,"pcm16":"<base64>"}` → stdout 一行 `{"id":n,"text":"…","lang":"zh"\|"en"\|null,"ms":…}` 或 `{"id":n,"error":"…"}`；启动后一行 `{"event":"ready",…}` | 进程内管道 | `error` 行 → `failed`；进程退出 → `unavailable` | 一次一段，按序处理 | 本设计；WhisperKit API 见 03 DES-011 |
| 转写助手 → WhisperKit | `WhisperKitConfig(modelFolder:, tokenizerFolder:, download: false)`、`detectLangauge(audioArray:)`、`transcribe(audioArray:decodeOptions:)`、`EnergyVAD` | — | 抛错 → `error` 行 | 本机模型 | `Configurations.swift:7-133`；`WhisperKit.swift:546,1017`；`EnergyVAD.swift:7-41` |

## 4. Decisions
| Decision | Chosen | Rejected (why) |
|---|---|---|
| 进程布局（a） | Node 网关（无 npm 依赖）+ Swift stdio 助手 + llama-server 子进程 | Swift 一体服务器（要 Vapor/Hummingbird 新依赖，每次改代码重编译后首转写约 390 s）；`whisperkit-cli serve`（每段上传写进临时目录且不删，`OpenAIHandler.swift:140-147`，违反 A9）；每句起一次 `whisperkit-cli`（每次重载模型、声音落盘） |
| 启动 llama-server | 网关直接执行二进制，参数固定，缺文件就报错退出 | 调 `start.sh`（缺文件时联网下载，`start.sh:26-45`；带示例页 `--path`） |
| 传输（b, O-4） | 同源：页面和 `/api/*` 都在 127.0.0.1:4317，Node 转发到 127.0.0.1:4318 | 浏览器直连 llama-server + CORS（提示词和采样参数落到浏览器；转写仍需服务端；两个源） |
| 音频（c, O-2） | 16 kHz 单声道 PCM 16-bit WAV，≤ 2,000,000 B（60 s = 1,920,044 B） | MediaRecorder webm/opus（AVFoundation 读不了 webm，需解码依赖）；Float32（体积翻倍） |
| 错误码（d, O-1） | 6 个码：`not_ready` `unavailable` `timeout` `failed` `bad_request` `too_large` | 只用 HTTP 状态（503 分不清"预热中"和"挂了"，fe-ux 要不同的话） |
| 情绪（e, O-3） | 同一次 `/api/respond` 内并行两次 Bonsai 调用：自由文本回复 + 枚举情绪（temperature 0） | 单次 JSON `{mood, reply}`（9B 情绪 8/10、前文 2/6）；关键词（REQ-006 禁止） |
| 语言（f, C-005） | 转写：WhisperKit 先判语言，只取 zh/en，再定语言转写；回复：网关按 `line` 的汉字数与英文词数取多数，写进系统提示 | 纯自动检测（静音成俄文，已观察）；跟随界面语言（违反 REQ-005） |
| 静音（REQ-003） | 助手里先过能量门（RMS > 0.02 的 0.1 s 帧 < 3 个 → `""`，不解码） | `noSpeechThreshold`（1.1.1 把 noSpeechProb 写死为 0，`TextDecoder.swift:820`，永不触发） |
| 模型（g） | Bonsai 2 9B | 4B：冷启动快（3.9–4.1 s），但前文 1/6、情绪 8/10（bench.log） |
| 转写模型 | `openai_whisper-large-v3-v20240930_626MB`（spike 同款，已在本机） | 1.5 GB 完整版：同一句同样听错"晚上"，内存多一倍 |

## 5. Risks
| Risk | Likelihood | Impact | Mitigation | Early signal |
|---|---|---|---|---|
| 前缀缓存失效时 20 轮冷请求 6.4–8.7 s + 转写约 2 s，超过 10 s | 中（仅缓存冷时） | REQ-008 首句不达标 | 2 槽位缓存前缀；启动预热两种系统提示；不达标则 `BONSAI_MODEL=4B`（前文变差） | 日志 `respond_done.ms` > 7000 |
| 新 Swift 二进制首次转写约 390 s（ANE 编译） | 高（每次重编译） | 每次改 `stt/` 要等数分钟 | 先建 `stt/` 并冻结；`npm run setup` 编译后即预热 | `stt` 就绪 `warm_ms` > 60000 |
| WhisperKit 或分词器运行时联网 | 低 | REQ-009 失败 | `download: false`、显式模型和分词器目录、启动前检查文件 | 构建第 1 步断网跑 + `lsof -i` |
| 噪声超过能量门被转成幻觉文字 | 中 | 多出一轮假话 | 门限常量可调；前端 < 0.5 s 不发；用真麦克风测 | FX-008 + 一段环境噪声 |
| "刚到家"被判 `pleasant-low` | 高（每轮 1 句） | REQ-006 只剩 1 句余量 | 分类提示带例句；构建时调 | FX-004 得分 < 9/10 |
| 合成中文"晚上"听成"婉娃/婉双" | 高（合成音） | CER 13%，接近 15% | 用真人录音复核（A15）；可加中文提示词 | FX-007 CER |
| 浏览器录不出 16 kHz WAV | 低 | 转写 400 | 前端在浏览器里重采样；网关校验头 | `bad_request` 来自 `/api/transcribe` |
| 4317 或 4318 被占用 | 中（用户预览在 4317） | `npm start` 起不来 | 启动时检测，打印占用端口和环境变量名后退出 | 启动日志 |

## 6. Failure model
| Dependency | Fails how | System does |
|---|---|---|
| llama-server | 加载中 | `/api/respond` 503 `not_ready` |
| llama-server | 进程退出 / 连不上 | 503 `unavailable`（立即）；看护 2 s 后重启，最多 5 次 |
| llama-server | 慢 | 25 s 截止 → 504 `timeout` |
| llama-server | 回复非 200、空或整形后为空 | 502 `failed` |
| llama-server | 只有情绪调用失败 | `mood: "neutral"`，回复照常（REQ-006） |
| 转写助手 | 预热中 | `/api/transcribe` 503 `not_ready` |
| 转写助手 | 退出 | 在途请求 503 `unavailable`；重启同上 |
| 转写助手 | 卡住 | 20 s 截止 → 504 `timeout`，迟到的回答按 id 丢弃 |
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
| REQ-002 | 转写助手（语言判定） |
| REQ-003 | 转写助手（能量门）、前端数据层（`""` 不成一轮） |
| REQ-004 | 回复客户端、llama-server |
| REQ-005 | 回复客户端（`lang.js`）、界面语言开关（不外发） |
| REQ-006 | 回复客户端（情绪调用） |
| REQ-007 | 回复客户端（最近 40 条）、llama-server |
| REQ-008 | 回复客户端（并行、前缀缓存）、看护（预热）、转写助手 |
| REQ-009 | 网关、静态文件、转写助手、看护（只回环、不下载） |
| REQ-010 | 网关、看护、`package.json` |
| REQ-011 | 错误表、网关、看护、前端数据层 |
| REQ-012 | 界面语言开关 |
