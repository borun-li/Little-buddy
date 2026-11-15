// be-developer #5 unit checks for increment 2 modules (03 DES-017..022). Expected values come from 03's fires/not rows and the
// approved fixtures FX-009, FX-010, FX-012, FX-013; the TTS helper is a throwaway inline fake written to a temp dir (not a model).
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBonsai, crisisReply, SENTENCE } from '../server/bonsai.js';
import { CONFIG } from '../server/config.js';
import { isCrisis } from '../server/crisis.js';
import { parseSpeak, parseTurn } from '../server/main.js';
import { cleanName } from '../server/name.js';
import { CRISIS_FALLBACK, CRISIS_LINE } from '../server/prompts.js';
import { createTts, speechParts } from '../server/tts.js';

const fx = (id, f) => JSON.parse(readFileSync(new URL(`./fixtures/approved/${id}/${f}.json`, import.meta.url), 'utf8'));
const body = (o) => Buffer.from(JSON.stringify(o));

test('DES-019 isCrisis: FX-009 all true, FX-010 all false, 10 runs each', () => {
  for (const c of fx('FX-009', 'input').cases) for (let i = 0; i < 10; i++) assert.equal(isCrisis(c.body.line), true, c.id);
  for (const c of fx('FX-010', 'input').cases) for (let i = 0; i < 10; i++) assert.equal(isCrisis(c.body.line), false, c.id);
});

test('DES-019 isCrisis: normalisation fires, near misses and exceptions stay quiet', () => {
  for (const l of ['I don’t want to live anymore', '我 想 死', 'Ｉ　ＷＡＮＴ　ＴＯ　ＤＩＥ', 'I  want   to die', '我想自殺。', '我想傷害自己。', '活著沒意思', '活著沒什麼意思', '活着没啥意思', '活着没意义', '活 着 没 什 么 意 思']) {
    assert.equal(isCrisis(l), true, l);
  }
  // FND-014 (review round 1): fond greetings removed only at end of clause
  for (const l of ['我想死你们都不懂我', '我想死你别管我', '我想死您别劝我了', '我想死我了真的撑不下去', '想死你了，可我真的想死']) assert.equal(isCrisis(l), true, l);
  for (const l of ['跳樓價', '想死你了！', '想死你们了！', '你可想死我了。', '跳楼价大甩卖', 'I have the skill myself', '这几天什么都不想做。', '这游戏没什么意思。', '尴尬得想消失。', '生活没什么意思的时候就出去走走']) {
    assert.equal(isCrisis(l), false, l);
  }
});

test('DES-021 cleanName: FX-012 expected names, defaults and non-strings → null', () => {
  const exp = new Map(fx('FX-012', 'expected').cases.map((c) => [c.id, c.name]));
  for (const c of fx('FX-012', 'input').cases) assert.equal(cleanName(c.name), exp.get(c.id), c.id);
  assert.equal(cleanName('小伙伴'), null);
  assert.equal(cleanName('Little  Buddy'), null);
  assert.equal(cleanName('x'.repeat(5000)), 'x'.repeat(12));
  assert.equal(cleanName('a\nb\tc'), 'a b c');
  assert.equal(cleanName(7), null);
});

test('DES-022 parseTurn name: absent/null → null, string cleaned, non-string → bad_request', () => {
  assert.equal(parseTurn(body({ line: 'hi', history: [] })).name, null);
  assert.equal(parseTurn(body({ line: 'hi', history: [], name: null })).name, null);
  assert.equal(parseTurn(body({ line: 'hi', history: [], name: '  Mochi  ' })).name, 'Mochi');
  assert.equal(parseTurn(body({ line: 'hi', history: [], name: 'y'.repeat(300) })).name, 'y'.repeat(12));
  for (const name of [5, true, {}, []]) assert.throws(() => parseTurn(body({ line: 'hi', history: [], name })), { code: 'bad_request' });
});

test('DES-022 parseSpeak: text trimmed 1..200, lang zh|en, else bad_request', () => {
  assert.deepEqual(parseSpeak(body({ text: '  你好。 ', lang: 'zh' })), { text: '你好。', lang: 'zh' });
  assert.deepEqual(parseSpeak(body({ text: 'a'.repeat(200), lang: 'en' })).text.length, 200);
  for (const b of [{ text: 'a'.repeat(201), lang: 'en' }, { text: '   ', lang: 'en' }, { text: 'hi', lang: 'fr' }, { text: 3, lang: 'en' }, null, []]) {
    assert.throws(() => parseSpeak(body(b)), { code: 'bad_request' }, JSON.stringify(b));
  }
  assert.throws(() => parseSpeak(Buffer.from('{not json')), { code: 'bad_request' });
  assert.throws(() => parseSpeak(body({ text: 'a\ud800b', lang: 'en' })), { code: 'bad_request' }); // FND-020 lone surrogate
});

