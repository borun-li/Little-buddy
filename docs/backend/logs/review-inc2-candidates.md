# Increment 2 review round 1 — panel candidates (filed by orchestrator, 2026-11-15)

# be-review-behavior #2 · step 6 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found
- B-1 major — server/crisis.js:16,38 (DES-019 step 2 CRISIS_EXCEPTIONS) — REQ-023, A22: exceptions 想死你/想死您/想死我了 are cut out before matching, so "我想死你们都不懂我", "我想死你别管我", "我想死您别劝我了", "我想死我了真的撑不下去" -> crisis=false (no 988, no card; live reply mood unpleasant-high -> breathing offer instead). With a comma it fires. TC-093 only tests 想死你了. Direction: drop an exception only in its endearment form (想死你了/想死你们了/想死您了/想死我了). Design-faithful -> user decision (§5.1).
- B-2 minor — crisis.js:5-13,19 — phrasing gaps: "I wanted to die", "I've been wanting to die", "I want to end it", "I don't want to be here anymore", "kill my self", "kms", "thinking about suicides", self–harm (en dash / U+2011), 活着真没意思, 活着好没意思, 我想伤害自已 (typo), 活著沒甚麼意思 (甚 not folded). User's list call.
- B-3 minor — crisis.js:39 — false alarms: 他思想死板, 这个理想死了, 我想死磕这个bug -> crisis=true (A22 accepts false alarms).
- B-4 minor — tts.js:161-171 hardSplit — zh over-cap sentence cut by code point splits embedded English words ("恭喜你拿到Google的offer了！" -> "…Googl" / "e的offer了！").
- B-5 minor — tts.js:181-187 + main.js:71 — en part capped by words not length; a 300-char token -> part 301 chars -> /api/speak 400, silent.
- B-6 minor — server/name.js:5 and web/js/name.js:8 — combining marks and curly apostrophe dropped ("राम"->"रम", "O’Brien"->"OBrien").
Clean: UD-1 (a) on every failure path (TC-115); normalisation; FX-009/010 10/10; FX-012 and FX-013 exact; speak limits/errors; respond fields; health tts.

# be-review-reliability #2 · step 6 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found
- R-1 major — server/tts.js:25-28 + stt/Sources/CompanionTTS/main.swift:95-99 — REQ-015/016/018: the real helper is strictly one-at-a-time and cannot cancel; an aborted or timed-out in-flight part is still generated and the next request waits behind it. LIVE: speak aborted at 0.5 s, then "Hello there." -> 504 at 10.004 s (helper id=398 ms=16987 for the aborted part; RTF 2.7 under load vs 0.8 assumed). Page stays silent after stop/send/toggle. TC-137/TC-110 pass only because fake-tts.cjs answers lines independently. Direction: cancel line or kill+restart helper on in-flight abort/timeout (weigh ~5 s re-warm); update DES-017 numbers.
- R-2 major — tts.js:132-137 + supervisor.js — REQ-017: a live-but-stuck helper is never detected; every speak times out, health says tts ready, no restart. Direction: N in-flight timeouts in a row (or no answer after speakMs+margin) => kill helper so restart path runs; add an in-order fake.
- R-3 minor — tts.js:35,66 — queued_ms measures only the node queue; real wait is in helper stdin (315/315 tts_done have queued_ms<=1).
- R-4 minor — main.js:223-227 — setup --warm-only exits 1 on a transient tts 'down' during the restart window (tts optional).
- R-5 minor — supervisor.js:25,40,45 — restart counter never resets after ready; 5 crashes over a long day disable tts.
Clean: chat not blocked by TTS (no shared lock); abort-while-queued; helper crash mid-request; missing TTS files; ready semantics; no user text in logs.
Memory: 24 GB, 27% free, swap 10.4/11.3 GB used; llama-server RSS 3.7 GB.

# be-review-security #2 · step 6 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found
- S-1 major — server/tts.js:24-27,127,136; main.js:101-104 — DES-017/DES-025: abort or timeout of the in-flight request writes the next queued request while the helper is still generating; in-order aborts push every queued part into the helper (probe: 20 aborts -> 21 generations; legit call waited 6145 ms). Direction: keep helper busy until it answers (or restarts); cap queue length. Existing test tests/dev-increment2.test.js:140 aborts queued before in-flight, hiding this.
- S-2 major — stt/Sources/CompanionTTS/main.swift:15,86; server/config.js:53 — DES-016: maxNewTokens 120 is per TTSKit chunk; default .sentence chunking with concurrentWorkerCount 0 runs all chunks in parallel; a 200-char request of rare chars = 468 tokens = >=11 parallel chunks (~11x designed cost). Legit parts (<=24 zh / 16 en words) never chunk. Direction: chunkingStrategy .none or concurrentWorkerCount 1, and/or lower speakChars to a part's size.
- S-3 minor — main.swift:78 (id -1), tts.js:60 — lone surrogate text accepted by Node, rejected by Swift decoder -> id:-1 reply dropped -> slot blocked 10 s. Direction: reject lone surrogates in parseSpeak and/or treat id:-1 as the in-flight answer.
- S-4 minor — main.js:115-130 no Host check — deferred BD-014 (DNS rebinding) now also reaches /api/speak. Live: OPTIONS 404 no ACAO; text/plain 400; rebound Host -> 200 audio.
- S-5 minor — bonsai.js:85 — any first sentence containing "988" drops CRISIS_LINE; name "988" passes cleanName -> "I am 988 and I am right here with you." has no hotline line (card still shows). Direction: skip only when the sentence has the CRISIS_LINE wording, or always append.
Clean: name cleaning, body limits, CORS/simple-request refusal, helper framing, logs, TTS_VOICE allow-list.

