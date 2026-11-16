// R1 memory, group C (gateway): TC-172..TC-188. be-tester #4. The REAL server/main.js runs as a child process on a free port >= 4450 with a fresh
// LITTLEBUDDY_DATA_DIR; Bonsai, STT and TTS are the scripted doubles of tests/support (spawn redirected by gateway-doubles.cjs, clock moved by
// clock-preload.cjs where a TC needs it). Each test stops only the PIDs it started. Expected values: plan 04, 03 DES-036/§3/§4/§7, the R1 seam
// of the contract and fixtures FX-019, FX-020, FX-022..FX-025.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { nonLoopback } from './server-helpers.js';
import {
  aboutEmpty, api, cleanupTmp, diaryEntries, filesOf, fx, MOOD_VALUE, MOOD_WORD, mode, port4450, raw, readAbout, readDiary, respond, ROOT, round3, roundDays,
  seed, sleep, snap, startGateway, SUPPORT, tmpDir, waitFor, withGateway, wt,
} from './memory-helpers.js';

after(cleanupTmp);
const post = (gw, path, body) => api(gw.base, path, { method: 'POST', body });
const ABOUT_T = '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n';
const NY = { tz: 'America/New_York' };
const NOON = '2026-11-15T12:00:00-05:00';
const contract = readFileSync(join(ROOT, 'contracts/FRONTEND_BACKEND_CONTRACT.md'), 'utf8');
const row = (prefix) => contract.split('\n').find((l) => l.startsWith(prefix)).split(/(?<!\\)\|/)[2];
const fileHas = (path, s) => existsSync(path) && readFileSync(path, 'utf8').includes(s);
const hasLine = (text, s) => text.split('\n').some((l) => l.replace(/^- /, '').trim() === s);
const sorted = (o) => Object.keys(o).sort();
const kind = (gw, k) => gw.llama().filter((x) => x.kind === k);
const turnReqs = (gw, k, line) => kind(gw, k).filter((x) => x.line.includes(line));
const sysOf = (req) => req.body.messages[0].content;
const GUARD = 'This is all you know about the user from before; anything not written there, you do not know.';
const NO_NOTES = "You don't remember anything about the user from earlier chats yet.";

// ---------------------------------------------------------------- TC-172
test('TC-172 [FX-021, FX-022] REQ-036/043/045/047: seam shapes of GET /api/profile and GET /api/diary, empty and filled cases', async () => {
  const pKeys = [...row('| `getProfile()` out').matchAll(/(\w+): /g)].map((m) => m[1]).sort();
  assert.deepEqual(pKeys, ['about', 'aboutEmpty', 'kept', 'memoryOn', 'name', 'newProfile', 'noticeSeen', 'path', 'readable', 'region', 'systemRegion'], 'keys read from the contract row');
  const dRow = row('| `getDiary()` out');
  const dKeys = ['readable', 'memoryOn', 'hasAny', 'days'].sort();
  for (const k of dKeys) assert.ok(dRow.includes(k), `contract row names ${k}`);
  // (i) a missing folder
  const base = tmpDir(); const dir1 = join(base, 'LittleBuddy');
  await withGateway({ dir: dir1 }, async (gw) => {
    const p = (await api(gw.base, '/api/profile')).json;
    assert.deepEqual(sorted(p), pKeys);
    assert.deepEqual([typeof p.readable, typeof p.memoryOn, typeof p.noticeSeen, typeof p.about, typeof p.aboutEmpty, typeof p.kept, typeof p.newProfile, typeof p.path], Array(8).fill(0).map((_, i) => (i === 3 || i === 7 ? 'string' : 'boolean')));
    assert.ok(['CN', 'US', null].includes(p.systemRegion));
    assert.deepEqual([p.name, p.region, p.noticeSeen, p.memoryOn, p.newProfile, p.aboutEmpty, p.kept, p.about], [null, null, false, true, true, true, false, ABOUT_T]);
    assert.equal(p.path, `${dir1}/`, 'folder shown as an absolute path with a trailing slash (not under the home folder)');
    const d = (await api(gw.base, '/api/diary')).json;
    assert.deepEqual(sorted(d), dKeys); assert.equal(d.days.length, 7); assert.equal(d.hasAny, false); assert.equal(d.readable, true);
    for (const day of d.days) { assert.deepEqual(sorted(day), ['date', 'entries', 'value']); assert.deepEqual([day.value, day.entries], [null, []]); }
  });
  // (ii) FX-022 files
  const dir2 = tmpDir(); const files = filesOf('FX-022'); seed(dir2, files);
  await withGateway({ dir: dir2 }, async (gw) => {
    const p = (await api(gw.base, '/api/profile')).json;
    assert.deepEqual([p.name, p.region, p.aboutEmpty, p.kept, p.newProfile, p.readable], ['团子', 'CN', false, true, false, true]);
    assert.equal(p.about, files['关于你.md'], 'word for word');
    const d = (await api(gw.base, '/api/diary')).json;
    assert.equal(d.hasAny, true);
    const todayEntries = d.days.at(-1).entries;
    assert.deepEqual(todayEntries, [{ mood: 'pleasant-high', point: '模拟面试顺利' }, { mood: 'unpleasant-high', point: '和朋友吵架' }, { mood: 'unpleasant-low', point: null }]);
    for (const e of todayEntries) assert.deepEqual(sorted(e), ['mood', 'point']);
  });
  // (iii) no 日志.md, then a settings write
  const dir3 = tmpDir(); seed(dir3, { '关于你.md': files['关于你.md'], 'profile.json': files['profile.json'] });
  await withGateway({ dir: dir3 }, async (gw) => {
    const d = await api(gw.base, '/api/diary');
    assert.equal(d.status, 200); assert.equal(d.json.hasAny, false); assert.equal(d.json.readable, true); assert.equal(d.json.days.length, 7);
    const fresh = tmpDir();
    await withGateway({ dir: fresh }, async (g2) => {
      assert.equal((await api(g2.base, '/api/profile')).json.newProfile, true);
      assert.equal((await post(g2, '/api/profile', { name: 'Mochi' })).status, 200);
      const p = (await api(g2.base, '/api/profile')).json;
      assert.deepEqual([p.newProfile, p.name], [false, 'Mochi']);
    });
  });
});

