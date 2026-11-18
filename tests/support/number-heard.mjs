// FX-027 number_heard scorer (compare_note, Q34). Written for tests; not imported from server/. Offline: readings come from unihan-digit-syllables.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'unihan-digit-syllables.json'), 'utf8'));
export const UNICODE_VERSION = TABLE._header.unicode_version;
const LATIN = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const HAN = { 零: 0, 〇: 0, 一: 1, 幺: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const SYL = { 0: ['ling'], 1: ['yi', 'yao'], 2: ['er', 'liang'], 3: ['san'], 4: ['si'], 5: ['wu'], 6: ['liu'], 7: ['qi'], 8: ['ba'], 9: ['jiu'] };

// old rule: digit string of the transcript
export function digitsOf(text) {
  let t = text.normalize('NFKC').toLowerCase();
  t = t.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => ` ${LATIN[w]} `);
  t = t.replace(/[零〇一幺二两三四五六七八九]/g, (c) => ` ${HAN[c]} `);
  return t.replace(/[^0-9]/g, '');
}
// toneless readings of one character (restricted to the 12 digit syllables, which is all the rule asks about)
export function readings(ch) {
  if (/[0-9]/.test(ch)) return SYL[ch];
  if (ch in HAN) return SYL[HAN[ch]];
  return TABLE.chars[ch] ? TABLE.chars[ch].split(' ') : [];
}
// new zh rule: a run of consecutive characters, one per digit in order
export function syllableRun(text, number) {
  const cs = [...text.normalize('NFKC').replace(/[\p{Z}\p{P}\s]/gu, '')];
  const want = [...number].map((d) => SYL[d]);
  for (let i = 0; i + want.length <= cs.length; i++) {
    if (want.every((syl, k) => readings(cs[i + k]).some((r) => syl.includes(r)))) return true;
  }
  return false;
}
export function numberHeard(text, number, lang) {
  if (digitsOf(text ?? '').includes(number)) return true;
  return lang === 'zh' && syllableRun(text ?? '', number);
}
