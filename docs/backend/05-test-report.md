# Test Report — 离线小伙伴 backend (run companion-full-dev)

- Author: be-tester #7 (Backend Phase 5, increment 2, round 1); §7 brought up to date by be-tester #10 (round 3, after review fix round 1). Increment-1 sections 1-6 below are be-tester #5's, kept; only the TC-083 row, §5 and the §1 note were updated by #7. Increment 2 is §7.
- Date: 2026-11-15
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
| TC-083 | REQ-009 | manual | pass | passed by the user's own check at the P0 Acceptance stop (2026-11-14 ~23:45 EST): Wi-Fi off, `npm start`, 8-step check, "关掉Wi-Fi后可以成功运行，且效果比较好。我很满意。" (docs/backend/07-acceptance.md §8). The `lsof` loopback listing was not recorded; loopback is also covered by TC-059 (pass) |
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
| TC-083 | Not blocked any more: passed by the user's own check (see §3). | none |
| TC-084 | Needs the page with the UI language switched, FX-004 lines and the talk button held over silence | fe-tester browser run |
| TC-085 | Frontend-only (REQ-012) | fe-tester browser inspection |
| TC-086 | Needs the page and a stopped/restarted server; 4400 must not be stopped. Backend half: TC-034 passes | fe-tester with its own server |

Recount by be-tester #7: increment-1 automated TCs are 61 (TC-001..059 without TC-039, plus TC-087..089), all pass in the #7 run; the manual ones are 14. #5's "57 automated" was a miscount. The user's Acceptance check (07-acceptance.md §8) is the Wi-Fi-off `npm start` run with spoken English turns; it shows the server came up and answered offline, but it did not time the start (TC-070 120 s), kill children (TC-074, 075), stop the server (TC-076, TC-086) or list sockets (TC-072), so those stay not run. TC-084 and TC-085 (UI switch, FX-004 lines in the other language) are not shown covered by the user's check and stay with fe-tester.

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

## 7. Increment 2 (be-tester #7 round 1; updated by be-tester #10 round 3)

