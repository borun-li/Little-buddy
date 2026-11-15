// Ports, paths, limits and deadlines (03 DES-002). Reads environment variables only; never downloads.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const HF = join(homedir(), 'Documents', 'huggingface');
const SIZES = ['2B', '4B', '9B'];

function envPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a port number 1-65535, got "${raw}"`);
  return n;
}

function envSize() {
  const raw = process.env.BONSAI_MODEL || '9B';
  if (!SIZES.includes(raw)) throw new Error(`BONSAI_MODEL must be one of ${SIZES.join(', ')}, got "${raw}"`);
  return raw;
}

export const CONFIG = Object.freeze({
  repo: REPO,
  host: '127.0.0.1',
  port: envPort('PORT', 4317),
  bonsai: { size: envSize(), port: envPort('BONSAI_PORT', 4318), dir: join(REPO, 'samples', 'bonsai-models', 'gguf') },
  stt: {
    bin: join(REPO, 'stt', '.build', 'release', 'companion-stt'),
    modelDir: process.env.STT_MODEL_DIR
      || join(HF, 'models', 'argmaxinc', 'whisperkit-coreml', 'openai_whisper-large-v3-v20240930_626MB'),
    tokenizerDir: process.env.STT_TOKENIZER_DIR || HF,
  },
  limits: { lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudgetChars: 6000, jsonBytes: 262144, wavBytes: 2000000 },
  deadlines: { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 60000 },
  restarts: { max: 5, delayMs: 2000 },
});

export function bonsaiFiles(cfg = CONFIG) {
  return {
    bin: join(cfg.bonsai.dir, 'bin', 'macos-arm64', 'llama-server'),
    model: join(cfg.bonsai.dir, 'models', `Ternary-Bonsai-2-${cfg.bonsai.size}-PQ2_0.gguf`),
  };
}

export function missingFiles(cfg = CONFIG) {
  const { bin, model } = bonsaiFiles(cfg);
  const required = [
    bin,
    model,
    cfg.stt.bin,
    ...['AudioEncoder.mlmodelc', 'TextDecoder.mlmodelc', 'MelSpectrogram.mlmodelc'].map((m) => join(cfg.stt.modelDir, m)),
    join(cfg.stt.tokenizerDir, 'models', 'openai', 'whisper-large-v3', 'tokenizer.json'),
  ];
  return required.filter((p) => !existsSync(p));
}
