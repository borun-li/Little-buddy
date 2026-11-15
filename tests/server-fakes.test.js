// Backend process-level tests against test doubles of the two children (tests/support/fake-stt.cjs, fake-llama.cjs).
// They check the protocols of 03 DES-004, DES-006, DES-007 without models. Written from 01 and 03 only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { imp, fx, MOODS, sleep, waitFor, freePort, mkTmp, withEnv, shellWrapper, SUPPORT } from './server-helpers.js';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const code = (c) => (e) => e.code === c;

// ---------- supervisor (DES-004)
const sleeper = { cmd: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], stdio: ['ignore', 'ignore', 'ignore'] };

test('TC-021 supervise: starting -> ready after warm resolves; stop() ends only its own pid', async () => {
  const { supervise, isReady } = await imp('server/supervisor.js');
  let release;
  const warm = new Promise((r) => (release = r));
  const s = supervise({ name: 'stt', ...sleeper, warm: () => warm });
  try {
    assert.equal(s.state, 'starting'); assert.ok(s.pid > 0); assert.equal(isReady(s.state), false);
    const pid = s.pid;
    release();
    await waitFor(() => s.state === 'ready', 3000, 'ready');
    assert.equal(isReady(s.state), true);
    assert.ok(alive(pid));
    s.stop();
    await waitFor(() => !alive(pid), 5000, 'child gone');
    await sleep(2500);
    assert.equal(s.state, 'down'); assert.ok(!alive(pid), 'not restarted after stop()');
  } finally { s.stop(); }
});

test('TC-022 supervise: an unexpected exit -> down, onExit called, restarted after ~2 s with a new pid', async () => {
  const { supervise } = await imp('server/supervisor.js');
  let exits = 0;
  const s = supervise({ name: 'bonsai', ...sleeper, warm: async () => {}, onExit: () => exits++ });
  try {
    await waitFor(() => s.state === 'ready', 3000, 'ready');
    const pid = s.pid;
    process.kill(pid, 'SIGKILL');
    await waitFor(() => s.state === 'down', 3000, 'down');
    assert.equal(exits, 1);
    const t0 = Date.now();
    await waitFor(() => s.state !== 'down' && s.pid !== pid && s.pid !== null, 6000, 'restart');
    assert.ok(Date.now() - t0 >= 1000, 'restart waits ~2 s');
    await waitFor(() => s.state === 'ready', 3000, 'ready again');
  } finally { s.stop(); }
});

test('TC-023 supervise: a failing warm kills that child', async () => {
  const { supervise } = await imp('server/supervisor.js');
  const s = supervise({ name: 'stt', ...sleeper, warm: async () => { throw new Error('warm failed'); } });
  try {
    const pid = s.pid;
    await waitFor(() => !alive(pid), 5000, 'child killed after warm failure');
    assert.notEqual(s.state, 'ready');
  } finally { s.stop(); }
});

test('TC-024 supervise: gives up after 5 restarts and stays down (slow: ~12 s)', { timeout: 60000 }, async () => {
  const { supervise } = await imp('server/supervisor.js');
  let spawns = 0;
  const s = supervise({ name: 'bonsai', cmd: process.execPath, args: ['-e', 'process.exit(1)'], stdio: ['ignore', 'ignore', 'ignore'], warm: () => new Promise(() => {}), onExit: () => spawns++ });
  try {
    await sleep(14500);
    assert.equal(s.state, 'down');
    assert.equal(spawns, 6, 'initial run + 5 restarts, each exit reported once');
    await sleep(2500);
    assert.equal(spawns, 6, 'no 7th spawn');
  } finally { s.stop(); }
});

// ---------- stt.js with a fake companion-stt (DES-006)
async function makeStt(env = {}, over = {}) {
  const { createStt } = await imp('server/stt.js');
  const { CONFIG } = await imp('server/config.js');
  const dir = mkTmp();
  const cfg = structuredClone(CONFIG);
  cfg.stt = { ...cfg.stt, bin: shellWrapper(dir, 'companion-stt', `${SUPPORT}/fake-stt.cjs`), modelDir: dir, tokenizerDir: dir };
  cfg.deadlines = { ...cfg.deadlines, ...over };
  const stt = await withEnv(env, () => { const s = createStt(cfg); s.start(); return s; });
  return stt;
}
const pcm = (cmd, text = '') => Buffer.from(cmd + text);

