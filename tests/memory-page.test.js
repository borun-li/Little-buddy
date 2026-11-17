// R1 memory, group E (page, headless Chromium through tests/support/page-driver.py, Playwright for Python) against the REAL gateway with the
// scripted Bonsai double: TC-204, 205, 206, 208, 209, 210, 211, 212. TC-203, 207, 213 need real Bonsai (be-tester #5). be-tester #4.
// Every gateway has its own temp LITTLEBUDDY_DATA_DIR and a port >= 4450. Hooks are data-testid values read from web/index.html and
// web/js/memory-ui.js. If the browser harness is missing, each TC is reported blocked (skipped with the reason), never passed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  api, cleanupTmp, diaryEntries, filesOf, fx, mode, readAbout, readDiary, ROOT, round3, seed, sleep, snap, startGateway, tmpDir, wt,
} from './memory-helpers.js';

after(cleanupTmp);
const PY = existsSync('/opt/anaconda3/bin/python') ? '/opt/anaconda3/bin/python' : 'python3';
let harness = null;
try { execFileSync(PY, ['-c', 'import playwright.sync_api'], { stdio: 'ignore' }); } catch { harness = `no Playwright for Python at ${PY}`; }
const opts = { ...(harness ? { skip: harness } : {}), timeout: 240000 };
const ABOUT_T = '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n';

