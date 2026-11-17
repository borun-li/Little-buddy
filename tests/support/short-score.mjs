// Scores the jsonl files written by short-replies.mjs: node tests/support/short-score.mjs <file.jsonl>...   (be-tester #8)
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const by = {};
  for (const r of rows) { const k = r.set.startsWith('chat') ? 'chat' : r.set; (by[k] ??= []).push(r); }
  console.log(f);
  let all = { n: 0, opens: 0, rule: 0, tag: 0, lang: 0, bad: 0 };
  for (const [k, rs] of Object.entries(by)) {
    const s = { n: rs.length, opens: rs.filter((r) => r.opens).length, rule: rs.filter((r) => r.rule).length, tag: rs.filter((r) => r.langTag).length, lang: rs.filter((r) => r.langOk).length, bad: rs.filter((r) => r.status !== 200).length };
    for (const x of Object.keys(all)) all[x] += s[x];
    console.log(`  ${k.padEnd(6)} n=${s.n} opens(收到/Got it)=${s.opens} rule-repeats=${s.rule} "<lang"=${s.tag} language-right=${s.lang}/${s.n} non-200=${s.bad}`);
  }
  console.log(`  TOTAL  n=${all.n} opens=${all.opens} rule-repeats=${all.rule} "<lang"=${all.tag} language-right=${all.lang}/${all.n} non-200=${all.bad}`);
}
