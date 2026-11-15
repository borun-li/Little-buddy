# Test Plan — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文（backend, run companion-full-dev）

- Author: be-tester #1 (Backend Phase 4, round 1) · 2026-11-14; amended be-tester #3 (step 5 round 2: DES-008 RECALL, §6 events, gate wiring, boot group manual)
- Derived from `01-requirements.md` (§1, §5, §7), `03-detailed-design.md` (§1–§3, §9) and the locked fixtures `tests/fixtures/approved/FX-001..008` only — **not** from the implementation.
- TC ids start at TC-001 (no earlier TCs exist in the repo). Every automated TC id is in the test's name; fixtures are tagged `[FX-nnn]`.

## 1. Strategy
Four layers, all `node:test`, no npm dependencies, same style as the existing `tests/*.test.js`.

| Layer | File | What runs | Stubbed / real |
|---|---|---|---|
| Pure logic | `tests/server-unit.test.js` | WAV parsing, error mapping, language majority, reply shaping, history window, prompts constants, config and missing-file list, static serving | real modules from 03 §1; temp dirs and local HTTP servers only |
| Process protocol | `tests/server-fakes.test.js` | supervisor, `stt.js`, `bonsai.js` against test doubles of the two children (`tests/support/fake-stt.cjs`, `fake-llama.cjs`): errors, timeouts, mood fallback, request shape | real server modules; children are doubles that follow the DES-006 line protocol and an OpenAI-style llama-server |
| Live stack | `tests/server-live.test.js` | the real HTTP seam (03 §9): FX-001..008, FX-004 mood rounds, timing with 20 turns, bad input, limits, routes, loopback | fully real (Bonsai 9B + WhisperKit) at `COMPANION_URL` |
| Boot / failure | `tests/server-boot.test.js` | starts its own `node server/main.js` on free ports: ready ≤ 120 s, first turn ≤ 10 s, kill a child → 503 ≤ 2 s and recovery, log hygiene, clean stop | real; **not in `npm test`** (manual/blocked group, see below); opt-in `COMPANION_BOOT=1` |

Reply text varies per run, so replies are judged by **properties** computed with the `rules` in each fixture's `meta.json` (language, ≤ 2 sentences, ≤ 1 question, length, not a preset, no thinking text); mood is compared exactly. Fixture inputs and expected files are loaded from `tests/fixtures/approved/` and never edited. Judgements a machine cannot make (does the reply respond to the internship, does it mention the exam) are manual TCs; the live run writes every reply to `test-results/backend-replies.jsonl` so the human reads them without re-running.

