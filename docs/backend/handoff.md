# Handoff — run companion-full-dev

## be-analyst #2 · Phase 2 · round 1 · 2026-11-14T23:03:23Z
Task: place FX-001..FX-008 under tests/fixtures/candidates/FX-nnn/ with expected outputs from the REQs; list where 02/03 miss or contradict REQ-001..REQ-012.
Changed: tests/fixtures/candidates/FX-001..FX-008/ (new) — input.json|input.wav, expected.json, meta.json each (24 files).
Result: 8/8 fixtures have input, expected, meta (req, source, compare valid per gatelib _valid_compare); 4 WAVs parsed: fmt 1/mono/16000/16-bit (+FLLR chunk on afconvert output); 6 design contradictions returned to the orchestrator. Gate p2 not run.
Next agent must know:
- Pitfalls: replies are checked by computed properties (meta `rules`), compared exact; mood exact; audio uses numeric:0.15 on WER/CER vs 0. FX-003 scores no mood (not a REQ-006 fixture).
- Pitfalls: zsh `==` in an echo argument fails ("= not found"); quote it.
- Tried, did not work: nothing.
- Left open: FX-005 text_reference [unverified] (only source is whisperkit-cli output, be-analyst-1-whisperkit-hello.log:3) — user confirms at Plan. FX-004 cases 05/10 neutral vs bench pleasant-low (REQ-006 margin 1).
- Left open: history replies are verbatim raw Bonsai (pre-shapeReply), bench-raw-9B.log:146 and :148.
Read beyond the list: docs/frontend/00-requirements.md A1; idea.md § 情绪模型 — mood labels; ~/.claude/gates/gatelib/checks.py:812-881 — meta/compare rules.
Next agent reads: tests/fixtures/candidates/FX-00n/meta.json (rules, runs, pass, manual)

## be-architect #2 · Phase 2 · round 2 · 2026-11-14T23:10:53Z
Task: revise 02/03 so be-analyst #2's design contradictions 1–6 are resolved; keep the rest of #1's design.
Changed: docs/backend/02-architecture.md (+20/-14), docs/backend/03-detailed-design.md (+33/-23) — line/history text 1–1500, body ≤ 262144, prompt history ≤ 6000 chars (windowOf); deadlines stt 12 s + respond 15 s, page aborts 13 s / 16 s (voice turn ≤ 29 s); shapeReply cut = 119 cp + … ; zh transcripts → ICU Hant-Hans; warm-up text clarified (no code change). 03 §9 seam changed. docs/backend/logs/be-architect-2-stt60.log (new).
Result: 52–55 s clips transcribed in 4.3–5.3 s CLI wall incl. model load; Hant-Hans converts 有點難過 → 有点难过 — evidence: docs/backend/logs/be-architect-2-stt60.log. Gate parsers: every DES ≤ 117 words, 12/12 REQs claimed. Gate p2 not run.
Next agent must know:
- Pitfalls: contract §2 still holds the old seam (500 chars, 131072 B, 25/20/30 s); orchestrator must re-copy 03 §9. web/index.html:398 maxlength 500 stays valid (≤ 1500).
- Pitfalls: FX-005 stays the 16 kHz PCM16 converted copy; 01 §7 still says 24 kHz Float32 — analyst/user fix at Plan.
- Tried, did not work: nothing.
- Left open: after 20 turns the 40-entry window slides every turn → prompt prefix changes → every turn is cold (6.4–8.7 s + STT ≈ 10 s). Not redesigned this round; 02 §5 row 1 names the fallback (block-wise window or 4B), measured at build step 4.
Read beyond the list: docs/backend/logs/be-architect-1-bench.log, bench-scripts.log:254-277 (history20 = 979 chars); ~/.claude/gates/gatelib/docs.py (word counting).
Next agent reads: docs/backend/03-detailed-design.md §9, DES-002, DES-007, DES-013; 02 §4 rows 简体/截止/line 上限, §5 rows 1, 7, 8

