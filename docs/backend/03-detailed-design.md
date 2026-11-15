# Detailed design — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文

- Author: be-architect #1 (Phase 2, same dispatch as `02-architecture.md`) · Input: `01-requirements.md`, `02-architecture.md` · 2026-11-14
  - revised be-architect #2（round 2：上限、截止、截断、简体）
  - amended be-architect #3（step 4：DES-001 缺文件提示、DES-002/007 前文权重预算、DES-009 多数规则）
  - revised #4（step 5：RECALL、§6）
  - amended #5（step 6：FND-002 噪声判空、FND-003 llama-server 关 CORS 加一次性密钥、FND-004 子进程停掉时的终端行、FND-005 bonsaiBootMs）
- 代码 ESM JavaScript（Node ≥ 18，本机 v24.13.0，无 npm 依赖）+ Swift 5.10 包。文档中文，代码与标识符英文。
- 证据：`docs/backend/logs/be-architect-1-bench.log`、`docs/backend/logs/be-architect-1-stt-check.log`、`docs/backend/logs/be-architect-2-stt60.log`、`docs/backend/logs/be-architect-3-window.log`、`docs/backend/logs/be-architect-5-fixes.log`。

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

Step 6 round 1（be-architect #5）要改的文件（无新依赖：`node:crypto`、`node:readline` 为内置；`server/main.js` 不改）：

