// R2 prototype pins on the real page (Q-066, Q-067; fe-tester #1, 2026-11-17): headless Chromium through tests/support/page-driver.py
// (Playwright for Python) against the real gateway with the doubles of tests/memory-helpers.js (own temp data dir, port >= 4450).
// Expected values: 02-ui.md §4 Anchors table (parsed from the doc), CMP-031 sizes, 01-ux.md "Growth bar values" table, Q-056 order,
// Q-067 widths. If the browser harness is missing, each test is skipped with the reason, never passed.
// The stage-up moment and spark (Q-062/063/064, CMP-033) are pinned at the end (fe-tester #2); since the Full run (Q-076, fe-tester #4)
// they run on a real diary: days come from 日志.md (the gateway clock is 2026-11-18 noon, New York) and the moment is started by a reply.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { cleanupTmp, diaryOfDates, lastNDays, NOON, NY, postProfile, R1_PROFILE, ROOT, seed, startGateway, tmpDir } from './r2-helpers.js';

after(cleanupTmp);
const PY = existsSync('/opt/anaconda3/bin/python') ? '/opt/anaconda3/bin/python' : 'python3';
let harness = null;
try { execFileSync(PY, ['-c', 'import playwright.sync_api'], { stdio: 'ignore' }); } catch { harness = `no Playwright for Python at ${PY}`; }
const opts = { ...(harness ? { skip: harness } : {}), timeout: 240000 };

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
// A gateway with the doubles, its own data dir and a diary of `days` consecutive dates ending 2026-11-17; its clock reads 2026-11-18 noon,
// so the next reply is the day's first (days + 1). `look` is saved through the service (POST /api/profile), like a person's pick.
async function withGw(fn, { days = 0, look = null, script = { replies: [{ reply: '好的，我在听。' }] } } = {}) {
  const dir = join(tmpDir(), 'LittleBuddy');
  seed(dir, { 'profile.json': R1_PROFILE, ...(days ? { '日志.md': diaryOfDates(lastNDays(days)) } : {}) });
  const gw = await startGateway({ dir, script, clock: NOON('2026-11-18'), ...NY });
  try { await gw.ready(); if (look) assert.equal((await postProfile(gw, { look })).status, 200); return await fn(gw); } finally { await gw.stop(); }
}

const CHARS = ['honey', 'cotton', 'matcha'];
const MOODS = ['neutral', 'pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low'];
const SLOTS = ['head', 'clothes', 'shoes', 'accessory'];
const nums = (s) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

// 02-ui.md "### Anchors" table: | mood | head (x, y, r, s) | neck (x, y, r, sx) | left foot | right foot |
function anchors() {
  const doc = readFileSync(join(ROOT, 'docs/frontend/r2-personalise/02-ui.md'), 'utf8');
  const sec = doc.slice(doc.indexOf('### Anchors'), doc.indexOf('### CMP-031'));
  const out = {};
  for (const line of sec.split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (!MOODS.includes(cells[0])) continue;
    const [head, neck, l, r] = cells.slice(1, 5).map((c) => c.replace(/−/g, '-').split(',').map((v) => Number(v.trim())));
    out[cells[0]] = { head, neck, l, r };
  }
  return out;
}
// CMP-030 Placement: the numbers each slot's transform carries, in order
function placement(slot, a) {
  if (slot === 'head') return [a.head];
  if (slot === 'clothes') return [a.neck.slice(0, 3)];
  if (slot === 'accessory') return [[...a.neck, 1]];
  return [a.l, [a.r[0], a.r[1], a.r[2], -a.r[3], a.r[3]]];
}

