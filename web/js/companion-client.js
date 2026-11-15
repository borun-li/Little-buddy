// The one replaceable data layer (REQ-007), real since Q-010. Seam: contracts/FRONTEND_BACKEND_CONTRACT.md
// "Seam for run companion-full-dev", docs/backend/03-detailed-design.md DES-013.
//   respond(line, history) -> Promise<{ reply, mood }>   POST /api/respond, aborted at 16 s
//   transcribe(audio)      -> Promise<{ text }>          POST /api/transcribe, aborted at 13 s (Q-014 sends audio)
//   health()               -> Promise<{ ready, stt, bonsai }>   GET /api/health (Q-012 polls it)
// Every failure rejects with an Error whose .code is one of CODES. app.js is the only importer.

export const CODES = ['not_ready', 'unavailable', 'timeout', 'failed', 'bad_request', 'too_large'];
export const MOODS = ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral'];
export const RESPOND_TIMEOUT_MS = 16000;
export const TRANSCRIBE_TIMEOUT_MS = 13000;
export const HEALTH_TIMEOUT_MS = 5000;
export const HISTORY_MAX = 40;

const codeError = (code) => Object.assign(new Error(code), { code });

// fetchImpl and timers are injectable so tests need no network and no real clock.
export function createClient({ fetch: fetchImpl, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  // arrow wrappers: the browser throws "Illegal invocation" for window.setTimeout called with another this
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  async function call(path, init, limitMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, limitMs);
    try {
      let res;
      try {
        res = await doFetch(path, { ...init, signal: controller.signal });
      } catch {
        throw codeError(timedOut ? 'timeout' : 'unavailable');
      }
      let body = null;
      try {
        body = await res.json();
      } catch {
        if (timedOut) throw codeError('timeout');
        if (res.ok) throw codeError('failed');
      }
      if (!res.ok) throw codeError(CODES.includes(body?.error) ? body.error : 'failed');
      return body;
    } finally {
      timers.clearTimeout(timer);
    }
  }

  return {
    async respond(line, history = []) {
      const entries = history.slice(-HISTORY_MAX).map(({ role, text }) => ({ role, text }));
      const body = await call('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line, history: entries }), // never the interface language (DES-015)
      }, RESPOND_TIMEOUT_MS);
      if (typeof body?.reply !== 'string' || !body.reply.trim()) throw codeError('failed');
      return { reply: body.reply, mood: MOODS.includes(body.mood) ? body.mood : 'neutral' };
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
      return { ready: body?.ready === true, stt: body?.stt, bonsai: body?.bonsai };
    },
  };
}

const client = createClient();
export const respond = (line, history) => client.respond(line, history);
export const transcribe = (audio) => client.transcribe(audio);
export const health = () => client.health();
