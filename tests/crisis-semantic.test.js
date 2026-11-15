// be-developer #9 unit checks for FND-026 (Acceptance, 2026-11-15): crisis = strong words (floor) || Bonsai's risk from the mood call;
// isCrisis is the fallback when risk is unknown. The llama-server double is a throwaway inline fake written to a temp dir (not a model):
// the mood answer is chosen by a trigger word in the line (RISK_T, RISK_F, RISK_NONE, RISK_STR, MOODJUNK, MOODFAIL), REPLY500 fails the reply.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createBonsai, crisisReply } from '../server/bonsai.js';
import { CONFIG } from '../server/config.js';
import { isCrisis, isStrongCrisis, STRONG_PHRASES } from '../server/crisis.js';
import { CRISIS_RULE, MOOD_SAMPLING, MOOD_SCHEMA } from '../server/prompts.js';
import { freePort, mkTmp, shellWrapper, waitFor, withEnv } from './server-helpers.js';

const FAKE = `
const http = require('node:http'); const fs = require('node:fs');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
http.createServer((req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/health') return json(200, { status: 'ok' });
  let raw = ''; req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(body) + '\\n');
    const last = (body.messages || []).at(-1)?.content ?? '';
    const say = (content) => json(200, { choices: [{ message: { role: 'assistant', content } }] });
    if (body.response_format) {
      if (last.includes('MOODFAIL')) return json(500, { error: 'boom' });
      if (last.includes('MOODJUNK')) return say('not json');
      if (last.includes('RISK_T')) return say('{"mood":"unpleasant-low","risk":true}');
      if (last.includes('RISK_STR')) return say('{"mood":"unpleasant-low","risk":"true"}');
      if (last.includes('RISK_NONE')) return say('{"mood":"unpleasant-low"}');
      return say('{"mood":"unpleasant-low","risk":false}');
    }
    if (last.includes('REPLY500')) return json(500, { error: 'boom' });
    return say('I hear you. What happened?');
  });
}).listen(port, '127.0.0.1');
`;

let b; let logFile;
const bodies = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// Runs one turn, returning the result, the reply call's system message and the respond_done log fields.
async function turn(line) {
  const n = bodies().length;
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (s, ...rest) => { if (String(s).includes('"respond_done"')) lines.push(JSON.parse(s)); else return write.call(process.stdout, s, ...rest); return true; };
  let r;
  try { r = await b.respond(line, []); } finally { process.stdout.write = write; }
  const rep = bodies().slice(n).find((x) => !x.response_format);
  return { r, sys: rep?.messages[0].content ?? '', done: lines[0] };
}

before(async () => {
  const dir = mkTmp();
  logFile = join(dir, 'llama.jsonl');
  writeFileSync(join(dir, 'fake.cjs'), FAKE);
  const cfg = structuredClone(CONFIG);
  cfg.bonsai = { ...cfg.bonsai, port: await freePort(), dir: join(dir, 'gguf') };
  shellWrapper(join(dir, 'gguf'), 'bin/macos-arm64/llama-server', join(dir, 'fake.cjs'));
  b = await withEnv({ FAKE_LOG: logFile }, () => { const x = createBonsai(cfg); x.start(); return x; });
  await waitFor(() => b.state === 'ready', 20000, 'bonsai ready');
});
after(() => b?.stop());

test('FND-026 prompts: MOOD_SCHEMA requires mood and boolean risk; MOOD_SAMPLING temperature 0, max_tokens 32', () => {
  const sch = MOOD_SCHEMA.json_schema.schema;
  assert.deepEqual(sch.required, ['mood', 'risk']);
  assert.deepEqual(sch.properties.risk, { type: 'boolean' });
  assert.equal(MOOD_SAMPLING.temperature, 0);
  assert.equal(MOOD_SAMPLING.max_tokens, 32);
});

