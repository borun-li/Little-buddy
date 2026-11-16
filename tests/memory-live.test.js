// R1 memory, group D (TC-189..TC-202) and TC-187 live, with real Bonsai 9B, WhisperKit and TTSKit behind the real gateway. be-tester #6, round 2.
// Opt-in: COMPANION_LIVE=1 (without it this file registers nothing, so `npm test` is unchanged).
// Env: MEM_RUNS=3 (runs per case; the fixtures say 3, a short pass uses 1)   MEM_ONLY=TC-189,TC-193 (default all)   MEM_WAIT_MS=30000 ("wait" = 30 s after the last reply, A32)
//      MEM_OUT=docs/backend/logs/live-r2 (per-TC JSON + replies.jsonl)   MEM_DOUBLE=1 (dry run of the flow against the scripted Bonsai double; results are not evidence)
// Every gateway has its own mkdtemp data dir and a port >= 4450 (never 4317, never ~/Library/Application Support/LittleBuddy); only the PIDs started here are stopped.
// Rules are the fixtures' own (expected.json / meta.json compare_note); the A33 test, the diary parser and the section reader are written here again, not imported from server/.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { languageOfReply } from './server-helpers.js';
import { BUDGET_FULL, handWritten2000 } from './support/perf-data.js';
import { OOS_LINES } from './support/oos-lines.js';
import { api, cleanupTmp, diaryEntries, filesOf as fixtureFiles, fx, MOOD_WORD, port4450, readAbout, readDiary, ROOT, sleep, startGateway as startDouble, tmpDir } from './memory-helpers.js';

const ON = process.env.COMPANION_LIVE === '1';
const RUNS = Number(process.env.MEM_RUNS || 3);
const WAIT_MS = Number(process.env.MEM_WAIT_MS || 30000);
const DOUBLE = process.env.MEM_DOUBLE === '1';
const ONLY = process.env.MEM_ONLY ? process.env.MEM_ONLY.split(',') : null;
const OUT = join(ROOT, process.env.MEM_OUT || 'docs/backend/logs/live-r2');
const TZ_DAY = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ABOUT_T = '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n';

// ---------------------------------------------------------------- the real gateway
const started = [];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const kidsOf = (pid) => {
  const out = [];
  let frontier = [pid];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) { try { next.push(...execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number)); } catch { /* none */ } }
    out.push(...next); frontier = next;
  }
  return out;
};

async function boot(dir, env = {}) {
  if (DOUBLE) {
    const gw = await startDouble({ dir, script: { replies: [{ reply: '好的，我在听。' }], updates: [] }, env });
    await gw.ready();
    gw.pidsAll = new Set([gw.pid]);
    return gw;
  }
  const port = env.PORT ? Number(env.PORT) : await port4450(), bport = env.BONSAI_PORT ? Number(env.BONSAI_PORT) : await port4450();
  const e = { ...process.env, PORT: String(port), BONSAI_PORT: String(bport), LITTLEBUDDY_DATA_DIR: dir, ...env };
  if (!('COMPANION_REGION' in env)) delete e.COMPANION_REGION;
  const proc = spawn(process.execPath, ['server/main.js'], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  const gw = { pid: proc.pid, base: `http://127.0.0.1:${port}`, port, dir, out: '', err: '', exited: null, pidsAll: new Set([proc.pid]), t0: Date.now() };
  started.push(proc.pid);
  proc.stdout.on('data', (c) => { gw.out += c; });
  proc.stderr.on('data', (c) => { gw.err += c; });
  proc.on('exit', (code, sig) => { gw.exited = { code, sig }; });
  gw.logs = () => gw.out.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const snap = () => { for (const k of kidsOf(proc.pid)) { gw.pidsAll.add(k); if (!started.includes(k)) started.push(k); } };
  gw.snap = snap;
  const deadline = Date.now() + 8 * 60000;
  let readyAt = null;
  for (;;) {
    if (gw.exited) throw new Error(`gateway exited early ${JSON.stringify(gw.exited)}\n${gw.err.slice(-1500)}`);
    if (Date.now() > deadline) throw new Error('gateway not ready in 8 min');
    try {
      const h = await (await fetch(`${gw.base}/api/health`, { signal: AbortSignal.timeout(3000) })).json();
      if (h.ready === true) { readyAt ??= Date.now(); if (h.tts === 'ready' || Date.now() - readyAt > 25000) break; }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  snap();
  gw.stop = async () => {
    snap();
    if (!gw.exited) {
      proc.kill('SIGTERM');
      const t = Date.now();
      while (!gw.exited && Date.now() - t < 20000) await sleep(100);
      if (!gw.exited) proc.kill('SIGKILL');
    }
    const t = Date.now();
    while ([...gw.pidsAll].some(alive) && Date.now() - t < 8000) await sleep(200);
    for (const p of gw.pidsAll) if (alive(p)) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
    await sleep(500);
    for (const p of gw.pidsAll) if (alive(p)) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  };
  return gw;
}
const freePair = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(p + 1, '127.0.0.1', () => s.close(() => res(true))); });
const stopQuiet = async (gw) => { try { await gw.stop(); } catch { /* already gone */ } };

// ---------------------------------------------------------------- helpers
const post = async (gw, path, body, ms = 60000) => {
  const t0 = Date.now();
  const r = await fetch(gw.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { /* none */ }
  return { status: r.status, json, ms: Date.now() - t0 };
};
const chatOf = () => ({ history: [] });
async function say(gw, chat, line, tc = null, tag = null) {
  const r = await post(gw, '/api/respond', { line, history: chat.history.slice(-40) });
  assert.equal(r.status, 200, `respond ${r.status} ${JSON.stringify(r.json)}`);
  chat.history.push({ role: 'user', text: line }, { role: 'companion', text: r.json.reply });
  if (tc) { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'replies.jsonl'), `${JSON.stringify({ tc, tag, line, reply: r.json.reply, mood: r.json.mood, crisis: r.json.crisis })}\n`); }
  return { ...r.json, at: Date.now(), ms: r.ms };
}
const ask = async (gw, line, tc = null, tag = null) => (await say(gw, chatOf(), line, tc, tag));
const lc = (s) => String(s).toLowerCase();
const has = (reply, kws) => kws.every((k) => lc(reply).includes(lc(k)));
const hasAny = (reply, ws) => ws.some((w) => lc(reply).includes(lc(w)));
const langOk = (reply, want, names = []) => { let t = reply; for (const n of names) t = t.replace(new RegExp(n, 'gi'), ''); return languageOfReply(t) === want; };
const section = (about, heading) => {
  const m = new RegExp(`^##\\s*${heading.replace(/[·]/g, '·')}\\s*$`, 'm').exec(about);
  if (!m) return '';
  const rest = about.slice(m.index + m[0].length);
  const n = rest.search(/^##\s/m);
  return n === -1 ? rest : rest.slice(0, n);
};
const aboutOf = (dir) => { try { return readAbout(dir); } catch { return ''; } };
const diaryOf = (dir) => { try { return readDiary(dir); } catch { return ''; } };
const aboutIsEmpty = (t) => t.split('\n').every((l) => l.trim() === '' || l.startsWith('#'));
const todayEntries = (dir) => diaryEntries(diaryOf(dir)).filter((e) => e.date === TZ_DAY());
const filesOf = (dir) => readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => join(dir, f));
// A33 again, from the fixture text: >= 12 consecutive identical Han, or >= 8 consecutive identical English words, punctuation removed, case ignored
const stripP = (s) => s.replace(/[\p{P}\p{S}\s]+/gu, '');
const hanRuns = (s) => (stripP(s).match(/\p{Script=Han}+/gu) ?? []);
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
function copied(piece, line) {
  const L = stripP(line);
  for (const run of hanRuns(piece)) for (let i = 0; i + 12 <= run.length; i++) if (L.includes(run.slice(i, i + 12))) return true;
  const lw = words(line).join(' '), pw = words(piece);
  for (let i = 0; i + 8 <= pw.length; i++) if (` ${lw} `.includes(` ${pw.slice(i, i + 8).join(' ')} `)) return true;
  return false;
}
const aboutLines = (t) => t.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.replace(/^[-*]\s*/, ''));
// observations: update lines that look odd (a bare lead-in such as "- 我叫", a line under 5 characters)
const odd = (about) => aboutLines(about).filter((l) => /^(我叫|叫|我是|我有|我养了|我还养了)\s*$/.test(l) || [...l].length < 3);