test('DES-018 speechParts: FX-013 rows, 988 spelled, hard split, nothing to read', () => {
  assert.deepEqual(speechParts('太棒了！这真值得庆祝。你准备去庆祝吗？', 'zh'), ['太棒了！', '这真值得庆祝。', '你准备去庆祝吗？']);
  assert.deepEqual(speechParts("That is amazing news! I can't wait to hear all about it. 🎉", 'en'), ['That is amazing news!', "I can't wait to hear all about it."]);
  assert.ok(speechParts(CRISIS_LINE.en, 'en').includes('you can call or text nine eight eight anytime,'));
  assert.deepEqual(speechParts('It sounds like such a long and tiring day for you.', 'en'), ['It sounds like such a long', 'and tiring day for you.']);
  assert.deepEqual(speechParts('🎉🎉', 'en'), []);
  assert.deepEqual(speechParts('…', 'zh'), []);
});

test('DES-020 crisisReply: 988 always, fallback when empty, within caps, ≤ 2 sentences', () => {
  const sentences = (s) => (s.match(SENTENCE) ?? []).map((x) => x.trim()).filter((x) => /[\p{L}\p{Script=Han}]/u.test(x));
  assert.equal(crisisReply('', 'zh', 'US'), `${CRISIS_FALLBACK.zh}${CRISIS_LINE.zh}`);
  assert.equal(crisisReply('', 'en', 'US'), `${CRISIS_FALLBACK.en} ${CRISIS_LINE.en}`);
  // FND-019: only CRISIS_LINE's own wording skips it; a bare 988 (the name "988") does not
  assert.equal(crisisReply('You can Call or Text 988 now. Really.', 'en', 'US'), 'You can Call or Text 988 now.');
  assert.equal(crisisReply('你可以打给 988。好吗？', 'zh', 'US'), '你可以打给 988。');
  assert.equal(crisisReply('I am 988 and I am right here with you.', 'en', 'US'), `I am 988 and I am right here with you. ${CRISIS_LINE.en}`);
  const cases = [['我听到了，你一定很难受。你愿意多说吗？', 'zh'], ['I hear you. Want to talk?', 'en'], [`${'很'.repeat(119)}。`, 'zh'], [`${Array(40).fill('word').join(' ')}.`, 'en']];
  for (const [shaped, lang] of cases) {
    const r = crisisReply(shaped, lang, 'US');
    assert.ok(r.includes('988'), r);
    assert.ok(sentences(r).length <= 2, r);
    if (lang === 'zh') assert.ok([...r].length <= 120, r);
    else assert.ok(r.split(/\s+/).filter(Boolean).length <= 40, r);
  }
});

test('DES-020 respond: crisis turn with Bonsai down → 988 reply, crisis true; other turns still unavailable', async () => {
  const bonsai = createBonsai(undefined, 'US'); // never started: state down
  const r = await bonsai.respond('有时候觉得活着没什么意思，想就这样消失。', [], null);
  assert.deepEqual(r, { reply: `${CRISIS_FALLBACK.zh}${CRISIS_LINE.zh}`, mood: 'neutral', lang: 'zh', crisis: true });
  await assert.rejects(bonsai.respond('今天累死了。', [], null), { code: 'unavailable' });
});

// ---- createTts against an inline fake helper
const FAKE = `
const fs = require('node:fs');
const log = process.env.FAKE_LOG;
console.log('not json');
setTimeout(() => console.log(JSON.stringify({ event: 'ready', load_ms: 1, warm_ms: 1 })), Number(process.env.FAKE_WARM || 0));
require('node:readline').createInterface({ input: process.stdin }).on('line', (l) => {
  const r = JSON.parse(l);
  fs.appendFileSync(log, r.text + '\\n');
  const ok = () => console.log(JSON.stringify({ id: r.id, ms: 1, audio_ms: 1, wav: Buffer.from('RIFF' + r.text).toString('base64') }));
  if (r.text === 'BADID') return console.log(JSON.stringify({ id: -1, ms: 0, error: 'bad_request' }));
  if (r.text === 'ERR') return console.log(JSON.stringify({ id: r.id, ms: 1, error: 'ttskit' }));
  if (r.text === 'HANG') return;
  if (r.text === 'DIE') process.exit(3);
  if (r.text.startsWith('SLOW')) return setTimeout(ok, 300);
  ok();
});`;

function fakeTts(warmMs = 0, restarts = { max: 0, delayMs: 10 }) {
  const dir = mkdtempSync(join(tmpdir(), 'dev5-tts-'));
  writeFileSync(join(dir, 'fake.cjs'), FAKE);
  const log = join(dir, 'written.txt');
  writeFileSync(log, '');
  const bin = join(dir, 'companion-tts');
  writeFileSync(bin, `#!/bin/sh\nFAKE_LOG="${log}" FAKE_WARM=${warmMs} exec "${process.execPath}" "${join(dir, 'fake.cjs')}" "$@"\n`);
  chmodSync(bin, 0o755);
  const cfg = { ...CONFIG, tts: { ...CONFIG.tts, bin }, deadlines: { ...CONFIG.deadlines, speakMs: 1000, ttsBootMs: 5000, ttsOverdueMs: 1500 }, restarts };
  return { tts: createTts(cfg), written: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}
const until = async (fn) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 25)); };
const signal = () => new AbortController().signal;

