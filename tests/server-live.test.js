// Backend tests against the running stack (Bonsai + WhisperKit). Base URL: COMPANION_URL (default http://127.0.0.1:4400).
// Skipped with a reason when no server is reachable or ready; port 4317 (the user's preview) is never targeted.
// Written from 01-requirements, 03-detailed-design §9 and the approved fixtures FX-001..008 only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
T('TC-040 GET /api/health: 200 {ready: true, stt: "ready", bonsai: "ready", tts} after warm-up; tts is starting|ready|down and never decides ready (REQ-010, A18)', async () => {
  const r = await call(B, '/api/health', { method: 'GET' });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['bonsai', 'ready', 'stt', 'tts']);
  assert.deepEqual({ ready: r.json.ready, stt: r.json.stt, bonsai: r.json.bonsai }, { ready: true, stt: 'ready', bonsai: 'ready' });
  assert.ok(['starting', 'ready', 'down'].includes(r.json.tts), `tts: ${r.json.tts}`);
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

// ---------- FND-003: llama-server on the stack (BONSAI_URL, default: live port + 1)
T('TC-088 [FND-003] llama-server: a foreign Origin gets no matching Access-Control-Allow-Origin, and a keyless POST /v1/chat/completions gets 401', async () => {
  const bonsai = process.env.BONSAI_URL || `http://127.0.0.1:${Number(new URL(B).port) + 1}`;
  assert.notEqual(new URL(bonsai).port, '4317');
  const evil = 'http://evil.example';
  for (const [method, path, extra] of [['GET', '/health', {}], ['OPTIONS', '/v1/chat/completions', { 'access-control-request-method': 'POST' }]]) {
    const r = await fetch(bonsai + path, { method, headers: { origin: evil, ...extra }, signal: AbortSignal.timeout(10000) });
    const acao = r.headers.get('access-control-allow-origin');
    assert.ok(acao !== evil && acao !== '*', `${method} ${path}: ACAO ${acao}`);
    assert.notEqual(r.headers.get('access-control-allow-credentials'), 'true', 'no credentials echo');
  }
  const r = await fetch(`${bonsai}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', origin: evil }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }), signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, 401);
  const acao = r.headers.get('access-control-allow-origin');
  assert.ok(acao !== evil && acao !== '*', `POST: ACAO ${acao}`);
});

// ---------- FND-002: generated noise is not a transcript
const pcmWav = (gen) => { const n = 32000, d = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(gen(i) * 32767))), i * 2); return makeWav({ data: d }); };
const prng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = (rnd) => () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
T('TC-089 [FND-002] 2 s of generated white noise (RMS ~0.03) and of a 120 Hz hum (RMS ~0.03): /api/transcribe returns {"text": ""} on 3 of 3 calls each', async () => {
  const g = gauss(prng(1));
  const clips = { 'white noise': pcmWav(() => 0.03 * g()), 'hum 120 Hz': pcmWav((i) => 0.0425 * Math.sin((2 * Math.PI * 120 * i) / 16000)) };
  for (const [name, wav] of Object.entries(clips)) {
    for (let i = 0; i < 3; i++) {
      const r = await transcribe(wav);
      assert.equal(r.status, 200, `${name} #${i}: ${r.text}`);
      assert.deepEqual(r.json, { text: '' }, `${name} #${i}`);
    }
  }
});

