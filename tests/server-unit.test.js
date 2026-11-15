// Backend pure-logic tests (docs/backend/04-test-plan.md). Written from 01-requirements and 03-detailed-design only.
// Modules named in 03 §1 are imported inside each test, so a module that is not built yet fails only its own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, imp, fx, makeWav, dataChunkSize, mkTmp } from './server-helpers.js';

const rejectsBad = (fn) => assert.throws(fn, (e) => e.code === 'bad_request' && e.status === 400);

// ---------- wav.js (DES-005)
test('TC-001 [FX-005 FX-006 FX-007] pcmFromWav returns exactly the data chunk of the seam-format fixtures (extra chunks allowed)', async () => {
  const { pcmFromWav } = await imp('server/wav.js');
  for (const id of ['FX-005', 'FX-006', 'FX-007']) {
    const wav = fx(id).wav();
    const pcm = pcmFromWav(wav);
    const n = dataChunkSize(wav);
    assert.ok(Buffer.isBuffer(pcm), id);
    assert.equal(pcm.length, n - (n % 2), `${id}: PCM length`);
    assert.ok(pcm.equals(wav.subarray(wav.indexOf('data') + 8, wav.indexOf('data') + 8 + pcm.length)), `${id}: bytes are the data chunk`);
  }
});

test('TC-002 [FX-008] pcmFromWav accepts the 2 s silence WAV: 64000 bytes of PCM', async () => {
  const { pcmFromWav } = await imp('server/wav.js');
  const pcm = pcmFromWav(fx('FX-008').wav());
  assert.equal(pcm.length, 2 * 16000 * 2);
  assert.ok(pcm.every((b) => b === 0));
});

test('TC-003 pcmFromWav rejects every non-seam format with ApiError bad_request (400)', async () => {
  const { pcmFromWav } = await imp('server/wav.js');
  rejectsBad(() => pcmFromWav(readFileSync(`${ROOT}test_audio/hello.wav`))); // 24 kHz Float32, the original FX-005 input
  rejectsBad(() => pcmFromWav(makeWav({ channels: 2 })));
  rejectsBad(() => pcmFromWav(makeWav({ bits: 8 })));
  rejectsBad(() => pcmFromWav(makeWav({ rate: 44100 })));
  rejectsBad(() => pcmFromWav(makeWav({ rate: 24000 })));
  rejectsBad(() => pcmFromWav(makeWav({ format: 3, bits: 32 })));
  rejectsBad(() => pcmFromWav(Buffer.alloc(0)));
  rejectsBad(() => pcmFromWav(makeWav().subarray(0, 43)));
  rejectsBad(() => pcmFromWav(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(100)])));
  rejectsBad(() => pcmFromWav(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(100)]))); // webm/EBML
  const noWave = makeWav(); noWave.write('AVI ', 8); rejectsBad(() => pcmFromWav(noWave));
  const noData = makeWav().subarray(0, 36); rejectsBad(() => pcmFromWav(noData));
});

test('TC-004 pcmFromWav stays inside the buffer and returns an even byte count; accepts a LIST chunk before data', async () => {
  const { pcmFromWav } = await imp('server/wav.js');
  const lying = makeWav({ data: Buffer.alloc(1001, 1), dataSizeField: 5000000 }); // header claims more than the file holds
  const pcm = pcmFromWav(lying);
  assert.equal(pcm.length, 1000);
  assert.equal(pcmFromWav(makeWav({ data: Buffer.alloc(7, 1) })).length, 6);
  assert.equal(pcmFromWav(makeWav({ extra: Buffer.from('INFOabcd'), data: Buffer.alloc(320, 2) })).length, 320);
  assert.equal(pcmFromWav(makeWav({ data: Buffer.alloc(0) })).length, 0);
});

// ---------- errors.js (DES-003)
test('TC-005 CODES and ApiError carry the six codes with their HTTP statuses (03 §3)', async () => {
  const { CODES, ApiError } = await imp('server/errors.js');
  assert.deepEqual({ ...CODES }, { not_ready: 503, unavailable: 503, timeout: 504, failed: 502, bad_request: 400, too_large: 413 });
  const e = new ApiError('timeout', 'stt');
  assert.ok(e instanceof Error);
  assert.equal(e.code, 'timeout'); assert.equal(e.status, 504); assert.equal(e.stage, 'stt');
  assert.equal(new ApiError('too_large').status, 413);
});

async function withErrServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { return await fn(server.address().port); } finally { server.close(); server.closeAllConnections?.(); }
}
async function captureLogs(fn) {
  const chunks = [], so = process.stdout.write, se = process.stderr.write, cl = console.log, ce = console.error, cw = console.warn;
  const grab = (...a) => { chunks.push(a.map(String).join(' ')); return true; };
  process.stdout.write = grab; process.stderr.write = grab; console.log = grab; console.error = grab; console.warn = grab;
  try { await fn(); } finally { process.stdout.write = so; process.stderr.write = se; console.log = cl; console.error = ce; console.warn = cw; }
  return chunks.join('\n');
}

test('TC-006 sendError passes an ApiError through; any other exception becomes 502 failed with no message in the body or log', async () => {
  const { ApiError, sendError } = await imp('server/errors.js');
  await withErrServer((req, res) => sendError(res, req.url === '/api' ? new ApiError('not_ready', 'bonsai') : new Error('SECRET-USER-TEXT-123'), '/x'), async (port) => {
    const a = await fetch(`http://127.0.0.1:${port}/api`);
    assert.equal(a.status, 503); assert.deepEqual(await a.json(), { error: 'not_ready' });
    assert.match(a.headers.get('content-type') ?? '', /json/);
    let b;
    const logs = await captureLogs(async () => { b = await fetch(`http://127.0.0.1:${port}/other`); });
    assert.equal(b.status, 502);
    const body = await b.text();
    assert.deepEqual(JSON.parse(body), { error: 'failed' });
    assert.ok(!body.includes('SECRET-USER-TEXT-123'));
    assert.ok(!logs.includes('SECRET-USER-TEXT-123'), 'log must not contain err.message (A9)');
  });
});