test('Q-054 Q-066 look-art puts each item at its 02-ui §4 anchor, for every character and mood; clothes clipped to that layer\'s body-clip with the outline redrawn; 不穿 empties the slot', opts, async () => {
  const A = anchors();
  assert.deepEqual(Object.keys(A), MOODS, 'anchor table rows read from 02-ui.md');
  const r = await withGw((gw) => page('r2_art', { base: gw.base, chars: CHARS, moods: MOODS, slots: SLOTS, item: 1 }));
  assert.equal(r.rows.length, CHARS.length * MOODS.length * SLOTS.length);
  const problems = [];
  for (const row of r.rows) {
    const tag = `${row.c}-${row.m} ${row.s}`;
    const got = row.tf.map(nums); const want = placement(row.s, A[row.m]);
    try { assert.deepEqual(got, want); } catch { problems.push(`${tag}: transforms ${JSON.stringify(row.tf)}, want numbers ${JSON.stringify(want)}`); }
    if (row.s === 'clothes') {
      const clipId = `${row.c}-${row.m}--body-clip`;
      if (row.clip !== `url(#${clipId})` || !row.clipIds.includes(clipId)) problems.push(`${tag}: clip-path ${row.clip}, clipPaths ${row.clipIds}`);
      const o = row.outline.find((p) => p.d === row.bodyD);
      if (!row.bodyD || !o || o.sw !== '6') problems.push(`${tag}: outline not redrawn from body-fur at 6 px: ${JSON.stringify(row.outline).slice(0, 200)}`);
    } else if (row.clip) problems.push(`${tag}: unexpected clip ${row.clip}`);
    if (row.afterNone !== 0) problems.push(`${tag}: 不穿 left ${row.afterNone} children`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-055 Q-066 data-stage 1/2/3 sets --g 0.72/0.86/1 and scales #growth about (200, 318), feet on the ground line (02-ui CMP-031)', opts, async () => {
  const r = await withGw((gw) => page('r2_art', { base: gw.base, chars: [], moods: [], slots: [], stages: [1, 2, 3, 1] }));
  const G = { 1: 0.72, 2: 0.86, 3: 1 };
  const problems = [];
  for (const s of r.stages) {
    const g = G[s.stage];
    // translate(200 318) scale(g) translate(-200 -318) = matrix(g, 0, 0, g, 200 - 200g, 318 - 318g)
    const want = [g, 0, 0, g, 200 - 200 * g, 318 - 318 * g];
    if (Number(s.g) !== g) problems.push(`stage ${s.stage}: --g ${s.g}, want ${g}`);
    if (s.m.some((v, i) => Math.abs(v - want[i]) > 0.01)) problems.push(`stage ${s.stage}: growth matrix ${s.m.map((v) => v.toFixed(3))}, want ${want.map((v) => v.toFixed(3))}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-061 Q-066 成长 at 0 / 2 / 3 / 6 / 7 days reads as 01-ux "Growth bar values": 再聊 3/1/4/1 天长大, none at 7; bar 0 of 3, 2 of 3, 0 of 4, 3 of 4, full', opts, async () => {
  const r = await withGw((gw) => page('r2_growth', { base: gw.base, lang: 'zh', days: [0, 2, 3, 6, 7] }));
  const got = r.rows.map((x) => ({ days: x.days, line: x.line, next: x.next, nextVisible: x.nextVisible, segs: x.segs, on: x.on }));
  assert.deepEqual(got, [
    { days: 0, line: '刚认识 · 还没一起聊过', next: '再聊 3 天长大', nextVisible: true, segs: 3, on: 0 },
    { days: 2, line: '刚认识 · 一起聊过 2 天', next: '再聊 1 天长大', nextVisible: true, segs: 3, on: 2 },
    { days: 3, line: '熟悉起来了 · 一起聊过 3 天', next: '再聊 4 天长大', nextVisible: true, segs: 4, on: 0 },
    { days: 6, line: '熟悉起来了 · 一起聊过 6 天', next: '再聊 1 天长大', nextVisible: true, segs: 4, on: 3 },
    { days: 7, line: '老朋友 · 一起聊过 7 天', next: null, nextVisible: false, segs: 1, on: 1 },
  ]);
});

test('Q-056 Q-066 ←/→ cycle the three tabs (→ on the third goes to the first, ← on the first to the third); Tab from the tab goes 中文, EN, 关闭, all inside .drawer__end after the tabs', opts, async () => {
  const r = await withGw((gw) => page('r2_drawer', { base: gw.base, keys: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft'] }));
  assert.deepEqual(r.keys.map((k) => [k.key, k.focus, k.selected]), [
    ['ArrowRight', 'tab-about', 'tab-about'],
    ['ArrowRight', 'tab-look', 'tab-look'],
    ['ArrowRight', 'tab-diary', 'tab-diary'],
    ['ArrowLeft', 'tab-look', 'tab-look'],
  ]);
  assert.deepEqual(r.order, ['tab-diary', 'lang-zh', 'lang-en', 'drawer-close']);
  assert.deepEqual(r.inEnd, ['lang-zh', 'lang-en', 'drawer-close']);
  assert.deepEqual(r.barChildren, ['drawer__tabs', 'drawer__end']);
});

test('Q-067 no sideways scroll at 1440, 768, 375 in zh and en over chat, the look tab (top and bottom) and the about tab, wearing a full look at stage 3; every request stays on the gateway host', opts, async () => {
  const look = { character: 2, outfit: { head: 1, clothes: 2, shoes: 3, accessory: 1 } };
  const problems = []; let probes = 0; const seen = new Set(); let audio = 0;
  await withGw(async (gw) => {
    const host = new URL(gw.base).host;
    for (const lang of ['zh', 'en']) for (const width of [1440, 768, 375]) {
      const r = await page('r2_fit', { base: gw.base, lang, width, height: width >= 768 ? 900 : 700 });
      const tag0 = `${lang}@${width}`;
      if (r.worn.character !== '2' || r.worn.stage !== '3' || r.worn.items < 5) problems.push(`${tag0}: the look was not worn: ${JSON.stringify(r.worn)}`);
      for (const p of r.probes) {
        probes += 1; seen.add(p.tag);
        const tag = `${tag0} ${p.tag}`;
        if (!(p.doc[0] <= p.doc[1])) problems.push(`${tag}: document scrollWidth ${p.doc[0]} > clientWidth ${p.doc[1]}`);
        if (!(p.body[0] <= p.body[1])) problems.push(`${tag}: body scrollWidth ${p.body[0]} > clientWidth ${p.body[1]}`);
        if (p.scrollX !== 0) problems.push(`${tag}: scrollX ${p.scrollX}`);
        if (p.drawer && !(p.drawer[0] <= p.drawer[1])) problems.push(`${tag}: drawer body scrollWidth ${p.drawer[0]} > clientWidth ${p.drawer[1]}`);
      }
      for (const u of r.requests) {
        if (!/^(data|blob):/.test(u) && new URL(u).host !== host) problems.push(`${tag0}: request to ${u}`);
        if (/\/audio\/voices\/serena-(zh|en)\.wav$/.test(u)) audio += 1;
      }
    }
  }, { days: 7, look });
  for (const need of ['chat', 'look top', 'look bottom', 'about']) if (!seen.has(need)) problems.push(`state ${need} was never probed`);
  if (probes < 6 * 4) problems.push(`only ${probes} probes ran`);
  if (audio < 6) problems.push(`试听 fetched the sample ${audio} times over 6 runs (positive control for the request listing)`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

// ---- Q-062 / Q-063 / Q-064 / CMP-033 / DFB-004 (fe-tester #2, 2026-11-17): the stage-up moment on the real page.
// page-driver.py r2_stageup records every 40 ms (t = ms after Enter in the demo field, or after navigation start) and logs
// every status text and every burst / caption spark added. Expected words: 01-ux.md "Words" rows (growth.thanks, .up, .upSaid,
// .stage1/2/3); timings: 02-ui.md CMP-032 (face 1.5 s, confetti 300 ms + 1.2 s, reduced 240 ms crossfade), 01-ux FLOW-027
// (caption 3 s), CMP-028 (bar fills 400 ms + holds 1 s); bands: 02-ui.md CMP-033 table (0-2, 3-6, 7+; 24 x 24 box).
// Each window keeps >= 150 ms off its edges, so a busy machine does not turn it red.
function uxWords(lang) {
  const doc = readFileSync(join(ROOT, 'docs/frontend/r2-personalise/01-ux.md'), 'utf8');
  const col = lang === 'zh' ? 2 : 3; const w = {};
  for (const line of doc.split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    const k = /^`growth\.(thanks|up|upSaid|stage1\/2\/3)`$/.exec(cells[1] ?? '');
    if (k && cells.length === 4) w[k[1]] = cells[col];
  }
  const stage = w['stage1/2/3'].split(' / ');
  return { ...w, stage: { 1: stage[0], 2: stage[1], 3: stage[2] }, upSaid: (n) => w.upSaid.replace('{stage}', stage[n - 1]) };
}
const ZH = uxWords('zh'); const EN = uxWords('en');
const memo = (fn) => { let p = null; return () => (p ??= fn()); };
const stageRun = ({ days = 0, ...args }) => memo(() => withGw((gw) => page('r2_stageup', { base: gw.base, ...args }), { days }));
const within = (samples, a, b) => samples.filter((s) => s.t >= a && s.t <= b);
const since = (samples, a) => samples.filter((s) => s.t >= a);
const vals = (samples, f) => [...new Set(samples.map(f).map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
const said = (st) => st.said.map(({ who, text }) => ({ who, text }));
const added = (st) => st.added.map(({ what, pv }) => `${what}${pv ? ' (preview)' : ''}`).sort();
const gspark = (st) => { const g = st.samples.at(-1).gspark; return g && { band: g.band, box: g.box, svg: g.svg, cls: g.svgCls }; };
const spark24 = (band) => ({ band: String(band), box: [24, 24], svg: [24, 24], cls: `spark spark--${band}` });

// Runs (zh 1440 unless said): the diary holds `days` dates and the gateway's clock is the next day, so a reply is the day's first.
const send = (line, extra = {}) => ({ send: line, ...extra });
const CRISIS = '我真的不想活了';
const upRun = stageRun({ lang: 'zh', width: 1440, height: 900, days: 2, steps: [{ open: true, ms: 2500 }, send('今天过得还行'), { reload: true, ms: 2500 }, send('再说一句', { ms: 2000 })] });
const drawerRun = stageRun({ lang: 'zh', width: 1440, height: 900, days: 2, steps: [send('今天过得还行', { drawer: true })] });
const sevenRun = stageRun({ lang: 'zh', width: 1440, height: 900, days: 6, steps: [send('今天过得还行', { drawer: true })] });
const crisisRun = stageRun({ lang: 'zh', width: 1440, height: 900, days: 6, steps: [send(CRISIS, { ms: 3800 }), { reload: true, ms: 2500 }] });
const quiet = (st) => ({ added: added(st), said: said(st), stage: vals(since(st.samples, 100), (s) => s.stage).filter((v) => v !== null), /* null: no page script yet (reload) */ thanks: st.samples.some((s) => s.phrase?.includes(ZH.thanks)), stored: st.stored });

test('Q-062 Q-074 full motion, 2 days then a reply (days 3, growth.up 2): burst ~1.5 s, pleasant-high face 1.5 s with data-mood unchanged, caption name · 谢谢你陪我这么久 for 3 s then the mood phrase, flaring spark--2 after .caption__phrase, ids unique, the words reach the companion status (drawer closed)', opts, async () => {
  const r = await upRun(); const st = r.steps[1]; const S = st.samples;
  assert.deepEqual(r.errors, []);
  assert.ok(st.replyAt > 0, 'the reply arrived');
  const [name, phrase] = st.pre;
  assert.deepEqual(vals(within(S, 100, 3000), (s) => s.mood), ['neutral'], 'data-mood never changes during the moment');
  assert.deepEqual(vals(within(S, 100, 1350), (s) => s.face), ['pleasant-high']);
  assert.deepEqual(vals(since(S, 1750), (s) => s.face), ['neutral']);
  assert.deepEqual(vals(within(S, 100, 1350), (s) => s.burst), [1]);
  assert.deepEqual(vals(since(S, 1750), (s) => s.burst), [0]);
  assert.deepEqual(vals(within(S, 100, 2850), (s) => [s.name, s.phrase, s.sparks]),
    [[name, ` · ${ZH.thanks}`, [{ prev: 'caption__phrase', inPv: false, svg: 'spark spark--2', flare: true }]]]);
  assert.deepEqual(vals(since(S, 3200), (s) => [s.name, s.phrase, s.sparks]), [[name, phrase, []]]);
  assert.deepEqual(vals(since(S, 100), (s) => s.stage), ['2']);
  assert.deepEqual(added(st), ['burst', 'spark'], 'one burst and one caption spark (no preview exists while the drawer has not been opened)');
  assert.deepEqual(said(st), [{ who: 'companion', text: ZH.upSaid(2) }]);
  assert.deepEqual(vals(S, (s) => s.ndup), [0], `duplicate ids: ${JSON.stringify(S.find((s) => s.ndup)?.dup)}`);
});

test('Q-074 Q-062 nothing plays at open (2 days), at a refresh (3 days, stage 2) or on a second reply the same day; nothing is kept in localStorage', opts, async () => {
  const r = await upRun(); const [open, , reload, again] = r.steps;
  assert.deepEqual(quiet(open), { added: [], said: [], stage: ['1'], thanks: false, stored: [] }, 'open');
  assert.deepEqual(quiet(reload), { added: [], said: [], stage: ['2'], thanks: false, stored: [] }, 'refresh at 3 days');
  assert.deepEqual(quiet(again), { added: [], said: [], stage: ['2'], thanks: false, stored: [] }, 'second reply the same day (growth.up null)');
});

test('Q-062 CMP-033 Q-074 成长 open during the reply that reaches 3 days: line 长大了一点 then the days line after ~1.4 s; spark band 1 before and 2 after in a 24 x 24 box; growth-said hears 长大了一点，现在熟悉起来了 once, the companion status never', opts, async () => {
  const st = (await drawerRun()).steps[0]; const S = st.samples;
  assert.deepEqual(st.before, { line: `${ZH.stage[1]} · 一起聊过 2 天`, band: '1', box: [24, 24], demoField: false }, 'read just before Enter, 成长 open: no 演示用 days field');
  assert.deepEqual(vals(within(S, 100, 1250), (s) => s.line), [ZH.up]);
  assert.deepEqual(vals(since(S, 1600), (s) => s.line), [`${ZH.stage[2]} · 一起聊过 3 天`]);
  assert.deepEqual(said(st), [{ who: 'growth-said', text: ZH.upSaid(2) }]);
  assert.deepEqual(gspark(st), spark24(2));
});

test('Q-062 Q-074 6 days then a reply (days 7, growth.up 3) crosses into stage 3: one moment (spark--3, upSaid for stage 3), growth spark band 3 in a 24 x 24 box', opts, async () => {
  const st = (await sevenRun()).steps[0]; const S = st.samples;
  assert.deepEqual({ added: added(st), said: said(st), stage: vals(since(S, 100), (s) => s.stage), caption: vals(within(S, 100, 2850), (s) => [s.phrase, s.sparks.map((x) => x.svg)]) },
    { added: ['burst', 'burst (preview)', 'spark'], said: [{ who: 'growth-said', text: ZH.upSaid(3) }], stage: ['3'], caption: [[` · ${ZH.thanks}`, ['spark spark--3']]] });
  assert.deepEqual(vals(since(S, 1600), (s) => s.line), [`${ZH.stage[3]} · 一起聊过 7 天`]);
  assert.deepEqual(gspark(st), spark24(3));
});

test('Q-074 Q-062 a crisis reply that crosses into stage 3 (6 -> 7 days) changes the stage quietly: crisis card shown, no burst, no spark, no thanks, no upSaid; a refresh afterwards plays nothing either', opts, async () => {
  const r = await crisisRun(); const [turn, reload] = r.steps;
  assert.deepEqual(r.errors, []);
  assert.deepEqual({ card: turn.card, ...quiet(turn), stage: turn.stage }, { card: true, added: [], said: [], stage: '3', thanks: false, stored: [] });
  assert.deepEqual(quiet(reload), { added: [], said: [], stage: ['3'], thanks: false, stored: [] }, 'nothing was kept to play later');
});

test('Q-075 forget me at 7 days (character 2 worn): after the 200 the companion is stage 1 at once on the same page (no reload), 成长 reads 刚认识 · 还没一起聊过, the worn character stays', opts, async () => {
  const r = await withGw((gw) => page('r2_stageup', { base: gw.base, lang: 'zh', width: 1440, height: 900, steps: [{ open: true, ms: 2500 }, { forget: true, look: true, ms: 600 }] }),
    { days: 7, look: { character: 2, outfit: { head: 1, clothes: 'none', shoes: 'none', accessory: 'none' } } });
  const [open, forget] = r.steps;
  assert.deepEqual(r.errors, []);
  assert.deepEqual([open.stage, open.character], ['3', '2']);
  assert.deepEqual({ stage: forget.stage, character: forget.character, line: forget.line, same: forget.sameBoot, bursts: forget.bursts, added: added(forget) },
    { stage: '1', character: '2', line: '刚认识 · 还没一起聊过', same: true, bursts: 0, added: [] });
});

test('Q-063 Q-074 reduced motion, 2 days then a reply: only 240 ms opacity Web Animations (2 layers x stage and preview, caption spark in and out), no burst, no face swap; caption 谢谢你陪我这么久 3 s with a still spark--2; ids unique through the crossfade', opts, async () => {
  const r = await stageRun({ lang: 'zh', width: 1440, height: 900, reduce: true, days: 2, steps: [send('今天过得还行', { drawer: true })] })();
  const st = r.steps[0]; const S = st.samples;
  assert.deepEqual(r.errors, []);
  const sig = (a) => `${a.kind} ${a.target} ${a.props.join(',')} ${a.duration}`;
  assert.deepEqual(st.anims.map(sig).sort(), [
    'Animation caption__spark opacity 240', 'Animation caption__spark opacity 240',
    'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240',
  ]);
  assert.deepEqual(added(st), ['spark']);
  assert.deepEqual(vals(within(S, 100, 3000), (s) => [s.mood, s.face, s.burst]), [['neutral', 'neutral', 0]]);
  assert.deepEqual(vals(within(S, 100, 2850), (s) => [s.phrase, s.sparks]), [[` · ${ZH.thanks}`, [{ prev: 'caption__phrase', inPv: false, svg: 'spark spark--2', flare: false }]]]);
  assert.deepEqual(vals(since(S, 3200), (s) => [s.phrase, s.sparks]), [[st.pre[1], []]]);
  assert.deepEqual(vals(S, (s) => s.ndup), [0], `duplicate ids: ${JSON.stringify(S.find((s) => s.ndup)?.dup)}`);
  assert.ok(Math.max(...within(S, -200, 200).map((s) => s.ids)) > S.at(-1).ids, 'positive control: a sample caught both layers of the crossfade');
  assert.deepEqual(said(st), [{ who: 'growth-said', text: ZH.upSaid(2) }]);
  assert.deepEqual(gspark(st), spark24(2));
});

test('Q-064 Q-062 Q-074 phone 390 x 844, English, 成长 open: the preview gets the burst, the face and data-stage but no caption; the stage caption, 成长 line and growth-said read the 01-ux English words; ids unique', opts, async () => {
  const r = await stageRun({ lang: 'en', width: 390, height: 844, days: 2, steps: [send('Today was fine', { drawer: true })] })();
  const st = r.steps[0]; const S = st.samples;
  assert.deepEqual(r.errors, []);
  assert.deepEqual(vals(within(S, 100, 1350), (s) => [s.pv?.burst, s.pv?.face, s.pv?.stage]), [[1, 'pleasant-high', '2']]);
  assert.deepEqual(vals(since(S, 1750), (s) => [s.pv?.burst, s.pv?.stage]), [[0, '2']]);
  assert.deepEqual(vals(S, (s) => [s.pv?.caption, s.sparks.filter((x) => x.inPv).length]), [[0, 0]], 'nothing of the caption inside .companion--preview');
  assert.deepEqual(vals(within(S, 100, 2850), (s) => s.phrase), [` · ${EN.thanks}`]);
  assert.deepEqual(vals(within(S, 100, 1250), (s) => s.line), [EN.up]);
  assert.deepEqual(said(st), [{ who: 'growth-said', text: EN.upSaid(2) }]);
  assert.deepEqual(vals(S, (s) => s.ndup), [0], `duplicate ids: ${JSON.stringify(S.find((s) => s.ndup)?.dup)}`);
});


// ---- Q-068 .. Q-071 (increment 2, deferred from the prototype; fe-tester #4, 2026-11-18). Page runs through page-driver.py r2_bar / r2_spark.
// Expected values: 03-queue.md Q-068..Q-071 Observable/Acceptance, 01-ux.md Increment 2 words (tabs), 02-ui CMP-026 sizes (tiles 80 x 118, name box
// 80 x 40, label column 96 px at >= 960 px), the three spark files under evidence/design/spark/.
const barRun = (lang, width) => memo(() => withGw((gw) => page('r2_bar', { base: gw.base, lang, width, height: width >= 960 ? 900 : 844 })));
const BARS = [['zh', 1440], ['en', 1440], ['zh', 390], ['en', 390]].map(([lang, width]) => ({ lang, width, run: barRun(lang, width) }));
const TABS = { zh: ['心情日记', '小伙伴记得的你', '形象和声音'], en: ['Diary', 'About you', 'Look & voice'] };
const other = (l) => (l === 'zh' ? 'en' : 'zh');

test('Q-068 stage top bar (清空 · 日记 · 关于你 · 形象, 中文 | EN) is hidden while the drawer is open, not tabbable, the companion does not move, and it is drawn again before focus lands on the opener (1440 and 390, zh and en)', opts, async () => {
  const problems = [];
  for (const { lang, width, run } of BARS) {
    const r = await run(); const tag = `${lang}@${width}`;
    const got = { before: [r.before.actions, r.before.langs], open: [r.open.actions, r.open.langs], closed: [r.closed.actions, r.closed.langs], atFocus: r.atFocus, focus: r.focus, inert: r.inertMain,
      tabbed: r.tabbed.every((t) => t.inDrawer && !t.inBar), tabs: r.tabbed.length };
    const want = { before: ['visible', 'visible'], open: ['hidden', 'hidden'], closed: ['visible', 'visible'], atFocus: { actions: 'visible', langs: 'visible', hasDrawer: false }, focus: 'open-look', inert: true, tabbed: true, tabs: 14 };
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${tag}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    for (const k of ['open', 'switched', 'closed']) if (JSON.stringify(r[k].companion) !== JSON.stringify(r.before.companion)) problems.push(`${tag}: companion rect ${k} ${r[k].companion} != before ${r.before.companion}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('Q-069 drawer bar: tabs read Diary · About you · Look & voice in EN (one line each), one row at 1440 and two at 390, in both languages, no sideways scroll', opts, async () => {
  const problems = [];
  for (const { lang, width, run } of BARS) {
    const r = await run(); const tag = `${lang}@${width}`;
    for (const [state, l] of [['open', lang], ['switched', other(lang)]]) {
      const m = r[state];
      const got = { rows: m.rows, tabs: m.tabs.map((t) => [t.text, t.lines]), scroll: m.scrollW[0] <= m.scrollW[1], drawer: m.drawerW[0] <= m.drawerW[1] };
      const want = { rows: width >= 960 ? 1 : 2, tabs: TABS[l].map((t) => [t, 1]), scroll: true, drawer: true };
      if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${tag} ${l}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// a slot group as numbers that do not move with the drawer's scroll: sizes, offsets inside the option, pitch, the gap between groups
function gridOf(m, wide) { // the label is a fixed column only on the laptop; on the phone it sits above the row at the width of its words

  const y0 = m.slots[0].opts[0].opt[1];
  return m.slots.map((g) => ({
    legendW: wide ? g.legend[2] : 0, legendToFirst: wide ? Math.round(g.opts[0].opt[0] - g.legend[0]) : 0, top: Math.round(g.opts[0].opt[1] - y0),
    opts: g.opts.map((o) => ({ opt: [o.opt[2], o.opt[3]], tile: [o.tile[2], o.tile[3], o.tile[0] - o.opt[0], o.tile[1] - o.opt[1]], name: [o.name[2], o.name[3], o.name[0] - o.opt[0], o.name[1] - o.opt[1]], x: o.opt[0] - g.opts[0].opt[0] })),
  }));
}
const near = (a, b, path = '') => (Array.isArray(a) ? a.flatMap((v, i) => near(v, b[i], `${path}[${i}]`)) : typeof a === 'object' ? Object.keys(a).flatMap((k) => near(a[k], b[k], `${path}.${k}`)) : Math.abs(a - b) <= 1 ? [] : [`${path}: ${a} vs ${b}`]);

test('Q-070 outfit grid holds still on a language switch: every tile box equal in 中文 and EN within 1 px at 1440 and 390 (option 80 x 118, tile 64 x 64, name box 80 x 40, pitch 84, 4 groups x 4), label column 96 px at 1440, scroll 0', opts, async () => {
  const problems = [];
  for (const { lang, width, run } of BARS) {
    const r = await run(); const tag = `${lang}@${width}`;
    const a = gridOf(r.open, width >= 960); const b = gridOf(r.switched, width >= 960);
    assert.notDeepEqual(r.open.slots.map((g) => g.legendText), r.switched.slots.map((g) => g.legendText), `${tag}: the language really changed`);
    problems.push(...near(a, b).map((x) => `${tag} ${x}`));
    const want = [0, 1, 2, 3].map((i) => ({ opt: [80, 118], tile: [64, 64, 8, 4], name: [80, 40, 0, 78], x: i * 84 }));
    for (const [i, g] of a.entries()) {
      if (JSON.stringify(g.opts) !== JSON.stringify(want)) problems.push(`${tag} group ${i}: ${JSON.stringify(g.opts)}`);
      if (width >= 960 && (g.legendW !== 96 || g.legendToFirst !== 108)) problems.push(`${tag} group ${i}: label column ${g.legendW}, first tile ${g.legendToFirst} from the label`);
    }
    if (a.length !== 4) problems.push(`${tag}: ${a.length} groups`);
    for (const m of [r.open, r.switched]) if (m.scrollW[0] > m.scrollW[1] || m.drawerW[0] > m.drawerW[1]) problems.push(`${tag}: sideways scroll`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// the spark files as plain element lists: tag + attributes, ids and classes dropped, the glow's url(#id) as GRAD
function sparkFile(band) {
  const text = readFileSync(join(ROOT, `docs/frontend/r2-personalise/evidence/design/spark/spark-${band}.svg`), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const svg = {}; const els = [];
  for (const [, close, tag, attrs] of text.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)\/?>/g)) {
    if (close) continue;
    const at = Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    if (tag === 'svg') { for (const k of ['width', 'height', 'viewBox', 'fill']) svg[k] = at[k]; continue; }
    delete at.id;
    if (at.fill?.startsWith('url(')) at.fill = 'url(#GRAD)';
    els.push({ tag, attrs: at });
  }
  return { svg, els };
}

test('Q-071 spark bands are told apart by shape: band 1, 2, 3 as built equal spark-1/2/3.svg (24 x 24 on a 32 grid), the three outlines differ, and every copy of band 3 gets its own gradient id with nothing dangling or duplicated', opts, async () => {
  const bands = [1, 2, 3, 3, 2, 1];
  const r = await withGw((gw) => page('r2_spark', { base: gw.base, bands }));
  const files = Object.fromEntries([1, 2, 3].map((b) => [b, sparkFile(b)]));
  const firstD = [1, 2, 3].map((b) => files[b].els.find((e) => e.tag === 'path').attrs.d);
  assert.equal(new Set(firstD).size, 3, 'the three files draw three different shapes');
  assert.deepEqual(files[1].els.map((e) => e.tag), ['g', 'path', 'circle']);
  assert.deepEqual(files[2].els.map((e) => e.tag), ['g', 'path', 'path']);
  assert.equal(files[3].els.filter((e) => e.tag === 'path').length, 4, 'band 3: flame, core, two flying stars');
  for (const [i, b] of bands.entries()) {
    const built = r.svgs[i];
    assert.deepEqual({ ...Object.fromEntries(['width', 'height', 'viewBox', 'fill'].map((k) => [k, built.attrs[k]])), box: built.box, cls: built.attrs.class }, { ...files[b].svg, box: [24, 24], cls: `spark spark--${b}` }, `copy ${i} svg`);
    const grad = built.els.find((e) => e.tag === 'radialGradient')?.id ?? null;
    const els = built.els.map(({ tag, attrs }) => ({ tag, attrs: attrs.fill?.startsWith('url(') ? { ...attrs, fill: attrs.fill === `url(#${grad})` ? 'url(#GRAD)' : attrs.fill } : attrs }));
    assert.deepEqual(els, files[b].els, `copy ${i} (band ${b}) elements`);
  }
  assert.deepEqual(r.ids, ['spark-glow-fill-1', 'spark-glow-fill-2'], 'one gradient id per band-3 copy');
  assert.deepEqual([r.dups, r.dangling], [[], []], 'no duplicate id in the page, every url(#id) has its target');
});
