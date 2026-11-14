// Q-006 / REQ-008: the page names no host but localhost, and every file it loads is local and exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
// XML namespace names are identifiers, not requests.
const NAMESPACES = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function files(dir, exts) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}
const pageFiles = files(WEB, ['.html', '.css', '.js']);

test('Q-006 REQ-008 there are page files to check', () => {
  assert.ok(pageFiles.length >= 10, `${pageFiles.length} files`);
});

test('Q-006 REQ-008 no page file names a host other than localhost', () => {
  const hits = [];
  for (const p of pageFiles) {
    const src = readFileSync(p, 'utf8');
    // absolute URLs with a scheme, and protocol-relative URLs inside quotes or url()
    const urls = [
      ...[...src.matchAll(/\b(?:https?|wss?):\/\/[^\s"'()<>`]+/g)].map((m) => m[0]),
      ...[...src.matchAll(/["'(`]\s*(\/\/[^\s"'()<>`]+)/g)].map((m) => `http:${m[1]}`),
    ];
    for (const url of urls) {
      if (NAMESPACES.has(url)) continue;
      const host = url.replace(/^[a-z]+:\/\//, '').split(/[/:?#]/)[0];
      if (!LOCAL_HOSTS.has(host)) hits.push(`${relative(WEB, p)}: ${url}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('Q-006 REQ-008 every src, href and CSS url() points to a local file that exists', () => {
  const missing = [];
  let checked = 0;
  for (const p of pageFiles) {
    const src = readFileSync(p, 'utf8');
    const refs = [
      ...[...src.matchAll(/\b(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/(?:import|from)\s*\(?\s*['"](\.[^'"]+)['"]/g)].map((m) => m[1]),
    ].filter((r) => !r.startsWith('data:') && !NAMESPACES.has(r));
    for (const ref of refs) {
      checked += 1;
      if (/^[a-z]+:|^\/\//i.test(ref)) { missing.push(`${relative(WEB, p)}: remote ${ref}`); continue; }
      if (!existsSync(join(dirname(p), ref))) missing.push(`${relative(WEB, p)}: ${ref}`);
    }
  }
  assert.ok(checked >= 10, `only ${checked} references found`);
  assert.deepEqual(missing, []);
});

test('Q-006 the voice font is the bundled WenKai subset, shipped with its licence', () => {
  const css = readFileSync(join(WEB, 'css/tokens.css'), 'utf8');
  const face = css.match(/@font-face\s*{[^}]*}/)?.[0] ?? '';
  assert.match(face, /url\("\.\.\/fonts\/lxgw-wenkai-subset\.woff2"\)/);
  assert.doesNotMatch(face, /local\(/, 'a local() source would hide a missing bundled file');
  const font = readFileSync(join(WEB, 'fonts/lxgw-wenkai-subset.woff2'));
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.match(readFileSync(join(WEB, 'fonts/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('Q-006 icons referenced with <use href="#..."> are inline symbols', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const js = pageFiles.filter((p) => p.endsWith('.js')).map((p) => readFileSync(p, 'utf8')).join('\n');
  const used = new Set([...(html + js).matchAll(/["'`#](i-[\w-]+)/g)].map((m) => m[1]));
  const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map((m) => m[1]));
  assert.ok(used.size >= 4, [...used].join(','));
  assert.deepEqual([...used].filter((id) => !defined.has(id)), []);
});