test('TC-025 stt.transcribe: trims the text, drops non-JSON stdout lines, matches answers to requests by id', async () => {
  const stt = await makeStt();
  try {
    await waitFor(() => stt.state === 'ready', 10000, 'stt ready (the non-JSON line before ready is ignored)');
    assert.equal(await stt.transcribe(pcm('TEXT', 'hello world')), 'hello world');
    assert.equal(await stt.transcribe(pcm('NOIS', 'after noise')), 'after noise');
    const [slow, fast] = await Promise.all([stt.transcribe(pcm('TXTS', 'slow one')), stt.transcribe(pcm('TEXT', 'fast one'))]);
    assert.equal(slow, 'slow one'); assert.equal(fast, 'fast one');
  } finally { stt.stop(); }
});

test('TC-026 [FX-008] stt.transcribe returns "" for nothing heard (not an error)', async () => {
  const stt = await makeStt();
  try {
    await waitFor(() => stt.state === 'ready', 10000, 'stt ready');
    const t = await stt.transcribe(pcm('EMPT'));
    assert.equal(t, '');
    assert.equal((await imp('server/stt.js')).isNothingHeard(t), true);
  } finally { stt.stop(); }
});

test('TC-027 stt.transcribe while starting rejects not_ready (503)', async () => {
  const stt = await makeStt({ FAKE_STT_WARM_MS: '1500' });
  try {
    assert.equal(stt.state, 'starting');
    await assert.rejects(stt.transcribe(pcm('TEXT', 'x')), (e) => e.code === 'not_ready' && e.status === 503);
    await waitFor(() => stt.state === 'ready', 10000, 'stt ready');
    assert.equal(await stt.transcribe(pcm('TEXT', 'ok')), 'ok');
  } finally { stt.stop(); }
});

test('TC-028 stt.transcribe failures: helper error -> failed; deadline -> timeout (late answer dropped); exit mid-flight and while down -> unavailable', async () => {
  const stt = await makeStt({}, { transcribeMs: 400 });
  try {
    await waitFor(() => stt.state === 'ready', 10000, 'stt ready');
    await assert.rejects(stt.transcribe(pcm('ERR_')), (e) => e.code === 'failed' && e.status === 502);
    const t0 = Date.now();
    await assert.rejects(stt.transcribe(pcm('HANG')), (e) => e.code === 'timeout' && e.status === 504);
    assert.ok(Date.now() - t0 < 2000, 'timeout fires at the deadline');
    await assert.rejects(stt.transcribe(pcm('LATE')), code('timeout'));
    await sleep(600); // the late answer for the dropped id arrives now; it must not break the next request
    assert.equal(await stt.transcribe(pcm('TEXT', 'still fine')), 'still fine');
    await assert.rejects(stt.transcribe(pcm('DIE_')), (e) => e.code === 'unavailable' && e.status === 503);
    assert.equal(stt.state, 'down');
    await assert.rejects(stt.transcribe(pcm('TEXT', 'x')), code('unavailable'));
  } finally { stt.stop(); }
});

// ---------- bonsai.js with a fake llama-server (DES-007)
async function makeBonsai(env = {}, over = {}, size = '2B') {
  const { createBonsai } = await imp('server/bonsai.js');
  const { CONFIG } = await imp('server/config.js');
  const dir = mkTmp();
  const logFile = join(dir, 'llama.jsonl');
  const port = await freePort();
  const cfg = structuredClone(CONFIG);
  cfg.bonsai = { ...cfg.bonsai, size, port, dir: join(dir, 'gguf') };
  cfg.deadlines = { ...cfg.deadlines, ...over };
  shellWrapper(join(dir, 'gguf'), 'bin/macos-arm64/llama-server', `${SUPPORT}/fake-llama.cjs`);
  const b = await withEnv({ FAKE_LLAMA_LOG: logFile, ...env }, () => { const x = createBonsai(cfg); x.start(); return x; });
  const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const ready = () => waitFor(() => b.state === 'ready', 20000, 'bonsai ready');
  return { b, log, port, ready, size };
}
const bodies = (log) => log().filter((e) => e.body).map((e) => e.body);

