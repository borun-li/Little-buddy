// R2 Full, group C (growth from the diary, `up`, forget): TC-257..TC-267. be-tester #1. Plan: docs/backend/04-test-plan.md.
// Expected values come from 01 REQ-080..085 (071 table), 03 DES-045/046 and the approved fixtures FX-030, FX-031; the code was not read.
// The real server/main.js runs as a child process; Bonsai is the scripted double; the clock of the gateway child is moved (NY time zone).
import assert from 'node:assert/strict';
import { chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  api, cleanupTmp, datesOf, diaryEntries, diaryOfDates, fcase, fileState, fx, generated36500, getProfile, growthTable, lastNDays, NOON, NY, postProfile, R1_PROFILE, readDiary,
  say, seed, startGateway, tmpDir, withGateway,
} from './r2-helpers.js';

after(cleanupTmp);
const D18 = NOON('2026-11-18');
const open = (dir, files, clock = D18, extra = {}) => { seed(dir, files); return { dir, clock, ...NY, script: {}, ...extra }; };
const growthOfGet = async (gw) => (await getProfile(gw)).json.growth;
const diaryDates = (dir) => datesOf(readDiary(dir), diaryEntries);
const FILES = (diary) => ({ 'profile.json': R1_PROFILE, ...(diary === null ? {} : { '日志.md': diary }) });

// ---------------------------------------------------------------- TC-257
test('TC-257 [FX-030-01 FX-030-02 FX-030-03 FX-030-04 FX-030-05 FX-030-06 FX-030-07] REQ-080: growth read from the diary files (0, 2, 3, 6, 7, 6, 6 days; empty, duplicate and non-mood sections add none)', async () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const id = `FX-030-0${n}`;
    const { input, expected } = fcase('FX-030', id);
    const dir = tmpDir();
    await withGateway(open(dir, { 'profile.json': R1_PROFILE, ...input.files }), async (gw) => {
      const p = (await getProfile(gw)).json;
      assert.deepEqual(p.growth, expected.growth, id);
      assert.equal(p.readable, true, id);
    });
  }
  // the table the fixture rows come from (071): the test's own table agrees with every expected row, so the two sources are independent
  for (const n of [1, 2, 3, 4, 5, 6, 7]) { const { expected } = fcase('FX-030', `FX-030-0${n}`); assert.deepEqual(growthTable(expected.growth.days), expected.growth); }
});

// ---------------------------------------------------------------- TC-258
test('TC-258 [FX-030-08] REQ-080: 36,500 diary entries give 365 days, stage 3, and GET /api/profile answers within 1000 ms in all 5 runs, first cold, and after a turn is recorded', async () => {
  const { input, expected } = fcase('FX-030', 'FX-030-08');
  assert.match(input.generator, /365 days/);
  assert.match(input.generator, /36,500 entries/);
  const text = generated36500();
  assert.equal(text.split('\n').filter((l) => l.startsWith('- ')).length, 36500);
  const dir = tmpDir();
  await withGateway(open(dir, FILES(text)), async (gw) => {
    const ms = [];
    for (let i = 0; i < 5; i++) {
      const r = await getProfile(gw);
      ms.push(Math.round(r.ms));
      assert.deepEqual(r.json.growth, expected.growth, `run ${i + 1}`);
    }
    assert.ok(ms.every((m) => m <= 1000) && expected.api_ms_le_1000 === true, `ms per run ${ms} (limit 1000)`);
    assert.equal((await say(gw, '今天天气不错。')).status, 200);
    const after = await getProfile(gw);
    assert.deepEqual(after.json.growth, expected.growth, 'today is already in the diary: still 365');
    assert.ok(after.ms <= 1000, `after a turn ${after.ms} ms`);
    console.log(`TC-258 timings ms: ${ms}, after a turn ${Math.round(after.ms)}`);
  });
});

// ---------------------------------------------------------------- TC-259
test('TC-259 REQ-080 (own boundaries): day counts 0..8 and 30 follow the 071 table; growth has exactly five keys', async () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 30]) {
    const dir = tmpDir();
    await withGateway(open(dir, FILES(n === 0 ? null : diaryOfDates(lastNDays(n)))), async (gw) => {
      const g = await growthOfGet(gw);
      assert.deepEqual(g, growthTable(n), `${n} days`);
      assert.deepEqual(Object.keys(g).sort(), ['days', 'into', 'left', 'span', 'stage']);
    });
  }
});