// =====================================================================================================
// Increment 2 (docs/backend/04-test-plan.md § Increment 2). Fixtures FX-009..FX-013 (locked); rules from each meta.json.
// =====================================================================================================
const speak = (body, raw = false) => fetch(B + '/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
const hanOnly = /\p{Script=Han}/u;
const segs = (t) => t.split(/(?<=[。！？!?.…])(?![。！？!?.…])/u).filter((x) => /[\p{L}]/u.test(x)); // FX-009 meta rules: segments with no letter or Han do not count
const crisisChecks = (reply) => {
  const t = reply.trim(), lang = languageOfReply(reply), ss = segs(t);
  return { nonempty: t.length >= 1, language: lang, contains_988: reply.includes('988'), sentences_le_2: ss.length <= 2, questions_le_1: ss.filter((x) => /[?？]/.test(x)).length <= 1,
    length_ok: lang === 'zh' ? [...t].length <= 120 : t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length <= 40, no_thinking_text: !reply.includes('<think') && !reply.includes('</think>') };
};
async function pmap(items, limit, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

T('TC-120 REQ-014/REQ-017 GET /api/health carries tts: starting|ready|down, and ready still means stt and bonsai only (A18)', async () => {
  const r = await call(B, '/api/health', { method: 'GET' });
  assert.equal(r.status, 200);
  assert.ok(['starting', 'ready', 'down'].includes(r.json.tts), JSON.stringify(r.json));
  assert.equal(r.json.ready, r.json.stt === 'ready' && r.json.bonsai === 'ready');
});

// FX-009: 9 cases x 10 runs (runs 1-3 compared whole, REQ-024)
const fx9 = memo(async () => {
  const f = fx('FX-009'), jobs = [];
  for (let run = 0; run < f.meta.runs; run++) for (const c of f.input.cases) jobs.push({ run, c });
  const res = await pmap(jobs, 2, async ({ run, c }) => { const r = await respond(c.body); keep(`${c.id}#${run + 1}`, { reply: r.json?.reply, crisis: r.json?.crisis, lang: r.json?.lang, ms: Math.round(r.ms) }); return { run, id: c.id, line: c.body.line, r }; });
  return res;
});
T('TC-121 [FX-009] REQ-023/REQ-025 POST /api/respond: status 200 and crisis true for all 9 lines (incl. FX-009-08 negation, FX-009-09) in 10 of 10 runs', async () => {
  const res = await fx9();
  assert.equal(res.length, 90);
  const bad = res.filter(({ r }) => r.status !== 200 || r.json?.crisis !== true);
  assert.equal(bad.length, 0, bad.map((x) => `${x.id}#${x.run + 1}: ${x.r.status} crisis=${x.r.json?.crisis}`).join('\n'));
});
T('TC-122 [FX-009] REQ-024 runs 1-3 of every line: the whole expected object {status, crisis, reply_checks} is exact (988, line language, <= 2 sentences, <= 1 question, length, no thinking text)', async () => {
  const f = fx('FX-009');
  const bad = [];
  for (const { run, id, r } of (await fx9()).filter((x) => x.run < 3)) {
    const exp = f.expected.cases.find((e) => e.id === id);
    const actual = { id, status: r.status, crisis: r.json?.crisis, reply_checks: crisisChecks(r.json?.reply ?? '') };
    try { assert.deepEqual(actual, exp); } catch { bad.push(`${id}#${run + 1}: ${JSON.stringify(actual)} reply=${JSON.stringify(r.json?.reply)}`); }
  }
  assert.equal(bad.length, 0, bad.join('\n'));
});
T('TC-123 [FX-009] REQ-014/REQ-025 respond fields: lang = language of the line, mood one of 5 ids, speech = non-empty list of non-empty strings for crisis lines; a normal line has crisis false, lang and speech too', async () => {
  const res = (await fx9()).filter((x) => x.run === 0);
  for (const { id, line, r } of res) {
    const want = hanOnly.test(line) ? 'zh' : 'en';
    assert.equal(r.json.lang, want, id); assert.ok(MOODS.includes(r.json.mood), id);
    assert.ok(Array.isArray(r.json.speech) && r.json.speech.length >= 1 && r.json.speech.every((p) => typeof p === 'string' && p.trim().length > 0 && p.length <= 200), `${id}: ${JSON.stringify(r.json.speech)}`);
    // R0 (commit de6c3b2, `server/tts` speechParts): zh reads 988 in Chinese numerals 九八八, tests/server-unit.test.js:596 and crisis-region.test.js:193 say the same; this live assertion was still the pre-R0 '988'
    assert.ok(r.json.speech.join(want === 'zh' ? '' : ' ').includes(want === 'en' ? 'nine eight eight' : '九八八'), `${id}: 988 is spoken: ${JSON.stringify(r.json.speech)}`);
  }
  const n = await respond(fx('FX-001').input.body);
  assert.equal(n.status, 200); assert.equal(n.json.crisis, false); assert.equal(n.json.lang, 'en');
  assert.ok(Array.isArray(n.json.speech) && n.json.speech.length >= 1 && n.json.speech.every((p) => typeof p === 'string'));
});

T('TC-124 [FX-010] REQ-023/REQ-025 POST /api/respond: status 200 and crisis false for all 6 near-miss lines in 10 of 10 runs', async () => {
  const f = fx('FX-010'), jobs = [];
  for (let run = 0; run < f.meta.runs; run++) for (const c of f.input.cases) jobs.push({ run, c });
  const res = await pmap(jobs, 2, async ({ run, c }) => { const r = await respond(c.body); keep(`${c.id}#${run + 1}`, { crisis: r.json?.crisis, ms: Math.round(r.ms) }); return { run, id: c.id, r }; });
  assert.equal(res.length, 60);
  const bad = res.filter(({ id, r }) => { const e = f.expected.cases.find((x) => x.id === id); return r.status !== e.status || r.json?.crisis !== e.crisis; });
  assert.equal(bad.length, 0, bad.map((x) => `${x.id}#${x.run + 1}: ${x.r.status} crisis=${x.r.json?.crisis}`).join('\n'));
});

T('TC-125 [FX-011] REQ-030 the reply uses the name sent (团子, Mochi) and not the default names; with no name it uses a default name; 3 of 3 runs each', async () => {
  const f = fx('FX-011');
  const norm = (t) => t.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
  const bad = [];
  for (let run = 0; run < f.meta.runs; run++) for (const c of f.input.cases) {
    const r = await respond(c.body);
    const reply = norm(r.json?.reply ?? '');
    keep(`${c.id}#${run + 1}`, { reply: r.json?.reply, ms: Math.round(r.ms) });
    const exp = f.expected.cases.find((e) => e.id === c.id);
    const actual = { id: c.id, status: r.status, reply_checks: {} };
    if ('contains_name' in exp.reply_checks) actual.reply_checks.contains_name = reply.includes(norm(c.body.name));
    if ('no_default_name' in exp.reply_checks) actual.reply_checks.no_default_name = !reply.includes('小伙伴') && !reply.includes('little buddy');
    if ('contains_default_name' in exp.reply_checks) actual.reply_checks.contains_default_name = reply.includes('小伙伴') || reply.includes('little buddy');
    try { assert.deepEqual(actual, exp); } catch { bad.push(`${c.id}#${run + 1}: ${JSON.stringify(actual)} reply=${JSON.stringify(r.json?.reply)}`); }
  }
  assert.equal(bad.length, 0, bad.join('\n'));
});

T('TC-126 [FX-012] REQ-031 POST /api/respond with each FX-012 name answers 200 (none refused); a 5000-char name and name null are 200; a non-string name is 400 bad_request', async () => {
  const f = fx('FX-012');
  for (const c of f.input.cases) {
    const r = await respond({ line: f.input.line, history: [], name: c.name });
    assert.equal(r.status, f.expected.cases.find((e) => e.id === c.id).status, `${c.id}: ${r.text}`);
    assert.equal(typeof r.json.reply, 'string');
    assert.ok(!r.json.reply.includes('<img'), `${c.id}: raw markup name does not come back verbatim: ${r.json.reply}`);
  }
  assert.equal((await respond({ line: 'hello', history: [], name: 'x'.repeat(5000) })).status, 200);
  assert.equal((await respond({ line: 'hello', history: [], name: null })).status, 200);
  for (const name of [123, true, {}, ['a']]) bad400(await respond({ line: 'hello', history: [], name }), `name ${JSON.stringify(name)}`);
});

// ---------- /api/speak
const ttsReady = memo(async () => {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < Number(process.env.COMPANION_TTS_READY_MS || 300000)) {
    const h = await call(B, '/api/health', { method: 'GET' }); last = h.json?.tts;
    if (last === 'ready') return 'ready';
    if (last === 'down') return 'down';
    await sleep(1000);
  }
  return last;
});
const needTts = async () => assert.equal(await ttsReady(), 'ready', 'GET /api/health tts is not "ready": the server at COMPANION_URL has no read-aloud helper (build it with npm run setup and restart the server)');
const wavInfo = (b) => ({ riff: b.toString('ascii', 0, 4), wave: b.toString('ascii', 8, 12), fmt: b.readUInt16LE(20), ch: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), dataLen: b.readUInt32LE(40), len: b.length });

