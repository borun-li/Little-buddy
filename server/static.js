// Static files from web/ (03 DES-005 steps 1-2). GET/HEAD only; never leaves the root.
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { log } from './log.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function plain(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

export function serveStatic(req, res, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return plain(res, 400, 'Bad Request'); // malformed percent-encoding
  }
  if (path === '/') path = '/index.html';
  const base = resolve(root);
  const file = resolve(base, `.${path}`);
  if (!file.startsWith(base + sep) || file.includes('\0')) return plain(res, 404, 'Not Found');
  let stat;
  try {
    stat = statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return plain(res, 404, 'Not Found');
    throw err;
  }
  if (!stat.isFile()) return plain(res, 404, 'Not Found');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file)
    .on('error', (err) => {
      log('error', 'static_read_failed', { err_name: err.name, err_code: err.code ?? null });
      res.destroy();
    })
    .pipe(res);
}
