// Test double for llama-server (OpenAI-style /v1/chat/completions + /health). Behaviour is chosen by trigger words in the last user message.
// FAKE_LLAMA_LOG: jsonl file; one line {argv} at start, then one {body} per chat request. FAKE_LLAMA_BOOT_MS delays /health.
const http = require('node:http');
const fs = require('node:fs');
const log = (o) => process.env.FAKE_LLAMA_LOG && fs.appendFileSync(process.env.FAKE_LLAMA_LOG, JSON.stringify(o) + '\n');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
log({ argv: process.argv.slice(2) });
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
http.createServer((req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/health') {
    if (Date.now() - t0 < Number(process.env.FAKE_LLAMA_BOOT_MS || 0)) return json(503, { error: 'loading' });
    return json(200, { status: 'ok' });
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    const body = JSON.parse(raw || '{}');
    log({ body });
    const last = (body.messages || []).at(-1)?.content ?? '';
    const reply = (content) => json(200, { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
    if (body.response_format) {
      if (last.includes('MOODFAIL')) return json(500, { error: 'boom' });
      if (last.includes('MOODSLOW')) await sleep(4000);
      if (last.includes('MOODBAD')) return reply('{"mood":"ecstatic"}');
      if (last.includes('MOODJUNK')) return reply('not json at all');
      const mood = last.includes('HAPPY') ? 'pleasant-high' : last.includes('SAD') ? 'unpleasant-low' : 'neutral';
      return reply(JSON.stringify({ mood }));
    }
    if (last.includes('REPLY500')) return json(500, { error: 'boom' });
    if (last.includes('REPLYDIE')) process.exit(9);
    if (last.includes('REPLYSLOW')) await sleep(4000);
    if (last.includes('REPLYTHINK')) return reply('<think>secret reasoning</think>Nice to hear. How are you?');
    if (last.includes('REPLYEMPTY')) return reply('<think>only thoughts</think>');
    if (last.includes('REPLYLONG')) return reply('One. Two. Three. Four.');
    return reply('Fake reply.');
  });
}).listen(port, '127.0.0.1');