// ---------------------------------------------------------------- TC-173
const D19 = fx('FX-019');
const want19 = (i) => { const { id, ...rest } = D19.expected.cases[i]; return rest; };
const roundBody = (b) => ({ ...b, days: roundDays(b.days) });
test('TC-173 [FX-019] REQ-045/046: the diary body at a fixed clock equals the fixture, after a restart too', async () => {
  const dir = tmpDir();
  seed(dir, { '日志.md': D19.input.cases[0].files['日志.md'] });
  await withGateway({ dir, clock: NOON, ...NY }, async (gw) => {
    const b = (await api(gw.base, '/api/diary')).json;
    assert.deepEqual(roundBody(b), want19(0), 'FX-019-01');
    assert.deepEqual(b.days.at(-1).entries.map((e) => e.point), ['模拟面试顺利', '下雨鞋湿了', null, '妹妹周末要来'], 'file order');
    const gw2 = await gw.restart();
    try { assert.deepEqual(roundBody((await api(gw2.base, '/api/diary')).json), want19(0), 'after a restart'); } finally { await gw2.stop(); }
  });
  const d3 = tmpDir();
  await withGateway({ dir: d3, clock: NOON, ...NY }, async (gw) => assert.deepEqual(roundBody((await api(gw.base, '/api/diary')).json), want19(2), 'FX-019-03 (no file)'));
  const d4 = tmpDir();
  seed(d4, { '日志.md': '# 日志\n\n## 2026-11-07\n- 开心 · 收到实习面试通知\n' });
  await withGateway({ dir: d4, clock: NOON, ...NY }, async (gw) => {
    const b = (await api(gw.base, '/api/diary')).json;
    assert.equal(b.hasAny, true, 'an entry outside the window still counts');
    assert.ok(b.days.every((d) => d.entries.length === 0 && d.value === null) && b.days.length === 7);
  });
});

// ---------------------------------------------------------------- TC-174
test('TC-174 [FX-019-04] REQ-045/046 (A42): 36,500 entries, GET /api/diary <= 1000 ms in 5 runs, first cold', async () => {
  const f = D19.input.cases[3];
  assert.ok(f.generator.includes('36,500'));
  const lines = ['# 日志'];
  for (let t = Date.UTC(2025, 10, 16); t <= Date.UTC(2026, 10, 15); t += 86400000) {
    lines.push('', `## ${new Date(t).toISOString().slice(0, 10)}`);
    for (let k = 0; k < 100; k++) lines.push(`- ${['开心', '平静', '平常', '紧张', '难过'][k % 5]} · 第${k + 1}条`);
  }
  assert.equal(lines.filter((l) => l.startsWith('- ')).length, 36500);
  const dir = tmpDir(); seed(dir, { '日志.md': `${lines.join('\n')}\n` });
  await withGateway({ dir, clock: NOON, ...NY }, async (gw) => {
    const ms = []; let body;
    for (let i = 0; i < 5; i++) { const r = await api(gw.base, '/api/diary'); ms.push(Math.round(r.ms)); body = r.json; }
    assert.ok(ms.every((m) => m <= 1000), `ms per run ${ms} (limit 1000)`);
    assert.deepEqual(body.days.map((d) => round3(d.value)), Array(7).fill(0));
    assert.deepEqual(body.days.map((d) => d.entries.length), Array(7).fill(100));
    assert.deepEqual(body.days.map((d) => d.date), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    console.log(`TC-174 timings ms: ${ms}`);
  });
});

// ---------------------------------------------------------------- TC-175
test('TC-175 REQ-047/048/049/052: POST /api/profile validation, shapes and cleaned names', async () => {
  const dir = tmpDir();
  await withGateway({ dir }, async (gw) => {
    const state = async () => JSON.stringify((await api(gw.base, '/api/profile')).json) + (existsSync(join(dir, 'profile.json')) ? readFileSync(join(dir, 'profile.json'), 'utf8') : '');
    const before = await state();
    const bad = [['{}', {}], ['memoryOn string', { memoryOn: 'true' }], ['region EU', { region: 'EU' }], ['region null', { region: null }], ['name 5', { name: 5 }], ['unknown key', { foo: 1 }],
      ['five keys', { noticeSeen: true, memoryOn: true, name: 'a', region: 'CN', foo: 1 }], ['array', []], ['null', null]];
    for (const [name, body] of bad) { const r = await post(gw, '/api/profile', body); assert.equal(r.status, 400, name); assert.deepEqual(r.json, { error: 'bad_request' }, name); }
    for (const [name, body, type] of [['broken JSON', '{"name":', 'application/json'], ['text/plain', '{"name":"a"}', 'text/plain'], ['empty body', '', 'application/json']]) {
      const r = await api(gw.base, '/api/profile', { method: 'POST', body, type }); assert.equal(r.status, 400, name); assert.deepEqual(r.json, { error: 'bad_request' }, name);
    }
    const pad = (n) => { const head = '{"name":"'; const tail = '"}'; return head + 'x'.repeat(n - head.length - tail.length) + tail; };
    const big = await api(gw.base, '/api/profile', { method: 'POST', body: pad(4097) });
    assert.equal(big.status, 413); assert.deepEqual(big.json, { error: 'too_large' });
    const huge = await post(gw, '/api/profile', { name: 'x'.repeat(5000) });
    assert.equal(huge.status, 413, 'a 5000-char name body is over 4096 B');
    assert.equal(await state(), before, 'no state changed by any refused body');
    const edge = await api(gw.base, '/api/profile', { method: 'POST', body: pad(4096) });
    assert.equal(edge.status, 200, '4096 B exactly is accepted'); assert.equal(edge.json.name, 'x'.repeat(12), 'cleaned to 12 code points');
    const ok = [[{ memoryOn: false }, { memoryOn: false, noticeSeen: false, name: 'x'.repeat(12), region: null }],
      [{ memoryOn: false, noticeSeen: true }, { memoryOn: false, noticeSeen: true, name: 'x'.repeat(12), region: null }],
      [{ region: 'other' }, { memoryOn: false, noticeSeen: true, name: 'x'.repeat(12), region: 'other' }],
      [{ name: null }, { memoryOn: false, noticeSeen: true, name: null, region: 'other' }],
      [{ name: '  小伙伴 ' }, { memoryOn: false, noticeSeen: true, name: null, region: 'other' }],
      [{ name: 'Mochi  🎉' }, { memoryOn: false, noticeSeen: true, name: 'Mochi', region: 'other' }]];
    for (const [body, want] of ok) { const r = await post(gw, '/api/profile', body); assert.equal(r.status, 200, JSON.stringify(body)); assert.deepEqual(r.json, want, JSON.stringify(body)); }
    assert.equal((await api(gw.base, '/api/profile')).json.region, 'other', 'other is stored and returned as other');
    assert.equal(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).region, 'other');
  });
});

