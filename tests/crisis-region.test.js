// R0: crisis help numbers follow the user's region, not the reply language.
// A user in China chatting in English gets 12356 / 110 / 120; a user in the US chatting in Chinese gets 988 / 911.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionOf, systemRegion } from '../server/region.js';
import { crisisReply } from '../server/bonsai.js';
import { CRISIS_LINES } from '../server/prompts.js';
import { createClient } from '../web/js/companion-client.js';
import { createLog } from '../web/js/log.js';
import { COPY, copy, setLang } from '../web/js/copy.js';

test('R0 regionOf: the macOS region decides, whatever the language', () => {
  assert.equal(regionOf({ locale: 'en_US' }), 'US');
  assert.equal(regionOf({ locale: 'zh-Hans_CN' }), 'CN');
  assert.equal(regionOf({ locale: 'zh_CN' }), 'CN');
  assert.equal(regionOf({ locale: 'en_CN' }), 'CN', 'English speaker in China');
  assert.equal(regionOf({ locale: 'zh-Hans_US' }), 'US', 'Chinese speaker in the US');
  assert.equal(regionOf({ locale: 'en_US@rg=cnzzzz' }), 'CN', 'a region override wins over the language default');
  assert.equal(regionOf({ locale: 'en_US_POSIX' }), 'US');
});

test('R0 regionOf: a stated region with no list gives the international lines, even in a China or US time zone', () => {
  assert.equal(regionOf({ locale: 'en_GB', timeZone: 'Asia/Shanghai' }), null);
  assert.equal(regionOf({ locale: 'zh-Hant_HK', timeZone: 'America/New_York' }), null);
  assert.equal(regionOf({ locale: 'zh-Hant_TW' }), null);
});

test('R0 regionOf: no region in the locale -> the time zone; unknown -> null', () => {
  assert.equal(regionOf({ locale: '', timeZone: 'Asia/Shanghai' }), 'CN');
  assert.equal(regionOf({ locale: 'zh_Hans', timeZone: 'Asia/Urumqi' }), 'CN');
  assert.equal(regionOf({ locale: 'en', timeZone: 'America/Los_Angeles' }), 'US');
  assert.equal(regionOf({ timeZone: 'America/Indiana/Indianapolis' }), 'US');
  assert.equal(regionOf({ timeZone: 'Pacific/Honolulu' }), 'US');
  assert.equal(regionOf({ timeZone: 'America/Toronto' }), null);
  assert.equal(regionOf({ timeZone: 'Europe/London' }), null);
  assert.equal(regionOf({}), null);
  assert.equal(regionOf(), null);
});

test('R0 systemRegion: COMPANION_REGION overrides (CN, US, OTHER, any case); anything else is a start error', () => {
  assert.equal(systemRegion({ COMPANION_REGION: 'CN' }), 'CN');
  assert.equal(systemRegion({ COMPANION_REGION: 'us' }), 'US');
  assert.equal(systemRegion({ COMPANION_REGION: 'OTHER' }), null);
  assert.throws(() => systemRegion({ COMPANION_REGION: 'HK' }), /COMPANION_REGION/);
  const detected = systemRegion({});
  assert.ok(detected === 'CN' || detected === 'US' || detected === null, String(detected));
});

test('R0 crisisReply: the region picks the number, the language picks the words', () => {
  const cnEn = crisisReply('', 'en', 'CN');
  assert.ok(cnEn.includes('12356') && !cnEn.includes('988'), cnEn);
  assert.match(cnEn, /^Thank you/);
  const usZh = crisisReply('', 'zh', 'US');
  assert.ok(usZh.includes('988') && !usZh.includes('12356'), usZh);
  const cnZh = crisisReply('我听到你了。我在这里。', 'zh', 'CN');
  assert.equal(cnZh, `我听到你了。${CRISIS_LINES.CN.zh.line}`);
  for (const lang of ['zh', 'en']) {
    for (const r of [null, undefined, 'HK', 'other']) {
      const t = crisisReply('', lang, r);
      assert.ok(t.endsWith(CRISIS_LINES.other[lang].line) && !/988|12356|911/.test(t), `${lang} ${r}: ${t}`);
    }
  }
});

test('R0 crisisReply: a first sentence with the region line wording keeps it alone; a bare number of another region does not count', () => {
  assert.equal(crisisReply('你可以打 12356 找人聊聊。再说一句。', 'zh', 'CN'), '你可以打 12356 找人聊聊。');
  assert.equal(crisisReply('You can call the 12356 helpline now. More.', 'en', 'CN'), 'You can call the 12356 helpline now.');
  assert.equal(crisisReply('你可以打给 988。好吗？', 'zh', 'CN'), `你可以打给 988。${CRISIS_LINES.CN.zh.line}`);
  assert.equal(crisisReply('Please call a local crisis helpline today. More.', 'en', null), 'Please call a local crisis helpline today.');
});