test('TC-029 bonsai.respond: one reply call (thinking off, REPLY_SAMPLING) and one mood call (MOOD_SCHEMA, MOOD_SAMPLING), result {reply, mood}', async () => {
  const P = await imp('server/prompts.js');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    const before = bodies(log).length;
    const r = await b.respond('I am HAPPY today', []);
    assert.deepEqual(r, { reply: 'Fake reply.', mood: 'pleasant-high', lang: 'en', crisis: false }); // increment 2: + lang, crisis (DES-020)
    const calls = bodies(log).slice(before);
    assert.equal(calls.length, 2);
    const rep = calls.find((c) => !c.response_format), mood = calls.find((c) => c.response_format);
    assert.ok(rep && mood);
    for (const c of calls) assert.equal(c.chat_template_kwargs?.enable_thinking, false, 'every request turns thinking off');
    for (const [k, v] of Object.entries(P.REPLY_SAMPLING)) assert.equal(rep[k], v, `reply ${k}`);
    for (const [k, v] of Object.entries(P.MOOD_SAMPLING)) assert.equal(mood[k], v, `mood ${k}`);
    assert.deepEqual(mood.response_format, P.MOOD_SCHEMA);
  } finally { b.stop(); }
});

test('TC-030 bonsai.respond mood fallback: value outside the 5 ids, failed call, unparseable answer, slow call -> neutral, reply still returned', async () => {
  const { b, ready } = await makeBonsai({}, { respondMs: 1500 });
  try {
    await ready();
    for (const line of ['MOODBAD please', 'MOODFAIL please', 'MOODJUNK please']) {
      const r = await b.respond(line, []);
      assert.equal(r.mood, 'neutral', line);
      assert.equal(r.reply, 'Fake reply.', line);
    }
    const t0 = Date.now();
    const r = await b.respond('MOODSLOW please', []);
    assert.equal(r.mood, 'neutral'); assert.equal(r.reply, 'Fake reply.');
    assert.ok(Date.now() - t0 < 3500, 'mood timeout is bounded by the respond deadline');
    assert.equal((await b.respond('I feel SAD', [])).mood, 'unpleasant-low', 'a good mood value is used');
  } finally { b.stop(); }
});

test('TC-031 bonsai.respond: mood call sees only the line; reply call sees the windowed history and the language rule of the line (not of history)', async () => {
  const P = await imp('server/prompts.js');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    const hist = [{ role: 'user', text: '今天考试过了，好开心！' }, { role: 'companion', text: '太棒了！' }];
    const before = bodies(log).length;
    await b.respond('But I am SAD now', hist);
    let [rep, mood] = (c => [c.find((x) => !x.response_format), c.find((x) => x.response_format)])(bodies(log).slice(before));
    assert.equal(rep.messages.at(-1).content, 'But I am SAD now\n' + P.RECALL.en(hist[0].text), 'RECALL (language of the line) appended: window holds an earlier user line');
    assert.deepEqual(rep.messages.slice(1, 3), [{ role: 'user', content: hist[0].text }, { role: 'assistant', content: '太棒了！' }]);
    assert.ok(rep.messages[0].content.endsWith(P.LANG_RULE.en), 'English line -> English rule although history is Chinese');
    assert.ok(!JSON.stringify(mood.messages).includes('今天考试过了'), 'mood call has no history');
    assert.ok(JSON.stringify(mood.messages).includes('But I am SAD now'));
    assert.ok(!JSON.stringify(mood.messages).includes('Connect your reply'), 'mood call carries no RECALL');
    await b.respond('Just checking', [{ role: 'companion', text: 'Hello' }]);
    const only = bodies(log).slice(-2).find((x) => !x.response_format);
    assert.equal(only.messages.at(-1).content, 'Just checking', 'no earlier user line -> line alone');
    const n = bodies(log).length;
    await b.respond('我今天很happy', []);
    rep = bodies(log).slice(n).find((x) => !x.response_format);
    assert.ok(rep.messages[0].content.endsWith(P.LANG_RULE.zh));
    const n2 = bodies(log).length;
    const big = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'companion' : 'user', text: 'x'.repeat(200) }));
    await b.respond('hi', big);
    rep = bodies(log).slice(n2).find((x) => !x.response_format);
    assert.equal(rep.messages.length, 1 + 10 + 1, 'history cut to the weight budget 2000 (10 of 40 entries of 200 chars)');
  } finally { b.stop(); }
});

