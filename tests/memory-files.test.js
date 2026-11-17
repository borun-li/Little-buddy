// R1 memory, group A (unit, pure format): TC-148..TC-156. be-tester #4. Plan: docs/backend/04-test-plan.md. Expected values come from the
// plan, 03 DES-031/037 interface comments and the approved fixtures (FX-019, FX-020, FX-022, FX-024, FX-025); the weight formula is the
// test's own copy (03 §Conventions), not imported from server/lang.js.
process.env.TZ = 'America/New_York'; // FX-019 and TC-153 need a fixed zone; one file = one process
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ABOUT_TEMPLATE, appendMood, applyNotes, dayValue, diaryLine, isAboutEmpty, localDay, MOOD_VALUE, notesWithin, parseDiary, parseProfile,
  PROFILE_DEFAULTS, profileText, SECTIONS, UnreadableFile, verbatim, weekOf,
} from '../server/memory-files.js';
import { helpRegion, PROFILE_REGIONS } from '../server/region.js';
import { fx, round3, roundDays, wt } from './memory-helpers.js';

const cfg = { lineChars: 80 };

test('TC-148 REQ-043/037/050: isAboutEmpty rule and the three-heading template', () => {
  assert.deepEqual(SECTIONS.map((s) => s.title), ['最近在忙', '在意的人和事', '喜欢·不喜欢']);
  assert.equal(ABOUT_TEMPLATE, '# 关于你\n\n## 最近在忙\n\n## 在意的人和事\n\n## 喜欢·不喜欢\n');
  assert.equal(ABOUT_TEMPLATE, `# 关于你\n\n${SECTIONS.map((s) => `## ${s.title}\n`).join('\n')}`, 'built from SECTIONS');
  const fx22 = fx('FX-022').input.files['关于你.md'];
  const cases = [
    ['template', ABOUT_TEMPLATE, true], ['empty string', '', true], ['headings and blank lines only', '# a\n\n  \n## b\n\n### c\n', true],
    ['FX-022 file', fx22, false], ['one body line under a heading', '## 最近在忙\n面试\n', false], ['bullet with text', '## x\n- 面试\n', false],
    ['no headings, one text line', '只有一行字', false], ['extra heading and one text line', '# t\n## 其他\n文字\n', false],
  ];
  for (const [name, text, want] of cases) assert.equal(isAboutEmpty(text), want, name);
});

test('TC-149 REQ-055 (A44): notesWithin budget cut at weight 1200/1201, line cuts, one long line, emoji, empty, budget 0', () => {
  const a1200 = 'a'.repeat(1200);
  assert.deepEqual(notesWithin(a1200, 1200), { text: a1200, cut: false });
  assert.equal(wt(`${a1200}a`), 1201);
  assert.equal(notesWithin(`${a1200}a`, 1200).cut, true);
  const han = '好'.repeat(480); // 480 x 2.5 = 1200
  assert.equal(wt(han), 1200);
  assert.equal(notesWithin(han, 1200).cut, false);
  assert.equal(notesWithin(`${han}好`, 1200).cut, true);
  // (b) 2000 Han chars on 100 lines of 20
  const lines = Array.from({ length: 100 }, (_, i) => `${String(i).padStart(3, '0')}${'事'.repeat(17)}`);
  const long = lines.join('\n');
  const r = notesWithin(long, 1200);
  assert.equal(r.cut, true);
  assert.ok(wt(r.text) <= 1200, `weight ${wt(r.text)}`);
  assert.ok(long.startsWith(r.text) && long[r.text.length] === '\n', 'prefix ending before a line break');
  const nextLine = long.slice(r.text.length + 1).split('\n')[0];
  assert.ok(wt(`${r.text}\n${nextLine}`) > 1200, 'adding the next full line would exceed 1200');
  // (c) one 3000-Han line, no newline
  const one = '汉'.repeat(3000);
  const c = notesWithin(one, 1200);
  assert.equal(c.cut, true);
  assert.ok(wt(c.text) <= 1200 && c.text.length === 480);
  assert.ok(c.text.isWellFormed() && one.startsWith(c.text));
  // (d) emoji at the cut point (2 UTF-16 units each)
  const e = `${'a'.repeat(1198)}😀😀😀`;
  const d = notesWithin(e, 1200);
  assert.equal(d.cut, true);
  assert.ok(d.text.isWellFormed() && wt(d.text) <= 1200, 'no broken surrogate');
  assert.equal(Buffer.from(d.text, 'utf8').toString('utf8'), d.text, 're-encoding is valid UTF-8');
  const d2 = notesWithin(`${'a'.repeat(1199)}😀`, 1200);
  assert.ok(d2.text.isWellFormed() && d2.text === 'a'.repeat(1199), 'an emoji that would cross the budget is dropped whole');
  // (e), (f)
  assert.deepEqual(notesWithin('', 1200), { text: '', cut: false });
  assert.doesNotThrow(() => notesWithin('abc', 0));
  assert.equal(notesWithin('abc', 0).text, '');
});

test('TC-150 REQ-040 (A33): verbatim thresholds 11/12 Han and 7/8 words, punctuation and case, paraphrase, self, empty', () => {
  const zh = '我昨天晚上十一点才下班回家路上下大雨鞋全湿了';
  const run12 = '昨天晚上十一点才下班回家'; // 12 Han
  assert.equal([...run12].length, 12);
  assert.equal(verbatim(run12, zh), true, '12 Han');
  assert.equal(verbatim([...run12].slice(0, 11).join(''), zh), false, '11 Han');
  assert.equal(verbatim('昨天晚上十一，点才下班；回家', zh), true, 'punctuation inside does not hide a 12-run');
  const en = 'The quick brown fox jumps over the lazy dog today';
  assert.equal(verbatim('the quick brown fox jumps over the lazy', en), true, '8 words');
  assert.equal(verbatim('the quick brown fox jumps over the', en), false, '7 words');
  assert.equal(verbatim('THE,  Quick brown!  fox jumps over   the lazy', en), true, 'case, punctuation, extra spaces');
  const line = fx('FX-016').input.cases[0].sessions[0][0];
  assert.equal(verbatim('下班很晚，路上下雨，鞋湿了，室友吃了外卖', line), false, 'paraphrase');
  assert.equal(verbatim(line, line), true, 'a line against itself');
  assert.equal(verbatim('', line), false, 'empty candidate');
});

test('TC-151 REQ-044/045: parseDiary, diaryLine, appendMood round trips', () => {
  const file = fx('FX-019').input.cases[0].files['日志.md'];
  const p = parseDiary(file);
  assert.equal(p.entries.length, 12);
  const want = [['2026-11-07', 'pleasant-high', '收到实习面试通知'], ['2026-11-09', 'unpleasant-low', '论文被导师打回'], ['2026-11-09', 'unpleasant-low', '一夜没睡好'], ['2026-11-09', 'neutral', null],
    ['2026-11-11', 'pleasant-low', '和室友吃了火锅'], ['2026-11-12', 'pleasant-high', '猫豆豆又肯吃饭了'], ['2026-11-12', 'unpleasant-high', '和朋友吵架'], ['2026-11-14', 'unpleasant-high', '面试前很焦虑'],
    ['2026-11-15', 'pleasant-high', '模拟面试顺利'], ['2026-11-15', 'unpleasant-low', '下雨鞋湿了'], ['2026-11-15', 'neutral', null], ['2026-11-15', 'pleasant-high', '妹妹周末要来']];
  assert.deepEqual(p.entries.map((e) => [e.date, e.mood, e.point]), want, 'file order, moods, points (null for 平常)');
  assert.equal(p.lastDate, '2026-11-15');
  assert.equal(p.lines.join('\n'), file, 'lines keep every line');
  for (const e of p.entries) assert.equal(p.lines[e.line].startsWith('- '), true, 'line index points at the entry');
  // stray prose, a "- 难过 · " line with no point, a heading with trailing space, an unknown mood word
  const odd = '# 日志\n\n## 2026-11-01 \n随手写的一句话\n- 难过 · \n- 愤怒 · 不认识的词\n- 开心 · 好事\n';
  const q = parseDiary(odd);
  assert.deepEqual(q.entries.map((e) => [e.date, e.mood, e.point]), [['2026-11-01', 'pleasant-high', '好事']], 'only well-formed entry lines count');
  assert.equal(q.lines.join('\n'), odd, 'stray lines kept in lines');
  assert.equal(diaryLine('pleasant-high', '模拟面试顺利'), '- 开心 · 模拟面试顺利');
  assert.equal(diaryLine('pleasant-high', null), '- 开心');
  // appendMood: empty file, today's section, older last section, date change between two appends
  const empty = parseDiary('');
  const a = appendMood(empty.lines, empty.lastDate, '2026-11-15', 'pleasant-high');
  assert.equal(a.lines.join('\n'), '# 日志\n\n## 2026-11-15\n- 开心\n');
  const b = appendMood(a.lines, '2026-11-15', '2026-11-15', 'neutral');
  assert.equal(b.lines.join('\n'), '# 日志\n\n## 2026-11-15\n- 开心\n- 平常\n', "same day: no new heading");
  const c = appendMood(b.lines, '2026-11-15', '2026-11-16', 'unpleasant-low');
  assert.equal(c.lines.join('\n'), '# 日志\n\n## 2026-11-15\n- 开心\n- 平常\n\n## 2026-11-16\n- 难过\n', 'a new heading after a blank line');
  for (const x of [a, b, c]) {
    const re = parseDiary(x.lines.join('\n'));
    assert.equal(re.lines[x.line].startsWith('- '), true);
    assert.equal(re.entries.at(-1).line, x.line, 'returned line points at the new entry');
  }
  assert.equal(parseDiary(c.lines.join('\n')).entries.length, 3);
  const withOld = parseDiary(file);
  const d = appendMood(withOld.lines, withOld.lastDate, '2026-11-16', 'pleasant-low');
  const rd = parseDiary(d.lines.join('\n'));
  assert.deepEqual(rd.entries.slice(0, 12).map((e) => [e.date, e.mood, e.point]), want, 'old entries unchanged');
  assert.deepEqual([rd.entries[12].date, rd.entries[12].mood, rd.entries[12].point], ['2026-11-16', 'pleasant-low', null]);
});

test('TC-152 [FX-019] REQ-046/045: seven-day window and day values', () => {
  const f = fx('FX-019');
  const today = new Date(2026, 10, 15, 12);
  const days = weekOf(parseDiary(f.input.cases[0].files['日志.md']).entries, today);
  assert.equal(days.length, 7);
  assert.deepEqual(roundDays(days), f.expected.cases[0].days, 'FX-019-01 days (rounded to 3 decimals)');
  assert.equal(days[6].date, '2026-11-15', 'today last');
  assert.ok(!days.some((d) => d.date === '2026-11-07'), '11-07 absent');
  for (const d of days.filter((x) => ['2026-11-10', '2026-11-13'].includes(x.date))) assert.deepEqual([d.value, d.entries], [null, []]);
  assert.deepEqual(roundDays(weekOf(parseDiary('# 日志\n').entries, today)), f.expected.cases[2].days, 'FX-019-03 (absent file shape)');
  assert.equal(dayValue([]), null);
  for (const [m, v] of [['pleasant-high', 1], ['pleasant-low', 0.5], ['neutral', 0], ['unpleasant-high', -0.5], ['unpleasant-low', -1]]) {
    assert.equal(dayValue([m]), v, m); assert.equal(MOOD_VALUE[m], v);
  }
  assert.equal(round3(dayValue(['unpleasant-low', 'unpleasant-low', 'neutral'])), -0.667);
  assert.equal(round3(dayValue(['pleasant-high', 'unpleasant-low', 'neutral', 'pleasant-high'])), 0.25);
});

test('TC-153 REQ-044/046 (A38): local date at midnight, in the DST-end week', () => {
  assert.equal(process.env.TZ, 'America/New_York');
  const late = new Date(2026, 10, 14, 23, 59, 55);
  assert.equal(late.toISOString().slice(0, 10), '2026-11-15', 'the UTC date has already moved on (the proof the case is the edge)');
  assert.equal(localDay(late), '2026-11-14');
  assert.equal(localDay(new Date(2026, 10, 15, 0, 0, 0)), '2026-11-15');
  assert.equal(localDay(new Date(2026, 10, 1, 12)), '2026-11-01');
  const days = weekOf([], new Date(2026, 10, 3, 9)).map((d) => d.date);
  const want = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 9, 28 + i)).toISOString().slice(0, 10));
  assert.deepEqual(days, want, 'seven consecutive dates across the 25-hour day');
  assert.equal(new Set(days).size, 7);
});

