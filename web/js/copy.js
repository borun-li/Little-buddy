// Every user-visible word of the page, from docs/frontend/01-ux.md §4 and 02-ui.md.
// Keyed by language: zh and en (Q-015, 01-ux.md Increment 1 Words). Key parity is checked by tests/copy.test.js.

export const COPY = {
  zh: {
    title: '小伙伴',
    emptyHint: '想说什么都可以。按住说话，或者直接打字。',
    privacy: '聊天只留在这台电脑上，刷新就清空。',
    placeholder: '打字也可以，Enter 发送',
    inputLabel: '想对小伙伴说的话',
    pausedNote: '（发送中，文字先留着）',
    talk: '按住说话',
    listening: (s) => `在听… ${s} 秒`,
    listeningShort: (s) => `${s} 秒`,
    listeningHelp: '松开发送 · 移开或 Esc 取消',
    listeningName: (s) => `在听，${s} 秒，松开发送`,
    listeningNow: '在听', // announced in the status line when the stream opens, not shown (FND-003)
    voiceTag: '语音',
    transcribing: '正在转成文字…', // the trailing … is drawn as moving dots in log.js
    typing: '小伙伴正在回复',
    logLabel: '聊天记录',
    langLabel: '界面语言',
    langZh: '中文',
    langEn: 'English',
    hints: {
      prompt: '请在浏览器弹窗里允许麦克风，再按住说话。',
      refused: '麦克风没打开。可在地址栏左侧允许，或者直接打字。',
      noMic: '没找到麦克风，打字也一样能聊。',
      busy: '麦克风被别的程序占用了，关掉再试，或者先打字。',
      tooShort: '说得太快啦，按住久一点。',
      micOpening: '麦克风正在打开，提示“在听”时再开口。',
      warming: '小伙伴还在醒来，通常一两分钟。可以先打字，醒了再发。',
      voiceNotReady: '语音还没准备好，先打字吧。',
      nothingHeard: '没听到说话声。按住再说一次，或者打字。',
      voiceUnavailable: '没连上，这段话没转成文字。按住再说一次，或者打字。',
      voiceTimeout: '转文字太久，没成功。按住再说一次，或者打字。',
      voiceFailed: '这段话没转成文字。按住再说一次，或者打字。',
      awake: '小伙伴醒了，说说看吧。',
      unreachable: '小伙伴暂时没连上，正在重新启动，稍等一下。',
      stillDown: '还是没连上。请重新启动小伙伴（在终端里重新运行 npm start）。',
      sendUnavailable: '没连上小伙伴，这句没发出去。文字放回输入框了，稍等再按 Enter。',
      sendTimeout: '小伙伴想得太久，这次没回上。文字放回输入框了，按 Enter 再发。',
      sendFailed: '这次没回上来。文字放回输入框了，按 Enter 再发。',
      cleared: '聊天清空了，重新开始吧。',
      sendDefect: '这句没发出去。文字放回输入框了，再试一次；还不行就刷新页面（聊天会清空）。',
    },
    // Mood caption after "小伙伴 · " and the word in the accessible name "小伙伴，<word>".
    moods: {
      neutral: { caption: '在听呢', name: '在听' },
      'pleasant-high': { caption: '替你开心', name: '开心' },
      'pleasant-low': { caption: '安心陪着你', name: '安心' },
      'unpleasant-high': { caption: '有点替你担心', name: '担心' },
      'unpleasant-low': { caption: '陪你难过一会儿', name: '难过' },
      waking: { caption: '还在醒来' }, // caption only while the reply side warms; the art stays neutral
    },
    companionCaption: (phrase) => `小伙伴 · ${phrase}`,
    companionName: (word) => `小伙伴，${word}`,
    // Increment 2 (01-ux.md Words (increment 2)); memory words are design only and not added.
    defaultName: '小伙伴',
    speaker: '朗读回复',
    speakerOn: '朗读开着，点一下静音',
    speakerOff: '已静音，点一下打开朗读',
    speakerNotReady: '声音还没准备好，回复先只显示文字',
    breathOffer: '一起深呼吸？',
    breathStop: '停下',
    breathStopName: '停下深呼吸',
    breathIn: (n) => `吸气… ${n}`,
    breathOut: (n) => `呼气… ${n}`,
    breathName: (name) => `${name}，陪你深呼吸`,
    crisisLabel: '求助方式',
    crisisTitle: '你不是一个人，随时可以找人聊聊。',
    crisis988: '在美国，打电话或发短信到 988（自杀与危机生命线），24 小时都有人。',
    crisis911: '如果有立即的危险，请打 911。',
    crisisClose: '收起',
    crisisCloseName: '收起求助方式',
    clear: '清空',
    clearName: '清空聊天',
    pokeHelp: '点一下或按 Enter，戳一戳',
    pokes: ['嘿嘿，好痒', '哎呀！', '在呢在呢'],
    renameName: (name) => `改名字，现在叫${name}`,
    nameLabel: '名字',
    nameNote: '名字记在这台电脑上，最多 12 个字。',
  },
  en: {
    title: 'Little Buddy',
    emptyHint: 'Say anything you like. Hold to talk, or just type.',
    privacy: 'This chat stays on this computer and clears when you reload.',
    placeholder: 'Or type, Enter sends',
    inputLabel: 'What you want to tell Little Buddy',
    pausedNote: '(sending, your text stays)',
    talk: 'Hold to talk',
    listening: (s) => `Listening… ${s} s`,
    listeningShort: (s) => `${s} s`,
    listeningHelp: 'Release to send · move off or Esc to cancel',
    listeningName: (s) => `Listening, ${s} seconds, release to send`,
    listeningNow: 'Listening', // announced in the status line when the stream opens, not shown (FND-003)
    voiceTag: 'Voice',
    transcribing: 'Turning it into text…',
    typing: 'Little Buddy is replying',
    logLabel: 'Chat',
    langLabel: 'Interface language',
    langZh: '中文',
    langEn: 'English',
    hints: {
      prompt: 'Allow the microphone in the browser pop-up, then hold to talk.',
      refused: 'The microphone is off. Allow it at the left of the address bar, or just type.',
      noMic: 'No microphone found. Typing works just as well.',
      busy: 'Another app is using the microphone. Close it and try again, or type for now.',
      tooShort: 'That was quick! Hold a little longer.',
      micOpening: 'Opening the mic. Start talking when it says Listening.',
      warming: "Little Buddy is still waking up, usually within two minutes. Type now and send once it's awake.",
      voiceNotReady: "Voice isn't ready yet. Type for now.",
      nothingHeard: "I didn't hear any words. Hold and try again, or type.",
      voiceUnavailable: "Couldn't connect, so that wasn't turned into text. Hold and try again, or type.",
      voiceTimeout: 'Turning that into text took too long. Hold and try again, or type.',
      voiceFailed: "That couldn't be turned into text. Hold and try again, or type.",
      awake: 'Little Buddy is awake. Go ahead.',
      unreachable: "Can't reach Little Buddy right now. It's restarting, hang on.",
      stillDown: 'Still can\'t reach it. Restart Little Buddy (run npm start again in Terminal).',
      sendUnavailable: "Couldn't reach Little Buddy, so this didn't send. Your words are back in the box; press Enter again in a moment.",
      sendTimeout: 'Little Buddy took too long this time. Your words are back in the box; press Enter to send again.',
      sendFailed: "That reply didn't come through. Your words are back in the box; press Enter to send again.",
      cleared: 'Chat cleared. Start fresh any time.',
      sendDefect: "This didn't send. Your words are back in the box; try again, and if it still fails, reload the page (the chat will clear).",
    },
    moods: {
      neutral: { caption: 'listening', name: 'listening' },
      'pleasant-high': { caption: 'happy for you', name: 'happy' },
      'pleasant-low': { caption: 'right here, at ease', name: 'at ease' },
      'unpleasant-high': { caption: 'a bit worried for you', name: 'worried' },
      'unpleasant-low': { caption: 'sad with you for a while', name: 'sad' },
      waking: { caption: 'waking up' },
    },
    companionCaption: (phrase) => `Little Buddy · ${phrase}`,
    companionName: (word) => `Little Buddy, ${word}`,
    defaultName: 'Little Buddy',
    speaker: 'Read replies aloud',
    speakerOn: 'Reading aloud is on. Click to mute.',
    speakerOff: 'Muted. Click to read replies aloud.',
    speakerNotReady: "Voice isn't ready yet. Replies show as text for now.",
    breathOffer: 'Breathe together?',
    breathStop: 'Stop',
    breathStopName: 'Stop breathing',
    breathIn: (n) => `Breathe in… ${n}`,
    breathOut: (n) => `Breathe out… ${n}`,
    breathName: (name) => `${name}, breathing with you`,
    crisisLabel: 'Ways to get help',
    crisisTitle: "You're not alone. You can talk to someone any time.",
    crisis988: 'In the US, call or text 988 (Suicide & Crisis Lifeline), any time, day or night.',
    crisis911: "If you're in immediate danger, call 911.",
    crisisClose: 'Close',
    crisisCloseName: 'Close ways to get help',
    clear: 'Clear',
    clearName: 'Clear chat',
    pokeHelp: 'Click or press Enter to poke',
    pokes: ['Hehe, that tickles', 'Oops!', "Yes, I'm here"],
    renameName: (name) => `Rename, now called ${name}`,
    nameLabel: 'Name',
    nameNote: 'The name is saved on this computer, up to 12 characters.',
  },
};

