# Review — 离线情绪陪伴小伙伴, increment 1 (Q-010..Q-019)

- Compiled by: fe-reviewer #1 (coordinator) · Round: 1 (format fix in round 2: owner moved out of the Where column) · Date: 2026-11-15
- Re-checked by: fe-reviewer #2 · Round: 2 (fix round 1, commit 1ae2fab) · Date: 2026-11-15 · FND-001..004 only (§5)
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
- **Status:** fixed in round 2 (§5)

### FND-002 — hold released during a pending typed reply starts an overlapping turn
- **Owner:** fe-engineer
- **Scenario:** builder on a laptop, 1440. They type a line and press the talk button with the mouse (the input keeps focus, since `pointerdown` prevents default). While still holding, they press Enter. The typed line sends, and then they release on the button. The voice line is transcribed and sent while the typed reply is still pending. The second request's history is empty, so the companion does not see the first line. When the first reply arrives, the pause lifts although the voice reply is still pending. After both replies, "…Little Buddy is replying" stays in the log between the turns until reload.
- **Evidence:** my `probe.out`: `RACE requests [t, line, history.length] [["1.8","typed words",0],["2.4","spoken words",0]]`; `RACE both settled {"turns":["turn--you|typed words","turn--typing|…Little Buddy is replying","turn--you|Voicespoken words","turn--reply|reply to typed words","turn--reply|reply to spoken words"]} typing nodes: 1`. Panel: `integ-r1/race.out`.
- **Cause (code):** `send()` skips the pending guard for a standing voice turn (`web/js/app.js:100`). A hold that began before the send is never stopped by `setPending` (`web/js/talk-button.js:153-166` sends on release; `isPaused` is asked only at press, `:104`). Each `send()` calls `log.showTyping()` (`web/js/app.js:104`), and each first `setPending(false)` lifts the pause (`:116`).
- **Suggested direction:** one turn in flight at a time. Hold the voice line, or refuse the send that would overlap.
- **Status:** fixed in round 2 (§5)

### FND-003 — listening start is visual only for screen-reader users
- **Owner:** fe-ux
- **Scenario:** a screen-reader user, laptop, English, first hold after load (mic open takes about 1.5 s). They focus the talk button and hold Space. After 0.2 s the status line announces "Opening the mic. Start talking when the seconds appear." When the stream opens, the hint is removed silently. The only change is the focused button's `aria-label` ("Listening, 1 seconds, release to send"), and there is no live region on the button. Nothing tells them the "seconds" have appeared. Words spoken before the stream opens are not recorded.
- **Evidence:** my `probe.out`: `A11Y live ["1313 status \"Opening the mic. Start talking when the \"","2608 status \"\"","3706 log \"VoiceTurning it into text…\""]`; `button aria-live null hint role status`. Panel: `a11y/p3.out` LIVE line. Code: `hint.clear()` at listen start (`web/js/talk-button.js:127`); the words "when the seconds appear" (`web/js/copy.js:30`, `:82`) come from the `hints.micOpening` Words row in 01-ux.md.
- **Owner note:** the state rows (loading · mic opening, listening) do not say what is announced when listening starts. fe-ux decides the words and announcement first, then fe-engineer builds them.
- **Suggested direction:** listening start reaches the status line in words that do not depend on seeing the seconds.
- **Status:** fixed in round 2 (§5)

