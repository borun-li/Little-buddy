// R2 prototype pins that need no browser (Q-066, fe-tester #1, 2026-11-17): the 18 voice samples (Q-059), the url(#...) literal
// ban in web/ scripts (offline scan, Q-067), look-client preview's 'missing' path (Q-058).
// Expected values: the file list and limits of 03-queue.md Q-059 (9 ids x zh/en, <= 3 s) and Feasibility (24 kHz PCM16 mono).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLookClient } from '../web/js/look-client.js';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const VOICES_DIR = join(WEB, 'audio/voices');
// 03-queue.md Q-059 Files, in that order
const IDS = ['serena', 'vivian', 'uncle-fu', 'dylan', 'eric', 'ryan', 'aiden', 'ono-anna', 'sohee'];

// RIFF/WAVE header: the fmt chunk and the data chunk's size, read chunk by chunk
function wavInfo(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return { bad: 'not RIFF/WAVE' };
  const out = {};
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('latin1', at, at + 4); const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') Object.assign(out, { format: buf.readUInt16LE(at + 8), channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12), byteRate: buf.readUInt32LE(at + 16), bits: buf.readUInt16LE(at + 22) });
    if (id === 'data') out.dataBytes = Math.min(size, buf.length - at - 8);
    at += 8 + size + (size % 2);
  }
  out.seconds = out.byteRate ? out.dataBytes / out.byteRate : NaN;
  return out;
}

test('Q-059 Q-066 web/audio/voices holds exactly the 18 samples <id>-<zh|en>.wav, each 24 kHz mono PCM16, non-empty and <= 3.0 s', () => {
  const want = IDS.flatMap((id) => [`${id}-zh.wav`, `${id}-en.wav`]).sort();
  assert.deepEqual(readdirSync(VOICES_DIR).sort(), want);
  const bad = [];
  for (const f of want) {
    const w = wavInfo(readFileSync(join(VOICES_DIR, f)));
    const got = `${f}: ${JSON.stringify(w)}`;
    if (w.bad || w.format !== 1 || w.channels !== 1 || w.rate !== 24000 || w.bits !== 16 || w.byteRate !== 48000) bad.push(got);
    else if (!(w.dataBytes > 0) || !(w.seconds <= 3.0)) bad.push(got);
  }
  assert.deepEqual(bad, []);
});

test('Q-067 Q-066 no web/ script outside the generated look-art-data.js holds a "url(" + "#" literal (the offline scan reads it as a file)', () => {
  const scripts = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? scripts(p) : p.endsWith('.js') ? [p] : [];
  });
  const all = scripts(WEB).map((p) => relative(WEB, p));
  assert.ok(all.includes('js/look-art.js') && all.length >= 20, `${all.length} scripts`);
  const needle = ['url(', '#'].join('');
  const hits = all.filter((p) => p !== 'js/look-art-data.js' && readFileSync(join(WEB, p), 'utf8').includes(needle));
  assert.deepEqual(hits, []);
});

// A stand-in for the browser's Audio element: the test decides how the play ends.
function fakeAudio(ending) {
  const made = [];
  const createAudio = () => {
    const a = { src: '', paused: false, onended: null, onerror: null, pause() { a.paused = true; } };
    a.play = () => {
      if (ending === 'refused') return Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' }));
      queueMicrotask(() => (ending === 'ended' ? a.onended?.() : ending === 'error' ? a.onerror?.(new Event('error')) : null));
      return Promise.resolve();
    };
    made.push(a);
    return a;
  };
  return { createAudio, made };
}
const code = (c) => (e) => e?.code === c;

test('Q-058 Q-066 look-client preview rejects \'missing\' when the sample does not load (404 / unreadable), is refused, or the id is unknown', async () => {
  const lost = fakeAudio('error');
  await assert.rejects(createLookClient({ createAudio: lost.createAudio }).preview('uncle-fu', { lang: 'zh-Hans' }), code('missing'));
  assert.equal(lost.made[0].src, 'audio/voices/uncle-fu-zh.wav');
  const refused = fakeAudio('refused');
  await assert.rejects(createLookClient({ createAudio: refused.createAudio }).preview('sohee', { lang: 'en' }), code('missing'));
  const none = fakeAudio('ended');
  await assert.rejects(createLookClient({ createAudio: none.createAudio }).preview('nobody', { lang: 'en' }), code('missing'));
  assert.equal(none.made.length, 0, 'an unknown id asks for no file');
});

test('Q-058 Q-066 positive control: a sample that plays to the end resolves, from audio/voices/<id>-<en>.wav; an abort is an AbortError, not missing', async () => {
  const ok = fakeAudio('ended');
  await createLookClient({ createAudio: ok.createAudio }).preview('ono-anna', { lang: 'en' });
  assert.equal(ok.made[0].src, 'audio/voices/ono-anna-en.wav');
  const held = fakeAudio('hang'); const ctrl = new AbortController();
  const p = createLookClient({ createAudio: held.createAudio }).preview('serena', { lang: 'zh', signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError' && e.code === undefined);
  assert.equal(held.made[0].paused, true);
});

// Q-062 / DFB-004 (fe-tester #2, 2026-11-17): the remembered stage behind "once per stage, not on refresh". Expected values:
// look-client.js header contract (null = never asked; a lower result means the page plays), 03-queue Q-062 and DFB-004.
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k), m };
};

test('Q-062 claimStageUp: the first call returns null and remembers; later calls return the remembered stage, which only a higher stage replaces; a refresh (new client) sees it', async () => {
  const s = memStorage();
  const c = createLookClient({ storage: s });
  const got = [];
  for (const n of [2, 2, 3, 1]) { got.push(await c.claimStageUp(n)); got.push(s.m.get('companion.stageSeen')); }
  assert.deepEqual(got, [null, '2', 2, '2', 2, '3', 3, '3']);
  assert.equal(await createLookClient({ storage: s }).claimStageUp(3), 3, 'after a refresh the stage on screen is not lower than the remembered one');
  const refusing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(await createLookClient({ storage: refusing }).claimStageUp(2), null, 'a refused write is silent');
});

test('Q-062 DFB-004 lowering the demo days lowers the remembered stage to the new stage (equal or higher days leave it); then one claim crossing two stages returns the lower one once', async () => {
  const s = memStorage({ 'companion.demoDays': '7', 'companion.stageSeen': '3' });
  const c = createLookClient({ storage: s });
  const seen = [];
  for (const d of [8, 4, 3, 6, 0]) { await c.setDemoDays(d); seen.push(s.m.get('companion.stageSeen')); }
  assert.deepEqual(seen, ['3', '2', '2', '2', '1']);
  assert.deepEqual([await c.claimStageUp(3), await c.claimStageUp(3)], [1, 3]);
});
