// Entry: file check, port checks, HTTP routes, request checks, start and stop (03 DES-001).
// node server/main.js [--warm-only]
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBonsai } from './bonsai.js';
import { CONFIG, missingFiles, missingHints } from './config.js';
import { ApiError, sendError } from './errors.js';
import { log } from './log.js';
import { serveStatic } from './static.js';
import { createStt } from './stt.js';
import { isReady } from './supervisor.js';
import { pcmFromWav } from './wav.js';

const WEB = join(CONFIG.repo, 'web');
const children = { stt: createStt(), bonsai: createBonsai() };

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

export function parseTurn(body, limits = CONFIG.limits) {
  let data;
  try {
    data = JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApiError('bad_request'); // malformed JSON is the client's defect, reported as its code
  }
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
  return { line, history };
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
  return { ready: isReady(stt) && isReady(bonsai), stt, bonsai };
}

async function handleApi(req, res, path) {
  if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, health());
  if (req.method === 'POST' && path === '/api/respond') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const { line, history } = parseTurn(await readBody(req, CONFIG.limits.jsonBytes));
    return sendJson(res, 200, await children.bonsai.respond(line, history));
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
  const url = `http://${CONFIG.host}:${CONFIG.port}`;
  say(`启动中 Starting (stt pid ${children.stt.pid}, bonsai pid ${children.bonsai.pid})…`);
  const poll = setInterval(() => {
    const h = health();
    if (warmOnly && (h.stt === 'down' || h.bonsai === 'down')) {
      clearInterval(poll);
      say(`预热失败 Warm-up failed: stt ${h.stt}, bonsai ${h.bonsai}`);
      process.exit(1);
    }
    if (!h.ready) return;
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