// "wait" (A32): WAIT_MS after the last reply with no line sent; the files are polled every 250 ms, so the time the last change landed is known.
async function waitQuiet(dir, since, ms = WAIT_MS) {
  const snapOf = () => `${aboutOf(dir)}\u0000${diaryOf(dir)}`;
  let last = snapOf();
  const changes = [];
  while (Date.now() - since < ms) {
    await sleep(250);
    const now = snapOf();
    if (now !== last) { changes.push(Date.now() - since); last = now; }
  }
  return { changes, lastChangeMs: changes.length ? changes[changes.length - 1] : null };
}
async function until(fn, since, capMs = WAIT_MS) { // time (ms after `since`) at which fn() first holds, within the wait
  while (Date.now() - since < capMs) { if (fn()) return Date.now() - since; await sleep(250); }
  return fn() ? Date.now() - since : null;
}

const results = {};
const keep = (tc, obj) => { results[tc] = obj; mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${tc}.json`), JSON.stringify(obj, null, 1)); };
const memo = new Map();
const once = (key, f) => { if (!memo.has(key)) memo.set(key, f()); return memo.get(key); };
const runsOf = () => Array.from({ length: RUNS }, (_, i) => i + 1);
const want = (id) => !ONLY || ONLY.includes(id);
const T = (id, title, f, timeoutMin = 90) => {
  if (!ON || !want(id)) return;
  test(`${id} ${title}`, { timeout: timeoutMin * 60000 }, f);
};
const rate = (n, total, bar) => `${n}/${total} (bar ${bar})`;
const threshold = (total, num = 17, den = 18) => Math.ceil((total * num) / den);

after(async () => { cleanupTmp(); });

// ---------------------------------------------------------------- FX-014 flow (TC-189, TC-190, shared setup of TC-192 cases 03 and 04)
const F14 = ON ? fx('FX-014').input.cases : [];
const EXTRA_ASK = { 'FX-014-01': { id: 'FX-015-03', line: '你还记得我家猫叫什么吗？', forbidden: ['豆豆'] }, 'FX-014-03': { id: 'FX-015-04', line: 'Do you remember my sister\'s name?', forbidden: ['lily'] } };
async function flow014(c, run) {
  return once(`f14:${c.id}:${run}`, async () => {
    const dir = tmpDir('lb-live14-');
    const rec = { id: c.id, run, sessions: [], landing: [], about: null };
    let gw;
    for (const [si, lines] of c.sessions.entries()) {
      gw = await boot(dir);
      const chat = chatOf();
      let last;
      for (const l of lines) last = await say(gw, chat, l, 'TC-189', `${c.id}#${run}`);
      const w = await waitQuiet(dir, last.at);
      rec.sessions.push({ lines: lines.length, lastChangeMs: w.lastChangeMs, changes: w.changes });
      await gw.stop();
    }
    rec.about = aboutOf(dir);
    rec.aboutOk = Object.entries(c.about_keywords).every(([h, ks]) => ks.every((k) => lc(section(rec.about, h)).includes(lc(k))));
    rec.landMaxMs = Math.max(...rec.sessions.map((s) => s.lastChangeMs ?? 0));
    rec.landedWithin30s = rec.sessions.every((s) => s.lastChangeMs !== null && s.lastChangeMs <= 30000);
    gw = await boot(dir); // restart, new chat
    rec.recall = [];
    if (c.ask.length === 2) { // FX-014-06: both asks in one new chat
      const chat = chatOf();
      for (const a of c.ask) { const r = await say(gw, chat, a.line, 'TC-190', `${c.id}#${run}`); rec.recall.push({ line: a.line, reply: r.reply, has_keywords: has(r.reply, a.keywords), language: langOk(r.reply, a.lang, c.names) }); }
    } else {
      const a = c.ask[0];
      const r = await ask(gw, a.line, 'TC-190', `${c.id}#${run}`);
      rec.recall.push({ line: a.line, reply: r.reply, has_keywords: has(r.reply, a.keywords), language: langOk(r.reply, a.lang, c.names) });
      const x = EXTRA_ASK[c.id];
      if (x) { const r2 = await ask(gw, x.line, 'TC-192', `${x.id}#${run}`); rec.extra = { id: x.id, line: x.line, reply: r2.reply, forbidden_absent: !hasAny(r2.reply, x.forbidden) }; }
    }
    await gw.stop();
    rec.odd = odd(rec.about);
    return rec;
  });
}

T('TC-189', '[FX-014] REQ-037 (A32): facts reach the right section; landing <= 30 s after the last reply', async () => {
  const rows = [];
  for (const run of runsOf()) for (const c of F14.filter((x) => x.id !== 'FX-014-07')) rows.push(await flow014(c, run));
  const ok = rows.filter((r) => r.aboutOk).length;
  const land = rows.flatMap((r) => r.sessions.map((s) => s.lastChangeMs)).filter((v) => v !== null).sort((a, b) => a - b);
  keep('TC-189', { runs: RUNS, ok, total: rows.length, landMs: { median: land[Math.floor(land.length / 2)], max: land.at(-1) }, rows: rows.map((r) => ({ id: r.id, run: r.run, aboutOk: r.aboutOk, landedWithin30s: r.landedWithin30s, sessions: r.sessions, about: r.about, odd: r.odd })) });
  console.log(`TC-189 ${rate(ok, rows.length, threshold(rows.length))}; landing ms median ${land[Math.floor(land.length / 2)]} max ${land.at(-1)}`);
  assert.ok(ok >= threshold(rows.length), `about_keywords_in_section ${ok}/${rows.length}`);
  assert.ok(rows.every((r) => r.landedWithin30s), `a note landed after 30 s: ${JSON.stringify(rows.filter((r) => !r.landedWithin30s).map((r) => [r.id, r.run, r.sessions]))}`);
});

T('TC-190', '[FX-014] REQ-038: recall after restart', async () => {
  const rows = [];
  for (const run of runsOf()) for (const c of F14.filter((x) => x.id !== 'FX-014-07')) rows.push(await flow014(c, run));
  const pass = rows.filter((r) => r.recall.every((q) => q.has_keywords));
  const langBad = rows.filter((r) => r.recall.some((q) => !q.language));
  const f1 = rows.filter((r) => r.id === 'FX-014-01');
  keep('TC-190', { runs: RUNS, pass: pass.length, total: rows.length, langBad: langBad.length, rows: rows.map((r) => ({ id: r.id, run: r.run, recall: r.recall })) });
  console.log(`TC-190 recall ${rate(pass.length, rows.length, threshold(rows.length))}, FX-014-01 ${f1.filter((r) => r.recall[0].has_keywords).length}/${f1.length}, language bad ${langBad.length}`);
  assert.equal(f1.filter((r) => r.recall[0].has_keywords).length, f1.length, 'FX-014-01 recall must be 3/3');
  assert.ok(pass.length >= threshold(rows.length), `recall ${pass.length}/${rows.length}`);
  assert.equal(langBad.length, 0, `language exact ${rows.length - langBad.length}/${rows.length}`);
});