### FND-004 — awake expiry wipes a newer talk-button hint
- **Owner:** fe-engineer
- **Scenario:** builder, after a warm-up. "Little Buddy is awake. Go ahead." shows. Within 4 s they tap the talk button too briefly, and "That was quick! Hold a little longer." shows. When the 4 s awake timer ends, that hint vanishes as well.
- **Evidence:** my `probe.out`: `AWAKE tooShort {"hint":"That was quick! …"}` then `AWAKE +4.4s {"hint":""}`. Panel: `p2.json` "D5". Cause: `shownKey` follows only app.js hints, so it is still `'awake'` when the timer clears the shared line (`web/js/app.js:30`, `:71-75`; talk-button calls `hint.show` directly, `web/js/talk-button.js:21-29`).
- **Status:** fixed in round 2 (§5; resolved by the FND-001 fix, re-checked though minor)

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
- Minors: FND-005, FND-006, FND-007, FND-008, FND-009.
- fe-tester #2 minor deviations (`04-verification.md` § Minor deviations): Q-001 disc about 460 px and caption 10 px low (`evidence/verify-1/q001-open@laptop.png`); Q-002 reply text and pose differ from FRAME-002 (`evidence/verify-1/q002-typed-zh@laptop.png`); Q-003 faint second sweat drop while the mood settles (`evidence/verify-1/q016-en-layout@laptop.png`).

## 5. Re-check (fix rounds)
| FND | Result | Evidence |
|---|---|---|
| FND-001 | fixed in round 2 | `recheck.out` (health ready, en, 390): `SEND unavailable` hint log ends at 94 ms on "Couldn't reach Little Buddy, so this did…" and is still there at 6.5 s, no awake; first health check 2018 ms after the 503. `VOICE unavailable`: "Couldn't connect, so that wasn't turned…" stays, check at 2008 ms, no awake. `not_ready` (health hint): warming (72 ms), then awake at 2079 ms, cleared by its own 4 s end at 6049 ms; voice `not_ready` the same (voiceNotReady, then awake at 3572 ms). Controls `SEND failed` / `VOICE failed`: hint kept, no check. `DOWN` (unavailable, health then down): the action hint stays through the unreachable checks, replaced only by stillDown at 30166 ms. Code: `web/js/health-watch.js:102-107` (`notReadyShown` only for `not_ready`; first check one poll later), `web/js/app.js:30-35` (awake only over a health hint, clears only itself). |
| FND-002 | fixed in round 2 | `recheck.out` `RACE` (1440): Enter during the pointer hold ends listening (`listening 0`), release adds no voice turn, one respond request `["1.8","typed words",0]`, no transcribe request, after settling `typing nodes: 0`; the next typed line carries history 2 (`["6.8","second",2]`). `PENDENTER`: Enter while a voice line transcribes or replies keeps "typed meanwhile" in the input and sends nothing (respond lines `["spoken words"]`). Code: `web/js/talk-button.js:221-224` (setPaused cancels a running hold), `web/js/app.js:58` (an utterance ending while pending is dropped), `web/js/app.js:132`. |
| FND-003 | fixed in round 2 | `recheck.out` `A11Y` (1440, first mic open delayed 1.5 s): status line announces "Opening the mic. Start talking when it says Listening." (1301 ms, user-approved wording), then "Listening" when the stream opens (2630 ms) and again on the second, fast hold (5251 ms); during the hold the line is visually hidden but exposed (`shown:false`, 1×1, `clip-path: inset(50%)`, `visibility: visible`; ARIA snapshot `- status: Listening`); it clears at release (3687 ms). Code: `web/js/talk-button.js:131`, `:28`, `:146`, `:164`; `web/js/copy.js` `listeningNow`; `web/css/page.css:125-127`. |
| FND-004 | fixed in round 2 | `recheck.out` `AWAKE`: awake at 2020 ms, tooShort at 2813 ms, still "That was quick! Hold a little longer." at +4.9 s after the awake timer ran out. `AWAKEHOLD`: a hold that outlives awake's 4 s keeps `listeningNow` on the line ("Listening", `shown:false`). Code: `web/js/app.js:33` (awake's end clears only `awake`). |

Probe: `/private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/fe-reviewer-2/recheck.mjs` → `recheck.out` against 127.0.0.1:4399 (served `web/` files byte-identical to the working tree, `cmp`). Unit tests `tests/fnd-r1-fix.test.js`, `tests/health-watch.test.js`, `tests/talk-button.test.js`: 26 pass, 0 fail (`unit.out`, same folder).

