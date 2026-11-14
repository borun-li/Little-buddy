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

## be-architect #1 · Phase 2 · round 1 · 2026-11-14T22:57:29Z
Task: write 02-architecture.md and 03-detailed-design.md for REQ-001..REQ-012; benchmark Bonsai 2 4B vs 9B.
Changed: docs/backend/02-architecture.md (+113 new), docs/backend/03-detailed-design.md (+390 new) — 15 DES (12 backend, 3 frontend: DES-013..015); logs be-architect-1-bench*.log, be-architect-1-stt-check.log (new).
Result: 9B, two parallel calls (reply + enum mood): mood 9/10 x2, context recalled 6/6, warm 0.9–1.2 s, cold 20-turn 6.4–8.7 s — evidence: docs/backend/logs/be-architect-1-bench.log. Gate parsers (read-only): every DES ≤ 120 words, all 12 REQs claimed. Gate p2 not run.
Next agent must know:
- Pitfalls: WhisperKit 1.1.1 noSpeechProb is hard-coded 0 (TextDecoder.swift:820) — silence guard is EnergyVAD in the helper; whisperkit-cli --audio-path eats following args, put --language first; zsh treats a bare ===== as a path.
- Pitfalls: llama-server allows all CORS origins by default; we bind 127.0.0.1 and the browser never calls it. start.sh must not be used in product (downloads when files are missing).
- Pitfalls: FX-005 (24 kHz Float32) is rejected by /api/transcribe by design; feed `afconvert -f WAVE -d LEI16@16000 -c 1` output.
- Tried, did not work: single JSON {mood, reply} call — context recalled at most 2/6 on 9B, mood 8/10; 4B in every variant — context ≤ 1/6.
- Left open: contract §2 needs 03 §9 text copied (P3.contract fails until then); "刚到家" → pleasant-low in every variant (REQ-006 margin 1); synthetic 晚上 misheard (CER 13%).
Read beyond the list: spikes/argmax-swift/.build/checkouts/argmax-oss-swift/Sources (WhisperKit API, ArgmaxCLI serve); llama.cpp tools/server/README.md (/health).
Next agent reads: docs/backend/03-detailed-design.md §2 DES-007, DES-011, §9; docs/backend/logs/be-architect-1-bench-raw-9B.log (real Bonsai replies for FX-002/FX-003 history, tag ctx-first in bench-9B-two)