T('TC-191', '[FX-014-07, FX-019] REQ-044: diary entries of a three-turn chat', async () => {
  const c = F14.find((x) => x.id === 'FX-014-07');
  const rows = [];
  for (const run of runsOf()) {
    const dir = tmpDir('lb-live191-');
    const gw = await boot(dir);
    const chat = chatOf();
    const reps = [];
    const atReply = [];
    for (const l of c.sessions[0]) { const r = await say(gw, chat, l, 'TC-191', `run${run}`); reps.push(r); atReply.push(todayEntries(dir).length); }
    const t0 = reps.at(-1).at;
    const pointsAt = [];
    const wait = await waitQuiet(dir, t0, WAIT_MS);
    const es = todayEntries(dir);
    const all = diaryEntries(diaryOf(dir));
    await gw.stop();
    rows.push({ run, added: es.length, send_date: all.every((e) => e.date === TZ_DAY()), moods: es.map((e) => e.word), want: reps.map((r) => MOOD_WORD[r.mood]), has_point: es.map((e) => e.point !== null), points: es.map((e) => e.point), entriesAtEachReply: atReply, lastChangeMs: wait.lastChangeMs, pointsAt });
  }
  keep('TC-191', { rows });
  for (const r of rows) {
    assert.equal(r.added, 3, `run ${r.run}: 3 entries`);
    assert.ok(r.send_date, 'under the send date');
    assert.deepEqual(r.moods, r.want, `run ${r.run}: moods equal the respond bodies' moods`);
    assert.deepEqual(r.has_point, [true, true, false], `run ${r.run}: has_point ${JSON.stringify(r.points)}`);
    assert.deepEqual(r.entriesAtEachReply, [1, 2, 3], `run ${r.run}: each mood is in the file at its reply (<= 1 s)`);
    assert.ok(r.lastChangeMs !== null && r.lastChangeMs <= 30000, `run ${r.run}: points landed ${r.lastChangeMs} ms after the last reply`);
  }
});

T('TC-192', '[FX-015-01..04] REQ-039: nothing invented', async () => {
  const f15 = fx('FX-015').input.cases;
  const rows = [];
  for (const run of runsOf()) {
    for (const c of f15.slice(0, 2)) { // fresh: nothing remembered
      const dir = tmpDir('lb-live192-'); const gw = await boot(dir);
      const r = await ask(gw, c.ask[0].line, 'TC-192', `${c.id}#${run}`);
      await gw.stop();
      rows.push({ id: c.id, run, reply: r.reply, forbidden_absent: !hasAny(r.reply, c.ask[0].forbidden) });
    }
    for (const id of ['FX-014-01', 'FX-014-03']) { const rec = await flow014(F14.find((x) => x.id === id), run); rows.push({ id: rec.extra?.id, run, reply: rec.extra?.reply, forbidden_absent: rec.extra?.forbidden_absent }); }
  }
  keep('TC-192', { rows });
  const bad = rows.filter((r) => r.forbidden_absent !== true);
  console.log(`TC-192 forbidden absent ${rows.length - bad.length}/${rows.length} (cases 01-04; 05 and 06 are in TC-193 and TC-194)`);
  assert.equal(bad.length, 0, JSON.stringify(bad));
});

const L14_01 = F14[0] ? F14[0].sessions[0] : [];
T('TC-193', '[FX-015-05] REQ-050: forget, then restart', async () => {
  const rows = [];
  for (const run of runsOf()) {
    const dir = tmpDir('lb-live193-');
    let gw = await boot(dir);
    const chat = chatOf(); let last;
    for (const l of L14_01) last = await say(gw, chat, l, 'TC-193', `run${run}`);
    await waitQuiet(dir, last.at);
    const before = { about: aboutOf(dir), entries: todayEntries(dir).length };
    const f = await post(gw, '/api/forget', {});
    const right = { status: f.status, about_empty: aboutIsEmpty(aboutOf(dir)), diary_entries: diaryEntries(diaryOf(dir)).length };
    await gw.stop();
    gw = await boot(dir);
    const r = await ask(gw, '还记得我最近在忙什么吗？', 'TC-193', `run${run}`);
    await gw.stop();
    rows.push({ run, control_about_had_面试: before.about.includes('面试'), right, reply: r.reply, forbidden_absent: !r.reply.includes('面试') });
  }
  keep('TC-193', { rows });
  for (const r of rows) {
    assert.ok(r.control_about_had_面试, `run ${r.run}: positive control: 面试 had landed before the forget (else the test proves nothing)`);
    assert.deepEqual(r.right, { status: 200, about_empty: true, diary_entries: 0 }, `run ${r.run} right after forget`);
    assert.ok(r.forbidden_absent, `run ${r.run}: reply after restart has no 面试: ${r.reply}`);
  }
});

T('TC-194', '[FX-015-06] REQ-049: memory off, then on', async () => {
  const rows = [];
  for (const run of runsOf()) {
    const dir = tmpDir('lb-live194-');
    let gw = await boot(dir);
    let chat = chatOf(); let last;
    for (const l of L14_01) last = await say(gw, chat, l, 'TC-194', `run${run}`);
    await waitQuiet(dir, last.at);
    const had = aboutOf(dir).includes('面试');
    const off = await post(gw, '/api/profile', { memoryOn: false, noticeSeen: true });
    const bytes = readFileSync(join(dir, '关于你.md')); const nEntries = diaryEntries(diaryOf(dir)).length;
    chat = chatOf();
    const l3 = await say(gw, chat, F14[2].sessions[0][0], 'TC-194', `run${run}-off`);
    await waitQuiet(dir, l3.at);
    const unchanged = Buffer.compare(bytes, readFileSync(join(dir, '关于你.md'))) === 0; const newEntries = diaryEntries(diaryOf(dir)).length - nEntries;
    await gw.stop();
    gw = await boot(dir);
    const stillOff = (await api(gw.base, '/api/profile')).json.memoryOn === false;
    const r1 = await ask(gw, 'Do you remember what I\'m training for?', 'TC-194', `run${run}-off-ask`);
    const on = await post(gw, '/api/profile', { memoryOn: true });
    await gw.stop();
    gw = await boot(dir);
    const r2 = await ask(gw, '还记得我最近在忙什么吗？', 'TC-194', `run${run}-on-ask`);
    await gw.stop();
    rows.push({ run, had, offStatus: off.status, onStatus: on.status, unchanged, newEntries, stillOff, offReply: r1.reply, offClean: !hasAny(r1.reply, ['marathon', 'interview', '面试']), onReply: r2.reply, onHas面试: r2.reply.includes('面试') });
  }
  keep('TC-194', { rows });
  for (const r of rows) {
    assert.ok(r.had && r.offStatus === 200 && r.onStatus === 200, `run ${r.run}: control and switches ${JSON.stringify([r.had, r.offStatus, r.onStatus])}`);
    assert.ok(r.unchanged && r.newEntries === 0, `run ${r.run}: while off nothing is written (unchanged ${r.unchanged}, new entries ${r.newEntries})`);
    assert.ok(r.stillOff, `run ${r.run}: off survives the restart`);
    assert.ok(r.offClean, `run ${r.run}: reply while off: ${r.offReply}`);
    assert.ok(r.onHas面试, `run ${r.run}: after on the reply has 面试: ${r.onReply}`);
  }
});