test('TC-007 sendError after headers were sent only destroys the response (writes no error body)', async () => {
  const { ApiError, sendError } = await imp('server/errors.js');
  await withErrServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.write('partial'); setTimeout(() => sendError(res, new ApiError('timeout'), '/x'), 50); }, async (port) => {
    const got = await new Promise((resolve) => {
      let body = '';
      const r = http.get(`http://127.0.0.1:${port}/`, (res) => { res.on('data', (c) => (body += c)); res.on('end', () => resolve(body)); res.on('error', () => resolve(body)); res.on('close', () => resolve(body)); });
      r.on('error', () => resolve(body));
    });
    assert.ok(!got.includes('"error"'), got);
  });
});

// ---------- lang.js (DES-009)
test('TC-008 languageOf: zhWords = ceil(han/2) vs English words; zh on ties; no letters or Han -> zh', async () => {
  const { languageOf } = await imp('server/lang.js');
  const cases = [['I just got the internship!', 'en'], ['今天考试过了，好开心！', 'zh'], ['我今天很happy', 'zh'], ['I really love eating 火锅 with friends', 'en'], ['Hello', 'en'],
    ['😀🎉', 'zh'], ['12345', 'zh'], ['', 'zh'], ['嗯 ok', 'zh'], ['I feel 难过 today', 'en'], ['a 火锅', 'zh'], ['好 hello world', 'en'], ['火锅 ok', 'zh'], ['我想吃 hot pot 今天', 'zh']];
  for (const [t, l] of cases) assert.equal(languageOf(t), l, JSON.stringify(t));
});

test('TC-037 languageOf: DES-009 worked example "I love 火锅" -> en (zhWords 1 : words 2)', async () => {
  const { languageOf } = await imp('server/lang.js');
  // 03 DES-009 (amended): zhWords = ceil(han / 2) = 1, words = 2 -> en; "嗯 ok" is 1:1 -> zh (tie); "我今天很happy" 2:1 -> zh.
  assert.equal(languageOf('I love 火锅'), 'en');
  assert.equal(languageOf('嗯 ok'), 'zh');
  assert.equal(languageOf('我今天很happy'), 'zh');
});

// ---------- bonsai.js shapeReply / toMessages / windowOf (DES-008, DES-007)
test('TC-009 shapeReply strips thinking, closed or unclosed, and wrapping quotes and whitespace', async () => {
  const { shapeReply } = await imp('server/bonsai.js');
  assert.equal(shapeReply('<think>x</think>Hi there!', 'en'), 'Hi there!');
  assert.equal(shapeReply('<think>\nlong\nthought\n</think>\n\nHi there!  ', 'en'), 'Hi there!');
  assert.equal(shapeReply('Hello<think>never closed', 'en'), 'Hello');
  assert.equal(shapeReply('<think>never closed', 'en'), '');
  assert.equal(shapeReply('"Great news!"', 'en'), 'Great news!');
  assert.equal(shapeReply('  \n ', 'en'), '');
  assert.equal(shapeReply('', 'zh'), '');
  assert.equal(shapeReply('<think>only</think>', 'zh'), '');
});

test('TC-010 shapeReply keeps at most 2 sentences and at most 1 question; emoji stay with their sentence', async () => {
  const { shapeReply } = await imp('server/bonsai.js');
  assert.equal(shapeReply('One. Two. Three.', 'en'), 'One. Two.');
  assert.equal(shapeReply('A? B?', 'en'), 'A?');
  assert.equal(shapeReply('Really? Wow! Cool?', 'en'), 'Really? Wow!');
  assert.equal(shapeReply('That is amazing news! Congratulations!', 'en'), 'That is amazing news! Congratulations!');
  assert.equal(shapeReply('Great! 🎉 Wow! Yes!', 'en'), 'Great! 🎉 Wow!');
  assert.equal(shapeReply('太好了！恭喜你！', 'zh'), '太好了！恭喜你！');
  assert.equal(shapeReply('太好了！恭喜你！继续加油！', 'zh'), '太好了！恭喜你！');
  assert.equal(shapeReply('你还好吗？要聊聊吗？', 'zh'), '你还好吗？');
  const one = shapeReply('Just one sentence without a mark', 'en');
  assert.equal(one, 'Just one sentence without a mark');
});

test('TC-011 shapeReply length caps: zh <= 120 code points, en <= 40 words; first sentence only, then cut with an ellipsis', async () => {
  const { shapeReply } = await imp('server/bonsai.js');
  const zh70 = '好'.repeat(69) + '。';
  assert.equal(shapeReply(zh70 + zh70, 'zh'), zh70, 'two 70-char sentences -> first only');
  const cutZh = shapeReply('好'.repeat(130), 'zh');
  assert.equal([...cutZh].length, 120); assert.ok(cutZh.endsWith('…')); assert.equal(cutZh, '好'.repeat(119) + '…');
  const s25 = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ') + '.';
  assert.equal(shapeReply(`${s25} ${s25}`, 'en'), s25, 'two 25-word sentences -> first only');
  const cutEn = shapeReply(Array.from({ length: 50 }, (_, i) => `w${i}`).join(' '), 'en');
  assert.equal(cutEn.split(/\s+/).length, 40); assert.ok(cutEn.endsWith('…')); assert.ok(!cutEn.endsWith(' …'));
  const at120 = '好'.repeat(120);
  assert.equal(shapeReply(at120, 'zh'), at120, 'exactly 120 is not cut');
});

