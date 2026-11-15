# Review — 离线情绪陪伴小伙伴, increment 1 (Q-010..Q-019)

- Compiled by: fe-reviewer #1 (coordinator) · Round: 1 (format fix in round 2: owner moved out of the Where column) · Date: 2026-11-15
- Panelists run: fe-review-experience, fe-review-accessibility, fe-review-integration. `risk: normal` (`docs/frontend/state.json`); experience always; accessibility because the diff adds an interactive component (CMP-006 switch) and changes the talk button; integration because it adds the real API calls (`respond`, `transcribe`, `health`) and client state (health watch).
- Evidence: `evidence/verify-1/manifest.md`; the panel's candidates `logs/review-r1-candidates.md`; my re-runs against the isolated instance 127.0.0.1:4399 (request interception, fake mic) in the session scratchpad: `/private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/fe-reviewer-1/` (`probe.mjs` → `probe.out`, `hang.mjs` → `hang.out`, `ph.mjs`, `caret-375.png`, `composer-375-en.png`).
- Input from fe-tester #2 (`04-verification.md`): no not-done rows; 12 rows not observable (Q-004, 006, 007, 008, 009, 011, 012, 013, 014, 016, 018, 019; capture tool has no fake mic or interception); three minor deviations (Q-001, Q-002, Q-003), listed in § Deferred. None of them duplicates a panel candidate.

## 1. Verdict
**send back.** Every one of the 11 candidates held up when I re-ran it, so nothing is dropped. Merging duplicates leaves 9 findings: 3 major, 6 minor. The majors go to a fix round. The page's hint line loses the reason a send or voice line failed, because the health watch writes over it (FND-001). Holding the talk button and pressing Enter at the same moment starts two replies at once and leaves a "replying" indicator on screen for good (FND-002). Screen-reader users are told to "start talking when the seconds appear", but nothing announces when listening starts (FND-003). The minors are deferred.

## 2. Findings
`Where` is a file under the run dir (`evidence/…`) or `path:line` in the project. Each finding's owner (FRONTEND_BACKEND_LINE.md §6) is in its own **Owner** line below.

| ID | Severity | Panelist | Where | Ref | Claim |
|---|---|---|---|---|---|
| FND-001 | major | integration (I-2), experience (E-1) | web/js/health-watch.js:100 | PAGE-001 (incr. 1) error · reply, error · voice; Hint rules; Warming table "awake … only if a not-ready hint was shown" | after `unavailable` / `not_ready` the failure hint is replaced by "Little Buddy is awake. Go ahead." within ~80 ms, then the hint line goes blank |
| FND-002 | major | integration (I-1) | web/js/app.js:100 | FLOW-004 step 3 + Boundary "pending → Enter ignored"; FLOW-005 step 6 | a hold released while a typed reply is pending starts a second, overlapping turn: history misses the first turn, the pause lifts early, a typing indicator stays forever |
| FND-003 | major | accessibility (A-1) | web/js/talk-button.js:127 | PAGE-001 (incr. 1) loading · mic opening, listening; WCAG 4.1.3, 1.3.3 | the mic-opening hint says "start talking when the seconds appear"; the start of listening reaches no live region, only a silent hint removal |
| FND-004 | minor | experience (E-2) | web/js/app.js:30 | Hint rules "one hint at a time, newest wins" | when the awake timer ends, it wipes any talk-button hint shown in those 4 s (tooShort, mic prompt) |
| FND-005 | minor | integration (I-3) | web/js/health-watch.js:44 | FLOW-006 Failure "30 s → still-down hint"; PAGE-001 error · down | if health requests hang, still-down shows 40 s after open, not 30 s |
| FND-006 | minor | integration (I-4) | web/js/app.js:51 | PAGE-001 success; Boundaries "a voice line whose reply fails returns as text" | a transcript over 1500 chars is shown in full but sent cut; on failure 1499 chars go back into a `maxlength=500` input |
| FND-007 | minor | experience (E-3) | web/js/app.js:92 | PAGE-001 error · reply "focused, caret at end"; 02-ui.md:294 | after a failed send on phone widths the caret is at the end but the field still shows the start (scrollLeft 0) |
| FND-008 | minor | accessibility (A-3), experience (E-4) | web/css/page.css:118 | 02-ui.md:294 (placeholder fits the 196 px field); WCAG 1.4.10 | the English placeholder is cut below 390 px: 375 → "Or type, Enter send", 320 → "Or type, Ent" |
| FND-009 | minor | accessibility (A-2) | evidence/verify-1/q015-switch-en@laptop.aria.yml | CMP-006 Behaviour; Words `langEn`; WCAG 2.5.3 | the switch shows "EN" but its accessible name is "English" (design defect in CMP-006, built as drawn) |

