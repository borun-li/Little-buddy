// R2 Full, group B (profile: look, voice, defaults, read-only, unreadable): TC-245..TC-256. be-tester #1. Plan: docs/backend/04-test-plan.md.
// Expected values come from 01 REQ-076..079, 083, 03 DES-042..044 and the approved fixtures FX-028, FX-029 (+ FX-030-02 for the days refusal);
// the code was not read. The real server/main.js runs as a child process on a free port >= 4450 with its own LITTLEBUDDY_DATA_DIR.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  api, cleanupTmp, DEFAULT_LOOK, fcase, fileState, fx, getProfile, mode, postProfile, R1_PROFILE, raw, ROOT, say, seed, sleep, startGateway, tmpDir, ttsGateway, withGateway,
} from './r2-helpers.js';

after(cleanupTmp);
const SLOTS = ['head', 'clothes', 'shoes', 'accessory'];
const sorted = (o) => Object.keys(o).sort();
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const fill = (look) => ({ character: look.character ?? 1, outfit: Object.fromEntries(SLOTS.map((s) => [s, look.outfit?.[s] ?? 'none'])) });
const gwOf = (dir, files, opts = {}) => { seed(dir, files); return { dir, ...opts }; };
const contract = readFileSync(join(ROOT, 'contracts/FRONTEND_BACKEND_CONTRACT.md'), 'utf8');
const section = contract.slice(contract.indexOf('## R2 seam'), contract.indexOf('## 3. Open items'));
const BAD = { error: 'bad_request' };

// ---------------------------------------------------------------- TC-245
test('TC-245 [FX-028-01] REQ-078: an R1 profile.json (no look, no voice) reads as default look and serena; the first voice save keeps name, region, switch and notice-seen', async () => {
  const { input, expected } = fcase('FX-028', 'FX-028-01');
  const dir = tmpDir();
  await withGateway(gwOf(dir, input.files), async (gw) => {
    const p = (await getProfile(gw)).json;
    assert.deepEqual(pick(p, Object.keys(expected.read)), expected.read, 'read');
    const save = await postProfile(gw, { voice: 'vivian' });
    assert.equal(save.status, expected.save.status);
    assert.deepEqual(save.json, expected.save.body, 'save body');
    const file = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
    const { look, ...rest } = file; // the look a save writes into an R1 file is not scored (meta compare_note)
    assert.deepEqual(rest, expected.file_after, 'file after: R1 fields unchanged, voice vivian');
    if (look !== undefined) assert.deepEqual(fill(look), DEFAULT_LOOK, 'if a look was written it is the default');
  });
});

