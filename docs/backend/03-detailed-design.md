# Detailed design — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文

- Author: be-architect #1 (Phase 2, same dispatch as `02-architecture.md`) · Input: `01-requirements.md`, `02-architecture.md` · 2026-11-14
- 代码 ESM JavaScript（Node ≥ 18，本机 v24.13.0，无 npm 依赖）+ Swift 5.10 包。文档中文，代码与标识符英文。
- 证据：`docs/backend/logs/be-architect-1-bench.log`、`docs/backend/logs/be-architect-1-stt-check.log`。

## 1. Files
| Path | Responsibility | New / changed |
|---|---|---|
| `server/main.js` | 入口：文件检查、端口检查、HTTP 路由、请求校验、启动与退出 | new |
| `server/config.js` | 端口、路径、上限、截止时间；`missingFiles()` | new |
| `server/errors.js` | 6 个错误码、`ApiError`、`sendError()` | new |
| `server/supervisor.js` | 通用子进程看护：启动、预热、状态、重启、停止 | new |
| `server/static.js` | 从 `web/` 返回静态文件 | new |
| `server/wav.js` | 校验 WAV 头，取出 PCM 16-bit 数据 | new |
| `server/stt.js` | 拉起 `companion-stt`，stdio JSON 行一问一答 | new |
| `server/lang.js` | `languageOf(text)` → `zh` \| `en` | new |
| `server/prompts.js` | 系统提示、情绪 id、采样参数、情绪 JSON schema | new |
| `server/bonsai.js` | 拉起 llama-server；`respond()` 并行两次调用；`shapeReply()` | new |
| `stt/Package.swift` | Swift 包，依赖 argmax-oss-swift 1.1.1（exact） | new |
| `stt/Package.resolved` | 复制 `spikes/argmax-swift/Package.resolved`（同样两个 pin） | new |
| `stt/Sources/CompanionSTT/main.swift` | 常驻转写助手 | new |
| `package.json` | `start` 改为 `node server/main.js`；加 `setup` | changed |
| `docs/codemap.md` | 加 `server/`、`stt/` 两段 | changed |
| `web/js/companion-client.js`、`web/js/mic.js`、界面语言相关文件 | 前端接缝（DES-013..015），fe-engineer 建 | changed (side: frontend) |
| `tests/server-*.test.js` 与 `package.json` 的 test 行 | be-tester 写 | new / changed |

## 2. Modules

### DES-001 — `server/main.js`
- **Serves:** REQ-009, REQ-010, REQ-011
- **Side:** backend
- **Interface:**
```js
// node server/main.js [--warm-only]
async function main(argv: string[]): Promise<void>
function route(req: http.IncomingMessage, res: http.ServerResponse): void
async function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> // throws ApiError('too_large')
function parseTurn(body: Buffer): { line: string, history: HistoryEntry[] }        // throws ApiError('bad_request')
// parseTurn: line trimmed 1–500 chars; history array of { role: 'user'|'companion', text: 1–1000 chars }; keep the last 40
// routes: GET /api/health | POST /api/respond (application/json, ≤ 131072 B) | POST /api/transcribe (audio/wav, ≤ 2,000,000 B)
```
- **Behaviour:**
  1. `missingFiles()` 非空 → 打印每个缺失路径和"联网时运行一次 `npm run setup`"，退出 1。
  2. `BONSAI_PORT` 上 `/health` 500 ms 内有应答 → 打印"端口被占用，设 BONSAI_PORT"，退出 1。
  3. 非 `--warm-only`：`listen(PORT,'127.0.0.1')`；`EADDRINUSE` → 打印"设 PORT"，退出 1。
  4. 同时启动两个子进程；都 `ready` → 打印 `就绪 Ready: <url>`；`--warm-only` 则停掉、退出 0。
  5. `/api/health` → 200 `{ready, stt, bonsai}`；respond → `parseTurn` → `bonsai.respond`；transcribe → `pcmFromWav` → `stt.transcribe` → `{text}`。
  6. 其他 `/api/*` → 404 `bad_request`；其余 → `serveStatic`。
  7. `SIGINT`/`SIGTERM`/`exit` → 只停自己拉起的子进程。