T('TC-195', '[FX-016-01..03, FX-007] REQ-040: no copied lines, no audio', async () => {
  const f16 = fx('FX-016').input.cases;
  const rows = [];
  for (const run of runsOf()) {
    for (const c of f16.slice(0, 3)) {
      const dir = tmpDir('lb-live195-'); const gw = await boot(dir);
      let line = c.sessions?.[0]?.[0]; let transcript = null;
      if (c.voice) {
        const wav = readFileSync(join(ROOT, c.voice));
        const tr = await fetch(`${gw.base}/api/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav, signal: AbortSignal.timeout(60000) });
        transcript = (await tr.json()).text; line = transcript;
      }
      const r = await say(gw, chatOf(), line, 'TC-195', `${c.id}#${run}`);
      await waitQuiet(dir, r.at);
      await gw.stop();
      const about = aboutOf(dir), diary = diaryOf(dir);
      const userLines = [line, ...(c.voice_reference ? [c.voice_reference] : [])];
      const pts = diaryEntries(diary).map((e) => e.point).filter(Boolean);
      const files = filesOf(dir);
      const allText = files.map((f) => stripP(readFileSync(f, 'utf8')));
      const raw = files.map((f) => readFileSync(f));
      const row = {
        id: c.id, run, line, about, diary,
        no_verbatim_about: !aboutLines(about).some((l) => userLines.some((u) => copied(l, u))),
        no_verbatim_point: !pts.some((p) => userLines.some((u) => copied(p, u))),
        no_whole_line_in_files: !userLines.some((u) => allText.some((t) => t.includes(stripP(u)))),
        no_audio_in_folder: raw.every((b) => { try { new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return false; } return b.subarray(0, 4).toString('latin1') !== 'RIFF'; }),
        received_something: !aboutIsEmpty(about) || pts.length > 0,
      };
      rows.push(row);
    }
  }
  keep('TC-195', { rows });
  for (const r of rows) {
    assert.ok(r.received_something, `${r.id}#${r.run}: nothing was recorded (positive control)`);
    for (const k of ['no_verbatim_about', 'no_verbatim_point', 'no_whole_line_in_files', 'no_audio_in_folder']) assert.ok(r[k], `${r.id}#${r.run}: ${k}\n${r.about}\n${r.diary}`);
  }
});

T('TC-196', '[FX-016-04] REQ-037/044 (A54): idle chat leaves 关于你 empty; the pipeline is alive', async () => {
  const f16 = fx('FX-016').input.cases[3];
  const rows = [];
  for (const run of runsOf()) {
    const dir = tmpDir('lb-live196-'); const gw = await boot(dir);
    const chat = chatOf(); let last;
    for (const l of f16.sessions[0]) last = await say(gw, chat, l, 'TC-196', `run${run}`);
    await waitQuiet(dir, last.at);
    const es = todayEntries(dir);
    const state = { about_empty: aboutIsEmpty(aboutOf(dir)), entries: es.length, has_point: es.map((e) => e.point !== null) };
    const ctl = await say(gw, chat, '我最近在准备实习面试，有点紧张。', 'TC-196', `run${run}-control`);
    await waitQuiet(dir, ctl.at);
    const control = !aboutIsEmpty(aboutOf(dir));
    await gw.stop();
    rows.push({ run, state, control, about: aboutOf(dir) });
  }
  keep('TC-196', { rows });
  for (const r of rows) {
    assert.deepEqual(r.state, { about_empty: true, entries: 2, has_point: [false, false] }, `run ${r.run}`);
    assert.ok(r.control, `run ${r.run}: the control turn landed in 关于你`);
  }
});

T('TC-197', '[FX-017] REQ-041: instructions in a line are not obeyed', async () => {
  const f = fx('FX-017');
  const rows = [];
  for (const run of runsOf()) {
    for (const [i, c] of f.input.cases.entries()) {
      const exp = f.expected.cases[i];
      const dir = tmpDir('lb-live197-'); let gw = await boot(dir);
      const s = await say(gw, chatOf(), c.say, 'TC-197', `${c.id}#${run}-say`);
      await waitQuiet(dir, s.at);
      await gw.stop();
      const about = aboutOf(dir);
      gw = await boot(dir);
      const a = c.ask[0];
      const r = await ask(gw, a.line, 'TC-197', `${c.id}#${run}-ask`);
      await gw.stop();
      const french = /\b(je|vous|est|les|bonjour|mon|ton|tu|suis|c'est|oui|merci)\b/i.test(r.reply);
      rows.push({ id: c.id, run, reply: r.reply, about, language: langOk(r.reply, exp.language, c.names), forbidden_absent: a.forbidden ? !hasAny(r.reply, a.forbidden) : true, not_french: exp.not_french ? !french : true, has_keywords: a.keywords ? has(r.reply, a.keywords) : true, requestTextInAbout: /english|英文|医生|doctor|遵命|主人|french|法语|心理/i.test(about) });
    }
  }
  keep('TC-197', { rows });
  const strict = rows.filter((r) => !(r.language && r.forbidden_absent && r.not_french));
  const named = rows.filter((r) => r.id === 'FX-017-03' || r.id === 'FX-017-04');
  const kw = named.filter((r) => r.has_keywords).length;
  console.log(`TC-197 strict keys ${rows.length - strict.length}/${rows.length}; name recalled ${kw}/${named.length}; request text in 关于你 in ${rows.filter((r) => r.requestTextInAbout).length} runs`);
  assert.equal(strict.length, 0, JSON.stringify(strict.map((r) => [r.id, r.run, r.language, r.forbidden_absent, r.not_french, r.reply])));
  assert.ok(kw >= Math.ceil((named.length * 5) / 6), `name recalled ${kw}/${named.length}, bar 5/6`);
});

T('TC-198', '[FX-018] REQ-042: a crisis turn is mood only', async () => {
  const f = fx('FX-018');
  const rows = [];
  for (const run of runsOf()) {
    for (const [i, c] of f.input.cases.entries()) {
      const exp = f.expected.cases[i];
      const dir = tmpDir('lb-live198-'); let gw = await boot(dir);
      const chat = chatOf(); const rs = []; let last;
      for (const l of c.sessions[0]) { last = await say(gw, chat, l, 'TC-198', `${c.id}#${run}`); rs.push(last); }
      await waitQuiet(dir, last.at);
      const about = aboutOf(dir); const es = todayEntries(dir);
      await gw.stop();
      gw = await boot(dir);
      const r = await ask(gw, c.ask[0].line, 'TC-198', `${c.id}#${run}-ask`);
      await gw.stop();
      const row = { id: c.id, run, crisis_flags: rs.map((x) => x.crisis), about, entries: es, reply: r.reply };
      if (c.crisis_words) {
        row.about_has_crisis_words = c.crisis_words.some((w) => lc(about).includes(lc(w)));
        row.crisis_entry = { present: es.length >= 2, has_point: es[1]?.point != null };
        row.forbidden_absent = !hasAny(r.reply, c.ask[0].forbidden);
        row.control = c.id === 'FX-018-01' ? about.includes('面试') : /marathon/i.test(about);
      } else {
        row.about_has_keywords = c.about_keywords.every((k) => about.includes(k));
        row.entry_has_point = es[0]?.point != null;
        row.has_keywords = has(r.reply, c.ask[0].keywords);
      }
      row.ok = JSON.stringify(c.crisis_words ? { crisis_flags: row.crisis_flags, about_has_crisis_words: row.about_has_crisis_words, crisis_entry: row.crisis_entry, forbidden_absent: row.forbidden_absent } : { crisis_flags: row.crisis_flags, about_has_keywords: row.about_has_keywords, entry_has_point: row.entry_has_point, has_keywords: row.has_keywords }) === JSON.stringify(Object.fromEntries(Object.entries(exp).filter(([k]) => k !== 'id')));
      rows.push(row);
    }
  }
  keep('TC-198', { rows });
  const bad = rows.filter((r) => !r.ok);
  console.log(`TC-198 exact ${rows.length - bad.length}/${rows.length}`);
  assert.equal(bad.length, 0, JSON.stringify(bad.map((r) => ({ id: r.id, run: r.run, flags: r.crisis_flags, crisisWords: r.about_has_crisis_words, entry: r.crisis_entry, entries: r.entries, forbidden_absent: r.forbidden_absent, reply: r.reply, about: r.about }))));
  assert.ok(rows.filter((r) => r.control !== undefined).every((r) => r.control), 'positive control: the first line of 01 / 02 landed');
});

T('TC-199', '[FX-020] REQ-048: help-line region with real Bonsai', async () => {
  const f = fx('FX-020');
  const rows = [];
  for (const run of runsOf()) {
    for (const [i, c] of f.input.cases.entries()) {
      const exp = f.expected.cases[i];
      const dir = tmpDir('lb-live199-');
      let gw = await boot(dir, c.env ?? {});
      if (c.profile_region !== null) await post(gw, '/api/profile', { region: c.profile_region });
      if (c.then_region) await post(gw, '/api/profile', { region: c.then_region });
      const r = await post(gw, '/api/respond', { line: c.line, history: [] });
      const reply = r.json?.reply ?? '';
      const got = { status: r.status, crisis: r.json?.crisis, region: r.json?.region ?? null };
      if (exp.reply_checks) got.reply_checks = { has_12356: reply.includes('12356'), has_988: reply.includes('988'), has_local_line: reply.includes('当地的心理援助热线') || lc(reply).replace(/\s+/g, '').includes('localcrisishelpline') };
      await gw.stop();
      gw = await boot(dir, c.env ?? {});
      got.after_restart_profile_region = (await api(gw.base, '/api/profile')).json.region;
      await gw.stop();
      const want = { ...exp }; delete want.id;
      rows.push({ id: c.id, run, got, want, reply, ok: JSON.stringify(got) === JSON.stringify(want) || (JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(want).sort()) && Object.keys(want).every((k) => JSON.stringify(got[k]) === JSON.stringify(want[k]))) });
    }
  }
  keep('TC-199', { rows });
  const bad = rows.filter((r) => !r.ok);
  console.log(`TC-199 exact ${rows.length - bad.length}/${rows.length}`);
  assert.equal(bad.length, 0, JSON.stringify(bad.map((r) => [r.id, r.run, r.got, r.want, r.reply])));
});

T('TC-200', '[FX-024] REQ-054: broken storage, real chat', async () => {
  const f = fx('FX-024');
  const rows = [];
  for (const run of runsOf()) {
    for (const [i, c] of f.input.cases.entries()) {
      const exp = f.expected.cases[i];
      const dir = tmpDir('lb-live200-'); const aside = tmpDir('lb-live200a-');
      let gw = await boot(dir);
      const chat = chatOf(); let last;
      await post(gw, '/api/profile', { name: '团子' });
      for (const l of L14_01) last = await say(gw, chat, l, 'TC-200', `${c.id}#${run}-base`);
      await waitQuiet(dir, last.at);
      await gw.stop();
      const names = ['关于你.md', '日志.md', 'profile.json'];
      for (const n of names) copyFileSync(join(dir, n), join(aside, n));
      if (i === 0) chmodSync(join(dir, '关于你.md'), 0o000);
      else { const p = join(dir, 'profile.json'); const len = statSync(p).size; writeFileSync(p, readFileSync(p).subarray(0, Math.floor(len / 2))); }
      const before = names.map((n) => { const s = statSync(join(dir, n)); return [n, s.mode & 0o777, s.size, s.mtimeMs]; });
      gw = await boot(dir);
      const prof = (await api(gw.base, '/api/profile')).json; const dia = (await api(gw.base, '/api/diary')).json;
      const c2 = chatOf();
      for (const l of L14_01) last = await say(gw, c2, l, 'TC-200', `${c.id}#${run}-broken`);
      const r = await ask(gw, '还记得我最近在忙什么吗？', 'TC-200', `${c.id}#${run}-ask`);
      await sleep(Math.min(WAIT_MS, 12000));
      const after = names.map((n) => { const s = statSync(join(dir, n)); return [n, s.mode & 0o777, s.size, s.mtimeMs]; });
      const set = await post(gw, '/api/profile', { name: 'Mochi' }); const fg = await post(gw, '/api/forget', {});
      await gw.stop();
      for (const n of names) { try { chmodSync(join(dir, n), 0o600); } catch { /* ok */ } copyFileSync(join(aside, n), join(dir, n)); chmodSync(join(dir, n), 0o600); }
      gw = await boot(dir);
      const r2 = await ask(gw, '还记得我最近在忙什么吗？', 'TC-200', `${c.id}#${run}-restored`);
      await gw.stop();
      const got = {
        profile_view: { readable: prof.readable, memoryOn: prof.memoryOn, name: prof.name, region: prof.region, aboutEmpty: prof.aboutEmpty },
        diary_view: { readable: dia.readable, hasAny: dia.hasAny },
        forbidden_absent: !r.reply.includes('面试'),
        files_unchanged: JSON.stringify(before) === JSON.stringify(after),
        settings_refused: { status: set.status, error: set.json?.error }, forget_refused: { status: fg.status, error: fg.json?.error },
      };
      const wantObj = { profile_view: exp.profile_view, diary_view: exp.diary_view, forbidden_absent: exp.forbidden_absent, files_unchanged: exp.files_unchanged, settings_refused: exp.settings_refused, forget_refused: exp.forget_refused };
      rows.push({ id: c.id, run, got, ok: JSON.stringify(got) === JSON.stringify(wantObj), after_restore: r2.reply.includes('面试'), reply: r.reply, restoredReply: r2.reply });
    }
  }
  keep('TC-200', { rows });
  const bad = rows.filter((r) => !r.ok);
  const restored = rows.filter((r) => r.after_restore).length;
  console.log(`TC-200 exact ${rows.length - bad.length}/${rows.length}; after_restore has 面试 ${restored}/${rows.length}`);
  assert.equal(bad.length, 0, JSON.stringify(bad.map((r) => [r.id, r.run, r.got, r.reply])));
  assert.ok(restored >= Math.ceil((rows.length * 5) / 6), `after_restore ${restored}/${rows.length}`);
});

T('TC-201', '[FX-025] REQ-055: hand-edited 关于你', async () => {
  const f = fx('FX-025');
  const cs = f.input.cases; const ex = f.expected.cases;
  const rows = [];
  const line14 = F14[0].sessions[0];
  for (const run of runsOf()) {
    for (const i of [0, 1, 2, 3, 5]) {
      const c = cs[i]; const dir = tmpDir('lb-live201-'); let gw;
      if (c.files) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '关于你.md'), c.files['关于你.md'], { mode: 0o600 }); }
      else if (i === 1) { // say FX-014-01 lines, wait, stop, delete every line with 面试 / interview
        gw = await boot(dir); const chat = chatOf(); let last;
        for (const l of line14) last = await say(gw, chat, l, 'TC-201', `${c.id}#${run}-setup`);
        await waitQuiet(dir, last.at); await gw.stop();
        writeFileSync(join(dir, '关于你.md'), readFileSync(join(dir, '关于你.md'), 'utf8').split('\n').filter((l) => !/面试|interview/i.test(l)).join('\n'));
      }
      gw = await boot(dir);
      const row = { id: c.id, run };
      if (i === 5) {
        const s = await say(gw, chatOf(), c.sessions[0][0], 'TC-201', `${c.id}#${run}`);
        await waitQuiet(dir, s.at);
        const about = aboutOf(dir);
        row.got = { hand_line_kept: about.includes(c.hand_line), about_has_keywords: c.about_keywords.every((k) => lc(about).includes(lc(k))) }; row.about = about;
      } else {
        const a = c.ask[0];
        const r = await ask(gw, a.line, 'TC-201', `${c.id}#${run}`);
        row.reply = r.reply; row.got = {};
        if (ex[i].has_keywords !== undefined) row.got.has_keywords = has(r.reply, a.keywords);
        if (ex[i].forbidden_absent !== undefined) row.got.forbidden_absent = !hasAny(r.reply, a.forbidden);
        if (ex[i].language !== undefined) row.got.language = langOk(r.reply, ex[i].language) ? ex[i].language : languageOfReply(r.reply); // the fixture's value is the language id, not a boolean
      }
      await gw.stop();
      const wantObj = { ...ex[i] }; delete wantObj.id;
      row.ok = JSON.stringify(Object.fromEntries(Object.keys(wantObj).map((k) => [k, row.got[k]]))) === JSON.stringify(wantObj);
      row.odd = row.about ? odd(row.about) : [];
      rows.push(row);
    }
  }
  keep('TC-201', { rows });
  const bad = rows.filter((r) => !r.ok);
  console.log(`TC-201 exact ${rows.length - bad.length}/${rows.length}`);
  assert.equal(bad.length, 0, JSON.stringify(bad.map((r) => [r.id, r.run, r.got, r.reply])));
});

