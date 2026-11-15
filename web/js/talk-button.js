// CMP-003 talk button and CMP-005 hint line. Hold by pointer or Space; release on the button sends,
// release off it or Esc cancels; < 0.5 s from mic open -> too-short hint; 60 s from open -> sends itself
// (FLOW-002, FLOW-003, FLOW-005). Listening starts when the mic stream opens, not at the press.
import { copy } from './copy.js';
import { micPermission, requestStream, stopStream, meter, hintKeyFor } from './mic.js';

const MIN_MS = 500;
const MAX_MS = 60_000;
const MIC_OPENING_MS = 200; // slow open: tell the user to wait until it says Listening (DFB-005)
const UNKNOWN_PROMPT_MS = 600; // browser cannot report permission: a slower answer means a prompt is open
const PROMPT_OPEN = Symbol('prompt open');
const HINT_ICON = { prompt: 'i-mic', refused: 'i-mic-off', noMic: 'i-mic-off', busy: 'i-mic-off', tooShort: 'i-info', micOpening: 'i-mic', listeningNow: null };

const hintText = (key) => (key === 'listeningNow' ? copy.listeningNow : copy.hints[key]);

export function createHint(el) {
  const text = el.querySelector('.hint__text');
  const icon = el.querySelector('use');
  let seq = 0;
  let shown = null; // Q-015: the key on screen, so a language switch can re-say it
  return {
    get key() { return shown; },
    show(key, iconId = HINT_ICON[key]) {
      const n = ++seq;
      shown = key;
      // listeningNow is announced, not shown: without .is-shown the line stays visually hidden (FND-003)
      if (iconId) icon.setAttribute('href', `#${iconId}`);
      el.classList.toggle('is-shown', key !== 'listeningNow');
      text.textContent = '';
      // set in a later task so a repeated message (refused on each press) is announced again
      setTimeout(() => { if (n === seq) text.textContent = hintText(key); }, 30);
    },
    // Q-015: same key in the current language, set at once (not announced again)
    refresh() { if (shown) text.textContent = hintText(shown); },
    clear() {
      seq += 1;
      shown = null;
      el.classList.remove('is-shown');
      text.textContent = '';
    },
  };
}

