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

## Notes for maintainers
- Run your own instance on free ports (`PORT`, `BONSAI_PORT`); 4317 is the user's preview. `server/main.js` exits 1 with the variable name when a port is taken.
- Importing `server/main.js` does not start the server (entry-point guard), so tests can import `parseTurn`, `readBody`, `route`.
- The helper processes one request at a time; a request that times out at 12 s still occupies the helper until WhisperKit returns, and its late answer is dropped by id.
- The energy gate counts 0.1 s frames with RMS > 0.02; FX-008 (digital zeros) returns `""` without decoding. Real-room noise above the gate was not measured (02 §5 row 4).
- FX-007 still hears 晚上 as 婉双 (CER 2/14 ≈ 0.143, under 0.15) — same as be-architect #1's CLI check; synthetic voice.
- 4B switch (`BONSAI_MODEL=4B`) was not exercised this round (unmeasured).
- No physical network-off run: offline evidence is that the helper and all children hold loopback sockets only (`be-developer-1-api.log`, REQ-009 section) and that `download: false` plus explicit folders are set. A Wi-Fi-off run is the user's check.
