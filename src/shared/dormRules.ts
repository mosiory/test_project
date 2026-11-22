export type UserRole = 'admin' | 'supervisor';

export type EntryTerm = string;
export type DegreeLevel = 'کاردانی' | 'کارشناسی';
export type StudentStatus =
  | 'ساکن'
  | 'انصراف از خوابگاه'
  | 'فارغ‌التحصیل'
  | 'اخراج‌شده'
  | 'انتقال‌یافته';

export type TransferStatus =
  | 'در انتظار تأیید'
  | 'تأییدشده'
  | 'ردشده'
  | 'لغوشده';

export const ENTRY_TERM_MONTHS = ['مهر', 'بهمن'] as const;
export const ENTRY_TERM_YEAR_SPAN = 4;

/** سال شمسی جاری را به‌صورت عددی برمی‌گرداند. */
export function getCurrentShamsiYear(date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
    }).formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    if (Number.isInteger(year) && year > 1300) return year;
  } catch {
    // در محیط‌هایی که تقویم فارسی پشتیبانی نمی‌شود از محاسبهٔ تقریبی استفاده می‌کنیم.
  }
  const gregorianYear = date.getFullYear();
  const gregorianMonth = date.getMonth() + 1;
  const gregorianDay = date.getDate();
  return gregorianYear - (gregorianMonth > 3 || (gregorianMonth === 3 && gregorianDay >= 21) ? 621 : 622);
}

/**
 * گزینه‌های ورودی را بر اساس سال شمسی می‌سازد؛
 * مثلاً 1405 → 405-مهر، 405-بهمن، 404-مهر … 402-بهمن.
 */
export function buildEntryTerms(
  baseYear: number,
  span = ENTRY_TERM_YEAR_SPAN
): EntryTerm[] {
  const safeBaseYear = Math.max(1300, Math.floor(baseYear));
  const safeSpan = Math.max(1, Math.floor(span));
  const terms: EntryTerm[] = [];
  for (let year = safeBaseYear; year > safeBaseYear - safeSpan; year -= 1) {
    const yearCode = String(year % 1000).padStart(3, '0');
    for (const month of ENTRY_TERM_MONTHS) {
      terms.push(`${yearCode}-${month}`);
    }
  }
  return terms;
}

/** گزینه‌های ورودی برای تاریخ مشخص (پیش‌فرض: امروز). */
export function getEntryTerms(
  date = new Date(),
  span = ENTRY_TERM_YEAR_SPAN
): EntryTerm[] {
  return buildEntryTerms(getCurrentShamsiYear(date), span);
}

/** لیست جاری برای فرم‌ها؛ با شروع سال جدید به‌صورت خودکار به‌روز می‌شود. */
export const ENTRY_TERMS: EntryTerm[] = getEntryTerms();

/** بخش مهر/بهمن را از یک ورودی (حتی مقدار قدیمی بدون سال) برمی‌گرداند. */
export function getEntryTermMonth(term: string | null | undefined): 'مهر' | 'بهمن' | null {
  const suffix = String(term ?? '').trim().split('-').pop()?.trim();
  return suffix === 'مهر' || suffix === 'بهمن' ? suffix : null;
}

function entryTermSortValue(term: string): number {
  const [yearCode, month] = term.split('-');
  const year = Number(yearCode);
  if (!Number.isFinite(year)) return -1;
  const monthWeight = month === 'مهر' ? 1 : month === 'بهمن' ? 0 : -1;
  return year * 10 + monthWeight;
}

/** مرتب‌سازی نزولی سال و سپس مهر قبل از بهمن. */
export function sortEntryTerms(terms: Iterable<string>): string[] {
  return Array.from(new Set(terms)).filter(Boolean).sort(
    (a, b) => entryTermSortValue(b) - entryTermSortValue(a)
  );
}
export const DEGREE_LEVELS: DegreeLevel[] = ['کاردانی', 'کارشناسی'];

