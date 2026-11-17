// Q-029 / FLOW-009 / DES-028: the breathing guide. breath.js is DOM-free (fake clock); the companion and the chip run on tiny fake DOMs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBreath, stepAt, ROUNDS, IN_S, OUT_S } from '../web/js/breath.js';
import { createPoker } from '../web/js/poke.js';
import { createLog } from '../web/js/log.js';
import { copy, setLang, setName } from '../web/js/copy.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function clock() {
  let id = 0; let now = 0; const q = new Map();
  return {
    setTimeout(fn, ms) { q.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(i) { q.delete(i); },
    pending: () => q.size,
    advance(ms) { // runs due timers in order, up to now + ms
      const end = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
  };
}
function rig(extra = {}) {
  const timers = clock(); const events = [];
  const b = createBreath({
    timers,
    onStart: () => events.push(['start']),
    onTick: (t) => events.push(['tick', t.phase, t.n, t.round, t.changed]),
    onEnd: (r) => events.push(['end', r]),
    ...extra,
  });
  return { b, timers, events };
}

test('Q-029 stepAt: 4 s in (4..1) then 6 s out (6..1), three rounds, 30 steps', () => {
  assert.equal(ROUNDS, 3); assert.equal(IN_S, 4); assert.equal(OUT_S, 6);
  const all = Array.from({ length: 30 }, (_, i) => stepAt(i));
  assert.deepEqual(all.slice(0, 10).map((s) => `${s.phase}${s.n}`), ['in4', 'in3', 'in2', 'in1', 'out6', 'out5', 'out4', 'out3', 'out2', 'out1']);
  assert.deepEqual(all.map((s) => s.round), [...Array(10).fill(1), ...Array(10).fill(2), ...Array(10).fill(3)]);
  assert.equal(all.filter((s) => s.phase === 'in').length, 12);
  assert.equal(all.filter((s) => s.phase === 'out').length, 18);
});

test('Q-029 fake clock: one tick a second, ends "done" at 30 s, the phase is flagged new once per phase', () => {
  const { b, timers, events } = rig();
  assert.equal(b.start(), true);
  assert.equal(b.active, true);
  assert.deepEqual(events[0], ['start']);
  assert.deepEqual(events[1], ['tick', 'in', 4, 1, true]);
  timers.advance(3999);
  assert.equal(events.filter((e) => e[0] === 'tick').length, 4);
  timers.advance(1);
  assert.deepEqual(events.at(-1), ['tick', 'out', 6, 1, true]);
  timers.advance(29_000 - 4000);
  assert.equal(b.active, true);
  assert.deepEqual(events.at(-1), ['tick', 'out', 1, 3, false]);
  timers.advance(999);
  assert.equal(b.active, true);
  timers.advance(1); // t = 30 s
  assert.deepEqual(events.at(-1), ['end', 'done']);
  assert.equal(b.active, false);
  assert.equal(timers.pending(), 0);
  const ticks = events.filter((e) => e[0] === 'tick');
  assert.equal(ticks.length, 30);
  assert.equal(ticks.filter((t) => t[4]).length, 6); // in, out x3: six phase words
  assert.equal(events.filter((e) => e[0] === 'end').length, 1);
});

test('Q-029 stop at any second ends at once (< 1 s), clears its timer, and nothing ticks afterwards', () => {
  for (const at of [0, 500, 4000, 17_300, 29_999]) {
    const { b, timers, events } = rig();
    b.start();
    timers.advance(at);
    const n = events.length;
    assert.equal(b.stop('esc'), true);
    assert.deepEqual(events.at(-1), ['end', 'esc']);
    assert.equal(timers.pending(), 0);
    timers.advance(60_000);
    assert.equal(events.length, n + 1);
    assert.equal(b.active, false);
    assert.equal(b.stop('again'), false); // idle: nothing happens
  }
});

test('Q-029 start while running does nothing; a restart after an end is a fresh 30 s', () => {
  const { b, timers, events } = rig();
  b.start(); timers.advance(2000);
  assert.equal(b.start(), false);
  assert.equal(events.filter((e) => e[0] === 'start').length, 1);
  b.stop('chip');
  events.length = 0;
  b.start();
  assert.deepEqual(events[1], ['tick', 'in', 4, 1, true]);
  timers.advance(30_000);
  assert.deepEqual(events.at(-1), ['end', 'done']);
});

test('Q-029 pokes are ignored while the guide runs (isBlocked) and a reaction ends when it starts', () => {
  const t2 = clock(); const faces = [];
  const b = createBreath({ timers: t2 });
  const poker = createPoker({ showFace: (f) => faces.push(f), setMotion() {}, timers: t2, isBlocked: () => b.active });
  assert.notEqual(poker.poke(() => ['a', 'b', 'c']), -1);
  assert.equal(poker.active, true);
  poker.reset(); // what the guide's start does
  b.start();
  assert.equal(poker.active, false);
  assert.equal(poker.poke(() => ['a', 'b', 'c']), -1);
  b.stop();
  assert.notEqual(poker.poke(() => ['a', 'b', 'c']), -1);
});

// ---- companion on a fake DOM ----
function dom() {
  const el = () => {
    const classes = new Set();
    return { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c), [Symbol.iterator]: () => classes[Symbol.iterator]() }, dataset: {}, attrs: {}, children: [],
      append(n) { if (n && n.children) this.children.push(n); }, remove() { this.gone = true; }, addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: '', className: '' };
  };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: el, getElementById: () => ({ content: { cloneNode: () => ({}) } }) };
  const layers = el();
  layers.append = function (n) { this.children.push(n); };
  const root = Object.assign(el(), { querySelector: () => layers, after(n) { this.next = n; } });
  const nameButton = el(); const phrase = el();
  const caption = { querySelector: (s) => (s === '.caption__name' ? nameButton : phrase) };
  return { root, layers, phrase, caption, nameButton };
}

