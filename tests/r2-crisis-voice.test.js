// R2 Full Phase 5 amendment A3 (fake helper): TC-277..TC-281, DES-049 (main.js crisisSpeech) and DES-050 (tts.js voiceFor). Round 3 (be-tester #4): repointed to Q35, every crisis part is serena whatever the voice.
// be-tester #2. Plan: docs/backend/04-test-plan.md § G. Expected values come from 03 § Phase 5 amendment A3, 01 REQ-075 and Q31 (the code was
// not read for the expectations). The real server/main.js and server/tts.js run; the TTS helper is tests/support/fake-tts.cjs (DES-040 protocol).
// Two traps (be-developer #2): tts_done.crisis is true for ANY voice on a crisis part, so the voice read is asserted from tts_done.voice and from
// the helper's request line; crisisSpeech is module state of the gateway process, replaced by every respond 200, so each case starts its own gateway.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cleanupTmp, fx, imp, postProfile, say, speak, tmpDir, ttsGateway, VOICES, R1_PROFILE } from './r2-helpers.js';

after(cleanupTmp);

const CRISIS_ZH = fx('FX-009').input.cases[0].body.line; // 我不想活了。 (FX-009-01)
const CRISIS_EN = fx('FX-009').input.cases[3].body.line; // I want to kill myself. (FX-009-04)
const NORMAL = '今天天气不错。';
const script = {
  replies: [
    { when: CRISIS_ZH, reply: '我听见了，我在这里陪着你。' },
    { when: CRISIS_EN, reply: 'I hear you. I am here with you.' },
    { when: NORMAL, reply: '好的，我在听。你想聊聊吗？' },
  ],
};
const gateway = (voice) => ttsGateway({ dir: tmpDir(), files: { 'profile.json': R1_PROFILE.replace('\n}\n', `,\n  "voice": "${voice}"\n}\n`) }, script });
// every part of a respond body, one after another, as the page does: the part's helper line and tts_done line
async function readParts(gw, body) {
  const out = [];
  for (const text of body.speech) {
    const nl = gw.lines().length, nd = gw.done().length;
    const r = await speak(gw, text, body.lang);
    assert.equal(r.status, 200, text);
    out.push({ text, line: gw.lines().slice(nl).map((l) => l.voice), done: gw.done().slice(nd).map((d) => ({ voice: d.voice, crisis: d.crisis })) });
  }
  return out;
}
const crisisTurn = async (gw, line, region) => {
  assert.equal((await postProfile(gw, { region })).status, 200);
  const t = await say(gw, line);
  assert.equal(t.status, 200);
  assert.equal(t.json.crisis, true, 'the turn is a crisis turn');
  assert.ok(t.json.speech.length >= 2, `speech parts: ${JSON.stringify(t.json.speech)}`);
  return t.json;
};

// ---------------------------------------------------------------- TC-277
test('TC-277 [FX-027-01] REQ-075 (Q35, DES-050): every one of the 9 chosen voices: crisis parts (zh and en, US and CN) are read by serena: helper line voice and tts_done.voice', async () => {
  assert.equal(VOICES.length, 9);
  for (const voice of VOICES) {
    const gw = await gateway(voice);
    try {
      for (const [line, region] of [[CRISIS_ZH, 'US'], [CRISIS_EN, 'US'], [CRISIS_ZH, 'CN'], [CRISIS_EN, 'CN']]) {
        const body = await crisisTurn(gw, line, region);
        const parts = await readParts(gw, body);
        for (const p of parts) {
          assert.deepEqual(p.line, ['serena'], `${voice} ${region} ${body.lang}: helper line for ${p.text}`);
          assert.deepEqual(p.done, [{ voice: 'serena', crisis: true }], `${voice} ${region} ${body.lang}: tts_done for ${p.text}`);
        }
      }
    } finally { await gw.stop(); }
  }
});

