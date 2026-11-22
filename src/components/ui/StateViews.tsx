import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="animate-pulse">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <td key={cIdx} className="py-3.5 px-4">
              <div className="h-3.5 bg-slate-200/80 rounded-md w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 animate-pulse"
        >
          <div className="flex justify-between">
            <div className="space-y-2 w-1/2">
              <div className="h-3 bg-slate-200 rounded w-2/3" />
              <div className="h-5 bg-slate-200 rounded w-1/2" />
            </div>
            <div className="h-6 bg-slate-200 rounded-lg w-20" />
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full w-full" />
          <div className="h-8 bg-slate-100 rounded-xl w-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({
  cards = 4,
  rows = 5,
  gridClass = 'grid-cols-2 lg:grid-cols-4',
}: {
  cards?: number;
  rows?: number;
  gridClass?: string;
}) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="در حال بارگذاری صفحه">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs animate-pulse">
        <div className="h-3 w-40 bg-slate-200 rounded" />
        <div className="h-6 w-64 bg-slate-200 rounded mt-3" />
        <div className="h-3 w-80 max-w-full bg-slate-100 rounded mt-2" />
      </div>
      <div className={`grid ${gridClass} gap-4`}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs animate-pulse">
            <div className="h-6 w-14 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-100 rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden animate-pulse">
        <div className="h-11 bg-[#EEF4FF]" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-4 border-b border-slate-100">
            <div className="h-3.5 bg-slate-200 rounded w-28" />
            <div className="h-3.5 bg-slate-100 rounded w-40" />
            <div className="h-3.5 bg-slate-100 rounded w-24 hidden sm:block" />
            <div className="h-3.5 bg-slate-100 rounded w-20 hidden md:block mr-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'دریافت اطلاعات انجام نشد',
  description,
  onRetry,
  retryLabel = 'تلاش دوباره',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-rose-200/80 shadow-xs p-10 text-center max-w-xl mx-auto my-6 space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
        {description ?? 'ارتباط با سرور برقرار نشد. از اجرای سامانه مطمئن شوید و دوباره تلاش کنید.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center flex flex-col items-center justify-center gap-2">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-1">
        {icon ?? <Inbox className="w-6 h-6" />}
      </div>
      <div className="text-sm font-bold text-slate-700">{title}</div>
      {description && <p className="text-xs text-slate-500 max-w-md">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  message,
  onClose,
}: {
  message: string;
  onClose?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-3"
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </span>
      {onClose && (
        <button type="button" onClick={onClose} className="hover:underline shrink-0">
          بستن
        </button>
      )}
    </div>
  );
}

export function SuccessBanner({
  message,
  onClose,
}: {
  message: string;
  onClose?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>{message}</span>
      </span>
      {onClose && (
        <button type="button" onClick={onClose} className="hover:underline shrink-0">
          بستن
        </button>
      )}
    </div>
  );
}

export function ForbiddenView({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-rose-200/80 shadow-xs p-10 text-center max-w-lg mx-auto my-8 space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="text-lg font-extrabold text-slate-900">عدم دسترسی به صفحه (۴۰۳)</h1>
      <p className="text-xs text-slate-600 leading-relaxed">
        حساب کاربری شما مجوز مشاهده یا مدیریت این بخش از سامانه را ندارد. دسترسی هر نقش فقط
        به محدوده مجاز همان حساب (مدیر کل یا خوابگاه اختصاصی) محدود است.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
      >
        بازگشت به داشبورد
      </button>
    </div>
  );
}
