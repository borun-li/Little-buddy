// R2 (docs/frontend/r2-personalise/01-ux.md §5 and Increment 1): the words of the third drawer tab 形象和声音 and the
// bilingual 关于你 headings. Kept apart from copy.js (the stage-button word `look` lives there, it rides data-copy) and
// from memory-copy.js. lt(key) reads getLang() when it renders; {name} = the saved name or the default.
// Names (蜜蜜/棉棉/抹抹, 12 items) are fe-ui's, approved at the UI stop 2026-11-17 (02-ui.md CMP-001, CMP-030). The group notes are
// the frame words of FRAME-038/039/046 that 01-ux Words has no key for (DFB-006).
import { getLang, getName } from './copy.js';

const NAMES = { // display names of the voices, as the wireframe capitalises them; ids stay lowercase
  serena: 'Serena', vivian: 'Vivian', 'uncle-fu': 'Uncle Fu', dylan: 'Dylan', eric: 'Eric', ryan: 'Ryan', aiden: 'Aiden', 'ono-anna': 'Ono Anna', sohee: 'Sohee',
};
export const voiceName = (id) => NAMES[id] ?? id;

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
    character: '角色', characterName: ['蜜蜜', '棉棉', '抹抹'],
    outfit: '穿搭', outfitNone: '不穿',
    slot: { head: '头饰', clothes: '衣服', shoes: '鞋子', accessory: '配饰' },
    itemName: { head: ['小草帽', '毛线帽', '小雏菊'], clothes: ['条纹毛衣', '背带裤', '波点裙'], shoes: ['小雨靴', '帆布鞋', '毛绒拖鞋'], accessory: ['围巾', '领结', '小铃铛'] },
    outfitNote: '每个部位穿一件，颜色跟着衣服来', voiceNote: '选中 = 以后朗读用它；试听不改选中', growthNote: '不催，也不会因为没来聊就变小', voiceDefault: '（默认）',
    voiceGroup: '声音', voice: VOICE.zh,
    preview: '试听', previewStop: '停下', previewMissing: '这个声音的试听没找到',
    previewLine: '你好呀，我在呢。', previewShort: '你好呀。',
    growthGroup: '成长', barName: '成长进度',
    stage: { 1: '刚认识', 2: '熟悉起来了', 3: '老朋友' },
    growthNone: '刚认识 · 还没一起聊过',
    growthDays: (stage, n) => `${stage} · 一起聊过 ${n} 天`,
    next: (n) => (n === 1 ? '再聊 1 天长大' : `再聊 ${n} 天长大`),
    up: '长大了一点', thanks: '谢谢你陪我这么久', upSaid: (stage) => `长大了一点，现在${stage}`, // 01-ux Words: growth.up / .thanks / .upSaid
    lookSaveFailed: '没存上，还是原来的',
    // 01-ux.md § Review fixes (FND-063, FND-065): the tab's read rows and the memory-off line under the bar
    lookLoading: '正在打开形象和声音', lookReadError: '暂时读不出来，先不能换。{name}还是现在的样子。',
    growthOff: '记忆关着，这段时间先不数天数',
    aboutHead: {},
  },
  en: {
    tabLook: 'Look & voice',
    lookSub: 'Pick a look and a voice; it changes right away',
    lookLabel: 'Look and voice',
    character: 'Character', characterName: ['Honey', 'Cotton', 'Matcha'],
    outfit: 'Outfit', outfitNone: 'None',
    slot: { head: 'Headwear', clothes: 'Clothes', shoes: 'Shoes', accessory: 'Accessory' },
    itemName: { head: ['Straw hat', 'Beanie', 'Daisy'], clothes: ['Striped jumper', 'Overalls', 'Dotted dress'], shoes: ['Rain boots', 'Sneakers', 'Fluffy slippers'], accessory: ['Scarf', 'Bow tie', 'Bell collar'] },
    outfitNote: 'Wear one per spot; colours come with the clothes', voiceNote: "The chosen voice will read aloud; Listen won't change it", growthNote: "No rush, and it won't shrink while you're away", voiceDefault: ' (default)',
    voiceGroup: 'Voice', voice: VOICE.en,
    preview: 'Listen', previewStop: 'Stop', previewMissing: "This voice's sample is missing",
    previewLine: "Hi, I'm here.", previewShort: 'Hi there.',
    growthGroup: 'Growing up', barName: 'Growing up',
    stage: { 1: 'Just met', 2: 'Getting to know you', 3: 'Old friends' },
    growthNone: 'Just met · no chats yet',
    growthDays: (stage, n) => `${stage} · chatted on ${n} days`,
    next: (n) => (n === 1 ? 'Chat on 1 more day to grow' : `Chat on ${n} more days to grow`),
    up: 'Grew up a little', thanks: 'Thanks for keeping me company', upSaid: (stage) => `Grew up a little: now ${stage}`,
    lookSaveFailed: 'Not saved; kept the old one',
    lookLoading: 'Opening Look & voice', lookReadError: "This can't be read right now, so nothing can be changed yet. {name} stays as is.",
    growthOff: "Memory is off, so days aren't being counted for now",
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
