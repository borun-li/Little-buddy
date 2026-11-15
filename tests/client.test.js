// Q-010 / DES-013: the real data layer against an injected fetch and fake timers (no network, no clock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, CODES, RESPOND_TIMEOUT_MS, TRANSCRIBE_TIMEOUT_MS, SPEAK_TIMEOUT_MS } from '../web/js/companion-client.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fakeTimers = () => {
  const t = { pending: [], setTimeout: (fn, ms) => { t.pending.push({ fn, ms }); return t.pending.length - 1; }, clearTimeout: () => {} };
  return t;
};
const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);

test('Q-010 respond posts line and history, parses 200', async () => {
  let seen;
  const c = createClient({ fetch: async (url, init) => { seen = { url, init }; return json(200, { reply: 'Hi!', mood: 'pleasant-high' }); } });
  const r = await c.respond('hello', [{ role: 'user', text: 'a', extra: 1 }]);
  assert.deepEqual(r, { reply: 'Hi!', mood: 'pleasant-high', lang: undefined, crisis: false, region: null, speech: [] });
  assert.equal(seen.url, '/api/respond');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.init.body), { line: 'hello', history: [{ role: 'user', text: 'a' }] });
});

test('Q-010 only the last 40 history entries are sent, no language field', async () => {
  let body;
  const c = createClient({ fetch: async (_u, init) => { body = JSON.parse(init.body); return json(200, { reply: 'x', mood: 'neutral' }); } });
  const history = Array.from({ length: 55 }, (_, i) => ({ role: i % 2 ? 'companion' : 'user', text: `t${i}` }));
  await c.respond('l', history);
  assert.equal(body.history.length, 40);
  assert.equal(body.history[0].text, 't15');
  assert.deepEqual(Object.keys(body).sort(), ['history', 'line']);
});

test('Q-010 each of the six error bodies maps to .code; unknown body maps to failed', async () => {
  for (const code of CODES) {
    const c = createClient({ fetch: async () => json(503, { error: code }) });
    await rejects(c.respond('x', []), code);
  }
  await rejects(createClient({ fetch: async () => json(500, { error: 'weird' }) }).respond('x'), 'failed');
  await rejects(createClient({ fetch: async () => ({ ok: false, status: 502, json: async () => { throw new Error('no json'); } }) }).respond('x'), 'failed');
});

test('Q-010 failed fetch is unavailable; a 200 without a reply is failed; unknown mood is neutral', async () => {
  await rejects(createClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).respond('x'), 'unavailable');
  await rejects(createClient({ fetch: async () => json(200, { reply: '  ', mood: 'neutral' }) }).respond('x'), 'failed');
  const r = await createClient({ fetch: async () => json(200, { reply: 'ok', mood: 'bogus' }) }).respond('x');
  assert.equal(r.mood, 'neutral');
});

test('Q-010 respond aborts at 16 s and transcribe at 13 s with code timeout', async () => {
  for (const [call, ms] of [['respond', RESPOND_TIMEOUT_MS], ['transcribe', TRANSCRIBE_TIMEOUT_MS]]) {
    const timers = fakeTimers();
    const c = createClient({ fetch: hang, timers });
    const p = c[call]('x', []);
    await new Promise((r) => setImmediate(r));
    assert.equal(timers.pending[0].ms, ms);
    timers.pending[0].fn();
    await rejects(p, 'timeout');
  }
  assert.equal(RESPOND_TIMEOUT_MS, 16000);
  assert.equal(TRANSCRIBE_TIMEOUT_MS, 13000);
});

test('Q-010 transcribe sends audio/wav; health returns the three fields', async () => {
  let seen;
  const c = createClient({ fetch: async (url, init) => { seen = { url, init }; return json(200, url === '/api/health' ? { ready: false, stt: 'ready', bonsai: 'starting' } : { text: '你好' }); } });
  const blob = new Blob([new Uint8Array(4)], { type: 'audio/wav' });
  assert.deepEqual(await c.transcribe(blob), { text: '你好' });
  assert.equal(seen.init.headers['Content-Type'], 'audio/wav');
  assert.equal(seen.init.body, blob);
  assert.deepEqual(await c.health(), { ready: false, stt: 'ready', bonsai: 'starting', tts: undefined });
  assert.equal(seen.url, '/api/health');
});

test('Q-010 default timers resolve a call (the Illegal invocation bug showed only in the browser run)', async () => {
  const c = createClient({ fetch: async () => json(200, { reply: 'ok', mood: 'neutral' }) });
  assert.equal((await c.respond('x', [])).reply, 'ok');
});

// ---- Q-020 / DES-024 (increment 2)
const wav = () => new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: 'audio/wav' });
const audioRes = (blob) => ({ ok: true, status: 200, blob: async () => blob, json: async () => { throw new Error('not json'); } });

