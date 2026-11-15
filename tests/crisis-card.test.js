// Q-030: the help card under a crisis reply (log.js) and its wiring in app.js. Reads only the flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLog } from '../web/js/log.js';
import { copy, setLang } from '../web/js/copy.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function rig() {
  const mk = () => {
    const el = {
      children: [], dataset: {}, attrs: {}, listeners: {}, isConnected: false, className: '', textContent: '', type: '',
      classList: { add() {}, remove() {} },
      append(...n) { n.forEach((c) => el.children.push(c)); },
      replaceChildren() { el.children = []; },
      addEventListener(t, f) { el.listeners[t] = f; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute() {}, remove() { el.isConnected = false; },
      querySelector(sel) {
        const cls = sel.replace('.', '');
        const walk = (n) => {
          for (const c of n.children ?? []) {
            if (typeof c === 'object' && (c.className === cls || (c.className ?? '').split(' ').includes(cls))) return c;
            const d = typeof c === 'object' ? walk(c) : null;
            if (d) return d;
          }
          return null;
        };
        return walk(el);
      },
      querySelectorAll: () => [],
    };
    return el;
  };
  const items = [];
  const list = {
    append(li) { li.isConnected = true; items.push(li); },
    replaceChildren() { items.splice(0).forEach((c) => { c.isConnected = false; }); },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const empty = { isConnected: true, remove() { this.isConnected = false; } };
  const scroller = { scrollTop: 0, scrollHeight: 0, scrollTo() {}, prepend() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: mk };
  return { log: createLog(scroller, list, empty), items };
}
const live = (items) => items.filter((i) => i.isConnected && i.className === 'turn turn--card');
const text = (el) => el.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');

test('Q-030 the card is one region item after its reply, with the three lines and the close button', () => {
  setLang('zh');
  const { log, items } = rig();
  log.addReply('我很担心你。988');
  const close = log.showCrisisCard();
  assert.equal(live(items).length, 1);
  assert.equal(items.indexOf(live(items)[0]), items.length - 1);
  const region = live(items)[0].children[0];
  assert.equal(region.attrs.role, 'region');
  assert.equal(region.attrs['aria-label'], copy.crisisLabel);
  assert.equal(region.children[0].textContent, copy.crisisTitle);
  assert.equal(text(region.children[1]), copy.crisis988);
  assert.equal(text(region.children[2]), copy.crisis911);
  assert.ok(region.children[1].children.some((c) => c.textContent === '988'));
  assert.ok(region.children[2].children.some((c) => c.textContent === '911'));
  assert.equal(close.textContent, copy.crisisClose);
  assert.equal(close.attrs['aria-label'], copy.crisisCloseName);
  assert.equal(close.type, 'button');
  assert.equal(log.cardShown, true);
});

test('Q-030 one card at a time: a later crisis reply moves it; close removes it and calls onClose; clear removes it', () => {
  const { log, items } = rig();
  log.addReply('a');
  log.showCrisisCard();
  log.addReply('b');
  assert.equal(log.cardShown, true); // a non-crisis reply leaves the card under its own reply
  log.addReply('c');
  log.showCrisisCard();
  assert.equal(live(items).length, 1);
  assert.equal(items.indexOf(live(items)[0]), items.length - 1);
  let closed = 0;
  log.showCrisisCard(() => { closed += 1; }).listeners.click();
  assert.equal(closed, 1);
  assert.equal(log.cardShown, false);
  assert.equal(live(items).length, 0);
  log.addReply('d');
  log.showCrisisCard();
  log.clear();
  assert.equal(log.cardShown, false);
  log.removeCard(); // harmless twice
});

test('Q-030 the card words follow a language switch', () => {
  setLang('zh');
  const { log, items } = rig();
  log.addReply('x');
  const close = log.showCrisisCard();
  setLang('en');
  log.refresh();
  const region = live(items)[0].children[0];
  assert.equal(region.attrs['aria-label'], 'Ways to get help');
  assert.equal(close.textContent, 'Close');
  assert.equal(text(region.children[2]), copy.crisis911);
  setLang('zh');
});

test('Q-030 app.js reads only the crisis flag, never takes focus on arrival, and clear removes the card', () => {
  const app = read('web/js/app.js');
  assert.match(app, /if \(crisis === true\) log\.showCrisisCard\(\(\) => input\.focus\(\)\)/);
  assert.match(app, /onClear\(\(\) => log\.removeCard\(\)\)/);
  const log = read('web/js/log.js');
  const show = log.slice(log.indexOf('showCrisisCard('), log.indexOf('removeCard,'));
  assert.doesNotMatch(show, /focus\(/);
  assert.doesNotMatch(show, /createElement\('a'\)|href/);
  assert.doesNotMatch(show, /innerHTML/);
});
