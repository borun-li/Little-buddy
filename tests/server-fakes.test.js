// Backend process-level tests against test doubles of the two children (tests/support/fake-stt.cjs, fake-llama.cjs).
// They check the protocols of 03 DES-004, DES-006, DES-007 without models. Written from 01 and 03 only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { imp, sleep, waitFor, freePort, mkTmp, withEnv, shellWrapper, SUPPORT } from './server-helpers.js';

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
    assert.deepEqual(r, { reply: 'Fake reply.', mood: 'pleasant-high' });
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
    assert.equal(rep.messages.at(-1).content, 'But I am SAD now');
    assert.deepEqual(rep.messages.slice(1, 3), [{ role: 'user', content: hist[0].text }, { role: 'assistant', content: '太棒了！' }]);
    assert.ok(rep.messages[0].content.endsWith(P.LANG_RULE.en), 'English line -> English rule although history is Chinese');
    assert.ok(!JSON.stringify(mood.messages).includes('今天考试过了'), 'mood call has no history');
    assert.ok(JSON.stringify(mood.messages).includes('But I am SAD now'));
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
