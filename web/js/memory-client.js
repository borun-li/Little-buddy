// R1: the ONE replaceable data layer for memory, mood diary and local profile (REQ-007 shape, like
// companion-client.js). FAKE until the backend seam is designed (contracts/FRONTEND_BACKEND_CONTRACT.md § R1 seam):
// state lives in this page only, the name stays in localStorage `companion.name` through app.js.
// app.js is the only importer. Replacing this file by fetches to the real routes changes nothing else.
//
// Shape (provisional, fe-engineer #1, to be re-copied from be-architect's DES):
//   getProfile()  -> { readable, memoryOn, noticeSeen, region ('CN'|'US'|'other'|null), systemRegion, path, about (markdown), kept }
//   getDiary()    -> { memoryOn, hasAny, days: 7 x { date 'YYYY-MM-DD' (local), entries: [{ mood, point|null }] } oldest first, today last }
//   acknowledgeNotice(), setMemory(on), setName(cleaned|null), setRegion('CN'|'US'|'other'), forget()
// Every call may reject with an Error whose .code is 'unavailable' | 'failed' (codes TBD by be-architect).
// Fake switches, read from the page address `?mem=a,b`: empty (nothing kept), seen (notice answered),
// off (memory off), unreadable (files unreadable), slow (1.5 s answers), failsave (every write fails).

export const MEMORY_PATH = '~/Library/Application Support/LittleBuddy/';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

const ABOUT_SEED = ['# 关于你', '', '## 最近在忙', '- 准备实习面试，有点紧张', '', '## 在意的人和事', '- 家里的猫豆豆这两天不太爱吃饭', '', '## 喜欢·不喜欢', ''].join('\n');
// days back from today -> turns in file order
const DIARY_SEED = {
  0: [['unpleasant-low', '聊了实习面试的紧张'], ['pleasant-high', '模拟面试不错']],
  1: [['pleasant-high', '模拟面试顺利'], ['unpleasant-low', '下雨鞋湿了'], ['neutral', null], ['pleasant-high', '妹妹周末要来']],
  2: [['neutral', '整理了一下课表']],
  4: [['pleasant-low', '午后晒太阳'], ['pleasant-low', null]],
  5: [['unpleasant-high', '作业赶不完']],
};

function fail(code) { return Object.assign(new Error(code), { code }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMemoryClient({ flags = '', now = () => new Date(), delay = 120 } = {}) {
  const f = new Set(String(flags).split(',').map((s) => s.trim()).filter(Boolean));
  const ms = f.has('slow') ? 1500 : delay;
  const state = {
    memoryOn: !f.has('off'),
    noticeSeen: f.has('seen') || f.has('off'),
    region: null,
    about: f.has('empty') ? '' : ABOUT_SEED,
    log: [], // { date, mood, point }
  };
  if (!f.has('empty')) {
    for (const [back, turns] of Object.entries(DIARY_SEED)) {
      const d = now(); d.setDate(d.getDate() - Number(back));
      turns.forEach(([mood, point]) => state.log.push({ date: dayKey(d), mood, point }));
    }
  }
  const aboutEmpty = () => !state.about.split('\n').some((l) => l.trim() && !/^#/.test(l.trim()));
  const kept = () => !aboutEmpty() || state.log.length > 0;
  const read = async () => { await wait(ms); if (f.has('unreadable')) throw fail('unavailable'); };
  const write = async () => { await wait(ms); if (f.has('failsave')) throw fail('failed'); };

  return {
    async getProfile() {
      await wait(ms);
      return {
        readable: !f.has('unreadable'), memoryOn: state.memoryOn, noticeSeen: state.noticeSeen,
        region: state.region, systemRegion: 'CN', path: MEMORY_PATH, about: state.about, kept: kept(),
      };
    },
    async getDiary() {
      await read();
      const days = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = now(); d.setDate(d.getDate() - i);
        const key = dayKey(d);
        days.push({ date: key, entries: state.log.filter((e) => e.date === key).map(({ mood, point }) => ({ mood, point })) });
      }
      return clone({ memoryOn: state.memoryOn, hasAny: state.log.length > 0, days });
    },
    async acknowledgeNotice() { await write(); state.noticeSeen = true; },
    async setMemory(on) { await write(); state.memoryOn = Boolean(on); if (!on) state.noticeSeen = true; return { memoryOn: state.memoryOn }; },
    async setName() { await write(); }, // the name itself is kept by app.js (localStorage) until the real seam
    async setRegion(region) { await write(); state.region = region; },
    async forget() { await write(); state.about = ''; state.log = []; return { memoryOn: state.memoryOn }; },
  };
}

// The page's instance; the fake reads its switches from the address (a real layer will not).
const flags = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('mem') ?? '' : '';
export const memory = createMemoryClient({ flags });
