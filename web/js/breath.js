// Q-029 / DES-028 / FLOW-009: the breathing guide's clock. Page only, no backend. DOM-free: companion.js draws,
// log.js owns the chip. 4 s in, 6 s out, three rounds = 30 s; one tick per second so the caption can count down.
export const ROUNDS = 3;
export const IN_S = 4;
export const OUT_S = 6;

// Step i (0-based) -> { phase: 'in' | 'out', n: seconds left in the phase (4..1 or 6..1), round: 1..ROUNDS }.
export function stepAt(i) {
  const r = i % (IN_S + OUT_S);
  const round = Math.floor(i / (IN_S + OUT_S)) + 1;
  return r < IN_S ? { phase: 'in', n: IN_S - r, round } : { phase: 'out', n: OUT_S - (r - IN_S), round };
}

// Default timers are arrow wrappers: window.setTimeout called as timers.setTimeout throws Illegal invocation.
// onStart(), onTick({phase, n, round, changed}) (changed: the phase word is new, so announce it once),
// onEnd(reason): 'done' after the third exhale, or the reason handed to stop().
export function createBreath({ onStart = () => {}, onTick = () => {}, onEnd = () => {}, rounds = ROUNDS, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  const total = rounds * (IN_S + OUT_S);
  let active = false;
  let timer = null;
  let step = 0;
  let lastPhase = null;

  function finish(reason) {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    active = false;
    onEnd(reason);
  }

  function tick() {
    timer = null;
    if (step >= total) { finish('done'); return; }
    const s = stepAt(step);
    step += 1;
    const changed = s.phase !== lastPhase;
    lastPhase = s.phase;
    onTick({ ...s, changed });
    if (active) timer = timers.setTimeout(tick, 1000); // onTick may have stopped it
  }

  return {
    get active() { return active; },
    // false when a guide is already running
    start() {
      if (active) return false;
      active = true;
      step = 0;
      lastPhase = null;
      onStart();
      tick();
      return true;
    },
    // Ends at once (well inside 1 s); false when nothing was running.
    stop(reason = 'stop') {
      if (!active) return false;
      finish(reason);
      return true;
    },
  };
}