test('TC-012 toMessages = system(REPLY_SYSTEM + LANG_RULE last) + history (companion -> assistant) + user line', async () => {
  const { toMessages } = await imp('server/bonsai.js');
  const { REPLY_SYSTEM, LANG_RULE, RECALL } = await imp('server/prompts.js');
  const hist = [{ role: 'user', text: 'I just got the internship!' }, { role: 'companion', text: 'Great!' }];
  const m = toMessages('But I will move.', hist, 'en');
  assert.equal(m.length, 4);
  assert.equal(m[0].role, 'system');
  assert.ok(m[0].content.startsWith(REPLY_SYSTEM));
  assert.ok(m[0].content.endsWith(LANG_RULE.en), 'LANG_RULE is the last line (prefix caching)');
  assert.deepEqual(m.slice(1), [{ role: 'user', content: 'I just got the internship!' }, { role: 'assistant', content: 'Great!' }, { role: 'user', content: 'But I will move.\n' + RECALL.en('I just got the internship!') }]);
  assert.equal(m.at(-1).content, 'But I will move.\n(Connect your reply to what I told you before: "I just got the internship!")', 'DES-008 fires example');
  // not fired: only companion entries in the window, or no history -> the line alone
  assert.equal(toMessages('Thanks', [{ role: 'companion', text: 'Hi!' }], 'en').at(-1).content, 'Thanks');
  assert.equal(toMessages('Thanks', [], 'en').at(-1).content, 'Thanks');
  // prev is the NEWEST user entry; key is the language of the line, not of prev
  const two = [{ role: 'user', text: 'old' }, { role: 'companion', text: 'a' }, { role: 'user', text: '今天开心' }, { role: 'companion', text: 'b' }];
  assert.equal(toMessages('But sad', two, 'en').at(-1).content, 'But sad\n' + RECALL.en('今天开心'));
  assert.equal(toMessages('可是难过', two, 'zh').at(-1).content, '可是难过\n' + RECALL.zh('今天开心'));
  assert.ok(toMessages('嗯', [], 'zh')[0].content.endsWith(LANG_RULE.zh));
  assert.equal(toMessages('嗯', [], 'zh').length, 2);
});

test('TC-013 windowOf: last 40 entries, then drop oldest until total weight (length + 1.5 per Han) <= 2000', async () => {
  const { windowOf } = await imp('server/bonsai.js');
  const e = (n, len, ch = null) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'companion' : 'user', text: ch ? ch.repeat(len) : String(i % 10).repeat(len) }));
  assert.equal(windowOf(e(45, 10)).length, 40);
  assert.deepEqual(windowOf(e(45, 10)), e(45, 10).slice(5));
  const w = windowOf(e(40, 200)); // 8000 -> newest 10 (2000)
  assert.equal(w.length, 10); assert.deepEqual(w, e(40, 200).slice(30));
  assert.equal(windowOf(e(10, 200)).length, 10, 'exactly 2000 stays');
  assert.equal(windowOf(e(11, 200)).length, 10);
  assert.equal(windowOf(e(40, 35)).length, 40, 'a 20-turn English chat of ~1400 chars stays whole');
  assert.equal(windowOf(e(20, 49)).length, 20);
  const han = windowOf(e(21, 40, '好')); // each weight 40 + 60 = 100; 21 x 100 = 2100 -> 20
  assert.equal(han.length, 20); assert.deepEqual(han, e(21, 40, '好').slice(1));
  assert.equal(windowOf(e(5, 1500)).length, 1);
  assert.deepEqual(windowOf(e(1, 2001)), [], 'one entry heavier than the budget -> []');
  assert.deepEqual(windowOf(e(1, 801, '好')), [], 'Han weight 2.5 each: 801 chars = 2002.5');
  assert.equal(windowOf(e(1, 800, '好')).length, 1, '800 Han = 2000');
  assert.deepEqual(windowOf([]), []);
});

// ---------- prompts.js (DES-010)
test('TC-014 prompts: the 5 mood ids, mood schema enum, sampling parameters, language rules', async () => {
  const P = await imp('server/prompts.js');
  assert.deepEqual([...P.MOODS], ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral']);
  assert.deepEqual(P.MOOD_SCHEMA.json_schema.schema.properties.mood.enum, [...P.MOODS]);
  assert.equal(P.MOOD_SCHEMA.type, 'json_schema');
  assert.deepEqual(P.MOOD_SCHEMA.json_schema.schema.required, ['mood']);
  assert.equal(P.REPLY_SAMPLING.presence_penalty, 1.5); assert.equal(P.REPLY_SAMPLING.max_tokens, 120); assert.equal(P.REPLY_SAMPLING.top_k, 20);
  assert.equal(P.MOOD_SAMPLING.temperature, 0); assert.equal(P.MOOD_SAMPLING.top_k, 1); assert.equal(P.MOOD_SAMPLING.max_tokens, 16);
  assert.match(P.LANG_RULE.en, /English/); assert.match(P.LANG_RULE.zh, /简体中文/);
  for (const m of P.MOODS) assert.ok(P.MOOD_SYSTEM.includes(m), m);
});

// ---------- config.js (DES-002)
test('TC-015 CONFIG: loopback host, limits, deadlines, restarts, defaults', async () => {
  const { CONFIG } = await imp('server/config.js');
  assert.equal(CONFIG.host, '127.0.0.1');
  assert.deepEqual({ ...CONFIG.limits }, { lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudget: 2000, jsonBytes: 262144, wavBytes: 2000000, speakChars: 200, speakJsonBytes: 4096 }); // increment 2: + speak limits (DES-023)
  assert.deepEqual({ ...CONFIG.deadlines }, { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 300000, speakMs: 10000, ttsBootMs: 300000 }); // increment 2: + speakMs, ttsBootMs (DES-023)
  assert.ok(CONFIG.deadlines.respondMs + CONFIG.deadlines.transcribeMs < 30000, 'voice turn < 30 s (A11)');
  assert.deepEqual({ ...CONFIG.restarts }, { max: 5, delayMs: 2000 });
  if (!process.env.PORT) assert.equal(CONFIG.port, 4317);
  if (!process.env.BONSAI_PORT) assert.equal(CONFIG.bonsai.port, 4318);
  if (!process.env.BONSAI_MODEL) assert.equal(CONFIG.bonsai.size, '9B');
});

test('TC-016 bonsaiFiles and missingFiles list every absent required path and nothing when all exist', async () => {
  const { missingFiles, bonsaiFiles, CONFIG } = await imp('server/config.js');
  const dir = mkTmp();
  const cfg = structuredClone(CONFIG);
  cfg.bonsai = { ...cfg.bonsai, size: '2B', dir: join(dir, 'gguf') };
  cfg.stt = { bin: join(dir, 'stt/companion-stt'), modelDir: join(dir, 'model'), tokenizerDir: join(dir, 'tok') };
  const f = bonsaiFiles(cfg);
  assert.ok(f.bin.endsWith('bin/macos-arm64/llama-server'), f.bin);
  assert.ok(f.model.endsWith('models/Ternary-Bonsai-2-2B-PQ2_0.gguf'), f.model);
  const none = missingFiles(cfg);
  assert.ok(none.length >= 7, `expected >= 7 missing, got ${none.length}`);
  for (const p of [f.bin, f.model, cfg.stt.bin, 'AudioEncoder.mlmodelc', 'TextDecoder.mlmodelc', 'MelSpectrogram.mlmodelc', 'models/openai/whisper-large-v3/tokenizer.json']) assert.ok(none.some((m) => m.includes(p)), `missing list lacks ${p}`);
  for (const p of [f.bin, f.model, cfg.stt.bin]) { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, 'x'); }
  for (const m of ['AudioEncoder', 'TextDecoder', 'MelSpectrogram']) mkdirSync(join(cfg.stt.modelDir, `${m}.mlmodelc`), { recursive: true });
  mkdirSync(join(cfg.stt.tokenizerDir, 'models/openai/whisper-large-v3'), { recursive: true });
  writeFileSync(join(cfg.stt.tokenizerDir, 'models/openai/whisper-large-v3/tokenizer.json'), '{}');
  assert.deepEqual(missingFiles(cfg), []);
  rmSync(join(cfg.stt.modelDir, 'TextDecoder.mlmodelc'), { recursive: true });
  assert.deepEqual(missingFiles(cfg).length, 1);
});

