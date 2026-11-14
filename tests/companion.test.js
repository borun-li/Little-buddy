// Q-003 / DFB-003: the inlined mood art is the current export, and every part motion in 02-ui.md §7 is wired
// to a part that exists. Visual timing is checked in the browser self-check, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('web/index.html');
const css = read('web/css/companion.css');
const MOODS = ['neutral', 'pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low'];

// 02-ui.md §7 companion rows: the parts that move, per mood.
const MOVES = {
  neutral: ['body', 'eyes', 'ear-left', 'ear-right', 'tail'],
  'pleasant-high': ['character', 'arm-left', 'arm-right', 'tail', 'sparkles'],
  'pleasant-low': ['character', 'tail', 'heart', 'blush'],
  'unpleasant-high': ['character', 'tremble', 'sweat-1', 'sweat-2', 'eye-left-pupil', 'eye-right-pupil', 'paw-left', 'paw-right'],
  'unpleasant-low': ['character', 'tear-drop', 'ear-left', 'ear-right', 'eyes'],
};

const template = (mood) => html.match(new RegExp(`<template id="mood-${mood}">([\\s\\S]*?)</template>`))?.[1] ?? '';
const ids = (s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

test('Q-003 each mood template is its current SVG export with every id prefixed "<mood>--"', () => {
  for (const mood of MOODS) {
    const exported = read(`docs/frontend/evidence/design/companion/${mood}.svg`);
    const inner = (s) => s.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].trim();
    const expected = inner(exported).replace(/\bid="([^"]+)"/g, `id="${mood}--$1"`);
    assert.equal(inner(template(mood)), expected, `${mood}: re-copy the export (docs/codemap.md Traps)`);
  }
});

test('Q-003 ids are unique across the five inlined moods', () => {
  const all = MOODS.flatMap((m) => ids(template(m)));
  assert.ok(all.length > 200, `${all.length} ids`);
  assert.deepEqual(all.filter((id, i) => all.indexOf(id) !== i), []);
});

test('DFB-003 every part id named in companion.css exists in that mood\'s art', () => {
  const named = [...new Set([...css.matchAll(/#((?:un)?(?:pleasant-(?:high|low))--[\w-]+|neutral--[\w-]+)/g)].map((m) => m[1]))];
  assert.ok(named.length >= 20, `${named.length} part ids`);
  const known = new Set(MOODS.flatMap((m) => ids(template(m))));
  assert.deepEqual(named.filter((id) => !known.has(id)), []);
});

test('DFB-003 every part §7 moves has an animation, per mood', () => {
  const missing = [];
  for (const [mood, parts] of Object.entries(MOVES)) {
    for (const part of parts) {
      const rule = new RegExp(`#${mood}--${part}\\b[^{]*\\{[^}]*\\banimation:`);
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
