// R2 (docs/frontend/r2-personalise/01-ux.md PAGE-004, Increment 1): the body of the third drawer tab 形象和声音.
// Order top to bottom: 角色 · 穿搭 (4 slots) · 声音 (9 rows, 试听) · 成长 (stage line, bar, 再聊 N 天长大, demo days).
// Structure only, neutral styling (web/css/look.css); fe-ui draws it. Data comes only through the injected client
// (look-client.js); every word is lt() from look-copy.js; all text goes in with textContent.
// Each group is native radios in a fieldset: Tab enters at the selected one, arrows move and select (01-ux.md §2).
import { lt } from './look-copy.js';
import { SLOTS, CHARACTERS, ITEMS, VOICES, DEMO_MAX } from './look-client.js';

function h(tag, cls, text, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function createLookUi({ client, onLook, onGrowth, getName }) {
  let preview = null; // { id, ctrl, btn } while a sample plays

  function stop() {
    if (!preview) return;
    const p = preview; preview = null;
    p.ctrl.abort();
    p.btn.textContent = lt('preview');
    p.btn.setAttribute('aria-pressed', 'false');
  }

  // One single-choice group. onPick(value) saves; a rejection puts the old option back and says lookSaveFailed under the group.
  function group({ name, legend, options, current, onPick, testid, extra }) {
    const set = h('fieldset', 'look__group', null, { role: 'radiogroup', 'data-testid': testid });
    set.append(h('legend', 'look__legend', legend));
    const msg = h('p', 'field-msg', '', { role: 'alert', 'data-testid': `${testid}-msg` });
    let shown = current;
    for (const o of options) {
      const row = h('div', 'look__row');
      const label = h('label', 'look__opt');
      const input = h('input', null, null, { type: 'radio', name, value: String(o.value), 'data-testid': `${testid}-${o.value}` });
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
      label.append(input, h('span', 'look__name', o.label));
      if (o.desc) label.append(h('span', 'look__desc', o.desc));
      row.append(label);
      if (extra) row.append(...extra(o, row));
      set.append(row);
    }
    set.append(msg);
    return set;
  }

  async function render(panel) {
    stop();
    const [look, voice, growth] = await Promise.all([client.getLook(), client.getVoice(), client.getGrowth()]);
    panel.replaceChildren();
    const save = async (patch) => { const next = await client.setLook(patch); onLook?.(next); };

    // 角色
    panel.append(group({
      name: 'look-character', legend: lt('character'), testid: 'look-character', current: look.character,
      options: CHARACTERS.map((n) => ({ value: n, label: lt('characterItem')(n) })),
      onPick: (v) => save({ character: Number(v) }),
    }));

    // 穿搭: one radio group per slot, 不穿 first
    const outfit = h('section', 'look__section', null, { 'aria-labelledby': 'look-outfit-h' });
    outfit.append(h('h3', 'look__h', lt('outfit'), { id: 'look-outfit-h' }));
    for (const slot of SLOTS) {
      const word = lt('slot')[slot];
      outfit.append(group({
        name: `look-${slot}`, legend: word, testid: `look-${slot}`, current: look.outfit[slot],
        options: [{ value: 'none', label: lt('outfitNone') }, ...ITEMS.map((n) => ({ value: n, label: lt('itemName')(word, n) }))],
        onPick: (v) => save({ outfit: { [slot]: v === 'none' ? 'none' : Number(v) } }),
      }));
    }
    panel.append(outfit);

    // 声音: choosing does not play it; 试听 is separate
    panel.append(group({
      name: 'voice', legend: lt('voiceGroup'), testid: 'voice', current: voice,
      options: VOICES.map((id) => ({ value: id, label: id, desc: lt('voice')[id] })),
      onPick: (v) => client.setVoice(v),
      extra(o, row) {
        const btn = h('button', 'btn look__preview', lt('preview'), { type: 'button', 'aria-pressed': 'false', 'aria-label': `${lt('preview')} ${o.label}`, 'data-testid': `preview-${o.value}` });
        const miss = h('p', 'field-msg', '', { role: 'alert' });
        btn.addEventListener('click', async () => {
          const was = preview?.id === o.value;
          stop();
          miss.textContent = '';
          if (was) return;
          const ctrl = new AbortController();
          preview = { id: o.value, ctrl, btn };
          btn.textContent = lt('previewStop'); btn.setAttribute('aria-pressed', 'true');
          try { await client.preview(o.value, { text: lt('previewLine'), lang: document.documentElement.lang, signal: ctrl.signal }); } catch (err) {
            if (err?.name !== 'AbortError') miss.textContent = lt('previewMissing');
          }
          if (preview?.ctrl === ctrl) { preview = null; btn.textContent = lt('preview'); btn.setAttribute('aria-pressed', 'false'); }
        });
        return [btn, miss];
      },
    }));

    panel.append(growthBlock(growth));
  }

  function growthBlock(first) {
    const sec = h('section', 'look__section look__growth', null, { 'aria-labelledby': 'look-growth-h' });
    sec.append(h('h3', 'look__h', lt('growthGroup'), { id: 'look-growth-h' }));
    const line = h('p', 'growth__line', '', { 'data-testid': 'growth-line' });
    const bar = h('div', 'growth__bar', null, { role: 'progressbar', 'aria-label': lt('barName'), 'aria-valuemin': '0', 'data-testid': 'growth-bar' });
    const fill = h('i', 'growth__fill');
    bar.append(fill);
    const next = h('p', 'growth__next', '', { 'data-testid': 'growth-next' });
    function paint(g) {
      line.textContent = g.days === 0 ? lt('growthNone') : lt('growthDays')(lt('stage')[g.stage], g.days);
      bar.setAttribute('aria-valuemax', String(g.span));
      bar.setAttribute('aria-valuenow', String(g.into));
      bar.setAttribute('aria-valuetext', g.left ? lt('next')(g.left) : line.textContent); // the line under the bar; stage 3 has none
      fill.style.width = `${(g.into / g.span) * 100}%`; // no number and no percent on the bar
      next.textContent = g.left ? lt('next')(g.left) : '';
      next.hidden = !g.left;
    }
    paint(first);

    // demo field (REQ-064): dashed, 演示用; removed with C-015
    const demo = h('div', 'growth__demo');
    const id = 'demo-days';
    const input = h('input', 'input', null, { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', 'data-testid': 'demo-days' });
    input.value = String(first.days);
    const msg = h('p', 'field-msg', '', { role: 'alert', 'data-testid': 'demo-days-msg' });
    let shown = first.days;
    let busy = false;
    async function commit() {
      if (busy) return;
      const raw = input.value.trim();
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (n === shown && raw !== '') { input.value = String(shown); msg.textContent = ''; return; }
      if (!Number.isInteger(n) || n > DEMO_MAX) { msg.textContent = lt('demoDaysRange'); return; } // old value kept
      busy = true; msg.textContent = '';
      try { const g = await client.setDemoDays(n); shown = g.days; paint(g); onGrowth?.(g); } catch {
        input.value = String(shown); msg.textContent = lt('lookSaveFailed');
      }
      busy = false;
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); commit(); } });
    input.addEventListener('change', commit);
    input.addEventListener('blur', () => { if (msg.textContent) input.value = String(shown); else commit(); });
    demo.append(h('label', 'growth__demo-label', lt('demoDays'), { for: id }), input, msg);
    sec.append(line, bar, next, demo);
    return sec;
  }

  return { render, stop };
}