| Path | Change |
|---|---|
| `server/supervisor.js` | DES-004 第 6、7 步，`env`、`causeOf` |
| `server/bonsai.js` | DES-007 参数、密钥、stdio |
| `server/config.js` | DES-002 `bonsaiBootMs` |
| `stt/Sources/CompanionSTT/main.swift` | DES-011 `fellBack`、`isNoise`、6a；改后 `swift build -c release --package-path stt` |

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
// parseTurn: line trimmed 1–1500 chars (JS .length); history array of { role: 'user'|'companion', text: 1–1500 chars }; keep the last 40
// routes: GET /api/health | POST /api/respond (application/json, ≤ 262144 B) | POST /api/transcribe (audio/wav, ≤ 2,000,000 B)
```
- **Behaviour:**
  1. `missingFiles()` 非空 → 每个缺失路径一行，再打印 `missingHints(missing)` 的每一行，退出 1。
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
  limits: { lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudget: 2000, jsonBytes: 262144, wavBytes: 2000000 },
  // historyBudget: weight units for windowOf (DES-007), sized by cold latency (be-architect-3-window.log), replaces historyBudgetChars 6000
  deadlines: { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 300000 },  // 12 s + 15 s < 30 s (A11)
  // bonsaiBootMs (FND-005): a failure detector, not a target. 4B cold load measured 62.6 s (contended); 9B gguf is 2.11× the bytes
  //   -> ~132 s estimated (unmeasured), × 2 margin -> 300000. REQ-010's 120 s is the warm-cache target, unchanged (be-architect-5-fixes.log)
  restarts: { max: 5, delayMs: 2000 },
}
export function bonsaiFiles(cfg = CONFIG): { bin: string, model: string } // bin/macos-arm64/llama-server, models/Ternary-Bonsai-2-<size>-PQ2_0.gguf
export function missingFiles(cfg = CONFIG): string[]
export function missingHints(missing: string[], cfg = CONFIG): string[]
// one line per kind present, in this order, each zh + en, printed by main.js to stderr:
//   cfg.stt.bin missing             -> '联网时运行一次 Run once while online: npm run setup'
//   bonsaiFiles(cfg).bin or .model  -> 'Bonsai 文件不在：放回比赛提供的 samples/bonsai-models/，或把 BONSAI_MODEL 设为已有的大小 Bonsai file missing: restore samples/bonsai-models/ from the hackathon kit, or set BONSAI_MODEL to a size you have'
//   any other path (WhisperKit model files, tokenizer.json)
//                                   -> 'WhisperKit 模型不在：把已下载的模型放到上面的路径，或设 STT_MODEL_DIR / STT_TOKENIZER_DIR（setup 不下载模型） WhisperKit model missing: put the downloaded model at the path above, or set STT_MODEL_DIR / STT_TOKENIZER_DIR (setup does not download models)'
// fires: BONSAI_MODEL=2B without its gguf -> only the Bonsai line; all three kinds -> 3 lines; not: [] -> []
```
- **Behaviour:**
  1. `<repo>` = `server/` 的上一级（`import.meta.url`），不写死个人路径；家目录用 `os.homedir()`。
  2. `missingFiles` 检查：llama-server、gguf、`stt.bin`、`modelDir` 下 `AudioEncoder.mlmodelc`/`TextDecoder.mlmodelc`/`MelSpectrogram.mlmodelc`、`tokenizerDir/models/openai/whisper-large-v3/tokenizer.json`。
  3. 只读环境变量，从不下载。
  4. `missingHints` 只按路径归类，不查文件系统。
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
  stdio: ['pipe'|'ignore', 'pipe'|'ignore', 'inherit'|'pipe'],   // 'pipe' on stderr = keep a tail (step 6); 'ignore' no longer used
  warm: (child: ChildProcess) => Promise<void>,          // resolves when usable
  onExit?: () => void,                                    // owner rejects its in-flight work
  env?: NodeJS.ProcessEnv,                                // passed to spawn as-is; default process.env (FND-003)
}): { readonly state: ChildState, readonly pid: number | null, readonly child: ChildProcess | null, stop(): void }
const TAIL_LINES = 20;
function causeOf(tail: string[], warmErr: Error | null, code: number | null, signal: string | null): string
// first tail line matching /error|failed|couldn't|cannot/i, else warmErr.message, else `code ${code}, signal ${signal}`;
// strip a leading llama timestamp /^\d+\.\d+\.\d+\.\d+\s+/, cut to 200 chars
//   fires: ['0.00.035.634 E srv  start: couldn't bind HTTP server socket, hostname: 127.0.0.1, port: 4462', '… I srv operator(): cleaning up', '… E srv server_run_i: exiting due to HTTP server error']
//          -> "E srv  start: couldn't bind HTTP server socket, hostname: 127.0.0.1, port: 4462" (first match, the specific one)
//          [] + Error('llama-server health exceeded bonsaiBootMs') -> 'llama-server health exceeded bonsaiBootMs'
//   not:   ['… W srv server_setup: security: …', '… I srv load_model: loading model …'] + null, code 1 -> 'code 1, signal null'
```
- **Behaviour:**
  1. `spawn` → `starting`，记 `child_spawn {name,pid}`。
  2. `warm` 成功 → `ready`，记 `child_ready {name,ms}`；失败 → 杀掉该子进程，走第 3 步。
  3. 子进程退出 → `down`，调 `onExit`，记 `child_exit {name,code,signal,restarts}`。
  4. 不是 `stop()` 引起且 `restarts < 5` → 2 s 后重新 `spawn`（`restarts++`）；否则保持 `down`。
  5. `stop()` 只给自己 spawn 的 pid 发 `SIGTERM`。
  6. （FND-004）stderr tail：见下方代码块第 6 步。
  7. （FND-004）终端行与 `child_gave_up`：见下方代码块第 7 步。
```text
6. stdio[2] === 'pipe'：每次 spawn 清空 tail，readline 读 child.stderr，只留最后 TAIL_LINES 行，只在内存
   （持续读，管道不会写满卡住子进程；平时不打印）。warm 失败时记下该 err（每次 spawn 清空）。
7. 退出不是 stop() 引起 → 在 child_exit 之后往 stderr 写一行（process.stderr.write），<cause> = causeOf(tail, warmErr, code, signal)：
   - 还会重启：<name> 已退出 exited: <cause> — 2 秒后重启 restarting in 2 s (<restarts after ++>/5)
   - 已到上限：<name> 已停止 gave up after 5 restarts: <cause> — 修好上面的原因后重新运行 npm start  Fix the cause above, then run npm start again
   同时记 §6 child_gave_up {name, restarts}（只在到上限时，一次）。
   行里只有子进程自己的错误行；不经 log()，所以 stdout JSON 日志里没有原因文字（可能含路径）。
