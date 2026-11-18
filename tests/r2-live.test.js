// R2 Full, group E (live): TC-269..TC-274, the real TTSKit voices and WhisperKit behind the real gateway. be-tester #1. Plan: docs/backend/04-test-plan.md.
// Opt-in: COMPANION_LIVE=1 (without it this file registers nothing, so `npm test` is unchanged).
// Env: R2_ONLY=TC-272,TC-273 (default all)   R2_OUT=test-results/r2-live (evidence: one JSON per TC, the 36 number WAVs of TC-272 under r2-fx027/)
// Every gateway has its own mkdtemp data dir and its own free PORT and BONSAI_PORT >= 4450 (never 4317, never 4400, never the user's folder); only the
// PIDs started here (the gateway and its children) are stopped. Rules are the fixtures' own compare notes. The F0 estimator and the number normaliser
// are written here (not imported from server/). Q31: this file asserts only that the number is heard; it asserts nothing about which voice a crisis turn uses.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { CONFIG } from '../server/config.js';
import { api, cleanupTmp, fcase, fx, imp, port4450, ROOT, seed, sleep, tmpDir, waitFor } from './r2-helpers.js';

const ON = process.env.COMPANION_LIVE === '1';
const ONLY = process.env.R2_ONLY ? process.env.R2_ONLY.split(',') : null;
const OUT = join(ROOT, process.env.R2_OUT || 'test-results/r2-live');
const R1_PROFILE = fx('FX-026').input.cases[1].files['profile.json'];
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
const record = (tc, o) => { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${tc}.json`), JSON.stringify({ tc, t: new Date().toISOString(), ...o }, null, 2)); };
const T = (name, fn) => { const tc = /^TC-\d+/.exec(name)[0]; if (ON && (!ONLY || ONLY.includes(tc))) test(name, { timeout: 40 * 60000 }, fn); };

async function boot(files) {
  const dir = tmpDir('lb-r2live-');
  seed(dir, files);
  const port = await port4450(), bport = await port4450();
  assert.ok(![4317, 4400].includes(port) && ![4317, 4400].includes(bport));
  const env = { ...process.env, PORT: String(port), BONSAI_PORT: String(bport), LITTLEBUDDY_DATA_DIR: dir, COMPANION_REGION: 'CN', BONSAI_MODEL: process.env.R2_BONSAI_MODEL || '4B' }; // Bonsai is not under test here: the lighter 4B keeps memory free for the voices
  delete env.TTS_VOICE;
  const proc = spawn(process.execPath, ['server/main.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gw = { pid: proc.pid, dir, port, base: `http://127.0.0.1:${port}`, out: '', err: '', exited: null, pids: new Set([proc.pid]) };
  started.push(proc.pid);
  proc.stdout.on('data', (c) => { gw.out += c; });
  proc.stderr.on('data', (c) => { gw.err += c; });
  proc.on('exit', (code, sig) => { gw.exited = { code, sig }; });
  gw.logs = () => gw.out.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  gw.done = () => gw.logs().filter((l) => l.event === 'tts_done');
  gw.warn = (e) => gw.logs().filter((l) => l.event === e);
  gw.snap = () => { for (const k of kidsOf(proc.pid)) { gw.pids.add(k); if (!started.includes(k)) started.push(k); } };
  gw.stop = async () => {
    gw.snap();
    if (!gw.exited) { proc.kill('SIGTERM'); await waitFor(() => gw.exited, 30000, 'gateway exit').catch(() => proc.kill('SIGKILL')); }
    await sleep(500);
    for (const k of gw.pids) if (k !== proc.pid && alive(k)) { try { process.kill(k, 'SIGTERM'); } catch { /* gone */ } }
  };
  // STT and TTS must be ready; Bonsai is not needed for read-aloud and transcription (the gateway still starts it)
  await waitFor(async () => {
    if (gw.exited) throw new Error(`gateway exited: ${JSON.stringify(gw.exited)}\n${gw.err.slice(-600)}`);
    gw.snap();
    const h = await api(gw.base, '/api/health').then((r) => r.json, () => null);
    return h?.tts === 'ready' && h?.stt === 'ready';
  }, 10 * 60000, 'real tts and stt ready');
  return gw;
}
const speak = async (gw, text, lang) => {
  const t0 = performance.now();
  const r = await fetch(`${gw.base}/api/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }), signal: AbortSignal.timeout(60000) });
  const body = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type'), body, ms: performance.now() - t0 };
};
const profile = (gw) => api(gw.base, '/api/profile').then((r) => r.json);
const setVoice = (gw, voice) => api(gw.base, '/api/profile', { method: 'POST', body: { voice } });
async function readReply(gw, reply) { // parts one after another; voice_used = the tts_done line each part produced
  const { speechParts } = await imp('server/tts.js');
  const out = [];
  for (const text of speechParts(reply.text, reply.lang)) {
    const n = gw.done().length;
    const r = await speak(gw, text, reply.lang);
    await waitFor(() => gw.done().length > n || r.status !== 200, 3000, 'tts_done line');
    out.push({ text, status: r.status, type: r.type, wav: r.body, ms: r.ms, voice_used: gw.done()[n]?.voice ?? null });
  }
  return out;
}

// ---- WAV and F0 (FX-026 compare note: 40 ms frames, 10 ms hop, normalised autocorrelation, 60-400 Hz, voiced at peak >= 0.5, median over voiced frames)
function pcm(wav) {
  let o = 12;
  while (o + 8 <= wav.length) { const id = wav.toString('ascii', o, o + 4), n = wav.readUInt32LE(o + 4); if (id === 'data') return { rate: wav.readUInt32LE(24), s: new Int16Array(wav.buffer.slice(wav.byteOffset + o + 8, wav.byteOffset + o + 8 + n - (n % 2))) }; o += 8 + n + (n % 2); }
  throw new Error('no data chunk');
}
function f0Frames(wav) {
  const { rate, s } = pcm(wav);
  assert.equal(rate, 24000);
  const N = Math.round(rate * 0.04), H = Math.round(rate * 0.01), lo = Math.floor(rate / 400), hi = Math.ceil(rate / 60);
  const f0 = [];
  for (let a = 0; a + N + hi <= s.length; a += H) {
    let r0 = 0; for (let i = 0; i < N; i++) r0 += s[a + i] * s[a + i];
    if (r0 < 1e6) continue;
    let best = 0, lag = 0;
    for (let l = lo; l <= hi; l++) { let r = 0; for (let i = 0; i < N; i++) r += s[a + i] * s[a + i + l]; r /= r0; if (r > best) { best = r; lag = l; } }
    if (best >= 0.5) f0.push(rate / lag);
  }
  return f0;
}
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : NaN; };

// ---- number_heard (FX-027 compare note)
const LATIN = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const HAN = { 零: 0, 〇: 0, 一: 1, 幺: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function digitsOf(text) {
  let t = text.normalize('NFKC').toLowerCase();
  t = t.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => ` ${LATIN[w]} `);
  t = t.replace(/[零〇一幺二两三四五六七八九]/g, (c) => ` ${HAN[c]} `);
  return t.replace(/[^0-9]/g, '');
}
function to16k(wav, tag) {
  const dir = tmpDir('lb-r2wav-');
  const a = join(dir, `${tag}.wav`), b = join(dir, `${tag}-16k.wav`);
  writeFileSync(a, wav);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', a, b]);
  return readFileSync(b);
}
const transcribe = (gw, wav16) => api(gw.base, '/api/transcribe', { method: 'POST', body: wav16, type: 'audio/wav' });

after(async () => {
  for (const pid of started.reverse()) if (alive(pid)) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  await sleep(1000);
  const left = started.filter(alive);
  if (started.length) console.log(`r2-live: PIDs started ${started.join(',')}; still alive after cleanup: ${left.join(',') || 'none'}`);
  cleanupTmp();
});

const REPLIES = fx('FX-026').input.replies;
const first = async (r) => (await imp('server/tts.js')).speechParts(r.text, r.lang);

// ---------------------------------------------------------------- TC-269
T('TC-269 [FX-026-01] REQ-073: with uncle-fu in the profile every part is read in uncle-fu (tts_done), and the median F0 is below the serena control for zh and for en', async () => {
  const c = fcase('FX-026', 'FX-026-01');
  const med = {};
  const used = {};
  for (const voice of ['uncle-fu', 'serena']) {
    const gw = await boot({ 'profile.json': c.input.files['profile.json'].replace('uncle-fu', voice) });
    try {
      assert.equal((await profile(gw)).voice, voice);
      for (const lang of ['zh', 'en']) {
        const parts = await readReply(gw, REPLIES[lang]);
        assert.ok(parts.every((p) => p.status === 200 && p.type === 'audio/wav'), `${voice} ${lang}: all parts audio`);
        (used[voice] ??= []).push(...parts.map((p) => p.voice_used));
        med[`${voice}-${lang}`] = median(parts.flatMap((p) => f0Frames(p.wav)));
      }
    } finally { await gw.stop(); }
  }
  record('TC-269', { median_f0_hz: med, voice_used: used });
  console.log('TC-269 median F0 (Hz)', JSON.stringify(med));
  assert.ok(used['uncle-fu'].every((v) => v === c.expected.voice_used_all), `uncle-fu run voices ${used['uncle-fu']}`);
  assert.ok(used.serena.every((v) => v === c.expected.control_voice_used_all), `control voices ${used.serena}`);
  for (const lang of ['zh', 'en']) assert.ok(med[`uncle-fu-${lang}`] < med[`serena-${lang}`], `${lang}: uncle-fu ${med[`uncle-fu-${lang}`]} Hz must be below serena ${med[`serena-${lang}`]} Hz`);
  assert.deepEqual(c.expected.pitch_lower_than_serena, { zh: true, en: true });
});

// ---------------------------------------------------------------- TC-270
T('TC-270 [FX-026-02 FX-026-03 FX-026-05] REQ-073/074: the real helper reads serena for an absent or wrong-case voice, and each of the 9 voices as saved', async () => {
  const rec = {};
  for (const id of ['FX-026-02', 'FX-026-03']) {
    const { input, expected } = fcase('FX-026', id);
    const gw = await boot(input.files);
    try {
      assert.equal((await profile(gw)).voice, expected.profile_voice, id);
      const parts = await readReply(gw, REPLIES.zh);
      assert.ok(parts.every((p) => p.status === 200) === expected.all_parts_audio, id);
      assert.ok(parts.every((p) => p.voice_used === expected.voice_used_all), `${id} voices ${parts.map((p) => p.voice_used)}`);
      rec[id] = parts.map((p) => p.voice_used);
    } finally { await gw.stop(); }
  }
  const { input, expected } = fcase('FX-026', 'FX-026-05');
  const gw = await boot(input.files);
  try {
    const firstPart = (await first(REPLIES.zh))[0];
    const seen = {};
    for (const v of Object.keys(expected.voice_used)) {
      assert.equal((await setVoice(gw, v)).status, 200, v);
      const [p] = await readReply(gw, { text: firstPart, lang: 'zh' });
      assert.equal(p.status, 200, v);
      seen[v] = p.voice_used;
    }
    rec['FX-026-05'] = seen;
    assert.deepEqual(seen, expected.voice_used);
  } finally { await gw.stop(); record('TC-270', rec); }
});

// ---------------------------------------------------------------- TC-271
T('TC-271 [FX-026-04] REQ-074: after serena was warmed, saving dylan: 3 replies in dylan, 0 timeouts, first sound <= 8000 ms for reply 1 and <= 3000 ms for replies 2 and 3', async () => {
  const { input, expected } = fcase('FX-026', 'FX-026-04');
  const gw = await boot(input.files);
  try {
    assert.equal((await speak(gw, '你好。', 'zh')).status, 200, 'serena warm-up');
    const save = await setVoice(gw, 'dylan');
    assert.deepEqual([save.status, save.json.voice], [expected.save.status, expected.save.voice]);
    const rows = [];
    for (const [i, reply] of [REPLIES.zh, REPLIES.en, REPLIES.zh].entries()) {
      const parts = await readReply(gw, reply);
      const firstMs = parts[0].ms;
      rows.push({ reply: i + 1, first_sound_ms: Math.round(firstMs), voices: parts.map((p) => p.voice_used), statuses: parts.map((p) => p.status) });
    }
    record('TC-271', { rows });
    console.log('TC-271 first sound ms', JSON.stringify(rows.map((r) => r.first_sound_ms)));
    assert.equal(rows.flatMap((r) => r.statuses).filter((s) => s !== 200).length, expected.timeouts, `non-200 parts: ${JSON.stringify(rows)}`);
    for (const [i, r] of rows.entries()) {
      assert.ok(r.voices.every((v) => v === expected.replies[i].voice_used_all), `reply ${i + 1} voices ${r.voices}`);
      assert.ok(r.first_sound_ms <= (i === 0 ? 8000 : 3000), `reply ${i + 1} first sound ${r.first_sound_ms} ms (limit ${i === 0 ? 8000 : 3000})`);
    }
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-272
T('TC-272 [FX-027-01] REQ-075: crisis replies (zh/en x US/CN) read in each of the 9 voices; the number part transcribed by WhisperKit holds the number, 36 of 36 (Q31: nothing asserted about the voice a crisis turn uses)', async () => {
  const { input: cs, expected } = fcase('FX-027', 'FX-027-01');
  const spec = cs.replies;
  const gw = await boot({ 'profile.json': R1_PROFILE });
  const rows = [];
  try {
    mkdirSync(join(OUT, 'r2-fx027'), { recursive: true });
    for (const voice of cs.voices) {
      assert.equal((await setVoice(gw, voice)).status, 200, voice);
      for (const reply of spec) {
        const parts = await readReply(gw, reply);
        const bad = parts.filter((p) => p.status !== 200 || p.voice_used !== voice);
        const num = parts.find((p) => (reply.lang === 'zh' ? /九八八|幺二三五六/ : /nine eight eight|one two three five six/).test(p.text));
        assert.ok(num, `${voice} ${reply.id}: number part found`);
        const wavFile = join(OUT, 'r2-fx027', `${voice}-${reply.id}.wav`);
        writeFileSync(wavFile, num.wav);
        const t = await transcribe(gw, to16k(num.wav, `${voice}-${reply.id}`));
        const digits = digitsOf(t.json?.text ?? '');
        rows.push({ voice, reply: reply.id, valid_run: bad.length === 0, transcript: t.json?.text, digits, number: reply.number, heard: digits.includes(reply.number), part_ms: Math.round(num.ms), wav: wavFile });
      }
    }
  } finally { await gw.stop(); record('TC-272', { rows }); }
  const heard = rows.filter((r) => r.heard).length;
  console.log(`TC-272 number heard ${heard}/${rows.length}; missed: ${JSON.stringify(rows.filter((r) => !r.heard).map((r) => [r.voice, r.reply, r.transcript]))}`);
  assert.ok(rows.every((r) => r.valid_run), `a run is valid only if every part's voice_used is the set voice: ${JSON.stringify(rows.filter((r) => !r.valid_run).map((r) => [r.voice, r.reply]))}`);
  for (const v of Object.keys(expected.number_heard)) for (const [rid, want] of Object.entries(expected.number_heard[v])) {
    const row = rows.find((r) => r.voice === v && r.reply === rid);
    assert.equal(row.heard, want, `${v} ${rid}: number ${row.number} not heard in ${JSON.stringify(row.transcript)} (digits ${row.digits})`);
  }
  assert.equal(heard, 36);
});