// ---------------------------------------------------------------- TC-246
test('TC-246 [FX-028-01a] REQ-076: three saves are in profile.json within 1 s each, mode 0600, and the same after a restart read by a client with no state', async () => {
  const { input, expected } = fcase('FX-028', 'FX-028-01a');
  const bodies = [{ look: { character: 2 } }, { look: { outfit: { head: 3 } } }, { voice: 'uncle-fu' }];
  const dir = tmpDir();
  const gw = await startGateway(gwOf(dir, input.files, { script: {} }));
  try {
    await gw.ready();
    for (let i = 0; i < 3; i++) {
      const r = await postProfile(gw, bodies[i]);
      const file = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')); // read as soon as the 200 arrived
      const want = expected.saves[i];
      assert.equal(r.status, want.status, `save ${i + 1}`);
      assert.deepEqual(r.json.look, want.look, `save ${i + 1} look`);
      assert.equal(r.json.voice, want.voice, `save ${i + 1} voice`);
      assert.equal(want.in_file_within_1000ms && r.ms <= 1000, true, `save ${i + 1} took ${Math.round(r.ms)} ms`);
      assert.deepEqual(fill(file.look ?? {}), want.look, `save ${i + 1}: the file already holds the look`);
      if (i === 2) assert.equal(file.voice, 'uncle-fu', 'the file already holds the voice');
      assert.equal(mode(join(dir, 'profile.json')), 0o600);
    }
    const gw2 = await gw.restart();
    try {
      const p = (await getProfile(gw2)).json; // a new client: nothing but the server's files
      assert.deepEqual(pick(p, Object.keys(expected.after_restart_new_browser.profile)), expected.after_restart_new_browser.profile);
    } finally { await gw2.stop(); }
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-247
test('TC-247 [FX-028-02 FX-028-03 FX-028-04 FX-028-05] REQ-077: out-of-range or unknown values answer 400 bad_request and change neither the file nor the profile; own extra bad bodies too', async () => {
  for (const id of ['FX-028-02', 'FX-028-03', 'FX-028-04', 'FX-028-05']) {
    const { input, expected } = fcase('FX-028', id);
    const dir = tmpDir();
    await withGateway(gwOf(dir, input.files), async (gw) => {
      const before = fileState(join(dir, 'profile.json'));
      const r = await postProfile(gw, input.body);
      assert.equal(r.status, expected.status, id);
      assert.deepEqual(r.json, { error: expected.error }, id);
      assert.equal(expected.file_unchanged, true);
      assert.deepEqual(fileState(join(dir, 'profile.json')), before, `${id}: file bytes and mode`);
      assert.deepEqual(pick((await getProfile(gw)).json, ['look', 'voice']), expected.profile_after, `${id}: profile`);
    });
  }
  const dir = tmpDir();
  await withGateway(gwOf(dir, fcase('FX-028', 'FX-028-01').input.files), async (gw) => {
    const f = join(dir, 'profile.json');
    const before = fileState(f);
    const own = {
      'character "2"': { look: { character: '2' } }, 'character 0': { look: { character: 0 } }, 'character 1.5': { look: { character: 1.5 } },
      'character null': { look: { character: null } }, 'character true': { look: { character: true } },
      'look {}': { look: {} }, 'outfit {}': { look: { outfit: {} } }, 'look is a string': { look: 'x' }, 'look null': { look: null }, 'outfit array': { look: { outfit: [] } },
      'five outfit keys': { look: { outfit: { head: 1, clothes: 1, shoes: 1, accessory: 1, hat: 1 } } },
      'accessory "1"': { look: { outfit: { accessory: '1' } } }, 'accessory 4': { look: { outfit: { accessory: 4 } } }, 'accessory null': { look: { outfit: { accessory: null } } },
      'item "none " ': { look: { outfit: { head: 'none ' } } }, 'item "None"': { look: { outfit: { head: 'None' } } },
      'unknown key in look': { look: { character: 2, mood: 1 } },
      'voice "Serena"': { voice: 'Serena' }, 'voice ""': { voice: '' }, 'voice null': { voice: null }, 'voice 7': { voice: 7 }, 'voice array': { voice: ['serena'] },
      'valid look + bad voice (whole body refused)': { look: { character: 3 }, voice: 'bob' },
      'valid voice + days': { voice: 'vivian', days: 9 },
      'seven keys': { noticeSeen: true, memoryOn: true, name: 'a', region: 'CN', look: { character: 2 }, voice: 'dylan', theme: 'x' },
    };
    for (const [name, body] of Object.entries(own)) {
      const r = await postProfile(gw, body);
      assert.equal(r.status, 400, name);
      assert.deepEqual(r.json, BAD, name);
      assert.deepEqual(fileState(f), before, `${name}: file unchanged`);
    }
    assert.deepEqual(pick((await getProfile(gw)).json, ['look', 'voice']), { look: DEFAULT_LOOK, voice: 'serena' }, 'profile unchanged after all');
    // positive control: the same server accepts a valid look and every legal item including "none"
    for (const body of [{ look: { character: 3 } }, { look: { outfit: { head: 'none', clothes: 1, shoes: 2, accessory: 3 } } }, { voice: 'ono-anna' }]) assert.equal((await postProfile(gw, body)).status, 200, JSON.stringify(body));
    assert.deepEqual((await getProfile(gw)).json.look, { character: 3, outfit: { head: 'none', clothes: 1, shoes: 2, accessory: 3 } });
  });
});

// ---------------------------------------------------------------- TC-248
test('TC-248 [FX-028-06] REQ-077 (A65): hand-edited bad values read field by field as defaults; after a save the other keys (theme) stay; the load warning names fields only', async () => {
  const { input, expected } = fcase('FX-028', 'FX-028-06');
  const dir = tmpDir();
  await withGateway(gwOf(dir, input.files), async (gw) => {
    const p = (await getProfile(gw)).json;
    assert.deepEqual(pick(p, Object.keys(expected.read)), expected.read, 'field-by-field read');
    const warn = gw.logs().filter((l) => l.event === 'profile_value_default');
    assert.equal(warn.length, 1, 'one load warning');
    assert.deepEqual([...warn[0].fields].sort(), ['look.character', 'look.outfit.shoes', 'voice'], 'only the bad fields are named');
    assert.ok(!JSON.stringify(warn[0]).includes('团子') && !JSON.stringify(warn[0]).includes(dir), 'no name or path in the warning');
    const save = await postProfile(gw, { voice: 'vivian' });
    assert.equal(save.status, expected.save.status);
    assert.equal(save.json.voice, expected.save.voice);
    const file = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
    assert.deepEqual(pick(file, Object.keys(expected.file_after)), expected.file_after);
  });
  // own: the voice id is exact case ("Vivian" is not vivian, "serena " is not serena); a valid id in the file is read as is (positive control)
  for (const [bad, want] of [['Vivian', 'serena'], ['VIVIAN', 'serena'], ['serena ', 'serena'], ['vivian', 'vivian'], ['uncle-fu', 'uncle-fu']]) {
    await withGateway(gwOf(tmpDir(), { 'profile.json': `${JSON.stringify({ version: 1, name: '团子', voice: bad })}\n` }), async (gw) => {
      assert.equal((await getProfile(gw)).json.voice, want, JSON.stringify(bad));
    });
  }
});

// ---------------------------------------------------------------- TC-249
test('TC-249 [FX-028-07] REQ-083: no request can set days; the profile has no days key; the stage-up route is gone; growth still equals the diary', async () => {
  const { input, expected } = fcase('FX-028', 'FX-028-07');
  assert.deepEqual(input.body, { days: 9 });
  const dir = tmpDir();
  await withGateway(gwOf(dir, input.files), async (gw) => {
    const f = join(dir, 'profile.json');
    const before = [fileState(f), fileState(join(dir, '日志.md'))];
    const first = (await getProfile(gw)).json;
    assert.equal('days' in first, false, 'no top-level days');
    assert.deepEqual(first.growth, expected.growth_after, 'growth before: the diary has 2 days');
    for (const body of [input.body, { days: 9, voice: 'vivian' }, { growth: { days: 9 } }]) {
      const r = await postProfile(gw, body);
      assert.equal(r.status, expected.status, JSON.stringify(body));
      assert.deepEqual(r.json, { error: expected.error });
    }
    assert.deepEqual([fileState(f), fileState(join(dir, '日志.md'))], before, 'files unchanged (the valid voice beside days was not saved either)');
    assert.deepEqual((await getProfile(gw)).json.growth, expected.growth_after);
    const gone = await api(gw.base, '/api/stage-up', { method: 'POST', body: {} });
    assert.notEqual(gone.status, 200, 'no stage-up route');
    assert.equal((await postProfile(gw, { voice: 'vivian' })).status, 200, 'positive control: a valid save still works');
  });
});

// ---------------------------------------------------------------- TC-250
test('TC-250 REQ-076 (DES-043 step 1, review R-3): two partial look saves sent together both stay, 12 rounds', async () => {
  const dir = tmpDir();
  await withGateway(gwOf(dir, { 'profile.json': R1_PROFILE }), async (gw) => {
    let want = { character: 1, outfit: { ...DEFAULT_LOOK.outfit } };
    for (let i = 0; i < 12; i++) {
      const slot = SLOTS[i % 4], pair = i % 2 === 0;
      const ch = (i % 3) + 1, it = ((i + 1) % 3) + 1; // each round changes both values from the round before
      const res = await Promise.all([postProfile(gw, { look: { character: ch } }), postProfile(gw, { look: { outfit: { [slot]: pair ? it : 'none' } } })]);
      assert.deepEqual(res.map((r) => r.status), [200, 200], `round ${i}`);
      want = { character: ch, outfit: { ...want.outfit, [slot]: pair ? it : 'none' } };
      assert.deepEqual((await getProfile(gw)).json.look, want, `round ${i}: profile`);
      assert.deepEqual(fill(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).look), want, `round ${i}: file`);
    }
    // two partial outfit saves for different slots, together
    await Promise.all([postProfile(gw, { look: { outfit: { shoes: 1 } } }), postProfile(gw, { look: { outfit: { accessory: 3 } } })]);
    const look = (await getProfile(gw)).json.look;
    assert.deepEqual([look.outfit.shoes, look.outfit.accessory], [1, 3]);
  });
});

// ---------------------------------------------------------------- TC-251
test('TC-251 REQ-076 (A62, R1 051): look and voice save while memory is off; other keys, extra keys and mode 0600 stay; a fresh folder gets a profile.json with defaults for the rest', async () => {
  const dir = tmpDir();
  const start = `${JSON.stringify({ version: 1, name: '团子', region: 'US', memoryOn: false, noticeSeen: true, theme: 'dark' }, null, 2)}\n`;
  await withGateway(gwOf(dir, { 'profile.json': start }), async (gw) => {
    assert.equal((await postProfile(gw, { look: { character: 3, outfit: { head: 2 } } })).status, 200);
    assert.equal((await postProfile(gw, { voice: 'sohee' })).status, 200);
    const file = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
    assert.deepEqual(pick(file, ['version', 'name', 'region', 'memoryOn', 'noticeSeen', 'theme', 'voice']), { version: 1, name: '团子', region: 'US', memoryOn: false, noticeSeen: true, theme: 'dark', voice: 'sohee' });
    assert.equal(fill(file.look).character, 3);
    assert.equal(mode(join(dir, 'profile.json')), 0o600);
    assert.equal((await getProfile(gw)).json.memoryOn, false, 'still off');
  });
  const fresh = join(tmpDir(), 'LittleBuddy'); // the folder does not exist yet
  await withGateway({ dir: fresh }, async (gw) => {
    assert.equal(existsSync(join(fresh, 'profile.json')), false);
    assert.equal((await postProfile(gw, { voice: 'eric' })).status, 200);
    const file = JSON.parse(readFileSync(join(fresh, 'profile.json'), 'utf8'));
    assert.equal(file.voice, 'eric');
    assert.equal(mode(join(fresh, 'profile.json')), 0o600);
    assert.equal(mode(fresh), 0o700);
    assert.deepEqual((await getProfile(gw)).json.look, DEFAULT_LOOK);
  });
});

// ---------------------------------------------------------------- TC-252
test('TC-252 REQ-077 (§5 Security): the 4096-byte limit and the local-origin check cover the new keys; the file stays untouched', async () => {
  const dir = tmpDir();
  await withGateway(gwOf(dir, { 'profile.json': R1_PROFILE }), async (gw) => {
    const f = join(dir, 'profile.json');
    const before = fileState(f);
    const head = '{"look":{"character":2},"name":"', tail = '"}';
    const big = head + 'x'.repeat(4097 - head.length - tail.length) + tail;
    assert.equal(Buffer.byteLength(big), 4097);
    const r = await api(gw.base, '/api/profile', { method: 'POST', body: big });
    assert.deepEqual([r.status, r.json], [413, { error: 'too_large' }]);
    const evil = await raw(gw.port, { method: 'POST', path: '/api/profile', host: `127.0.0.1:${gw.port}`, origin: 'http://evil.example', body: { voice: 'ryan' } });
    assert.deepEqual([evil.status, evil.json], [403, { error: 'forbidden' }]);
    const rebind = await raw(gw.port, { method: 'POST', path: '/api/profile', host: 'rebind.example', body: { look: { character: 3 } } });
    assert.deepEqual([rebind.status, rebind.json], [403, { error: 'forbidden' }]);
    assert.deepEqual(fileState(f), before, 'file unchanged by all three');
    const ok = await raw(gw.port, { method: 'POST', path: '/api/profile', host: `127.0.0.1:${gw.port}`, body: { voice: 'ryan' } });
    assert.equal(ok.status, 200, 'positive control: a local request with the same body works');
  });
});

// ---------------------------------------------------------------- TC-253
test('TC-253 REQ-076/077 (§5 Observability, §6): profile_saved lists field names and the voice id; no log line holds the name or the folder path', async () => {
  const dir = tmpDir();
  await withGateway(gwOf(dir, { 'profile.json': R1_PROFILE.replace('团子', 'Mochi团子') }), async (gw) => {
    await postProfile(gw, { look: { character: 2, outfit: { head: 3 } } });
    await postProfile(gw, { voice: 'vivian' });
    await postProfile(gw, { name: '糯米团' });
    await sleep(100);
    const saved = gw.logs().filter((l) => l.event === 'profile_saved');
    assert.equal(saved.length, 3);
    assert.ok(saved[0].fields.includes('look') && !('voice' in saved[0]), 'look save names the field');
    assert.ok(saved[1].fields.includes('voice') && saved[1].voice === 'vivian', 'voice save carries the id');
    assert.ok(saved[2].fields.includes('name') && !JSON.stringify(saved[2]).includes('糯米团'), 'a name save does not carry the name');
    for (const l of gw.out.split('\n').filter((x) => x.startsWith('{'))) {
      assert.ok(!l.includes('Mochi') && !l.includes('团子') && !l.includes('糯米团') && !l.includes(dir), `log line leaks: ${l.slice(0, 120)}`);
    }
  });
});

// ---------------------------------------------------------------- TC-254
test('TC-254 [FX-029-01] REQ-079: a read-only folder answers 500 not_saved for look and voice, keeps the old values, leaves files untouched, stays read-only after a restart', async () => {
  const { input, expected } = fcase('FX-029', 'FX-029-01');
  const dir = tmpDir();
  seed(dir, input.files);
  const f = join(dir, 'profile.json');
  chmodSync(f, 0o400); chmodSync(dir, 0o500);
  let gw = await startGateway({ dir, script: {} });
  try {
    await gw.ready();
    const bodies = [{ look: { character: 3 } }, { voice: 'dylan' }];
    const before = fileState(f);
    for (let i = 0; i < 2; i++) {
      const r = await postProfile(gw, bodies[i]);
      assert.deepEqual([r.status, r.json.error], [expected.saves[i].status, expected.saves[i].error], `save ${i + 1}`);
      assert.deepEqual(pick((await getProfile(gw)).json, ['look', 'voice']), expected.saves[i].profile_after, `save ${i + 1}: value unchanged`);
    }
    assert.equal(expected.files_unchanged, true);
    assert.deepEqual(fileState(f), before, 'bytes and mode');
    assert.equal(mode(dir), 0o500);
    gw = await gw.restart();
    assert.deepEqual(pick((await getProfile(gw)).json, ['look', 'voice', 'name']), expected.after_restart, 'after restart');
    assert.equal((await postProfile(gw, { voice: 'dylan' })).status, 500, 'still read-only after the restart');
    // positive control: with write permission back, the same save works
    await gw.stop();
    chmodSync(dir, 0o700); chmodSync(f, 0o600);
    gw = await startGateway({ dir, script: {} });
    await gw.ready();
    assert.equal((await postProfile(gw, { voice: 'dylan' })).status, 200);
  } finally { await gw.stop(); chmodSync(dir, 0o700); }
  // own: the folder turns read-only AFTER the server started (the write itself fails, not the start-up check): not_saved, old value stands
  const dir2 = tmpDir();
  seed(dir2, input.files);
  const gw2 = await startGateway({ dir: dir2, script: {} });
  try {
    await gw2.ready();
    assert.equal((await postProfile(gw2, { look: { character: 2 } })).status, 200, 'writable at first');
    const f2 = join(dir2, 'profile.json');
    const before2 = fileState(f2);
    chmodSync(dir2, 0o500);
    const r = await postProfile(gw2, { voice: 'dylan' });
    assert.deepEqual([r.status, r.json], [500, { error: 'not_saved' }], 'a failing write is not_saved');
    const p = (await getProfile(gw2)).json;
    assert.deepEqual([p.voice, p.look.character], ['serena', 2], 'the old value stands in memory');
    assert.deepEqual(fileState(f2), before2, 'file bytes unchanged');
    chmodSync(dir2, 0o700);
    assert.equal((await postProfile(gw2, { voice: 'dylan' })).status, 200, 'positive control: writable again, the same save works');
  } finally { await gw2.stop(); chmodSync(dir2, 0o700); }
});

// ---------------------------------------------------------------- TC-255
test('TC-255 [FX-029-02] REQ-079 (and REQ-073 default voice): an unreadable profile.json gives default look, serena, 0 days, nothing written; save is 409 unreadable; a turn reports 0 days and up null; speech uses serena', async () => {
  const { input, expected } = fcase('FX-029', 'FX-029-02');
  const dir = tmpDir();
  const gw = await ttsGateway({ dir, files: input.files });
  try {
    const files = ['profile.json', '日志.md'].map((n) => join(dir, n));
    const before = files.map(fileState);
    const r = (await getProfile(gw)).json;
    assert.deepEqual(pick(r, Object.keys(expected.read)), expected.read, 'read: readable false, defaults, 0 days (the diary holds 6)');
    const save = await postProfile(gw, { voice: 'dylan' });
    assert.deepEqual([save.status, save.json.error], [expected.save.status, expected.save.error]);
    const turn = await say(gw, '今天天气不错。');
    assert.equal(turn.status, 200);
    assert.deepEqual(turn.json.growth, expected.respond_growth);
    const n = gw.lines().length;
    assert.equal((await fetch(`${gw.base}/api/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '你好。', lang: 'zh' }) })).status, 200);
    assert.deepEqual(gw.lines().slice(n).map((l) => l.voice), ['serena'], 'default voice while unreadable');
    assert.equal(expected.files_unchanged, true);
    assert.deepEqual(files.map(fileState), before, 'both files byte-identical (nothing written)');
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-256
const keysIn = (text, re) => re.exec(text)[1].split(',').map((k) => k.trim().split(':')[0].trim());
test('TC-256 [FX-028-01 FX-030-01] REQ-076/080/082 seam shapes (backend side): GET /api/profile, POST /api/profile 200 and respond 200, empty and filled', async () => {
  const growthKeys = keysIn(section, /`(?:\{)(days, stage[^}]*)\}`/);
  const postKeys = keysIn(section, /200 `\{(memoryOn, noticeSeen, name, region, look, voice)\}`/);
  assert.deepEqual(growthKeys, ['days', 'stage', 'into', 'span', 'left'], 'keys read from the contract row');
  assert.deepEqual(postKeys, ['memoryOn', 'noticeSeen', 'name', 'region', 'look', 'voice']);
  const R1_GET = ['about', 'aboutEmpty', 'kept', 'memoryOn', 'name', 'newProfile', 'noticeSeen', 'path', 'readable', 'region', 'systemRegion'];
  const check = async (gw, label) => {
    const p = (await getProfile(gw)).json;
    assert.deepEqual(sorted(p), [...R1_GET, 'growth', 'look', 'voice'].sort(), `${label}: GET keys`);
    assert.deepEqual(sorted(p.look), ['character', 'outfit']);
    assert.deepEqual(sorted(p.look.outfit), [...SLOTS].sort());
    assert.deepEqual(sorted(p.growth), [...growthKeys].sort(), `${label}: growth has no up`);
    assert.ok(!('days' in p), `${label}: no top-level days`);
    for (const gone of ['stageSeen', 'claimStageUp']) assert.ok(!JSON.stringify(p).includes(gone), `${label}: no ${gone} on the wire`);
    const post = await postProfile(gw, { voice: 'dylan' });
    assert.deepEqual(sorted(post.json), [...postKeys].sort(), `${label}: POST 200 keys`);
    const turn = await say(gw, '今天天气不错。');
    assert.equal(turn.status, 200);
    assert.deepEqual(sorted(turn.json.growth), [...growthKeys, 'up'].sort(), `${label}: respond growth keys`);
    assert.deepEqual(sorted(turn.json), ['crisis', 'growth', 'lang', 'mood', 'region', 'reply', 'speech'], `${label}: respond keys`);
    return p;
  };
  // (i) missing folder: the empty case
  const fresh = join(tmpDir(), 'LittleBuddy');
  await withGateway({ dir: fresh, script: {} }, async (gw) => {
    const empty = (await getProfile(gw)).json;
    assert.deepEqual([empty.look, empty.voice, empty.growth], [DEFAULT_LOOK, 'serena', fcase('FX-030', 'FX-030-01').expected.growth]);
    await check(gw, 'empty');
  });
  // (ii) the state FX-028-01a leaves, with a diary
  const dir = tmpDir();
  await withGateway(gwOf(dir, { ...fcase('FX-028', 'FX-028-01a').input.files, '日志.md': fcase('FX-030', 'FX-030-02').input.files['日志.md'] }, { script: {} }), async (gw) => {
    await postProfile(gw, { look: { character: 2 } });
    assert.equal((await check(gw, 'filled')).look.character, 2);
  });
});
