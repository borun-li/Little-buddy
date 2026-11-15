// Backend tests against the running stack (Bonsai + WhisperKit). Base URL: COMPANION_URL (default http://127.0.0.1:4400).
// Skipped with a reason when no server is reachable or ready; port 4317 (the user's preview) is never targeted.
// Written from 01-requirements, 03-detailed-design §9 and the approved fixtures FX-001..008 only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { ROOT, MOODS, fx, makeWav, probeLive, call, memo, replyChecks, languageOfReply, errorRate, transcriptLanguage, nonLoopback, sleep } from './server-helpers.js';

const live = await probeLive();
const skip = live.skip;
const B = live.base;
const T = (name, fn, timeout = 600000) => test(name, { skip, timeout }, fn);

mkdirSync(`${ROOT}test-results`, { recursive: true });
const keep = (tag, o) => { if (!skip) appendFileSync(`${ROOT}test-results/backend-replies.jsonl`, JSON.stringify({ tag, t: new Date().toISOString(), ...o }) + '\n'); };
const respond = (body) => call(B, '/api/respond', { body });
const transcribe = (wav) => call(B, '/api/transcribe', { body: wav, type: 'audio/wav' });
const hanWords = (t) => [[...t.matchAll(/\p{Script=Han}/gu)].length, [...t.matchAll(/[A-Za-z]+/g)].length];
const majority = (t) => { const [h, w] = hanWords(t); return h > 0 && h >= w ? 'zh' : w > 0 ? 'en' : 'zh'; };
const rawGet = (path, method = 'GET') => new Promise((resolve, reject) => {
  const u = new URL(B);
  const r = http.request({ host: u.hostname, port: u.port, path, method }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
  r.on('error', reject); r.end();
});

// ---------- health
T('TC-040 GET /api/health: 200 {ready: true, stt: "ready", bonsai: "ready"} after warm-up', async () => {
  const r = await call(B, '/api/health', { method: 'GET' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ready: true, stt: 'ready', bonsai: 'ready' });
});

// ---------- transcription: FX-005..008
const transcribeRuns = (id) => memo(async () => {
  const f = fx(id), out = [];
  for (let i = 0; i < f.meta.runs; i++) { const r = await transcribe(f.wav()); out.push(r); keep(`${id}#${i}`, { text: r.json?.text, ms: Math.round(r.ms) }); }
  return out;
});
const runsOf = { 'FX-005': transcribeRuns('FX-005'), 'FX-006': transcribeRuns('FX-006'), 'FX-007': transcribeRuns('FX-007') };
for (const [tc, id] of [['TC-041', 'FX-005'], ['TC-042', 'FX-006'], ['TC-043', 'FX-007']]) {
  T(`${tc} [${id}] POST /api/transcribe: ${fx(id).expected.metric} <= 0.15 against the reference text in all runs`, async () => {
    const { expected: e, meta } = fx(id);
    const runs = await runsOf[id]();
    assert.equal(runs.length, meta.runs);
    for (const r of runs) {
      assert.equal(r.status, e.status, r.text);
      assert.equal(typeof r.json.text, 'string');
      const er = errorRate(r.json.text, e.text_reference, e.metric);
      assert.ok(er <= e.error_rate_max, `${e.metric} ${er.toFixed(3)} for ${JSON.stringify(r.json.text)} vs ${JSON.stringify(e.text_reference)}`);
    }
  });
}

T('TC-044 [FX-005 FX-006 FX-007] transcript keeps the spoken language in every run (en/en/zh; 3/3 each, 6/6 for FX-006+FX-007); zh is Simplified', async () => {
  const trad = /[點難與麼們這個說話嗎開關還讓為會時問題從來學習]/;
  for (const id of ['FX-005', 'FX-006', 'FX-007']) {
    const want = fx(id).expected.language;
    for (const r of await runsOf[id]()) {
      assert.equal(transcriptLanguage(r.json.text), want, `${id}: ${JSON.stringify(r.json.text)}`);
      assert.ok(!trad.test(r.json.text), `${id}: Traditional characters in ${r.json.text}`);
    }
  }
});

T('TC-045 [FX-008] 2 s of silence: 200 {"text": ""} exactly, on every call', async () => {
  const f = fx('FX-008');
  for (let i = 0; i < 3; i++) {
    const r = await transcribe(f.wav());
    assert.equal(r.status, f.expected.status);
    assert.deepEqual(r.json, f.expected.body);
  }
});

// ---------- respond: FX-001..003
async function fxRespond(id) {
  const f = fx(id), runs = [];
  for (let i = 0; i < f.meta.runs; i++) {
    const r = await respond(f.input.body);
    const reply = r.json?.reply ?? '';
    const actual = { status: r.status, reply_checks: await replyChecks(reply) };
    if ('mood' in f.expected) actual.mood = r.json?.mood; else actual.mood_in_contract_set = MOODS.includes(r.json?.mood);
    keep(`${id}#${i}`, { reply, mood: r.json?.mood, ms: Math.round(r.ms) });
    runs.push({ actual, r });
  }
  return { f, runs };
}
for (const [tc, id] of [['TC-046', 'FX-001'], ['TC-047', 'FX-002'], ['TC-048', 'FX-003']]) {
  T(`${tc} [${id}] POST /api/respond: status, mood and reply property checks equal expected.json in all 3 runs`, async () => {
    const { f, runs } = await fxRespond(id);
    assert.equal(runs.length, 3);
    runs.forEach(({ actual, r }, i) => assert.deepEqual(actual, f.expected, `run ${i + 1}: reply ${JSON.stringify(r.json)}`));
  });
}

// ---------- FX-004: 3 rounds x 10 lines
const fx4 = memo(async () => {
  const f = fx('FX-004'), rounds = [];
  for (let k = 0; k < f.meta.runs; k++) {
    const round = [];
    for (const c of f.input.cases) {
      const r = await respond(c.body);
      const exp = f.expected.cases.find((e) => e.id === c.id);
      const reply = r.json?.reply ?? '';
      round.push({ id: c.id, status: r.status, mood: r.json?.mood, reply_language: languageOfReply(reply), exp, reply });
      keep(`${c.id}#r${k + 1}`, { reply, mood: r.json?.mood, ms: Math.round(r.ms) });
    }
    rounds.push(round);
  }
  return rounds;
});
T('TC-049 [FX-004] mood: in each of 3 rounds at least 8 of 10 lines get the labelled mood; every answer is 200', async () => {
  const rounds = await fx4();
  const report = [];
  rounds.forEach((round, k) => {
    for (const c of round) assert.equal(c.status, 200, `${c.id} round ${k + 1}`);
    const hit = round.filter((c) => c.mood === c.exp.mood).length;
    report.push(`round ${k + 1}: ${hit}/10 misses=${round.filter((c) => c.mood !== c.exp.mood).map((c) => `${c.id}:${c.mood}!=${c.exp.mood}`).join(',')}`);
  });
  console.log(report.join('\n'));
  rounds.forEach((round, k) => assert.ok(round.filter((c) => c.mood === c.exp.mood).length >= 8, report[k]));
});
T('TC-050 [FX-004] reply language equals the language of the line in 30 of 30 replies', async () => {
  const bad = (await fx4()).flat().filter((c) => c.reply_language !== c.exp.reply_language);
  assert.equal(bad.length, 0, bad.map((c) => `${c.id}: ${c.reply_language} != ${c.exp.reply_language}: ${c.reply}`).join('\n'));
});

T('TC-051 [FX-004] REQ-005/A3 mixed-language lines: the reply follows the majority language of the line (3 runs each)', async () => {
  for (const [line, want] of [['我今天很happy', 'zh'], ['I really love eating 火锅 with my friends', 'en']]) {
    for (let i = 0; i < 3; i++) {
      const r = await respond({ line, history: [] });
      assert.equal(r.status, 200);
      keep(`mixed:${line}#${i}`, { reply: r.json.reply });
      assert.equal(majority(r.json.reply), want, `${line} -> ${r.json.reply}`);
    }
  }
});

// ---------- REQ-008 timing: release -> reply (transcribe + respond) with a 20-turn history
T('TC-052 [FX-006] REQ-008: with 20 turns of history, the same spoken English line takes <= 10 s from audio to reply and mood, 5 times', async () => {
  const pairs = [['Hi there', 'Hello! How is your day?'], ['It is okay', 'Glad to hear it.'], ['I had coffee', 'Nice, was it good?'], ['Yes it was', 'Lovely.'], ['I am studying', 'What are you studying?'],
    ['Math mostly', 'That takes focus.'], ['A bit hard', 'You are doing great.'], ['Thanks', 'Anytime.'], ['I walked outside', 'Fresh air helps.'], ['It was sunny', 'Sounds pleasant.']];
  let history = [];
  for (let i = 0; i < 20; i++) { const [u, c] = pairs[i % 10]; history.push({ role: 'user', text: `${u} ${i}` }, { role: 'companion', text: c }); }
  const f = fx('FX-006'), times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const t = await transcribe(f.wav());
    assert.equal(t.status, 200);
    const r = await respond({ line: t.json.text, history });
    const ms = performance.now() - t0;
    assert.equal(r.status, 200);
    assert.ok(MOODS.includes(r.json.mood));
    times.push(Math.round(ms));
    keep(`timing#${i}`, { ms: Math.round(ms), stt_ms: Math.round(t.ms), respond_ms: Math.round(r.ms), history_n: history.length });
    history = [...history, { role: 'user', text: t.json.text }, { role: 'companion', text: r.json.reply }].slice(-40);
  }
  console.log(`REQ-008 times (ms): ${times.join(', ')}`);
  assert.ok(times.every((x) => x <= 10000), `times ms: ${times.join(', ')}`);
});