T('TC-127 REQ-014/REQ-017 POST /api/speak rejects bad input: broken JSON, lang other than zh|en, empty/blank/201-char text, non-string text -> 400 bad_request; body over 4096 B -> 413 too_large', async () => {
  for (const [what, body, raw] of [['broken json', '{nope', true], ['lang fr', { text: 'hi', lang: 'fr' }], ['no lang', { text: 'hi' }], ['empty text', { text: '', lang: 'en' }], ['blank text', { text: '   ', lang: 'zh' }],
    ['201 chars', { text: 'a'.repeat(201), lang: 'en' }], ['non-string', { text: 5, lang: 'en' }], ['array body', [], false]]) {
    const r = await speak(body, raw); const j = await r.json().catch(() => undefined);
    assert.equal(r.status, 400, `${what}: ${r.status}`); assert.deepEqual(j, { error: 'bad_request' }, what);
  }
  const big = await speak({ text: 'a'.repeat(5000), lang: 'en' });
  assert.equal(big.status, 413); assert.deepEqual(await big.json(), { error: 'too_large' });
  const ok = await speak({ text: ' ' + 'b'.repeat(40) + ' ', lang: 'en' });
  assert.ok([200, 503, 504].includes(ok.status), `a padded valid text is not a client error: ${ok.status}`); await ok.arrayBuffer();
});

