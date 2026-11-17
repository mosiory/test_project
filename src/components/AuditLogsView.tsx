import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Eye, FilterX, History, Search, Users } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type AuditLogRecord,
  type AuthUser,
  type Dormitory,
  formatShamsiDate,
  normalizeIsoDateOnly,
  toPersianDigits,
} from '../shared/dormRules';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { Modal } from './ui/Modal';
import { PaginationBar } from './ui/PaginationBar';
import { EmptyState, ErrorBanner, TableSkeleton } from './ui/StateViews';
import { MobileCardList, MobileCardSkeleton, MobileRecordCard } from './ui/MobileCard';
import { JalaliDatePicker } from './ui/JalaliDatePicker';
import { useLiveRefresh } from '../lib/live';

interface AuditLogsViewProps {
  user: AuthUser;
  dorms: Dormitory[];
  onNavigateDashboard: () => void;
}

const PAGE_SIZE = 15;

function getRoleLabel(role?: string): string {
  if (role === 'admin') return 'مدیر کل سامانه';
  if (role === 'supervisor') return 'سرپرست خوابگاه';
  return 'سیستم';
}

export function AuditLogsView({
  user,
  dorms,
  onNavigateDashboard,
}: AuditLogsViewProps) {
  const [allLogs, setAllLogs] = useState<AuditLogRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogRecord[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dormFilter, setDormFilter] = useState<number>(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load baseline unfiltered logs for KPI cards & distinct action options
  useEffect(() => {
    apiRequest<{ logs: AuditLogRecord[] }>('/api/audit-logs')
      .then((res) => setAllLogs(res.logs))
      .catch(() => {});
  }, []);

  const loadFilteredLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (actionFilter) params.set('action', actionFilter);
      if (roleFilter) params.set('role', roleFilter);
      if (user.role === 'admin' && dormFilter > 0) {
        params.set('dormId', String(dormFilter));
      }
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);

      const qs = params.toString();
      const res = await apiRequest<{ logs: AuditLogRecord[] }>(
        `/api/audit-logs${qs ? `?${qs}` : ''}`
      );
      setFilteredLogs(res.logs);
      setPage(1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در دریافت تاریخچه فعالیت‌ها.'
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, actionFilter, roleFilter, user.role, dormFilter, fromDate, toDate]);

  useEffect(() => {
    loadFilteredLogs();
  }, [loadFilteredLogs]);

  useLiveRefresh(() => loadFilteredLogs(true));

  const distinctActions = useMemo(
    () => Array.from(new Set(allLogs.map((l) => l.action))),
    [allLogs]
  );

  // KPI metrics
  const kpiStats = useMemo(() => {
    const source = allLogs.length > 0 ? allLogs : filteredLogs;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const todayCount = source.filter(
      (l) => normalizeIsoDateOnly(l.createdAt) === todayUtc
    ).length;
    const activeActors = new Set(source.map((l) => l.actorName).filter(Boolean)).size;
    return {
      total: source.length,
      today: todayCount,
      activeUsers: activeActors,
    };
  }, [allLogs, filteredLogs]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, page]);

  const hasFilters = Boolean(
    search.trim() || actionFilter || roleFilter || dormFilter > 0 || fromDate || toDate
  );

  const clearFilters = () => {
    setSearch('');
    setActionFilter('');
    setRoleFilter('');
    setDormFilter(0);
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="تاریخچه فعالیت کاربران (Audit Log)"
        subtitle="ثبت خودکار و غیرقابل ویرایش تمام عملیات‌های کلیدی کاربران در سامانه"
        breadcrumbLabel="تاریخچه فعالیت‌ها"
        icon={<History className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-4">
              تعداد کل فعالیت‌ها
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {toPersianDigits(kpiStats.total)}
            </div>
          </div>
          <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-blue-50 text-[#2563EB] items-center justify-center">
            <History className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-4">
              فعالیت‌های امروز
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
              {toPersianDigits(kpiStats.today)}
            </div>
          </div>
          <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-4">
              کاربران فعال
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {toPersianDigits(kpiStats.activeUsers)}
            </div>
          </div>
          <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="relative sm:col-span-2 lg:col-span-4">
            <label htmlFor="audit-search" className="block text-[11px] font-semibold text-slate-600 mb-1">
              جست‌وجو
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="audit-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جست‌وجوی نام کاربر، عملیات یا جزئیات..."
                className="w-full pr-10 pl-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="audit-action" className="block text-[11px] font-semibold text-slate-600 mb-1">
              نوع عملیات
            </label>
            <select
              id="audit-action"
              aria-label="فیلتر نوع عملیات"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">همه عملیات‌ها</option>
              {distinctActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="audit-role" className="block text-[11px] font-semibold text-slate-600 mb-1">
              نقش کاربر
            </label>
            <select
              id="audit-role"
              aria-label="فیلتر نقش کاربر"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">همه نقش‌ها</option>
              <option value="admin">مدیر کل سامانه</option>
              <option value="supervisor">سرپرست خوابگاه</option>
              <option value="system">سیستم</option>
            </select>
          </div>

          {user.role === 'admin' && (
            <div className="lg:col-span-3">
              <label htmlFor="audit-dorm" className="block text-[11px] font-semibold text-slate-600 mb-1">
                خوابگاه
              </label>
              <select
                id="audit-dorm"
                aria-label="فیلتر خوابگاه"
                value={dormFilter}
                onChange={(e) => setDormFilter(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value={0}>همه خوابگاه‌ها</option>
                {dorms.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={`lg:col-span-3 ${showDateFilters ? 'block' : 'hidden sm:block'}`}>
            <label htmlFor="audit-from" className="block text-[11px] font-semibold text-slate-600 mb-1">
              از تاریخ (شمسی)
            </label>
            <JalaliDatePicker
              id="audit-from"
              value={fromDate}
              onChange={setFromDate}
              ariaLabel="از تاریخ شمسی"
              placeholder="از تاریخ"
            />
          </div>

          <div className={`lg:col-span-3 ${showDateFilters ? 'block' : 'hidden sm:block'}`}>
            <label htmlFor="audit-to" className="block text-[11px] font-semibold text-slate-600 mb-1">
              تا تاریخ (شمسی)
            </label>
            <JalaliDatePicker
              id="audit-to"
              value={toDate}
              onChange={setToDate}
              ariaLabel="تا تاریخ شمسی"
              placeholder="تا تاریخ"
            />
          </div>

          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setShowDateFilters((v) => !v)}
              aria-expanded={showDateFilters}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
            >
              {showDateFilters ? 'بستن بازه زمانی' : 'انتخاب بازه زمانی'}
            </button>
          </div>

          {hasFilters && (
            <div className="lg:col-span-6 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>پاک کردن</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th className="py-3.5 px-4">کاربر انجام‌دهنده</th>
                <th className="py-3.5 px-4">نقش کاربر</th>
                <th className="py-3.5 px-4">نوع عملیات</th>
                <th className="py-3.5 px-4">خوابگاه مرتبط</th>
                <th className="py-3.5 px-4">جزئیات</th>
                <th className="py-3.5 px-4">تاریخ و ساعت</th>
                <th className="py-3.5 px-4 text-center">مشاهده جزئیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="سابقه‌ای یافت نشد"
                      description="هیچ رویدادی مطابق با فیلترهای جست‌وجو ثبت نشده است."
                    />
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {l.actorName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge
                        label={getRoleLabel(l.actorRole)}
                        tone={
                          l.actorRole === 'admin'
                            ? 'blue'
                            : l.actorRole === 'supervisor'
                            ? 'emerald'
                            : 'slate'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 font-semibold text-blue-700 whitespace-nowrap">
                      {l.action}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {l.dormName ?? 'کل سامانه'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{l.details}</td>
                    <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                      {formatShamsiDate(l.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(l)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-blue-700 font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>مشاهده جزئیات</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {loading ? (
          <MobileCardSkeleton count={4} />
        ) : (
          <MobileCardList>
            {paginatedLogs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80">
                <EmptyState
                  title="سابقه‌ای یافت نشد"
                  description="هیچ رویدادی مطابق با فیلترهای جست‌وجو ثبت نشده است."
                />
              </div>
            ) : (
              paginatedLogs.map((l) => (
                <MobileRecordCard
                  key={l.id}
                  accent={l.actorRole === 'admin' ? 'blue' : l.actorRole === 'supervisor' ? 'emerald' : 'slate'}
                  title={l.action}
                  subtitle={`${l.actorName} · ${formatShamsiDate(l.createdAt)}`}
                  badge={
                    <StatusBadge
                      label={getRoleLabel(l.actorRole)}
                      tone={
                        l.actorRole === 'admin'
                          ? 'blue'
                          : l.actorRole === 'supervisor'
                          ? 'emerald'
                          : 'slate'
                      }
                    />
                  }
                  rows={[
                    { label: 'خوابگاه', value: l.dormName ?? 'کل سامانه' },
                    { label: 'شناسه رکورد', value: `#${toPersianDigits(l.id)}` },
                  ]}
                  footer={
                    <div className="text-[11px] text-slate-600 leading-5">
                      <span className="text-slate-500">جزئیات: </span>
                      {l.details || '—'}
                    </div>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() => setSelectedLog(l)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5" /> مشاهده جزئیات
                    </button>
                  }
                />
              ))
            )}
          </MobileCardList>
        )}

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filteredLogs.length}
          onPageChange={setPage}
        />
      </div>

      {/* Audit Log Detail Modal */}
      <Modal
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="جزئیات کامل رویداد سیستمی"
        maxWidthClass="max-w-lg"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-[#F4F7FC] p-4 rounded-xl border border-slate-200/70">
              <div>
                <span className="text-slate-500 block">شناسه رویداد</span>
                <strong className="text-slate-900 mt-0.5 block tabular-nums">
                  #{toPersianDigits(selectedLog.id)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">تاریخ و ساعت ثبت</span>
                <strong className="text-slate-900 mt-0.5 block tabular-nums">
                  {formatShamsiDate(selectedLog.createdAt)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">کاربر انجام‌دهنده</span>
                <strong className="text-slate-900 mt-0.5 block">{selectedLog.actorName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">نقش کاربری</span>
                <div className="mt-1">
                  <StatusBadge
                    label={getRoleLabel(selectedLog.actorRole)}
                    tone={selectedLog.actorRole === 'admin' ? 'blue' : 'emerald'}
                  />
                </div>
              </div>
              <div>
                <span className="text-slate-500 block">نوع عملیات</span>
                <strong className="text-blue-700 mt-0.5 block">{selectedLog.action}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">خوابگاه مرتبط</span>
                <strong className="text-slate-900 mt-0.5 block">
                  {selectedLog.dormName ?? 'کل سامانه'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">نوع موجودیت</span>
                <strong className="text-slate-800 mt-0.5 block font-mono" dir="ltr">
                  {selectedLog.entityType || '—'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">شناسه موجودیت</span>
                <strong className="text-slate-800 mt-0.5 block font-mono" dir="ltr">
                  {selectedLog.entityId || '—'}
                </strong>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="text-slate-500 font-semibold mb-1.5">شرح کامل عملیات</div>
              <p className="text-slate-800 leading-relaxed">{selectedLog.details || '—'}</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
              >
                بستن
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