// ---------- static scan of the delivered sources against DES-001/002/012
test('TC-017 sources: no personal absolute path, no non-loopback bind, no network download; package.json scripts per DES-012', () => {
  const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
  assert.equal(pkg.scripts.start, 'node server/main.js');
  assert.equal(pkg.scripts.setup, 'swift build -c release --package-path stt && node server/main.js --warm-only');
  const files = readdirSync(`${ROOT}server`).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 8, `server/ has ${files.length} js files`);
  for (const f of files) {
    const src = readFileSync(`${ROOT}server/${f}`, 'utf8');
    assert.ok(!/\/Users\/[A-Za-z]/.test(src), `${f}: personal path`);
    assert.ok(!/0\.0\.0\.0|'::'|"::"/.test(src), `${f}: binds a non-loopback address`);
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1|localhost|\$\{)/.test(src.replace(/^\s*(\/\/|\*).*$/gm, '')), `${f}: refers to a non-local URL`);
  }
});

// ---------- static.js (DES-005)
async function staticServer() {
  const base = mkTmp();
  const root = join(base, 'web');
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>home</title>');
  writeFileSync(join(root, 'js/app.js'), 'export const a = 1;');
  writeFileSync(join(root, 'f.woff2'), 'wOF2');
  writeFileSync(join(base, 'secret.txt'), 'TOP-SECRET');
  const { serveStatic } = await imp('server/static.js');
  const server = http.createServer((req, res) => serveStatic(req, res, root));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const raw = (path, method = 'GET') => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: server.address().port, path, method }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
    r.on('error', reject); r.end();
  });
  return { raw, close: () => { server.close(); server.closeAllConnections?.(); } };
}

test('TC-018 serveStatic: / -> index.html, content types, no-store, HEAD without body, 404 for missing, 405 for other methods', async () => {
  const s = await staticServer();
  try {
    const home = await s.raw('/');
    assert.equal(home.status, 200); assert.match(home.headers['content-type'], /text\/html/); assert.match(home.headers['cache-control'], /no-store/); assert.match(home.body, /<title>home/);
    const js = await s.raw('/js/app.js');
    assert.equal(js.status, 200); assert.match(js.headers['content-type'], /javascript/); assert.equal(js.body, 'export const a = 1;');
    assert.match((await s.raw('/f.woff2')).headers['content-type'], /woff2/);
    const head = await s.raw('/', 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body, '');
    assert.equal((await s.raw('/nope.html')).status, 404);
    for (const m of ['POST', 'PUT', 'DELETE']) assert.equal((await s.raw('/', m)).status, 405, m);
  } finally { s.close(); }
});

test('TC-019 serveStatic never leaves the web root: /../x, /%2e%2e/x and encoded variants -> 404', async () => {
  const s = await staticServer();
  try {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2E%2E/secret.txt', '/js/../../secret.txt', '/..%2fsecret.txt', '/%2e%2e%2fsecret.txt']) {
      const r = await s.raw(p);
      assert.ok(r.status === 404 || r.status === 400, `${p} -> ${r.status}`);
      assert.ok(!r.body.includes('TOP-SECRET'), `${p} leaked`);
    }
    assert.equal((await s.raw('/js/app.js')).status, 200);
  } finally { s.close(); }
});

// ---------- stt.js pure helper (DES-006)
test('TC-020 [FX-008] isNothingHeard is true only for the empty string', async () => {
  const { isNothingHeard } = await imp('server/stt.js');
  assert.equal(isNothingHeard(''), true);
  assert.equal(isNothingHeard(' '), false);
  assert.equal(isNothingHeard('a'), false);
});