// ---------- bad input and limits
const bad400 = (r, what) => { assert.equal(r.status, 400, `${what}: ${r.status} ${r.text}`); assert.deepEqual(r.json, { error: 'bad_request' }, what); };
T('TC-053 POST /api/respond rejects malformed requests with 400 {"error":"bad_request"}', async () => {
  const ok = { role: 'user', text: 'hi' };
  const cases = {
    'invalid JSON': () => call(B, '/api/respond', { body: '{nope' }),
    'empty object': () => respond({}),
    'missing line': () => respond({ history: [] }),
    'empty line': () => respond({ line: '', history: [] }),
    'whitespace line': () => respond({ line: '   \n ', history: [] }),
    'line not a string': () => respond({ line: 5, history: [] }),
    'history not array': () => respond({ line: 'hi', history: 'x' }),
    'bad role': () => respond({ line: 'hi', history: [{ role: 'system', text: 'x' }] }),
    'empty history text': () => respond({ line: 'hi', history: [{ role: 'user', text: '' }] }),
    'history text not string': () => respond({ line: 'hi', history: [{ role: 'user', text: 3 }] }),
    'history entry without text': () => respond({ line: 'hi', history: [ok, { role: 'companion' }] }),
    'wrong content type': () => call(B, '/api/respond', { body: JSON.stringify({ line: 'hi', history: [] }), type: 'text/plain' }),
  };
  for (const [what, run] of Object.entries(cases)) bad400(await run(), what);
});