export function createTalkButton({ button, hint, isPaused, onUtterance, onPress = () => {}, deps = {} }) {
  const {
    micPermission: getPermission = micPermission, requestStream: openStream = requestStream,
    stopStream: closeStream = stopStream, meter: makeMeter = meter, now = () => performance.now(),
  } = deps;
  const label = button.querySelector('.talk-button__label');
  const help = button.querySelector('.talk-button__help');
  const phone = window.matchMedia('(max-width: 959.98px)');
  // { by, released, cancelled, finishing, mic, t0 (set when the stream opened = listening), timer, openTimer, promptTimer }
  let hold = null;

  function setIdle() {
    button.classList.remove('is-listening');
    button.removeAttribute('aria-label');
    button.style.removeProperty('--level');
    label.textContent = copy.talk;
    help.textContent = '';
  }

  function tick() {
    const elapsed = now() - hold.t0;
    if (elapsed >= MAX_MS) { finish(); return; }
    const s = Math.max(1, Math.round(elapsed / 1000));
    label.textContent = phone.matches ? copy.listeningShort(s) : copy.listening(s);
    help.textContent = copy.listeningHelp;
    button.setAttribute('aria-label', copy.listeningName(s));
    button.style.setProperty('--level', (hold.mic?.level() ?? 0).toFixed(2));
  }

  function endOpening(h) { clearTimeout(h.openTimer); clearTimeout(h.promptTimer); }

  // DFB-005: press only holds the button. The mic opens now; "listening", its seconds and the 0.5 s /
  // 60 s rules start when the stream arrives. 0.2 s hint first, then (no permission query) 600 ms = prompt.
  function open(h) {
    h.opening = true;
    h.openTimer = setTimeout(() => { if (hold === h) { h.micHint = true; hint.show('micOpening'); } }, MIC_OPENING_MS);
    let streamP;
    try { streamP = Promise.resolve(openStream()); } catch (e) { streamP = Promise.reject(e); }
    if (h.unknownState) {
      h.promptTimer = setTimeout(() => {
        if (hold !== h) return;
        h.prompted = true; // FLOW-003: a hold that raised the prompt never records
        endOpening(h);
        hint.show('prompt');
        drop(h);
      }, UNKNOWN_PROMPT_MS);
    }
    streamP.then((stream) => {
      endOpening(h);
      if (hold !== h) {
        closeStream(stream); // released, cancelled or prompt: nothing records
        return;
      }
      h.mic = makeMeter(stream);
      listen(h);
    }, (e) => {
      endOpening(h);
      if (h.prompted) { hint.show(hintKeyFor(e)); return; } // answer to the prompt that was shown
      if (hold === h) { drop(h); hint.show(hintKeyFor(e)); }
    });
  }

  async function press(by) {
    // Q-027: a press stops the voice first, whether or not the hold goes on (before the mic opens)
    try { onPress(); } catch { /* the voice is never worth a broken press */ }
    if (hold || isPaused()) return;
    const h = { by, released: false, cancelled: false, finishing: false, mic: null, t0: 0, micHint: false, prompted: false, unknownState: false };
    hold = h;
    const state = await getPermission();
    if (hold !== h) return;
    if (state === 'denied') { hint.show('refused'); drop(h); return; }
    if (state === 'prompt') {
      // FLOW-003: the prompt opens; this hold never records, typing keeps working
      hint.show('prompt');
      drop(h);
      openStream().then(closeStream, (e) => hint.show(hintKeyFor(e)));
      return;
    }
    if (h.released) { // let go while the permission was being read
      if (!h.cancelled) hint.show('tooShort');
      drop(h);
      return;
    }
    h.unknownState = state !== 'granted';
    open(h);
  }

  function listen(h) {
    hint.clear();
    hint.show('listeningNow'); // FND-003: the status line says it; the button's own label shows it
    h.micHint = false;
    h.t0 = now();
    button.classList.add('is-listening');
    tick();
    h.timer = setInterval(tick, 100);
  }

  function drop(h) { if (hold === h) hold = null; }

  // leave without sending: stops the mic and drops the audio
  function stop() {
    clearInterval(hold.timer);
    hold.mic?.close();
    hold = null;
    hint.clear(); // hold hints leave when the hold ends
    setIdle();
  }

  // released before the stream opened
  function abandon(h, send) {
    endOpening(h);
    if (h.micHint) hint.clear();
    drop(h); // a stream that opens later is stopped by open()
    if (send) hint.show('tooShort');
  }

  async function finish() {
    const h = hold;
    h.finishing = true;
    const elapsed = now() - h.t0;
    if (elapsed < MIN_MS) { stop(); hint.show('tooShort'); return; }
    clearInterval(h.timer);
    hint.clear();
    setIdle();
    // mic.wav() stops the tracks, then close() would drop the audio: wav() first (handoff, Q-013)
    let audio = null;
    try { audio = await h.mic.wav(); } catch { audio = null; }
    h.mic.close();
    drop(h);
    onUtterance(audio);
  }

  function release(inside) {
    if (!hold || hold.finishing) return;
    hold.released = true;
    if (!hold.t0) { // stream not open yet: inside -> too short, outside -> nothing
      if (!hold.opening) return; // permission still being read: press() decides
      abandon(hold, inside);
      return;
    }
    if (inside) finish(); else stop();
  }

  function cancel() {
    if (!hold || hold.finishing) return;
    hold.released = true;
    hold.cancelled = true;
    if (hold.t0) stop(); else if (hold.opening) abandon(hold, false);
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
    // FND-002: one turn in flight. A hold still running when a reply goes pending is cancelled (audio dropped).
    setPaused(paused) {
      button.setAttribute('aria-disabled', String(paused));
      if (paused && hold) cancel();
    },
    // Q-015: the idle label in the current language; while listening, the next tick says it
    refresh() { if (!button.classList.contains('is-listening')) label.textContent = copy.talk; },
  };
}