test('TC-038 missingHints: one line per kind of missing file (stt bin / Bonsai / WhisperKit), in that order; [] -> []', async () => {
  const { missingHints, bonsaiFiles, CONFIG } = await imp('server/config.js');
  const cfg = structuredClone(CONFIG);
  cfg.bonsai = { ...cfg.bonsai, size: '2B' };
  const f = bonsaiFiles(cfg);
  const stt = cfg.stt.bin, whisper = join(cfg.stt.modelDir, 'AudioEncoder.mlmodelc');
  assert.deepEqual(missingHints([], cfg), []);
  const b = missingHints([f.model], cfg);
  assert.equal(b.length, 1); assert.match(b[0], /BONSAI_MODEL/); assert.ok(!/npm run setup|STT_MODEL_DIR/.test(b[0]));
  assert.equal(missingHints([f.bin], cfg).length, 1, 'llama-server counts as the Bonsai kind');
  const s = missingHints([stt], cfg);
  assert.equal(s.length, 1); assert.match(s[0], /npm run setup/);
  const w = missingHints([whisper, join(cfg.stt.tokenizerDir, 'models/openai/whisper-large-v3/tokenizer.json')], cfg);
  assert.equal(w.length, 1, 'two WhisperKit paths -> one line'); assert.match(w[0], /STT_MODEL_DIR/);
  const all = missingHints([whisper, f.model, stt], cfg);
  assert.equal(all.length, 3);
  assert.match(all[0], /npm run setup/); assert.match(all[1], /BONSAI_MODEL/); assert.match(all[2], /STT_MODEL_DIR/);
  for (const l of all) { assert.match(l, /[\u4e00-\u9fff]/, 'zh part'); assert.match(l, /[A-Za-z]{4,}/, 'en part'); }
});