function page(scenario, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [`${ROOT}tests/support/page-driver.py`, scenario, JSON.stringify(args)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 150000);
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
const gwFor = async (dir, extra = {}) => { const gw = await startGateway({ dir, ...extra }); await gw.ready(); return gw; };
const script = { moods: [{ when: '开心', mood: 'pleasant-high' }], replies: [{ reply: '好的，我在听。' }] };

test('TC-204 [FX-021-02] REQ-036: a new user sees the first-run notice before sending, with the folder and a turn-off control; default name', opts, async () => {
  const dir = join(tmpDir(), 'LittleBuddy');
  const gw = await gwFor(dir, { script });
  try {
    const want = fx('FX-021').expected.cases[1];
    const r = await page('notice', { base: gw.base });
    const p = (await api(gw.base, '/api/profile')).json;
    assert.equal(r.notice_visible, want.notice_before_first_send);
    assert.equal(r.notice_text.includes(p.path), want.notice_shows_path, `the notice shows ${p.path}`);
    assert.equal(r.has_turn_off, want.notice_has_turn_off_action);
    assert.equal(r.name_shown, want.name_shown); assert.equal(p.name, want.profile_name);
    assert.equal(r.turns_before_send, 0, 'nothing sent yet');
    assert.ok(!/什么都不会(记|存)|不会记住任何|nothing (is |will be )?(kept|saved|remembered)/i.test(r.notice_text), 'the notice does not say that nothing is kept');
  } finally { await gw.stop(); }
});

// the fixture's PAGE_RULES text rule (FX-025): markers removed per line, all whitespace removed
const ruleText = (md) => md.split('\n').map((l) => l.replace(/^[#\-*>\s]+/, '')).join('').replace(/\s+/g, '');
test('TC-205 [FX-022-01, FX-025-05] REQ-043/055: the page shows 关于你.md word for word, read-only, whole even at 2000 characters; template shows the empty state', opts, async () => {
  const cases = [['FX-022-01', filesOf('FX-022')['关于你.md']], ['FX-025-05', fx('FX-025').input.cases[4].files['关于你.md']],
    ['2000 Han', `# 关于你\n\n## 最近在忙\n${Array.from({ length: 111 }, (_, i) => `- 第${String(i + 1).padStart(3, '0')}行${'事'.repeat(16)}`).join('\n')}\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n`]];
  const strict = [];
  for (const [name, md] of cases) {
    const dir = tmpDir(); seed(dir, { '关于你.md': md, 'profile.json': filesOf('FX-022')['profile.json'] });
    const gw = await gwFor(dir, { script });
    try {
      const r = await page('about', { base: gw.base });
      assert.equal(r.empty_state, false, `${name}: not the empty state`);
      assert.equal(r.chunks.content.replace(/\s+/g, ''), ruleText(md), `${name}: about_text_matches_file (PAGE_RULES, the file's caption label excluded)`);
      strict.push([name, r.chunks.withCaption.replace(/\s+/g, '') === ruleText(md), r.chunks.caption]);
      assert.equal(r.chunks.editable, false, `${name}: no input, textarea or contenteditable inside the box`);
      assert.equal(r.typing_changed, false, `${name}: typing into the box changes nothing`);
      if (name === 'FX-025-05') assert.ok(r.chunks.content.includes(fx('FX-025').input.cases[5].hand_line), 'shows_hand_line');
      if (name === '2000 Han') assert.ok(r.chunks.content.includes('第111行'), 'the 2000-char file is shown whole (the reply budget does not apply)');
    } finally { await gw.stop(); }
  }
  console.log(`TC-205 note: textContent of the whole box including its file-name caption equals the rule text? ${JSON.stringify(strict)}`);
  const dir = tmpDir(); seed(dir, { '关于你.md': ABOUT_T });
  const gw = await gwFor(dir, { script });
  try { const r = await page('about', { base: gw.base }); assert.equal(r.empty_state, true, 'the template shows the empty state'); assert.equal(r.chunks, null); } finally { await gw.stop(); }
});

test('TC-206 [FX-022-02] REQ-050/043: forget me on the page: <= 1 s, empty after, chat cleared, history [] on the next request, still empty after a restart', opts, async () => {
  const dir = tmpDir(); const files = filesOf('FX-022'); seed(dir, files);
  const gw = await gwFor(dir, { script });
  let gw2;
  try {
    const want = fx('FX-022').expected.cases[1];
    const r = await page('forget', { base: gw.base, lines: ['今天开心', '再说一句'] });
    assert.equal(r.forget_status, 200);
    assert.ok(r.ms <= 1000, `click to result ${Math.round(r.ms)} ms`);
    assert.equal(want.forget_ms_le_1000, true);
    assert.deepEqual([r.about_empty_visible, r.turns_before > 0, r.turns_after], [true, true, 0], 'the chat on screen is cleared and About you reads empty');
    assert.equal(readAbout(dir), ABOUT_T);
    assert.deepEqual([...readAbout(dir).matchAll(/^## (.+)$/gm)].map((m) => m[1]), want.about_headings);
    assert.deepEqual([r.diary_has_any, r.about_empty_api], [false, true], 'diary has 0 entries and About you is empty right after the forget');
    const p = (await api(gw.base, '/api/profile')).json;
    assert.deepEqual({ name: p.name, region: p.region, memoryOn: p.memoryOn }, want.profile);
    gw2 = await gw.restart();
    const e = await page('empty_tabs', { base: gw2.base });
    assert.deepEqual([e.about_empty_state, e.diary_empty_state], [want.after_restart.about_empty_state, want.after_restart.diary_empty_state]);
    assert.equal((await api(gw2.base, '/api/diary')).json.hasAny, false);
    const r2 = await page('forget', { base: gw2.base, lines: ['今天开心'], send_after: true });
    assert.deepEqual(r2.last_history, [], 'after the forget the next respond request carries history [] (A36)');
  } finally { await (gw2 ?? gw).stop(); }
});

const f23State = (dir) => { seed(dir, filesOf('FX-023'), 0o400); chmodSync(dir, 0o500); };
test('TC-208 [FX-023-01..05] REQ-052: settings that cannot be saved: 500 not_saved, the page says so, old value shown, files unchanged, old values after a restart', opts, async () => {
  const want = fx('FX-023').expected.cases;
  const problems = [];
  const names = ['name', 'region', 'memory', 'notice_ok', 'notice_off'];
  for (const [i, c] of names.entries()) {
    const dir = tmpDir(); f23State(dir);
    const before = snap(dir);
    let gw = await gwFor(dir, { script });
    try {
      const r = await page('setting_fail', { base: gw.base, case: c });
      const w = want[i];
      const tag = w.id;
      if (r.status !== w.status) problems.push(`${tag}: POST status ${r.status}, want ${w.status}`);
      const saysNot = r.msgs.some((m) => m.includes('没存上')) || r.hint.includes('没存上') || r.hint.includes('没关成');
      if (saysNot !== w.page_says_not_saved) problems.push(`${tag}: page says not saved = ${saysNot} (msgs ${JSON.stringify(r.msgs)}, hint ${JSON.stringify(r.hint)})`);
      if (JSON.stringify(snap(dir)) !== JSON.stringify(before)) problems.push(`${tag}: files changed`);
      if (w.shown?.name !== undefined && r.shown.name !== w.shown.name) problems.push(`${tag}: name shown ${r.shown.name}`);
      if (w.shown?.region !== undefined && r.shown.region !== w.shown.region) problems.push(`${tag}: region shown ${r.shown.region}`);
      if (w.shown?.memoryOn !== undefined && r.shown.memoryOn !== String(w.shown.memoryOn)) problems.push(`${tag}: switch shown ${r.shown.memoryOn}`);
      if (r.profile_api.name !== '团子' || r.profile_api.region !== 'CN' || r.profile_api.memoryOn !== true) problems.push(`${tag}: API after the failure ${JSON.stringify([r.profile_api.name, r.profile_api.region, r.profile_api.memoryOn])}`);
      gw = await gw.restart();
      const p = (await api(gw.base, '/api/profile')).json;
      if (w.after_restart.name !== undefined && p.name !== w.after_restart.name) problems.push(`${tag}: name after restart ${p.name}`);
      if (w.after_restart.region !== undefined && p.region !== w.after_restart.region) problems.push(`${tag}: region after restart ${p.region}`);
      if (w.after_restart.memoryOn !== undefined && p.memoryOn !== w.after_restart.memoryOn) problems.push(`${tag}: memoryOn after restart ${p.memoryOn}`);
      if (w.after_restart.notice !== undefined) { const n = await page('notice', { base: gw.base }); if (n.notice_visible !== w.after_restart.notice) problems.push(`${tag}: notice after restart ${n.notice_visible}`); }
    } finally { await gw.stop(); }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('TC-209 [FX-023-06] REQ-053: forget that cannot be done: 500 not_saved, the page says not deleted, files and chat unchanged; works once the folder is writable again', opts, async () => {
  const dir = tmpDir(); f23State(dir);
  const before = snap(dir);
  let gw = await gwFor(dir, { script });
  const want = fx('FX-023').expected.cases[5];
  const problems = [];
  try {
    const r = await page('forget_fail', { base: gw.base, line: '今天开心' });
    if (r.status !== 500) problems.push(`status ${r.status}`);
    if (!r.asked_text.includes('没删成')) problems.push(`page does not say not deleted: ${JSON.stringify(r.asked_text)}`);
    if (r.turns_after !== r.turns_before || r.turns_before === 0) problems.push(`chat not kept: ${r.turns_before} -> ${r.turns_after}`);
    if (r.switch !== 'true') problems.push(`switch ${r.switch}`);
    // the chat line's own mood write is refused too (read-only), so the files are exactly as they were
    if (JSON.stringify(snap(dir)) !== JSON.stringify(before)) problems.push('files changed');
    gw = await gw.restart();
    const r2 = await page('forget_fail', { base: gw.base });
    if (r2.status !== 500 || JSON.stringify(snap(dir)) !== JSON.stringify(before)) problems.push(`after restart: status ${r2.status}, files same ${JSON.stringify(snap(dir)) === JSON.stringify(before)}`);
    await gw.stop();
    chmodSync(dir, 0o700); for (const n of ['关于你.md', '日志.md', 'profile.json']) chmodSync(join(dir, n), 0o600);
    gw = await gwFor(dir, { script });
    const r3 = await page('forget_fail', { base: gw.base, expect_ok: true });
    if (r3.status !== 200 || !r3.result_visible) problems.push(`after the permissions are back: ${JSON.stringify(r3)}`);
    if (readAbout(dir) !== ABOUT_T || diaryEntries(readDiary(dir)).length !== 0) problems.push('not emptied once writable');
    assert.equal(want.after_writable.status, 200);
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('TC-210 [FX-024] REQ-054: unreadable storage on the page: says so, default name, no retry loop, controls refuse, chat works, files unchanged', opts, async () => {
  const problems = [];
  const breakers = { 'FX-024-01 (关于你.md 0000)': (d) => chmodSync(join(d, '关于你.md'), 0o000), 'FX-024-02 (profile.json cut)': (d) => { const t = readFileSync(join(d, 'profile.json')); writeFileSync(join(d, 'profile.json'), t.subarray(0, t.length >> 1)); } };
  for (const [name, brk] of Object.entries(breakers)) {
    const dir = tmpDir(); seed(dir, filesOf('FX-022')); brk(dir);
    const before = snap(dir);
    const gw = await gwFor(dir, { script });
    try {
      const r = await page('unreadable', { base: gw.base });
      if (!r.privacy.includes('读不出来')) problems.push(`${name}: page_says_unreadable false: ${r.privacy}`);
      if (r.name_shown !== '小伙伴') problems.push(`${name}: name shown ${r.name_shown}`);
      if (r.notice_visible) problems.push(`${name}: a first-run notice over unreadable files`);
      if (!r.diary_text.includes('读不出来') || !r.diary_retry) problems.push(`${name}: diary tab: ${JSON.stringify(r.diary_text)}`);
      if (r.diary_requests[1] !== r.diary_requests[0] || r.diary_requests[0] > 2) problems.push(`${name}: /api/diary requests ${r.diary_requests} (must stay small and constant over 10 s)`);
      if (!r.about_text.includes('读不出来') && !r.about_text.includes('暂时读不出')) problems.push(`${name}: about tab words ${JSON.stringify(r.about_text)}`);
      if (!(r.dead.name_disabled && r.dead.region_disabled && r.dead.switch_disabled) || r.dead.forget_present) problems.push(`${name}: controls not refused ${JSON.stringify(r.dead)}`);
      if (r.post_requests.length) problems.push(`${name}: the page POSTed ${r.post_requests}`);
      if (!r.chat_works) problems.push(`${name}: chat does not work`);
      const after = snap(dir);
      for (const n of Object.keys(before.files)) if (JSON.stringify(after.files[n]) !== JSON.stringify(before.files[n]) && !(n === '日志.md' && false)) problems.push(`${name}: ${n} changed`);
    } finally { await gw.stop(); }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('TC-211 [FX-019] REQ-045/046: the diary tab shows the curve (gaps at the empty days) and the day list in file order; empty state; 36,500 entries in <= 1 s; same after reload and restart', opts, async () => {
  const NOON = '2026-11-15T12:00:00-05:00';
  const D = fx('FX-019');
  const prof = JSON.stringify({ version: 1, name: null, region: null, memoryOn: true, noticeSeen: true });
  const problems = [];
  const ck = (c, m) => { if (!c) problems.push(m); };
  const dir = tmpDir(); seed(dir, { '日志.md': D.input.cases[0].files['日志.md'], 'profile.json': prof });
  let gw = await gwFor(dir, { script, clock: NOON, tz: 'America/New_York' });
  const wantDays = D.expected.cases[0].days;
  const check = (r, tag) => {
    ck(r.dots.length === 5 && r.none === 2, `${tag}: ${r.dots.length} dots and ${r.none} "no record" gaps (want 5 and 2)`);
    const vals = wantDays.filter((d) => d.value !== null);
    r.dots.forEach((d, i) => { const top = parseFloat(d.top); const want = ((1 - vals[i].value) / 2) * 100; ck(Math.abs(top - want) < 0.5, `${tag}: dot ${i} at ${top}%, want ${want.toFixed(1)}%`); });
    ck(r.days.map((d) => d.head).join('|') === '11月15日 · 今天|11月14日|11月12日|11月11日|11月9日', `${tag}: days ${r.days.map((d) => d.head)}`);
    const d15 = r.days[0].rows;
    ck(JSON.stringify(d15.map((x) => [x.point, x.mood])) === JSON.stringify([['模拟面试顺利', '开心'], ['下雨鞋湿了', '难过'], ['', '平常'], ['妹妹周末要来', '开心']]), `${tag}: 11-15 rows ${JSON.stringify(d15)}`);
    const d09 = r.days[4].rows;
    ck(JSON.stringify(d09.map((x) => [x.point, x.mood])) === JSON.stringify([['论文被导师打回', '难过'], ['一夜没睡好', '难过'], ['', '平常']]), `${tag}: 11-09 rows ${JSON.stringify(d09)}`);
    ck(!r.days.some((d) => d.head.includes('11月7日')), `${tag}: 11-07 absent`);
  };
  try {
    check(await page('diary', { base: gw.base }), 'FX-019-01');
    gw = await gw.restart();
    check(await page('diary', { base: gw.base }), 'FX-019-01 after restart');
  } finally { await gw.stop(); }
  const d3 = tmpDir(); seed(d3, { 'profile.json': prof });
  gw = await gwFor(d3, { script, clock: NOON, tz: 'America/New_York' });
  try { const r = await page('diary', { base: gw.base }); ck(r.start && !r.curve, `FX-019-03: empty state ${JSON.stringify([r.start, r.curve])}`); } finally { await gw.stop(); }
  const lines = ['# 日志'];
  for (let t = Date.UTC(2025, 10, 16); t <= Date.UTC(2026, 10, 15); t += 86400000) { lines.push('', `## ${new Date(t).toISOString().slice(0, 10)}`); for (let k = 0; k < 100; k++) lines.push(`- ${['开心', '平静', '平常', '紧张', '难过'][k % 5]} · 第${k + 1}条`); }
  const d4 = tmpDir(); seed(d4, { '日志.md': `${lines.join('\n')}\n`, 'profile.json': prof });
  gw = await gwFor(d4, { script, clock: NOON, tz: 'America/New_York' });
  try {
    const r = await page('diary', { base: gw.base });
    ck(r.ms <= 1000, `FX-019-04: tab open to list shown ${Math.round(r.ms)} ms (limit 1000)`);
    ck(r.days.length === 7 && r.days.every((d) => d.rows.length === 100), `FX-019-04: ${r.days.map((d) => d.rows.length)}`);
    console.log(`TC-211 FX-019-04 page ms: ${Math.round(r.ms)}`);
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('TC-212 REQ-036/043/047/048/049/050/051: every control does its action on real data; every resource answers 200; only the page origin is requested', opts, async () => {
  const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': JSON.stringify({ version: 1, name: null, region: null, memoryOn: true, noticeSeen: false }) });
  const gw = await gwFor(dir, { script });
  const problems = [];
  try {
    const r = await page('sweep', { base: gw.base });
    for (const c of r.checks) if (!c.ok) problems.push(`${c.name}: ${JSON.stringify(c.detail)}`);
    console.log(`TC-212 checks: ${r.checks.length} (${r.checks.filter((c) => c.ok).length} ok); resources: ${r.urls.length}`);
    if (r.checks.length < 20) problems.push(`only ${r.checks.length} checks ran`);
  } finally { await gw.stop(); }
  const d2 = tmpDir(); seed(d2, { '日志.md': '# 日志\n' });
  const g2 = await gwFor(d2, { script });
  try { const r = await page('sweep_off', { base: g2.base }); for (const c of r.checks) if (!c.ok) problems.push(`${c.name}: ${JSON.stringify(c.detail)}`); } finally { await g2.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});



// ====================================================================================================================
// fe-tester #3, review fixes round 2 (FND-042..046, 052, 061; Q-037, 038, 040, 047, 049). Expected words are read from the
// UX table (docs/frontend/r1-memory/01-ux.md §5), not from web/js/copy.js, so a copy change that follows the table stays green
// and a wrong sentence goes red.
const UX = readFileSync(`${ROOT}docs/frontend/r1-memory/01-ux.md`, 'utf8');
const ux = (key) => {
  for (const line of UX.split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length > 5 && c[2].split(' / ').map((k) => k.replaceAll('`', '')).includes(key) && c[2].startsWith('`')) {
      const keys = c[2].split(' / ').map((k) => k.replaceAll('`', ''));
      const at = keys.indexOf(key);
      const pick = (cell) => (keys.length > 1 ? cell.split(' / ')[at] : cell);
      return { zh: pick(c[3]), en: pick(c[4]) };
    }
  }
  throw new Error(`no row for ${key} in 01-ux.md §5`);
};
const NOTICE_UNSEEN = JSON.stringify({ version: 1, name: '团子', region: 'CN', memoryOn: true, noticeSeen: false });
const SEEN = JSON.stringify({ version: 1, name: null, region: null, memoryOn: true, noticeSeen: true });
const SEEN_OFF = JSON.stringify({ version: 1, name: null, region: null, memoryOn: false, noticeSeen: true });
const respondEntries = (dir) => diaryEntries(readDiary(dir));

test('Q-043 FND-042: a caption rename whose save answers 500 or 409 keeps the old caption, says it did not save, and the next respond carries no new name', opts, async () => {
  const saveFailed = ux('saveFailed');
  const problems = [];
  const dir = tmpDir(); f23State(dir);
  const before = snap(dir);
  const gw = await gwFor(dir, { script });
  const cases = [['real 500 (read-only folder)', {}], ['route 500 not_saved', { status: 500, code: 'not_saved' }], ['route 409 unreadable', { status: 409, code: 'unreadable' }]];
  try {
    for (const [label, extra] of cases) {
      const r = await page('caption_fail', { base: gw.base, ...extra });
      if (r.caption_before !== '团子') problems.push(`${label}: caption before ${r.caption_before}`);
      if (r.caption_after !== '团子') problems.push(`${label}: caption after the failed save ${r.caption_after}, want 团子`);
      if (r.hint !== saveFailed.zh) problems.push(`${label}: hint ${JSON.stringify(r.hint)}, want ${JSON.stringify(saveFailed.zh)}`);
      if (r.respond_names.length !== 1 || r.respond_names[0] !== '团子') problems.push(`${label}: respond names ${JSON.stringify(r.respond_names)}, want ["团子"]`);
      if (r.caption_after_reload !== '团子') problems.push(`${label}: after reload ${r.caption_after_reload}`);
      if (extra.status ? r.post_status !== extra.status : r.post_status !== 500) problems.push(`${label}: POST status ${r.post_status}`);
    }
    if (JSON.stringify(snap(dir)) !== JSON.stringify(before)) problems.push('files changed');
    // positive control: a writable folder takes the same rename, the caption follows, and respond carries the new name
    const d2 = tmpDir(); seed(d2, filesOf('FX-022'));
    const g2 = await gwFor(d2, { script });
    try {
      const ok = await page('caption_fail', { base: g2.base });
      if (ok.caption_after !== 'Mochi' || ok.hint === saveFailed.zh || ok.respond_names[0] !== 'Mochi' || ok.caption_after_reload !== 'Mochi') problems.push(`control (writable): ${JSON.stringify([ok.caption_after, ok.hint, ok.respond_names, ok.caption_after_reload])}`);
    } finally { await g2.stop(); }
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-022 FND-043: 清空 during an in-flight reply aborts the request, shows no late reply, and the diary gets no entry for that line', opts, async () => {
  const slow = { moods: [{ when: '慢一点', mood: 'pleasant-high' }], replies: [{ when: '慢一点', reply: '我来晚了。', delayMs: 2500 }] };
  const problems = [];
  const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), '日志.md': '# 日志\n' });
  const gw = await gwFor(dir, { script: slow });
  try {
    const r = await page('clear_inflight', { base: gw.base, line: '慢一点说话', watch_ms: 5000 });
    if (!r.failed.includes('/api/respond')) problems.push(`the respond request was not aborted: failed=${JSON.stringify(r.failed)}`);
    if (r.reply_visible || r.turns !== 0) problems.push(`a late reply shows: reply ${r.reply_visible}, turns ${r.turns}`);
    if (r.typing) problems.push('typing dots still on');
    if (r.input_disabled) problems.push('input still disabled after the clear');
    if (/没回上/.test(r.hint)) problems.push(`a send-failed hint was shown for the aborted reply: ${r.hint}`);
    const n = respondEntries(dir).length;
    if (n !== 0) problems.push(`the diary holds ${n} entr${n === 1 ? 'y' : 'ies'} for a line that was cleared before its reply`);
    // positive control: the same line without the clear is answered and recorded, so "no entry" above is the abort's doing
    const c = await page('clear_inflight', { base: gw.base, line: '慢一点说话', clear: false, watch_ms: 4500 });
    if (!c.reply_visible || c.turns < 1) problems.push(`control: reply visible ${c.reply_visible}, turns ${c.turns}`);
    await sleep(500);
    if (respondEntries(dir).length !== 1) problems.push(`control: ${respondEntries(dir).length} diary entries, want 1`);
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-039 FND-044: the drawer body is a Tab stop inside the focus trap, and the arrow, Page and End keys scroll it', opts, async () => {
  const lines = ['# 日志'];
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15']) { lines.push('', `## ${d}`); for (let k = 0; k < 40; k++) lines.push(`- ${['开心', '平静', '平常'][k % 3]} · 第${k + 1}条`); }
  const dir = tmpDir(); seed(dir, { '日志.md': `${lines.join('\n')}\n`, 'profile.json': SEEN });
  const gw = await gwFor(dir, { script, clock: '2026-11-15T12:00:00-05:00', tz: 'America/New_York' });
  const problems = [];
  try {
    const r = await page('drawer_keys', { base: gw.base });
    if (!(r.metrics.sh > r.metrics.ch + 200)) problems.push(`the test diary is not taller than the drawer (${r.metrics.sh} vs ${r.metrics.ch})`);
    if (r.metrics.tabindex !== '0' || r.metrics.role !== 'region') problems.push(`body is role=${r.metrics.role} tabindex=${r.metrics.tabindex}, want region and 0`);
    if (r.metrics.label !== 'tab-diary') problems.push(`body named by ${r.metrics.label}, want tab-diary`);
    if (r.order[r.order.length - 1] !== 'scroll') problems.push(`Tab never reached the drawer body: ${JSON.stringify(r.order)}`);
    if (r.inside.some((x) => !x)) problems.push(`focus left the drawer: ${JSON.stringify(r.order)} ${JSON.stringify(r.inside)}`);
    if (r.top0 !== 0 || !(r.after_arrow > 0) || !(r.after_page > r.after_arrow) || !(r.after_end > r.after_page)) problems.push(`scrollTop: start ${r.top0}, arrow ${r.after_arrow}, page ${r.after_page}, end ${r.after_end}`);
    if (Math.abs((r.after_end ?? 0) - (r.metrics.sh - r.metrics.ch)) > 2) problems.push(`End did not reach the bottom: ${r.after_end} of ${r.metrics.sh - r.metrics.ch}`);
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-046 FND-045: after 删掉 the drawer announcer (drawer-announce, role=status) holds the forgotten words, on and off; the result line is not a second live region; focus stays on 关闭', opts, async () => {
  const problems = [];
  for (const [label, prof, key] of [['memory on', SEEN, 'forgotten'], ['memory off', SEEN_OFF, 'forgottenOff']]) {
    const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': prof });
    const gw = await gwFor(dir, { script });
    try {
      const r = await page('forget', { base: gw.base, lines: [] });
      const w = ux(key).zh;
      if (r.announce !== w) problems.push(`${label}: announcer ${JSON.stringify(r.announce)}, want ${JSON.stringify(w)}`);
      if (r.result_text !== w) problems.push(`${label}: result line ${JSON.stringify(r.result_text)}`);
      if (r.announce_role !== 'status') problems.push(`${label}: announcer role ${r.announce_role}`);
      if (r.result_role !== null) problems.push(`${label}: the result line keeps role=${r.result_role} (it would be spoken twice)`);
      if (r.focus_testid !== 'drawer-close') problems.push(`${label}: focus on ${r.focus_testid}, want drawer-close`);
    } finally { await gw.stop(); }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-037 FND-046: while the first-run notice is open the privacy line is not in the DOM (zh and en, laptop and phone); it appears, equal to the UX words, once 知道了 is chosen', opts, async () => {
  const problems = [];
  for (const [lang, w, h] of [['zh', 1280, 900], ['en', 1280, 900], ['zh', 390, 844], ['en', 390, 844]]) {
    const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': NOTICE_UNSEEN });
    const gw = await gwFor(dir, { script });
    try {
      const on = ux('privacyOn')[lang]; const off = ux('privacyOff')[lang];
      const r = await page('privacy', { base: gw.base, lang, width: w, height: h, privacy_words: [on, off] });
      const tag = `${lang}@${w}`;
      if (!r.notice_first) problems.push(`${tag}: no notice on a first open`);
      if (r.privacy_while_notice !== '' && r.privacy_while_notice !== null) problems.push(`${tag}: privacy line while the notice is open: ${JSON.stringify(r.privacy_while_notice)}`);
      if (r.body_has_privacy_while_notice.some(Boolean)) problems.push(`${tag}: privacy words are in the DOM while the notice is open`);
      if (r.notice_after) problems.push(`${tag}: notice still there after 知道了`);
      if (r.privacy_after !== on) problems.push(`${tag}: after 知道了 the line is ${JSON.stringify(r.privacy_after)}, want ${JSON.stringify(on)}`);
    } finally { await gw.stop(); }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-038 FND-046: 清空 with something kept says clearedKept; 关掉记忆 says memoryOffNow and the privacy line says off (zh and en)', opts, async () => {
  const problems = [];
  for (const lang of ['zh', 'en']) {
    const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': SEEN });
    const gw = await gwFor(dir, { script });
    try {
      const r = await page('privacy', { base: gw.base, lang, mode: 'clear' });
      const want = ux('hints.clearedKept')[lang];
      if (r.hint_after_clear !== want) problems.push(`${lang}: hint after 清空 ${JSON.stringify(r.hint_after_clear)}, want ${JSON.stringify(want)}`);
      if (r.turns_after_clear !== 0) problems.push(`${lang}: chat not cleared`);
    } finally { await gw.stop(); }
    const d2 = tmpDir(); seed(d2, { ...filesOf('FX-022'), 'profile.json': NOTICE_UNSEEN });
    const g2 = await gwFor(d2, { script });
    try {
      const r = await page('privacy', { base: g2.base, lang, mode: 'off' });
      const want = ux('hints.memoryOffNow')[lang];
      if (r.hint_after_answer !== want) problems.push(`${lang}: hint after 关掉记忆 ${JSON.stringify(r.hint_after_answer)}, want ${JSON.stringify(want)}`);
      if (r.privacy_after !== ux('privacyOff')[lang]) problems.push(`${lang}: privacy after 关掉记忆 ${JSON.stringify(r.privacy_after)}`);
    } finally { await g2.stop(); }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-040 week curve: a polyline joins only days that follow each other; nothing bridges an empty day (seeded FX-019 week)', opts, async () => {
  const D = fx('FX-019');
  const days = D.expected.cases[0].days;
  // independent expectation from the fixture's day values: one line per run of 2+ consecutive recorded days; x = index + 0.5, y = 1 - value
  const want = []; let run = [];
  days.forEach((d, i) => { if (d.value === null) { if (run.length > 1) want.push(run); run = []; } else run.push([i + 0.5, 1 - d.value]); });
  if (run.length > 1) want.push(run);
  assert.deepEqual(want.map((r) => r.map(([x]) => x)), [[2.5, 3.5], [5.5, 6.5]], 'the fixture week has two joined runs and two gaps');
  const dir = tmpDir(); seed(dir, { '日志.md': D.input.cases[0].files['日志.md'], 'profile.json': SEEN });
  const gw = await gwFor(dir, { script, clock: '2026-11-15T12:00:00-05:00', tz: 'America/New_York' });
  try {
    const r = await page('diary', { base: gw.base });
    const got = r.lines.map((l) => l.trim().split(/\s+/).map((pt) => pt.split(',').map(Number)));
    assert.equal(got.length, want.length, `polylines: ${JSON.stringify(r.lines)}`);
    got.forEach((g, i) => {
      assert.deepEqual(g.map(([x]) => x), want[i].map(([x]) => x), `line ${i} x`);
      g.forEach(([, y], k) => assert.ok(Math.abs(y - want[i][k][1]) < 0.01, `line ${i} point ${k}: y ${y}, want ${want[i][k][1]}`));
    });
    assert.deepEqual([r.dots.length, r.none], [5, 2]);
  } finally { await gw.stop(); }
});

test('Q-047 About tab loading: while /api/profile has not answered, the grey blocks show with no real content or control; the real content replaces them after the answer', opts, async () => {
  const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': SEEN });
  const gw = await gwFor(dir, { script });
  const problems = [];
  try {
    for (const lang of ['zh', 'en']) {
      const r = await page('loading', { base: gw.base, lang });
      if (r.held_requests !== 1) problems.push(`${lang}: ${r.held_requests} profile reads held, want 1`);
      if (!r.skeleton || r.busy !== 'true') problems.push(`${lang}: skeleton ${r.skeleton}, aria-busy ${r.busy}`);
      if (r.real_during.length) problems.push(`${lang}: real content before the answer: ${JSON.stringify(r.real_during)}`);
      if (r.panel_text.trim() !== ux('profileLoading')[lang]) problems.push(`${lang}: loading words ${JSON.stringify(r.panel_text)}, want ${JSON.stringify(ux('profileLoading')[lang])}`);
      if (r.focusables_in_panel !== 0) problems.push(`${lang}: ${r.focusables_in_panel} focusable things inside the loading panel`);
      if (r.skeleton_after || !r.real_after.includes('[data-testid=about-name]') || !r.real_after.includes('[data-testid=about-box]')) problems.push(`${lang}: after the answer ${JSON.stringify(r)}`);
    }
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-049 no sideways scroll at 1440, 768, 375 and 320, in zh and en, over notice, chat, both tabs and the forget question (scrollWidth <= clientWidth)', opts, async () => {
  const lines = ['# 日志'];
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15']) { lines.push('', `## ${d}`); for (let k = 0; k < 6; k++) lines.push(`- ${['开心', '平静', '平常'][k % 3]} · 第${k + 1}条一件稍微长一点的小事情要写在这里`); }
  const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), '日志.md': `${lines.join('\n')}\n`, 'profile.json': NOTICE_UNSEEN });
  const gw = await gwFor(dir, { script, clock: '2026-11-15T12:00:00-05:00', tz: 'America/New_York' });
  const problems = []; let probes = 0; const seen = new Set();
  try {
    for (const lang of ['zh', 'en']) for (const width of [1440, 768, 375, 320]) {
      // each (lang, width) is a fresh tab with an unanswered notice, because the page driver's context is new
      const r = await page('fit', { base: gw.base, lang, width, height: width >= 768 ? 900 : 700 });
      for (const p of r.probes) {
        probes += 1; seen.add(p.tag);
        const tag = `${lang}@${width} ${p.tag}`;
        if (!(p.doc[0] <= p.doc[1])) problems.push(`${tag}: document scrollWidth ${p.doc[0]} > clientWidth ${p.doc[1]}`);
        if (!(p.body[0] <= p.body[1])) problems.push(`${tag}: body scrollWidth ${p.body[0]} > clientWidth ${p.body[1]}`);
        if (p.scrollX !== 0) problems.push(`${tag}: scrollX ${p.scrollX}`);
        if (p.drawer && !(p.drawer[0] <= p.drawer[1])) problems.push(`${tag}: drawer body scrollWidth ${p.drawer[0]} > clientWidth ${p.drawer[1]}`);
      }
      // the first load of a seeded dir shows the notice; the first gateway read marks nothing, so every tab sees the same state
    }
    for (const need of ['chat', 'diary', 'about', 'forget asked']) if (!seen.has(need)) problems.push(`state ${need} was never probed`);
    if (probes < 8 * 5) problems.push(`only ${probes} probes ran`);
  } finally { await gw.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-044 FND-052 / FND-061: the region select is described by its line and note; unreadable files show this Mac\'s region, not always 中国大陆', opts, async () => {
  const problems = [];
  const dir = tmpDir(); seed(dir, { ...filesOf('FX-022'), 'profile.json': SEEN });
  const gw = await gwFor(dir, { script });
  try {
    const r = await page('region_a11y', { base: gw.base });
    if (r.described_by !== 'region-line region-note') problems.push(`aria-describedby ${JSON.stringify(r.described_by)}`);
    if (r.described_text.trim() !== `${r.line_text.trim()} ${r.note_text.trim()}` || !r.note_text.trim()) problems.push(`described text ${JSON.stringify(r.described_text)} vs ${JSON.stringify([r.line_text, r.note_text])}`);
    if (r.note_text.trim() !== ux('regionNote').zh) problems.push(`note ${JSON.stringify(r.note_text)}, want ${JSON.stringify(ux('regionNote').zh)}`);
  } finally { await gw.stop(); }
  // unreadable profile.json, no stored region: the disabled select names the Mac's region (COMPANION_REGION=US -> United States), the stored CN is not assumed
  const d2 = tmpDir(); seed(d2, filesOf('FX-022')); writeFileSync(join(d2, 'profile.json'), '{"version":1,"name":"团子","region":nul');
  const g2 = await gwFor(d2, { script, env: { COMPANION_REGION: 'US' } });
  try {
    const r = await page('region_a11y', { base: g2.base, unreadable: true });
    if (r.shown_option === ux('regionCN').zh) problems.push(`unreadable on a US Mac still says ${r.shown_option}`);
    if (r.shown_option !== ux('regionUS').zh) problems.push(`unreadable select shows ${JSON.stringify(r.shown_option)}, want ${JSON.stringify(ux('regionUS').zh)}`);
  } finally { await g2.stop(); }
  assert.deepEqual(problems, [], problems.join('\n'));
});

void mode; void round3; void wt;
