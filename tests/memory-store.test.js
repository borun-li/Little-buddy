// R1 memory, group B (store on a real temp folder, failures injected with chmod and file-system state): TC-161..TC-171. be-tester #4.
// Every store gets its own fresh temp dir (never ~/Library/Application Support/LittleBuddy). Expected values: plan 04, 03 DES-032 / §3 / §4,
// fixtures FX-021..FX-024.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ABOUT_TEMPLATE, parseDiary } from '../server/memory-files.js';
import { parseProfilePatch } from '../server/main.js';
import { createStore, FolderInUse } from '../server/memory-store.js';
import { captureLogs, cleanupTmp, filesOf, fx, mode, ROOT, seed, sleep, snap, startGateway, tmpDir, waitFor, wt } from './memory-helpers.js';

after(cleanupTmp);
const today = new Date();
const cfg = { notesBudget: 1200, lineChars: 80, pointChars: 80, queueMax: 8, lockWaitMs: 1000 };
const mk = (dir, said = []) => createStore({ dir, cfg, say: (t) => said.push(t) });
async function open(dir, said = []) { const s = mk(dir, said); await s.lock(); await s.load(); return s; }
const f22 = () => filesOf('FX-022');
const f23 = () => filesOf('FX-023');
const sameSnap = (a, b, msg) => assert.deepEqual(a, b, msg);
const rejectsCode = (p, code) => assert.rejects(p, (e) => e.code === code, `rejects ${code}`);
const names = (dir) => readdirSync(dir).sort();

// R2 (03 DES-042/043): profile() and settings() also hold the look and the voice; the defaults, written here independently of server code.
const R2_DEFAULTS = { look: { character: 1, outfit: { head: 'none', clothes: 'none', shoes: 'none', accessory: 'none' } }, voice: 'serena' };

test('TC-161 [FX-021] REQ-036/051: first run creates the folder 0700 with the lock; start alone writes no profile.json; first setting makes it 0600', async () => {
  const base = tmpDir();
  const dir = join(base, 'LittleBuddy');
  assert.equal(existsSync(dir), false);
  const s = mk(dir);
  await s.lock();
  assert.equal(mode(dir), 0o700);
  assert.equal(readFileSync(join(dir, '.lock'), 'utf8').trim(), String(process.pid));
  assert.equal(s.writable, true); assert.equal(s.readable, true);
  await s.load();
  assert.deepEqual(s.profile(), { name: null, region: null, memoryOn: true, noticeSeen: false, ...R2_DEFAULTS });
  const v = s.view();
  assert.equal(v.newProfile, true); assert.equal(v.about, ABOUT_TEMPLATE); assert.equal(v.aboutEmpty, true); assert.equal(v.kept, false);
  assert.equal(existsSync(join(dir, 'profile.json')), false, 'start alone writes nothing');
  await s.setProfile({ noticeSeen: true });
  assert.equal(mode(join(dir, 'profile.json')), 0o600);
  assert.equal(s.view().newProfile, false);
  const j = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
  assert.equal(j.version, 1); assert.equal(j.noticeSeen, true);
  assert.throws(() => createStore({}), TypeError);
  assert.throws(() => createStore({ dir: 'relative/dir' }), TypeError);
});

test('TC-162 REQ-051/054: wide permissions are tightened (log memory_perms_fixed); a 0000 file is left alone and reported unreadable', async () => {
  const dir = tmpDir();
  seed(dir, f22(), 0o644); chmodSync(dir, 0o755);
  const { result: s, logs } = await captureLogs(() => open(dir));
  assert.equal(mode(dir), 0o700);
  for (const n of ['关于你.md', '日志.md', 'profile.json']) assert.equal(mode(join(dir, n)), 0o600, n);
  assert.ok(logs.filter((l) => l.event === 'memory_perms_fixed').length >= 3, 'logged');
  assert.equal(s.readable, true);
  const d2 = tmpDir();
  seed(d2, f22());
  chmodSync(join(d2, '关于你.md'), 0o000);
  const before = statSync(join(d2, '关于你.md'));
  const s2 = await open(d2);
  assert.equal(mode(join(d2, '关于你.md')), 0o000, 'not widened');
  assert.equal(statSync(join(d2, '关于你.md')).mtimeMs, before.mtimeMs);
  assert.equal(s2.readable, false); assert.deepEqual(s2.unreadable, ['about']);
  // a file owned by someone else cannot be set up without root: not tested here (said in the report)
});

