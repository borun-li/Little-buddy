// Short-reply set on the real gateway and the real Bonsai 9B (03 §9 10.8; FND-029 round 2). be-tester #8. Not part of npm test (needs the models).
// usage: node tests/support/short-replies.mjs --repo <dir with server/main.js> --port 4470 --bport 4471 --tag new|head --out <file.jsonl>
// Three gateways per code version, each with its own mkdtemp data dir (never the user's folder), started and stopped by pid:
//   fresh   no notes:   嗯 / ok / 哈哈 / hmm x 4 (each in a new chat, history [])
//   notes   关于你.md holds "- 我叫小雨" (written before the start): the same 16 lines
//   chat    two chats of 8 short lines each inside one chat (zh opener, then the short lines; en opener, then the lines reversed)
// Scoring is written here and not imported from server/: opening "收到" / "Got it"; the rule repeated (the language rule or its words in the reply);
// "<lang" anywhere; the reply language equals the line's.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? null : process.argv[i + 1]; };
const REPO = arg('repo'), PORT = Number(arg('port')), BPORT = Number(arg('bport')), TAG = arg('tag'), OUT = arg('out');
if (!REPO || !PORT || !BPORT || !TAG || !OUT) throw new Error('usage: --repo --port --bport --tag --out');
if (PORT < 4450 || BPORT < 4450 || [4317, 4400].includes(PORT) || [4317, 4400].includes(BPORT)) throw new Error('ports must be >= 4450');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = `http://127.0.0.1:${PORT}`;
const SHORT = ['嗯', 'ok', '哈哈', 'hmm'];
const CHAT_LINES = ['嗯', 'ok', '哈哈', 'hmm', '好吧', '对啊', 'yeah', 'lol'];
const OPEN = /^[\s"'“‘「]*(收到|got it)/i;
const RULE = /简体中文|不超过\s*\d+|at most \d+ words|reply in (english|chinese)|keep (my|the) repl|我会用|会用中文|用中文回复|from now on|以后.*(回复|回答)/i;
const hasHan = (s) => /\p{Script=Han}/u.test(s);
const langOf = (line) => (hasHan(line) ? 'zh' : 'en');
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
const row = (set, line, r) => {
  const rec = { tag: TAG, set, line, status: r.status, ms: r.ms, reply: r.reply, lang: r.lang, opens: OPEN.test(r.reply), rule: RULE.test(r.reply), langTag: /<lang/i.test(r.reply), langOk: r.status === 200 && langOf(r.reply) === langOf(line) };
  appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
  return rec;
};
const sets = {
  async fresh(dir) {
    const gw = await boot(dir);
    try { for (let k = 0; k < 4; k++) for (const line of SHORT) { row('fresh', line, await say(line, [])); await sleep(1500); } } finally { await gw.stop(); }
  },
  async notes(dir) {
    writeFileSync(join(dir, '关于你.md'), '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n- 我叫小雨\n\n## 喜欢·不喜欢\n', { mode: 0o600 });
    const gw = await boot(dir);
    try { for (let k = 0; k < 4; k++) for (const line of SHORT) { row('notes', line, await say(line, [])); await sleep(1500); } } finally { await gw.stop(); }
  },
  async chat(dir) {
    const gw = await boot(dir);
    try {
      for (const [name, opener, lines] of [['chatA', '今天下班好晚，有点累', CHAT_LINES], ['chatB', 'I finally finished the report tonight', [...CHAT_LINES].reverse()]]) {
        let history = [];
        const o = await say(opener, history);
        history = [{ role: 'user', text: opener }, { role: 'companion', text: o.reply }];
        for (const line of lines) {
          const r = await say(line, history.slice(-40));
          row(name, line, r);
          if (r.status === 200) history.push({ role: 'user', text: line }, { role: 'companion', text: r.reply });
          await sleep(1500);
        }
      }
    } finally { await gw.stop(); }
  },
};
mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, '');
console.log(`start ${TAG} ${new Date().toISOString()}`);
for (const name of ['fresh', 'notes', 'chat']) {
  const dir = mkdtempSync(join(tmpdir(), `lb-short-${TAG}-${name}-`));
  await sets[name](dir);
  console.log(`done ${TAG} ${name} ${new Date().toISOString()}`);
}
console.log(`pids ${[...pids].join(',')} alive-after: ${[...pids].filter(alive).join(',') || 'none'}`);
