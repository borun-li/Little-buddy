// Q-025 / DES-025: the reply's voice. createSpeaker runs on a fake audio element and a fake speak().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSpeaker, silentWav } from '../web/js/speaker.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

function rig({ enabled = true, playRefuses = false } = {}) {
  const log = [];
  const pending = []; // { text, lang, signal, resolve, reject }
  const speak = (text, lang, signal) => new Promise((resolve, reject) => {
    log.push(`speak:${text}`);
    const p = { text, lang, signal, resolve, reject };
    pending.push(p);
    signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const audio = {
    src: '', onended: null, onerror: null,
    play() { log.push(`play:${this.src}`); return playRefuses ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); },
    pause() { log.push('pause'); },
    end() { this.onended && this.onended(); },
  };
  let n = 0;
  const url = { create: (b) => { const u = `blob:${b.tag}-${++n}`; log.push(`create:${u}`); return u; }, revoke: (u) => log.push(`revoke:${u}`) };
  const sp = createSpeaker({ speak, createAudio: () => audio, url, makeBlob: () => ({ tag: 'silent' }), isEnabled: () => enabled });
  const answer = (i, tag) => pending[i].resolve({ tag });
  return { sp, log, pending, audio, answer };
}

test('Q-025 part 1 is asked at once, part 2 as soon as part 1 has arrived, parts play in order', async () => {
  const r = rig();
  const done = r.sp.say(['一', '二', '三'], 'zh');
  assert.deepEqual(r.log, ['speak:一']);
  assert.equal(r.pending[0].lang, 'zh');
  r.answer(0, 'a'); await tick();
  assert.deepEqual(r.log.filter((l) => l.startsWith('speak')), ['speak:一', 'speak:二']); // one ahead, not two
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 1);
  r.answer(1, 'b'); await tick();
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 2); // part 3 waits for part 2 to have arrived and part 1 to end
  r.audio.end(); await tick(); // part 1 ends: part 2 plays
  assert.deepEqual(r.log.filter((l) => l.startsWith('play')), ['play:blob:a-1', 'play:blob:b-2']);
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 3);
  r.answer(2, 'c'); await tick();
  r.audio.end(); await tick();
  r.audio.end(); await tick();
  await done;
  assert.deepEqual(r.log.filter((l) => l.startsWith('play')).length, 3);
  assert.equal(r.sp.active, false);
  const created = r.log.filter((l) => l.startsWith('create')).map((l) => l.slice(7));
  const revoked = r.log.filter((l) => l.startsWith('revoke')).map((l) => l.slice(7));
  assert.deepEqual(revoked.sort(), created.sort()); // every object URL revoked
});

test('Q-025 never more than one request ahead of the part playing', async () => {
  const r = rig();
  r.sp.say(['a', 'b', 'c', 'd'], 'en');
  r.answer(0, 'a'); await tick();
  r.answer(1, 'b'); await tick();
  assert.equal(r.pending.length, 2);
  r.audio.end(); await tick();
  assert.equal(r.pending.length, 3);
  r.sp.stop();
});

test('Q-025 stop aborts the request in flight, pauses, revokes and drops the rest', async () => {
  const r = rig();
  const done = r.sp.say(['a', 'b', 'c'], 'en');
  r.answer(0, 'a'); await tick();
  assert.equal(r.pending[1].signal.aborted, false);
  r.sp.stop();
  assert.equal(r.pending[1].signal.aborted, true);
  assert.ok(r.log.includes('pause'));
  assert.ok(r.log.includes('revoke:blob:a-1'));
  await done;
  r.audio.end(); await tick();
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 2); // part c never asked
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 1);
  assert.equal(r.sp.active, false);
});

test('Q-025 stop while part 1 is still being generated plays nothing when it arrives late', async () => {
  const r = rig();
  const done = r.sp.say(['a'], 'en');
  r.sp.stop();
  assert.equal(r.pending[0].signal.aborted, true);
  r.answer(0, 'a'); await tick(); await done;
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 0);
});

test('Q-025 a new reply stops the old one: its request is aborted and its parts never play', async () => {
  const r = rig();
  const first = r.sp.say(['old1', 'old2'], 'zh');
  r.answer(0, 'o'); await tick();
  const second = r.sp.say(['new1'], 'en');
  assert.equal(r.pending[1].signal.aborted, true); // old2 in flight
  assert.equal(r.pending[2].text, 'new1');
  assert.equal(r.pending[2].lang, 'en');
  r.answer(2, 'n'); await tick();
  r.audio.end(); await tick();
  await Promise.all([first, second]);
  assert.deepEqual(r.log.filter((l) => l.startsWith('play')), ['play:blob:o-1', 'play:blob:n-2']);
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 3);
});

