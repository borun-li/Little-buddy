// Q-010 / DES-013: the real data layer against an injected fetch and fake timers (no network, no clock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, CODES, RESPOND_TIMEOUT_MS, TRANSCRIBE_TIMEOUT_MS } from '../web/js/companion-client.js';

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
  assert.deepEqual(r, { reply: 'Hi!', mood: 'pleasant-high' });
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
  assert.deepEqual(await c.health(), { ready: false, stt: 'ready', bonsai: 'starting' });
  assert.equal(seen.url, '/api/health');
});

test('Q-010 default timers resolve a call (the Illegal invocation bug showed only in the browser run)', async () => {
  const c = createClient({ fetch: async () => json(200, { reply: 'ok', mood: 'neutral' }) });
  assert.equal((await c.respond('x', [])).reply, 'ok');
});
