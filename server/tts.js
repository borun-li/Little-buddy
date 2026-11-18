// Client of the resident companion-tts helper over stdio JSON lines, and the reply → spoken parts split (03 DES-017, DES-018).
// R2 (DES-041): each line carries the voice voiceOf() gives when the line is written; the helper echoes the voice it used.
// Phase 5 (DES-050): a crisis part in a CRISIS_VOICE_FOR voice is read by CRISIS_VOICE (voiceFor), still decided at the write.
import { createInterface } from 'node:readline';
import { SENTENCE } from './bonsai.js';
import { CONFIG, CRISIS_VOICE, CRISIS_VOICE_FOR } from './config.js';
import { ApiError } from './errors.js';
import { log } from './log.js';
import { supervise } from './supervisor.js';

/** @typedef {'ryan'|'aiden'|'ono-anna'|'sohee'|'eric'|'dylan'|'serena'|'vivian'|'uncle-fu'} Voice */
// The voice a part is read in: the chosen voice, except a crisis part in a voice that missed the number (Q31).
export const voiceFor = (voice, crisis) => (crisis && CRISIS_VOICE_FOR.includes(voice) ? CRISIS_VOICE : voice);

// voiceOf: the voice to read with, asked when a part is handed to the helper (queued parts follow a change). say: one human line.
export function createTts(cfg = CONFIG, { voiceOf = () => cfg.tts.voice, say = (t) => process.stderr.write(`${t}\n`) } = {}) {
  let proc = null;
  let nextId = 0;
  const queue = []; // waiting items, FIFO, memory only, at most cfg.limits.speakQueue
  // The slot: the item whose line was written. The helper works strictly one at a time and cannot cancel, so the slot stays
  // busy until the helper answers that id (or id -1), even when its caller was already settled by abort or timeout (FND-013).
  let slot = null;
  let overdue = null; // kills a helper that has not answered the slot within ttsOverdueMs of the write (FND-015)
  let readyWaiter = null;
  let staleSaid = false; // tts_helper_stale: once per run

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
    item.voice = voiceFor(voiceOf(), item.crisis);
    overdue = setTimeout(() => {
      overdue = null;
      // The supervisor logs child_exit and restarts; onExit then settles the slot and the queue `unavailable`.
      if (slot === item && proc?.child === child) child.kill('SIGKILL');
    }, cfg.deadlines.ttsOverdueMs);
    child.stdin.write(`${JSON.stringify({ id: item.id, text: item.text, lang: item.lang, voice: item.voice })}\n`);
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
          voice: msg.voice ?? null, crisis: item.crisis,
        });
        // A helper built before R2 ignores the line's voice and echoes none: the audio still goes out, the user is told once.
        if (msg.voice !== item.voice && !staleSaid) {
          staleSaid = true;
          log('warn', 'tts_helper_stale', { asked: item.voice, got: msg.voice ?? null });
          say('朗读助手是旧版，运行 npm run setup 再启动 The read-aloud helper is out of date: run npm run setup, then start again');
        }
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
        // Warms the profile's voice; a supervisor restart reuses these args (one extra cache build if the voice changed since).
        args: ['--model-folder', cfg.tts.modelDir, '--tokenizer-folder', cfg.tts.tokenizerDir, '--voice', voiceOf()],
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
    // crisis: the part belongs to the latest crisis reply (main.js crisisSpeech); only changes the voice (voiceFor).
    speak(text, lang, signal, crisis = false) {
      const state = proc?.state ?? 'down';
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'tts'));
      if (state !== 'ready' || !proc.child) return Promise.reject(new ApiError('unavailable', 'tts'));
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise((resolve, reject) => {
        const item = { id: ++nextId, text, lang, crisis: crisis === true, signal, resolve, reject, started: Date.now(), written: null, done: false };
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

// zh: a run of 3+ digits (phone numbers, years) is read digit by digit in Chinese numerals, 1 as 幺 the way Mainland
// phone numbers are said ("12356" → "幺二三五六", "110" → "幺幺零"). Left as Arabic digits, the voice reads them unstably:
// another language, a wrong number ("988" → "九拜八"), or extra syllables (R0, measured 2026-11-15).
const ZH_DIGITS = ['零', '幺', '二', '三', '四', '五', '六', '七', '八', '九'];
function spellDigitsZh(text) {
  return text.replace(/[0-9]{3,}/g, (run) => [...run].map((d) => ZH_DIGITS[d]).join(''));
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
  else text = spellDigitsZh(text);
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