---

# Increment 2 — round 1 (Q-020..Q-033)

- Compiled by: fe-reviewer #3 (coordinator) · Round: 1 · Date: 2026-11-15
- Panelists run: fe-review-experience #2, fe-review-accessibility #2, fe-review-integration #2. `risk: normal`. Experience always. Accessibility because the diff adds interactive controls (clear, rename field, speaker toggle, breathing chip, help card, a focusable companion). Integration because it adds `/api/speak` playback, `name` and `crisis` on `respond`, and the tts health gate.
- Evidence: `evidence/verify-4/manifest.md`. The panel's candidates and evidence are in the session scratchpad `/private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/panel/` (`fe-experience.md`, `fe-accessibility.md`, `fe-integration.md`) with `review-e/`, `review-a/`, `review-a-scripts/` and `review-i/`. My re-runs are in `…/scratchpad/fe-reviewer-3/`: `probe.cjs` produced `crisis.out`, `zoom.out`, `rename.out` and `misc.out`, plus `poke.out` and `verify-i2.out`. They ran in headless Chrome against 127.0.0.1:4400, which serves `web/` byte for byte as in the working tree (checked with `cmp` on all 18 files). Every `/api/*` call was stubbed, so I made 0 live calls.
- Input from fe-tester #9 (`04-verification.md` § Increment 2): one row is not done, Q-024, filed here as FND-012. Six rows are not observable, which is no finding. Three minor deviations go to § Deferred. None of them duplicates a panel candidate.
- Numbering: the frontend ids continue from FND-009. Frontend FND-010..022 are not the backend's FND-010..013 in `docs/backend/06-review-report.md`. Backend FND-013 (the TTS helper keeps generating parts after an abort) is handled there and is not filed here.

## 1. Verdict
**send back.** All 13 panel candidates held up when I re-ran them. E-1 and A-2 are the same defect, so I merged them. With the not-done row Q-024 that makes 13 findings: 4 major and 9 minor. The four majors go to the fix round:
- **FND-010:** after a few turns the crisis card arrives with its 988 and 911 lines below the bottom of the log.
- **FND-011:** while renaming, the field shows only part of a Chinese name.
- **FND-012:** Q-024 is not done. Six pokes can show only two reactions.
- **FND-013:** at 200 % zoom the log is a 40 px slit.

For tomorrow's demo (laptop, EN UI, normal zoom), FND-010 is the one that shows. The card is cut off at 1440×900 in English after 6 turns (`crisis.out`). FND-011 shows whenever a Chinese name is typed.

## 2. Findings
`Where` is `path:line` in the project. Each finding's owner is in its own **Owner** line.

