// Shared helpers for tests/memory-*.test.js (not a test file). be-tester #4, R1. Every gateway started here uses its own temp
// LITTLEBUDDY_DATA_DIR and ports >= 4450, and only the PID it started is ever stopped.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fx, ROOT, sleep, SUPPORT, waitFor } from './server-helpers.js';

export { fx, ROOT, sleep, SUPPORT, waitFor };
export const TODAY_RE = /\{today\}/g;
export const wt = (s) => s.length + 1.5 * (s.match(/\p{Script=Han}/gu) ?? []).length; // own copy of 03 §Conventions weight
export const round3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000);
export const roundDays = (days) => days.map((d) => ({ ...d, value: round3(d.value) }));

// ---- temp folders and files
const made = [];
export const tmpDir = (p = 'lb-t4-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
export function rmAll(dir) {
  try {
    for (const p of [dir, ...readdirSync(dir).map((n) => join(dir, n))]) { try { chmodSync(p, statSync(p).isDirectory() ? 0o700 : 0o600); } catch { /* gone */ } }
    rmSync(dir, { recursive: true, force: true });
  } catch { /* already gone */ }
}
export const cleanupTmp = () => { for (const d of made.splice(0)) rmAll(d); };
export function seed(dir, files, mode = 0o600) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [name, text] of Object.entries(files)) { writeFileSync(join(dir, name), text, { mode }); chmodSync(join(dir, name), mode); }
}
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fill = (text, day = today()) => text.replace(TODAY_RE, day);
export const filesOf = (fxId, caseIndex = null, day = today()) => {
  const f = fx(fxId);
  const files = caseIndex === null ? f.input.files : f.input.cases[caseIndex].files;
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, fill(v, day)]));
};
export const mode = (p) => statSync(p).mode & 0o777;

// snapshot of every entry of a folder: bytes (null when unreadable), mode, size, mtime; plus the entry list
export function snap(dir) {
  const out = { entries: readdirSync(dir).sort(), files: {}, dirMode: mode(dir) };
  for (const n of out.entries) {
    const p = join(dir, n);
    const st = statSync(p);
    let bytes = null;
    if (st.isFile()) { try { bytes = readFileSync(p).toString('base64'); } catch { bytes = null; } }
    out.files[n] = { bytes, mode: st.mode & 0o777, size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory() };
  }
  return out;
}

// ---- capture the gateway's JSON log lines that a store or memory writes in this process (stdout), without printing them
export async function captureLogs(fn) {
  const logs = [];
  const orig = process.stdout.write;
  process.stdout.write = function write(chunk, ...rest) {
    const s = String(chunk);
    if (s.startsWith('{"t":')) { for (const l of s.split('\n').filter(Boolean)) { try { logs.push(JSON.parse(l)); } catch { /* not ours */ } } return true; }
    return orig.call(process.stdout, chunk, ...rest);
  };
  try { return { result: await fn(), logs }; } finally { process.stdout.write = orig; }
}

