// Q-003 / DFB-003, repointed for R2 by Q-066 (fe-tester #1, 2026-11-17): the inlined art is the current export of the 15
// character x mood files, and every part motion in 02-ui.md §7 is wired to a part that exists. Visual timing is checked in
// the browser self-check, not here.
// Expected values come from the design files (docs/frontend/r2-personalise/evidence/design/characters/, and the R0 art for 蜜蜜),
// read by undoing the documented rules (prefix "<char>-<mood>--", re-prefixed url(#...) references, 棉棉's ear groups wrapped in
// g.attr-tf), not by re-running tools/make-templates.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('web/index.html');
const css = read('web/css/companion.css');
const CHARS = ['honey', 'cotton', 'matcha'];
const MOODS = ['neutral', 'pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low'];

// 02-ui.md §7 companion rows: the parts that move, per mood.
const MOVES = {
  neutral: ['body', 'eyes', 'ear-left', 'ear-right', 'tail'],
  'pleasant-high': ['character', 'arm-left', 'arm-right', 'tail', 'sparkles'],
  'pleasant-low': ['character', 'tail', 'heart', 'blush'],
  'unpleasant-high': ['character', 'tremble', 'sweat-1', 'sweat-2', 'eye-left-pupil', 'eye-right-pupil', 'paw-left', 'paw-right'],
  'unpleasant-low': ['character', 'tear-drop', 'ear-left', 'ear-right', 'eyes'],
};

const template = (c, m) => html.match(new RegExp(`<template id="mood-${c}-${m}">([\\s\\S]*?)</template>`))?.[1] ?? '';
const ids = (s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const inner = (s) => s.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? '';
const tokens = (s) => (s.match(/<[^>]+>|[^<]+/g) ?? []).map((t) => t.trim()).filter(Boolean);
const source = (c, m) => read(`docs/frontend/r2-personalise/evidence/design/characters/${c}-${m}.svg`);

// The template's art turned back into export form: wrapper g.attr-tf folded onto the group it holds, prefix taken off ids and
// url(#...) references. A token that breaks a rule is kept as "!..." so the comparison shows it.
function unwrap(c, m) {
  const p = `${c}-${m}--`;
  const out = []; const stack = []; let carry = null; let wraps = 0;
  for (const t of tokens(inner(template(c, m)))) {
    const wrap = t.match(/^<g class="attr-tf" transform="([^"]+)">$/);
    if (wrap) { stack.push('wrap'); carry = wrap[1]; wraps += 1; continue; }
    let tok = t;
    if (carry) { tok = tok.replace(/^<g (id="[^"]+")>$/, `<g $1 transform="${carry}">`); carry = null; }
    tok = tok.replace(/\bid="([^"]+)"/g, (_, id) => (id.startsWith(p) ? `id="${id.slice(p.length)}"` : `id="!${id}"`))
      .replace(/url\(#([^)]+)\)/g, (_, id) => (id.startsWith(p) ? `url(#${id.slice(p.length)})` : `url(#!${id})`));
    if (/^<g[\s>]/.test(tok) && !tok.endsWith('/>')) stack.push('g');
    if (tok === '</g>' && stack.pop() === 'wrap') continue;
    out.push(tok);
  }
  return { out, wraps };
}

test('Q-053 Q-066 there are exactly 15 companion templates, mood-<char>-<mood>, and no R0 per-mood template is left', () => {
  const found = [...html.matchAll(/<template id="(mood-[^"]+)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(found, CHARS.flatMap((c) => MOODS.map((m) => `mood-${c}-${m}`)).sort());
});

test('Q-053 Q-003 each template is its characters/ export, every id prefixed "<char>-<mood>--", 棉棉\'s ear groups wrapped', () => {
  for (const c of CHARS) for (const m of MOODS) {
    const src = inner(source(c, m));
    const { out, wraps } = unwrap(c, m);
    assert.deepEqual(out, tokens(src), `${c}-${m}: rerun node tools/make-templates.mjs (docs/codemap.md web/ Traps)`);
    // the wrapper exists exactly where the export gives an ear group its own transform (棉棉), and nowhere else
    const earTf = (src.match(/<g id="ear-(?:left|right)" transform="/g) ?? []).length;
    assert.equal(wraps, earTf, `${c}-${m}: ${wraps} attr-tf wrappers, export has ${earTf} transformed ear groups`);
    if (c === 'cotton') assert.equal(wraps, 2, `${c}-${m}: both ears wrapped`);
  }
});

test('Q-053 蜜蜜 is unchanged: each honey template is the R0 art plus only the clip path, empty slots and the growth wrapper', () => {
  for (const m of MOODS) {
    const kept = []; const stack = []; let inDefs = false;
    for (const t of unwrap('honey', m).out) {
      if (t === '<defs>') { inDefs = true; continue; }
      if (t === '</defs>') { inDefs = false; continue; }
      if (inDefs || /^<g id="slot-[a-z]+"\/>$/.test(t)) continue;
      if (t === '<g id="growth">') { stack.push('growth'); continue; }
      if (/^<g[\s>]/.test(t) && !t.endsWith('/>')) stack.push('g');
      if (t === '</g>' && stack.pop() === 'growth') continue;
      kept.push(t.replace(`<g id="honey-${m}">`, `<g id="companion-${m}">`));
    }
    assert.deepEqual(kept, tokens(inner(read(`docs/frontend/evidence/design/companion/${m}.svg`))), `honey-${m} differs from the R0 art`);
  }
});

test('Q-053 Q-003 ids are unique across the 15 inlined templates', () => {
  const all = CHARS.flatMap((c) => MOODS.flatMap((m) => ids(template(c, m))));
  const exported = CHARS.flatMap((c) => MOODS.flatMap((m) => ids(source(c, m))));
  assert.equal(all.length, exported.length, 'one inlined id per exported id');
  assert.ok(all.length > 600, `${all.length} ids`);
  assert.deepEqual(all.filter((id, i) => all.indexOf(id) !== i), []);
});

test('Q-053 DFB-003 every mood part named in companion.css exists in that mood\'s art, for all three characters', () => {
  const named = [...new Set([...css.matchAll(/\[id\$="-((?:un)?pleasant-(?:high|low)|neutral)--([\w-]+)"\]/g)].map((m) => `${m[1]}--${m[2]}`))];
  assert.ok(named.length >= 30, `${named.length} part selectors`);
  const missing = [];
  for (const n of named) {
    const [mood, part] = n.split('--');
    for (const c of CHARS) if (!ids(template(c, mood)).includes(`${c}-${mood}--${part}`)) missing.push(`${c}-${n}`);
  }
  assert.deepEqual(missing, []);
});

test('Q-053 DFB-003 every part §7 moves has an animation, per mood, as a suffix selector scoped to .companion__art', () => {
  const missing = [];
  for (const [mood, parts] of Object.entries(MOVES)) {
    for (const part of parts) {
      const rule = new RegExp(`\\.companion__art \\[id\\$="-${mood}--${part}"\\][^{]*\\{[^}]*\\banimation:`);
      if (!rule.test(css)) missing.push(`${mood}--${part}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('REQ-006 reduced motion stops every companion animation and the glow transition', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}/)?.[1] ?? '';
  assert.match(block, /\.companion \*[^{]*{\s*animation: none !important;/);
  assert.match(block, /\.companion\s*{\s*transition: none;/);
});