| ID | Severity | Panelist | Where | Ref | Claim |
|---|---|---|---|---|---|
| FND-010 | major | experience (E-1), accessibility (A-2) | web/js/log.js:220 | FLOW-010 step 3; PAGE-001 (incr. 2) success · crisis "the card right under it"; Q-030 | after a normal conversation the crisis card's 988 and 911 lines sit below the log's bottom edge and stay there |
| FND-011 | major | experience (E-2) | web/js/name.js:60 | FLOW-013 step 3; CMP-011 renaming; FRAME-023 | the rename field is sized in Latin `ch`, so a Chinese name shows only about half its characters while being typed |
| FND-012 | major | fe-tester #9 (Q-024 not done) | web/js/poke.js:14 | FLOW-012 Success "six pokes, three or more reactions"; Rules "the three cycle in random order"; Q-024 | each poke is drawn on its own, so 6.3 % of six-poke runs show only two reactions (010101) |
| FND-013 | major | accessibility (A-1) | web/css/page.css:26 | WCAG 1.4.10, 1.4.4; PAGE-001 (incr. 2) success · crisis | at 200 % zoom on 1280×800 the fixed 280 px stage leaves the log 40 px tall; the 52 px 988 line never fits in view at once |
| FND-014 | minor | experience (E-3) | web/js/app.js:72 | CMP-007 not-ready (design); FLOW-008 Failure | voice not ready: pressing the toggle flips `aria-pressed` but nothing visible changes |
| FND-015 | minor | experience (E-4) | web/css/page.css:126 | CMP-007 Tooltip "8 px under the toggle"; CMP-011 note "6 px under the row" | on the phone the tooltip and the rename note open above the row, over the art |
| FND-016 | minor | accessibility (A-3) | web/css/page.css:130 | WCAG 1.4.13; CMP-007 Tooltip | the speaker tooltip cannot be dismissed with Esc and disappears when the pointer moves onto it |
| FND-017 | minor | accessibility (A-4) | web/js/companion.js:106 | WCAG 4.1.3; Rules "screen readers hear each phase word once" | the breathing live region is created already filled, so the first "Breathe in" may not be announced |
| FND-018 | minor | accessibility (A-5) | web/js/companion.js:103 | WCAG 4.1.3; FLOW-009 step 4 | the end of the guide is not announced; the live region is just emptied |
| FND-019 | minor | accessibility (A-6) | web/js/app.js:84 | WCAG 4.1.3; PAGE-001 (incr. 2) poke | a poke's reaction word is `aria-hidden` and the companion's name does not change, so screen-reader users get nothing |
| FND-020 | minor | integration (I-1) | web/js/speaker.js:75 | FLOW-008 error · one reading | when `play()` fails, the reading ends but the part already requested next is not aborted |
| FND-021 | minor | integration (I-2) | web/js/companion-client.js:73 | contract `respond` → `lang`; FLOW-008 | a reply with a missing or odd `lang` still sends speak calls, and the server rejects them (400) |
| FND-022 | minor | integration (I-3) | web/js/app.js:258 | FLOW-011 Boundary "pending reply dropped" | clear drops a pending reply but does not abort its `respond`, so the next line waits behind it in llama-server |

### FND-010 — crisis card scrolled into view before it has content
- **Owner:** fe-engineer
- **Scenario:** demo laptop, 1440×900, English. Six ordinary turns, then a line the backend marks `crisis: true`. The reply naming 988 appears with the card under it. The 988 line is 39 px below the log's bottom edge and the 911 line 71 px below. Only the card's title and Close show. It is the same at 3 s, and the same with reduce motion. On the phone (390×844) the lines are 65 and 97 px below. A person in distress sees "You're not alone…" and has to scroll to find the numbers.
- **Evidence:** `fe-reviewer-3/crisis.out`: `crisis 1440 900 turns 6 t 3000 … "l988":{"hiddenBelow":39},"l911":{"hiddenBelow":71}`, `crisis 390 844 turns 6 … 65 / 97`, `turns 6 r` (reduce) the same. Positive controls: the same log scrolled to its end by hand shows both lines (`control-scrolled 1440 900 … hiddenBelow 0`), and a crisis turn with no earlier turns fits (`turns 0 … hiddenBelow 0`). Panel: `review-e/crisis-long@phone.png`, `review-e/p5-scroll.cjs`, `review-a/crisis-after-history@1440x900.png`.
- **Cause (code):** `card = add(li)` (`web/js/log.js:220`) runs `scrollToNewest()` (`:78`, `:29`), which reads `scrollHeight` while the card is still empty. `fillCard()` fills it afterwards (`:221`). The chip is not affected because its text is set before `add` (`:180-182`).
- **Suggested direction:** scroll to the newest item after the card's words are in.
- **Status:** fixed in round 2 (§5)

