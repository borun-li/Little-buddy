// R2 Full Phase 5 amendment A3 (fake helper): TC-277..TC-281, DES-049 (main.js crisisSpeech) and DES-050 (tts.js voiceFor, config CRISIS_VOICE_FOR).
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
test('TC-277 [FX-027-01] REQ-075 (A3, DES-049/050): ryan and eric crisis parts (zh and en, US and CN) are read by serena: helper line voice and tts_done.voice', async () => {
  for (const voice of ['ryan', 'eric']) {
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
test('TC-278 [FX-027-01] REQ-075 (A3): dylan keeps dylan on crisis parts (tts_done.crisis is true, the voice is not changed); the other 6 voices outside the set too', async () => {
  const keep = VOICES.filter((v) => !['ryan', 'eric'].includes(v));
  assert.ok(keep.includes('dylan') && keep.length === 7);
  for (const voice of keep) {
    const gw = await gateway(voice);
    try {
      const body = await crisisTurn(gw, CRISIS_ZH, 'CN');
      const parts = await readParts(gw, body);
      for (const p of parts) {
        assert.deepEqual(p.line, [voice], `${voice}: helper line for ${p.text}`);
        assert.deepEqual(p.done, [{ voice, crisis: true }], `${voice}: tts_done for ${p.text}`);
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
test('TC-280 REQ-075 (A3, DES-049 step 3-4): an old crisis part spoken after a non-crisis reply keeps the chosen voice (ryan); a part of the latest crisis reply still reads serena; the same part in another language is not a crisis part', async () => {
  const gw = await gateway('ryan');
  try {
    const crisis = await crisisTurn(gw, CRISIS_ZH, 'CN');
    const old = crisis.speech[0];
    const fresh = await readParts(gw, { ...crisis, speech: [old] });
    assert.deepEqual(fresh[0].line, ['serena'], 'control: right after the crisis turn the part reads serena');
    const t = await say(gw, NORMAL); // replaces the set (every respond 200)
    assert.equal(t.json.crisis, false);
    assert.ok(!t.json.speech.includes(old), 'probe text is not a part of the normal reply');
    const after1 = await readParts(gw, { ...crisis, speech: [old] });
    assert.deepEqual(after1[0].line, ['ryan'], 'old crisis part after a normal reply');
    assert.deepEqual(after1[0].done, [{ voice: 'ryan', crisis: false }]);
    // a new crisis turn brings it back, and the same text asked as the other language is not marked
    const again = await crisisTurn(gw, CRISIS_ZH, 'CN');
    const asEn = await speak(gw, again.speech[0], 'en');
    assert.equal(asEn.status, 200);
    assert.equal(gw.lines().at(-1).voice, 'ryan', 'same text, lang en: not a crisis part');
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['serena']);
    // a profile voice change between the turn and the reading is followed, as before (B-4): eric on a crisis part is serena, dylan is dylan
    assert.equal((await postProfile(gw, { voice: 'dylan' })).status, 200);
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['dylan']);
    assert.equal((await postProfile(gw, { voice: 'eric' })).status, 200);
    assert.deepEqual((await readParts(gw, { ...again, speech: [again.speech[0]] }))[0].line, ['serena']);
  } finally { await gw.stop(); }
});

// ---------------------------------------------------------------- TC-281
test('TC-281 REQ-075 (DES-050): CRISIS_VOICE_FOR is a subset of VOICES, excludes CRISIS_VOICE (serena), is not empty; voiceFor maps only crisis x member', async () => {
  const { CRISIS_VOICE, CRISIS_VOICE_FOR, VOICES: ALL } = await imp('server/config.js');
  const { voiceFor } = await imp('server/tts.js');
  assert.ok(CRISIS_VOICE_FOR.length > 0);
  assert.ok(CRISIS_VOICE_FOR.every((v) => ALL.includes(v)), `CRISIS_VOICE_FOR ${CRISIS_VOICE_FOR} within VOICES`);
  assert.ok(!CRISIS_VOICE_FOR.includes(CRISIS_VOICE) && !CRISIS_VOICE_FOR.includes('serena'));
  assert.ok(ALL.includes(CRISIS_VOICE) && CRISIS_VOICE === 'serena');
  assert.deepEqual(ALL, VOICES, 'the test and the server agree on the 9 ids');
  for (const v of ALL) {
    assert.equal(voiceFor(v, true), CRISIS_VOICE_FOR.includes(v) ? CRISIS_VOICE : v, `${v} crisis`);
    assert.equal(voiceFor(v, false), v, `${v} normal`);
    assert.equal(voiceFor(v), v, `${v} default`);
  }
  assert.deepEqual([...CRISIS_VOICE_FOR].sort(), ['eric', 'ryan'], 'the set is the one FX-027-01 (approved) scores: ryan and eric to serena, the other 7 themselves');
});