test('TC-032 bonsai.respond reply errors: non-200 -> failed; only-thinking reply -> failed; thinking stripped; shaped to the limits', async () => {
  const { b, ready } = await makeBonsai();
  try {
    await ready();
    await assert.rejects(b.respond('REPLY500 now', []), (e) => e.code === 'failed' && e.status === 502);
    await assert.rejects(b.respond('REPLYEMPTY now', []), code('failed'));
    const t = await b.respond('REPLYTHINK now', []);
    assert.equal(t.reply, 'Nice to hear. How are you?');
    assert.ok(!t.reply.includes('think') && !t.reply.includes('secret'));
    assert.equal((await b.respond('REPLYLONG now', [])).reply, 'One. Two.');
  } finally { b.stop(); }
});

test('TC-033 bonsai.respond: a reply slower than the deadline rejects timeout (504) at the deadline', async () => {
  const { b, ready } = await makeBonsai({}, { respondMs: 1200 });
  try {
    await ready();
    const t0 = Date.now();
    await assert.rejects(b.respond('REPLYSLOW now', []), (e) => e.code === 'timeout' && e.status === 504);
    const ms = Date.now() - t0;
    assert.ok(ms >= 1000 && ms < 3000, `${ms} ms`);
    assert.equal((await b.respond('quick', [])).reply, 'Fake reply.', 'next request still works');
  } finally { b.stop(); }
});

test('TC-034 bonsai.respond: while starting -> not_ready; child dying mid-request -> unavailable; stopped -> unavailable within 2 s', async () => {
  const { b, ready } = await makeBonsai({ FAKE_LLAMA_BOOT_MS: '1500' });
  try {
    assert.equal(b.state, 'starting');
    await assert.rejects(b.respond('hello', []), (e) => e.code === 'not_ready' && e.status === 503);
    await ready();
    await assert.rejects(b.respond('REPLYDIE now', []), (e) => e.code === 'unavailable' && e.status === 503);
    await waitFor(() => b.state === 'down', 3000, 'down after the child died');
    const t0 = Date.now();
    await assert.rejects(b.respond('anyone there', []), code('unavailable'));
    assert.ok(Date.now() - t0 < 2000, 'REQ-011: told within 2 s');
  } finally { b.stop(); }
});

test('TC-035 bonsai warm-up sends respond("Hello", []) -- both the reply call and the mood call -- before the state is ready', async () => {
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    const warm = bodies(log);
    assert.ok(warm.length >= 2, `warm calls: ${warm.length}`);
    assert.ok(warm.some((c) => c.response_format), 'mood call during warm-up');
    assert.ok(warm.some((c) => !c.response_format && c.messages.at(-1).content === 'Hello'), 'reply call "Hello"');
  } finally { b.stop(); }
});

test('TC-036 bonsai llama-server arguments: loopback only, own port, -c 32768 -np 2, no web UI', async () => {
  const { b, log, port, ready, size } = await makeBonsai();
  try {
    await ready();
    const argv = log().find((e) => e.argv).argv;
    const at = (f) => argv[argv.indexOf(f) + 1];
    assert.ok(at('-m').endsWith(`Ternary-Bonsai-2-${size}-PQ2_0.gguf`), at('-m'));
    assert.equal(at('--host'), '127.0.0.1');
    assert.equal(at('--port'), String(port));
    assert.equal(at('-c'), '32768'); assert.equal(at('-np'), '2'); assert.equal(at('-ngl'), '99'); assert.equal(at('-fa'), 'on');
    assert.ok(argv.includes('--no-webui'));
  } finally { b.stop(); }
});

