// A2: mood from preset keywords in the line. The keyword that ends last in the line wins;
// when two end at the same place the longer one wins (so 不开心 beats 开心). No match -> neutral.

export const MOODS = ['neutral', 'pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low'];

export const KEYWORDS = {
  zh: {
    'pleasant-high': ['开心', '高兴', '太好了', '好棒', '兴奋', '激动', '哈哈', '成功', '耶'],
    'pleasant-low': ['平静', '放松', '安心', '舒服', '满足', '还不错', '惬意', '轻松', '踏实'],
    'unpleasant-high': ['焦虑', '生气', '紧张', '担心', '烦', '气死', '害怕', '着急', '压力', '慌', '吵架'],
    'unpleasant-low': ['难过', '累', '伤心', '失落', '沮丧', '孤单', '想哭', '疲惫', '不开心', '委屈', '没劲'],
  },
};

export function moodOf(line, keywords = KEYWORDS.zh) {
  let best = null;
  for (const [mood, words] of Object.entries(keywords)) {
    for (const word of words) {
      let at = line.indexOf(word);
      while (at !== -1) {
        const end = at + word.length;
        if (!best || end > best.end || (end === best.end && word.length > best.length)) {
          best = { mood, end, length: word.length };
        }
        at = line.indexOf(word, at + 1);
      }
    }
  }
  return best ? best.mood : 'neutral';
}
