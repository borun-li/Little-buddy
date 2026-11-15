// The companion's name as Bonsai sees it (03 DES-021). Same rule as the page (DES-027); FX-012 is the shared check.
export const DEFAULT_NAMES = ['小伙伴', 'little buddy']; // compared with toLowerCase()

const MAX_CODE_POINTS = 12;
const ALLOWED = /[\p{L}\p{N} \-'·]/u;
const SPACE = /\s/u;

// null = the default name. Any string length is cleaned, never refused (REQ-031).
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  let kept = '';
  for (const c of raw.normalize('NFC')) {
    if (ALLOWED.test(c)) kept += c;
    else if (SPACE.test(c)) kept += ' ';
  }
  const name = [...kept.replace(/ {2,}/g, ' ').trim()].slice(0, MAX_CODE_POINTS).join('').trim();
  if (name === '' || DEFAULT_NAMES.includes(name.toLowerCase())) return null;
  return name;
}
