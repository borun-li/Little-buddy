// Deterministic crisis rule: a fixed zh/en phrase list over the normalised line (03 DES-019). Pure; never logged (A9).
// List approved by the user at Plan (2026-11-15, Q7), plus the user's addition: the 活着没什么意思 family
// (活着 + 没/没有/没什么/没啥 + 意思/意义). Not added: 想消失 / 想就这样消失 ('尴尬得想消失' is an everyday idiom).
// Adding a zh phrase: add the Traditional form of each of its characters to TRAD_FOLD too.
export const CRISIS_PHRASES = {
  zh: ['自杀', '自尽', '轻生', '寻死', '想死', '想去死', '不想活', '活不下去',
    '活着没意思', '活着没有意思', '活着没什么意思', '活着没啥意思', '活着没意义', '活着没有意义', '活着没什么意义', '活着没啥意义',
    '不如死了', '死了算了', '一了百了', '结束生命', '结束自己', '了结自己', '伤害自己', '自残', '自伤', '割腕', '跳楼', '上吊'],
  en: ['suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'ending my life', 'end it all', 'take my own life', 'taking my own life',
    'want to die', 'wanna die', 'want to be dead', 'wish i was dead', 'wish i were dead', 'better off dead', 'hurt myself', 'hurting myself',
    'harm myself', 'harming myself', 'self-harm', 'self harm', 'cut myself', 'cutting myself', "don't want to live", 'dont want to live',
    'do not want to live', 'no reason to live', "don't want to be alive", 'dont want to be alive'],
};

// zh only, removed anywhere before matching: everyday phrases that contain a listed phrase.
export const CRISIS_EXCEPTIONS = ['跳楼价', '跳楼大甩卖'];
// Fond greetings, removed only at the end of a clause (nothing but end of text, punctuation, emoji or ~ follows): '想死你了！' stays
// harmless, while '我想死你别管我' and '我想死我了真的撑不下去' keep 想死 (FND-014, review round 1; A22: a miss is worse than a false alarm).
// FND-025 (Acceptance): the rule is GREETING_RE, 想死 + 你/您/你们 + optional 了/啦/喽/咯/嘞, or 想死 + 我 + 了/啦, then optional
// 啊呀哦喔噢呢嘛哈吖~; GREETING_EXCEPTIONS lists its base forms. Bare 想死我 and 想死你啊别管我 stay crisis.
export const GREETING_EXCEPTIONS = ['想死你了', '想死你们了', '想死您了', '想死我了'];
const GREETING_RE = /想死(?:(?:你们|你|您)(?:了|啦|喽|咯|嘞)?|我(?:了|啦))[啊呀哦喔噢呢嘛哈吖~]*(?![\p{L}\p{N}])/gu;
// 妳/們 (voice input may give them) folded for the greeting step only; TRAD_FOLD stays the crisis-phrase list (FND-025, 08).
const GREETING_FOLD = { 妳: '你', 們: '们' };

// Every Traditional form of a character used in CRISIS_PHRASES.zh / CRISIS_EXCEPTIONS (typed text may be Traditional).
export const TRAD_FOLD = { 殺: '杀', 盡: '尽', 輕: '轻', 尋: '寻', 著: '着', 沒: '没', 義: '义', 結: '结', 傷: '伤', 殘: '残', 樓: '楼', 價: '价', 賣: '卖', 麼: '么', 麽: '么' };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EN_RE = new RegExp(`(?<![a-z])(?:${CRISIS_PHRASES.en.map(escape).join('|')})(?![a-z])`);

export function normalizeForCrisis(text) {
  return [...String(text).normalize('NFKC')]
    .map((c) => TRAD_FOLD[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Only this line, typed or transcribed; a negated statement counts too (A22, Q9).
export function isCrisis(line) {
  const t = normalizeForCrisis(line);
  let zh = t.replace(/\s/g, '').replace(/[妳們]/g, (c) => GREETING_FOLD[c]).replace(GREETING_RE, '');
  for (const e of CRISIS_EXCEPTIONS) zh = zh.split(e).join('');
  if (CRISIS_PHRASES.zh.some((p) => zh.includes(p))) return true;
  return EN_RE.test(t);
}