// =====================================================================================================
// Increment 2 (docs/backend/04-test-plan.md § Increment 2): tts.js against tests/support/fake-tts.cjs; bonsai.respond crisis / name / lang
// =====================================================================================================
async function makeTts(env = {}, over = {}) {
  const { createTts } = await imp('server/tts.js');
  const { CONFIG } = await imp('server/config.js');
  const dir = mkTmp();
  const logFile = join(dir, 'tts.jsonl');
  const cfg = structuredClone(CONFIG);
  cfg.tts = { ...cfg.tts, bin: shellWrapper(dir, 'companion-tts', `${SUPPORT}/fake-tts.cjs`), modelDir: join(dir, 'models'), tokenizerDir: join(dir, 'tok'), voice: 'serena' };
  cfg.deadlines = { ...cfg.deadlines, ...over };
  const tts = await withEnv({ FAKE_TTS_LOG: logFile, ...env }, () => { const s = createTts(cfg); s.start(); return s; });
  const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const reqs = () => log().filter((e) => e.req).map((e) => e.req);
  return { tts, log, reqs, dir, ready: () => waitFor(() => tts.state === 'ready', 10000, 'tts ready') };
}
const sig = () => new AbortController();

test('TC-109 REQ-014 tts.speak: not_ready while starting; then a WAV (RIFF, PCM16 mono 24000 Hz); the helper gets --model-folder --tokenizer-folder --voice serena and {text, lang}; the non-JSON line is dropped', async () => {
  const { tts, log, reqs, dir, ready } = await makeTts({ FAKE_TTS_WARM_MS: '1200' });
  try {
    assert.equal(tts.state, 'starting');
    await assert.rejects(tts.speak('你好。', 'zh', sig().signal), (e) => e.code === 'not_ready' && e.status === 503);
    await ready();
    const wav = await tts.speak('你好。', 'zh', sig().signal);
    assert.ok(Buffer.isBuffer(wav));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1, 'PCM'); assert.equal(wav.readUInt16LE(22), 1, 'mono'); assert.equal(wav.readUInt32LE(24), 24000, 'rate'); assert.equal(wav.readUInt16LE(34), 16, 'bits');
    assert.equal(wav.length, 44 + wav.readUInt32LE(40));
    await tts.speak('Hello there.', 'en', sig().signal);
    assert.deepEqual(reqs().map(({ text, lang }) => ({ text, lang })), [{ text: '你好。', lang: 'zh' }, { text: 'Hello there.', lang: 'en' }]);
    const argv = log().find((e) => e.argv).argv;
    const at = (f) => argv[argv.indexOf(f) + 1];
    assert.equal(at('--voice'), 'serena'); assert.equal(at('--model-folder'), join(dir, 'models')); assert.equal(at('--tokenizer-folder'), join(dir, 'tok'));
    assert.ok(tts.pid > 0);
  } finally { tts.stop(); }
});

test('TC-110 REQ-017 tts.speak failures: helper error -> failed (502); a slow answer past the deadline -> timeout (504) and is dropped; exit mid-flight and while down -> unavailable (503)', async () => {
  const { tts, ready } = await makeTts({}, { speakMs: 400 });
  try {
    await ready();
    await assert.rejects(tts.speak('ERR now', 'en', sig().signal), (e) => e.code === 'failed' && e.status === 502);
    const t0 = Date.now();
    await assert.rejects(tts.speak('LATE now', 'en', sig().signal), (e) => e.code === 'timeout' && e.status === 504);
    assert.ok(Date.now() - t0 < 2000, 'timeout fires at the deadline');
    await sleep(600);
    assert.ok((await tts.speak('fine now', 'en', sig().signal)).length > 44, 'the late answer for the dropped id does not break the next request');
    await assert.rejects(tts.speak('DIE now', 'en', sig().signal), (e) => e.code === 'unavailable' && e.status === 503);
    assert.equal(tts.state, 'down');
    await assert.rejects(tts.speak('x now', 'en', sig().signal), (e) => e.code === 'unavailable');
  } finally { tts.stop(); }
});

