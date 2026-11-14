// Q-005 / A2: keyword -> mood mapping of the fake layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodOf, KEYWORDS, MOODS } from '../web/js/fake/mood-keywords.js';

test('Q-005 every keyword maps to its own mood', () => {
  for (const [mood, words] of Object.entries(KEYWORDS.zh)) {
    for (const word of words) assert.equal(moodOf(`今天${word}。`), mood, word);
  }
});

test('Q-005 the four keyword moods and neutral are the 5 demo mood ids', () => {
  assert.deepEqual([...Object.keys(KEYWORDS.zh), 'neutral'].sort(), [...MOODS].sort());
});

test('Q-005 no keyword -> neutral', () => {
  assert.equal(moodOf('嗯，刚到家。'), 'neutral');
  assert.equal(moodOf(''), 'neutral');
});

test('Q-005 the last keyword in the line wins', () => {
  assert.equal(moodOf('有点难过，不过现在很开心'), 'pleasant-high');
  assert.equal(moodOf('很开心，不过现在有点难过'), 'unpleasant-low');
  assert.equal(moodOf('先是焦虑，后来放松了'), 'pleasant-low');
});

test('Q-005 a longer keyword ending at the same place wins (不开心 is sad, not happy)', () => {
  assert.equal(moodOf('今天不开心'), 'unpleasant-low');
});

test('Q-005 demo lines: happy line smiles, sad line is sad', () => {
  assert.equal(moodOf('今天考试过了，好开心！'), 'pleasant-high');
  assert.equal(moodOf('可是晚上和朋友吵架了，有点难过。'), 'unpleasant-low');
  assert.equal(moodOf('难过。'), 'unpleasant-low');
});
