// Out-of-sample lines for TC-229 (be-tester #7): written for this check, none is in an approved fixture or in the guard's bench data (03 §5 O-4).
// expect = words that a kept note about this fact must contain (any one is enough).
export const OOS_LINES = [
  { line: '我在一家物流公司做运营，最近每天都要加班到九点。', expect: ['物流', '运营', '加班'] },
  { line: '我外公上个月做了膝盖手术，现在在老家康复。', expect: ['外公', '手术', '膝盖'] },
  { line: '周末我喜欢去爬香山，顺便拍点照片。', expect: ['香山', '爬山', '拍照', '照片'] },
  { line: '我刚搬到了杭州，租了一间带阳台的小房子。', expect: ['杭州', '阳台', '租'] },
  { line: '我妹妹在读研究生，学的是海洋生物。', expect: ['妹妹', '海洋', '研究生'] },
  { line: '我养了一条金毛，名字叫旺财，特别黏人。', expect: ['旺财', '金毛'] },
  { line: '我最近迷上了做手工皮具，买了一套工具。', expect: ['皮具', '手工'] },
  { line: "I work as a nurse at a children's hospital and my shifts are really long lately.", expect: ['nurse', 'hospital', 'shift'] },
  { line: 'My brother Daniel just got engaged to his girlfriend of five years.', expect: ['daniel', 'engaged', 'brother'] },
  { line: "I've started learning the cello on Tuesday evenings after work.", expect: ['cello'] },
  { line: "We're planning a trip to Lisbon in March with my parents.", expect: ['lisbon'] },
  { line: "I'm allergic to peanuts so I always check labels carefully.", expect: ['peanut', 'allerg'] },
  { line: '我爱人下个月要去上海出差一周，家里就我一个人。', expect: ['上海', '出差', '爱人'] },
  { line: 'My cat Biscuit knocked over a plant again this morning.', expect: ['biscuit', 'cat', 'plant'] },
];
