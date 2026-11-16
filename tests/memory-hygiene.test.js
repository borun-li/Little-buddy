// TC-214 (a): no test can touch the user's real memory folder. be-tester #4. The before/after snapshot of
// ~/Library/Application Support/LittleBuddy around the whole suite (part b) is taken by the tester around `npm test` and recorded in 05.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ROOT } from './memory-helpers.js';

const files = readdirSync(`${ROOT}tests`).filter((n) => /\.(js|cjs|mjs)$/.test(n));
const src = (n) => readFileSync(`${ROOT}tests/${n}`, 'utf8');

test('TC-214 REQ-051: every test that starts server/main.js or opens a store uses a fresh temp data folder', () => {
  const spawners = []; const stores = []; const problems = [];
  for (const n of files.filter((f) => f !== 'memory-hygiene.test.js')) { // this file holds the patterns it looks for
    const t = src(n);
    // a spawn / fork of server/main.js (also through the shared startGateway helper)
    const spawnsMain = /(?:spawn|fork|execFile\w*)\([^)]*['"`]server\/main\.js['"`]/.test(t) || /startGateway\(/.test(t) || /['"`]server\/main\.js['"`]\s*,\s*['"`]--warm-only/.test(t);
    if (spawnsMain) {
      spawners.push(n);
      const sets = /LITTLEBUDDY_DATA_DIR/.test(t);
      const viaHelper = /startGateway\(\{[^}]*dir/.test(t) || /withGateway\(\{[^}]*dir/.test(t) || n === 'memory-helpers.js';
      if (!sets && !viaHelper) problems.push(`${n}: spawns server/main.js without LITTLEBUDDY_DATA_DIR`);
      if (sets && !/(mkTmp|mkdtemp|tmpDir|mkdtempSync)\(/.test(t)) problems.push(`${n}: sets LITTLEBUDDY_DATA_DIR but never from a temp-dir creator`);
      if (/LITTLEBUDDY_DATA_DIR\s*[:=]\s*['"`](?!\$)/.test(t) && !/relative\/dir/.test(t)) problems.push(`${n}: LITTLEBUDDY_DATA_DIR from a literal path`);
    }
    if (/\bcreateStore\(/.test(t)) {
      stores.push(n);
      for (const m of t.matchAll(/createStore\(\s*\{\s*dir\s*(?::\s*([^,}]+))?/g)) {
        const arg = (m[1] ?? 'dir').trim();
        if (/Library|homedir|process\.env/.test(arg)) problems.push(`${n}: createStore dir ${arg}`);
      }
      if (!/(mkTmp|mkdtemp|tmpDir|mkdtempSync|tmp)\(/.test(t) && !/dir:\s*\$\{?dir/.test(t)) problems.push(`${n}: createStore without a temp dir creator`);
    }
    if (/importMain|from '\.\.\/server\/main\.js'|imp\('server\/main\.js'\)/.test(t) && /\bmain\(/.test(t.replace(/\/\/.*$/gm, ''))) problems.push(`${n}: imports and calls main()`);
    if (/Application Support\/LittleBuddy/.test(t.replace(/\/\/.*$/gm, ''))) problems.push(`${n}: names the real folder`);
  }
  // positive control: the matcher finds the known spawn and store sites (previous round's spawn sites plus the new files)
  for (const known of ['server-boot.test.js', 'memory-helpers.js']) assert.ok(spawners.includes(known), `matcher finds ${known}`);
  for (const known of ['memory-dev.test.js', 'memory-store.test.js', 'memory-prompts.test.js']) assert.ok(stores.includes(known), `matcher finds createStore in ${known}`);
  assert.ok(spawners.length >= 4, `spawn sites found: ${spawners.join(', ')}`);
  console.log(`TC-214 scan: ${files.length} test files; spawn sites ${spawners.join(', ')}; createStore sites ${stores.join(', ')}`);
  assert.deepEqual(problems, []);
});
