# Test Report — 离线小伙伴 backend (run companion-full-dev)

- Author: be-tester #2 (Backend Phase 5)
- Round: 1   Date: 2026-11-14 (log timestamps 2026-11-15 UTC)
- Commit / working tree: uncommitted on branch companion-full-dev (HEAD b21bb25); server code as left by be-developer #1 round 3

> Every result below was produced by a command that actually ran. Anything not executed is recorded as `blocked`, never as a pass.

## 1. Summary
| Result | Count |
|---|---|
| Pass | 66 |
| Fail | 2 |
| Blocked | 4 |

72 TCs: 65 automated (64 pass, 1 fail TC-073), 7 manual (TC-080, 082 pass; TC-081 fail; TC-083..086 blocked).

## 2. Commands executed
```
$ COMPANION_URL=http://127.0.0.1:4400 npm run test:backend      # live instance, node 82765 (not touched)
 -> docs/backend/logs/be-tester-2-live.log   tests 58, pass 58, fail 0, skipped 0 (boot suite skipped, COMPANION_BOOT unset: 1 suite-level skip)
exit 0
$ COMPANION_BOOT=1 COMPANION_URL=http://127.0.0.1:4400 npm run test:backend   # boot suite starts/stops its own server on free ports
 -> docs/backend/logs/be-tester-2-boot.log   tests 65, pass 64, fail 1 (TC-073), skipped 0
exit 1
$ curl seam probes on 127.0.0.1:4400 (respond, transcribe, health, bad json, junk wav, 300 kB body)
 -> 200 {"reply","mood"} / 200 {"text"} / 200 {"ready","stt","bonsai"} / 400 {"error":"bad_request"} x2 / 413 {"error":"too_large"}
```
JUnit: `test-results/junit-backend.xml` (overwritten by the second run). Replies: `test-results/backend-replies.jsonl`. Node runs the four files in parallel, so in the boot run the live file and the boot file overlapped on the machine (TC-052 was 6.0-6.5 s there vs 4.9-5.2 s alone; both under 10 s, so no solo re-run was needed). Port 4317/4399 never targeted.

## 3. Results by case
| TC | REQ | Result | Evidence |
|---|---|---|---|
| TC-001 | REQ-001 | pass | live log, server-unit |
| TC-002 | REQ-003 | pass | same |
| TC-003..TC-020 (incl. 037, 038) | REQ-001..011 | pass | each ✔ in be-tester-2-live.log |
| TC-021..TC-036 | REQ-009..011, 001, 003..007 | pass | server-fakes, all ✔ (TC-024 17.0 s) |
| TC-040 | REQ-010 | pass | health {ready,stt,bonsai} ready |
| TC-041 / 042 / 043 | REQ-001 | pass | WER/CER <= 0.15 in all 3 runs each, FX-005/006/007 |
| TC-044 | REQ-002 | pass | en/en/zh 3/3, Simplified |
| TC-045 | REQ-003 | pass | `{"text":""}` x3, FX-008 |
| TC-046 / 047 / 048 | REQ-004..007 | pass | FX-001/002/003 equal expected.json x3 |
| TC-049 | REQ-006 | pass | 9/10 in each round; miss FX-004-05 "刚到家"? labelled neutral, got pleasant-low, all 3 rounds (margin 1, known risk) |
| TC-050 | REQ-005 | pass | 30/30 |
| TC-051 | REQ-005 | pass | 6/6 |
| TC-052 | REQ-008 | pass | live-only run 5045/5245/4942/4977/5132 ms; boot-run overlap 6055/6170/6364/6142/6451 ms |
| TC-053..TC-059 | REQ-001, 004, 007, 009..011 | pass | live log |
| TC-070 | REQ-010 | pass | boot log |
| TC-071 | REQ-010/008 | pass | 6126 ms |
| TC-072 | REQ-009 | pass | loopback only after 3 turns |
| TC-073 | REQ-009 | **fail** | see §4 |
| TC-074 | REQ-011 | pass | 503 < 2 s, recovered |
| TC-075 | REQ-011 | pass | 503 < 2 s, recovered |
| TC-076 | REQ-010 | pass | children gone, port closed |
| TC-080 | REQ-004 | pass | manual, judged below |
| TC-081 | REQ-007 | **fail** | manual, judged below |
| TC-082 | REQ-007, 004 | pass | manual, judged below |
| TC-083 | REQ-009 | blocked | §5 |
| TC-084 | REQ-005, 003 | blocked | §5 |
| TC-085 | REQ-012 | blocked | §5 |
| TC-086 | REQ-011 | blocked | §5 |

