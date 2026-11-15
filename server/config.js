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
  limits: { lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudget: 2000, jsonBytes: 262144, wavBytes: 2000000 },
  deadlines: { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 300000 },
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

const HINTS = {
  setup: '联网时运行一次 Run once while online: npm run setup',
  bonsai: 'Bonsai 文件不在：放回比赛提供的 samples/bonsai-models/，或把 BONSAI_MODEL 设为已有的大小 Bonsai file missing: restore samples/bonsai-models/ from the hackathon kit, or set BONSAI_MODEL to a size you have',
  whisper: 'WhisperKit 模型不在：把已下载的模型放到上面的路径，或设 STT_MODEL_DIR / STT_TOKENIZER_DIR（setup 不下载模型） WhisperKit model missing: put the downloaded model at the path above, or set STT_MODEL_DIR / STT_TOKENIZER_DIR (setup does not download models)',
};

// One hint per kind of missing path, in the order setup, Bonsai, WhisperKit. Classifies by path only.
export function missingHints(missing, cfg = CONFIG) {
  const { bin, model } = bonsaiFiles(cfg);
  const kind = (p) => (p === cfg.stt.bin ? 'setup' : p === bin || p === model ? 'bonsai' : 'whisper');
  const kinds = new Set(missing.map(kind));
  return ['setup', 'bonsai', 'whisper'].filter((k) => kinds.has(k)).map((k) => HINTS[k]);
}
