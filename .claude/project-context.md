# Project context — 离线情绪陪伴小伙伴

Source of truth for the product idea: `idea.md`. This file records only what the user confirmed for the agent teams.

## Intent (2026-11-14, user, /route kickoff)

- Tier: **Prototype** (this round). Full development to wire real WhisperKit + Bonsai comes in a later run.
- Goal of this round: a local web page walks the whole loop "hold to talk → a reply appears → the companion's face/colour follows the mood (4 quadrants + neutral)", over several turns, with **fake/preset replies and emotions** (switchable, e.g. by buttons or keywords). The user checks it by trying a happy line and a sad line and seeing it smile / be sad with them.
- Named user (`primary_user_role`): someone who wants to talk about their feelings privately, offline or without uploading anything (the user themself first).

## Delivery surface

- Local web page in the browser (localhost), must work with Wi‑Fi off. Microphone through the browser.

## Design taste choices (design-taste §1, confirmed 2026-11-14)

1. Product class: visual / showcase, single page.
2. Brand: none yet — fe-ui proposes colours and typefaces for approval.
3. Motion: rich (expression, colour and movement follow the mood); honour OS "reduce motion".
4. Copy tone: warm.

## Frontend/backend line

Draft (default line, `~/.claude/route/FRONTEND_BACKEND_LINE.md` §1) — **not yet signed by the user**:

| Side | Covers |
|---|---|
| backend | speech-to-text service (Argmax/WhisperKit), Bonsai chat + emotion classification, conversation context, any API the page calls |
| frontend | the web page: templates, styles, client scripts, client state (recording, chat log, companion state), display-only fields |

This Prototype round has no backend: replies and emotions are fake data behind one replaceable client-side layer.
