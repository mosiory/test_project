import type { ReactNode } from 'react';

export interface MobileCardRow {
  label: string;
  value: ReactNode;
  full?: boolean;
}

interface MobileRecordCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  rows?: MobileCardRow[];
  actions?: ReactNode;
  footer?: ReactNode;
  accent?: 'blue' | 'emerald' | 'rose' | 'amber' | 'slate';
}

const ACCENT_BORDER: Record<NonNullable<MobileRecordCardProps['accent']>, string> = {
  blue: 'border-r-4 border-r-blue-500',
  emerald: 'border-r-4 border-r-emerald-500',
  rose: 'border-r-4 border-r-rose-500',
  amber: 'border-r-4 border-r-amber-500',
  slate: 'border-r-4 border-r-slate-300',
};

export function MobileRecordCard({
  title,
  subtitle,
  badge,
  rows = [],
  actions,
  footer,
  accent = 'blue',
}: MobileRecordCardProps) {
  return (
    <article
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3 ${ACCENT_BORDER[accent]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900 leading-6 break-words">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-slate-500 mt-0.5 leading-5">{subtitle}</div>
          )}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-dashed border-slate-100 text-[11px]">
          {rows.map((row) => (
            <div
              key={row.label}
              className={row.full ? 'col-span-2 flex items-center justify-between gap-2' : ''}
            >
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-semibold text-slate-800 mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {footer}

      {actions && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </article>
  );
}

export function MobileCardList({ children }: { children: ReactNode }) {
  return <div className="space-y-3 md:hidden">{children}</div>;
}

export function MobileCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 md:hidden" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-slate-200 rounded" />
            <div className="h-5 w-16 bg-slate-100 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-3 bg-slate-100 rounded" />
            <div className="h-3 bg-slate-100 rounded" />
            <div className="h-3 bg-slate-100 rounded" />
            <div className="h-3 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
