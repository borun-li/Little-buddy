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
      micOpening: '麦克风正在打开，看到秒数再开口。',
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
      micOpening: 'Opening the mic. Start talking when the seconds appear.',
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
export const getLang = () => current;
export function setLang(lang) {
  if (!COPY[lang]) return current;
  current = lang;
  Object.assign(copy, COPY[lang]);
  return current;
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
