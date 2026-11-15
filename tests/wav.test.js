// Q-013 / DES-014: the WAV the page records. Pure functions only, no microphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, encodeWav, wavFromChunks, WAV_RATE } from '../web/js/mic.js';

const tone = (rate, sec, hz = 440) =>
  Float32Array.from({ length: Math.round(rate * sec) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

function header(buf) {
  const v = new DataView(buf);
  const s = (o) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
  return {
    riff: s(0), wave: s(8), fmt: s(12), data: s(36), riffSize: v.getUint32(4, true), fmtSize: v.getUint32(16, true),
    format: v.getUint16(20, true), channels: v.getUint16(22, true), rate: v.getUint32(24, true),
    byteRate: v.getUint32(28, true), align: v.getUint16(32, true), bits: v.getUint16(34, true), dataSize: v.getUint32(40, true),
  };
}

test('header: RIFF/WAVE, PCM, mono, 16 kHz, 16 bit, sizes consistent', () => {
  const buf = encodeWav(tone(16000, 2));
  const h = header(buf);
  assert.equal(h.riff, 'RIFF'); assert.equal(h.wave, 'WAVE'); assert.equal(h.fmt, 'fmt '); assert.equal(h.data, 'data');
  assert.equal(h.fmtSize, 16); assert.equal(h.format, 1); assert.equal(h.channels, 1); assert.equal(h.rate, 16000);
  assert.equal(h.byteRate, 32000); assert.equal(h.align, 2); assert.equal(h.bits, 16);
  assert.equal(h.dataSize, 64000); assert.equal(h.riffSize, buf.byteLength - 8);
  assert.equal(buf.byteLength, 64044);
});

test('samples are little-endian int16, clipped', () => {
  const v = new DataView(encodeWav(Float32Array.of(0, 1, -1, 2, -2, 0.5)));
  const got = [0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true));
  assert.deepEqual(got, [0, 32767, -32768, 32767, -32768, 16384]);
});

test('60 s is 1,920,044 B and longer input never exceeds it', () => {
  assert.equal(encodeWav(tone(16000, 60)).byteLength, 1920044);
  assert.equal(encodeWav(new Float32Array(16000 * 75)).byteLength, 1920044);
  assert.ok(1920044 <= 2000000);
});

for (const rate of [48000, 44100]) {
  test(`${rate} Hz downsamples to 16 kHz with the length and the pitch kept`, () => {
    const out = downsample(tone(rate, 2), rate);
    assert.equal(out.length, 32000);
    let cross = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 && out[i] >= 0) cross++;
    assert.ok(Math.abs(cross - 880) <= 2, `440 Hz over 2 s has ~880 rising crossings, got ${cross}`);
    assert.ok(Math.max(...out) > 0.45 && Math.max(...out) < 0.55);
  });
}

test('16 kHz passes through; silence stays silence', () => {
  const s = tone(16000, 1);
  assert.equal(downsample(s, 16000), s);
  const q = downsample(new Float32Array(48000), 48000);
  assert.equal(q.length, 16000);
  assert.ok(q.every((x) => x === 0));
  const v = new DataView(encodeWav(q));
  for (let i = 0; i < 16000; i++) assert.equal(v.getInt16(44 + i * 2, true), 0);
});

test('chunks join, downsample and cap at 60 s of input; Blob is audio/wav', async () => {
  const chunks = Array.from({ length: 20 }, () => tone(48000, 4)); // 80 s
  const blob = wavFromChunks(chunks, 48000);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 1920044);
  const two = wavFromChunks([tone(44100, 1), tone(44100, 1)], 44100);
  assert.equal(header(await two.arrayBuffer()).dataSize, 64000);
});
