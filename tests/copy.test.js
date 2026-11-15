// Q-015: zh and en have the same keys, and the browser decides the opening language (A12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY, copy, resolveLang, setLang, getLang } from '../web/js/copy.js';

const shape = (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort()) : typeof v);

test('Q-015 every zh key has an en value and vice versa, same kind of value', () => {
  assert.deepEqual(shape(COPY.en), shape(COPY.zh));
});

test('Q-015 every en string is non-empty and the function strings take the number', () => {
  const walk = (o, path) => Object.entries(o).forEach(([k, v]) => {
    if (typeof v === 'string') assert.ok(v.trim(), `${path}${k}`);
    else if (typeof v === 'function') assert.ok(String(v(7)).includes('7') || k.startsWith('companion'), `${path}${k}`);
    else walk(v, `${path}${k}.`);
  });
  walk(COPY.en, '');
});

test('Q-015 no Chinese in the English words except the two switch labels', () => {
  const han = /[㐀-鿿]/;
  const walk = (o, path) => Object.entries(o).forEach(([k, v]) => {
    if (typeof v === 'string') { if (path + k !== 'langZh') assert.ok(!han.test(v), `${path}${k}`); }
    else if (typeof v === 'function') assert.ok(!han.test(String(v('x'))), `${path}${k}`);
    else walk(v, `${path}${k}.`);
  });
  walk(COPY.en, '');
});

test('Q-015 browser language: zh* opens in zh, anything else in en', () => {
  for (const l of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans-CN', 'ZH-cn']) assert.equal(resolveLang(l), 'zh', l);
  for (const l of ['en-US', 'en', 'ja', 'fr-CA', '', undefined, null]) assert.equal(resolveLang(l), 'en', String(l));
});

test('Q-015 setLang swaps the live copy object in place and ignores unknown languages', () => {
  const same = copy;
  setLang('en');
  assert.equal(same.title, 'Little Buddy');
  assert.equal(same.hints.micOpening, COPY.en.hints.micOpening);
  assert.equal(setLang('xx'), 'en');
  setLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(same.title, '小伙伴');
});
