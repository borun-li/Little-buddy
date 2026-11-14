// Opens the mic for one hold, reads its input level for the bars, and stops every track on close.
// Audio is never recorded or kept (A1). Browser errors map to hint keys (01-ux.md permission, error rows).

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

// Wraps an open stream: level() in 0..1, close() stops tracks and the audio graph.
export function meter(stream) {
  let ctx = null;
  let analyser = null;
  let buf = null;
  try {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  } catch {
    analyser = null; // level bars stay flat; holding still works
  }
  return {
    level() {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      return Math.min(1, Math.sqrt(sum / buf.length) * 5);
    },
    close() {
      stopStream(stream);
      ctx?.close().catch(() => {});
    },
  };
}
