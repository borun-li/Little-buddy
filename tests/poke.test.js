// Q-024 / FLOW-012 / DES-028: poke the companion. nextPoke and createPoker are pure; createCompanion runs on a tiny fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextPoke, createPoker, POKES, POKE_HOLD_MS } from '../web/js/poke.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Q-024 nextPoke never repeats the previous reaction, for every prev and every random value', () => {
  for (let prev = 0; prev < POKES.length; prev++) {
    for (let r = 0; r < 1; r += 0.01) {
      const n = nextPoke(prev, () => r);
      assert.notEqual(n, prev);
      assert.ok(n >= 0 && n < POKES.length);
    }
  }
  // all three are reachable after any prev except itself, and from the first poke
  for (let prev = 0; prev < 3; prev++) {
    const seen = new Set([0, 0.4, 0.99].map((r) => nextPoke(prev, () => r)));
    assert.equal(seen.size, 2);
  }
  assert.deepEqual(new Set([0, 0.4, 0.99].map((r) => nextPoke(null, () => r))), new Set([0, 1, 2]));
});

function fakeTimers() {
  let id = 0; const q = new Map();
  return { setTimeout(fn, ms) { q.set(++id, { fn, ms }); return id; }, clearTimeout(i) { q.delete(i); }, pending: () => [...q.values()], runAll() { const all = [...q.entries()]; q.clear(); all.forEach(([, t]) => t.fn()); } };
}
function rig(extra = {}) {
  const timers = fakeTimers(); const calls = [];
  const poker = createPoker({
    showFace: (face, word) => calls.push(['face', face, word && word()]),
    setMotion: (id) => calls.push(['motion', id]),
    random: Math.random, timers, ...extra,
  });
  return { poker, timers, calls };
}
const pokes = () => ['嘿嘿，好痒', '哎呀！', '在呢在呢'];

test('Q-024 six pokes give three reactions, none twice running, each with its word and borrowed face', () => {
  const { poker, timers, calls } = rig();
  const played = [];
  for (let k = 0; k < 6; k++) { played.push(poker.poke(pokes)); timers.runAll(); }
  assert.ok(new Set(played).size >= 3);
  played.forEach((p, k) => { if (k) assert.notEqual(p, played[k - 1]); });
  const faces = calls.filter((c) => c[0] === 'face' && c[1]);
  faces.forEach((c, k) => { assert.equal(c[1], POKES[played[k]].face); assert.equal(c[2], pokes()[played[k]]); });
});

test('Q-024 the face goes back after the hold, and the hold plus the 240 ms fade is within 2 s', () => {
  const { poker, timers, calls } = rig();
  poker.poke(pokes);
  assert.equal(poker.active, true);
  assert.equal(timers.pending().length, 1);
  assert.ok(timers.pending()[0].ms === POKE_HOLD_MS && POKE_HOLD_MS + 240 <= 2000);
  timers.runAll();
  assert.equal(poker.active, false);
  assert.deepEqual(calls.at(-2), ['motion', null]);
  assert.deepEqual(calls.at(-1), ['face', null, null]);
});

test('Q-024 a poke during a poke plays the next one and restarts the hold; blocked pokes are ignored; reset ends at once', () => {
  let blocked = false;
  const { poker, timers, calls } = rig({ isBlocked: () => blocked });
  const a = poker.poke(pokes);
  const b = poker.poke(pokes);
  assert.notEqual(a, b);
  assert.equal(timers.pending().length, 1); // one timer, restarted
  blocked = true;
  const n = calls.length;
  assert.equal(poker.poke(pokes), -1);
  assert.equal(calls.length, n);
  poker.reset();
  assert.equal(poker.active, false);
  assert.deepEqual(calls.at(-1), ['face', null, null]);
  assert.equal(timers.pending().length, 0);
  poker.reset(); // nothing active: harmless
});

// ---- companion.showFace on a tiny fake DOM ----
function dom() {
  const el = () => {
    const classes = new Set();
    return { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), [Symbol.iterator]: () => classes[Symbol.iterator]() }, dataset: {}, attrs: {}, children: [],
      append(n) { if (n && n.children) this.children.push(n); }, remove() { this.gone = true; }, addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: '' };
  };
  globalThis.window = { matchMedia: () => ({ matches: true }) }; // reduced motion: swap at once
  globalThis.document = { createElement: el, getElementById: () => ({ content: { cloneNode: () => ({}) } }) };
  const layers = el(); layers.children = [];
  layers.append = function (n) { this.children.push(n); };
  Object.defineProperty(layers, 'children', { value: [], writable: true });
  const root = Object.assign(el(), { querySelector: () => layers, after() {} }); // after(): the companion's live region is inserted at load (Q-082)
  const nameButton = el(); const phrase = el();
  const caption = { querySelector: (s) => (s === '.caption__name' ? nameButton : phrase) };
  return { root, layers, phrase };
}

test('Q-024 showFace swaps the face and word but never data-mood; a mood arriving mid-poke applies when it ends', async () => {
  const { root, layers, phrase } = dom();
  const { createCompanion } = await import('../web/js/companion.js');
  const { copy } = await import('../web/js/copy.js');
  const c = createCompanion(root, { querySelector: (s) => (s === '.caption__phrase' ? phrase : { setAttribute() {}, textContent: '' }) });
  const faceOf = () => layers.children.at(-1).dataset.moodLayer;
  c.setMood('unpleasant-low');
  assert.equal(root.dataset.mood, 'unpleasant-low');
  const phraseBefore = phrase.textContent;
  c.showFace('pleasant-high', () => copy.pokes[0]);
  assert.equal(faceOf(), 'pleasant-high');
  assert.equal(root.dataset.mood, 'unpleasant-low');       // glow and mood untouched
  assert.match(phrase.textContent, /嘿嘿/);
  c.setMood('pleasant-low');                                // reply lands mid-poke
  assert.equal(root.dataset.mood, 'unpleasant-low');
  c.showFace(null);
  assert.equal(root.dataset.mood, 'pleasant-low');
  assert.equal(faceOf(), 'pleasant-low');
  assert.notEqual(phrase.textContent, phraseBefore);
  // no deferred mood: the old face returns
  c.showFace('neutral', () => copy.pokes[1]);
  c.showFace(null);
  assert.equal(faceOf(), 'pleasant-low');
  assert.equal(phrase.textContent.includes('哎呀'), false);
});

test('Q-024 page wiring: companion is a focusable button described by pokeHelp, ticks and motion exist, reduced motion keeps ticks still', () => {
  const html = read('web/index.html');
  assert.match(html, /data-testid="companion"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-describedby="poke-help"/);
  assert.match(html, /id="poke-help" data-copy="pokeHelp"/);
  const css = read('web/css/companion.css');
  for (const id of ['tickle', 'oops', 'here']) assert.match(css, new RegExp(`\\.companion\\.is-poke-${id} \\.companion__layers`));
  assert.match(css, /\.companion:focus-visible::after/);
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/)?.[1] ?? '';
  assert.match(block, /is-poke-oops \.companion__ticks\s*{\s*opacity: 1/);
  const app = read('web/js/app.js');
  assert.match(app, /onClear\(\(\) => poker\.reset\(\)\)/);
});