test('TC-163 REQ-051: single writer lock: live foreign PID, stale PID, own PID, second gateway process, clean exit removes the lock', async () => {
  const dir = tmpDir();
  // (a)/(e) store A in a separate process that we started; it exits by itself when its stdin closes
  const holder = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createStore } from '${ROOT}server/memory-store.js';
    const s = createStore({ dir: ${JSON.stringify(dir)}, say: () => {} });
    await s.lock(); await s.load(); console.log('held');
    process.stdin.resume(); process.stdin.on('end', () => process.exit(0));`], { stdio: ['pipe', 'pipe', 'pipe'] });
  let hOut = ''; let hExit = null;
  holder.stdout.on('data', (c) => { hOut += c; }); holder.on('exit', (c) => { hExit = c; });
  try {
    await waitFor(() => hOut.includes('held'), 15000, 'store A holds the lock');
    const b = mk(dir);
    await assert.rejects(b.lock(), (e) => e instanceof FolderInUse && e.pid === holder.pid, 'FolderInUse with the PID of A');
    assert.equal(b.writable, false);
    holder.stdin.end();
    await waitFor(() => hExit !== null, 10000, 'store A exits');
    assert.equal(existsSync(join(dir, '.lock')), false, '(e) .lock is gone after the owner exits normally');
  } finally { if (hExit === null) holder.kill('SIGKILL'); }
  // (b) stale lock: a PID of a process that has exited
  const dead = spawn(process.execPath, ['-e', '0']);
  await new Promise((r) => dead.on('exit', r));
  writeFileSync(join(dir, '.lock'), String(dead.pid));
  const c = mk(dir);
  await c.lock();
  assert.equal(c.writable, true, 'stale lock replaced');
  assert.equal(readFileSync(join(dir, '.lock'), 'utf8').trim(), String(process.pid));
  // (c) our own PID
  const d = mk(dir);
  await d.lock();
  assert.equal(d.writable, true, 'own PID accepted');
  // (d) a second gateway process on the folder of a running one exits 1 and names the folder and the PID; the first keeps answering
  const gdir = tmpDir();
  const g1 = await startGateway({ dir: gdir });
  try {
    await g1.ready();
    const g2 = await startGateway({ dir: gdir });
    const t0 = Date.now();
    await waitFor(() => g2.exited, 20000, 'the second gateway exits');
    assert.equal(g2.exited.code, 1, g2.err);
    assert.ok(Date.now() - t0 < 15000, 'within seconds');
    assert.match(g2.err, new RegExp(`Memory folder in use by another Little Buddy \\(PID ${g1.pid}\\)`));
    assert.ok(g2.err.includes(gdir), 'names the folder');
    const h = await fetch(`${g1.base}/api/health`);
    assert.equal(h.status, 200, 'the first gateway still answers');
    await g2.stop();
  } finally { await g1.stop(); }
  assert.equal(existsSync(join(gdir, '.lock')), false, 'a gateway that exits through SIGTERM removes its lock');
});

test('TC-164 [FX-023] REQ-052/053: read-only folder 0500 / files 0400: reads work, settings and forget are not_saved, nothing changes, one stderr line', async () => {
  const dir = tmpDir();
  seed(dir, f23(), 0o400); chmodSync(dir, 0o500);
  const said = [];
  const before = snap(dir);
  const s = mk(dir, said);
  await s.lock();
  assert.equal(s.writable, false);
  await s.load();
  assert.equal(s.readable, true);
  assert.equal(s.profile().name, '团子'); assert.equal(s.profile().region, 'CN');
  assert.ok(s.aboutText().includes('在准备实习面试'));
  assert.equal(s.diary(today).hasAny, true);
  assert.equal(parseDiary(readFileSync(join(dir, '日志.md'), 'utf8')).entries.length, 3);
  await rejectsCode(s.setProfile({ name: 'Mochi' }), 'not_saved');
  await rejectsCode(s.forget(), 'not_saved');
  assert.equal(await s.recordMood('2026-11-16', 'neutral', 0), null);
  await s.applyUpdate({ gen: 0, ref: { gen: 0, line: 3 } }, '点', { add: { busy: ['x'], people: [], likes: [] } });
  sameSnap(snap(dir), before, 'bytes, mode, mtime of every file and the folder entries');
  assert.equal(said.length, 1); assert.match(said[0], /Memory folder is not writable/);
  // a second case: the folder does not exist and its parent is unwritable (mkdir EACCES)
  const parent = tmpDir();
  chmodSync(parent, 0o500);
  const said2 = [];
  const s2 = mk(join(parent, 'sub'), said2);
  await s2.lock();
  assert.equal(s2.writable, false); await s2.load(); assert.equal(s2.readable, true);
  assert.equal(said2.length, 1); assert.equal(existsSync(join(parent, 'sub')), false);
  // positive control: the same calls on a writable copy change the files
  const wdir = tmpDir();
  seed(wdir, f23());
  const w = await open(wdir);
  const b0 = snap(wdir);
  await w.setProfile({ name: 'Mochi' });
  assert.notDeepEqual(snap(wdir).files['profile.json'].bytes, b0.files['profile.json'].bytes);
  assert.notEqual(await w.recordMood('2026-11-16', 'neutral', 0), null);
});

test('TC-165 [FX-024] REQ-054: unreadable 关于你 (0000), 日志 (not UTF-8), profile.json (cut in half): fresh start, nothing written', async () => {
  const breakers = {
    about: (dir) => chmodSync(join(dir, '关于你.md'), 0o000),
    diary: (dir) => writeFileSync(join(dir, '日志.md'), Buffer.from([0xff, 0xfe, 0x41])),
    profile: (dir) => { const t = readFileSync(join(dir, 'profile.json')); writeFileSync(join(dir, 'profile.json'), t.subarray(0, Math.floor(t.length / 2))); },
  };
  for (const [key, brk] of Object.entries(breakers)) {
    const dir = tmpDir();
    seed(dir, f22());
    brk(dir);
    const before = snap(dir);
    const s = await open(dir);
    const tag = `broken ${key}`;
    assert.equal(s.readable, false, tag); assert.ok(s.unreadable.includes(key), tag);
    assert.deepEqual(s.profile(), { name: null, region: null, memoryOn: false, noticeSeen: false, ...R2_DEFAULTS }, tag);
    const v = s.view();
    assert.equal(v.aboutEmpty, true, tag); assert.equal(v.about, ABOUT_TEMPLATE, tag); assert.equal(v.kept, false, tag);
    const d = s.diary(today);
    assert.equal(d.readable, false, tag); assert.equal(d.hasAny, false, tag); assert.equal(d.days.length, 7, tag);
    assert.ok(d.days.every((x) => x.entries.length === 0 && x.value === null), tag);
    assert.equal(s.notes(), null, tag);
    await rejectsCode(s.setProfile({ name: 'Mochi' }), 'unreadable');
    await rejectsCode(s.forget(), 'unreadable');
    assert.equal(await s.recordMood('2026-11-16', 'neutral', s.generation), null, tag);
    await s.applyUpdate({ gen: 0, ref: null }, null, { add: { busy: ['x'], people: [], likes: [] } });
    const after = snap(dir);
    for (const n of Object.keys(before.files)) assert.deepEqual(after.files[n], before.files[n], `${tag}: ${n} unchanged (bytes, mode, size, mtime)`);
    assert.deepEqual(after.entries.filter((n) => !n.startsWith('.lock')), before.entries.filter((n) => !n.startsWith('.lock')), `${tag}: no new files`);
  }
});

test('TC-166 REQ-055/054: any markdown structure is readable, text is returned byte for byte, notes are the budget prefix, nothing is rewritten', async () => {
  const big = `# 关于你\n\n## 最近在忙\n${'- 一件很长很长的事情需要记下来\n'.repeat(120000)}`; // ~ 3 MB
  assert.ok(Buffer.byteLength(big) > 3e6);
  const variants = {
    empty: '', 'no headings': '喜欢咖啡\n不喜欢香菜\n', 'other order': '## 喜欢·不喜欢\n- a\n\n## 最近在忙\n- b\n\n## 在意的人和事\n- c\n', 'extra section': `${ABOUT_TEMPLATE}\n## 其他\n- 我的备注\n`,
    'only a title': '# 关于你\n', '3 MB': big,
  };
  for (const [name, text] of Object.entries(variants)) {
    const dir = tmpDir();
    seed(dir, { '关于你.md': text, '日志.md': '# 日志\n' });
    const before = snap(dir);
    const said = [];
    const s = await open(dir, said);
    assert.equal(s.readable, true, name);
    assert.equal(s.aboutText(), text, `${name}: byte for byte`);
    assert.equal(s.view().about, text, `${name}: the page text path returns the whole file`);
    const empty = text.split('\n').every((l) => l.trim() === '' || l.startsWith('#'));
    const n = s.notes();
    if (empty) assert.equal(n, null, name);
    else { assert.ok(text.startsWith(n) && wt(n) <= 1200, `${name}: first part within the budget`); if (wt(text) <= 1200) assert.equal(n, text, name); }
    assert.equal(snap(dir).files['关于你.md'].mtimeMs, before.files['关于你.md'].mtimeMs, `${name}: nothing rewritten at load`);
  }
  for (const [name, text] of Object.entries({ empty: '', 'header only': '# 日志\n', 'stray prose': '# 日志\n\n随便写的一段话\n没有日期\n' })) {
    const dir = tmpDir();
    seed(dir, { '日志.md': text });
    const s = await open(dir);
    assert.equal(s.readable, true, `diary ${name}`);
    assert.equal(s.diary(today).hasAny, false, `diary ${name}`);
    assert.equal(readFileSync(join(dir, '日志.md'), 'utf8'), text, `diary ${name} not rewritten`);
  }
});