// ---------------------------------------------------------------- TC-273
T('TC-273 [FX-027-02] REQ-075: 4 queued speak requests and a voice save 200 ms after the 4th: part 1 serena, parts 2-4 vivian, each answered once, in order', async () => {
  const { input, expected } = fcase('FX-027', 'FX-027-02');
  const gw = await boot({ 'profile.json': R1_PROFILE });
  try {
    assert.equal((await speak(gw, '你好。', 'zh')).status, 200, 'warm-up');
    const n0 = gw.done().length, order = [];
    const reqs = input.parts.map((p, i) => speak(gw, p.text, p.lang).then((r) => { order.push(i + 1); return r; }));
    await sleep(200);
    assert.equal((await setVoice(gw, 'vivian')).status, 200);
    const res = await Promise.all(reqs);
    await waitFor(() => gw.done().length >= n0 + 4, 5000, '4 tts_done lines');
    const done = gw.done().slice(n0);
    const answers = input.parts.map((p, i) => ({ n: i + 1, status: res[i].status, voice_used: done[i]?.voice }));
    record('TC-273', { answers, order, chars: done.map((d) => d.chars) });
    assert.deepEqual(answers, expected.answers);
    assert.equal(done.length, 4, 'one tts_done per part');
    assert.deepEqual(order, [1, 2, 3, 4]);
    assert.deepEqual(done.map((d) => d.chars), input.parts.map((p) => p.text.length), 'tts_done lines in n order');
    assert.equal(expected.answered_once_each && expected.answered_in_order, true);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-274
T('TC-274 REQ-073/075 (DES-040): the real companion-tts answers bad_request for an unknown voice (not another voice), reports the voice it used, and refuses an unknown start voice', async () => {
  const args = ['--model-folder', CONFIG.tts.modelDir, '--tokenizer-folder', CONFIG.tts.tokenizerDir, '--voice', 'serena'];
  const proc = spawn(CONFIG.tts.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  started.push(proc.pid);
  const lines = [];
  let buf = '';
  proc.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) !== -1) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { lines.push(JSON.parse(l)); } catch { /* not json */ } } });
  try {
    await waitFor(() => lines.some((l) => l.event === 'ready'), 5 * 60000, 'helper ready');
    const ask = async (id, extra) => { proc.stdin.write(`${JSON.stringify({ id, text: '你好。', lang: 'zh', ...extra })}\n`); await waitFor(() => lines.some((l) => l.id === id), 60000, `answer ${id}`); return lines.find((l) => l.id === id); };
    const bad = await ask(1, { voice: 'bob' });
    const other = await ask(2, { voice: 'dylan' });
    const none = await ask(3, {});
    proc.stdin.write('not json\n');
    await waitFor(() => lines.some((l) => l.id === -1), 10000, 'id -1 for undecodable input');
    const neg = lines.find((l) => l.id === -1);
    record('TC-274', { bad, other: { ...other, wav: undefined }, none: { ...none, wav: undefined }, neg });
    assert.equal(bad.error, 'bad_request');
    assert.ok(!bad.wav, 'no audio for an unknown voice');
    assert.ok(typeof other.wav === 'string' && other.voice === 'dylan' && !other.error, JSON.stringify({ ...other, wav: '..' }));
    assert.ok(typeof none.wav === 'string' && none.voice === 'serena', 'no voice -> the start voice, reported');
    assert.ok(neg.error && !('voice' in neg && neg.voice), 'undecodable input: id -1, no voice');
  } finally { proc.kill('SIGTERM'); await sleep(500); }
  const bin = spawn(CONFIG.tts.bin, args.map((a) => (a === 'serena' ? 'bob' : a)), { stdio: 'ignore' });
  started.push(bin.pid);
  const code = await new Promise((res) => bin.on('exit', res));
  assert.notEqual(code, 0, 'an unknown --voice is refused at start');
});
