// Entry: file check, port checks, HTTP routes, request checks, start and stop (03 DES-001, DES-022);
// R1: local-origin check, /api/profile, /api/diary, /api/forget, per-turn mood record, update queue and help region (DES-036).
// R2: look and voice on /api/profile (DES-044); read-aloud voice from the profile, growth with up on every respond 200 (DES-045).
// Phase 5 (DES-049): the parts of the latest crisis reply are remembered so /api/speak can pass crisis to the reader (DES-050).
// node server/main.js [--warm-only]
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBonsai } from './bonsai.js';
import { CONFIG, missingFiles, missingHints, missingTtsFiles, TTS_HINT, VOICES } from './config.js';
import { createMemory } from './memory.js';
import { CHARACTERS, ITEMS, localDay, LOOK_SLOTS } from './memory-files.js';
import { createStore, FILES, FolderInUse } from './memory-store.js';
import { ApiError, sendError } from './errors.js';
import { log } from './log.js';
import { cleanName } from './name.js';
import { serveStatic } from './static.js';
import { createStt } from './stt.js';
import { isReady } from './supervisor.js';
import { createTts, speechParts } from './tts.js';
import { pcmFromWav } from './wav.js';
import { helpRegion, PROFILE_REGIONS, systemRegion } from './region.js';

const WEB = join(CONFIG.repo, 'web');
// Human-readable lines go to stderr; stdout carries only the JSON log (03 §6).
const say = (text) => process.stderr.write(`${text}\n`);
// R0: the help-line region, decided once at start on this Mac (macOS region, then time zone; COMPANION_REGION overrides).
// R1: the profile's choice overrides it per turn (helpRegion).
const SYSTEM_REGION = systemRegion();
// Memory: set by main() (never under --warm-only); attachMemory also lets a test drive route() with its own temp-dir store.
let store = null;
// The read-aloud voice is the profile's, asked when each part is handed to the reader; no store (--warm-only) → the default.
const children = {
  stt: createStt(), bonsai: createBonsai(CONFIG, SYSTEM_REGION), tts: createTts(CONFIG, { voiceOf: () => store?.voice() ?? CONFIG.tts.voice, say }),
};
let ttsStarted = false;
let memory = null;
let replyNotes = null; // per run: the notes one chat keeps, so the reply's prompt prefix stays cached
// Keys of the latest respond 200's speech parts when that turn was a crisis turn, else empty; memory only, never logged.
// The page reads only the newest reply, so the latest one is enough (DES-049 step 4).
const partKey = (text, lang) => `${lang}\n${text}`;
let crisisSpeech = new Set();

export function attachMemory(s, m) {
  store = s;
  memory = m;
  replyNotes = null;
}

// A new chat (history []), memory off, forgotten or unreadable takes the live notes; otherwise the chat keeps its snapshot.
export function notesFor(history) {
  const live = store.notes();
  if (live === null || history.length === 0 || replyNotes === null) replyNotes = live;
  return replyNotes;
}

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

