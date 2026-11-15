// FND-001 / FND-002 / FND-003 (review round 1): the hint rules in health-watch, the hold rules in talk-button.
// Each test is red on the code before the fix (checked against a copy of the old web/js, see 03-queue.md Fix lines).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COPY } from '../web/js/copy.js';

const winL = {};
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: (t, f) => { winL[t] = f; } };
globalThis.document = { addEventListener() {} };
const { createTalkButton, createHint } = await import('../web/js/talk-button.js');
const { createHealthWatch } = await import('../web/js/health-watch.js');

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const READY = { ready: true, stt: 'ready', bonsai: 'ready' };

test('FND-001 failed(unavailable) does not arm awake; the first check is 2 s later', async () => {
  mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const calls = []; const changes = [];
  const watch = createHealthWatch({ health: async () => { calls.push(Date.now()); return READY; }, onChange: (s) => changes.push(s.hint), now: () => Date.now() });
  watch.failed('unavailable');
  mock.timers.tick(1999); await flush();
  assert.equal(calls.length, 0);
  mock.timers.tick(1); await flush();
  assert.equal(calls.length, 1);
  assert.equal(changes.includes('awake'), false);
  watch.stop(); mock.timers.reset();
});

test('FND-001 failed(not_ready) still lets awake follow (a health hint was shown)', async () => {
  mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const changes = [];
  const watch = createHealthWatch({ health: async () => READY, onChange: (s) => changes.push(s.hint), now: () => Date.now() });
  watch.failed('not_ready');
  mock.timers.tick(2000); await flush();
  assert.ok(changes.includes('awake'));
  watch.stop(); mock.timers.reset();
});

function fakeHintEl() {
  const classes = new Set(); const text = { textContent: '' }; const icon = { setAttribute() {} };
  return { text, classes, el: { querySelector: (q) => (q.includes('text') ? text : icon), classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } };
}

test('FND-003 listeningNow is written into the status line, kept visually hidden, key kept', () => {
  mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout'] });
  const f = fakeHintEl(); const hint = createHint(f.el);
  hint.show('listeningNow');
  mock.timers.tick(30);
  assert.equal(f.text.textContent, COPY.zh.listeningNow);
  assert.equal(f.classes.has('is-shown'), false);
  assert.equal(hint.key, 'listeningNow');
  assert.ok(COPY.zh.listeningNow && COPY.en.listeningNow);
  mock.timers.reset();
});

function rig({ onUtterance }) {
  mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const btnL = {}; const label = {}; const help = {}; const hints = []; const closed = []; let res;
  const button = { querySelector: (q) => (q.includes('label') ? label : help), classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, style: { setProperty() {}, removeProperty() {} }, addEventListener: (t, f) => { btnL[t] = f; }, getBoundingClientRect: () => ({ left: 0, right: 10, top: 0, bottom: 10 }) };
  const talk = createTalkButton({ button, hint: { show: (k) => hints.push(k), clear: () => hints.push('clear') }, isPaused: () => false, onUtterance, deps: { micPermission: async () => 'granted', requestStream: () => new Promise((r) => { res = r; }), stopStream() {}, meter: () => ({ level: () => 0, wav: async () => 'W', close: () => closed.push(1) }), now: () => Date.now() } });
  return {
    talk, hints, closed,
    async hold() { btnL.pointerdown({ button: 0, preventDefault() {} }); await flush(); },
    async open() { res('S'); await flush(); },
  };
}

test('FND-003 the stream opening announces listeningNow after micOpening', async () => {
  const r = rig({ onUtterance() {} });
  await r.hold();
  mock.timers.tick(210);
  await r.open();
  assert.deepEqual(r.hints, ['micOpening', 'clear', 'listeningNow']);
  mock.timers.reset();
});

test('FND-003 listeningNow leaves when the hold ends', async () => {
  const r = rig({ onUtterance() {} });
  await r.hold(); mock.timers.tick(210); await r.open();
  mock.timers.tick(1000);
  winL.pointerup({ clientX: 5, clientY: 5 }); await flush();
  assert.equal(r.hints.at(-1), 'clear');
  mock.timers.reset();
});

test('FND-002 a hold running when a reply goes pending is cancelled: mic closed, no utterance', async () => {
  const utter = [];
  const r = rig({ onUtterance: (a) => utter.push(a) });
  await r.hold(); mock.timers.tick(210); await r.open();
  mock.timers.tick(1000);
  r.talk.setPaused(true); // Enter sent a typed line while the button is held
  assert.deepEqual(r.closed, [1]);
  winL.pointerup({ clientX: 5, clientY: 5 }); await flush();
  assert.deepEqual(utter, []);
  mock.timers.reset();
});

test('FND-001/002 app.js wiring: awake gated by hint.key, utterance dropped while pending', () => {
  const src = readFileSync(new URL('../web/js/app.js', import.meta.url), 'utf8');
  assert.match(src, /HEALTH_HINTS\.has\(cur\)\) showHint\('awake'\)/);
  assert.match(src, /if \(cur === 'awake'\) hint\.clear\(\)/);
  assert.match(src, /onUtterance: \(audio\) => pending \? false/);
});
