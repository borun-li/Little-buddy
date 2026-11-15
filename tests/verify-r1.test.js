// fe-tester round 1 (increment 1): row assertions with expected values from independent sources
// (docs/frontend/01-ux.md Words table, FRAME-009 captions read from the exported PNG, the contract's
// byte arithmetic, fontTools on the shipped font). Not in package.json's test script: run with
//   node --test tests/verify-r1.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COPY } from '../web/js/copy.js';
import { wavFromChunks } from '../web/js/mic.js';

const ROOT = new URL('../', import.meta.url).pathname;

// Words table of 01-ux.md "Words, zh and en (increment 1)": | `key` | zh | en |
function uxWords() {
  const md = readFileSync(join(ROOT, 'docs/frontend/01-ux.md'), 'utf8');
  const part = md.slice(md.indexOf('### Words, zh and en (increment 1)'));
  const rows = {};
  for (const m of part.matchAll(/^\| `([^`]+)` \| (.+?) \| (.+?) \|$/gm)) rows[m[1]] = [m[2], m[3]];
  return rows;
}
const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);

test('Q-001 Q-015 every plain word on the page equals the confirmed Words table, zh and en', () => {
  const rows = uxWords();
  const keys = ['title', 'emptyHint', 'privacy', 'placeholder', 'inputLabel', 'pausedNote', 'voiceTag', 'transcribing',
    'typing', 'logLabel',
    ...Object.keys(rows).filter((k) => k.startsWith('hints.'))];
  assert.ok(keys.length === 29, `only ${keys.length} keys parsed`);
  for (const k of keys) {
    assert.ok(rows[k], `${k} missing from the UX table`);
    const [zh, en] = rows[k];
    // voiceTag zh cell reads `语音 (was "...")`: the first token is the word
    const first = (s) => (k === 'voiceTag' ? s.split(' ')[0] : s);
    assert.equal(get(COPY.zh, k), first(zh), `zh ${k}`);
    assert.equal(get(COPY.en, k), first(en), `en ${k}`);
  }
});

test('Q-003 the five mood captions match FRAME-009 (zh) and the Words table (en)', () => {
  // FRAME-009.png captions, read from the export: 小伙伴 · <caption>
  const frame = {
    neutral: '在听呢', 'pleasant-high': '替你开心', 'pleasant-low': '安心陪着你',
    'unpleasant-high': '有点替你担心', 'unpleasant-low': '陪你难过一会儿',
  };
  const en = {
    neutral: 'listening', 'pleasant-high': 'happy for you', 'pleasant-low': 'right here, at ease',
    'unpleasant-high': 'a bit worried for you', 'unpleasant-low': 'sad with you for a while',
  };
  for (const m of Object.keys(frame)) {
    assert.equal(COPY.zh.moods[m].caption, frame[m], `zh ${m}`);
    assert.equal(COPY.en.moods[m].caption, en[m], `en ${m}`);
  }
  assert.equal(COPY.zh.companionCaption(COPY.zh.moods['pleasant-high'].caption), '小伙伴 · 替你开心');
  assert.equal(COPY.en.companionName(COPY.en.moods['unpleasant-low'].name), 'Little Buddy, sad');
  assert.equal(COPY.zh.moods.waking.caption, '还在醒来');
});

test('Q-005 only app.js imports companion-client.js, so a stub swap touches one file', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
  const names = /(?:from|import)\s*\(?\s*['"][^'"]*companion-client\.js['"]/;
  const importers = walk(join(ROOT, 'web')).filter((p) => names.test(readFileSync(p, 'utf8')));
  assert.deepEqual(importers.map((p) => p.slice(join(ROOT, 'web/').length)), ['js/app.js']);
});

test('Q-013 a 2 s hold at 48 kHz becomes a 64,044 B audio/wav blob; 60 s is capped at 1,920,044 B', () => {
  const two = wavFromChunks([new Float32Array(96000).fill(0.1)], 48000);
  assert.equal(two.type, 'audio/wav');
  assert.equal(two.size, 16000 * 2 * 2 + 44);
  const long = wavFromChunks([new Float32Array(48000 * 70).fill(0.1)], 48000);
  assert.equal(long.size, 16000 * 60 * 2 + 44);
});

test('Q-017 the shipped font covers U+00C0-U+00FF and the punctuation replies use', () => {
  const py = [
    'import sys', 'from fontTools.ttLib import TTFont',
    'c = TTFont(sys.argv[1]).getBestCmap()',
    'want = list(range(0xC0, 0x100)) + [0x2014, 0x2013, 0x2019, 0x2018, 0x201C, 0x201D, 0x2026, 0xB7, 0x2022]',
    'print(",".join(hex(u) for u in want if u not in c))',
  ].join('\n');
  const out = execFileSync('python3', ['-I', '-c', py, join(ROOT, 'web/fonts/lxgw-wenkai-subset.woff2')], { encoding: 'utf8' }).trim();
  assert.equal(out, '', `missing code points: ${out}`);
});