export const LANGS = ['zh', 'en'];
export const DEFAULT_LANG = 'zh';

// A12: a browser language starting with zh opens in 中文, anything else (or nothing) in English.
export function resolveLang(browserLang) {
  return typeof browserLang === 'string' && /^zh/i.test(browserLang.trim()) ? 'zh' : 'en';
}

// `copy` is one live object: setLang copies the chosen language into it, so every module that reads
// copy.x sees the current words. Starts in zh; app.js sets the browser default at open (never at import,
// so tests are not changed by the machine's locale). The language is never sent to the backend.
export const copy = { ...COPY[DEFAULT_LANG] };
let current = DEFAULT_LANG;
let savedName = null; // Q-021: the user's name, or null for the default of the interface language
export const getLang = () => current;
export const getName = () => savedName ?? COPY[current].defaultName;

// The 11 keys that carry the companion's name. The tables keep the default name in them, so the
// increment-1 words stay true; the live object gets the name substituted (01-ux.md Keys that take {name}).
const NAME_KEYS = ['title', 'inputLabel', 'typing', 'companionCaption', 'companionName',
  'hints.warming', 'hints.awake', 'hints.unreachable', 'hints.stillDown', 'hints.sendUnavailable', 'hints.sendTimeout'];
function withName(v, def, name) {
  if (typeof v === 'function') return (...a) => v(...a).split(def).join(name);
  return v.split(def).join(name);
}
function apply() {
  Object.assign(copy, COPY[current], { hints: { ...COPY[current].hints } });
  if (savedName === null) return;
  const def = COPY[current].defaultName;
  for (const key of NAME_KEYS) {
    const [a, b] = key.split('.');
    if (b) copy[a][b] = withName(COPY[current][a][b], def, savedName);
    else copy[a] = withName(COPY[current][a], def, savedName);
  }
}
export function setLang(lang) {
  if (!COPY[lang]) return current;
  current = lang;
  apply();
  return current;
}
// A name that is empty, not a string or one of the default names reads as the default (null).
export function setName(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  savedName = n && !Object.values(COPY).some((c) => c.defaultName === n) ? n : null;
  apply();
  return getName();
}

// Q-018: 01-ux.md Codes, voice column. kind is 'no_audio', 'empty' or a transcribe error code.
const VOICE_HINT_KEY = {
  no_audio: 'nothingHeard', empty: 'nothingHeard',
  not_ready: 'voiceNotReady', unavailable: 'voiceUnavailable', timeout: 'voiceTimeout',
  failed: 'voiceFailed', bad_request: 'voiceFailed', too_large: 'voiceFailed',
};
export function voiceHintKey(kind) {
  return VOICE_HINT_KEY[kind] ?? 'voiceFailed'; // an unknown code is a failed transcription, never shown raw
}
export const MAX_VOICE_CHARS = 1500; // [unverified default] a transcript is cut to this before it is sent
