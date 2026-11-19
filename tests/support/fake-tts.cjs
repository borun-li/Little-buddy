// Test double for companion-tts (03 DES-016 protocol): stdin {"id","text","lang"}\n -> stdout {"id","wav":b64,"ms","audio_ms"|"error"}\n.
// The first word of `text` picks the behaviour. FAKE_TTS_LOG: jsonl, one {argv} at start then one {req} per request written to the helper.
// FAKE_TTS_WARM_MS delays the ready line. R2 (DES-040 protocol): a request may carry "voice"; the reply echoes the voice used ("voice", the
// start voice from --voice when the line has none; error "bad_request" for a voice outside the 9 ids). FAKE_TTS_DELAY_MS delays every answer;
// FAKE_TTS_NOVOICE=1 = an old helper (no voice in the reply); FAKE_TTS_ECHO=<id> = always report that voice. Not a model: the "audio" is a 0.1 s 440 Hz tone, PCM16 mono 24000 Hz.
const readline = require('node:readline');
const fs = require('node:fs');
const log = (o) => process.env.FAKE_TTS_LOG && fs.appendFileSync(process.env.FAKE_TTS_LOG, JSON.stringify(o) + '\n');
const out0 = (o) => console.log(JSON.stringify(o));
log({ argv: process.argv.slice(2) });
const VOICES = ['ryan', 'aiden', 'ono-anna', 'sohee', 'eric', 'dylan', 'serena', 'vivian', 'uncle-fu'];
const startVoice = process.argv[process.argv.indexOf('--voice') + 1];
function wav() {
  const n = 2400, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
console.log('loading tts model... (not JSON: the server must drop this line)');
setTimeout(() => out0({ event: 'ready', load_ms: 1, warm_ms: 1 }), Number(process.env.FAKE_TTS_WARM_MS || 0));
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  const r = JSON.parse(l);
  log({ req: { id: r.id, text: r.text, lang: r.lang, voice: r.voice } });
  const cmd = String(r.text).split(/\s+/)[0];
  const used = process.env.FAKE_TTS_ECHO || r.voice || startVoice;
  const vo = process.env.FAKE_TTS_NOVOICE === '1' ? {} : { voice: used };
  const delay = Number(process.env.FAKE_TTS_DELAY_MS || 0);
  const out = (o) => setTimeout(() => out0({ id: r.id, ms: 1, ...vo, ...o }), delay);
  const ok = () => out({ wav: wav().toString('base64'), audio_ms: 100 });
  if (r.voice !== undefined && !VOICES.includes(r.voice)) return out({ error: 'bad_request', voice: undefined });
  if (cmd === 'ERR') return out({ error: 'ttskit' });
  if (cmd === 'HANG') return;
  if (cmd === 'DIE') process.exit(7);
  if (cmd === 'SLOW') return setTimeout(ok, 400);
  if (cmd === 'LATE') return setTimeout(ok, 700);
  return ok();
});
