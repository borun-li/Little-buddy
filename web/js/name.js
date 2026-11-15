// Q-023 / DES-027: the companion's name. cleanName is the same rule as server/name.js (DES-021);
// FX-012 is the shared check. createRename swaps the caption's name button for a field in place.
import { copy, getName } from './copy.js';

export const NAME_KEY = 'companion.name';
export const MAX_NAME = 12; // code points
const DEFAULT_NAMES = ['小伙伴', 'little buddy']; // compared with toLowerCase()
const ALLOWED = /[\p{L}\p{N} \-'·]/u;
const SPACE = /\s/u;

// null = the default name (stored as no key). Any string is cleaned, never refused.
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  let kept = '';
  for (const c of raw.normalize('NFC')) {
    if (ALLOWED.test(c)) kept += c;
    else if (SPACE.test(c)) kept += ' ';
  }
  const name = [...kept.replace(/ {2,}/g, ' ').trim()].slice(0, MAX_NAME).join('').trim();
  if (name === '' || DEFAULT_NAMES.includes(name.toLowerCase())) return null;
  return name;
}

// Storage may be missing or refuse (private mode): the name then lasts for this page only.
export function loadName(storage) {
  try { return cleanName(storage?.getItem(NAME_KEY)); } catch { return null; }
}
export function saveName(storage, name) {
  try {
    if (name === null) storage?.removeItem(NAME_KEY);
    else storage?.setItem(NAME_KEY, name);
  } catch { /* kept in memory only */ }
}

// While typing, disallowed characters drop and the length is capped; spaces are left for the final clean.
export function typingFilter(raw) {
  let kept = '';
  for (const c of raw.normalize('NFC')) if (ALLOWED.test(c)) kept += c;
  return [...kept].slice(0, MAX_NAME).join('');
}

// Field box = text + 8 px padding and 2 px border each side + 4 px for the caret; never below 2 ch worth.
export function fieldWidthPx(textW) { return Math.ceil(textW) + 16 + 4 + 4; }

// Rendered width of `text` in el's font and letter spacing, or null when there is no layout to ask.
function textWidth(el, text) {
  try {
    if (typeof document === 'undefined' || !el.isConnected) return null;
    const cs = getComputedStyle(el);
    const m = document.createElement('span');
    m.textContent = text || ' ';
    m.style.cssText = `position:absolute;visibility:hidden;white-space:pre;left:0;top:0;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    document.body.append(m);
    const w = m.getBoundingClientRect().width;
    m.remove();
    return w > 0 ? Math.max(w, 16) : null;
  } catch { return null; }
}

// row: the caption row; button: the name button inside it. onSave(cleaned | null) is called when a
// rename is confirmed (Enter or click away). Esc keeps the old name. Names are shown by textContent only.
export function createRename({ row, button, onSave }) {
  const note = document.createElement('p');
  note.className = 'caption__note';
  note.id = 'name-note';
  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'name-field';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('aria-describedby', note.id);
  let editing = false;

  function labels() {
    field.setAttribute('aria-label', copy.nameLabel);
    note.textContent = copy.nameNote;
  }
  // FND-011: width from the rendered text (Chinese glyphs are ~2 ch wide), in the field's own font; the CSS
  // max-width: 100% caps it to the row. Falls back to the character count where there is no layout.
  function size() {
    const w = textWidth(field, field.value || '');
    if (w === null) { field.style.width = `${Math.max(2, [...field.value].length + 1)}ch`; return; }
    field.style.width = `${fieldWidthPx(w)}px`;
  }

  function open() {
    if (editing) return;
    editing = true;
    labels();
    field.value = getName();
    button.replaceWith(field); // in the page first, so the text can be measured in the field's own font
    size();
    row.append(note);
    field.focus();
    field.select();
  }
  function close(restoreFocus) {
    if (!editing) return;
    editing = false;
    field.replaceWith(button);
    note.remove();
    if (restoreFocus) button.focus();
  }
  function confirm(restoreFocus) {
    if (!editing) return;
    const cleaned = cleanName(field.value);
    close(restoreFocus);
    onSave(cleaned);
  }

  button.addEventListener('click', open);
  field.addEventListener('input', (e) => {
    if (e.isComposing) return; // IME: filter once the composition ends
    const f = typingFilter(field.value);
    if (f !== field.value) field.value = f;
    size();
  });
  field.addEventListener('compositionend', () => { field.value = typingFilter(field.value); size(); });
  field.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirm(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
  });
  field.addEventListener('blur', () => confirm(false));

  return { get editing() { return editing; }, refresh() { if (editing) labels(); } };
}
