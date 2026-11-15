// Shared helpers for tests/server-*.test.js (not a test file). Written from 01 and 03 only.
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

export const ROOT = new URL('../', import.meta.url).pathname;
export const FX_DIR = `${ROOT}tests/fixtures/approved`;
export const MOODS = ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral'];
export const imp = (rel) => import(new URL(`../${rel}`, import.meta.url).href); // inside each test, so a missing module fails that test only

export const fx = (id) => {
  const d = `${FX_DIR}/${id}`;
  const j = (f) => (existsSync(`${d}/${f}`) ? JSON.parse(readFileSync(`${d}/${f}`, 'utf8')) : undefined);
  return { id, dir: d, meta: j('meta.json'), input: j('input.json'), expected: j('expected.json'), wavPath: `${d}/input.wav`, wav: () => readFileSync(`${d}/input.wav`) };
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}
export const freePort = () => new Promise((res, rej) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  s.on('error', rej);
});
export const mkTmp = (p = 'companion-test-') => mkdtempSync(join(tmpdir(), p));
export async function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(env)) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]); }
}
export function shellWrapper(dir, relPath, script, ...args) { // executable that runs `node <script> <args...>`
  const p = join(dir, relPath);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "${script}" ${args.join(' ')} "$@"\n`);
  chmodSync(p, 0o755);
  return p;
}
export const SUPPORT = `${ROOT}tests/support`;

// ---- WAV builder (independent of server/wav.js)
export function makeWav({ channels = 1, rate = 16000, bits = 16, format = 1, data = Buffer.alloc(3200), extra = null, dataSizeField = null } = {}) {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(format, 8); fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE((rate * channels * bits) / 8, 16); fmt.writeUInt16LE((channels * bits) / 8, 20); fmt.writeUInt16LE(bits, 22);
  const ex = extra ? (() => { const b = Buffer.alloc(8 + extra.length); b.write('LIST', 0); b.writeUInt32LE(extra.length, 4); extra.copy(b, 8); return b; })() : Buffer.alloc(0);
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(dataSizeField ?? data.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, ex, dh, data]);
  const head = Buffer.alloc(8); head.write('RIFF', 0); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
export function dataChunkSize(buf) { // reference parser for fixtures
  let o = 12;
  while (o + 8 <= buf.length) { const id = buf.toString('ascii', o, o + 4); const n = buf.readUInt32LE(o + 4); if (id === 'data') return n; o += 8 + n + (n % 2); }
  throw new Error('no data chunk');
}

// ---- fixture rules (meta.json `rules`, FX-001..003)
const HAN = /\p{Script=Han}/u;
export function languageOfReply(t) {
  const han = HAN.test(t), latin = /[A-Za-z]/.test(t);
  if (han && !/[A-Za-z]{2,}/.test(t)) return 'zh';
  if (latin && !han) return 'en';
  return 'other';
}
const segments = (t) => t.split(/(?<=[。！？!?.…])(?![。！？!?.…])/u).filter((s) => /\p{L}/u.test(s));
export async function replyChecks(reply) {
  const { PRESETS } = await import(new URL('../web/js/fake/presets.js', import.meta.url).href);
  const presets = Object.values(PRESETS.zh.replies).flat();
  const t = reply.trim();
  const lang = languageOfReply(reply);
  const segs = segments(t);
  return {
    nonempty: t.length >= 1,
    language: lang,
    sentences_le_2: segs.length <= 2,
    questions_le_1: segs.filter((s) => /[?？]/.test(s)).length <= 1,
    length_ok: lang === 'zh' ? [...t].length <= 120 : t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length <= 40,
    not_a_preset: !presets.includes(t),
    no_thinking_text: !reply.includes('<think') && !reply.includes('</think>'),
  };
}

// ---- error rate (FX-005..007): lowercase, drop punctuation; en = words, zh = characters
export function errorRate(hyp, ref, kind) {
  const norm = (s) => s.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ');
  const tok = (s) => (kind === 'CER' ? [...norm(s).replace(/\s+/g, '')] : norm(s).split(/\s+/).filter(Boolean));
  const a = tok(ref), b = tok(hyp);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] / a.length;
}
export const transcriptLanguage = (t) => (/\p{Script=Han}/u.test(t) && !/[A-Za-z]{2,}/.test(t) ? 'zh' : /[A-Za-z]/.test(t) && !HAN.test(t) ? 'en' : 'other');

// ---- live stack (COMPANION_URL, default http://127.0.0.1:4400); never port 4317 (the user's preview)
export async function probeLive() {
  const base = (process.env.COMPANION_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');
  const how = 'start one with: PORT=4400 BONSAI_PORT=4401 node server/main.js, then set COMPANION_URL';
  if (new URL(base).port === '4317') return { base, skip: 'refusing to target port 4317 (the user\'s preview); use another PORT' };
  const deadline = Date.now() + Number(process.env.COMPANION_READY_MS || 130000);
  let seen = false, last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      const j = await r.json(); seen = true; last = JSON.stringify(j);
      if (j.ready === true) return { base, skip: false };
    } catch (e) { if (!seen) return { base, skip: `no companion server at ${base} (${e.name}); ${how}` }; }
    await sleep(1000);
  }
  return { base, skip: `server at ${base} never became ready within ${process.env.COMPANION_READY_MS || 130000} ms (last health ${last})` };
}
export async function call(base, path, { body, type = 'application/json', method = 'POST', timeoutMs = 60000 } = {}) {
  const t0 = performance.now();
  const r = await fetch(base + path, { method, headers: type ? { 'content-type': type } : {}, body: body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text, ms: performance.now() - t0 };
}
export const memo = (f) => { let p; return () => (p ??= f()); };

// ---- lsof: every address a set of pids touches must be loopback
export async function nonLoopback(pids) {
  const { execFileSync } = await import('node:child_process');
  let out = '';
  try { out = execFileSync('lsof', ['-nP', '-i', '-a', '-p', pids.join(',')], { encoding: 'utf8' }); } catch (e) { out = e.stdout?.toString() ?? ''; }
  const bad = [], seen = [];
  for (const line of out.split('\n').slice(1).filter(Boolean)) {
    for (const a of line.matchAll(/((?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|\*):(\d+|\*)/gi)) { seen.push(a[0]); if (!/^(127\.0\.0\.1|\[::1\])$/.test(a[1])) bad.push(`${line.trim().split(/\s+/)[0]}: ${a[0]}`); }
  }
  return { bad, seen, raw: out };
}
