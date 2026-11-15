// Generic child-process supervisor: spawn, warm, state, restart, stop (03 DES-004, §4).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { CONFIG } from './config.js';
import { log } from './log.js';

/** @typedef {'starting'|'ready'|'down'} ChildState */
export const isReady = (s) => s === 'ready';

const TAIL_LINES = 20;
const CAUSE = /error|failed|couldn't|cannot/i;
const LLAMA_TIME = /^\d+\.\d+\.\d+\.\d+\s+/;

// Why a child stopped, for the operator's stderr line (03 DES-004 step 7, FND-004): the child's own first error line,
// else the warm failure, else the exit code and signal.
function causeOf(tail, warmErr, code, signal) {
  const line = tail.find((l) => CAUSE.test(l));
  const cause = line !== undefined ? line.replace(LLAMA_TIME, '') : warmErr ? warmErr.message : `code ${code}, signal ${signal}`;
  return cause.slice(0, 200);
}

export function supervise({ name, cmd, args, stdio, warm, onExit, env, restarts: policy = CONFIG.restarts }) {
  let state = 'down';
  let child = null;
  let restarts = 0;
  let stopped = false;
  let timer = null;
  let tail = [];
  let warmErr = null;

  function exited(c, code, signal) {
    if (child !== c) return;
    child = null;
    state = 'down';
    onExit?.();
    log('warn', 'child_exit', { name, code, signal, restarts });
    if (stopped) return;
    // Not through log(): the cause may hold a path, so it stays out of the stdout JSON log (03 §6).
    const cause = causeOf(tail, warmErr, code, signal);
    if (restarts >= policy.max) {
      process.stderr.write(`${name} 已停止 gave up after ${policy.max} restarts: ${cause} — 修好上面的原因后重新运行 npm start  Fix the cause above, then run npm start again\n`);
      log('error', 'child_gave_up', { name, restarts });
      return;
    }
    restarts += 1;
    process.stderr.write(`${name} 已退出 exited: ${cause} — ${policy.delayMs / 1000} 秒后重启 restarting in ${policy.delayMs / 1000} s (${restarts}/${policy.max})\n`);
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) start();
    }, policy.delayMs);
  }

  function start() {
    const started = Date.now();
    const c = spawn(cmd, args, { stdio, env });
    child = c;
    state = 'starting';
    tail = [];
    warmErr = null;
    // Keep reading so the pipe never fills and blocks the child; only the last TAIL_LINES lines stay, in memory only.
    if (stdio[2] === 'pipe' && c.stderr) {
      createInterface({ input: c.stderr, crlfDelay: Infinity }).on('line', (l) => {
        if (child !== c) return;
        tail.push(l);
        if (tail.length > TAIL_LINES) tail.shift();
      });
    }
    // 'close' fires after 'exit' and also when spawn itself failed (ENOENT), so it is the one exit hook.
    c.once('close', (code, signal) => exited(c, code, signal));
    c.on('error', (err) => log('error', 'child_error', { name, err_name: err.name, err_code: err.code ?? null }));
    if (c.pid === undefined) return;
    log('info', 'child_spawn', { name, pid: c.pid });
    warm(c).then(
      () => {
        if (child !== c || state !== 'starting') return;
        state = 'ready';
        log('info', 'child_ready', { name, ms: Date.now() - started });
      },
      (err) => {
        if (child !== c) return;
        warmErr = err instanceof Error ? err : new Error(String(err));
        log('error', 'child_warm_failed', { name, err_name: err?.name ?? typeof err });
        c.kill('SIGTERM');
      },
    );
  }

  start();
  return {
    get state() { return state; },
    get pid() { return child?.pid ?? null; },
    get child() { return child; },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    },
  };
}