// ---------------------------------------------------------------- TC-176
test('TC-176 REQ-050/053/054: POST /api/forget validation; read-only 500 not_saved; unreadable 409 unreadable; files unchanged', async () => {
  const dir = tmpDir(); const files = filesOf('FX-022'); seed(dir, files);
  await withGateway({ dir }, async (gw) => {
    const before = snap(dir).files;
    for (const [name, body, type] of [['array', '[]'], ['string', '"x"'], ['broken JSON', '{"a"'], ['wrong content type', '{}', 'text/plain']].map(([n, b, t]) => [n, b, t ?? 'application/json']) ) {
      const r = await api(gw.base, '/api/forget', { method: 'POST', body, type });
      assert.equal(r.status, 400, name); assert.deepEqual(r.json, { error: 'bad_request' }, name);
    }
    const r65 = await api(gw.base, '/api/forget', { method: 'POST', body: `{"a":"${'x'.repeat(65 - 8)}"}` });
    assert.equal(Buffer.byteLength(`{"a":"${'x'.repeat(57)}"}`), 65);
    assert.equal(r65.status, 413); assert.deepEqual(r65.json, { error: 'too_large' });
    assert.deepEqual(snap(dir).files, before, 'malformed forgets delete nothing');
    const ok = await post(gw, '/api/forget', {});
    assert.equal(ok.status, 200); assert.deepEqual(ok.json, { memoryOn: true });
    assert.equal(readAbout(dir), ABOUT_T);
  });
  // read-only: FX-023 state
  const ro = tmpDir(); seed(ro, filesOf('FX-023'), 0o400); chmodSync(ro, 0o500);
  await withGateway({ dir: ro }, async (gw) => {
    const b = snap(ro);
    const f = await post(gw, '/api/forget', {}); assert.equal(f.status, 500); assert.deepEqual(f.json, { error: 'not_saved' });
    const p = await post(gw, '/api/profile', { name: 'Mochi' }); assert.equal(p.status, 500); assert.deepEqual(p.json, { error: 'not_saved' });
    assert.deepEqual(snap(ro), b, 'read-only: nothing touched');
    assert.equal((await api(gw.base, '/api/profile')).json.name, '团子', 'values still read');
  });
  // unreadable: FX-024-01 (0000 关于你.md) and FX-024-02 (profile.json cut in half)
  for (const [name, brk] of [['0000 file', (d) => chmodSync(join(d, '关于你.md'), 0o000)], ['half profile', (d) => { const t = readFileSync(join(d, 'profile.json')); writeFileSync(join(d, 'profile.json'), t.subarray(0, t.length >> 1)); }]]) {
    const un = tmpDir(); seed(un, filesOf('FX-022')); brk(un);
    await withGateway({ dir: un }, async (gw) => {
      const b = snap(un);
      const f = await post(gw, '/api/forget', {}); assert.equal(f.status, 409, name); assert.deepEqual(f.json, { error: 'unreadable' }, name);
      const p = await post(gw, '/api/profile', { name: 'Mochi' }); assert.equal(p.status, 409, name); assert.deepEqual(p.json, { error: 'unreadable' }, name);
      assert.deepEqual(snap(un).files, b.files, `${name}: files unchanged`);
    });
  }
});