# fe-review-experience #2 · step 4 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found (evidence: scratchpad/review-e/)
- E-1 major — web/js/log.js:220-221 (add(li) scrolls before fillCard()) — FLOW-010 st. 3 / Q-030 "in view": after ~6 turns the crisis card's 988/911 lines and 收起 are below the log's bottom (phone 114 px hidden, laptop 88 px); chip is fine (text set before add). Probe p5-scroll.cjs; review-e/crisis-long@phone.png.
- E-2 major — web/js/name.js:60 (width in ch) — FLOW-013 st. 2 / FRAME-023: rename field sized in Latin ch, Chinese names mostly hidden while editing (phone default 小伙伴 shows only "伴": client 14 px vs scroll 44 px). Probe p1-rename.cjs.
- E-3 minor — web/js/app.js:55-65; 02-ui CMP-007 (design gap) — voice-not-ready: pressing the toggle flips aria-pressed but nothing visible changes.
- E-4 minor — web/css/page.css:125-126,141-143 — phone tooltip and rename note open upward over the art (design says under); readable; engineers flagged as DFB candidate.
Held: breathing guide both sizes and languages; clear while pending; crisis card stays under its reply, 收起 focus to input; rename Esc/empty/emoji.

# fe-review-accessibility #2 · step 4 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found (evidence scratchpad/review-a/, scripts review-a-scripts/)
- A-1 major — web/css/page.css:26 (grid rows 280px …), :150-153 — WCAG 1.4.4/1.4.10: at 200% zoom on 1280x800 the log is 40 px (1280x720: 16 px, page overflows 16 px); crisis card 988/911 unreadable in place. Fixed row from increment 1; card/chip content new. Direction: on short viewports stage yields height or page scrolls.
- A-2 major — web/js/log.js:220-221 — same as E-1: card scrolled to before it is filled; 988/911 below the fold after a normal conversation at 1440x900, 390x844, 375x667.
- A-3 minor — page.css:125-133 .speaker-tip — 1.4.13: tooltip not dismissible by Esc, vanishes when the pointer moves onto it (pointer-events none).
- A-4 minor — companion.js:106-114 — 4.1.3: live region created already filled on first breathing guide; first "吸气" likely not announced.
- A-5 minor — companion.js:103, log.js:195-196 — 4.1.3: guide end not announced.
- A-6 minor — index.html:405, app.js:84-89 — 4.1.3: poke result not perceivable by screen reader (phrase aria-hidden, name unchanged).
Passing: speaker toggle; companion button (Enter/Space, no repeat, focus ring 10.6:1); rename (label, description, focus return); breathing (focus on chip, Esc, 6 announcements/guide); crisis card region, focus kept, 收起 reachable; clear; targets ≥24; contrast; reduced motion; 1.4.12; 320 px; tab order.
Out of cut (increment 1): ol role=log drops list semantics; no h1; mood loops no pause (2.2.2); laptop talk button visual vs tab order.

# fe-review-integration #2 · step 4 · round 1 · increment 2 — candidates (filed by orchestrator)
verdict: issues_found (3 minor; evidence scratchpad/review-i/)
- I-1 minor — web/js/speaker.js:74-76,103 — when a part's play() fails the reading ends but the prefetched part is not aborted; backend still generates it (out-s1a.txt "200-garbage speaks 2 … reqfailed []"). Direction: abort the reading's controller whenever reading() ends early.
- I-2 minor — companion-client.js:73, app.js:253 — reply with missing/odd lang still triggers speak calls the server rejects (400). Direction: lang not zh/en → nothing to read.
- I-3 minor — app.js:237,258-267 — clear drops a pending reply but does not abort its respond request; next line waits behind it in llama-server (2 slots used per respond). Direction: give respond a caller signal and abort it in clearChat.
Held: all speak failure codes silent, no leaks; tts down mid-reading and recovery; new reply/clear/mute abort in-flight, URLs balanced, one Audio element; 60-part speech; double send → 1 respond; late reply after clear dropped; crisis with empty speech; throwing storage; long/markup names; breathing interactions.
