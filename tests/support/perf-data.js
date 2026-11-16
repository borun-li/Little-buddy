// Data for tests/memory-perf.test.js (TC-216, TC-217), be-tester #5. Not a test file, not product code.
// The three 关于你 sizes of 03 §5 R-4 and the lines the driver says. No keyword of FX-014/015 (面试, 豆豆, 猫, marathon, Lily, interview, cat)
// appears in any of them, so a recall hit can only come from the fact the test adds.
import { weight } from '../../server/lang.js';

export const wt = weight;
export const han = (s) => (s.match(/\p{Script=Han}/gu) ?? []).length;

const head = '# 关于你\n';
const sec = (title, lines) => `\n## ${title}\n${lines.map((l) => `- ${l}`).join('\n')}\n`;

// budget-full: the way the pipeline writes it (short "- " lines, <= 80 chars). busy 12 lines + people 14 lines + likes 4: the 1200 cut
// falls inside the people section, so a new busy line (appended at the end of busy) is read and a new people line is not.
const BUSY = [
  '在学做红烧肉，已经失败过两次', '在整理毕业论文的参考文献', '周末要搬去新的出租屋，纸箱还没打包', '在和朋友筹备一场小型音乐会',
  '每天早上去河边跑五公里', '在学吉他，手指被弦磨得很疼', '在追一部很长的悬疑剧', '准备去成都玩四天，还在查攻略',
  '在背雅思单词，每天五十个', '在做一个记账的小程序', '下周要给老板做一次项目汇报', '在试着早点关灯睡觉',
  '在给阳台的绿植换更大的花盆', '在练习用左手刷牙，想锻炼一下', '周五晚上要和同学一起吃火锅', '在看一本讲城市地铁历史的书',
];
const PEOPLE = [
  '妈妈的生日快到了，还没想好送什么', '弟弟阿杰考上了高中，全家都很高兴', '同事小周总把活推给我，有点烦', '养的仙人掌开花了',
  '奶奶住院了，每周末去看她', '最好的朋友小林要搬去深圳', '家里的狗叫小黑，最近掉毛很厉害', '室友小米养了一只布偶',
  '表姐小雅下个月结婚', '大学同学老郑在杭州开了家咖啡店', '爸爸最近在学用智能手机', '邻居王阿姨常给我送自己包的饺子',
  '高中老师陈老师退休了', '舅舅一家住在青岛，过年会来',
  '合租的学姐小梅下个月毕业答辩', '楼下便利店的店员总记得我要热豆浆', '外婆耳朵不太好，打电话要说得慢', '小学同桌阿凯最近当了爸爸',
];
const LIKES = ['喜欢吃辣的火锅，不太喜欢香菜', '喜欢下雨天窝在家里听爵士乐', '喜欢手冲咖啡', '不喜欢早上开会'];
export const BUDGET_FULL = head + sec('最近在忙', BUSY) + sec('在意的人和事', PEOPLE) + sec('喜欢·不喜欢', LIKES);

