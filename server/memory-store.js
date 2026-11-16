// Memory storage (03 DES-032): start-up read (finishing an interrupted forget first), unreadable check, single-writer
// lock file, in-memory copy, one write lock, atomic writes, mood recording, update writes, forget me.
import { readFileSync, unlinkSync } from 'node:fs';
import { chmod, mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { CONFIG, displayPath } from './config.js';
import { ApiError } from './errors.js';
import { log } from './log.js';
import {
  ABOUT_TEMPLATE, appendMood, applyNotes, DIARY_HEADER, DIARY_RE, isAboutEmpty, notesWithin, parseDiary, parseProfile, PROFILE_DEFAULTS,
  profileText, UnreadableFile, weekOf,
} from './memory-files.js';

export const FILES = { about: '关于你.md', diary: '日志.md', profile: 'profile.json', lock: '.lock', forget: '.forget' };

export class FolderInUse extends Error {
  constructor(pid) {
    super(`memory folder in use by PID ${pid}`);
    this.name = 'FolderInUse';
    this.pid = pid;
  }
}

const EMPTY_DIARY = `${DIARY_HEADER}\n`;
const LOCK_TIMEOUT = Symbol('lock timeout');
const errCode = (err) => err?.code ?? null;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function unlinkIfThere(path) {
  try {
    await unlink(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export function createStore({ dir, cfg = CONFIG.memory, say = (t) => process.stderr.write(`${t}\n`) }) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw new TypeError('createStore needs an absolute dir');
  const shown = displayPath(dir);
  const at = (name) => join(dir, name);

  let writable = false;
  const unreadable = [];
  let generation = 0;
  let about = null; // file text; null = absent
  let diary = parseDiary(EMPTY_DIARY);
  let prof = { ...PROFILE_DEFAULTS };
  let extra = {};
  let profileExisted = false;
  let profileWritten = false;
  let cutSaid = false;

  // One writer at a time; waitMs bounds the wait (recordMood), after which the job never runs.
  let busy = false;
  const waiters = [];
  function acquire(waitMs) {
    if (!busy) {
      busy = true;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const w = { resolve, timer: null };
      if (Number.isFinite(waitMs)) {
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          resolve(false);
        }, waitMs);
      }
      waiters.push(w);
    });
  }
  function release() {
    const w = waiters.shift();
    if (!w) {
      busy = false;
      return;
    }
    clearTimeout(w.timer);
    w.resolve(true);
  }
  async function locked(fn, waitMs = Infinity) {
    if (!(await acquire(waitMs))) return LOCK_TIMEOUT;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async function syncDir() {
    const fh = await open(dir, 'r');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  async function writeNew(path, text) {
    const fh = await open(path, 'wx', 0o600);
    try {
      await fh.writeFile(text);
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  // Temp file 'wx' 0600, write, sync, rename over the file, folder fsync. On failure the temp file is removed and the error rethrown.
  async function writeAtomic(name, text) {
    const tmp = at(`.${name}.tmp`);
    try {
      await writeNew(tmp, text);
      await rename(tmp, at(name));
    } catch (err) {
      await unlinkIfThere(tmp).catch((e) => log('warn', 'memory_write_failed', { file: name, err_code: errCode(e), stage: 'tmp_cleanup' }));
      throw err;
    }
    await syncDir();
  }

  function readOnly(stage, err) {
    writable = false;
    log('warn', 'memory_lock', { ok: false, held_by: null, stage, err_code: errCode(err) });
    say(`记忆文件夹不能写，这次的改动都存不上 Memory folder is not writable; changes will not be saved this run: ${shown}`);
  }

  async function lockHolder() {
    const text = await readFile(at(FILES.lock), 'utf8');
    const pid = Number(text.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  function unlockOnExit() {
    try {
      if (readFileSync(at(FILES.lock), 'utf8').trim() === String(process.pid)) unlinkSync(at(FILES.lock));
    } catch (err) {
      if (err.code === 'ENOENT') return;
      // A lock left behind holds a dead PID, which the next lock() removes (02 §6); nothing else can be done during exit.
      process.stderr.write(`记忆文件夹的锁没删掉 Memory folder lock not removed (${errCode(err) ?? err?.name}): ${shown}${FILES.lock}\n`);
    }
  }

  // Reads one file: null when absent; any other read error or bad UTF-8 marks it unreadable.
  async function readText(key) {
    let buf;
    try {
      buf = await readFile(at(FILES[key]));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      unreadable.push(key);
      log('warn', 'memory_read_failed', { file: key, err_code: errCode(err) });
      return null;
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      unreadable.push(key);
      log('warn', 'memory_read_failed', { file: key, err_code: 'not_utf8' });
      return null;
    }
  }

  // R-9: drop group/other bits on the folder and our own files; never adds a bit.
  async function fixPerms() {
    for (const [key, path] of [['dir', dir], ['about', at(FILES.about)], ['diary', at(FILES.diary)], ['profile', at(FILES.profile)]]) {
      try {
        const st = await stat(path);
        if (st.uid !== process.getuid() || (st.mode & 0o077) === 0) continue;
        await chmod(path, st.mode & 0o700);
        log('warn', 'memory_perms_fixed', { file: key });
      } catch (err) {
        if (err.code !== 'ENOENT') log('warn', 'memory_perms_failed', { file: key, err_code: errCode(err) });
      }
    }
  }

  // Leftovers of a write cut short; a failure here only costs a stray file, so it is logged and start goes on.
  async function removeTemps() {
    try {
      for (const name of await readdir(dir)) {
        if (name.startsWith('.') && name.endsWith('.tmp')) await unlink(at(name));
      }
    } catch (err) {
      log('warn', 'memory_tmp_left', { err_code: errCode(err) });
    }
  }

  const readable = () => unreadable.length === 0;
  const aboutText = () => (readable() && about !== null ? about : ABOUT_TEMPLATE);
  const profile = () => (readable() ? { ...prof } : { ...PROFILE_DEFAULTS, memoryOn: false });
  const settings = () => ({ memoryOn: prof.memoryOn, noticeSeen: prof.noticeSeen, name: prof.name, region: prof.region });

  function refuseUnlessWritable() {
    if (!readable()) throw new ApiError('unreadable', 'memory');
    if (!writable) throw new ApiError('not_saved', 'memory');
  }

  return {
    get writable() {
      return writable;
    },
    get readable() {
      return readable();
    },
    get unreadable() {
      return [...unreadable];
    },
    get generation() {
      return generation;
    },

    async lock() {
      try {
        await mkdir(dir, { recursive: true, mode: 0o700 });
      } catch (err) {
        readOnly('mkdir', err);
        return;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        let fh;
        try {
          fh = await open(at(FILES.lock), 'wx', 0o600);
        } catch (err) {
          if (err.code !== 'EEXIST' || attempt === 1) {
            readOnly(attempt === 0 ? 'open' : 'stale', err);
            return;
          }
          let held;
          try {
            held = await lockHolder();
          } catch (e) {
            readOnly('stale', e);
            return;
          }
          if (held !== null && held !== process.pid && alive(held)) {
            log('error', 'memory_lock', { ok: false, held_by: held, stage: 'open', err_code: 'EEXIST' });
            throw new FolderInUse(held);
          }
          try {
            await unlink(at(FILES.lock));
          } catch (e) {
            readOnly('stale', e);
            return;
          }
          continue;
        }
        try {
          await fh.writeFile(String(process.pid));
        } catch (err) {
          await fh.close();
          await unlinkIfThere(at(FILES.lock)).catch((e) => log('warn', 'memory_lock', { ok: false, held_by: null, stage: 'open', err_code: errCode(e) }));
          readOnly('open', err);
          return;
        }
        await fh.close();
        writable = true;
        process.on('exit', unlockOnExit);
        log('info', 'memory_lock', { ok: true, held_by: null, stage: null, err_code: null });
        return;
      }
    },

    async load() {
      let redone = false;
      let marker = false;
      try {
        await stat(at(FILES.forget));
        marker = true;
      } catch (err) {
        // Cannot tell whether a forget is pending (folder unreadable): treated like an unfinished one, fail closed.
        if (err.code !== 'ENOENT') {
          unreadable.push('about', 'diary');
          log('warn', 'memory_read_failed', { file: 'forget', err_code: errCode(err) });
        }
      }
      if (marker && writable) {
        try {
          await writeAtomic(FILES.about, ABOUT_TEMPLATE);
          await writeAtomic(FILES.diary, EMPTY_DIARY);
          await unlink(at(FILES.forget));
          await syncDir();
          redone = true;
          log('info', 'memory_forget', { ok: true, ms: 0, stage: 'redo' });
        } catch (err) {
          unreadable.push('about', 'diary');
          log('error', 'memory_forget', { ok: false, ms: 0, stage: 'redo', err_code: errCode(err) });
        }
      } else if (marker) {
        unreadable.push('about', 'diary'); // a forget that cannot be finished must not bring the old memory back (REQ-050)
      }
      if (!unreadable.includes('about')) about = await readText('about');
      if (!unreadable.includes('diary')) diary = parseDiary((await readText('diary')) ?? EMPTY_DIARY);
      const ptext = await readText('profile');
      profileExisted = ptext !== null || unreadable.includes('profile');
      if (ptext !== null) {
        try {
          ({ profile: prof, extra } = parseProfile(ptext));
        } catch (err) {
          if (!(err instanceof UnreadableFile)) throw err;
          unreadable.push('profile');
          log('warn', 'memory_read_failed', { file: 'profile', err_code: 'not_object' });
        }
      }
      await fixPerms();
      if (writable && readable()) await removeTemps();
      log(readable() ? 'info' : 'warn', 'memory_loaded', {
        readable: readable(), unreadable: [...unreadable], about_chars: about?.length ?? 0, diary_entries: diary.entries.length, forget_redone: redone,
      });
    },

    profile,
    aboutText,

    notes() {
      if (!readable() || !prof.memoryOn) return null;
      const text = aboutText();
      if (isAboutEmpty(text)) return null;
      const r = notesWithin(text, cfg.notesBudget);
      if (r.cut && !cutSaid) {
        cutSaid = true;
        log('info', 'memory_notes_cut', { about_chars: text.length, budget: cfg.notesBudget });
        say(`关于你.md 比读取预算长，回复只读前面一段 About-you file is longer than the reading budget; replies read only its first part: ${shown}${FILES.about}`);
      }
      return r.text;
    },

    view() {
      const p = profile();
      const text = aboutText();
      const aboutEmpty = isAboutEmpty(text);
      return {
        readable: readable(), memoryOn: p.memoryOn, noticeSeen: p.noticeSeen, name: p.name, region: p.region, about: text, aboutEmpty,
        kept: readable() && (!aboutEmpty || diary.entries.length > 0), newProfile: !profileExisted && !profileWritten,
      };
    },

    diary(today) {
      const entries = readable() ? diary.entries : [];
      return { readable: readable(), memoryOn: profile().memoryOn, hasAny: entries.length > 0, days: weekOf(entries, today) };
    },

    async setProfile(patch) {
      refuseUnlessWritable();
      return locked(async () => {
        const next = { ...prof, ...patch };
        try {
          await writeAtomic(FILES.profile, profileText(next, extra));
        } catch (err) {
          log('warn', 'memory_write_failed', { file: 'profile', err_code: errCode(err) });
          throw new ApiError('not_saved', 'memory');
        }
        prof = next;
        profileWritten = true;
        log('info', 'profile_saved', { fields: Object.keys(patch) });
        return settings();
      });
    },

    // The mood of a 200 turn under today's section. Never throws: null when skipped or failed.
    async recordMood(day, mood, gen) {
      if (!writable) return null;
      try {
        const r = await locked(async () => {
          if (!readable() || !prof.memoryOn || gen !== generation) return null;
          const { lines, line } = appendMood(diary.lines, diary.lastDate, day, mood);
          await writeAtomic(FILES.diary, lines.join('\n'));
          diary = { lines, entries: [...diary.entries, { date: day, mood, point: null, line }], lastDate: day };
          return { gen, line };
        }, cfg.lockWaitMs);
        if (r === LOCK_TIMEOUT) {
          log('warn', 'memory_write_failed', { file: 'diary', err_code: 'lock_wait' });
          return null;
        }
        return r;
      } catch (err) {
        log('warn', 'memory_write_failed', { file: 'diary', err_code: errCode(err), err_name: err?.name ?? typeof err });
        return null;
      }
    },

    // The point onto the turn's diary line (job.ref) and new 关于你 lines. Never throws.
    // Returns what it wrote, for memory.js's log line.
    async applyUpdate(job, point, upd) {
      const wrote = { point: false, aboutChanged: false };
      if (!writable) return wrote;
      let file = 'diary';
      try {
        await locked(async () => {
          if (!readable() || !prof.memoryOn || job.gen !== generation) return;
          if (point !== null && job.ref !== null && job.ref.gen === generation) {
            const cur = diary.lines[job.ref.line] ?? '';
            const m = DIARY_RE.entry.exec(cur);
            if (m && m[2] === undefined) {
              const lines = [...diary.lines];
              lines[job.ref.line] = `${cur.trimEnd()} · ${point}`;
              await writeAtomic(FILES.diary, lines.join('\n'));
              diary = parseDiary(lines.join('\n'));
              wrote.point = true;
            }
          }
          if (upd !== null) {
            file = 'about';
            const before = aboutText();
            const next = applyNotes(before, upd, cfg);
            if (next !== before) {
              await writeAtomic(FILES.about, next);
              about = next;
              wrote.aboutChanged = true;
            }
          }
        });
      } catch (err) {
        log('warn', 'memory_write_failed', { file, err_code: errCode(err), err_name: err?.name ?? typeof err });
      }
      return wrote;
    },

    // All or nothing (03 §4): marker, staged files, rename 关于你 = commit, then 日志; a later failure is finished by load().
    async forget() {
      refuseUnlessWritable();
      return locked(async () => {
        const t0 = Date.now();
        const aboutTmp = at(`.${FILES.about}.tmp`);
        const diaryTmp = at(`.${FILES.diary}.tmp`);
        let stage = 'marker';
        let markerMade = false;
        try {
          try {
            await writeNew(at(FILES.forget), '');
            markerMade = true;
          } catch (err) {
            if (err.code !== 'EEXIST') throw err; // a marker left by an earlier forget this run means the same thing
          }
          await syncDir();
          stage = 'stage';
          await writeNew(aboutTmp, ABOUT_TEMPLATE);
          await writeNew(diaryTmp, EMPTY_DIARY);
          stage = 'rename_about';
          await rename(aboutTmp, at(FILES.about));
        } catch (err) {
          log('error', 'memory_forget', { ok: false, ms: Date.now() - t0, stage, err_code: errCode(err) });
          try {
            await unlinkIfThere(aboutTmp);
            await unlinkIfThere(diaryTmp);
            if (markerMade) await unlinkIfThere(at(FILES.forget));
          } catch (e) {
            log('error', 'memory_forget', { ok: false, ms: Date.now() - t0, stage: 'cleanup', err_code: errCode(e) });
          }
          throw new ApiError('not_saved', 'memory');
        }
        about = ABOUT_TEMPLATE;
        diary = parseDiary(EMPTY_DIARY);
        generation += 1;
        stage = 'rename_diary';
        try {
          await rename(diaryTmp, at(FILES.diary));
          await syncDir();
          stage = 'marker';
          await unlink(at(FILES.forget));
          await syncDir();
          log('info', 'memory_forget', { ok: true, ms: Date.now() - t0, stage: null });
        } catch (err) {
          log('error', 'memory_forget', { ok: false, ms: Date.now() - t0, stage, err_code: errCode(err) });
        }
        return { memoryOn: prof.memoryOn };
      });
    },
  };
}
