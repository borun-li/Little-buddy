// Help-line region (R0): which crisis numbers to give. Decided on this Mac only, never from the network:
// the macOS region setting first, then the time zone. The reply language never decides it (a user in China
// chatting in English still gets 12356 / 110 / 120; one in the US chatting in Chinese still gets 988 / 911).
import { execFileSync } from 'node:child_process';

// Regions with their own help lines; any other region gets the international lines (null).
export const REGIONS = ['CN', 'US'];
// R1 profile choices (03 DES-037): 'other' = REQ-048 未知, the international lines; null in profile.json = never chosen.
export const PROFILE_REGIONS = [...REGIONS, 'other'];

// The help-line region of a turn: the profile's CN/US wins, 'other' gives the international lines (null), never chosen -> the system region.
export function helpRegion(chosen, system) {
  return REGIONS.includes(chosen) ? chosen : chosen === 'other' ? null : system;
}

const CN_ZONES = new Set(['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Kashgar', 'PRC']);
const US_ZONES = new Set(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla', 'America/Yakutat', 'America/Nome', 'America/Adak',
  'America/Boise', 'America/Detroit', 'America/Menominee', 'Pacific/Honolulu',
  'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific', 'US/Arizona', 'US/Alaska', 'US/Hawaii', 'US/Michigan']);
const US_ZONE_PREFIXES = ['America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/'];

// macOS AppleLocale: "en_US", "zh-Hans_CN", "en_CN", or with a region override "en_US@rg=cnzzzz" (the override wins).
function localeRegion(locale) {
  const s = String(locale ?? '');
  const rg = /@(?:.*;)?rg=([a-z]{2})/i.exec(s);
  if (rg) return rg[1].toUpperCase();
  const m = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?![A-Za-z])/.exec(s);
  return m ? m[1].toUpperCase() : null;
}

function zoneRegion(timeZone) {
  const z = String(timeZone ?? '');
  if (CN_ZONES.has(z)) return 'CN';
  if (US_ZONES.has(z) || US_ZONE_PREFIXES.some((p) => z.startsWith(p))) return 'US';
  return null;
}

// A region stated in the locale wins, even one with no list of its own (en_GB -> null, the international lines).
// The time zone is used only when the locale states no region.
export function regionOf({ locale, timeZone } = {}) {
  const stated = localeRegion(locale);
  if (stated) return REGIONS.includes(stated) ? stated : null;
  return zoneRegion(timeZone);
}

// COMPANION_REGION overrides detection: CN, US, or OTHER (the international lines). Anything else is a startup error.
export function systemRegion(env = process.env) {
  const forced = env.COMPANION_REGION;
  if (forced !== undefined && forced !== '') {
    const r = forced.trim().toUpperCase();
    if (REGIONS.includes(r)) return r;
    if (r === 'OTHER') return null;
    throw new Error(`COMPANION_REGION must be one of ${REGIONS.join(', ')}, OTHER, got "${forced}"`);
  }
  let locale = '';
  try {
    locale = execFileSync('defaults', ['read', '-g', 'AppleLocale'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // not macOS, or the key is unset: fall back to the time zone
  }
  return regionOf({ locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
