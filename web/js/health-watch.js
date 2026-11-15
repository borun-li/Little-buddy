// The warming state machine (FLOW-006, 01-ux.md "Warming, per part of health()"). Checks at open and every
// 2 s until both parts are ready; again after a not_ready / unavailable failure of a send or a voice line.
// Pure: health(), the timers and the clock are injected, so tests run on a fake clock. It decides, app.js shows.
//
// state = { canSend, canVoice, waking, hint }   hint is a copy.hints key or null; waking = caption "还在醒来".
export const POLL_MS = 2000;
export const STILL_DOWN_MS = 30000;
export const AWAKE_MS = 4000;

const READY = { canSend: true, canVoice: true, waking: false, hint: null };

export function createHealthWatch({
  health, onChange = () => {}, now = () => Date.now(),
  timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
  pollMs = POLL_MS, stillDownMs = STILL_DOWN_MS, awakeMs = AWAKE_MS,
} = {}) {
  let state = { ...READY };
  let pollTimer = null;
  let awakeTimer = null;
  let downSince = null;
  let notReadyShown = false;
  let running = false;
  let token = 0; // a result of an older check is dropped

  function set(next) {
    const same = Object.keys(next).every((k) => next[k] === state[k]);
    if (same) return;
    state = next;
    onChange({ ...state });
  }

  function classify(result) {
    const bonsai = result?.bonsai;
    const stt = result?.stt;
    if (result?.ready === true && bonsai === undefined) return 'ready';
    if (bonsai === 'ready') return stt === 'ready' ? 'ready' : 'voice';
    if (bonsai === 'starting') return 'warming';
    return 'down'; // down, unknown, or a malformed body
  }

  function applyDown() {
    downSince ??= now();
    notReadyShown = true;
    const long = now() - downSince >= stillDownMs;
    set({ canSend: false, canVoice: false, waking: false, hint: long ? 'stillDown' : 'unreachable' });
  }

  function apply(kind) {
    if (kind !== 'down') downSince = null;
    clearTimeout2(awakeTimer);
    if (kind === 'down') return applyDown();
    notReadyShown = true;
    if (kind === 'warming') return set({ canSend: false, canVoice: false, waking: true, hint: 'warming' });
    set({ canSend: true, canVoice: false, waking: false, hint: 'voiceNotReady' });
  }

  function clearTimeout2(id) { if (id != null) timers.clearTimeout(id); }

  function ready() {
    downSince = null;
    running = false;
    if (notReadyShown) {
      notReadyShown = false;
      set({ ...READY, hint: 'awake' });
      clearTimeout2(awakeTimer);
      awakeTimer = timers.setTimeout(() => { awakeTimer = null; set({ ...READY }); }, awakeMs);
    } else {
      set({ ...READY });
    }
  }

  async function check() {
    const mine = ++token;
    let kind;
    try {
      kind = classify(await health());
    } catch {
      kind = 'down'; // the check failed: same as the reply side down
    }
    if (mine !== token) return;
    if (kind === 'ready') return ready();
    apply(kind);
    pollTimer = timers.setTimeout(() => { pollTimer = null; check(); }, pollMs);
  }

  function begin() {
    if (running) return;
    running = true;
    clearTimeout2(pollTimer);
    pollTimer = null;
    check();
  }

  return {
    get state() { return { ...state }; },
    start: begin,
    // A send or a voice line failed with this code: not_ready / unavailable resume the checks.
    failed(code) {
      if (code !== 'not_ready' && code !== 'unavailable') return;
      // A not_ready code shows a health hint (warming); unavailable shows an action hint, which "awake"
      // never replaces (FND-001). The first check runs one poll later, so the code's hint is read first.
      if (code === 'not_ready') notReadyShown = true;
      if (code === 'unavailable') downSince ??= now();
      if (running) return; // already checking
      running = true;
      clearTimeout2(pollTimer);
      pollTimer = timers.setTimeout(() => { pollTimer = null; check(); }, pollMs);
    },
    stop() { running = false; token += 1; clearTimeout2(pollTimer); clearTimeout2(awakeTimer); pollTimer = awakeTimer = null; },
  };
}
