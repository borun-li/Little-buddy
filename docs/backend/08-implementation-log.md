# Implementation Log — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文

- Author: be-developer #1 (Backend Phase 4, round 1) · 2026-11-14/15 · Input: `03-detailed-design.md` DES-001..DES-012, §3–§9; `02-architecture.md` §3–§5
- Evidence logs: `docs/backend/logs/be-developer-1-*.log` (paths in the logs are written as `<repo>`, `~`, `<scratchpad>`)

## Build steps (03 §8)
| Step | Built | Check | Result | Evidence |
|---|---|---|---|---|
| 1 | `stt/Package.swift`, `stt/Package.resolved` (spike copy, unchanged by the build), `stt/Sources/CompanionSTT/main.swift` | `swift build -c release --package-path stt`; first run of the new binary fed FX-006, FX-007, FX-008, FX-005 and a 58.8 s English clip over stdin; `lsof -a -p <pid> -i` | build pass (50 s); first load 52.9 s + warm 0.7 s (not the ~390 s of A10: the large-v3 CoreML models were already compiled by whisperkit-cli); FX-006 "I just got the internship." 1.3 s; FX-007 "可是婉双和朋友吵架了,有点难过。" 1.5 s; FX-008 "" in 0 ms (energy gate, no decode); FX-005 exact reference text; 58.8 s clip 4.1 s (< 8000 ms); helper has no sockets | `be-developer-1-stt-build.log`, `be-developer-1-stt-warm.log` |
| 2 | `server/config.js`, `server/errors.js`, `server/log.js`, `server/supervisor.js`, `server/static.js`, `server/main.js` | start `PORT=4400 BONSAI_PORT=4401 node server/main.js`; curl page, health, 404/405, traversal | ready in 5.5 s; `/` 200 html, `/js/app.js` 200, `/../package.json` and `/%2e%2e/package.json` 404, `POST /` 405 | `be-developer-1-server-a1.log`, `be-developer-1-api.log` |
| 3 | `server/wav.js`, `server/stt.js`, `/api/transcribe` | curl FX-005..008, each of FX-006/FX-007 3 more times; 24 kHz Float32 original, wrong type, 2,000,001 B | FX-006 3/3 en, FX-007 3/3 zh (Simplified, same text each run), FX-008 `{"text":""}`; 400, 400, 413 | `be-developer-1-api.log` |
| 4 | `server/lang.js`, `server/prompts.js`, `server/bonsai.js`, `/api/respond` | FX-001..003 × 3, FX-004 × 3 rounds, 26-turn real conversation; REQ-008 on an isolated instance; respond error paths; child crash and restart | see "Step 4 measurements" below | `be-developer-1-respond.log`, `be-developer-1-req008.log`, `be-developer-1-api.log` |
| — | `package.json` scripts `setup`, `start` | `BONSAI_PORT=4405 npm run setup` (exit 0, children stopped); `PORT=4406 BONSAI_PORT=4407 npm start` → health, `/`, FX-001, FX-007, then SIGINT (npm, stt, bonsai all gone, port closed) | pass | `be-developer-1-boot.log`, `be-developer-1-npm-start.log` |

### Step 4 measurements (9B, Apple Silicon, 24 GB)
- FX-001 3/3 pleasant-high, FX-002 3/3 unpleasant-low, FX-003 3/3 in the set; every reply ≤ 2 sentences, ≤ 1 question, within length, language matches, no `<think>`.
- FX-004: 9/10 in each of 3 rounds (only FX-004-05 "嗯，刚到家。" → pleasant-low, the known 02 §5 risk); reply language 10/10 each round.
- **20-turn cold-cache risk (02 §5 row 1), isolated instance `PORT=4402 BONSAI_PORT=4403`, no other traffic on either instance during the run (checked in the instance-A log):** after 20 real turns (40 entries, ~1270–1470 chars), the same English voice line (FX-006 → `/api/transcribe` → `/api/respond`) 5 times:
  - page-like flow, history growing so the 40-entry window slides every turn (cold prefix): transcribe 1354–1377 ms, respond 2190 / 5607 / 5408 / 5612 / 5746 ms, total 3551–7100 ms (n=5, mean 6275) — all ≤ 10 s.
  - fixed history (prefix cached): total 2949–3954 ms (n=5).
