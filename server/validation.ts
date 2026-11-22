import { ServiceError } from './errors';

type UnknownRecord = Record<string, unknown>;

/** بدنه درخواست باید یک شیء ساده باشد (نه آرایه/null). */
export function readBodyObject(body: unknown): UnknownRecord {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(400, 'قالب داده ارسالی معتبر نیست.');
  }
  return body as UnknownRecord;
}

export function readId(value: unknown, label = 'شناسه'): number {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(num) || num <= 0 || num > Number.MAX_SAFE_INTEGER) {
    throw new ServiceError(400, `${label} معتبر نیست.`);
  }
  return num;
}

/** پارامتر عددی اختیاری در Query؛ مقدار خالی یعنی «اعمال نشود». */
export function readOptionalInt(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) {
    throw new ServiceError(400, `${label} باید عدد صحیح نامنفی باشد.`);
  }
  return num;
}

export function readOptionalPositiveInt(value: unknown, label: string): number | undefined {
  const num = readOptionalInt(value, label);
  if (num !== undefined && num <= 0) {
    throw new ServiceError(400, `${label} باید عدد صحیح مثبت باشد.`);
  }
  return num;
}

export function readOptionalString(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ServiceError(400, `${label} باید متن باشد.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ServiceError(400, `${label} بیش از حد مجاز طولانی است.`);
  }
  return trimmed;
}

export function readRequiredString(value: unknown, label: string, maxLength: number): string {
  const text = readOptionalString(value, label, maxLength);
  if (text === undefined) throw new ServiceError(400, `${label} الزامی است.`);
  return text;
}

/** متن خام (بدون trim) برای رمز عبور؛ فاصله‌ها بخشی از رمز هستند. */
export function readOptionalRawString(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ServiceError(400, `${label} باید متن باشد.`);
  if (value.length > maxLength) throw new ServiceError(400, `${label} بیش از حد مجاز طولانی است.`);
  return value;
}

export function readRequiredRawString(value: unknown, label: string, maxLength: number): string {
  const text = readOptionalRawString(value, label, maxLength);
  if (text === undefined) throw new ServiceError(400, `${label} الزامی است.`);
  return text;
}

/**
 * بولی سخت‌گیرانه: فقط true/false، 0/1 و رشته‌های "true"/"false" پذیرفته می‌شوند.
 * رشته "false" دیگر به‌اشتباه true تفسیر نمی‌شود.
 */
export function readOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  throw new ServiceError(400, `${label} باید بولی (true/false) باشد.`);
}

export function readRequiredBoolean(value: unknown, label: string): boolean {
  const parsed = readOptionalBoolean(value, label);
  if (parsed === undefined) throw new ServiceError(400, `${label} الزامی است.`);
  return parsed;
}

/** تاریخ میلادی YYYY-MM-DD برای فیلترها. */
export function readOptionalIsoDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (raw === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ServiceError(400, `${label} باید در قالب YYYY-MM-DD باشد.`);
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new ServiceError(400, `${label} معتبر نیست.`);
  return raw;
}

export function readPageParams(query: { page?: unknown; pageSize?: unknown }): {
  page?: number;
  pageSize?: number;
} {
  const page = readOptionalPositiveInt(query.page, 'شماره صفحه');
  const pageSizeRaw = readOptionalPositiveInt(query.pageSize, 'تعداد در صفحه');
  if (pageSizeRaw !== undefined && pageSizeRaw > 200) {
    throw new ServiceError(400, 'تعداد در صفحه حداکثر ۲۰۰ است.');
  }
  if (page === undefined && pageSizeRaw === undefined) return {};
  return { page: page ?? 1, pageSize: pageSizeRaw ?? 50 };
}
