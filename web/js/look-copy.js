// R2 (docs/frontend/r2-personalise/01-ux.md §5 and Increment 1): the words of the third drawer tab 形象和声音 and the
// bilingual 关于你 headings. Kept apart from copy.js (the stage-button word `look` lives there, it rides data-copy) and
// from memory-copy.js. lt(key) reads getLang() when it renders; {name} = the saved name or the default.
// Item names are placeholders (头饰 1 ...) until fe-ui's art names them.
import { getLang, getName } from './copy.js';

const VOICE = {
  zh: {
    serena: '温柔的年轻女声 · 中文', vivian: '明亮、有点个性的女声 · 中文', 'uncle-fu': '低沉醇厚的男声 · 中文',
    dylan: '清亮的北京男声 · 京腔', eric: '活泼的成都男声 · 四川话', ryan: '节奏感强的男声 · 英语母语',
    aiden: '阳光的美式男声 · 英语母语', 'ono-anna': '俏皮轻快的女声 · 日语母语', sohee: '温暖有感情的女声 · 韩语母语',
  },
  en: {
    serena: 'warm, gentle young female · Chinese', vivian: 'bright young female · Chinese', 'uncle-fu': 'low, mellow male · Chinese',
    dylan: 'clear Beijing male', eric: 'lively Chengdu male · Sichuanese', ryan: 'rhythmic male · English',
    aiden: 'sunny American male · English', 'ono-anna': 'playful female · Japanese', sohee: 'warm female · Korean',
  },
};

export const LOOK_COPY = {
  zh: {
    tabLook: '形象和声音',
    lookSub: '选样子和声音，选了就换上',
    lookLabel: '形象和声音',
    character: '角色', characterItem: (n) => `角色 ${n}`,
    outfit: '穿搭', outfitNone: '不穿',
    slot: { head: '头饰', clothes: '衣服', shoes: '鞋子', accessory: '配饰' },
    itemName: (slotWord, n) => `${slotWord} ${n}`,
    voiceGroup: '声音', voice: VOICE.zh,
    preview: '试听', previewStop: '停下', previewMissing: '这个声音的试听没找到',
    previewLine: '你好，我是{name}，今天想聊点什么？',
    growthGroup: '成长', barName: '成长进度',
    stage: { 1: '刚认识', 2: '熟悉起来了', 3: '老朋友' },
    growthNone: '刚认识 · 还没一起聊过',
    growthDays: (stage, n) => `${stage} · 一起聊过 ${n} 天`,
    next: (n) => (n === 1 ? '再聊 1 天长大' : `再聊 ${n} 天长大`),
    demoDays: '演示用 · 天数', demoDaysRange: '填 0 到 365 的整数',
    lookSaveFailed: '没存上，还是原来的',
    aboutHead: {},
  },
  en: {
    tabLook: 'Look & voice',
    lookSub: 'Pick a look and a voice; it changes right away',
    lookLabel: 'Look and voice',
    character: 'Character', characterItem: (n) => `Character ${n}`,
    outfit: 'Outfit', outfitNone: 'None',
    slot: { head: 'Headwear', clothes: 'Clothes', shoes: 'Shoes', accessory: 'Accessory' },
    itemName: (slotWord, n) => `${slotWord} ${n}`,
    voiceGroup: 'Voice', voice: VOICE.en,
    preview: 'Listen', previewStop: 'Stop', previewMissing: "This voice's sample is missing",
    previewLine: "Hi, I'm {name}. What's on your mind today?",
    growthGroup: 'Growing up', barName: 'Growing up',
    stage: { 1: 'Just met', 2: 'Getting to know you', 3: 'Old friends' },
    growthNone: 'Just met · no chats yet',
    growthDays: (stage, n) => `${stage} · chatted on ${n} days`,
    next: (n) => (n === 1 ? 'Chat on 1 more day to grow' : `Chat on ${n} more days to grow`),
    demoDays: 'Demo · days', demoDaysRange: 'Enter a whole number 0–365',
    lookSaveFailed: 'Not saved; kept the old one',
    // REQ-066: display only, 中文 title first. Keys are the titles 关于你.md keeps (server/memory-files.js).
    aboutHead: { '最近在忙': 'Lately', '在意的人和事': 'People and things you care about', '喜欢·不喜欢': 'Likes and dislikes' },
  },
};

export const lt = (key) => {
  const v = LOOK_COPY[getLang()][key];
  return typeof v === 'string' ? v.split('{name}').join(getName()) : v;
};

// "最近在忙" -> "最近在忙 · Lately" in English; any other heading, and every heading in 中文, stays as written.
export function aboutHeading(title) {
  const en = LOOK_COPY[getLang()].aboutHead[title.trim()];
  return en ? `${title.trim()} · ${en}` : title;
}
