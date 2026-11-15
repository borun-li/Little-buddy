# Frontend review round 1 — panel candidates (filed by orchestrator, 2026-11-15)
Diff: `git diff be6124f..HEAD -- web/` (Q-010..Q-019). Probe output lives in the session scratchpad: /private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/{a11y,integ-r1,probe,shots,p1.json,p2.json,p3.json}

## fe-review-accessibility #1 — issues_found (axe-core 4.10.2: no new hits)
- A-1 major — web/js/copy.js:30, :82; web/js/talk-button.js:66, :76, :126-128 — WCAG 1.3.3/4.1.3: micOpening hint says "start talking when the seconds appear"; the start of listening is only visual (aria-label change on the focused button, no live-region announcement). Evidence: a11y/p3.out (getUserMedia delayed 1.5 s; live log shows only the hint removal).
- A-2 minor — web/index.html:382, web/js/app.js:148 — WCAG 2.5.3: visible "EN", accessible name "English" (from 02-ui.md CMP-006 Behaviour: design defect). Evidence: verify-1/q015-switch-en@laptop.aria.yml.
- A-3 minor — web/css/page.css:118, web/js/copy.js:61 — WCAG 1.4.10: at 320 px English, input 126 px, placeholder cut to "Or type, Ent". Evidence: a11y/reflow-320x568.png, a11y/p3.out.

## fe-review-integration #1 — issues_found
- I-1 major — web/js/talk-button.js:153-166, web/js/app.js:100, web/js/voice-turn.js:9, web/js/log.js:82 — a hold ending while a typed reply is pending starts an overlapping turn: pause lifted early, a typing indicator ("Little Buddy is replying") left forever, second request's history misses the first turn. Evidence: integ-r1/race.out.
- I-2 major — web/js/app.js:29, :93-94; web/js/voice-turn.js:17-18; talk-button.js:28 — after unavailable / not_ready, watch.failed() runs health at once and its onChange replaces the send/voice failure hint before it shows (01-ux.md:183 "A failure hint stays until the next send or recording starts"). Evidence: integ-r1/hints.out, vcodes.out.
- I-3 minor — web/js/health-watch.js:42-45, :76-83 — hanging health: stillDown at 40 s, not 30 s. Evidence: hang.py output (40031 ms).
- I-4 minor — web/js/voice-turn.js:28, web/js/app.js:51, :89; index.html:402 — >1500-char transcript shown in full but 1500 sent; on failure 1500 chars return to a maxlength-500 input. Evidence: integ-r1/vcodes.out.

## fe-review-experience #1 — issues_found
- E-1 major — web/js/health-watch.js:98-103, web/js/app.js:27-30 — same defect as I-2 seen from the user: failure reason replaced by "awake. Go ahead." within 150 ms, gone after 4 s. Evidence: p1.json "B unavailable", p2.json "D2 voice unavailable"; shots/B-unavailable-390.png; positive control "B failed" keeps its hint.
- E-2 minor — web/js/app.js:30, web/js/talk-button.js:21-29 — awake timer wipes any talk-button hint shown within 4 s (tooShort, mic prompt). Evidence: p2.json "D5".
- E-3 minor — web/js/app.js:88-92 — after a failed send the caret is at the end but the field shows the start (scrollLeft 0) on phone widths. Evidence: probe p4, shots/W-defect-375-en-US.png.
- E-4 minor — web/css/page.css:118 — same as A-3: English placeholder cut below 390 px ("Or type, Enter send" at 375). Evidence: docs/frontend/evidence/build/Q-016-375-en.png, shots/W-ph-320-en-US.png.
