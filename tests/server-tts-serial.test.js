// Review round 1 fixes FND-013 / FND-015 / FND-020 for server/tts.js against tests/support/fake-tts-serial.cjs (a one-at-a-time helper).
// Written from 03 DES-017 (increment 2, tags "review round 1") only. Design change, not a relaxation: the slot stays busy until the helper answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { imp, sleep, waitFor, mkTmp, withEnv, shellWrapper, SUPPORT } from './server-helpers.js';

async function make(over = {}, limits = {}) {
  const { createTts } = await imp('server/tts.js');
  const { CONFIG } = await imp('server/config.js');
  const dir = mkTmp();
  const logFile = join(dir, 'tts.jsonl');
  const cfg = structuredClone(CONFIG);
  cfg.tts = { ...cfg.tts, bin: shellWrapper(dir, 'companion-tts', `${SUPPORT}/fake-tts-serial.cjs`), modelDir: join(dir, 'models'), tokenizerDir: join(dir, 'tok'), voice: 'serena' };
  cfg.deadlines = { ...cfg.deadlines, ...over };
  cfg.limits = { ...cfg.limits, ...limits };
  const tts = await withEnv({ FAKE_TTS_LOG: logFile }, () => { const s = createTts(cfg); s.start(); return s; });
  const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const seen = () => log().filter((e) => e.seen).map((e) => e.seen);
  const done = () => log().filter((e) => e.done).map((e) => e.done);
  const at = (arr, text) => arr.find((e) => e.text === text);
  return { tts, log, seen, done, at, ready: () => waitFor(() => tts.state === 'ready', 10000, 'tts ready') };
}
const sig = () => new AbortController();
const settled = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e }));

test('TC-138 REQ-017 FND-013 tts.speak: no line reaches the helper while the slot is busy; the next is written only after the helper answered the previous one, in FIFO order', async () => {
  const m = await make();
  try {
    await m.ready();
    const p = [m.tts.speak('SLOW 700', 'en', sig().signal), m.tts.speak('second', 'en', sig().signal), m.tts.speak('third', 'en', sig().signal)];
    await sleep(300);
    assert.deepEqual(m.seen().map((e) => e.text), ['SLOW 700'], 'only the in-flight request has been written');
    for (const x of p) assert.ok((await x).length > 44);
    const seen = m.seen(), done = m.done();
    assert.deepEqual(seen.map((e) => e.text), ['SLOW 700', 'second', 'third']);
    assert.ok(m.at(seen, 'second').t >= m.at(done, 'SLOW 700').t, 'second written after the first answer');
    assert.ok(m.at(seen, 'third').t >= m.at(done, 'second').t, 'third written after the second answer');
  } finally { m.tts.stop(); }
});

test('TC-139 REQ-017/REQ-018 FND-013 tts.speak: an abort while in flight settles the caller at once (AbortError); the slot stays busy and the next request is written only after the late answer', async () => {
  const m = await make();
  try {
    await m.ready();
    const ac = sig();
    const first = settled(m.tts.speak('SLOW 900', 'en', ac.signal));
    await sleep(150);
    const next = m.tts.speak('after abort', 'en', sig().signal);
    await sleep(100);
    const t0 = Date.now();
    ac.abort();
    const r = await first;
    assert.ok(Date.now() - t0 < 200, 'settled at once, not at the helper answer');
    assert.equal(r.err?.name, 'AbortError', `aborted caller gets AbortError, got ${r.err?.code ?? r.err?.name ?? 'resolved'}`);
    assert.deepEqual(m.seen().map((e) => e.text), ['SLOW 900'], 'nothing written right after the abort: the slot is still busy');
    assert.ok((await next).length > 44, 'the next request is served after the late answer');
    assert.ok(m.at(m.seen(), 'after abort').t >= m.at(m.done(), 'SLOW 900').t, 'written only after the late answer');
  } finally { m.tts.stop(); }
});

