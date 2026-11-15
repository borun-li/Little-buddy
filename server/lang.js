// Reply language from the line alone (03 DES-009). The UI language never reaches the backend.
export function languageOf(text) {
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const words = (text.match(/[A-Za-z]+/g) || []).length;
  if (han > 0 && han >= words) return 'zh';
  if (words > 0) return 'en';
  return 'zh';
}