```
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
  4. 递增 `id`（本进程内计数，不持久），写 `{"id","pcm16": base64}\n`，登记待答与 `transcribeMs`（12 s）计时器。
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
export function windowOf(history: HistoryEntry[], cfg = CONFIG): HistoryEntry[]
// windowOf: last 40, then drop the oldest until Σ weight(text) ≤ historyBudget (2000); may return [] (one entry heavier than 2000)
//   weight(t) = t.length + 1.5 * hanCount(t)   (DES-009): Han counts 2.5, everything else 1, ≈ 4 × tokens
//   (measured: en 3.9-4.1 chars/token, zh text 1.5 chars/token, be-architect-3-window.log)
//   fires: 40 × 'x'.repeat(200) -> newest 10; 21 × '好'.repeat(40) (weight 100 each) -> newest 20
//   not: 10 × 'x'.repeat(200) (= 2000) stays 10; the measured 20-turn English chat (1271-1466 chars) stays whole
//   why 2000: cold reply+mood at the budget 6.7-7.1 s zh, 6.5-7.0 s en (n=4 each) + transcribe ~1.4 s ≤ 10 s (REQ-008);
//             6000 chars gave 14.3 s / 504 / 504; prefill ≈ 130 tokens/s is the cost, not generation
//   bound: system ~140 + history ≤ ~600 + line ≤ 1500 chars (≤ ~1000 tokens) ≪ 16384 per slot (-c 32768 / -np 2)
// llama-server args: ['-m',model,'-ngl','99','-fa','on','-c','32768','-np','2','--host','127.0.0.1','--port',BONSAI_PORT,'--no-webui',
//                     '--cors-origins','none','--no-cors-credentials','--no-slots']                       (FND-003)
//   every flag is in this binary's --help (lines 532-546, 637); 'none' is echoed as Access-Control-Allow-Origin: none, which no page
//   origin (scheme://host[:port] or 'null') equals, so no browser may read a response; not 'null' (sandboxed/file pages send Origin: null)
// const apiKey = randomBytes(24).toString('hex')   // node:crypto, once per createBonsai(); never logged, printed, stored or configurable
//   spawn env: { ...process.env, LLAMA_API_KEY: apiKey }  (env, not --api-key, so it is not in `ps` argv)
//   post(): headers { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }; warm's GET /health sends no key (public)
//   why the key: CORS alone still lets a page fire a text/plain POST /v1/chat/completions (no preflight) and burn a slot — measured 200;
//   with the key: that POST 401, GET /props 401, GET /health 200, gateway POST with Bearer 200 (be-architect-5-fixes.log, FND-003 section)
// stdio: ['ignore', 'ignore', 'pipe']   // llama-server logs only on stderr (bad model: stdout 0 lines, stderr 15); supervisor keeps the tail (DES-004 step 6)
// warm: respond('Hello', []) sends the reply AND the mood call, so REPLY_SYSTEM and MOOD_SYSTEM are both prefix-cached;
//       LANG_RULE is the system message's last line, so a zh turn re-processes only LANG_RULE.zh
```
- **Behaviour:**
  1. `supervise('bonsai', bin, 上面的参数, stdio ['ignore','ignore','pipe'], env 带 LLAMA_API_KEY)`；`warm` = 每 500 ms 查 `/health` 到 200（≤ `bonsaiBootMs` 300 s），再跑一次 `respond('Hello', [])`（终端行见 DES-004）。
  2. `respond`：状态映射同 DES-006；`lang = languageOf(line)`；`win = windowOf(history)`。
  3. 同一 `AbortSignal.timeout(respondMs)`（15 s）下并行：回复调用（`toMessages`，`REPLY_SAMPLING`，`enable_thinking:false`）与情绪调用（`MOOD_SYSTEM` + 只这句话，`MOOD_SAMPLING`，`response_format` = `MOOD_SCHEMA`）。
  4. 回复调用：超时 → `timeout`；连不上 → `unavailable`；非 200 → `failed`；`shapeReply` 为空 → `failed`。
  5. 情绪：解析出的值在 `MOODS` 中才用，其余（失败、超时、不在集合）→ `neutral`。
  6. 记 `respond_done {ms, reply_ms, mood_ms, lang, mood_fallback, history_n}`。
- **Errors:** `not_ready`、`unavailable`、`timeout`、`failed`