test('TC-154 REQ-037/055 (A53): applyNotes is add-only, ordered, de-duplicated and unbounded', () => {
  const lineSet = (t) => t.split('\n');
  const inclusion = (before, after) => {
    const rest = [...lineSet(after)];
    for (const l of lineSet(before)) { const i = rest.indexOf(l); if (i === -1) return l; rest.splice(i, 1); }
    return null; // null = every input line is still there
  };
  // the checker itself turns red for a rewriting version (mutation check of the test)
  const rewrite = (t) => t.replace(/^妹妹.*$/m, '- 别的');
  assert.notEqual(inclusion('a\n妹妹 Lily 这周末来看我\nb', rewrite('a\n妹妹 Lily 这周末来看我\nb')), null);

  let t = applyNotes(ABOUT_TEMPLATE, { add: { busy: ['在准备实习面试', '在准备实习面试', '', '  '], people: ['猫叫豆豆'], likes: ['喜欢咖啡'] } }, cfg);
  assert.equal(t, '# 关于你\n\n## 最近在忙\n- 在准备实习面试\n\n## 在意的人和事\n- 猫叫豆豆\n\n## 喜欢·不喜欢\n- 喜欢咖啡\n');
  t = applyNotes(t, { add: { busy: ['在练半马'], people: ['妹妹叫Lily'], likes: [] } }, cfg);
  assert.ok(t.indexOf('- 在练半马') < t.indexOf('- 在准备实习面试'), 'busy: newest first, right under the heading');
  assert.ok(t.indexOf('- 猫叫豆豆') < t.indexOf('- 妹妹叫Lily'), 'people: appended at the end of the section');
  assert.equal(applyNotes(t, { add: { busy: ['在练半马'], people: ['- 猫叫豆豆'], likes: [] } }, cfg), t, 'lines already there are not added again');
  const marked = applyNotes(ABOUT_TEMPLATE, { add: { busy: ['# 标题式', '- 带横线', '> 引用式', '* 星号'], people: [], likes: [] } }, cfg);
  for (const x of ['- 标题式', '- 带横线', '- 引用式', '- 星号']) assert.ok(marked.includes(`\n${x}\n`), x);
  assert.ok(!/\n(?:- )?[#>*] /.test(marked.split('\n').slice(3).join('\n')), 'no markers survive');
  const longLine = applyNotes(ABOUT_TEMPLATE, { add: { busy: ['汉'.repeat(100)], people: [], likes: [] } }, cfg);
  assert.ok(longLine.includes(`- ${'汉'.repeat(80)}\n`) && !longLine.includes('汉'.repeat(81)), 'cut at 80 code points');
  const many = applyNotes(ABOUT_TEMPLATE, { add: { busy: Array.from({ length: 25 }, (_, i) => `事${i}`), people: [], likes: [] } }, cfg);
  assert.equal(many.split('\n').filter((l) => /^- 事\d+$/.test(l)).length, 25, '25 new lines at once, all kept');

  const hand = fx('FX-025').input.cases[0].files['关于你.md'];
  const variants = {
    'FX-025-01 hand file': hand,
    'missing 喜欢·不喜欢 heading': '# 关于你\n\n## 最近在忙\n- 旧的事\n\n## 在意的人和事\n妹妹 Lily 这周末来看我\n',
    'extra section and unheaded text': '写在最前面的一句\n# 关于你\n\n## 最近在忙\n- a\n\n## 其他\n- 我的备注\n\n## 在意的人和事\n妹妹 Lily 这周末来看我\n\n## 喜欢·不喜欢\n',
    'CRLF line endings': '# 关于你\r\n\r\n## 最近在忙\r\n- 旧的事\r\n\r\n## 在意的人和事\r\n妹妹 Lily 这周末来看我\r\n\r\n## 喜欢·不喜欢\r\n',
  };
  for (const [name, base] of Object.entries(variants)) {
    const out = applyNotes(base, { add: { busy: ['training for a half marathon'], people: ['猫叫豆豆', '妹妹 Lily 这周末来看我'], likes: ['不喜欢香菜'] } }, cfg);
    assert.equal(inclusion(base, out), null, `${name}: add-only, every input line stays (first lost: ${inclusion(base, out)})`);
    assert.ok(out.includes('training for a half marathon') && out.includes('猫叫豆豆') && out.includes('不喜欢香菜'), `${name}: new facts present`);
    assert.equal(out.split('\n').filter((l) => l.replace(/^- /, '').trim() === '妹妹 Lily 这周末来看我').length, 1, `${name}: the hand line is not duplicated`);
  }
  assert.ok(applyNotes(variants['missing 喜欢·不喜欢 heading'], { add: { busy: [], people: [], likes: ['不喜欢香菜'] } }, cfg).includes('## 喜欢·不喜欢\n- 不喜欢香菜'), 'a missing section is appended');
  // 50 rounds on the same file
  let cur = hand;
  for (let i = 0; i < 50; i++) {
    const nxt = applyNotes(cur, { add: { busy: [`事${i}`, `事${i}`], people: [`人${i}`, '妹妹 Lily 这周末来看我'], likes: Array.from({ length: 24 }, (_, k) => `爱${i}-${k}`) } }, cfg);
    assert.equal(inclusion(cur, nxt), null, `round ${i}: add-only`);
    cur = nxt;
  }
  assert.ok(cur.split('\n').length > 1250, 'no cap on the total length');
  assert.equal(cur.split('\n').filter((l) => l.includes('妹妹 Lily 这周末来看我')).length, 1);
});

test('TC-155 REQ-047/048/049: parseProfile and profileText', () => {
  const f22 = fx('FX-022').input.files['profile.json'];
  const a = parseProfile(f22);
  assert.deepEqual(a.profile, { name: '团子', region: 'CN', memoryOn: true, noticeSeen: true });
  assert.deepEqual(parseProfile('{}').profile, { ...PROFILE_DEFAULTS }, 'defaults: memory on, notice unseen');
  assert.deepEqual(parseProfile('{"memoryOn":"yes","name":5,"noticeSeen":1}').profile, { ...PROFILE_DEFAULTS }, 'wrong types fall back');
  assert.equal(parseProfile('{"region":"EU"}').profile.region, null);
  for (const r of PROFILE_REGIONS) assert.equal(parseProfile(JSON.stringify({ region: r })).profile.region, r);
  assert.equal([...parseProfile(JSON.stringify({ name: 'n'.repeat(40) })).profile.name].length, 12);
  assert.equal(parseProfile('{"name":"小伙伴"}').profile.name, null, 'the default name is null');
  const withExtra = parseProfile('{"version":1,"theme":"dark","name":"Mochi"}');
  assert.deepEqual(withExtra.extra, { theme: 'dark' });
  const text = profileText(withExtra.profile, withExtra.extra);
  const back = JSON.parse(text);
  assert.deepEqual([back.theme, back.version, back.name], ['dark', 1, 'Mochi'], 'unknown key survives, version 1');
  assert.deepEqual(parseProfile(text), withExtra, 'round trip');
  const half = f22.slice(0, Math.floor(Buffer.byteLength(f22) / 2));
  for (const [name, bad] of [['array', '[]'], ['null', 'null'], ['empty string', ''], ['FX-024-02 truncated', half], ['number', '5']]) {
    assert.throws(() => parseProfile(bad), UnreadableFile, name);
  }
});

test('TC-156 [FX-020] REQ-048: helpRegion over chosen x system (12 rows) and PROFILE_REGIONS', () => {
  assert.deepEqual(PROFILE_REGIONS, ['CN', 'US', 'other']);
  const table = [];
  for (const chosen of ['CN', 'US', 'other', null]) {
    for (const system of ['CN', 'US', null]) {
      const want = chosen === 'CN' || chosen === 'US' ? chosen : chosen === 'other' ? null : system;
      table.push([chosen, system, want]);
    }
  }
  assert.equal(table.length, 12);
  for (const [chosen, system, want] of table) assert.equal(helpRegion(chosen, system), want, `helpRegion(${chosen}, ${system})`);
  assert.ok(readFileSync(new URL('./fixtures/approved/FX-020/input.json', import.meta.url), 'utf8').includes('"other"'), 'FX-020 loaded');
});
