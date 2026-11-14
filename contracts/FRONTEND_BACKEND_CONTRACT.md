# Frontend / Backend Contract

- Owner: fe-engineer drafts (scaffold, feasibility), copying each state's words from `01-ux.md`; the Backend team confirms · The single shared truth between the teams.
- Nothing is invented: every capability is `verified` (with source), `unverified` or `new`.
- Prototype round (2026-11-14): the page uses fake data behind one client-side layer; no capability below is called yet.

## 1. Capabilities
| # | Capability | Status | Source | Needed by | Backend DES |
|---|---|---|---|---|---|
| C-001 | Speech-to-text of a recorded utterance (Argmax OSS / WhisperKit) | new — only a one-shot CLI spike exists, no service | `spikes/argmax-swift/Sources/ArgmaxSpike/main.swift:5-13`, orchestrator, 2026-11-14 | companion page | — |
| C-002 | Chat completion from Bonsai (OpenAI-style `/v1/chat/completions` on llama-server :8080, sampling params sent per request) | verified (sample only, not wrapped) | `samples/bonsai-models/gguf/start.sh:10,47`; `samples/bonsai-models/shared/index.html:54-55,117`, orchestrator, 2026-11-14 | companion page | — |
| C-003 | Emotion of the user's turn: one of 4 quadrants (pleasant/unpleasant × high/low energy) + neutral | new | `idea.md` § 情绪模型, orchestrator, 2026-11-14 | companion page | — |
| C-004 | Multi-turn conversation context | new | `idea.md` § 范围 P0, orchestrator, 2026-11-14 | companion page | — |

## 2. Per page and action
(fe-engineer fills from `01-ux.md`.)

## 3. Open items
| # | Question | Owner | Impact | Status |
|---|---|---|---|---|

## 4. Changes
| Date | Change | Who | Impact on the other team |
|---|---|---|---|
| 2026-11-14 | Capability table seeded by /route recon | orchestrator | none yet (prototype uses fake data) |