T('TC-054 respond boundaries: line 1500 chars ok, 1501 -> 400; padded line trimmed; 45-entry history ok (last 40 used); history text 1500 ok, 1501 -> 400', async () => {
  const sent = 'I just got the internship! ';
  const l1500 = sent.repeat(60).slice(0, 1500).trimEnd() + 'x'.repeat(1500 - sent.repeat(60).slice(0, 1500).trimEnd().length);
  assert.equal(l1500.length, 1500);
  const a = await respond({ line: l1500, history: [] });
  assert.equal(a.status, 200, a.text); assert.ok(a.json.reply.length > 0);
  bad400(await respond({ line: l1500 + 'x', history: [] }), 'line 1501');
  const b = await respond({ line: '  I just got the internship!  ', history: [] });
  assert.equal(b.status, 200, b.text);
  const hist = Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? 'companion' : 'user', text: `message number ${i}` }));
  const c = await respond({ line: 'Thanks for listening', history: hist });
  assert.equal(c.status, 200, c.text);
  const d = await respond({ line: 'ok', history: [{ role: 'user', text: 'y'.repeat(1500) }] });
  assert.equal(d.status, 200, d.text);
  bad400(await respond({ line: 'ok', history: [{ role: 'user', text: 'y'.repeat(1501) }] }), 'history text 1501');
});

