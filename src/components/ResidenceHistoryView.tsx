import { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type MovementRecord,
  type ResidenceRecord,
  type StudentRecord,
  type TransferRequestRecord,
  formatShamsiDate,
  toPersianDigits,
} from '../shared/dormRules';
import { PageHeader } from './ui/PageHeader';
import { useLiveRefresh } from '../lib/live';
import { StatusBadge } from './ui/StatusBadge';
import { MobileRecordCard } from './ui/MobileCard';
import { EmptyState, ErrorBanner } from './ui/StateViews';

interface ResidenceHistoryViewProps {
  onNavigateDashboard: () => void;
}

export function ResidenceHistoryView({
  onNavigateDashboard,
}: ResidenceHistoryViewProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number>(0);
  const [detail, setDetail] = useState<{
    student: StudentRecord;
    residences: ResidenceRecord[];
    movements: MovementRecord[];
    transfers: TransferRequestRecord[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ students: StudentRecord[] }>('/api/students')
      .then((res) => {
        setStudents(res.students);
        if (res.students.length > 0) {
          setSelectedId(res.students[0].id);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'خطا در دریافت لیست دانشجویان.')
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    apiRequest<NonNullable<typeof detail>>(`/api/students/${selectedId}`)
      .then((res) => setDetail(res))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'خطا در دریافت تاریخچه اقامت.')
      )
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // به‌روزرسانی زندهٔ تاریخچه بدون تغییر دانشجوی انتخاب‌شده
  useLiveRefresh(() => {
    apiRequest<{ students: StudentRecord[] }>('/api/students')
      .then((res) => setStudents(res.students))
      .catch(() => {});
    if (selectedId) {
      apiRequest<NonNullable<typeof detail>>(`/api/students/${selectedId}`)
        .then((res) => setDetail(res))
        .catch(() => {});
    }
  });

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.studentNumber.includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="تاریخچه اقامت دانشجویان"
        subtitle="مشاهده سوابق کامل اتاق‌ها، خوابگاه‌های قبلی، تاریخ جابه‌جایی‌ها، درخواست‌های انتقال و وضعیت فعلی اقامت هر دانشجو"
        breadcrumbLabel="تاریخچه اقامت"
        icon={<History className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Student Picker Sidebar */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col max-h-[320px] lg:max-h-[650px]">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جست‌وجوی دانشجو..."
                aria-label="جست‌وجوی دانشجو برای مشاهده تاریخچه اقامت"
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">
                در حال بارگذاری...
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="دانشجویی یافت نشد" />
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-right px-4 py-3 transition-colors ${
                    selectedId === s.id
                      ? 'bg-blue-50 border-r-2 border-blue-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">
                    {s.firstName} {s.lastName}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between tabular-nums">
                    <span>{toPersianDigits(s.studentNumber)}</span>
                    <span>
                      {s.currentRoomNumber
                        ? `اتاق ${toPersianDigits(s.currentRoomNumber)}`
                        : s.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Residence Timeline */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-6">
          {detailLoading ? (
            <div className="space-y-4 animate-pulse" aria-busy="true">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F4F7FC] p-4 rounded-xl">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-16 bg-slate-200 rounded" />
                    <div className="h-4 w-24 bg-slate-200 rounded mt-2" />
                  </div>
                ))}
              </div>
              <div className="h-5 w-40 bg-slate-200 rounded" />
              <div className="h-32 bg-slate-100 rounded-xl" />
            </div>
          ) : !detail ? (
            <EmptyState
              title="دانشجویی انتخاب نشده است"
              description="یک دانشجو را از فهرست سمت راست انتخاب کنید تا سوابق اقامت و انتقال‌های او نمایش داده شود."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-[#F4F7FC] p-4 rounded-xl border border-slate-200/70 text-xs">
                <div>
                  <span className="text-slate-500 block">نام دانشجو</span>
                  <strong className="text-slate-900 mt-0.5 block">
                    {detail.student.firstName} {detail.student.lastName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">شماره دانشجویی</span>
                  <strong className="text-slate-900 mt-0.5 block num">
                    {toPersianDigits(detail.student.studentNumber)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">کد ملی</span>
                  <strong className="text-slate-900 mt-0.5 block num">
                    {detail.student.nationalCode
                      ? toPersianDigits(detail.student.nationalCode)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">خوابگاه فعلی</span>
                  <strong className="text-slate-900 mt-0.5 block">
                    {detail.student.currentDormName ?? '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">اتاق فعلی / نوع ظرفیت</span>
                  <strong className="text-blue-700 mt-0.5 block tabular-nums">
                    {detail.student.currentRoomNumber
                      ? toPersianDigits(detail.student.currentRoomNumber)
                      : '—'}
                    <span
                      className={`ms-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        detail.student.isExtraCapacity
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {detail.student.isExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت عادی'}
                    </span>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">شماره ولی</span>
                  <strong className="text-slate-900 mt-0.5 block num">
                    {detail.student.guardianPhone
                      ? toPersianDigits(detail.student.guardianPhone)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">وضعیت اقامت</span>
                  <div className="mt-1">
                    <StatusBadge label={detail.student.status} />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-800 mb-3">
                  سوابق اتاق‌ها و خوابگاه‌ها
                </h2>
                {detail.residences.length === 0 ? (
                  <EmptyState title="سابقه اقامتی ثبت نشده است" />
                ) : (
                  <>
                    <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl table-scroll">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
                          <tr>
                            <th className="py-3 px-4">خوابگاه</th>
                            <th className="py-3 px-4">شماره اتاق</th>
                            <th className="py-3 px-4">نوع ظرفیت</th>
                            <th className="py-3 px-4">تاریخ ورود</th>
                            <th className="py-3 px-4">تاریخ پایان</th>
                            <th className="py-3 px-4">وضعیت / علت پایان</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.residences.map((r) => (
                            <tr key={r.id}>
                              <td className="py-3 px-4 font-semibold">{r.dormName}</td>
                              <td className="py-3 px-4 tabular-nums font-bold text-blue-700">
                                {toPersianDigits(r.roomNumber)}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    r.isExtraCapacity
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {r.isExtraCapacity ? 'ظرفیت مازاد' : 'عادی'}
                                </span>
                              </td>
                              <td className="py-3 px-4 tabular-nums">
                                {formatShamsiDate(r.startDate)}
                              </td>
                              <td className="py-3 px-4 tabular-nums">
                                {r.endDate ? formatShamsiDate(r.endDate) : 'اقامت فعال'}
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                {r.isActive ? (
                                  <StatusBadge label="ساکن" tone="emerald" />
                                ) : (
                                  r.exitReason || 'پایان اقامت'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sm:hidden space-y-3">
                      {detail.residences.map((r) => (
                        <MobileRecordCard
                          key={r.id}
                          accent={r.isActive ? 'emerald' : 'slate'}
                          title={`${r.dormName} · اتاق ${toPersianDigits(r.roomNumber)}`}
                          badge={r.isActive ? <StatusBadge label="ساکن" tone="emerald" /> : undefined}
                          rows={[
                            {
                              label: 'نوع ظرفیت',
                              value: r.isExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت عادی',
                            },
                            { label: 'تاریخ ورود', value: formatShamsiDate(r.startDate) },
                            {
                              label: 'تاریخ پایان',
                              value: r.endDate ? formatShamsiDate(r.endDate) : 'اقامت فعال',
                            },
                            ...(r.isActive
                              ? []
                              : [{ label: 'علت پایان', value: r.exitReason || 'پایان اقامت', full: true }]),
                          ]}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-800 mb-3">
                  درخواست‌های انتقال بین خوابگاه‌ها
                </h2>
                {(detail.transfers ?? []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
                    درخواست انتقالی برای این دانشجو ثبت نشده است.
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl table-scroll">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
                          <tr>
                            <th className="py-3 px-4">مبدأ</th>
                            <th className="py-3 px-4">مقصد</th>
                            <th className="py-3 px-4">وضعیت</th>
                            <th className="py-3 px-4">تاریخ درخواست</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.transfers.map((t) => (
                            <tr key={t.id}>
                              <td className="py-3 px-4">
                                {t.fromDormName} · اتاق {toPersianDigits(t.fromRoomNumber)}
                              </td>
                              <td className="py-3 px-4 font-semibold text-blue-700">
                                {t.toDormName} · اتاق {toPersianDigits(t.toRoomNumber ?? '—')}
                              </td>
                              <td className="py-3 px-4">
                                <StatusBadge label={t.status} />
                              </td>
                              <td className="py-3 px-4 tabular-nums">
                                {formatShamsiDate(t.requestedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sm:hidden space-y-3">
                      {detail.transfers.map((t) => (
                        <MobileRecordCard
                          key={t.id}
                          accent={
                            t.status === 'تأییدشده'
                              ? 'emerald'
                              : t.status === 'ردشده'
                              ? 'rose'
                              : 'amber'
                          }
                          title={`${t.fromDormName} → ${t.toDormName}`}
                          badge={<StatusBadge label={t.status} />}
                          rows={[
                            {
                              label: 'اتاق مبدأ',
                              value: toPersianDigits(t.fromRoomNumber),
                            },
                            {
                              label: 'اتاق مقصد',
                              value: toPersianDigits(t.toRoomNumber ?? '—'),
                            },
                            {
                              label: 'تاریخ درخواست',
                              value: formatShamsiDate(t.requestedAt),
                              full: true,
                            },
                          ]}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-800 mb-3">
                  سوابق جابه‌جایی و تغییر اتاق
                </h2>
                {(detail.movements ?? []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
                    سابقه جابه‌جایی برای این دانشجو ثبت نشده است.
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl table-scroll">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
                          <tr>
                            <th className="py-3 px-4">نوع</th>
                            <th className="py-3 px-4">مبدأ</th>
                            <th className="py-3 px-4">مقصد</th>
                            <th className="py-3 px-4">علت</th>
                            <th className="py-3 px-4">ثبت‌کننده</th>
                            <th className="py-3 px-4">تاریخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.movements.map((m) => (
                            <tr key={m.id}>
                              <td className="py-3 px-4">
                                <StatusBadge
                                  label={
                                    m.movementType === 'internal'
                                      ? 'جابه‌جایی داخلی'
                                      : m.movementType === 'transfer'
                                      ? 'انتقال بین خوابگاهی'
                                      : 'ثبت اولیه'
                                  }
                                />
                              </td>
                              <td className="py-3 px-4">
                                {m.fromDormName
                                  ? `${m.fromDormName} · اتاق ${toPersianDigits(m.fromRoomNumber ?? '')}`
                                  : 'پذیرش اولیه'}
                              </td>
                              <td className="py-3 px-4 font-semibold text-blue-700">
                                {m.toDormName} · اتاق {toPersianDigits(m.toRoomNumber)}
                              </td>
                              <td className="py-3 px-4 text-slate-600 max-w-[180px] truncate">
                                {m.reason || '—'}
                              </td>
                              <td className="py-3 px-4">{m.performedByName}</td>
                              <td className="py-3 px-4 tabular-nums">
                                {formatShamsiDate(m.movedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sm:hidden space-y-3">
                      {detail.movements.map((m) => (
                        <MobileRecordCard
                          key={m.id}
                          accent={m.movementType === 'transfer' ? 'amber' : 'blue'}
                          title={
                            m.movementType === 'internal'
                              ? 'جابه‌جایی داخلی'
                              : m.movementType === 'transfer'
                              ? 'انتقال بین خوابگاهی'
                              : 'ثبت اولیه'
                          }
                          subtitle={`${m.toDormName} · اتاق ${toPersianDigits(m.toRoomNumber)}`}
                          rows={[
                            { label: 'تاریخ', value: formatShamsiDate(m.movedAt) },
                            { label: 'ثبت‌کننده', value: m.performedByName },
                          ]}
                          footer={
                            <div className="text-[11px] text-slate-600 leading-5">
                              <span className="text-slate-500">علت: </span>
                              {m.reason || '—'}
                            </div>
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