Manual judgement (by be-tester #2 reading `test-results/backend-replies.jsonl`, the 01:15 run, FX tags #0..2; the 01:13 run read too):
- TC-080 (FX-001): "That's amazing news! Congratulations on getting the internship." / "That's amazing news! How is your new job making you feel?" / "That is awesome news! 🎉 How are you feeling about it?" All celebrate the news; #0 names the internship, #1 "new job" is close. Pass (borderline on #1/#2 being general).
- TC-081 (FX-002): needs >= 2/3 mentioning the internship or the mixed feelings. 01:15 run: only #2 ("so excited earlier") does; #0 and #1 answer the loneliness only. 01:13 run: #0 ("after celebrating the big win") does; #1 no; #2 ("brave for taking this step") only implicit. 1/3 in both runs, so fail. Earlier runs in the file (23:59, 00:48, 00:51) reached 2/3 or 3/3; the behaviour is sampling-dependent, not a reproducible break.
- TC-082 (FX-003): 01:15 run: #0 "考试成功已经很棒了", #1 "刚才考完试的开心瞬间" mention the exam; #2 refers to 刚才的开心 without the exam. 2/3, pass. All characters Simplified.

FX results: FX-001 pass (TC-046), FX-002 pass (TC-047), FX-003 pass (TC-048), FX-004 pass (TC-049/050/051; line 05 misses every round, margin 1 of 10), FX-005 pass (TC-001/041/044), FX-006 pass (TC-001/042/044/052/057/071), FX-007 pass (TC-001/043/044), FX-008 pass (TC-002/020/026/045). Fixtures loaded, never edited (`git status` clean for tests/fixtures).

Seam check (contracts/FRONTEND_BACKEND_CONTRACT.md seam table), backend side: `/api/respond` 200 `{reply, mood}` JSON, both strings, mood in the five ids (TC-046..048, probe above); `/api/transcribe` 200 `{text}`, empty string for silence (TC-045); `/api/health` always 200 `{ready, stt, bonsai}` with values starting|ready|down (TC-040, TC-058, TC-074 sees ready:false). Six codes: CODES = not_ready 503, unavailable 503, timeout 504, failed 502, bad_request 400, too_large 413 (TC-005); at HTTP level observed bad_request 400, too_large 413, not_ready/unavailable 503 (TC-074/075), body `{"error":code}` everywhere. `timeout` 504 and `failed` 502 are verified at module level (TC-028, 032, 033) and by the sendError mapping (TC-006), not over a live HTTP request (no way to force them on the real stack without edits). Seam matches.

## 4. Failures
### TC-073 — Log hygiene (boot suite)
- **Symptom:** a log line whose `event` is not in the test's allow-list.
- **Actual output:** `AssertionError: {"t":"2026-11-15T01:15:16.233Z","level":"info","event":"stt_warm","load_ms":1452,"warm_ms":1358}` at tests/server-boot.test.js:65. No user text leaked (the marker check passed first).
- **Suspected cause:** `server/stt.js:68` logs an event `stt_warm` that is not in 03 §6 (the table the test follows). Either 03 §6 is missing the event (design amendment) or the code should not emit it. Privacy is unaffected (only timings). Not a test defect: the test mirrors the design table.
- **Severity:** minor

### TC-081 — Context use after the sad line (manual)
- **Symptom:** 1 of 3 replies mentions the internship or the mixed feelings (needed 2), in both runs this round.
- **Actual output:** see §3 manual judgement; replies are on-topic for the loneliness but do not tie back to the news.
- **Suspected cause:** prompt/sampling leaves context use to chance (REPLY_SAMPLING, windowed history); earlier runs of the same fixture met the bar, so it is flaky rather than broken.
- **Severity:** minor

## 5. Blocked cases
| TC | Reason blocked | What is needed to unblock |
|---|---|---|
| TC-083 | Needs Wi-Fi switched off and a person speaking 3 turns in the page; the harness cannot do either (loopback-only is covered by TC-059/072, both pass) | The user runs it |
| TC-084 | Needs the page with the UI language switched and a real/typed run of FX-004 lines plus holding the talk button over silence (frontend); the backend cannot see the UI language | fe-tester browser run |
| TC-085 | Frontend-only (REQ-012), no backend output | fe-tester browser inspection |
| TC-086 | Needs the page and a stopped/restarted server; I may not stop the live instance (4400) or the preview/capture instances. Backend half passes (TC-034, 074, 075) | fe-tester with its own server |

## 6. Requirement verdict
| REQ | Verified? | Basis |
|---|---|---|
| REQ-001 | yes | TC-001, 003, 004, 025, 041-043, 056, 057 |
| REQ-002 | yes | TC-044 (synthesised audio, A15) |
| REQ-003 | backend yes, page half not | TC-002, 020, 026, 045; TC-084 blocked |
| REQ-004 | yes (one manual note) | TC-009-011, 014, 029, 032, 046, 048, 054, 080, 082 |
| REQ-005 | backend yes, UI half not | TC-008, 012, 031, 037, 046, 047, 050, 051; TC-084 blocked |
| REQ-006 | yes | TC-014, 029, 030, 046, 047, 049 |
| REQ-007 | partly | automated TC-012, 013, 031, 047, 048, 054 pass; manual TC-081 fails (context use not reliable) |
| REQ-008 | yes | TC-013, 033, 052 (<= 6.5 s), 071 (6.1 s) |
| REQ-009 | partly | TC-015, 017, 019, 036, 058, 059, 072 pass; TC-073 fails (extra log event, no leak); TC-083 blocked |
| REQ-010 | yes | TC-015-018, 021, 035, 038, 040, 058, 070, 071, 076 |
| REQ-011 | backend yes | TC-005-007, 016, 021-024, 027, 028, 030, 032-034, 053, 055, 074, 075; TC-086 page half blocked |
| REQ-012 | no | TC-085 blocked (frontend) |
