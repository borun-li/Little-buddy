// Test double for companion-stt (03 DES-006 protocol): stdin {"id","pcm16":b64}\n -> stdout {"id","text","lang","ms"|"error"}\n.
// The first 4 bytes of the decoded audio pick the behaviour. Not a model.
const readline = require('node:readline');
const out0 = (o) => console.log(JSON.stringify(o));
console.log('loading model... (not JSON: the server must drop this line)');
setTimeout(() => out0({ event: 'ready', load_ms: 1, warm_ms: 1 }), Number(process.env.FAKE_STT_WARM_MS || 0));
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  const r = JSON.parse(l);
  const pcm = Buffer.from(r.pcm16, 'base64');
  const cmd = pcm.subarray(0, 4).toString();
  const body = pcm.subarray(4).toString();
  const out = (o) => out0({ id: r.id, ms: 1, ...o });
  if (cmd === 'TEXT') return out({ text: `  ${body} \n`, lang: 'en' });
  if (cmd === 'TXTS') return setTimeout(() => out({ text: body, lang: 'en' }), 300);
  if (cmd === 'EMPT') return out({ text: '', lang: null });
  if (cmd === 'ERR_') return out({ error: 'bad_audio' });
  if (cmd === 'HANG') return;
  if (cmd === 'LATE') return setTimeout(() => out({ text: 'late' }), 700);
  if (cmd === 'DIE_') process.exit(7);
  if (cmd === 'NOIS') { console.log('some log line'); return out({ text: body, lang: 'en' }); }
  return out({ text: 'default', lang: 'en' });
});