// ---- ports >= 4450, never 4317
const taken = new Set();
const UNSAFE = new Set([5060, 5061, 5000, 7000, 4460, 4461]); // Chromium refuses 5060/5061 (net::ERR_UNSAFE_PORT, TC-211); 5000 and 7000 are held by macOS AirPlay (ControlCenter) on *:5000/*:7000 (TC-185 flake, be-developer #5 round 2)
// A port counts as free only when it binds on loopback AND on every address (a listener on *:PORT does not stop a 127.0.0.1 bind test on macOS).
function bindOn(port, host) {
  return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, host, () => s.close(() => res(true))); });
}
async function canBind(port) {
  return (await bindOn(port, '127.0.0.1')) && (await bindOn(port, undefined)); // undefined = all addresses (dual-stack ::)
}
// Cross-process claim: node --test runs the files in parallel, and "bind, close, hand out" alone lets two files pick the same port before either gateway binds it
// (TC-178/TC-259/TC-277 "Port N is in use"). A claim is an O_EXCL file named after the port; it is stale when its owner pid is dead. 4460/4461 are fixed in memory-perf.
const CLAIMS = join(tmpdir(), 'lb-test-port-claims');
function claim(p) {
  mkdirSync(CLAIMS, { recursive: true });
  const f = join(CLAIMS, String(p));
  for (let t = 0; t < 2; t++) {
    try { writeFileSync(f, String(process.pid), { flag: 'wx' }); return true; } catch { /* held? */ }
    let owner = NaN;
    try { owner = Number(readFileSync(f, 'utf8')); } catch { continue; }
    let alive = owner > 0;
    if (alive) { try { process.kill(owner, 0); } catch (e) { alive = e.code === 'EPERM'; } }
    if (alive) return false;
    try { rmSync(f, { force: true }); } catch { /* raced */ }
  }
  return false;
}
export async function port4450() {
  for (let i = 0; i < 400; i++) {
    const p = 4450 + Math.floor(Math.random() * 1500);
    if (taken.has(p) || p === 4317 || UNSAFE.has(p) || !claim(p) || !(await canBind(p))) continue;
    taken.add(p);
    return p;
  }
  throw new Error('no free port >= 4450');
}

