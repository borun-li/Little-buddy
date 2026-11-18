// R2 Q-059: pre-generates the 18 试听 samples (9 voices x zh, en) with the built companion-tts, offline, once.
//   node tools/make-voice-samples.mjs            (needs `swift build -c release --package-path stt` and the local models)
// Output: web/audio/voices/<id>-<zh|en>.wav (24 kHz PCM16 mono). A rerun overwrites. Voices come from web/js/look-client.js VOICES.
// DFB-006: all 9 voices in a language say the same line (previewLine, 01-ux.md), no name. If ANY voice runs past 3 s in a
// language, all 9 in that language use previewShort (never mixed per voice). Both lines are made per voice, then one choice per language.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { VOICES } from '../web/js/look-client.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HF = join(homedir(), 'Documents', 'huggingface');
const BIN = join(REPO, 'stt', '.build', 'release', 'companion-tts');
const MODEL = process.env.TTS_MODEL_DIR || join(HF, 'models', 'argmaxinc', 'ttskit-coreml'); // the PARENT of qwen3_tts/
const TOKENIZER = process.env.TTS_TOKENIZER_DIR || join(HF, 'models', 'Qwen', 'Qwen3-0.6B');
const OUT = join(REPO, 'web', 'audio', 'voices');
const LINES = { zh: '你好呀，我在呢。', en: "Hi, I'm here." };  // previewLine
const SHORT = { zh: '你好呀。', en: 'Hi there.' };        // previewShort
const MAX_MS = 3000;
const RATE = 24000;

// Cuts the silence after the last spoken 50 ms window (RMS > 300), keeping 150 ms. Returns { wav, ms }.
function trim(buf) {
  const at = buf.indexOf('data');
  const start = at + 8;
  const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + buf.length - ((buf.length - start) % 2)));
  const win = RATE / 20;
  let last = 0;
  for (let i = 0; i + win <= pcm.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j] * pcm[j];
    if (Math.sqrt(sum / win) > 300) last = i + win;
  }
  const keep = Math.min(pcm.length, last + RATE * 0.15);
  const body = Buffer.from(pcm.buffer, 0, keep * 2);
  const head = Buffer.from(buf.subarray(0, start));
  head.writeUInt32LE(36 + body.length, 4); // RIFF size
  head.writeUInt32LE(body.length, at + 4);  // data size
  return { wav: Buffer.concat([head, body]), ms: Math.round((keep / RATE) * 1000) };
}

for (const p of [BIN, MODEL, TOKENIZER]) if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

async function one(voice) {
  const child = spawn(BIN, ['--model-folder', MODEL, '--tokenizer-folder', TOKENIZER, '--voice', voice], { stdio: ['pipe', 'pipe', 'ignore'] });
  console.log(`pid ${child.pid} voice ${voice}`);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const next = async () => { for (;;) { const { value, done } = await lines.next(); if (done) throw new Error('helper ended'); try { return JSON.parse(value); } catch { /* not json */ } } };
  const out = {};
  try {
    const ready = await next();
    if (ready.event !== 'ready') throw new Error('no ready line');
    let id = 0;
    for (const lang of ['zh', 'en']) {
      out[lang] = {};
      for (const [kind, text] of [['full', LINES[lang]], ['short', SHORT[lang]]]) {
        // the model is not deterministic: a take over 3 s is made again (up to 3 takes), keeping the shortest
        for (let take = 0; take < 3 && !(out[lang][kind]?.ms <= MAX_MS); take++) {
          child.stdin.write(`${JSON.stringify({ id: ++id, text, lang })}\n`);
          const r = await next();
          if (r.error || !r.wav) throw new Error(`${voice}-${lang}: ${r.error ?? 'empty'}`);
          const t = trim(Buffer.from(r.wav, 'base64'));
          if (!out[lang][kind] || t.ms < out[lang][kind].ms) out[lang][kind] = t;
        }
        console.log(`  ${voice}-${lang} ${kind} ${out[lang][kind].ms} ms`);
      }
    }
  } finally { child.stdin.end(); child.kill(); }
  return out;
}

const made = {};
for (const v of VOICES) made[v] = await one(v);
for (const lang of ['zh', 'en']) {
  const kind = VOICES.some((v) => made[v][lang].full.ms > MAX_MS) ? 'short' : 'full';
  console.log(`${lang}: all ${VOICES.length} voices use the ${kind} line`);
  for (const v of VOICES) {
    const { wav, ms } = made[v][lang][kind];
    writeFileSync(join(OUT, `${v}-${lang}.wav`), wav);
    console.log(`  ${v}-${lang}.wav ${ms} ms${ms > MAX_MS ? '  (over 3 s)' : ''}`);
  }
}