// DNS rebinding / other sites (03 DES-036, BD-014): Host must name this machine; an Origin, when sent, must be http:// + that raw Host.
export function isLocal(req) {
  const h = req.headers.host;
  if (!h) return false;
  const name = h.replace(/:\d*$/, '').toLowerCase();
  if (name !== '127.0.0.1' && name !== 'localhost') return false;
  const origin = req.headers.origin;
  return origin === undefined || origin.toLowerCase() === `http://${h.toLowerCase()}`;
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

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PATCH_KEYS = ['noticeSeen', 'memoryOn', 'name', 'region', 'look', 'voice'];
const LOOK_KEYS = ['character', 'outfit'];

// R2 look patch: an object with character and/or outfit; character one of CHARACTERS; outfit 1-4 of LOOK_SLOTS, each 'none' or one
// of ITEMS (a string "2" is refused). Returns a fresh copy.
export function parseLookPatch(v) {
  if (!isObject(v)) throw new ApiError('bad_request');
  const keys = Object.keys(v);
  if (!keys.length || keys.some((k) => !LOOK_KEYS.includes(k))) throw new ApiError('bad_request');
  const patch = {};
  if ('character' in v) {
    if (!CHARACTERS.includes(v.character)) throw new ApiError('bad_request');
    patch.character = v.character;
  }
  if ('outfit' in v) {
    if (!isObject(v.outfit)) throw new ApiError('bad_request');
    const slots = Object.keys(v.outfit);
    if (!slots.length || slots.some((s) => !LOOK_SLOTS.includes(s))) throw new ApiError('bad_request');
    patch.outfit = {};
    for (const s of slots) {
      const item = v.outfit[s];
      if (item !== 'none' && !ITEMS.includes(item)) throw new ApiError('bad_request');
      patch.outfit[s] = item;
    }
  }
  return patch;
}

// POST /api/profile body: 1-6 known keys (any other, e.g. days, refused); booleans; region one of PROFILE_REGIONS (null refused);
// name string|null, cleaned; look a look patch; voice one of VOICES, exact case. The whole body is checked before anything is saved.
export function parseProfilePatch(body) {
  const data = parseJson(body);
  if (!isObject(data)) throw new ApiError('bad_request');
  const keys = Object.keys(data);
  if (!keys.length || keys.some((k) => !PATCH_KEYS.includes(k))) throw new ApiError('bad_request');
  const patch = {};
  for (const k of ['noticeSeen', 'memoryOn']) {
    if (k in data) {
      if (typeof data[k] !== 'boolean') throw new ApiError('bad_request');
      patch[k] = data[k];
    }
  }
  if ('region' in data) {
    if (!PROFILE_REGIONS.includes(data.region)) throw new ApiError('bad_request');
    patch.region = data.region;
  }
  if ('name' in data) {
    if (data.name !== null && typeof data.name !== 'string') throw new ApiError('bad_request');
    patch.name = cleanName(data.name);
  }
  if ('look' in data) patch.look = parseLookPatch(data.look);
  if ('voice' in data) {
    if (!VOICES.includes(data.voice)) throw new ApiError('bad_request');
    patch.voice = data.voice;
  }
  return patch;
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

// After a 200 reply (03 DES-036 step 4, DES-033 step 1): record the mood unless the page gave up, send, then queue the update.
async function recordTurn(turn, at) {
  if (at.gone()) return { ref: null, skip: 'gone' };
  const ref = await store.recordMood(at.day, turn.mood, at.gen);
  const skip = !store.readable ? 'unreadable' : !store.writable ? 'read_only' : !store.profile().memoryOn ? 'off'
    : at.gen !== store.generation ? 'forgotten' : null;
  return { ref, skip };
}

async function handleApi(req, res, path) {
  if (!isLocal(req)) throw new ApiError('forbidden');
  if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, health());
  if (req.method === 'POST' && path === '/api/respond') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const { line, history, name } = parseTurn(await readBody(req, CONFIG.limits.jsonBytes));
    // A32 idle update (03 DES-036): a turn makes the memory update wait (and aborts one in flight, 'busy'); every path after the
    // parse, 200 or thrown ApiError, ends the turn exactly once.
    memory.turnStarted();
    try {
      let left = false;
      res.on('close', () => {
        if (!res.writableFinished) left = true;
      });
      const at = { day: localDay(new Date()), gen: store.generation, gone: () => left };
      const region = helpRegion(store.profile().region, SYSTEM_REGION);
      const turn = await children.bonsai.respond(line, history, name, { region, notes: notesFor(history) });
      const { ref, skip } = await recordTurn(turn, at);
      // region: the turn's effective help-line region; the page's crisis card picks its numbers from it.
      // growth: after this turn's mood is recorded (the day's first turn already counts); up only from this turn's record.
      const up = ref?.up ?? null;
      const speech = speechParts(turn.reply, turn.lang);
      // Every 200 replaces the set: a crisis turn's parts, or nothing (an older crisis reply's parts go back to the chosen voice).
      crisisSpeech = new Set(turn.crisis ? speech.map((p) => partKey(p, turn.lang)) : []);
      sendJson(res, 200, { ...turn, region, speech, growth: { ...store.growth(), up } });
      const queued = skip === null && !turn.crisis;
      if (queued) memory.enqueue({ gen: at.gen, ref, line, lang: turn.lang });
      log('info', 'memory_turn', { mood_written: ref !== null, queued, skip, up });
      return;
    } finally {
      memory.turnEnded();
    }
  }
  if (req.method === 'GET' && path === '/api/profile') {
    return sendJson(res, 200, { ...store.view(), systemRegion: SYSTEM_REGION, path: CONFIG.memory.displayPath });
  }
  if (req.method === 'GET' && path === '/api/diary') return sendJson(res, 200, store.diary(new Date()));
  if (req.method === 'POST' && path === '/api/profile') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const patch = parseProfilePatch(await readBody(req, CONFIG.limits.profileJsonBytes));
    const out = await store.setProfile(patch);
    if (patch.memoryOn === false) memory.drop('off'); // waiting lines are not sent once memory is off (03 DES-036)
    return sendJson(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/forget') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    if (!isObject(parseJson(await readBody(req, CONFIG.limits.forgetJsonBytes)))) throw new ApiError('bad_request');
    const out = await store.forget();
    memory.drop('forgotten');
    return sendJson(res, 200, out);
  }
  if (req.method === 'POST' && path === '/api/speak') {
    if (mediaType(req) !== 'application/json') throw new ApiError('bad_request');
    const { text, lang } = parseSpeak(await readBody(req, CONFIG.limits.speakJsonBytes));
    // The page aborts a prefetched part it no longer needs: a queued part is then never generated (03 DES-017).
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    // text is trimmed by parseSpeak, the same shape as a speechParts part.
    const wav = await children.tts.speak(text, lang, ac.signal, crisisSpeech.has(partKey(text, lang)));
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
    // Memory before listen (03 DES-036 step 6): lock, then load. Only FolderInUse stops the start; read-only still serves.
    const s = createStore({ dir: CONFIG.memory.dir, say });
    try {
      await s.lock();
    } catch (err) {
      if (!(err instanceof FolderInUse)) throw err;
      say(`记忆文件夹正被另一个小伙伴使用 Memory folder in use by another Little Buddy (PID ${err.pid}): ${CONFIG.memory.displayPath} — 先关掉它，或设 LITTLEBUDDY_DATA_DIR  Stop it first, or set LITTLEBUDDY_DATA_DIR`);
      process.exit(1);
    }
    await s.load();
    attachMemory(s, createMemory({ store: s, bonsai: children.bonsai }));
    say(`记忆文件夹 Memory folder: ${CONFIG.memory.displayPath}`);
    for (const key of s.unreadable) {
      say(`读不出 Cannot read: ${CONFIG.memory.displayPath}${FILES[key]} — 这次按全新开始、不写入，形象、声音、成长也按默认；修好后重启  Starting fresh and writing nothing this run; look, voice and growth use defaults too; fix it and restart`);
    }
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
      // Waiting update lines die with the process (03 DES-036): one line says how many, before the children stop.
      const n = memory?.drop('shutdown') ?? 0;
      log('info', 'memory_dropped', { reason: 'shutdown', n });
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
  say(`求助电话地区 Help-line region: ${SYSTEM_REGION ?? 'international'}（改 Change: COMPANION_REGION=CN|US|OTHER）`);
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
