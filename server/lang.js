// Reply language from the line alone (03 DES-009). The UI language never reaches the backend.
export function hanCount(text) {
  return (text.match(/\p{Script=Han}/gu) || []).length;
}

// Prompt cost of a text, ≈ 4 × tokens: Han counts 2.5, everything else 1 (03 DES-007; shared by windowOf and the notes budget, DES-031).
export const weight = (text) => text.length + 1.5 * hanCount(text);

// zhWords = ceil(han / 2) (a Chinese word averages about two characters); a tie goes to zh.
export function languageOf(text) {
  const han = hanCount(text);
  const words = (text.match(/[A-Za-z]+/g) || []).length;
  if (han > 0 && Math.ceil(han / 2) >= words) return 'zh';
  if (words > 0) return 'en';
  return 'zh';
}
