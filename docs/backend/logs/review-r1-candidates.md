# Backend review round 1 — panel candidates (filed by orchestrator, 2026-11-15T03:26:34Z)
Diff: `git diff 3be2384..HEAD -- server/ stt/ package.json`. Scratch evidence: /private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/{sec1,be-review-behavior-1,rel1}
Known issues accepted by user (not re-raised): TC-050, TC-052, TC-055.

## be-review-security #1 — issues_found
- S-1 blocker — server/main.js:88 — `new URL(req.url, ...)` outside try: GET "//" (or "http://[") crashes node; exit handler kills both children. Evidence: sec1/srv.err. Same as R-1.
- S-2 major — server/bonsai.js:149 — llama-server default CORS (* + credentials): any web page can drive the local model and read /props model_path (home dir). Evidence: throwaway llama-server OPTIONS echo (in return).
- S-3 minor — server/main.js:87-101 — no Host check (DNS rebinding → same-origin access). Live 4400 accepted Host: rebind.attacker.example.
- S-4 minor — server/stt.js:95-107, stt main.swift:124-128 — no in-flight cap / no cancel on transcribe; queued work after 12 s timeout.

## be-review-behavior #1 — issues_found
- B-1 major — stt/Sources/CompanionSTT/main.swift:48-51, :81-96 — noise (RMS > 0.02) often transcribes as "Okay."/"so"/"you" → page makes a user turn (REQ-003 "噪声 → 空"). 11/27 live calls. Evidence: be-review-behavior-1/noise-results.txt. Tests only cover digital zeros.
- B-2 minor — server/bonsai.js:13, :56-66 — shapeReply splits at decimal points/abbreviations ("3.5" → "3. 5", second sentence dropped). Evidence: be-review-behavior-1/shape.mjs.
- B-3 minor — tests/server-live.test.js:220-230 — TC-057 passes with ~3/37 repetitions transcribed; header bytes (FLLR) in PCM.

## be-review-reliability #1 — issues_found
- R-1 major — server/main.js:88 — same as S-1 (malformed request-target crashes gateway). Evidence: rel1/routecrash.out.
- R-2 major — server/bonsai.js:150, main.js:170-185, supervisor.js:21-22 — llama-server stdout/stderr ignored; no terminal message when a child goes down or the restart cap is reached; operator sees only "启动中 Starting…". Evidence: rel1/instC.err, instC.out, llama-direct.log.
- R-3 minor — server/supervisor.js:11,22-23 — restart cap is lifetime, not consecutive (design ambiguity, architect).
- R-4 minor — server/main.js:157-164, :142 — node SIGKILL/HUP orphans llama-server; next start's port message misleads.
- R-5 minor — server/stt.js:95-107 — hung child never restarted while health says ready (design gap 02 §6).
- R-6 minor — server/config.js:37 — bonsaiBootMs 60 s thin under memory pressure (55 s cold 4B seen).

Note: docs/backend/logs/be-developer-2-server.log is instance A's (node 91736) live stdout in a tracked file; it changes whenever anyone calls 4400 and will trip P6 tree-unchanged.