// ---------------------------------------------------------------- TC-177
test('TC-177 REQ-051: only local pages are served (Host and Origin check on every /api/* route)', async () => {
  const dir = tmpDir(); const files = filesOf('FX-022'); seed(dir, files);
  await withGateway({ dir }, async (gw) => {
    const P = gw.port;
    const routes = [['GET', '/api/health'], ['GET', '/api/profile'], ['GET', '/api/diary'], ['POST', '/api/profile', { name: 'Evil' }], ['POST', '/api/forget', {}], ['POST', '/api/respond', { line: 'hi', history: [] }]];
    const bad = { 'foreign Host': { host: `evil.example:${P}` }, 'foreign Origin': { host: `127.0.0.1:${P}`, origin: 'http://evil.example' }, 'Origin null': { host: `127.0.0.1:${P}`, origin: 'null' },
      'Origin wrong port': { host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P + 1}` }, 'Host missing (HTTP/1.0)': { http10: true } };
    const before = snap(dir).files;
    for (const [name, h] of Object.entries(bad)) {
      for (const [method, path, body] of routes) {
        const r = await raw(P, { method, path, body, ...h });
        assert.equal(r.status, 403, `${name} ${method} ${path}`); assert.deepEqual(r.json, { error: 'forbidden' }, `${name} ${method} ${path}`);
      }
    }
    const noHost = await raw(P, { method: 'GET', path: '/api/profile' });
    assert.ok([400, 403].includes(noHost.status), `HTTP/1.1 without Host is refused (node answers ${noHost.status})`);
    assert.deepEqual(snap(dir).files, before, 'forbidden POSTs changed nothing');
    assert.equal((await api(gw.base, '/api/profile')).json.name, '团子');
    const good = { 'localhost with matching Origin in other letter case': { host: `localhost:${P}`, origin: `HTTP://LocalHost:${P}` }, 'page style': { host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P}` }, 'no Origin': { host: `127.0.0.1:${P}` } };
    for (const [name, h] of Object.entries(good)) {
      for (const [method, path, body] of routes.filter((r) => r[1] !== '/api/forget')) {
        const r = await raw(P, { method, path, body: body && path === '/api/profile' ? { name: 'Mochi' } : body, ...h });
        assert.equal(r.status, 200, `${name} ${method} ${path} -> ${r.text}`);
      }
    }
    const f = await raw(P, { method: 'POST', path: '/api/forget', body: {}, host: `127.0.0.1:${P}` });
    assert.equal(f.status, 200, 'positive control: the same forget with a good Host works');
    assert.equal(readAbout(dir), ABOUT_T);
  });
});

// ---------------------------------------------------------------- TC-178
test('TC-178 [FX-020] REQ-048: help-line region on respond, per fixture case, takes effect on the next turn, survives a restart', async () => {
  const f = fx('FX-020');
  const crisisScript = { replies: [{ reply: 'I hear you.' }] };
  for (const [i, c] of f.input.cases.entries()) {
    const want = f.expected.cases[i];
    const dir = tmpDir();
    const gw = await startGateway({ dir, script: crisisScript, env: c.env ?? {} });
    try {
      await gw.ready();
      if (c.profile_region !== null) assert.equal((await post(gw, '/api/profile', { region: c.profile_region })).status, 200);
      if (c.then_region) assert.equal((await post(gw, '/api/profile', { region: c.then_region })).status, 200);
      const r = await respond(gw, c.line);
      const reply = (r.json?.reply ?? '').replace(/\s/g, '').toLowerCase();
      const got = { status: r.status, crisis: r.json.crisis, region: r.json.region };
      if (want.reply_checks) got.reply_checks = { has_12356: reply.includes('12356'), has_988: reply.includes('988'), has_local_line: reply.includes('当地的心理援助热线') || reply.includes('localcrisishelpline') };
      const gw2 = await gw.restart();
      try { got.after_restart_profile_region = (await api(gw2.base, '/api/profile')).json.region; } finally { await gw2.stop(); }
      const { id, ...w } = want;
      assert.deepEqual(got, w, `${c.id}`);
    } finally { await gw.stop(); }
  }
});

// ---------------------------------------------------------------- TC-179
test('TC-179 REQ-044/042/049/054: every 200 turn records its mood before the response; failures, memory off, crisis, abandoned turns and unusable folders record nothing', async () => {
  const script = {
    moods: [{ when: '开心', mood: 'pleasant-high' }, { when: '难过', mood: 'unpleasant-low' }, { when: '紧张', mood: 'unpleasant-high' }, { when: '平静', mood: 'pleasant-low' }],
    replies: [{ when: '失败', status: 503 }, { when: '慢', delayMs: 2500, reply: '好的' }],
    updates: [{ when: '事实', point: '备考', add: { busy: ['在备考'] } }],
  };
  const dir = tmpDir();
  await withGateway({ dir, script }, async (gw) => {
    const lines = ['今天很开心事实', '今天有点难过', '有点紧张'];
    const history = [];
    for (const l of lines) {
      const r = await respond(gw, l, history);
      assert.equal(r.status, 200);
      assert.deepEqual(sorted(r.json), ['crisis', 'lang', 'mood', 'region', 'reply', 'speech']);
      const es = diaryEntries(readDiary(dir));
      assert.equal(es.at(-1).word, MOOD_WORD[r.json.mood], `mood in the file when the response arrives: ${l}`);
      history.push({ role: 'user', text: l }, { role: 'companion', text: r.json.reply });
    }
    assert.equal(diaryEntries(readDiary(dir)).length, 3);
    await waitFor(() => fileHas(join(dir, '关于你.md'), '在备考') && diaryEntries(readDiary(dir))[0].point === '备考', 15000, 'update landed');
    await waitFor(() => gw.logs().filter((l) => l.event === 'memory_update').length >= 3, 15000, 'the updates of all three turns are done');
    const upd0 = kind(gw, 'update').length;
    assert.equal(upd0, 3, 'one update call per recorded turn');
    // (b) the reply call answers 503 -> a 5xx, nothing recorded, no update queued
    const b = await respond(gw, '失败了');
    assert.ok(b.status >= 500, `failed turn status ${b.status}`);
    await sleep(500);
    assert.equal(diaryEntries(readDiary(dir)).length, 3, '(b) no entry'); assert.equal(kind(gw, 'update').length, upd0, '(b) no update call');
    // (d) a crisis line: mood only, no update, 关于你 unchanged
    const aboutBefore = readAbout(dir);
    const d = await respond(gw, '我不想活了。');
    assert.equal(d.status, 200); assert.equal(d.json.crisis, true);
    const es = diaryEntries(readDiary(dir));
    assert.equal(es.length, 4, '(d) an entry for the crisis turn'); assert.deepEqual([es[3].word, es[3].point], [MOOD_WORD[d.json.mood], null]);
    await sleep(800);
    assert.equal(kind(gw, 'update').length, upd0, '(d) no update call reaches the double'); assert.equal(readAbout(dir), aboutBefore);
    // (e) the client gives up before the reply
    const ac = new AbortController();
    const abandoned = fetch(`${gw.base}/api/respond`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line: '慢一点的回复事实', history: [] }), signal: ac.signal }).catch(() => 'aborted');
    await sleep(400); ac.abort(); assert.equal(await abandoned, 'aborted');
    await waitFor(() => gw.logs().some((l) => l.event === 'memory_turn' && l.skip === 'gone'), 10000, 'memory_turn skip:gone');
    await sleep(500);
    assert.equal(diaryEntries(readDiary(dir)).length, 4, '(e) no entry'); assert.equal(kind(gw, 'update').length, upd0, '(e) no update');
    // (c) memory off
    assert.equal((await post(gw, '/api/profile', { memoryOn: false })).status, 200);
    const aboutOff = readAbout(dir);
    const c = await respond(gw, '关着记忆的事实');
    assert.equal(c.status, 200); await sleep(800);
    assert.equal(diaryEntries(readDiary(dir)).length, 4, '(c) no entry'); assert.equal(kind(gw, 'update').length, upd0, '(c) no update'); assert.equal(readAbout(dir), aboutOff);
    assert.ok(gw.logs().some((l) => l.event === 'memory_turn' && l.skip === 'off'));
    await post(gw, '/api/profile', { memoryOn: true });
    // (g) after a forget the next turn records
    assert.equal((await post(gw, '/api/forget', {})).status, 200);
    const g = await respond(gw, '忘了之后开心事实');
    assert.equal(g.status, 200);
    assert.equal(diaryEntries(readDiary(dir)).length, 1, '(g) the new turn is recorded'); assert.equal(diaryEntries(readDiary(dir))[0].word, '开心');
    await waitFor(() => fileHas(join(dir, '关于你.md'), '在备考'), 15000, '(g) and its update lands');
  });
  // (f) unreadable and read-only gateways: reply 200, no file change, skip reason in the log
  const un = tmpDir(); seed(un, filesOf('FX-022')); chmodSync(join(un, '关于你.md'), 0o000);
  await withGateway({ dir: un, script }, async (gw) => {
    const b = snap(un); const r = await respond(gw, '开心');
    assert.equal(r.status, 200); await sleep(500);
    assert.deepEqual(snap(un).files, b.files); assert.ok(gw.logs().some((l) => l.event === 'memory_turn' && l.skip === 'unreadable'));
  });
  const ro = tmpDir(); seed(ro, filesOf('FX-023'), 0o400); chmodSync(ro, 0o500);
  await withGateway({ dir: ro, script }, async (gw) => {
    const b = snap(ro); const r = await respond(gw, '开心');
    assert.equal(r.status, 200); await sleep(500);
    assert.deepEqual(snap(ro), b); assert.ok(gw.logs().some((l) => l.event === 'memory_turn' && l.skip === 'read_only'));
  });
});

// ---------------------------------------------------------------- TC-180
test('TC-180 [FX-019-02] REQ-044/046 (A38): a mood goes under the day the line was sent, even when the reply arrives after midnight (3 runs)', async () => {
  const run = async () => {
    const dir = tmpDir();
    const script = { replies: [{ when: '今天累死了', delayMs: 12000, reply: '辛苦了' }], moods: [{ when: '累死了', mood: 'unpleasant-low' }] };
    const gw = await startGateway({ dir, script, clock: '2026-11-14T23:59:50-05:00', ...NY });
    try {
      await gw.ready();
      const r = await respond(gw, D19.input.cases[1].say);
      assert.equal(r.status, 200, r.text);
      await waitFor(() => gw.logs().some((l) => l.event === 'memory_turn'), 5000, 'memory_turn log');
      const sent = gw.logs().find((l) => l.event === 'memory_turn');
      assert.ok(sent.t >= '2026-11-15T05:00:00', `reply produced after 00:00:00 on 11-15 New York (= 05:00Z): log time ${sent.t}`);
      const b = (await api(gw.base, '/api/diary')).json;
      const byDate = Object.fromEntries(b.days.filter((d) => ['2026-11-14', '2026-11-15'].includes(d.date)).map((d) => [d.date, d.entries.length]));
      const day14 = b.days.find((d) => d.date === '2026-11-14');
      return { byDate, mood: day14.entries[0]?.mood, replyMood: r.json.mood, value: day14.value };
    } finally { await gw.stop(); }
  };
  const results = await Promise.all([run(), run(), run()]);
  for (const x of results) {
    assert.deepEqual(x.byDate, D19.expected.cases[1].entries_by_date);
    assert.equal(x.mood, x.replyMood); assert.equal(x.value, MOOD_VALUE[x.replyMood]);
  }
});