Skips are explicit: the live file probes `GET {COMPANION_URL}/api/health` (default `http://127.0.0.1:4400`; waits up to `COMPANION_READY_MS`, default 130 s, for `ready:true`) and skips every live TC with the reason when nothing answers; it refuses port 4317 (the user's preview). The boot file skips with a reason unless `COMPANION_BOOT=1`. A skip is never a pass: Phase 5 reports it as `blocked`.

**Gate wiring (round 2).** `npm test` (gate p5, `test-results/junit.xml`) runs the frontend files plus `server-unit`, `server-fakes` and `server-live` (`COMPANION_URL` defaults to `http://127.0.0.1:4400`; it must be up). The boot file is **not** in `npm test`: it starts a third 9B Bonsai instance next to the live one (24 GB Mac, about 80 s warm-up, long first-run compile, kills children), which risks starving the live stack and the other agents' instances. Its TCs (TC-070..076) are therefore **Mode: manual**, run on request with `COMPANION_BOOT=1 npm run test:backend` when the machine is otherwise idle, and are reported `blocked` in any run that does not do so.

## 2. Test environment
| Item | Value |
|---|---|
| Command (gate) | `npm test` (frontend + backend unit, fakes, live; JUnit `test-results/junit.xml`; `COMPANION_URL` default `http://127.0.0.1:4400`) |
| Command (all backend tests incl. boot file) | `npm run test:backend` (JUnit: `test-results/junit-backend.xml`) |
| Command (live, own server) | `PORT=4400 BONSAI_PORT=4401 node server/main.js` in one shell (record the PID; stop only it), then `COMPANION_URL=http://127.0.0.1:4400 npm run test:backend` |
| Command (boot suite) | `COMPANION_BOOT=1 npm run test:backend` (starts and stops its own server on two free ports) |
| One file | `node --test tests/server-unit.test.js` (likewise for the others) |
| Fixtures | `tests/fixtures/approved/FX-001..008` (inputs, `expected.json`, `meta.json`); `test_audio/hello.wav` (24 kHz Float32, the original FX-005 input, used only as a must-reject case) |
| Support | `tests/server-helpers.js` (WAV builder, rule checks, WER/CER, lsof check, live probe); `tests/support/fake-stt.cjs`, `fake-llama.cjs` |
| External services | Bonsai and WhisperKit **real** in the live and boot layers; **stubbed** (doubles) in the protocol layer; none in the unit layer. No network is needed at any layer; loopback only. |
| Never | port 4317 (preview), 4318 unless the boot suite's free-port choice lands there (it asserts it does not); stopping any process the tests did not start |

## 3. Test cases
Level: unit / integration (modules + doubles, or the HTTP seam) / e2e (boots the product).

### Unit — `tests/server-unit.test.js`
### TC-001 — WAV: seam-format fixtures parse to exactly their data chunk
- **Verifies:** REQ-001 (FX-005, FX-006, FX-007)  **Level:** unit  **Mode:** automated
- **Preconditions:** `server/wav.js`.
- **Steps:** `pcmFromWav` on each fixture `input.wav` (afconvert output carries an extra chunk).
- **Expected result:** a Buffer whose bytes equal the data chunk (length = chunk size rounded down to even).
- **Observed how:** `assert.equal` on length, `equals` on bytes against an independent chunk walk.

### TC-002 — WAV: the 2 s silence fixture
- **Verifies:** REQ-003 (FX-008)  **Level:** unit  **Mode:** automated
- **Steps:** `pcmFromWav(FX-008 input.wav)`.  **Expected result:** 64000 bytes, all zero.  **Observed how:** assertions.

### TC-003 — WAV: every non-seam format is `bad_request`
- **Verifies:** REQ-001  **Level:** unit  **Mode:** automated
- **Steps:** feed `test_audio/hello.wav` (24 kHz Float32), stereo, 8-bit, 44.1 kHz, 24 kHz, float format, empty buffer, 43 bytes, Ogg, webm/EBML, RIFF without WAVE, header without `data`.
- **Expected result:** each throws `ApiError` code `bad_request`, status 400.  **Observed how:** `assert.throws`.

### TC-004 — WAV: stays inside the buffer, even length
- **Verifies:** REQ-001  **Level:** unit  **Mode:** automated
- **Steps:** data size field larger than the file; odd data length; LIST chunk before `data`; zero-length data.
- **Expected result:** 1000 / 6 / 320 / 0 bytes; no throw, no out-of-range read.  **Observed how:** lengths.

### TC-005 — Error codes and statuses
- **Verifies:** REQ-011  **Level:** unit  **Mode:** automated
- **Steps:** read `CODES`; build `ApiError('timeout','stt')`.  **Expected result:** the six codes with 503/503/504/502/400/413; `ApiError` has `code`, `status`, `stage`.  **Observed how:** `deepEqual`.

### TC-006 — `sendError`: ApiError passes through, anything else is 502 `failed` and leaks nothing
- **Verifies:** REQ-011 (A9)  **Level:** integration  **Mode:** automated
- **Steps:** a local HTTP server calls `sendError` with `ApiError('not_ready')` and with `Error('SECRET-USER-TEXT-123')`; capture stdout/stderr.
- **Expected result:** 503 `{"error":"not_ready"}`; 502 `{"error":"failed"}`; the secret string is in neither body nor log.  **Observed how:** fetch response and captured log.

### TC-007 — `sendError` after headers were sent
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** handler writes 200 + partial body, then calls `sendError`.  **Expected result:** connection destroyed; no `"error"` JSON appended.  **Observed how:** client-side body.

### TC-008 — `languageOf`
- **Verifies:** REQ-005 (A3)  **Level:** unit  **Mode:** automated
- **Steps:** 10 lines: pure en, pure zh, "我今天很happy" (zh), "I really love eating 火锅 with friends" (en), emoji only, digits only, empty, tie "嗯 ok" (zh), "I feel 难过 today" (en).
- **Expected result:** per DES-009 (amended): `zhWords = ceil(han/2)`; zhWords ≥ English words → zh (tie zh); else words → en; neither → zh. Extra cases: "a 火锅" (1:1 zh), "好 hello world" (1:2 en), "火锅 ok" (1:1 zh).  **Observed how:** `equal`.

### TC-037 — `languageOf`: DES-009 worked examples
- **Verifies:** REQ-005 (A3)  **Level:** unit  **Mode:** automated
- **Steps:** `languageOf` of "I love 火锅", "嗯 ok", "我今天很happy".  **Expected result:** `en` (zhWords 1 : words 2), `zh` (1:1 tie), `zh` (2:1), as DES-009 step 3 after be-architect #3's amendment (the earlier example contradicted the rule; resolved).  **Observed how:** `equal`.

### TC-038 — `missingHints`
- **Verifies:** REQ-010, REQ-011  **Level:** unit  **Mode:** automated
- **Steps:** with `BONSAI_MODEL`-style size 2B: `[]`; only the gguf (and, separately, only llama-server); only `stt.bin`; two WhisperKit paths; all three kinds.  **Expected result:** `[]`; one Bonsai line (mentions BONSAI_MODEL, not `npm run setup`); one stt line (`npm run setup`); one WhisperKit line (STT_MODEL_DIR); three lines in the order stt, Bonsai, WhisperKit, each with Chinese and English text.  **Observed how:** line counts and `match`.

### TC-009 — `shapeReply`: thinking, quotes, blanks
- **Verifies:** REQ-004  **Level:** unit  **Mode:** automated
- **Steps:** closed `<think>`, multi-line, unclosed (to the end), only-thinking, wrapping quotes, whitespace, empty.  **Expected result:** thinking removed, trimmed; unusable → `''`.  **Observed how:** `equal`.

### TC-010 — `shapeReply`: ≤ 2 sentences, ≤ 1 question, emoji kept
- **Verifies:** REQ-004  **Level:** unit  **Mode:** automated
- **Steps:** "One. Two. Three." → "One. Two."; "A? B?" → "A?"; "Really? Wow! Cool?" → "Really? Wow!"; "That is amazing news! Congratulations!" unchanged; emoji stays with its sentence; zh joined with `''`; zh 3 sentences → 2; zh two questions → 1.  **Observed how:** `equal`.

### TC-011 — `shapeReply`: length caps
- **Verifies:** REQ-004  **Level:** unit  **Mode:** automated
- **Steps:** two 70-char zh sentences; one 130-char zh sentence; two 25-word en sentences; one 50-word en sentence; exactly 120 zh chars.
- **Expected result:** first sentence only; `…` cut gives 119 chars + `…` (= 120) and 40 words ending in a glued `…`; exactly 120 untouched.  **Observed how:** `equal`.

### TC-012 — `toMessages`
- **Verifies:** REQ-005, REQ-007  **Level:** unit  **Mode:** automated
- **Steps:** build messages for en and zh with a 2-entry history.  **Expected result:** system message = `REPLY_SYSTEM` … ending with `LANG_RULE[lang]`; `companion` → `assistant`; user line last. Round 2 (DES-008): when the window holds an earlier `user` entry the last message is `line + "\n" + RECALL[lang](prev)` (prev = newest user entry; key = language of the line); with only `companion` entries or no history it is `line` alone.  **Observed how:** `deepEqual`.

### TC-013 — `windowOf`
- **Verifies:** REQ-007, REQ-008  **Level:** unit  **Mode:** automated
- **Steps:** weight = length + 1.5 × Han chars, budget 2000 (DES-007). 45 short entries; 40×200; 10×200 (= 2000); 11×200; 40×35 (≈ 1400, a 20-turn English chat); 20×49; 21×'好'×40 (weight 100 each); 5×1500; one 2001-char entry; one 801-Han entry (2002.5); 800 Han (= 2000); empty.  **Expected result:** 40; newest 10; 10; 10; 40; 20; 20 (newest); 1; `[]`; `[]`; 1; `[]`.  **Observed how:** `deepEqual`.

### TC-014 — Prompt constants
- **Verifies:** REQ-006, REQ-004  **Level:** unit  **Mode:** automated
- **Steps:** read `MOODS`, `MOOD_SCHEMA`, `REPLY_SAMPLING`, `MOOD_SAMPLING`, `LANG_RULE`, `MOOD_SYSTEM`.  **Expected result:** values as in DES-010 (5 ids, enum, `presence_penalty` 1.5, `max_tokens` 120/16, `top_k` 20/1, English/简体 rules).  **Observed how:** `deepEqual`.

### TC-015 — Config values
- **Verifies:** REQ-009, REQ-010  **Level:** unit  **Mode:** automated
- **Steps:** read `CONFIG`.  **Expected result:** host `127.0.0.1`; limits (incl. `historyBudget: 2000`), deadlines, restarts exactly as DES-002; 15 s + 12 s < 30 s; default ports 4317/4318 and size 9B when the env vars are unset (read only).  **Observed how:** `deepEqual`.

### TC-016 — `bonsaiFiles` / `missingFiles`
- **Verifies:** REQ-010, REQ-011  **Level:** unit  **Mode:** automated
- **Steps:** a config pointing into an empty temp dir; then the full tree created; then one `.mlmodelc` removed. The `missingHints` cases are TC-038.  **Expected result:** ≥ 7 missing paths naming llama-server, gguf, stt bin, the three mlmodelc and tokenizer.json; `[]` when complete; exactly 1 after removal.  **Observed how:** list contents.

### TC-017 — Sources and scripts match DES-001/002/012
- **Verifies:** REQ-009, REQ-010  **Level:** unit  **Mode:** automated
- **Steps:** read `package.json` scripts and each `server/*.js`.  **Expected result:** `start` = `node server/main.js`; `setup` as DES-012; no `/Users/<name>` path, no `0.0.0.0` / `::` bind, no non-local URL in code.  **Observed how:** regex over source (a check against the design, not a restatement of the code).

### TC-018 — `serveStatic` basics
- **Verifies:** REQ-010  **Level:** integration  **Mode:** automated
- **Steps:** temp web root behind a local server: `/`, `/js/app.js`, `.woff2`, HEAD, missing file, POST/PUT/DELETE.  **Expected result:** index.html served, JS/woff2 types, `Cache-Control: no-store`, HEAD no body, 404, 405.  **Observed how:** status, headers, body.

### TC-019 — `serveStatic` cannot leave the root
- **Verifies:** REQ-009  **Level:** integration  **Mode:** automated
- **Steps:** `/../secret.txt`, `/%2e%2e/secret.txt`, `/%2E%2E/…`, `/js/../../secret.txt`, `/..%2f…`, `/%2e%2e%2f…` with the secret one level above the root.  **Expected result:** 404 (or 400), secret never in the body; `/js/app.js` still 200.  **Observed how:** raw `http.request` (no URL normalisation).

### TC-020 — `isNothingHeard`
- **Verifies:** REQ-003 (FX-008)  **Level:** unit  **Mode:** automated
- **Steps:** `''`, `' '`, `'a'`.  **Expected result:** true only for `''`.  **Observed how:** `equal`.

### Process protocol — `tests/server-fakes.test.js`
### TC-021 — Supervisor: starting → ready; `stop()` ends only its own pid, no restart
- **Verifies:** REQ-010  **Level:** integration  **Mode:** automated
- **Steps:** supervise a sleeper whose `warm` we release; check state; `stop()`; wait 2.5 s.  **Expected result:** `starting` → `ready`; pid gone; state `down`; no respawn.  **Observed how:** `state`, `process.kill(pid,0)`.

### TC-022 — Supervisor: unexpected exit → down, `onExit`, restart in ~2 s
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** SIGKILL the child.  **Expected result:** `down`, `onExit` once, then a new pid ≥ 1 s later, `ready` again.  **Observed how:** polling `state`/`pid`.

### TC-023 — Supervisor: failed warm kills the child
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** `warm` rejects.  **Expected result:** that child pid terminates; never `ready`.  **Observed how:** `kill(pid,0)`.

### TC-024 — Supervisor gives up after 5 restarts (≈ 12 s)
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** child that exits at once.  **Expected result:** 6 exits reported (first + 5 restarts), then `down` for good.  **Observed how:** `onExit` count.

### TC-025 — `stt.transcribe`: trim, noise lines dropped, answers matched by id
- **Verifies:** REQ-001  **Level:** integration  **Mode:** automated
- **Steps:** double prints a non-JSON line before `ready` and between answers; two concurrent requests answered out of order.  **Expected result:** `ready` reached; texts trimmed; each caller gets its own text.  **Observed how:** return values.

### TC-026 — `stt.transcribe`: empty answer is `''`
- **Verifies:** REQ-003 (FX-008)  **Level:** integration  **Mode:** automated
- **Steps:** double answers `text:""`.  **Expected result:** `''`, `isNothingHeard` true, no throw.  **Observed how:** `equal`.

### TC-027 — `stt.transcribe` while starting → `not_ready`
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** double delays `ready` by 1.5 s; call at once, then after ready.  **Expected result:** 503 `not_ready`; later call succeeds.  **Observed how:** `assert.rejects`.

### TC-028 — `stt.transcribe` failures
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** error line; no answer (deadline 400 ms); late answer after the timeout; child exits mid-request; request while down.  **Expected result:** `failed` 502; `timeout` 504 at the deadline, late answer ignored and next request fine; `unavailable` 503 twice.  **Observed how:** error `code`/`status`, elapsed time.

### TC-029 — `bonsai.respond`: two calls with the specified parameters
- **Verifies:** REQ-004, REQ-006  **Level:** integration  **Mode:** automated
- **Steps:** respond with a "HAPPY" line; read the double's request log.  **Expected result:** `{reply, mood:'pleasant-high'}`; one reply call (REPLY_SAMPLING) and one mood call (MOOD_SAMPLING, `response_format` = MOOD_SCHEMA); both with `enable_thinking:false`.  **Observed how:** logged bodies.

### TC-030 — Mood fallback to `neutral`
- **Verifies:** REQ-006  **Level:** integration  **Mode:** automated
- **Steps:** mood value outside the five ids; mood call 500; unparseable answer; mood slower than the deadline (1.5 s).  **Expected result:** `mood:'neutral'`, reply unchanged, never an error, bounded by the deadline; a valid value is used.  **Observed how:** return values, elapsed.

### TC-031 — What each call sees
- **Verifies:** REQ-005, REQ-007  **Level:** integration  **Mode:** automated
- **Steps:** English line with Chinese history; Chinese/English mixed line; 40×200-char history.  **Expected result:** mood call carries only the line (no RECALL); reply call's last message is `line + "\n" + RECALL.en(<earlier user line>)` (and the line alone when the window has no user entry); reply call has the history (companion → assistant) and the language rule of the *line*; history cut to 10 entries (1 + 10 + 1 messages) by the weight budget 2000.  **Observed how:** logged bodies.

### TC-032 — Reply errors and shaping
- **Verifies:** REQ-004, REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** reply call 500; only-thinking reply; thinking + two sentences; four sentences.  **Expected result:** `failed` 502; `failed`; thinking stripped; two sentences.  **Observed how:** return values/errors.

### TC-033 — Reply deadline
- **Verifies:** REQ-011, REQ-008  **Level:** integration  **Mode:** automated
- **Steps:** reply slower than a 1.2 s deadline.  **Expected result:** `timeout` 504 at 1–3 s; next request works.  **Observed how:** elapsed, error.

### TC-034 — Not ready, died, stopped
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** call during `starting`; child exits mid-request; call after it is down.  **Expected result:** `not_ready` 503; `unavailable` 503; `unavailable` in < 2 s.  **Observed how:** `assert.rejects`, elapsed.

### TC-035 — Warm-up covers both prompts
- **Verifies:** REQ-010  **Level:** integration  **Mode:** automated
- **Steps:** read the double's log after `ready`.  **Expected result:** a reply call with "Hello" and a mood call were made before `ready`.  **Observed how:** logged bodies.

### TC-036 — llama-server arguments
- **Verifies:** REQ-009  **Level:** integration  **Mode:** automated
- **Steps:** read the argv the double was started with.  **Expected result:** `-m …Ternary-Bonsai-2-<size>-PQ2_0.gguf`, `--host 127.0.0.1`, own `--port`, `-c 32768`, `-np 2`, `-ngl 99`, `-fa on`, `--no-webui`.  **Observed how:** argv.

### Live — `tests/server-live.test.js` (needs the stack)
### TC-040 — Health
- **Verifies:** REQ-010  **Level:** integration  **Mode:** automated
- **Preconditions:** live stack ready.  **Steps:** `GET /api/health`.  **Expected result:** 200 `{ready:true, stt:"ready", bonsai:"ready"}`.  **Observed how:** `deepEqual`.

### TC-041 / TC-042 / TC-043 — Transcription accuracy (FX-005 / FX-006 / FX-007)
- **Verifies:** REQ-001 (FX-005 en, FX-006 en, FX-007 zh)  **Level:** integration  **Mode:** automated
- **Preconditions:** warm. **Steps:** POST `input.wav` (`audio/wav`) 3 times per fixture (meta `runs`).  **Expected result:** 200 `{text}`; WER (en) / CER (zh) vs `text_reference` ≤ 0.15 in every run (lowercase, punctuation removed).  **Observed how:** computed error rate in the assertion message. Note: FX-005's reference is confirmed by the user at Plan 2026-11-14; 

### TC-044 — Transcript language
- **Verifies:** REQ-002 (FX-005, FX-006, FX-007)  **Level:** integration  **Mode:** automated
- **Steps:** classify every transcript of TC-041..043 runs.  **Expected result:** en, en, zh in 3/3 runs each (6/6 for FX-006 + FX-007); no Cyrillic/kana/Hangul; no Traditional-only characters in the zh text (A4).  **Observed how:** `transcriptLanguage` per run.

### TC-045 — Silence
- **Verifies:** REQ-003 (FX-008)  **Level:** integration  **Mode:** automated
- **Steps:** POST FX-008 `input.wav` 3 times.  **Expected result:** each 200 with body exactly `{"text":""}`.  **Observed how:** `deepEqual` with `expected.json` body. (The page not adding a turn and not calling respond is DES-013 step 3, frontend; see TC-082.)

### TC-046 / TC-047 / TC-048 — Reply properties and mood (FX-001 / FX-002 / FX-003)
- **Verifies:** FX-001 → REQ-004, REQ-005, REQ-006; FX-002 → REQ-005, REQ-006, REQ-007; FX-003 → REQ-004, REQ-007  **Level:** integration  **Mode:** automated (+ manual TC-080..082)
- **Steps:** POST the fixture body 3 times; compute `reply_checks` with the `rules` of `meta.json`.  **Expected result:** each run equals `expected.json` exactly: FX-001 mood `pleasant-high` and en; FX-002 `unpleasant-low` and en; FX-003 mood in the five ids and zh; all property checks true.  **Observed how:** `deepEqual(actual, expected)`; replies are appended to `test-results/backend-replies.jsonl`.

### TC-049 — Mood accuracy (FX-004)
- **Verifies:** REQ-006 (FX-004)  **Level:** integration  **Mode:** automated
- **Steps:** 3 rounds × the 10 lines (history `[]`).  **Expected result:** every answer 200; ≥ 8/10 moods equal the label in each round.  **Observed how:** per-round hit count and the misses printed. Known risk (fixture meta `risk`): lines 05 and 10 ("刚到家", "just got home") may come back `pleasant-low`; one case of margin.

### TC-050 — Reply language (FX-004)
- **Verifies:** REQ-005 (FX-004)  **Level:** integration  **Mode:** automated
- **Steps:** the 30 replies of TC-049.  **Expected result:** the computed language of every reply equals the line's (30/30).  **Observed how:** list of mismatches. The "interface set to the other language" half cannot be set at this endpoint (UI language is never sent) — TC-084.

### TC-051 — Mixed-language lines follow the majority
- **Verifies:** REQ-005 (A3)  **Level:** integration  **Mode:** automated
- **Steps:** "我今天很happy" and "I really love eating 火锅 with my friends", 3 runs each.  **Expected result:** reply is Chinese-majority and English-majority respectively, 6/6.  **Observed how:** Han-vs-word count of the reply.

### TC-052 — Speed with 20 turns of history
- **Verifies:** REQ-008 (FX-006)  **Level:** integration  **Mode:** automated
- **Preconditions:** a 20-turn (40-entry) history; each iteration appends its own turn, so the window slides as in real use.  **Steps:** 5 × (transcribe FX-006, then respond with the transcript and the history).  **Expected result:** every iteration ≤ 10 s from audio sent to reply+mood received; each has a mood from the five ids.  **Observed how:** the five times printed. Known risk (03 handoff): once the window slides every turn is a cold prompt (≈ 10 s); a red here is a genuine finding.

### TC-053 — Malformed respond requests
- **Verifies:** REQ-011 (error mapping)  **Level:** integration  **Mode:** automated
- **Steps:** bad JSON; `{}`; missing/empty/whitespace/non-string `line`; `history` not an array; role `system`; empty or non-string text; entry without text; `text/plain`.  **Expected result:** every one 400 `{"error":"bad_request"}`.  **Observed how:** status and body.

### TC-054 — Respond boundaries
- **Verifies:** REQ-004, REQ-007  **Level:** integration  **Mode:** automated
- **Steps:** line of 1500 chars; 1501; padded `"  …  "`; 45-entry history; history text 1500; 1501.  **Expected result:** 200, 400, 200, 200, 200, 400.  **Observed how:** status.

### TC-055 — Body limits
- **Verifies:** REQ-011  **Level:** integration  **Mode:** automated
- **Steps:** respond body of 262,145+ bytes; transcribe body of 2,000,002 bytes.  **Expected result:** 413 `{"error":"too_large"}` for both.  **Observed how:** status and body.

### TC-056 — Non-seam audio is refused
- **Verifies:** REQ-001  **Level:** integration  **Mode:** automated
- **Steps:** `test_audio/hello.wav` (24 kHz Float32), stereo, 44.1 kHz, webm bytes, empty body, wrong content type.  **Expected result:** 400 `bad_request` each.  **Observed how:** status and body.

### TC-057 — 60 s recording
- **Verifies:** REQ-001 (FX-006)  **Level:** integration  **Mode:** automated
- **Steps:** FX-006 speech repeated to exactly 1,920,044 bytes (60 s).  **Expected result:** 200, non-empty text, < 12 s.  **Observed how:** status, text, elapsed.

### TC-058 — Routes
- **Verifies:** REQ-009, REQ-010  **Level:** integration  **Mode:** automated
- **Steps:** `GET /api/nope`; `GET /`; `GET /js/app.js`; `POST /`; raw `/../package.json`, `/%2e%2e/package.json`; `GET /api/health`.  **Expected result:** 404 `bad_request`; page served; 405; traversal 404/400 without file content; health 200.  **Observed how:** status, body.

### TC-059 — Loopback only
- **Verifies:** REQ-009  **Level:** integration  **Mode:** automated
- **Steps:** find the listener pid on the `COMPANION_URL` port and its children; `lsof -nP -i -a -p <pids>`.  **Expected result:** every address is `127.0.0.1` or `[::1]`; at least one socket seen.  **Observed how:** parsed lsof. (Wi-Fi off is TC-083.)

### Boot — `tests/server-boot.test.js` (`COMPANION_BOOT=1`; manual group, not in `npm test`: a third 9B instance and ~80 s warm-up, see §1)
### TC-070 — Ready within 120 s
- **Verifies:** REQ-010  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Preconditions:** models and compile caches present (A10); free ports chosen by the test.  **Steps:** spawn `node server/main.js` (= `npm start`).  **Expected result:** prints `就绪 Ready: http://127.0.0.1:<port>` ≤ 120 s; health ready.  **Observed how:** captured stdout and timer. A first-ever run (≈ 390 s ANE compile) is out of scope by A10 and shows as a failure with that note.

### TC-071 — First voice turn ≤ 10 s
- **Verifies:** REQ-010, REQ-008 (FX-006)  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** transcribe FX-006, respond with the text.  **Expected result:** 200 with reply and a mood; ≤ 10 s total.  **Observed how:** timer.

### TC-072 — Loopback after real turns
- **Verifies:** REQ-009  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** 3 voice turns, then `lsof -nP -i -a -p` on the server and its children.  **Expected result:** loopback only; ≥ 2 children.  **Observed how:** parsed lsof.

### TC-073 — Log hygiene
- **Verifies:** REQ-009 (A9, NFR Observability)  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** send a line with a unique marker; scan stdout.  **Expected result:** the marker and the transcript text never appear; every `{`-line is JSON with an event from DES §6 (the 16 events of the table after be-architect #4); `stt_done` and `respond_done` present.  **Observed how:** regex over captured stdout.

### TC-074 — Bonsai child killed
- **Verifies:** REQ-011  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** SIGKILL the test's own llama-server child; call `/api/respond`; check health; poll until it works.  **Expected result:** 503 `unavailable` or `not_ready` in < 2 s; health `ready:false`; success again after the restart (≤ 120 s).  **Observed how:** status, timer. Only the child of the PID the test started is killed.

### TC-075 — STT child killed
- **Verifies:** REQ-011  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** as TC-074 for `companion-stt`.  **Expected result:** 503 in < 2 s; success after restart (≤ 700 s allows a re-load).  **Observed how:** status, timer.

### TC-076 — Clean stop
- **Verifies:** REQ-010  **Level:** e2e  **Mode:** manual (boot suite, `COMPANION_BOOT=1`)
- **Steps:** SIGTERM the test's server.  **Expected result:** exits; its children are gone; port closed.  **Observed how:** `kill(pid,0)`, failed fetch.

### Manual — human judgement or things the harness cannot do
### TC-080 — The reply answers the internship news
- **Verifies:** REQ-004 (FX-001)  **Level:** e2e  **Mode:** manual
- **Steps:** read the FX-001 replies from `test-results/backend-replies.jsonl` (tags `FX-001#0..2`).  **Expected result:** each responds to getting the internship, not a generic filler.  **Observed how:** reviewer notes in the report.

### TC-081 — Context use after the sad line
- **Verifies:** REQ-007 (FX-002)  **Level:** e2e  **Mode:** manual
- **Steps:** read tags `FX-002#0..2`.  **Expected result:** ≥ 2 of 3 mention the internship or the mixed feelings.  **Observed how:** reviewer count.

### TC-082 — Exam context and Simplified characters
- **Verifies:** REQ-007, REQ-004 (FX-003)  **Level:** e2e  **Mode:** manual
- **Steps:** read tags `FX-003#0..2`.  **Expected result:** ≥ 2 of 3 mention the exam (考试); only Simplified characters (A4).  **Observed how:** reviewer count.

### TC-083 — Wi-Fi off, three voice turns
- **Verifies:** REQ-009  **Level:** e2e  **Mode:** manual
- **Preconditions:** Wi-Fi off; models and caches local.  **Steps:** `npm start`; speak 3 turns in the page; run `lsof -i -n -P` for the server and its children.  **Expected result:** 3 turns succeed; only loopback addresses.  **Observed how:** screen/terminal record.

### TC-084 — Page: reply language ignores the interface language; empty transcript adds no turn
- **Verifies:** REQ-005, REQ-003  **Level:** e2e  **Mode:** manual
- **Preconditions:** page via `npm start`; frontend seam (DES-013..015) built.  **Steps:** set the interface to the other language and send the FX-004 lines (typed, or spoken) three times; separately hold the talk button over silence.  **Expected result:** 30/30 replies in the line's language; silence adds no turn and no reply request.  **Observed how:** page and network panel.

### TC-085 — Page: interface language switch
- **Verifies:** REQ-012  **Level:** e2e  **Mode:** manual
- **Steps:** Chinese UI with an existing reply → switch to English.  **Expected result:** no Han character outside the chat log; existing replies unchanged.  **Observed how:** browser inspection. (Frontend-only; not covered by the backend suites.)

### TC-086 — Page: slow, down and error states keep the user's words
- **Verifies:** REQ-011  **Level:** e2e  **Mode:** manual
- **Steps:** stop the test's own server (not the preview), send a line; restart it; send again.  **Expected result:** hint within 2 s, text still in the box, resend succeeds.  **Observed how:** page. The backend half (503 ≤ 2 s, recovery) is TC-034, TC-074, TC-075.

### TC-087 — Malformed request-target does not crash the gateway (FND-001)
- **Verifies:** REQ-011, REQ-009  **Level:** integration  **Mode:** automated
- **Preconditions:** a throwaway `http.createServer(route)` on a free port (never a live server).  **Steps:** raw socket `GET //` and `GET http://[`, then `GET /api/nope`.  **Expected result:** the first two answer 400 `{"error":"bad_request"}`; the third 404; no uncaught exception (03 DES-001, §3).  **Observed how:** raw response text.

### TC-088 — llama-server refuses web origins and keyless calls (FND-003)
- **Verifies:** REQ-009  **Level:** integration  **Mode:** automated
- **Preconditions:** live stack, llama-server on live port + 1 (BONSAI_URL overrides).  **Steps:** GET /health and OPTIONS /v1/chat/completions with a foreign Origin; POST /v1/chat/completions with no key.  **Expected result:** no Access-Control-Allow-Origin equal to that origin or `*`, no credentials echo; POST 401 (DES-007).  **Observed how:** response headers and status.

### TC-089 — Generated noise is not a transcript (FND-002)
- **Verifies:** REQ-003  **Level:** integration  **Mode:** automated
- **Preconditions:** live stack.  **Steps:** build in the test two 2 s 16 kHz mono PCM16 WAVs (seeded white noise RMS ~0.03; 120 Hz sine RMS ~0.03), POST each to /api/transcribe 3 times.  **Expected result:** 200 `{"text":""}` on all 6 calls (DES-011).  **Observed how:** response body. No locked fixture; inputs generated.

## 4. Negative, boundary and failure cases
Bad input: TC-003, TC-004, TC-053, TC-054, TC-055, TC-056. Boundaries: 1500/1501 chars, 40-entry and weight-2000 history window, 120 chars / 40 words, 2,000,000-byte and 262,144-byte bodies, 60 s audio (TC-004, TC-011, TC-013, TC-054, TC-055, TC-057). Dependency down, slow or dying: TC-022..024, TC-027, TC-028, TC-033, TC-034, TC-074, TC-075, TC-087. Wrong or missing output: TC-009, TC-030, TC-032 (thinking only, junk mood). Silence and noise: TC-002, TC-020, TC-026, TC-045, TC-089. Traversal: TC-019, TC-058. Privacy: TC-006, TC-073. Duplicate/concurrent: out-of-order concurrent transcriptions in TC-025.

## 5. Coverage matrix
| REQ | Test cases | Level |
|---|---|---|
| REQ-001 | TC-001, 003, 004, 025, 041–044, 056, 057 | unit, integration |
| REQ-002 | TC-044 (FX-005..007) | integration |
| REQ-003 | TC-002, 020, 026, 045 (FX-008), 089; page half TC-084 | unit, integration, manual |
| REQ-004 | TC-009–011, 014, 029, 032, 046, 048, 054, 080, 082 | unit, integration, manual |
| REQ-005 | TC-008, 012, 031, 037, 046, 047, 050, 051, 084 | unit, integration, manual |
| REQ-006 | TC-014, 029, 030, 046, 047, 049 | unit, integration |
| REQ-007 | TC-012, 013, 031, 047, 048, 054, 081, 082 | unit, integration, manual |
| REQ-008 | TC-013, 033, 052, 071 | unit, integration, e2e |
| REQ-009 | TC-015, 017, 019, 036, 058, 059, 072, 073, 083, 087, 088 | unit, integration, e2e, manual |
| REQ-010 | TC-015–018, 038, 021, 035, 040, 058, 070, 071, 076 | unit, integration, e2e |
| REQ-011 | TC-005–007, 016, 038, 021–024, 027, 028, 030, 032–034, 053, 055, 074, 075, 086 | unit, integration, e2e, manual |
| REQ-012 | TC-085 | manual (frontend) |

Fixtures: FX-001 TC-046; FX-002 TC-047; FX-003 TC-048; FX-004 TC-049, 050, 051; FX-005 TC-001, 041, 044; FX-006 TC-001, 042, 044, 052, 057, 071; FX-007 TC-001, 043, 044; FX-008 TC-002, 020, 026, 045.

Requirements with no automated test case: REQ-012 (manual TC-085 only). REQ-013 is below the cut (Q1) and not planned.

## 6. Untestable requirements
| REQ | Why not testable now | What would make it testable |
|---|---|---|
| REQ-012 | Frontend-only (DES-015); no endpoint, no backend output | A browser test of `web/` (fe-engineer / fe-tester): switch the language, assert no Han outside the log |
| REQ-005 (UI half), REQ-003 (page half) | The interface language and the page's "no new turn" behaviour never reach `/api/*` | The same browser test with the real seam; until then TC-084 |
| REQ-009 (Wi-Fi off) | The harness cannot switch Wi-Fi; loopback-only is checked via `lsof` (TC-059, TC-072) | A person runs TC-083 |
| REQ-004 / REQ-007 meaning checks | "responds to the news / mentions the exam" needs judgement | A rubric or a second model-free keyword check agreed with the user; until then TC-080..082 |
| REQ-001 with a real human voice | FX-006/007 are `say`-synthesised (A15); FX-005's words were confirmed by the user at Plan (2026-11-14) | User supplies real recordings |