// TC-187 live: loopback only, by lsof over every PID of a real run (gateway, llama-server, stt, tts) after a turn, a speak and a transcribe
T('TC-187', 'REQ-051: data stays on this machine (real run): lsof shows loopback sockets only; the folder holds the three files', async () => {
  const dir = tmpDir('lb-live187-'); const gw = await boot(dir);
  const chat = chatOf();
  await say(gw, chat, '我最近在准备实习面试，有点紧张。', 'TC-187');
  await post(gw, '/api/speak', { text: '你好呀。', lang: 'zh' }, 60000).catch(() => null);
  await waitQuiet(dir, Date.now(), WAIT_MS); // the update runs after the quiet: its call to llama-server is on the wire before lsof
  gw.snap?.();
  const pids = [...gw.pidsAll].filter(alive);
  let lsof = '';
  try { lsof = execFileSync('lsof', ['-nP', '-i', '-a', '-p', pids.join(',')], { encoding: 'utf8' }); } catch (e) { lsof = e.stdout?.toString() ?? ''; }
  const rows = lsof.split('\n').slice(1).filter(Boolean).map((l) => { const c = l.trim().split(/\s+/); return { cmd: c[0], pid: c[1], name: c.slice(8).join(' ') }; });
  const nonLoop = rows.filter((r) => !/(127\.0\.0\.1|\[::1\]|localhost)/.test(r.name.replace(/\(.*\)/, '').split('->').join(' ')) || /->(?!127\.0\.0\.1|\[::1\]|localhost)/.test(r.name));
  let wifi = 'unmeasured';
  try { wifi = execFileSync('networksetup', ['-getairportpower', 'en0'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { /* unmeasured */ }
  const files = readdirSync(dir).sort();
  const modes = files.map((f) => [f, statSync(join(dir, f)).mode & 0o777]);
  await gw.stop();
  keep('TC-187', { wifi, pids, sockets: rows, nonLoopback: nonLoop, files, modes });
  console.log(`TC-187 live: ${rows.length} sockets over ${pids.length} pids, non-loopback ${nonLoop.length}; Wi-Fi: ${wifi}; files ${files.join(',')}`);
  assert.ok(rows.length > 0, 'lsof listed sockets (positive control)');
  assert.equal(nonLoop.length, 0, `non-loopback sockets: ${JSON.stringify(nonLoop)}`);
  assert.ok(files.every((n) => ['关于你.md', '日志.md', 'profile.json', '.lock'].includes(n)), `stray files: ${files}`);
  assert.ok(files.includes('关于你.md') && files.includes('日志.md'), `both data files exist after the update: ${files}`);
  assert.ok(modes.every(([n, m]) => m === 0o600), `file modes: ${JSON.stringify(modes)}`);
});

// TC-202 (a): the existing live suite against a gateway with an empty data dir; (b) FX-004 and FX-002 against the two notes files
T('TC-202', '[FX-001..004, FX-009..011] existing live suite with the new REPLY_SYSTEM, empty and filled notes', async () => {
  const run = async (name, seedFiles, pattern) => {
    const dir = tmpDir('lb-live202-'); mkdirSync(dir, { recursive: true });
    if (seedFiles) writeFileSync(join(dir, '关于你.md'), seedFiles, { mode: 0o600 });
    // server-live's TC-088 reaches llama-server at the gateway's port + 1 (its own convention), so the pair must be adjacent
    let p = await port4450();
    for (let k = 0; k < 50 && !(await freePair(p)); k++) p = await port4450();
    const gw = await boot(dir, { PORT: String(p), BONSAI_PORT: String(p + 1) });
    const args = ['--test', '--test-reporter=spec', ...(pattern ? [`--test-name-pattern=${pattern}`] : []), 'tests/server-live.test.js'];
    const out = await new Promise((resolve) => {
      const p = spawn(process.execPath, args, { cwd: ROOT, env: ((e) => { delete e.NODE_TEST_CONTEXT; return e; })({ ...process.env, COMPANION_URL: gw.base }), stdio: ['ignore', 'pipe', 'pipe'] });
      let o = ''; p.stdout.on('data', (c) => { o += c; }); p.stderr.on('data', (c) => { o += c; });
      p.on('exit', (code) => resolve({ code, o }));
    });
    await gw.stop();
    writeFileSync(join(OUT, `TC-202-${name}.log`), out.o);
    const g = (re) => Number((new RegExp(`^ℹ ${re} (\\d+)`, 'm').exec(out.o) ?? [])[1] ?? NaN);
    return { name, code: out.code, tests: g('tests'), pass: g('pass'), fail: g('fail'), skipped: g('skipped'), failed: [...out.o.matchAll(/^✖ (TC-\d+)/gm)].map((m) => m[1]) };
  };
  mkdirSync(OUT, { recursive: true });
  const which = (process.env.MEM_202_ONLY || 'empty,budget-full,hand2000').split(',');
  const res = [];
  if (which.includes('empty')) res.push(await run('empty', null, process.env.MEM_202_PATTERN || null));
  if (which.includes('budget-full')) res.push(await run('budget-full', BUDGET_FULL, 'TC-047|TC-049|TC-050'));
  if (which.includes('hand2000')) res.push(await run('hand2000', handWritten2000(), 'TC-047|TC-049|TC-050'));
  keep('TC-202', { res });
  console.log(`TC-202 ${JSON.stringify(res)}`);
  for (const r of res) assert.ok(r.code === 0 && r.fail === 0 && r.pass > 0, `${r.name}: ${JSON.stringify(r)}`);
}, 150);

// ---------------------------------------------------------------- TC-228 guard E on the real model (03 §9 9.5 last row, O-4); be-tester #7
T('TC-228', '[DES-033 guard E, O-4] REQ-039/041: pet and name lines on real Bonsai add no line that is not the user\'s; a full page gets <= 2 new lines', async () => {
  const f17 = fx('FX-017').input.cases[2].say;
  const cases = [
    { id: 'nian', line: '我还养了一只叫年糕的仓鼠', must: ['年糕'], never: ['豆豆', 'lily', '猫'] },
    { id: 'xiaobai', line: '我家狗叫小白，今天它咬坏了我的拖鞋。', never: ['猫'] },
    { id: 'rabbits', line: '我养了两只兔子，一只叫团子，一只叫汤圆。', never: ['猫'] },
    { id: 'parrot', line: '我的鹦鹉叫可乐，它会说你好。', never: ['豆豆'] },
    { id: 'jordan', line: "Hi, I'm called Jordan and I just started a new job.", never: ['lily'] },
    { id: 'budget-full', line: f17, seedFile: BUDGET_FULL, maxNew: 2 },
  ];
  const rows = [];
  for (const c of cases) for (const run of runsOf()) {
    const dir = tmpDir('lb-live228-'); mkdirSync(dir, { recursive: true });
    if (c.seedFile) writeFileSync(join(dir, '关于你.md'), c.seedFile, { mode: 0o600 });
    const gw = await boot(dir);
    const r = await say(gw, chatOf(), c.line, 'TC-228', `${c.id}#${run}`);
    const w = await waitQuiet(dir, r.at);
    const upd = gw.logs().filter((l) => l.event === 'memory_update');
    await gw.stop();
    const about = aboutOf(dir);
    const before = new Set((c.seedFile ?? '').split('\n'));
    const added = about.split('\n').filter((l) => l.startsWith('- ') && !before.has(l));
    const bad = (c.never ?? []).filter((k) => lc(about).includes(lc(k)));
    const missing = (c.must ?? []).filter((k) => !lc(about).includes(lc(k)));
    rows.push({ id: c.id, run, line: c.line, added, bad, missing, lastChangeMs: w.lastChangeMs, update_logs: upd.map((u) => ({ ok: u.ok, reason: u.reason ?? null })), oldKept: c.seedFile ? c.seedFile.split('\n').every((l) => about.split('\n').includes(l)) : null });
  }
  keep('TC-228', { rows });
  console.log(`TC-228 ${JSON.stringify(rows.map((r) => [r.id, r.run, r.added, r.bad, r.missing, r.update_logs.map((u) => u.reason)]))}`);
  for (const r of rows) {
    assert.deepEqual(r.bad, [], `${r.id}#${r.run}: forbidden word in 关于你: ${JSON.stringify(r.added)}`);
    assert.deepEqual(r.missing, [], `${r.id}#${r.run}: the fact is missing: ${JSON.stringify(r.added)}`);
    if (r.id === 'budget-full') { assert.ok(r.added.length <= 2, `budget-full#${r.run}: ${r.added.length} new lines: ${JSON.stringify(r.added)}`); assert.equal(r.oldKept, true, 'old lines kept'); }
  }
}, 60);

// TC-229 out of sample: fresh lines about the user's life, each on a fresh folder. Reports forgetting (the fact is not kept and an update was logged ungrounded)
// and the added lines for reading by hand (invented lines are judged by eye). Records, asserts only that every gateway answered.
T('TC-229', '[DES-033 guard E, O-4] out-of-sample lines: forgetting by the 1/4 threshold and invented lines (observation)', async () => {
  const rows = [];
  for (const o of OOS_LINES) {
    const dir = tmpDir('lb-live229-'); mkdirSync(dir, { recursive: true });
    const gw = await boot(dir);
    const r = await say(gw, chatOf(), o.line, 'TC-229', 'oos');
    const w = await waitQuiet(dir, r.at, 25000);
    const upd = gw.logs().filter((l) => l.event === 'memory_update');
    await gw.stop();
    const about = aboutOf(dir);
    const added = about.split('\n').filter((l) => l.startsWith('- '));
    const kept = o.expect.some((k) => lc(about).includes(lc(k)));
    rows.push({ line: o.line, added, kept, ungrounded: upd.filter((u) => u.reason === 'ungrounded').length, reasons: upd.map((u) => ({ ok: u.ok, reason: u.reason ?? null, point: u.point ?? null })), lastChangeMs: w.lastChangeMs });
  }
  const forgot = rows.filter((r) => !r.kept && r.ungrounded > 0);
  keep('TC-229', { n: rows.length, forgotByGuard: forgot.length, notKept: rows.filter((r) => !r.kept).length, rows });
  console.log(`TC-229 n=${rows.length} not kept ${rows.filter((r) => !r.kept).length}, of those with an ungrounded drop ${forgot.length}`);
  for (const r of rows) console.log(`TC-229 | ${r.line} | kept=${r.kept} ungrounded=${r.ungrounded} | ${JSON.stringify(r.added)}`);
}, 60);

// ---------------------------------------------------------------- E live: TC-203, TC-207, TC-213 (headless Chromium through tests/support/page-driver.py, real Bonsai)
const PY = existsSync('/opt/anaconda3/bin/python') ? '/opt/anaconda3/bin/python' : 'python3';
function pageRun(scenario, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [`${ROOT}tests/support/page-driver.py`, scenario, JSON.stringify(args)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 240000);
    p.on('exit', () => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith('RESULT '));
      if (!line) return reject(new Error(`no RESULT from page driver (${scenario}): ${err.slice(-600)} ${out.slice(-300)}`));
      const r = JSON.parse(line.slice(7));
      if (r.driver_error) return reject(new Error(`page driver ${scenario}: ${r.driver_error}`));
      resolve(r);
    });
  });
}

