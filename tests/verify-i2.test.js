// Phase 4 verification, increment 2 (fe-tester #9). Q-### in every title.
// Expected values are typed from docs/frontend/01-ux.md (Words, increment 2 and the PAGE-001 state rows) and the
// FRAME-017..024 exports, never read back from web/js/copy.js. Capture tests read the files the orchestrator took
// (VERIFY_DIR overrides the folder, used for the copy-aside mutation runs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextPoke, POKES } from '../web/js/poke.js';

const DIR = process.env.VERIFY_DIR || fileURLToPath(new URL('../docs/frontend/evidence/verify-4/', import.meta.url));
const cap = (id, ext) => readFileSync(`${DIR}/${id}${ext}`, 'utf8');
const aria = (id) => cap(id, '.aria.yml').split('\n').map((l) => l.trimEnd());
const has = (lines, text) => lines.filter((l) => l.trim() === text).length;

// FLOW-012: "six pokes, three or more reactions, none twice running" must hold for every draw of the random
// source, because the user's six pokes are one draw. Enumerates every sequence of six draws from {0, .4, .99}.
test('Q-024 six pokes show three or more reactions and none twice running, for every sequence of draws', () => {
  const draws = [0, 0.4, 0.99];
  const bad = [];
  for (let n = 0; n < 3 ** 6; n++) {
    let rest = n; const seq = []; let prev = null;
    for (let k = 0; k < 6; k++) { const r = draws[rest % 3]; rest = Math.floor(rest / 3); prev = nextPoke(prev, () => r); seq.push(prev); }
    const twice = seq.some((p, k) => k && p === seq[k - 1]);
    if (new Set(seq).size < 3 || twice) bad.push(seq.join(''));
  }
  assert.deepEqual(bad, []);
  assert.equal(POKES.length, 3);
});

test('Q-022 the cleared capture has an empty log, the cleared hint and the empty-state words (en)', () => {
  const a = aria('i2-q022-cleared@laptop');
  assert.equal(has(a, '- log "Chat"'), 1); // no colon: the log has no children
  assert.equal(has(a, '- status: Chat cleared. Start fresh any time.'), 1);
  assert.equal(has(a, '- paragraph: Say anything you like. Hold to talk, or just type.'), 1);
  assert.equal(has(a, '- button "Little Buddy, listening"'), 1); // neutral
});

test('Q-023 renaming shows the Name field and the note; renamed shows the new name in every place (en)', () => {
  const r = aria('i2-q023-renaming@laptop');
  assert.equal(has(r, '- textbox "Name": Little Buddy'), 1);
  assert.equal(has(r, '- paragraph: The name is saved on this computer, up to 12 characters.'), 1);
  const d = aria('i2-q023-renamed@laptop');
  assert.equal(has(d, '- button "Mochi, listening"'), 1);
  assert.equal(has(d, '- button "Rename, now called Mochi": Mochi'), 1);
  assert.equal(has(d, '- textbox "What you want to tell Mochi":'), 1);
  assert.equal(d.some((l) => l.includes('Little Buddy')), false);
});

test('Q-026 muted capture: toggle off with the muted tooltip; speaking capture: toggle on and speaking', () => {
  const m = aria('i2-q026-muted@laptop');
  assert.equal(has(m, '- button "Read replies aloud"'), 1); // not [pressed]
  assert.equal(has(m, '- tooltip "Muted. Click to read replies aloud."'), 1);
  const dm = cap('i2-q026-muted@laptop', '.dom.html');
  assert.match(dm, /class="speaker-toggle is-muted"[^>]*aria-pressed="false"/);
  const ds = cap('i2-q025-speaking@laptop', '.dom.html');
  assert.match(ds, /class="speaker-toggle is-speaking"[^>]*aria-pressed="true"/);
});

test('Q-028 an unpleasant-high reply carries the chip as its own log item; a crisis reply carries none', () => {
  const o = aria('i2-q028-offer@laptop');
  const at = o.findIndex((l) => l.trim() === '- log "Chat":');
  assert.deepEqual(o.slice(at + 1, at + 6).map((l) => l.trim()), [
    '- listitem: I have to give a presentation tomorrow and I\'m a bit anxious.',
    '- listitem: That\'s totally normal! You\'ve got this.',
    '- listitem:',
    '- button "Breathe together?"',
    '- status',
  ]);
  assert.match(cap('i2-q028-offer@laptop', '.dom.html'), /data-mood="unpleasant-high"/);
  const c = aria('i2-q030-crisis@laptop');
  assert.equal(c.some((l) => l.includes('深呼吸')), false);
});