// hand-written 2000 Han characters (written clause by clause, then cut to exactly 2000 Han). Lines up to 80 chars; no headings but the three.
const HAND_CLAUSES = [
  '大学读的是建筑，毕业以后做过两年室内设计，后来转去了一家做软件的公司，现在每天和代码打交道。',
  '住在一个老小区的四楼，窗外有一棵很大的香樟树，夏天的时候屋里很凉快，只是蝉鸣有点吵。',
  '平时上班坐地铁，换乘一次，早高峰人很多，所以习惯带一本薄薄的书，在车厢里站着看几页。',
  '去年冬天开始学游泳，一周去两次，已经能连续游四百米，教练说换气还要再练，姿势倒是还不错。',
  '很怕在很多人面前讲话，上台之前手心会出汗，但如果提前写好稿子读几遍，就会好很多。',
  '家里人都在老家，每个月给外婆打两次电话，外婆耳朵不太好，所以要说得慢一点，声音大一点。',
  '最近半年一直在攒钱，打算明年和朋友一起去北海道看雪，已经存了差不多一半的预算。',
  '喜欢在周末的早晨去菜市场，看卖菜的阿姨把青菜一把一把码整齐，回家再慢慢煮一锅粥。',
  '手机里有一个专门记灵感的备忘录，里面大多是半句话的想法，偶尔翻出来看，会觉得很有意思。',
  '有一个小习惯，每天睡前写三行字，写今天发生的一件小事，不写感受，只写事情本身。',
  '对咖啡因比较敏感，下午三点以后就不喝咖啡了，不然晚上会很难入睡，翻来覆去到很晚。',
  '养过一盆绿萝，后来搬家的时候送给了楼下的邻居，听说现在已经爬满了一整面窗台。',
  '工作上最近在负责一个报表系统的改版，需求变得很勤，每周都有新的想法，所以有点疲惫。',
  '朋友圈很少发，通常只在旅行的时候发几张照片，觉得把生活摆给所有人看有一点奇怪。',
  '喜欢看纪录片，尤其是讲海洋和森林的那种，节奏很慢，看完心里会安静下来，睡得也踏实。',
  '小时候学过几年钢琴，后来中断了，现在偶尔会在琴行里试一试，手指已经生疏得不行。',
  '周三晚上固定和一个老朋友视频，聊工作也聊生活，有时候什么也不聊，只是各自做各自的事。',
  '对数字不太敏感，报销和记账总是出错，所以才想做一个简单的小工具来帮自己整理。',
  '常常在晚饭后沿着小区外面的河边走四十分钟，听播客，最近在听一档讲历史故事的节目。',
  '不太会拒绝别人，同事请帮忙的时候总是答应，然后晚上一个人加班，事后又会有点后悔。',
  '喜欢手写笔记，用的是一支黑色的钢笔，墨水用完了会去文具店买同一个牌子的补上。',
  '计划今年读完二十本书，现在读了六本，其中最喜欢的是一本写小城市生活的散文集。',
  '对海鲜过敏，吃到虾的时候嘴唇会肿，所以聚餐的时候总要先问清楚菜里有没有放。',
  '生日在秋天，通常不办派对，只和两三个朋友吃一顿饭，再去江边散散步，这样就很满足。',
  '有时候会失眠，躺在床上脑子里反复想白天说过的话，越想越清醒，需要听一点轻音乐才行。',
  '很喜欢做饭，拿手的是番茄牛腩和蛋炒饭，不过一个人吃的时候常常懒得做，就随便对付一下。',
  '最近想把房间重新布置一下，换一盏暖黄色的灯，再添一张小圆桌，晚上可以在上面写东西。',
  '对未来有一点迷茫，不确定自己要不要一直做现在这份工作，但又说不出来想做的是什么。',
  '很少看电视，但偶尔会和室友一起看球赛，虽然规则不太懂，气氛倒是很热闹，很开心。',
  '每年春天都会去郊外的公园看花，带一个小相机，拍的照片从来不修图，直接存在文件夹里。',
  '有一个用了九年的背包，拉链坏过两次，都是自己拿去修的，舍不得扔，总觉得它很有陪伴感。',
  '周末有时候会去图书馆自习，那里很安静，旁边坐着陌生人，大家各做各的事，让人很放松。',
  '对气味比较敏感，闻到消毒水的味道会头疼，所以不太喜欢去医院，体检也总是拖到最后。',
  '想学一门新的语言，在日语和法语之间犹豫了很久，最后决定先从日语的五十音开始背。',
  '和家人关系不错，只是爸爸话不多，每次通电话三句话就结束了，妈妈总会在旁边多问几句。',
  '午饭一般在公司楼下的小店解决，常点一份鸡肉饭，老板娘已经认得我，会多给一勺汤。',
  '对跑步一直提不起兴趣，反而更喜欢快走，觉得走路的时候想事情更顺，也不容易受伤。',
  '手边常备一小包坚果，心情不好的时候会吃几颗，觉得嘴里有点东西，人就稳一点。',
  '去年参加了一次公益活动，给山区的孩子寄了一批旧书，后来收到一封信，一直夹在笔记本里。',
  '总是记不住人的名字，但很容易记住人的声音，在电话里一听就知道是谁，朋友都觉得神奇。',
  '去年秋天第一次一个人坐火车去了很远的城市，住在小旅馆里，晚上在窗边看了很久的夜景。',
  '冰箱里永远有一盒酸奶和几个鸡蛋，这是从上大学起就留下来的习惯，想想也不知道为什么。',
  '对拍照有一点执念，总想等到光线最好的那一刻，所以常常错过很多本来可以留下的瞬间。',
  '很喜欢雨声，下雨的晚上会把窗子开一条缝，躺着听一会儿，觉得一天里的事情都慢慢沉下去。',
  '不太爱吃甜的，生日蛋糕也只吃一小块，倒是很喜欢酸辣的东西，吃完整个人都精神起来。',
  '之前的室友是个很爱热闹的人，搬走以后屋子安静了很多，有时候会突然觉得有点空落落的。',
  '写东西的时候喜欢用很旧的键盘，按键的声音清脆，一个字一个字敲出来，觉得心里很踏实。',
  '每个季度会给自己放一天假，不见人也不看消息，只是睡到自然醒，再一个人去吃一顿好的。',
  '很在意别人对自己的看法，一句话说出口以后会反复琢磨，朋友说我想得太多，我也知道。',
  '对地图很着迷，常常在手机上随便放大一个陌生的小镇，看那里的街道和河流是怎么长出来的。',
  '偶尔会梦到小时候住过的院子，院子里有一口井和一棵石榴树，醒来以后会愣一会儿神。',
  '平时话不算多，但和熟悉的人在一起会变得很能聊，一聊就是一下午，聊完又觉得有点累。',
  '想在三十岁以前学会开车，已经报了名，可是一想到上路就紧张，所以一直把练车往后拖。',
  '喜欢在傍晚的时候去楼顶吹风，看远处的天一点点变成橘色，再变成深蓝，然后才慢慢下楼回家。',
  '有时候会给十年后的自己写一封短信，写完放进抽屉里，不知道到时候还会不会记得去打开它。',
];
export function handWritten2000() {
  const lines = HAND_CLAUSES.map((c) => c.slice(0, 80));
  let extra = lines.reduce((n, l) => n + han(l), 0) - 2000; // Han characters to drop from the end
  while (extra > 0) {
    const chars = [...lines[lines.length - 1]];
    while (extra > 0 && chars.length) { if (/\p{Script=Han}/u.test(chars.pop())) extra -= 1; }
    lines[lines.length - 1] = chars.join('');
    if (!lines[lines.length - 1]) lines.pop();
  }
  return head + sec('最近在忙', lines.slice(0, 14)) + sec('在意的人和事', lines.slice(14, 28)) + sec('喜欢·不喜欢', lines.slice(28));
}

