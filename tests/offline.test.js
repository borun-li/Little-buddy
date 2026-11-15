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

// ---- Q-033 / REQ-014, REQ-029: the page with voice (read-aloud, breathing, poke, card, rename) is still offline.
const appJs = pageFiles.filter((p) => p.endsWith('.js') && !p.includes(`${join('js', 'fake')}`));
const read = (p) => readFileSync(p, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

test('Q-033 REQ-014 the only network call in page code is the one fetch seam, and its paths are same-origin /api/ paths', () => {
  const direct = [];
  const paths = new Set();
  for (const p of appJs) {
    const src = stripComments(read(p));
    for (const m of src.matchAll(/\bfetch\s*\(/g)) direct.push(`${relative(WEB, p)}@${m.index}`);
    for (const m of src.matchAll(/\bcall\(\s*(['"`])([^'"`]+)\1/g)) paths.add(m[2]);
    assert.doesNotMatch(src, /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/, relative(WEB, p));
  }
  // fetch is only reached through createClient's injectable doFetch, never called by name elsewhere
  assert.deepEqual(direct, []);
  assert.deepEqual([...paths].sort(), ['/api/health', '/api/respond', '/api/speak', '/api/transcribe']);
  for (const path of paths) assert.match(path, /^\/api\/[a-z]+$/);
});

test('Q-033 REQ-014 createClient sends respond, speak, transcribe and health to relative paths only', async () => {
  const { createClient } = await import('../web/js/companion-client.js');
  const urls = [];
  const wav = new Blob([new Uint8Array(8)], { type: 'audio/wav' });
  const fetch = async (u, init = {}) => {
    urls.push(String(u));
    if (u === '/api/speak') return new Response(wav, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    return new Response(JSON.stringify({ reply: 'hi', mood: 'calm', ready: true, text: 'x' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const c = createClient({ fetch });
  await c.respond('hello', [], '小明').catch(() => {});
  await c.speak('你好', 'zh', new AbortController().signal).catch(() => {});
  await c.transcribe(new Blob([new Uint8Array(4)])).catch(() => {});
  await c.health().catch(() => {});
  assert.ok(urls.includes('/api/speak'), urls.join(','));
  assert.ok(urls.length >= 4, urls.join(','));
  for (const u of urls) assert.match(u, /^\/api\/[a-z]+$/, `not a same-origin relative path: ${u}`);
});

test('Q-033 REQ-014 audio is only ever played from a blob: URL made from the reply bytes', async () => {
  const { createSpeaker } = await import('../web/js/speaker.js');
  const srcs = [];
  const audio = { set src(v) { srcs.push(v); }, get src() { return srcs.at(-1); }, onended: null, onerror: null, play() { return Promise.resolve(); }, pause() {} };
  let n = 0;
  const url = { create: () => `blob:http://127.0.0.1:4400/${++n}`, revoke() {} };
  const sp = createSpeaker({ speak: async () => ({}), createAudio: () => audio, url, makeBlob: () => ({}) });
  sp.unlock();
  const done = sp.say(['一'], 'zh');
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  audio.onended?.();
  await done;
  assert.ok(srcs.length >= 2, `unlock and one part, saw ${srcs.length}`);
  for (const s of srcs) assert.match(s, /^blob:/, `audio src ${s}`);
  // in the source: the element's src is only ever set from the object URL variables, never a literal or concatenation
  const src = stripComments(read(join(WEB, 'js/speaker.js')));
  const sets = [...src.matchAll(/\.src\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
  assert.ok(sets.length >= 2, `src assignments: ${sets.length}`);
  for (const v of sets) assert.match(v, /^[A-Za-z_$][\w$]*$/, `audio src set from an expression, not a plain object-URL variable: ${v}`);
  assert.match(src, /url\.create\(makeBlob\(/);
  assert.match(src, /createObjectURL\(b\)/);
  assert.doesNotMatch(src, /new Audio\([^)]/, 'new Audio(url) would bypass the blob path');
  for (const p of appJs) assert.doesNotMatch(stripComments(read(p)), /<audio|<video|<source|new Audio\([^)]/, relative(WEB, p));
});

test('Q-033 REQ-014 index.html loads only local assets: no CDN, no web-font service, no remote link or script', () => {
  const html = read(join(WEB, 'index.html'));
  const tags = [...html.matchAll(/<(link|script|img|iframe|source|audio|video|object|embed|use)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(tags.length >= 5, `${tags.length} tags`);
  for (const t of tags) {
    for (const m of t.matchAll(/\b(?:src|href|xlink:href|data)="([^"]*)"/g)) {
      assert.ok(/^(#|data:|css\/|js\/|fonts\/)/.test(m[1]), `non-local reference ${m[1]} in ${t}`);
    }
  }
  assert.doesNotMatch(html, /<iframe|<object|<embed|<form[^>]*action=\s*["']?https?:/i);
  for (const p of pageFiles) {
    const s = read(p);
    assert.doesNotMatch(s, /googleapis|gstatic|cdnjs|unpkg|jsdelivr|fontawesome|typekit|cloudflare|fonts\.com|bootstrapcdn/i, relative(WEB, p));
    if (p.endsWith('.css')) assert.doesNotMatch(s, /@import/, relative(WEB, p));
  }
});

test('Q-033 REQ-014 every @font-face source is the one bundled file; SVG parts name no remote href', () => {
  let faces = 0;
  for (const p of pageFiles.filter((f) => f.endsWith('.css'))) {
    for (const m of read(p).matchAll(/@font-face\s*{[^}]*}/g)) {
      faces += 1;
      const srcs = [...m[0].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((u) => u[1]);
      assert.ok(srcs.length >= 1);
      for (const s of srcs) assert.match(s, /^\.\.\/fonts\/[\w.-]+\.woff2$/);
    }
  }
  assert.ok(faces >= 1, 'no @font-face found');
  const svgFiles = files(WEB, ['.svg']);
  for (const p of [...svgFiles, join(WEB, 'index.html')]) {
    const s = read(p);
    for (const m of s.matchAll(/(?:xlink:)?href="([^"]*)"/g)) assert.ok(!/^(https?:)?\/\//.test(m[1]) || NAMESPACES.has(m[1]), `${relative(WEB, p)}: ${m[1]}`);
    assert.doesNotMatch(s, /<image\b[^>]*(?:xlink:)?href="(?!data:|#)/);
    assert.doesNotMatch(s, /url\(\s*["']?https?:/);
  }
});

test('Q-033 REQ-014 the new voice, breathing, poke and rename modules add no import outside web/', () => {
  for (const f of ['speaker.js', 'breath.js', 'poke.js', 'name.js', 'companion-client.js']) {
    const src = stripComments(read(join(WEB, 'js', f)));
    for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)) assert.match(m[1], /^\.\.?\//, `${f}: ${m[1]}`);
  }
});
