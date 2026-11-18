// R2 prototype pins on the real page (Q-066, Q-067; fe-tester #1, 2026-11-17): headless Chromium through tests/support/page-driver.py
// (Playwright for Python) against the real gateway with the doubles of tests/memory-helpers.js (own temp data dir, port >= 4450).
// Expected values: 02-ui.md §4 Anchors table (parsed from the doc), CMP-031 sizes, 01-ux.md "Growth bar values" table, Q-056 order,
// Q-067 widths. If the browser harness is missing, each test is skipped with the reason, never passed.
// The stage-up moment, spark and remembered stage (Q-062/063/064, CMP-033, DFB-004) are pinned at the end (fe-tester #2).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { cleanupTmp, ROOT, startGateway, tmpDir } from './memory-helpers.js';

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
async function withGw(fn) {
  const gw = await startGateway({ dir: join(tmpDir(), 'LittleBuddy'), script: { replies: [{ reply: '好的，我在听。' }] } });
  try { await gw.ready(); return await fn(gw); } finally { await gw.stop(); }
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
  const storage = { 'companion.look': JSON.stringify({ character: 2, outfit: { head: 1, clothes: 2, shoes: 3, accessory: 1 } }), 'companion.demoDays': '7' };
  const problems = []; let probes = 0; const seen = new Set(); let audio = 0;
  await withGw(async (gw) => {
    const host = new URL(gw.base).host;
    for (const lang of ['zh', 'en']) for (const width of [1440, 768, 375]) {
      const r = await page('r2_fit', { base: gw.base, lang, width, height: width >= 768 ? 900 : 700, storage });
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
  });
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
const stageRun = (args) => memo(() => withGw((gw) => page('r2_stageup', { base: gw.base, ...args })));
const within = (samples, a, b) => samples.filter((s) => s.t >= a && s.t <= b);
const since = (samples, a) => samples.filter((s) => s.t >= a);
const vals = (samples, f) => [...new Set(samples.map(f).map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
const said = (st) => st.said.map(({ who, text }) => ({ who, text }));
const added = (st) => st.added.map(({ what, pv }) => `${what}${pv ? ' (preview)' : ''}`).sort();
const gspark = (st) => { const g = st.samples.at(-1).gspark; return g && { band: g.band, box: g.box, svg: g.svg, cls: g.svgCls }; };
const spark24 = (band) => ({ band: String(band), box: [24, 24], svg: [24, 24], cls: `spark spark--${band}` });

// One run, zh, 1440: 0 -> 3 (moment), refresh, 2 (lower: no moment), 6 (DFB-004 replay), 0, 7 (two stages at once: one moment)
const fullRun = stageRun({ lang: 'zh', width: 1440, height: 900, steps: [{ days: 3 }, { reload: true, ms: 2500 }, { days: 2, ms: 1500 }, { days: 6 }, { days: 0, ms: 1500 }, { days: 7 }] });

test('Q-062 full motion 0 -> 3 days: burst ~1.5 s, pleasant-high face 1.5 s with data-mood unchanged, caption name · 谢谢你陪我这么久 for 3 s then the mood phrase, flaring spark--2 after .caption__phrase, ids unique', opts, async () => {
  const r = await fullRun(); const st = r.steps[0]; const S = st.samples;
  assert.deepEqual(r.errors, []);
  const [name, phrase] = st.pre;
  assert.deepEqual(vals(S, (s) => s.mood), ['neutral'], 'data-mood never changes during the moment');
  assert.deepEqual(vals(within(S, 100, 1350), (s) => s.face), ['pleasant-high']);
  assert.deepEqual(vals(since(S, 1750), (s) => s.face), ['neutral']);
  assert.deepEqual(vals(within(S, 100, 1350), (s) => s.burst), [1]);
  assert.deepEqual(vals(since(S, 1750), (s) => s.burst), [0]);
  assert.deepEqual(vals(within(S, 100, 2850), (s) => [s.name, s.phrase, s.sparks]),
    [[name, ` · ${ZH.thanks}`, [{ prev: 'caption__phrase', inPv: false, svg: 'spark spark--2', flare: true }]]]);
  assert.deepEqual(vals(since(S, 3200), (s) => [s.name, s.phrase, s.sparks]), [[name, phrase, []]]);
  assert.deepEqual(vals(since(S, 100), (s) => s.stage), ['2']);
  assert.deepEqual(added(st), ['burst', 'burst (preview)', 'spark'], 'one burst on the stage, one on the (hidden) preview, one caption spark');
  assert.deepEqual(vals(S, (s) => s.ndup), [0], `duplicate ids: ${JSON.stringify(S.find((s) => s.ndup)?.dup)}`);
  assert.equal(st.seen, '2');
});

test('Q-062 CMP-033 成长 during 0 -> 3: line 长大了一点 then the days line after ~1.4 s; spark band 2 in a 24 x 24 box; growth-said hears 长大了一点，现在熟悉起来了 once, the companion status never', opts, async () => {
  const st = (await fullRun()).steps[0]; const S = st.samples;
  assert.deepEqual(vals(within(S, 100, 1250), (s) => s.line), [ZH.up]);
  assert.deepEqual(vals(since(S, 1600), (s) => s.line), [`${ZH.stage[2]} · 一起聊过 3 天`]);
  assert.deepEqual(said(st), [{ who: 'growth-said', text: ZH.upSaid(2) }]);
  assert.deepEqual(gspark(st), spark24(2));
});

test('Q-062 a refresh does not replay; DFB-004: lower demo days (2) plays nothing and lowers the remembered stage, raising (6) replays once; 0 -> 7 crosses two stages in one moment (spark--3); spark bands 1/2/3 at 2/6/7 days stay 24 x 24', opts, async () => {
  const r = await fullRun(); const [, reload, two, six, zero, seven] = r.steps;
  assert.deepEqual(r.errors, []);
  const quiet = (st) => ({ added: added(st), said: said(st), stage: vals(since(st.samples, 100), (s) => s.stage).filter((v) => v !== null), /* null: no page script yet (reload) */ thanks: st.samples.some((s) => s.phrase?.includes(ZH.thanks)), seen: st.seen });
  assert.deepEqual(quiet(reload), { added: [], said: [], stage: ['2'], thanks: false, seen: '2' }, 'refresh');
  assert.deepEqual(quiet(two), { added: [], said: [], stage: ['1'], thanks: false, seen: '1' }, 'days 2');
  assert.deepEqual(gspark(two), spark24(1));
  assert.deepEqual({ added: added(six), said: said(six), seen: six.seen, caption: vals(within(six.samples, 100, 2850), (s) => s.sparks.map((x) => x.svg)) },
    { added: ['burst', 'burst (preview)', 'spark'], said: [{ who: 'growth-said', text: ZH.upSaid(2) }], seen: '2', caption: [['spark spark--2']] }, 'days 6 replays');
  assert.deepEqual(gspark(six), spark24(2));
  assert.deepEqual(quiet(zero), { added: [], said: [], stage: ['1'], thanks: false, seen: '1' }, 'days 0');
  assert.deepEqual(gspark(zero), spark24(1));
  assert.deepEqual({ added: added(seven), said: said(seven), stage: vals(seven.samples, (s) => s.stage).filter((v) => v !== '1'), seen: seven.seen, caption: vals(within(seven.samples, 100, 2850), (s) => [s.phrase, s.sparks.map((x) => x.svg)]) },
    { added: ['burst', 'burst (preview)', 'spark'], said: [{ who: 'growth-said', text: ZH.upSaid(3) }], stage: ['3'], seen: '3', caption: [[` · ${ZH.thanks}`, ['spark spark--3']]] }, 'days 0 -> 7');
  assert.deepEqual(gspark(seven), spark24(3));
});

test('Q-063 reduced motion 0 -> 3: only 240 ms opacity Web Animations (2 layers x stage and preview, caption spark in and out), no burst, no face swap; caption 谢谢你陪我这么久 3 s with a still spark--2; ids unique through the crossfade', opts, async () => {
  const r = await stageRun({ lang: 'zh', width: 1440, height: 900, reduce: true, steps: [{ days: 3 }] })();
  const st = r.steps[0]; const S = st.samples;
  assert.deepEqual(r.errors, []);
  const sig = (a) => `${a.kind} ${a.target} ${a.props.join(',')} ${a.duration}`;
  assert.deepEqual(st.anims.map(sig).sort(), [
    'Animation caption__spark opacity 240', 'Animation caption__spark opacity 240',
    'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240', 'Animation companion__layer opacity 240',
  ]);
  assert.deepEqual(added(st), ['spark']);
  assert.deepEqual(vals(S, (s) => [s.mood, s.face, s.burst]), [['neutral', 'neutral', 0]]);
  assert.deepEqual(vals(within(S, 100, 2850), (s) => [s.phrase, s.sparks]), [[` · ${ZH.thanks}`, [{ prev: 'caption__phrase', inPv: false, svg: 'spark spark--2', flare: false }]]]);
  assert.deepEqual(vals(since(S, 3200), (s) => [s.phrase, s.sparks]), [[st.pre[1], []]]);
  assert.deepEqual(vals(S, (s) => s.ndup), [0], `duplicate ids: ${JSON.stringify(S.find((s) => s.ndup)?.dup)}`);
  assert.ok(Math.max(...within(S, 0, 200).map((s) => s.ids)) > S.at(-1).ids, 'positive control: a sample caught both layers of the crossfade');
  assert.deepEqual(said(st), [{ who: 'growth-said', text: ZH.upSaid(2) }]);
  assert.deepEqual(gspark(st), spark24(2));
});

test('Q-064 Q-062 phone 390 x 844, English: the preview gets the burst, the face and data-stage but no caption; the stage caption, 成长 line and growth-said read the 01-ux English words; ids unique', opts, async () => {
  const r = await stageRun({ lang: 'en', width: 390, height: 844, steps: [{ days: 3 }] })();
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

test('Q-062 at open: a first open at 3 days only remembers the stage (no moment); an open whose remembered stage is lower plays once, and with the drawer closed the companion status says 长大了一点，现在熟悉起来了', opts, async () => {
  const r = await stageRun({ lang: 'zh', width: 1440, height: 900, storage: { 'companion.demoDays': '3' },
    steps: [{ open: true, ms: 2500 }, { reload: true, set: { 'companion.stageSeen': '1' } }] })();
  const [first, again] = r.steps;
  assert.deepEqual(r.errors, []);
  assert.deepEqual({ added: added(first), said: said(first), thanks: first.samples.some((s) => s.phrase?.includes(ZH.thanks)), seen: first.seen },
    { added: [], said: [], thanks: false, seen: '2' });
  assert.deepEqual({ added: added(again), said: said(again), thanks: again.samples.some((s) => s.phrase === ` · ${ZH.thanks}`), seen: again.seen },
    { added: ['burst', 'spark'], said: [{ who: 'companion', text: ZH.upSaid(2) }], thanks: true, seen: '2' });
});