test('TC-140 REQ-017 FND-013 tts.speak: speakMs while in flight settles the caller with timeout (504) and holds the slot; the next is written only after the late answer', async () => {
  const m = await make({ speakMs: 1000 });
  try {
    await m.ready();
    const t0 = Date.now();
    const first = settled(m.tts.speak('SLOW 1500', 'en', sig().signal));
    const r = await first;
    assert.ok(r.err?.code === 'timeout' && r.err.status === 504, `got ${r.err?.code ?? 'resolved'}`);
    assert.ok(Date.now() - t0 < 1400, 'timeout fires at the deadline, not at the answer');
    const next = m.tts.speak('after timeout', 'en', sig().signal);
    await sleep(200);
    assert.deepEqual(m.seen().map((e) => e.text), ['SLOW 1500'], 'slot held: nothing written after the timeout');
    assert.ok((await next).length > 44);
    assert.ok(m.at(m.seen(), 'after timeout').t >= m.at(m.done(), 'SLOW 1500').t);
  } finally { m.tts.stop(); }
});

test('TC-141 REQ-017 FND-015 tts.speak: a helper that never answers is killed after ttsOverdueMs and restarted; in-flight and queued calls get unavailable; the restarted helper serves', async () => {
  const m = await make({ ttsOverdueMs: 800, speakMs: 20000 });
  try {
    await m.ready();
    const pid0 = m.tts.pid;
    const t0 = Date.now();
    const rs = await Promise.all(['HANG now', 'q1', 'q2'].map((t) => settled(m.tts.speak(t, 'en', sig().signal))));
    const dt = Date.now() - t0;
    for (const r of rs) assert.ok(r.err?.code === 'unavailable' && r.err.status === 503, `got ${r.err?.code ?? 'resolved'}`);
    assert.ok(dt >= 700 && dt < 3000, `settled by the overdue kill at ~800 ms, took ${dt}`);
    assert.deepEqual(m.seen().map((e) => e.text), ['HANG now'], 'queued items were never written');
    await waitFor(() => m.tts.state === 'ready' && m.tts.pid !== pid0, 15000, 'restarted helper ready');
    assert.ok((await m.tts.speak('fine now', 'en', sig().signal)).length > 44);
  } finally { m.tts.stop(); }
});

test('TC-142 REQ-017 FND-013 tts.speak queue cap 4: a fifth waiting call settles the oldest queued one with unavailable at once; the other four are served in order; the in-flight one is untouched', async () => {
  const m = await make({}, { speakQueue: 4 });
  try {
    await m.ready();
    const inflight = m.tts.speak('SLOW 800', 'en', sig().signal);
    await sleep(100);
    const q = ['q1', 'q2', 'q3', 'q4', 'q5'].map((t) => settled(m.tts.speak(t, 'en', sig().signal)));
    const t0 = Date.now();
    const r1 = await q[0];
    assert.ok(r1.err?.code === 'unavailable' && r1.err.status === 503, `oldest queued: got ${r1.err?.code ?? 'resolved'}`);
    assert.ok(Date.now() - t0 < 300, 'settled at once, before the in-flight answer');
    assert.ok((await inflight).length > 44);
    for (const x of q.slice(1)) assert.ok((await x).ok?.length > 44);
    assert.deepEqual(m.seen().map((e) => e.text), ['SLOW 800', 'q2', 'q3', 'q4', 'q5'], 'q1 is never written; the rest are FIFO');
  } finally { m.tts.stop(); }
});

test('TC-143 REQ-017 FND-020 tts.speak: a helper answer with id -1 settles the slot item with failed (502) and frees the slot for the next request', async () => {
  const m = await make();
  try {
    await m.ready();
    const first = settled(m.tts.speak('NEG now', 'en', sig().signal));
    const next = m.tts.speak('after neg', 'en', sig().signal);
    const t0 = Date.now();
    const r = await first;
    assert.ok(r.err?.code === 'failed' && r.err.status === 502, `got ${r.err?.code ?? 'resolved'}`);
    assert.ok(Date.now() - t0 < 1500, 'failed at once, not at the deadline');
    assert.ok((await next).length > 44, 'slot freed: the queued request is served');
    assert.ok((await m.tts.speak('and again', 'en', sig().signal)).length > 44);
  } finally { m.tts.stop(); }
});
