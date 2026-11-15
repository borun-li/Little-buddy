# Test Report — 离线小伙伴 backend (run companion-full-dev)

- Author: be-tester #3 (Backend Phase 5, round 2)
- Round: 2   Date: 2026-11-14 (log timestamps 2026-11-15 UTC)
- Commit / working tree: HEAD 1c209ec plus uncommitted work; server code as left by be-developer #2 and be-architect #4 (RECALL in `server/prompts.js` / `server/bonsai.js`), running as node 91736 on 127.0.0.1:4400 (not touched)

> Every result below was produced by a command that actually ran in this round. Anything not executed is recorded as `blocked`, never as a pass.

## 1. Summary
| Result | Count |
|---|---|
| Pass | 57 |
| Fail | 0 |
| Blocked | 11 |

68 TCs: 54 automated (all pass, all executed by `npm test` and present in `test-results/junit.xml`), 14 manual (TC-080, 081, 082 pass; TC-070..076 and TC-083..086 blocked). Skipped in `npm test`: 0.

Changes since round 1: tests brought to be-architect #4's design (TC-012, TC-031: RECALL appended to the last user message; TC-073: the 16 events of 03 §6); `npm test` now also runs `tests/server-unit.test.js`, `tests/server-fakes.test.js`, `tests/server-live.test.js` (COMPANION_URL defaults to http://127.0.0.1:4400); the boot suite is a manual group (reason in §5 and 04 §1). Round 1's TC-073 and TC-081 failures: TC-073 is no longer in the executed set (blocked, see §5; the allow-list now matches §6), TC-081 passes in 3 of 3 runs after RECALL.

