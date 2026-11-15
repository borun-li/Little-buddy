// Q-031: every increment-2 move has its reduced-motion twin (02-ui Motion, increment 2). Reads the CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../web/css/${p}`, import.meta.url), 'utf8');
const companion = read('companion.css');
const page = read('page.css');
const reduced = (css) => [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
const rc = reduced(companion);
const rp = reduced(page);

test('Q-031: poke wiggle, squash and hop have no movement under reduced motion', () => {
  for (const k of ['tickle', 'oops', 'here']) {
    assert.match(companion, new RegExp(`\\.is-poke-${k} \\.companion__layers \\{ animation: poke-`));
    assert.match(rc, new RegExp(`\\.companion\\.is-poke-${k} \\.companion__layers`));
  }
  assert.match(rc, /\.companion__layers[^{]*\{ transform: none !important; \}/);
});

test('Q-031: oops ticks stay, still', () => {
  assert.match(rc, /\.is-poke-oops \.companion__ticks \{ opacity: 1; animation: none !important; \}/);
});

test('Q-031: breathing swell is removed (neutral face and countdown remain)', () => {
  assert.match(companion, /\.companion\.is-breathing \{[^}]*animation: breath-cycle/);
  assert.match(rc, /\.companion\.is-breathing \{ animation: none !important; \}/);
  assert.match(rc, /\.companion\.is-breathing \{ transform: none !important; \}|\.companion\.is-breathing \{ transform: none/);
});

test('Q-031: speaking waves are still and fully shown', () => {
  assert.match(page, /\.speaker-toggle\.is-speaking \.wave-a \{ animation: wave/);
  assert.match(rp, /\.wave-a, \.speaker-toggle \.wave-b \{ animation: none !important; opacity: 1; \}/);
});

test('Q-031: chip and card appear at once', () => {
  assert.match(rp, /\.turn--offer, \.turn--card[^{]*\{ animation: none !important; transition: none !important; \}/);
  assert.match(rp, /\.turn, \.hint \{ animation: none; \}/);
});