test('TC-167 [FX-022, FX-023] REQ-047/049/052: settings persist across a new store; a failed write changes nothing', async () => {
  const dir = tmpDir();
  seed(dir, f22());
  const steps = [{ name: 'Mochi' }, { region: 'US' }, { region: 'other' }, { memoryOn: false }, { memoryOn: true }, { noticeSeen: true }];
  let expected = { memoryOn: true, noticeSeen: true, name: '团子', region: 'CN', ...R2_DEFAULTS }; // R2: every save writes the look and voice keys too (defaults here)
  for (const patch of steps) {
    const s = await open(dir);
    const out = await s.setProfile(patch);
    expected = { ...expected, ...patch };
    assert.deepEqual(out, expected, `returned object after ${JSON.stringify(patch)}`);
    const s2 = await open(dir);
    assert.deepEqual({ ...s2.profile() }, expected, `new store reads ${JSON.stringify(patch)}`);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')), { version: 1, ...expected });
  }
  // the name is cleaned by the request parser before the store (03 DES-036); store plus parser together return the cleaned name
  const patch = parseProfilePatch(Buffer.from(JSON.stringify({ name: 'Mochi 🎉 名字太长太长太长太长太长' })));
  const cleaned = await (await open(dir)).setProfile(patch);
  assert.ok([...cleaned.name].length <= 12 && !cleaned.name.includes('🎉'), 'name cleaned');
  writeFileSync(join(dir, 'profile.json'), JSON.stringify({ version: 1, name: '团子', region: 'CN', memoryOn: true, noticeSeen: false, theme: 'dark' }, null, 2));
  assert.equal(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).theme, 'dark');
  await (await open(dir)).setProfile({ name: 'Q' });
  assert.equal(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).theme, 'dark', 'unknown keys kept');
  // failing writes: the folder becomes unwritable after lock(), so writable is still true and the temp file cannot be created
  const fails = [{ name: 'Mochi' }, { region: 'US' }, { memoryOn: false }, { noticeSeen: true }, { memoryOn: false, noticeSeen: true }];
  for (const patch of fails) {
    const d = tmpDir();
    seed(d, f23());
    const s = mk(d); await s.lock(); await s.load();
    assert.equal(s.writable, true);
    const before = snap(d); const old = s.profile();
    chmodSync(d, 0o500);
    await rejectsCode(s.setProfile(patch), 'not_saved');
    chmodSync(d, 0o700);
    assert.deepEqual(s.profile(), old, `profile() keeps the old values for ${JSON.stringify(patch)}`);
    assert.equal(snap(d).files['profile.json'].bytes, before.files['profile.json'].bytes);
    assert.ok(!names(d).some((n) => n.endsWith('.tmp')), 'no .tmp left');
  }
});

