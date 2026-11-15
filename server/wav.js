// WAV header check: PCM 16-bit LE, mono, 16 kHz; returns the data chunk (03 DES-005 steps 3-4).
import { ApiError } from './errors.js';

const bad = () => new ApiError('bad_request', 'request');

export function pcmFromWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) throw bad();
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw bad();
  let fmtOk = false;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > buf.length) throw bad();
      const format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const rate = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      if (format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16) throw bad();
      fmtOk = true;
    } else if (id === 'data') {
      if (!fmtOk) throw bad();
      const end = Math.min(body + size, buf.length);
      return buf.subarray(body, body + ((end - body) & ~1));
    }
    off = body + size + (size & 1); // chunks are padded to an even size
  }
  throw bad();
}
