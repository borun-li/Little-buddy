// Background memory update after each reply (03 DES-033): one job at a time, bonsai.remember, guards C (claimed name) and D (copied words).
import { CONFIG } from './config.js';
import { ApiError } from './errors.js';
import { log } from './log.js';
import { ABOUT_TEMPLATE, cleanLine, SECTIONS, verbatim } from './memory-files.js';

// The user's line states their own name: only at the start of the line or after sentence punctuation (incl. ：:；;);
// "my name is / 我的名字是|叫 / 我叫 / i'm called" may follow a "记住 / 请记住 / 记得 / remember (that)" lead-in, "叫我 / call me" may not
// ("记得叫我起床", "remember to call me" are not names). Unit cases: 03 §4 Guards, row C.
export const SAYS_NAME = /(?:^|[，。！？；：,.!?;:]\s*)(?:(?:请?记住|记得|remember(?: that)?)[\s,，:：]*)?(?:我叫(?!了)|我的名字(?:是|叫)|my name is|i'?m called)|(?:^|[，。！？；：,.!?;:]\s*)(?:叫我|call me)/i;
// An added "people" line that claims the user's name (checked on add.people only).
export const OWN_NAME_LINE = /^(?:i'?m|i am|my name is|我叫)\s*[^\s,，。.!！]{1,12}(?:\s[^\s,，。.!！]{1,12})?$/i;

export function createMemory({ store, bonsai, cfg = CONFIG }) {
  const queue = [];
  let running = null; // AbortController of the job in flight
  let draining = false;

  const done = (job, t0, fields) => ({ ms: Date.now() - t0, waited_ms: t0 - job.queuedAt, ...fields });

  // Guard D on the point and every line, guard C on people lines; the first reason that fired is logged.
  function guard(job, res) {
    const reasons = [];
    let point = cleanLine(res.point ?? '', cfg.memory.pointChars) || null;
    if (point !== null && verbatim(point, job.line)) {
      point = null;
      reasons.push('verbatim');
    }
    const saysName = SAYS_NAME.test(job.line);
    const add = {};
    for (const { key } of SECTIONS) {
      add[key] = res.add[key].filter((t) => {
        if (verbatim(t, job.line)) {
          reasons.push('verbatim');
          return false;
        }
        if (key === 'people' && !saysName && OWN_NAME_LINE.test(cleanLine(t, cfg.memory.lineChars))) {
          reasons.push('own_name');
          return false;
        }
        return true;
      });
    }
    return { point, upd: { add }, reason: reasons[0] ?? null };
  }

  async function run(job, ctl) {
    const t0 = Date.now();
    const skip = job.gen !== store.generation ? 'forgotten' : !store.profile().memoryOn ? 'off' : !store.readable ? 'unreadable' : null;
    if (skip) {
      log('info', 'memory_update', done(job, t0, { ok: false, point: false, about_changed: false, reason: skip }));
      return;
    }
    try {
      const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(cfg.deadlines.rememberMs)]);
      const res = await bonsai.remember(store.notes() ?? ABOUT_TEMPLATE, job.line, job.lang, signal);
      const { point, upd, reason } = guard(job, res);
      const wrote = await store.applyUpdate(job, point, upd);
      log('info', 'memory_update', done(job, t0, { ok: true, point: wrote.point, about_changed: wrote.aboutChanged, reason }));
    } catch (err) {
      // Never retried: the next turn brings its own update (03 §3). A forget() abort is 'aborted', not a failure.
      const reason = ctl.signal.aborted ? 'aborted' : err instanceof ApiError ? err.code : 'failed';
      log('warn', 'memory_update', done(job, t0, { ok: false, point: false, about_changed: false, reason, err_name: err?.name ?? typeof err }));
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const job = queue.shift();
      running = new AbortController();
      await run(job, running);
      running = null;
    }
    draining = false;
  }

  return {
    // job: { gen, ref: {gen, line}|null, line, lang }; the line waits in memory for this one call only (A9, A47).
    enqueue(job) {
      if (queue.length >= cfg.memory.queueMax) {
        const dropped = queue.shift();
        log('warn', 'memory_update', done(dropped, Date.now(), { ok: false, point: false, about_changed: false, reason: 'queue_full' }));
      }
      queue.push({ ...job, queuedAt: Date.now() });
      drain();
    },
    forget() {
      queue.length = 0;
      running?.abort();
    },
    get pending() {
      return queue.length + (running ? 1 : 0);
    },
  };
}