async function forgetState(extraFiles = {}) {
  const dir = tmpDir();
  seed(dir, { ...f22(), ...extraFiles });
  const s = await open(dir);
  return { dir, s };
}

test('TC-168 [FX-022, FX-023-06] REQ-050/053: forget is all or nothing; success in <= 1 s; failures at each stage change nothing', async () => {
  // (a) success, 3 timed runs
  for (let i = 0; i < 3; i++) {
    const { dir, s } = await forgetState();
    const profileBytes = readFileSync(join(dir, 'profile.json'));
    const gen = s.generation;
    const t0 = Date.now();
    const out = await s.forget();
    const ms = Date.now() - t0;
    assert.deepEqual(out, { memoryOn: true }); assert.ok(ms <= 1000, `${ms} ms`);
    assert.equal(readFileSync(join(dir, '关于你.md'), 'utf8'), ABOUT_TEMPLATE);
    assert.deepEqual([...readFileSync(join(dir, '关于你.md'), 'utf8').matchAll(/^## (.+)$/gm)].map((m) => m[1]), fx('FX-022').expected.cases[1].about_headings);
    assert.equal(readFileSync(join(dir, '日志.md'), 'utf8'), '# 日志\n');
    assert.equal(parseDiary(readFileSync(join(dir, '日志.md'), 'utf8')).entries.length, 0);
    assert.ok(readFileSync(join(dir, 'profile.json')).equals(profileBytes), 'profile.json byte-identical');
    assert.equal(s.generation, gen + 1);
    assert.ok(!names(dir).some((n) => n === '.forget' || n.endsWith('.tmp')), 'no marker or temp left');
  }
  // (b) failures injected by file-system state after load
  const injections = {
    'marker write fails (a .forget already there)': (dir) => writeFileSync(join(dir, '.forget'), ''),
    'staging fails (a directory in the temp path)': (dir) => mkdirSync(join(dir, '.关于你.md.tmp')),
    'rename of 关于你 fails (a non-empty directory in its place)': (dir) => { rmSync(join(dir, '关于你.md')); mkdirSync(join(dir, '关于你.md')); writeFileSync(join(dir, '关于你.md', 'x'), 'x'); },
  };
  const problems = [];
  for (const [name, inject] of Object.entries(injections)) {
    const { dir, s } = await forgetState();
    inject(dir);
    const before = snap(dir); const gen = s.generation;
    let err = null;
    try { await s.forget(); } catch (e) { err = e; }
    const left = names(dir).filter((n) => n === '.forget' || n.endsWith('.tmp'));
    const injectedLeft = { 'marker write fails (a .forget already there)': ['.forget'], 'staging fails (a directory in the temp path)': ['.关于你.md.tmp'], 'rename of 关于你 fails (a non-empty directory in its place)': [] }[name];
    const got = { rejected: err?.code ?? (err ? err.message : 'resolved'), generation: s.generation === gen, extraLeft: left.filter((n) => !injectedLeft.includes(n)), diaryBytes: snap(dir).files['日志.md']?.bytes === before.files['日志.md'].bytes, profileBytes: snap(dir).files['profile.json'].bytes === before.files['profile.json'].bytes };
    const ok = got.rejected === 'not_saved' && got.generation && got.extraLeft.length === 0 && got.diaryBytes && got.profileBytes;
    if (!ok) problems.push(`${name}: ${JSON.stringify(got)}; entries left now: ${names(dir).join(',')}`);
  }
  // (c) read-only (TC-164 state)
  { const dir = tmpDir(); seed(dir, f23(), 0o400); chmodSync(dir, 0o500); const s = await open(dir); const b = snap(dir);
    await rejectsCode(s.forget(), 'not_saved'); sameSnap(snap(dir), b, 'read-only: nothing touched'); }
  // (d) unreadable (TC-165 state)
  { const dir = tmpDir(); seed(dir, f22()); writeFileSync(join(dir, '日志.md'), Buffer.from([0xff, 0xfe])); const s = await open(dir); const b = snap(dir);
    await rejectsCode(s.forget(), 'unreadable'); sameSnap(snap(dir), b, 'unreadable: nothing touched'); }
  assert.deepEqual(problems, [], `stage failures must reject not_saved, change nothing and leave no marker or temp:\n${problems.join('\n')}`);
});

test('TC-169 REQ-050/053: forget interrupted after the commit point is finished by the next start; an unwritable folder fails closed', async () => {
  // (a) the diary rename fails: the marker stays, the call still answers 200
  const { dir, s } = await forgetState();
  const fullDiary = readFileSync(join(dir, '日志.md'), 'utf8');
  rmSync(join(dir, '日志.md')); mkdirSync(join(dir, '日志.md')); writeFileSync(join(dir, '日志.md', 'x'), 'x');
  const { result: out, logs } = await captureLogs(() => s.forget());
  const problems = [];
  assert.deepEqual(out, { memoryOn: true });
  const fl = logs.find((l) => l.event === 'memory_forget');
  assert.ok(fl && fl.ok === false && fl.stage === 'rename_diary', `log memory_forget ok:false stage:rename_diary, got ${JSON.stringify(fl)}`);
  assert.ok(existsSync(join(dir, '.forget')), 'marker stays');
  rmSync(join(dir, '日志.md'), { recursive: true }); writeFileSync(join(dir, '日志.md'), fullDiary); // restore the full diary
  const { result: s2, logs: l2 } = await captureLogs(() => open(dir));
  const loaded = l2.find((l) => l.event === 'memory_loaded');
  if (loaded.forget_redone !== true || !s2.readable) problems.push(`(a) the next load did not complete the forget: ${JSON.stringify(loaded)}; entries ${names(dir).join(',')}`);
  if (readFileSync(join(dir, '日志.md'), 'utf8') !== '# 日志\n') problems.push('(a) diary is not empty after the next load');
  if (s2.diary(today).hasAny) problems.push('(a) diary still has entries');
  if (existsSync(join(dir, '.forget'))) problems.push('(a) marker not gone');
  // (b) the post-commit state made by hand
  const d2 = tmpDir();
  seed(d2, { ...f22(), '关于你.md': ABOUT_TEMPLATE });
  writeFileSync(join(d2, '.forget'), '');
  const s3 = await open(d2);
  assert.equal(readFileSync(join(d2, '日志.md'), 'utf8'), '# 日志\n'); assert.ok(!existsSync(join(d2, '.forget'))); assert.equal(s3.readable, true);
  // (c) the same with an unwritable folder: nothing comes back, nothing is written
  const d3 = tmpDir();
  seed(d3, { ...f22(), '关于你.md': ABOUT_TEMPLATE }, 0o400);
  writeFileSync(join(d3, '.forget'), '', { mode: 0o400 }); chmodSync(d3, 0o500);
  const b = snap(d3);
  const s4 = await open(d3);
  assert.equal(s4.writable, false); assert.equal(s4.readable, false);
  assert.ok(s4.unreadable.includes('about') && s4.unreadable.includes('diary'), 'about and diary unreadable');
  assert.equal(s4.diary(today).hasAny, false, 'no old facts come back');
  sameSnap(snap(d3), b, 'nothing written');
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('TC-170 REQ-044/049/050: skip rules for recordMood and applyUpdate; none throws; positive control writes', async () => {
  const dir = tmpDir();
  seed(dir, { ...f22(), '日志.md': '# 日志\n' });
  const s = await open(dir);
  const D = '2026-11-16';
  const read = (n) => readFileSync(join(dir, n), 'utf8');
  // positive control
  const ref = await s.recordMood(D, 'pleasant-high', s.generation);
  assert.ok(ref && ref.gen === 0);
  assert.equal(read('日志.md').trim().split('\n').at(-1), '- 开心');
  assert.equal(parseDiary(read('日志.md')).entries.at(-1).line, ref.line, 'returned line points at it');
  const m0 = snap(dir);
  await s.applyUpdate({ gen: 0, ref }, '模拟面试顺利', { add: { busy: ['在练面试'], people: [], likes: [] } });
  assert.match(read('日志.md'), /- 开心 · 模拟面试顺利/); assert.match(read('关于你.md'), /- 在练面试/);
  const ref2 = await s.recordMood(D, 'neutral', 0);
  await s.applyUpdate({ gen: 0, ref: null }, '不该写', { add: { busy: ['只写笔记'], people: [], likes: [] } });
  assert.ok(!read('日志.md').includes('不该写') && read('关于你.md').includes('只写笔记'), 'ref null writes only the notes');
  void ref2; void m0;
  // skips: bytes and mtime stay equal
  const still = async (name, fn) => { const b = snap(dir); await fn(); sameSnap(snap(dir).files, b.files, name); };
  await still('unchanged text, no new lines', () => s.applyUpdate({ gen: 0, ref: null }, null, { add: { busy: [], people: [], likes: [] } }));
  await still('a line already there', () => s.applyUpdate({ gen: 0, ref: null }, null, { add: { busy: ['只写笔记'], people: [], likes: [] } }));
  await still('point null and update null', () => s.applyUpdate({ gen: 0, ref }, null, null));
  await still('stale gen update', () => s.applyUpdate({ gen: 5, ref }, '旧', { add: { busy: ['旧事'], people: [], likes: [] } }));
  await still('stale gen mood', async () => assert.equal(await s.recordMood(D, 'neutral', 9), null));
  await s.setProfile({ memoryOn: false });
  await still('memory off: mood', async () => assert.equal(await s.recordMood(D, 'neutral', s.generation), null));
  await still('memory off: update', () => s.applyUpdate({ gen: 0, ref }, 'x', { add: { busy: ['关了不写'], people: [], likes: [] } }));
  await s.setProfile({ memoryOn: true });
  await s.forget();
  await still('after a forget the old generation is dropped (mood)', async () => assert.equal(await s.recordMood(D, 'neutral', 0), null));
  await still('after a forget the old generation is dropped (update)', () => s.applyUpdate({ gen: 0, ref }, 'x', { add: { busy: ['忘了又来'], people: [], likes: [] } }));
  assert.notEqual(await s.recordMood(D, 'neutral', s.generation), null, 'the new generation records');
  // unreadable and read-only stores never throw and never write
  const d2 = tmpDir(); seed(d2, f22()); writeFileSync(join(d2, 'profile.json'), '{'); const s2 = await open(d2); const b2 = snap(d2);
  assert.equal(await s2.recordMood(D, 'neutral', 0), null); await s2.applyUpdate({ gen: 0, ref: null }, null, { add: { busy: ['x'], people: [], likes: [] } });
  sameSnap(snap(d2).files, b2.files, 'unreadable');
});

test('TC-171 REQ-055/049/054: notes() is the reply\'s view of 关于你', async () => {
  const hanFile = `# 关于你\n\n## 最近在忙\n${Array.from({ length: 100 }, (_, i) => `- ${String(i).padStart(3, '0')}${'事'.repeat(16)}`).join('\n')}\n`;
  assert.ok([...hanFile].filter((c) => /\p{Script=Han}/u.test(c)).length >= 1600);
  const long = tmpDir(); seed(long, { '关于你.md': hanFile });
  const said = [];
  const s = await open(long, said);
  const n1 = s.notes();
  assert.ok(hanFile.startsWith(n1) && wt(n1) <= 1200 && n1.length < hanFile.length);
  assert.equal(s.aboutText(), hanFile, 'aboutText() still returns everything');
  const n2 = s.notes();
  assert.equal(n2, n1);
  assert.equal(said.length, 1, 'the cut hint is said once per run, not on the second call');
  const short = tmpDir(); seed(short, { '关于你.md': '# 关于你\n\n## 最近在忙\n- 面试\n' });
  const sSaid = []; const s3 = await open(short, sSaid);
  assert.equal(s3.notes(), '# 关于你\n\n## 最近在忙\n- 面试\n'); assert.equal(sSaid.length, 0, 'no hint for the short file');
  await s3.setProfile({ memoryOn: false }); assert.equal(s3.notes(), null, 'memory off');
  const empty = tmpDir(); seed(empty, { '关于你.md': ABOUT_TEMPLATE }); assert.equal((await open(empty)).notes(), null, 'empty template');
  const unread = tmpDir(); seed(unread, { '关于你.md': ABOUT_TEMPLATE }); chmodSync(join(unread, '关于你.md'), 0); assert.equal((await open(unread)).notes(), null, 'unreadable');
});

void utimesSync; void sleep;
