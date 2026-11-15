// One-at-a-time test double for companion-tts (03 DES-016/DES-017): like the real helper (main.swift readLine loop) it takes the next
// request only after it has answered the previous one. To let a test see a server that writes while the slot is busy, stdin is still
// drained at once and every arrival is logged ({seen}) with a timestamp; the work itself is strictly serial ({done} is logged when answered).
// First word of `text` picks the mode (second word = ms where it says so):
//   SLOW <ms>  answer ok after <ms> (default 600)     HANG  never answer (and never take another request)
//   NEG        answer {id:-1, error:'ttskit'} (what the helper does for undecodable input)       ERR  answer {id, error:'ttskit'}
//   else       answer ok at once.   FAKE_TTS_LOG: jsonl {argv} | {seen:{id,text,t}} | {done:{id,text,t}}.  Audio: 0.1 s 440 Hz tone.
const fs = require('node:fs');
const log = (o) => process.env.FAKE_TTS_LOG && fs.appendFileSync(process.env.FAKE_TTS_LOG, JSON.stringify(o) + '\n');
const out0 = (o) => process.stdout.write(JSON.stringify(o) + '\n');
log({ argv: process.argv.slice(2) });
function wav() {
  const n = 2400, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const pending = [];
let busy = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function work() {
  if (busy) return;
  busy = true;
  while (pending.length) {
    const r = pending.shift();
    const [cmd, arg] = String(r.text).split(/\s+/);
    const reply = (id, o) => { out0({ id, ms: 1, ...o }); log({ done: { id: r.id, text: r.text, t: Date.now() } }); };
    if (cmd === 'HANG') await new Promise(() => {});
    if (cmd === 'SLOW') { await sleep(Number(arg) || 600); reply(r.id, { wav: wav().toString('base64'), audio_ms: 100 }); }
    else if (cmd === 'NEG') reply(-1, { error: 'ttskit' });
    else if (cmd === 'ERR') reply(r.id, { error: 'ttskit' });
    else reply(r.id, { wav: wav().toString('base64'), audio_ms: 100 });
  }
  busy = false;
}
setTimeout(() => out0({ event: 'ready', load_ms: 1, warm_ms: 1 }), 0);
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    log({ seen: { id: r.id, text: r.text, t: Date.now() } });
    pending.push(r);
    work();
  }
});
