// Q-022: log.clear() puts the original empty state back and removes every turn and the typing dots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLog } from '../web/js/log.js';

function rig() {
  const list = { children: [], append(li) { this.children.push(li); li.isConnected = true; }, replaceChildren() { this.children.forEach((c) => { c.isConnected = false; }); this.children = []; } };
  const empty = { isConnected: true, remove() { this.isConnected = false; } };
  const scroller = { scrollTop: 50, scrollHeight: 100, scrollTo() {}, prepend(n) { n.isConnected = true; } };
  const el = () => ({ classList: { add() {}, remove() {} }, dataset: {}, append() {}, remove() { this.isConnected = false; }, querySelector: () => null });
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: () => Object.assign(el(), { set innerHTML(v) {}, set textContent(v) {} }) };
  return { log: createLog(scroller, list, empty), list, empty, scroller };
}

test('Q-022 clear empties the log and brings the empty state back', () => {
  const { log, list, empty, scroller } = rig();
  log.addYou('hi');
  log.showTyping();
  assert.equal(list.children.length, 2);
  assert.equal(empty.isConnected, false);
  log.clear();
  assert.equal(list.children.length, 0);
  assert.equal(empty.isConnected, true);
  assert.equal(scroller.scrollTop, 0);
});

test('Q-022 clear on an empty log is harmless, and turns can follow it', () => {
  const { log, list, empty } = rig();
  log.clear();
  assert.equal(list.children.length, 0);
  assert.equal(empty.isConnected, true);
  log.addYou('again');
  assert.equal(list.children.length, 1);
  assert.equal(empty.isConnected, false);
});
