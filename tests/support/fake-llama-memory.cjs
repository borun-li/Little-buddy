// Test double for llama-server, R1 memory version (be-tester #4, plan 04 §1 "Bonsai double"). Same /health and /v1/chat/completions shape as
// fake-llama.cjs, but it answers three kinds of request from a script file that is re-read on every request:
//   reply  = a chat request without response_format   -> script.replies[]  {when, reply, delayMs, status, hang}
//   mood   = response_format.json_schema.name 'mood'    -> script.moods[]    {when, mood, risk, delayMs}
//   update = response_format.json_schema.name 'notes'   -> script.updates[]  {when, point, add{busy,people,likes}, delayMs, status, raw, hang}
// `when` is a substring of the newest user line (for an update: the line inside 'Newest message: """..."""'); the first match wins.
// Env: FAKE_MEM_SCRIPT (json path), FAKE_MEM_LOG (jsonl: {t, kind, line, body} per chat request). Not a model.
const http = require('node:http');
const fs = require('node:fs');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const script = () => {
  try { return JSON.parse(fs.readFileSync(process.env.FAKE_MEM_SCRIPT, 'utf8')); } catch { return {}; }
};
const RISK = /想死|不想活|自杀|自残|伤害自己|kill myself|hurt myself|want to die|suicid/i;
const pick = (list, line) => (list || []).find((e) => e.when === undefined || line.includes(e.when));

http.createServer((req, res) => {
  const json = (code, o) => { if (!res.destroyed) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); } };
  if (req.url === '/health') return json(200, { status: 'ok' });
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    const body = JSON.parse(raw || '{}');
    const name = body.response_format?.json_schema?.name;
    const kind = name === 'notes' ? 'update' : name === 'mood' ? 'mood' : 'reply';
    const last = body.messages?.at(-1)?.content ?? '';
    const line = kind === 'update' ? (/Newest message: """([\s\S]*?)"""\n/.exec(last)?.[1] ?? '') : last;
    const t = Date.now();
    if (process.env.FAKE_MEM_LOG) fs.appendFileSync(process.env.FAKE_MEM_LOG, `${JSON.stringify({ t, kind, line, body })}\n`);
    const s = script();
    const content = (c) => json(200, { choices: [{ index: 0, message: { role: 'assistant', content: c }, finish_reason: 'stop' }] });
    if (kind === 'mood') {
      const e = pick(s.moods, line) || {};
      if (e.delayMs) await sleep(e.delayMs);
      return content(JSON.stringify({ mood: e.mood || 'neutral', risk: e.risk ?? RISK.test(line) }));
    }
    if (kind === 'update') {
      const e = pick(s.updates, line) || {};
      if (e.hang) return;
      if (e.delayMs) await sleep(e.delayMs);
      if (e.status) return json(e.status, { error: 'scripted' });
      if (e.raw !== undefined) return content(e.raw);
      return content(JSON.stringify({ point: e.point ?? null, add: { busy: [], people: [], likes: [], ...(e.add || {}) } }));
    }
    const e = pick(s.replies, line) || {};
    if (e.hang) return;
    if (e.delayMs) await sleep(e.delayMs);
    if (e.status) return json(e.status, { error: 'scripted' });
    return content(e.reply ?? 'Fake reply.');
  });
}).listen(port, '127.0.0.1');