test('Q-029 breathing capture: calm name, phase word without seconds, 停下 chip as Stop, turn mood kept, swell 1.08', () => {
  const a = aria('i2-q029-breathing@laptop');
  assert.equal(has(a, '- button "Little Buddy, breathing with you"'), 1);
  assert.equal(has(a, '- status: Breathe out'), 1);
  assert.equal(has(a, '- button "Stop breathing": Stop'), 1);
  assert.match(cap('i2-q029-breathing@laptop', '.dom.html'), /data-mood="unpleasant-high"/);
  const s = JSON.parse(cap('i2-q029-breathing@laptop', '.styles.json'));
  assert.deepEqual(s.elements.map((e) => e.transform), ['matrix(1.08, 0, 0, 1.08, 0, 0)']);
});

test('Q-030 crisis capture (zh): one region 求助方式 with the three Words lines and the close button, under the reply', () => {
  const c = aria('i2-q030-crisis@laptop');
  const at = c.findIndex((l) => l.trim() === '- region "求助方式":');
  assert.ok(at > 0);
  assert.equal(c.filter((l) => l.includes('region')).length, 1);
  assert.deepEqual(c.slice(at + 1, at + 12).map((l) => l.trim()), [
    '- paragraph: 你不是一个人，随时可以找人聊聊。',
    '- paragraph:',
    '- text: 在美国，打电话或发短信到',
    '- strong: "988"',
    '- text: （自杀与危机生命线），24 小时都有人。',
    '- paragraph:',
    '- text: 如果有立即的危险，请打',
    '- strong: "911"',
    '- text: 。',
    '- button "收起求助方式": 收起',
    '- status',
  ]);
  assert.equal(c[at - 1].trim(), '- listitem:'); // its own log item, right after the reply item
  assert.match(c[at - 2], /listitem: 我在呢/);
});

// Round 2 (fe-tester #10): captures of verify-5 (VERIFY5_DIR overrides, used for the copy-aside mutation runs).
const DIR5 = process.env.VERIFY5_DIR || fileURLToPath(new URL('../docs/frontend/evidence/verify-5/', import.meta.url));
const cap5 = (id, ext) => readFileSync(`${DIR5}/${id}${ext}`, 'utf8');
const aria5 = (id) => cap5(id, '.aria.yml').split('\n').map((l) => l.trimEnd());

// FND-010: after five turns the crisis card is the last log item, right after the reply that names 988, one card.
test('Q-030 round 2: after five turns the crisis card is the last log item, right under the 988 reply, with the three lines (en)', () => {
  for (const size of ['laptop', 'phone']) {
    const c = aria5(`i2-fnd010-long-crisis@${size}`);
    assert.equal(c.filter((l) => l.includes('region')).length, 1);
    const at = c.findIndex((l) => l.trim() === '- region "Ways to get help":');
    assert.ok(at > 0, size);
    assert.equal(c[at - 1].trim(), '- listitem:');
    assert.match(c[at - 2], /listitem: .*call or text 988 anytime/);
    assert.deepEqual(c.slice(at + 1, at + 10).map((l) => l.trim()), [
      "- paragraph: You're not alone. You can talk to someone any time.",
      '- paragraph:',
      '- text: In the US, call or text',
      '- strong: "988"',
      '- text: (Suicide & Crisis Lifeline), any time, day or night.',
      '- paragraph:',
      "- text: If you're in immediate danger, call",
      '- strong: "911"',
      '- text: .',
    ]);
    assert.equal(c[at + 10].trim(), '- button "Close ways to get help": Close');
    assert.equal(c[at + 11].trim(), '- status'); // the card is the last item of the log
    assert.ok(c.filter((l) => l.includes('listitem')).length >= 11); // at least five turns of two items, plus the card
  }
});

// FND-011: a six-character Chinese name in the rename field gets a width from its rendered text, not from the count.
test('Q-023 round 2: renaming with a Chinese name shows the 名字 field holding 团子团子团子, wide enough for six full-width characters (zh)', () => {
  for (const [size, lo, hi] of [['phone', 84, 140], ['laptop', 100, 200]]) {
    const c = aria5(`i2-fnd011-rename-zh@${size}`);
    assert.equal(c.filter((l) => l.trim() === '- textbox "名字": 团子团子团子').length, 1);
    assert.equal(c.filter((l) => l.trim() === '- paragraph: 名字记在这台电脑上，最多 12 个字。').length, 1);
    const w = Number(/class="name-field"[^>]*style="width: (\d+)px;"/.exec(cap5(`i2-fnd011-rename-zh@${size}`, '.dom.html'))?.[1]);
    assert.ok(w >= lo && w <= hi, `${size} width ${w}`);
  }
});
