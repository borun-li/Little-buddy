// fe-tester #4, round 2: Q-012 warming table (from 01-ux.md), Q-008 20-turn capture, Q-019/FND-003 words.
// Expected values come from docs/frontend/01-ux.md, not from web/js.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COPY } from '../web/js/copy.js';
const { createHealthWatch } = await import('../web/js/health-watch.js');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Q-012 warming table: warming -> voiceNotReady -> awake (4 s) -> empty; down 30 s -> stillDown', async () => {
  mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const seq = [{ bonsai: 'starting', stt: 'starting' }, { bonsai: 'ready', stt: 'starting' }, { bonsai: 'ready', stt: 'ready' }];
  let i = 0; const seen = [];
  const watch = createHealthWatch({ health: async () => seq[Math.min(i++, 2)], onChange: (s) => seen.push([s.hint, s.canSend, s.canVoice, s.waking]), now: () => Date.now() });
  watch.start(); await flush();
  assert.deepEqual(seen.at(-1), ['warming', false, false, true]);
  mock.timers.tick(2000); await flush();
  assert.deepEqual(seen.at(-1), ['voiceNotReady', true, false, false]);
  mock.timers.tick(2000); await flush();
  assert.deepEqual(seen.at(-1), ['awake', true, true, false]);
  mock.timers.tick(3999); await flush();
  assert.equal(seen.at(-1)[0], 'awake');
  mock.timers.tick(1); await flush();
  assert.equal(seen.at(-1)[0], null);
  watch.stop();
  const down = []; const w2 = createHealthWatch({ health: async () => { throw new Error('x'); }, onChange: (s) => down.push(s.hint), now: () => Date.now() });
  w2.start(); await flush();
  assert.equal(down.at(-1), 'unreachable');
  for (let t = 0; t < 14; t++) { mock.timers.tick(2000); await flush(); }
  assert.equal(down.at(-1), 'unreachable'); // 28 s
  for (let t = 0; t < 2; t++) { mock.timers.tick(2000); await flush(); }
  assert.equal(down.at(-1), 'stillDown'); // 32 s
  w2.stop(); mock.timers.reset();
});

test('Q-019 FND-003 the listening announcement and mic-opening words equal the Words table', () => {
  assert.equal(COPY.zh.listeningNow, '在听');
  assert.equal(COPY.en.listeningNow, 'Listening');
  assert.equal(COPY.zh.hints.micOpening, '麦克风正在打开，提示“在听”时再开口。');
  assert.equal(COPY.en.hints.micOpening, 'Opening the mic. Start talking when it says Listening.');
});

test('Q-008 the 20-turn capture alternates you / reply in order with one typing dots node last', () => {
  const dir = new URL('../docs/frontend/evidence/verify-2/', import.meta.url);
  const aria = readFileSync(new URL('q008-long@laptop.aria.yml', dir), 'utf8');
  const items = [...aria.matchAll(/- listitem: (.*)/g)].map((m) => m[1]);
  assert.equal(items.length, 22); // 10 settled exchanges + "Good night." + pending
  const sent = ['Hi.', 'Long day.', 'Tea now.', 'My boss praised me.', 'I missed dinner.', 'They were good.', 'She sounds well.', 'Maybe a walk tomorrow.', 'I like comedies.', 'Thanks.', 'Good night.'];
  assert.deepEqual(items.filter((_, k) => k % 2 === 0 && k < 22), sent); // own turns, in the order sent
  assert.equal(items.at(-1), 'Little Buddy is replying');
  assert.equal(items.at(-2), 'Good night.');
  assert.deepEqual(items.slice(0, 4), ['Hi.', 'Hello! How\'s your day going?', 'Long day.', 'That sounds exhausting. Did something specific happen to make it so long?']);
  const dom = readFileSync(new URL('q008-long@laptop.dom.html', dir), 'utf8');
  assert.equal((dom.match(/class="turn turn--reply"/g) || []).length, 10);
  assert.equal((dom.match(/class="turn turn--you"/g) || []).length, 11);
  assert.equal((dom.match(/turn--typing/g) || []).length, 1);
});
