// R2 Full, group A (voice path): TC-238..TC-244. be-tester #1. Plan: docs/backend/04-test-plan.md. Expected values come from 01 REQ-073..075,
// 03 DES-040/041/045 and the approved fixtures FX-026, FX-027 (compare notes in their meta.json); the code was not read.
// The real server/main.js and server/tts.js run; the TTS helper is tests/support/fake-tts.cjs speaking the DES-040 line protocol, so these
// tests show what the gateway SENDS to the helper and LOGS (argv, request lines, tts_done.voice), not what a voice sounds like (that is r2-live).
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  api, argAt, captureLogs, cleanupTmp, fcase, fx, getProfile, imp, postProfile, R1_PROFILE, shellWrapper, sleep, SUPPORT, speak, tmpDir, ttsGateway, VOICES, waitFor, withEnv,
} from './r2-helpers.js';

after(cleanupTmp);
const sorted = (o) => Object.keys(o).sort();
const REPLIES = fx('FX-026').input.replies; // FX-013's two replies, verbatim
const partsOf = async (r) => (await imp('server/tts.js')).speechParts(r.text, r.lang);
const profileWith = (extra) => R1_PROFILE.replace('\n}\n', `,\n  ${extra}\n}\n`);

// every part of a reply, one after another; returns the statuses and the helper's view of each part
async function readReply(gw, reply) {
  const out = [];
  for (const text of await partsOf(reply)) {
    const before = gw.lines().length;
    const r = await speak(gw, text, reply.lang);
    out.push({ text, status: r.status, type: r.type, riff: r.body.toString('ascii', 0, 4), line: gw.lines().slice(before) });
  }
  return out;
}
const lineVoices = (parts) => parts.flatMap((p) => p.line.map((l) => l.voice));

// ---------------------------------------------------------------- TC-238
test('TC-238 [FX-026-01 FX-026-02 FX-026-03] REQ-073: the profile voice reaches the helper (spawn argument, every line, tts_done); absent or wrong-case voice reads as serena', async () => {
  const c1 = fcase('FX-026', 'FX-026-01');
  assert.deepEqual(sorted(c1.expected), ['all_parts_audio', 'control_voice_used_all', 'id', 'pitch_lower_than_serena', 'profile_voice', 'voice_used_all']);
  const dir = tmpDir();
  let gw = await ttsGateway({ dir, files: c1.input.files });
  try {
    assert.equal((await getProfile(gw)).json.voice, c1.expected.profile_voice);
    assert.equal(argAt(gw.argvs()[0], '--voice'), c1.expected.voice_used_all, 'spawn --voice is the profile voice');
    const parts = [...(await readReply(gw, REPLIES.zh)), ...(await readReply(gw, REPLIES.en))];
    assert.ok(parts.length >= 5, `FX-013 parts: ${parts.length}`);
    for (const p of parts) assert.deepEqual([p.status, p.type, p.riff], [200, 'audio/wav', 'RIFF'], p.text);
    assert.deepEqual(lineVoices(parts), Array(parts.length).fill(c1.expected.voice_used_all), 'every line the helper got');
    assert.deepEqual(gw.done().map((l) => l.voice), Array(parts.length).fill(c1.expected.voice_used_all), 'tts_done.voice');
    // control: the same text with "voice": "serena"
    await gw.stop();
    const serenaFile = c1.input.files['profile.json'].replace('uncle-fu', 'serena');
    assert.notEqual(serenaFile, c1.input.files['profile.json']);
    gw = await ttsGateway({ dir, files: { 'profile.json': serenaFile } });
    const ctl = [...(await readReply(gw, REPLIES.zh)), ...(await readReply(gw, REPLIES.en))];
    assert.deepEqual(lineVoices(ctl), Array(ctl.length).fill(c1.expected.control_voice_used_all));
    assert.equal(argAt(gw.argvs().at(-1), '--voice'), 'serena');
  } finally { await gw.stop(); }
  for (const id of ['FX-026-02', 'FX-026-03']) {
    const { input, expected } = fcase('FX-026', id);
    const g = await ttsGateway({ dir: tmpDir(), files: input.files });
    try {
      assert.equal((await getProfile(g)).json.voice, expected.profile_voice, id);
      const parts = await readReply(g, REPLIES.zh);
      assert.ok(parts.every((p) => p.status === 200) === expected.all_parts_audio, id);
      assert.deepEqual(lineVoices(parts), Array(parts.length).fill(expected.voice_used_all), `${id} lines`);
      assert.deepEqual(g.done().map((l) => l.voice), Array(parts.length).fill(expected.voice_used_all), `${id} tts_done`);
      assert.equal(argAt(g.argvs()[0], '--voice'), 'serena', `${id} spawn`);
    } finally { await g.stop(); }
  }
});

