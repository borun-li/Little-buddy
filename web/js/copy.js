// Every user-visible word of the page, from docs/frontend/01-ux.md §4 and 02-ui.md.
// Keyed by language so English can be added later (deferred D-001); only zh exists now.

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
    voiceTag: '语音 · 示例文字',
    typing: '小伙伴正在回复',
    logLabel: '聊天记录',
    hints: {
      prompt: '请在浏览器弹窗里允许麦克风，再按住说话。',
      refused: '麦克风没打开。可在地址栏左侧允许，或者直接打字。',
      noMic: '没找到麦克风，打字也一样能聊。',
      busy: '麦克风被别的程序占用了，关掉再试，或者先打字。',
      tooShort: '说得太快啦，按住久一点。',
      micOpening: '麦克风正在打开，看到秒数再开口。',
      warming: '小伙伴还在醒来，通常一两分钟。可以先打字，醒了再发。',
      voiceNotReady: '语音还没准备好，先打字吧。',
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
};

export const copy = COPY.zh;
