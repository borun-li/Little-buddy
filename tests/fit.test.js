// Q-032: the new controls fit both sizes and both languages. CSS rules pinned from the browser measurements (headless Chrome, 1440/960/768/390/375).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/css/page.css', import.meta.url), 'utf8');

test('Q-032 phone stage: 6 + 228 art + 4 + 36 row + 6 = 280, the art shrinks (flex-shrink) when the row wraps', () => {
  const m = css.match(/@media \(max-width: 959px\) \{([^}]*\}[^}]*\}[^}]*)\}/);
  assert.ok(m, 'phone media block');
  assert.match(m[1], /\.page \.stage \{ padding: 6px 16px; \}/);
  assert.match(m[1], /\.page \.companion \{[^}]*height: 228px;[^}]*flex: 0 1 228px;/);
});

test('Q-032 targets: toggle 36x36, clear 36 tall, chip 36 tall, name button padded to at least 28 px', () => {
  assert.match(css, /\.speaker-toggle \{[^}]*width: 36px; height: 36px;/);
  assert.match(css, /\.stage-clear \{[^}]*height: 36px;/);
  assert.match(css, /\.breath-chip \{[^}]*height: 36px;/);
  assert.match(css, /\.caption__name \{[^}]*padding: 4px 0;/);
});

test('Q-032 tooltip and rename note stay inside the screen: capped to the viewport, laptop capped to the narrow 960 px stage', () => {
  assert.match(css, /\.speaker-tip \{[^}]*max-width: min\(240px, calc\(100vw - 16px\)\)/);
  assert.match(css, /\.caption__note \{[^}]*max-width: min\(358px, calc\(100vw - 16px\)\)/);
  assert.match(css, /\.speaker-tip \{[^}]*left: 50%; transform: translateX\(-50%\); max-width: min\(240px, calc\(100vw - 672px\)\)/);
  assert.match(css, /\.caption__note \{[^}]*max-width: min\(540px, calc\(100vw - 672px\)\)/);
});
