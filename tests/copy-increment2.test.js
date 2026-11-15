// Q-021: increment 2 words in both languages, and the {name} keys following the saved name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY, copy, setLang, setName, getName } from '../web/js/copy.js';

const NEW_KEYS = ['defaultName', 'speaker', 'speakerOn', 'speakerOff', 'speakerNotReady', 'breathOffer', 'breathStop',
  'breathStopName', 'breathIn', 'breathOut', 'breathName', 'crisisLabel', 'crisisTitle', 'crisis988', 'crisis911',
  'crisisClose', 'crisisCloseName', 'clear', 'clearName', 'pokeHelp', 'pokes', 'renameName', 'nameLabel', 'nameNote'];
const NAME_KEYS = ['title', 'inputLabel', 'typing', 'hints.warming', 'hints.awake', 'hints.unreachable',
  'hints.stillDown', 'hints.sendUnavailable', 'hints.sendTimeout'];
const get = (o, k) => k.split('.').reduce((x, p) => x[p], o);
const reset = (l = 'zh') => { setName(null); setLang(l); };

test('Q-021 every new key and hints.cleared exists in zh and en', () => {
  for (const l of ['zh', 'en']) {
    for (const k of [...NEW_KEYS, 'hints.cleared']) assert.ok(get(COPY[l], k) !== undefined, `${l}.${k}`);
    assert.equal(COPY[l].pokes.length, 3);
  }
});

test('Q-021 exact words from Words (increment 2)', () => {
  assert.equal(COPY.zh.breathIn(4), '吸气… 4');
  assert.equal(COPY.en.breathOut(6), 'Breathe out… 6');
  assert.equal(COPY.zh.breathName('阿福'), '阿福，陪你深呼吸');
  assert.equal(COPY.en.renameName('Mo'), 'Rename, now called Mo');
  assert.equal(COPY.zh.crisis911, '如果有立即的危险，请打 911。');
  assert.equal(COPY.en.hints.cleared, 'Chat cleared. Start fresh any time.');
  assert.deepEqual(COPY.zh.pokes, ['嘿嘿，好痒', '哎呀！', '在呢在呢']);
  assert.equal(COPY.en.nameNote, 'The name is saved on this computer, up to 12 characters.');
});

test('Q-021 memory words are not added', () => {
  for (const l of ['zh', 'en']) {
    assert.ok(!Object.keys(COPY[l]).some((k) => /^memory/i.test(k) || k === 'privacyMemory'), l);
    assert.ok(!('forgotten' in COPY[l].hints), l);
  }
});

test('Q-021 default name leaves the increment-1 words unchanged in both languages', () => {
  for (const l of ['zh', 'en']) {
    reset(l);
    for (const k of NAME_KEYS) assert.equal(get(copy, k), get(COPY[l], k), `${l}.${k}`);
    assert.equal(copy.companionCaption('x'), COPY[l].companionCaption('x'));
    assert.equal(copy.companionName('x'), COPY[l].companionName('x'));
  }
  assert.equal(copy.title, 'Little Buddy');
  reset();
  assert.equal(copy.title, '小伙伴');
});

test('Q-021 a saved name replaces the default in the 11 keys, in both languages', () => {
  setName('阿福');
  for (const l of ['zh', 'en']) {
    setLang(l);
    assert.equal(getName(), '阿福');
    for (const k of NAME_KEYS) {
      const v = get(copy, k);
      assert.ok(v.includes('阿福'), `${l}.${k}`);
      assert.ok(!v.includes(COPY[l].defaultName), `${l}.${k}`);
    }
    assert.ok(copy.companionCaption('p').startsWith(l === 'zh' ? '阿福 · ' : '阿福 · '));
    assert.ok(copy.companionName('w').includes('阿福'));
    assert.ok(!copy.privacy.includes('阿福'));
  }
  reset();
});

test('Q-021 setName: empty or a default name in either language reads as the default; no regex surprises', () => {
  for (const n of [null, undefined, '', '   ', '小伙伴', 'Little Buddy']) {
    setName('Mo');
    assert.equal(setName(n), COPY.zh.defaultName, String(n));
  }
  setLang('en');
  assert.equal(getName(), 'Little Buddy');
  setName('$& (a)');
  assert.equal(copy.title, '$& (a)');
  reset();
});

test('Q-021 the tables are never mutated by a name', () => {
  setName('Zed');
  assert.equal(COPY.en.title, 'Little Buddy');
  assert.equal(COPY.zh.hints.awake, '小伙伴醒了，说说看吧。');
  reset();
});
