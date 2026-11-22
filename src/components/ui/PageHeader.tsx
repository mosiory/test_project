import type { ReactNode } from 'react';
import { ChevronLeft, Home } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  breadcrumbLabel: string;
  icon: ReactNode;
  onNavigateDashboard?: () => void;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbLabel,
  icon,
  onNavigateDashboard,
  actions,
}: PageHeaderProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
      <nav aria-label="مسیر صفحه" className="flex items-center gap-1.5 text-xs text-slate-500">
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="inline-flex items-center gap-1 hover:text-[#2563EB] transition-colors font-medium"
        >
          <Home className="w-3.5 h-3.5" />
          <span>داشبورد</span>
        </button>
        <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-bold text-slate-700">{breadcrumbLabel}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <span className="text-[#2563EB] shrink-0">{icon}</span>
            <span>{title}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
