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
  const queue = []; // waiting items, FIFO, memory only
  let inFlight = null; // the item whose answer is awaited; cleared when it settles (answer, timeout, abort), then the next is written
  let readyWaiter = null;

  // Settle an item once; later answers, timeouts or aborts for it are ignored.
  function settle(item, err, value) {
    if (item.done) return;
    item.done = true;
    clearTimeout(item.timer);
    item.signal.removeEventListener('abort', item.onAbort);
    if (err) item.reject(err);
    else item.resolve(value);
    // DES-017 step 5: after a timeout (or abort) the next request is written; the late answer carries the old id and is dropped.
    if (inFlight === item) {
      inFlight = null;
      pump();
    }
  }

  function pump() {
    if (inFlight || !queue.length || !proc?.child) return;
    const item = queue.shift();
    inFlight = item;
    item.written = Date.now();
    proc.child.stdin.write(`${JSON.stringify({ id: item.id, text: item.text, lang: item.lang })}\n`);
  }

  function failAll(code) {
    const items = inFlight ? [inFlight, ...queue] : [...queue];
    inFlight = null;
    queue.length = 0; // emptied first, so settle() has nothing to write to the dead helper
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
    const item = inFlight;
    if (!item || msg.id !== item.id) return; // a late answer to a request that already timed out or was aborted
    if (msg.error) {
      log('warn', 'tts_error', { error: msg.error });
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
        // Aborted while queued: removed, never written. Aborted in flight: the answer is dropped when it arrives.
        item.onAbort = () => {
          const i = queue.indexOf(item);
          if (i !== -1) queue.splice(i, 1);
          settle(item, signal.reason);
        };
        // Deadline from the call: queue wait + generation. A late answer is dropped.
        item.timer = setTimeout(() => {
          const i = queue.indexOf(item);
          if (i !== -1) queue.splice(i, 1);
          settle(item, new ApiError('timeout', 'tts'));
        }, cfg.deadlines.speakMs);
        signal.addEventListener('abort', item.onAbort, { once: true });
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
