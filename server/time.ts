/**
 * تبدیل بازهٔ تاریخ محلی (YYYY-MM-DD) به بازهٔ UTC قابل مقایسه با
 * ستون‌های `datetime('now')` در SQLite.
 * پیش‌فرض تهران UTC+03:30 است و با APP_TZ_OFFSET_MINUTES قابل تغییر است.
 */
export function localDayBoundsUtc(
  fromDate: string | undefined,
  toDate: string | undefined,
  offsetMinutes: number
): { fromUtc?: string; toUtcExclusive?: string } {
  const offsetMs = offsetMinutes * 60 * 1000;
  const toUtcString = (ms: number) =>
    new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  const result: { fromUtc?: string; toUtcExclusive?: string } = {};
  if (fromDate) {
    const start = Date.parse(`${fromDate}T00:00:00Z`);
    if (!Number.isNaN(start)) result.fromUtc = toUtcString(start - offsetMs);
  }
  if (toDate) {
    const endLocalMidnight = Date.parse(`${toDate}T00:00:00Z`) + 24 * 60 * 60 * 1000;
    if (!Number.isNaN(endLocalMidnight)) {
      result.toUtcExclusive = toUtcString(endLocalMidnight - offsetMs);
    }
  }
  return result;
}
