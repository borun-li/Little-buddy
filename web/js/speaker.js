// Q-025 / DES-025 / FLOW-013: read a reply aloud, part by part. DOM-free: audio element, URL helpers and
// speak() are injected. Failure is silence: no hint, no throw; text and mood never wait for any of this.
// say(speech, lang): stop what is reading, ask for part 1 at once, ask for part n+1 as soon as part n has
// arrived (one part ahead, no more), play parts in order. stop(): pause, revoke, abort the request in
// flight, drop the rest. A failed part ends that reading (a gap would break the sentence meaning).
// unlock(): play a silent clip once from a user gesture, so a browser that wants a gesture lets the later
// play() through [unverified for Safari]. A refused play() is a silent failure.

// 44-byte header + 240 samples (10 ms at 24 kHz) of silence, mono 16-bit.
export function silentWav(samples = 240) {
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, samples * 2, true);
  return new Uint8Array(buf);
}

export function createSpeaker({
  speak,
  createAudio = () => new Audio(),
  url = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
  makeBlob = (bytes) => new Blob([bytes], { type: 'audio/wav' }),
  isEnabled = () => true,
  onActive = () => {}, // Q-026: true when a reading starts, false when it ends or is stopped (the toggle's "speaking")
} = {}) {
  let audio = null;
  let run = null; // { ctrl, release } of the reading in progress
  let current = null; // the object URL on the element
  let unlocked = false;
  const el = () => (audio ??= createAudio());
  let lastActive = false;
  function notify() {
    const a = run !== null;
    if (a !== lastActive) { lastActive = a; onActive(a); }
  }

  function drop() { // forget the element's source
    if (current) { url.revoke(current); current = null; }
  }

  // Plays one blob to its end. Resolves true when it ended, false when it was refused, failed or stopped.
  function play(blob, r) {
    return new Promise((resolve) => {
      const a = el();
      drop();
      current = url.create(blob);
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        a.onended = null; a.onerror = null;
        if (r.release === finish) r.release = null;
        drop();
        resolve(ok);
      };
      r.release = finish;
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      a.src = current;
      let p;
      try { p = a.play(); } catch { finish(false); return; }
      if (p && typeof p.catch === 'function') p.catch(() => finish(false));
    });
  }

  async function reading(r, parts, lang) {
    const ask = (i) => speak(parts[i], lang, r.ctrl.signal).then((b) => ({ b }), () => ({ b: null }));
    let next = ask(0);
    for (let i = 0; i < parts.length; i++) {
      const { b } = await next;
      if (r.stopped || !b) return;
      next = i + 1 < parts.length ? ask(i + 1) : null; // one part ahead, requested as soon as this one is here
      if (!(await play(b, r)) || r.stopped) return;
      if (!next) return;
    }
  }

  function stop() {
    const r = run;
    run = null;
    notify();
    if (!r) return;
    r.stopped = true;
    r.ctrl.abort();
    if (audio) { try { audio.pause(); } catch { /* nothing to pause */ } }
    if (r.release) r.release(false);
    drop();
  }

  return {
    get active() { return run !== null; },
    say(speech, lang) {
      stop();
      if (!isEnabled() || !Array.isArray(speech)) return Promise.resolve();
      const parts = speech.filter((p) => typeof p === 'string' && p.trim());
      if (!parts.length) return Promise.resolve();
      const r = { ctrl: new AbortController(), stopped: false, release: null };
      run = r;
      notify();
      return reading(r, parts, lang).catch(() => {}).finally(() => { if (run === r) { run = null; notify(); } });
    },
    stop,
    // Once, from a user gesture, never while a reading runs.
    unlock() {
      if (unlocked || run) return;
      unlocked = true;
      try {
        const a = el();
        const u = url.create(makeBlob(silentWav()));
        a.src = u;
        const p = a.play();
        const cleanup = () => url.revoke(u);
        if (p && typeof p.then === 'function') p.then(cleanup, cleanup); else cleanup();
      } catch { /* a refused unlock is silent */ }
    },
  };
}