test('Q-020 respond sends name when set, leaves it out when null or absent; returns lang, crisis, speech', async () => {
  const bodies = [];
  const c = createClient({ fetch: async (_u, init) => { bodies.push(JSON.parse(init.body)); return json(200, { reply: 'Hi', mood: 'neutral', lang: 'en', crisis: true, speech: ['Hi', 'there'] }); } });
  const r = await c.respond('hello', [], 'Pip');
  assert.deepEqual(r, { reply: 'Hi', mood: 'neutral', lang: 'en', crisis: true, region: null, speech: ['Hi', 'there'] });
  await c.respond('hello', [], null);
  await c.respond('hello', []);
  assert.deepEqual(bodies[0], { line: 'hello', history: [], name: 'Pip' });
  assert.deepEqual(Object.keys(bodies[1]).sort(), ['history', 'line']);
  assert.deepEqual(Object.keys(bodies[2]).sort(), ['history', 'line']);
});

test('Q-020 a 200 without speech reads as [], without crisis as false, lang is never guessed', async () => {
  const r = await createClient({ fetch: async () => json(200, { reply: 'ok', mood: 'neutral' }) }).respond('x');
  assert.deepEqual(r.speech, []);
  assert.equal(r.crisis, false);
  assert.equal(r.lang, undefined);
  const r2 = await createClient({ fetch: async () => json(200, { reply: 'ok', mood: 'neutral', crisis: 'yes', speech: 'no' }) }).respond('x');
  assert.equal(r2.crisis, false);
  assert.deepEqual(r2.speech, []);
});

test('Q-020 speak posts {text, lang} and returns the WAV Blob', async () => {
  let seen;
  const blob = wav();
  const c = createClient({ fetch: async (url, init) => { seen = { url, init }; return audioRes(blob); } });
  const out = await c.speak('你好', 'zh');
  assert.equal(out, blob);
  assert.equal(seen.url, '/api/speak');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { text: '你好', lang: 'zh' });
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
});

test('Q-020 speak stops at 11 s with timeout, also while the body is still arriving', async () => {
  assert.equal(SPEAK_TIMEOUT_MS, 11000);
  const timers = fakeTimers();
  const p = createClient({ fetch: hang, timers }).speak('x', 'en');
  await new Promise((r) => setImmediate(r));
  assert.equal(timers.pending[0].ms, 11000);
  timers.pending[0].fn();
  await rejects(p, 'timeout');
  const t2 = fakeTimers();
  const slowBody = async (_u, { signal }) => ({ ok: true, status: 200, blob: () => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  const p2 = createClient({ fetch: slowBody, timers: t2 }).speak('x', 'en');
  await new Promise((r) => setImmediate(r));
  t2.pending[0].fn();
  await rejects(p2, 'timeout');
});

test('Q-020 speak non-2xx maps the body error; unknown or empty is failed', async () => {
  for (const code of CODES) await rejects(createClient({ fetch: async () => json(503, { error: code }) }).speak('x', 'en'), code);
  await rejects(createClient({ fetch: async () => json(500, { error: 'weird' }) }).speak('x', 'en'), 'failed');
  await rejects(createClient({ fetch: async () => audioRes(new Blob([])) }).speak('x', 'en'), 'failed');
  await rejects(createClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).speak('x', 'en'), 'unavailable');
});

test('Q-020 a caller abort stays an AbortError (no code), before and during the call', async () => {
  const abortErr = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  const during = (_u, { signal }) => new Promise((_, rej) => { if (signal.aborted) rej(abortErr()); else signal.addEventListener('abort', () => rej(abortErr())); });
  const ac = new AbortController();
  const p = createClient({ fetch: during }).speak('x', 'en', ac.signal);
  await new Promise((r) => setImmediate(r));
  ac.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError' && e.code === undefined);
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(createClient({ fetch: during }).speak('x', 'en', pre.signal), (e) => e.name === 'AbortError' && e.code === undefined);
  // abort while the body is read
  const ac2 = new AbortController();
  const slow = async (_u, { signal }) => ({ ok: true, status: 200, blob: () => new Promise((_, rej) => signal.addEventListener('abort', () => rej(abortErr()))) });
  const p2 = createClient({ fetch: slow }).speak('x', 'en', ac2.signal);
  await new Promise((r) => setImmediate(r));
  ac2.abort();
  await assert.rejects(p2, (e) => e.name === 'AbortError');
});

test('Q-020 health returns tts as given', async () => {
  for (const tts of ['starting', 'ready', 'down']) {
    const h = await createClient({ fetch: async () => json(200, { ready: true, stt: 'ready', bonsai: 'ready', tts }) }).health();
    assert.equal(h.tts, tts);
    assert.equal(h.ready, true);
  }
});
