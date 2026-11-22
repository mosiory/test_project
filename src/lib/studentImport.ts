import {
  DEGREE_LEVELS,
  MAX_SEMESTER,
  MIN_SEMESTER,
  getCurrentShamsiYear,
  toEnglishDigits,
  toPersianDigits,
  type AttendanceType,
  type DegreeLevel,
  type EntryTerm,
  type StudentInput,
} from '../shared/dormRules';

/**
 * نام‌های پذیرفته‌شده برای سرصفحه‌های فایل ایمپورت دانشجو.
 * فایل‌های واقعی خوابگاه‌ها معمولاً عنوان‌هایی مثل «شماره تماس دانشجو» یا
 * «شماره تماس ولی» دارند؛ این فهرست هر دو قالب رایج را پوشش می‌دهد.
 */
export const STUDENT_IMPORT_FIELD_ALIASES = {
  firstName: ['نام', 'اسم', 'نام دانشجو'],
  lastName: ['نام خانوادگی', 'فامیل', 'نام خانوادگي'],
  studentNumber: ['شماره دانشجویی', 'شماره دانشجو', 'شماره دانشجوئی', 'کد دانشجویی'],
  nationalCode: ['کد ملی', 'کدملی', 'شماره ملی', 'کد ملی دانشجو'],
  city: ['شهر', 'شهرستان', 'محل سکونت'],
  entryTerm: ['ورودی', 'سال ورودی', 'ترم ورودی'],
  semester: ['ترم', 'نیمسال', 'نیم سال', 'ترم تحصیلی'],
  degree: ['مقطع', 'مقطع تحصیلی'],
  major: ['رشته', 'رشته تحصیلی'],
  attendanceType: ['روزانه/شبانه', 'نوع تحصیل', 'نوع دوره', 'روزانه یا شبانه', 'وضعیت تحصیل'],
  mobile: [
    'شماره همراه',
    'شماره موبایل',
    'موبایل',
    'تلفن همراه',
    'شماره تماس دانشجو',
    'شماره تلفن دانشجو',
    'تلفن دانشجو',
    'شماره تماس',
  ],
  guardianPhone: [
    'شماره ولی',
    'شماره والد',
    'شماره سرپرست',
    'شماره تماس ولی',
    'شماره تماس والد',
    'شماره تماس سرپرست',
    'شماره تلفن ولی',
    'تلفن ولی',
    'تلفن سرپرست',
  ],
  roomNumber: ['شماره اتاق', 'شماره اطاق', 'اتاق', 'شماره اتاق دانشجو'],
} as const;

/** فهرست یکتای همهٔ سرصفحه‌های شناخته‌شده (برای تشخیص ردیف سرصفحه در فایل) */
export const STUDENT_IMPORT_HEADER_ALIASES: string[] = Array.from(
  new Set(Object.values(STUDENT_IMPORT_FIELD_ALIASES).flat())
);

/** یکسان‌سازی سرصفحه: حذف فاصله‌های اضافی، تبدیل ی/ک عربی و نویسه‌های کنترلی */
export function normalizeImportHeader(header: string): string {
  return String(header ?? '')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, ' ')
    .replace(/[()[\]{}«»"'`:؛;,،.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** خواندن مقدار یک فیلد از ردیف اکسل با پذیرش چند نام مختلف برای سرصفحه */
export function readImportField(row: Record<string, string>, aliases: readonly string[]): string {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeImportHeader(key), String(value ?? '').trim());
  }
  for (const alias of aliases) {
    const value = normalized.get(normalizeImportHeader(alias));
    if (value) return value;
  }
  return '';
}

/** نرمال‌سازی شماره تلفن: حذف جداکننده‌ها، تبدیل ۹۸+ و شماره‌های بدون صفر ابتدایی */
export function normalizeImportPhone(raw: string): string {
  let digits = toEnglishDigits(String(raw ?? '')).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  return digits;
}

/** تبدیل مقدار ستون «ورودی» به قالب استاندارد سال-نیم‌سال (مثل 405-مهر) */
export function normalizeImportEntryTerm(raw: string, today = new Date()): EntryTerm | null {
  const value = toEnglishDigits(String(raw ?? ''))
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;
  const month = value.match(/مهر|بهمن/)?.[0];
  if (!month) return null;
  const yearMatch = value.match(/\d{2,4}/);
  let year = yearMatch ? Number(yearMatch[0]) : getCurrentShamsiYear(today);
  if (yearMatch && year < 100) year += 1400;
  const code = year % 1000;
  if (!Number.isFinite(code) || code < 100) return null;
  return `${String(code).padStart(3, '0')}-${month}` as EntryTerm;
}

/** تبدیل مقطع تحصیلی با پذیرش مقادیر رایج فایل‌های اکسل */
export function normalizeImportDegree(raw: string): DegreeLevel | null {
  const value = normalizeImportHeader(raw);
  if (!value) return null;
  if (DEGREE_LEVELS.includes(value as DegreeLevel)) return value as DegreeLevel;
  if (value.includes('ارشد') || value.includes('دکتر')) return null;
  if (value.includes('کاردانی')) return 'کاردانی';
  if (value.includes('کارشناسی')) return 'کارشناسی';
  return null;
}