### FND-001 — failure reason replaced by "awake" right after `unavailable` / `not_ready`
- **Owner:** fe-engineer
- **Scenario:** builder, any width, English. The reply side answers `respond` with 503 `unavailable` (or `not_ready`) while `/api/health` reports ready. They press Enter. The turn leaves the log and the text returns to the box. The first hint they see is "Little Buddy is awake. Go ahead." (80 ms). After 4 s the hint line is empty, so nothing says the line never sent. Voice is the same: after a 1.5 s hold with `transcribe` 503 `unavailable`, the placeholder vanishes and "awake. Go ahead." shows. The audio is gone, and no hint says why.
- **Evidence:** my `probe.out`: `SEND unavailable [[80,"Little Buddy is awake. Go ahead."]] final {"hint":"","input":"hello"}`, `SEND not_ready [[71,…awake…]]`, `VOICE unavailable [[1591,"Little Buddy is awake. Go ahead."]] final {"hint":""}`. The positive controls `SEND failed` and `VOICE failed` keep their hint after 5.5 s. Panel: `integ-r1/hints.out`, `integ-r1/vcodes.out`, `p1.json` "B unavailable/not_ready", `p2.json` "D2 voice unavailable".
- **Cause (code):** `watch.failed()` sets `notReadyShown = true` (`web/js/health-watch.js:100`) though no not-ready hint was shown. It restarts the checks, the check finds `ready()`, and `ready()` then emits `hint: 'awake'` (`:62-66`). app.js shows it over the send hint (`web/js/app.js:29`, after `:93-94`); the voice path is the same (`web/js/voice-turn.js:17-18`). The awake expiry clears the line (`web/js/app.js:30`). If health instead reports down, the send hint is replaced by unreachable after about 400 ms (`integ-r1/hints.out` "unavailable+health slow400ms"), which also goes against "a failure hint stays until the next send or recording starts".
- **Suggested direction:** a send or voice failure hint stays until the next send or recording. `failed()` must not count it as a shown not-ready hint.
- **Status:** open

### FND-002 — hold released during a pending typed reply starts an overlapping turn
- **Owner:** fe-engineer
- **Scenario:** builder on a laptop, 1440. They type a line and press the talk button with the mouse (the input keeps focus, since `pointerdown` prevents default). While still holding, they press Enter. The typed line sends, and then they release on the button. The voice line is transcribed and sent while the typed reply is still pending. The second request's history is empty, so the companion does not see the first line. When the first reply arrives, the pause lifts although the voice reply is still pending. After both replies, "…Little Buddy is replying" stays in the log between the turns until reload.
- **Evidence:** my `probe.out`: `RACE requests [t, line, history.length] [["1.8","typed words",0],["2.4","spoken words",0]]`; `RACE both settled {"turns":["turn--you|typed words","turn--typing|…Little Buddy is replying","turn--you|Voicespoken words","turn--reply|reply to typed words","turn--reply|reply to spoken words"]} typing nodes: 1`. Panel: `integ-r1/race.out`.
- **Cause (code):** `send()` skips the pending guard for a standing voice turn (`web/js/app.js:100`). A hold that began before the send is never stopped by `setPending` (`web/js/talk-button.js:153-166` sends on release; `isPaused` is asked only at press, `:104`). Each `send()` calls `log.showTyping()` (`web/js/app.js:104`), and each first `setPending(false)` lifts the pause (`:116`).
- **Suggested direction:** one turn in flight at a time. Hold the voice line, or refuse the send that would overlap.
- **Status:** open

### FND-003 — listening start is visual only for screen-reader users
- **Owner:** fe-ux
- **Scenario:** a screen-reader user, laptop, English, first hold after load (mic open takes about 1.5 s). They focus the talk button and hold Space. After 0.2 s the status line announces "Opening the mic. Start talking when the seconds appear." When the stream opens, the hint is removed silently. The only change is the focused button's `aria-label` ("Listening, 1 seconds, release to send"), and there is no live region on the button. Nothing tells them the "seconds" have appeared. Words spoken before the stream opens are not recorded.
- **Evidence:** my `probe.out`: `A11Y live ["1313 status \"Opening the mic. Start talking when the \"","2608 status \"\"","3706 log \"VoiceTurning it into text…\""]`; `button aria-live null hint role status`. Panel: `a11y/p3.out` LIVE line. Code: `hint.clear()` at listen start (`web/js/talk-button.js:127`); the words "when the seconds appear" (`web/js/copy.js:30`, `:82`) come from the `hints.micOpening` Words row in 01-ux.md.
- **Owner note:** the state rows (loading · mic opening, listening) do not say what is announced when listening starts. fe-ux decides the words and announcement first, then fe-engineer builds them.
- **Suggested direction:** listening start reaches the status line in words that do not depend on seeing the seconds.
- **Status:** open

### FND-004 — awake expiry wipes a newer talk-button hint
- **Owner:** fe-engineer
- **Scenario:** builder, after a warm-up. "Little Buddy is awake. Go ahead." shows. Within 4 s they tap the talk button too briefly, and "That was quick! Hold a little longer." shows. When the 4 s awake timer ends, that hint vanishes as well.
- **Evidence:** my `probe.out`: `AWAKE tooShort {"hint":"That was quick! …"}` then `AWAKE +4.4s {"hint":""}`. Panel: `p2.json` "D5". Cause: `shownKey` follows only app.js hints, so it is still `'awake'` when the timer clears the shared line (`web/js/app.js:30`, `:71-75`; talk-button calls `hint.show` directly, `web/js/talk-button.js:21-29`).
- **Status:** open (deferred, minor)