## 2. Commands executed
```
$ npm test                                   # COMPANION_URL defaults to http://127.0.0.1:4400, which was up
 -> docs/backend/logs/be-tester-3-npm-test.log   tests 142, pass 142, fail 0, skipped 0, duration 132 s   exit 0
 -> test-results/junit.xml (every automated TC-001..059 appears by name; all 8 fixtures FX-001..008 appear in tagged tests)
$ COMPANION_URL=http://127.0.0.1:4400 node --test --test-reporter=spec tests/server-live.test.js   (run 2)
 -> docs/backend/logs/be-tester-3-live-run2.log  tests 20, pass 20, fail 0, skipped 0   exit 0
$ same (run 3)
 -> docs/backend/logs/be-tester-3-live-run3.log  tests 20, pass 20, fail 0, skipped 0   exit 0
```
`npm test` was run first and is run 1; runs 2 and 3 repeat the live file only, giving three live runs (FX-001/002/003 replies x3 each, FX-004 3 rounds per run = 9 rounds, TC-052 5 timings per run). Replies: `test-results/backend-replies.jsonl` (the earlier file was moved to `backend-replies.prev.jsonl`; this file holds only this round's three runs: 02:43, 02:46, 02:49). Ports 4399, 4398, 4317 never targeted; 4400 only read from.

## 3. Results by case
| TC | REQ | Result | Evidence |
|---|---|---|---|
| TC-001..TC-020, TC-037, TC-038 | REQ-001..011 | pass | server-unit, each ✔ in be-tester-3-npm-test.log; TC-012 now checks `line + "\n" + RECALL[lang](prev)` (and line alone with no earlier user entry) |
| TC-021..TC-036 | REQ-001, 003..007, 009..011 | pass | server-fakes, each ✔; TC-031 checks RECALL.en on the reply call, none on the mood call, none when the window has only companion entries |
| TC-040 | REQ-010 | pass | health `{ready,stt,bonsai}` all ready |
| TC-041 / 042 / 043 | REQ-001 | pass | WER/CER <= 0.15 in all runs, FX-005/006/007 |
| TC-044 | REQ-002 | pass | en/en/zh 3/3, Simplified |
| TC-045 | REQ-003 | pass | `{"text":""}` on every call, FX-008 |
| TC-046 / 047 / 048 | REQ-004..007 | pass | FX-001/002/003 property checks equal expected.json, 3 runs x 3 |
| TC-049 | REQ-006 | pass | FX-004: 9/10 in each of 3 rounds in each of 3 runs (9 rounds); the one miss is FX-004-05, labelled neutral, got pleasant-low, every round (margin 1 of 10, known) |
| TC-050 | REQ-005 | pass | 30/30 in each run |
| TC-051 | REQ-005 | pass | mixed-language lines follow the majority language |
| TC-052 | REQ-008 | pass | run 1 5050-5670 ms; run 2 7442-8955 ms; run 3 6753-7773 ms (limit 10 s). Run 2 margin 1.0 s: slower than round 1 (5.0 s alone), likely machine load from other agents; not a failure |
| TC-053..TC-059 | REQ-001, 004, 007, 009..011 | pass | live and server-unit lines |
| TC-070..TC-076 | REQ-009..011 | blocked | boot group, §5 |
| TC-080 | REQ-004 | pass | manual, below |
| TC-081 | REQ-007 | pass | manual, below (3/3, 2/3, 3/3 by run) |
| TC-082 | REQ-007, 004 | pass | manual, below |
| TC-083..TC-086 | REQ-009, 005, 003, 012, 011 | blocked | §5 |

Manual judgement, by be-tester #3 reading `test-results/backend-replies.jsonl` (every FX tag #0..2, three runs):
- TC-080 (FX-001), 9 replies: all celebrate the news ("awesome/amazing news", "Congratulations"). Run 1 names the internship twice; runs 2 and 3 are warm but generic ("such amazing news! So excited for you", one asks about "the email"). Each responds to getting good news, none is filler. Pass (borderline on the generic ones).
- TC-081 (FX-002; bar >= 2 of 3 mention the internship or the mixed feelings), by run:
  - run 1: 3/3. "getting that internship was so exciting", "since you just got that internship", "Moving for an internship is huge".
  - run 2: 2/3. #1 "tough trade-off for such a great opportunity ... missing them" (mixed feelings) and #2 "That internship is so exciting, even though moving feels tough" count; #0 "such a big step ... feel lonely" does not name the news.
  - run 3: 3/3. "That internship is so exciting that moving will be tough", "bittersweet moment after getting that internship", "tough news after getting such a great opportunity".
  Passes in all three runs (round 1 failed with 1/3 twice, before RECALL).
- TC-082 (FX-003; bar >= 2 of 3 mention the exam, Simplified only): 9 of 9 mention the exam (考好了 / 考完试 / 考试过 / 考过), in every run, with the friend quarrel as the sad part. All characters Simplified. Pass.

FX results (each exercised by a passing tagged test in `test-results/junit.xml`): FX-001 TC-046; FX-002 TC-047; FX-003 TC-048; FX-004 TC-049/050/051; FX-005 TC-001/041/044; FX-006 TC-001/042/044/052/057; FX-007 TC-001/043/044; FX-008 TC-002/020/026/045. All pass. Fixtures loaded from their files, never edited.

Seam check (contracts/FRONTEND_BACKEND_CONTRACT.md seam table), backend side: `/api/respond` 200 `{reply, mood}` (TC-046..048), `/api/transcribe` 200 `{text}`, empty string for silence (TC-045), `/api/health` always 200 `{ready, stt, bonsai}` (TC-040, TC-058). Codes: CODES table (TC-005); over HTTP bad_request 400 (TC-053, 056, 058), too_large 413 (TC-055); not_ready / unavailable / timeout / failed 502 verified at module level (TC-027, 028, 032, 033, 034) and through the sendError mapping (TC-006); the live-HTTP 503 after a kill is TC-074/075 (blocked this round). Seam matches as far as run.

## 4. Failures
None this round.

Note on a risk, not a failure: FX-004 line 05 mislabels in every round (9/10 against a bar of 8/10) and TC-052 reached 8.96 s on a loaded machine (bar 10 s).

## 5. Blocked cases
| TC | Reason blocked | What is needed to unblock |
|---|---|---|
| TC-070..TC-076 (boot suite) | Not run this round. The suite starts its own `node server/main.js`, which loads a third 9B Bonsai instance beside 4400 and the other agents' instances (24 GB Mac, `vm_stat` showed about 75 MB free pages when checked), takes about 80 s to warm up, and SIGKILLs its own children. It was therefore moved out of `npm test` and into the manual group (04 §1). Round 1 results for these (boot log of be-tester #2: TC-070 ready, TC-071 6.1 s, TC-072, TC-074..076 pass, TC-073 failed on the old allow-list) are history and are not counted here; TC-073's allow-list now lists the 16 events of 03 §6 but was not run | Run `COMPANION_BOOT=1 npm run test:backend` when the other instances are stopped and memory is free; or an orchestrator-approved slot |
| TC-083 | Needs Wi-Fi switched off and a person speaking 3 turns in the page (loopback-only is covered by TC-059, which passes) | The user runs it |
| TC-084 | Needs the page with the UI language switched, FX-004 lines and the talk button held over silence | fe-tester browser run |
| TC-085 | Frontend-only (REQ-012) | fe-tester browser inspection |
| TC-086 | Needs the page and a stopped/restarted server; the live instance and the preview must not be stopped. Backend half: TC-034 passes; TC-074/075 blocked above | fe-tester with its own server |

## 6. Requirement verdict
| REQ | Verified? | Basis |
|---|---|---|
| REQ-001 | yes | TC-001, 003, 004, 025, 041-043, 056, 057 |
| REQ-002 | yes | TC-044 (synthesised audio, A15) |
| REQ-003 | backend yes, page half not | TC-002, 020, 026, 045; TC-084 blocked |
| REQ-004 | yes | TC-009-011, 014, 029, 032, 046, 048, 054, 080, 082 |
| REQ-005 | backend yes, UI half not | TC-008, 012, 031, 037, 046, 047, 050, 051; TC-084 blocked |
| REQ-006 | yes | TC-014, 029, 030, 046, 047, 049 |
| REQ-007 | yes | TC-012, 013, 031, 047, 048, 054 pass; manual TC-081 passes 3 of 3 runs, TC-082 passes |
| REQ-008 | yes (thin margin under load) | TC-013, 033, 052 (max 8.96 s of 10 s) ; TC-071 blocked |
| REQ-009 | partly | TC-015, 017, 019, 036, 058, 059 pass; TC-072, 073, 083 blocked |
| REQ-010 | partly | TC-015-018, 021, 035, 038, 040, 058 pass; TC-070, 071, 076 blocked (boot) |
| REQ-011 | partly | TC-005-007, 016, 021-024, 027, 028, 030, 032-034, 053, 055 pass; TC-074, 075, 086 blocked |
| REQ-012 | no | TC-085 blocked (frontend) |
