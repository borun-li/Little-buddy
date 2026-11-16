// Idle-time memory update (03 DES-033, A32): lines wait in `pending` until the chat is quiet for quietMs, then one flush runs them oldest
// first, one bonsai.remember call per line; a new turn aborts the call in flight ('busy') and the line stays first. Guards C, D and E.
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

// Guard E (O-4, REQ-039; be-architect #5): a new 关于你 line must come from the user's line. Tokens: each Han 2-gram inside a Han
// run (a one-character run is one token) and each English word of 3+ letters outside STOP, lower-cased, one trailing "s" dropped
// when 4+ letters. A token is grounded when the line contains it (Han) or has the same word (English). The text is grounded when
// hits * 4 >= tokens > 0 and it is not a bare own-name lead-in. Checked on every add line (all three sections), never on the point.
// Unit cases: 03 §4 Guards, row E.
const STOP = new Set(['the', 'and', 'with', 'this', 'that', 'for', 'has', 'have', 'his', 'her', 'are', 'was', 'were', 'will', 'from', 'they',
  'them', 'she', 'him', 'but', 'not', 'very', 'really', 'about', 'just', 'its', 'who', 'what', 'user', 'their', 'there', 'been', 'into']);
export const BARE_NAME = /^(?:i'?m|i am|my name is|我叫|我的名字(?:是|叫)?)[\s.,!。，！]*$/i;
const enWords = (s) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w));
export function groundTokens(s) {
  const t = [];
  for (const run of s.match(/\p{Script=Han}+/gu) ?? []) {
    if (run.length === 1) t.push(run);
    else for (let i = 0; i + 2 <= run.length; i++) t.push(run.slice(i, i + 2));
  }
  return [...t, ...enWords(s)];
}
export function grounded(text, line) {
  if (BARE_NAME.test(text)) return false;
  const toks = groundTokens(text);
  const lineWords = new Set(enWords(line));
  const hits = toks.filter((t) => (/\p{Script=Han}/u.test(t) ? line.includes(t) : lineWords.has(t))).length;
  return toks.length > 0 && hits * 4 >= toks.length;
}

export function createMemory({ store, bonsai, cfg = CONFIG, timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) } }) {
  const pending = []; // waiting jobs, oldest first; during a flush pending[0] is the one being run
  let active = 0; // /api/respond calls between turnStarted and turnEnded
  let timer = null; // the quiet timer
  let running = null; // AbortController of the remember call in flight
  let flushing = false;

  const done = (job, t0, fields) => ({ ms: Date.now() - t0, waited_ms: t0 - job.queuedAt, ...fields });
  const lost = (job, reason) => done(job, Date.now(), { ok: false, point: false, about_changed: false, reason });

  // Guard D on the point and every line, guard C on people lines, guard E on every line (D -> C -> E); the first reason that fired is logged.
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
        if (!grounded(cleanLine(t, cfg.memory.lineChars), job.line)) {
          reasons.push('ungrounded');
          return false;
        }
        return true;
      });
    }
    return { point, upd: { add }, reason: reasons[0] ?? null };
  }

  // One line: 'busy' when a new turn aborted the call (the line stays first), else 'done' (written, guarded, skipped, failed, timed out
  // or dropped: never retried, 03 §3). A drop() abort was already logged by drop() with its reason.
  async function run(job, ctl) {
    const t0 = Date.now();
    try {
      const skip = job.gen !== store.generation ? 'forgotten' : !store.profile().memoryOn ? 'off' : !store.readable ? 'unreadable' : null;
      if (skip) {
        log('info', 'memory_update', done(job, t0, { ok: false, point: false, about_changed: false, reason: skip }));
        return 'done';
      }
      const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(cfg.deadlines.rememberMs)]);
      const res = await bonsai.remember(store.notes() ?? ABOUT_TEMPLATE, job.line, job.lang, signal);
      const { point, upd, reason } = guard(job, res);
      const wrote = await store.applyUpdate(job, point, upd);
      log('info', 'memory_update', done(job, t0, { ok: true, point: wrote.point, about_changed: wrote.aboutChanged, reason }));
    } catch (err) {
      if (ctl.signal.aborted && ctl.signal.reason === 'busy') {
        log('info', 'memory_update', done(job, t0, { ok: false, point: false, about_changed: false, reason: 'busy' }));
        return 'busy';
      }
      if (ctl.signal.aborted) return 'done';
      const reason = err instanceof ApiError ? err.code : 'failed';
      log('warn', 'memory_update', done(job, t0, { ok: false, point: false, about_changed: false, reason, err_name: err?.name ?? typeof err }));
    }
    return 'done';
  }

  function arm() {
    timers.clearTimeout(timer);
    timer = null;
    if (active === 0 && pending.length && !flushing) timer = timers.setTimeout(flush, cfg.memory.quietMs);
  }

  async function flush() {
    timer = null;
    flushing = true;
    const t0 = Date.now();
    const lines = pending.length;
    let landed = 0;
    let interrupted = false;
    while (pending.length && active === 0) {
      const job = pending[0];
      running = new AbortController();
      const outcome = await run(job, running); // run catches everything (03 §3 catch-all): the flush never rejects
      running = null;
      if (outcome === 'busy') {
        interrupted = true;
        break;
      }
      if (pending[0] === job) pending.shift(); // a drop() meanwhile already emptied pending
      landed += 1;
    }
    flushing = false;
    log('info', 'memory_flush', { lines, landed, left: pending.length, interrupted, ms: Date.now() - t0 });
    arm();
  }

  function drop(reason) {
    const n = pending.length;
    for (const job of pending.splice(0)) log('info', 'memory_update', lost(job, reason));
    timers.clearTimeout(timer);
    timer = null;
    running?.abort(reason);
    return n;
  }

  return {
    // job: { gen, ref: {gen, line}|null, line, lang }; the line waits in memory until its call ends (A9, A47).
    enqueue(job) {
      if (pending.length >= cfg.memory.pendingMax) {
        const [dropped] = pending.splice(flushing ? 1 : 0, 1);
        log('warn', 'memory_update', lost(dropped, 'queue_full'));
      }
      pending.push({ ...job, queuedAt: Date.now() });
    },
    turnStarted() {
      active += 1;
      timers.clearTimeout(timer);
      timer = null;
      running?.abort('busy');
    },
    turnEnded() {
      active -= 1;
      arm();
    },
    drop,
    forget() {
      drop('forgotten');
    },
    get pending() {
      return pending.length;
    },
  };
}