### FND-005 — still-down 10 s late when health hangs
- **Owner:** fe-engineer
- **Scenario:** builder, the gateway accepts connections but `/api/health` never answers. Unreachable shows at 5.1 s, and still-down only at 40.1 s after open (35 s after unreachable). Each check waits for its 5 s timeout plus 2 s, and the 30 s count starts at the first failed result.
- **Evidence:** my `hang.out`: `[[5104,"Can't reach Little Buddy right"],[40119,"Still can't reach it. Restart "]]`. Code: `web/js/health-watch.js:42-45` (`downSince` set at the first failure), `:76-83`, `web/js/companion-client.js:12` (`HEALTH_TIMEOUT_MS = 5000`). If health is refused at once instead of hanging, still-down comes at 32 s (`p1.json` "C down 32s").
- **Status:** open (deferred, minor)

### FND-006 — long transcript: shown ≠ sent; returned text exceeds the input's maxlength
- **Owner:** fe-engineer
- **Scenario:** voice, a 1599-char transcript (for example a Whisper repetition loop in a 60 s hold). The turn shows all 1599 chars, but the reply request carries 1499. If that reply fails, 1499 chars go back into an input with `maxlength=500`, where the user can delete but not add.
- **Evidence:** my `probe.out`: `LONG transcript 1599 shown turn textContent 1604 sent line 1499 input after failure 1499 (maxlength 500)` (1604 = the 5-char "Voice" tag + 1599). Code: `web/js/voice-turn.js:28` shows the full words, `web/js/app.js:51` slices to `MAX_VOICE_CHARS` (`web/js/copy.js:140`, an `[unverified default]`), `web/js/app.js:89`, `web/index.html:402`.
- **Status:** open (deferred, minor)

### FND-007 — after a failed send the end of the line is out of view on the phone
- **Owner:** fe-engineer
- **Scenario:** builder, phone at 375 and 390, English. They send a long line, type more while it is pending, and the reply fails. The field is focused with the caret at the end (63), but it shows "And then the evenin…", and the end of the line and the caret are not visible.
- **Evidence:** my `probe.out`: `CARET 375 {"len":63,"selStart":63,"scrollLeft":0,"scrollWidth":489,"clientWidth":147,"focused":true}`, same at 390; `caret-375.png`. Panel: `shots/W-defect-375-en-US.png`. Code: `web/js/app.js:88-92`.
- **Status:** open (deferred, minor)

### FND-008 — English placeholder cut below 390 px
- **Owner:** fe-ui
- **Scenario:** builder on a 375 px phone in English sees "Or type, Enter send", missing the last letter; at 320 px it reads "Or type, Ent". At 390 it fits, as 02-ui.md:294 says.
- **Evidence:** my `ph.mjs`: input text box (offsetWidth − 2×2 px border − 2×15 px padding) is 162 px at 390, 147 px at 375 and 92 px at 320, against a 153 px placeholder (`probe.out` `PH … textPx 153`); `composer-375-en.png`. (The `boxPx` in `probe.out` and `placeholderFits` in `a11y/p3.out` subtract the padding twice; the boxes above are the corrected figures.) Panel: `a11y/reflow-320x568.png`, `shots/W-ph-320-en-US.png`, `docs/frontend/evidence/build/Q-016-375-en.png`. Code: `web/css/page.css:118` (154 px English button column).
- **Status:** open (deferred, minor)

### FND-009 — "EN" visible, "English" spoken
- **Owner:** fe-ui
- **Scenario:** a speech-input user says "click EN", but the button's accessible name is "English" (`evidence/verify-1/q015-switch-en@laptop.aria.yml` line 4: `button "English" [pressed]: EN`). It was built as specified (02-ui.md CMP-006 Behaviour; 01-ux.md Words `langZh / langEn`), so it is a design defect for fe-ui. Code: `web/index.html:382`, `web/js/app.js:148`.
- **Status:** open (deferred, minor; design defect)

## 3. Dropped by the coordinator
None. I re-ran each candidate against 4399 or read its cited code, and each one still showed (§2). A-3 and E-4 are merged into FND-008, and I-2 and E-1 into FND-001.

| Candidate | Panelist | Claim | Counter-evidence |
|---|---|---|---|

## 4. Deferred
- Minors: FND-004, FND-005, FND-006, FND-007, FND-008, FND-009.
- fe-tester #2 minor deviations (`04-verification.md` § Minor deviations): Q-001 disc about 460 px and caption 10 px low (`evidence/verify-1/q001-open@laptop.png`); Q-002 reply text and pose differ from FRAME-002 (`evidence/verify-1/q002-typed-zh@laptop.png`); Q-003 faint second sweat drop while the mood settles (`evidence/verify-1/q016-en-layout@laptop.png`).

## 5. Re-check (fix rounds)
| FND | Result | Evidence |
|---|---|---|