// ---------------------------------------------------------------- TC-181
test('TC-181 REQ-037/050: background update: lands <= 30 s, queue of 8, deadline, wrong answer, forget aborts', async () => {
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(msg); };
  const a = async () => {
    const dir = tmpDir();
    await withGateway({ dir, script: { updates: [{ when: 'FACT-A', point: '备考雅思', add: { busy: ['在备考雅思'] } }] } }, async (gw) => {
      const r = await respond(gw, 'FACT-A 我在备考雅思'); const t0 = Date.now();
      await waitFor(() => fileHas(join(dir, '关于你.md'), '在备考雅思') && fileHas(join(dir, '日志.md'), '备考雅思'), 30000, 'point and notes line');
      const ms = Date.now() - t0; check(r.status === 200 && ms <= 30000, `(a) landed in ${ms} ms`); console.log(`TC-181 (a) landed ${ms} ms after the reply`);
    });
  };
  const b = async () => {
    const dir = tmpDir();
    const updates = Array.from({ length: 12 }, (_, i) => ({ when: `T${String(i + 1).padStart(2, '0')}`, delayMs: 2000, point: `点${i + 1}`, add: { busy: [`事T${String(i + 1).padStart(2, '0')}`] } }));
    await withGateway({ dir, script: { updates } }, async (gw) => {
      for (let i = 1; i <= 12; i++) assert.equal((await respond(gw, `T${String(i).padStart(2, '0')} 在忙`)).status, 200);
      await waitFor(() => gw.logs().filter((l) => l.event === 'memory_update').length >= 12, 60000, '12 memory_update lines');
      const ups = gw.logs().filter((l) => l.event === 'memory_update');
      const full = ups.filter((u) => u.reason === 'queue_full').length;
      check(full === 3, `(b) queue_full count ${full}, expected 3 (12 turns, one running, 8 waiting)`);
      const reqs = kind(gw, 'update').filter((x) => /T\d\d/.test(x.line)).map((x) => ({ n: /T(\d\d)/.exec(x.line)[1], t: x.t }));
      check(reqs.map((x) => x.n).join() === ['01', '05', '06', '07', '08', '09', '10', '11', '12'].join(), `(b) updates ran in order, oldest dropped: ${reqs.map((x) => x.n)}`);
      check(reqs.slice(1).every((x, i) => x.t - reqs[i].t >= 1900), '(b) one at a time');
      const about = readAbout(dir);
      for (const n of ['01', '05', '12']) check(about.includes(`事T${n}`), `(b) line T${n} landed`);
      for (const n of ['02', '03', '04']) check(!about.includes(`事T${n}`), `(b) line T${n} was dropped`);
      check((await api(gw.base, '/api/health')).status === 200, '(b) gateway alive');
    });
  };
  const c = async () => {
    const dir = tmpDir();
    await withGateway({ dir, script: { updates: [{ when: 'HANG', hang: true }, { when: 'NORMAL', point: '正常点', add: { busy: ['正常行'] } }, { when: 'WRONG', raw: '{"point":5,"add":{"busy":[]}}' }] } }, async (gw) => {
      await respond(gw, 'HANG 第一句'); await respond(gw, 'NORMAL 第二句');
      await waitFor(() => gw.logs().some((l) => l.event === 'memory_update' && l.ok === false && l.reason), 25000, 'the stuck update is cut');
      const cut = gw.logs().find((l) => l.event === 'memory_update' && l.ok === false);
      check(cut.reason === 'timeout' && cut.ms >= 13500 && cut.ms <= 16000, `(c) cut at the deadline: ${JSON.stringify(cut)}`);
      await waitFor(() => fileHas(join(dir, '关于你.md'), '正常行'), 20000, 'the next turn update runs');
      const es = diaryEntries(readDiary(dir));
      check(es[0].point === null && es[1].point === '正常点', `(c) the stuck turn keeps a mood-only entry: ${JSON.stringify(es)}`);
      const aboutBefore = readAbout(dir);
      await respond(gw, 'WRONG 第三句');
      await waitFor(() => gw.logs().filter((l) => l.event === 'memory_update').length >= 3, 15000, 'wrong-shape update logged');
      const bad = gw.logs().filter((l) => l.event === 'memory_update').at(-1);
      check(bad.ok === false && bad.reason === 'failed', `(d) wrong shape: ${JSON.stringify(bad)}`);
      check(readAbout(dir) === aboutBefore && diaryEntries(readDiary(dir))[2].point === null, '(d) no write');
    });
  };
  const e = async () => {
    const dir = tmpDir();
    await withGateway({ dir, script: { updates: ['F1', 'F2', 'F3'].map((w) => ({ when: w, delayMs: 3000, point: `点${w}`, add: { busy: [`事${w}`] } })).concat([{ when: 'AFTER', point: '之后', add: { busy: ['之后的事'] } }]) } }, async (gw) => {
      for (const w of ['F1', 'F2', 'F3']) await respond(gw, `${w} 在忙`);
      await sleep(300);
      check((await post(gw, '/api/forget', {})).status === 200, '(e) forget answered');
      await sleep(7000);
      const ups = gw.logs().filter((l) => l.event === 'memory_update');
      check(ups.some((u) => u.reason === 'aborted'), `(e) the running call is aborted: ${JSON.stringify(ups)}`);
      check(readAbout(dir) === ABOUT_T && readDiary(dir) === '# 日志\n', `(e) files stay as forget left them: ${JSON.stringify(readDiary(dir))} ${JSON.stringify(readAbout(dir))}`);
      check(kind(gw, 'update').filter((x) => /F\d/.test(x.line)).length === 1, '(e) the queued jobs were never sent');
      await respond(gw, 'AFTER 之后');
      await waitFor(() => fileHas(join(dir, '关于你.md'), '之后的事'), 15000, '(f) a turn right after lands');
      check(diaryEntries(readDiary(dir)).length === 1, '(f) one entry');
    });
  };
  await Promise.all([a(), b(), c(), e()]);
  assert.deepEqual(problems, [], problems.join('\n'));
});