/** نوع تحصیل دانشجو — اختیاری */
export const ATTENDANCE_TYPES = ['روزانه', 'شبانه'] as const;
export type AttendanceType = (typeof ATTENDANCE_TYPES)[number];

/** ترم‌های مجاز برای ثبت دانشجو */
export const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const MIN_SEMESTER = 1;
export const MAX_SEMESTER = 9;

/** رشته‌های تحصیلی دانشکده — منبع واحد برای همهٔ فرم‌های سامانه */
export const MAJOR_OPTIONS: string[] = [
  'الکتروتکنیک (برق)',
  'حسابداری',
  'ساخت و تولید',
  'مکانیک',
  'کامپیوتر',
  'باغبانی',
  'گیاه‌پزشکی',
  'ماشین‌های کشاورزی',
  'بهداشت یاری',
  'صنایع غذایی',
  'مهندسی علوم طیور و دام',
  'مکانیک ماشین‌آلات کشاورزی',
];
export const STUDENT_STATUSES: StudentStatus[] = [
  'ساکن',
  'انصراف از خوابگاه',
  'فارغ‌التحصیل',
  'اخراج‌شده',
  'انتقال‌یافته',
];
export const INACTIVE_STUDENT_STATUSES: StudentStatus[] = [
  'انصراف از خوابگاه',
  'فارغ‌التحصیل',
  'اخراج‌شده',
  'انتقال‌یافته',
];

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  dormId: number | null;
  dormName: string | null;
  dormSubtitle: string | null;
  /** تصویر پروفایل کاربر به‌صورت Data URL (اختیاری) */
  photoUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface Dormitory {
  id: number;
  code: string;
  name: string;
  subtitle: string;
  address: string;
  isActive: boolean;
  totalRooms: number;
  activeRooms: number;
  totalCapacity: number;
  occupiedCount: number;
  remainingCapacity: number;
  extraCapacity: number;
  extraOccupied: number;
  extraRemaining: number;
  extraOccupancyPercent: number;
  occupancyPercent: number;
  supervisorName?: string | null;
  supervisorUsername?: string | null;
}

export interface RoomMetrics {
  capacity: number;
  occupied: number;
  /** ساکنان دارای تخت (ظرفیت عادی) */
  baseOccupied: number;
  remaining: number;
  /** ظرفیت مازاد تعریف‌شده برای اتاق */
  extraCapacity: number;
  /** دانشجویان اسکان‌یافته در ظرفیت مازاد */
  extraOccupied: number;
  /** جای خالی ظرفیت مازاد */
  extraRemaining: number;
  occupancyPercent: number;
  extraOccupancyPercent: number;
  status: 'full' | 'available' | 'empty';
}

