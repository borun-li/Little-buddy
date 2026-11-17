// The three memory files as plain text, no disk (03 DES-031): 关于你.md, 日志.md, profile.json.
import { hanCount, weight } from './lang.js';
import { cleanName } from './name.js';
import { PROFILE_REGIONS } from './region.js';

/** @typedef {'pleasant-high'|'pleasant-low'|'unpleasant-high'|'unpleasant-low'|'neutral'} Mood */
/** @typedef {{date: string, mood: Mood, point: string|null, line: number}} Entry   // line = index in lines[] */
/** @typedef {{add: {busy: string[], people: string[], likes: string[]}}} NotesUpdate   // add-only: the model never removes lines */

export const SECTIONS = [{ title: '最近在忙', key: 'busy' }, { title: '在意的人和事', key: 'people' }, { title: '喜欢·不喜欢', key: 'likes' }];
export const ABOUT_TEMPLATE = `# 关于你\n\n${SECTIONS.map((s) => `## ${s.title}\n`).join('\n')}`;
export const DIARY_HEADER = '# 日志';
export const MOOD_WORD = { 'pleasant-high': '开心', 'pleasant-low': '平静', neutral: '平常', 'unpleasant-high': '紧张', 'unpleasant-low': '难过' };
export const MOOD_VALUE = { 'pleasant-high': 1, 'pleasant-low': 0.5, neutral: 0, 'unpleasant-high': -0.5, 'unpleasant-low': -1 };
export const PROFILE_DEFAULTS = Object.freeze({ name: null, region: null, memoryOn: true, noticeSeen: false });
export const PROFILE_VERSION = 1;
export const DIARY_RE = { date: /^##\s+(\d{4}-\d{2}-\d{2})\s*$/, entry: /^-\s+(开心|平静|平常|紧张|难过)(?:\s+·\s+(.+?))?\s*$/ };

const MOOD_OF_WORD = Object.fromEntries(Object.entries(MOOD_WORD).map(([mood, word]) => [word, mood]));
const HEADING = /^#{1,6}\s/;
const SECTION_TITLE = /^##\s+(.+?)\s*$/;

// profile.json that is not a JSON object; memory-store turns it into "unreadable" (DES-032).
export class UnreadableFile extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnreadableFile';
  }
}

// Empty = no line that is non-blank and does not start with '#' (the only empty rule; contract aboutEmpty).
export function isAboutEmpty(text) {
  return text.split('\n').every((l) => l.trim() === '' || l.startsWith('#'));
}

// The part of 关于你 that prompts read: the longest code-point prefix within the weight budget, cut back to a line end.
export function notesWithin(text, budget) {
  if (weight(text) <= budget) return { text, cut: false };
  let used = 0;
  let end = 0;
  for (const c of text) {
    used += c.length + 1.5 * hanCount(c);
    if (used > budget) break;
    end += c.length;
  }
  const prefix = text.slice(0, end);
  const nl = prefix.lastIndexOf('\n');
  return { text: nl === -1 ? prefix : prefix.slice(0, nl), cut: true };
}

const strip = (s) => s.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ');
const hanOnly = (s) => strip(s).replace(/\s+/g, '');
const words = (s) => strip(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !/\p{Script=Han}/u.test(w));

// A33: s copies line when they share >= 12 consecutive Han characters or >= 8 consecutive English words
// (punctuation removed, case ignored).
export function verbatim(s, line) {
  const a = [...hanOnly(s)];
  const b = hanOnly(line);
  for (let i = 0; i + 12 <= a.length; i++) {
    const run = a.slice(i, i + 12);
    if (run.every((c) => /\p{Script=Han}/u.test(c)) && b.includes(run.join(''))) return true;
  }
  const w = words(s);
  const lineWords = ` ${words(line).join(' ')} `;
  for (let i = 0; i + 8 <= w.length; i++) {
    if (lineWords.includes(` ${w.slice(i, i + 8).join(' ')} `)) return true;
  }
  return false;
}

