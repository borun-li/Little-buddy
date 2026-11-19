// R2 prototype pins that need no browser (Q-066, fe-tester #1, 2026-11-17): the 18 voice samples (Q-059), the url(#...) literal
// ban in web/ scripts (offline scan, Q-067), look-client preview's 'missing' path (Q-058).
// Expected values: the file list and limits of 03-queue.md Q-059 (9 ids x zh/en, <= 3 s) and Feasibility (24 kHz PCM16 mono).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLookClient } from '../web/js/look-client.js';
import * as lookClientModule from '../web/js/look-client.js';

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

// Q-073 / Q-076 (fe-tester #4, 2026-11-18): look-client over an injected fetch. Expected values: contract § R2 seam (look, voice, growth on
// GET /api/profile; look / voice keys on POST /api/profile); 03-queue Q-073: no localStorage, no demo days, no remembered stage.
const jres = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const LOOK = { character: 3, outfit: { head: 1, clothes: 'none', shoes: 2, accessory: 'none' } };
const PROFILE = { look: LOOK, voice: 'ryan', growth: { days: 3, stage: 2, into: 0, span: 4, left: 4 } };
function recorder(answer) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined }); return answer(url, init); };
  return { fetch, calls };
}

test('Q-073 look-client reads look, voice and growth from GET /api/profile, one request for the three reads asked together, a new one for the next', async () => {
  const r = recorder(async () => jres(200, PROFILE));
  const c = createLookClient({ fetch: r.fetch });
  assert.deepEqual(await Promise.all([c.getLook(), c.getVoice(), c.getGrowth()]), [LOOK, 'ryan', PROFILE.growth]);
  assert.deepEqual(r.calls, [{ url: '/api/profile', method: 'GET', body: undefined }]);
  await c.getGrowth();
  assert.equal(r.calls.length, 2, 'nothing is cached between moments: growth is the service\'s answer each time');
});

test('Q-073 setLook posts {look: patch} and returns the saved look; setVoice posts {voice} and returns the saved voice; a 409 / 500 rejects with the body\'s code', async () => {
  const r = recorder(async (_u, init) => jres(200, JSON.parse(init.body).look ? { look: LOOK } : { voice: 'sohee' }));
  const c = createLookClient({ fetch: r.fetch });
  assert.deepEqual(await c.setLook({ character: 3, outfit: { head: 1 } }), LOOK);
  assert.equal(await c.setVoice('sohee'), 'sohee');
  assert.deepEqual(r.calls, [
    { url: '/api/profile', method: 'POST', body: { look: { character: 3, outfit: { head: 1 } } } },
    { url: '/api/profile', method: 'POST', body: { voice: 'sohee' } },
  ]);
  for (const [status, error] of [[409, 'not_saved'], [500, 'unreadable'], [400, 'bad_request'], [403, 'forbidden'], [500, 'weird']]) {
    const e = createLookClient({ fetch: async () => jres(status, { error }) });
    await assert.rejects(e.setLook({ character: 2 }), (x) => x.code === (error === 'weird' ? 'failed' : error), `${status} ${error}`);
  }
  await assert.rejects(createLookClient({ fetch: async () => { throw new TypeError('x'); } }).setVoice('ryan'), code('unavailable'));
});

test('Q-073 a 200 body that is not the seam shape is \'failed\' (look, voice, growth each), never a default', async () => {
  const bad = (patch) => createLookClient({ fetch: async () => jres(200, { ...PROFILE, ...patch }) });
  await assert.rejects(bad({ look: { character: 4, outfit: LOOK.outfit } }).getLook(), code('failed'));
  await assert.rejects(bad({ look: { character: 1, outfit: { ...LOOK.outfit, head: 9 } } }).getLook(), code('failed'));
  await assert.rejects(bad({ voice: 'nobody' }).getVoice(), code('failed'));
  await assert.rejects(bad({ growth: { days: 3, stage: 5, into: 0, span: 4, left: 4 } }).getGrowth(), code('failed'));
  await assert.rejects(bad({ growth: undefined }).getGrowth(), code('failed'));
});

test('Q-073 Q-076 the prototype\'s fake layer is gone: no demo days, no remembered stage, no localStorage keys, no growth maths in the client', () => {
  const c = createLookClient({ fetch: async () => jres(200, PROFILE) });
  assert.deepEqual(Object.keys(c).sort(), ['getGrowth', 'getLook', 'getMemory', 'getVoice', 'preview', 'setLook', 'setVoice']);
  assert.deepEqual(Object.keys(lookClientModule).filter((k) => /demo|seen|claim|growthOf|KEY/i.test(k)), []);
  const src = readFileSync(join(WEB, 'js/look-client.js'), 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.equal(/localStorage|sessionStorage|stageSeen|demoDays/.test(src), false);
});
