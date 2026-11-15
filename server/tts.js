// Client of the resident companion-tts helper over stdio JSON lines, and the reply → spoken parts split (03 DES-017, DES-018).
import { createInterface } from 'node:readline';
import { SENTENCE } from './bonsai.js';
import { CONFIG } from './config.js';
import { ApiError } from './errors.js';
import { log } from './log.js';
import { supervise } from './supervisor.js';

export function createTts(cfg = CONFIG) {
  let proc = null;
  let nextId = 0;
  const queue = []; // waiting items, FIFO, memory only, at most cfg.limits.speakQueue
  // The slot: the item whose line was written. The helper works strictly one at a time and cannot cancel, so the slot stays
  // busy until the helper answers that id (or id -1), even when its caller was already settled by abort or timeout (FND-013).
  let slot = null;
  let overdue = null; // kills a helper that has not answered the slot within ttsOverdueMs of the write (FND-015)
  let readyWaiter = null;

  // Settle the caller once; a later answer, timeout or abort for it is ignored. Never frees the slot or writes.
  function settle(item, err, value) {
    if (item.done) return;
    item.done = true;
    clearTimeout(item.timer);
    item.signal.removeEventListener('abort', item.onAbort);
    if (err) item.reject(err);
    else item.resolve(value);
  }

  // Settled while queued: removed, never written. Settled in flight: stays in the slot until the helper answers.
  function drop(item, err) {
    const i = queue.indexOf(item);
    if (i !== -1) queue.splice(i, 1);
    settle(item, err);
  }

  function pump() {
    const child = proc?.child;
    if (slot || !queue.length || !child) return;
    const item = queue.shift();
    slot = item;
    item.written = Date.now();
    overdue = setTimeout(() => {
      overdue = null;
      // The supervisor logs child_exit and restarts; onExit then settles the slot and the queue `unavailable`.
      if (slot === item && proc?.child === child) child.kill('SIGKILL');
    }, cfg.deadlines.ttsOverdueMs);
    child.stdin.write(`${JSON.stringify({ id: item.id, text: item.text, lang: item.lang })}\n`);
  }

  function failAll(code) {
    clearTimeout(overdue);
    overdue = null;
    const items = slot ? [slot, ...queue] : [...queue];
    slot = null;
    queue.length = 0;
    for (const item of items) settle(item, new ApiError(code, 'tts'));
  }

  function onLine(line) {
    if (!line.startsWith('{')) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      log('warn', 'tts_bad_line', { err_name: err.name });
      return;
    }
    if (msg.event === 'ready') {
      readyWaiter?.(msg);
      return;
    }
    const item = slot;
    // Only one line is ever outstanding, so id -1 (the helper could not read the request) answers the slot too (FND-020).
    if (!item || (msg.id !== item.id && msg.id !== -1)) return;
    clearTimeout(overdue);
    overdue = null;
    slot = null;
    if (!item.done) {
      if (msg.error || msg.id === -1) {
        log('warn', 'tts_error', { error: msg.error ?? null });
        settle(item, new ApiError('failed', 'tts'));
      } else if (typeof msg.wav === 'string') {
        log('info', 'tts_done', {
          ms: Date.now() - item.started, queued_ms: item.written - item.started, audio_ms: msg.audio_ms ?? null, chars: item.text.length, lang: item.lang,
        });
        settle(item, null, Buffer.from(msg.wav, 'base64'));
      } else {
        log('warn', 'tts_error', { error: null });
        settle(item, new ApiError('failed', 'tts'));
      }
    } // else: the caller was settled by abort or timeout; the late answer only frees the slot
    pump();
  }

  function warm(child) {
    createInterface({ input: child.stdout }).on('line', onLine);
    // A write after the helper died raises EPIPE here; 'close' then fails every queued request.
    child.stdin.on('error', (err) => log('warn', 'tts_stdin_error', { err_name: err.name, err_code: err.code ?? null }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readyWaiter = null;
        reject(new Error('tts warm-up exceeded ttsBootMs'));
      }, cfg.deadlines.ttsBootMs);
      child.once('close', () => {
        clearTimeout(timer);
        readyWaiter = null;
        reject(new Error('tts exited before ready'));
      });
      readyWaiter = (msg) => {
        clearTimeout(timer);
        readyWaiter = null;
        log('info', 'tts_warm', { load_ms: msg.load_ms ?? null, warm_ms: msg.warm_ms ?? null });
        resolve();
      };
    });
  }

  return {
    start() {
      proc = supervise({
        name: 'tts',
        cmd: cfg.tts.bin,
        args: ['--model-folder', cfg.tts.modelDir, '--tokenizer-folder', cfg.tts.tokenizerDir, '--voice', cfg.tts.voice],
        stdio: ['pipe', 'pipe', 'inherit'],
        warm,
        restarts: cfg.restarts,
        onExit: () => failAll('unavailable'),
      });
    },
    stop() {
      proc?.stop();
    },
    get state() {
      return proc?.state ?? 'down';
    },
    get pid() {
      return proc?.pid ?? null;
    },
    speak(text, lang, signal) {
      const state = proc?.state ?? 'down';
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'tts'));
      if (state !== 'ready' || !proc.child) return Promise.reject(new ApiError('unavailable', 'tts'));
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise((resolve, reject) => {
        const item = { id: ++nextId, text, lang, signal, resolve, reject, started: Date.now(), written: null, done: false };
        item.onAbort = () => drop(item, signal.reason);
        // Deadline from the call: queue wait + generation.
        item.timer = setTimeout(() => drop(item, new ApiError('timeout', 'tts')), cfg.deadlines.speakMs);
        signal.addEventListener('abort', item.onAbort, { once: true });
        // Full queue: the oldest waiting part is stale (the page has moved on), so it gives way (FND-013).
        if (queue.length >= cfg.limits.speakQueue) drop(queue[0], new ApiError('unavailable', 'tts'));
        queue.push(item);
        pump();
      });
    },
  };
}

