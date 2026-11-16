// TC-216 (turn time, speak, update landing under memory load) and TC-217 (recall with a budget-full 关于你), be-tester #5, R1.
// Opt-in: nothing is registered unless COMPANION_PERF=1, so `npm test` stays fast (no skipped test is added either).
// The gateway is the real one: node server/main.js with real Bonsai, WhisperKit and TTS as its children, PORT=4460 BONSAI_PORT=4461, a fresh
// LITTLEBUDDY_DATA_DIR per cell. Never port 4317, never ~/Library/Application Support/LittleBuddy.
// Env: PERF_ONLY=hand2000@1.5,budget@1.5,...,tc217  (default: all cells in the order worst first, then tc217)   PERF_MINUTES=10
//      PERF_OUT=docs/backend/logs/perf-r1 (per-cell JSON)   PERF_SCRATCH=<dir for data folders>
//      PERF_PREFIX=perf-r1- (file name prefix; round 2 of the idle-time design uses r2-)   PERF_DRAIN_S=240 (cap for the end-of-cell drain)
// Round 2 (be-tester #6, step 8.7, A32 idle-time update): extra cell `budget@burst` = 3 lines 1.5 s apart, then 30 s without a line, repeated.
// Landing pairing changed with the design: lines wait for 8 s of quiet, `busy` log lines (a flush cut by a new turn) are not landings,
// a queue_full line is matched to its turn by the job's own queue time (waited_ms), not by position.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from './server-helpers.js';
import { BUDGET_FULL, handWritten2000, lineSource, wt } from './support/perf-data.js';
import { notesWithin } from '../server/memory-files.js';

const ON = process.env.COMPANION_PERF === '1';
const PORT = 4460, BPORT = 4461;
const MINUTES = Number(process.env.PERF_MINUTES || 10);
const OUT = join(ROOT, process.env.PERF_OUT || 'docs/backend/logs/perf-r1');
const SCRATCH = process.env.PERF_SCRATCH;
const PREFIX = process.env.PERF_PREFIX || 'perf-r1-';
const DRAIN_MS = Number(process.env.PERF_DRAIN_S || 240) * 1000;
const BURST_LINES = 3, BURST_QUIET_MS = 30000;
const RESPOND_MS = 16000, SPEAK_MS = 11000; // the page's own client deadlines (web/js/companion-client.js)
// PERF_ABORT=1: the next send aborts the readings still in flight, as the page's speaker.stop() does at every send (web/js/app.js `send`).
// Default (unset) keeps every reading running to its end: the plan's literal "play none" driver, a heavier load than the page puts on the TTS.
const ABORT = process.env.PERF_ABORT === '1';
// PERF_NOSPEAK=1: diagnostic control only (read-aloud off, no /api/speak call); TC-216 proper always has read-aloud on.
const NOSPEAK = process.env.PERF_NOSPEAK === '1';
const BASE = `http://127.0.0.1:${PORT}`;
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const stats = (a) => ({ n: a.length, p50: r1(pct(a, 0.5)), p95: r1(pct(a, 0.95)), max: r1(a.length ? Math.max(...a) : null), mean: r1(a.length ? a.reduce((x, y) => x + y, 0) / a.length : null) });