// ---------------------------------------------------------------- TC-182
test('TC-182 REQ-038/039/049/055 (A55): what the reply request carries: memory block, snapshot per chat, off/on, crisis, empty file, no diary points', async () => {
  const dir = tmpDir();
  const about = '# 关于你\n\n## 最近在忙\n- 在准备实习面试\n\n## 在意的人和事\n- 猫叫豆豆\n\n## 喜欢·不喜欢\n';
  seed(dir, { '关于你.md': about, '日志.md': '# 日志\n\n## 2026-11-14\n- 开心 · POINTSECRET一二三\n' });
  await withGateway({ dir, script: { updates: [{ when: '第一句', point: '问好', add: { busy: ['NEWLINE-X'] } }] } }, async (gw) => {
    await respond(gw, '第一句你好');
    const [r1] = turnReqs(gw, 'reply', '第一句');
    const s1 = sysOf(r1);
    assert.ok(s1.includes(`<memory>\n${about}\n</memory>`), 'the notes text inside <memory>');
    assert.ok(s1.includes(GUARD), 'MEMORY_RULE guard sentence');
    assert.ok(s1.indexOf('</memory>') < s1.indexOf('只用简体中文回复'), 'LANG_RULE after the memory block');
    await waitFor(() => fileHas(join(dir, '关于你.md'), 'NEWLINE-X'), 15000, 'file changed by an update');
    await respond(gw, '第二句继续', [{ role: 'user', text: '第一句你好' }, { role: 'companion', text: 'Fake reply.' }]);
    assert.ok(!sysOf(turnReqs(gw, 'reply', '第二句')[0]).includes('NEWLINE-X'), 'the same chat keeps its snapshot');
    await respond(gw, '第三句新的聊天');
    assert.ok(sysOf(turnReqs(gw, 'reply', '第三句')[0]).includes('NEWLINE-X'), 'a new chat (history []) picks up the new text');
    await post(gw, '/api/profile', { memoryOn: false });
    await respond(gw, '第四句关着');
    const off = turnReqs(gw, 'reply', '第四句')[0];
    assert.ok(sysOf(off).includes(NO_NOTES), 'memory off: NO_NOTES');
    assert.ok(!JSON.stringify(off.body).includes('在准备实习面试') && !JSON.stringify(off.body).includes('NEWLINE-X') && !sysOf(off).includes('<memory>'), 'no notes text anywhere in the body');
    await post(gw, '/api/profile', { memoryOn: true });
    await respond(gw, '第五句又开了');
    assert.ok(sysOf(turnReqs(gw, 'reply', '第五句')[0]).includes('在准备实习面试'), 'memory on again: notes are back');
    await respond(gw, '我不想活了。');
    const cr = sysOf(turnReqs(gw, 'reply', '我不想活了')[0]);
    assert.ok(!cr.includes('<memory>') && !cr.includes(NO_NOTES) && !cr.includes('在准备实习面试'), 'crisis: no memory block and no NO_NOTES');
    assert.ok(cr.includes('用户可能有伤害自己的念头'), 'crisis rule present');
    for (const q of gw.llama()) { const s = JSON.stringify(q.body); assert.ok(!s.includes('POINTSECRET') && !s.includes('2026-11-14'), `A55: no diary point or date in a ${q.kind} request`); }
  });
  const empty = tmpDir(); seed(empty, { '关于你.md': ABOUT_T });
  await withGateway({ dir: empty }, async (gw) => {
    await respond(gw, '空的关于你');
    const s = sysOf(turnReqs(gw, 'reply', '空的关于你')[0]);
    assert.ok(s.includes(NO_NOTES) && !s.includes('<memory>'), 'empty file: NO_NOTES');
  });
});

// ---------------------------------------------------------------- TC-183
const budgetBlock = (sys) => /<memory>\n([\s\S]*?)\n<\/memory>/.exec(sys)[1];
test('TC-183 [FX-025] REQ-055/043 (A44): a 2000-Han hand-written file: replies and updates read the front part, the page shows all, the file survives', async () => {
  const lines = Array.from({ length: 111 }, (_, i) => `- 第${String(i + 1).padStart(3, '0')}行${'事'.repeat(16)}`);
  const file = `# 关于你\n\n## 最近在忙\n${lines.join('\n')}\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n`;
  assert.ok(file.match(/\p{Script=Han}/gu).length >= 1990);
  const dir = tmpDir(); seed(dir, { '关于你.md': file });
  await withGateway({ dir, script: { updates: [{ when: '第二', point: '点', add: { busy: ['新加的一行'] } }] } }, async (gw) => {
    await respond(gw, '第一句');
    const block = budgetBlock(sysOf(turnReqs(gw, 'reply', '第一句')[0]));
    assert.ok(wt(block) <= 1200, `weight ${wt(block)}`);
    assert.ok(file.startsWith(block) && file[block.length] === '\n', 'starts with the file start and ends on a line break');
    assert.ok(!block.includes('第111行') && !block.includes(lines.at(-1)), 'does not contain the last line');
    await waitFor(() => kind(gw, 'update').length >= 1, 10000, 'first update request');
    const upd = kind(gw, 'update')[0].body.messages[1].content;
    const page = /Notes page:\n"""\n([\s\S]*?)\n"""\nNewest message/.exec(upd)[1];
    assert.equal(page, block, 'the update request page is the same cut text');
    await respond(gw, '第二句');
    await waitFor(() => fileHas(join(dir, '关于你.md'), '新加的一行'), 15000, 'update line');
    const p = (await api(gw.base, '/api/profile')).json;
    assert.equal(p.about, readAbout(dir)); assert.ok(p.about.includes('第111行'), 'GET /api/profile about is the whole file');
    const disk = readAbout(dir);
    for (const l of file.split('\n')) assert.ok(disk.split('\n').includes(l), `line kept: ${l.slice(0, 12)}`);
    assert.equal((gw.err.match(/比读取预算长/g) ?? []).length, 1, 'one cut hint per run');
  });
});

