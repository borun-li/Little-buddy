// Client of the resident companion-stt helper over stdio JSON lines (03 DES-006).
import { createInterface } from 'node:readline';
import { CONFIG } from './config.js';
import { ApiError } from './errors.js';
import { log } from './log.js';
import { supervise } from './supervisor.js';

export const isNothingHeard = (text) => text === '';

export function createStt(cfg = CONFIG) {
  let proc = null;
  let nextId = 0;
  const pending = new Map(); // id -> { resolve, reject, timer, started, audioMs }
  let readyWaiter = null;

  function failAll(code) {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(new ApiError(code, 'stt'));
    }
  }

  function onLine(line) {
    if (!line.startsWith('{')) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      log('warn', 'stt_bad_line', { err_name: err.name });
      return;
    }
    if (msg.event === 'ready') {
      readyWaiter?.(msg);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return; // late answer after a timeout
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.error) {
      log('warn', 'stt_error', { error: msg.error });
      p.reject(new ApiError('failed', 'stt'));
      return;
    }
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    log('info', 'stt_done', { ms: Date.now() - p.started, audio_ms: p.audioMs, empty: isNothingHeard(text), lang: msg.lang ?? null });
    p.resolve(text);
  }

  function warm(child) {
    createInterface({ input: child.stdout }).on('line', onLine);
    // A write after the helper died raises EPIPE here; 'close' then fails every pending request.
    child.stdin.on('error', (err) => log('warn', 'stt_stdin_error', { err_name: err.name, err_code: err.code ?? null }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readyWaiter = null;
        reject(new Error('stt warm-up exceeded sttBootMs'));
      }, cfg.deadlines.sttBootMs);
      child.once('close', () => {
        clearTimeout(timer);
        readyWaiter = null;
        reject(new Error('stt exited before ready'));
      });
      readyWaiter = (msg) => {
        clearTimeout(timer);
        readyWaiter = null;
        log('info', 'stt_warm', { load_ms: msg.load_ms ?? null, warm_ms: msg.warm_ms ?? null });
        resolve();
      };
    });
  }

  return {
    start() {
      proc = supervise({
        name: 'stt',
        cmd: cfg.stt.bin,
        args: ['--model-folder', cfg.stt.modelDir, '--tokenizer-folder', cfg.stt.tokenizerDir],
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
    transcribe(pcm) {
      const state = proc?.state ?? 'down';
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'stt'));
      if (state !== 'ready' || !proc.child) return Promise.reject(new ApiError('unavailable', 'stt'));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new ApiError('timeout', 'stt'));
        }, cfg.deadlines.transcribeMs);
        pending.set(id, { resolve, reject, timer, started: Date.now(), audioMs: Math.round(pcm.length / 32) });
        proc.child.stdin.write(`${JSON.stringify({ id, pcm16: pcm.toString('base64') })}\n`);
      });
    },
  };
}