export interface RoomRecord extends RoomMetrics {
  id: number;
  dormId: number;
  dormName: string;
  roomNumber: string;
  floor: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentInput {
  firstName: string;
  lastName: string;
  studentNumber: string;
  /** کد ملی (اختیاری، در صورت ورود باید ۱۰ رقم باشد) */
  nationalCode: string;
  /** اختیاری */
  city: string;
  /** اختیاری */
  entryTerm: EntryTerm | null;
  /** اختیاری - عدد صحیح ۱ تا ۹ */
  semester: number | null;
  /** اختیاری */
  degree: DegreeLevel | null;
  /** اختیاری */
  major: string;
  /** روزانه/شبانه (اختیاری) */
  attendanceType: AttendanceType | null;
  mobile: string;
  /** شماره ولی دانشجو (اختیاری) */
  guardianPhone: string;
  /** تصویر دانشجو به‌صورت Data URL (اختیاری) */
  photoUrl: string;
}

export interface StudentRecord extends StudentInput {
  id: number;
  status: StudentStatus;
  /** آیا دانشجو در ظرفیت مازاد اتاق اسکان یافته است */
  isExtraCapacity: boolean;
  createdAt: string;
  updatedAt: string;
  currentDormId: number | null;
  currentDormName: string | null;
  currentDormSubtitle: string | null;
  currentRoomId: number | null;
  currentRoomNumber: string | null;
  residenceStartDate: string | null;
}

export interface ResidenceRecord {
  id: number;
  studentId: number;
  dormId: number;
  dormName: string;
  dormSubtitle: string;
  roomId: number;
  roomNumber: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  isExtraCapacity: boolean;
  exitReason: string | null;
  createdByName: string;
}

export interface MovementRecord {
  id: number;
  studentId: number;
  studentName: string;
  studentNumber: string;
  fromDormId: number | null;
  fromDormName: string | null;
  fromRoomId: number | null;
  fromRoomNumber: string | null;
  toDormId: number;
  toDormName: string;
  toRoomId: number;
  toRoomNumber: string;
  movementType: 'initial' | 'internal' | 'transfer';
  reason: string;
  performedByName: string;
  movedAt: string;
}

export interface TransferRequestRecord {
  id: number;
  studentId: number;
  studentName: string;
  studentNumber: string;
  fromDormId: number;
  fromDormName: string;
  fromRoomId: number;
  fromRoomNumber: string;
  toDormId: number;
  toDormName: string;
  toRoomId: number | null;
  toRoomNumber: string | null;
  reason: string;
  status: TransferStatus;
  rejectionReason: string | null;
  requestedById: number | null;
  requestedByName: string;
  reviewedByName: string | null;
  requestedAt: string;
  reviewedAt: string | null;
}

export interface AuditLogRecord {
  id: number;
  userId: number | null;
  actorName: string;
  actorRole?: UserRole | 'system';
  dormId: number | null;
  dormName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  /** آدرس IP ثبت‌شده برای رویدادهای ورود/خروج (در صورت وجود) */
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ExitRecord {
  residenceId: number;
  studentId: number;
  studentNumber: string;
  studentName: string;
  status: StudentStatus;
  dormId: number;
  dormName: string;
  roomNumber: string;
  startDate: string;
  endDate: string;
  exitReason: string;
}

export interface BackupRecord {
  id: number;
  fileName: string;
  fileSize: number;
  createdByName: string;
  createdAt: string;
  notes: string;
}

export interface SystemSettings {
  universityName: string;
  systemTitle: string;
  academicYear: string;
  currentSemesterTitle: string;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function formatShamsiDate(isoString: string | null | undefined, withTime = true): string {
  if (!isoString) return '—';
  const normalized = isoString.includes('T') || isoString.includes('Z')
    ? isoString
    : `${isoString.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(isoString);

  try {
    const datePart = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    if (!withTime) return datePart;

    const timePart = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    return `${datePart} - ${timePart}`;
  } catch {
    return isoString;
  }
}

export function formatShamsiHeaderDate(date = new Date()): { dateLine: string; timeLine: string } {
  try {
    const weekday = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
    }).format(date);
    const day = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      day: 'numeric',
    }).format(date);
    const month = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      month: 'long',
    }).format(date);
    const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
    }).format(date);
    const timeLine = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return {
      dateLine: `${weekday} ${day} ${month} ${year}`,
      timeLine,
    };
  } catch {
    return {
      dateLine: 'امروز',
      timeLine: '',
    };
  }
}

export function computeRoomMetrics(
  capacity: number,
  activeOccupied: number,
  extraCapacity = 0,
  extraOccupied = 0
): RoomMetrics {
  const safeCapacity = Math.max(0, Math.floor(capacity));
  const safeExtraCapacity = Math.max(0, Math.floor(extraCapacity));
  const safeExtraOccupied = Math.min(
    safeExtraCapacity,
    Math.max(0, Math.floor(extraOccupied))
  );
  // ساکنان عادی (دارای تخت) از کل ساکنان کسر می‌شوند تا دانشجویان مازاد
  // ظرفیت عادی اتاق را اشغال‌شده نشان ندهند.
  const safeBaseOccupied = Math.max(0, Math.floor(activeOccupied) - safeExtraOccupied);
  const remaining = Math.max(0, safeCapacity - safeBaseOccupied);
  const extraRemaining = Math.max(0, safeExtraCapacity - safeExtraOccupied);
  const occupancyPercent =
    safeCapacity > 0 ? Math.min(100, Math.round((safeBaseOccupied / safeCapacity) * 100)) : 0;
  const extraOccupancyPercent =
    safeExtraCapacity > 0
      ? Math.min(100, Math.round((safeExtraOccupied / safeExtraCapacity) * 100))
      : 0;

  let status: 'full' | 'available' | 'empty' = 'available';
  if (safeCapacity > 0 && remaining === 0) {
    status = 'full';
  } else if (safeBaseOccupied === 0 && safeExtraOccupied === 0) {
    status = 'empty';
  }

  return {
    capacity: safeCapacity,
    occupied: Math.max(0, Math.floor(activeOccupied)),
    baseOccupied: safeBaseOccupied,
    remaining,
    extraCapacity: safeExtraCapacity,
    extraOccupied: safeExtraOccupied,
    extraRemaining,
    occupancyPercent,
    extraOccupancyPercent,
    status,
  };
}

export const MAX_PHOTO_DATA_URL_LENGTH = 1_500_000;
const MAX_NAME_LENGTH = 60;
const MAX_MAJOR_LENGTH = 100;

export function isValidPhotoDataUrl(value: string): boolean {
  if (!value) return true;
  return (
    /^data:image\/(png|jpe?g|webp);base64,/i.test(value) &&
    value.length <= MAX_PHOTO_DATA_URL_LENGTH
  );
}

export function validateStudentInput(raw: Partial<StudentInput>): {
  valid: boolean;
  errors: Record<string, string>;
  normalized: StudentInput;
} {
  const errors: Record<string, string> = {};

  const firstName = (raw.firstName ?? '').trim();
  const lastName = (raw.lastName ?? '').trim();
  const studentNumber = toEnglishDigits((raw.studentNumber ?? '').trim());
  const nationalCode = toEnglishDigits((raw.nationalCode ?? '').trim()).replace(/[\s-]/g, '');
  const city = (raw.city ?? '').trim();
  const rawEntry = toEnglishDigits(String(raw.entryTerm ?? ''))
    .trim()
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, '');
  const entryTerm = /^\d{3}-(مهر|بهمن)$/.test(rawEntry) ? rawEntry : null;
  const rawSemester = String(raw.semester ?? '').trim();
  const semesterDigits = toEnglishDigits(rawSemester);
  const semesterNum = semesterDigits === '' ? null : Number(semesterDigits);
  const rawDegree = (raw.degree ?? '') as string;
  const degree = DEGREE_LEVELS.includes(rawDegree as DegreeLevel)
    ? (rawDegree as DegreeLevel)
    : null;
  const major = (raw.major ?? '').trim();
  const rawAttendance = (raw.attendanceType ?? '') as string;
  const attendanceType = ATTENDANCE_TYPES.includes(rawAttendance as AttendanceType)
    ? (rawAttendance as AttendanceType)
    : null;
  const mobile = toEnglishDigits((raw.mobile ?? '').trim()).replace(/[\s-]/g, '');
  const guardianPhone = toEnglishDigits((raw.guardianPhone ?? '').trim()).replace(/[\s-]/g, '');
  const photoUrl = (raw.photoUrl ?? '').trim();

  if (firstName.length < 2) errors.firstName = 'نام دانشجو الزامی است (حداقل ۲ کاراکتر).';
  if (firstName.length > MAX_NAME_LENGTH) errors.firstName = 'نام دانشجو بیش از حد مجاز طولانی است.';
  if (lastName.length < 2) errors.lastName = 'نام خانوادگی الزامی است (حداقل ۲ کاراکتر).';
  if (lastName.length > MAX_NAME_LENGTH) errors.lastName = 'نام خانوادگی بیش از حد مجاز طولانی است.';
  if (!/^\d{5,20}$/.test(studentNumber)) {
    errors.studentNumber = 'شماره دانشجویی باید عددی و بین ۵ تا ۲۰ رقم باشد.';
  }
  if (nationalCode !== '' && !/^\d{10}$/.test(nationalCode)) {
    errors.nationalCode = 'کد ملی باید عددی و ۱۰ رقم باشد.';
  }
  if (city !== '' && city.length < 2) errors.city = 'نام شهر باید حداقل ۲ کاراکتر باشد.';
  if (city.length > MAX_NAME_LENGTH) errors.city = 'نام شهر بیش از حد مجاز طولانی است.';
  if (rawEntry !== '' && !entryTerm) {
    errors.entryTerm = 'ورودی باید به قالب سال و نیم‌سال باشد؛ مانند 405-مهر یا 405-بهمن.';
  }
  if (
    semesterNum !== null &&
    (!Number.isInteger(semesterNum) || semesterNum < MIN_SEMESTER || semesterNum > MAX_SEMESTER)
  ) {
    errors.semester = 'ترم باید یک عدد صحیح بین ۱ تا ۹ باشد.';
  }
  if (rawDegree !== '' && !degree) {
    errors.degree = 'مقطع تحصیلی باید کاردانی یا کارشناسی انتخاب شود.';
  }
  if (major !== '' && major.length < 2) errors.major = 'نام رشته تحصیلی معتبر نیست.';
  if (major.length > MAX_MAJOR_LENGTH) errors.major = 'نام رشته تحصیلی بیش از حد مجاز طولانی است.';
  if (rawAttendance !== '' && !attendanceType) {
    errors.attendanceType = 'نوع تحصیل باید روزانه یا شبانه انتخاب شود.';
  }
  if (!/^09\d{9}$/.test(mobile)) {
    errors.mobile = 'شماره همراه معتبر نیست (باید ۱۱ رقم و با ۰۹ شروع شود).';
  }
  if (guardianPhone !== '' && !/^0\d{10}$/.test(guardianPhone)) {
    errors.guardianPhone = 'شماره ولی باید عددی و ۱۱ رقم باشد (مثال: ۰۹۱۵۱۲۳۴۵۶۷).';
  }
  if (photoUrl && !isValidPhotoDataUrl(photoUrl)) {
    errors.photoUrl = 'فرمت یا حجم تصویر دانشجو معتبر نیست.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      firstName,
      lastName,
      studentNumber,
      nationalCode,
      city,
      entryTerm,
      semester: semesterNum,
      degree,
      major,
      attendanceType,
      mobile,
      guardianPhone,
      photoUrl,
    },
  };
}

export function canAssignToRoom(
  room: {
    isActive: boolean;
    capacity: number;
    occupied: number;
    dormId: number;
    baseOccupied?: number;
    extraCapacity?: number;
    extraOccupied?: number;
  },
  targetDormId: number,
  options?: { isExtraCapacity?: boolean }
): { allowed: boolean; reason?: string } {
  if (room.dormId !== targetDormId) {
    return { allowed: false, reason: 'اتاق انتخاب‌شده متعلق به خوابگاه مجاز نیست.' };
  }
  if (!room.isActive) {
    return { allowed: false, reason: 'اتاق انتخاب‌شده غیرفعال است.' };
  }

  if (options?.isExtraCapacity) {
    const extraCapacity = Math.max(0, Math.floor(room.extraCapacity ?? 0));
    const extraOccupied = Math.max(0, Math.floor(room.extraOccupied ?? 0));
    if (extraCapacity === 0) {
      return { allowed: false, reason: 'برای این اتاق ظرفیت مازاد تعریف نشده است.' };
    }
    if (extraOccupied >= extraCapacity) {
      return { allowed: false, reason: 'ظرفیت مازاد اتاق انتخاب‌شده تکمیل شده است.' };
    }
    return { allowed: true };
  }

  const baseOccupied = Math.max(
    0,
    Math.floor(room.baseOccupied ?? room.occupied - (room.extraOccupied ?? 0))
  );
  if (baseOccupied >= room.capacity) {
    return { allowed: false, reason: 'ظرفیت اتاق انتخاب‌شده تکمیل شده است.' };
  }
  return { allowed: true };
}

export function canReduceRoomCapacity(
  newCapacity: number,
  currentOccupied: number
): { allowed: boolean; reason?: string; requiresWarning: boolean } {
  if (!Number.isInteger(newCapacity) || newCapacity < 1) {
    return {
      allowed: false,
      reason: 'ظرفیت اتاق باید عدد صحیح مثبت (حداقل ۱ نفر) باشد.',
      requiresWarning: false,
    };
  }
  if (newCapacity < currentOccupied) {
    return {
      allowed: false,
      reason: `تعداد ساکنان فعلی (${toPersianDigits(currentOccupied)} نفر) بیشتر از ظرفیت جدید است.`,
      requiresWarning: false,
    };
  }
  return {
    allowed: true,
    requiresWarning: true,
  };
}

export function canDeactivateRoom(currentOccupied: number): { allowed: boolean; reason?: string } {
  if (currentOccupied > 0) {
    return {
      allowed: false,
      reason: `این اتاق دارای ${toPersianDigits(currentOccupied)} دانشجوی ساکن است. ابتدا دانشجویان را منتقل کنید.`,
    };
  }
  return { allowed: true };
}

export function canUserAccessDorm(
  user: { role: UserRole; dormId: number | null },
  targetDormId: number
): boolean {
  if (user.role === 'admin') return true;
  return user.dormId !== null && user.dormId === targetDormId;
}

export function canUserManageTransfer(
  user: { role: UserRole; dormId: number | null },
  action: 'create' | 'cancel' | 'approve' | 'reject',
  transferToDormId?: number
): boolean {
  if (action === 'create' || action === 'cancel') {
    // مسئول کل و سرپرست خوابگاه هر دو می‌توانند درخواست ثبت/لغو کنند
    return user.role === 'admin' || (user.role === 'supervisor' && user.dormId !== null);
  }
  // تأیید/رد: مسئول کل یا سرپرست خوابگاه مقصد (موافقت سرپرست دیگر)
  if (user.role === 'admin') return true;
  return (
    user.role === 'supervisor' &&
    user.dormId !== null &&
    transferToDormId !== undefined &&
    user.dormId === transferToDormId
  );
}

export type NavTab =
  | 'dashboard'
  | 'students'
  | 'dormitories'
  | 'rooms'
  | 'movements'
  | 'residence-history'
  | 'transfers'
  | 'reports'
  | 'audit-logs'
  | 'users'
  | 'backups'
  | 'settings';

const TAB_TO_PATH: Record<NavTab, string> = {
  dashboard: '/',
  students: '/students',
  dormitories: '/dormitories',
  rooms: '/rooms',
  movements: '/movements',
  'residence-history': '/residence-history',
  transfers: '/transfers',
  reports: '/reports',
  'audit-logs': '/audit-logs',
  users: '/users',
  backups: '/backups',
  settings: '/settings',
};

const ADMIN_ONLY_TABS = new Set<NavTab>(['dormitories', 'users', 'backups']);

export function getPathForTab(tab: NavTab): string {
  return TAB_TO_PATH[tab] ?? '/';
}

export function getTabForPath(pathname: string): NavTab {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/dashboard') return 'dashboard';
  for (const [tab, p] of Object.entries(TAB_TO_PATH)) {
    if (p === clean) return tab as NavTab;
  }
  return 'dashboard';
}

export function isTabAllowedForRole(tab: NavTab, role: UserRole): boolean {
  if (role === 'admin') return true;
  return !ADMIN_ONLY_TABS.has(tab);
}

export function normalizeIsoDateOnly(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const m = String(isoString).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function filterByDateRange<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  fromDate?: string,
  toDate?: string
): T[] {
  const from = (fromDate ?? '').trim();
  const to = (toDate ?? '').trim();
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = normalizeIsoDateOnly(getDate(item));
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

