## be-analyst #1 · Phase 0 · round 1 · 2026-11-14T20:04:18Z
Task: write `docs/frontend/00-requirements.md` (frontend-only, Prototype) for the P0 companion page so gate fe-product can pass.
Changed: docs/frontend/00-requirements.md (new) — 8 REQs all above the cut, REQ-001..006 tagged [interface]; 11 non-goals; A1–A6 [unverified]; Q1–Q3 non-blocking.
Result: gate not run by me (it writes gate files outside my scope); REQ word counts measured with gatelib docs.requirements: all ≤ 60, no prose unit > 50.
Next agent must know:
- Pitfalls: demo-plan `sad-turn` has no waitFor on turn 2, only wait 2.5 s → reply ≤ 1 s + mood settled ≤ 1 s (REQ-003/004). Any greeting carrying the `reply` hook at open breaks `happy-turn` (A4).
- Tried, did not work: nothing.
- Left open: A1 (held-to-talk turn = next preset fake transcript line, audio discarded) and A2 (keyword moods, last keyword wins, no mood buttons) await the user at the Prototype stop.
Read beyond the list: MDN getUserMedia — localhost is a secure context; NotAllowedError / NotFoundError for mic refused / absent.
Next agent reads: docs/frontend/00-requirements.md §1 (REQ-001..008), §3 A1–A4, §6.

## fe-ux #1 · Phase 1 · round 1 · 2026-11-14T20:10:14Z
Task: write `docs/frontend/01-ux.md` (flows, the single page, state table, text wireframe) for the P0 companion page so gate fe-ux passes.
Changed: docs/frontend/01-ux.md (new) — 1 page (PAGE-001, serves REQ-001..008), 3 flows (type, hold to talk, first mic use), 6 state rows incl. offline, laptop + phone text wireframes, mood table (what each `data-mood` should read as).
Result: gate not run by me; measured with gatelib.docs: FLOW-001/002/003 = 79/80/68 words (≤ 80), PAGE-001 = 190 (≤ 200), no prose unit > 50, all 5 required states present; Figma calls 0.
Next agent must know:
- Pitfalls: FLOW-002 sits at 80 words exactly; any added word fails FE1.flow-length. `reply` hook only on the latest companion reply, none at open (empty-state hint is not a turn). Mood switches when the reply appears, not at send.
- Hooks: `fake-input` = the text input (focused at open); `companion` with `data-mood`; both fixed by demo-plan.json.
- Tried, did not work: nothing.
- Left open for the user: voice turns tagged "语音 · 示例文字"; unpleasant-high reads "worried with you", never "angry at you"; privacy line in the empty state.
Read beyond the list: ~/.claude/gates/gatelib/frontend.py ux() — to match what the gate parses.
Next agent reads: docs/frontend/01-ux.md §4 (PAGE-001 table, wireframe, Companion moods).

## fe-ui #2 · Phase 2 · round 3 · 2026-11-14T20:48:13Z
Task: fix FE2.prose (54-word CMP-003 States bullet) with no content change; confirm the 11 frame PNGs are current exports of the confirmed frames.
Changed: docs/frontend/02-ui.md — CMP-003 States split into a short States line (keeps "focus") plus 4 sub-bullets; same words. Round 2 changes stand: CMP-003/CMP-004, FRAME-011 (node 13:305), FRAME-011.png, companion/<mood>.svg ×5, DFB-001/002 accepted (needs user: no).
Result: gate not run by me; gatelib docs.prose_units on 02-ui.md: longest unit 48 words (limit 50), none over; docs.field(CMP-003, States) still contains "focus". PNGs: none re-exported, figma_calls this round 0 (round 2: 10).
Next agent must know:
- PNG currency evidence: FRAME-006.png vs FRAME-011.png (a clone of 6:304 made this run) differ by 1 pixel in the top 760 rows and 0 in the left 230 columns (`magick compare -metric AE`), so FRAME-006's export matches the canvas. FRAME-011.png was exported after its last edit. My Figma writes touched only 13:305. FRAME-001..005 and 007..010 were not re-read from Figma (budget); no agent wrote to them after fe-ui #1 exported them. Edits the user made in Figma by hand would not show up in this check.
- Pitfalls: mood ids 4:19 neutral, 4:45 pleasant-high, 4:67 pleasant-low, 4:92 unpleasant-high, 4:115 unpleasant-low; SVG ids `Vector_n` repeat across files — inline one mood at a time. Paused input must not get `disabled`; phone listening aria-label "在听，N 秒，松开发送".
- Tried, did not work: exportAsync via use_figma returns ~194 KB through context; download_assets svg saves to disk with the same ids.
- Left open: FRAME-011 text layer still named "在听… 4 秒" (cosmetic).
Read beyond the list: ~/.claude/gates/gatelib/docs.py prose_units, field — how units and `**States:**` are parsed.
Next agent reads: docs/frontend/02-ui.md §4 CMP-003, CMP-004; §5 FRAME-011 and export note.

## fe-engineer #2 · Phase 2 (queue fix) · round 2 · 2026-11-14T20:50:00Z
Task: make FE2.coverage pass by having a queue row deliver FRAME-011 (phone listening talk button, DFB-001 accepted).
Changed: docs/frontend/03-queue.md — Q-004 Frame field now FRAME-003, FRAME-010, FRAME-011; Observable adds the phone listening state (icon, "N 秒", level bars; name "在听，N 秒，松开发送"); Acceptance shortened to stay in the cap. Q-004 is 76 words by gatelib docs.words (cap 80); other rows unchanged (max 79, Q-002).
Feedback: none.
Result: gate not run by me; dry-checked Q-004 word count with gatelib. Figma calls 0.
Next agent must know:
- Q-004 is at 76 of 80 words.
- Round-1 notes still hold: companion art is now exported under evidence/design/companion/ (per 02-ui.md); paused input stays editable (DFB-002); test files named one by one; junit dir must exist.
- Left open: E1 (768 px uses phone layout); O-1..O-4 for the backend run.
Next agent reads: docs/frontend/03-queue.md Q-004; 02-ui.md CMP-003 and FRAME-011.
