// R1 (docs/frontend/r1-memory/01-ux.md): the first-run notice in the log, the drawer with its two tabs
// (心情日记 = PAGE-002, 小伙伴记得的你 = PAGE-003) and the privacy line. Data comes only through the injected
// client (memory-client.js); every user-visible word is t() from memory-copy.js or copy.js. All text goes in
// with textContent, so the user's own file is never read as markup. Focus rules: FLOW-015..020, 01-ux.md §2.
import { copy, getName } from './copy.js';
import { t, tf, MEMORY_PATH } from './memory-copy.js';
import { cleanName, typingFilter, MAX_NAME } from './name.js';

const VALENCE = { 'pleasant-high': 1, 'pleasant-low': 0.5, neutral: 0, 'unpleasant-high': -0.5, 'unpleasant-low': -1 };
const REGIONS = [['CN', 'regionCN', 'regionLineCN'], ['US', 'regionUS', 'regionLineUS'], ['other', 'regionOther', 'regionLineOther']];
const NS = 'http://www.w3.org/2000/svg';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

function h(tag, cls, text, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
const button = (cls, text, testid) => {
  const b = h('button', cls, text, { type: 'button' });
  if (testid) b.dataset.testid = testid;
  return b;
};
const sr = (text) => h('span', 'sr-only', text, { role: 'status' });

// 关于你.md as headings, lists and paragraphs, word for word (REQ-043); the page never translates it.
export function renderMarkdown(text) {
  const box = document.createDocumentFragment();
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { list = null; continue; }
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (head) { list = null; box.append(h(head[1].length === 1 ? 'h3' : 'h4', 'md__h', head[2])); }
    else if (item) {
      if (!list) { list = h('ul', 'md__list'); box.append(list); }
      list.append(h('li', null, item[1]));
    } else { list = null; box.append(h('p', 'md__p', line.trim())); }
  }
  return box;
}
export const aboutIsEmpty = (md) => !String(md).split('\n').some((l) => l.trim() && !/^\s*#/.test(l));

export function createMemoryUi({ client, drawer, main, openers, noticeHost, privacyEl, showHint, onNameSaved, onForgotten, onStartChat }) {
  const tabs = {
    diary: drawer.querySelector('[data-tab="diary"]'),
    about: drawer.querySelector('[data-tab="about"]'),
  };
  const closeBtn = drawer.querySelector('.drawer__close');
  const sub = drawer.querySelector('.drawer__sub');
  const panels = { diary: drawer.querySelector('[data-panel="diary"]'), about: drawer.querySelector('[data-panel="about"]') };

  let profile = null;      // last read of the profile; null until read
  let profileFailed = false;
  let current = null;      // 'diary' | 'about' while open
  let opener = null;
  let token = 0;           // a late answer for a tab that is gone is dropped
  let noticeEl = null;
  let asking = false;      // forget me: asked in place

  const memoryOn = () => profile?.memoryOn !== false;
  const api = {
    get kept() { return Boolean(profile?.kept); },
    get isOpen() { return current !== null; },
  };

  // ---------- privacy line + notice (PAGE-001) ----------
  function renderPrivacy() {
    if (!privacyEl) return;
    if (!profile && !profileFailed) { privacyEl.textContent = ''; return; }
    const key = profileFailed || profile?.readable === false ? 'privacyUnreadable' : memoryOn() ? 'privacyOn' : 'privacyOff';
    privacyEl.textContent = copy[key];
  }

  function noticeText() {
    if (!noticeEl) return;
    noticeEl.setAttribute('aria-label', t('noticeLabel'));
    noticeEl.querySelector('.notice__title').textContent = t('noticeTitle');
    ['noticeSummary', 'noticeMoods', 'noticeProfile'].forEach((k, i) => { noticeEl.querySelectorAll('.notice__kept li')[i].textContent = t(k); });
    noticeEl.querySelector('.notice__never').textContent = t('noticeNever');
    noticeEl.querySelector('.notice__where').textContent = `${t('noticeWhere')} ${MEMORY_PATH}`;
    noticeEl.querySelector('.notice__later').textContent = t('noticeLater');
    noticeEl.querySelector('[data-testid="notice-ok"]').textContent = t('noticeOk');
    noticeEl.querySelector('[data-testid="notice-off"]').textContent = t('noticeOff');
  }

  function removeNotice() { noticeEl?.remove(); noticeEl = null; }

  function showNotice() {
    if (noticeEl || !noticeHost) return;
    noticeEl = h('section', 'notice', null, { role: 'region' });
    noticeEl.dataset.testid = 'memory-notice';
    const kept = h('ul', 'notice__kept');
    kept.append(h('li'), h('li'), h('li'));
    const ok = button('notice__btn notice__btn--main', '', 'notice-ok');
    const off = button('notice__btn', '', 'notice-off');
    noticeEl.append(h('p', 'notice__title'), kept, h('p', 'notice__never'), h('p', 'notice__where'), h('p', 'notice__later'),
      h('div', 'notice__actions'));
    noticeEl.querySelector('.notice__actions').append(ok, off);
    noticeHost.prepend(noticeEl);
    noticeText();
    let busy = false;
    ok.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try { await client.acknowledgeNotice(); profile = { ...profile, noticeSeen: true }; removeNotice(); }
      catch { showHint('noticeFailed'); } // the notice stays
      busy = false;
    });
    off.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try {
        await client.setMemory(false);
        profile = { ...profile, memoryOn: false, noticeSeen: true };
        removeNotice(); renderPrivacy(); showHint('memoryOffNow');
      } catch { showHint('memoryOffFailed'); }
      busy = false;
    });
  }

  async function start() {
    try {
      profile = await client.getProfile();
      profileFailed = false;
    } catch { profile = null; profileFailed = true; }
    renderPrivacy();
    if (profile?.readable && !profile.noticeSeen) showNotice();
  }

  // ---------- drawer shell ----------
  function renderShell() {
    tabs.diary.textContent = t('tabDiary');
    tabs.about.textContent = t('tabAbout');
    closeBtn.textContent = t('drawerClose');
    tabs.diary.setAttribute('aria-selected', String(current === 'diary'));
    tabs.about.setAttribute('aria-selected', String(current === 'about'));
    tabs.diary.tabIndex = current === 'diary' ? 0 : -1;
    tabs.about.tabIndex = current === 'about' ? 0 : -1;
    drawer.querySelector('[role="tablist"]').setAttribute('aria-label', t('drawerTabs'));
    drawer.setAttribute('aria-label', t(current === 'about' ? 'tabAbout' : 'tabDiary'));
    sub.textContent = t(current === 'about' ? 'aboutSub' : 'diarySub');
    panels.diary.hidden = current !== 'diary';
    panels.about.hidden = current !== 'about';
    drawer.querySelector('.drawer__scroll').scrollTop = 0;
    openers.diary.setAttribute('aria-pressed', String(current === 'diary'));
    openers.about.setAttribute('aria-pressed', String(current === 'about'));
  }

  function select(which, { focus = false } = {}) {
    current = which;
    asking = false;
    renderShell();
    if (which === 'diary') loadDiary(); else loadAbout();
    if (focus) tabs[which].focus();
  }

  function open(which, from) {
    if (current) { select(which, { focus: true }); return; }
    opener = from ?? openers[which];
    drawer.hidden = false;
    main.inert = true;
    document.body.classList.add('has-drawer');
    select(which, { focus: true });
  }

  function close({ toInput = false } = {}) {
    if (!current) return;
    current = null;
    token += 1;
    drawer.hidden = true;
    main.inert = false;
    document.body.classList.remove('has-drawer');
    openers.diary.setAttribute('aria-pressed', 'false');
    openers.about.setAttribute('aria-pressed', 'false');
    if (toInput) onStartChat?.(); else opener?.focus();
    opener = null;
  }

  openers.diary.addEventListener('click', () => (current === 'diary' ? close() : open('diary', openers.diary)));
  openers.about.addEventListener('click', () => (current === 'about' ? close() : open('about', openers.about)));
  closeBtn.addEventListener('click', () => close());
  tabs.diary.addEventListener('click', () => select('diary'));
  tabs.about.addEventListener('click', () => select('about'));
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault();
      if (asking) { cancelAsk(); return; }
      close();
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.getAttribute('role') === 'tab') {
      e.preventDefault();
      select(e.target.dataset.tab === 'diary' ? 'about' : 'diary', { focus: true });
      return;
    }
    if (e.key === 'Tab') { // modal: focus never leaves the drawer
      const els = [...drawer.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]') && el.tabIndex >= 0);
      if (!els.length) return;
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- PAGE-002 mood diary ----------
  function loading(panel, key) {
    panel.replaceChildren(h('div', 'skeleton', null, { 'aria-hidden': 'true' }), sr(t(key)));
    panel.setAttribute('aria-busy', 'true');
  }
  function errorBlock(panel, key, retry) {
    panel.removeAttribute('aria-busy');
    const box = h('div', 'panel__msg');
    const p = h('p', null, t(key), { role: 'alert' });
    const b = button('btn', t('retry'), 'retry');
    b.addEventListener('click', retry);
    box.append(p, b);
    panel.replaceChildren(box);
    return b;
  }

  async function loadDiary() {
    const mine = ++token;
    const panel = panels.diary;
    loading(panel, 'diaryLoading');
    let data;
    try { data = await client.getDiary(); } catch {
      if (mine !== token) return;
      errorBlock(panel, 'diaryError', loadDiary).focus();
      return;
    }
    if (mine !== token) return;
    panel.removeAttribute('aria-busy');
    renderDiary(panel, data);
  }

  const isoToday = (data) => data.days[data.days.length - 1].date;
  function renderDiary(panel, data) {
    panel.replaceChildren();
    if (!data.hasAny) {
      const box = h('div', 'panel__msg');
      box.append(h('p', null, t('diaryEmpty')));
      const go = button('btn', t('diaryStart'), 'diary-start');
      go.addEventListener('click', () => close({ toInput: true }));
      box.append(go);
      if (data.memoryOn === false) box.prepend(offLine(data, panel));
      panel.append(box);
      return;
    }
    if (data.memoryOn === false) panel.append(offLine(data, panel));
    panel.append(curve(data));
    const today = data.days[data.days.length - 1];
    const list = h('div', 'days');
    list.dataset.testid = 'diary-days';
    if (!today.entries.length) list.append(h('p', 'days__today-empty', t('todayEmpty')));
    for (const day of [...data.days].reverse()) {
      if (!day.entries.length) continue;
      const [y, m, d] = day.date.split('-').map(Number);
      const sec = h('section', 'day');
      sec.append(h('h4', 'day__head', tf('dayHeading')(m, d, day.date === isoToday(data))));
      const ul = h('ul', 'day__rows');
      for (const e of day.entries) {
        const li = h('li', 'day__row');
        li.append(h('span', 'day__point', e.point ?? ''), h('span', 'day__mood', tf('mood')[e.mood] ?? ''));
        ul.append(li);
      }
      sec.append(ul);
      list.append(sec);
    }
    panel.append(list, h('p', 'panel__note', t('diaryNote')));
  }

  function offLine(data, panel) {
    const row = h('div', 'off-line');
    row.append(h('p', null, t('diaryOff')));
    const on = button('btn', t('memoryTurnOn'), 'diary-turn-on');
    on.addEventListener('click', async () => {
      on.disabled = true;
      try {
        await client.setMemory(true);
        profile = { ...profile, memoryOn: true };
        renderPrivacy();
        renderDiary(panel, { ...data, memoryOn: true });
        tabs.diary.focus();
      } catch { on.disabled = false; row.append(h('p', 'field-msg', t('saveFailed'), { role: 'alert' })); }
    });
    row.append(on);
    return row;
  }

  function curve(data) {
    const wrap = h('section', 'curve', null, { 'aria-labelledby': 'curve-h' });
    wrap.append(h('h3', 'curve__h', t('weekHeading'), { id: 'curve-h' }));
    const fig = h('div', 'curve__fig', null, { role: 'img', 'aria-label': t('curveAlt') });
    const axis = h('div', 'curve__axis', null, { 'aria-hidden': 'true' });
    axis.append(h('span', 'curve__tick curve__tick--up', t('axisUp')), h('span', 'curve__tick curve__tick--mid', t('axisMid')), h('span', 'curve__tick curve__tick--down', t('axisDown')));
    const plot = h('div', 'curve__plot', null, { 'aria-hidden': 'true' });
    const area = h('div', 'curve__area');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 7 2');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('curve__lines');
    const mid = document.createElementNS(NS, 'line');
    mid.setAttribute('x1', '0'); mid.setAttribute('x2', '7'); mid.setAttribute('y1', '1'); mid.setAttribute('y2', '1');
    mid.setAttribute('class', 'curve__mid');
    svg.append(mid);
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const pl = document.createElementNS(NS, 'polyline');
        pl.setAttribute('points', run.map(([x, y]) => `${x},${y}`).join(' '));
        pl.setAttribute('class', 'curve__line');
        svg.append(pl);
      }
      run = [];
    };
    const labels = h('div', 'curve__labels', null, { 'aria-hidden': 'true' });
    labels.append(h('span'));
    data.days.forEach((day, i) => {
      const [, m, d] = day.date.split('-').map(Number);
      const isToday = i === data.days.length - 1;
      const dt = new Date(`${day.date}T12:00:00`);
      const lab = h('span', 'curve__day');
      lab.append(h('span', 'curve__wd', isToday ? t('dayToday') : tf('weekday')(dt.getDay())));
      lab.append(h('span', 'curve__md', `${m}/${d}`));
      labels.append(lab);
      if (!day.entries.length) {
        flush();
        area.append(Object.assign(h('span', 'curve__none', t('dayNone')), { style: `left:${((i + 0.5) / 7) * 100}%` }));
        return;
      }
      const v = day.entries.reduce((s, e) => s + (VALENCE[e.mood] ?? 0), 0) / day.entries.length;
      const y = 1 - v;
      run.push([i + 0.5, y]);
      area.append(Object.assign(h('span', 'curve__dot'), { style: `left:${((i + 0.5) / 7) * 100}%;top:${(y / 2) * 100}%` }));
    });
    flush();
    area.prepend(svg);
    plot.append(area);
    fig.append(axis, plot, labels);
    wrap.append(fig);
    return wrap;
  }

  // ---------- PAGE-003 what the companion remembers ----------
  async function loadAbout() {
    const mine = ++token;
    const panel = panels.about;
    loading(panel, 'profileLoading');
    let p;
    try { p = await client.getProfile(); } catch {
      if (mine !== token) return;
      profileFailed = true; profile = null; renderPrivacy();
      errorBlock(panel, 'profileError', loadAbout).focus();
      return;
    }
    if (mine !== token) return;
    profile = p; profileFailed = false; renderPrivacy();
    panel.removeAttribute('aria-busy');
    if (!p.readable) { errorBlock(panel, 'profileError', loadAbout); return; }
    renderAbout(panel);
  }

  function field(label, id) { // a settings row: label, control slot, message line
    const row = h('div', 'set');
    row.append(h('label', 'set__label', label, { for: id }));
    return row;
  }
  const msg = () => h('p', 'field-msg', '', { role: 'status' });
  const say = (el, text) => { el.textContent = text ?? ''; };

  function renderAbout(panel) {
    panel.replaceChildren();
    const p = profile;
    if (!memoryOn()) panel.append(h('p', 'about__paused', t('aboutPaused')));
    if (aboutIsEmpty(p.about)) panel.append(h('p', 'about__empty', t('aboutEmpty'), { 'data-testid': 'about-empty' }));
    else {
      const box = h('div', 'about__box');
      box.dataset.testid = 'about-box';
      box.append(renderMarkdown(p.about));
      panel.append(box);
    }
    panel.append(h('p', 'about__where', t('memoryWhere')), h('p', 'about__edit', t('aboutEdit')));

    // name
    const nameRow = field(t('nameHeading'), 'about-name');
    const nameIn = h('input', 'input', null, { id: 'about-name', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    nameIn.dataset.testid = 'about-name';
    nameIn.value = getName();
    const nameMsg = msg();
    let nameShown = nameIn.value;
    let nameBusy = false;
    async function saveNameField() {
      if (nameBusy) return;
      const cleaned = cleanName(nameIn.value);
      if (cleaned === cleanName(getName())) { nameIn.value = nameShown = getName(); return; } // unchanged (blank = default again)
      nameBusy = true; say(nameMsg, '');
      try {
        await client.setName(cleaned);
        onNameSaved(cleaned);
        nameIn.value = nameShown = getName();
      } catch { nameIn.value = nameShown; say(nameMsg, t('saveFailed')); }
      nameBusy = false;
    }
    nameIn.addEventListener('input', () => { const v = typingFilter(nameIn.value); if (v !== nameIn.value) nameIn.value = v; });
    nameIn.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); saveNameField(); }
      else if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); nameIn.value = nameShown; say(nameMsg, ''); }
    });
    nameIn.addEventListener('blur', saveNameField);
    nameIn.maxLength = MAX_NAME * 2;
    nameRow.append(nameIn, nameMsg);

    // region
    const regionRow = field(t('regionHeading'), 'about-region');
    const sel = h('select', 'select', null, { id: 'about-region' });
    sel.dataset.testid = 'about-region';
    const chosen = p.region ?? p.systemRegion ?? 'other';
    for (const [value, key] of REGIONS) {
      const o = h('option', null, t(key) + (p.region == null && value === chosen ? ` ${t('regionSystem')}` : ''), { value });
      if (value === chosen) o.selected = true;
      sel.append(o);
    }
    const wrapSel = h('span', 'select-wrap');
    wrapSel.append(sel, svgIcon('i-chevron-down'));
    const lineEl = h('span', 'set__aside');
    const regionKey = (r) => REGIONS.find(([v]) => v === r)[2];
    lineEl.textContent = t(regionKey(chosen));
    const regionNote = h('p', 'set__note', t('regionNote'));
    const regionMsg = msg();
    let regionShown = chosen;
    sel.addEventListener('change', async () => {
      const next = sel.value; say(regionMsg, '');
      try {
        await client.setRegion(next);
        profile = { ...profile, region: next };
        regionShown = next;
        sel.querySelectorAll('option').forEach((o, i) => { o.textContent = t(REGIONS[i][1]); });
        lineEl.textContent = t(regionKey(next));
        say(regionMsg, t('regionSaved'));
      } catch { sel.value = regionShown; say(regionMsg, t('saveFailed')); }
    });
    regionRow.append(wrapSel, lineEl, regionNote, regionMsg);

    // memory switch
    const memRow = h('div', 'set');
    memRow.append(h('span', 'set__label', t('memoryHeading'), { id: 'mem-h' }));
    const sw = button('switch', null, 'memory-switch');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-labelledby', 'mem-h mem-name');
    const swName = h('span', 'sr-only', t('memorySwitch'), { id: 'mem-name' });
    const swWord = h('span', 'switch__word');
    sw.append(swWord, h('span', 'switch__knob', null, { 'aria-hidden': 'true' }));
    const memNote = h('p', 'set__note');
    const memMsg = msg();
    const paintSwitch = () => {
      const on = memoryOn();
      sw.setAttribute('aria-checked', String(on));
      swWord.textContent = on ? t('on') : t('off');
      memNote.textContent = t(on ? 'memoryOnNote' : 'memoryOffNote');
    };
    paintSwitch();
    sw.addEventListener('click', async () => {
      const next = !memoryOn(); say(memMsg, '');
      sw.disabled = true;
      try {
        await client.setMemory(next);
        profile = { ...profile, memoryOn: next };
        paintSwitch(); renderPrivacy();
        const paused = panel.querySelector('.about__paused');
        if (next) paused?.remove();
        else if (!paused) panel.prepend(h('p', 'about__paused', t('aboutPaused')));
      } catch { say(memMsg, t('saveFailed')); }
      sw.disabled = false; sw.focus();
    });
    memRow.append(sw, swName, memNote, memMsg);

    panel.append(nameRow, regionRow, memRow, forgetBlock(panel));
  }

  function svgIcon(id) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icon icon--small select-wrap__chev');
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use');
    u.setAttribute('href', `#${id}`);
    s.append(u);
    return s;
  }

  // forget me: asks once, in place; 不了 has focus; Esc is 不了 (handled by the drawer's keydown)
  let forgetHost = null;
  function cancelAsk() {
    asking = false;
    renderForget();
    forgetHost.querySelector('[data-testid="forget"]')?.focus();
  }
  function forgetBlock() {
    forgetHost = h('div', 'forget');
    renderForget();
    return forgetHost;
  }
  function renderForget(result = null) {
    forgetHost.replaceChildren();
    if (asking) {
      const q = h('p', 'forget__ask', t('forgetAsk'), { id: 'forget-q' });
      const no = button('btn', t('forgetNo'), 'forget-no');
      const yes = button('btn btn--danger', t('forgetYes'), 'forget-yes');
      forgetHost.setAttribute('role', 'group');
      forgetHost.setAttribute('aria-labelledby', 'forget-q');
      const row = h('div', 'forget__actions');
      row.append(no, yes);
      forgetHost.append(q, row);
      no.addEventListener('click', cancelAsk);
      yes.addEventListener('click', async () => {
        yes.disabled = no.disabled = true;
        try {
          const r = await client.forget();
          profile = { ...profile, about: '', kept: false, memoryOn: r?.memoryOn ?? memoryOn() };
          asking = false;
          onForgotten?.();
          renderAbout(panels.about);
          const host = forgetHost;
          host.prepend(h('p', 'forget__result', t(memoryOn() ? 'forgotten' : 'forgottenOff'), { role: 'status', 'data-testid': 'forget-result' }));
          closeBtn.focus();
        } catch {
          yes.disabled = no.disabled = false;
          forgetHost.append(h('p', 'field-msg', t('forgetFailed'), { role: 'alert' }));
          yes.focus();
        }
      });
      requestAnimationFrame(() => no.focus());
      no.focus();
      return;
    }
    forgetHost.removeAttribute('role');
    forgetHost.removeAttribute('aria-labelledby');
    const b = button('btn btn--danger', t('forget'), 'forget');
    b.addEventListener('click', () => { asking = true; renderForget(); });
    forgetHost.append(b, h('p', 'set__note', t('forgetNote')));
    void result;
  }

  // a language switch: the notice, the privacy line and the stage-button names follow; the drawer cannot be open then
  function refresh() {
    renderPrivacy();
    noticeText();
    openers.diary.setAttribute('aria-label', t('tabDiary'));
    openers.about.setAttribute('aria-label', t('tabAbout'));
  }

  Object.assign(api, { start, refresh, open, close, select });
  return api;
}
