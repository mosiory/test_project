/** ابزار جست‌وجوی کلیدواژه‌ای (چند کلمه‌ای) با نرمال‌سازی حروف فارسی */
export function normalizeFa(value: string): string {
  return value
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .toLowerCase();
}

/** همهٔ کلمات جست‌وجو باید در یکی از مقادیر موجود باشند */
export function matchesKeywords(
  values: Array<string | number | null | undefined>,
  query: string
): boolean {
  const tokens = normalizeFa(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeFa(
    values
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => String(v))
      .join(' ')
  );
  return tokens.every((token) => haystack.includes(token));
}

/** فیلترکردن لیست بر اساس چند فیلد و جست‌وجوی کلیدواژه‌ای */
export function filterByKeywords<T>(
  items: T[],
  query: string,
  selector: (item: T) => Array<string | number | null | undefined>
): T[] {
  if (!query.trim()) return items;
  return items.filter((item) => matchesKeywords(selector(item), query));
}