T('TC-055 bodies over the limits -> 413 {"error":"too_large"} (respond > 262144 B, transcribe > 2,000,000 B)', async () => {
  const big = JSON.stringify({ line: 'hi', history: [], pad: 'x'.repeat(262144) });
  assert.ok(big.length > 262144);
  const a = await call(B, '/api/respond', { body: big });
  assert.equal(a.status, 413, a.text); assert.deepEqual(a.json, { error: 'too_large' });
  const wav = makeWav({ data: Buffer.alloc(2000000 - 44 + 2) });
  assert.ok(wav.length > 2000000);
  const b = await transcribe(wav);
  assert.equal(b.status, 413, b.text); assert.deepEqual(b.json, { error: 'too_large' });
});

T('TC-056 POST /api/transcribe rejects non-seam audio with 400 bad_request: original 24 kHz Float32 hello.wav, stereo, 44.1 kHz, webm bytes, empty body, wrong content type', async () => {
  bad400(await transcribe(readFileSync(`${ROOT}test_audio/hello.wav`)), '24 kHz Float32');
  bad400(await transcribe(makeWav({ channels: 2 })), 'stereo');
  bad400(await transcribe(makeWav({ rate: 44100 })), '44.1 kHz');
  bad400(await transcribe(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(500)])), 'webm');
  bad400(await call(B, '/api/transcribe', { body: Buffer.alloc(0), type: 'audio/wav' }), 'empty');
  bad400(await call(B, '/api/transcribe', { body: fx('FX-006').wav(), type: 'text/plain' }), 'content type');
});

T('TC-057 [FX-006] REQ-001: a 60 s recording (1,920,044 bytes) is accepted and transcribed within the 12 s deadline', async () => {
  const pcm = Buffer.concat(Array.from({ length: 200 }, () => fx('FX-006').wav().subarray(44)));
  const data = pcm.subarray(0, 1920000);
  const wav = makeWav({ data });
  assert.equal(wav.length, 1920044);
  const r = await transcribe(wav);
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.text.length > 0, 'speech repeated for 60 s must not come back empty');
  assert.ok(r.ms < 12000, `${Math.round(r.ms)} ms`);
  keep('60s', { text: r.json.text.slice(0, 80), ms: Math.round(r.ms) });
});

// ---------- routes
T('TC-058 routes: unknown /api/* -> 404 bad_request; GET / serves the page; POST / -> 405; path traversal -> 404; /api/health is always 200', async () => {
  const a = await call(B, '/api/nope', { method: 'GET', type: null });
  assert.equal(a.status, 404); assert.deepEqual(a.json, { error: 'bad_request' });
  const home = await rawGet('/');
  assert.equal(home.status, 200); assert.match(home.headers['content-type'], /html/); assert.match(home.body, /<html/i);
  assert.equal((await rawGet('/js/app.js')).status, 200);
  assert.equal((await rawGet('/', 'POST')).status, 405);
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/%2e%2e%2fpackage.json']) {
    const r = await rawGet(p);
    assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.body.includes('companion-page'), `${p} leaked package.json`);
  }
  assert.equal((await call(B, '/api/health', { method: 'GET' })).status, 200);
});

// ---------- loopback only
T('TC-059 REQ-009: the server process and its children touch only loopback addresses (lsof -i -n -P)', async () => {
  const { execFileSync } = await import('node:child_process');
  const port = new URL(B).port;
  const pid = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n')[0];
  assert.ok(pid, `nobody listens on ${port}`);
  let kids = '';
  try { kids = execFileSync('pgrep', ['-P', pid], { encoding: 'utf8' }); } catch { /* no children */ }
  const pids = [pid, ...kids.split('\n').filter(Boolean)];
  const { bad, seen } = await nonLoopback(pids);
  assert.ok(seen.length > 0, 'lsof listed no sockets at all');
  assert.deepEqual(bad, [], `non-loopback: ${bad.join('; ')}`);
});