// ---------------------------------------------------------------- TC-278
test('TC-278 [FX-027-01] REQ-075 (Q35): dylan (and every other voice) on a crisis reply is serena on all parts; the normal reply after it is read in the chosen voice again', async () => {
  for (const voice of ['dylan', 'aiden', 'vivian', 'uncle-fu']) {
    const gw = await gateway(voice);
    try {
      const body = await crisisTurn(gw, CRISIS_ZH, 'CN');
      for (const p of await readParts(gw, body)) {
        assert.deepEqual(p.line, ['serena'], `${voice}: helper line for ${p.text}`);
        assert.deepEqual(p.done, [{ voice: 'serena', crisis: true }], `${voice}: tts_done for ${p.text}`);
      }
      const t = await say(gw, NORMAL);
      assert.equal(t.json.crisis, false);
      for (const p of await readParts(gw, t.json)) {
        assert.deepEqual(p.line, [voice], `${voice}: normal part ${p.text}`);
        assert.deepEqual(p.done, [{ voice, crisis: false }], `${voice}: normal tts_done ${p.text}`);
      }
    } finally { await gw.stop(); }
  }
});

// ---------------------------------------------------------------- TC-279
test('TC-279 REQ-075 (A3): ryan on normal parts stays ryan (tts_done.crisis false); text that never came from a respond stays ryan too, even when it equals a crisis part', async () => {
  const gw = await gateway('ryan');
  try {
    const before = await speak(gw, '我听见了，我在这里陪着你。', 'zh'); // no respond yet: nothing is a crisis part
    assert.equal(before.status, 200);
    assert.equal(gw.lines().at(-1).voice, 'ryan');
    const t = await say(gw, NORMAL);
    assert.equal(t.status, 200);
    assert.equal(t.json.crisis, false);
    const parts = await readParts(gw, t.json);
    assert.ok(parts.length >= 1);
    for (const p of parts) {
      assert.deepEqual(p.line, ['ryan'], p.text);
      assert.deepEqual(p.done, [{ voice: 'ryan', crisis: false }], p.text);
    }
    assert.equal(gw.done()[0].crisis, false);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-280
test('TC-280 REQ-075 (Q35, DES-049 as changed 2026-11-19): an old crisis part spoken after a non-crisis reply is still serena (the set is not replaced by a normal 200); the same part in another language is not a crisis part', async () => {
  const gw = await gateway('ryan');
  try {
    const crisis = await crisisTurn(gw, CRISIS_ZH, 'CN');
    const old = crisis.speech[0];
    const fresh = await readParts(gw, { ...crisis, speech: [old] });
    assert.deepEqual(fresh[0].line, ['serena'], 'control: right after the crisis turn the part reads serena');
    const t = await say(gw, NORMAL); // a normal 200 must not touch the kept crisis parts (FND-075)
    assert.equal(t.json.crisis, false);
    assert.ok(!t.json.speech.includes(old), 'probe text is not a part of the normal reply');
    const after1 = await readParts(gw, { ...crisis, speech: [old] });
    assert.deepEqual(after1[0].line, ['serena'], 'old crisis part after a normal reply');
    assert.deepEqual(after1[0].done, [{ voice: 'serena', crisis: true }]);
    // a new crisis turn brings it back, and the same text asked as the other language is not marked
    const again = await crisisTurn(gw, CRISIS_ZH, 'CN');
    const asEn = await speak(gw, again.speech[0], 'en');
    assert.equal(asEn.status, 200);
    assert.equal(gw.lines().at(-1).voice, 'ryan', 'same text, lang en: not a crisis part');
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['serena']);
    // a profile voice change between the turn and the reading is followed (B-4), but a crisis part is serena whatever the voice (Q35)
    assert.equal((await postProfile(gw, { voice: 'dylan' })).status, 200);
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['serena']);
    assert.equal((await postProfile(gw, { voice: 'eric' })).status, 200);
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['serena']);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-281
test('TC-281 REQ-075 (Q35, DES-050): voiceFor(v, true) is serena (CRISIS_VOICE, one of VOICES) for all 9 ids; voiceFor(v, false) and voiceFor(v) are v; no per-voice set is exported', async () => {
  const cfg = await imp('server/config.js');
  const { voiceFor } = await imp('server/tts.js');
  assert.equal(cfg.CRISIS_VOICE, 'serena');
  assert.ok(cfg.VOICES.includes(cfg.CRISIS_VOICE));
  assert.deepEqual(cfg.VOICES, VOICES, 'the test and the server agree on the 9 ids');
  assert.equal(cfg.CRISIS_VOICE_FOR, undefined, 'Q35 retired the per-voice set');
  for (const v of cfg.VOICES) {
    assert.equal(voiceFor(v, true), 'serena', `${v} crisis`);
    assert.equal(voiceFor(v, false), v, `${v} normal`);
    assert.equal(voiceFor(v), v, `${v} default`);
  }
});

// ---------------------------------------------------------------- TC-282..TC-284 (FND-075, DES-049 as changed 2026-11-19, 03 Review fix R4)
const SLOW = '慢一点的一句话。';
const slowScript = { replies: [...script.replies, { when: SLOW, reply: '我慢慢想好了。', delayMs: 4000 }] };
const slowGateway = (voice) => ttsGateway({ dir: tmpDir(), files: { 'profile.json': R1_PROFILE.replace('\n}\n', `,\n  "voice": "${voice}"\n}\n`) }, script: slowScript });
const key = (lang, text) => `${lang}\n${text}`;
const serenaParts = (parts, who) => { for (const p of parts) { assert.deepEqual(p.line, ['serena'], `${who}: helper line for ${p.text}`); assert.deepEqual(p.done, [{ voice: 'serena', crisis: true }], `${who}: tts_done for ${p.text}`); } };

test('TC-282 REQ-075 (Q35, FND-075): clear a slow normal turn, then send a crisis line: after the abandoned turn ends (memory_turn skip gone) every crisis part, number included, is still serena', async () => {
  const gw = await slowGateway('ryan');
  try {
    const ac = new AbortController();
    const slow = fetch(`${gw.base}/api/respond`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line: SLOW, history: [] }), signal: ac.signal })
      .then(() => 'finished', (e) => e.name);
    await new Promise((r) => setTimeout(r, 500)); // the gateway's Bonsai call is under way
    ac.abort(); // the page's 清空
    assert.equal(await slow, 'AbortError');
    const body = await crisisTurn(gw, CRISIS_ZH, 'CN');
    assert.ok(body.speech.length >= 2);
    const t0 = Date.now();
    while (!gw.logs().some((l) => l.event === 'memory_turn' && l.skip === 'gone')) {
      assert.ok(Date.now() - t0 < 15000, 'the abandoned turn never logged memory_turn skip gone');
      await new Promise((r) => setTimeout(r, 100));
    }
    serenaParts(await readParts(gw, body), 'after the abandoned turn ended');
  } finally { await gw.stop(); }
});

