// llama-server child and the reply + mood calls to Bonsai (03 DES-007, DES-008); name and crisis turn (DES-020, DES-021);
// R1: memory block and per-turn region in the reply, the background update call remember() (DES-035).
import { randomBytes } from 'node:crypto';
import { bonsaiFiles, CONFIG } from './config.js';
import { isCrisis, isStrongCrisis } from './crisis.js';
import { ApiError } from './errors.js';
import { languageOf, weight } from './lang.js';
import { log } from './log.js';
import { systemRegion } from './region.js';
import {
  CRISIS_FALLBACK, CRISIS_RULE, crisisLineOf, LANG_RULE, MEMORY_RULE, MOOD_SAMPLING, MOOD_SCHEMA, MOOD_SYSTEM, MOODS, NO_NOTES, RECALL,
  REPLY_SAMPLING, replySystem, UPDATE_SAMPLING, UPDATE_SCHEMA, UPDATE_SYSTEM, updateUser,
} from './prompts.js';
import { supervise } from './supervisor.js';

const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };
const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '「': '」', '『': '』' };
const CAPS = { zh: 120, en: 40 };
// A sentence ends after a run of 。！？!?.… ; emoji (and closing quotes/brackets) right after it stay with it.
export const SENTENCE = /[\s\S]*?(?:[。！？!?.…]+(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|[”’"'）)」』])*|$)/gu;

export function windowOf(history, cfg = CONFIG) {
  const win = history.slice(-cfg.limits.historyEntries);
  let total = win.reduce((n, h) => n + weight(h.text), 0);
  while (win.length && total > cfg.limits.historyBudget) total -= weight(win.shift().text);
  return win;
}

// The last message carries a reminder of the newest earlier user line (03 DES-008); it is never stored, logged or counted by windowOf.
// System message = replySystem(name) + (MEMORY_RULE(notes) or NO_NOTES) + LANG_RULE, or on a strong crisis turn
// replySystem(name) + LANG_RULE + CRISIS_RULE with no memory at all (03 DES-020, DES-021, DES-035 step 2).
export function toMessages(line, history, lang, name = null, crisis = false, notes = null) {
  const prev = history.findLast((h) => h.role === 'user')?.text;
  const memory = crisis ? '' : `${notes ? MEMORY_RULE(notes) : NO_NOTES}\n`;
  const system = `${replySystem(name)}\n${memory}${LANG_RULE[lang]}${crisis ? `\n${CRISIS_RULE[lang]}` : ''}`;
  return [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role === 'companion' ? 'assistant' : 'user', content: h.text })),
    { role: 'user', content: prev === undefined ? line : `${line}\n${RECALL[lang](prev)}` },
  ];
}

function unwrap(text) {
  let s = text.trim();
  while (s.length >= 2 && QUOTES[s[0]] === s[s.length - 1]) s = s.slice(1, -1).trim();
  return s;
}

// The mood call's JSON content → { mood, risk }: mood null when absent or not JSON (falls back to neutral, 03 §3);
// risk null unless it is a boolean (FND-026: then the crisis verdict falls back to isCrisis).
function moodOf(content) {
  let o;
  try {
    o = JSON.parse(content);
  } catch (err) {
    if (err instanceof SyntaxError) return { mood: null, risk: null };
    throw err;
  }
  return { mood: o?.mood ?? null, risk: typeof o?.risk === 'boolean' ? o.risk : null };
}

const isLines = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string');

// The update call's JSON content -> { point, add }; anything else is failed (03 DES-035 step 4).
function notesOf(content) {
  let o;
  try {
    o = JSON.parse(content);
  } catch (err) {
    if (err instanceof SyntaxError) throw new ApiError('failed', 'bonsai');
    throw err;
  }
  const add = o?.add;
  if (o === null || typeof o !== 'object' || (o.point !== null && typeof o.point !== 'string') || add === null || typeof add !== 'object'
    || !isLines(add.busy) || !isLines(add.people) || !isLines(add.likes)) {
    throw new ApiError('failed', 'bonsai');
  }
  return { point: o.point, add: { busy: add.busy, people: add.people, likes: add.likes } };
}

