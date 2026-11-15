// Q-024 / DES-028 / FLOW-012: poke the companion. Page only, no backend. DOM-free: companion.js draws.
// Order matches copy.pokes: 0 tickle, 1 oops, 2 here. Faces are borrowed from drawn moods (02-ui CMP-001).
export const POKES = [
  { id: 'tickle', face: 'pleasant-high' },
  { id: 'oops', face: 'neutral' },
  { id: 'here', face: 'pleasant-low' },
];
export const POKE_HOLD_MS = 1500; // reaction held, then a 240 ms crossfade back: well within 2 s

// FND-012: reactions come from a bag of all three, drawn in random order, so any six pokes show every reaction
// twice and none runs twice (a new bag never starts with the reaction just played). random() in [0, 1).
// next(prev): prev is the last reaction played. When prev is not what this bag last gave (a first poke, or a
// caller that does not chain), the draw is stateless: any reaction but prev, and a fresh bag starts from it.
export function createBag() {
  let rest = [];
  let last = null;
  return {
    next(prev, random = Math.random) {
      const n = POKES.length;
      const valid = Number.isInteger(prev) && prev >= 0 && prev < n;
      let i;
      if (valid && prev === last && rest.length) {
        i = rest.shift();
      } else {
        if (!valid) i = Math.min(n - 1, Math.floor(random() * n));
        else { const k = Math.min(n - 2, Math.floor(random() * (n - 1))); i = k >= prev ? k + 1 : k; }
        rest = POKES.map((_, j) => j).filter((j) => j !== i);
        if (rest.length > 1 && Math.floor(random() * 2) === 1) rest.reverse();
      }
      last = i;
      return i;
    },
  };
}
const shared = createBag();
export const nextPoke = (prev, random = Math.random) => shared.next(prev, random);

// Default timers are arrow wrappers: window.setTimeout called as timers.setTimeout throws Illegal invocation.
// showFace(face|null, wordFn|null), setMotion(id|null): from companion.js.
// isBlocked(): later rows (breathing) make a poke be ignored.
export function createPoker({ showFace, setMotion, random = Math.random, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }, isBlocked = () => false }) {
  let prev = null;
  const bag = createBag();
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
      const i = bag.next(prev, random);
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
