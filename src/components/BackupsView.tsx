import { useEffect, useState, type FormEvent } from 'react';
import {
  Clock,
  DatabaseBackup,
  Download,
  HardDrive,
  Layers,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type BackupRecord,
  formatShamsiDate,
  toPersianDigits,
} from '../shared/dormRules';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { MobileCardList, MobileCardSkeleton, MobileRecordCard } from './ui/MobileCard';
import {
  EmptyState,
  ErrorBanner,
  SuccessBanner,
  TableSkeleton,
} from './ui/StateViews';

interface BackupsViewProps {
  onNavigateDashboard: () => void;
}

export function BackupsView({ onNavigateDashboard }: BackupsViewProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [verifiedMap, setVerifiedMap] = useState<Record<number, 'ok' | 'error'>>({});

  const loadBackups = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ backups: BackupRecord[] }>('/api/backups');
      setBackups(res.backups);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در دریافت تاریخچه پشتیبان‌ها.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiRequest('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      setNotes('');
      setSuccessMsg(
        'نسخه پشتیبان امن و سازگار با تراکنش‌های SQLite با موفقیت ایجاد شد.'
      );
      await loadBackups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در تهیه نسخه پشتیبان.');
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async (b: BackupRecord) => {
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/backups/${b.id}/verify`, {
        method: 'POST',
      });
      if (res.ok) {
        setVerifiedMap((prev) => ({ ...prev, [b.id]: 'ok' }));
        setSuccessMsg(
          `سلامت فایل پشتیبان ${b.fileName} تأیید شد (integrity_check = ok).`
        );
      } else {
        setVerifiedMap((prev) => ({ ...prev, [b.id]: 'error' }));
        setError('فایل پشتیبان دارای خطای ساختاری است.');
      }
    } catch (err) {
      setVerifiedMap((prev) => ({ ...prev, [b.id]: 'error' }));
      setError(err instanceof ApiError ? err.message : 'خطا در بررسی سلامت فایل.');
    }
  };

  const latestBackup = backups[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="پشتیبان‌گیری از پایگاه داده"
        subtitle="تهیه نسخه پشتیبان کامل از دیتابیس SQLite، بررسی یکپارچگی فایل و دانلود ایمن"
        breadcrumbLabel="پشتیبان‌گیری"
        icon={<DatabaseBackup className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
      />

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Backup Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="text-sm font-bold text-slate-800">وضعیت پشتیبان‌گیری سامانه</div>
          <StatusBadge
            label={latestBackup ? 'موفق' : 'ثبت‌نشده'}
            tone={latestBackup ? 'emerald' : 'amber'}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-slate-500">تاریخ و ساعت آخرین نسخه</div>
              <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                {latestBackup ? formatShamsiDate(latestBackup.createdAt) : '—'}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-slate-500">حجم آخرین فایل</div>
              <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                {latestBackup
                  ? `${toPersianDigits(
                      Math.max(1, Math.round(latestBackup.fileSize / 1024))
                    )} کیلوبایت`
                  : '—'}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-slate-500">تعداد کل نسخه‌ها</div>
              <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                {toPersianDigits(backups.length)} نسخه
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Backup Form */}
      <form
        onSubmit={handleCreateBackup}
        className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row gap-3 items-end"
      >
        <div className="flex-1 w-full">
          <label htmlFor="bk-notes" className="block text-xs font-semibold text-slate-700 mb-1">
            توضیحات نسخه پشتیبان (اختیاری)
          </label>
          <input
            id="bk-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: پشتیبان پایان هفته پیش از ثبت‌نام ترم جدید"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{creating ? 'در حال پشتیبان‌گیری...' : 'ایجاد نسخه پشتیبان جدید'}</span>
        </button>
      </form>

      {/* Backup History Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th className="py-3.5 px-3">نسخه</th>
                <th className="py-3.5 px-3">نام فایل</th>
                <th className="py-3.5 px-3">حجم فایل</th>
                <th className="py-3.5 px-3">وضعیت</th>
                <th className="py-3.5 px-3">ایجادکننده</th>
                <th className="py-3.5 px-3">توضیحات</th>
                <th className="py-3.5 px-3">تاریخ و ساعت</th>
                <th className="py-3.5 px-3 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={4} cols={8} />
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title="هنوز نسخه پشتیبانی ایجاد نشده است"
                      description="با کلیک بر روی دکمه «ایجاد نسخه پشتیبان جدید» اولین نسخه پشتیبان امن را تهیه کنید."
                    />
                  </td>
                </tr>
              ) : (
                backups.map((b) => {
                  const statusLabel =
                    verifiedMap[b.id] === 'error'
                      ? 'خطا'
                      : verifiedMap[b.id] === 'ok'
                      ? 'سالم'
                      : 'موفق';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3 font-bold text-slate-700 tabular-nums whitespace-nowrap">
                        #{toPersianDigits(b.id)}
                      </td>
                      <td
                        title={b.fileName}
                        className="py-3 px-3 font-mono font-semibold text-slate-800 max-w-[190px] truncate"
                      >
                        {b.fileName}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600 whitespace-nowrap">
                        {toPersianDigits(Math.max(1, Math.round(b.fileSize / 1024)))} کیلوبایت
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge label={statusLabel} />
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {b.createdByName}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-[170px] truncate">
                        {b.notes || '—'}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatShamsiDate(b.createdAt)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleVerify(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>بررسی سلامت</span>
                          </button>
                          <a
                            href={`/api/backups/${b.id}/download`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>دریافت فایل</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {loading ? (
          <MobileCardSkeleton count={2} />
        ) : (
          <MobileCardList>
            {backups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80">
                <EmptyState
                  title="هنوز نسخه پشتیبان ایجاد نشده است"
                  description="با کلیک بر روی دکمه «ایجاد نسخه پشتیبان جدید» اولین نسخه پشتیبان امن را تهیه کنید."
                />
              </div>
            ) : (
              backups.map((b) => {
                const statusLabel =
                  verifiedMap[b.id] === 'error'
                    ? 'خطا'
                    : verifiedMap[b.id] === 'ok'
                    ? 'سالم'
                    : 'موفق';
                return (
                  <MobileRecordCard
                    key={b.id}
                    accent="emerald"
                    title={`نسخه #${toPersianDigits(b.id)}`}
                    subtitle={<span className="font-mono break-all">{b.fileName}</span>}
                    badge={<StatusBadge label={statusLabel} />}
                    rows={[
                      { label: 'حجم فایل', value: `${toPersianDigits(Math.max(1, Math.round(b.fileSize / 1024)))} کیلوبایت` },
                      { label: 'ایجادکننده', value: b.createdByName },
                      { label: 'تاریخ و ساعت', value: formatShamsiDate(b.createdAt), full: true },
                    ]}
                    footer={
                      <div className="text-[11px] text-slate-600 leading-5">
                        <span className="text-slate-500">توضیحات: </span>
                        {b.notes || '—'}
                      </div>
                    }
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => handleVerify(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> بررسی سلامت
                        </button>
                        <a
                          href={`/api/backups/${b.id}/download`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#2563EB] font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" /> دریافت فایل
                        </a>
                      </>
                    }
                  />
                );
              })
            )}
          </MobileCardList>
        )}
      </div>
    </div>
  );
}
