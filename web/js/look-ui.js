// R2 (docs/frontend/r2-personalise/01-ux.md PAGE-004, Increment 1; 02-ui.md CMP-024..029): the body of the third drawer tab 形象和声音.
// Order top to bottom: 角色 (three discs) · 穿搭 (4 slots, 不穿 + 3 tiles) · 声音 (9 rows, 试听) · 成长 (plant, line, day segments,
// 再聊 N 天长大). Data comes only through the injected client (look-client.js); every word is lt() from look-copy.js;
// all text goes in with textContent. Each group is native radios in a fieldset: Tab enters at the selected one, arrows move and
// select (01-ux.md §2). Art: look-art.js (discs, tiles, plant icon), all from the inlined templates and look-art-data.js.
import { lt, voiceName } from './look-copy.js';
import { SLOTS, CHARACTERS, ITEMS, VOICES } from './look-client.js';
import { CHARACTER_IDS, discArt, tileSvg, plantIcon } from './look-art.js';
import { setSpark, bandOf } from './stage-up.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const UP_FILL_MS = 400; const UP_HOLD_MS = 1000; // CMP-028 stage-up: bar fills 400 ms, holds 1 s, then refills from empty (300 ms, CSS)

function h(tag, cls, text, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
const icon = (id, cls) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${cls ?? ''}`.trim()); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
};

export function createLookUi({ client, onLook, onVoice, createPreview }) {
  let playing = null; // { id, ctrl, btn, reset } while a sample plays
  let pv = null;      // the phone preview (Q-064)
  let status = null;  // Q-062: the 成长 block's polite status (the page is inert while the drawer is open)
  let upTimer = null; // Q-062: the 成长 stage-up sequence
  let paintGrowth = null; // Q-074: repaints the 成长 block on screen (null until the tab is drawn)

  function stop() {
    if (pv) { pv.destroy(); pv = null; }
    clearTimeout(upTimer); upTimer = null;
    if (!playing) return;
    const p = playing; playing = null;
    p.ctrl.abort();
    p.reset();
  }

  // One single-choice group (native radios). onPick(value) saves; a rejection puts the old option back and says lookSaveFailed
  // under the group. build(o, input, row) returns the label's visible children and may add siblings to the row.
  function group({ name, legend, note, options, current, onPick, testid, cls, build }) {
    const set = h('fieldset', `look__group ${cls ?? ''}`.trim(), null, { role: 'radiogroup', 'data-testid': testid });
    if (legend) set.append(h('legend', 'look__legend', legend));
    const msg = h('p', 'field-msg', '', { role: 'status', 'data-testid': `${testid}-msg` });
    const rowsEl = h('div', 'look__rows');
    let shown = current;
    for (const o of options) {
      const row = h('div', 'look__row');
      const label = h('label', 'look__opt');
      const input = h('input', 'look__radio', null, { type: 'radio', name, value: String(o.value), 'data-testid': `${testid}-${o.value}` });
      input.checked = String(o.value) === String(current);
      input.addEventListener('change', async () => {
        if (!input.checked) return;
        msg.textContent = '';
        const prev = shown;
        try { await onPick(o.value); shown = o.value; } catch {
          const back = set.querySelector(`input[value="${CSS.escape(String(prev))}"]`);
          if (back) back.checked = true;
          msg.textContent = lt('lookSaveFailed');
        }
      });
      label.append(input, ...build(o, input, row));
      row.prepend(label);
      rowsEl.append(row);
    }
    set.append(rowsEl, msg);
    return { set, msg };
  }

  async function render(panel) {
    stop();
    const [look, voice, growth] = await Promise.all([client.getLook(), client.getVoice(), client.getGrowth()]);
    panel.replaceChildren();
    const save = async (patch) => { const next = await client.setLook(patch); onLook?.(next); };

    // Phone: a 358 x 150 preview heads the sheet and stays while the body scrolls (CSS hides it at 960+).
    if (createPreview) {
      const box = h('div', 'look__preview-box');
      panel.append(box);
      pv = createPreview(box);
    }

    // 角色: three discs, the character's neutral art at stage 3 (the file, glow included)
    const ch = group({
      name: 'look-character', legend: lt('character'), testid: 'look-character', current: look.character, cls: 'look__chars',
      options: CHARACTERS.map((n) => ({ value: n, label: lt('characterName')[n - 1], id: CHARACTER_IDS[n - 1] })),
      onPick: (v) => save({ character: Number(v) }),
      build(o) {
        const disc = h('span', 'disc');
        disc.append(discArt(o.id));
        const nm = h('span', 'disc__name');
        nm.append(h('span', null, o.label), icon('i-check', 'disc__check'));
        return [disc, nm];
      },
    });
    panel.append(ch.set);

    // 穿搭: one radio group per slot, 不穿 first, tiles with the item on a mannequin
    const outfit = h('section', 'look__section look__outfit', null, { 'aria-labelledby': 'look-outfit-h' });
    const head = h('div', 'look__head');
    head.append(h('h3', 'look__h', lt('outfit'), { id: 'look-outfit-h' }), h('span', 'look__note', lt('outfitNote')));
    outfit.append(head);
    for (const slot of SLOTS) {
      const word = lt('slot')[slot];
      const names = lt('itemName')[slot];
      const g = group({
        name: `look-${slot}`, legend: word, testid: `look-${slot}`, current: look.outfit[slot], cls: 'look__slot',
        options: [{ value: 'none', label: lt('outfitNone') }, ...ITEMS.map((n) => ({ value: n, label: names[n - 1] }))],
        onPick: (v) => save({ outfit: { [slot]: v === 'none' ? 'none' : Number(v) } }),
        build(o) {
          const box = h('span', 'tile');
          if (o.value === 'none') box.append(icon('i-ban', 'tile__none')); else box.append(tileSvg(slot, o.value));
          box.append(icon('i-check', 'tile__check'));
          return [box, h('span', 'tile__name', o.label)];
        },
      });
      outfit.append(g.set);
    }
    panel.append(outfit);

    // 声音: choosing does not play it; 试听 is separate and plays that voice's own sample in the interface language
    const vo = h('section', 'look__section look__voices', null, { 'aria-labelledby': 'look-voice-h' });
    const vhead = h('div', 'look__head');
    vhead.append(h('h3', 'look__h', lt('voiceGroup'), { id: 'look-voice-h' }), h('span', 'look__note', lt('voiceNote')));
    vo.append(vhead);
    vo.append(group({
      name: 'voice', legend: null, testid: 'voice', current: voice, cls: 'look__voicelist',
      options: VOICES.map((id) => ({ value: id, label: voiceName(id), desc: lt('voice')[id] + (id === 'serena' ? lt('voiceDefault') : '') })),
      onPick: async (v) => { await client.setVoice(v); onVoice?.(v); },
      build(o, input, row) {
        const text = h('span', 'voice__text');
        const nm = h('span', 'look__name', o.label);
        const desc = h('span', 'look__desc', o.desc);
        text.append(nm, desc);
        const btn = h('button', 'btn look__preview', lt('preview'), { type: 'button', 'aria-pressed': 'false', 'aria-label': `${lt('preview')} ${o.label}`, 'data-testid': `preview-${o.value}` });
        const reset = () => { btn.textContent = lt('preview'); btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('btn--soft'); };
        btn.addEventListener('click', async () => {
          if (btn.getAttribute('aria-disabled') === 'true') return;
          const was = playing?.id === o.value;
          stop();
          if (was) return;
          const ctrl = new AbortController();
          playing = { id: o.value, ctrl, btn, reset };
          btn.textContent = lt('previewStop'); btn.setAttribute('aria-pressed', 'true'); btn.classList.add('btn--soft');
          try { await client.preview(o.value, { text: lt('previewLine'), lang: document.documentElement.lang, signal: ctrl.signal }); } catch (err) {
            if (err?.name !== 'AbortError') { // missing: the sample line replaces the description, 试听 greys out
              desc.textContent = lt('previewMissing'); desc.classList.add('is-missing');
              btn.setAttribute('aria-disabled', 'true'); btn.classList.add('is-missing');
            }
          }
          if (playing?.ctrl === ctrl) { playing = null; reset(); }
        });
        row.append(btn);
        return [text];
      },
    }).set);
    panel.append(vo);

    panel.append(growthBlock(growth));
  }

  function growthBlock(first) {
    const sec = h('section', 'look__section look__growth', null, { 'aria-labelledby': 'look-growth-h' });
    const head = h('div', 'look__head');
    head.append(h('h3', 'look__h', lt('growthGroup'), { id: 'look-growth-h' }), h('span', 'look__note', lt('growthNote')));
    sec.append(head);
    const top = h('div', 'growth__top');
    const line = h('p', 'growth__line', '', { 'data-testid': 'growth-line' });
    const bar = h('div', 'growth__bar', null, { role: 'progressbar', 'aria-label': lt('barName'), 'aria-valuemin': '0', 'data-testid': 'growth-bar' });
    const next = h('p', 'growth__next', '', { 'data-testid': 'growth-next' });
    // CMP-033 spark (DFB-005): 24 px box at the end of the stage line; band from the same days; still at rest, decorative
    const spark = h('span', 'growth__spark', null, { 'aria-hidden': 'true', 'data-testid': 'growth-spark' });
    status = h('span', 'sr-only', '', { role: 'status', 'aria-live': 'polite', 'data-testid': 'growth-said' });
    let plant = null;
    let painted = null;
    // A rise in stage (FLOW-027 step 3): the line reads growth.up, this stage's bar fills (400 ms), holds 1 s, then the new
    // stage's bar refills from empty; the spark steps up with the fill. Reduced motion: the bar and spark jump, the words stay.
    // Q-074: only a reply carrying growth.up rises (rise); any other new value (a quiet crisis turn, forget me) is just drawn.
    function paint(g, { rise = false } = {}) {
      clearTimeout(upTimer); upTimer = null;
      const prev = painted; painted = g;
      const band = bandOf(g.days);
      const rose = rise && prev && g.stage > prev.stage;
      setSpark(spark, band, { grow: !!rose && band > Number(spark.dataset.band) && !reduceMotion() });
      if (rose) {
        line.textContent = lt('up');
        if (!reduceMotion()) {
          bar.classList.add('is-filling');
          bar.querySelectorAll('.growth__seg').forEach((seg) => seg.classList.add('is-on'));
          upTimer = setTimeout(() => { bar.classList.remove('is-filling'); draw(g, { fromEmpty: true }); }, UP_FILL_MS + UP_HOLD_MS);
          return;
        }
        draw(g, {});
        upTimer = setTimeout(() => draw(g, {}), UP_FILL_MS + UP_HOLD_MS);
        line.textContent = lt('up');
        return;
      }
      draw(g, {});
    }
    function draw(g, { fromEmpty = false }) {
      upTimer = null;
      line.textContent = g.days === 0 ? lt('growthNone') : lt('growthDays')(lt('stage')[g.stage], g.days);
      const p = plantIcon(g.stage); plant?.replaceWith(p); if (!plant) top.prepend(p); plant = p;
      bar.setAttribute('aria-valuemax', String(g.span));
      bar.setAttribute('aria-valuenow', String(g.into));
      bar.setAttribute('aria-valuetext', g.left ? lt('next')(g.left) : line.textContent); // the line under the bar; stage 3 has none
      bar.classList.toggle('is-grown', g.stage === 3);
      // one segment per day of the stage (3, then 4); stage 3 is one filled bar; no number and no percent on the bar
      const segs = Array.from({ length: g.stage === 3 ? 1 : g.span }, (_, i) => h('i', `growth__seg${!fromEmpty && (g.stage === 3 || i < g.into) ? ' is-on' : ''}`));
      bar.replaceChildren(...segs);
      if (fromEmpty) { // refills from empty: the CSS transition (300 ms) runs once the empty bar has been drawn
        void bar.offsetWidth;
        segs.forEach((seg, i) => { if (g.stage === 3 || i < g.into) seg.classList.add('is-on'); });
      }
      next.textContent = g.left ? lt('next')(g.left) : '';
      next.hidden = !g.left;
    }
    top.append(line, spark);
    paint(first);
    paintGrowth = (g, opts) => { if (sec.isConnected) paint(g, opts); };
    sec.append(top, bar, next, status);
    return sec;
  }

  // Q-074: a reply's growth (or the re-read after forget me) lands in the 成长 block when the tab is on screen; rise = growth.up
  function showGrowth(g, { rise = false } = {}) { paintGrowth?.(g, { rise }); }

  // Q-062: growth.upSaid, once, when the stage rises while the drawer is open (app.js picks this or the companion's status)
  function say(text) {
    if (!status?.isConnected) return;
    status.textContent = '';
    setTimeout(() => { if (status) status.textContent = text; }, 50); // written after the line is drawn, so it is spoken
  }

  return { render, stop, say, showGrowth };
}
