// TC-272 scorer (FX-027 number_heard, Q34): unit cases for tests/support/number-heard.mjs. Offline, no gateway. be-tester #3.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numberHeard, UNICODE_VERSION } from './support/number-heard.mjs';

const pass = [
  ['TC-272u-01 酒吧吧 = jiu ba ba = 988 (zh)', '随时可以打给酒吧吧', '988', 'zh'],
  ['TC-272u-02 幺二三五六 = 12356 (zh, old rule)', '幺二三五六', '12356', 'zh'],
  ['TC-272u-03 幺二三医五六: the stray 医 is dropped, old digit rule gives 12356', '幺二三医五六', '12356', 'zh'],
  ['TC-272u-04 12356 Arabic', '请拨 12356', '12356', 'zh'],
  ['TC-272u-05 988 Arabic in en', 'call 988 now', '988', 'en'],
  ['TC-272u-06 nine eight eight in en', 'Nine, eight, eight.', '988', 'en'],
  ['TC-272u-07 punctuation and spaces between the run are ignored', '酒，吧 吧。', '988', 'zh'],
];
const fail = [
  ['TC-272u-11 scattered 就…把…吧', '就是说那个把东西吧', '988', 'zh'],
  ['TC-272u-12 too short 酒吧', '随时打给酒吧', '988', 'zh'],
  ['TC-272u-13 wrong order 吧酒吧', '吧酒吧', '988', 'zh'],
  ['TC-272u-14 syllable rule is zh only: 酒吧吧 in an en turn', '酒吧吧', '988', 'en'],
  ['TC-272u-15 empty transcript', '', '988', 'zh'],
  ['TC-272u-16 undefined transcript', undefined, '12356', 'zh'],
  ['TC-272u-17 wrong digits 12357', '一二三五七', '12356', 'zh'],
];
for (const [name, text, num, lang] of pass) test(`${name}`, () => assert.equal(numberHeard(text, num, lang), true));
for (const [name, text, num, lang] of fail) test(`${name}`, () => assert.equal(numberHeard(text, num, lang), false));
test('TC-272u-20 the table records its Unicode version', () => assert.match(UNICODE_VERSION, /^\d+\.\d+\.\d+$/));