// ---------- DES-001 / FND-001: a malformed request-target never throws out of route
test('TC-087 [FND-001] route on a throwaway server: request-targets "//" and "http://[" answer 400 {"error":"bad_request"} and the server stays up', async () => {
  const { route } = await imp('server/main.js');
  const net = await import('node:net');
  const srv = http.createServer(route);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  let crashed = null; const onUncaught = (e) => { crashed = e; }; process.once('uncaughtException', onUncaught);
  const raw = (target) => new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`));
    let b = ''; sock.on('data', (c) => (b += c)); sock.on('end', () => resolve(b)); sock.on('error', reject); sock.setTimeout(5000, () => reject(new Error('timeout')));
  });
  try {
    for (const t of ['//', 'http://[']) {
      const res = await raw(t);
      assert.match(res, /^HTTP\/1\.1 400 /, `${t}: ${res.slice(0, 80)}`);
      assert.deepEqual(JSON.parse(res.slice(res.indexOf('\r\n\r\n') + 4)), { error: 'bad_request' }, t);
    }
    const again = await raw('/api/nope');
    assert.match(again, /^HTTP\/1\.1 404 /, 'server still answers after both');
    assert.equal(crashed, null);
  } finally { process.removeListener('uncaughtException', onUncaught); await new Promise((r) => srv.close(r)); }
});

// =====================================================================================================
// Increment 2 (docs/backend/04-test-plan.md § Increment 2; written from 01 § Increment 2, 03 DES-016..023 and FX-009..013 only)
// =====================================================================================================
const fxCases = (id) => fx(id).input.cases;
const crisisLines = () => fxCases('FX-009').map((c) => ({ id: c.id, line: c.body.line }));
const quietLines = () => fxCases('FX-010').map((c) => ({ id: c.id, line: c.body.line }));

// ---------- crisis.js (DES-019)
test('TC-090 [FX-009] REQ-023 isCrisis is true for all 9 FX-009 lines (incl. FX-009-08 negation and FX-009-09 活着没什么意思), 10 of 10 runs each', async () => {
  const { isCrisis } = await imp('server/crisis.js');
  const lines = crisisLines();
  assert.equal(lines.length, 9);
  for (const { id, line } of lines) for (let i = 0; i < 10; i++) assert.equal(isCrisis(line), true, `${id} ${line} run ${i + 1}`);
});

test('TC-091 [FX-010] REQ-023 isCrisis is false for all 6 FX-010 near-misses and the design\'s extra idioms, 10 of 10 runs each', async () => {
  const { isCrisis } = await imp('server/crisis.js');
  const lines = quietLines();
  assert.equal(lines.length, 6);
  for (const { id, line } of lines) for (let i = 0; i < 10; i++) assert.equal(isCrisis(line), false, `${id} ${line} run ${i + 1}`);
  for (const line of ['想死你了！', '跳楼价大甩卖', 'I have the skill myself', '这几天什么都不想做。', '这游戏没什么意思。', '尴尬得想消失。', '生活没什么意思的时候就出去走走', '跳樓價', '', '   ', 'Hello there, how are you?']) {
    assert.equal(isCrisis(line), false, line);
  }
});

test('TC-092 REQ-023 isCrisis variants fire: case, full-width, spaces, curly apostrophe, Traditional typed text, the 活着没什么意思 family, one phrase per list entry', async () => {
  const { isCrisis, CRISIS_PHRASES } = await imp('server/crisis.js');
  for (const line of ['I don’t want to live anymore', '我 想 死', 'Ｉ　ＷＡＮＴ　ＴＯ　ＤＩＥ', 'I  want   to die', 'i WaNt To DiE', '我想自殺。', '我想傷害自己。', '活著沒意思', '活著沒什麼意思',
    '有时候觉得活着没什么意思，想就这样消失。', '活着没啥意思', '活着没意义', '活 着 没 什 么 意 思', '最近老想着割腕', '他说要跳樓', 'Sometimes I think about suicide.', 'I engage in self-harm', 'my thoughts are suicidal']) {
    assert.equal(isCrisis(line), true, line);
  }
  assert.ok(CRISIS_PHRASES.zh.length >= 28 && CRISIS_PHRASES.en.length >= 29, 'the approved list is exported');
  for (const p of CRISIS_PHRASES.zh) assert.equal(isCrisis(`今天我${p}`), true, `zh phrase ${p}`);
  for (const p of CRISIS_PHRASES.en) assert.equal(isCrisis(`Today I feel like I ${p}.`), true, `en phrase ${p}`);
});

test('TC-093 REQ-023 isCrisis exceptions and boundaries: 想死你/想死我了/跳楼价 are removed before matching; en phrases need word boundaries; only this line counts', async () => {
  const { isCrisis, CRISIS_EXCEPTIONS } = await imp('server/crisis.js');
  assert.ok(CRISIS_EXCEPTIONS.includes('想死你') && CRISIS_EXCEPTIONS.includes('跳楼价'));
  for (const line of ['想死你了', '想死您了', '想死我了，快来', '商场跳楼价大甩卖', '跳樓大甩賣']) assert.equal(isCrisis(line), false, line);
  assert.equal(isCrisis('想死你了，但我也不想活了'), true, 'an exception does not hide a real phrase elsewhere in the line');
  assert.equal(isCrisis('misuicidex'), false, 'letters on both sides: no word boundary');
  assert.equal(isCrisis('Suicide Squad was fun'), true, 'known accepted false alarm (A22)');
});

test('TC-094 REQ-023 normalizeForCrisis: NFKC, Traditional folded, lowercase, curly quotes, whitespace runs, trim', async () => {
  const { normalizeForCrisis: n, TRAD_FOLD } = await imp('server/crisis.js');
  assert.equal(n('Ｉ　ＷＡＮＴ　ＴＯ　ＤＩＥ'), 'i want to die');
  assert.equal(n('  A \t\n  B  '), 'a b');
  assert.equal(n('don’t ‘x’ `y`'), "don't 'x' 'y'"); // U+00B4 is left out: NFKC turns it into space + U+0301 before the quote step (design list char is unreachable, see plan I2.5)
  assert.equal(n('活著沒什麼意思'), '活着没什么意思');
  assert.equal(n('殺盡輕尋義結傷殘樓價賣麼麽'), '杀尽轻寻义结伤残楼价卖么么');
  assert.equal(Object.keys(TRAD_FOLD).length, 15);
  assert.equal(n(''), '');
});

// ---------- name.js (DES-021)
test('TC-095 [FX-012] REQ-031 cleanName returns the FX-012 expected value for each of the 7 inputs', async () => {
  const { cleanName } = await imp('server/name.js');
  const f = fx('FX-012');
  assert.equal(f.input.cases.length, 7);
  for (const c of f.input.cases) assert.equal(cleanName(c.name), f.expected.cases.find((e) => e.id === c.id).name, `${c.id} ${JSON.stringify(c.name)}`);
});

test('TC-096 REQ-031 cleanName: any length is cleaned never refused; whitespace becomes one space; defaults -> null; non-strings -> null; NFC; 12 code points', async () => {
  const { cleanName, DEFAULT_NAMES } = await imp('server/name.js');
  assert.deepEqual(DEFAULT_NAMES, ['小伙伴', 'little buddy']);
  assert.equal(cleanName('x'.repeat(5000)), 'x'.repeat(12));
  for (const d of ['小伙伴', 'Little  Buddy', 'LITTLE BUDDY', ' little buddy ', '小伙伴!!']) assert.equal(cleanName(d), null, d);
  for (const v of [123, null, undefined, {}, [], true]) assert.equal(cleanName(v), null, String(v));
  assert.equal(cleanName('a　b'), 'a b'); assert.equal(cleanName('a\tb\nc'), 'a b c'); assert.equal(cleanName('a     b'), 'a b');
  assert.equal(cleanName('he said "hi": <b>'), 'he said hi b');
  assert.equal(cleanName('😀'), null); assert.equal(cleanName(''), null);
  assert.equal(cleanName('é'), 'é', 'NFC');
  assert.equal(cleanName('一二三四五六七八九十一二三'), '一二三四五六七八九十一二');
  assert.equal(cleanName('abcdefghijk lmno'), 'abcdefghijk', 'cut at 12 then trimmed');
  assert.equal(cleanName(' '.repeat(30) + 'abc'), 'abc', 'spaces do not eat the 12-code-point budget');
  assert.equal(cleanName("O'Neil-Ö·9"), "O'Neil-Ö·9");
});

// ---------- prompts.js (DES-020, DES-021)
test('TC-097 REQ-030 replySystem(null) is the unchanged REPLY_SYSTEM; a name replaces 小伙伴 (Little Buddy) and appends NAME_RULE', async () => {
  const P = await imp('server/prompts.js');
  assert.equal(P.replySystem(null), P.REPLY_SYSTEM);
  const s = P.replySystem('团子');
  assert.ok(s.includes('"团子"'));
  assert.ok(s.endsWith('\n' + P.NAME_RULE('团子')));
  assert.ok(!s.includes('小伙伴 (Little Buddy)'));
  assert.ok(P.NAME_RULE('Mochi').includes('"Mochi"') && /小伙伴/.test(P.NAME_RULE('Mochi')) && /Little Buddy/.test(P.NAME_RULE('Mochi')), 'tells Bonsai never to use the default names');
});

test('TC-098 REQ-024 prompts CRISIS_RULE / CRISIS_LINE / CRISIS_FALLBACK exist for zh and en; the fixed help line has 988 and no question', async () => {
  const P = await imp('server/prompts.js');
  for (const l of ['zh', 'en']) {
    assert.ok(P.CRISIS_RULE[l]?.length > 20, `CRISIS_RULE ${l}`);
    assert.ok(P.CRISIS_LINE[l].includes('988') && !/[?？]/.test(P.CRISIS_LINE[l]), `CRISIS_LINE ${l}`);
    assert.ok(P.CRISIS_FALLBACK[l].length > 5 && !/[?？]/.test(P.CRISIS_FALLBACK[l]), `CRISIS_FALLBACK ${l}`);
  }
  assert.equal(P.CRISIS_LINE.zh, '你不用一个人扛着，随时可以打给 988，或者发短信，那边有人愿意听你说。');
  assert.equal(P.CRISIS_LINE.en, "You don't have to carry this alone; you can call or text 988 anytime, and someone there will listen.");
  assert.equal(P.CRISIS_FALLBACK.zh, '谢谢你愿意告诉我这些，我很在乎你。');
  assert.equal(P.CRISIS_FALLBACK.en, 'Thank you for telling me this, and I really care about you.');
});

// ---------- bonsai.crisisReply (DES-020)
const sentencesOf = (t) => t.split(/(?<=[。！？!?.…])(?![。！？!?.…])/u).filter((s) => /[\p{L}\p{N}]/u.test(s));
test('TC-099 REQ-024 crisisReply: first sentence + fixed 988 line; keeps a first sentence that already has 988; empty -> fallback + line; always 988, <= 2 sentences, <= 1 question', async () => {
  const { crisisReply } = await imp('server/bonsai.js');
  const P = await imp('server/prompts.js');
  assert.equal(crisisReply('我听到你了。我在这里。你还好吗？', 'zh'), '我听到你了。' + P.CRISIS_LINE.zh);
  assert.equal(crisisReply('I hear you. I am here.', 'en'), 'I hear you. ' + P.CRISIS_LINE.en);
  assert.equal(crisisReply('我在，也请你打 988 找人聊聊。再说一句。', 'zh'), '我在，也请你打 988 找人聊聊。');
  assert.equal(crisisReply('Please call 988 now. More text.', 'en'), 'Please call 988 now.');
  assert.equal(crisisReply('', 'zh'), P.CRISIS_FALLBACK.zh + P.CRISIS_LINE.zh);
  assert.equal(crisisReply('', 'en'), P.CRISIS_FALLBACK.en + ' ' + P.CRISIS_LINE.en);
  for (const [shaped, lang] of [['How are you feeling?', 'en'], ['你还好吗？', 'zh'], ['', 'en'], ['', 'zh']]) {
    const r = crisisReply(shaped, lang);
    assert.ok(r.includes('988'), r); assert.ok(sentencesOf(r).length <= 2, r);
    assert.ok(sentencesOf(r).filter((s) => /[?？]/.test(s)).length <= 1, r);
  }
});

test('TC-100 REQ-024/REQ-004 crisisReply cuts an over-long first sentence to the room left (zh 120 code points, en 40 words), ends it in … and keeps 988', async () => {
  const { crisisReply } = await imp('server/bonsai.js');
  const zh = crisisReply('我'.repeat(300) + '。', 'zh');
  assert.ok([...zh].length <= 120, `zh length ${[...zh].length}`); assert.ok(zh.includes('988') && zh.includes('…'));
  const en = crisisReply(Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ') + '.', 'en');
  assert.ok(en.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length <= 40, en); assert.ok(en.includes('988') && en.includes('…'));
  assert.ok(sentencesOf(zh).length <= 2 && sentencesOf(en).length <= 2);
});

// ---------- tts.js speechParts (DES-018)
test('TC-101 [FX-013] REQ-014 speechParts: the FX-013 replies split exactly as the design says (emoji dropped)', async () => {
  const { speechParts } = await imp('server/tts.js');
  const [zh, en] = fx('FX-013').input.cases;
  assert.deepEqual(speechParts(zh.reply, 'zh'), ['太棒了！', '这真值得庆祝。', '你准备去庆祝吗？']);
  assert.deepEqual(speechParts(en.reply, 'en'), ['That is amazing news!', "I can't wait to hear all about it."]);
});

test('TC-102 REQ-014/REQ-015 speechParts: caps, digit spelling (en), clause and hard splits, empty results, no text lost', async () => {
  const { speechParts, PART_CAPS } = await imp('server/tts.js');
  assert.deepEqual(PART_CAPS, { first: { zh: 10, en: 7 }, rest: { zh: 24, en: 16 } });
  assert.deepEqual(speechParts('It sounds like such a long and tiring day for you.', 'en'), ['It sounds like such a long', 'and tiring day for you.']);
  assert.ok(speechParts("You don't have to carry this alone; you can call or text 988 anytime, and someone there will listen.", 'en').join(' ').includes('nine eight eight'));
  assert.ok(!speechParts('Call 988 now.', 'en').join(' ').includes('988'));
  for (const t of ['🎉🎉', '…', '', '   ', '!!!', '😀 。']) { assert.deepEqual(speechParts(t, 'zh'), [], `zh ${JSON.stringify(t)}`); assert.deepEqual(speechParts(t, 'en'), [], `en ${JSON.stringify(t)}`); }
  const size = (s, lang) => (lang === 'zh' ? [...s.matchAll(/[\p{L}\p{N}]/gu)].length : s.split(/\s+/).filter(Boolean).length);
  const longZh = '我今天一整天都在忙着准备明天的考试所以真的有一点点累了但是我还是想和你说说话因为你总是很会听我讲。';
  const zh = speechParts(longZh, 'zh');
  assert.ok(zh.length >= 3);
  zh.forEach((p, i) => assert.ok(size(p, 'zh') <= PART_CAPS[i === 0 ? 'first' : 'rest'].zh, `zh part ${i} ${p}`));
  assert.equal(zh.join('').replace(/[^\p{L}]/gu, ''), longZh.replace(/[^\p{L}]/gu, ''), 'no character lost or reordered');
  const longEn = Array.from({ length: 50 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}`).join(' ') + '.';
  const en = speechParts(longEn, 'en');
  en.forEach((p, i) => assert.ok(size(p, 'en') <= PART_CAPS[i === 0 ? 'first' : 'rest'].en, `en part ${i} ${p}`));
  assert.equal(en.join(' ').replace(/[^\p{L}]/gu, ''), longEn.replace(/[^\p{L}]/gu, ''));
  for (const p of [...zh, ...en]) assert.ok(/[\p{L}\p{N}]/u.test(p) && !/\p{Extended_Pictographic}/u.test(p));
});

