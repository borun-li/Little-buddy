// llama-server child and the reply + mood calls to Bonsai (03 DES-007, DES-008); name and crisis turn (DES-020, DES-021).
import { randomBytes } from 'node:crypto';
import { bonsaiFiles, CONFIG } from './config.js';
import { isCrisis } from './crisis.js';
import { ApiError } from './errors.js';
import { hanCount, languageOf } from './lang.js';
import { log } from './log.js';
import {
  CRISIS_FALLBACK, CRISIS_LINE, CRISIS_MARK, CRISIS_RULE, LANG_RULE, MOOD_SAMPLING, MOOD_SCHEMA, MOOD_SYSTEM, MOODS, RECALL, REPLY_SAMPLING, replySystem,
} from './prompts.js';
import { supervise } from './supervisor.js';

const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };
const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '「': '」', '『': '』' };
const CAPS = { zh: 120, en: 40 };
// A sentence ends after a run of 。！？!?.… ; emoji (and closing quotes/brackets) right after it stay with it.
export const SENTENCE = /[\s\S]*?(?:[。！？!?.…]+(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|[”’"'）)」』])*|$)/gu;

// Prompt cost of a history text, ≈ 4 × tokens: Han counts 2.5, everything else 1 (03 DES-007).
const weight = (text) => text.length + 1.5 * hanCount(text);

export function windowOf(history, cfg = CONFIG) {
  const win = history.slice(-cfg.limits.historyEntries);
  let total = win.reduce((n, h) => n + weight(h.text), 0);
  while (win.length && total > cfg.limits.historyBudget) total -= weight(win.shift().text);
  return win;
}

// The last message carries a reminder of the newest earlier user line (03 DES-008); it is never stored, logged or counted by windowOf.
// System message = replySystem(name) + LANG_RULE (+ CRISIS_RULE on a crisis turn) (03 DES-020, DES-021).
export function toMessages(line, history, lang, name = null, crisis = false) {
  const prev = history.findLast((h) => h.role === 'user')?.text;
  const system = `${replySystem(name)}\n${LANG_RULE[lang]}${crisis ? `\n${CRISIS_RULE[lang]}` : ''}`;
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

// The mood call's JSON content → its mood value, or null when it is not JSON (falls back to neutral, 03 §3).
function moodOf(content) {
  try {
    return JSON.parse(content)?.mood ?? null;
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
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
// then the 988 line unless the sentence already holds CRISIS_MARK (a bare '988', e.g. the name "988", does not count: FND-019);
// the first sentence is cut so the whole stays within CAPS.
export function crisisReply(shaped, lang) {
  let first = shaped === '' ? CRISIS_FALLBACK[lang] : shaped.match(SENTENCE)[0].trim(); // shapeReply output is trimmed: match 0 is non-empty
  if (first.replace(/\s/g, '').toLowerCase().includes(CRISIS_MARK[lang])) return first;
  const sep = lang === 'zh' ? '' : ' ';
  const room = CAPS[lang] - size(CRISIS_LINE[lang], lang); // the separator adds no code point (zh) and no word (en)
  if (size(first, lang) > room) {
    first = lang === 'zh'
      ? `${[...first].slice(0, room - 1).join('')}…`
      : `${first.split(/\s+/).filter(Boolean).slice(0, room).join(' ')}…`;
  }
  return `${first}${sep}${CRISIS_LINE[lang]}`;
}

export function createBonsai(cfg = CONFIG) {
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

  // The mood call never carries the name (03 DES-021 step 3).
  async function chat(line, history, name = null, crisis = false) {
    const started = Date.now();
    const lang = languageOf(line);
    const win = windowOf(history, cfg);
    const signal = AbortSignal.timeout(cfg.deadlines.respondMs);
    const timed = (p) => p.then((v) => ({ v, ms: Date.now() - started }));
    const [reply, mood] = await Promise.allSettled([
      timed(post({ messages: toMessages(line, win, lang, name, crisis), ...REPLY_SAMPLING }, signal)),
      timed(post({ messages: [{ role: 'system', content: MOOD_SYSTEM }, { role: 'user', content: line }], ...MOOD_SAMPLING, response_format: MOOD_SCHEMA }, signal)),
    ]);
    const shaped = reply.status === 'fulfilled' ? shapeReply(reply.value.v, lang) : '';
    // A crisis turn never fails: when Bonsai gives no reply, the fixed gentle sentence + 988 line (UD-1 = (a), the user at Plan).
    if (!crisis) {
      if (reply.status === 'rejected') throw reply.reason;
      if (!shaped) throw new ApiError('failed', 'bonsai');
    }
    const value = mood.status === 'fulfilled' ? moodOf(mood.value.v) : null;
    const fallback = !MOODS.includes(value);
    log('info', 'respond_done', {
      ms: Date.now() - started, reply_ms: shaped ? reply.value.ms : null, mood_ms: mood.status === 'fulfilled' ? mood.value.ms : null,
      lang, mood_fallback: fallback, history_n: win.length,
    });
    return { reply: crisis ? crisisReply(shaped, lang) : shaped, mood: fallback ? 'neutral' : value, lang, crisis };
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
        // 'none' is echoed as Access-Control-Allow-Origin: none, which no page origin equals (FND-003).
        args: ['-m', model, '-ngl', '99', '-fa', 'on', '-c', '32768', '-np', '2', '--host', '127.0.0.1', '--port', String(cfg.bonsai.port), '--no-webui',
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
    respond(line, history, name = null) {
      const crisis = isCrisis(line);
      const state = proc?.state ?? 'down';
      if (state !== 'ready' && crisis) {
        const lang = languageOf(line); // Bonsai starting or down: no call made, mood neutral (03 DES-020 step 3)
        return Promise.resolve({ reply: crisisReply('', lang), mood: 'neutral', lang, crisis });
      }
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'bonsai'));
      if (state !== 'ready') return Promise.reject(new ApiError('unavailable', 'bonsai'));
      return chat(line, history, name, crisis);
    },
  };
}