test('Q-029 companion: breathing wears the neutral face, keeps data-mood, is named breathName, reply mood waits, the face returns', async () => {
  setLang('zh'); setName(null);
  const { root, layers, phrase, caption } = dom();
  const { createCompanion } = await import('../web/js/companion.js');
  const c = createCompanion(root, caption);
  const faceOf = () => layers.children.at(-1).dataset.moodLayer;
  c.setMood('unpleasant-high');
  const before = root.attrs['aria-label'];
  c.setBreathing(true);
  c.showFace('neutral', () => copy.breathIn(4));
  assert.equal(faceOf(), 'neutral');
  assert.equal(root.dataset.mood, 'unpleasant-high');
  assert.equal(root.classList.contains('is-breathing'), true);
  assert.match(root.attrs['aria-label'], /陪你深呼吸$/);
  assert.match(phrase.textContent, /吸气… 4/);
  c.showFace('neutral', () => copy.breathOut(6));
  assert.match(phrase.textContent, /呼气… 6/);
  c.announce('吸气');
  assert.equal(root.next.textContent, '吸气');
  assert.equal(root.next.attrs['aria-live'], 'polite');
  assert.equal(root.next.className, 'sr-only');
  c.setBreathing(false);
  assert.equal(root.next.textContent, '');
  c.showFace(null, null);
  assert.equal(faceOf(), 'unpleasant-high');
  assert.equal(root.dataset.mood, 'unpleasant-high');
  assert.equal(root.attrs['aria-label'], before);
  assert.equal(root.classList.contains('is-breathing'), false);
  // a clear lands mid-guide: neutral waits, then applies when it ends
  c.setBreathing(true); c.showFace('neutral', () => 'x');
  c.setMood('pleasant-low');
  assert.equal(root.dataset.mood, 'unpleasant-high');
  c.setBreathing(false); c.showFace(null, null);
  assert.equal(root.dataset.mood, 'pleasant-low');
  assert.equal(faceOf(), 'pleasant-low');
});

test('Q-029 breath words: the phase word (no seconds) is derived from breathIn / breathOut in both languages', () => {
  const word = (f) => f('').replace(/[…\s]+$/, '');
  setLang('zh'); assert.deepEqual([word(copy.breathIn), word(copy.breathOut)], ['吸气', '呼气']);
  setLang('en'); assert.deepEqual([word(copy.breathIn), word(copy.breathOut)], ['Breathe in', 'Breathe out']);
  assert.equal(copy.breathIn(4), 'Breathe in… 4');
  setLang('zh');
});

