// R2: the ONE replaceable data layer for the companion's look, voice and growth (REQ-007 shape, like companion-client.js and
// memory-client.js). Real since Q-073 / DES-047. Seam: contracts/FRONTEND_BACKEND_CONTRACT.md § R2 seam (C-013..C-015).
//   getLook()      GET  /api/profile .look   -> { character: 1|2|3, outfit: { head, clothes, shoes, accessory } }   slot value 'none' | 1..3
//   getVoice()     GET  /api/profile .voice  -> one of VOICES (the service's default is serena)
//   getGrowth()    GET  /api/profile .growth -> { days, stage, into, span, left }   computed by the service from the diary, never here
//   getMemory()    GET  /api/profile .memoryOn/.readable -> { memoryOn, readable }   FND-065: 成长 says days are not counted while off;
//                    unreadable files give memoryOn false and readable false (then nothing under the bar)
//   setLook(patch) POST /api/profile { look: patch } -> the saved look; patch = { character } and/or { outfit: { <slot>: value } }
//   setVoice(id)   POST /api/profile { voice: id }   -> the saved voice; the next part read aloud uses it (the service decides)
//   preview(id, {lang, signal}) -> resolves when the offline sample audio/voices/<id>-<zh|en>.wav has played (Q-058, made by
//                    tools/make-voice-samples.mjs); abort -> AbortError; a sample that does not load rejects .code 'missing';
//                    without an Audio element (node) it is a 1.4 s pretend play
// The three reads made at the same moment share one GET. The stage-up trigger is respond()'s growth.up (DES-048), nothing here.
// Every failure rejects with an Error whose .code is one of CODES: the body's code, 'unavailable' (no answer) or 'failed' (bad body).
export const SLOTS = ['head', 'clothes', 'shoes', 'accessory'];
export const CHARACTERS = [1, 2, 3];
export const ITEMS = [1, 2, 3];
export const VOICES = ['serena', 'vivian', 'uncle-fu', 'dylan', 'eric', 'ryan', 'aiden', 'ono-anna', 'sohee'];
export const CODES = ['unreadable', 'not_saved', 'bad_request', 'too_large', 'forbidden', 'unavailable', 'failed', 'missing'];
export const LOOK_TIMEOUT_MS = 8000;
export const PREVIEW_MS = 1400;
export const sampleUrl = (id, lang) => `audio/voices/${id}-${String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en'}.wav`;

const codeError = (code) => Object.assign(new Error(code), { code });

// A body that is not the seam's shape is 'failed' (the page keeps what it shows).
function cleanLook(raw) {
  if (!CHARACTERS.includes(raw?.character)) throw codeError('failed');
  const outfit = {};
  for (const s of SLOTS) {
    const v = raw.outfit?.[s];
    if (v !== 'none' && !ITEMS.includes(v)) throw codeError('failed');
    outfit[s] = v;
  }
  return { character: raw.character, outfit };
}
const cleanVoice = (v) => { if (!VOICES.includes(v)) throw codeError('failed'); return v; };
const whole = (v) => Number.isInteger(v) && v >= 0;
function cleanGrowth(g) {
  if (!g || !whole(g.days) || ![1, 2, 3].includes(g.stage) || !whole(g.into) || !whole(g.span) || !whole(g.left)) throw codeError('failed');
  return { days: g.days, stage: g.stage, into: g.into, span: g.span, left: g.left };
}

export function createLookClient({ fetch: fetchImpl, createAudio = typeof Audio === 'function' ? () => new Audio() : null, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  // arrow wrappers: window.setTimeout called as timers.setTimeout throws Illegal invocation in browsers
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  async function call(path, init) {
    const controller = new AbortController();
    const timer = timers.setTimeout(() => controller.abort(), LOOK_TIMEOUT_MS);
    try {
      let res;
      try { res = await doFetch(path, { ...init, signal: controller.signal }); } catch { throw codeError('unavailable'); }
      let body = null;
      try { body = await res.json(); } catch { if (res.ok) throw codeError('failed'); }
      if (!res.ok) throw codeError(CODES.includes(body?.error) ? body.error : 'failed');
      if (body === null || typeof body !== 'object') throw codeError('failed');
      return body;
    } finally { timers.clearTimeout(timer); }
  }
  let reading = null; // one GET for reads asked together (the page asks look, voice and growth at open and on each tab render)
  const profile = () => (reading ??= call('/api/profile', { method: 'GET' }).finally(() => { reading = null; }));
  const save = (payload) => call('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

  return {
    async getLook() { return cleanLook((await profile()).look); },
    async getVoice() { return cleanVoice((await profile()).voice); },
    async getGrowth() { return cleanGrowth((await profile()).growth); },
    async getMemory() { const p = await profile(); const readable = p.readable !== false; return { memoryOn: readable && p.memoryOn !== false, readable }; },
    async setLook(patch) { return cleanLook((await save({ look: patch })).look); },
    async setVoice(id) { return cleanVoice((await save({ voice: id })).voice); },
    preview(id, { lang, signal } = {}) {
      return new Promise((resolve, reject) => {
        if (!VOICES.includes(id)) { reject(codeError('missing')); return; }
        const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
        if (createAudio) {
          const audio = createAudio();
          const done = (fn, arg) => { signal?.removeEventListener('abort', abort); audio.onended = audio.onerror = null; fn(arg); };
          const abort = () => { audio.pause(); done(reject, aborted()); };
          if (signal?.aborted) { reject(aborted()); return; }
          signal?.addEventListener('abort', abort, { once: true });
          audio.onended = () => done(resolve);
          audio.onerror = () => done(reject, codeError('missing')); // 404 or an unreadable file
          audio.src = sampleUrl(id, lang);
          audio.play().catch((err) => done(reject, err?.name === 'AbortError' ? err : codeError('missing')));
          return;
        }
        const abort = () => { timers.clearTimeout(timer); reject(aborted()); };
        const timer = timers.setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, PREVIEW_MS);
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
  };
}

export const look = createLookClient();