// ---------------------------------------------------------------- the real gateway, started and stopped by pid
const started = []; // every pid this file started (gateway + descendants seen)
const descendants = (pid) => {
  const out = [];
  let frontier = [pid];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) { try { next.push(...execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number)); } catch { /* none */ } }
    out.push(...next); frontier = next;
  }
  return out;
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function startGateway(dir) {
  const env = { ...process.env, PORT: String(PORT), BONSAI_PORT: String(BPORT), LITTLEBUDDY_DATA_DIR: dir, COMPANION_REGION: 'CN' };
  const proc = spawn(process.execPath, ['server/main.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gw = { pid: proc.pid, out: '', err: '', exited: null, pids: new Set([proc.pid]), t0: Date.now() };
  started.push(proc.pid);
  proc.stdout.on('data', (c) => { gw.out += c; });
  proc.stderr.on('data', (c) => { gw.err += c; });
  proc.on('exit', (code, sig) => { gw.exited = { code, sig }; });
  gw.logs = () => gw.out.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  gw.snapKids = () => { for (const k of descendants(proc.pid)) { gw.pids.add(k); if (!started.includes(k)) started.push(k); } };
  // ready = health says ready and tts ready
  const deadline = Date.now() + 8 * 60000;
  for (;;) {
    if (gw.exited) throw new Error(`gateway exited early ${JSON.stringify(gw.exited)}\n${gw.err.slice(-1500)}`);
    if (Date.now() > deadline) throw new Error('gateway not ready in 8 min');
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      const h = await r.json();
      if (h.ready === true && h.tts === 'ready') { gw.health = h; break; }
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  gw.readyMs = Date.now() - gw.t0;
  gw.snapKids();
  gw.stop = async () => {
    gw.snapKids();
    if (!gw.exited) {
      proc.kill('SIGTERM');
      const t = Date.now();
      while (!gw.exited && Date.now() - t < 20000) await sleep(100);
      if (!gw.exited) proc.kill('SIGKILL');
    }
    // children: wait, then stop only the pids recorded for this gateway
    const t = Date.now();
    while ([...gw.pids].some(alive) && Date.now() - t < 8000) await sleep(200);
    for (const p of gw.pids) if (alive(p)) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
    await sleep(500);
    for (const p of gw.pids) if (alive(p)) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    await sleep(300);
    gw.leftover = [...gw.pids].filter(alive);
    return gw.leftover;
  };
  return gw;
}

async function post(path, body, ms, ctl) {
  const t0 = Date.now();
  try {
    const sig = ctl ? AbortSignal.any([AbortSignal.timeout(ms), ctl]) : AbortSignal.timeout(ms);
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: sig });
    const buf = Buffer.from(await r.arrayBuffer());
    let json; try { json = JSON.parse(buf.toString('utf8')); } catch { /* wav */ }
    return { status: r.status, json, bytes: buf.length, ms: Date.now() - t0, outcome: r.status === 200 ? 'ok' : 'error' };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, outcome: e?.name === 'TimeoutError' ? 'timeout' : e?.name === 'AbortError' ? 'aborted' : 'error', err: e?.name };
  }
}

// ---------------------------------------------------------------- files poll (every 250 ms)
function watchFiles(dir) {
  const events = [];
  let last = { about: null, points: -1, entries: -1 };
  let stopped = false;
  const read = (n) => { try { return readFileSync(join(dir, n), 'utf8'); } catch { return null; } };
  const tick = () => {
    const about = read('关于你.md'), diary = read('日志.md');
    const points = diary === null ? 0 : (diary.match(/^-\s+\S+\s+·\s+\S/gm) ?? []).length;
    const entries = diary === null ? 0 : (diary.match(/^-\s+(开心|平静|平常|紧张|难过)/gm) ?? []).length;
    const aboutChanged = last.about !== null && about !== last.about;
    if (aboutChanged || (last.points >= 0 && points !== last.points) || (last.entries >= 0 && entries !== last.entries)) {
      events.push({ t: Date.now(), about: aboutChanged, pointsUp: last.points >= 0 && points > last.points, points, entries, aboutChars: about?.length ?? 0 });
    }
    last = { about, points, entries };
  };
  tick();
  const iv = setInterval(tick, 250);
  return { events, stop() { if (!stopped) { stopped = true; clearInterval(iv); tick(); } } };
}

// ---------------------------------------------------------------- one TC-216 cell
function prepare(dir, size) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = size === 'empty' ? null : size === 'budget' ? BUDGET_FULL : handWritten2000();
  if (file !== null) writeFileSync(join(dir, '关于你.md'), file, { mode: 0o600 });
  return file;
}