### FND-011 — Chinese name mostly hidden while renaming
- **Owner:** fe-engineer
- **Scenario:** phone (390), Chinese UI. They click the name 小伙伴. The field shows only "伴". On the laptop (1440), typing 团子团子 shows "团子" (`fe-reviewer-3/crop-rename-1440-typed.png`). The name the person is typing is cut while they type it. The saved name shows in full afterwards. English is fine: "Little Buddy" fits, with a client width equal to its scroll width.
- **Evidence:** `fe-reviewer-3/rename.out`: `390 zh-CN {"value":"小伙伴","styleWidth":"4ch","clientWidth":14,"scrollWidth":44}`, `1440 zh-CN {"value":"团子团子","styleWidth":"5ch","clientWidth":45,"scrollWidth":90}`. Control: `1440 en-US "Little Buddy" clientWidth 148 scrollWidth 148`. Panel: `review-e/rename-zh-default@phone.png`, `review-e/p1-rename.cjs`.
- **Cause (code):** `size()` sets the width to (characters + 1) `ch` (`web/js/name.js:60`). A Han character is about 2 `ch` wide, and `box-sizing: border-box` subtracts 20 px of padding and border.
- **Suggested direction:** size the field from the text's rendered width, not from the character count.
- **Status:** fixed in round 2 (§5)

### FND-012 — Q-024 not done: six pokes can show only two reactions
- **Owner:** fe-engineer
- **Scenario:** the builder pokes the companion six times. About one run in sixteen alternates between two reactions, for example tickle, oops, tickle, oops, tickle, oops, and the third never shows. The FLOW-012 success line ("three or more reactions") fails.
- **Evidence:** `fe-reviewer-3/poke.out`: `six-poke runs with <3 reactions 12540 200000 6.27%` and `random=0 sequence 010101`. `fe-reviewer-3/verify-i2.out`: `tests/verify-i2.test.js` has 7 tests, 6 pass, 1 fails (`✖ Q-024 six pokes show three or more reactions …`). This agrees with fe-tester #9 (6.30 % in 200,000 runs). `tests/poke.test.js` "six pokes" flakes for the same reason.
- **Cause (code):** `nextPoke` draws uniformly from the two reactions that are not the last one (`web/js/poke.js:14`). The UX rule is a cycle of three in random order.
- **Severity note:** the impact is small, but the in-scope row's acceptance is unmet, so it goes to the fix round as major.
- **Suggested direction:** take pokes from a shuffled bag of three. The first of a new bag must differ from the last one played.
- **Status:** fixed in round 2 (§5)

### FND-013 — at 200 % zoom the log is a slit
- **Owner:** fe-ui (short-viewport rule), then fe-engineer
- **Scenario:** a low-vision user zooms to 200 % on a 1280×800 laptop (a 640×400 CSS viewport, so the phone layout). The stage keeps its 280 px row, and the log is 40 px tall. A crisis card arrives. Its 988 line is 52 px tall, so it never fits in the log at once and has to be read by scrolling a 40 px window. At 1280×720 the log is 16 px and the page overflows by 16 px.
- **Evidence:** `fe-reviewer-3/zoom.out`: `640 400 … "logClientH":40`, `640 360 … "logClientH":16,"docOverflow":16`, `720 450` (1440×900 at 200 %) `logClientH 90, l911 hiddenBelow 45`. Control: `1280 720` at 100 % uses the laptop layout with a 556 px log and the card fully in view. Panel: `review-a/zoom200-crisis@1280x800.png`, `review-a/zoom200-crisis@1280x720.png`.
- **Cause (code):** `grid-template-rows: 280px minmax(0, 1fr)` (`web/css/page.css:26`). This fixed row dates from increment 1. The help card is new content in it. 02-ui has no rule for short viewports.
- **Not seen in the demo set-up** (laptop, normal zoom).
- **Suggested direction:** on short viewports the stage gives up height, or the page scrolls.
- **Status:** fixed in round 2 (§5; no short-viewport rule in 02-ui yet, see §5 note)