// ---- chip on a fake DOM ----
function chipRig() {
  const attrs = {}; const use = { href: '#i-wind', setAttribute(k, v) { if (k === 'href') this.href = v; } };
  const word = { className: 'breath-chip__text', textContent: '' };
  const btn = { children: [], dataset: {}, listeners: {}, className: '', classList: { add() {}, remove() {} },
    append(...n) { n.forEach((c) => btn.children.push(c)); },
    addEventListener(t, f) { btn.listeners[t] = f; },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; },
    querySelector: (s) => (s === 'use' ? use : s === '.breath-chip__text' ? word : null),
    set innerHTML(v) { btn.html = v; } };
  const items = [];
  const li = () => ({ children: [], className: '', append(...n) { this.children.push(...n); }, remove() { this.gone = true; }, removeAttribute() {}, set innerHTML(v) {}, dataset: {} });
  const list = { append(x) { items.push(x); }, replaceChildren() { items.length = 0; }, querySelector: () => null, querySelectorAll: (sel) => (sel === '.breath-chip__text' ? [word] : []) };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: (t) => { if (t === 'button') return btn; if (t === 'span') { const w = { className: '', textContent: '' }; setTimeout(() => {}, 0); Object.defineProperty(w, 'className', { get: () => word.className, set: (v) => { word.className = v; } }); Object.defineProperty(w, 'textContent', { get: () => word.textContent, set: (v) => { word.textContent = v; } }); return w; } return li(); } };
  const scroller = { scrollTop: 0, scrollHeight: 0, scrollTo() {}, prepend() {} };
  return { log: createLog(scroller, list, { isConnected: true, remove() {} }), btn, use, word, attrs };
}

test('Q-029 chip: setOfferStop swaps icon, words and accessible name on the same button; back to the offer at the end; refresh keeps the mode', () => {
  setLang('zh');
  const { log, use, word, attrs } = chipRig();
  log.setOfferStop(true); // no chip yet: nothing
  log.showOffer();
  assert.equal(word.textContent, copy.breathOffer);
  log.setOfferStop(true);
  assert.equal(use.href, '#i-square');
  assert.equal(word.textContent, '停下');
  assert.equal(attrs['aria-label'], '停下深呼吸');
  setLang('en'); log.refresh();
  assert.equal(word.textContent, 'Stop');
  assert.equal(attrs['aria-label'], 'Stop breathing');
  log.setOfferStop(false);
  assert.equal(use.href, '#i-wind');
  assert.equal(word.textContent, 'Breathe together?');
  assert.equal(attrs['aria-label'], undefined);
  log.setOfferStop(true);
  log.removeOffer(); // send / new reply / clear
  log.showOffer();
  assert.equal(word.textContent, copy.breathOffer); // a new chip is the offer
  setLang('zh');
});

// ---- page wiring ----
test('Q-029 page wiring: app.js, css, html, package.json', () => {
  const app = read('web/js/app.js');
  assert.match(app, /import \{ createBreath \} from '\.\/breath\.js'/);
  assert.match(app, /isBlocked: \(\) => breath\.active/);
  assert.match(app, /onBreathStart\(\(\) => \{ if \(breath\.active\) breath\.stop\('chip'\); else breath\.start\(\); \}\)/);
  assert.match(app, /onClear\(\(\) => breath\.stop\('clear'\)\)/);
  assert.match(app, /e\.key === 'Escape'[^)]*\) breath\.stop\('esc'\)/);
  assert.match(app, /onPress: \(\) => \{ speaker\.stop\(\); breath\.stop\('talk'\); \}/);
  assert.match(app, /log\.removeOffer\(\);[^\n]*\n\s*breath\.stop\('send'\)/);
  assert.match(app, /breath\.stop\('reply'\);[^\n]*\n\s*log\.addReply/);
  assert.match(app, /onStart\(\) \{\s*poker\.reset\(\);\s*speaker\.stop\(\);\s*companion\.setBreathing\(true\);\s*log\.setOfferStop\(true\)/);
  assert.match(app, /onEnd\(\) \{\s*companion\.setBreathing\(false\);\s*companion\.showFace\(null, null\);\s*log\.setOfferStop\(false\)/);
  const css = read('web/css/companion.css');
  assert.match(css, /\.companion\.is-breathing \{[^}]*animation: breath-cycle 10s linear 3/);
  assert.match(css, /40% \{ transform: scale\(var\(--breath-scale\)\)/);
  assert.match(css, /--breath-scale: 1\.08/);
  assert.match(css, /max-width: 959px\) \{ \.companion \{ --breath-scale: 1\.04/);
  assert.match(css, /\.companion\.is-breathing \.companion__art \* \{ animation: none !important/);
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/)?.[1] ?? '';
  assert.match(block, /\.companion\.is-breathing \{ animation: none !important/);
  assert.match(read('web/index.html'), /<symbol id="i-square"/);
  assert.match(JSON.parse(read('package.json')).scripts.test, /(^| )tests\/breath\.test\.js( |$)/); // Q-051: presence, not order
});
