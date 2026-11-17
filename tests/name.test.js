// Q-023: the page's name rule (DES-027) against FX-012, storage, the typing filter, and the wiring in app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanName, loadName, saveName, typingFilter, NAME_KEY, MAX_NAME } from '../web/js/name.js';
import { cleanName as serverClean } from '../server/name.js';
import { copy, setName, setLang, getName } from '../web/js/copy.js';

const dir = new URL('./fixtures/approved/FX-012/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('input.json', dir), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8'));

test('Q-023 cleanName gives the FX-012 expected value for all 7 cases', () => {
  assert.equal(input.cases.length, expected.cases.length);
  input.cases.forEach((c, i) => {
    assert.equal(expected.cases[i].id, c.id);
    assert.equal(cleanName(c.name), expected.cases[i].name, c.id);
  });
});

test('Q-023 the page rule equals the gateway rule on tricky input', () => {
  for (const s of ['x'.repeat(5000), '小伙伴', 'Little  Buddy', 'LITTLE BUDDY', 'a　　b', 'tab\tname', '"quoted"\nline', 'é', 'é', '𠮷𠮷', 'a'.repeat(11) + '😀b', '', 7, null, undefined]) {
    assert.equal(cleanName(s), serverClean(s), String(s));
  }
  assert.equal([...cleanName('x'.repeat(5000))].length, MAX_NAME);
});

test('Q-023 a default name or an emptied field is the default (null) in both languages', () => {
  for (const s of ['小伙伴', 'Little Buddy', ' little buddy ', '', '   ', '😀']) assert.equal(cleanName(s), null, s);
});

test('Q-023 storage: companion.name is cleaned on load, set on save, removed for null', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(loadName(storage), null);
  saveName(storage, '团子');
  assert.equal(store.get(NAME_KEY), '团子');
  assert.equal(loadName(storage), '团子');
  store.set(NAME_KEY, '<b>Mo</b>'); // a tampered value is cleaned, not trusted
  assert.equal(loadName(storage), cleanName('<b>Mo</b>'));
  saveName(storage, null);
  assert.equal(store.has(NAME_KEY), false);
  assert.equal(NAME_KEY, 'companion.name');
});

test('Q-023 a storage that throws or is missing does not break load or save', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(loadName(bad), null);
  assert.doesNotThrow(() => saveName(bad, 'Mochi'));
  assert.equal(loadName(undefined), null);
  assert.doesNotThrow(() => saveName(undefined, 'Mochi'));
});

test('Q-023 typingFilter drops disallowed characters as typed and caps at 12 code points', () => {
  assert.equal(typingFilter('Mo<ch>i!'), 'Mochi');
  assert.equal(typingFilter('😀Mochi'), 'Mochi');
  assert.equal(typingFilter('a'.repeat(20)), 'a'.repeat(12));
  assert.equal(typingFilter('团 子'), '团 子'); // a space stays while typing; the final clean trims
});

test('Q-023 the saved name shows in both languages through copy (same custom name)', () => {
  setLang('zh'); setName('团子');
  assert.equal(copy.companionName('在听'), '团子，在听');
  assert.equal(copy.renameName(getName()), '改名字，现在叫团子');
  setLang('en');
  assert.equal(getName(), '团子');
  assert.match(copy.companionCaption('listening'), /^团子 · listening$/);
  setName(null);
  assert.equal(getName(), 'Little Buddy');
  setLang('zh');
  assert.equal(getName(), '小伙伴');
});

test('Q-023 app.js sends the saved name on every respond call and keeps it out of history', () => {
  const src = readFileSync(new URL('../web/js/app.js', import.meta.url), 'utf8');
  assert.equal((src.match(/respond\(/g) ?? []).length, 1);
  // FND-043: respond takes the reply's abort signal as its 4th argument (the name is still the 3rd, and only the saved one)
  assert.match(src, /respond\(line, history\.slice\(\), savedName, controller\.signal\)/);
  assert.match(src, /setName\(savedName\)/);
  assert.doesNotMatch(src, /history\.push\([^)]*savedName/);
  const clear = src.slice(src.indexOf('function clearChat'), src.indexOf("$('.stage-clear')"));
  assert.doesNotMatch(clear, /savedName|setName|saveName/); // a clear leaves the name alone
});
