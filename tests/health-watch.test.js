// Q-012: the warming table of docs/frontend/01-ux.md on a fake clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthWatch } from '../web/js/health-watch.js';

function rig(script) {
  let t = 0;
  const q = [];
  let seq = 0;
  const calls = [];
  const changes = [];
  const timers = {
    setTimeout: (fn, ms) => { const id = ++seq; q.push({ id, at: t + ms, fn }); return id; },
    clearTimeout: (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); },
  };
  const health = async () => {
    calls.push(t);
    const r = typeof script === 'function' ? script(t) : script;
    if (r instanceof Error) throw r;
    return r;
  };
  const watch = createHealthWatch({ health, onChange: (s) => changes.push(s), now: () => t, timers });
  async function advance(ms) {
    const end = t + ms;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    for (;;) {
      q.sort((a, b) => a.at - b.at);
      if (!q.length || q[0].at > end) break;
      const next = q.shift();
      t = next.at;
      next.fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    t = end;
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
  return { watch, advance, calls, changes, pending: () => q.length };
}
const R = { ready: true, stt: 'ready', bonsai: 'ready' };

test('ready at open: no hint at all, checks stop', async () => {
  const r = rig(R);
  r.watch.start();
  await r.advance(10000);
  assert.deepEqual(r.watch.state, { canSend: true, canVoice: true, waking: false, hint: null });
  assert.equal(r.changes.length, 0);
  assert.equal(r.calls.length, 1);
  assert.equal(r.pending(), 0);
});

test('bonsai starting: Enter and hold blocked, warming hint, caption waking; polls every 2 s', async () => {
  const r = rig({ ready: false, stt: 'starting', bonsai: 'starting' });
  r.watch.start();
  await r.advance(0);
  assert.deepEqual(r.watch.state, { canSend: false, canVoice: false, waking: true, hint: 'warming' });
  await r.advance(6000);
  assert.deepEqual(r.calls, [0, 2000, 4000, 6000]);
  assert.equal(r.changes.length, 1); // no repeat announcement per poll
});

test('bonsai ready, stt starting or down: sends, voice not ready, caption is the mood', async () => {
  for (const stt of ['starting', 'down']) {
    const r = rig({ ready: false, stt, bonsai: 'ready' });
    r.watch.start();
    await r.advance(0);
    assert.deepEqual(r.watch.state, { canSend: true, canVoice: false, waking: false, hint: 'voiceNotReady' });
  }
});

test('warming then ready: awake hint for 4 s, then gone; checks stop', async () => {
  const r = rig((t) => (t < 4000 ? { ready: false, stt: 'starting', bonsai: 'starting' } : R));
  r.watch.start();
  await r.advance(4000);
  assert.deepEqual(r.watch.state, { canSend: true, canVoice: true, waking: false, hint: 'awake' });
  await r.advance(3999);
  assert.equal(r.watch.state.hint, 'awake');
  await r.advance(1);
  assert.equal(r.watch.state.hint, null);
  const n = r.calls.length;
  await r.advance(10000);
  assert.equal(r.calls.length, n);
});

test('check fails or bonsai down: unreachable, then stillDown after 30 s; recovery says awake', async () => {
  const r = rig((t) => (t < 40000 ? new Error('unavailable') : R));
  r.watch.start();
  await r.advance(0);
  assert.deepEqual(r.watch.state, { canSend: false, canVoice: false, waking: false, hint: 'unreachable' });
  await r.advance(29999);
  assert.equal(r.watch.state.hint, 'unreachable');
  await r.advance(2001); // check at 30000 sees 30 s down
  assert.equal(r.watch.state.hint, 'stillDown');
  await r.advance(10000);
  assert.equal(r.watch.state.hint, 'awake');
});

test('bonsai down reported by health is the same as a failed check', async () => {
  const r = rig({ ready: false, stt: 'down', bonsai: 'down' });
  r.watch.start();
  await r.advance(0);
  assert.equal(r.watch.state.hint, 'unreachable');
  assert.equal(r.watch.state.canSend, false);
});

test('a failed send (not_ready / unavailable) resumes checks; other codes do not', async () => {
  const r = rig(R);
  r.watch.start();
  await r.advance(0);
  r.watch.failed('timeout');
  r.watch.failed('failed');
  await r.advance(5000);
  assert.equal(r.calls.length, 1);
  r.watch.failed('not_ready');
  await r.advance(0);
  assert.equal(r.calls.length, 1); // first check one poll later, not at once (01-ux Hint rules)
  await r.advance(1999);
  assert.equal(r.calls.length, 1);
  await r.advance(1);
  assert.equal(r.calls.length, 2);
  assert.equal(r.watch.state.hint, 'awake'); // a not-ready hint was shown (by the send), so awake follows
});

test('stop cancels pending checks', async () => {
  const r = rig({ ready: false, stt: 'starting', bonsai: 'starting' });
  r.watch.start();
  await r.advance(0);
  r.watch.stop();
  await r.advance(10000);
  assert.equal(r.calls.length, 1);
});

// Q-026: tts is its own part: polling goes on until it is ready, with no hint and no change of state.
test('Q-026 tts starting after bonsai and stt are ready: keeps polling every 2 s, state and hint untouched', async () => {
  let tts = 'starting';
  const ttsEvents = [];
  const r = rig(() => ({ ready: true, stt: 'ready', bonsai: 'ready', tts }));
  r.watch.start();
  await r.advance(0);
  assert.equal(r.watch.ttsReady, false);
  assert.deepEqual(r.watch.state, { canSend: true, canVoice: true, waking: false, hint: null });
  await r.advance(6000);
  assert.equal(r.calls.length, 4); // open, 2 s, 4 s, 6 s
  assert.equal(r.changes.length, 0); // no onChange, no hint for tts
  tts = 'ready';
  await r.advance(2000);
  assert.equal(r.watch.ttsReady, true);
  const n = r.calls.length;
  await r.advance(10000);
  assert.equal(r.calls.length, n); // polling stops once tts is ready
  assert.equal(r.changes.length, 0);
  assert.equal(ttsEvents.length, 0);
});

test('Q-026 onTts fires only when tts changes; tts down does not stop polling', async () => {
  let tts = 'down';
  const events = [];
  let t = 0;
  const q = [];
  const timers = {
    setTimeout: (fn, ms) => { q.push({ at: t + ms, fn }); return q.length; },
    clearTimeout: () => {},
  };
  const watch = createHealthWatch({
    health: async () => ({ ready: true, stt: 'ready', bonsai: 'ready', tts }),
    onTts: (on) => events.push(on), now: () => t, timers,
  });
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  watch.start(); await flush();
  assert.deepEqual(events, [false]);
  const step = async () => { const next = q.shift(); t = next.at; next.fn(); await flush(); };
  await step(); assert.deepEqual(events, [false]); // same value: no new event
  tts = 'ready';
  await step(); assert.deepEqual(events, [false, true]);
  assert.equal(q.length, 0);
});

test('Q-026 a health body without a tts field counts as ready (no extra polling)', async () => {
  const r = rig(R);
  r.watch.start();
  await r.advance(0);
  assert.equal(r.watch.ttsReady, true);
  assert.equal(r.pending(), 0);
});

test('Q-026 ttsFailed(not_ready) marks the voice not ready and resumes checks; other codes are ignored', async () => {
  const r = rig({ ready: true, stt: 'ready', bonsai: 'ready', tts: 'ready' });
  r.watch.start();
  await r.advance(0);
  r.watch.ttsFailed('timeout');
  assert.equal(r.watch.ttsReady, true);
  r.watch.ttsFailed('unavailable');
  assert.equal(r.watch.ttsReady, false);
  assert.equal(r.watch.state.hint, null);
  await r.advance(2000);
  assert.equal(r.calls.length, 2);
  assert.equal(r.watch.ttsReady, true); // the next check says ready again
});