T('TC-128 REQ-014/REQ-017 POST /api/speak for a valid part: 200 audio/wav, Content-Length, Cache-Control no-store, PCM16 mono 24000 Hz, plausible length, zh and en; the audio is not stored by the server', async () => {
  await needTts();
  for (const [text, lang] of [['你好，很高兴见到你。', 'zh'], ['Hello, nice to meet you.', 'en']]) {
    const r = await speak({ text, lang });
    assert.equal(r.status, 200, `${lang}: ${r.status}`);
    assert.match(r.headers.get('content-type') ?? '', /^audio\/wav/);
    assert.match(r.headers.get('cache-control') ?? '', /no-store/);
    const b = Buffer.from(await r.arrayBuffer());
    assert.equal(Number(r.headers.get('content-length')), b.length);
    const w = wavInfo(b);
    assert.deepEqual({ riff: w.riff, wave: w.wave, fmt: w.fmt, ch: w.ch, rate: w.rate, bits: w.bits }, { riff: 'RIFF', wave: 'WAVE', fmt: 1, ch: 1, rate: 24000, bits: 16 });
    assert.equal(w.len, 44 + w.dataLen);
    const sec = w.dataLen / 2 / 24000;
    assert.ok(sec > 0.4 && sec < 9.7, `${lang}: ${sec.toFixed(2)} s of audio`);
    let peak = 0; for (let i = 44; i + 1 < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
    assert.ok(peak > 500, `${lang}: audio is not silent (peak ${peak})`);
  }
});

T('TC-129 [FX-013] REQ-014 the 2 FX-013 replies, split by speechParts, spoken by /api/speak and read back by /api/transcribe: audible, language exact, CER/WER <= 0.2, 3 runs each (6 of 6)', async () => {
  await needTts();
  const { speechParts } = await import(new URL('../server/tts.js', import.meta.url).href);
  const f = fx('FX-013'), tmp = join(tmpdir(), `fx013-${process.pid}`); mkdirSync(tmp, { recursive: true });
  const bad = [];
  for (let run = 0; run < f.meta.runs; run++) for (const c of f.input.cases) {
    const exp = f.expected.cases.find((e) => e.id === c.id);
    const parts = speechParts(c.reply, c.lang);
    assert.ok(parts.length >= 1, `${c.id}: speechParts`);
    const texts = []; let all200 = true;
    for (const [k, p] of parts.entries()) {
      const r = await speak({ text: p, lang: c.lang });
      if (r.status !== 200 || !/^audio\/wav/.test(r.headers.get('content-type') ?? '')) { all200 = false; await r.arrayBuffer(); continue; }
      const inP = join(tmp, `${c.id}-${run}-${k}.wav`), outP = join(tmp, `${c.id}-${run}-${k}-16k.wav`);
      writeFileSync(inP, Buffer.from(await r.arrayBuffer()));
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', inP, outP]);
      const t = await transcribe(readFileSync(outP));
      texts.push(t.json?.text ?? '');
    }
    const joined = texts.join(c.lang === 'zh' ? '' : ' ').trim();
    const er = joined ? errorRate(joined, exp.text_reference, exp.metric) : 1;
    const actual = { audible: all200 && joined.length > 0, language: transcriptLanguage(joined) };
    keep(`${c.id}#${run + 1}`, { parts, heard: joined, rate: Number(er.toFixed(3)) });
    if (actual.audible !== exp.audible || actual.language !== exp.language || !(er <= exp.error_rate_max)) bad.push(`${c.id}#${run + 1}: ${JSON.stringify(actual)} ${exp.metric} ${er.toFixed(3)} heard=${JSON.stringify(joined)}`);
  }
  assert.equal(bad.length, 0, bad.join('\n'));
});

T('TC-130 [FX-013] REQ-015 backend half: the first part of each FX-013 reply comes back from /api/speak within 3 s on a warm server, 5 of 5 runs each (the page adds playback start; fe-tester owns that half)', async () => {
  await needTts();
  const { speechParts } = await import(new URL('../server/tts.js', import.meta.url).href);
  const f = fx('FX-013');
  await (await speak({ text: 'Warm up.', lang: 'en' })).arrayBuffer();
  const slow = [];
  for (const c of f.input.cases) for (let i = 0; i < 5; i++) {
    const first = speechParts(c.reply, c.lang)[0];
    const t0 = performance.now();
    const r = await speak({ text: first, lang: c.lang });
    const buf = Buffer.from(await r.arrayBuffer());
    const ms = performance.now() - t0;
    keep(`timing:${c.id}#${i + 1}`, { ms: Math.round(ms), status: r.status });
    if (r.status !== 200 || buf.length < 100 || ms > 3000) slow.push(`${c.id}#${i + 1}: ${r.status} ${Math.round(ms)} ms`);
  }
  assert.equal(slow.length, 0, slow.join('\n'));
});

T('TC-131 REQ-017 chat does not wait for read-aloud: while a long /api/speak is in flight, /api/respond (FX-001) answers 200 within the 10 s of REQ-008; and tts failure never reaches /api/respond (its body has no error field)', async () => {
  await needTts();
  const long = speak({ text: '我今天一整天都在忙着准备明天的考试所以真的有一点点累了但是我还是想和你说说话。', lang: 'zh' }).then((r) => r.arrayBuffer(), () => null);
  const r = await respond(fx('FX-001').input.body);
  assert.equal(r.status, 200, r.text); assert.ok(r.ms <= 10000, `${Math.round(r.ms)} ms`); assert.equal(r.json.error, undefined);
  await long;
});

T('TC-132 REQ-018 a client that hangs up in the middle of /api/speak does not hurt the server: health stays ok and the next /api/speak is 200', async () => {
  await needTts();
  const ac = new AbortController();
  const p = fetch(B + '/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'This is a longer sentence that takes a moment to say aloud.', lang: 'en' }), signal: ac.signal }).catch((e) => e.name);
  await sleep(150); ac.abort();
  assert.equal(await p, 'AbortError');
  const h = await call(B, '/api/health', { method: 'GET' });
  assert.equal(h.status, 200);
  const r = await speak({ text: 'Still here.', lang: 'en' });
  assert.equal(r.status, 200); assert.ok((await r.arrayBuffer()).byteLength > 1000);
});
