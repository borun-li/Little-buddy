// Q-024 / DES-028 / FLOW-012: poke the companion. Page only, no backend. DOM-free: companion.js draws.
// Order matches copy.pokes: 0 tickle, 1 oops, 2 here. Faces are borrowed from drawn moods (02-ui CMP-001).
export const POKES = [
  { id: 'tickle', face: 'pleasant-high' },
  { id: 'oops', face: 'neutral' },
  { id: 'here', face: 'pleasant-low' },
];
export const POKE_HOLD_MS = 1500; // reaction held, then a 240 ms crossfade back: well within 2 s

// Never the same reaction twice running. random() in [0, 1); prev null/invalid = first poke.
export function nextPoke(prev, random = Math.random) {
  const n = POKES.length;
  if (!Number.isInteger(prev) || prev < 0 || prev >= n) return Math.min(n - 1, Math.floor(random() * n));
  const k = Math.min(n - 2, Math.floor(random() * (n - 1)));
  return k >= prev ? k + 1 : k;
}

// Default timers are arrow wrappers: window.setTimeout called as timers.setTimeout throws Illegal invocation.
// showFace(face|null, wordFn|null), setMotion(id|null): from companion.js.
// isBlocked(): later rows (breathing) make a poke be ignored.
export function createPoker({ showFace, setMotion, random = Math.random, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }, isBlocked = () => false }) {
  let prev = null;
  let timer = null;
  let active = false;

  function end() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    active = false;
    setMotion(null);
    showFace(null, null);
  }

  return {
    get active() { return active; },
    // Returns the reaction index played, or -1 when ignored.
    poke(copyPokes) {
      if (isBlocked()) return -1;
      if (timer !== null) timers.clearTimeout(timer); // poke mid-reaction: the next one plays
      const i = nextPoke(prev, random);
      prev = i;
      active = true;
      setMotion(POKES[i].id);
      showFace(POKES[i].face, () => copyPokes()[i]);
      timer = timers.setTimeout(end, POKE_HOLD_MS);
      return i;
    },
    // A clear, or breathing starting: end a reaction at once.
    reset() { if (active) end(); },
  };
}
