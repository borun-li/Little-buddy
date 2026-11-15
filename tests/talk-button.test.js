// Q-019 / DFB-005: timing state machine of the talk button with a fake clock and a fake stream.
// No microphone, no DOM: window/document and the mic functions are stubs.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const winL = {}; const docL = {};
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: (t, f) => { winL[t] = f; } };
globalThis.document = { addEventListener: (t, f) => { docL[t] = f; } };
const { createTalkButton } = await import('../web/js/talk-button.js');

function setup({ permission = 'granted' } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const btnL = {};
  const label = { textContent: '' }; const help = { textContent: '' };
  const classes = new Set();
  const button = {
    querySelector: (q) => (q.includes('label') ? label : help),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute() {}, removeAttribute() {}, style: { setProperty() {}, removeProperty() {} },
    addEventListener: (t, f) => { btnL[t] = f; },
    getBoundingClientRect: () => ({ left: 0, right: 10, top: 0, bottom: 10 }),
  };
  const hints = [];
  const hint = { show: (k) => hints.push(k), clear: () => hints.push('clear') };
  let resolveStream; let rejectStream;
  const stopped = []; const calls = []; const utterances = [];
  const deps = {
    micPermission: async () => permission,
    requestStream: () => new Promise((res, rej) => { resolveStream = res; rejectStream = rej; }),
    stopStream: (s) => stopped.push(s),
    meter: (s) => ({
      level: () => 0.3,
      wav: async () => { calls.push('wav'); return 'WAVBLOB'; },
      close: () => calls.push('close'),
    }),
    now: () => Date.now(),
  };
  createTalkButton({ button, hint, isPaused: () => false, onUtterance: (a) => utterances.push(a), deps });
  const pointer = { button: 0, preventDefault() {}, clientX: 5, clientY: 5 };
  return {
    label, classes, hints, stopped, calls, utterances,
    down: async () => { btnL.pointerdown(pointer); await Promise.resolve(); await Promise.resolve(); },
    up: (inside = true) => winL.pointerup({ clientX: inside ? 5 : 50, clientY: 5 }),
    open: async () => { resolveStream('S'); await Promise.resolve(); await Promise.resolve(); },
    fail: async (name) => { rejectStream(Object.assign(new Error(name), { name })); await Promise.resolve(); await Promise.resolve(); },
    wait: (ms) => mock.timers.tick(ms),
  };
}
const after = () => mock.timers.reset();
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('press only holds: no listening, no seconds before the stream opens', async () => {
  const t = setup();
  await t.down(); t.wait(150);
  assert.equal(t.classes.has('is-listening'), false);
  assert.deepEqual(t.hints, []);
  after();
});

test('slow open: hint at 0.2 s, listening and seconds at open, hint leaves', async () => {
  const t = setup();
  await t.down(); t.wait(210);
  assert.deepEqual(t.hints, ['micOpening']);
  t.wait(800); // 1 s of waiting is not listening time
  assert.equal(t.classes.has('is-listening'), false);
  await t.open();
  assert.equal(t.classes.has('is-listening'), true);
  assert.deepEqual(t.hints.slice(-2), ['clear', 'listeningNow']); // micOpening leaves, then the status line announces (FND-003)
  assert.match(t.label.textContent, /1 秒/);
  t.wait(2000);
  assert.match(t.label.textContent, /2 秒/); // counted from open (2 s ago), not from the press (3 s ago)
  after();
});

test('fast open: the 0.2 s hint never shows', async () => {
  const t = setup();
  await t.down(); t.wait(100); await t.open(); t.wait(300);
  assert.equal(t.hints.includes('micOpening'), false);
  after();
});

test('release before open: tooShort at once, a late stream is stopped and never records', async () => {
  const t = setup();
  await t.down(); t.wait(300);
  t.up(true);
  assert.equal(t.hints.at(-1), 'tooShort');
  await t.open();
  assert.deepEqual(t.stopped, ['S']);
  assert.equal(t.classes.has('is-listening'), false);
  assert.deepEqual(t.utterances, []);
  after();
});

test('release off the button or Esc before open: nothing shown, hint cleared', async () => {
  let t = setup();
  await t.down(); t.wait(300);
  t.up(false);
  assert.equal(t.hints.includes('tooShort'), false);
  assert.equal(t.hints.at(-1), 'clear');
  after();
  t = setup();
  await t.down(); t.wait(300);
  docL.keydown({ key: 'Escape' });
  assert.equal(t.hints.includes('tooShort'), false);
  await t.open();
  assert.deepEqual(t.stopped, ['S']);
  after();
});

test('0.5 s counts from open: 0.3 s after open is too short, however long the open took', async () => {
  const t = setup();
  await t.down(); t.wait(2000); await t.open(); t.wait(300);
  t.up(true);
  assert.equal(t.hints.at(-1), 'tooShort');
  assert.deepEqual(t.utterances, []);
  assert.deepEqual(t.calls, ['close']);
  after();
});

test('release 0.6 s after open: wav() before close(), blob handed to onUtterance', async () => {
  const t = setup();
  await t.down(); t.wait(1500); await t.open(); t.wait(600);
  t.up(true);
  await flush();
  assert.deepEqual(t.calls, ['wav', 'close']);
  assert.deepEqual(t.utterances, ['WAVBLOB']);
  after();
});

test('60 s counts from open and sends itself', async () => {
  const t = setup();
  await t.down(); t.wait(1000); await t.open();
  t.wait(59_000);
  assert.deepEqual(t.utterances, []);
  t.wait(1100);
  await flush();
  assert.deepEqual(t.utterances, ['WAVBLOB']);
  t.up(true); await flush(); // the late pointerup does nothing
  assert.equal(t.utterances.length, 1);
  after();
});

test('unknown permission: hint at 0.2 s first, then 600 ms decides prompt; nothing records', async () => {
  const t = setup({ permission: 'unknown' });
  await t.down(); t.wait(250);
  assert.deepEqual(t.hints, ['micOpening']);
  t.wait(400);
  assert.deepEqual(t.hints, ['micOpening', 'prompt']);
  await t.open();
  assert.deepEqual(t.stopped, ['S']);
  assert.equal(t.classes.has('is-listening'), false);
  after();
});

test('unknown permission, stream under 600 ms: records', async () => {
  const t = setup({ permission: 'unknown' });
  await t.down(); t.wait(300); await t.open();
  assert.equal(t.classes.has('is-listening'), true);
  assert.equal(t.hints.includes('prompt'), false);
  after();
});

test('open fails: the error hint shows and nothing is listening', async () => {
  const t = setup();
  await t.down(); await t.fail('NotFoundError');
  assert.equal(t.hints.at(-1), 'noMic');
  assert.equal(t.classes.has('is-listening'), false);
  after();
});
