# Review Report — 离线小伙伴：真实转写、Bonsai 回复与情绪、中英文（backend）

- Compiled by: be-reviewer #1 (coordinator), filed by the orchestrator
- Panelists run: be-review-behavior #1, be-review-reliability #1, be-review-security #1 (the diff adds an HTTP surface, two supervised children and an audio path: all three lenses apply)
- Round: 1   Date: 2026-11-15
- Input: `docs/backend/logs/review-r1-candidates.md` (S-1..S-4, B-1..B-3, R-1..R-6). Known issues the user accepted (TC-050, TC-052, TC-055) are not findings.
- Evidence root: `/private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/` (`sec1/`, `be-review-behavior-1/`, `rel1/`), referred to below as `<scratch>`.

## 1. Verdict
**Send back to development.** One blocker: a single GET with the request-target `//` kills the gateway and both children (FND-001). Three majors: room noise becomes a user turn (FND-002), llama-server is open to any web origin (FND-003), and a failed llama-server start leaves the operator looking at "启动中 Starting…" with no cause (FND-004). I tried to disprove all 13 candidates and dropped none. S-1 and R-1 are one defect, which leaves 12 findings. Two of them need the design changed before code (FND-002 and FND-004 follow DES-011 and DES-007 as written). I corrected one panel number (B-1: 12/27, not 11/27), and new evidence makes R-6 stronger.

## 2. Findings
Owner: be-developer = code; be-architect = design silent or wrong (code follows it), then be-developer; be-tester = test gap.

| ID | Severity | Panelist | Where | REQ | Owner | Claim |
|---|---|---|---|---|---|---|
| FND-001 | blocker | security (S-1), reliability (R-1) | server/main.js:88 | REQ-011, REQ-009; DES-001 | be-developer | `new URL(req.url, …)` throws outside any try: request-target `//` or `http://[` crashes node, and the exit handler kills both children |
| FND-002 | major | behavior (B-1) | stt/Sources/CompanionSTT/main.swift:48 | REQ-003; DES-011 step 4 | be-architect → be-developer | Noise above the RMS 0.02 gate comes back as "Okay." / "so" / "you", and the page makes that a user turn and asks for a reply |
| FND-003 | major | security (S-2) | server/bonsai.js:149 | REQ-009 (NFR Security row); 02 O-4; DES-007 | be-architect → be-developer | llama-server runs with its default CORS (`*`, credentials echoed), so any web page can drive the model and read `/props` (model path with the home folder) |
| FND-004 | major | reliability (R-2) | server/bonsai.js:150 | REQ-010; DES-007 step 1, DES-004, §6 | be-architect → be-developer | llama-server stdout/stderr go to `ignore`. A start failure shows no cause, and after the restart cap the terminal still says only "启动中 Starting…" |
| FND-005 | minor | reliability (R-6) | server/config.js:37 | REQ-010; DES-002 | be-architect | `bonsaiBootMs` 60 s is below a measured 62.6 s cold 4B load. The default model is 9B |
| FND-006 | minor | reliability (R-5) | server/stt.js:101 | REQ-011; DES-006 step 5 | be-architect | A hung helper is never restarted. Every transcribe times out while `/api/health` says `stt: ready` |
| FND-007 | minor | security (S-4) | server/stt.js:100 | REQ-011; DES-006 | be-architect | No cap on in-flight transcriptions and no cancel on timeout. A retry queues behind the timed-out job in the serial helper loop |
| FND-008 | minor | reliability (R-3) | server/supervisor.js:22 | REQ-011; DES-004 step 4, §4 | be-architect | `restarts` never resets after a successful warm-up, so 5 recovered crashes over a session leave the 6th one down for good |
| FND-009 | minor | reliability (R-4) | server/main.js:157 | REQ-010; DES-001, DES-004 step 5 | be-developer | SIGKILL or SIGHUP to node leaves llama-server running. The next `npm start` then says port 4318 is in use and suggests BONSAI_PORT |
| FND-010 | minor | behavior (B-2) | server/bonsai.js:13 | REQ-004; DES-008 | be-developer | `SENTENCE` splits at decimal points and abbreviations: "3.5" → "3. 5", and the real second sentence is dropped |
| FND-011 | minor | security (S-3) | server/main.js:87 | REQ-009; DES-001 | be-architect | No Host check, so a DNS-rebound origin gets same-origin access to `/api/*` |
| FND-012 | minor | behavior (B-3) | tests/server-live.test.js:221 | REQ-001; TC-057 | be-tester | TC-057 passes on any non-empty text (3 of ~37 repetitions transcribed) and splices the FX-006 header bytes (FLLR chunk) into its PCM |

