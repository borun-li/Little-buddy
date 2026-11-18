// R2 Full, group D (footprint): TC-268. be-tester #1. Plan: docs/backend/04-test-plan.md. The same four sets (characters, items, slots, voices) are
// declared in several places that nothing else ties together: the backend validator, the contract, the page's data layer, the page's art and
// copy, the page's templates, the offline voice samples and the Swift helper's accepted speakers. One test reads them all and compares as sets
// (the page lists voices in its own display order, so order is not compared). No process is started.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { imp, ROOT } from './r2-helpers.js';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const set = (a) => [...a].map(String).sort();
const same = (a, b, what) => assert.deepEqual(set(a), set(b), what);
const contract = read('contracts/FRONTEND_BACKEND_CONTRACT.md');
const sec = contract.slice(contract.indexOf('## R2 seam'), contract.indexOf('## 3. Open items'));
const rowOf = (prefix) => sec.split('\n').find((l) => l.startsWith(prefix));

// the raw values of `enum Qwen3Speaker: String` in the dependency the helper links (cases, with the `= "x"` overrides)
function swiftSpeakers() {
  const src = read('stt/.build/checkouts/argmax-oss-swift/Sources/TTSKit/Qwen3TTS/Qwen3Models.swift');
  const body = /enum Qwen3Speaker: String[^{]*\{([\s\S]*?)public var tokenID/.exec(src)[1];
  const out = [];
  for (const m of body.matchAll(/^\s*case\s+(.+)$/gm)) for (const item of m[1].split(',')) { const [name, raw] = item.split('=').map((s) => s.trim()); out.push(raw ? raw.replace(/"/g, '') : name); }
  return out;
}

test('TC-268 REQ-073/076/077: characters, items, slots and voices are the same set in the backend, the contract, the page, the art, the templates, the samples and the Swift helper', async () => {
  const VOICES = ['ryan', 'aiden', 'ono-anna', 'sohee', 'eric', 'dylan', 'serena', 'vivian', 'uncle-fu']; // the contract's own list, written once here and checked against every source
  const cfg = await imp('server/config.js');
  const mf = await imp('server/memory-files.js');
  const page = await imp('web/js/look-client.js');
  const art = await imp('web/js/look-art.js');
  const copy = await imp('web/js/look-copy.js');

  // voices
  same(cfg.VOICES, VOICES, 'server/config.js VOICES');
  same(page.VOICES, VOICES, 'web/js/look-client.js VOICES');
  same(swiftSpeakers(), VOICES, 'Swift Qwen3Speaker raw values (what companion-tts accepts)');
  const contractVoices = [...rowOf('| `voice`').split('|')[2].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
  same(contractVoices, VOICES, 'contract § R2 seam voice row');
  const wavs = readdirSync(join(ROOT, 'web/audio/voices')).filter((f) => f.endsWith('.wav'));
  same(wavs, VOICES.flatMap((v) => [`${v}-zh.wav`, `${v}-en.wav`]), 'offline samples: 9 voices x zh, en (18 files)');
  same(Object.keys(copy.LOOK_COPY.zh.voice), VOICES, 'page copy (zh) describes every voice');
  same(Object.keys(copy.LOOK_COPY.en.voice), VOICES, 'page copy (en) describes every voice');

  // characters
  same(mf.CHARACTERS, [1, 2, 3], 'server/memory-files.js CHARACTERS');
  same(page.CHARACTERS, mf.CHARACTERS, 'page CHARACTERS');
  assert.equal(art.CHARACTER_IDS.length, mf.CHARACTERS.length, 'page art: one character id each');
  const html = read('web/index.html');
  const tplChars = new Set([...html.matchAll(/id="mood-([a-z]+)-([a-z-]+)"/g)].map((m) => m[1]));
  same(tplChars, art.CHARACTER_IDS, 'index.html mood templates: one set per character id');
  assert.equal([...html.matchAll(/id="mood-[a-z]+-[a-z-]+"/g)].length, mf.CHARACTERS.length * 5, '3 characters x 5 moods');
  for (const lang of ['zh', 'en']) assert.equal(copy.LOOK_COPY[lang].characterName.length, mf.CHARACTERS.length, `${lang} character names`);
  assert.match(contract, /character: 1\\\|2\\\|3/, 'contract look row: character 1|2|3');

  // items and slots
  same(mf.ITEMS, [1, 2, 3], 'server/memory-files.js ITEMS');
  same(page.ITEMS, mf.ITEMS, 'page ITEMS');
  same(mf.LOOK_SLOTS, ['head', 'clothes', 'shoes', 'accessory'], 'server/memory-files.js LOOK_SLOTS');
  same(page.SLOTS, mf.LOOK_SLOTS, 'page SLOTS');
  same(Object.keys(art.ITEM_IDS), mf.LOOK_SLOTS, 'page art slots');
  for (const s of mf.LOOK_SLOTS) {
    assert.equal(art.ITEM_IDS[s].length, mf.ITEMS.length, `page art: ${s} has one id per item`);
    for (const lang of ['zh', 'en']) assert.equal(copy.LOOK_COPY[lang].itemName[s].length, mf.ITEMS.length, `${lang} item names for ${s}`);
  }
  const lookRow = rowOf('| `look`');
  for (const s of mf.LOOK_SLOTS) assert.ok(lookRow.includes(s), `contract look row names ${s}`);
  assert.match(lookRow, /'none'\\\|1\\\|2\\\|3/, "contract look row: slot value 'none'|1|2|3");
  assert.deepEqual([page.SLOTS.length, page.ITEMS.length], [4, 3]);
});
