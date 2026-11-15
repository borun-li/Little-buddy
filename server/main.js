// Entry: file check, port checks, HTTP routes, request checks, start and stop (03 DES-001, DES-022).
// node server/main.js [--warm-only]
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBonsai } from './bonsai.js';
import { CONFIG, missingFiles, missingHints, missingTtsFiles, TTS_HINT } from './config.js';
import { ApiError, sendError } from './errors.js';
import { log } from './log.js';
import { cleanName } from './name.js';
import { serveStatic } from './static.js';
import { createStt } from './stt.js';
import { isReady } from './supervisor.js';
import { createTts, speechParts } from './tts.js';
import { pcmFromWav } from './wav.js';

const WEB = join(CONFIG.repo, 'web');
const children = { stt: createStt(), bonsai: createBonsai(), tts: createTts() };
let ttsStarted = false;

// Human-readable lines go to stderr; stdout carries only the JSON log (03 §6).
const say = (text) => process.stderr.write(`${text}\n`);

export async function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new ApiError('too_large');
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new ApiError('too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

const isText = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max;

function parseJson(body) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApiError('bad_request'); // malformed JSON is the client's defect, reported as its code
  }
}

export function parseTurn(body, limits = CONFIG.limits) {
  const data = parseJson(body);
  if (data === null || typeof data !== 'object' || typeof data.line !== 'string' || !Array.isArray(data.history)) {
    throw new ApiError('bad_request');
  }
  const line = data.line.trim();
  if (!isText(line, limits.lineChars)) throw new ApiError('bad_request');
  for (const h of data.history) {
    if (h === null || typeof h !== 'object' || (h.role !== 'user' && h.role !== 'companion') || !isText(h.text, limits.historyTextChars)) {
      throw new ApiError('bad_request');
    }
  }
  const history = data.history.slice(-limits.historyEntries).map(({ role, text }) => ({ role, text }));
  // name: absent or null = default name; any other non-string is refused; any string is cleaned, never refused (03 DES-021 step 1).
  if (data.name !== undefined && data.name !== null && typeof data.name !== 'string') throw new ApiError('bad_request');
  return { line, history, name: cleanName(data.name) };
}

export function parseSpeak(body, limits = CONFIG.limits) {
  const data = parseJson(body);
  if (data === null || typeof data !== 'object' || typeof data.text !== 'string' || (data.lang !== 'zh' && data.lang !== 'en')) {
    throw new ApiError('bad_request');
  }
  const text = data.text.trim();
  // A lone surrogate is refused here; the helper's JSON decoder would reject it anyway (FND-020).
  if (!isText(text, limits.speakChars) || !text.isWellFormed()) throw new ApiError('bad_request');
  return { text, lang: data.lang };
}

const mediaType = (req) => (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function health() {
  const stt = children.stt.state;
  const bonsai = children.bonsai.state;
  return { ready: isReady(stt) && isReady(bonsai), stt, bonsai, tts: children.tts.state }; // ready does not wait for tts (A18)
}

async function handleApi(req, res, path) {
  if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, health());
  if (req.method === 'POST' && path === '/api/respond') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const { line, history, name } = parseTurn(await readBody(req, CONFIG.limits.jsonBytes));
    const turn = await children.bonsai.respond(line, history, name);
    return sendJson(res, 200, { ...turn, speech: speechParts(turn.reply, turn.lang) });
  }
  if (req.method === 'POST' && path === '/api/speak') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const { text, lang } = parseSpeak(await readBody(req, CONFIG.limits.speakJsonBytes));
    // The page aborts a prefetched part it no longer needs: a queued part is then never generated (03 DES-017).
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    const wav = await children.tts.speak(text, lang, ac.signal);
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' });
    return res.end(wav);
  }
  if (req.method === 'POST' && path === '/api/transcribe') {
    if (mediaType(req) !== 'audio/wav') throw new ApiError('bad_request');
    const pcm = pcmFromWav(await readBody(req, CONFIG.limits.wavBytes));
    return sendJson(res, 200, { text: await children.stt.transcribe(pcm) });
  }
  // DES-001 step 6: unknown API route → 404 with the bad_request code.
  return sendJson(res, 404, { error: 'bad_request' });
}

