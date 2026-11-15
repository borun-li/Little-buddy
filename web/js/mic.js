// Opens the mic for one hold, reads its input level for the bars, records the hold as a 16 kHz mono
// WAV (DES-014) and stops every track on close. Audio lives in page memory only, until wav() hands
// the Blob over (A9). Browser errors map to hint keys (01-ux.md permission, error rows).

export const WAV_RATE = 16000;
export const MAX_SECONDS = 60; // the hold's own limit; 60 s = 1,920,044 B, under the server's 2,000,000 B

// Box-average mono Float32 samples from `rate` to 16 kHz (rate <= 16 kHz: nearest sample).
export function downsample(samples, rate) {
  if (rate === WAV_RATE) return samples;
  const ratio = rate / WAV_RATE;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(samples.length, Math.max(a + 1, Math.ceil((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j];
    out[i] = sum / (b - a);
  }
  return out;
}

// 44-byte RIFF/WAVE header + PCM16 LE mono 16 kHz; input is Float32 in -1..1 at 16 kHz.
// Samples past 60 s are dropped so the file never exceeds 1,920,044 B.
export function encodeWav(samples) {
  const n = Math.min(samples.length, WAV_RATE * MAX_SECONDS);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const tag = (o, t) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, WAV_RATE, true); v.setUint32(28, WAV_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff), true);
  }
  return buf;
}

export function wavFromChunks(chunks, rate) {
  const max = Math.ceil(rate * MAX_SECONDS);
  let total = 0;
  for (const c of chunks) total += c.length;
  const all = new Float32Array(Math.min(total, max));
  let o = 0;
  for (const c of chunks) {
    if (o >= all.length) break;
    const part = c.length > all.length - o ? c.subarray(0, all.length - o) : c;
    all.set(part, o);
    o += part.length;
  }
  return new Blob([encodeWav(downsample(all, rate))], { type: 'audio/wav' });
}

export async function micPermission() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'; // the browser cannot tell (e.g. no 'microphone' permission name)
  }
}

export function hintKeyFor(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'refused';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'noMic'; // NotFoundError, OverconstrainedError, no mediaDevices
  }
}

export function requestStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(Object.assign(new Error('no mediaDevices'), { name: 'NotFoundError' }));
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Wraps an open stream: level() in 0..1; wav() ends the hold and resolves the recording as a
// Blob 'audio/wav' (null if nothing could be recorded); close() stops tracks and the audio graph
// and drops the audio. The context runs at the native rate (Firefox rejects a 16 kHz context fed
// from another rate); downsampling is in JS.
export function meter(stream) {
  let ctx = null;
  let analyser = null;
  let buf = null;
  let node = null;
  let ready = null;
  const chunks = [];
  let closed = false;
  try {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
    ready = ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url)).then(() => {
      if (closed) return;
      node = new AudioWorkletNode(ctx, 'recorder', { numberOfOutputs: 0 });
      node.port.onmessage = (e) => { if (e.data instanceof Float32Array) chunks.push(e.data); };
      source.connect(node);
    });
    ready.catch(() => {}); // no worklet: level bars and holding still work, wav() gives null
  } catch {
    analyser = null; // level bars stay flat; holding still works
  }
  const shutdown = () => {
    closed = true;
    stopStream(stream); // the mic light goes off here
    ctx?.close().catch(() => {});
    chunks.length = 0;
  };
  return {
    async wav() {
      let blob = null;
      stopStream(stream); // release the mic at once; the worklet still holds what it heard
      try {
        await ready;
        if (node) {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 300);
            const prev = node.port.onmessage;
            node.port.onmessage = (e) => { prev(e); if (e.data === 'flushed') { clearTimeout(t); resolve(); } };
            node.port.postMessage('flush');
          });
          if (chunks.length) blob = wavFromChunks(chunks, ctx.sampleRate);
        }
      } catch { /* blob stays null */ }
      shutdown();
      return blob;
    },
    level() {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      return Math.min(1, Math.sqrt(sum / buf.length) * 5);
    },
    close: shutdown,
  };
}
