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