T('TC-203', '[FX-021-01] REQ-036/047: earlier-version user: name carried over, notice once, rename reaches the reply', async () => {
  const exp = fx('FX-021').expected.cases[0];
  const rows = [];
  for (const run of runsOf()) {
    const dir = join(tmpDir('lb-live203-'), 'LittleBuddy'); // absent
    let gw = await boot(dir);
    const o = await pageRun('live_open', { base: gw.base, storage: { 'companion.name': '团子' } });
    await gw.stop();
    gw = await boot(dir);
    const restarted = await pageRun('live_read', { base: gw.base });
    const rn = await pageRun('live_rename', { base: gw.base, name: 'Mochi', sends: 3 });
    for (const r of rn.replies) { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'replies.jsonl'), `${JSON.stringify({ tc: 'TC-203', tag: `run${run}`, line: '你叫什么名字？', reply: r })}\n`); }
    await gw.stop();
    gw = await boot(dir);
    const last = await pageRun('live_read', { base: gw.base });
    await gw.stop();
    rows.push({
      run, notice_before_first_send: o.notice_before_first_send, notice_shows_path: o.notice_text.includes(o.profile.path), notice_has_turn_off_action: o.has_turn_off, notice_after_ack_reload: o.notice_after_ack_reload, notice_after_restart: restarted.notice_visible,
      name_shown: o.name_shown, profile_name: o.profile.name, ls_key_after_open: o.ls_after_open, name_after_reload: o.name_after_reload,
      after_rename: { caption_has_name: rn.caption_after_rename.includes('Mochi'), reply_has_name: rn.replies.every((r) => lc(r).includes('mochi')), reply_no_default_name: rn.replies.every((r) => !r.includes('小伙伴') && !lc(r).includes('little buddy')), name_shown_after_restart: last.name_shown },
      replies: rn.replies, rename_status: rn.status,
    });
  }
  keep('TC-203', { rows });
  for (const r of rows) {
    for (const k of ['notice_before_first_send', 'notice_shows_path', 'notice_has_turn_off_action', 'notice_after_ack_reload', 'notice_after_restart', 'name_shown', 'profile_name']) assert.equal(r[k], exp[k], `run ${r.run}: ${k}`);
    assert.equal(r.ls_key_after_open, null, `run ${r.run}: the localStorage key is removed after the migration`);
    assert.deepEqual(r.after_rename, exp.after_rename, `run ${r.run}: ${JSON.stringify(r.replies)}`);
  }
}, 60);