### FND-001 — A malformed request-target crashes the gateway and both children
- **Scenario:** Send GET with request-target `//` (or `http://[`) to the gateway. `route()` calls `new URL(req.url, 'http://localhost')` at server/main.js:88, outside the try at :96-100, and it throws `ERR_INVALID_URL`. The exception is uncaught, because `grep -rn "uncaught\|clientError" server/` finds nothing. The `process.on('exit', stopChildren)` handler (server/main.js:157) then stops stt and llama-server. The page loses its whole backend until someone runs `npm start` again and the models warm up again.
- **Evidence:** `<scratch>/sec1/srv.err` (input `//`, stack at main.js:88:16), `<scratch>/rel1/routecrash.out` (input `http://[`, "EXIT code 1"). Coordinator check: `node -e "new URL('//','http://localhost')"` → `ERR_INVALID_URL`.
- **Why blocker:** One request from any local client ends every function. A browser address of `http://127.0.0.1:4317//` would plausibly send `//` `[unverified: not run]`.
- **Suggested direction:** Parse the path inside a try and answer 400 `bad_request` on failure (DES-001 step "bad_request"). Add a test with the raw request-targets `//` and `http://[` against a throwaway `createServer(route)`.
- **Status:** open

### FND-002 — Room noise becomes a user turn
- **Scenario:** A 2 s noise recording (white noise at RMS 0.03/0.06/0.12, a 120 Hz hum with noise, or keyboard-like clicks) passes the energy gate at main.swift:48-51 (≥ 3 frames with RMS > 0.02). WhisperKit then decodes it (main.swift:84-97) and returns "Okay." / "Okay" / "so" / "you". The page treats non-empty text as speech, adds a user turn and calls respond. REQ-003 says noise → empty, with no turn and no reply request. DES-011 step 4 names "底噪" (background noise) as a case the gate must catch.
- **Evidence:** `<scratch>/be-review-behavior-1/noise-results.txt`: **12/27** calls non-empty (12/25 noise calls; the 2 `empty.wav` calls were empty). The panel's "11/27" is a miscount. The same file gives different results across calls. Inputs come from `<scratch>/be-review-behavior-1/noise.mjs`. Tests cover only digital zeros (FX-008).
- **Owner reason:** The code does what DES-011 specifies (energy gate at 0.02), and that mechanism does not deliver REQ-003's noise case. The design has to choose a working rule, for example a hallucination filter on output, a no-speech or logprob threshold, or a stronger gate. be-tester then needs a noise fixture.
- **Status:** open