// Never throws: a throw in the 'request' listener would kill node and both children (FND-001).
export function route(req, res) {
  let path;
  try {
    path = new URL(req.url, 'http://localhost').pathname;
  } catch {
    sendError(res, new ApiError('bad_request'), 'request'); // malformed request-target ("//", an absolute URL with a bad host)
    return;
  }
  if (path === '/api' || path.startsWith('/api/')) {
    handleApi(req, res, path).catch((err) => {
      if (err instanceof ApiError && err.code === 'too_large' && !res.headersSent) res.setHeader('Connection', 'close');
      sendError(res, err, path);
    });
    return;
  }
  try {
    serveStatic(req, res, WEB);
  } catch (err) {
    sendError(res, err, 'static');
  }
}

async function portAnswers(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
    await res.body?.cancel();
    return true;
  } catch (err) {
    if (err.name === 'TimeoutError') return true; // something accepted the connection but is slow: still occupied
    return false; // connection refused: free
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(CONFIG.port, CONFIG.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function stopChildren() {
  children.stt.stop();
  children.bonsai.stop();
  children.tts.stop();
}

export async function main(argv) {
  const warmOnly = argv.includes('--warm-only');
  const booted = Date.now();
  const missing = missingFiles();
  if (missing.length) {
    for (const path of missing) {
      log('error', 'missing_file', { path });
      say(`缺少文件 Missing: ${path}`);
    }
    for (const hint of missingHints(missing)) say(hint);
    process.exit(1);
  }
  if (await portAnswers(CONFIG.bonsai.port)) {
    say(`端口被占用 Port ${CONFIG.bonsai.port} is in use: 设 Set BONSAI_PORT=<free port>`);
    process.exit(1);
  }
  let server = null;
  if (!warmOnly) {
    server = createServer(route);
    try {
      await listen(server);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      say(`端口被占用 Port ${CONFIG.port} is in use: 设 Set PORT=<free port>`);
      process.exit(1);
    }
  }

  process.on('exit', stopChildren);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stopChildren();
      server?.close();
      process.exit(0);
    });
  }

  children.stt.start();
  children.bonsai.start();
  // Read-aloud files missing: chat still starts, tts stays down (REQ-017, 03 DES-022 step 1).
  const ttsMissing = missingTtsFiles();
  for (const path of ttsMissing) {
    log('warn', 'tts_missing', { path });
    say(`缺少文件 Missing: ${path}`);
  }
  if (ttsMissing.length) say(TTS_HINT);
  else {
    children.tts.start();
    ttsStarted = true;
  }
  const url = `http://${CONFIG.host}:${CONFIG.port}`;
  say(`启动中 Starting (stt pid ${children.stt.pid}, bonsai pid ${children.bonsai.pid}, tts pid ${children.tts.pid})…`);
  const poll = setInterval(() => {
    const h = health();
    // --warm-only waits for every child it started (tts only when its files are there); any of them down fails setup.
    if (warmOnly && (h.stt === 'down' || h.bonsai === 'down' || (ttsStarted && h.tts === 'down'))) {
      clearInterval(poll);
      say(`预热失败 Warm-up failed: stt ${h.stt}, bonsai ${h.bonsai}, tts ${ttsStarted ? h.tts : 'not started'}`);
      process.exit(1);
    }
    if (!h.ready || (warmOnly && ttsStarted && h.tts !== 'ready')) return;
    clearInterval(poll);
    log('info', 'ready', { url: warmOnly ? null : url, boot_ms: Date.now() - booted });
    if (warmOnly) {
      say('预热完成 Warm-up done');
      process.exit(0);
    }
    say(`就绪 Ready: ${url}`);
  }, 250);
}

// Run only as the entry point, so tests can import readBody / parseTurn / route without starting anything.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    log('error', 'boot_failed', { err_name: err?.name ?? typeof err, message: err?.message ?? null });
    say(`启动失败 Start failed: ${err?.message ?? err}`);
    stopChildren();
    process.exit(1);
  });
}