// ---------------------------------------------------------------- TC-260
test('TC-260 [FX-030-09] REQ-081: a new date\'s first turn adds one day within 1 s; the same-day turn and the memory-off turn on a new date add none', async () => {
  const { input, expected } = fcase('FX-030', 'FX-030-09');
  const dir = tmpDir();
  seed(dir, { 'profile.json': R1_PROFILE, ...input.files });
  let gw = await startGateway({ dir, clock: D18, ...NY, script: {} });
  try {
    await gw.ready();
    assert.equal(diaryDates(dir).size, 3, 'start: 3 dates');
    const t1 = await say(gw, '今天天气不错。');
    assert.equal(t1.status, 200);
    assert.deepEqual(t1.json.growth, expected.turns[0].growth, 'turn 1 growth');
    const g = await getProfile(gw); // sent right after the 200
    assert.equal(g.json.growth.days, expected.turns[0].profile_days_within_1000ms);
    assert.ok(g.ms <= 1000, `profile read took ${g.ms} ms`);
    assert.equal(diaryDates(dir).size, expected.turns[0].diary_dates, 'diary has 4 dates after turn 1');
    const t2 = await say(gw, '哈哈');
    assert.deepEqual(t2.json.growth, expected.turns[1].growth, 'turn 2 (same day) growth');
    assert.equal(diaryDates(dir).size, expected.turns[1].diary_dates);
    assert.equal((await postProfile(gw, { memoryOn: false })).status, 200);
    gw = await gw.restart({ clock: NOON('2026-11-19') });
    const t3 = await say(gw, 'ok');
    assert.equal(t3.status, 200);
    assert.deepEqual(t3.json.growth, expected.turns[2].growth, 'turn 3 (memory off, new date) growth');
    assert.equal(diaryDates(dir).size, expected.turns[2].diary_dates);
    assert.equal(readDiary(dir).includes('## 2026-11-19'), expected.turns[2]['diary_has_2026-11-19']);
    assert.deepEqual((await growthOfGet(gw)).days, 4, 'GET after: still 4, not lowered');
    // diary lines agree with growth row by row: each date in the file is counted once
    assert.deepEqual([...diaryDates(dir)].sort(), ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-261
test('TC-261 REQ-081 (failure path): a turn whose reply fails adds no day; the next good turn on that date adds one', async () => {
  const dir = tmpDir();
  await withGateway(open(dir, FILES(fcase('FX-030', 'FX-030-02').input.files['日志.md']), D18, { script: { replies: [{ when: '失败', status: 503 }] } }), async (gw) => {
    const bad = await say(gw, '失败的一轮');
    assert.notEqual(bad.status, 200, 'the scripted failure reaches the page as an error');
    assert.equal(diaryDates(dir).size, 2, 'no day written');
    assert.equal((await growthOfGet(gw)).days, 2);
    const ok = await say(gw, '今天天气不错。');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.growth.days, 3, 'positive control: the good turn on the same date counts');
  });
});

// ---------------------------------------------------------------- TC-262
test('TC-262 [FX-030-10] REQ-082 (backend half): the turn that reaches 3 days answers days 3, stage 2, up 2; the profile read after has 3 days and no up', async () => {
  const { input, expected } = fcase('FX-030', 'FX-030-10');
  const dir = tmpDir();
  await withGateway(open(dir, { 'profile.json': R1_PROFILE, ...input.files }), async (gw) => {
    assert.equal(expected.status, 200);
    const t = await say(gw, '今天天气不错。');
    assert.equal(t.status, expected.status);
    assert.deepEqual(t.json.growth, expected.growth);
    const g = await growthOfGet(gw);
    assert.deepEqual(g, { days: 3, stage: 2, into: 0, span: 4, left: 4 });
    assert.equal(expected.page.days_shown, g.days);
  });
});

// ---------------------------------------------------------------- TC-263
test('TC-263 [FX-030-11 FX-009-01] REQ-082 (backend half): a crisis turn counts the day and still carries growth with up 2', async () => {
  const { input, expected } = fcase('FX-030', 'FX-030-11');
  const dir = tmpDir();
  await withGateway(open(dir, { 'profile.json': R1_PROFILE, ...input.files }), async (gw) => {
    const t = await say(gw, fx('FX-009').input.cases[0].body.line);
    assert.equal(t.status, expected.status);
    assert.equal(t.json.crisis, expected.crisis);
    assert.deepEqual(t.json.growth, expected.growth);
    assert.ok(diaryDates(dir).has('2026-11-18'), 'the crisis turn wrote today into the diary (A63, R1 042)');
    assert.equal((await growthOfGet(gw)).days, 3);
  });
});

// ---------------------------------------------------------------- TC-264
async function turnsOn({ diary, extra = {}, setup, lines = ['今天天气不错。'], clock = D18, profile = R1_PROFILE }) {
  const dir = tmpDir();
  seed(dir, { 'profile.json': profile, ...(diary ? { '日志.md': diary } : {}) });
  setup?.(dir);
  const gw = await startGateway({ dir, clock, ...NY, script: {}, ...extra });
  try {
    await gw.ready();
    const out = [];
    for (const line of lines) { const r = await say(gw, line); out.push({ status: r.status, growth: r.json?.growth }); }
    return { dir, out, after: await growthOfGet(gw) };
  } finally { await gw.stop(); chmodSync(dir, 0o700); }
}
test('TC-264 REQ-082/084 (DES-046 steps 2-3, own boundaries): up is non-null only on the turn that takes days 2->3 (up 2) or 6->7 (up 3); never twice, never at 7+, never on turns not recorded', async () => {
  const D = (n, end) => diaryOfDates(lastNDays(n, end));
  const up = (r) => r.out.map((t) => t.growth.up);
  const six = await turnsOn({ diary: D(6), lines: ['今天天气不错。', '再说一句'] });
  assert.deepEqual(up(six), [3, null], '6 -> 7: up 3 once');
  assert.deepEqual(six.out.map((t) => t.growth.days), [7, 7]);
  assert.deepEqual(six.out[0].growth, { ...growthTable(7), up: 3 });
  const seven = await turnsOn({ diary: D(7) });
  assert.deepEqual([up(seven), seven.out[0].growth.days], [[null], 8], '7 -> 8: no up');
  const two = await turnsOn({ diary: D(2), lines: ['今天天气不错。', '再说一句', '第三句'] });
  assert.deepEqual(up(two), [2, null, null], '2 -> 3: up 2 once, same-day turns none');
  const three = await turnsOn({ diary: D(3) });
  assert.deepEqual([up(three), three.out[0].growth.days], [[null], 4], '3 -> 4: no up');
  const zero = await turnsOn({ diary: null, lines: ['一', '二'] });
  assert.deepEqual([up(zero), zero.out[0].growth.days], [[null, null], 1], '0 -> 1: no up');
  // days are dates in the diary, not a streak: a gap does not matter
  const gap = await turnsOn({ diary: diaryOfDates(['2026-11-05', '2026-11-12']) });
  assert.deepEqual([up(gap), gap.out[0].growth.days], [[2], 3], 'a gap does not break the count');
  // turns that are not recorded: days stay, up null (the positive controls are the recorded turns above)
  const off = await turnsOn({ diary: D(2), profile: R1_PROFILE.replace('"memoryOn": true', '"memoryOn": false') });
  assert.deepEqual([up(off), off.out[0].growth.days, off.after.days], [[null], 2, 2], 'memory off: not counted, not lowered');
  const ro = await turnsOn({ diary: D(2), setup: (dir) => { for (const n of ['profile.json', '日志.md']) chmodSync(join(dir, n), 0o400); chmodSync(dir, 0o500); } });
  assert.deepEqual([up(ro), ro.out[0].growth.days, ro.after.days], [[null], 2, 2], 'read-only folder: not counted');
  const unreadable = await turnsOn({ diary: D(2), profile: '{"version": 1, "name": "团' });
  assert.deepEqual([unreadable.out[0].status, up(unreadable), unreadable.out[0].growth.days, unreadable.after.days], [200, [null], 0, 0], 'unreadable: 0 days, no up');
  for (const r of [off, ro, unreadable]) assert.equal(r.out[0].status, 200);
});

// ---------------------------------------------------------------- TC-265
test('TC-265 [FX-031-01 FX-031-02] REQ-084 (backend half): opening, reloading, restarting and a second client never carry an up or write a file; growth is stage 3 each time', async () => {
  for (const id of ['FX-031-01', 'FX-031-02']) {
    const { input, expected } = fcase('FX-031', id);
    const files = { 'profile.json': R1_PROFILE, ...input.files };
    const dir = tmpDir();
    seed(dir, files);
    const names = ['profile.json', '日志.md'].map((n) => join(dir, n));
    const before = names.map(fileState);
    let gw = await startGateway({ dir, clock: D18, ...NY, script: {} });
    const seen = [];
    try {
      await gw.ready();
      const read = async () => { const r = await getProfile(gw); seen.push(r.json.growth); return r.json; };
      await read(); // A opens
      if (id === 'FX-031-01') {
        await read(); // B opens
        await read(); // A reloads
        gw = await gw.restart();
        await read(); // B opens after the restart
      }
      assert.equal(seen.length, expected.stage_shown_each_open.length, id);
      assert.deepEqual(seen.map((g) => g.stage), expected.stage_shown_each_open, `${id}: stage each open`);
      for (const g of seen) assert.deepEqual(g, growthTable(7), `${id}: no up key, 7 days`);
      assert.equal(expected.moments_total, 0);
      assert.deepEqual(names.map(fileState), before, `${id}: nothing written by opening`);
      const gone = await api(gw.base, '/api/stage-up', { method: 'POST', body: {} });
      assert.notEqual(gone.status, 200, 'no route can report a stage as seen');
      // positive control: a turn that does not raise the stage (7 -> 8 days) also carries up null; the only way to get up is a turn
      assert.equal((await say(gw, '今天天气不错。')).json.growth.up, null);
    } finally { await gw.stop(); }
  }
});

// ---------------------------------------------------------------- TC-266
test('TC-266 [FX-031-04] REQ-084 (backend half): the turn from 2 to 3 days reports up 2; later reads, a reload, a restart and a second client do not', async () => {
  const { input, expected } = fcase('FX-031', 'FX-031-04');
  const dir = tmpDir();
  seed(dir, { 'profile.json': R1_PROFILE, ...input.files });
  let gw = await startGateway({ dir, clock: D18, ...NY, script: {} });
  try {
    await gw.ready();
    const t = await say(gw, '今天天气不错。');
    assert.deepEqual(t.json.growth, expected.turn_growth);
    const reads = [];
    reads.push((await getProfile(gw)).json.growth); // B opens
    reads.push((await getProfile(gw)).json.growth); // A reloads
    gw = await gw.restart();
    reads.push((await getProfile(gw)).json.growth); // B after restart
    for (const g of reads) assert.deepEqual(g, growthTable(3), 'later reads: 3 days, stage 2, no up');
    assert.deepEqual(reads.map((g) => g.stage), expected.stage_shown_each_open);
    assert.equal(expected.moments_after_turn, 0);
    assert.equal((await say(gw, '再说一句')).json.growth.up, null, 'second turn the same day');
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-267
test('TC-267 [FX-031-03] REQ-085: forget me gives 0 days, stage 1 at once and after a restart; look, voice, name and profile.json bytes are kept; the third new date reports up 2 once', async () => {
  const { input, expected } = fcase('FX-031', 'FX-031-03');
  const dir = tmpDir();
  seed(dir, input.files);
  const pf = join(dir, 'profile.json');
  const before = readFileSync(pf);
  let gw = await startGateway({ dir, clock: D18, ...NY, script: {} });
  const view = async () => { const p = (await getProfile(gw)).json; return { growth: p.growth, look: p.look, voice: p.voice, name: p.name }; };
  try {
    await gw.ready();
    assert.equal((await growthOfGet(gw)).days, 7, 'before: 7 days (positive control: the reset is real)');
    const forget = await api(gw.base, '/api/forget', { method: 'POST', body: {} });
    assert.equal(forget.status, expected.forget.status);
    assert.deepEqual(await view(), expected.after_forget, 'right after forget answers 200');
    assert.ok(readFileSync(pf).equals(before), 'profile.json bytes untouched by forget');
    gw = await gw.restart();
    assert.deepEqual(await view(), expected.after_restart, 'after restart');
    const ups = [];
    for (const [i, t] of expected.turns.entries()) {
      if (i > 0) gw = await gw.restart({ clock: NOON(t.date) });
      const r = await say(gw, '今天天气不错。');
      assert.equal(r.status, 200, t.date);
      assert.deepEqual(r.json.growth, t.growth, t.date);
      ups.push(r.json.growth.up);
    }
    assert.deepEqual(ups, [null, null, 2]);
    assert.equal(ups.filter((u) => u !== null).length, expected.moments_total, 'one up in the whole run');
    assert.ok(readFileSync(pf).equals(before), 'profile.json bytes still untouched after the three turns (a turn writes only the diary)');
  } finally { await gw.stop(); }
});
