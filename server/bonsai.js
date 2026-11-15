// llama-server child and the reply + mood calls to Bonsai (03 DES-007, DES-008).
import { bonsaiFiles, CONFIG } from './config.js';
import { ApiError } from './errors.js';
import { languageOf } from './lang.js';
import { log } from './log.js';
import { LANG_RULE, MOOD_SAMPLING, MOOD_SCHEMA, MOOD_SYSTEM, MOODS, REPLY_SAMPLING, REPLY_SYSTEM } from './prompts.js';
import { supervise } from './supervisor.js';

const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };
const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '「': '」', '『': '』' };
const CAPS = { zh: 120, en: 40 };
// A sentence ends after a run of 。！？!?.… ; emoji (and closing quotes/brackets) right after it stay with it.
const SENTENCE = /[\s\S]*?(?:[。！？!?.…]+(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|[”’"'）)」』])*|$)/gu;

export function windowOf(history, cfg = CONFIG) {
  const win = history.slice(-cfg.limits.historyEntries);
  let total = win.reduce((n, h) => n + h.text.length, 0);
  while (win.length && total > cfg.limits.historyBudgetChars) total -= win.shift().text.length;
  return win;
}

export function toMessages(line, history, lang) {
  return [
    { role: 'system', content: `${REPLY_SYSTEM}\n${LANG_RULE[lang]}` },
    ...history.map((h) => ({ role: h.role === 'companion' ? 'assistant' : 'user', content: h.text })),
    { role: 'user', content: line },
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

export function createBonsai(cfg = CONFIG) {
  const base = `http://127.0.0.1:${cfg.bonsai.port}`;
  let proc = null;

  async function post(body, signal) {
    let res;
    try {
      res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function chat(line, history) {
    const started = Date.now();
    const lang = languageOf(line);
    const win = windowOf(history, cfg);
    const signal = AbortSignal.timeout(cfg.deadlines.respondMs);
    const timed = (p) => p.then((v) => ({ v, ms: Date.now() - started }));
    const [reply, mood] = await Promise.allSettled([
      timed(post({ messages: toMessages(line, win, lang), ...REPLY_SAMPLING }, signal)),
      timed(post({ messages: [{ role: 'system', content: MOOD_SYSTEM }, { role: 'user', content: line }], ...MOOD_SAMPLING, response_format: MOOD_SCHEMA }, signal)),
    ]);
    if (reply.status === 'rejected') throw reply.reason;
    const text = shapeReply(reply.value.v, lang);
    if (!text) throw new ApiError('failed', 'bonsai');
    const value = mood.status === 'fulfilled' ? moodOf(mood.value.v) : null;
    const fallback = !MOODS.includes(value);
    log('info', 'respond_done', {
      ms: Date.now() - started, reply_ms: reply.value.ms, mood_ms: mood.status === 'fulfilled' ? mood.value.ms : null,
      lang, mood_fallback: fallback, history_n: win.length,
    });
    return { reply: text, mood: fallback ? 'neutral' : value };
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
        args: ['-m', model, '-ngl', '99', '-fa', 'on', '-c', '32768', '-np', '2', '--host', '127.0.0.1', '--port', String(cfg.bonsai.port), '--no-webui'],
        stdio: ['ignore', 'ignore', 'ignore'],
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
    respond(line, history) {
      const state = proc?.state ?? 'down';
      if (state === 'starting') return Promise.reject(new ApiError('not_ready', 'bonsai'));
      if (state !== 'ready') return Promise.reject(new ApiError('unavailable', 'bonsai'));
      return chat(line, history);
    },
  };
}
