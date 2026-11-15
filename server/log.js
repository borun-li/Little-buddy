// One JSON object per line on stdout (03 §6). Callers never pass line, history, reply, transcript or audio (A9).
export function log(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })}\n`);
}
