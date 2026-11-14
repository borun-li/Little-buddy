// CMP-003 talk button and CMP-005 hint line. Hold by pointer or Space; release on the button sends,
// release off it or Esc cancels; < 0.5 s -> too-short hint; 60 s -> sends itself (FLOW-002, FLOW-003).
import { copy } from './copy.js';
import { micPermission, requestStream, stopStream, meter, hintKeyFor } from './mic.js';

const MIN_MS = 500;
const MAX_MS = 60_000;
const UNKNOWN_PROMPT_MS = 600; // browser cannot report permission: a slower answer means a prompt is open
const PROMPT_OPEN = Symbol('prompt open');
const HINT_ICON = { prompt: 'i-mic', refused: 'i-mic-off', noMic: 'i-mic-off', busy: 'i-mic-off', tooShort: 'i-info' };

export function createHint(el) {
  const text = el.querySelector('.hint__text');
  const icon = el.querySelector('use');
  let seq = 0;
  return {
    show(key) {
      const n = ++seq;
      icon.setAttribute('href', `#${HINT_ICON[key]}`);
      el.classList.add('is-shown');
      text.textContent = '';
      // set in a later task so a repeated message (refused on each press) is announced again
      setTimeout(() => { if (n === seq) text.textContent = copy.hints[key]; }, 30);
    },
    clear() {
      seq += 1;
      el.classList.remove('is-shown');
      text.textContent = '';
    },
  };
}

export function createTalkButton({ button, hint, isPaused, onUtterance }) {
  const label = button.querySelector('.talk-button__label');
  const help = button.querySelector('.talk-button__help');
  const phone = window.matchMedia('(max-width: 959.98px)');
  let hold = null; // { by, released, cancelled, mic, t0 (set while listening), timer }

  function setIdle() {
    button.classList.remove('is-listening');
    button.removeAttribute('aria-label');
    button.style.removeProperty('--level');
    label.textContent = copy.talk;
    help.textContent = '';
  }

  function tick() {
    const elapsed = performance.now() - hold.t0;
    if (elapsed >= MAX_MS) { finish(); return; }
    const s = Math.max(1, Math.round(elapsed / 1000));
    label.textContent = phone.matches ? copy.listeningShort(s) : copy.listening(s);
    help.textContent = copy.listeningHelp;
    button.setAttribute('aria-label', copy.listeningName(s));
    button.style.setProperty('--level', (hold.mic?.level() ?? 0).toFixed(2));
  }

  function waitForStream() {
    const asked = requestStream();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(PROMPT_OPEN);
        hint.show('prompt');
        asked.then(stopStream, (e) => hint.show(hintKeyFor(e)));
      }, UNKNOWN_PROMPT_MS);
      asked.then((s) => { clearTimeout(timer); resolve(s); }, (e) => { clearTimeout(timer); reject(e); });
    });
  }

  async function press(by) {
    if (hold || isPaused()) return;
    const h = { by, released: false, cancelled: false, mic: null, t0: 0 };
    hold = h;
    const state = await micPermission();
    if (state === 'denied') { hint.show('refused'); drop(h); return; }
    if (state === 'prompt') {
      // FLOW-003: the prompt opens; this hold never records, typing keeps working
      hint.show('prompt');
      drop(h);
      requestStream().then(stopStream, (e) => hint.show(hintKeyFor(e)));
      return;
    }
    if (state === 'granted') {
      if (h.released) { if (!h.cancelled) hint.show('tooShort'); drop(h); return; }
      // Listening shows at once; the stream (only read for the level bars) joins when it opens,
      // which can take a second on first use. Audio is never kept (A1).
      listen(h);
      requestStream().then((stream) => {
        if (hold === h) h.mic = meter(stream); else stopStream(stream);
      }, (e) => {
        if (hold === h) stop();
        hint.show(hintKeyFor(e));
      });
      return;
    }
    let stream;
    try {
      stream = await waitForStream(); // browser cannot report the permission state
    } catch (e) {
      if (e !== PROMPT_OPEN) hint.show(hintKeyFor(e));
      drop(h);
      return;
    }
    if (h.released || hold !== h) {
      stopStream(stream);
      if (!h.cancelled) hint.show('tooShort');
      drop(h);
      return;
    }
    h.mic = meter(stream);
    listen(h);
  }

  function listen(h) {
    hint.clear();
    h.t0 = performance.now();
    button.classList.add('is-listening');
    tick();
    h.timer = setInterval(tick, 100);
  }

  function drop(h) { if (hold === h) hold = null; }

  function stop() {
    clearInterval(hold.timer);
    hold.mic?.close();
    hold = null;
    setIdle();
  }

  function finish() {
    const elapsed = performance.now() - hold.t0;
    stop();
    if (elapsed < MIN_MS) { hint.show('tooShort'); return; }
    onUtterance();
  }

  function release(inside) {
    if (!hold) return;
    hold.released = true;
    if (!hold.t0) return; // not listening yet: press() sees `released` and stops the stream
    if (inside) finish(); else stop();
  }

  function cancel() {
    if (!hold) return;
    hold.released = true;
    hold.cancelled = true;
    if (hold.t0) stop();
  }

  const inside = (e) => {
    const r = button.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    press('pointer');
  });
  window.addEventListener('pointerup', (e) => { if (hold?.by === 'pointer') release(inside(e)); });
  window.addEventListener('pointercancel', () => { if (hold?.by === 'pointer') cancel(); });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('keydown', (e) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) press('key');
  });
  button.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (hold?.by === 'key') release(true);
  });
  button.addEventListener('blur', () => { if (hold?.by === 'key') cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  setIdle();
  return {
    setPaused(paused) { button.setAttribute('aria-disabled', String(paused)); },
  };
}
