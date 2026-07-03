export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .replace(/\u00c4\u2018/g, 'd')
    .replace(/\u00c4\u0090/g, 'D')
    .replace(/\u00c3\u201e\u00e2\u20ac\u02dc/g, 'd')
    .replace(/\u00c3\u201e\u00c2\u0090/g, 'D')
    .toLowerCase();
}