test('DES-017 createTts: starting → not_ready, never started → unavailable, FIFO answers', async () => {
  assert.equal(createTts().state, 'down');
  await assert.rejects(createTts().speak('hi', 'en', signal()), { code: 'unavailable' });
  const { tts, written } = fakeTts(300);
  tts.start();
  try {
    await assert.rejects(tts.speak('hi', 'en', signal()), { code: 'not_ready' });
    await until(() => tts.state === 'ready');
    const [a, b] = await Promise.all([tts.speak('SLOW a', 'en', signal()), tts.speak('b', 'zh', signal())]);
    assert.equal(a.toString(), 'RIFFSLOW a');
    assert.equal(b.toString(), 'RIFFb');
    assert.deepEqual(written(), ['SLOW a', 'b']);
    await assert.rejects(tts.speak('ERR', 'en', signal()), { code: 'failed' });
  } finally {
    tts.stop();
  }
});

test('DES-017 createTts: aborted while queued is never written; in-flight abort settles at once, slot busy until the answer (FND-013)', async () => {
  const { tts, written } = fakeTts();
  tts.start();
  try {
    await until(() => tts.state === 'ready');
    const first = new AbortController();
    const queued = new AbortController();
    const t0 = Date.now();
    const p1 = tts.speak('SLOW 1', 'en', first.signal);
    const p2 = tts.speak('two', 'en', queued.signal);
    const p3 = tts.speak('three', 'en', signal());
    const r2 = assert.rejects(p2, { name: 'AbortError' });
    queued.abort();
    first.abort();
    await assert.rejects(p1, { name: 'AbortError' });
    assert.ok(Date.now() - t0 < 200, 'in-flight abort settles the caller at once');
    await until(() => written().length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(written(), ['SLOW 1']); // nothing new written while the helper is still busy
    await r2;
    assert.equal((await p3).toString(), 'RIFFthree');
    assert.ok(Date.now() - t0 >= 300, 'three waits for the answer to SLOW 1');
    assert.deepEqual(written(), ['SLOW 1', 'three']);
  } finally {
    tts.stop();
  }
});

test('DES-017 createTts: id -1 answers the slot → failed (FND-020); queue over speakQueue → oldest unavailable', async () => {
  const { tts, written } = fakeTts();
  tts.start();
  try {
    await until(() => tts.state === 'ready');
    await assert.rejects(tts.speak('BADID', 'en', signal()), { code: 'failed' });
    assert.equal((await tts.speak('ok', 'en', signal())).toString(), 'RIFFok');
    const busy = tts.speak('SLOW busy', 'en', signal());
    const waiting = [1, 2, 3, 4, 5].map((i) => tts.speak(`q${i}`, 'en', signal()));
    await assert.rejects(waiting[0], { code: 'unavailable' });
    assert.equal((await busy).toString(), 'RIFFSLOW busy');
    for (let i = 1; i < 5; i++) assert.equal((await waiting[i]).toString(), `RIFFq${i + 1}`);
    assert.deepEqual(written(), ['BADID', 'ok', 'SLOW busy', 'q2', 'q3', 'q4', 'q5']);
  } finally {
    tts.stop();
  }
});

test('DES-017 createTts: deadline → timeout, slot held; no answer within ttsOverdueMs → helper killed, restarted (FND-015); exit → unavailable', async () => {
  const { tts, written } = fakeTts(0, { max: 1, delayMs: 10 });
  tts.start();
  try {
    await until(() => tts.state === 'ready');
    const pid = tts.pid;
    await assert.rejects(tts.speak('HANG', 'en', signal()), { code: 'timeout' });
    // HANG is never answered: the slot stays busy, 'after' waits, the overdue kill (1.5 s from the write) gives it unavailable
    await assert.rejects(tts.speak('after', 'en', signal()), { code: 'unavailable' });
    await until(() => tts.state === 'ready' && tts.pid !== pid);
    assert.notEqual(tts.pid, pid);
    assert.equal((await tts.speak('next', 'en', signal())).toString(), 'RIFFnext');
    assert.deepEqual(written(), ['HANG', 'next']);
  } finally {
    tts.stop();
  }
  const { tts: t2 } = fakeTts();
  t2.start();
  try {
    await until(() => t2.state === 'ready');
    const a = t2.speak('DIE', 'en', signal());
    const b = t2.speak('queued', 'en', signal());
    await assert.rejects(a, { code: 'unavailable' });
    await assert.rejects(b, { code: 'unavailable' });
  } finally {
    t2.stop();
  }
});