// ---- the gateway under test: the real server/main.js; Bonsai, STT and TTS are the doubles of tests/support
export async function startGateway({ dir, env = {}, script = {}, clock = null, tz = null, keepScript = false, scriptPath = null } = {}) {
  const home = tmpDir('lb-gw-');
  const sp = scriptPath ?? join(home, 'script.json');
  if (!keepScript) writeFileSync(sp, JSON.stringify(script));
  const llamaLog = join(home, 'llama.jsonl');
  writeFileSync(llamaLog, '');
  const port = await port4450();
  const bport = await port4450();
  const nodeOpts = [`--require ${SUPPORT}/gateway-doubles.cjs`, clock ? `--require ${SUPPORT}/clock-preload.cjs` : ''].filter(Boolean).join(' ');
  const e = {
    ...process.env, PORT: String(port), BONSAI_PORT: String(bport), LITTLEBUDDY_DATA_DIR: dir, FAKE_MEM_SCRIPT: sp, FAKE_MEM_LOG: llamaLog,
    NODE_OPTIONS: nodeOpts, COMPANION_REGION: 'CN', ...(clock ? { FAKE_CLOCK_NOW: clock } : {}), ...(tz ? { TZ: tz } : {}), ...env,
  };
  const proc = spawn(process.execPath, ['server/main.js'], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', exited = null;
  const lines = [];
  proc.stdout.on('data', (c) => { out += c; });
  proc.stderr.on('data', (c) => { err += c; });
  proc.on('exit', (code, sig) => { exited = { code, sig }; });
  const gw = {
    port, bport, base: `http://127.0.0.1:${port}`, pid: proc.pid, dir, home, scriptPath: sp, llamaLog, proc, lines,
    get out() { return out; }, get err() { return err; }, get exited() { return exited; },
    logs() { return out.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); },
    llama() { return readFileSync(llamaLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); },
    setScript(s) { writeFileSync(sp, JSON.stringify(s)); },
    kids() { try { return execFileSync('pgrep', ['-P', String(proc.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { return []; } },
    async ready(ms = 40000) { await waitFor(() => gw.exited || /Ready: http/.test(err), ms, 'gateway Ready line'); if (gw.exited) throw new Error(`gateway exited early: ${JSON.stringify(gw.exited)}\n${err}`); return gw; },
    async stop() {
      if (exited) return;
      const kids = gw.kids();
      proc.kill('SIGTERM');
      await waitFor(() => exited, 15000, 'gateway exit').catch(() => proc.kill('SIGKILL'));
      for (const k of kids) { try { process.kill(k, 0); await sleep(200); try { process.kill(k, 'SIGTERM'); } catch { /* gone */ } } catch { /* gone */ } }
    },
    async restart(over = {}) { await gw.stop(); const n = await startGateway({ dir, env, script, clock, tz, keepScript: true, scriptPath: sp, ...over }); return n.ready(); },
  };
  return gw;
}
export async function withGateway(opts, fn) {
  const gw = await startGateway(opts);
  try { await gw.ready(); return await fn(gw); } finally { await gw.stop(); }
}

// ---- http
export async function api(base, path, { method = 'GET', body, type = 'application/json', headers = {}, signal } = {}) {
  const h = { ...(type && method !== 'GET' ? { 'content-type': type } : {}), ...headers };
  const payload = body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const t0 = performance.now();
  const r = await fetch(base + path, { method, headers: h, body: payload, signal: signal ?? AbortSignal.timeout(60000) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text, headers: r.headers, ms: performance.now() - t0 };
}
export const respond = (gw, line, history = [], name) => api(gw.base, '/api/respond', { method: 'POST', body: { line, history, ...(name ? { name } : {}) } });
export const post = (gw, path, body) => api(gw.base, path, { method: 'POST', body });

// raw request with exact Host / Origin headers (fetch cannot set Host)
export async function raw(port, { method = 'GET', path, host, origin, body, type = 'application/json', http10 = false }) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    let req = `${method} ${path} HTTP/${http10 ? '1.0' : '1.1'}\r\n`;
    if (host !== undefined) req += `Host: ${host}\r\n`;
    if (origin !== undefined) req += `Origin: ${origin}\r\n`;
    if (body !== undefined) req += `Content-Type: ${type}\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n`;
    req += `Connection: close\r\n\r\n${payload}`;
    let data = '';
    s.on('data', (c) => { data += c; });
    s.on('end', () => {
      const m = /^HTTP\/1\.\d (\d+)/.exec(data);
      const bodyText = data.split('\r\n\r\n').slice(1).join('\r\n\r\n');
      let json; try { json = JSON.parse(bodyText); } catch { json = undefined; }
      resolve({ status: Number(m?.[1]), text: bodyText, json });
    });
    s.on('error', reject);
    s.setTimeout(20000, () => { s.destroy(); reject(new Error('raw request timed out')); });
    s.write(req);
  });
}

// the diary / about files as the gateway wrote them
export const readAbout = (dir) => readFileSync(join(dir, '关于你.md'), 'utf8');
export const readDiary = (dir) => (existsSync(join(dir, '日志.md')) ? readFileSync(join(dir, '日志.md'), 'utf8') : '');
// an independent small parser of the DES-031 diary line format (does not use server/memory-files.js)
export function diaryEntries(text) {
  const out = [];
  let date = null;
  for (const l of text.split('\n')) {
    const d = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(l);
    if (d) { date = d[1]; continue; }
    const e = /^-\s+(开心|平静|平常|紧张|难过)(?:\s+·\s+(.+?))?\s*$/.exec(l);
    if (e && date) out.push({ date, word: e[1], point: e[2] ?? null });
  }
  return out;
}
export const MOOD_WORD = { 'pleasant-high': '开心', 'pleasant-low': '平静', neutral: '平常', 'unpleasant-high': '紧张', 'unpleasant-low': '难过' };
export const MOOD_VALUE = { 'pleasant-high': 1, 'pleasant-low': 0.5, neutral: 0, 'unpleasant-high': -0.5, 'unpleasant-low': -1 };
// an independent "about is empty" check
export const aboutEmpty = (t) => t.split('\n').every((l) => l.trim() === '' || l.startsWith('#'));

// Injectable timers for createMemory (A32 idle-time update, 03 DES-033): advance(ms) fires due callbacks in order, no real waiting.
export function fakeTimers() {
  let now = 0;
  let id = 0;
  const q = new Map();
  return {
    setTimeout(f, ms) { id += 1; q.set(id, { f, at: now + ms }); return id; },
    clearTimeout(k) { q.delete(k); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...q].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; q.delete(next[0]); next[1].f();
      }
      now = end;
    },
    get armed() { return q.size; },
  };
}