test('FND-026 isStrongCrisis: unambiguous words fire (normalised, Traditional, en word boundary); soft or idiomatic lines do not', () => {
  for (const l of ['我想自杀。', '我不想活了', '我想自殺', 'I WANT TO DIE', 'I want to kill myself.', 'I’m suicidal', 'I don’t want to live']) {
    assert.equal(isStrongCrisis(l), true, l);
  }
  for (const p of STRONG_PHRASES.zh) assert.equal(isStrongCrisis(`今天${p}`), true, p);
  for (const p of STRONG_PHRASES.en) assert.equal(isStrongCrisis(`Today I ${p}.`), true, p);
  for (const l of ['我想死你别管我', '想死你了', '活着真没意思', '我想伤害自己。', 'I keep wanting to hurt myself.', 'I wanted to die', 'misuicidex', '跳楼价']) {
    assert.equal(isStrongCrisis(l), false, l);
  }
});

test('FND-026 respond: model risk true on a non-strong line -> crisis, 988, no CRISIS_RULE in the prompt, crisis_by model', async () => {
  const { r, sys, done } = await turn('I wanted to die RISK_T');
  assert.equal(r.crisis, true); assert.ok(r.reply.includes('988'), r.reply);
  assert.equal(r.reply, crisisReply('I hear you. What happened?', 'en'));
  assert.equal(r.mood, 'unpleasant-low');
  assert.ok(!sys.includes(CRISIS_RULE.en));
  assert.equal(done.crisis_by, 'model');
  assert.ok(!JSON.stringify(done).includes('wanted'), 'the line is never logged');
});

test('FND-026 respond: model risk false overrides the old keyword rule (想死 idiom); crisis_by null', async () => {
  assert.equal(isCrisis('我想死磕这个bug'), true, 'the old rule fires on this line');
  const { r, done } = await turn('我想死磕这个bug RISK_F');
  assert.equal(r.crisis, false); assert.ok(r.reply.startsWith('I hear you.') && !r.reply.includes('988'), r.reply); // zh line: joined without a space
  assert.equal(done.crisis_by, null);
});

test('FND-026 respond: a strong word is crisis even when the model says risk false; the reply prompt carries CRISIS_RULE', async () => {
  const { r, sys, done } = await turn('我想自杀 RISK_F');
  assert.equal(r.crisis, true); assert.ok(r.reply.includes('988'));
  assert.ok(sys.endsWith(`\n${CRISIS_RULE.zh}`));
  assert.equal(done.crisis_by, 'strong');
});

test('FND-026 respond: risk missing, not boolean, not JSON or the mood call failing -> isCrisis decides (fallback), mood neutral when unusable', async () => {
  for (const trig of ['RISK_NONE', 'RISK_STR', 'MOODJUNK', 'MOODFAIL']) {
    const hit = await turn(`我想伤害自己 ${trig}`);
    assert.equal(hit.r.crisis, true, trig); assert.ok(hit.r.reply.includes('988'), trig);
    assert.equal(hit.done.crisis_by, 'fallback', trig);
    const miss = await turn(`今天天气不错 ${trig}`);
    assert.equal(miss.r.crisis, false, trig); assert.equal(miss.done.crisis_by, null, trig);
  }
  assert.equal((await turn('今天天气不错 MOODJUNK')).r.mood, 'neutral');
  assert.equal((await turn('今天天气不错 RISK_NONE')).r.mood, 'unpleasant-low', 'a valid mood is kept without risk');
});

test('FND-026 respond: a model-crisis turn whose reply call fails still answers with the fallback sentence + 988 (UD-1 a); a normal turn still fails', async () => {
  const { r } = await turn('I want to end it REPLY500 RISK_T');
  assert.deepEqual(r, { reply: crisisReply('', 'en'), mood: 'unpleasant-low', lang: 'en', crisis: true });
  const f = await turn('我想伤害自己 REPLY500 MOODFAIL');
  assert.equal(f.r.crisis, true); assert.equal(f.r.reply, crisisReply('', 'zh')); assert.equal(f.r.mood, 'neutral');
  await assert.rejects(b.respond('Just a normal day REPLY500 RISK_F', []), (e) => e.code === 'failed');
});