### FND-003 — llama-server accepts any web origin
- **Scenario:** While the app runs, a page from any site fetches `http://127.0.0.1:4318/v1/chat/completions` or `/props` and can read the response. The bonsai.js:149 args set no `--cors-origins`, and the binary's default is `*` with credentials echoed. Architecture O-4 (`02-architecture.md:57`) and the seam text (`03-detailed-design.md:423`) say the browser never talks to llama-server directly and there is no CORS.
- **Evidence:** `<scratch>/sec1/llama.log:5` "security: no API key is set and CORS allows all origins". `samples/bonsai-models/gguf/bin/macos-arm64/llama-server --help` shows `--cors-origins ORIGINS … (default: *)` and `--cors-credentials … (default: enabled) … Origin header will be echoed back`. `<scratch>/sec1/props.json` contains `model_path` under `/Users/<user>/…`. `<scratch>/sec1/slots.json` has no prompt text, so I found no evidence that chat content leaks.
- **Suggested direction:** Amend the DES-007 argument list, for example with `--cors-origins` set to a value no web page matches, plus `--no-cors-credentials`, and add a test that an OPTIONS/GET with a foreign `Origin` gets no `Access-Control-Allow-Origin`.
- **Status:** open

### FND-004 — A failed llama-server start is silent for the operator
- **Scenario:** llama-server exits at start (port taken, bad model file, out of memory). bonsai.js:150 sends its stdout/stderr to `ignore`, so the cause ("couldn't bind HTTP server socket") is lost. stdout gets six `child_exit … code 1` lines, the last with `restarts: 5`. After that the poll at main.js:170-185 keeps returning on `!h.ready` without printing anything. The terminal shows only "启动中 Starting (…)…" and the process keeps running with nothing usable behind it. (`--warm-only` does print "预热失败", main.js:172-176.)
- **Evidence:** `<scratch>/rel1/instC.err` (2 lines, nothing after Starting), `<scratch>/rel1/instC.out` (six exits, code 1), `<scratch>/rel1/llama-direct.log:6` (the cause the gateway threw away).
- **Owner reason:** DES-007 step 1 prescribes "stdio ignore", and neither DES-001 nor §6 defines a terminal message for "a child is down for good". The design has to add that message (stage, cause, next step) and a way to surface llama-server's last error line.
- **Status:** open

### FND-005 — Bonsai boot deadline below a measured cold load
- **Scenario:** With a cold page cache or under memory pressure, llama-server takes longer than `bonsaiBootMs` = 60000 (server/config.js:37). `warm()` throws at bonsai.js:130, the supervisor kills the child and restarts it, and each such failure uses up one of the 5 restarts (see FND-008). This sits on the first-run path (`npm start`, REQ-010 ≤ 120 s), so it must not be deferred quietly.
- **Evidence:** `<scratch>/sec1/llama2.log:8-10`: a throwaway 4B llama-server reported "model loaded" at 1:02.575, which is 62.6 s and above 60 s, while other panelists' instances were running. The panel reports a 55 s cold 4B load. The default is 9B (server/config.js:20). A 9B cold load is `unmeasured`.
- **Status:** open

### FND-006 — A hung stt helper is never restarted
- **Scenario:** The helper stops answering without exiting. Every transcribe times out at 12 s (stt.js:101-104 only deletes the pending entry). Nothing kills or restarts the child, and `/api/health` keeps reporting `stt: ready`, so the page keeps offering voice that always fails. DES-006 step 5 specifies exactly this behaviour and has no recovery step.
- **Status:** open

### FND-007 — Unbounded, uncancelled transcriptions queue in the helper
- **Scenario:** A transcription that times out keeps running in the helper's serial loop (main.swift:124-126), and its late answer is discarded (stt.js:38). The user's retry, or any extra concurrent POST (stt.js:100-106 has no in-flight cap), queues behind it and can time out in turn. This shares a root with FND-006 (a timeout never touches the child), and one design decision can settle both.
- **Status:** open

### FND-008 — The restart cap counts for the whole session
- **Scenario:** `restarts` is set to 0 only at server/supervisor.js:12 and is incremented at :23. A successful `child_ready` (:43) never resets it. After 5 crashes that each recovered, the 6th leaves the child `down` until the next `npm start`. DES-004 step 4 and §4 ("restarts < 5") do not say whether the count is consecutive or lifetime.
- **Status:** open

