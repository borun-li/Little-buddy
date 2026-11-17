// FX-017-style name lines on the real gateway and the real Bonsai 9B (03 §9 10.8 "own-name line"; FND-027). be-tester #8. Not part of npm test.
// usage: node tests/support/name-lines.mjs --repo <dir> --port 4474 --bport 4475 --tag new --out <file.jsonl>
// Each line gets its own gateway on a fresh mkdtemp data dir (never the user's folder): one turn, then up to 40 s of waiting for the idle-time
// update (quiet 8 s), then 关于你.md is read. Expected: a line "我叫<name>" (Chinese) or "I'm <name>" (English) under 在意的人和事.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? null : process.argv[i + 1]; };
const REPO = arg('repo'), PORT = Number(arg('port')), BPORT = Number(arg('bport')), TAG = arg('tag'), OUT = arg('out');
if (!REPO || !PORT || !BPORT || !TAG || !OUT) throw new Error('usage: --repo --port --bport --tag --out');
if (PORT < 4450 || BPORT < 4450 || [4317, 4400].includes(PORT) || [4317, 4400].includes(BPORT)) throw new Error('ports must be >= 4450');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = `http://127.0.0.1:${PORT}`;
const pids = new Set();
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const kids = (p) => { try { return execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { return []; } };
function descendants(pid) { const out = []; let f = [pid]; while (f.length) { const n = []; for (const p of f) n.push(...kids(p)); out.push(...n); f = n; } return out; }

async function boot(dir) {
  const env = { ...process.env, PORT: String(PORT), BONSAI_PORT: String(BPORT), LITTLEBUDDY_DATA_DIR: dir, COMPANION_REGION: 'CN' };
  const proc = spawn(process.execPath, ['server/main.js'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gw = { proc, exited: null, err: '' };
  pids.add(proc.pid);
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (c) => { gw.err += c; });
  proc.on('exit', (code, sig) => { gw.exited = { code, sig }; });
  const t0 = Date.now();
  for (;;) {
    if (gw.exited) throw new Error(`gateway exited ${JSON.stringify(gw.exited)} ${gw.err.slice(-800)}`);
    if (Date.now() - t0 > 8 * 60000) throw new Error('not ready in 8 min');
    try { const h = await (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })).json(); if (h.ready === true) break; } catch { /* starting */ }
    await sleep(1000);
  }
  for (const k of descendants(proc.pid)) pids.add(k);
  gw.stop = async () => {
    for (const k of descendants(proc.pid)) pids.add(k);
    proc.kill('SIGTERM');
    const t = Date.now();
    while (!gw.exited && Date.now() - t < 20000) await sleep(100);
    if (!gw.exited) proc.kill('SIGKILL');
    const t2 = Date.now();
    while ([...pids].some(alive) && Date.now() - t2 < 8000) await sleep(200);
    for (const p of pids) if (alive(p)) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  };
  return gw;
}
async function say(line, history) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/respond`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line, history }), signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  return { status: r.status, ms: Date.now() - t0, reply: j.reply ?? '', lang: j.lang ?? null };
}
const CASES = [['你好，我是小雨。', /我叫小雨/], ["I'm Alex.", /I'm Alex/i], ["my name's Alex", /I'm Alex/i], ['你好我叫小雨', /我叫小雨/]];
mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, '');
for (const [line, want] of CASES) {
  const dir = mkdtempSync(join(tmpdir(), `lb-name-${TAG}-`));
  const gw = await boot(dir);
  try {
    const r = await say(line, []);
    const t0 = Date.now();
    let about = '';
    while (Date.now() - t0 < 40000) {
      await sleep(1000);
      try { about = readFileSync(join(dir, '关于你.md'), 'utf8'); } catch { about = ''; }
      if (want.test(about)) break;
    }
    const landedS = Math.round((Date.now() - t0) / 100) / 10;
    const rec = { tag: TAG, line, status: r.status, replyMs: r.ms, landed: want.test(about), waitedS: landedS, about };
    appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
    console.log(JSON.stringify({ line, landed: rec.landed, waitedS: landedS }));
  } finally { await gw.stop(); }
}
console.log(`pids ${[...pids].join(',')} alive-after: ${[...pids].filter(alive).join(',') || 'none'}`);