### DES-008 — `server/bonsai.js` 的 `shapeReply` 与 `toMessages`
- **Serves:** REQ-004, REQ-005, REQ-007
- **Side:** backend
- **Interface:** 见 DES-007；`toMessages` 的消息（round 4 加 RECALL）：
```js
// prev = text of the newest role 'user' entry in win, or undefined
[{ role: 'system', content: REPLY_SYSTEM + '\n' + LANG_RULE[lang] },
 ...win.map(h => ({ role: h.role === 'companion' ? 'assistant' : 'user', content: h.text })),
 { role: 'user', content: prev === undefined ? line : `${line}\n${RECALL[lang](prev)}` }]
// fires: FX-002 -> "But I'll … lonely about it.\n(Connect your reply to what I told you before: \"I just got the internship!\")"
// not:   history [] (FX-001, FX-004) or only companion entries -> content = line
// RECALL text is never stored, logged or counted by windowOf; the page's history keeps only line
// bound: prev ≤ 1500 chars, so the last message ≤ ~3100 chars ≪ 16384 tokens per slot
```
- **Behaviour:**
  1. `toMessages` 如上；RECALL 在最后一条 user 里，前缀缓存不变。
  2. `shapeReply` 去掉 `<think>…</think>`（含未闭合到结尾）、首尾空白和包裹引号。
  3. 在 `。！？!?.…` 连续标点后切句，标点和紧随的 emoji 留在前一句。
  4. 依次保留，至多 2 句；已有一个问句时跳过含 `?`/`？` 的句子。
  5. zh 用 `''`、en 用 `' '` 连接；仍超上限（zh > 120 码点，en > 40 空白分隔词）→ 只留第一句。
  6. 再超 → zh 前 119 码点加 `…`；en 前 40 词加紧贴的 `…`（仍 ≤ 120 / ≤ 40）。
  7. 触发：3 句 → 2 句；"A? B?" → "A?"；不触发："That is amazing news! Congratulations!"。
- **Errors:** 返回 `''` 由 DES-007 变 `failed`。