/** تبدیل نوع تحصیل با پذیرش مقادیر رایج فایل‌های اکسل */
export function normalizeImportAttendance(raw: string): AttendanceType | null {
  const value = normalizeImportHeader(raw);
  if (!value) return null;
  if (value.includes('شبانه')) return 'شبانه';
  if (value.includes('روزانه')) return 'روزانه';
  return null;
}

/** نرمال‌سازی شماره اتاق برای تطبیق با اتاق‌های سامانه (۱ = ۰۱ و «اتاق ۱») */
export function normalizeImportRoomNumber(raw: string): string {
  const value = toEnglishDigits(String(raw ?? ''))
    .replace(/\s+/g, '')
    .replace(/^(?:اتاق|اطاق|room)/i, '')
    .trim();
  if (!value) return '';
  return value.replace(/^0+(?=\d)/, '');
}

/** یک ردیف آماده برای ایمپورت */
export interface StudentImportRow {
  /** شمارهٔ ردیف در فایل اکسل (۱-مبنا، برای پیام خطا) */
  rowNumber: number;
  /** شماره اتاق نوشته‌شده در فایل؛ در صورت نبود مقدار، رشتهٔ خالی */
  roomNumber: string;
  payload: StudentInput;
}

export interface StudentImportMapping {
  rows: StudentImportRow[];
  rowErrors: string[];
}

/** یک ردیف دادهٔ خوانده‌شده از فایل اکسل همراه با شمارهٔ ردیف واقعی */
export interface StudentImportSourceRow {
  /** شمارهٔ ردیف در فایل اکسل (۱-مبنا)؛ در صورت نبود، شمارهٔ ترتیبی استفاده می‌شود */
  rowNumber?: number;
  values: Record<string, string>;
}

/**
 * تبدیل ردیف‌های خام اکسل به ورودی ثبت دانشجو + اعتبارسنجی سمت کاربر.
 * فیلدهای اختیاری نامعتبر (مقطع، ورودی، ترم و…) نادیده گرفته می‌شوند تا
 * یک مقدار نادرست باعث رد شدن کل دانشجو نشود.
 */
export function mapStudentImportRows(
  rows: readonly StudentImportSourceRow[],
  options: { firstDataRowNumber?: number } = {}
): StudentImportMapping {
  const firstRow = options.firstDataRowNumber ?? 2;
  const mapped: StudentImportRow[] = [];
  const rowErrors: string[] = [];

  rows.forEach((source, index) => {
    const row = source.values;
    const rowNumber = source.rowNumber ?? firstRow + index;
    const rowLabel = toPersianDigits(rowNumber);
    const firstName = readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.firstName);
    const lastName = readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.lastName);
    const studentNumber = toEnglishDigits(
      readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.studentNumber)
    ).replace(/[\s-]/g, '');
    const mobile = normalizeImportPhone(readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.mobile));
    const nationalCode = toEnglishDigits(
      readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.nationalCode)
    ).replace(/[\s-]/g, '');
    const guardianPhone = normalizeImportPhone(
      readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.guardianPhone)
    );
    const semesterRaw = toEnglishDigits(
      readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.semester)
    ).trim();
    const semesterNumber = semesterRaw === '' ? null : Number(semesterRaw);
    const semester =
      semesterNumber !== null &&
      Number.isInteger(semesterNumber) &&
      semesterNumber >= MIN_SEMESTER &&
      semesterNumber <= MAX_SEMESTER
        ? semesterNumber
        : null;

    if (!firstName || !lastName || !studentNumber || !mobile) {
      rowErrors.push(
        `ردیف ${rowLabel}: ستون‌های «نام»، «نام خانوادگی»، «شماره دانشجویی» و «شماره همراه» (یا «شماره تماس دانشجو») الزامی هستند.`
      );
      return;
    }
    if (!/^\d{5,20}$/.test(studentNumber)) {
      rowErrors.push(
        `ردیف ${rowLabel}: شماره دانشجویی باید عددی و بین ۵ تا ۲۰ رقم باشد (مقدار فعلی: «${studentNumber}»).`
      );
      return;
    }
    if (!/^09\d{9}$/.test(mobile)) {
      rowErrors.push(
        `ردیف ${rowLabel}: شماره همراه «${mobile}» معتبر نیست؛ باید ۱۱ رقم و با ۰۹ شروع شود.`
      );
      return;
    }

    mapped.push({
      rowNumber,
      roomNumber: normalizeImportRoomNumber(
        readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.roomNumber)
      ),
      payload: {
        firstName,
        lastName,
        studentNumber,
        nationalCode: /^\d{10}$/.test(nationalCode) ? nationalCode : '',
        city: readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.city),
        entryTerm: normalizeImportEntryTerm(
          readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.entryTerm)
        ),
        semester,
        degree: normalizeImportDegree(readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.degree)),
        major: readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.major),
        attendanceType: normalizeImportAttendance(
          readImportField(row, STUDENT_IMPORT_FIELD_ALIASES.attendanceType)
        ),
        mobile,
        guardianPhone: /^0\d{10}$/.test(guardianPhone) ? guardianPhone : '',
        photoUrl: '',
      },
    });
  });

  return { rows: mapped, rowErrors };
}
