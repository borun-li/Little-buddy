// Generator for tests/support/unihan-digit-syllables.json (FX-027 number_heard, Q34).
// Usage: node tests/support/gen-unihan-digits.mjs <path to Unihan_Readings.txt>   (Unihan.zip from https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip)
// Keeps only kMandarin entries (UAX #38) whose toneless reading (NFD, combining marks dropped) is one of the 12 digit syllables.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYL = ['ling', 'yi', 'yao', 'er', 'liang', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu'];
const src = readFileSync(process.argv[2], 'utf8');
const version = /# Unicode Version (\S+)/.exec(src)?.[1], date = /# Date: (.+?) \[/.exec(src)?.[1];
const chars = {};
for (const line of src.split('\n')) {
  const m = /^U\+([0-9A-F]+)\tkMandarin\t(.+)$/.exec(line);
  if (!m) continue;
  const hit = [...new Set(m[2].split(' ').map((r) => r.normalize('NFD').replace(/\p{M}/gu, '')).filter((r) => SYL.includes(r)))];
  if (hit.length) chars[String.fromCodePoint(parseInt(m[1], 16))] = hit.sort().join(' ');
}
const out = {
  _header: { unicode_version: version, unihan_readings_date: date, property: 'kMandarin', filter: 'toneless reading in the 12 digit syllables', generator: 'node tests/support/gen-unihan-digits.mjs <Unihan_Readings.txt>', chars: Object.keys(chars).length },
  syllables: SYL,
  chars,
};
const body = Object.entries(chars).map(([c, r]) => `${JSON.stringify(c)}:${JSON.stringify(r)}`).join(',\n');
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'unihan-digit-syllables.json'), `{"_header":${JSON.stringify(out._header)},\n"syllables":${JSON.stringify(SYL)},\n"chars":{\n${body}\n}}\n`);
console.log(`Unicode ${version}, ${Object.keys(chars).length} characters`);
