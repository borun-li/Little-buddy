// Fake data (REQ-007 layer only). A3: >= 2 warm replies per mood, each <= 2 sentences,
// <= 1 question, <= 120 characters. A1: the lines a held-to-talk turn becomes, covering all 5 moods.
// Keyed by language so English can be added later (deferred D-001); only zh exists now.

export const PRESETS = {
  zh: {
    replies: {
      neutral: [
        '嗯，我在听。想多说一点吗？',
        '我在这儿陪着你。慢慢说就好。',
        '收到啦。今天过得怎么样？',
      ],
      'pleasant-high': [
        '太好了，努力真的有回报！你最想先跟谁分享这个好消息？',
        '哇，替你开心！这份高兴要好好记住。',
        '听起来真棒！是什么让你这么开心？',
      ],
      'pleasant-low': [
        '这样平平静静的感觉真好。我就在这儿安心陪着你。',
        '能放松下来真不错。今天有什么小事让你觉得舒服？',
        '嗯，慢慢享受这份安稳吧。我陪着你。',
      ],
      'unpleasant-high': [
        '听起来压力不小，我有点替你担心。先慢慢呼一口气，好吗？',
        '这种着急的感觉一定不好受。最让你放不下的是哪件事？',
        '我在这儿，你不是一个人扛着。想说就说，不急。',
      ],
      'unpleasant-low': [
        '吵架之后，心里一定很不好受。想说说发生了什么吗？',
        '辛苦了，难过的时候不用硬撑。我在这儿陪你一会儿。',
        '抱抱你。想哭也没关系，我听着。',
      ],
    },
    voiceLines: [
      '今天考试过了，好开心！',
      '可是晚上和朋友吵架了，有点难过。',
      '明天还要汇报，我有点焦虑。',
      '现在泡了杯茶，感觉挺放松的。',
      '嗯，刚到家。',
    ],
  },
};
