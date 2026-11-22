export type BadgeTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function getToneForStatus(label: string): BadgeTone {
  if (
    label === 'ساکن' ||
    label === 'تأییدشده' ||
    label === 'فعال' ||
    label === 'خالی' ||
    label === 'موفق' ||
    label === 'اقامت فعال' ||
    label === 'سالم'
  ) {
    return 'emerald';
  }
  if (
    label === 'در انتظار تأیید' ||
    label === 'در انتظار بررسی' ||
    label === 'انصراف از خوابگاه'
  ) {
    return 'amber';
  }
  if (
    label === 'ردشده' ||
    label === 'تکمیل ظرفیت' ||
    label === 'اخراج‌شده' ||
    label === 'غیرفعال' ||
    label === 'خطا'
  ) {
    return 'rose';
  }
  if (label === 'دارای ظرفیت' || label === 'دارای ظرفیت خالی' || label === 'انتقال‌یافته') {
    return 'blue';
  }
  return 'slate';
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone?: BadgeTone;
}) {
  const resolved = tone ?? getToneForStatus(label);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${TONE_CLASSES[resolved]}`}
    >
      {label}
    </span>
  );
}
