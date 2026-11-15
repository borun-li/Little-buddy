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


---

## Increment 2 (P1) — Acceptance report (draft for the user's morning check)

- Compiled by: Orchestrator · Date: 2026-11-15 · Branch `companion-full-dev`

### I2.0 Goal
- **Change (user, 2026-11-14 ~23:55 EST):** the reply is read aloud (voice serena, mute toggle); an anxious turn offers deep breathing (in 4 s / out 6 s ×3); a crisis line gets a gentle reply naming 988 and a calm card (988 call or text, 911); one-click clear without a confirm; poke the companion (≥ 3 reactions); a custom name (≤ 12 chars, saved locally, used by Bonsai). Memory (REQ-032..035) design only.
- **Check (the user's own, at this stop):** Wi‑Fi off, `npm start`, open the page with sound on → say an anxious line → hear the reply, tap "Breathe together?" and follow one round → type a crisis line → see 988 in the reply and the card → poke the companion, rename it, ask its name → clear.
- **Demo:** before = the P0 accepted state (`evidence/demo-after/` at commit 23bf9b0); after = `evidence/demo-after/` now (9 captures, 0 failed: open, happy-en, sad follow-up, anxious → breathing offer, breathing guide "Breathe out… 6", crisis line → reply with "call or text 988" + card with 988 and 911, poke, rename + ask the name, clear). Typed input stands in for voice.

### I2.1 What was built
- Backend (DES-016..023): resident `companion-tts` helper (Argmax TTSKit, Qwen3-TTS, voice serena) and `POST /api/speak`; deterministic zh/en crisis rule `server/crisis.js` with the fixed 988 line (UD-1 (a): a crisis turn always answers with 988, even when Bonsai fails); name cleaning `server/name.js` and the name in Bonsai's system prompt; respond returns `lang`, `crisis`, `speech`; health adds `tts`.
- Frontend (Q-020..Q-033): read-aloud with one-part prefetch, speaker toggle and voice-not-ready state, press-to-talk / send / clear stop the voice, breathing offer + guide, crisis card, one-click clear, rename in place, poke (shuffled bag of 3), reduced motion, both sizes and both languages, offline guarantee test.

### I2.2 Tests
- `npm test`: 300/300 (be-tester #10, 2026-11-15 ~06:00). Backend TCs: 118 pass, 0 fail, 13 blocked (manual: boot group TC-070..076 needs a third 9B instance; TC-084/085/086 page checks; TC-133 needs a second Bonsai; TC-134 / TC-136 need a human ear/eye → this stop).
- Fixtures FX-009..013 (locked) pass; FX-001..008 still pass. TC-125 (Bonsai uses the name) 7/7 after the NAME_RULE fix.
- Frontend: Q-020..Q-033 verdicts in `docs/frontend/04-verification.md`: done where capturable; read-aloud sound, stop-on-talk timing, reduced motion and short-height layout are "not observable" by the capture tool → the user's check.

### I2.3 Review
- Backend round 1: FND-013..024 (2 major). Fixed and re-checked: FND-013 (aborted read-aloud no longer silences the next reply), FND-014 (crisis exceptions no longer hide "我想死你别管我"), FND-015, FND-016, FND-019, FND-020. Deferred minors: BD-016..023.
- Frontend round 1: FND-010..022 (4 major). Fixed and re-checked: FND-010 (crisis card fully in view), FND-011 (Chinese rename readable), FND-012 (Q-024 poke), FND-013 (200% zoom), FND-020. Deferred minors: FND-014..019, 021, 022.

### I2.4 Decisions taken without the user (user's rules: no pause; report in the morning)
| # | Decision | Why | Reversible |
|---|---|---|---|
| 1 | FND-014: the 想死你/您/我 exceptions are removed only in their fond-greeting form at the end of a clause (想死你了 / 想死你们了 / 想死您了 / 想死我了) | the user's own rule A22: a crisis miss is worse than a false alarm; "我想死你别管我" was missed | yes, one list in `server/crisis.js` |
| 2 | FND-013 (frontend): on screens ≤ 520 px high (200% zoom) the companion stage shrinks so the log and the crisis card fit | accessibility review; no change at normal sizes | yes, one CSS rule |
| 3 | fe-build run after groups of rows, not after every row (each run ~17 min) | finish P1 overnight | process only |
| 4 | fe-build went to a 3rd fix round (cap 2) on ROLE/codemap bookkeeping | user rule "don't pause" | process only |

### I2.5 Open for the user
- Confirm decision 1 (FND-014).
- FND-017 / BD-016: add more crisis phrasings? ("I wanted to die", "I want to end it", "kms", 活着真没意思 …)
- FND-018 / BD-017: accept false alarms like 思想死板 / 死磕 (A22) or add exceptions?
- FND-024 / BD-021: `npm run setup` can exit 1 on a transient voice restart (first-run path; rerun setup if it happens).
- BD-023: with a custom name, Bonsai sometimes calls the user by that name or speaks of itself in third person.
- Known issues still accepted from P0: TC-050, TC-052, TC-055.

### I2.6 Waivers
- None new. Rule 2 ("waive after ≥ 2 failed fix rounds") was not needed: every failure in increment 2 was fixed.

### I2.7 Human sign-off (increment 2)
- **Accepted by the user, 2026-11-15 ~10:35 EST**, on the real page with Wi‑Fi off ("验收通过"). Run logs: backend #219, frontend #338.
- Checked by the user: read-aloud and stop-on-talk, breathing offer and guide, crisis card (988 / 911), poke, rename, clear — "其余功能健全".
- Found at Acceptance and fixed the same morning: **FND-025** (fond greeting "想死你了" + particles / 啦 / 妳們 raised the card; commit 7566aa4) and **FND-026** (user decision: semantic crisis detection — Bonsai's `risk` in the mood call, strong-word floor, keyword fallback; live 15/15 crisis lines, 0/8 false alarms; commit c3959f2). User re-checked both on the page.
- Decision 1 (FND-014) confirmed by the user: fond greetings no card, "我想死你别管我" card. FND-017 / FND-018 now covered by FND-026 (semantic judgment).
- Not checked by the user: reduced motion and narrow width (automated captures only). Not run: TC-070..076, TC-086, TC-133 (a second 9B instance does not fit memory).