## fe-ux #3 · Phase 1 (frontend, increment) · round 2 · increment 1 · 2026-11-14T23:25:12Z
Task: fix FE1.flows (FLOW-005 missing Boundary); apply the orchestrator's structure ruling (markers in their blocks, PAGE-001 detail under its own heading).
Changed: docs/frontend/01-ux.md — FLOW-005 Boundary starts "hold under 0.5 s" (was "< 0.5 s"); FLOW-005 Failure merged (80 words); FLOW-001/002 retirement markers moved into their headings (§3 line removed); increment state table now under "### PAGE-001 — Talk with the companion (increment 1)". Round 1 (unchanged): Increment 1 flows FLOW-004..007, states, health table, Codes, 43-row zh/en Words, contract §2 rows; DFB-004 in 06-feedback.md.
Feedback: DFB-004 (to fe-ui, English "Hold to talk" ≈151 px vs 124 px phone button) still pending.
Result: self-measured with gatelib docs.words/field: all 7 flows have every field; FLOW-001 83, FLOW-002 84 words (over 80: markers); PAGE-001 blocks 196 and 432 words (second over 200; gate reads only the first block). Gate not re-run by me.
Next agent must know:
- Pitfalls: gatelib docs.field treats a value starting with "<" or "{" as a template placeholder → a field reads as missing. Never start a field value with "<".
- Pitfalls: FLOW-001/002 and PAGE-001 cap overruns are for the orchestrator's cap ruling, not to be trimmed out of confirmed text.
- Left open: contract §2 rows (01-ux Increment 1, last section); fe-ui draws the 中文 | EN switch and decides DFB-004; deferred.md D-005 can close.
Read beyond the list: ~/.claude/gates/gatelib/docs.py:115-119 — field() placeholder rule.
Next agent reads: docs/frontend/01-ux.md § Increment 1 (PAGE-001 increment block, Codes, Words); docs/frontend/06-feedback.md DFB-004

## fe-ui #5 · step 2 (frontend UI, increment) · round 2 · increment 1 · 2026-11-14T23:36:23Z
Task: fix FE2.components (CMP-006 focus state readable) and FE2.prose (5 units over 50 words in 02-ui.md § Increment 1); round 1: switch, English frames, DFB-004, D-004.
Changed: docs/frontend/02-ui.md — round 2: CMP-006 `**States:**` line now inline "default, hover, focus (…FRAME-016 "EN focused"), active = selected"; CMP-006 Behaviour, you-transcribing, Caption, Phone English (DFB-004) and the Frames (increment 1) lead paragraph split into bullets, meaning unchanged. Round 1: § Increment 1, D-004 in place, DFB-004 decided, FRAME-012..016 exports; Figma FRAME-012 28:576, 013 28:627, 014 28:654, 015 28:669, sheet 016 27:565 (CMP-006 set 27:568).
Feedback: DFB-004 accepted (round 1; English phone button hugs label 154 px, input 196 px); needs user: no.
Result: gatelib parsers run by me on 02-ui.md: prose units > 50 words = [], components without focus in States = [] — evidence: docs/frontend/gates/fe-ui-latest.json (round 1 fail, gate not re-run by me). Figma calls: 12 in round 1, 0 in round 2.
Next agent must know:
- Pitfalls: gatelib docs.field reads only the text on the `**States:**` line itself; sub-bullets do not count.
- Pitfalls: Figma CMP-002 main still shows the retired tag "语音 · 示例文字" (FRAME-003, FRAME-010); spec and FRAME-012 win.
- Tried, did not work: phone switch at 12 px inset sat over the pleasant-high sparkle; 8 px used.
- Left open: FRAME-001..011 do not show the switch (not redrawn, budget); English laptop listening and laptop warming not drawn (words/caption swap only); longest English caption width is an estimate.
Read beyond the list: ~/.claude/gates/gatelib/docs.py:54-70, 115-119 — prose and field parsers.
Next agent reads: docs/frontend/02-ui.md § Increment 1 (CMP-006, CMP-003 increment 1, Frames (increment 1)); docs/frontend/06-feedback.md DFB-004