### DES-009 — `server/lang.js`
- **Serves:** REQ-005
- **Side:** backend
- **Interface:**
```js
export function languageOf(text: string): 'zh' | 'en'
export function hanCount(text: string): number   // (text.match(/\p{Script=Han}/gu) || []).length; also used by windowOf (DES-007)
```
- **Behaviour:**
  1. `han` = `hanCount(line)`；中文词数 `zhWords = Math.ceil(han / 2)`（中文词平均约两字）；`words` = `/[A-Za-z]+/g` 个数。
  2. `han > 0 && zhWords >= words` → `zh`（平局 zh）；否则 `words > 0` → `en`；两者皆 0（只有 emoji、数字）→ `zh`。
  3. 例（zhWords:words）："我今天很happy" → zh（2:1）；"I love 火锅" → en（1:2）；"嗯 ok" → zh（1:1）；"I feel 难过 today" → en（1:3）。
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
// round 4 (be-architect #4, be-architect-4-context.log): appended to the last user message by toMessages (DES-008)
export const RECALL = {
  en: (earlier) => `(Connect your reply to what I told you before: "${earlier}")`,
  zh: (earlier) => `（回复时接上我前面说的：「${earlier}」）`,
};
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
  2. 改提示词或 `RECALL` 须重跑 FX-004 与前文用例（REQ-006/007），记入实现日志。
  3. `RECALL` 的键是这句话的语言（`languageOf(line)`），不是前一句的语言。
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
func transcribe(_ kit: WhisperKit, _ s: [Float], language: String) async throws -> (text: String, avgLogprob: Float, fellBack: Bool)
//   fellBack = !segments.isEmpty && segments.allSatisfy { $0.temperature > 0 }   (WhisperKit rejected the temperature-0 decode:
//   logProbThreshold -1.0 / compressionRatioThreshold 2.4 defaults, Configurations.swift:196-215, and sampled a fallback)
func isNoise(langLogprob: Float, fellBack: Bool) -> Bool   // langLogprob < -0.5 && fellBack   (FND-002)
//   langLogprob = det.langProbs[det.language] ?? 0, det = kit.detectLangauge(audioArray:) (already called in step 5)
//   measured (be-architect-5-fixes.log): noise 25/25 calls det -1.306..-0.954 and every segment temperature 0.2..1.0
//     (white 0.03/0.06/0.12, hum, clicks; 12/25 of them return Okay./Okay/so/you today);
//   speech: every call det -0.165..-0.0001 and temperature 0.0 (FX-005/006/007 ×5, quiet-0.1 at RMS 0.017, short zh, 60 s clips)
//   fires: white-0.03 (det -1.18, T 0.4, "Okay.") -> ""; hum (det -0.95, T 0.4, "Okay.") -> ""
//   not:   FX-007 (det -0.002, T 0.0); short-1 "好远呀" (det -0.165, T 0.0); a sure language with a fallback decode (det -0.1, T 0.4) stays
//   both signals must agree: each alone separates the measured sets, AND keeps a real but hard utterance (one signal off) transcribed
func simplified(_ s: String) -> String   // s.applyingTransform(StringTransform("Hant-Hans"), reverse: false) ?? s  (Foundation, ICU)
//   fires: 有點難過 -> 有点难过 (be-architect-2-stt60.log); not: Simplified or Latin text unchanged
// DecodingOptions(task: .transcribe, language: language, temperature: 0, usePrefillPrompt: true, detectLanguage: false,
//                 skipSpecialTokens: true, withoutTimestamps: true, chunkingStrategy: .vad)
// config: WhisperKitConfig(modelFolder:, tokenizerFolder:, verbose: false, logLevel: .error, prewarm: false, load: true, download: false)
```
- **Behaviour:**
  1. 按上面的 config 加载（`download: false`，从不联网）。
  2. 预热：1 s 全零直接 `transcribe(language:"en")` 与 `detectLangauge(audioArray:)`，绕过 `hasSpeech`；再打印 `{"event":"ready","load_ms","warm_ms"}`。
  3. 循环 `readLine()`：解码失败 → `error:"bad_request"`；`samples` 为 nil → `error:"bad_audio"`。
  4. `!hasSpeech` → `text:""`、`lang:null`，不解码（何时触发见下方代码块）。
  5. 判出 `zh`/`en` → 用它转写；其他 → 两种各转一次，取平均 `avgLogprob` 高者。
  6. 分段以 zh `""`、en `" "` 连接、去空白；zh 再过 `simplified`；只剩标点 → `""`。
  6a. （FND-002）噪声判空（见下方代码块）。
```text
4.  !hasSpeech 触发：FX-008、RMS ≤ 0.02 的底噪；不触发：正常音量 ≥ 0.3 s 的话；更响的噪声由 6a 判空。
6a. 用被采用的那次转写（第 5 步：判出 zh/en 的那次，或两次中 avgLogprob 高者）：
    isNoise(langLogprob, fellBack) → text:""、lang:null（与第 4 步同形，DES-006 照常记 stt_done empty:true）。
    不另加日志（stderr 只写耗时）。
