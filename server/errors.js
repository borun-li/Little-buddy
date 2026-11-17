// The API error codes (6 + R1's forbidden, unreadable, not_saved) and the one place that writes an error response (03 DES-003, §3).
import { log } from './log.js';

export const CODES = Object.freeze({ not_ready: 503, unavailable: 503, timeout: 504, failed: 502, bad_request: 400, too_large: 413, forbidden: 403, unreadable: 409, not_saved: 500 });

export class ApiError extends Error {
  constructor(code, stage = 'request') {
    if (!(code in CODES)) throw new TypeError(`unknown error code ${code}`);
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = CODES[code];
    this.stage = stage;
  }
}

export function sendError(res, err, route) {
  const known = err instanceof ApiError;
  const code = known ? err.code : 'failed';
  log('warn', 'api_error', { route, code, stage: known ? err.stage : null, err_name: err?.name ?? typeof err });
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ error: code });
  res.writeHead(CODES[code], { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