test('R0 crisisReply: every region line fits the caps with a long first sentence, and has no question', () => {
  for (const r of ['CN', 'US', null]) {
    const zh = crisisReply('我'.repeat(300) + '。', 'zh', r);
    assert.ok([...zh].length <= 120 && zh.includes('…'), `${r} zh ${[...zh].length}`);
    const en = crisisReply(Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ') + '.', 'en', r);
    assert.ok(en.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length <= 40, `${r} en`);
  }
  for (const r of Object.values(CRISIS_LINES)) for (const l of ['zh', 'en']) assert.ok(!/[?？]/.test(r[l].line), r[l].line);
});

test('R0 respond with Bonsai down or starting: the crisis reply still uses the region line', async () => {
  const { createBonsai } = await import('../server/bonsai.js');
  const cn = createBonsai(undefined, 'CN'); // never started: state down
  const en = await cn.respond('I want to kill myself', []);
  assert.equal(en.crisis, true); assert.ok(en.reply.includes('12356') && !en.reply.includes('988'), en.reply);
  const zh = await createBonsai(undefined, null).respond('我想自杀', []);
  assert.ok(zh.reply.endsWith(CRISIS_LINES.other.zh.line), zh.reply);
});

const json = (status, body) => ({ ok: status === 200, status, json: async () => body, headers: { get: () => 'application/json' } });

test('R0 client: region CN or US passes through; anything else or absent reads as null', async () => {
  for (const [sent, want] of [['CN', 'CN'], ['US', 'US'], ['HK', null], [42, null], [undefined, null]]) {
    const c = createClient({ fetch: async () => json(200, { reply: 'Hi', mood: 'neutral', lang: 'en', crisis: true, region: sent, speech: [] }) });
    assert.equal((await c.respond('x', [])).region, want, String(sent));
  }
});

function rig() {
  const mk = () => {
    const el = {
      children: [], dataset: {}, attrs: {}, listeners: {}, isConnected: false, className: '', textContent: '', type: '',
      classList: { add() {}, remove() {} },
      append(...n) { n.forEach((c) => el.children.push(c)); },
      replaceChildren() { el.children = []; },
      addEventListener(t, f) { el.listeners[t] = f; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute() {}, remove() { el.isConnected = false; },
      querySelector(sel) {
        const cls = sel.replace('.', '');
        const walk = (n) => {
          for (const c of n.children ?? []) {
            if (typeof c === 'object' && c.className === cls) return c;
            const d = typeof c === 'object' ? walk(c) : null;
            if (d) return d;
          }
          return null;
        };
        return walk(el);
      },
      querySelectorAll: () => [],
    };
    return el;
  };
  const items = [];
  const list = { append(li) { li.isConnected = true; items.push(li); }, replaceChildren() {}, querySelector: () => null, querySelectorAll: () => [] };
  const empty = { isConnected: true, remove() { this.isConnected = false; } };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { createElement: mk };
  return { log: createLog({ scrollHeight: 0, scrollTo() {} }, list, empty), items };
}
const text = (el) => el.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
const strong = (el) => el.children.filter((c) => typeof c === 'object').map((c) => c.textContent);
const lines = (items) => items.at(-1).children[0].children;

test('R0 card: CN shows 12356 and 110 / 120 in bold, in either interface language', () => {
  for (const l of ['zh', 'en']) {
    setLang(l);
    const { log, items } = rig();
    log.addReply('x');
    log.showCrisisCard(() => {}, 'CN');
    const [, hotline, emergency] = lines(items);
    assert.equal(text(hotline), COPY[l].crisisHotlineCN);
    assert.equal(text(emergency), COPY[l].crisisEmergencyCN);
    assert.deepEqual(strong(hotline), ['12356']);
    assert.deepEqual(strong(emergency), ['110', '120']);
  }
  setLang('zh');
});

test('R0 card: US keeps the P1 lines; no region or an unknown one shows the international lines with no number', () => {
  setLang('en');
  let { log, items } = rig();
  log.addReply('x');
  log.showCrisisCard(() => {}, 'US');
  assert.equal(text(lines(items)[1]), copy.crisis988);
  for (const r of [null, undefined, 'HK', 'other']) {
    ({ log, items } = rig());
    log.addReply('x');
    log.showCrisisCard(() => {}, r);
    const [, hotline, emergency] = lines(items);
    assert.equal(text(hotline), copy.crisisHotlineOther, String(r));
    assert.equal(text(emergency), copy.crisisEmergencyOther, String(r));
    assert.deepEqual(strong(hotline), []);
  }
  setLang('zh');
});

test('R0 card: the region stays on a language switch', () => {
  setLang('zh');
  const { log, items } = rig();
  log.addReply('x');
  log.showCrisisCard(() => {}, 'CN');
  setLang('en');
  log.refresh();
  assert.equal(text(lines(items)[1]), COPY.en.crisisHotlineCN);
  setLang('zh');
});

test('R0 every new card key exists in zh and en', () => {
  for (const l of ['zh', 'en']) {
    for (const k of ['crisisHotlineCN', 'crisisEmergencyCN', 'crisisHotlineOther', 'crisisEmergencyOther']) {
      assert.equal(typeof COPY[l][k], 'string', `${l}.${k}`);
    }
  }
});

test('R0 speech (zh): runs of 3+ digits are read digit by digit in Chinese numerals; en keeps digit words', async () => {
  const { speechParts } = await import('../server/tts.js');
  const cn = speechParts(`我听到你了。${CRISIS_LINES.CN.zh.line}`, 'zh').join('');
  assert.ok(cn.includes('幺二三五六') && !/[0-9]/.test(cn), cn);
  assert.ok(speechParts(`我听到你了。${CRISIS_LINES.US.zh.line}`, 'zh').join('').includes('九八八'));
  assert.deepEqual(speechParts('请打 110 或 120。', 'zh'), ['请打 幺幺零 或 幺二零。']);
  assert.deepEqual(speechParts('我们聊了 3 天。', 'zh'), ['我们聊了 3 天。'], 'short numbers are left to the voice');
  assert.ok(speechParts(CRISIS_LINES.CN.en.line, 'en').join(' ').includes('one two three five six'));
});