```
  7. 每个回答一行 stdout 并 flush；stderr 只写耗时。
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
  2. `transcribe` 13 s、`respond` 16 s 未完成 → 中止，`code: 'timeout'`（语音一轮最坏 29 s ≤ 30 s，A11）；`fetch` 失败 → `unavailable`；非 2xx → 响应体 `error`，未知 → `failed`。
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
| `timeout` | 回复 15 s / 转写 12 s 截止；前端：16 s / 13 s 中止 | 是 | DES-006/007；DES-013 | 504 `{"error":"timeout"}` |
| `failed` | llama-server 非 200、回复整形后为空、助手 `error` 行、任何未预期异常 | 是，一次 | DES-003 兜底 | 502 `{"error":"failed"}` |
| `bad_request` | Content-Type 不对、JSON 坏、`line` 空或 > 1500、`history` 不合法、WAV 不是 16 kHz 单声道 16-bit | 否 | DES-001、DES-005 | 400 `{"error":"bad_request"}` |
| `too_large` | `/api/respond` 体 > 262144 B 或 `/api/transcribe` 体 > 2,000,000 B | 否 | DES-001 `readBody` | 413 `{"error":"too_large"}` |
| 情绪失败 | 情绪调用失败、超时或值不在 `MOODS` | — | DES-007 | 不报错，`mood: "neutral"` |

## 4. State
| State | → | Trigger | Persisted |
|---|---|---|---|
| （无） | `starting` | `supervise` spawn | no |
| `starting` | `ready` | `warm()` 完成（stt：ready 行；bonsai：/health 200 + 一次 respond） | no |
| `starting`/`ready` | `down` | 子进程退出或 `warm()` 失败 | no |
| `down` | `starting` | 2 s 后重启，`restarts < 5` | no |
| `down` | `down`（终止） | `restarts = 5`（stderr 一行"已停止 gave up"+ `child_gave_up`，DES-004 第 7 步）或 `stop()`（不打印） | no |
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
| 密钥 | — | 无用户密钥 | — |
| llama-server API key | `server/bonsai.js` 每次启动 `randomBytes(24)` 生成，经子进程 env `LLAMA_API_KEY` 传入 | 无（不可配置、不落盘、不打印、不记日志） | — |

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
| `stt_warm` | info | `load_ms`, `warm_ms` |
| `stt_error` | warn | `error`（`bad_request` \| `bad_audio` \| `whisperkit`） |
| `stt_bad_line` | warn | `err_name` |
| `stt_stdin_error` | warn | `err_name`, `err_code` |
| `child_error` | error | `name`, `err_name`, `err_code` |
| `child_warm_failed` | error | `name`, `err_name` |
| `static_read_failed` | error | `err_name`, `err_code` |
| `boot_failed` | error | `err_name`, `message` |
| `child_gave_up` | error | `name`, `restarts` |

Round 4（be-architect #4）：
- 表中 `stt_warm`..`boot_failed` 8 行是代码已发的事件（`grep -rn "log('" server/`），补进表而不删代码；字段只有计时、名字与错误名。
- TC-073 的事件白名单（`tests/server-boot.test.js:62`）须与本表 16 个事件一致，由 be-tester 改。
Round 6（be-architect #5）：加 `child_gave_up`（FND-004），表共 17 个事件；TC-073 白名单由 be-tester 同步。

操作员行（stderr，人读，非 JSON；`main.js` 的 `say` 与 `supervisor.js` 写）新增两种，见 DES-004 第 7 步：
| Line | When |
|---|---|
| `<name> 已退出 exited: <cause> — 2 秒后重启 restarting in 2 s (<n>/5)` | 子进程非 `stop()` 退出且还会重启 |
| `<name> 已停止 gave up after 5 restarts: <cause> — 修好上面的原因后重新运行 npm start  Fix the cause above, then run npm start again` | 到重启上限，一次 |

## 7. Dependencies
| Name | Version | Why |
|---|---|---|
| argmax-oss-swift（WhisperKit），SwiftPM | 1.1.1 exact（rev `1bbc57cb`，pin 同 spike；另一 pin swift-argument-parser 1.8.2） | 本机转写（C-001）；比赛要求 Argmax |
| PrismML llama.cpp 分支 `llama-server`（macos-arm64，ggml 0.27.0） | `samples/` 内现有二进制 | 运行 Bonsai（C-002）；不提交、不下载 |
| Bonsai 2 9B `Ternary-Bonsai-2-9B-PQ2_0.gguf` | `samples/` 内现有 | 回复与情绪；比赛要求 Bonsai |
| WhisperKit CoreML 模型 `openai_whisper-large-v3-v20240930_626MB` + 分词器 `openai/whisper-large-v3` | 本机 `~/Documents/huggingface` 现有 | 转写模型 |
| npm 包 | — | 无 |

## 8. Build order
1. `stt/` 助手：编译、预热（最险：ANE 编译约 390 s、离线加载）；断网用 FX-006/007/008 和一段约 60 s 的话喂 stdin（`ms` < 8000），`lsof -i` 只见回环。
2. `config.js`、`errors.js`、`supervisor.js`、`static.js`、`main.js` 骨架：`npm start` 出页面与 `/api/health`。
3. `wav.js`、`stt.js`、`/api/transcribe`：curl 发 FX-006/007/008。
4. `lang.js`、`prompts.js`、`bonsai.js`、`/api/respond`：用真实流程攒 20 轮后计时（REQ-008）。
5. 把 DES-013..015 交前端；契约 §2 换成 §9 文本。

## 9. Seam (contract text for `contracts/FRONTEND_BACKEND_CONTRACT.md`, orchestrator copies)
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
