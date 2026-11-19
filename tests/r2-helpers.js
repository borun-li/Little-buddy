// Shared helpers for tests/r2-*.test.js (not a test file). be-tester #1, R2 Full (backend). Plan: docs/backend/04-test-plan.md.
// Every gateway is the real server/main.js (tests/memory-helpers.js startGateway): own temp LITTLEBUDDY_DATA_DIR, free ports >= 4450,
// Bonsai / STT / TTS = the doubles of tests/support. TTS_VOICE is removed from this process so no child inherits it (REQ-073: tests do not set it).
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, fx, seed, startGateway, tmpDir, waitFor } from './memory-helpers.js';

delete process.env.TTS_VOICE;

export * from './memory-helpers.js';
export { imp, shellWrapper, withEnv } from './server-helpers.js';
export const NY = { tz: 'America/New_York' };
export const NOON = (day) => `${day}T12:00:00-05:00`; // 2026-11-18 is standard time in New York
export const VOICES = ['ryan', 'aiden', 'ono-anna', 'sohee', 'eric', 'dylan', 'serena', 'vivian', 'uncle-fu'];
export const R1_PROFILE = '{\n  "version": 1,\n  "name": "团子",\n  "region": "CN",\n  "memoryOn": true,\n  "noticeSeen": true\n}\n';
export const DEFAULT_LOOK = { character: 1, outfit: { head: 'none', clothes: 'none', shoes: 'none', accessory: 'none' } };

// a fixture case by id, from the approved files (input and expected side by side)
export function fcase(fxId, caseId) {
  const f = fx(fxId);
  const input = f.input.cases.find((c) => c.id === caseId);
  const expected = f.expected.cases.find((c) => c.id === caseId);
  if (!input || !expected) throw new Error(`${fxId} has no case ${caseId}`);
  return { f, input, expected };
}

export const fileState = (path) => (existsSync(path) ? { bytes: readFileSync(path).toString('base64'), mode: statSync(path).mode & 0o777 } : null);
export const profileJson = (dir) => JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
export const getProfile = (gw) => api(gw.base, '/api/profile');
export const postProfile = (gw, body) => api(gw.base, '/api/profile', { method: 'POST', body });
export const say = (gw, line, history = []) => api(gw.base, '/api/respond', { method: 'POST', body: { line, history } });
export const speak = (gw, text, lang, extra = {}) => fetch(`${gw.base}/api/speak`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang, ...extra }), signal: AbortSignal.timeout(30000),
}).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), body: Buffer.from(await r.arrayBuffer()) }));

// a gateway whose TTS double logs to a file (DES-040 line protocol: argv and every request line with its voice)
export async function ttsGateway({ dir, files, env = {}, clock = null, tz = null, script = { replies: [{ reply: '好的，我在听。' }] } }) {
  if (files) seed(dir, files);
  const log = join(tmpDir('lb-ttslog-'), 'tts.jsonl');
  writeFileSync(log, '');
  const gw = await startGateway({ dir, env: { FAKE_TTS_LOG: log, ...env }, clock, tz, script });
  await gw.ready();
  await waitFor(async () => (await api(gw.base, '/api/health')).json?.tts === 'ready', 20000, 'tts ready');
  gw.ttsLog = () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  gw.argvs = () => gw.ttsLog().filter((e) => e.argv).map((e) => e.argv);
  gw.lines = () => gw.ttsLog().filter((e) => e.req).map((e) => e.req);
  gw.done = () => gw.logs().filter((l) => l.event === 'tts_done');
  return gw;
}
export const argAt = (argv, flag) => argv[argv.indexOf(flag) + 1];

// ---- the 071 table, written here independently of server code
export function growthTable(days) {
  if (days < 3) return { days, stage: 1, into: days, span: 3, left: 3 - days };
  if (days < 7) return { days, stage: 2, into: days - 3, span: 4, left: 4 - (days - 3) };
  return { days, stage: 3, into: 1, span: 1, left: 0 };
}

// ---- diaries
export const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
export const diaryOfDates = (dates) => `# 日志\n\n${dates.map((d) => `## ${d}\n- 平常\n`).join('\n')}`;
export const lastNDays = (n, endDay = '2026-11-17') => { // n consecutive dates ending at endDay
  const end = Date.UTC(+endDay.slice(0, 4), +endDay.slice(5, 7) - 1, +endDay.slice(8, 10));
  return Array.from({ length: n }, (_, i) => fmtDate(end - (n - 1 - i) * 86400000));
};
// FX-030-08 generator, exactly as its input.json describes it (dates 2025-11-19..2026-11-18, 100 lines each)
export function generated36500() {
  const lines = ['# 日志'];
  for (let t = Date.UTC(2025, 10, 19); t <= Date.UTC(2026, 10, 18); t += 86400000) {
    lines.push('', `## ${fmtDate(t)}`);
    for (let k = 0; k < 100; k++) lines.push(`- ${['开心', '平静', '平常', '紧张', '难过'][k % 5]} · 第${k + 1}条`);
  }
  return `${lines.join('\n')}\n`;
}
// distinct dates with >= 1 mood line, by the test's own reader (tests/memory-helpers.js diaryEntries)
export const datesOf = (text, diaryEntries) => new Set(diaryEntries(text).map((e) => e.date));
