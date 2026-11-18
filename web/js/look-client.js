// R2: the ONE replaceable data layer for the companion's look, voice and growth (REQ-007 shape, like
// companion-client.js and memory-client.js). PROTOTYPE: fake data, choices kept in localStorage. The Full run swaps this
// file for the real calls C-013 (voice + preview), C-014 (look) and C-015 (growth); look-ui.js and app.js keep working.
//   getLook()            -> { character: 1|2|3, outfit: { head, clothes, shoes, accessory } }   slot value 'none' | 1..3; default = character 1, nothing worn (A14)
//   setLook(patch)       -> the new look; patch = { character } and/or { outfit: { <slot>: value } }; rejects .code 'not_saved' (old look kept)
//   getVoice()           -> voice id (default 'serena');  setVoice(id) -> id, rejects 'not_saved'
//   preview(id, {text, lang, signal}) -> resolves when the sample has played; abort -> AbortError; a missing sample rejects .code 'missing'
//                          (R2 Q-058: plays audio/voices/<id>-<zh|en>.wav, made by tools/make-voice-samples.mjs; without an Audio
//                          element (node) it is a 1.4 s pretend play)
//   getGrowth()          -> { days, stage, into, span, left }   stage 1 = 0-2 days, 2 = 3-6, 3 = 7+ (A4); left = days to the next stage (0 at stage 3)
//   setDemoDays(n)       -> growth of n days (demo only, whole 0-365, removed with C-015); rejects 'bad_request' or 'not_saved'
//   claimStageUp(stage)  -> the stage whose moment was last shown (null = never asked before) and remembers `stage` from now on.
//                          Q-062: the page plays the stage-up only when the result is a lower stage (once per stage, not on refresh).
//                          A refused write is silent (the moment may then show again at the next open).
// Every failure rejects with an Error whose .code is one of CODES.
export const SLOTS = ['head', 'clothes', 'shoes', 'accessory'];
export const CHARACTERS = [1, 2, 3];
export const ITEMS = [1, 2, 3];
export const VOICES = ['serena', 'vivian', 'uncle-fu', 'dylan', 'eric', 'ryan', 'aiden', 'ono-anna', 'sohee'];
export const DEMO_MAX = 365;
export const CODES = ['not_saved', 'bad_request', 'missing'];
export const LOOK_KEY = 'companion.look';
export const VOICE_KEY = 'companion.voice';
export const DAYS_KEY = 'companion.demoDays';
export const SEEN_KEY = 'companion.stageSeen';
export const PREVIEW_MS = 1400;
export const sampleUrl = (id, lang) => `audio/voices/${id}-${String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en'}.wav`;

const codeError = (code) => Object.assign(new Error(code), { code });
const DEFAULT_LOOK = () => ({ character: 1, outfit: { head: 'none', clothes: 'none', shoes: 'none', accessory: 'none' } });

// the same rule the later service applies: stage 1 counts 3 days, stage 2 counts 4, stage 3 stays full
export function growthOf(days) {
  const d = Number.isInteger(days) && days >= 0 ? days : 0;
  if (d < 3) return { days: d, stage: 1, into: d, span: 3, left: 3 - d };
  if (d < 7) return { days: d, stage: 2, into: d - 3, span: 4, left: 7 - d };
  return { days: d, stage: 3, into: 1, span: 1, left: 0 };
}

// An unreadable or odd saved value falls back to the default, silently (A14).
function cleanLook(raw) {
  const out = DEFAULT_LOOK();
  if (CHARACTERS.includes(raw?.character)) out.character = raw.character;
  for (const s of SLOTS) if (ITEMS.includes(raw?.outfit?.[s])) out.outfit[s] = raw.outfit[s];
  return out;
}

export function createLookClient({ storage, createAudio = typeof Audio === 'function' ? () => new Audio() : null, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  const read = (key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage.setItem(key, value); } catch { throw codeError('not_saved'); } }; // missing storage throws too

  let look = null; let voice = null; let days = null; // storage is read once; a failed write leaves these as they were
  const load = () => {
    if (look) return;
    try { look = cleanLook(JSON.parse(read(LOOK_KEY))); } catch { look = DEFAULT_LOOK(); }
    const v = read(VOICE_KEY); voice = VOICES.includes(v) ? v : 'serena';
    const n = Number(read(DAYS_KEY)); days = Number.isInteger(n) && n >= 0 && n <= DEMO_MAX ? n : 0;
  };

  return {
    async getLook() { load(); return structuredClone(look); },
    async setLook(patch) {
      load();
      const next = cleanLook({ character: patch?.character ?? look.character, outfit: { ...look.outfit, ...patch?.outfit } });
      write(LOOK_KEY, JSON.stringify(next));
      look = next;
      return structuredClone(look);
    },
    async getVoice() { load(); return voice; },
    async setVoice(id) {
      load();
      if (!VOICES.includes(id)) throw codeError('bad_request');
      write(VOICE_KEY, id);
      voice = id;
      return voice;
    },
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
    async getGrowth() { load(); return growthOf(days); },
    async setDemoDays(n) {
      load();
      if (!Number.isInteger(n) || n < 0 || n > DEMO_MAX) throw codeError('bad_request');
      write(DAYS_KEY, String(n));
      // DFB-004 (user, UI stop: prototype only): a fall in days forgets the remembered stage above the new one, so raising them
      // again replays the stage-up moment. Real days never go down; this leaves with the demo field (C-015).
      if (n < days) {
        const seen = Number(read(SEEN_KEY));
        if (Number.isInteger(seen) && seen > growthOf(n).stage) { try { storage.setItem(SEEN_KEY, String(growthOf(n).stage)); } catch { /* silent */ } }
      }
      days = n;
      return growthOf(days);
    },
    async claimStageUp(stage) {
      const n = Number(read(SEEN_KEY));
      const seen = read(SEEN_KEY) !== null && [1, 2, 3].includes(n) ? n : null;
      if (seen === null || stage > seen) { try { storage.setItem(SEEN_KEY, String(stage)); } catch { /* silent */ } }
      return seen;
    },
  };
}

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
export const look = createLookClient({ storage });
