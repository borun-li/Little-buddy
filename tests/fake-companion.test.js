// Q-005 / REQ-007, REQ-003, A1, A3: the fake data layer and its one-file seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createFakeCompanion, respond, transcribe } from '../web/js/companion-client.js';
import { PRESETS } from '../web/js/fake/presets.js';
import { MOODS, moodOf } from '../web/js/fake/mood-keywords.js';

const WEB = new URL('../web/', import.meta.url).pathname;
const sentences = (s) => s.split(/[。！？!?]/).filter((p) => p.trim()).length;

test('Q-005 respond returns the line mood and a reply from that mood', async () => {
  const c = createFakeCompanion({ delayMs: 0 });
  for (const [line, mood] of [['好开心！', 'pleasant-high'], ['难过。', 'unpleasant-low'], ['嗯。', 'neutral']]) {
    const r = await c.respond(line, []);
    assert.equal(r.mood, mood);
    assert.ok(PRESETS.zh.replies[mood].includes(r.reply), r.reply);
  }
});

test('Q-005 REQ-003 the default layer replies within 1 s', async () => {
  const t0 = performance.now();
  const r = await respond('今天考试过了，好开心！', []);
  const ms = performance.now() - t0;
  assert.ok(ms <= 1000, `${ms} ms`);
  assert.equal(r.mood, 'pleasant-high');
  assert.ok(r.reply.length > 0);
});

test('Q-005 A3 at least 2 replies per mood, each <= 2 sentences, <= 1 question, <= 120 chars', () => {
  for (const mood of MOODS) {
    const list = PRESETS.zh.replies[mood];
    assert.ok(list.length >= 2, mood);
    for (const r of list) {
      assert.ok(r.length <= 120, r);
      assert.ok(sentences(r) <= 2, `sentences: ${r}`);
      assert.ok((r.match(/[？?]/g) || []).length <= 1, `questions: ${r}`);
    }
  }
});

test('Q-005 A3 never the same reply twice in a row', async () => {
  const c = createFakeCompanion({ delayMs: 0 });
  const lines = ['好开心', '好开心', '好开心', '难过', '难过', '嗯', '嗯', '嗯', '好开心', '放松', '放松', '焦虑', '焦虑'];
  let last = null;
  for (const line of lines) {
    const { reply } = await c.respond(line, []);
    assert.notEqual(reply, last, `${line} repeated: ${reply}`);
    last = reply;
  }
});

test('Q-005 A1 transcribe walks the voice lines and covers all 5 moods', async () => {
  const c = createFakeCompanion({ delayMs: 0 });
  const n = PRESETS.zh.voiceLines.length;
  const texts = [];
  for (let i = 0; i < n + 1; i += 1) texts.push((await c.transcribe()).text);
  assert.deepEqual(texts.slice(0, n), PRESETS.zh.voiceLines);
  assert.equal(texts[n], texts[0], 'wraps around');
  assert.deepEqual(new Set(texts.map((t) => moodOf(t))), new Set(MOODS));
  assert.equal(typeof (await transcribe()).text, 'string');
});

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}
const importsOf = (src) => [...src.matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

test('Q-005 REQ-007 app.js is the only importer of companion-client.js', () => {
  const importers = jsFiles(join(WEB, 'js'))
    .filter((p) => importsOf(readFileSync(p, 'utf8')).some((s) => s.endsWith('companion-client.js')))
    .map((p) => relative(WEB, p));
  assert.deepEqual(importers, ['js/app.js']);
});

test('Q-005 REQ-007 nothing outside companion-client.js and fake/ imports fake/', () => {
  const offenders = jsFiles(join(WEB, 'js'))
    .filter((p) => !p.includes('/fake/') && !p.endsWith('companion-client.js'))
    .filter((p) => importsOf(readFileSync(p, 'utf8')).some((s) => s.includes('fake/')))
    .map((p) => relative(WEB, p));
  assert.deepEqual(offenders, []);
});
