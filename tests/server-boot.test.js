// Opt-in boot suite: starts its OWN server (node server/main.js == npm start, DES-012) on free ports and stops only that PID.
// Run with COMPANION_BOOT=1. Needs the real models and compiled stt helper; takes minutes. Never touches port 4317/4318.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT, fx, freePort, call, sleep, waitFor, nonLoopback, MOODS } from './server-helpers.js';

const skip = process.env.COMPANION_BOOT === '1' ? false : 'set COMPANION_BOOT=1 to boot a private server on free ports (slow, needs models)';
const READY_MS = 120000;

describe('boot suite', { skip, timeout: 1200000 }, () => {
  let proc, out = '', base, t0, readyMs, exited = false;
  const kids = () => { try { return execFileSync('pgrep', ['-P', String(proc.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { return []; } };
  const comm = (pid) => { try { return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };
  const kidNamed = (re) => kids().find((p) => re.test(comm(p)));

  before(async () => {
    const port = await freePort(), bport = await freePort();
    assert.ok(![4317, 4318].includes(port) && ![4317, 4318].includes(bport));
    base = `http://127.0.0.1:${port}`;
    t0 = Date.now();
    proc = spawn(process.execPath, ['server/main.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), BONSAI_PORT: String(bport) }, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (c) => (out += c)); proc.stderr.on('data', (c) => (out += c));
    proc.on('exit', () => (exited = true));
    await waitFor(() => /Ready: http/.test(out) || exited, 600000, 'the Ready line (first run may include a 390 s ANE compile; REQ-010 counts only warm starts)');
    readyMs = Date.now() - t0;
  });
  after(async () => { if (proc && !exited) { proc.kill('SIGTERM'); await waitFor(() => exited, 15000, 'server exit').catch(() => proc.kill('SIGKILL')); } });

  test('TC-070 REQ-010: node server/main.js prints "就绪 Ready: <url>" within 120 s and /api/health is ready', async () => {
    assert.ok(!exited, `server exited early:\n${out}`);
    assert.match(out, /就绪 Ready: http:\/\/127\.0\.0\.1:\d+/);
    assert.ok(readyMs <= READY_MS, `ready after ${readyMs} ms (limit ${READY_MS}; a first-ever run compiles for ~390 s, A10)`);
    const h = await call(base, '/api/health', { method: 'GET' });
    assert.deepEqual(h.json, { ready: true, stt: 'ready', bonsai: 'ready' });
  });

  test('TC-071 [FX-006] REQ-010/REQ-008: the first voice turn after boot gets transcript, reply and mood within 10 s', async () => {
    const t = performance.now();
    const s = await call(base, '/api/transcribe', { body: fx('FX-006').wav(), type: 'audio/wav' });
    assert.equal(s.status, 200);
    const r = await call(base, '/api/respond', { body: { line: s.json.text, history: [] } });
    const ms = performance.now() - t;
    assert.equal(r.status, 200, r.text); assert.ok(MOODS.includes(r.json.mood)); assert.ok(r.json.reply.length > 0);
    assert.ok(ms <= 10000, `${Math.round(ms)} ms`);
  });

  test('TC-072 REQ-009: after 3 voice turns the server and each child hold only loopback sockets', async () => {
    for (let i = 0; i < 2; i++) {
      const s = await call(base, '/api/transcribe', { body: fx('FX-006').wav(), type: 'audio/wav' });
      assert.equal((await call(base, '/api/respond', { body: { line: s.json.text, history: [] } })).status, 200);
    }
    const { bad, seen } = await nonLoopback([proc.pid, ...kids()]);
    assert.ok(seen.length > 0);
    assert.deepEqual(bad, [], bad.join('; '));
    assert.ok(kids().length >= 2, 'stt and bonsai children exist');
  });

  test('TC-073 REQ-009/A9: stdout holds no user text, reply or transcript; each log line is JSON with a known event', async () => {
    await call(base, '/api/respond', { body: { line: 'Zebra-unique-sentence-4821 is on my mind', history: [] } });
    assert.ok(!/Zebra-unique|internship/i.test(out), 'content leaked into the log');
    const events = ['missing_file', 'child_spawn', 'child_ready', 'child_exit', 'ready', 'stt_done', 'respond_done', 'api_error',
      'stt_warm', 'stt_error', 'stt_bad_line', 'stt_stdin_error', 'child_error', 'child_warm_failed', 'static_read_failed', 'boot_failed', 'child_gave_up']; // the 17 of 03 §6
    const json = out.split('\n').filter((l) => l.startsWith('{'));
    assert.ok(json.length > 0);
    for (const l of json) { const o = JSON.parse(l); assert.ok(events.includes(o.event), l); }
    assert.ok(json.some((l) => JSON.parse(l).event === 'respond_done'));
    assert.ok(json.some((l) => JSON.parse(l).event === 'stt_done'));
  });

  test('TC-074 REQ-011: llama-server killed -> /api/respond answers 503 (unavailable or not_ready) within 2 s, then succeeds again after the restart', async () => {
    const pid = kidNamed(/llama-server/);
    assert.ok(pid, 'llama-server child');
    process.kill(pid, 'SIGKILL');
    await sleep(300);
    const r = await call(base, '/api/respond', { body: { line: 'hello', history: [] }, timeoutMs: 5000 });
    assert.equal(r.status, 503, r.text); assert.ok(['unavailable', 'not_ready'].includes(r.json.error), r.text);
    assert.ok(r.ms < 2000, `${Math.round(r.ms)} ms`);
    const h = await call(base, '/api/health', { method: 'GET' });
    assert.equal(h.status, 200); assert.equal(h.json.ready, false);
    await waitFor(async () => (await call(base, '/api/respond', { body: { line: 'hello again', history: [] }, timeoutMs: 20000 }).catch(() => ({}))).status === 200, 120000, 'respond works after the restart');
  });

  test('TC-075 REQ-011: companion-stt killed -> /api/transcribe answers 503 within 2 s, then succeeds again after the restart', async () => {
    const pid = kidNamed(/companion-stt/);
    assert.ok(pid, 'companion-stt child');
    process.kill(pid, 'SIGKILL');
    await sleep(300);
    const r = await call(base, '/api/transcribe', { body: fx('FX-006').wav(), type: 'audio/wav', timeoutMs: 5000 });
    assert.equal(r.status, 503, r.text); assert.ok(['unavailable', 'not_ready'].includes(r.json.error), r.text);
    assert.ok(r.ms < 2000, `${Math.round(r.ms)} ms`);
    await waitFor(async () => (await call(base, '/api/transcribe', { body: fx('FX-006').wav(), type: 'audio/wav', timeoutMs: 30000 }).catch(() => ({}))).status === 200, 700000, 'transcribe works after the restart');
  });

  test('TC-076 REQ-010: SIGTERM to the main process stops its children (only its own) and the port closes', async () => {
    const mine = kids();
    assert.ok(mine.length >= 2);
    proc.kill('SIGTERM');
    await waitFor(() => exited, 20000, 'main exit');
    await waitFor(() => mine.every((p) => { try { process.kill(p, 0); return false; } catch { return true; } }), 20000, 'children gone');
    await assert.rejects(fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }));
  });
});