test('TC-111 REQ-014/REQ-018 tts.speak queue: one request at a time in FIFO order; the deadline counts queue wait; a signal aborted while queued is never written to the helper; an in-flight abort does not break the next call', async () => {
  const { tts, reqs, ready } = await makeTts({}, { speakMs: 1000 });
  try {
    await ready();
    const [a, b, c] = ['SLOW a', 'SLOW b', 'SLOW c'];
    const pa = tts.speak(a, 'en', sig().signal), pb = tts.speak(b, 'en', sig().signal), pc = tts.speak(c, 'en', sig().signal);
    await sleep(200);
    assert.deepEqual(reqs().map((r) => r.text), [a], 'only the first is written while it is in flight');
    assert.ok((await pa).length > 44);
    assert.ok((await pb).length > 44);
    await assert.rejects(pc, (e) => e.code === 'timeout', 'c waited ~800 ms in the queue + 400 ms generation > 1000 ms');
    assert.deepEqual(reqs().map((r) => r.text).slice(0, 2), [a, b], 'FIFO');
    await sleep(800);
  } finally { tts.stop(); }
  const m = await makeTts({}, { speakMs: 5000 });
  try {
    await m.ready();
    const acQ = sig();
    const p1 = m.tts.speak('SLOW first', 'en', sig().signal);
    const p2 = m.tts.speak('SLOW queued', 'en', acQ.signal);
    const p3 = m.tts.speak('SLOW third', 'en', sig().signal);
    const q = p2.then(() => 'resolved', (e) => e);
    await sleep(100); acQ.abort();
    assert.ok((await p1).length > 44); assert.ok((await p3).length > 44);
    assert.notEqual(await q, 'resolved', 'the aborted call does not deliver audio');
    assert.ok(!m.reqs().some((r) => r.text === 'SLOW queued'), 'never written to the helper');
    const acF = sig();
    const pf = m.tts.speak('SLOW inflight', 'en', acF.signal).then(() => 'resolved', (e) => e);
    await sleep(100); acF.abort();
    const next = m.tts.speak('after abort', 'en', sig().signal);
    assert.ok((await next).length > 44, 'a part already written is still generated; the next call is served');
    assert.notEqual(await pf, 'resolved', 'an answer for an aborted call is dropped');
  } finally { m.tts.stop(); }
});

test('TC-112 REQ-017 tts.speak: the helper exiting rejects the in-flight call and every queued call with unavailable, and the queue is emptied', async () => {
  const { tts, ready } = await makeTts();
  try {
    await ready();
    const r = await Promise.allSettled([tts.speak('DIE x', 'en', sig().signal), tts.speak('q1', 'en', sig().signal), tts.speak('q2', 'en', sig().signal)]);
    for (const x of r) { assert.equal(x.status, 'rejected'); assert.equal(x.reason.code, 'unavailable'); }
  } finally { tts.stop(); }
});

// ---------- bonsai.respond increment 2 (DES-020, DES-021)
const crisisLines = () => fx('FX-009').input.cases.map((c) => ({ id: c.id, line: c.body.line }));
const quietLines = () => fx('FX-010').input.cases.map((c) => ({ id: c.id, line: c.body.line }));
const sentencesOf = (t) => t.split(/(?<=[。！？!?.…])(?![。！？!?.…])/u).filter((s) => /[\p{L}\p{N}]/u.test(s));
const sysOf = (c) => c.messages[0].content;
const repOf = (calls) => calls.find((x) => !x.response_format);
const moodOf = (calls) => calls.find((x) => x.response_format);

test('TC-113 REQ-005/REQ-014 bonsai.respond returns {reply, mood, lang, crisis}: lang is the language of the line, crisis false with no CRISIS_RULE or NAME_RULE in the prompt', async () => {
  const P = await imp('server/prompts.js');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    for (const [line, lang] of [['I am HAPPY today', 'en'], ['今天很开心 HAPPY', 'zh'], ['我今天很happy', 'zh']]) {
      const n = bodies(log).length;
      const r = await b.respond(line, []);
      assert.deepEqual(Object.keys(r).sort(), ['crisis', 'lang', 'mood', 'reply']);
      assert.equal(r.lang, lang, line); assert.equal(r.crisis, false); assert.ok(MOODS.includes(r.mood));
      const rep = repOf(bodies(log).slice(n));
      assert.equal(sysOf(rep), P.replySystem(null) + '\n' + P.LANG_RULE[lang], line);
      assert.ok(!sysOf(rep).includes(P.CRISIS_RULE[lang]) && !sysOf(rep).includes('Your name is'));
    }
  } finally { b.stop(); }
});