// One line: whitespace runs -> ' ', trimmed, leading markdown markers removed, cut to max code points.
export function cleanLine(s, max) {
  const one = String(s).replace(/\s+/g, ' ').trim().replace(/^[#>*\-\s]+/, '');
  return [...one].slice(0, max).join('').trim();
}

// Add-only update: new lines cleaned, empties and lines already in the section dropped; 最近在忙 lines go right under
// the heading (newest first), the other two at the end of their section; a missing section is appended. Nothing is removed.
export function applyNotes(text, upd, cfg) {
  const lines = text.split('\n');
  const start = (title) => lines.findIndex((l) => SECTION_TITLE.exec(l)?.[1] === title);
  const endOf = (from) => {
    let i = from + 1;
    while (i < lines.length && !HEADING.test(lines[i])) i += 1;
    while (i > from + 1 && lines[i - 1].trim() === '') i -= 1;
    return i;
  };
  let changed = false;
  for (const { title, key } of SECTIONS) {
    const s = start(title);
    const have = new Set(s === -1 ? [] : lines.slice(s + 1, endOf(s)).map((l) => cleanLine(l, cfg.lineChars)));
    const adds = [];
    for (const raw of upd.add?.[key] ?? []) {
      const t = cleanLine(raw, cfg.lineChars);
      if (t && !have.has(t)) {
        have.add(t);
        adds.push(`- ${t}`);
      }
    }
    if (!adds.length) continue;
    changed = true;
    if (s === -1) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', `## ${title}`, ...adds, '');
    } else {
      lines.splice(key === 'busy' ? s + 1 : endOf(s), 0, ...adds);
    }
  }
  return changed ? lines.join('\n') : text;
}

export function parseDiary(text) {
  const lines = text.split('\n');
  const entries = [];
  let date = null;
  let lastDate = null;
  lines.forEach((l, i) => {
    const d = DIARY_RE.date.exec(l);
    if (d) {
      date = d[1];
      lastDate = date;
      return;
    }
    const e = date === null ? null : DIARY_RE.entry.exec(l);
    if (e) entries.push({ date, mood: MOOD_OF_WORD[e[1]], point: e[2] ?? null, line: i });
  });
  return { lines, entries, lastDate };
}

export function diaryLine(mood, point) {
  return point ? `- ${MOOD_WORD[mood]} · ${point}` : `- ${MOOD_WORD[mood]}`;
}

// Appends a mood-only line under today's section (a new section when the date changed); returns a new array.
export function appendMood(lines, lastDate, date, mood) {
  const out = [...lines];
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  if (!out.length) out.push(DIARY_HEADER);
  if (lastDate !== date) out.push('', `## ${date}`);
  const line = out.length;
  out.push(diaryLine(mood, null), '');
  return { lines: out, line };
}

const pad = (n) => String(n).padStart(2, '0');
export function localDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayValue(moods) {
  if (!moods.length) return null;
  return moods.reduce((n, m) => n + MOOD_VALUE[m], 0) / moods.length;
}

// Today and the 6 days before, oldest first; entries of a day in file order.
export function weekOf(entries, today) {
  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push({ mood: e.mood, point: e.point });
  }
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    const list = byDate.get(date) ?? [];
    days.push({ date, value: dayValue(list.map((e) => e.mood)), entries: list });
  }
  return days;
}

const KNOWN = new Set(['version', ...Object.keys(PROFILE_DEFAULTS)]);

// Wrong types fall back to the defaults; unknown keys are kept in extra and written back (R-10).
export function parseProfile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) throw new UnreadableFile('profile.json is not JSON');
    throw err;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new UnreadableFile('profile.json is not a JSON object');
  const profile = {
    name: cleanName(data.name),
    region: PROFILE_REGIONS.includes(data.region) ? data.region : null,
    memoryOn: typeof data.memoryOn === 'boolean' ? data.memoryOn : PROFILE_DEFAULTS.memoryOn,
    noticeSeen: typeof data.noticeSeen === 'boolean' ? data.noticeSeen : PROFILE_DEFAULTS.noticeSeen,
  };
  const extra = Object.fromEntries(Object.entries(data).filter(([k]) => !KNOWN.has(k)));
  return { profile, extra };
}

export function profileText(p, extra) {
  return `${JSON.stringify({ ...extra, version: PROFILE_VERSION, ...p }, null, 2)}\n`;
}
