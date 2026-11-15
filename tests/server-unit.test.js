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
  assert.deepEqual({ ...CONFIG.limits }, { lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudget: 2000, jsonBytes: 262144, wavBytes: 2000000 });
  assert.deepEqual({ ...CONFIG.deadlines }, { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 60000 });
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