export const PART_CAPS = { first: { zh: 10, en: 7 }, rest: { zh: 24, en: 16 } };

const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}/gu;
const CLAUSE = /[^，、；：,;:—]+[，、；：,;:—]*/gu;
const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const HAS_WORD = /[\p{L}\p{N}]/u;

// en: every digit is read as its own word ("988" → "nine eight eight"; serena garbles digit strings).
function spellDigits(text) {
  return text
    .replace(/(?<=\p{L})(?=[0-9])|(?<=[0-9])(?=\p{L})/gu, ' ')
    .replace(/[0-9]+/g, (run) => [...run].map((d) => DIGIT_WORDS[d]).join(' '));
}

const words = (s) => s.split(/\s+/).filter(Boolean);
const units = (s, lang) => (lang === 'zh' ? [...s] : words(s));
const sizeOf = (s, lang) => (lang === 'zh' ? (s.match(/[\p{L}\p{N}]/gu) ?? []).length : words(s).length);

// Too long and no clause mark left: consecutive equal slices, each within the cap.
function hardSplit(s, lang, cap) {
  const u = units(s, lang);
  const k = Math.ceil(sizeOf(s, lang) / cap);
  const per = Math.ceil(u.length / k);
  const out = [];
  for (let i = 0; i < u.length; i += per) out.push(u.slice(i, i + per).join(lang === 'zh' ? '' : ' '));
  return out;
}

export function speechParts(reply, lang) {
  let text = String(reply ?? '').replace(EMOJI, '');
  if (lang === 'en') text = spellDigits(text);
  const sentences = (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
  const parts = [];
  const cap = () => (parts.length ? PART_CAPS.rest : PART_CAPS.first)[lang];
  for (const sentence of sentences) {
    if (sizeOf(sentence, lang) <= cap()) {
      parts.push(sentence);
      continue;
    }
    for (const clause of (sentence.match(CLAUSE) ?? []).map((c) => c.trim()).filter(Boolean)) {
      if (sizeOf(clause, lang) <= cap()) parts.push(clause);
      else parts.push(...hardSplit(clause, lang, cap()));
    }
  }
  return parts.filter((p) => HAS_WORD.test(p));
}