async function cell(size, gapS, burst = false) {
  const name = burst ? `${size}@burst` : `${size}@${gapS}`;
  const dir = mkdtempSync(join(SCRATCH, `data-${size}-${gapS}-`)); // a fresh folder per cell
  const aboutAtStart = prepare(dir, size);
  const gw = await startGateway(dir);
  const cellStart = Date.now();
  const watch = watchFiles(dir);
  const src = lineSource(7);
  const turns = [];
  const speaks = [];
  const readings = []; // promises
  let history = [];
  let openReadings = 0;
  const live = new Set(); // AbortControllers of readings in flight
  const deadline = cellStart + MINUTES * 60000;
  let n = 0;
  while (Date.now() < deadline) {
    n += 1;
    const burstNo = burst ? Math.floor((n - 1) / BURST_LINES) + 1 : null;
    const { line, fact, lang: lineLang } = src.next();
    if (ABORT) { for (const c of live) c.abort(); live.clear(); }
    const t0 = Date.now();
    const r = await post('/api/respond', { line, history: history.slice(-40) }, RESPOND_MS);
    const t1 = Date.now();
    const turn = { n, burst: burstNo, sendAt: t0, replyAt: t1, ms: r.ms, status: r.status, outcome: r.outcome, fact, lineLang, lang: r.json?.lang ?? null, parts: r.json?.speech?.length ?? 0, replyChars: r.json?.reply?.length ?? 0, mood: r.json?.mood ?? null, crisis: r.json?.crisis ?? null };
    turns.push(turn);
    if (r.status === 200 && typeof r.json?.reply === 'string') {
      history.push({ role: 'user', text: line }, { role: 'companion', text: r.json.reply });
      history = history.slice(-40);
      // read aloud as the page's speaker does: part 1 at once, part n+1 when n arrived, one failed part ends the reading, nothing played
      const parts = r.json.speech ?? [];
      const lang = r.json.lang;
      if (parts.length && !NOSPEAK) {
        openReadings += 1;
        const ctl = new AbortController();
        live.add(ctl);
        readings.push((async () => {
          const overlapAtStart = openReadings > 1;
          for (let i = 0; i < parts.length; i++) {
            const s = await post('/api/speak', { text: parts[i], lang }, SPEAK_MS, ctl.signal);
            speaks.push({ turn: n, part: i + 1, of: parts.length, at: t1, ms: s.ms, status: s.status, outcome: s.outcome, bytes: s.bytes ?? 0, chars: parts[i].length, overlap: overlapAtStart });
            if (s.outcome !== 'ok') break;
          }
          openReadings -= 1;
          live.delete(ctl);
        })());
      }
    } // a failed turn is recorded and not added to history (the page drops it)
    // burst cell: 1.5 s between the lines of a burst, then 30 s without a line (A32: the quiet in which <= 3 lines must land)
    await sleep(burst && n % BURST_LINES === 0 ? BURST_QUIET_MS : gapS * 1000);
  }
  // drain: every queued line ends (written, guarded, failed, timed out or dropped by queue_full; a `busy` line is an interruption, not an end), up to PERF_DRAIN_S
  const queuedCount = () => gw.logs().filter((l) => l.event === 'memory_turn' && l.queued).length;
  const updatesDone = () => gw.logs().filter((l) => l.event === 'memory_update' && l.reason !== 'busy').length;
  const drainStart = Date.now();
  while (Date.now() - drainStart < DRAIN_MS && updatesDone() < queuedCount()) await sleep(250);
  const drainS = r1((Date.now() - drainStart) / 1000);
  await Promise.allSettled(readings);
  await sleep(600);
  watch.stop();
  const logs = gw.logs();
  const aboutFinal = readFileSync(join(dir, '关于你.md'), 'utf8').length;
  const leftover = await gw.stop();

  // ---- landing (idle-time design): each queued turn is a job; every final memory_update line (not `busy`) is matched to the job whose queue time
  // is nearest to the line's own queue time (log time - ms - waited_ms); lines with reason busy are interruptions and counted apart
  const mt = logs.filter((l) => l.event === 'memory_turn');
  const muAll = logs.filter((l) => l.event === 'memory_update');
  const mu = muAll.filter((l) => l.reason !== 'busy');
  const busyLines = muAll.length - mu.length;
  const okTurns = turns.filter((t) => t.status === 200);
  const queuedJobs = [];
  mt.forEach((l, i) => { if (l.queued && okTurns[i]) queuedJobs.push({ turn: okTurns[i], queuedAt: Date.parse(l.t), used: false }); });
  const jobs = [];
  let unmatched = 0;
  for (const u of mu) {
    const qAt = Date.parse(u.t) - (u.ms ?? 0) - (u.waited_ms ?? 0);
    let best = null;
    for (const j of queuedJobs) if (!j.used && (best === null || Math.abs(j.queuedAt - qAt) < Math.abs(best.queuedAt - qAt))) best = j;
    if (!best || Math.abs(best.queuedAt - qAt) > 1500) { unmatched += 1; continue; }
    best.used = true;
    jobs.push({ ...best, upd: u, doneAt: Date.parse(u.t) });
  }
  const stillWaiting = queuedJobs.filter((j) => !j.used).length;
  const landings = jobs.map((j) => ({ turn: j.turn.n, ok: j.upd.ok, wrote: !!(j.upd.point || j.upd.about_changed), point: j.upd.point, about_changed: j.upd.about_changed, reason: j.upd.reason ?? null, ms: j.upd.ms, waited_ms: j.upd.waited_ms, landMs: j.doneAt - j.turn.replyAt, burst: j.turn.burst }));
  const wrote = landings.filter((l) => l.wrote);
  // the same landing seen from the files: first poll event (about changed or a point added) at or after the log line's time minus 0.6 s
  const fileLand = wrote.map((l, i) => { const j = jobs.filter((x) => x.upd.point || x.upd.about_changed)[i]; const e = watch.events.find((x) => (x.about || x.pointsUp) && x.t >= j.doneAt - 600); return e ? (e.t - j.turn.replyAt) / 1000 : null; }).filter((v) => v !== null);
  // per burst: from the burst's last reply to the final line of its last-ending job (A32: <= 30 s for <= 3 waiting lines)
  const bursts = burst ? [...new Set(turns.map((t) => t.burst))].map((b) => {
    const ts = turns.filter((t) => t.burst === b && t.status === 200);
    const last = ts.length ? Math.max(...ts.map((t) => t.replyAt)) : null;
    const js = jobs.filter((j) => j.turn.burst === b);
    const queued = queuedJobs.filter((j) => j.turn.burst === b).length;
    return { burst: b, lines: ts.length, queued, ended: js.length, wrote: js.filter((j) => j.upd.point || j.upd.about_changed).length, reasons: js.map((j) => j.upd.reason ?? (j.upd.ok ? 'ok' : 'failed')), landS: last && js.length ? r1((Math.max(...js.map((j) => j.doneAt)) - last) / 1000) : null, firstS: last && js.length ? r1((Math.min(...js.map((j) => j.doneAt)) - last) / 1000) : null, allEnded: js.length === queued };
  }) : [];
  const respondMs = turns.filter((t) => t.status === 200).map((t) => t.ms);
  const speakFail = speaks.filter((s) => s.outcome !== 'ok' && s.outcome !== 'aborted');
  const summary = {
    cell: name, size, gapS, burst, minutes: MINUTES, wallS: r1((Date.now() - cellStart) / 1000), gatewayReadyS: r1(gw.readyMs / 1000),
    turns: turns.length, turnsOk: respondMs.length, respondFailures: turns.filter((t) => t.status !== 200).map((t) => ({ n: t.n, status: t.status, outcome: t.outcome, ms: t.ms })),
    respond: stats(respondMs), respondOver10s: respondMs.filter((m) => m > 10000).length,
    speakCalls: speaks.length, speakTimeouts: speaks.filter((s) => s.outcome === 'timeout').length, speakAborted: speaks.filter((s) => s.outcome === 'aborted').length, abortAtSend: ABORT, readAloud: !NOSPEAK, speakErrors: speaks.filter((s) => s.outcome === 'error').length,
    speakFailures: speakFail.map((s) => ({ turn: s.turn, part: s.part, status: s.status, outcome: s.outcome, ms: s.ms, overlap: s.overlap })), speak: stats(speaks.filter((s) => s.outcome === 'ok').map((s) => s.ms)),
    speakOverlapCalls: speaks.filter((s) => s.overlap).length,
    updates: { queuedTurns: mt.filter((l) => l.queued).length, logged: mu.length, busyLines, unmatched, stillWaiting, flushes: logs.filter((l) => l.event === 'memory_flush').length, ok: mu.filter((l) => l.ok).length, wrote: wrote.length, queue_full: mu.filter((l) => l.reason === 'queue_full').length, timeouts: mu.filter((l) => !l.ok && /timeout|Timeout/i.test(`${l.reason}${l.err_name ?? ''}`)).length, failed: mu.filter((l) => !l.ok).map((l) => ({ reason: l.reason, err_name: l.err_name ?? null })), updateMs: stats(mu.filter((l) => l.ok).map((l) => l.ms)) },
    landingWritten: stats(wrote.map((l) => l.landMs / 1000)), landingAllOk: stats(landings.filter((l) => l.ok).map((l) => l.landMs / 1000)),
    fileEvents: watch.events.length, landingFromFiles: stats(fileLand), fileLandMatched: fileLand.length,
    http504: turns.filter((t) => t.status === 504).length + speaks.filter((s) => s.status === 504).length, statuses: Object.fromEntries([...new Set([...turns.map((t) => t.status), ...speaks.map((s) => s.status)])].map((s) => [s, turns.filter((t) => t.status === s).length + speaks.filter((x) => x.status === s).length])),
    aboutCharsStart: aboutAtStart?.length ?? 0, aboutCharsEnd: aboutFinal, aboutWeightStart: aboutAtStart ? wt(aboutAtStart) : 0,
    bursts, drainS, memoryNotesCut: logs.filter((l) => l.event === 'memory_notes_cut').length, gatewayPids: [...gw.pids], leftoverPids: leftover, drainedWithinCap: updatesDone() >= queuedCount(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${PREFIX}${burst ? `${size}-burst` : `${size}-${gapS}`}${ABORT ? '-abort' : ''}${NOSPEAK ? '-nospeak' : ''}.json`), JSON.stringify({ summary, turns, speaks, landings, fileEvents: watch.events, memoryUpdateLogs: muAll, memoryTurnLogs: mt.length, stderrTail: gw.err.slice(-2000) }, null, 1));
  return summary;
}

// ---------------------------------------------------------------- TC-217
const FACT_CASES = [ // FX-014 cases: lines said (sessions), asks
  { id: 'FX-014-01', sessions: [['我最近在准备实习面试，有点紧张。', '不过今天模拟面试表现得还不错，好开心！']], ask: { line: '还记得我最近在忙什么吗？', keywords: ['面试'] }, section: 'busy' },
  { id: 'FX-014-02', sessions: [['我家猫叫豆豆，这两天它不太爱吃饭，我有点担心。']], ask: { line: '你还记得我家猫叫什么吗？', keywords: ['豆豆'] }, section: 'people' },
  { id: 'FX-014-03', sessions: [["I'm training for a half marathon next month and my knees are sore."]], ask: { line: "Do you remember what I'm training for?", keywords: ['marathon'] }, section: 'busy' },
  { id: 'FX-014-04', sessions: [['My sister Lily is coming to visit this weekend, I\'m so excited!']], ask: { line: "Who's coming to visit me this weekend?", keywords: ['lily'] }, section: 'people' },
  { id: 'FX-014-05', sessions: [['我最近在准备实习面试，有点紧张。', '不过今天模拟面试表现得还不错，好开心！']], ask: { line: "Do you remember what I've been busy with?", keywords: ['interview'] }, aboutKw: ['面试'], section: 'busy' },
  { id: 'FX-014-06', sessions: [['我最近在准备实习面试，有点紧张。', '不过今天模拟面试表现得还不错，好开心！'], ['我家猫叫豆豆，这两天它不太爱吃饭，我有点担心。']], asks: [{ line: '还记得我最近在忙什么吗？', keywords: ['面试'], section: 'busy' }, { line: '你还记得我家猫叫什么吗？', keywords: ['豆豆'], section: 'people' }] },
];
const FORBID_CASES = [
  { id: 'FX-015-01', sessions: [], ask: { line: '还记得我最近在忙什么吗？', forbidden: ['面试'] } },
  { id: 'FX-015-02', sessions: [], ask: { line: "Do you remember what I've been busy with lately?", forbidden: ['interview'] } },
  { id: 'FX-015-03', sessions: [['我最近在准备实习面试，有点紧张。', '不过今天模拟面试表现得还不错，好开心！']], ask: { line: '你还记得我家猫叫什么吗？', forbidden: ['豆豆'] } },
  { id: 'FX-015-04', sessions: [["I'm training for a half marathon next month and my knees are sore."]], ask: { line: "Do you remember my sister's name?", forbidden: ['lily'] } },
];

// wait until the gateway has logged every turn's memory_turn (it is logged after the response is sent) and every queued update has finished
async function settle(gw, turns, capMs = 90000) {
  const t = Date.now();
  const n = (ev, f = () => true) => gw.logs().filter((l) => l.event === ev && f(l)).length;
  while (Date.now() - t < capMs && (n('memory_turn') < turns || n('memory_update', (l) => l.reason !== 'busy') < n('memory_turn', (l) => l.queued))) await sleep(250);
}

async function sayLines(dir, lines, { expectWrites = true } = {}) { // one gateway session: lines in one chat, wait for the updates, stop
  const gw = await startGateway(dir);
  const replies = [];
  let history = [];
  for (const line of lines) {
    const r = await post('/api/respond', { line, history }, RESPOND_MS);
    assert.equal(r.status, 200, `respond ${r.status}`);
    history.push({ role: 'user', text: line }, { role: 'companion', text: r.json.reply });
    replies.push(r.json.reply);
  }
  await settle(gw, lines.length);
  const updates = gw.logs().filter((l) => l.event === 'memory_update');
  const left = await gw.stop();
  return { replies, updates, left, readyMs: gw.readyMs };
}
async function askOnce(dir, line) { // a new gateway (restart), a new chat, one ask
  const gw = await startGateway(dir);
  const r = await post('/api/respond', { line, history: [] }, RESPOND_MS);
  await settle(gw, 1);
  const left = await gw.stop();
  return { status: r.status, reply: r.json?.reply ?? '', left, readyMs: gw.readyMs };
}

async function tc217() {
  const RUNS = Number(process.env.PERF_RUNS || 3);
  const rows = [];
  const leftovers = [];
  const readyMs = [];
  for (let run = 1; run <= RUNS; run++) {
    for (const c of [...FACT_CASES, ...FORBID_CASES]) {
      const dir = mkdtempSync(join(SCRATCH, `data-217-${c.id}-r${run}-`));
      writeFileSync(join(SCRATCH, 'tc217-progress.txt'), `run ${run} ${c.id} ${new Date().toISOString()}\n`, { flag: 'a' });
      prepare(dir, 'budget');
      const all = [];
      let ups = [];
      for (const s of c.sessions) { const r = await sayLines(dir, s); leftovers.push(...r.left); readyMs.push(r.readyMs); ups.push(...r.updates.map((u) => ({ ok: u.ok, point: u.point, about_changed: u.about_changed, reason: u.reason ?? null }))); all.push(r.replies); }
      const about = readFileSync(join(dir, '关于你.md'), 'utf8');
      const cut = notesWithin(about, 1200).text;
      const asks = c.asks ?? [{ ...c.ask, section: c.section, aboutKw: c.aboutKw }];
      for (const a of asks) {
        const r = await askOnce(dir, a.line);
        leftovers.push(...r.left); readyMs.push(r.readyMs);
        const low = r.reply.toLowerCase();
        const row = { run, id: c.id, ask: a.line, section: a.section ?? null, status: r.status, reply: r.reply, updates: ups };
        if (a.keywords) {
          row.keywords = a.keywords;
          row.hit = a.keywords.some((k) => low.includes(k.toLowerCase()));
          const ak = a.aboutKw ?? a.keywords; // the word the pipeline writes into 关于你 (FX-014 about_keywords); the ask's own keyword is what the reply must contain
          row.inAbout = ak.some((k) => about.toLowerCase().includes(k.toLowerCase()));
          row.insideBudget = ak.some((k) => cut.toLowerCase().includes(k.toLowerCase()));
          row.cause = row.hit ? 'recalled' : !row.inAbout ? 'not_in_file' : !row.insideBudget ? 'outside_budget_by_design' : 'model_miss';
        } else {
          row.forbidden = a.forbidden;
          row.leak = a.forbidden.some((k) => low.includes(k.toLowerCase()));
        }
        rows.push(row);
      }
      // FX-014-06: the second ask's file state is already complete (both sessions ran before the asks); the asks run on their own restarts
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'perf-r1-tc217.json'), JSON.stringify({ rows, leftovers, gatewayReadyMs: stats(readyMs) }, null, 1));
  return { rows, leftovers };
}

// ---------------------------------------------------------------- registration
if (ON) {
  assert.ok(SCRATCH && existsSync(SCRATCH), 'PERF_SCRATCH must be an existing folder (never the user data folder)');
  assert.ok(!SCRATCH.includes('Application Support'), 'refusing to use the user data folder');
  const ORDER = ['hand2000@1.5', 'budget@1.5', 'empty@1.5', 'hand2000@6', 'budget@6', 'empty@6', 'budget@burst', 'tc217'];
  const only = (process.env.PERF_ONLY ? process.env.PERF_ONLY.split(',') : ORDER).filter((c) => ORDER.includes(c));
  for (const c of only) {
    if (c === 'tc217') {
      test('TC-217 REQ-038/039: recall with a budget-full 关于你 (FX-014-01..06 and FX-015-01..04, 3 runs each)', { timeout: 6 * 3600 * 1000 }, async () => {
        const { rows, leftovers } = await tc217();
        assert.equal(leftovers.length, 0, `leftover pids ${leftovers}`);
        const forbid = rows.filter((r) => r.forbidden);
        const leaks = forbid.filter((r) => r.leak);
        assert.equal(leaks.length, 0, `FX-015 forbidden words found: ${JSON.stringify(leaks.map((l) => [l.run, l.id]))}`);
        // facts inside the budget cut must be recalled; facts outside "by design" are reported, not failed
        const inside = rows.filter((r) => r.keywords && r.insideBudget);
        const misses = inside.filter((r) => !r.hit);
        console.log(`TC-217 inside-budget facts ${inside.length}, missed ${misses.length}; outside budget by design ${rows.filter((r) => r.keywords && r.inAbout && !r.insideBudget).length}`);
        assert.ok(inside.length - misses.length >= Math.ceil((inside.length * 17) / 18), `inside-budget recall ${inside.length - misses.length}/${inside.length}, bar 17/18`);
        const f1 = rows.filter((r) => r.id === 'FX-014-01');
        assert.equal(f1.filter((r) => r.hit).length, f1.length, `FX-014-01 recall ${f1.filter((r) => r.hit).length}/${f1.length}, bar 3/3`);
      });
    } else {
      const [size, gap] = c.split('@');
      const isBurst = gap === 'burst';
      test(`TC-216 REQ-037/044 (A32 idle-time): turn time, speak, update landing, cell ${c} (${MINUTES} min)`, { timeout: (MINUTES + 15) * 60000 }, async () => {
        const s = await cell(size, isBurst ? 1.5 : Number(gap), isBurst);
        console.log(`TC-216 cell ${c}: ${JSON.stringify({ respond: s.respond, speakTimeouts: s.speakTimeouts, landing: s.landingWritten, updates: s.updates, bursts: s.bursts.map((b) => b.landS), drainS: s.drainS, http504: s.http504 })}`);
        assert.equal(s.leftoverPids.length, 0, `leftover pids ${s.leftoverPids}`);
        assert.ok(s.respond.p95 <= 10000, `p95 turn ${s.respond.p95} ms > 10000`);
        if (isBurst) { // step 8.7: every burst lands <= 30 s after its last reply, queue_full 0
          assert.ok(s.bursts.length > 0 && s.bursts.every((b) => b.allEnded && b.landS !== null && b.landS <= 30), `burst landing: ${JSON.stringify(s.bursts.map((b) => [b.burst, b.landS, b.allEnded]))}`);
          assert.equal(s.updates.queue_full, 0, 'queue_full count');
        } else if (size === 'budget' && gap === '6') { // step 8.7: the list empties after the chat, no timeout
          assert.equal(s.updates.stillWaiting, 0, 'lines still waiting after the drain');
          assert.equal(s.updates.timeouts, 0, 'update timeouts');
        }
      });
    }
  }
}