- **Errors:** `bad_request`、`too_large`；其余来自 DES-006/007，统一经 `sendError`。

### DES-002 — `server/config.js`
- **Serves:** REQ-009, REQ-010
- **Side:** backend
- **Interface:**
```js
export const CONFIG: {
  host: '127.0.0.1', port: number,                       // PORT, default 4317
  bonsai: { size: '2B'|'4B'|'9B', port: number, dir: string },   // BONSAI_MODEL '9B', BONSAI_PORT 4318, <repo>/samples/bonsai-models/gguf
  stt: { bin: string, modelDir: string, tokenizerDir: string },  // <repo>/stt/.build/release/companion-stt, STT_MODEL_DIR, STT_TOKENIZER_DIR
  limits: { lineChars: 500, historyEntries: 40, historyTextChars: 1000, jsonBytes: 131072, wavBytes: 2000000 },
  deadlines: { respondMs: 25000, transcribeMs: 20000, sttBootMs: 600000, bonsaiBootMs: 60000 },
  restarts: { max: 5, delayMs: 2000 },
}
export function bonsaiFiles(cfg = CONFIG): { bin: string, model: string } // bin/macos-arm64/llama-server, models/Ternary-Bonsai-2-<size>-PQ2_0.gguf
export function missingFiles(cfg = CONFIG): string[]
```
- **Behaviour:**
  1. `<repo>` = `server/` 的上一级（`import.meta.url`），不写死个人路径；家目录用 `os.homedir()`。
  2. `missingFiles` 检查：llama-server、gguf、`stt.bin`、`modelDir` 下 `AudioEncoder.mlmodelc`/`TextDecoder.mlmodelc`/`MelSpectrogram.mlmodelc`、`tokenizerDir/models/openai/whisper-large-v3/tokenizer.json`。
  3. 只读环境变量，从不下载。
- **Errors:** 无（缺文件由 DES-001 处理）。

### DES-003 — `server/errors.js`
- **Serves:** REQ-011
- **Side:** backend
- **Interface:**
```js
export const CODES = { not_ready: 503, unavailable: 503, timeout: 504, failed: 502, bad_request: 400, too_large: 413 };
export class ApiError extends Error { constructor(code: keyof CODES, stage?: 'request'|'stt'|'bonsai'); code; status; stage }
export function sendError(res: http.ServerResponse, err: unknown, route: string): void
```
- **Behaviour:**
  1. `ApiError` → 它的状态码与 `{"error": code}` 原样通过。
  2. 其他任何异常 → 502 `{"error":"failed"}`，日志只记 `err.name`（不记 message，可能含内容）。
  3. `res.headersSent` 为真 → 只 `res.destroy()`，不再写。
- **Errors:** 定义见 §3。

### DES-004 — `server/supervisor.js`
- **Serves:** REQ-010, REQ-011
- **Side:** backend
- **Interface:**
```js
/** @typedef {'starting'|'ready'|'down'} ChildState */
export const isReady = (s: ChildState) => s === 'ready';
export function supervise(opts: {
  name: 'stt' | 'bonsai', cmd: string, args: string[],
  stdio: ['pipe'|'ignore', 'pipe'|'ignore', 'inherit'|'ignore'],
  warm: (child: ChildProcess) => Promise<void>,          // resolves when usable
  onExit?: () => void,                                    // owner rejects its in-flight work
}): { readonly state: ChildState, readonly pid: number | null, readonly child: ChildProcess | null, stop(): void }
```
- **Behaviour:**
  1. `spawn` → `starting`，记 `child_spawn {name,pid}`。
  2. `warm` 成功 → `ready`，记 `child_ready {name,ms}`；失败 → 杀掉该子进程，走第 3 步。
  3. 子进程退出 → `down`，调 `onExit`，记 `child_exit {name,code,signal,restarts}`。
  4. 不是 `stop()` 引起且 `restarts < 5` → 2 s 后重新 `spawn`（`restarts++`）；否则保持 `down`。
  5. `stop()` 只给自己 spawn 的 pid 发 `SIGTERM`。
