# Test Report — 离线小伙伴 backend (run companion-full-dev)

- Author: be-tester #5 (Backend Phase 5, round 4: review-fix tests TC-015, TC-073 allow-list, TC-087..089)
- Date: 2026-11-14 (log timestamps 2026-11-15 UTC)
- Commit / working tree: HEAD 2ecca73 plus test edits; server node 61506 (be-developer #4) on 127.0.0.1:4400, llama-server on 4401 (not touched; 4317 never targeted)

> Every result below comes from the one `npm test` run of this round (log `docs/backend/logs/be-tester-5-npm-test.log`, junit `test-results/junit.xml`), or is marked manual or blocked. Nothing is reported as a pass that was not observed in this run.

## 1. Summary
| Result | Count |
|---|---|
| Pass | 60 |
| Fail | 0 |
| Blocked | 11 |

71 TCs: 57 automated (all pass, each present by name in `test-results/junit.xml`), 14 manual (TC-080, 081, 082 pass; TC-070..076 and TC-083..086 blocked). Skipped in `npm test`: 0.

Known issues accepted by the user on 2026-11-15 (no further fixes): TC-050, TC-052, TC-055. All three passed in this run, so they are recorded as `pass` and noted as flaky in §3. Review-fix round 4: TC-015 now expects bonsaiBootMs 300000 (DES-002) and passes; new TC-087 (FND-001), TC-088 (FND-003), TC-089 (FND-002) pass.

## 2. Commands executed
```
$ npm test            # http://127.0.0.1:4400 up (HTTP 200 checked before the run); unit + fakes + live suites
 -> docs/backend/logs/be-tester-5-npm-test.log   tests 145, pass 145, fail 0, skipped 0, duration 202 s   exit 0
 -> test-results/junit.xml
```
Replies read for the manual TCs: the last run in `test-results/backend-replies.jsonl` (the file also holds earlier runs). Ports 4399, 4317 never targeted; 4400 only read from.

## 3. Results by case
One row per TC. `Mode` is automated unless stated.

| TC | REQ | Mode | Result | Evidence |
|---|---|---|---|---|
| TC-001 | REQ-001 | automated | pass | WAV seam-format fixtures parse - ✔ in junit.xml / log |
| TC-002 | REQ-003 | automated | pass | 2 s silence WAV - ✔ in junit.xml / log |
| TC-003 | REQ-001 | automated | pass | non-seam formats bad_request - ✔ in junit.xml / log |
| TC-004 | REQ-001 | automated | pass | stays in buffer - ✔ in junit.xml / log |
| TC-005 | REQ-011 | automated | pass | error codes/statuses - ✔ in junit.xml / log |
| TC-006 | REQ-011 | automated | pass | sendError mapping - ✔ in junit.xml / log |
| TC-007 | REQ-011 | automated | pass | sendError after headers - ✔ in junit.xml / log |
| TC-008 | REQ-005 | automated | pass | languageOf - ✔ in junit.xml / log |
| TC-009 | REQ-004 | automated | pass | shapeReply thinking/quotes - ✔ in junit.xml / log |
| TC-010 | REQ-004 | automated | pass | shapeReply sentence/question caps - ✔ in junit.xml / log |
| TC-011 | REQ-004 | automated | pass | shapeReply length caps - ✔ in junit.xml / log |
| TC-012 | REQ-007 | automated | pass | toMessages (RECALL on last user message) - ✔ in junit.xml / log |
| TC-013 | REQ-007 | automated | pass | windowOf - ✔ in junit.xml / log |
| TC-014 | REQ-004, REQ-006 | automated | pass | prompt constants - ✔ in junit.xml / log |
| TC-015 | REQ-009, REQ-010 | automated | pass | config values incl. bonsaiBootMs 300000 (DES-002) - ✔ in junit.xml / log |
| TC-016 | REQ-010, REQ-011 | automated | pass | bonsaiFiles/missingFiles - ✔ in junit.xml / log |
| TC-017 | REQ-009 | automated | pass | sources and scripts - ✔ in junit.xml / log |
| TC-018 | REQ-010 | automated | pass | serveStatic basics - ✔ in junit.xml / log |
| TC-019 | REQ-009 | automated | pass | serveStatic cannot leave root - ✔ in junit.xml / log |
| TC-020 | REQ-003 | automated | pass | isNothingHeard - ✔ in junit.xml / log |
| TC-021 | REQ-010, REQ-011 | automated | pass | supervisor starting to ready - ✔ in junit.xml / log |
| TC-022 | REQ-011 | automated | pass | supervisor restart - ✔ in junit.xml / log |
| TC-023 | REQ-011 | automated | pass | failed warm kills child - ✔ in junit.xml / log |
| TC-024 | REQ-011 | automated | pass | gives up after 5 restarts - ✔ in junit.xml / log |
| TC-025 | REQ-001 | automated | pass | stt.transcribe trim/noise/id - ✔ in junit.xml / log |
| TC-026 | REQ-003 | automated | pass | stt empty answer - ✔ in junit.xml / log |
| TC-027 | REQ-011 | automated | pass | stt not_ready - ✔ in junit.xml / log |
| TC-028 | REQ-011 | automated | pass | stt failures - ✔ in junit.xml / log |
| TC-029 | REQ-004, REQ-006 | automated | pass | bonsai.respond two calls - ✔ in junit.xml / log |
| TC-030 | REQ-006, REQ-011 | automated | pass | mood fallback neutral - ✔ in junit.xml / log |
| TC-031 | REQ-007, REQ-005 | automated | pass | what each call sees (RECALL) - ✔ in junit.xml / log |
| TC-032 | REQ-004, REQ-011 | automated | pass | reply errors/shaping - ✔ in junit.xml / log |
| TC-033 | REQ-008, REQ-011 | automated | pass | reply deadline - ✔ in junit.xml / log |
| TC-034 | REQ-011 | automated | pass | not ready/died/stopped - ✔ in junit.xml / log |
| TC-035 | REQ-010 | automated | pass | warm-up both prompts - ✔ in junit.xml / log |
| TC-036 | REQ-009 | automated | pass | llama-server arguments - ✔ in junit.xml / log |
| TC-037 | REQ-005 | automated | pass | languageOf worked examples - ✔ in junit.xml / log |
| TC-038 | REQ-010 | automated | pass | missingHints - ✔ in junit.xml / log |
| TC-040 | REQ-010 | automated | pass | health all ready - ✔ in junit.xml / log |
| TC-041 | REQ-001 | automated | pass | WER FX-005 - ✔ in junit.xml / log |
| TC-042 | REQ-001 | automated | pass | WER FX-006 - ✔ in junit.xml / log |
| TC-043 | REQ-001 | automated | pass | CER FX-007 - ✔ in junit.xml / log |
| TC-044 | REQ-002 | automated | pass | transcript language - ✔ in junit.xml / log |
| TC-045 | REQ-003 | automated | pass | silence returns empty text - ✔ in junit.xml / log |
| TC-046 | REQ-004..007 | automated | pass | FX-001 properties - ✔ in junit.xml / log |
| TC-047 | REQ-004..007 | automated | pass | FX-002 properties - ✔ in junit.xml / log |
| TC-048 | REQ-004..007 | automated | pass | FX-003 properties - ✔ in junit.xml / log |
| TC-049 | REQ-006 | automated | pass | FX-004 mood >= 8/10 x3 - ✔ in junit.xml / log |
| TC-050 | REQ-005 | automated | pass | FX-004 reply language 30/30 - ✔ in junit.xml / log; known issue, accepted by user 2026-11-15: a zh reply sometimes contains one English word (e.g. "brainstorm"); did not occur in this run, so it passes here; flaky |
| TC-051 | REQ-005 | automated | pass | mixed-language majority - ✔ in junit.xml / log |
| TC-052 | REQ-008 | automated | pass | 20-turn history, <= 10 s x5 - ✔ in junit.xml / log; known issue, accepted by user 2026-11-15: latency can exceed 10 s under memory pressure; every timing was within the limit in this run, so it passes here; flaky (test took 37 s in total) |
| TC-053 | REQ-011 | automated | pass | malformed respond requests - ✔ in junit.xml / log |
| TC-054 | REQ-004, REQ-007 | automated | pass | respond boundaries - ✔ in junit.xml / log |
| TC-055 | REQ-011 | automated | pass | 413 body limits - ✔ in junit.xml / log; known issue, accepted by user 2026-11-15: 413 sometimes arrives as ECONNRESET under load; did not occur in this run, so it passes here; flaky |
| TC-056 | REQ-001, REQ-011 | automated | pass | non-seam audio refused - ✔ in junit.xml / log |
| TC-057 | REQ-001 | automated | pass | 60 s recording - ✔ in junit.xml / log |
| TC-058 | REQ-009, REQ-010 | automated | pass | routes - ✔ in junit.xml / log |
| TC-059 | REQ-009 | automated | pass | loopback only - ✔ in junit.xml / log |
| TC-070 | REQ-010 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-071 | REQ-008 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-072 | REQ-009 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-073 | REQ-009, REQ-011 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-074 | REQ-011 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-075 | REQ-011 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-076 | REQ-011 | manual | blocked | boot group, blocked: manual mode; see §5 |
| TC-080 | REQ-004 | manual | pass | judged from this run's replies, below |
| TC-081 | REQ-007 | manual | pass | judged from this run's replies, below (3 of 3) |
| TC-082 | REQ-007, REQ-004 | manual | pass | judged from this run's replies, below (3 of 3, Simplified) |
| TC-083 | REQ-009 | manual | blocked | Wi-Fi off and a person speaking; see §5 |
| TC-084 | REQ-003, REQ-005 | manual | blocked | page, UI language switched; see §5 |
| TC-085 | REQ-012 | manual | blocked | frontend only; see §5 |
| TC-086 | REQ-011 | manual | blocked | page plus a stopped server; see §5 |
| TC-087 | REQ-011, REQ-009 | automated | pass | FND-001: "//" and "http://[" -> 400 bad_request on a throwaway server, still answers after - ✔ in junit.xml / log |
| TC-088 | REQ-009 | automated | pass | FND-003: 4401 foreign Origin gets no matching ACAO (`none`), keyless POST 401 - ✔ in junit.xml / log |
| TC-089 | REQ-003 | automated | pass | FND-002: generated white noise and 120 Hz hum, `{"text":""}` 3 of 3 each - ✔ in junit.xml / log |

Manual judgement by be-tester #4, reading the last run in `test-results/backend-replies.jsonl` (FX tags #0..2):
- TC-080 (FX-001), 3 replies: "That is amazing news! I am so happy for you.", "...I can't wait to hear all about it later.", "...How are you feeling about starting soon?". All celebrate the news; warm but generic (none names the internship). Pass, borderline.
- TC-081 (FX-002; bar >= 2 of 3 mention the internship or the mixed feelings): 3 of 3. "tough news after getting that awesome internship", "That internship is such a big step! ... lonely when leaving everyone", "Moving away is hard even after such a big win like that internship". Pass.
- TC-082 (FX-003; bar >= 2 of 3 mention the exam, Simplified only): 3 of 3 mention the exam (考好了, 考试过, 考试过), with the friend quarrel as the sad part. All characters Simplified. Reply #1 is poor Chinese ("考试过心喜来...惹气") but meets the bar. Pass.

Fixtures, each exercised by a passing tagged test in `test-results/junit.xml` (loaded from their files, never edited):

| Fixture | Passing tagged tests |
|---|---|
| FX-001 | TC-046 |
| FX-002 | TC-047 |
| FX-003 | TC-048 |
| FX-004 | TC-049, TC-050, TC-051 |
| FX-005 | TC-001, TC-041, TC-044 |
| FX-006 | TC-001, TC-042, TC-044, TC-052, TC-057 |
| FX-007 | TC-001, TC-043, TC-044 |
| FX-008 | TC-002, TC-020, TC-026, TC-045 |

Seam check (contracts/FRONTEND_BACKEND_CONTRACT.md), backend side: `/api/respond` 200 `{reply, mood}` (TC-046..048); `/api/transcribe` 200 `{text}`, empty string for silence (TC-045); `/api/health` always 200 `{ready, stt, bonsai}` (TC-040, TC-058). Codes: TC-005; over HTTP bad_request 400 (TC-053, 056, 058), too_large 413 (TC-055); not_ready / unavailable / timeout / failed 502 at module level (TC-027, 028, 032, 033, 034) and through sendError (TC-006). The live-HTTP 503 after a kill is TC-074/075 (blocked). Seam matches as far as run.

## 4. Failures
None this run. Flaky, user-accepted known issues that passed this time: TC-050, TC-052, TC-055 (§3).

## 5. Blocked cases
| TC | Reason blocked | What is needed to unblock |
|---|---|---|
| TC-070 | Boot suite, manual mode (04 §1). Not run: it starts its own `node server/main.js`, a third 9B Bonsai instance beside 4400 on a 24 GB Mac, about 80 s to warm up, and SIGKILLs its own children | `COMPANION_BOOT=1 npm run test:backend` with the other instances stopped, or an orchestrator-approved slot |
| TC-071 | Same boot group reason | Same |
| TC-072 | Same boot group reason | Same |
| TC-073 | Same boot group reason (allow-list now lists the 17 events of 03 §6 incl. child_gave_up, not run) | Same |
| TC-074 | Same boot group reason (kills the Bonsai child) | Same |
| TC-075 | Same boot group reason (kills the STT child) | Same |
| TC-076 | Same boot group reason (clean stop) | Same |
| TC-083 | Needs Wi-Fi switched off and a person speaking 3 turns (loopback-only is covered by TC-059, which passes) | The user runs it |
| TC-084 | Needs the page with the UI language switched, FX-004 lines and the talk button held over silence | fe-tester browser run |
| TC-085 | Frontend-only (REQ-012) | fe-tester browser inspection |
| TC-086 | Needs the page and a stopped/restarted server; 4400 must not be stopped. Backend half: TC-034 passes | fe-tester with its own server |

## 6. Requirement verdict
| REQ | Verified? | Basis |
|---|---|---|
| REQ-001 | yes | TC-001, 003, 004, 025, 041, 042, 043, 056, 057 |
| REQ-002 | yes | TC-044 |
| REQ-003 | backend yes, page half not | TC-002, 020, 026, 045, 089; TC-084 blocked |
| REQ-004 | yes | TC-009, 010, 011, 014, 029, 032, 046, 048, 054, 080, 082 |
| REQ-005 | backend yes, UI half not | TC-008, 012, 031, 037, 046, 047, 050 (flaky, known), 051; TC-084 blocked |
| REQ-006 | yes | TC-014, 029, 030, 046, 047, 049 |
| REQ-007 | yes | TC-012, 013, 031, 047, 048, 054, 081, 082 |
| REQ-008 | yes (flaky under memory pressure, known) | TC-013, 033, 052; TC-071 blocked |
| REQ-009 | partly | TC-015, 017, 019, 036, 058, 059, 087, 088 pass; TC-072, 073, 083 blocked |
| REQ-010 | partly | TC-015, 016, 017, 018, 021, 035, 038, 040, 058 pass; TC-070, 071, 076 blocked |
| REQ-011 | partly | TC-005, 006, 007, 016, 021-024, 027, 028, 030, 032, 033, 034, 053, 055 (flaky, known), 087 pass; TC-074, 075, 086 blocked |
| REQ-012 | no | TC-085 blocked (frontend) |
