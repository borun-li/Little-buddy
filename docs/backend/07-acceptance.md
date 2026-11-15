# Acceptance Report — Offline companion: real WhisperKit + Bonsai replies and mood, English

- Compiled by: Orchestrator (Backend Phase 7, cross-stack run `companion-full-dev`)
- Date: 2026-11-15   Harness version: see `state.json`

## 0. Goal
- **Change (user's words, 2026-11-14):** 断网时语音 → Bonsai 真实回复 + 情绪判断 → 小伙伴表情变化，支持英文。回复跟随用户说的语言（中/英），界面文字加中/英切换。
- **Check:** 关掉 Wi‑Fi，`npm start` 打开页面，按住说一句开心的英文 → Bonsai 现场生成的英文回复（不是预设），小伙伴变开心；再说一句难过的 → 回复接上前文，小伙伴变难过。→ **pending: the user's own check at the Acceptance stop**.
- **Before / after:** `evidence/demo-before/manifest.md` · `evidence/demo-after/manifest.md` — before: preset Chinese replies to English lines, Chinese-only UI; after: Bonsai 9B English replies that follow the earlier turn ("That internship is awesome, but moving away…"), mood pleasant-high → unpleasant-low, EN interface.

## 1. What was built
- `npm run setup` (once, online): builds the Swift WhisperKit helper `stt/` and warms it.
- `npm start` (offline): a Node gateway on 127.0.0.1:4317 serves the page and `/api/respond`, `/api/transcribe`, `/api/health`; it starts llama-server (Bonsai 2 9B, 2 slots, CORS closed, per-run key) and the helper, warms both, and supervises them (restart ≤ 5, operator line on failure).
- The page records 16 kHz WAV while the talk button is held, shows transcribing / warming / failure states, replies in the language spoken, zh/en UI switch.

## 2. Requirement coverage
Machine-built matrix: `gates/traceability.md` (written by gate p7). REQ-001..012 active; REQ-013 (988) below the cut by the user's decision (Plan, 2026-11-14) → increment 2.
Delivered: 12/12 implemented and tested. Items verified only by the user's own check: TC-083 (Wi‑Fi off, a person speaking), TC-084 (page halves of REQ-003/005), TC-085 (REQ-012 UI switch), TC-086 (page with a stopped server); boot suite TC-070..076 is manual (a third 9B instance does not fit memory while others run).

## 3. Test results
`05-test-report.md`: `npm test` 145/145 (unit, fakes, live suites + frontend 84). Fixtures FX-001..008 all pass. Gate p5 pass; earlier runs waived only for user-accepted flaky known issues TC-050 / TC-052 / TC-055.

## 4. Accepted findings not fixed
| FND | Severity | Why accepted | Follow-up |
|---|---|---|---|
| FND-006..012 (backend) | minor | user: "次要的放待办" (2026-11-15) | `deferred.md` BD-009..015 |
| FND-005..009 (frontend) | minor | deferred at the review cap | `docs/frontend/deferred.md` D-007..D-012 |
| TC-050 / TC-052 / TC-055 | known issue | user accepted 2026-11-15 | later run |

Dropped by the coordinators: 0 (backend), 0 (frontend).

## 5. Known limitations
- Reply latency can exceed 10 s after long chats when memory is tight (TC-052); keep only one server running during the demo.
- A zh reply may occasionally contain an English word (TC-050).
- 9B cold-load time against the 300 s boot timeout is unmeasured.
- Voice, failure and warming states were verified by unit tests and probes with a fake mic, not by the gate's capture tool; the user's real-mic check covers them.
- The per-run llama-server key is visible to the same macOS user via `ps eww` (assumption: not a user secret).

## 6. Deviations from the approved design
See `08-implementation-log.md` § Deviations (logger module, restart option, operator-line formatting); all logged with reasons, none changes a REQ.

## 7. Follow-up work
| # | Item | Why it matters | Suggested phase |
|---|---|---|---|
| 1 | Increment 2 = P1: TTS voice reply, deep breathing, 988 safety, one-click clear | user's plan for tonight | increment 2, Phase 1 |
| 2 | Deferred minors BD-009..015, D-007..D-012 | robustness / polish | later run |
| 3 | P2 local memory, sidechat (BD-007/008) | context over long chats | P2 design |

## 8. Run cost notes
Quality model plan (opus for analyst, architect, developer, reviewers; sonnet for testers and fe-engineer). Detailed trail: `run-log.md` (gate timeline).

## 9. Frontend items
| DES | Queue row | Built by | `fe-tester` verdict |
|---|---|---|---|
| DES-013 | Q-010, Q-011, Q-012, Q-014, Q-018 | fe-engineer #6, #8, #11, #12, #13 (+#16 fixes) | Q-010 not observable (reply-content variance); Q-011/012/014/018 not observable by the capture tool — unit tests + fe-reviewer #2 probes |
| DES-014 | Q-013, Q-019 | fe-engineer #7, #9 (+#16) | not observable (needs a mic) — unit tests, user check |
| DES-015 | Q-015, Q-016, Q-017 | fe-engineer #14, #15, #10 | Q-015 done, Q-017 done, Q-016 not observable at 375/768 |

## 10. Human sign-off
- Prototype: reused `docs/frontend`, confirmed 2026-11-14.
- Plan: approved by the user 2026-11-14 (fixtures FX-001..008 locked).
- Acceptance: **approved by the user 2026-11-14 ~23:45 EST** — Wi‑Fi off, `npm start`, 8-step check passed ("关掉Wi-Fi后可以成功运行，且效果比较好。我很满意。").

## 11. To make it live
1. Stop the old preview on port 4317 (PID 23757, started in an earlier session): Ctrl+C in its terminal, or `kill 23757`.
2. Online once: `npm run setup` (already done on this Mac).
3. Turn Wi‑Fi off, run `npm start`, open http://127.0.0.1:4317, allow the microphone.
