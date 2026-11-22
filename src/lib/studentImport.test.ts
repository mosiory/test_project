import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapStudentImportRows,
  normalizeImportDegree,
  normalizeImportEntryTerm,
  normalizeImportPhone,
  normalizeImportRoomNumber,
} from './studentImport';
import { readWorkbookRows } from './excel';

/** ردیفی با همان سرصفحه‌های فایل واقعی test.xlsx (با فاصله‌های انتهایی) */
const REAL_FILE_ROW: Record<string, string> = {
  'شماره ': '1',
  'نام ': 'حسین',
  'نام خانوادگی': 'راستی سرخ ابادی',
  'شماره اتاق': '1',
  'کد ملی': '0691254524',
  'شماره تماس دانشجو': '09332305269',
  'شماره تماس ولی': '09158328467',
  'شماره دانشجویی': '05101057380037',
  'مقطع ': 'کاردانی',
  'رشته ': 'مکانیک',
  'ورودی': 'مهر',
  'شهر': 'مشهد',
  'مازاد ': '',
};

test('maps the real dorm Excel headers (شماره تماس دانشجو / شماره تماس ولی / شماره اتاق)', () => {
  const { rows, rowErrors } = mapStudentImportRows([{ values: REAL_FILE_ROW }]);
  assert.deepEqual(rowErrors, []);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.rowNumber, 2);
  assert.equal(row.roomNumber, '1');
  assert.equal(row.payload.firstName, 'حسین');
  assert.equal(row.payload.lastName, 'راستی سرخ ابادی');
  assert.equal(row.payload.studentNumber, '05101057380037');
  assert.equal(row.payload.nationalCode, '0691254524');
  assert.equal(row.payload.mobile, '09332305269');
  assert.equal(row.payload.guardianPhone, '09158328467');
  assert.equal(row.payload.degree, 'کاردانی');
  assert.equal(row.payload.major, 'مکانیک');
  assert.equal(row.payload.city, 'مشهد');
  assert.match(String(row.payload.entryTerm), /^\d{3}-مهر$/);
});

test('accepts Arabic ي/ك, ZWNJ and full-width header variants', () => {
  const { rows, rowErrors } = mapStudentImportRows([
    {
      values: {
      'نام': 'زهرا',
      'نام خانوادگي': 'رضایی',
      'شماره دانشجوئی': '40123456',
      'شماره تماس': '۰۹۱۲۱۲۳۴۵۶۷',
      'شماره تماس والد': '09181234567',
      'شماره‌اتاق': 'اتاق ۰۱۲',
      },
    },
  ]);
  assert.deepEqual(rowErrors, []);
  assert.equal(rows[0].payload.lastName, 'رضایی');
  assert.equal(rows[0].payload.mobile, '09121234567');
  assert.equal(rows[0].payload.guardianPhone, '09181234567');
  assert.equal(rows[0].roomNumber, '12');
});

test('skips invalid rows with a helpful Persian message and keeps the rest', () => {
  const { rows, rowErrors } = mapStudentImportRows([
    {
      values: { نام: 'علی', 'نام خانوادگی': 'رضایی', 'شماره دانشجویی': '123456', 'شماره همراه': '' },
    },
    {
      values: {
        نام: 'مریم',
        'نام خانوادگی': 'کریمی',
        'شماره دانشجویی': '123457',
        'شماره تماس دانشجو': '09121234567',
      },
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.firstName, 'مریم');
  assert.equal(rowErrors.length, 1);
  assert.match(rowErrors[0], /ردیف ۲/);
  assert.match(rowErrors[0], /شماره همراه/);
});

test('normalizes phones, room numbers, degrees and entry terms', () => {
  assert.equal(normalizeImportPhone('+98 912 123 4567'), '09121234567');
  assert.equal(normalizeImportPhone('00989121234567'), '09121234567');
  assert.equal(normalizeImportPhone('9121234567'), '09121234567');
  assert.equal(normalizeImportRoomNumber('اتاق ۰۱۲'), '12');
  assert.equal(normalizeImportDegree('کارشناسی ارشد'), null);
  assert.equal(normalizeImportDegree('کاردانی ناپیوسته'), 'کاردانی');
  assert.equal(normalizeImportDegree('کارشناسی'), 'کارشناسی');
  assert.equal(normalizeImportEntryTerm('مهر 1403'), '403-مهر');
  assert.equal(normalizeImportEntryTerm('403-بهمن'), '403-بهمن');
  assert.equal(normalizeImportEntryTerm('1403/07/01'), null);
  assert.equal(normalizeImportEntryTerm('تابستان'), null);
});

test('invalid optional values do not reject the student row', () => {
  const { rows, rowErrors } = mapStudentImportRows([
    {
      values: {
        نام: 'سارا',
        'نام خانوادگی': 'احمدی',
        'شماره دانشجویی': '98765',
        'شماره همراه': '09120000000',
        'کد ملی': '123',
        'مقطع': 'دکتری',
        'ورودی': 'نامشخص',
        ترم: '۱۵',
      },
    },
  ]);
  assert.deepEqual(rowErrors, []);
  assert.equal(rows[0].payload.nationalCode, '');
  assert.equal(rows[0].payload.degree, null);
  assert.equal(rows[0].payload.entryTerm, null);
  assert.equal(rows[0].payload.semester, null);
});

test('readWorkbookRows finds the header row below title rows and reports its number', async () => {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['گزارش اسکان دانشجویان'],
    ['تاریخ گزارش: 1403/08/01'],
    [],
    ['نام ', 'نام خانوادگی', 'شماره دانشجویی', 'شماره تماس دانشجو', 'شماره اتاق'],
    ['علی', 'رضایی', '401234567', '09121234567', '101'],
    ['', '', '', '', ''],
    ['مریم', 'کریمی', '401234568', '09121234568', ''],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([buffer], 'students.xlsx');
  const result = await readWorkbookRows(file);
  assert.equal(result.headerRowNumber, 4);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].rowNumber, 5);
  assert.equal(result.rows[0].values['نام'], 'علی');
  assert.equal(result.rows[0].values['شماره تماس دانشجو'], '09121234567');

  const { rows } = mapStudentImportRows(result.rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowNumber, 5);
  assert.equal(rows[0].roomNumber, '101');
  assert.equal(rows[1].rowNumber, 7);
});