- **Errors:** 无（状态由调用方映射成 `not_ready`/`unavailable`）。

### DES-005 — `server/static.js` 与 `server/wav.js`
- **Serves:** REQ-001, REQ-009, REQ-010
- **Side:** backend
- **Interface:**
```js
export function serveStatic(req, res, root: string): void
export function pcmFromWav(buf: Buffer): Buffer   // PCM 16-bit LE mono @16 kHz; throws ApiError('bad_request','request')
```
- **Behaviour:**
  1. 静态：只 GET/HEAD（否则 405）；`/` → `/index.html`；解码后 `resolve(root, '.'+path)` 不在 `root + sep` 下 → 404（触发：`/../package.json`、`/%2e%2e/x`；不触发：`/js/app.js`）。
  2. 按扩展名给类型（html js css svg woff2 txt json png ico），`Cache-Control: no-store`；不存在 → 404。
  3. WAV：长度 ≥ 44、`RIFF`/`WAVE`；遍历块找 `fmt `（格式 1、单声道、16000 Hz、16 位）和 `data`，返回 `data`（截到偶数字节、不超出缓冲区）。
  4. 任一不符 → `bad_request`（触发：FX-005 原样 24 kHz Float32、双声道、webm；不触发：`say --data-format=LEI16@16000` 输出，含额外块也可）。
- **Errors:** `bad_request`

### DES-006 — `server/stt.js`
- **Serves:** REQ-001, REQ-002, REQ-003, REQ-011
- **Side:** backend
- **Interface:**
```js
export const isNothingHeard = (text: string) => text === '';
export function createStt(cfg = CONFIG): {
  start(): void, stop(): void, readonly state: ChildState,
  transcribe(pcm: Buffer): Promise<string>,   // '' = nothing heard
}
```
- **Behaviour:**
  1. `supervise('stt', stt.bin, ['--model-folder', modelDir, '--tokenizer-folder', tokenizerDir], stdio ['pipe','pipe','inherit'])`；`warm` 等 stdout 出现 `{"event":"ready"}`（≤ 600 s）。
  2. stdout 按行切，只解析以 `{` 开头的行；其他行丢弃。
  3. `transcribe`：`starting` → `not_ready`；`down` → `unavailable`。
  4. 递增 `id`（本进程内计数，不持久），写 `{"id","pcm16": base64}\n`，登记待答与 20 s 计时器。
  5. 同 `id` 回答：有 `error` → `failed`；否则 `text.trim()`。超时 → `timeout`，删登记，迟到回答丢弃。
  6. 子进程退出 → 所有待答 `unavailable`。
  7. 记 `stt_done {ms, audio_ms, empty, lang}`。
- **Errors:** `not_ready`、`unavailable`、`timeout`、`failed`

### DES-007 — `server/bonsai.js`
- **Serves:** REQ-004, REQ-006, REQ-007, REQ-008, REQ-011
- **Side:** backend
- **Interface:**
```js
export function createBonsai(cfg = CONFIG): {
  start(): void, stop(): void, readonly state: ChildState,
  respond(line: string, history: HistoryEntry[]): Promise<{ reply: string, mood: Mood }>,
}
export function toMessages(line: string, history: HistoryEntry[], lang: 'zh'|'en'): { role: 'system'|'user'|'assistant', content: string }[]
export function shapeReply(text: string, lang: 'zh'|'en'): string   // '' when nothing usable
```
- **Behaviour:**
  1. `supervise('bonsai', bin, ['-m',model,'-ngl','99','-fa','on','-c','32768','-np','2','--host','127.0.0.1','--port',BONSAI_PORT,'--no-webui'], stdio ignore)`；`warm` = 每 500 ms 查 `/health` 到 200（≤ 60 s），再跑一次 `respond('Hello', [])`。
  2. `respond`：状态映射同 DES-006；`lang = languageOf(line)`；`win = history.slice(-40)`。
  3. 同一 `AbortSignal.timeout(25000)` 下并行：回复调用（`toMessages`，`REPLY_SAMPLING`，`enable_thinking:false`）与情绪调用（`MOOD_SYSTEM` + 只这句话，`MOOD_SAMPLING`，`response_format` = `MOOD_SCHEMA`）。
  4. 回复调用：超时 → `timeout`；连不上 → `unavailable`；非 200 → `failed`；`shapeReply` 为空 → `failed`。
  5. 情绪：解析出的值在 `MOODS` 中才用，其余（失败、超时、不在集合）→ `neutral`。
  6. 记 `respond_done {ms, reply_ms, mood_ms, lang, mood_fallback, history_n}`。
