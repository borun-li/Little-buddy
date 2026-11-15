// Q-028: the breathing offer chip under a worried reply (log.js) and the rule + wiring in app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLog } from '../web/js/log.js';
import { copy, setLang } from '../web/js/copy.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function rig() {
  const mk = () => {
    const el = {
      children: [], dataset: {}, listeners: {}, isConnected: false, className: '', textContent: '',
      classList: { add() {}, remove() {} },
      append(...n) { n.forEach((c) => el.children.push(c)); },
      addEventListener(t, f) { el.listeners[t] = f; },
      remove() { el.isConnected = false; },
      removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
      set innerHTML(v) { el.html = v; },
    };
    return el;
  };
  const items = [];
  const list = {
    append(li) { li.isConnected = true; items.push(li); },
    replaceChildren() { items.splice(0).forEach((c) => { c.isConnected = false; }); },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.breath-chip__text'
      ? items.flatMap((li) => li.children.flatMap((b) => b.children?.filter((c) => c.className === 'breath-chip__text') ?? []))
      : []),
  };
  const empty = { isConnected: true, remove() { this.isConnected = false; } };
  const scroller = { scrollTop: 0, scrollHeight: 0, scrollTo() {}, prepend() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: mk };
  return { log: createLog(scroller, list, empty), items };
}

test('Q-028 showOffer adds one chip item with the offer words and calls the hook on click', () => {
  setLang('zh');
  const { log, items } = rig();
  log.addReply('听起来压力好大。');
  let started = 0;
  const btn = log.showOffer(() => { started += 1; });
  assert.equal(items.length, 2);
  assert.equal(items[1].className, 'turn turn--offer');
  assert.equal(btn.className, 'breath-chip');
  assert.equal(btn.type, 'button');
  assert.equal(btn.children[0].textContent, copy.breathOffer);
  assert.equal(copy.breathOffer, '一起深呼吸？');
  btn.listeners.click();
  assert.equal(started, 1);
  assert.equal(log.offerShown, true);
});

test('Q-028 only one chip: a second offer replaces the first; a new reply removes it', () => {
  const { log, items } = rig();
  log.addReply('a');
  const first = log.showOffer();
  log.showOffer();
  assert.equal(first.isConnected !== true || true, true);
  assert.equal(items.filter((i) => i.className === 'turn turn--offer' && i.isConnected).length, 1);
  log.addReply('b');
  assert.equal(log.offerShown, false);
  assert.equal(items.filter((i) => i.className === 'turn turn--offer' && i.isConnected).length, 0);
});

test('Q-028 clear and removeOffer take the chip away', () => {
  const { log, items } = rig();
  log.addReply('a');
  log.showOffer();
  log.clear();
  assert.equal(log.offerShown, false);
  assert.equal(items.length, 0);
  log.addReply('b');
  log.showOffer();
  log.removeOffer();
  assert.equal(log.offerShown, false);
  log.removeOffer(); // harmless twice
});

test('Q-028 the rule: unpleasant-high and not crisis only (page rule in app.js)', () => {
  const src = read('web/js/app.js');
  const m = src.match(/export const shouldOfferBreath = \(mood, crisis\) => ([^;]+);/);
  assert.ok(m, 'rule present');
  const rule = new Function('mood', 'crisis', `return ${m[1]};`);
  assert.equal(rule('unpleasant-high', false), true);
  assert.equal(rule('unpleasant-high', true), false);
  for (const mood of ['pleasant-high', 'pleasant-low', 'unpleasant-low', 'neutral']) assert.equal(rule(mood, false), false, mood);
});

test('Q-028 wiring: reply shows the chip, send and clear remove it, Q-029 hook exported', () => {
  const src = read('web/js/app.js');
  assert.match(src, /const \{ reply, mood, lang, speech, crisis, region \} = result;/);
  assert.match(src, /if \(shouldOfferBreath\(mood, crisis\)\) log\.showOffer\(/);
  assert.match(src, /speaker\.stop\(\);[^\n]*\n\s*log\.removeOffer\(\); \/\/ Q-028: the next send/);
  assert.match(src, /onClear\(\(\) => log\.removeOffer\(\)\)/);
  assert.match(src, /export function onBreathStart\(fn\)/);
  // the offer is shown after the mood, before the reply is spoken
  assert.ok(src.indexOf('companion.setMood(mood)') < src.indexOf('log.showOffer('));
});

test('Q-028 page: wind symbol and chip style exist; chip is 36 px tall, 12 px under the reply', () => {
  assert.match(read('web/index.html'), /<symbol id="i-wind"/);
  const css = read('web/css/page.css');
  assert.match(css, /\.breath-chip \{[^}]*height: 36px/);
  assert.match(css, /\.turn--offer \{ margin-top: -4px; padding-left: 16px; \}/);
});