test('Q-025 a failed part ends the reading silently: no throw, nothing later plays', async () => {
  const r = rig();
  const done = r.sp.say(['a', 'b', 'c'], 'zh');
  r.pending[0].reject(Object.assign(new Error('x'), { code: 'failed' }));
  await done; // resolves, does not reject
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 0);
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 1);
  assert.equal(r.sp.active, false);
});

test('Q-025 a failure on part 2 lets part 1 finish, then stays silent', async () => {
  const r = rig();
  const done = r.sp.say(['a', 'b', 'c'], 'zh');
  r.answer(0, 'a'); await tick();
  r.pending[1].reject(Object.assign(new Error('x'), { code: 'timeout' }));
  await tick();
  r.audio.end(); await done;
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 1);
  assert.equal(r.log.filter((l) => l.startsWith('speak')).length, 2);
});

test('Q-025 a refused play() is silent and revokes the URL', async () => {
  const r = rig({ playRefuses: true });
  const done = r.sp.say(['a', 'b'], 'en').then(() => {}, () => assert.fail('must not reject'));
  r.answer(0, 'a');
  await done;
  assert.ok(r.log.includes('revoke:blob:a-1'));
  assert.equal(r.sp.active, false);
});

test('Q-025 empty speech, a non-array, blank parts or a muted gate ask nothing', async () => {
  const r = rig();
  await r.sp.say([], 'zh'); await r.sp.say(undefined, 'zh'); await r.sp.say(['', '  '], 'en');
  assert.equal(r.pending.length, 0);
  const m = rig({ enabled: false });
  await m.sp.say(['a'], 'en');
  assert.equal(m.pending.length, 0);
});

test('Q-025 unlock plays one silent clip, once, and never while a reading runs', async () => {
  const r = rig();
  r.sp.unlock(); r.sp.unlock();
  await tick();
  assert.equal(r.log.filter((l) => l.startsWith('play')).length, 1);
  assert.ok(r.log.some((l) => l.startsWith('revoke:blob:silent')));
  const s = rig();
  s.sp.say(['a'], 'en');
  s.sp.unlock();
  assert.equal(s.log.filter((l) => l.startsWith('play')).length, 0);
  s.sp.stop();
});

test('Q-025 silentWav is a valid 24 kHz mono 16-bit WAV', () => {
  const w = silentWav();
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...w.slice(8, 12)), 'WAVE');
  assert.equal(w.length, 44 + 480);
  assert.ok(w.slice(44).every((b) => b === 0));
});

test('Q-025 app.js wiring: voice after text and mood; send, press to talk and clear stop it', () => {
  const app = read('web/js/app.js');
  assert.match(app, /import \{[^}]*\bspeak\b[^}]*\} from '\.\/companion-client\.js'/);
  assert.match(app, /onClear\(\(\) => speaker\.stop\(\)\)/);
  const i = app.indexOf('companion.setMood(mood); // the mood changes');
  assert.ok(i > 0 && app.indexOf('speaker.say(speech, lang)', i) > i, 'say comes after the mood is set');
  assert.match(app, /clearSendHint\(\);\s*speaker\.stop\(\)/);
  assert.match(app, /isPaused: \(\) => \{\s*speaker\.stop\(\)/);
  assert.match(app, /speaker\.unlock\(\)/);
  assert.doesNotMatch(read('web/js/speaker.js'), /\(\s*[^)]*=\s*(setTimeout|clearTimeout)\b/); // no bare timer defaults
});

test('Q-026 onActive is true while a reading runs and false when it ends or is stopped', async () => {
  const events = [];
  const speak = (t, l, signal) => new Promise((res, rej) => signal.addEventListener('abort', () => rej(new Error('x'))));
  const sp = createSpeaker({ speak, createAudio: () => ({ play: () => Promise.resolve(), pause() {} }), onActive: (a) => events.push(a) });
  sp.say(['a'], 'zh');
  assert.deepEqual(events, [true]);
  sp.stop();
  assert.deepEqual(events, [true, false]);
  sp.stop();
  assert.deepEqual(events, [true, false]); // no repeat
});

test('Q-026 isEnabled false asks for nothing and never reports active', async () => {
  const events = []; const asked = [];
  const sp = createSpeaker({ speak: (t) => { asked.push(t); return Promise.reject(new Error('no')); }, isEnabled: () => false, onActive: (a) => events.push(a) });
  await sp.say(['a'], 'zh');
  assert.deepEqual(asked, []);
  assert.deepEqual(events, []);
});