// ---------------------------------------------------------------- TC-184
test('TC-184 [FX-025-06] REQ-055/037 (A53): a hand line survives updates; new facts are added; nothing is deleted', async () => {
  const f = fx('FX-025'); const c = f.input.cases[5]; const hand = c.hand_line;
  const dir = tmpDir(); seed(dir, c.files);
  const same = (t) => t.split('\n').some((l) => l.replace(/^- /, '').trim() === hand);
  await withGateway({ dir, script: { updates: [
    { when: 'half marathon', point: 'marathon training', add: { busy: ['training for a half marathon'] } },
    { when: 'BROTHER', point: 'brother visits', add: { people: ['brother Tom visits'] } },
    { when: 'NOTHING', point: null, add: { busy: ['training for a half marathon'], people: ['brother Tom visits'] } },
    { when: 'OPPOSITE', point: 'no sister', add: { people: ['I have no sister'] } }] } }, async (gw) => {
    const lines = () => readAbout(dir).split('\n').map((l) => l.replace(/^- /, '').trim());
    const nUpdates = () => gw.logs().filter((l) => l.event === 'memory_update').length;
    let n = 0;
    for (const [say, wantNew] of [[c.sessions[0][0], 'training for a half marathon'], ['BROTHER Tom is visiting', 'brother Tom visits'], ['NOTHING new today', null], ['OPPOSITE: I do not have a sister', 'I have no sister']]) {
      await respond(gw, say); n += 1;
      await waitFor(() => nUpdates() >= n, 15000, `update for ${say}`);
      await sleep(200);
      assert.ok(same(readAbout(dir)), `hand line kept after: ${say}`);
      if (wantNew) assert.ok(lines().includes(wantNew), `new fact present: ${wantNew}`);
      assert.equal(lines().filter((l) => l === hand).length, 1, 'the hand line is not duplicated');
      assert.equal(lines().filter((l) => l === 'training for a half marathon').length, n === 1 ? 1 : 1, 'a repeated fact is added once');
    }
    const final = readAbout(dir).split('\n');
    const handIdx = final.findIndex((l) => l.trim() === hand);
    assert.ok(handIdx > 0 && final.some((l) => l.includes('I have no sister')) && final.some((l) => l.includes('Lily')), 'the opposite statement adds a line and removes none');
    assert.ok(final.includes('## 最近在忙') && final.includes('## 在意的人和事') && final.includes('## 喜欢·不喜欢'), 'headings kept');
  });
});

// ---------------------------------------------------------------- TC-185
test('TC-185 [FX-022-03] REQ-050: forget while a turn is in flight leaves memory empty; the late reply still answers 200; later turns record normally (3 runs x 3 variants)', async () => {
  const LINE = fx('FX-022').input.cases[2] && '我明天还有一轮面试。';
  const variants = {
    'a: before the reply': { script: { replies: [{ when: '面试', delayMs: 2000 }], updates: [{ when: '面试', point: '面试', add: { busy: ['有一轮面试'] } }] }, forgetAt: 500, filler: false },
    'b: after the reply, update queued behind a running one': { script: { replies: [{ when: '面试', delayMs: 300 }], updates: [{ when: '填充', delayMs: 4000 }, { when: '面试', point: '面试', add: { busy: ['有一轮面试'] } }] }, forgetAt: 1500, filler: true },
    'c: while the update call runs': { script: { replies: [{ when: '面试', delayMs: 300 }], updates: [{ when: '面试', delayMs: 3000, point: '面试', add: { busy: ['有一轮面试'] } }] }, forgetAt: 1500, filler: false },
  };
  const one = async (name, v) => {
    const dir = tmpDir(); seed(dir, filesOf('FX-022'));
    const out = { name, problems: [] };
    await withGateway({ dir, script: { ...v.script, updates: [...v.script.updates, { when: '之后', point: '之后点', add: { busy: ['之后的事'] } }] } }, async (gw) => {
      if (v.filler) await respond(gw, '填充一句');
      const turn = respond(gw, LINE);
      await sleep(v.forgetAt);
      const f = await post(gw, '/api/forget', {});
      if (f.status !== 200) out.problems.push(`forget ${f.status}`);
      const r = await turn;
      if (r.status !== 200) out.problems.push(`late reply ${r.status}`);
      const state = () => ({ empty: aboutEmpty(readAbout(dir)), entries: diaryEntries(readDiary(dir)).length });
      await sleep(1000);
      const s1 = state(); if (!s1.empty || s1.entries !== 0) out.problems.push(`+1 s: ${JSON.stringify(s1)}`);
      await sleep(Number(process.env.TC185_WAIT_MS ?? 30000));
      const s2 = state(); if (!s2.empty || s2.entries !== 0) out.problems.push(`+30 s: ${JSON.stringify(s2)}`);
      if (readAbout(dir) !== ABOUT_T || readDiary(dir) !== '# 日志\n') out.problems.push('files are not the forget shape');
      await respond(gw, '之后的一句');
      await waitFor(() => fileHas(join(dir, '关于你.md'), '之后的事'), 15000, 'a later turn updates').catch(() => out.problems.push('a turn after the forget did not update'));
      if (diaryEntries(readDiary(dir)).length !== 1) out.problems.push('a turn after the forget did not record its mood');
    });
    return out;
  };
  const results = await Promise.all(Object.entries(variants).flatMap(([n, v]) => [1, 2, 3].map((i) => one(`${n} #${i}`, v))));
  const bad = results.filter((r) => r.problems.length);
  assert.deepEqual(bad, [], JSON.stringify(bad));
});

// ---------------------------------------------------------------- TC-186
test('TC-186 REQ-051 (A9): logs carry no content: canary strings never reach stdout or stderr; the 03 §7 events appear', async () => {
  const CAN = ['Canary7', 'Canary9', 'Canary11', 'Zorb', '金枪鱼', '我今天吃了'];
  const dir = tmpDir();
  seed(dir, { '关于你.md': '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n- Canary9蓝\n\n## 喜欢·不喜欢\n' });
  const script = { replies: [{ when: 'Canary7', reply: 'Zorb 说：金枪鱼Canary7 好吃' }], updates: [{ when: 'Canary7', point: 'Canary11', add: { busy: ['Canary11b'] } }] };
  const all = { out: '', err: '', events: new Set(), logs: [] };
  const take = (gw) => { all.out += gw.out; all.err += gw.err; for (const l of gw.logs()) { all.events.add(l.event); all.logs.push(l); } };
  const gw = await startGateway({ dir, script });
  try {
    await gw.ready();
    const r = await respond(gw, '我今天吃了金枪鱼Canary7', [], 'Zorb');
    assert.ok(r.text.includes('Canary7') && r.text.includes('Zorb'), 'positive control: the response body holds the canaries');
    await waitFor(() => fileHas(join(dir, '日志.md'), 'Canary11') && fileHas(join(dir, '关于你.md'), 'Canary11b'), 15000, 'canaries reach the files');
    assert.ok(readAbout(dir).includes('Canary9蓝'), 'positive control: the hand line is in the file');
    assert.equal((await post(gw, '/api/profile', { name: 'Zorb' })).status, 200);
    chmodSync(dir, 0o500); // a failing write
    assert.equal((await respond(gw, '我今天吃了金枪鱼Canary7 再来一次', [], 'Zorb')).status, 200);
    chmodSync(dir, 0o700);
    assert.equal((await post(gw, '/api/forget', {})).status, 200);
  } finally { chmodSync(dir, 0o700); await gw.stop(); }
  take(gw);
  const ro = tmpDir(); seed(ro, { '关于你.md': '# 关于你\n\n## 在意的人和事\n- Canary9蓝\n', 'profile.json': '{"version":1,"name":"Zorb"}' }, 0o400); chmodSync(ro, 0o500);
  const g2 = await startGateway({ dir: ro, script }); try { await g2.ready(); await respond(g2, '我今天吃了金枪鱼Canary7', [], 'Zorb'); await sleep(300); } finally { await g2.stop(); take(g2); }
  const un = tmpDir(); seed(un, { '关于你.md': '# 关于你\n- Canary9蓝\n', 'profile.json': '{"version":1,"name":"Zorb"}' }); writeFileSync(join(un, '日志.md'), Buffer.from([0xff, 0xfe]));
  const g3 = await startGateway({ dir: un, script }); try { await g3.ready(); await respond(g3, '我今天吃了金枪鱼Canary7', [], 'Zorb'); await sleep(300); } finally { await g3.stop(); take(g3); }
  for (const c of [...CAN, dir, ro, un, tmpdir()]) assert.ok(!all.out.includes(c), `stdout holds "${c}"`);
  for (const c of CAN) assert.ok(!all.err.includes(c), `stderr holds "${c}"`);
  for (const ev of ['memory_loaded', 'memory_lock', 'memory_turn', 'memory_update', 'profile_saved', 'memory_forget', 'memory_write_failed']) assert.ok(all.events.has(ev), `event ${ev} appears (${[...all.events].join(',')})`);
  const ps = all.logs.find((l) => l.event === 'profile_saved');
  assert.deepEqual(ps.fields, ['name'], 'profile_saved carries key names only');
  assert.ok(all.err.includes(dir) || all.err.includes('Memory folder'), 'stderr human lines name the folder');
});