test('TC-103 REQ-024/REQ-014 speechParts of the crisis help lines: each language yields parts with the number readable (en spells 988)', async () => {
  const { speechParts } = await imp('server/tts.js');
  const P = await imp('server/prompts.js');
  const en = speechParts(P.CRISIS_FALLBACK.en + ' ' + P.CRISIS_LINE.en, 'en');
  assert.ok(en.length >= 3 && en.join(' ').includes('nine eight eight'));
  const zh = speechParts(P.CRISIS_FALLBACK.zh + P.CRISIS_LINE.zh, 'zh');
  assert.ok(zh.length >= 3 && zh.join('').includes('988'));
});

// ---------- main.js parseTurn / parseSpeak (DES-022) and the HTTP edge of /api/speak
const buf = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o));
test('TC-104 [FX-012] REQ-031/REQ-030 parseTurn: name absent or null -> null; any string is cleaned (FX-012 expected values); a non-string -> bad_request; line/history rules unchanged', async () => {
  const { parseTurn } = await imp('server/main.js');
  assert.deepEqual(parseTurn(buf({ line: ' hi ', history: [] })), { line: 'hi', history: [], name: null });
  assert.equal(parseTurn(buf({ line: 'hi', history: [], name: null })).name, null);
  const f = fx('FX-012');
  for (const c of f.input.cases) assert.equal(parseTurn(buf({ line: f.input.line, history: [], name: c.name })).name, f.expected.cases.find((e) => e.id === c.id).name, c.id);
  assert.equal(parseTurn(buf({ line: 'hi', history: [], name: 'x'.repeat(5000) })).name, 'x'.repeat(12), 'a long name is cleaned, not refused');
  for (const name of [123, true, {}, []]) rejectsBad(() => parseTurn(buf({ line: 'hi', history: [], name })));
  rejectsBad(() => parseTurn(buf({ line: '', history: [] })));
  rejectsBad(() => parseTurn(buf('{nope')));
});

