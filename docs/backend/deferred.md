# Deferred — run companion-full-dev

Cut line (orchestrator, kickoff 2026-11-14, PLAYBOOK §2.1): the round is what the goal needs — offline, hold to talk → WhisperKit text → Bonsai reply + mood → companion face, multi-turn in page memory, replies in the user's language (zh/en), zh/en UI switch, a visible state when the backend is slow or down. Everything below is out of this round.

| # | Item | Source | For |
|---|---|---|---|
| BD-001 | Spoken replies (TTS) | not named by the user; whisperkit-cli tts exists | later run |
| BD-002 | Keeping conversations across reloads (persistence) | not named; prototype A5 keeps page memory only | later run |
| BD-003 | Argmax Pro SDK, streaming transcription while talking | not named | later run |
| BD-004 | Streaming reply tokens to the page | not named | later run |
| BD-005 | Languages beyond zh/en | user named English only, kickoff 2026-11-14 | later run |
| BD-006 | Frontend D-004/D-005 (stale doc rows from DFB-003) | docs/frontend/deferred.md | next fe-ui / fe-ux dispatch if one runs |
| BD-007 | Sidechat: an extra chat window to manage context (user's idea, 2026-11-14 21:30 EST) | user chose to defer and consider with P2 local memory | P2 design |
| BD-008 | P2 local memory (remember the user; summaries of older chats) — design only if time tonight | user, 2026-11-14 21:25 EST | after increment 2 (P1) |
| BD-009 | FND-006 hung STT child never restarted while health says ready (server/stt.js:101) | be-reviewer #1, minor | later run |
| BD-010 | FND-007 no in-flight cap / cancel for transcribe (server/stt.js:100) | be-reviewer #1, minor | later run |
| BD-011 | FND-008 restart cap is lifetime, not consecutive (server/supervisor.js:22) | be-reviewer #1, minor | later run |
| BD-012 | FND-009 node SIGKILL orphans llama-server; port message misleads (server/main.js:157) | be-reviewer #1, minor | later run |
| BD-013 | FND-010 shapeReply splits decimals/abbreviations (server/bonsai.js:13); also unwrap() strips unpaired quotes (bonsai.js:37) | be-reviewer #1, minor | later run |
| BD-014 | FND-011 no Host header check (DNS rebinding) (server/main.js:87) | be-reviewer #1, minor | later run |
| BD-015 | FND-012 TC-057 too weak for 60 s transcription; FLLR header bytes in PCM | be-reviewer #1, minor | later run |