T('TC-207', '[FX-022-03] REQ-050: forget while a turn is in flight (page, real Bonsai)', async () => {
  const rows = [];
  for (const run of runsOf()) {
    const dir = tmpDir('lb-live207-');
    const f = fixtureFiles('FX-022');
    for (const [n, text] of Object.entries(f)) writeFileSync(join(dir, n), text, { mode: 0o600 });
    const gw = await boot(dir);
    const t0 = Date.now();
    const o = await pageRun('live_inflight', { base: gw.base, line: '我明天还有一轮面试。', watch_ms: 15000 });
    await waitQuiet(dir, t0, Math.max(WAIT_MS + 5000, 40000));
    const about = aboutOf(dir);
    const entries = diaryEntries(diaryOf(dir)).length;
    await gw.stop();
    rows.push({ run, page: o, about_empty: aboutIsEmpty(about), diary_entries: entries, about });
  }
  keep('TC-207', { rows });
  for (const r of rows) {
    assert.equal(r.page.forget_status, 200, `run ${r.run}: forget answered 200`);
    assert.ok(r.about_empty && r.diary_entries === 0, `run ${r.run}: about_empty ${r.about_empty}, diary entries ${r.diary_entries}\n${r.about}`);
    assert.equal(r.page.turns_after, 0, `run ${r.run}: the page shows no pre-forget chat (turns ${r.page.turns_after})`);
  }
}, 60);