### FND-014 — not-ready toggle press shows nothing
- **Owner:** fe-ui (design defect)
- **Scenario:** voice side warming (`tts: "warming"`), laptop. The builder clicks the speaker toggle to mute. `aria-pressed` goes from true to false, but the icon (`#i-volume`), the fill and the tooltip ("Voice isn't ready yet…") stay the same, so the click looks dead. This is built as drawn: CMP-007 not-ready is "bare speaker … whatever the user's choice".
- **Evidence:** `fe-reviewer-3/misc.out`: `notready before {"pressed":"true","cls":"speaker-toggle is-notready","icon":"#i-volume",…}` and `after {"pressed":"false", … same}`. Code: `web/js/app.js:55-65`, `:72-76`.
- **Status:** open (deferred, minor; design defect)

### FND-015 — phone tooltip and rename note open upward
- **Owner:** fe-ui (design defect: the phone stage clips below the row)
- **Scenario:** phone (390). The speaker tooltip sits at 199–229 px, above the toggle at 237–273, and the rename note sits above the row over the art. CMP-007 and CMP-011 say under. Both stay readable. The engineer's comment marks this as a DFB candidate.
- **Evidence:** `fe-reviewer-3/misc.out`: `tip hover 390 {"tipTop":199,"tipBottom":229,"toggleTop":237,…}`. Control: at 1440 it opens below (`tipTop 758 > toggleBottom 750`). Code: `web/css/page.css:126`, `:141-143`.
- **Status:** open (deferred, minor; design defect)

### FND-016 — speaker tooltip not dismissible or hoverable
- **Owner:** fe-engineer
- **Scenario:** laptop, mouse. Hovering the toggle shows the tooltip. Esc leaves it visible. Moving the pointer onto the tooltip to read it makes it vanish.
- **Evidence:** `fe-reviewer-3/misc.out`: `tip after Esc 1440 {"visibility":"visible"}` and `tip pointer on tip 1440 {"visibility":"hidden","pe":"none"}`. The same happens at 390. Code: `web/css/page.css:130-133`.
- **Status:** open (deferred, minor)

### FND-017 — first breathing phase may not be announced
- **Owner:** fe-engineer
- **Scenario:** a screen-reader user starts the guide. The `role=status` span is inserted and filled in the same step, and many screen readers do not announce a live region's first content.
- **Evidence:** `review-a/probe2.txt`: `live mutations [['added-status', 1961, '吸气'], ['text', 1961, '吸气'], …]`, so the node is added and filled at the same millisecond. Code: `web/js/companion.js:106-114`. Not checked with a real screen reader.
- **Status:** open (deferred, minor)

### FND-018 — guide end not announced
- **Owner:** fe-ux (the state rows do not say what is announced at the end), then fe-engineer
- **Scenario:** a screen-reader user, 30 s into the guide. It ends and the live region is emptied. The only change is the focused chip's name going from "Stop breathing" back to "Breathe together?".
- **Evidence:** code: `web/js/companion.js:103` (`if (!on && live) live.textContent = ''`), `web/js/app.js:106-110`. The 01-ux Rules require only the phase words.
- **Status:** open (deferred, minor)

### FND-019 — poke not perceivable by screen reader
- **Owner:** fe-ux (the poke row names no announcement), then fe-engineer
- **Scenario:** a keyboard and screen-reader user presses Enter on the companion. The caption word changes in `.caption__phrase`, which is `aria-hidden`. The accessible name stays "小伙伴，在听", so nothing is heard.
- **Evidence:** `review-a/probe1.txt`: `poke Enter: … after [' · 嘿嘿，好痒', '小伙伴，在听', 'companion is-poke-tickle']`. Code: `web/index.html:405`, `web/js/app.js:84-89`.
- **Status:** open (deferred, minor)

### FND-020 — prefetched part not aborted when playback fails
- **Owner:** fe-engineer
- **Scenario:** part 1's audio fails to play. The reading ends, but part 2, already requested, is not aborted, so the backend still generates it. This is separate from backend FND-013, which keeps generating parts even after an abort.
- **Evidence:** `review-i/out-s1a.txt`: `CODE 200-garbage speaks 2 plays 2 … reqfailed []`. Code: `web/js/speaker.js:75-76` (`next` is requested, then `return` on a failed `play` without `r.ctrl.abort()`). The `finally` at `:103` only clears `run`.
- **Status:** fixed in round 2 (§5; minor, re-checked because it was in the fix commit)