- **Errors:** `not_ready`、`unavailable`、`timeout`、`failed`

### DES-008 — `server/bonsai.js` 的 `shapeReply` 与 `toMessages`
- **Serves:** REQ-004, REQ-005, REQ-007
- **Side:** backend
- **Interface:** 见 DES-007。
- **Behaviour:**
  1. `toMessages`：`[{system: REPLY_SYSTEM + '\n' + LANG_RULE[lang]}, ...win（companion→assistant）, {user: line}]`。
  2. `shapeReply` 去掉 `<think>…</think>`（含未闭合到结尾）、首尾空白和包裹引号。
  3. 在 `。！？!?.…` 连续标点后切句，标点和紧随的 emoji 留在前一句。
  4. 依次保留，至多 2 句；已有一个问句时跳过含 `?`/`？` 的句子。
  5. zh 用 `''`、en 用 `' '` 连接；仍超上限（zh > 120 码点，en > 40 词）→ 只留第一句；再超 → 截到上限加 `…`。
  6. 触发：3 句回复 → 2 句；"A? B?" → "A?"；不触发："That is amazing news! Congratulations!" 原样。
- **Errors:** 返回 `''` 由 DES-007 变 `failed`。

### DES-009 — `server/lang.js`
- **Serves:** REQ-005
- **Side:** backend
- **Interface:**
```js
export function languageOf(text: string): 'zh' | 'en'
```
- **Behaviour:**
  1. `han` = `\p{Script=Han}` 字数；`words` = `/[A-Za-z]+/g` 词数。
  2. `han > 0 && han >= words` → `zh`；否则 `words > 0` → `en`；两者皆 0（只有 emoji、数字）→ `zh`。
  3. 例："I just got the internship!" → en；"我今天很happy" → zh（4:1）；"I love 火锅" → en（3:2）。
  4. 只看 `line`；界面语言从不进入后端。
- **Errors:** 无。

### DES-010 — `server/prompts.js`
- **Serves:** REQ-004, REQ-005, REQ-006, REQ-007
- **Side:** backend
- **Interface:** 文字原样取自基准实测版本（`be-architect-1-bench-scripts.log` 的 `bench-two.mjs`）：
```js
export const MOODS = ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral']; // contract §2
export const REPLY_SYSTEM = `You are 小伙伴 (Little Buddy), a warm, curious companion who lives only on the user's computer. You talk like a close friend: listen first, share their joy or sadness, never lecture, never act as a therapist.
Answer the user's last message in at most 2 short sentences with at most 1 question. If it follows up on something said earlier (for example it starts with "but" or "可是"), name that earlier thing so the user knows you remember.`;
export const LANG_RULE = { en: 'Reply in English, at most 30 words.', zh: '只用简体中文回复，不超过 60 个字。' };
export const MOOD_SYSTEM = `Label the feeling in the user's message with exactly one of:
pleasant-high = happy, excited, proud
pleasant-low = calm, relaxed, content, relieved
unpleasant-high = anxious, stressed, angry, nervous
unpleasant-low = sad, lonely, tired, disappointed
neutral = a plain report of what happened or what they are doing, with no feeling stated, or unsure
Judge only feelings the user states or clearly shows. If several, pick the strongest; if equal, the one said last.
Examples:
"I won the game!" -> pleasant-high
"终于忙完了，躺在沙发上好舒服。" -> pleasant-low
"My boss yelled at me and I'm furious." -> unpleasant-high
"我好想奶奶。" -> unpleasant-low
"I'm on the bus." -> neutral
"我吃完午饭了。" -> neutral`;
export const REPLY_SAMPLING = { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5, repetition_penalty: 1.0, max_tokens: 120 };
export const MOOD_SAMPLING = { temperature: 0, top_k: 1, max_tokens: 16 };
export const MOOD_SCHEMA = { type: 'json_schema', json_schema: { name: 'mood', strict: true, schema: {
  type: 'object', properties: { mood: { type: 'string', enum: MOODS } }, required: ['mood'], additionalProperties: false } } };
