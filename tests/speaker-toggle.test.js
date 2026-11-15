// Q-026: the toggle's wiring in the page (static checks) and its words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copy, setLang } from '../web/js/copy.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Q-026 index.html: toggle in the caption slot, on at open, tooltip linked, three Lucide symbols', () => {
  const html = read('web/index.html');
  assert.match(html, /class="caption__speaker"><button[^>]*class="speaker-toggle"[^>]*aria-pressed="true"[^>]*aria-describedby="speaker-tip"/);
  assert.match(html, /id="speaker-tip" class="speaker-tip" role="tooltip"/);
  for (const id of ['i-volume-2', 'i-volume-x', 'i-volume']) assert.match(html, new RegExp(`<symbol id="${id}"`));
});

test('Q-026 app.js: gate = toggle AND tts ready; mute stops; tts failures reach the watch; no tts hint', () => {
  const app = read('web/js/app.js');
  assert.match(app, /let speakerOn = true;/);
  assert.match(app, /isEnabled: \(\) => speakerOn && watch\.ttsReady/);
  assert.match(app, /if \(!speakerOn\) speaker\.stop\(\)/);
  assert.match(app, /watch\.ttsFailed\(err\?\.code\)/);
  assert.match(app, /onTts: \(\) => renderSpeaker\(\)/);
  assert.doesNotMatch(app, /showHint\('speaker/);
});

test('Q-026 the three tooltip words exist in zh and en', () => {
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    for (const k of ['speaker', 'speakerOn', 'speakerOff', 'speakerNotReady']) assert.ok(copy[k], `${lang}.${k}`);
  }
  setLang('zh');
});