// ---------------------------------------------------------------- TC-239
test('TC-239 [FX-026-05] REQ-073/074: each of the 9 voices is saved, accepted and used for the next part (line, tts_done), one helper spawn', async () => {
  const { input, expected } = fcase('FX-026', 'FX-026-05');
  const first = (await partsOf(REPLIES.zh))[0];
  assert.equal(first, '太棒了！');
  const gw = await ttsGateway({ dir: tmpDir(), files: input.files });
  try {
    for (const v of VOICES) {
      const save = await postProfile(gw, { voice: v });
      assert.equal(save.status, 200, v);
      assert.equal(save.json.voice, v);
      const n = gw.lines().length;
      const r = await speak(gw, first, 'zh');
      assert.equal(r.status, 200, v);
      assert.deepEqual(gw.lines().slice(n).map((l) => l.voice), [expected.voice_used[v]], `line for ${v}`);
    }
    assert.deepEqual(gw.done().map((l) => l.voice), VOICES.map((v) => expected.voice_used[v]), 'tts_done voices in order');
    assert.equal(gw.argvs().length, 1, 'the helper was spawned once');
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-240
test('TC-240 [FX-026-04] REQ-074: after serena was warmed, saving dylan makes the next 3 replies dylan; no timeout, no helper restart', async () => {
  const { input, expected } = fcase('FX-026', 'FX-026-04');
  const gw = await ttsGateway({ dir: tmpDir(), files: input.files });
  try {
    const warm = await speak(gw, '你好。', 'zh');
    assert.equal(warm.status, 200);
    assert.equal(gw.lines().at(-1).voice, 'serena', 'warm-up part is serena');
    const save = await postProfile(gw, { voice: 'dylan' });
    assert.equal(save.status, expected.save.status);
    assert.equal(save.json.voice, expected.save.voice);
    const order = [REPLIES.zh, REPLIES.en, REPLIES.zh];
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const parts = await readReply(gw, order[i]);
      statuses.push(...parts.map((p) => p.status));
      assert.deepEqual(lineVoices(parts), Array(parts.length).fill(expected.replies[i].voice_used_all), `reply ${i + 1}`);
    }
    assert.equal(statuses.filter((s) => s === 504).length, expected.timeouts);
    assert.ok(statuses.every((s) => s === 200));
    assert.equal(gw.argvs().length, 1, 'no helper restart for the voice change');
    assert.equal(gw.done().at(-1).voice, 'dylan');
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-241
test('TC-241 REQ-073 (A58): a voice in the speak request body is ignored, not refused; the profile voice is used', async () => {
  const gw = await ttsGateway({ dir: tmpDir(), files: { 'profile.json': profileWith('"voice": "vivian"') } });
  try {
    for (const extra of [{ voice: 'ryan' }, { voice: 'bob' }, { voice: 5 }, {}]) {
      const n = gw.lines().length;
      const r = await speak(gw, '你好。', 'zh', extra);
      assert.equal(r.status, 200, JSON.stringify(extra));
      assert.deepEqual(gw.lines().slice(n).map((l) => l.voice), ['vivian'], JSON.stringify(extra));
    }
    // positive control: the profile voice does decide; the same request body after a save follows it
    await postProfile(gw, { voice: 'eric' });
    const n = gw.lines().length;
    await speak(gw, '你好。', 'zh', { voice: 'ryan' });
    assert.deepEqual(gw.lines().slice(n).map((l) => l.voice), ['eric']);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-242
test('TC-242 [FX-027-02] REQ-075/074: 4 queued parts, voice saved 200 ms after the 4th is sent: part in flight serena, the rest vivian; each answered once, in order', async () => {
  const { input, expected } = fcase('FX-027', 'FX-027-02');
  assert.equal(input.voice_before, 'serena');
  const dir = tmpDir();
  const gw = await ttsGateway({ dir, files: { 'profile.json': fcase('FX-026', 'FX-026-02').input.files['profile.json'] }, env: { FAKE_TTS_DELAY_MS: '400' } });
  try {
    await speak(gw, '你好。', 'zh'); // warm-up, answered
    const nWarm = gw.lines().length, nDone = gw.done().length;
    const sent = [], answered = [];
    const reqs = input.parts.map((p, i) => {
      sent.push(i + 1);
      return speak(gw, p.text, p.lang).then((r) => { answered.push(i + 1); return r; });
    });
    await sleep(200);
    assert.equal((await postProfile(gw, { voice: 'vivian' })).status, 200);
    const res = await Promise.all(reqs);
    const lines = gw.lines().slice(nWarm), done = gw.done().slice(nDone);
    assert.deepEqual(input.parts.map((p, i) => ({ n: i + 1, status: res[i].status, voice_used: done[i]?.voice })), expected.answers, 'answers');
    assert.deepEqual(lines.map((l) => l.text), input.parts.map((p) => p.text), 'helper got the parts in order');
    assert.deepEqual(lines.map((l) => l.voice), expected.answers.map((a) => a.voice_used), 'voice on each helper line');
    assert.equal(done.length, 4);
    assert.equal(expected.answered_once_each, true);
    assert.equal(expected.answered_in_order, true);
    assert.deepEqual(answered, [1, 2, 3, 4], 'responses came back in n order');
    assert.deepEqual(done.map((l) => l.chars), input.parts.map((p) => p.text.length), 'tts_done lines in n order');
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-243
async function staleRun(env, texts) {
  const { createTts } = await imp('server/tts.js');
  const { CONFIG } = await imp('server/config.js');
  const dir = tmpDir();
  const cfg = structuredClone(CONFIG);
  cfg.tts = { ...cfg.tts, bin: shellWrapper(dir, 'companion-tts', `${SUPPORT}/fake-tts.cjs`), modelDir: join(dir, 'models'), tokenizerDir: join(dir, 'tok'), voice: 'serena' };
  const said = [];
  const outcome = [];
  const { logs } = await captureLogs(async () => {
    const tts = await withEnv(env, () => { const t = createTts(cfg, { voiceOf: () => 'serena', say: (t) => said.push(t) }); t.start(); return t; });
    try {
      await waitFor(() => tts.state === 'ready', 10000, 'tts ready');
      for (const t of texts) outcome.push(await tts.speak(t, 'en', new AbortController().signal).then((b) => ({ wav: b.toString('ascii', 0, 4) }), (e) => ({ code: e.code })));
    } finally { tts.stop(); }
  });
  return { said, outcome, stale: logs.filter((l) => l.event === 'tts_helper_stale'), logs };
}
test('TC-243 REQ-073 (DES-041 step 5): a helper that does not report its voice, or reports another, gives one tts_helper_stale warning and one spoken hint per run; audio still delivered; matching voice and error replies give none', async () => {
  const three = ['One.', 'Two.', 'Three.'];
  const none = await staleRun({ FAKE_TTS_NOVOICE: '1' }, three);
  const other = await staleRun({ FAKE_TTS_ECHO: 'ryan' }, three);
  for (const [name, r, got] of [['missing', none, null], ['other', other, 'ryan']]) {
    assert.deepEqual(r.outcome, three.map(() => ({ wav: 'RIFF' })), `${name}: audio still returned`);
    assert.equal(r.stale.length, 1, `${name}: exactly one warning over 3 parts`);
    assert.equal(r.stale[0].level, 'warn');
    assert.equal(r.stale[0].asked, 'serena');
    assert.equal(r.stale[0].got, got);
    assert.equal(r.said.length, 1, `${name}: one spoken hint`);
    assert.ok(r.said[0].includes('npm run setup') && /\p{Script=Han}/u.test(r.said[0]) && /[A-Za-z]{4}/.test(r.said[0]), `hint in both languages: ${r.said[0]}`);
  }
  const ok = await staleRun({}, three);
  assert.equal(ok.stale.length, 0, 'matching voice: no warning');
  assert.equal(ok.said.length, 0);
  const err = await staleRun({ FAKE_TTS_NOVOICE: '1' }, ['ERR one', 'ERR two']);
  assert.deepEqual(err.outcome, [{ code: 'failed' }, { code: 'failed' }]);
  assert.equal(err.stale.length, 0, 'error replies never trigger it');
  assert.equal(err.said.length, 0);
});

// ---------------------------------------------------------------- TC-244
test('TC-244 REQ-073/074 (DES-041 step 2): a helper restart reuses the first spawn arguments; the next line still carries the current voice', async () => {
  const gw = await ttsGateway({ dir: tmpDir(), files: { 'profile.json': profileWith('"voice": "uncle-fu"') } });
  try {
    assert.equal(argAt(gw.argvs()[0], '--voice'), 'uncle-fu');
    assert.equal((await postProfile(gw, { voice: 'dylan' })).status, 200);
    const n = gw.lines().length;
    const die = await speak(gw, 'DIE now', 'en'); // the double exits on this text
    assert.notEqual(die.status, 200, 'the part in flight is lost with the helper');
    assert.equal(gw.lines().slice(n)[0].voice, 'dylan', 'the line that killed it already carried the current voice');
    await waitFor(async () => gw.argvs().length === 2 && (await api(gw.base, '/api/health')).json?.tts === 'ready', 30000, 'helper respawned and ready');
    assert.deepEqual(gw.argvs()[1], gw.argvs()[0], 'respawn uses the first arguments');
    assert.equal(argAt(gw.argvs()[1], '--voice'), 'uncle-fu');
    const m = gw.lines().length;
    const r = await speak(gw, '你好。', 'zh');
    assert.equal(r.status, 200);
    assert.equal(gw.lines().slice(m)[0].voice, 'dylan');
  } finally { await gw.stop(); }
});