### FND-021 — speak sent with a missing or odd `lang`
- **Owner:** fe-engineer
- **Scenario:** the backend returns a reply without `lang`. The page still sends `/api/speak` for each part, and the server rejects them. The reading stays silent as designed, but the requests are wasted.
- **Evidence:** `review-i/out-s1b.txt`: `NOLANG speak bodies [{'t': 0.51, 'text': '一。'}]`, a speak sent with no `lang`. The contract rejects any `lang` other than `'zh'` or `'en'` with `bad_request` (`docs/backend/03-detailed-design.md:758`). Code: `web/js/companion-client.js:73` (passes `lang` through unchecked), `web/js/app.js:253`.
- **Status:** open (deferred, minor)

### FND-022 — clear does not abort the pending `respond`
- **Owner:** fe-engineer
- **Scenario:** a reply is pending and the builder clicks Clear, then sends a new line. The old request still runs in llama-server, so the new line waits behind it.
- **Evidence:** code: `clearChat` bumps `generation` only (`web/js/app.js:258-267`). `respond(line, history, name)` takes no signal (`web/js/companion-client.js:62`). Panel: `review-i/s2.py` (clear during a pending reply).
- **Status:** open (deferred, minor)

## 3. Dropped by the coordinator
None. I re-ran or code-checked each candidate, and each still showed (§2). E-1 and A-2 are merged into FND-010.

| Candidate | Panelist | Claim | Counter-evidence |
|---|---|---|---|

## 4. Deferred
- Minors: FND-014, FND-015, FND-016, FND-017, FND-018, FND-019, FND-021, FND-022 (FND-020 fixed in round 2, §5).
- Minor deviations from fe-tester #9 (`04-verification.md` § Increment 2 § Minor deviations):
  - Q-024: on the phone the tickle sparkle reaches the stage top and the `中文 | EN` switch (`evidence/verify-4/i2-q024-poke@phone.png`).
  - Q-030: the tear is faint in the 1440 capture (`evidence/verify-4/i2-q030-crisis@laptop.png`).
  - Q-022: 清空 is captured in its hover fill (`evidence/verify-4/i2-q022-cleared@laptop.png`).
- Out of cut (increment 1, from the accessibility panel): the `ol role=log` drops list semantics; there is no `h1`; the mood loops have no pause (2.2.2); the laptop talk button's visual order differs from its tab order.

