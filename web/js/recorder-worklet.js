// AudioWorklet processor: hands the mic's first channel to mic.js in blocks of Float32 frames
// at the context's native rate. Downsampling and WAV encoding happen in mic.js (pure, tested).
// 'flush' sends what is left and answers 'flushed'. Audio stays in page memory (A9).
const BLOCK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(BLOCK);
    this.n = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        if (this.n) this.port.postMessage(this.buf.slice(0, this.n));
        this.n = 0;
        this.port.postMessage('flushed');
      }
    };
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === BLOCK) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