test('TC-105 REQ-014 parseSpeak: text trimmed 1..200 chars, lang zh|en, otherwise bad_request', async () => {
  const { parseSpeak } = await imp('server/main.js');
  assert.deepEqual(parseSpeak(buf({ text: '  你好。 ', lang: 'zh' })), { text: '你好。', lang: 'zh' });
  assert.deepEqual(parseSpeak(buf({ text: 'a'.repeat(200), lang: 'en' })), { text: 'a'.repeat(200), lang: 'en' });
  assert.equal(parseSpeak(buf({ text: ' ' + 'a'.repeat(200) + ' ', lang: 'en' })).text.length, 200, 'trimmed before counting');
  for (const b of [{ text: 'a'.repeat(201), lang: 'en' }, { text: '', lang: 'en' }, { text: '   ', lang: 'en' }, { text: 'hi', lang: 'fr' }, { text: 'hi', lang: 'ZH' }, { text: 'hi' }, { lang: 'en' },
    { text: 5, lang: 'en' }, { text: ['hi'], lang: 'en' }, 'just a string', null, [], 7]) rejectsBad(() => parseSpeak(buf(b)));
  rejectsBad(() => parseSpeak(buf('{nope')));
});

test('TC-106 REQ-014/REQ-017 route (throwaway server): /api/speak and /api/respond reject bad input with 400 and an over-limit body with 413 before any child is used', async () => {
  const { route } = await imp('server/main.js');
  const srv = http.createServer(route);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (path, body, type = 'application/json') => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': type }, body }); return { status: r.status, json: await r.json().catch(() => undefined) }; };
  try {
    for (const b of ['{nope', JSON.stringify({ text: 'hi', lang: 'fr' }), JSON.stringify({ text: '', lang: 'en' }), JSON.stringify({ text: 'a'.repeat(201), lang: 'zh' }), JSON.stringify({ lang: 'en' })]) {
      const r = await post('/api/speak', b); assert.equal(r.status, 400, b); assert.deepEqual(r.json, { error: 'bad_request' }, b);
    }
    const big = await post('/api/speak', JSON.stringify({ text: 'a'.repeat(4200), lang: 'en' }));
    assert.equal(big.status, 413); assert.deepEqual(big.json, { error: 'too_large' });
    const nm = await post('/api/respond', JSON.stringify({ line: 'hi', history: [], name: 123 }));
    assert.equal(nm.status, 400); assert.deepEqual(nm.json, { error: 'bad_request' });
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

// ---------- config.js (DES-023)
test('TC-107 REQ-014/REQ-017 config: tts paths and voice serena, speak limits and deadlines, VOICES list, missingTtsFiles names the tokenizer when its dir is wrong, TTS_HINT is bilingual', async () => {
  const C = await imp('server/config.js');
  assert.equal(C.CONFIG.tts.voice, 'serena');
  assert.ok(C.CONFIG.tts.bin.endsWith('/stt/.build/release/companion-tts'));
  assert.ok(C.CONFIG.tts.modelDir.endsWith('/models/argmaxinc/ttskit-coreml') && C.CONFIG.tts.tokenizerDir.endsWith('/models/Qwen/Qwen3-0.6B'));
  assert.equal(C.CONFIG.limits.speakChars, 200); assert.equal(C.CONFIG.limits.speakJsonBytes, 4096);
  assert.equal(C.CONFIG.deadlines.speakMs, 10000); assert.equal(C.CONFIG.deadlines.ttsBootMs, 300000);
  assert.deepEqual(C.VOICES, ['ryan', 'aiden', 'ono-anna', 'sohee', 'eric', 'dylan', 'serena', 'vivian', 'uncle-fu']);
  const cfg = structuredClone(C.CONFIG);
  cfg.tts.tokenizerDir = '/nonexistent-companion-test/tok';
  assert.deepEqual(C.missingTtsFiles(cfg), ['/nonexistent-companion-test/tok/tokenizer.json']);
  cfg.tts.modelDir = '/nonexistent-companion-test/models';
  const miss = C.missingTtsFiles(cfg);
  assert.ok(miss.length >= 7 && miss.some((p) => p.endsWith('/qwen3_tts/speech_decoder/12hz-0.6b-customvoice')) && miss.includes('/nonexistent-companion-test/tok/tokenizer.json'), miss.join('\n'));
  assert.ok(/[一-鿿]/.test(C.TTS_HINT) && /Read-aloud/.test(C.TTS_HINT) && /TTS_MODEL_DIR/.test(C.TTS_HINT) && /TTS_TOKENIZER_DIR/.test(C.TTS_HINT));
});

test('TC-108 REQ-017 config: TTS_VOICE not in VOICES throws when config.js is imported; a listed voice is accepted (child process, own env copy)', async () => {
  const { execFileSync } = await import('node:child_process');
  const run = (voice) => {
    const env = { ...process.env, TTS_VOICE: voice };
    return execFileSync(process.execPath, ['--input-type=module', '-e', `const c = await import(${JSON.stringify(new URL('../server/config.js', import.meta.url).href)}); console.log(c.CONFIG.tts.voice);`], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  };
  assert.equal(run('aiden'), 'aiden');
  assert.throws(() => run('not-a-voice'), (e) => /TTS_VOICE|voice/i.test(String(e.stderr)));
});