test('TC-114 [FX-009] REQ-023/REQ-024 bonsai.respond on a crisis line: crisis true, system message ends with CRISIS_RULE[lang] (mood call does not carry it), reply contains 988, <= 2 sentences, <= 1 question; non-crisis lines never get the rule', async () => {
  const P = await imp('server/prompts.js');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    for (const { id, line } of crisisLines()) {
      const lang = /\p{Script=Han}/u.test(line) ? 'zh' : 'en';
      const n = bodies(log).length;
      const r = await b.respond(line + ' SAD', []);
      const calls = bodies(log).slice(n);
      assert.equal(r.crisis, true, id); assert.equal(r.lang, lang, id);
      assert.ok(sysOf(repOf(calls)).endsWith('\n' + P.CRISIS_RULE[lang]), `${id}: reply system message ends with the crisis rule`);
      assert.ok(sysOf(repOf(calls)).includes(P.LANG_RULE[lang]), id);
      assert.ok(!JSON.stringify(moodOf(calls).messages).includes(P.CRISIS_RULE[lang]), `${id}: mood call carries no crisis rule`);
      assert.equal(r.mood, 'unpleasant-low', `${id}: mood from the mood call`);
      assert.ok(r.reply.includes('988'), `${id}: ${r.reply}`);
      assert.ok(sentencesOf(r.reply).length <= 2 && sentencesOf(r.reply).filter((s) => /[?？]/.test(s)).length <= 1, `${id}: ${r.reply}`);
    }
    for (const { line } of quietLines()) { const r = await b.respond(line, []); assert.equal(r.crisis, false, line); assert.ok(!r.reply.includes('988'), line); }
    const n2 = bodies(log).length; await b.respond('This homework is killing me.', []);
    assert.ok(!sysOf(repOf(bodies(log).slice(n2))).includes(P.CRISIS_RULE.en));
  } finally { b.stop(); }
});

test('TC-115 [FX-009] REQ-024/REQ-025 UD-1 (a): on a crisis turn a failed, empty, slow or unavailable Bonsai gives 200-shape {crisis: true, reply: fallback + 988 line}, never an error; a normal turn still rejects', async () => {
  const { crisisReply } = await imp('server/bonsai.js');
  const slow = await makeBonsai({}, { respondMs: 1200 });
  try {
    await slow.ready();
    const want = (lang) => crisisReply('', lang);
    for (const trig of ['REPLY500', 'REPLYEMPTY']) {
      const r = await slow.b.respond(`I want to kill myself ${trig}`, []);
      assert.equal(r.crisis, true, trig); assert.equal(r.reply, want('en'), trig); assert.equal(r.lang, 'en'); assert.ok(MOODS.includes(r.mood));
      const z = await slow.b.respond(`我想自杀 ${trig}`, []);
      assert.equal(z.reply, want('zh'), trig); assert.equal(z.lang, 'zh'); assert.equal(z.crisis, true);
    }
    const f = await slow.b.respond('我不想活了 REPLY500 MOODFAIL', []);
    assert.equal(f.mood, 'neutral', 'the mood call failed too');
    const t0 = Date.now();
    const s = await slow.b.respond('I want to die REPLYSLOW', []);
    assert.equal(s.reply, want('en')); assert.equal(s.crisis, true); assert.ok(Date.now() - t0 < 3500, 'answers at the reply deadline, not after the 4 s the fake needs');
    await assert.rejects(slow.b.respond('This is fine REPLY500', []), (e) => e.code === 'failed', 'normal turns keep REQ-011 behaviour');
  } finally { slow.b.stop(); }
  const early = await makeBonsai({ FAKE_LLAMA_BOOT_MS: '3000' });
  try {
    assert.equal(early.b.state, 'starting');
    const r = await early.b.respond('I want to hurt myself', []);
    assert.equal(r.crisis, true); assert.equal(r.reply, crisisReply('', 'en')); assert.equal(r.mood, 'neutral', 'no mood call was possible');
    await assert.rejects(early.b.respond('Just a normal line', []), (e) => e.code === 'not_ready', 'normal turns while starting stay not_ready');
    await early.ready();
    early.b.stop();
    await waitFor(() => early.b.state === 'down', 5000, 'down');
    const d = await early.b.respond('我想自杀', []);
    assert.equal(d.crisis, true); assert.equal(d.reply, crisisReply('', 'zh'));
  } finally { early.b.stop(); }
  const die = await makeBonsai();
  try {
    await die.ready();
    const r = await die.b.respond('I keep wanting to hurt myself REPLYDIE', []);
    assert.equal(r.crisis, true); assert.equal(r.reply, crisisReply('', 'en'), 'the child died mid-request');
  } finally { die.b.stop(); }
});

