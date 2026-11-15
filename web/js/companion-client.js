// The one replaceable data layer (REQ-007), real since Q-010. Seam: contracts/FRONTEND_BACKEND_CONTRACT.md
// "Seam for run companion-full-dev", docs/backend/03-detailed-design.md DES-013.
//   respond(line, history, name) -> Promise<{ reply, mood, lang, crisis, region, speech }>   POST /api/respond, aborted at 16 s (Q-020; name null/absent is left out)
//   speak(text, lang, signal) -> Promise<Blob audio/wav>   POST /api/speak, aborted at 11 s -> timeout; a caller's abort stays the AbortError

//   transcribe(audio)      -> Promise<{ text }>          POST /api/transcribe, aborted at 13 s (Q-014 sends audio)
//   health()               -> Promise<{ ready, stt, bonsai, tts }>   GET /api/health (Q-012 polls it)
// Every failure rejects with an Error whose .code is one of CODES. app.js is the only importer.

export const CODES = ['not_ready', 'unavailable', 'timeout', 'failed', 'bad_request', 'too_large'];
export const MOODS = ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral'];
export const RESPOND_TIMEOUT_MS = 16000;
export const TRANSCRIBE_TIMEOUT_MS = 13000;
export const SPEAK_TIMEOUT_MS = 11000;
export const HEALTH_TIMEOUT_MS = 5000;
export const HISTORY_MAX = 40;

const codeError = (code) => Object.assign(new Error(code), { code });

// fetchImpl and timers are injectable so tests need no network and no real clock.
export function createClient({ fetch: fetchImpl, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  // arrow wrappers: the browser throws "Illegal invocation" for window.setTimeout called with another this
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  // parse: 'json' (default) or 'blob' (a 2xx body is audio; a non-2xx body is still {error}).
  // callerSignal: a caller's abort rejects with the fetch's own AbortError, not a code.
  async function call(path, init, limitMs, { parse = 'json', callerSignal } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const onCaller = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCaller, { once: true });
    }
    const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, limitMs);
    try {
      let res;
      try {
        res = await doFetch(path, { ...init, signal: controller.signal });
      } catch (err) {
        if (timedOut) throw codeError('timeout');
        if (callerSignal?.aborted) throw err?.name === 'AbortError' ? err : Object.assign(new Error('aborted'), { name: 'AbortError' });
        throw codeError('unavailable');
      }
      let body = null;
      try {
        body = parse === 'blob' && res.ok ? await res.blob() : await res.json();
      } catch (err) {
        if (timedOut) throw codeError('timeout');
        if (callerSignal?.aborted) throw err?.name === 'AbortError' ? err : Object.assign(new Error('aborted'), { name: 'AbortError' });
        if (res.ok) throw codeError('failed');
      }
      if (!res.ok) throw codeError(CODES.includes(body?.error) ? body.error : 'failed');
      return body;
    } finally {
      timers.clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCaller);
    }
  }

  return {
    async respond(line, history = [], name = null) {
      const entries = history.slice(-HISTORY_MAX).map(({ role, text }) => ({ role, text }));
      const body = await call('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeof name === 'string' ? { line, history: entries, name } : { line, history: entries }), // never the interface language (DES-015)
      }, RESPOND_TIMEOUT_MS);
      if (typeof body?.reply !== 'string' || !body.reply.trim()) throw codeError('failed');
      return {
        reply: body.reply,
        mood: MOODS.includes(body.mood) ? body.mood : 'neutral',
        lang: body.lang, // as given; the page never guesses it
        crisis: body.crisis === true,
        region: body.region === 'CN' || body.region === 'US' ? body.region : null, // R0: help-line region; else the international lines
        speech: Array.isArray(body.speech) ? body.speech.filter((t) => typeof t === 'string') : [],
      };
    },
    async speak(text, lang, signal) {
      const blob = await call('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      }, SPEAK_TIMEOUT_MS, { parse: 'blob', callerSignal: signal });
      if (!blob || typeof blob.size !== 'number' || blob.size === 0) throw codeError('failed');
      return blob;
    },
    async transcribe(audio) {
      const body = await call('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: audio,
      }, TRANSCRIBE_TIMEOUT_MS);
      if (typeof body?.text !== 'string') throw codeError('failed');
      return { text: body.text };
    },
    async health() {
      const body = await call('/api/health', { method: 'GET' }, HEALTH_TIMEOUT_MS);
      return { ready: body?.ready === true, stt: body?.stt, bonsai: body?.bonsai, tts: body?.tts };
    },
  };
}

const client = createClient();
export const respond = (line, history, name) => client.respond(line, history, name);
export const speak = (text, lang, signal) => client.speak(text, lang, signal);
export const transcribe = (audio) => client.transcribe(audio);
export const health = () => client.health();
