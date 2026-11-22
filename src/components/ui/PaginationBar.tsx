import { toPersianDigits } from '../../shared/dormRules';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationBarProps) {
  if (totalItems === 0) return null;
  return (
    <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/40">
      <span className="tabular-nums">
        مجموع {toPersianDigits(totalItems)} مورد · صفحه {toPersianDigits(page)} از{' '}
        {toPersianDigits(totalPages)}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 font-semibold"
          >
            قبلی
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 font-semibold"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