test('TC-116 [FX-012 FX-011] REQ-030/REQ-031 name -> Bonsai: system message = replySystem(cleaned name) + LANG_RULE; null -> the unchanged default text with no NAME_RULE; the mood call never sees the name', async () => {
  const P = await imp('server/prompts.js');
  const { parseTurn } = await imp('server/main.js');
  const f = fx('FX-012');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    for (const c of f.input.cases) {
      const want = f.expected.cases.find((e) => e.id === c.id).name;
      const turn = parseTurn(Buffer.from(JSON.stringify({ line: f.input.line, history: [], name: c.name })));
      assert.equal(turn.name, want, c.id);
      const n = bodies(log).length;
      await b.respond(turn.line, turn.history, turn.name);
      const calls = bodies(log).slice(n);
      assert.equal(sysOf(repOf(calls)), P.replySystem(want) + '\n' + P.LANG_RULE.en, c.id);
      if (want === null) assert.ok(!sysOf(repOf(calls)).includes('Your name is'), `${c.id}: no NAME_RULE`);
      else { assert.ok(sysOf(repOf(calls)).includes(`Your name is "${want}"`), c.id); assert.ok(!sysOf(repOf(calls)).includes('小伙伴 (Little Buddy)'), c.id); assert.ok(!JSON.stringify(moodOf(calls).messages).includes(want), `${c.id}: mood call`); }
    }
    const n = bodies(log).length;
    await b.respond('你叫什么名字？', [], '团子');
    const calls = bodies(log).slice(n);
    assert.ok(sysOf(repOf(calls)).includes('"团子"') && sysOf(repOf(calls)).includes(P.LANG_RULE.zh));
    const n2 = bodies(log).length;
    await b.respond('你叫什么名字？', []);
    assert.equal(sysOf(repOf(bodies(log).slice(n2))), P.replySystem(null) + '\n' + P.LANG_RULE.zh, 'name omitted -> default text (FX-011-03 shape)');
  } finally { b.stop(); }
});

test('TC-117 REQ-024/REQ-030 a crisis turn with a custom name carries both the NAME_RULE and the CRISIS_RULE, in that order, after the language rule', async () => {
  const P = await imp('server/prompts.js');
  const { b, log, ready } = await makeBonsai();
  try {
    await ready();
    const n = bodies(log).length;
    await b.respond('I want to kill myself', [], 'Mochi');
    const s = sysOf(repOf(bodies(log).slice(n)));
    assert.equal(s, P.replySystem('Mochi') + '\n' + P.LANG_RULE.en + '\n' + P.CRISIS_RULE.en);
  } finally { b.stop(); }
});

test('TC-137 REQ-017 tts.speak: a helper that never answers one request (deadline passed, timeout returned) does not wedge the next speak (DES-017 step 5: "after that, write the next")', async () => {
  const { tts, ready } = await makeTts({}, { speakMs: 500 });
  try {
    await ready();
    await assert.rejects(tts.speak('HANG now', 'en', sig().signal), (e) => e.code === 'timeout' && e.status === 504);
    const t0 = Date.now();
    const wav = await tts.speak('fine now', 'en', sig().signal).catch((e) => e);
    assert.ok(Buffer.isBuffer(wav), `the next call after a timed-out one must be served, got ${wav?.code ?? wav}`);
    assert.ok(Date.now() - t0 < 500);
  } finally { tts.stop(); }
});