// ---- lines the driver says: zh and en mix, a fact in at least every second line, each fact line distinct
const ZH = [
  '在学做红烧肉，已经失败了两次', '在整理毕业论文的参考文献', '要搬去新的出租屋，纸箱还没打包', '在跟朋友一起筹备一场小型音乐会', '每天早上去河边跑五公里',
  '妈妈的生日快到了，还没想好送什么', '在学吉他，手指被弦磨得很疼', '弟弟阿杰考上了高中，全家都很高兴', '同事小周总是把活推给我，我有点烦', '养的仙人掌开花了',
  '在追一部很长的悬疑剧', '准备去成都玩四天，还在查攻略', '新买的自行车是蓝色的，骑起来很轻', '奶奶住院了，每周末去看她', '在背雅思单词，每天五十个',
  '最好的朋友小林要搬去深圳了，有点舍不得', '在做一个小程序用来记账', '老板让我下周做一次项目汇报', '晚上总是睡不着，在试着早点关灯', '特别喜欢吃辣的火锅，不太喜欢香菜',
  '喜欢下雨天窝在家里听爵士乐', '家里的狗叫小黑，最近掉毛很厉害', '在学手冲咖啡，买了一台磨豆机', '室友小米养了一只布偶',
];
const EN = [
  "I'm learning to bake sourdough and my first loaf came out flat", "I'm writing my thesis introduction and it keeps getting longer", "I'm moving to a new apartment on the 20th and nothing is packed",
  'my brother Daniel just got a job in Denver', 'I started running by the lake every morning', "my mom's birthday is next week and I have no idea what to get her",
  "I'm learning the ukulele and my fingertips hurt", 'my coworker Priya keeps dumping her tasks on me', 'my cactus finally bloomed', "I'm binge-watching a long detective series",
  "I'm planning a trip to Lisbon in March", 'I bought a green bicycle and I love it', 'my grandpa is recovering from surgery and I call him every night', "I'm studying for the GRE, fifty words a day",
  "my best friend Sam is moving to Seattle and I'll miss her", "I'm building a tiny budgeting app", 'my boss wants me to present on Friday', "I can't sleep lately so I'm trying to turn the lights off earlier",
  "I really love spicy ramen but I can't stand cilantro", 'I like staying in on rainy days with jazz on', 'my dog Biscuit has been shedding like crazy', "I'm learning pour-over coffee and bought a grinder",
  'my roommate Kate adopted a ragdoll', "I'm volunteering at the animal shelter on Saturdays",
];
const OPEN_ZH = ['嗯，', '对了，', '说起来，', '今天想说，', '', '最近'];
const OPEN_EN = ['Well, ', 'By the way, ', 'So, ', 'Honestly, ', '', 'Lately '];
const END_ZH = ['。', '，有点累。', '，不过还行。', '，心里有点乱。', '，挺开心的。'];
const END_EN = ['.', ', a bit tired.', ', but it is ok.', ', my head is messy.', ', pretty happy about it.'];
const CHAT_ZH = ['今天有点累。', '谢谢你听我说。', '嗯，我知道了。', '哈哈，你说得对。', '好像有点道理。', '我先去喝杯水。', '今天天气还行。', '唉，不说了。', '是吗？', '那我再想想。'];
const CHAT_EN = ['Thanks for listening.', 'Yeah, I guess so.', 'Haha, fair enough.', "I'm a bit tired today.", 'Hmm, let me think about that.', 'That makes sense.', 'Ok.', 'Not sure what to say.', 'Right.', "I'll try that."];

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

