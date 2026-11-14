# Requirements — Companion page P0 prototype (fake data)

- Author: be-analyst #1 (frontend-only run, Prototype tier) · Status: draft
- Sources: `.claude/project-context.md` Intent; `idea.md` 核心体验, 情绪模型, 形象, 性格设定, 范围 P0; `docs/frontend/demo-plan.json`; `docs/frontend/state.json` goal.

## 0. Understanding
- **Asked:** "本地网页能完整走一遍「按住说话 → 出现回复 → 小伙伴表情/颜色随情绪（4象限+中性）变化」，多轮，回复和情绪是预设假数据" — check: "说/输入一句开心的话看到它笑，一句难过的话看到它陪你难过"
- **Means:** a localhost page where a typed or held-to-talk line gets a preset warm reply and the companion's face, colour and motion switch to one of 5 moods, over many turns, offline.
- **Ambiguities:** none blocking · assumed: A1–A6 (§3).

## 1. Requirements
Mood ids (from `demo-plan.json`): `pleasant-high` 开心/兴奋 · `pleasant-low` 平静/满足 · `unpleasant-high` 焦虑/生气 · `unpleasant-low` 难过/疲惫 · `neutral`.

### REQ-001 — Send a line by typing [interface]
- **Cut:** above
- **Behaviour:** A typed line sent with Enter becomes the user's turn; an empty line adds nothing.
- **Accept:** Given the page open, When `好开心！` is typed and Enter pressed, Then it shows as their turn within 0.3 s.
- **Source:** demo-plan.json "fake-input (text fallback for the utterance)"
- **Fixtures:** n/a — frontend run

### REQ-002 — Hold to talk with the browser mic [interface]
- **Cut:** above
- **Behaviour:** While holding, the user sees it is recording; release adds a user turn (A1). Mic refused or absent: user is told; typing works.
- **Accept:** Given mic allowed, When held 2 s, released, Then a user turn appears within 1 s.
- **Source:** "按住说话"
- **Fixtures:** n/a — frontend run

### REQ-003 — Companion replies in text [interface]
- **Cut:** above
- **Behaviour:** Each user turn gets one preset reply fitting its mood (A3): warm, ≤ 2 sentences, ≤ 1 question.
- **Accept:** Given a line, When it is sent, Then a companion reply appears within 1 s.
- **Source:** "出现回复"; idea.md 性格设定 "回复简短，一次只问一个问题"
- **Fixtures:** n/a — frontend run

### REQ-004 — Companion shows the mood of the line [interface]
- **Cut:** above
- **Behaviour:** Each turn sets one of 5 moods (A2); expression, colour and motion differ by mood.
- **Accept:** Given it smiles (`pleasant-high`), When `难过。` is sent, Then ≤ 1 s after the reply it looks sad (`unpleasant-low`).
- **Source:** "开心的话看到它笑，难过的话…陪你难过"
- **Fixtures:** n/a — frontend run

### REQ-005 — Multi-turn chat log [interface]
- **Cut:** above
- **Behaviour:** All turns stay in order, user and companion distinguishable; the newest is visible after each send without scrolling.
- **Accept:** Given 20 exchanged turns, When the user scrolls up, Then every turn is readable in sending order.
- **Source:** "多轮"
- **Fixtures:** n/a — frontend run

### REQ-006 — Mood shown without motion when asked [interface]
- **Cut:** above
- **Behaviour:** With OS reduce motion on, each mood still shows by expression and colour, without continuous movement.
- **Accept:** Given reduce motion on, When a sad line is sent, Then it looks sad and nothing keeps moving.
- **Source:** project-context.md "honour OS reduce motion"
- **Fixtures:** n/a — frontend run

### REQ-007 — Fake data behind one replaceable layer
- **Cut:** above
- **Behaviour:** Replies and moods come from one client-side layer, swappable without editing other files.
- **Accept:** Given it replaced by a stub returning reply X and `neutral`, When 3 lines are sent, Then all show X and `neutral`.
- **Source:** project-context.md "fake data behind one replaceable client-side layer"
- **Fixtures:** n/a — frontend run