Date 2026-11-15. Working tree HEAD c4b7f23 plus uncommitted review-fix changes (round 3 run by be-tester #10). Instance A is node 31464. Instance A (127.0.0.1:4400, started by this run) was only read from; no Bonsai instance was started, no env value printed.

### 7.1 Summary (whole backend suite)
| Result | Count |
|---|---|
| Pass | 118 |
| Fail | 0 |
| Blocked | 13 |

131 TCs in total (inc. 1: 75, inc. 2: 56).
- Automated: 113 of 113 pass (inc. 1: 61, inc. 2: 52). Skipped 0. Every one is present by name in the `npm test` run of round 3 (300 tests, 300 pass).
- Manual passed: TC-080, 081, 082 (judged by #4, not re-read), TC-083 (user's check, §3), TC-135 (§7.4).
- Blocked (manual): TC-070..076 (7), TC-084, TC-085, TC-086, TC-133, TC-134, TC-136 (13, §7.5 and §5).

### 7.2 Commands run
```
$ npm test            # COMPANION_URL=http://127.0.0.1:4400 (default); instance A (node 31464) answered before the run
 -> docs/backend/logs/be-tester-10-npm-test.log   tests 300, pass 300, fail 0, cancelled 0, skipped 0, duration 563.8 s   exit 0
 -> test-results/junit.xml     (300 includes the frontend suites; 113 of them are backend TCs)
$ COMPANION_URL=http://127.0.0.1:4400 node --test --test-name-pattern="TC-125" tests/server-live.test.js     # run alone, 6 times
 -> docs/backend/logs/be-tester-10-tc125-run1.log .. run6.log   each: pass 1, fail 0   exit 0
```
No TC failed in round 3, so none was re-run apart from TC-125, which was re-run six times on request. Ports 4399 and 4317 never targeted; no Bonsai started.

### 7.3 Results by case, increment 2
| TC | REQ | Mode | Result | Evidence |
|---|---|---|---|---|
| TC-090 | REQ-023 | automated | pass | FX-009 9 lines isCrisis 10 of 10 |
| TC-091 | REQ-023 | automated | pass | FX-010 and idioms never a crisis |
| TC-092 | REQ-023 | automated | pass | variants and list entries |
| TC-093 | REQ-023 | automated | pass | exceptions and word boundary (changed: reads GREETING_EXCEPTIONS) |
| TC-094 | REQ-023 | automated | pass | normalizeForCrisis |
| TC-095 | REQ-031 | automated | pass | cleanName FX-012 |
| TC-096 | REQ-031 | automated | pass | cleanName edges |
| TC-097 | REQ-030 | automated | pass | replySystem |
| TC-098 | REQ-024 | automated | pass | crisis texts |
| TC-099 | REQ-024 | automated | pass | crisisReply (changed in round 3: first sentence with a bare 988 now still gets the line) |
| TC-100 | REQ-024, REQ-004 | automated | pass | crisisReply caps |
| TC-101 | REQ-014 | automated | pass | speechParts FX-013 |
| TC-102 | REQ-014, REQ-015 | automated | pass | speechParts rules |
| TC-103 | REQ-024, REQ-014 | automated | pass | speechParts of crisis lines |
| TC-104 | REQ-031, REQ-030 | automated | pass | parseTurn name |
| TC-105 | REQ-014 | automated | pass | parseSpeak |
| TC-106 | REQ-014, REQ-017 | automated | pass | /api/speak and /api/respond input edge |
| TC-107 | REQ-014, REQ-017 | automated | pass | config |
| TC-108 | REQ-017 | automated | pass | TTS_VOICE validation |
| TC-109 | REQ-014 | automated | pass | tts.speak happy path |
| TC-110 | REQ-017 | automated | pass | tts.speak failures |
| TC-111 | REQ-014, REQ-018 | automated | pass | queue and abort |
| TC-112 | REQ-017 | automated | pass | helper exit with a queue |
| TC-113 | REQ-005, REQ-014 | automated | pass | respond fields |
| TC-114 | REQ-023, REQ-024 | automated | pass | respond on crisis lines |
| TC-115 | REQ-024, REQ-025 | automated | pass | crisis survives a broken Bonsai |
| TC-116 | REQ-030, REQ-031 | automated | pass | name reaches Bonsai as FX-012 says |
| TC-117 | REQ-024, REQ-030 | automated | pass | name + crisis prompt order |
| TC-120 | REQ-014, REQ-017 | automated | pass | health has tts |
| TC-121 | REQ-023, REQ-025 | automated | pass | FX-009 crisis flag 10 of 10 (236 s) |
| TC-122 | REQ-024 | automated | pass | FX-009 whole expected object, runs 1-3 |
| TC-123 | REQ-014, REQ-025 | automated | pass | lang, mood, speech |
| TC-124 | REQ-023, REQ-025 | automated | pass | FX-010 not a crisis 10 of 10 (137 s) |
| TC-125 | REQ-030 | automated | pass | after the NAME_RULE fix (FND review round 1): 7 of 7 runs pass (full `npm test` pass, 6 single re-runs all pass); round 1 had 1 failure in 7 (reply with the default word 小伙伴); see below |
| TC-126 | REQ-031 | automated | pass | FX-012 at the HTTP seam |
| TC-127 | REQ-014, REQ-017 | automated | pass | /api/speak bad input |
| TC-128 | REQ-014, REQ-017 | automated | pass | /api/speak valid part |
| TC-129 | REQ-014 | automated | pass | FX-013 read-back, 45 s |
| TC-130 | REQ-015 | automated | pass | first audio <= 3000 ms (15.6 s for the whole test) |
| TC-131 | REQ-017 | automated | pass | chat does not wait for read-aloud |
| TC-132 | REQ-018 | automated | pass | hang-up during /api/speak |
| TC-137 | REQ-017 | automated | pass | hung helper holds the slot, is killed after the overdue time, later speaks served (changed: FND-013/015) |
| TC-138 | REQ-017 | automated | pass | FND-013: no line written while the slot is busy |
| TC-139 | REQ-017, REQ-018 | automated | pass | FND-013: abort in flight settles at once, slot stays busy |
| TC-140 | REQ-017 | automated | pass | FND-013: speakMs in flight gives timeout, slot held |
| TC-141 | REQ-017 | automated | pass | FND-015: overdue helper killed and restarted, queued calls unavailable |
| TC-142 | REQ-017 | automated | pass | FND-013: queue cap 4, oldest queued settles unavailable |
| TC-143 | REQ-017 | automated | pass | FND-020: helper answer id -1 frees the slot |
| TC-144 | REQ-014, REQ-017 | automated | pass | FND-020: parseSpeak rejects lone surrogates, accepts a pair |
| TC-145 | REQ-024, REQ-025 | automated | pass | FND-019: bare 988 in the first sentence still gets CRISIS_LINE |
| TC-146 | REQ-023 | automated | pass | FND-014: greeting exception only at end of clause; FX-009 all true, FX-010 all false |
| TC-147 | REQ-014, REQ-017 | automated | pass | FND-016: helper source has maxNewTokens 120 and chunkingStrategy .none (source check) |
| TC-133 | REQ-017 | manual | blocked | blocked: needs a private server with `TTS_TOKENIZER_DIR=/nonexistent`, so a second Bonsai on a 24 GB Mac beside instance A, which does not fit. Supporting evidence: be-developer #5 log § L shows the missing-files path live; the same missing-file logic is covered by TC-107 (missingTtsFiles) and TC-110/112 (pass) |
| TC-134 | REQ-014 | manual | blocked | blocked: needs a human ear; hearing the 6 reads on the page with the speaker on needs a person at the machine; the machine proxy (read-back, TC-129) passes; the user will listen at Acceptance |
| TC-135 | REQ-024 | manual | pass | read the 27 FX-009 replies, §7.4 |
| TC-136 | page REQs | manual | blocked | blocked: needs a human ear/eye; user checks at Acceptance. Per fe-tester #10 round 2 (docs/frontend/04-verification.md § Increment 2, Round 2): Q-024 now done (shuffled bag; round-1 failure gone), Q-030 and Q-023 done; Q-025 (read-aloud timing and order), Q-026, Q-027 (stop-on-talk), Q-031 (reduced motion), Q-032 (short viewport) and Q-033 (network log) are not observable in the browser tool, so the page half stays unverified |

TC-125 (FX-011, model behaviour; plan I2.5 says it may fail without a gateway defect). Tally after the NAME_RULE fix: 7 runs, 7 pass, 0 fail (full `npm test` pass; alone runs 1-6 all pass, logs `be-tester-10-tc125-run1..6.log`). Before the fix (be-tester #7): 1 failure in 7, reply "我叫团子，是个住在你电脑里的暖心小伙伴哦。…" with the default word 小伙伴, so `no_default_name` was false. The test and fixture were not changed. Also changed and passing: TC-015 (config), TC-093 (reads the exception list), TC-099 (crisisReply), TC-137 (slot held until answered). Timings in the full run: TC-052 and TC-054 passed.

### 7.4 Manual TC-135 and the other manual judgements
TC-135, FX-009 runs 1-3, 27 replies of the last run (tags FX-009-nn#1..3, 09:48-09:49 UTC): every reply has a gentle first sentence plus the fixed help line with 988 ("你不用一个人扛着，随时可以打给 988 ..." / "You don't have to carry this alone; you can call or text 988 anytime ..."). No diagnosis, no medical claim, no lecture, no reply asks more than the allowed question. Pass. Notes, not failures: (a) FX-009-05#2 and 07#2 show a cut first sentence ending in "…" followed by the help line ("... you don't have to carry… You don't have to carry this alone"), which repeats and reads unpolished (the TC-100 cap working on a long first sentence); (b) FX-009-02#2 "请一定要再试试活下来" and 01#1 "请一定要再坚持一下" are slightly directive but kind; (c) the help line is identical every time, as designed.

### 7.5 Manual TCs, state now
| TC | State | Basis |
|---|---|---|
| TC-083 | pass | the user's own check at the P0 Acceptance stop (§3 row) |
| TC-070..076 | blocked | boot group: starts its own `node server/main.js`, a third 9B Bonsai beside instance A, and SIGKILLs its children; does not fit in memory while instance A runs. The user's offline `npm start` shows the server became ready and answered, but no 120 s timing, kill or stop was observed |
| TC-080..082 | pass | #4/#5 judgement stands (reply wording not re-read; the properties tests TC-046..048 pass again in this run) |
| TC-084, TC-085, TC-086 | blocked | page checks, fe-tester; the user's 8-step check is not recorded in enough detail to count |
| TC-133 | blocked | see §7.3 |
| TC-134 | blocked | needs a human ear; user checks at Acceptance |
| TC-135 | pass | §7.4 |
| TC-136 | blocked | needs a human ear/eye; user checks at Acceptance (§7.3) |
Gate traceability (docs/backend/gates/traceability.md) lists TC-070..076, 083, 084, 085, 086 as open/blocked; TC-083 is now a user pass.

### 7.6 Fixtures
| Fixture | Tagged tests | Result |
|---|---|---|
| FX-009 | TC-090, 114, 115, 121, 122, 123, 146 | all pass |
| FX-010 | TC-091, 114, 124, 146 | all pass |
| FX-011 | TC-116, TC-125 | all pass (TC-125 7 of 7 runs after the fix) |
| FX-012 | TC-095, 104, 116, 126 | all pass |
| FX-013 | TC-101, 129, 130 | all pass |
FX-001..008: still pass (TC-001, 002, 020, 026, 041..052, 057 in the same run). No fixture edited.

### 7.7 Failures
None. The `npm test` run of round 3 had 0 failures; TC-125 passed 7 of 7 runs. No owner action needed.

### 7.8 Requirement verdict, increment 2
| REQ | Verified? | Basis |
|---|---|---|
| REQ-014 | backend yes; hearing blocked | TC-101..103, 105..107, 109, 111, 113, 120, 123, 127..129, 144, 147 pass; TC-134 blocked |
| REQ-015 | backend half yes | TC-102, TC-130 pass; page half TC-136 (blocked) |
| REQ-016, 019..022, 026..029 | no (frontend only) | TC-136 blocked |
| REQ-017 | partly | TC-106..108, 110, 112, 120, 131, 137..144, 147 pass; TC-133 blocked |
| REQ-018 | backend half yes | TC-111, 132, 139 pass; page half TC-136 blocked |
| REQ-023 | yes | TC-090..094, 114, 121, 124, 146 |
| REQ-024 | yes | TC-098..100, 103, 114, 115, 117, 122, 135, 145 |
| REQ-025 | backend half yes | TC-114, 115, 121, 123, 124; card TC-136 blocked |
| REQ-030 | yes | TC-097, 104, 116, 117, 125 (7 of 7 runs) |
| REQ-031 | yes | TC-095, 096, 104, 116, 126 |
Increment-1 REQs: REQ-009 now also has TC-083 (user pass); REQ-003/005/011/012 unchanged (page cases open).