// deterministic generator: next() -> { line, fact: bool, lang }
// switchP (be-tester #8, review round 1): null = each line's language is an independent coin (about 46-50 % of turns switch language, the old driver);
// a number = the chance that a line is in the OTHER language than the previous line (0.15 = a realistic chat that mostly stays in one language).
// Either way one r() call picks the language, so the first line and the fact/chat draws of the default mode are unchanged.
export function lineSource(seed = 7, switchP = null) {
  const r = rng(seed);
  let i = 0, zi = 0, ei = 0, sinceFact = 0, prevZh = null;
  return {
    next() {
      i += 1;
      const wantFact = sinceFact >= 1 || r() < 0.6; // never two lines in a row without a fact
      const coin = r();
      const zh = switchP === null || prevZh === null ? coin < 0.5 : (coin < switchP ? !prevZh : prevZh);
      prevZh = zh;
      if (!wantFact) { sinceFact += 1; return { line: pick(r, zh ? CHAT_ZH : CHAT_EN), fact: false, lang: zh ? 'zh' : 'en' }; }
      sinceFact = 0;
      if (zh) {
        const c = ZH[zi++ % ZH.length];
        return { line: `${pick(r, OPEN_ZH)}${/^在/.test(c) ? '我' : ''}${c}${pick(r, END_ZH)}`.replace(/。。/g, '。'), fact: true, lang: 'zh' };
      }
      const c = EN[ei++ % EN.length];
      const e = pick(r, END_EN);
      return { line: `${pick(r, OPEN_EN)}${c}${e}`, fact: true, lang: 'en' };
    },
  };
}
