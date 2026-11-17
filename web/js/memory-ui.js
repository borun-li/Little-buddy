// R1 (docs/frontend/r1-memory/01-ux.md): the first-run notice in the log, the drawer with its two tabs
// (心情日记 = PAGE-002, 小伙伴记得的你 = PAGE-003) and the privacy line. Data comes only through the injected
// client (memory-client.js); every user-visible word is t() from memory-copy.js or copy.js. All text goes in
// with textContent, so the user's own file is never read as markup. Focus rules: FLOW-015..020, 01-ux.md §2.
import { copy, getName } from './copy.js';
import { t, tf, getMemoryPath, setMemoryPath, errorWords, MEMORY_FILE } from './memory-copy.js';
import { cleanName, typingFilter, MAX_NAME } from './name.js';

const REGIONS = [['CN', 'regionCN', 'regionLineCN'], ['US', 'regionUS', 'regionLineUS'], ['other', 'regionOther', 'regionLineOther']];
// the two hints a failed notice choice leaves on the shared hint line; the next success clears them (clearHint)
const NOTICE_FAILS = ['noticeFailed', 'memoryOffFailed'];
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

export function createMemoryUi({ client, drawer, main, openers, noticeHost, privacyEl, showHint, clearHint, onNameSaved, onForgotten, onStartChat, onProfile }) {
  const tabs = {
    diary: drawer.querySelector('[data-tab="diary"]'),
    about: drawer.querySelector('[data-tab="about"]'),
  };
  const closeBtn = drawer.querySelector('.drawer__close');
  const sub = drawer.querySelector('.drawer__sub');
  const scrollEl = drawer.querySelector('.drawer__scroll');
  // FND-045: a live region that exists (empty) before it is written to, so the result of 忘掉我 is announced; the cleared hint
  // sits in the inert page, so this is the one voice for it. Focus stays on 关闭 (FLOW-020).
  const announcer = sr('');
  announcer.dataset.testid = 'drawer-announce';
  drawer.append(announcer);
  const panels = { diary: drawer.querySelector('[data-panel="diary"]'), about: drawer.querySelector('[data-panel="about"]') };

  let profile = null;      // last read of the profile; null until read
  let profileFailed = false;
  let current = null;      // 'diary' | 'about' while open
  let opener = null;
  let token = 0;           // a late answer for a tab that is gone is dropped
  let noticeEl = null;
  let asking = false;      // forget me: asked in place

  const memoryOn = () => profile?.memoryOn !== false;
  // A failed call says its row's words (01-ux.md §6); 'unreadable' also marks the files unreadable (privacy line).
  function failed(row, err) {
    const w = errorWords(row, err?.code);
    if (w.unreadable && profile) { profile = { ...profile, readable: false }; renderPrivacy(); }
    return w;
  }
  const api = {
    get kept() { return Boolean(profile?.kept); },
    get isOpen() { return current !== null; },
    // a reply came back while memory is on: the service has recorded the turn, so something is kept now (the profile
    // read at open predates it); clearedKept needs this, or a first chat's 清空 would say nothing is remembered
    noteTurn() { if (profile && profile.readable !== false && memoryOn()) profile = { ...profile, kept: true }; },
  };

  // ---------- privacy line + notice (PAGE-001) ----------
  function renderPrivacy() {
    if (!privacyEl) return;
    if ((!profile && !profileFailed) || noticeEl) { privacyEl.textContent = ''; return; } // not while the first-run notice is open (PAGE-001)
    const key = profileFailed || profile?.readable === false ? 'privacyUnreadable' : memoryOn() ? 'privacyOn' : 'privacyOff';
    privacyEl.textContent = copy[key];
  }

  function noticeText() {
    if (!noticeEl) return;
    noticeEl.querySelector('.notice__title').textContent = t('noticeTitle');
    ['noticeSummary', 'noticeMoods', 'noticeProfile'].forEach((k, i) => {
      const li = noticeEl.querySelectorAll('.notice__kept li')[i];
      const text = t(k);
      const cut = text.search(/[：:]/); // the word up to the colon is the label (600)
      li.replaceChildren();
      if (cut < 0) { li.textContent = text; return; }
      li.append(h('strong', null, text.slice(0, cut + 1)), document.createTextNode(text.slice(cut + 1)));
    });
    noticeEl.querySelector('.notice__never').textContent = t('noticeNever');
    noticeEl.querySelector('.notice__where').replaceChildren(document.createTextNode(t('noticeWhere')), h('span', 'notice__path', getMemoryPath()));
    noticeEl.querySelector('.notice__later').textContent = t('noticeLater');
    noticeEl.querySelector('[data-testid="notice-ok"]').textContent = t('noticeOk');
    noticeEl.querySelector('[data-testid="notice-off"]').textContent = t('noticeOff');
  }

  // fades out in 150 ms (removed at once under reduced motion), then focus goes to the input (FLOW-015)
  function removeNotice() {
    const el = noticeEl; noticeEl = null;
    if (!el) return;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) el.remove(); else { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 150); }
    renderPrivacy(); // the line appears once the notice is answered
    onStartChat?.();
  }

  function showNotice() {
    if (noticeEl || !noticeHost) return;
    noticeEl = h('section', 'notice', null, { role: 'region', 'aria-labelledby': 'notice-title' }); // named by its title (CMP-020)
    noticeEl.dataset.testid = 'memory-notice';
    const kept = h('ul', 'notice__kept');
    kept.append(h('li'), h('li'), h('li'));
    const ok = button('btn btn--soft', '', 'notice-ok');
    const off = button('btn', '', 'notice-off');
    noticeEl.append(h('p', 'notice__title', null, { id: 'notice-title' }), kept, h('p', 'notice__never'), h('p', 'notice__where'), h('p', 'notice__later'),
      h('div', 'notice__actions'));
    noticeEl.querySelector('.notice__actions').append(ok, off);
    noticeHost.prepend(noticeEl);
    noticeText();
    let busy = false;
    ok.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try { await client.acknowledgeNotice(); profile = { ...profile, noticeSeen: true }; clearHint?.(...NOTICE_FAILS); removeNotice(); }
      catch (err) { showHint(failed('notice', err).key); } // the notice stays
      busy = false;
    });
    off.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try {
        await client.setMemory(false);
        profile = { ...profile, memoryOn: false, noticeSeen: true };
        removeNotice(); renderPrivacy(); showHint('memoryOffNow'); // replaces a failure hint on the line
      } catch (err) { showHint(failed('memoryOff', err).key); }
      busy = false;
    });
  }

  async function start() {
    try {
      profile = await client.getProfile();
      profileFailed = false;
      setMemoryPath(profile.path);
    } catch { profile = null; profileFailed = true; }
    if (profile?.readable && !profile.noticeSeen) showNotice();
    renderPrivacy(); // after showNotice: the line waits while the notice is open
    onProfile?.(profile);
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
    scrollEl.scrollTop = 0;
    scrollEl.setAttribute('aria-labelledby', current === 'about' ? 'tab-about' : 'tab-diary'); // FND-044: the keyboard-scrollable body is named by its tab
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
  // loading (FRAME-037): static Linen blocks shaped like the tab they stand in for; screen readers hear the words, nothing is focusable
  function loading(panel, key, kind) {
    const sk = h('div', `skeleton skeleton--${kind}`, null, { 'aria-hidden': 'true' });
    if (kind === 'about') {
      sk.append(h('i', 'sk-file'));
      for (let i = 0; i < 3; i += 1) { const row = h('div', 'sk-set'); row.append(h('i', 'sk-label'), h('i', 'sk-field')); sk.append(row); }
    } else {
      sk.append(h('i', 'sk-head'), h('i', 'sk-big'));
      for (let i = 0; i < 3; i += 1) { const row = h('div', 'sk-line'); row.append(h('i', 'sk-text'), h('i', 'sk-tag')); sk.append(row); }
    }
    panel.replaceChildren(sk, sr(t(key)));
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
    loading(panel, 'diaryLoading', 'diary');
    let data;
    try { data = await client.getDiary(); } catch (err) {
      if (mine !== token) return;
      errorBlock(panel, failed('diary', err).key, loadDiary).focus();
      return;
    }
    if (mine !== token) return;
    panel.removeAttribute('aria-busy');
    if (data.readable === false) { errorBlock(panel, errorWords('diary').key, loadDiary).focus(); return; } // no retry loop: the button is the user's
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
        const tag = h('span', 'mood');
        tag.append(h('i', `dot dot--${e.mood}`, null, { 'aria-hidden': 'true' }), document.createTextNode(tf('mood')[e.mood] ?? ''));
        li.append(h('span', 'day__point', e.point ?? ''), tag);
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
    const fail = h('p', 'field-msg', '', { role: 'alert' }); // one line, rewritten by every failed try (never stacked)
    on.addEventListener('click', async () => {
      on.disabled = true; fail.textContent = '';
      try {
        await client.setMemory(true);
        profile = { ...profile, memoryOn: true };
        renderPrivacy();
        renderDiary(panel, { ...data, memoryOn: true });
        tabs.diary.focus();
      } catch (err) { on.disabled = false; fail.textContent = t(failed('setting', err).key); }
    });
    row.append(on, fail);
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
    for (const gy of [0, 1, 2]) { // grid at +1, 0, -1
      const g = document.createElementNS(NS, 'line');
      g.setAttribute('x1', '0'); g.setAttribute('x2', '7'); g.setAttribute('y1', String(gy)); g.setAttribute('y2', String(gy));
      g.setAttribute('class', 'curve__mid');
      svg.append(g);
    }
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
      const lab = h('span', isToday ? 'curve__day curve__day--today' : 'curve__day');
      lab.append(h('span', 'curve__wd', isToday ? t('dayToday') : tf('weekday')(dt.getDay())));
      lab.append(h('span', 'curve__md', `${m}/${d}`));
      labels.append(lab);
      if (day.value == null) {
        flush();
        area.append(Object.assign(h('span', 'curve__none', t('dayNone')), { style: `left:${((i + 0.5) / 7) * 100}%` }));
        return;
      }
      const v = day.value; // the service's day value, -1..+1 (contract § R1 seam); the page does not average
      const y = 1 - v;
      run.push([i + 0.5, y]);
      const tone = v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'mid';
      area.append(Object.assign(h('span', `curve__dot curve__dot--${tone}`), { style: `left:${((i + 0.5) / 7) * 100}%;top:${(y / 2) * 100}%` }));
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
    loading(panel, 'profileLoading', 'about');
    let p;
    try { p = await client.getProfile(); } catch (err) {
      if (mine !== token) return;
      profileFailed = true; profile = null; renderPrivacy();
      errorBlock(panel, failed('profile', err).key, loadAbout).focus();
      panel.append(deadControls());
      return;
    }
    if (mine !== token) return;
    profile = p; profileFailed = false; setMemoryPath(p.path); renderPrivacy();
    panel.removeAttribute('aria-busy');
    if (!p.readable) { errorBlock(panel, errorWords('profile').key, loadAbout); panel.append(deadControls()); return; }
    renderAbout(panel);
  }

  // unreadable: the controls show but cannot change anything (FRAME-037, error · read)
  function deadControls() {
    const box = h('div', 'dead');
    box.append(h('input', 'input', null, { disabled: '', 'aria-label': t('nameHeading'), value: getName(), 'data-testid': 'about-name' }));
    const sel = h('select', 'select', null, { disabled: '', 'aria-label': t('regionHeading'), 'data-testid': 'about-region' });
    // the region a crisis turn would use: the chosen one, else this Mac's (FND-061); nothing known = other
    const shown = profile?.region ?? profile?.systemRegion ?? 'other';
    sel.append(h('option', null, t(REGIONS.find(([v]) => v === shown)?.[1] ?? 'regionOther')));
    // a real disabled switch (named, off), so assistive tech finds what cannot be changed (CMP-015 disabled)
    const sw = button('switch', null, 'memory-switch');
    sw.disabled = true;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', 'false');
    sw.setAttribute('aria-label', t('memorySwitch'));
    sw.append(h('span', 'switch__knob', null, { 'aria-hidden': 'true' }));
    box.append(sel, sw);
    return box;
  }

  function field(label, id) { // a settings row: label, control slot, message line
    const row = h('div', 'set');
    row.append(h('label', 'set__label', label, { for: id }));
    row.body = h('div', 'set__body');
    row.append(row.body);
    return row;
  }
  const msg = () => h('p', 'field-msg', '', { role: 'status' });
  const say = (el, text) => { el.textContent = text ?? ''; };

  function renderAbout(panel) {
    panel.replaceChildren();
    const p = profile;
    if (!memoryOn()) panel.append(h('p', 'about__paused', t('aboutPaused')));
    if (p.aboutEmpty) panel.append(h('p', 'about__empty', t('aboutEmpty'), { 'data-testid': 'about-empty' }));
    else {
      const box = h('div', 'about__box');
      box.dataset.testid = 'about-box';
      box.append(h('p', 'about__file', MEMORY_FILE), renderMarkdown(p.about));
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
      } catch (err) { nameIn.value = nameShown; say(nameMsg, t(failed('setting', err).key)); }
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
    nameRow.body.append(nameIn, nameMsg);

    // region
    const regionRow = field(t('regionHeading'), 'about-region');
    const sel = h('select', 'select', null, { id: 'about-region' });
    sel.dataset.testid = 'about-region';
    const chosen = p.region ?? p.systemRegion ?? 'other';
    for (const [value, key] of REGIONS) {
      const sys = p.region == null && value === chosen ? t('regionSystem') : ''; // zh: （…）joins its option with no space (FRAME-037)
      const o = h('option', null, t(key) + (sys && !sys.startsWith('（') ? ' ' : '') + sys, { value });
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
      } catch (err) { sel.value = regionShown; say(regionMsg, t(failed('setting', err).key)); }
    });
    const line = h('div', 'set__line');
    line.append(wrapSel, lineEl);
    regionNote.id = 'region-note';
    lineEl.id = 'region-line';
    sel.setAttribute('aria-describedby', 'region-line region-note'); // CMP-016: the numbers and the note are read with the select
    regionRow.body.append(line, regionNote, regionMsg);

    // memory switch
    const memRow = h('div', 'set');
    memRow.append(h('span', 'set__label', t('memoryHeading'), { id: 'mem-h' }));
    memRow.body = h('div', 'set__body');
    memRow.append(memRow.body);
    const sw = button('switch', null, 'memory-switch');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-labelledby', 'mem-h mem-name');
    const swName = h('span', 'sr-only', t('memorySwitch'), { id: 'mem-name' });
    const swWord = h('span', 'switch__word');
    sw.append(h('span', 'switch__knob', null, { 'aria-hidden': 'true' }));
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
      } catch (err) { say(memMsg, t(failed('setting', err).key)); }
      sw.disabled = false; sw.focus();
    });
    const swLine = h('div', 'set__line');
    swLine.append(sw, swWord);
    memRow.body.append(swLine, swName, memNote, memMsg);

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

  // forget me (FLOW-020, FRAME-030 / 037): asks once, in place; 不了 has focus; Esc is 不了 (drawer keydown). The block is
  // replaced in place by the result: success = the line alone, failure = the line and 删掉 again (everything is still there).
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
  async function doForget(yes, no) {
    yes.disabled = true; if (no) no.disabled = true;
    try {
      const r = await client.forget();
      profile = { ...profile, about: '', aboutEmpty: true, kept: false, memoryOn: r?.memoryOn ?? memoryOn() };
      asking = false;
      onForgotten?.(); // the chat on screen goes too
      renderAbout(panels.about); // 关于你 now reads empty; the new forget block is replaced by the result
      forgetHost.removeAttribute('role'); forgetHost.removeAttribute('aria-labelledby');
      const words = t(memoryOn() ? 'forgotten' : 'forgottenOff');
      forgetHost.replaceChildren(h('p', 'forget__result', words, { 'data-testid': 'forget-result' })); // announced by the drawer's own live region
      closeBtn.focus();
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = words; }, 50); // written after the result is drawn, so it is spoken
    } catch (err) {
      renderForget(failed('forget', err).key); // the line replaces the question, 删掉 stays for another try
    }
  }
  function renderForget(failKey = null) {
    forgetHost.replaceChildren();
    if (asking) {
      const q = h('p', 'forget__ask', t(failKey ?? 'forgetAsk'), { id: 'forget-q' });
      if (failKey) q.setAttribute('role', 'alert');
      const yes = button('btn btn--danger', t('forgetYes'), 'forget-yes');
      const no = failKey ? null : button('btn', t('forgetNo'), 'forget-no');
      forgetHost.setAttribute('role', 'group');
      forgetHost.setAttribute('aria-labelledby', 'forget-q');
      const row = h('div', 'forget__actions');
      if (no) row.append(no);
      row.append(yes);
      forgetHost.append(q, row);
      no?.addEventListener('click', cancelAsk);
      yes.addEventListener('click', () => doForget(yes, no));
      (no ?? yes).focus();
      return;
    }
    forgetHost.removeAttribute('role');
    forgetHost.removeAttribute('aria-labelledby');
    const b = button('btn', t('forget'), 'forget');
    b.addEventListener('click', () => { asking = true; renderForget(); });
    forgetHost.append(b, h('p', 'set__note', t('forgetNote')));
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