## 5. Re-check (fix rounds)
| FND | Result | Evidence |
|---|---|---|
| FND-010 | fixed in round 2 | `crisis.out` (en, 6 turns, then a `crisis: true` reply), at 300, 1500 and 3000 ms: 1440×900 `card`, `l988`, `l911` all `hiddenBelow 0, hiddenAbove 0` (scrollTop 836 = maxScroll); same with reduce motion, at 12 turns, at 1280×720, 390×844, 375×667 and 390×844 zh. Same probe with the pre-fix `log.js`/`page.css` served by route (`OLD`): 988 / 911 lines 39 / 71 px below at 1440, 65 / 97 at 390 and 375 (the round-1 numbers, so the probe still sees the defect). Control: 0 turns fits in both. Capture `evidence/verify-5/i2-fnd010-long-crisis@laptop.png`: card with 988 and 911 whole above the composer. Code: `web/js/log.js:220-226` (fill, then `scrollToNewest()`). |
| FND-011 | fixed in round 2 | `rename.out` (zh and en UI at 1440, 390, 375): 小伙伴 client 72 = scroll 72 (1440), 48 = 48 (390/375); 团子团子 94 = 94 / 63 = 63; 12 Han characters 274 = 274 / 179 = 179; `scrollLeft 0` every time; the field ends 104–141 px inside the row. Pre-fix (`OLD`): 小伙伴 14 vs 44, 团子团子 22 vs 58 at 390, all `CUT`. Latin names: Little Buddy 135 / 89, Mochi-Mochi1 156 / 103, WWWWWWWWWWWW 243 / 159, iiii 31 / 21, all fit (pre-fix cut Mochi-Mochi1 and WWWW…). Saved name shows whole (团子团子 90 = 90). Capture `evidence/verify-5/i2-fnd011-rename-zh@phone.png`. Code: `web/js/name.js:42-58`, `:78-84`. |
| FND-012 | fixed in round 2 | `poke-stats.out`: 200,000 fresh pokers × 6 pokes, 0 runs with fewer than 3 reactions, 0 repeats, first poke 66643/66613/66744; one poker over 300,000 pokes: 0 six-poke windows short of 3, 0 repeats; chained `nextPoke` 0 of 50,000; `random=0` gives 012012 (pre-fix: 12,572 of 200,000 short, 010101). In the page (`poke-page.out`, Enter on the companion past each hold): 10 runs at 1440 and 390, all 3 distinct, no repeat; pre-fix run includes `oops,here,oops,here,oops,here`. `unit.out`: `tests/verify-i2.test.js` Q-024 passes; it is in `package.json` `test` (`package.json:9`). Note: any 3 in a row can still show two reactions across a bag boundary (100,427 of 300,000 windows); the row asks for six. |
| FND-013 | fixed in round 2 | `zoom.out` / `layout.out` (200 % zoom as CSS viewport): 640×400 log 192 px (was 40), 640×360 160 (was 16, page overflow 16 → 0), 720×450 226 (was 90); crisis card after 6 turns with 988 and 911 whole at all three (card border 2 px above at 640×360, title in view). Phone landscape 844×390 and 667×375 log 185 / 175 (was 30 / 16). Unchanged at normal heights (`layout.out`, new = pre-fix): 1440×900 log 736, 1280×720 556, 390×844 stage 280 / log 484, 375×667 280 / 307; 959×521 unchanged, the rule starts at 520. Code: `web/css/page.css:157-160`. Note: the companion art is 67–91 px at those heights and 02-ui has no short-viewport rule (`grep` of `docs/frontend/02-ui.md`); the engineer flagged it for fe-ui. |
| FND-020 | fixed in round 2 | `s20.out`: part 1 not audio (garbage or JSON), part 2 asked ahead with a 3 s stub: part 2 `net::ERR_ABORTED` at the moment play fails (0.78 s / 0.58 s); pre-fix `speaker.js`: `reqfailed []`. Regressions: three parts requested and played in order, one in flight, URLs 4 created / 4 revoked, nothing aborted; 40 parts in order (`order ok True`, max in flight 1); a 500 on part 2 stops the reading with part 3 never asked. Code: `web/js/speaker.js:69-71`. |

Round 2 probes: `/private/tmp/claude-501/-Users-apple-Desktop-Hackathon-Local-AI-Hackathon/c499be74-fde0-49e2-a17d-d254a152203e/scratchpad/fe-reviewer-4/` (`probe.cjs`, `run.sh`, `run2.sh`, `poke-stats.mjs`, `s20.py`; outputs `crisis.out`, `zoom.out`, `layout.out`, `rename.out`, `poke-page.out`, `poke-stats.out`, `s20.out`, `unit.out`). Headless Chrome against 127.0.0.1:4400, which serves `web/` byte for byte as in the tree (`cmp`, 23 files). Every `/api/*` was stubbed: 0 live calls. `OLD` rows serve the files of `b7539fa^` by route, as the positive control. Unit tests (explicit list: verify-i2, fnd-i2-r1-fix, poke, name, crisis-card, speaker, speaker-toggle, fit, clear): 56 pass, 0 fail. Re-checked by fe-reviewer #4, 2026-11-15. Verdict: no blocker or major left open in increment 2; FND-014..019, 021, 022 stay deferred.
