# Handoff — run companion-full-dev

## be-analyst #1 · Phase 1 · round 1 · 2026-11-14T22:29:08Z
Task: write docs/backend/01-requirements.md (REQs, non-goals, assumptions, declared fixtures) for C-001..C-005 and the run seam.
Changed: docs/backend/01-requirements.md (+180 new) — 13 REQs (12 above, REQ-013 988 below), 15 assumptions, 4 open questions, FX-001..FX-008 inputs; docs/backend/logs/be-analyst-1-whisperkit-hello.log (new) — whisperkit-cli observations.
Result: REQ fields parsed with ~/.claude/gates/gatelib/docs.py: every REQ has Cut, G/W/T, Source, Fixtures, <= 60 words; no prose unit > 50. Gate p1 not run (orchestrator's).
Next agent must know:
- Pitfalls: whisperkit-cli turned 2 s of silence into "Продолжение следует..." and 晚上 into 婉娃 (default model); first CLI run this session took ~92 s, then ~2.5 s. WhisperKitConfig download defaults to true (Configurations.swift:102); start.sh curls binary/model if missing (start.sh:26-45).
- Pitfalls: zsh treats a bare "=====" argument as path expansion; quote it.
- Tried, did not work: nothing.
- Left open: Q1 (988 safety, blocking, default not built). FX input files not written: tests/ is off-limits this round; Phase 2 analyst puts them in tests/fixtures/candidates/FX-nnn/ (audio via the say commands in 01 §7; FX-002/FX-003 history needs a captured real Bonsai reply).
- Left open: contract gaps reported in the return (voice tag "示例文字", no failure/not-ready/empty-transcript states, §2 reply row still "Chinese ≤120").
Read beyond the list: spikes/argmax-swift/.build/checkouts/argmax-oss-swift/Sources/WhisperKit/Core/Configurations.swift — language/download options; web/js/fake/presets.js — real zh lines for fixtures.
Next agent reads: docs/backend/01-requirements.md §1, §3, §7
