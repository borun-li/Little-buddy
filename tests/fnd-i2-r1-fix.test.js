// Review fixes, increment 2 round 1 (fe-engineer #33): FND-010 card scroll order, FND-011 name field width,
// FND-012 poke bag, FND-013 short-viewport stage, FND-020 speaker abort on early end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLog } from '../web/js/log.js';
import { createBag, createPoker, nextPoke } from '../web/js/poke.js';
import { createSpeaker } from '../web/js/speaker.js';
import { fieldWidthPx } from '../web/js/name.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

test('FND-010 the card is scrolled to only after its words are filled, with reduced motion on or off', () => {
  for (const reduce of [true, false]) {
    const mk = () => {
      const el = {
        children: [], dataset: {}, className: '', textContent: '', isConnected: false,
        classList: { add() {}, remove() {} },
        append(...n) { n.forEach((c) => el.children.push(c)); }, replaceChildren() { el.children = []; },
        addEventListener() {}, setAttribute() {}, removeAttribute() {}, remove() { el.isConnected = false; },
        querySelector(sel) {
          const cls = sel.replace('.', '');
          const walk = (n) => { for (const c of n.children ?? []) { if (typeof c === 'object') { if ((c.className ?? '').split(' ').includes(cls)) return c; const d = walk(c); if (d) return d; } } return null; };
          return walk(el);
        },
        querySelectorAll: () => [],
      };
      return el;
    };
    const filledAtScroll = [];
    let li;
    const list = { append(x) { x.isConnected = true; li = x; }, querySelector: () => null, querySelectorAll: () => [] };
    const scroller = { scrollHeight: 0, scrollTo() { filledAtScroll.push(li.querySelector('.crisis-card__911')?.children.length ?? 0); } };
    globalThis.window = { matchMedia: () => ({ matches: reduce }) };
    globalThis.document = { createElement: mk };
    createLog(scroller, list, null).showCrisisCard(() => {});
    assert.deepEqual(filledAtScroll.map((n) => n > 0), [true], `reduce=${reduce}`);
  }
});

test('FND-011 the rename field is sized from the rendered text, not from the character count', () => {
  const src = read('web/js/name.js');
  assert.match(src, /getBoundingClientRect\(\)\.width/);
  assert.match(src, /getComputedStyle\(el\)/);
  assert.ok(fieldWidthPx(100) >= 100 + 20); // text + padding 16 + border 4 at least
  assert.ok(fieldWidthPx(200) > fieldWidthPx(100));
  assert.match(read('web/css/page.css'), /\.name-field \{[^}]*max-width: 100%/); // capped to the row
});

test('FND-012 a bag gives all three reactions in every three pokes, none twice running, over 200k pokes', () => {
  const bag = createBag();
  let prev = null; const seq = [];
  for (let k = 0; k < 200000; k++) { prev = bag.next(prev, Math.random); seq.push(prev); }
  for (let k = 1; k < seq.length; k++) assert.notEqual(seq[k], seq[k - 1]);
  for (let k = 0; k + 3 <= seq.length; k += 3) assert.equal(new Set(seq.slice(k, k + 3)).size, 3);
  for (let k = 0; k + 6 <= seq.length; k += 1) assert.equal(new Set(seq.slice(k, k + 6)).size, 3);
});

test('FND-012 for every sequence of six draws from {0, .4, .99} the first six pokes cover three reactions', () => {
  const draws = [0, 0.4, 0.99];
  for (let n = 0; n < 3 ** 6; n++) {
    let rest = n; let prev = null; const seq = [];
    for (let k = 0; k < 6; k++) { const r = draws[rest % 3]; rest = Math.floor(rest / 3); prev = nextPoke(prev, () => r); seq.push(prev); }
    assert.equal(new Set(seq).size, 3, seq.join(''));
    seq.forEach((p, k) => { if (k) assert.notEqual(p, seq[k - 1]); });
  }
});

test('FND-012 createPoker plays a bag: six pokes are each reaction twice', () => {
  const timers = { setTimeout: () => 1, clearTimeout() {} };
  for (let t = 0; t < 500; t++) {
    const p = createPoker({ showFace() {}, setMotion() {}, timers });
    const played = Array.from({ length: 6 }, () => p.poke(() => ['a', 'b', 'c']));
    assert.deepEqual([...played].sort(), [0, 0, 1, 1, 2, 2]);
    played.forEach((x, k) => { if (k) assert.notEqual(x, played[k - 1]); });
  }
});

test('FND-013 below 520 px of height the phone stage shrinks; the normal heights keep 280 px', () => {
  const css = read('web/css/page.css');
  assert.match(css, /\.page \{[^}]*grid-template-rows: 280px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 959px\) and \(max-height: 520px\) \{[^}]*grid-template-rows: clamp\(120px, 32vh, 280px\)/);
});

test('FND-020 a refused play aborts the request asked ahead; a clean reading leaves nothing to abort twice', async () => {
  const signals = [];
  const speak = (t, l, signal) => new Promise((resolve, reject) => {
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new Error('aborted')));
    if (t === '一') resolve({ tag: 'a' });
  });
  const audio = { play: () => Promise.reject(new Error('NotAllowedError')), pause() {}, onended: null, onerror: null };
  const sp = createSpeaker({ speak, createAudio: () => audio, url: { create: () => 'blob:x', revoke() {} }, makeBlob: () => ({}) });
  const done = sp.say(['一', '二'], 'zh');
  await tick(); await done;
  assert.equal(signals.length, 2); // part 2 was asked ahead
  assert.equal(signals[1].aborted, true);
  assert.equal(sp.active, false);
});