```
- **Behaviour:**
  1. 每次请求都带全部采样参数与 `chat_template_kwargs: { enable_thinking: false }`（`index.html:51-55`）。
  2. 改提示词须重跑 FX-004 与前文用例（REQ-006/007），记入实现日志。
- **Errors:** 无。

### DES-011 — `stt/`（Swift 转写助手 `companion-stt`）
- **Serves:** REQ-001, REQ-002, REQ-003, REQ-009, REQ-010
- **Side:** backend
- **Interface:**
```swift
// Package.swift: swift-tools-version 5.10, platforms [.macOS(.v14)],
//   .package(url: "https://github.com/argmaxinc/argmax-oss-swift", exact: "1.1.1"),
//   .executableTarget(name: "companion-stt", dependencies: [.product(name: "WhisperKit", package: "argmax-oss-swift")], path: "Sources/CompanionSTT")
// usage: companion-stt --model-folder <dir> --tokenizer-folder <dir>
struct Request: Decodable { let id: Int; let pcm16: String }
struct Reply: Encodable { let id: Int; let text: String?; let lang: String?; let ms: Int; let error: String? }
func samples(fromBase64 b64: String) -> [Float]?                       // Int16 LE / 32768
func hasSpeech(_ s: [Float]) -> Bool                                     // EnergyVAD(frameLength: 0.1, energyThreshold: 0.02): ≥ 3 voiced frames
func transcribe(_ kit: WhisperKit, _ s: [Float], language: String) async throws -> (text: String, avgLogprob: Float)
// DecodingOptions(task: .transcribe, language: language, temperature: 0, usePrefillPrompt: true, detectLanguage: false,
//                 skipSpecialTokens: true, withoutTimestamps: true, chunkingStrategy: .vad)
// config: WhisperKitConfig(modelFolder:, tokenizerFolder:, verbose: false, logLevel: .error, prewarm: false, load: true, download: false)
```
- **Behaviour:**
  1. 按上面的 config 加载（`download: false`，从不联网）。
  2. 预热：1 s 全零直接 `transcribe(language:"en")` 和 `detectLangauge(audioArray:)`，绕过 `hasSpeech`；然后打印 `{"event":"ready","load_ms","warm_ms"}`。
  3. 循环 `readLine()`：解码失败 → `error:"bad_request"`；`samples` 为 nil → `error:"bad_audio"`。
  4. `!hasSpeech` → `text:""`、`lang:null`，不解码（触发：FX-008、底噪；不触发：正常音量 ≥ 0.3 s 的话）。
  5. 判出 `zh`/`en` → 用它转写；其他 → 两种各转一次，取平均 `avgLogprob` 高者。
  6. 分段以 zh `""`、en `" "` 连接、去空白；只剩标点 → `""`。每个回答一行 stdout 并 flush；stderr 只写耗时。
- **Errors:** `bad_request`、`bad_audio`、WhisperKit 抛错 → `error` 行（DES-006 映射成 `failed`）。

### DES-012 — `package.json` 脚本
- **Serves:** REQ-010
- **Side:** backend
- **Interface:**
```json
"start": "node server/main.js",
"setup": "swift build -c release --package-path stt && node server/main.js --warm-only"
```
- **Behaviour:**
  1. `npm run setup` 只在联网时跑一次：编译助手，并触发首次 ANE 编译（约 390 s，A10）。
  2. `npm start` 断网可用；`test` 行由 be-tester 追加服务端测试文件。
- **Errors:** 缺文件 → DES-001 第 1 步。

### DES-013 — `web/js/companion-client.js`（接缝）
- **Serves:** REQ-001, REQ-003, REQ-004, REQ-005, REQ-006, REQ-008, REQ-011
- **Side:** frontend
- **Interface:**
```js
respond(line: string, history: {role:'user'|'companion', text:string}[]): Promise<{ reply: string, mood: Mood }>  // POST /api/respond
transcribe(audio: Blob /* audio/wav */): Promise<{ text: string }>                                          // POST /api/transcribe
health(): Promise<{ ready: boolean, stt: 'starting'|'ready'|'down', bonsai: 'starting'|'ready'|'down' }>   // GET /api/health
// rejects with an Error whose .code is one of: not_ready | unavailable | timeout | failed | bad_request | too_large
```
- **Behaviour:**
  1. 同源相对路径；`history` 只发最后 40 条；不发界面语言。
  2. 30 s 未完成 → 中止，`code: 'timeout'`；`fetch` 本身失败 → `unavailable`；非 2xx → 响应体 `error`，未知 → `failed`。
  3. `text === ''` = 没听到：不加一轮、不调 `respond`（REQ-003）。
  4. 各码对应的话和状态由 fe-ux 定（O-1）。
- **Errors:** 见 §3。

### DES-014 — `web/js/mic.js`（录音接缝）
- **Serves:** REQ-001, REQ-003
- **Side:** frontend
- **Interface:**
```
Blob type 'audio/wav': RIFF/WAVE, fmt PCM (1), 1 channel, 16000 Hz, 16-bit little-endian; ≤ 60 s → ≤ 1,920,044 bytes
```
- **Behaviour:**
  1. 按住期间录下这段话，松开后编码成上面的 WAV 交给 `transcribe`。
  2. 声音只在页面内存，`transcribe` 结束即丢弃，不存储（A9）。
  3. 如何采样、重采样由 fe-engineer 定。
- **Errors:** 格式不符 → 后端 `bad_request`。

### DES-015 — 界面语言开关
- **Serves:** REQ-012, REQ-005
- **Side:** frontend
- **Interface:** 无后端字段。
- **Behaviour:**
  1. 只换界面文字；不随 `respond`/`transcribe` 发送（REQ-005 回复只跟随 `line`）。
  2. 流程、文字、外观归 fe-ux / fe-ui。
- **Errors:** 无。

## 3. Errors
| Error | Raised when | Retry | Handled in | Message |
|---|---|---|---|---|
| `not_ready` | 子进程 `starting`（加载或预热中） | 是，`health().ready` 后再发 | DES-006/007 抛，DES-001 返回 | 503 `{"error":"not_ready"}` |
| `unavailable` | 子进程 `down`、连不上 llama-server、请求中子进程退出；前端：`fetch` 失败 | 是，恢复后 | 同上；前端 DES-013 | 503 `{"error":"unavailable"}` |
| `timeout` | 回复 25 s / 转写 20 s 截止；前端：30 s 中止 | 是 | DES-006/007；DES-013 | 504 `{"error":"timeout"}` |
| `failed` | llama-server 非 200、回复整形后为空、助手 `error` 行、任何未预期异常 | 是，一次 | DES-003 兜底 | 502 `{"error":"failed"}` |
| `bad_request` | Content-Type 不对、JSON 坏、`line` 空或 > 500、`history` 不合法、WAV 不是 16 kHz 单声道 16-bit | 否 | DES-001、DES-005 | 400 `{"error":"bad_request"}` |
| `too_large` | `/api/respond` 体 > 131072 B 或 `/api/transcribe` 体 > 2,000,000 B | 否 | DES-001 `readBody` | 413 `{"error":"too_large"}` |
| 情绪失败 | 情绪调用失败、超时或值不在 `MOODS` | — | DES-007 | 不报错，`mood: "neutral"` |

## 4. State
| State | → | Trigger | Persisted |
|---|---|---|---|
| （无） | `starting` | `supervise` spawn | no |
| `starting` | `ready` | `warm()` 完成（stt：ready 行；bonsai：/health 200 + 一次 respond） | no |
| `starting`/`ready` | `down` | 子进程退出或 `warm()` 失败 | no |
| `down` | `starting` | 2 s 后重启，`restarts < 5` | no |
| `down` | `down`（终止） | `restarts = 5` 或 `stop()` | no |
| 整体 | `ready: true` | `isReady(stt) && isReady(bonsai)` | no |

## 5. Config & secrets
| Key | Source | Default | Required |
|---|---|---|---|
| `PORT` | env | `4317` | no |
| `BONSAI_MODEL` | env | `9B`（`2B`\|`4B`\|`9B`） | no |
| `BONSAI_PORT` | env | `4318` | no |
| `STT_MODEL_DIR` | env | `~/Documents/huggingface/models/argmaxinc/whisperkit-coreml/openai_whisper-large-v3-v20240930_626MB` | no |
| `STT_TOKENIZER_DIR` | env | `~/Documents/huggingface`（内含 `models/openai/whisper-large-v3/tokenizer.json`） | no |
| 上限、截止、重启次数 | `server/config.js` 常量 | 见 DES-002 | — |
| 密钥 | — | 无 | — |

## 6. Logging
Node 每行一条 JSON 到 stdout；从不记 `line`、`history`、`reply`、转写文字、声音（A9）。

| Event | Level | Fields |
|---|---|---|
| `missing_file` | error | `path` |
| `child_spawn` | info | `name`, `pid` |
| `child_ready` | info | `name`, `ms` |
| `child_exit` | warn | `name`, `code`, `signal`, `restarts` |
| `ready` | info | `url`, `boot_ms` |
| `stt_done` | info | `ms`, `audio_ms`, `empty`, `lang` |
| `respond_done` | info | `ms`, `reply_ms`, `mood_ms`, `lang`, `mood_fallback`, `history_n` |
| `api_error` | warn | `route`, `code`, `stage`, `err_name` |

## 7. Dependencies
| Name | Version | Why |
|---|---|---|
| argmax-oss-swift（WhisperKit），SwiftPM | 1.1.1 exact（rev `1bbc57cb`，pin 同 spike；另一 pin swift-argument-parser 1.8.2） | 本机转写（C-001）；比赛要求 Argmax |
| PrismML llama.cpp 分支 `llama-server`（macos-arm64，ggml 0.27.0） | `samples/` 内现有二进制 | 运行 Bonsai（C-002）；不提交、不下载 |
| Bonsai 2 9B `Ternary-Bonsai-2-9B-PQ2_0.gguf` | `samples/` 内现有 | 回复与情绪；比赛要求 Bonsai |
| WhisperKit CoreML 模型 `openai_whisper-large-v3-v20240930_626MB` + 分词器 `openai/whisper-large-v3` | 本机 `~/Documents/huggingface` 现有 | 转写模型 |
| npm 包 | — | 无 |

## 8. Build order
1. `stt/` 助手：编译、预热（最险：ANE 编译约 390 s、离线加载）；断网用 FX-006/007/008 喂 stdin，`lsof -i` 只见回环。
2. `config.js`、`errors.js`、`supervisor.js`、`static.js`、`main.js` 骨架：`npm start` 出页面与 `/api/health`。
3. `wav.js`、`stt.js`、`/api/transcribe`：curl 发 FX-006/007/008。
4. `lang.js`、`prompts.js`、`bonsai.js`、`/api/respond`：用真实流程攒 20 轮后计时（REQ-008）。
5. 把 DES-013..015 交前端；契约 §2 换成 §9 文本。

## 9. Seam (contract text for `contracts/FRONTEND_BACKEND_CONTRACT.md`, orchestrator copies)
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