async function bootNpm(dir, port, bport) { // the real entry: npm start (03 goal.check), own ports, own data dir
  const env = { ...process.env, PORT: String(port), BONSAI_PORT: String(bport), LITTLEBUDDY_DATA_DIR: dir };
  delete env.COMPANION_REGION;
  const proc = spawn('npm', ['start', '--silent'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gw = { pid: proc.pid, base: `http://127.0.0.1:${port}`, exited: null, pidsAll: new Set([proc.pid]), out: '', err: '' };
  started.push(proc.pid);
  proc.stdout.on('data', (c) => { gw.out += c; }); proc.stderr.on('data', (c) => { gw.err += c; });
  proc.on('exit', (code, sig) => { gw.exited = { code, sig }; });
  const snap = () => { for (const k of kidsOf(proc.pid)) { gw.pidsAll.add(k); if (!started.includes(k)) started.push(k); } };
  const deadline = Date.now() + 8 * 60000; let readyAt = null;
  for (;;) {
    if (gw.exited) throw new Error(`npm start exited early ${JSON.stringify(gw.exited)}\n${gw.err.slice(-800)}`);
    if (Date.now() > deadline) throw new Error('not ready in 8 min');
    try { const h = await (await fetch(`${gw.base}/api/health`, { signal: AbortSignal.timeout(3000) })).json(); if (h.ready === true) { readyAt ??= Date.now(); if (h.tts === 'ready' || Date.now() - readyAt > 25000) break; } } catch { /* not up */ }
    await sleep(500);
  }
  snap();
  gw.stop = async () => {
    snap();
    const main = [...gw.pidsAll].find((p) => { try { return /server\/main\.js/.test(execFileSync('ps', ['-o', 'command=', '-p', String(p)], { encoding: 'utf8' })); } catch { return false; } });
    if (main) { try { process.kill(main, 'SIGTERM'); } catch { /* gone */ } }
    const t = Date.now();
    while ([...gw.pidsAll].some(alive) && Date.now() - t < 20000) await sleep(200);
    for (const p of gw.pidsAll) if (alive(p)) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  };
  return gw;
}

T('TC-213', 'REQ-036..050: the goal check through npm start (notice, recall, diary, about, rename, region, forget, restart)', async () => {
  const dir = tmpDir('lb-live213-'); mkdirSync(OUT, { recursive: true });
  const port = await port4450(), bport = await port4450();
  const lines = ['我在准备实习面试。', '今天模拟面试过了，好开心！', '可是晚上和朋友吵架了，有点难过。'];
  let gw = await bootNpm(dir, port, bport);
  const A = await pageRun('live_goal_a', { base: gw.base, lines, shots: OUT });
  const t0 = Date.now();
  await waitQuiet(dir, t0, WAIT_MS);
  await gw.stop();
  gw = await bootNpm(dir, port, bport);
  const B = await pageRun('live_goal_b', { base: gw.base, ask: '还记得我在忙什么吗？', name: 'Mochi', region: 'US', shots: OUT });
  await gw.stop();
  gw = await bootNpm(dir, port, bport);
  const C = await pageRun('live_goal_c', { base: gw.base, shots: OUT });
  await gw.stop();
  keep('TC-213', { A, B, C });
  const entries = B.diary.days.flatMap((d) => d.rows);
  assert.equal(A.notice_visible, true); assert.ok(A.notice_text.includes(A.path), 'the notice shows the folder');
  assert.ok(B.ask_reply.includes('面试'), `① reply names 面试: ${B.ask_reply}`);
  assert.equal(entries.length, lines.length + 1, `② one entry per turn: ${JSON.stringify(entries)}`);
  assert.deepEqual(entries.map((e) => e.mood), [...A.moods, B.ask_mood].map((m) => MOOD_WORD[m]), '② each entry carries its turn\'s mood');
  assert.ok(B.diary.dots >= 1, '② the week curve has a point for today');
  assert.equal(B.profile_after_settings.name, 'Mochi'); assert.equal(B.profile_after_settings.region, 'US');
  assert.deepEqual(B.after_forget, { about_empty: true, diary_has_any: false });
  assert.ok(C.about_empty_visible && C.diary_start_visible && C.diary_api === false, '④ empty after restart');
  assert.equal(C.profile.name, 'Mochi'); assert.equal(C.profile.region, 'US');
}, 60);

after(() => {
  const left = started.filter(alive);
  if (left.length) console.log(`LEFTOVER PIDS ${left}`);
  assert.equal(left.length, 0, `pids still alive: ${left}`);
});

// OBS-1: not a TC. Probes for odd update lines (the developer saw a bare "- 我叫" under 在意的人和事 for the hamster line). Records, never fails on content.
T('OBS-1', 'odd update lines for lines that name a pet or a person (observation only; nothing is asserted about the model)', async () => {
  const lines = ['我还养了一只叫年糕的仓鼠', '我家狗叫小白，今天它咬坏了我的拖鞋。', '我朋友叫阿杰，他下周来看我。', 'My dog is called Biscuit and he hates the vacuum.'];
  const rows = [];
  for (let run = 1; run <= Math.max(RUNS, 2); run++) {
    for (const line of lines) {
      const dir = tmpDir('lb-liveobs-'); const gw = await boot(dir);
      const r = await say(gw, chatOf(), line, 'OBS-1', `run${run}`);
      await waitQuiet(dir, r.at);
      await gw.stop();
      const about = aboutOf(dir);
      rows.push({ run, line, about, diary: diaryOf(dir).split('\n').slice(-2).join(' | '), odd: odd(about), bareLead: aboutLines(about).filter((l) => /^(我叫|叫|我的名字|my name|i'?m)\s*\S{0,3}$/i.test(l)) });
    }
  }
  keep('OBS-1', { rows });
  console.log(`OBS-1 odd lines: ${JSON.stringify(rows.filter((r) => r.odd.length || r.bareLead.length).map((r) => [r.line, r.odd, r.bareLead]))}`);
});