// ---------------------------------------------------------------- TC-187
test('TC-187 REQ-051: data stays on this machine: only the three files (+.lock), 0700/0600, no stray files, loopback sockets only, no CORS header', async () => {
  const dir = tmpDir(); seed(dir, filesOf('FX-022'));
  const walk = (d, since, out = []) => {
    for (const n of readdirSync(d)) {
      if (['.git', 'node_modules', 'samples', 'test-results', '.build', 'docs'].includes(n)) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, since, out); else if (st.mtimeMs >= since) out.push(p);
    }
    return out;
  };
  const tmpTop = () => readdirSync(tmpdir()).sort();
  const gw = await startGateway({ dir, script: { updates: [{ when: '事', point: '点', add: { busy: ['x'] } }] } });
  const repoBefore = new Set(walk(ROOT, 0).filter(() => false));
  const since = Date.now();
  let lsof = '';
  try {
    await gw.ready();
    const tmpBefore = tmpTop();
    const r = await respond(gw, '今天有事发生'); assert.equal(r.status, 200);
    await post(gw, '/api/profile', { region: 'US' });
    const prof = await api(gw.base, '/api/profile'); const diary = await api(gw.base, '/api/diary');
    for (const x of [prof, diary]) assert.equal(x.headers.get('access-control-allow-origin'), null, 'no CORS header');
    await waitFor(() => fileHas(join(dir, '关于你.md'), '- x'), 15000, 'update');
    const pids = [gw.pid, ...gw.kids()];
    const lo = await nonLoopback(pids);
    lsof = lo.raw; mkdirSync(join(ROOT, 'test-results'), { recursive: true }); writeFileSync(join(ROOT, 'test-results/lsof-r1.txt'), `gateway pid ${gw.pid}, children ${pids.slice(1)}\n${lo.raw}`);
    assert.deepEqual(lo.bad, [], `non-loopback sockets: ${lo.bad}`); assert.ok(lo.seen.length > 0, 'lsof saw sockets');
    await post(gw, '/api/forget', {});
    assert.deepEqual(readdirSync(dir).sort(), ['.lock', 'profile.json', '关于你.md', '日志.md'].sort());
    assert.equal(mode(dir), 0o700);
    for (const n of ['profile.json', '关于你.md', '日志.md']) assert.equal(mode(join(dir, n)), 0o600, n);
    const newTop = tmpTop().filter((n) => !tmpBefore.includes(n) && !n.startsWith('lb-'));
    assert.deepEqual(newTop, [], `new top-level entries in the OS temp dir: ${newTop}`);
    const stray = walk(ROOT, since).filter((p) => !p.includes('/tests/') && !p.includes('/docs/'));
    assert.deepEqual(stray, [], `files written in the repo since start: ${stray}`);
  } finally { await gw.stop(); }
  assert.ok(!existsSync(join(dir, '.lock')));
  void repoBefore; void lsof;
});

// ---------------------------------------------------------------- TC-188
test('TC-188 REQ-054/051/052: start-up behaviour and messages', async () => {
  const run = (env, args = []) => new Promise((resolve) => {
    const e = { ...process.env, NODE_OPTIONS: `--require ${SUPPORT}/gateway-doubles.cjs`, COMPANION_REGION: 'CN', ...env };
    const p = spawn(process.execPath, ['server/main.js', ...args], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; let out = '';
    p.stderr.on('data', (c) => { err += c; }); p.stdout.on('data', (c) => { out += c; });
    p.on('exit', (code) => resolve({ code, err, out }));
    setTimeout(() => p.kill('SIGKILL'), 60000).unref();
  });
  const ports = async () => ({ PORT: String(await port4450()), BONSAI_PORT: String(await port4450()) });
  const rel = await run({ ...(await ports()), LITTLEBUDDY_DATA_DIR: 'relative/dir' });
  assert.notEqual(rel.code, 0); assert.ok(rel.err.includes('LITTLEBUDDY_DATA_DIR must be an absolute path, got "relative/dir"'), rel.err.slice(0, 400));
  const warmDir = join(tmpDir(), 'never-created');
  const warm = await run({ ...(await ports()), LITTLEBUDDY_DATA_DIR: warmDir }, ['--warm-only']);
  assert.equal(warm.code, 0, warm.err); assert.equal(existsSync(warmDir), false, '--warm-only creates no folder');
  const dir = tmpDir();
  const gw = await startGateway({ dir }); try { await gw.ready(); assert.ok(gw.err.includes(`Memory folder: ${dir}/`), gw.err); } finally { await gw.stop(); }
  const un = tmpDir(); seed(un, filesOf('FX-022')); chmodSync(join(un, '关于你.md'), 0o000);
  const g2 = await startGateway({ dir: un }); try { await g2.ready(); assert.ok(g2.err.includes('Cannot read') && g2.err.includes('关于你.md'), g2.err); assert.ok(!g2.err.includes('日志.md —'), 'names only the broken file'); } finally { await g2.stop(); }
  const ro = tmpDir(); seed(ro, filesOf('FX-023'), 0o400); chmodSync(ro, 0o500);
  const g3 = await startGateway({ dir: ro }); try { await g3.ready(); assert.ok(g3.err.includes('Memory folder is not writable'), g3.err); assert.equal((await api(g3.base, '/api/health')).status, 200, 'starts anyway'); } finally { await g3.stop(); }
});

void execFileSync; void MOOD_VALUE;
