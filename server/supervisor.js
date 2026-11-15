// Generic child-process supervisor: spawn, warm, state, restart, stop (03 DES-004, §4).
import { spawn } from 'node:child_process';
import { CONFIG } from './config.js';
import { log } from './log.js';

/** @typedef {'starting'|'ready'|'down'} ChildState */
export const isReady = (s) => s === 'ready';

export function supervise({ name, cmd, args, stdio, warm, onExit, restarts: policy = CONFIG.restarts }) {
  let state = 'down';
  let child = null;
  let restarts = 0;
  let stopped = false;
  let timer = null;

  function exited(c, code, signal) {
    if (child !== c) return;
    child = null;
    state = 'down';
    onExit?.();
    log('warn', 'child_exit', { name, code, signal, restarts });
    if (stopped || restarts >= policy.max) return;
    restarts += 1;
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) start();
    }, policy.delayMs);
  }

  function start() {
    const started = Date.now();
    const c = spawn(cmd, args, { stdio });
    child = c;
    state = 'starting';
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
