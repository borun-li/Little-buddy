// R1: the ONE replaceable data layer for memory, mood diary and local profile (REQ-007 shape, like
// companion-client.js). Real since Q-036 / DES-038. Seam: contracts/FRONTEND_BACKEND_CONTRACT.md § R1 seam.
//   getProfile()  GET  /api/profile -> { readable, memoryOn, noticeSeen, name|null, region|null, systemRegion|null, path, about,
//                                        aboutEmpty, kept, newProfile }   always 200; unreadable = fresh-start values
//   getDiary()    GET  /api/diary   -> { readable, memoryOn, hasAny, days: 7 x { date, value|null, entries: [{ mood, point|null }] } }
//                                        oldest first, today last; always 200
//   acknowledgeNotice()  POST /api/profile { noticeSeen: true }
//   setMemory(on)        POST /api/profile { memoryOn } (+ noticeSeen: true when off)  -> { memoryOn, noticeSeen, name, region }
//   setName(cleaned|null), setRegion('CN'|'US'|'other')   POST /api/profile
//   forget()             POST /api/forget {}  -> { memoryOn }
// Every failure rejects with an Error whose .code is one of CODES; app.js is the only importer.
// createMemoryClient({fetch, timers}) is injectable for tests; the page's instance is `memory`.

export const CODES = ['unreadable', 'not_saved', 'bad_request', 'too_large', 'forbidden', 'unavailable', 'failed'];
export const MEMORY_TIMEOUT_MS = 8000;

const codeError = (code) => Object.assign(new Error(code), { code });

export function createMemoryClient({ fetch: fetchImpl, timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) } } = {}) {
  // arrow wrappers: window.setTimeout called as timers.setTimeout throws Illegal invocation in browsers
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  async function call(path, init) {
    const controller = new AbortController();
    const timer = timers.setTimeout(() => controller.abort(), MEMORY_TIMEOUT_MS);
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
  const post = (path, payload) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const setProfile = (payload) => post('/api/profile', payload);

  return {
    getProfile: () => call('/api/profile', { method: 'GET' }),
    getDiary: () => call('/api/diary', { method: 'GET' }),
    acknowledgeNotice: () => setProfile({ noticeSeen: true }),
    setMemory: (on) => setProfile(on ? { memoryOn: true } : { memoryOn: false, noticeSeen: true }),
    setName: (cleaned) => setProfile({ name: cleaned ?? null }),
    setRegion: (region) => setProfile({ region }),
    forget: () => post('/api/forget', {}),
  };
}

export const memory = createMemoryClient();
