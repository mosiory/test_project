import type { WorkBook, WorkSheet } from 'xlsx';
import {
  STUDENT_IMPORT_HEADER_ALIASES,
  normalizeImportHeader,
  type StudentImportSourceRow,
} from './studentImport';

/** گزینه‌های خروجی اکسل برای یک جدول گزارش */
export interface ExcelExportOptions {
  fileName: string;
  sheetName: string;
  /** ردیف‌های سرصفحهٔ متنی (عنوان سامانه، نوع گزارش، تاریخ…) */
  titleLines?: string[];
  headers: string[];
  rows: Array<Array<string | number>>;
  footerLines?: string[];
}

/** تنظیم راست‌به‌چپ بودن شیت و عرض ستون‌ها */
function applySheetMeta(sheet: WorkSheet, colCount: number, widths: number[]): void {
  sheet['!cols'] = widths.slice(0, Math.max(colCount, widths.length)).map((w) => ({ wch: w }));
  sheet['!views'] = [{ RTL: true }];
}

function estimateWidths(headers: string[], rows: Array<Array<string | number>>): number[] {
  return headers.map((h, i) => {
    let max = h.length + 4;
    for (const row of rows) {
      const cell = row[i];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max + 2, 8), 42);
  });
}

/** ساخت و دانلود فایل اکسل از روی داده‌های جدول گزارش */
export async function exportTableToExcel(options: ExcelExportOptions): Promise<void> {
  const XLSX = await import('xlsx');

  const aoa: Array<Array<string | number>> = [];
  if (options.titleLines && options.titleLines.length > 0) {
    for (const line of options.titleLines) aoa.push([line]);
    aoa.push([]);
  }
  aoa.push(options.headers);
  for (const row of options.rows) aoa.push(row);
  if (options.footerLines && options.footerLines.length > 0) {
    aoa.push([]);
    for (const line of options.footerLines) aoa.push([line]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  applySheetMeta(
    sheet,
    options.headers.length,
    estimateWidths(options.headers, options.rows)
  );

  const workbook: WorkBook = {
    SheetNames: [options.sheetName],
    Sheets: { [options.sheetName]: sheet },
    Props: { Title: options.titleLines?.[0] ?? options.sheetName },
  };

  const safeName = options.fileName.replace(/[\\/:*?"<>|]/g, '-');
  XLSX.writeFile(workbook, `${safeName}.xlsx`, { compression: true });
}

export interface WorkbookRowsResult {
  /** ردیف‌های داده به‌صورت آبجکت‌های سرصفحه‌دار همراه با شمارهٔ ردیف اکسل */
  rows: StudentImportSourceRow[];
  /** شمارهٔ ردیف اکسل که به‌عنوان سرصفحه تشخیص داده شد (۱-مبنا) */
  headerRowNumber: number;
}

const HEADER_SCAN_LIMIT = 25;
const HEADER_MATCH_THRESHOLD = 2;

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * خواندن ردیف‌های اولین شیت یک فایل اکسل/CSV به‌صورت آبجکت‌های سرصفحه‌دار.
 * ردیف سرصفحه حتی اگر چند ردیف عنوان/توضیح بالای آن باشد پیدا می‌شود.
 */
export async function readWorkbookRows(file: File): Promise<WorkbookRowsResult> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const first = workbook.SheetNames[0];
  if (!first) throw new Error('فایل اکسل هیچ شیتی ندارد.');
  const sheet = workbook.Sheets[first];
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  });
  if (table.length === 0) return { rows: [], headerRowNumber: 1 };

  const aliasSet = new Set(STUDENT_IMPORT_HEADER_ALIASES.map(normalizeImportHeader));
  let headerIndex = 0;
  let bestScore = 0;
  const scanLimit = Math.min(table.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < scanLimit; i += 1) {
    const score = (table[i] ?? []).reduce<number>((total, cell) => {
      const header = normalizeImportHeader(cellText(cell));
      return header && aliasSet.has(header) ? total + 1 : total;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }
  if (bestScore < HEADER_MATCH_THRESHOLD) headerIndex = 0;

  const headers = (table[headerIndex] ?? []).map(cellText);
  const rows: StudentImportSourceRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, column) => {
      if (!header) return;
      const value = cellText((table[i] ?? [])[column]);
      if (value !== '') hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push({ rowNumber: i + 1, values: record });
  }

  return { rows, headerRowNumber: headerIndex + 1 };
}

/** سرصفحه‌های استاندارد فایل نمونهٔ ایمپورت دانشجو */
export const STUDENT_IMPORT_HEADERS = [
  'نام',
  'نام خانوادگی',
  'شماره دانشجویی',
  'کد ملی',
  'شهر',
  'ورودی',
  'ترم',
  'مقطع',
  'رشته',
  'روزانه/شبانه',
  'شماره همراه',
  'شماره ولی',
  'شماره اتاق',
] as const;

/** دانلود فایل نمونهٔ اکسل برای ایمپورت دانشجویان */
export async function downloadStudentImportTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const aoa: Array<Array<string | number>> = [
    [...STUDENT_IMPORT_HEADERS],
    [
      'علی',
      'رضایی',
      '401234567',
      '0012345678',
      'همدان',
      'مهر 1403',
      1,
      'کارشناسی',
      'کامپیوتر',
      'روزانه',
      '09121234567',
      '09181234567',
      '101',
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  applySheetMeta(sheet, STUDENT_IMPORT_HEADERS.length, [
    14, 18, 14, 13, 10, 10, 7, 11, 16, 13, 14, 14, 11,
  ]);
  const workbook: WorkBook = {
    SheetNames: ['دانشجویان'],
    Sheets: { 'دانشجویان': sheet },
  };
  XLSX.writeFile(workbook, 'student-import-template.xlsx', { compression: true });
}