- Under concurrent load (be-tester's live suite hitting instance A at the same time) the sliding turns 22–26 took 7354–9534 ms respond alone (`be-developer-1-respond.log`, turns 22–26), i.e. ~9–11 s with transcription: contention, not the single-user case.
- **Worst-case window (6000-char budget, cold prefix), 3 runs:** 14341 ms (200), 15007 ms (504 timeout), 15004 ms (504 timeout). See design gap 1.

## Deviations from the detailed design
| # | DES | What the design said | What was built | Why | Approved by |
|---|---|---|---|---|---|
| 1 | DES-001..007 | §1 file list has no logger | `server/log.js` (4 lines): one JSON line per event to stdout, shared by all modules | §6 needs one JSON-line format from 6 modules; one function instead of six copies | be-developer (logged here) |
| 2 | DES-004 | `supervise(opts)` with `name, cmd, args, stdio, warm, onExit` | also accepts `restarts` (default `CONFIG.restarts`); `createStt`/`createBonsai` pass `cfg.restarts`; the returned object also exposes `pid` via the owners (`stt.pid`, `bonsai.pid`) | the owners take `cfg` (DES-006/007 `createX(cfg = CONFIG)`), so the restart policy must follow `cfg` too; pid is printed at start so the operator can tell which processes are ours | be-developer (logged here) |
| 3 | DES-001 | human messages "打印" (no stream named); §6 "Node 每行一条 JSON 到 stdout" | human lines (missing file, port in use, 启动中, 就绪 Ready, warm-up result) go to stderr in zh + en; JSON log lines stay on stdout | keeps stdout pure JSON lines as §6 says while the operator still sees the words | be-developer (logged here) |
| 4 | DES-001 | `main` steps 1–7 | `--warm-only` also exits 1 when either child reaches `down` before both are ready (prints 预热失败 with both states) | otherwise `npm run setup` would wait forever (or restart 5 times) on a helper that cannot start; setup must fail loudly | be-developer (logged here) |
| 5 | DES-001 | step 2 "`/health` 500 ms 内有应答" | any HTTP answer, or a connection accepted but not answered within 500 ms, counts as occupied; only a refused connection counts as free | a slow listener is still a port we cannot bind | be-developer (logged here) |
| 6 | DES-005 | static: 404 for paths outside root | also 404 when the decoded path contains NUL, 400 on malformed percent-encoding | `/%00` reached `statSync` and became 502 `failed` (seen on my instance) | be-developer (logged here) |
| 7 | DES-008 | sentence cut "标点和紧随的 emoji 留在前一句" | closing quotes/brackets (”’"'）)」』) right after the end punctuation also stay with the sentence | otherwise a sentence like `他说"好。"` would start the next sentence with a stray quote | be-developer (logged here) |
| 8 | DES-011 | `Reply` fields `text?`, `lang?` | Swift's synthesized `Encodable` omits nil fields, so "nothing heard" is `{"id","text":"","ms"}` without `lang`; `server/stt.js` reads `msg.lang ?? null` | no behaviour change; noted because 02 §3 writes `"lang":null` | be-developer (logged here) |
| 9 | DES-012 | `package.json` start and setup lines | also replaced the `description` ("P0 prototype, fake data" → gateway + helper + Bonsai) | the old text became false with this change | be-developer (logged here) |

## Design gaps found
| # | DES / REQ | Gap | How it was resolved (architect amendment / assumption made) |
|---|---|---|---|
| 1 | DES-007 `windowOf`, DES-002 `historyBudgetChars: 6000`; REQ-011, REQ-004 | A cold request at the 6000-char budget takes 14.3 s or hits the 15 s deadline (2/3 runs 504) on 9B. The design bounded the window by context size (8k < 16384 tokens), not by latency. A user reaches it with long turns (e.g. a few 60 s voice turns of ~1000 chars each). REQ-008 (≤ 20 turns of normal chat, ~1300–1500 chars) is met. | Resolved by be-architect #3 (03 DES-002/007: weighted budget 2000); built in round 3. |
| 2 | DES-009 | Rule vs example contradict: rule "`han > 0 && han >= words` → zh" with words = `/[A-Za-z]+/g` gives "I love 火锅" = 2 Han : 2 words → **zh**; the example says "I love 火锅 → en（3:2）". | Resolved by be-architect #3 (03 DES-009: ceil(han/2), "I love 火锅" → en); built in round 3. |
| 3 | DES-001 step 1 | The missing-file hint is always "联网时运行一次 `npm run setup`", but setup only builds `stt/` and warms; it cannot supply a missing gguf (e.g. `BONSAI_MODEL=2B`, not in `samples/`) or WhisperKit model folder. | Resolved by be-architect #3 (03 DES-002 `missingHints`); built in round 3. |

## Fix rounds
### Round 2 — trigger: gate p4 CTX.codemap
| Item | Action | Result |
|---|---|---|
| CTX.codemap | `docs/codemap.md` line 46: backticks dropped around the process name companion-stt (read as a path) | gatelib parser replayed: 0 missing paths |

### Round 3 — trigger: be-architect #3 amendment of 03 (design gaps 1–3), user approved round 3 (2026-11-15)
| Item | Action | Result |
|---|---|---|
| Gap 1 · DES-002/007 | `server/config.js` limits `historyBudget: 2000` replaces `historyBudgetChars: 6000`; `server/bonsai.js` windowOf drops the oldest until Σ weight ≤ 2000, weight = length + 1.5 × hanCount | design examples: 40 × 200 'x' → 10; 10 × 200 'x' → 10; 21 × '好'×40 → 20; 5 × 1500 → 1; one 2001-char entry → [] (node eval, `be-developer-1-round3.log`). Cold 20-turn (40 entries, unique prefix) on restarted instance A: en 4362 ms, zh 5485 ms, both history_n 40, status 200 (`be-developer-1-round3.log`) |
| Gap 2 · DES-009 | `server/lang.js` exports `hanCount`; zh when han > 0 and ceil(han/2) ≥ English words (tie → zh) | 我今天很happy → zh, I love 火锅 → en, 嗯 ok → zh, I feel 难过 today → en, emoji/digits only → zh; `tests/server-unit.test.js` 22/22 pass (be-tester's file, run read-only) |
| Gap 3 · DES-001/002 | `server/config.js` `missingHints(missing, cfg)` (by path only, order setup → Bonsai → WhisperKit, zh + en); `server/main.js` prints each missing path then each hint | `BONSAI_MODEL=2B` → only the Bonsai line; plus `STT_MODEL_DIR=/nonexistent` → Bonsai + WhisperKit lines; [] → [] (`be-developer-1-round3.log`) |

### Round 4 (step 5, be-developer #2) — trigger: TC-081 fail, be-architect #4 revision of DES-008/DES-010
| Item | Action | Result |
|---|---|---|
| TC-081 · DES-010 | `server/prompts.js` exports `RECALL {en, zh}`, text verbatim from 03 DES-010 | `node --check` on every `server/*.js` passes |
| TC-081 · DES-008 | `server/bonsai.js` toMessages: prev = text of the newest `role: 'user'` entry of the window (`findLast`); last message = `line` when prev is undefined, else ``${line}\n${RECALL[lang](prev)}``. `chat` still passes the windowOf result, so the reminder is never stored, logged or counted; `history_n` unchanged | node eval: FX-002 last content = line + `\n(Connect your reply to what I told you before: "I just got the internship!")`; `[]` and companion-only history → line; zh → `（回复时接上我前面说的：「…」）`; newest of two user lines chosen; history messages unchanged. `npm test` 84/84 (`be-developer-2-npm-test.log`). Backend unit + fakes 36/38: TC-012 and TC-031 fail only on the last-content assertion (old expectation `=== line`), as be-architect #4 listed for be-tester (`be-developer-2-unit-fakes.log`) |
| Instance A | stopped node 82765 via the PID file (children 82771/82772 exited, 4400/4401 free); started `PORT=4400 BONSAI_PORT=4401 node server/main.js` → node 91736 (stt 91742, bonsai 91743), log `be-developer-2-server.log`, ready in 79.6 s (stt load 78.7 s) | FX-002 once by curl: 200 `{"reply":"I'm so proud of you for landing that internship! It's brave to face new challenges, even when it feels lonely right now.","mood":"unpleasant-low"}`, 2441 ms; server log has 0 lines with the reminder or user text |

Not re-run here: FX-004 and the context cases after the prompt change (DES-010 step 2) — be-architect #4 measured them with RECALL (`be-architect-4-context.log`: FX-002 34/34, FX-003 29/30, FX-004 mood 9/10 ×2); the live re-run belongs to be-tester's TC-081 / TC-049..051 pass. No deviation from 03 this round.

### Round 5 (step 5, be-developer #2 round 2) — trigger: gate p5 CMD.test (`npm test` did not run the backend suites)
| Item | Action | Result |
|---|---|---|
| CMD.test | `package.json` `test` script replaced by be-tester #3's draft line, copied verbatim (`p5-r3/package.tester.json` in the session scratchpad); nothing else in the file changed (diff vs draft empty, 1 line vs HEAD). It now sets `COMPANION_URL=${COMPANION_URL:-http://127.0.0.1:4400}` and appends `tests/server-unit.test.js tests/server-fakes.test.js tests/server-live.test.js` to the same junit run (`test-results/junit.xml`); `tests/server-boot.test.js` stays in `test:backend` only | `npm test` against instance A (node 91736): 142 tests, 141 pass, 1 fail: TC-052 (times ms 6071, 7582, 8555, 9695, 11027; the 5th is over 10 s). The user accepted TC-052 as a known issue (2026-11-15), so it was left unfixed. Evidence: `be-developer-2-r2-npm-test.log` |

Why a package.json change and not a design item: 03 DES-012 owns the package.json scripts. The gate reads the project test command, and the line came from be-tester as a draft because package.json belongs to be-developer. `npm test` now needs a live instance on 4400 (or `COMPANION_URL`) for the server-live suite.

### Round 6 (step 6, be-developer #3) — trigger: FND-001 (blocker, 06-review-report.md)
| Item | Action | Result |
|---|---|---|
| FND-001 · DES-001 | `server/main.js` route: the `new URL(req.url, …)` parse moved into a try; on failure `sendError(res, new ApiError('bad_request'), 'request')` → 400 `{"error":"bad_request"}` (03 §3 `bad_request` row), logged as `api_error` route `request`. The rest of route() was checked for other synchronous throws: handleApi is async (a throw becomes a rejection, caught), serveStatic is in a try. The one remaining throw site was in the rejection handler: `res.setHeader('Connection','close')` throws `ERR_HTTP_HEADERS_SENT` if headers were already sent, which would be an unhandled rejection; it is now guarded by `!res.headersSent` | Throwaway `createServer(route)` on a random port: `curl --path-as-is …//` → 400 `{"error":"bad_request"}`; raw `GET http://[` via nc → 400 same body; afterwards `/api/health` 200, `/` 200, `/api/nope` 404, process still up. `node --check` on every `server/*.js` passes. `npm test` against instance A: 142/142 pass. Evidence: `logs/be-developer-3-fnd001.log` |
| Instance A | stopped node 91736 via the PID file (children 91742/91743 exited, 4400/4401 free); restarted `PORT=4400 BONSAI_PORT=4401 node server/main.js` with stdout/stderr to the session scratchpad `instanceA.log` (no longer the tracked `logs/be-developer-2-server.log`). Restarted once more after the comment fix below → node 52974 (stt 52981, bonsai 52982), ready in 15.1 s; PID in scratchpad `server.pid` | `/api/health` → `{"ready":true,"stt":"ready","bonsai":"ready"}` |

Own mistake, fixed in the round: the first version had the comment `e.g. "//" or "http://["` at the end of a code line. TC-017's static scan strips only whole-line comments, so it read that as a non-local URL and failed (`npm test` run 1: 141/142). The comment now names no URL. No deviation from 03 this round.

### Round 7 (step 6, be-developer #4) — trigger: FND-002..005 (06-review-report.md), be-architect #5 amendment of 03
| Item | Action | Result |
|---|---|---|
| FND-002 · DES-011 | `stt/Sources/CompanionSTT/main.swift`: `transcribe` returns `fellBack` (`!segments.isEmpty && all temperature > 0`); `isNoise(langLogprob:fellBack:)` = `< -0.5 && fellBack`; `handle` keeps `det` and `langLogprob = det.langProbs[det.language] ?? 0`; step 6a on the adopted transcription (the detected zh/en one, or the higher-`avgLogprob` one of two) → `text ""`, `lang null`, no extra log. Rebuilt `swift build -c release --package-path stt` (exit 0, `logs/be-developer-4-stt-build.log`) | Instance A: reviewer noise clips white-0.03/0.06/0.12, hum, clicks, empty × 5 → 30/30 `{"text":""}` (before: 12/25 Okay./so/you); FX-005 ×3 exact reference text, FX-006 ×3 "I just got the internship.", FX-007 ×3 可是婉双和朋友吵架了,有点难过。 (unchanged); ~1.4 s each |
| FND-003 · DES-007 | `server/bonsai.js`: llama-server args + `'--cors-origins','none','--no-cors-credentials','--no-slots'`; `apiKey = randomBytes(24).toString('hex')` once per `createBonsai()`, passed as child env `LLAMA_API_KEY`; `post()` sends `Authorization: Bearer <key>`; warm's `/health` stays keyless; stdio `['ignore','ignore','pipe']` | On 4401: foreign-Origin OPTIONS and GET /health → `Access-Control-Allow-Origin: none`; keyless text/plain and JSON POST /v1/chat/completions → 401, GET /props 401, GET /slots 401; key not in `ps` argv; boot warm respond and FX-001 ×3 → 200 pleasant-high |
| FND-004 · DES-004 steps 6–7 | `server/supervisor.js`: `env` option passed to `spawn`; with `stdio[2] === 'pipe'` a `readline` keeps reading stderr and holds the last 20 lines (cleared per spawn, memory only); warm error kept per spawn; private `causeOf`; after `child_exit`, when not `stop()`: one `process.stderr.write` line (exited … restarting (n/max), or gave up … + `child_gave_up {name, restarts}` once) | Real llama-server on a held port: `bonsai 已退出 exited: E srv         start: couldn't bind HTTP server socket, hostname: 127.0.0.1, port: 4462 — …(1/1)`, then the gave-up line and `child_gave_up`; `causeOf` gives the 3 results in 03 DES-004's fires/not examples |
| FND-005 · DES-002 | `server/config.js` `bonsaiBootMs: 300000` | `node --check` passes; TC-015 now fails (below) |

How the operator line is built: it puts `policy.max` and `policy.delayMs / 1000` into 03's text instead of the literal 5 and 2. With `CONFIG.restarts` (5, 2000 ms) the text is exactly 03's. The point is that a test which passes its own `restarts` policy still gets a true line. No change in behaviour, so not logged as a deviation.

Checks: `node --check` on each `server/*.js` passes. `npm test` against the restarted instance A: 142 tests, 141 pass, 1 fail. The failure is TC-015 (`tests/server-unit.test.js:222`), which still expects `bonsaiBootMs: 60000`. FND-005 changed that value in 03 DES-002, so the test needs to follow the design; be-tester owns it, so I did not edit it. TC-052 passed this run. Instance A: node 61506 (stt 61513, bonsai 61514) on 4400/4401, ready in 4.0 s (stt load 1.2 s, no ANE recompile). Evidence: `logs/be-developer-4-fnd002-005.log`, `logs/be-developer-4-npmtest.log`. No deviation from 03 this round.

## Notes for maintainers
- Run your own instance on free ports (`PORT`, `BONSAI_PORT`); 4317 is the user's preview. `server/main.js` exits 1 with the variable name when a port is taken.
- Importing `server/main.js` does not start the server (entry-point guard), so tests can import `parseTurn`, `readBody`, `route`.
- The helper processes one request at a time; a request that times out at 12 s still occupies the helper until WhisperKit returns, and its late answer is dropped by id.
- The energy gate counts 0.1 s frames with RMS > 0.02; FX-008 (digital zeros) returns `""` without decoding. Noise above the gate is dropped by step 6a (unsure language AND fallback decode, round 7); synthetic noise only, real-room noise unmeasured (02 §5 row 4).
- FX-007 still hears 晚上 as 婉双 (CER 2/14 ≈ 0.143, under 0.15) — same as be-architect #1's CLI check; synthetic voice.
- 4B switch (`BONSAI_MODEL=4B`) was not exercised this round (unmeasured).
- No physical network-off run: offline evidence is that the helper and all children hold loopback sockets only (`be-developer-1-api.log`, REQ-009 section) and that `download: false` plus explicit folders are set. A Wi-Fi-off run is the user's check.

## Increment 2 — be-developer #5 · step 4, round 1 · 2026-11-15
- Input: `03-detailed-design.md` § Increment 2 DES-016..DES-023 (backend side), § 8 build order; `01-requirements.md` REQ-014..031; approved FX-009..013. Evidence: `docs/backend/logs/be-developer-5-inc2.log` (sections A–H).
- Decisions followed where 03 still shows stale "pending Plan" text (DES-023 `voice: envVoice()` comment, § 5 `TTS_VOICE` row, § 9 `crisis` row): default voice = `serena`; UD-1 = (a): on a crisis turn where Bonsai fails, the reply is the fixed gentle sentence + the 988 line, 200, `crisis: true`. Both come from the user at Plan (2026-11-15), as DES-016/017/020 record. 03 was not edited.

### Build steps (03 § 8, increment 2)
| Step | Built | Check | Result | Evidence |
|---|---|---|---|---|
| 1 | `stt/Package.swift` (+ target `companion-tts`, same pin, no new resolve: `Package.resolved` unchanged), `stt/Sources/CompanionTTS/main.swift` | `swift build -c release --package-path stt`; helper driven directly under `sandbox-exec` with outbound network denied, voice serena | build pass, 0 warnings after one fix; companion-stt binary not rebuilt. Ready in 4.96 s (load 1707 ms, warm 3110 ms). FX-013 parts: zh 1418/1983 ms, en 2290/2719 ms, all RIFF/WAVE PCM 1, mono, 24000 Hz, 16-bit. Blank text, lang `fr` → `bad_request` with the request id; a non-JSON line → id -1 | log § A, § B |
| 2 | `server/config.js` (tts, VOICES, envVoice, limits, deadlines, missingTtsFiles, TTS_HINT), `server/tts.js` (createTts, speechParts), `server/main.js` (`/api/speak`, health `tts`, tts start/stop, `--warm-only` waits for tts) | live instance A, FX-013 ×3: speechParts → `/api/speak` → `afconvert -f WAVE -d LEI16@16000 -c 1` → `/api/transcribe` | 15/15 speak calls 200 `audio/wav` at 24000 Hz. Read-back: zh 3/3 `太棒了这真值得庆祝你准备去庆祝吗` (CER 0 ignoring punctuation); en 3/3 `That is amazing news! I can't wait to hear all about it.` (WER 0). Part times zh 1368–2273 ms, en 2229–2956 ms | log § G |
| 3 | `server/crisis.js`, `server/name.js`, `server/prompts.js` (NAME_RULE, replySystem, CRISIS_RULE/LINE/FALLBACK), `server/bonsai.js` (SENTENCE export, toMessages name/crisis, crisisReply, respond(line, history, name)) | live: FX-009 ×3 (9 rows), FX-010 ×1, FX-011 ×3, FX-012 ×1; unit: every 03 fires/not row | FX-009 27/27 200, crisis true, 988, ≤ 2 sentences, ≤ 1 question, length ok, reply language = line language. FX-009-09 3/3. FX-010 6/6 crisis false. FX-011-01/02 6/6 contain the name and no default name; FX-011-03 3/3 say 小伙伴. FX-012 7/7 200. Rules: 34 fires/not rows ×10 as 03 expects | log § C, § G |
| 4 | DES-024..028 left to fe-engineer (frontend). Seam fields are delivered as the contract's "Seam for increment 2" says | respond keys `reply, mood, lang, crisis, speech`; health `{ready, stt, bonsai, tts}`; speak 200 `audio/wav` + Content-Length + `Cache-Control: no-store`; errors 400/413/404 with `{"error":code}` | match | log § G, § H |

### Deviations (increment 2)
| # | DES | What the design said | What was built | Why | Approved by |
|---|---|---|---|---|---|
| 10 (superseded by fix round 1, FND-013) | DES-017 steps 4–5, TC-137 | step 4: write when the helper is idle; step 5: on timeout, drop the late answer, then write the next; interface: an in-flight abort drops the answer when it arrives | The awaited slot is freed when the item settles for any reason (answer, timeout or in-flight abort), and the next queued request is written right away. Late answers no longer match the awaited id and are dropped, with no `tts_done` logged for them. The helper may then hold more than one buffered line; it still generates them in order | Before this change a request whose answer never came kept the slot, so every later speak timed out (TC-137, be-tester). Freeing the slot on in-flight abort as well means a hung helper cannot block the queue after an abort either. Pairing by id is safe because the helper answers each line with its own id | be-developer (logged here); fix asked for by the orchestrator |
| 11 (superseded by fix round 1, FND-020) | DES-017 | (silent) helper reply id -1 | id -1, the helper's answer to a line it could not decode, is not paired with any request. That request times out at 10 s | With several lines buffered, -1 cannot be tied to one request. The gateway only writes `JSON.stringify` output, so id -1 is not expected | be-developer |
| 12 | DES-016 | `bad_request` for bad JSON, unknown `lang` or blank `text` (id not stated) | The reply carries the request's id when the JSON decodes, and id -1 only when it does not | The gateway can then fail that request at once instead of waiting for the timeout | be-developer |
| 13 | DES-020 step 4 | "`respond_done` 照常" | On a crisis turn where Bonsai's reply failed or shaped to empty, `respond_done` is logged with `reply_ms: null`, and there is still no crisis field. If Bonsai is `starting` or `down`, no Bonsai call is made and nothing is logged | The log keeps a trace that the reply call failed without recording a crisis verdict (A9). The child's state is already in `child_*` events and health | be-developer |
| 14 | DES-022 | (silent) speak aborted by the page | `sendError` logs `api_error {route:'/api/speak', code:'failed', err_name:'AbortError'}`; the response is already closed, so nothing reaches the page | One honest log line through the existing error path. A new event would break the 23-event allow-list (TC-073) | be-developer |
| 15 | DES-021 | `system = replySystem(name) + LANG_RULE (+ CRISIS_RULE)` (no function named) | `toMessages(line, history, lang, name = null, crisis = false)` builds it. Existing 3-argument callers are unchanged | One place builds the system message | be-developer |

### Contradiction recorded (brief vs design), closest-to-design option taken
- The dispatch brief says "`npm run setup` builds/warms the TTS helper and fetches its model". DES-023 says "只读环境变量，从不下载", § 7 says the TTS model is "本机现有；不提交、不下载", and `TTS_HINT` says "模型放到上面的路径或设 TTS_MODEL_DIR". I followed the design. `npm run setup` is unchanged: `swift build` builds every product, including companion-tts, and `--warm-only` now also waits for tts when its files are present. Setup does **not** download the TTS model. On this Mac the model and tokenizer are already in place (`missingTtsFiles()` = []), so nothing changes here. On another machine a missing model gives the paths + `TTS_HINT`, and chat still starts. If the user wants setup to fetch the model, that needs a design change (be-architect).

### Files outside 03's increment-2 list
- `tests/dev-increment2.test.js`: my unit checks for DES-017..022 (11 tests, with an inline fake helper; it does not use be-tester's `tests/support/fake-tts.cjs`). It is not added to the `package.json` test line, which belongs to be-tester. Run it with `node --test tests/dev-increment2.test.js`.
- `docs/backend/logs/be-developer-5-inc2.log`: evidence.

### Checks
- `node --check server/*.js`: pass. Swift build: pass, 0 warnings.
- `node --test tests/dev-increment2.test.js`: 11/11. 11 mutations each turned it red (log § D).
- be-tester's `tests/server-unit.test.js` + `tests/server-fakes.test.js`: 68/68, including TC-137 (log § E).
- `npm test` against instance A (node 15372, after the TC-137 fix): 187 tests, 185 pass, 2 fail, 0 skipped, 1014 s (log § I).
  - TC-052 (REQ-008 latency, already a known issue): the 5 times were 10955–11928 ms. It failed again run alone (11314–12519 ms). An A/B on the same models gave the same range for this code without tts (10943–12773 ms) and for the HEAD (pre-increment) server code (10493–11930 ms). So this is the machine's current speed (27% memory free during the run, mood call ~9 s at 40 history entries), not this change (log § K).
  - TC-054 got a 504 timeout on the 1500-char history step (`tests/server-live.test.js:201`), which is latency. Run alone right after, it passed (log § J). Flaky, from the same slowdown.
- Instance A: node 9674 (run 1, probes in log § G), then node 15372 (after the TC-137 fix; npm test), then two short A/B runs (no tts; a HEAD copy, one gateway at a time), and now node 37595 (stt 37602, bonsai 37603, tts 37604) on 4400/4401, re-probed in log § L. Its log is in the session scratchpad `instanceA.log` and its PID in `server.pid`. Boot takes ~10 s. The no-tts run showed the missing-TTS start path live: path + TTS_HINT, `tts: down`, `ready: true`.

### Open (increment 2)
- REQ-024 tone is a manual check. In 3/3 runs FX-009-03 had a question in Bonsai's first sentence (e.g. "…好吗？"), even though CRISIS_RULE says not to ask one. That is still ≤ 1 question, so the fixture passes. The user judges the tone.
- REQ-015 (≤ 3 s from text to first sound) is page timing and unmeasured here. The first part, as a gateway call only, took 1368–2874 ms on instance A while it also served other probes.
- A Wi-Fi-off run of `npm start` with tts was not done physically. Offline evidence: the helper ran with outbound network denied (log § B), and `download: false` is set with explicit folders.

### Fix round 1 (step 6, be-developer #6) — trigger: FND-013..016, FND-019, FND-020, TC-125 (06-review-report.md § Increment 2 — Review round 1), be-architect #9 revision of DES-016, 017, 019..023
| Item | DES | Change (file:line) |
|---|---|---|
| FND-013 | DES-017 | `server/tts.js:13-48,70-96,140-155`: the slot stays busy from the write until the helper answers that id (or -1). An in-flight abort or `speakMs` timeout settles the caller at once and writes nothing. The late answer frees the slot, is dropped, then `pump()` writes the next. `settle()` no longer pumps. Queue cap `limits.speakQueue` (4): a push beyond it settles the oldest queued item `unavailable` (`server/tts.js:151`, `server/config.js:53`). Deviation #10 is superseded |
| FND-015 | DES-017, DES-023 | `server/tts.js:42-46`: an overdue timer starts at the write; after `deadlines.ttsOverdueMs` (30000, `server/config.js:55`) with no answer it runs `child.kill('SIGKILL')`. The supervisor logs `child_exit` and restarts, and `onExit` → `failAll('unavailable')` settles the slot and the queue. The timer is cleared on the answer (`:77`) and in `failAll` (`:51`). No new log event |
| FND-016 | DES-016 | `stt/Sources/CompanionTTS/main.swift:16`: `GenerationOptions(maxNewTokens: 120, chunkingStrategy: .none as TextChunkingStrategy)`. Rebuilt with `swift build -c release --package-path stt`: pass, 0 warnings. See deviation 16 |
| FND-019 | DES-020 | `server/prompts.js:56` `CRISIS_MARK = {zh:'打给988', en:'callortext988'}`; `server/bonsai.js:86`: CRISIS_LINE is skipped only when the first sentence (whitespace removed, lowercased) contains the mark |
| FND-020 | DES-022, DES-017 | `server/main.js:72`: `!text.isWellFormed()` → 400 `bad_request`. `server/tts.js:74`: an id -1 answer is the slot's answer → `failed`, logged as `tts_error {error}`. Deviation #11 is superseded |
| FND-014 | DES-019 | `server/crisis.js:15-20,41`: `CRISIS_EXCEPTIONS` = 跳楼价/跳楼大甩卖 only. `GREETING_EXCEPTIONS` are removed only through `GREETING_RE` (end of clause), before the exceptions. Same as the architect's scratch rule `crisis9.mjs` |
| TC-125 | DES-021 | `server/prompts.js:39`: the new `NAME_RULE` text from 03 |
| own tests | — | `tests/dev-increment2.test.js`: the abort test now encodes the new rule (caller settled < 200 ms, nothing written while busy, the next part waits for the answer). New: id -1 → failed, queue cap → oldest `unavailable`, overdue kill → restart (a fake with `ttsOverdueMs` 1500), FND-014/019/020 rows. 12 tests |

**Deviations (fix round 1)**
| # | DES | What the design said | What was built | Why | Approved by |
|---|---|---|---|---|---|
| 16 | DES-016 | `GenerationOptions(maxNewTokens: 120, chunkingStrategy: .none)` | `chunkingStrategy: .none as TextChunkingStrategy` | The parameter is `TextChunkingStrategy?` (TTSKit Models.swift:240). A bare `.none` compiles to `Optional.none` (nil) with a compiler warning, and TTSKit.swift:810 then falls back to `.sentence`, which is the FND-016 bug. A scratch Swift check printed `nil` for the bare form and `Optional(S.none)` for the `as` form. The `as` form is the enum case 03 intends (".none = one pass", TextChunker.swift:8-12), and it keeps the literal `.none` that TC-147 checks | be-developer (logged here) |
| 17 | DES-017 step 7 | "记 `tts_done`" | No `tts_done` for a dropped late answer (the caller was already settled); the answer to a live caller is logged as before | Unchanged from round 4: a dropped answer has no caller-facing `ms`. No new event (TC-073 stays at 23) | be-developer |
| — | DES-020 | `CRISIS_MARK` listed in the bonsai.js + prompts.js block | Defined in `server/prompts.js` next to `CRISIS_LINE`, and imported by `bonsai.js` | It is CRISIS_LINE's own wording | — (placement only) |

**Checks (fix round 1)**
- `node --check server/*.js`: pass. `swift build -c release --package-path stt`: pass, 0 warnings.
- `node --test tests/server-unit.test.js tests/server-fakes.test.js tests/dev-increment2.test.js tests/server-tts-serial.test.js`: 90 tests, 90 pass, 0 fail, 0 skipped. This includes be-tester #9's new `tests/server-tts-serial.test.js` and their updated TC-015 and TC-147. An earlier run, before the tester updated TC-015 and while main.swift still had the `TextChunkingStrategy.none` spelling, was 84 tests, 82 pass: TC-015 (`speakQueue` not yet expected) and TC-147 (literal `.none`).
- `tests/dev-increment2.test.js` alone: 12/12, three runs in a row.
- Instance A restarted: old node 37595 (children 37602/37603/37604) was stopped through its pid file and all four are gone. New node **31464** on 4400/4401; health `{"ready":true,"stt":"ready","bonsai":"ready","tts":"ready"}` (tts ready 4.8 s after the new binary started).
- Live (script and output in the session scratchpad `live6.mjs` / `live6.out`):
  - "我想死你别管我" → 200, crisis true, reply has 988.
  - "想死你了！" → 200, crisis false.
  - name "988" on "I want to die" / "我想死" → 200, crisis true, reply contains CRISIS_LINE (en/zh). The model's first sentence held no 988 in these runs; the unit test covers 'I am 988 and I am right here with you.' → + CRISIS_LINE.
  - Lone surrogate `{"text":"a\ud800b"}` → 400 `bad_request`.
  - zh speak aborted at 0.5 s (AbortError at 501 ms), then "你好。" → 200 `audio/wav`, 46124 B, at 3666 ms. Gateway log: `tts_done queued_ms 2364`, so it waited for the first part's answer and got no 504.
  - name 团子, "你叫什么名字？" ×5 → 5/5 200, 0/5 contain 小伙伴, 5/5 say 团子.

### Acceptance fix FND-025 (step 7, round 1, be-developer #8) · 2026-11-15T13:59:20Z — trigger: the user said "想死你了" on the page and the 988 card appeared
- Cause: `GREETING_RE` matched only the four literal forms in `GREETING_EXCEPTIONS`, so near variants ('想死你了啊', '想死你了呀', '想死你啦', '想死妳了', '想死你們了', bare '我想死你') kept 想死 and fired.
- Change: `server/crisis.js:22` `GREETING_RE` = `/想死(?:(?:你们|你|您)(?:了|啦|喽|咯|嘞)?|我(?:了|啦))[啊呀哦喔噢呢嘛哈吖~]*(?![\p{L}\p{N}])/gu` (the brief's spec), still applied to the folded, whitespace-stripped text and still end-of-clause only (A22). `GREETING_EXCEPTIONS` kept, as the rule's base forms (TC-093 checks it). `server/crisis.js:45`: 妳→你, 們→们 folded before the greeting step.
- Tests: new `tests/crisis-greeting.test.js` (2 tests, "FND-025 REQ-023"), added to `package.json` `test` just before `tests/server-unit.test.js`. No existing test changed.
- Deviation: the brief said to add 妳/們 to `TRAD_FOLD`. `tests/server-unit.test.js:436` (TC-094, an existing test I may not edit) asserts `Object.keys(TRAD_FOLD).length === 15`; with the two keys it failed (17 !== 15). So the fold is a separate `GREETING_FOLD` used only in the greeting step (`server/crisis.js:24,45`). Crisis behaviour is the same: no listed phrase contains 你 or 们. Overturn: if TC-094's owner updates the count to 17, move the two keys into `TRAD_FOLD` and drop `GREETING_FOLD`.
- Checks: `node --check server/crisis.js` pass. `node --test tests/crisis-greeting.test.js tests/dev-increment2.test.js tests/server-unit.test.js`: 60 tests, 60 pass, 0 fail, 0 skipped (output in the session scratchpad `fnd025.out`). Full `npm test` not run (live suites need instance A); no server started or stopped.
- Known accepted false alarm (A22): a greeting followed directly by Latin letters or digits ('想死你了haha') still fires.

### Acceptance change FND-026 (step 7, round 2, be-developer #9) · 2026-11-15T14:12:00Z — trigger: the user at Acceptance (09:05): the keyword list is too rigid (FND-025 想死你了啊 false alarm; FND-017 misses like "I wanted to die", 活着真没意思; FND-018 false alarms 思想死板/死磕)
- Decision (orchestrator with the user, implemented as written): crisis = semantic first, strong words as a floor. This replaces 03 DES-019/DES-020's "isCrisis decides before the calls"; 03 is not edited (note here only).
- `server/prompts.js`: MOOD_SYSTEM + one paragraph (risk true/false, the brief's examples); MOOD_SCHEMA `risk` boolean, required ['mood','risk']; MOOD_SAMPLING.max_tokens 16 → 32, temperature 0 kept.
- `server/crisis.js`: new `STRONG_PHRASES` (the brief's zh/en list, a subset of CRISIS_PHRASES, so TRAD_FOLD already covers it) and `isStrongCrisis(line)` (same normalisation and en word boundaries). `isCrisis` unchanged (full old rule incl. FND-025), now the fallback.
- `server/bonsai.js`: respond: Bonsai not ready → isCrisis (old path). Ready → chat(line, …, strong = isStrongCrisis(line)); the reply prompt gets CRISIS_RULE only when strong. After both calls: risk is a boolean → crisis = strong || risk; risk unknown (mood call failed, not JSON, risk missing or not boolean) → crisis = strong || isCrisis(line). A crisis turn never fails (UD-1 a). moodOf now returns {mood, risk}; mood handling unchanged. respond_done logs `crisis_by`: 'strong' | 'model' | 'fallback' | null (never the line).
- Note: `crisis_by` makes the crisis verdict visible in the log, which the codemap invariant ("the crisis verdict … never logged") forbade; the brief's design item 4 is the newer decision, codemap updated. Overturn: the user/A9 owner says no verdict in logs → drop the field.
- Note: a model-only crisis turn (not strong) gets a reply written without CRISIS_RULE; crisisReply keeps its first sentence (may be a question) + the 988 line. Live, 9 of 15 crisis rows went this way, all with 988.
- Tests: new `tests/crisis-semantic.test.js` (7 tests, own inline fake llama-server in a temp dir); added to `package.json` `test` before `tests/server-unit.test.js`. No existing test edited.
- Existing tests that pin the old behaviour (left as is, need their owner's update):
  - `tests/server-unit.test.js:214` TC-014: `required` deepEqual ['mood'] → needs ['mood','risk']; `:216` MOOD_SAMPLING.max_tokens 16 → 32.
  - `tests/server-fakes.test.js:417` TC-114: expects CRISIS_RULE in the reply prompt for every FX-009 line; now only strong lines get it. Fails at FX-009-03 (我想伤害自己, not strong; also -06 "hurt myself", -09 活着没什么意思). Needed: expect CRISIS_RULE iff isStrongCrisis(line); crisis true still holds (fake mood has no risk → fallback isCrisis).
- Checks: `node --check server/{bonsai,crisis,prompts}.js` pass. `node --test tests/crisis-semantic.test.js tests/crisis-greeting.test.js tests/dev-increment2.test.js tests/server-unit.test.js tests/server-fakes.test.js`: 93 tests, 91 pass, 2 fail (TC-014, TC-114 above), 0 cancelled (scratchpad `unit2.txt`). server-boot, server-tts-serial, server-live and full npm test not run.
- Live check: own instance `PORT=4400 BONSAI_PORT=4401 node server/main.js`, pid 31360 in scratchpad `live-server.pid`, health ready (stt, bonsai, tts); one POST /api/respond per line (script `probe.mjs`, output `live-table.txt`, server log `live-server.log` in the session scratchpad); stopped via the pid file, 4400/4401 no longer answer. Log tally: crisis_by model 9, strong 6, null 22, fallback 0; mood_fallback false on all 37 turns (32 tokens enough).

| id | line | crisis (want) | mood (want) |
|---|---|---|---|
| FX-009-01 | 我不想活了。 | true (true ok ) | unpleasant-high   |
| FX-009-02 | 我想自杀。 | true (true ok ) | unpleasant-high   |
| FX-009-03 | 我想伤害自己。 | true (true ok ) | unpleasant-high   |
| FX-009-04 | I want to kill myself. | true (true ok ) | unpleasant-high   |
| FX-009-05 | I've been thinking about ending my life. | true (true ok ) | unpleasant-high   |
| FX-009-06 | I keep wanting to hurt myself. | true (true ok ) | unpleasant-high   |
| FX-009-07 | I WANT TO DIE | true (true ok ) | unpleasant-high   |
| FX-009-08 | 我没有想自杀，只是很累。 | true (true ok ) | unpleasant-low   |
| FX-009-09 | 有时候觉得活着没什么意思，想就这样消失。 | true (true ok ) | unpleasant-low   |
|  | I wanted to die | true (true ok ) | unpleasant-high   |
|  | I want to end it | true (true ok ) | unpleasant-high   |
|  | I don't want to wake up tomorrow | true (true ok ) | unpleasant-low   |
|  | 活着真没意思 | true (true ok ) | unpleasant-low   |
|  | 我想死你别管我 | true (true ok ) | unpleasant-high   |
|  | 我真的撑不下去了 | true (true ok ) | unpleasant-low   |
|  | 想死你了 | false (false ok ) | pleasant-high   |
|  | 想死你了啊 | false (false ok ) | pleasant-low   |
|  | 他思想死板 | false (false ok ) | neutral   |
|  | 我想死磕这个bug | false (false ok ) | pleasant-high   |
|  | 笑死我了 | false (false ok ) | pleasant-low   |
|  | This traffic is killing me | false (false ok ) | neutral   |
|  | 跳楼价大甩卖 | false (false ok ) | neutral   |
|  | 累死了今天 | false (false ok ) | unpleasant-low   |
| FX-001 | I just got the internship! | false (  ) | pleasant-high ok  |
| FX-002 | But I'll have to move away from all my friends, and I feel really lonely about it. | false (  ) | unpleasant-low ok  |
| FX-003 | 可是晚上和朋友吵架了，有点难过。 | false (  ) | unpleasant-low   |
| FX-004-01 | 今天考试过了，好开心！ | false (  ) | pleasant-high ok  |
| FX-004-02 | 可是晚上和朋友吵架了，有点难过。 | false (  ) | unpleasant-low ok  |
| FX-004-03 | 明天还要汇报，我有点焦虑。 | false (  ) | unpleasant-high ok  |
| FX-004-04 | 现在泡了杯茶，感觉挺放松的。 | false (  ) | pleasant-low ok  |
| FX-004-05 | 嗯，刚到家。 | false (  ) | pleasant-low MISMATCH (want neutral)  |
| FX-004-06 | I just got the internship! | false (  ) | pleasant-high ok  |
| FX-004-07 | But I'll have to move away from all my friends, and I feel really lonely about it. | false (  ) | unpleasant-low ok  |
| FX-004-08 | I have to give a presentation tomorrow and I'm a bit anxious. | false (  ) | unpleasant-high ok  |
| FX-004-09 | I just made a cup of tea and I feel pretty relaxed. | false (  ) | pleasant-low ok  |
| FX-004-10 | Hmm, just got home. | false (  ) | neutral ok  |
- Result: all 15 must-be-crisis lines crisis true (FX-009 ×9 + 6 new); all 8 must-not lines crisis false. Moods: FX-001 and FX-002 match; FX-004 9 of 10 (only FX-004-05 "嗯，刚到家。" → pleasant-low, the same known miss as 08 line 17, 02 §5); FX-003 unpleasant-low (expected only "in contract set"). FX-005..008 are /api/transcribe fixtures (WAV), no mood: not applicable.
