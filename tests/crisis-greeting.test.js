// be-developer #8 unit checks for FND-025 (Acceptance, 2026-11-15): near variants of the fond greeting 想死你了 no longer raise
// the crisis flag; real crisis lines still do (A22: a miss is worse than a false alarm, so the greeting is removed at end of clause only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GREETING_EXCEPTIONS, isCrisis } from '../server/crisis.js';

test('FND-025 REQ-023 isCrisis: greeting variants (particles, 啦, 妳/們, bare 我想死你, emoji, ~) are not crisis', () => {
  for (const l of ['想死你了', '想死你了！', '想死你了啊', '想死你了呀', '想死你啦', '想死你啦～', '想死妳了', '想死你們了！', '我想死你', '好想死你。',
    '想死您了哈哈', '你可想死我了。', '想死我啦', '想死你了😘', '我想死你了，好久不见', '想死你了 啊', '想死你喽~', '想死你们咯！']) {
    assert.equal(isCrisis(l), false, l);
  }
  for (const g of GREETING_EXCEPTIONS) assert.equal(isCrisis(g), false, `base form ${g}`);
});

test('FND-025 REQ-023 isCrisis: real crisis lines, including greeting-like starts that go on, stay crisis', () => {
  for (const l of ['我想死你们都不懂我', '我想死你别管我', '我想死您别劝我了', '我想死我了真的撑不下去', '真的好想死你们根本不在乎', '想死你了，可我真的想死',
    '想死你了，但我也不想活了', '我想死', '我好想死啊', '想死。', '想死你啊别管我', '想死我', '我想死妳們都不懂我', '想死你了啊，其实我不想活了']) {
    assert.equal(isCrisis(l), true, l);
  }
});
