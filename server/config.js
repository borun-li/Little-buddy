// Ports, paths, limits and deadlines (03 DES-002). Reads environment variables only; never downloads.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const HF = join(homedir(), 'Documents', 'huggingface');
const SIZES = ['2B', '4B', '9B'];
// Qwen3-TTS speakers (TTSKit Qwen3Models.swift:90-94).
export const VOICES = ['ryan', 'aiden', 'ono-anna', 'sohee', 'eric', 'dylan', 'serena', 'vivian', 'uncle-fu'];
// Q31 (user, Plan 2026-11-18; 03 DES-050): the latest crisis reply is read by CRISIS_VOICE when the chosen voice is in
// CRISIS_VOICE_FOR. Add a voice when an FX-027-01 run misses the number in it (cite the evidence); removing one needs its own
// TC-272 run (reading serena) and the user's yes. No environment variable.
export const CRISIS_VOICE = 'serena';
export const CRISIS_VOICE_FOR = ['ryan', 'eric']; // missed the number in FX-027-01: TC-272, 2026-11-18 (ryan zh-CN, en-CN; eric zh-US), test-results/r2-live/TC-272.json

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

// Default voice: serena, the user's choice at Plan (2026-11-15, Q6). R2 (DES-045): the read-aloud voice is the profile's; this is
// only the default when the profile has no valid voice, and the voice --warm-only warms. Tests do not set TTS_VOICE.
function envVoice() {
  const raw = process.env.TTS_VOICE || 'serena';
  if (!VOICES.includes(raw)) throw new Error(`TTS_VOICE must be one of ${VOICES.join(', ')}, got "${raw}"`);
  return raw;
}

// R1 memory folder (03 DES-037): LITTLEBUDDY_DATA_DIR (absolute) or the user's Application Support folder. Tests, bench and demo set it.
function envDataDir() {
  const raw = process.env.LITTLEBUDDY_DATA_DIR;
  if (raw === undefined || raw === '') return join(homedir(), 'Library', 'Application Support', 'LittleBuddy');
  if (!isAbsolute(raw)) throw new Error(`LITTLEBUDDY_DATA_DIR must be an absolute path, got "${raw}"`);
  return resolve(raw);
}

// The folder as the user reads it: '~/…/' under the home folder, else the absolute path with a trailing '/'.
export function displayPath(dir) {
  const home = homedir();
  return dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}/` : `${dir}/`;
}

const DATA_DIR = envDataDir();

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
  tts: {
    bin: join(REPO, 'stt', '.build', 'release', 'companion-tts'),
    modelDir: process.env.TTS_MODEL_DIR || join(HF, 'models', 'argmaxinc', 'ttskit-coreml'), // holds qwen3_tts/
    tokenizerDir: process.env.TTS_TOKENIZER_DIR || join(HF, 'models', 'Qwen', 'Qwen3-0.6B'), // holds tokenizer.json
    voice: envVoice(),
  },
  limits: {
    lineChars: 1500, historyEntries: 40, historyTextChars: 1500, historyBudget: 2000, jsonBytes: 262144, wavBytes: 2000000,
    speakChars: 200, speakJsonBytes: 4096, speakQueue: 4, // speakQueue: FND-013 (review round 1)
    profileJsonBytes: 4096, forgetJsonBytes: 64, // R1 (03 DES-037)
    historyLow: 1000, // windowOf re-cut floor when the window passes historyBudget (03 DES-035)
  },
  deadlines: { respondMs: 15000, transcribeMs: 12000, sttBootMs: 600000, bonsaiBootMs: 300000, speakMs: 10000, ttsBootMs: 300000, ttsOverdueMs: 30000, rememberMs: 14000 },
  // ttsOverdueMs (FND-015): from the write to the helper's answer; ≥ 9.6 s audio × RTF 2.7 under load (03 DES-017)
  restarts: { max: 5, delayMs: 2000 },
  // notesBudget: weight of 关于你 that prompts read (≈ 550 Han); lineChars/pointChars in code points (03 DES-037, §6).
  // pendingMax: lines waiting for the idle-time update; quietMs: quiet after the last turn before a flush starts (A32, DES-033).
  memory: { dir: DATA_DIR, displayPath: displayPath(DATA_DIR), notesBudget: 1200, lineChars: 80, pointChars: 80, pendingMax: 20, quietMs: 8000, lockWaitMs: 1000 },
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

const TTS_PARTS = ['text_projector', 'code_embedder', 'multi_code_embedder', 'code_decoder', 'multi_code_decoder', 'speech_decoder'];

// Read-aloud files (03 DES-023). Never part of missingFiles: a missing TTS file never blocks start (REQ-017).
export function missingTtsFiles(cfg = CONFIG) {
  const required = [
    cfg.tts.bin,
    ...TTS_PARTS.map((c) => join(cfg.tts.modelDir, 'qwen3_tts', c, '12hz-0.6b-customvoice')),
    join(cfg.tts.tokenizerDir, 'tokenizer.json'),
  ];
  return required.filter((p) => !existsSync(p));
}

export const TTS_HINT = '朗读不可用，聊天照常：缺上面的文件。助手由 npm run setup 编译；模型放到上面的路径或设 TTS_MODEL_DIR / TTS_TOKENIZER_DIR  Read-aloud off, chat still works: files above are missing. npm run setup builds the helper; put the models at the paths above or set TTS_MODEL_DIR / TTS_TOKENIZER_DIR';

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