const size = (s, lang) => (lang === 'zh' ? [...s].length : s.split(/\s+/).filter(Boolean).length);
const isQuestion = (s) => /[?？]/.test(s);

export function shapeReply(text, lang) {
  const clean = unwrap(String(text ?? '').replace(/<think>[\s\S]*?(?:<\/think>|$)/g, ''));
  const sentences = (clean.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
  const kept = [];
  for (const s of sentences) {
    if (kept.length === 2) break;
    if (isQuestion(s) && kept.some(isQuestion)) continue;
    kept.push(s);
  }
  if (!kept.length) return '';
  const sep = lang === 'zh' ? '' : ' ';
  let reply = kept.join(sep);
  if (size(reply, lang) > CAPS[lang]) reply = kept[0];
  if (size(reply, lang) > CAPS[lang]) {
    reply = lang === 'zh'
      ? `${[...reply].slice(0, CAPS.zh - 1).join('')}…`
      : `${reply.split(/\s+/).filter(Boolean).slice(0, CAPS.en).join(' ')}…`;
  }
  return reply;
}

// Crisis turn reply (03 DES-020): the first sentence of the shaped reply (or the fixed gentle sentence when there is none),
// then the region's help line unless the sentence already holds its mark (a bare '988', e.g. the name "988", does not count: FND-019);
// the first sentence is cut so the whole stays within CAPS. region: 'CN' | 'US' | null (R0; null = the international line).
export function crisisReply(shaped, lang, region) {
  const help = crisisLineOf(lang, region);
  let first = shaped === '' ? CRISIS_FALLBACK[lang] : shaped.match(SENTENCE)[0].trim(); // shapeReply output is trimmed: match 0 is non-empty
  if (first.replace(/\s/g, '').toLowerCase().includes(help.mark)) return first;
  const sep = lang === 'zh' ? '' : ' ';
  const room = CAPS[lang] - size(help.line, lang); // the separator adds no code point (zh) and no word (en)
  if (size(first, lang) > room) {
    first = lang === 'zh'
      ? `${[...first].slice(0, room - 1).join('')}…`
      : `${first.split(/\s+/).filter(Boolean).slice(0, room).join(' ')}…`;
  }
  return `${first}${sep}${help.line}`;
}

// region: the default help-line region for crisis turns (server/region.js); respond's ctx.region overrides it per turn (R1).
export function createBonsai(cfg = CONFIG, region = systemRegion()) {
  const base = `http://127.0.0.1:${cfg.bonsai.port}`;
  // Per-run key for llama-server (FND-003): passed by env, not argv, so it is not in `ps`; never logged, printed, stored or configurable.
  const apiKey = randomBytes(24).toString('hex');
  let proc = null;

  async function post(body, signal) {
    let res;
    try {
      res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ stream: false, ...NO_THINKING, ...body }),
        signal,
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ApiError('timeout', 'bonsai');
      throw new ApiError('unavailable', 'bonsai');
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new ApiError('failed', 'bonsai');
    }
    try {
      return (await res.json()).choices?.[0]?.message?.content ?? '';
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ApiError('timeout', 'bonsai');
      throw new ApiError('failed', 'bonsai');
    }
  }

  // The mood call never carries the name (03 DES-021 step 3). FND-026: strong = isStrongCrisis(line) (gets CRISIS_RULE); the verdict is
  // strong || the mood call's risk, or strong || isCrisis(line) when risk is unknown (call failed, not JSON, risk missing).
  async function chat(line, history, name = null, strong = false, notes = null, turnRegion = region) {
    const started = Date.now();
    const lang = languageOf(line);
    const win = windowOf(history, cfg);
    const signal = AbortSignal.timeout(cfg.deadlines.respondMs);
    const timed = (p) => p.then((v) => ({ v, ms: Date.now() - started }));
    const [reply, mood] = await Promise.allSettled([
      timed(post({ messages: toMessages(line, win, lang, name, strong, notes), ...REPLY_SAMPLING }, signal)),
      timed(post({ messages: [{ role: 'system', content: MOOD_SYSTEM }, { role: 'user', content: line }], ...MOOD_SAMPLING, response_format: MOOD_SCHEMA }, signal)),
    ]);
    const shaped = reply.status === 'fulfilled' ? shapeReply(reply.value.v, lang) : '';
    const { mood: value, risk } = mood.status === 'fulfilled' ? moodOf(mood.value.v) : { mood: null, risk: null };
    const crisis = strong || (risk ?? isCrisis(line));
    const crisisBy = strong ? 'strong' : risk === true ? 'model' : risk === null && crisis ? 'fallback' : null;
    // A crisis turn never fails: when Bonsai gives no reply, the fixed gentle sentence + the region's help line (UD-1 = (a), the user at Plan).
    if (!crisis) {
      if (reply.status === 'rejected') throw reply.reason;
      if (!shaped) throw new ApiError('failed', 'bonsai');
    }
    const fallback = !MOODS.includes(value);
    log('info', 'respond_done', {
      ms: Date.now() - started, reply_ms: shaped ? reply.value.ms : null, mood_ms: mood.status === 'fulfilled' ? mood.value.ms : null,
      lang, mood_fallback: fallback, history_n: win.length, crisis_by: crisisBy,
    });
    return { reply: crisis ? crisisReply(shaped, lang, turnRegion) : shaped, mood: fallback ? 'neutral' : value, lang, crisis };
  }

  async function warm(child) {
    const deadline = Date.now() + cfg.deadlines.bonsaiBootMs;
    for (;;) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('llama-server exited before ready');
      if (Date.now() > deadline) throw new Error('llama-server health exceeded bonsaiBootMs');
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
        await res.body?.cancel();
        if (res.status === 200) break;
      } catch (err) {
        if (err.name !== 'TypeError' && err.name !== 'TimeoutError') throw err; // TypeError = not listening yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    await chat('Hello', []);
  }

  return {
    start() {
      const { bin, model } = bonsaiFiles(cfg);
      proc = supervise({
        name: 'bonsai',
        cmd: bin,
        // -np 3: reply, mood and the memory update each keep their own slot and prompt cache (03 DES-035).
        // 'none' is echoed as Access-Control-Allow-Origin: none, which no page origin equals (FND-003).
        args: ['-m', model, '-ngl', '99', '-fa', 'on', '-c', '32768', '-np', '3', '--host', '127.0.0.1', '--port', String(cfg.bonsai.port), '--no-webui',
          '--cors-origins', 'none', '--no-cors-credentials', '--no-slots'],
        // llama-server logs only on stderr; the supervisor keeps its tail for the operator line (DES-004 step 6).
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, LLAMA_API_KEY: apiKey },
        warm,
        restarts: cfg.restarts,
      });
    },
    stop() {
      proc?.stop();
    },
    get state() {
      return proc?.state ?? 'down';
    },
    get pid() {
      return proc?.pid ?? null;
    },
    // ctx.region: the turn's help-line region (undefined -> the createBonsai region); ctx.notes: the 关于你 part the reply reads.
    respond(line, history, name = null, ctx = {}) {
      const turnRegion = ctx.region === undefined ? region : ctx.region;
      const state = proc?.state ?? 'down';
      if (state !== 'ready' && isCrisis(line)) {
        const lang = languageOf(line); // Bonsai starting or down: no call made, mood neutral (03 DES-020 step 3)
        return Promise.resolve({ reply: crisisReply('', lang, turnRegion), mood: 'neutral', lang, crisis: true });
      }
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'bonsai'));
      if (state !== 'ready') return Promise.reject(new ApiError('unavailable', 'bonsai'));
      return chat(line, history, name, isStrongCrisis(line), ctx.notes ?? null, turnRegion);
    },
    // The background update (03 DES-035 step 3): page = the budget-cut 关于你, line = the user's line; signal = abort ∪ rememberMs.
    async remember(page, line, lang, signal) {
      const state = proc?.state ?? 'down';
      if (state === 'starting') throw new ApiError('not_ready', 'bonsai');
      if (state !== 'ready') throw new ApiError('unavailable', 'bonsai');
      const messages = [{ role: 'system', content: UPDATE_SYSTEM }, { role: 'user', content: updateUser(page, line, lang) }];
      return notesOf(await post({ messages, ...UPDATE_SAMPLING, response_format: UPDATE_SCHEMA }, signal));
    },
  };
}