### REQ-008 — Works with Wi-Fi off
- **Cut:** above
- **Behaviour:** The page loads and runs from localhost with no request to any other host.
- **Accept:** Given Wi-Fi off, When a 3-turn session is run, Then every turn works and the network log lists only localhost requests.
- **Source:** project-context.md "must work with Wi‑Fi off"
- **Fixtures:** n/a — frontend run

## 2. Non-goals
| Item | Kind | Makes true / forbids / owes |
|---|---|---|
| Real speech-to-text (WhisperKit), Bonsai replies, emotion classification | deferred — next Full development run | held audio is not transcribed; owes the layer of REQ-007 a real backend |
| Voice reply (TTS) | deferred — P1 | replies are text only |
| Companion "倾听中" listening state | deferred — P1 | REQ-002's recording cue is on the control, not the companion |
| Breathing exercise together | deferred — P1 | anxious mood gets a reply only |
| Safety fallback (988) | deferred — P1 | preset replies contain no crisis handling; owes it before any real-user use |
| One-tap clear-all | deferred — P1 | reload is the only reset (A5) |
| Local memory across sessions | deferred — P2 | nothing is stored after reload |
| Naming the companion, choosing a character | deferred — P2 | one fixed character |
| Growing up, dress-up, photo-based characters | not ours — idea.md 本次不做 | README "future plans" only |
| Backend, server API, accounts, cloud sync | not ours this round | no network beyond localhost |
| Medical or therapy claims | not ours — idea.md 要避开的坑 | copy never claims to treat |

## 3. Assumptions
| # | Assumption | Status | If wrong |
|---|---|---|---|
| A1 | Released hold-to-talk adds the next line of a preset fake transcript list covering all 5 moods; the audio is discarded, never stored or sent | [unverified] | REQ-002 changes: e.g. the user types after holding |
| A2 | Mood comes from preset keywords in the line, e.g. 开心/太好了 → `pleasant-high`, 平静/放松 → `pleasant-low`, 焦虑/生气 → `unpleasant-high`, 难过/累 → `unpleasant-low`, no match → `neutral`; the last keyword in the line wins; no mood buttons | [unverified] | add mood buttons beside the input |
| A3 | Preset replies are in Chinese, at least 2 per mood, never the same reply twice in a row | [unverified] | rewrite the preset list only (REQ-007 layer) |
| A4 | At open the companion is `neutral`, the log is empty and nothing carries the `reply` hook until the first reply | [unverified] | demo capture `happy-turn` `waitFor reply` passes too early |
| A5 | The chat log lives in page memory only; reload clears it | [unverified] | add storage, which overlaps P2 memory |
| A6 | Check targets are desktop Chrome or Safari, at 1440×900 and 390×844 (demo-plan sizes) | [unverified] | other browsers unchecked |

## 4. Open questions
| # | Question | Default | Blocks |
|---|---|---|---|
| Q1 | Without STT, what text does a held-to-talk turn become? | A1 | no |
| Q2 | Should moods also be switchable by buttons, not only keywords? | keywords only (A2) | no |
| Q3 | Reply language Chinese, English, or follow the user's line? | Chinese (A3) | no |

## 5. Non-functional
| Axis | This round |
|---|---|
| Performance | reply ≤ 1 s after send; mood settled ≤ 1 s after reply (demo `sad-turn` waits 2.5 s); log responsive at 20 turns |
| Security & secrets | no secrets; mic audio discarded on release; no request beyond localhost |
| Data & retention | page memory only, cleared on reload (A5) |
| Errors | mic refused/absent → told, typing still works (REQ-002); nothing else can fail without a backend |
| Accessibility | reduce motion honoured (REQ-006); rest owned by `fe-review-accessibility` |
| Observability | not this round |

## 6. External constraints
| Constraint | Source |
|---|---|
| Browser mic (`getUserMedia`) works only in secure contexts; a page loaded from localhost is one | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
| Refused mic rejects with `NotAllowedError`, no mic with `NotFoundError`; the prompt may never be answered | same page |
| Hooks `fake-input`, `reply`, `companion` with `data-mood` = one of the 5 mood ids; page served at `http://localhost:4317` | `docs/frontend/demo-plan.json` `_selectors`, `base_url` |
