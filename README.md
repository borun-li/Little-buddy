# Little Buddy — an offline voice companion

**Talk about your feelings out loud, with Wi‑Fi off. Nothing leaves your Mac.**

Little Buddy is a local web page with a cartoon companion. You hold a button and speak.
[WhisperKit](https://github.com/argmaxinc/WhisperKit) (Argmax) turns your voice into text on-device,
**Bonsai 2 9B** writes a short, warm reply and judges your mood, and the companion's face follows
that mood. Argmax TTSKit then reads the reply aloud. Every step runs on your Mac, with no cloud and no API keys.

Built solo for the Cornell Local AI Hackathon (November 2026).

## What it does
- **Voice in, voice out:** hold to talk (or type). The reply is read aloud in the serena voice; you can mute it, and talking again stops it.
- **The face follows your mood:** five moods (pleasant/unpleasant × high/low energy, plus neutral) drive the companion's expression and colour.
- **English and Chinese:** the reply follows the language you speak; the interface switches between EN and 中文.
- **Breathe together:** when you sound anxious, it offers a short guided breath (in 4 s, out 6 s, three rounds).
- **Gentle safety net:** if a message suggests self-harm or suicide, the reply gently names the US 988 Suicide & Crisis Lifeline and a calm card shows 988 (call or text) and 911.
  Detection is semantic first (Bonsai judges the meaning, at temperature 0), with unambiguous phrases as a floor and the full phrase list as a fallback if the model is unavailable.
- **Yours:** give it a name, poke it, and clear the whole conversation in one tap. Nothing is stored on a server.

> Little Buddy is a companion, not a therapist or a medical device. It makes no health claims.

## How it works
```
Mic ─▶ WhisperKit (large-v3, Core ML) ─▶ Node gateway ─▶ Bonsai 2 9B (llama-server)
                                              │            ├─ reply (≤ 2 sentences)
                                              │            └─ mood + risk (JSON, temperature 0)
Page ◀── reply + mood + crisis flag ──────────┘
Page ──▶ /api/speak ──▶ TTSKit (Qwen3-TTS, voice serena) ──▶ audio
```
- `server/`: Node gateway on `127.0.0.1:4317`. It supervises the three local helpers and serves the page.
- `stt/`: Swift helpers for speech-to-text (WhisperKit) and read-aloud (TTSKit).
- `web/`: the page in plain HTML, CSS and JS, with no build step and no external requests.
- Everything binds to loopback only, and the page loads no remote fonts or scripts.

## Run it
Requirements: an Apple Silicon Mac (macOS 15), Node 22 or later, Xcode command-line tools (Swift), and enough free memory for Bonsai 9B plus Whisper large-v3.
Download the models first (Bonsai GGUF + llama-server, WhisperKit large-v3, Qwen3-TTS) to the paths listed in `server/config.js`.

```bash
npm run setup     # one time: builds the Swift helpers and warms up the models
npm start         # then turn Wi‑Fi off and open http://127.0.0.1:4317
```
If a model is missing, `npm start` prints the path it expects.
If read-aloud files are missing, chat still works without voice.

## Tests
```bash
npm test          # frontend and backend suites (the live suites expect a running instance)
```
More than 300 automated tests cover the moods, language, crisis rule, read-aloud queue and page behaviour. The design,
review and acceptance records are in `docs/`.

## Demo video
`docs/video/` holds the storyboard. The video itself is linked in the submission.