test('TC-283 REQ-075 (Q35, FND-075): second client: client A has a crisis reply, client B gets a normal 200; A\'s parts are all serena, B\'s normal parts keep the chosen voice', async () => {
  const gw = await gateway('ryan');
  try {
    const a = await crisisTurn(gw, CRISIS_ZH, 'CN');
    const b = await say(gw, NORMAL);
    assert.equal(b.status, 200);
    assert.equal(b.json.crisis, false);
    serenaParts(await readParts(gw, a), 'client A after client B');
    for (const p of await readParts(gw, b.json)) {
      assert.deepEqual(p.line, ['ryan'], `B normal part ${p.text}`);
      assert.deepEqual(p.done, [{ voice: 'ryan', crisis: false }], `B normal tts_done ${p.text}`);
    }
  } finally { await gw.stop(); }
});

test('TC-284 REQ-075 (Q35, DES-049 CRISIS_KEEP = 3): four crisis replies (zh-CN, zh-US, en-CN, en-US): parts only in the first read the chosen voice; parts of replies 2..4 are serena', async () => {
  const gw = await gateway('ryan');
  try {
    const bodies = [];
    for (const [line, region] of [[CRISIS_ZH, 'CN'], [CRISIS_ZH, 'US'], [CRISIS_EN, 'CN'], [CRISIS_EN, 'US']]) bodies.push(await crisisTurn(gw, line, region));
    const later = new Set(bodies.slice(1).flatMap((r) => r.speech.map((t) => key(r.lang, t))));
    const onlyFirst = bodies[0].speech.filter((t) => !later.has(key(bodies[0].lang, t)));
    assert.ok(onlyFirst.length >= 1, `reply 1 has a part no later reply has: ${JSON.stringify(bodies.map((b) => b.speech))}`);
    for (const p of await readParts(gw, { ...bodies[0], speech: onlyFirst })) {
      assert.deepEqual(p.line, ['ryan'], `dropped crisis part ${p.text}`);
      assert.deepEqual(p.done, [{ voice: 'ryan', crisis: false }], `dropped crisis part tts_done ${p.text}`);
    }
    for (const [i, b] of bodies.slice(1).entries()) serenaParts(await readParts(gw, b), `kept reply ${i + 2}`);
  } finally { await gw.stop(); }
});