### FND-009 — Killing node with SIGKILL or SIGHUP orphans llama-server
- **Scenario:** main.js:157-164 stops children on `exit`, SIGINT and SIGTERM only. A SIGKILL, or a SIGHUP sent to the node pid alone, kills node without the `exit` event, so llama-server keeps listening on 4318. (`grep -rn "SIGHUP\|detached" server/` finds nothing.) The stt helper exits on stdin EOF (main.swift:124). On the next `npm start`, `portAnswers` (main.js:141-143) reports "Port 4318 is in use: Set BONSAI_PORT", but the occupant is the app's own orphan. Closing the terminal window probably sends SIGHUP to the whole foreground process group, which would make that common path narrower `[unverified]`.
- **Status:** open

### FND-010 — shapeReply breaks sentences at decimal points
- **Scenario:** For an en reply, `shapeReply('You ran 3.5 miles today! That is so impressive.', 'en')` returns `You ran 3. 5 miles today!`. The text is mangled and the real second sentence is dropped. Other examples: "2.0" → "2. 0", and "Dr. Lee sounds kind. I hope it goes well." → "Dr. Lee sounds kind.". zh is unaffected because zh joins with '' (live: "太棒了，92.5 分真厉害！").
- **Evidence:** Coordinator re-ran `node <scratch>/be-review-behavior-1/shape.mjs`, output lines 1-3. In live calls `<scratch>/be-review-behavior-1/decimal-live.txt` no en reply contained a decimal, so how often this happens live is `unmeasured`.
- **Status:** open

### FND-011 — No Host header check (DNS rebinding)
- **Scenario:** A page on `rebind.attacker.example` re-resolves to 127.0.0.1. Its requests reach the gateway as same-origin, and `route()` (main.js:87-101) never checks `req.headers.host`, so the page can call `/api/respond` and `/api/transcribe` and read the results. Nothing is stored server-side, so the exposure is use of the models. The panel reports the live gateway accepted `Host: rebind.attacker.example`. I did not re-run this, per the brief.
- **Status:** open

### FND-012 — TC-057 does not verify 60 s transcription
- **Scenario:** tests/server-live.test.js:221 builds the 60 s PCM from `fx('FX-006').wav().subarray(44)`. FX-006 has a FLLR chunk at byte 36 (4044 bytes), and its `data` chunk starts at byte 4088. So every repetition carries about 4 KB of chunk bytes plus a `data` header as samples. :227 only asserts `text.length > 0`, so the test passes when 3 of ~37 repetitions come out (`<scratch>/be-review-behavior-1/tc057.out`). It would also pass if only the first seconds were transcribed. The product itself handled ~46 s of natural speech in full (`<scratch>/be-review-behavior-1/long-en.out` against `long-en.txt`), so this is a test gap, not a product defect.
- **Evidence:** Coordinator chunk walk of `tests/fixtures/approved/FX-006/input.wav`: `fmt  12 16`, `FLLR 36 4044`, `data 4088 48174`.
- **Suggested direction:** Extract the `data` chunk properly, and assert content over the whole 60 s, for example with natural long speech and a WER bound, or by checking that the last sentence is present.
- **Status:** open

## 3. Dropped by the coordinator
None. I could not disprove any candidate. S-1 and R-1 were merged into FND-001 (same line, same throw). Corrections that did not drop anything: B-1's count is 12/27, not 11/27 (`noise-results.txt`). R-6's evidence is stronger than filed: 62.6 s in `sec1/llama2.log:10`.

| Candidate | Panelist | Claim | Counter-evidence (`file:line` or command output) |
|---|---|---|---|

## 4. Deferred
None deferred by the coordinator. Every finding cites a REQ above the cut line. FND-005 sits on the first-run path (`npm start`), so if it is left at the round cap it must be listed at the stop, not deferred quietly.

## 5. Re-checks

| Round | FND | Fixed? | Evidence (`file:line` or command output) |
|---|---|---|---|
