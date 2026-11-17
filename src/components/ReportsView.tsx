import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileDown, FilterX, Printer } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type AuthUser,
  type DegreeLevel,
  type Dormitory,
  type EntryTerm,
  type ExitRecord,
  type MovementRecord,
  type RoomRecord,
  type StudentRecord,
  type StudentStatus,
  type SystemSettings,
  type TransferRequestRecord,
  type TransferStatus,
  DEGREE_LEVELS,
  INACTIVE_STUDENT_STATUSES,
  MAJOR_OPTIONS,
  SEMESTER_OPTIONS,
  STUDENT_STATUSES,
  filterByDateRange,
  formatShamsiDate,
  formatShamsiHeaderDate,
  getEntryTerms,
  sortEntryTerms,
  toPersianDigits,
} from '../shared/dormRules';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import nusLogo from '../assets/images/nus_logo.png';
import { EmptyState, ErrorBanner, TableSkeleton } from './ui/StateViews';

type ReportType =
  | 'all_students'
  | 'dorm_students'
  | 'inactive_students'
  | 'room_capacities'
  | 'dorm_capacities'
  | 'movements'
  | 'transfers'
  | 'exits'
  | 'analytical';

interface ReportsViewProps {
  user: AuthUser;
  dorms: Dormitory[];
  settings: SystemSettings;
  onNavigateDashboard: () => void;
}

const TRANSFER_STATUSES: TransferStatus[] = [
  'در انتظار تأیید',
  'تأییدشده',
  'ردشده',
  'لغوشده',
];

export function ReportsView({
  user,
  dorms,
  settings,
  onNavigateDashboard,
}: ReportsViewProps) {
  const [reportType, setReportType] = useState<ReportType>(
    user.role === 'admin' ? 'all_students' : 'dorm_students'
  );

  // Contextual filter states
  const [dormFilter, setDormFilter] = useState<number>(
    user.role === 'supervisor' ? (user.dormId ?? 0) : 0
  );
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [majorFilter, setMajorFilter] = useState<string>('');
  const [degreeFilter, setDegreeFilter] = useState<DegreeLevel | ''>('');
  const [entryTermFilter, setEntryTermFilter] = useState<EntryTerm | ''>('');
  const [semesterFilter, setSemesterFilter] = useState<string>('');
  const [roomIdFilter, setRoomIdFilter] = useState<number>(0);
  const [roomStatusFilter, setRoomStatusFilter] = useState<'' | 'available' | 'full' | 'empty'>('');
  const [transferStatusFilter, setTransferStatusFilter] = useState<TransferStatus | ''>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Fetched datasets
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferRequestRecord[]>([]);
  const [exits, setExits] = useState<ExitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiRequest<{ students: StudentRecord[] }>('/api/students'),
      apiRequest<{ rooms: RoomRecord[] }>('/api/rooms'),
      apiRequest<{ movements: MovementRecord[] }>('/api/movements'),
      apiRequest<{ transfers: TransferRequestRecord[] }>('/api/transfers'),
      apiRequest<{ exits: ExitRecord[] }>('/api/reports/exits'),
    ])
      .then(([sRes, rRes, mRes, tRes, eRes]) => {
        setStudents(sRes.students);
        setRooms(rRes.rooms);
        setMovements(mRes.movements);
        setTransfers(tRes.transfers);
        setExits(eRes.exits);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'خطا در دریافت داده‌های گزارش.')
      )
      .finally(() => setLoading(false));
  }, []);

  const reportOptions: Array<{ id: ReportType; label: string; adminOnly?: boolean }> = [
    { id: 'all_students', label: '۱. گزارش کلی دانشجویان', adminOnly: true },
    { id: 'dorm_students', label: '۲. گزارش دانشجویان هر خوابگاه' },
    { id: 'inactive_students', label: '۳. گزارش دانشجویان غیرفعال' },
    { id: 'room_capacities', label: '۴. گزارش ظرفیت اتاق‌ها' },
    { id: 'dorm_capacities', label: '۵. گزارش وضعیت اشغال خوابگاه‌ها' },
    { id: 'movements', label: '۶. گزارش جابه‌جایی‌های داخلی' },
    { id: 'transfers', label: '۷. گزارش انتقال‌های بین خوابگاه‌ها' },
    { id: 'exits', label: '۸. گزارش خروج دانشجویان' },
    { id: 'analytical', label: '۹. گزارش بر اساس رشته، مقطع و ورودی' },
  ];

  const visibleOptions = reportOptions.filter(
    (o) => !o.adminOnly || user.role === 'admin'
  );

  // Reset irrelevant filters cleanly when switching report type
  const handleChangeReportType = (next: ReportType) => {
    setReportType(next);
    setStatusFilter('');
    setMajorFilter('');
    setDegreeFilter('');
    setEntryTermFilter('');
    setSemesterFilter('');
    setRoomIdFilter(0);
    setRoomStatusFilter('');
    setTransferStatusFilter('');
    setFromDate('');
    setToDate('');
    if (user.role === 'supervisor') {
      setDormFilter(user.dormId ?? 0);
    } else if (next === 'dorm_students') {
      setDormFilter(dorms[0]?.id ?? 1);
    } else {
      setDormFilter(0);
    }
  };

  const resetFilters = () => {
    setStatusFilter('');
    setMajorFilter('');
    setDegreeFilter('');
    setEntryTermFilter('');
    setSemesterFilter('');
    setRoomIdFilter(0);
    setRoomStatusFilter('');
    setTransferStatusFilter('');
    setFromDate('');
    setToDate('');
    if (user.role === 'supervisor') {
      setDormFilter(user.dormId ?? 0);
    } else if (reportType === 'dorm_students') {
      setDormFilter(dorms[0]?.id ?? 1);
    } else {
      setDormFilter(0);
    }
  };

  const effectiveDormId =
    user.role === 'supervisor'
      ? user.dormId ?? 0
      : reportType === 'dorm_students'
      ? dormFilter || dorms[0]?.id || 0
      : dormFilter;

  const majorOptions = MAJOR_OPTIONS;

  const entryTermOptions = useMemo(() => {
    const values = new Set<string>(getEntryTerms());
    students.forEach((s) => {
      if (s.entryTerm) values.add(s.entryTerm);
    });
    return sortEntryTerms(values);
  }, [students]);

  const semesterOptions = SEMESTER_OPTIONS;

  const roomsForFilter = useMemo(() => {
    return rooms.filter((r) => (effectiveDormId ? r.dormId === effectiveDormId : true));
  }, [rooms, effectiveDormId]);

  // Filtered datasets per report type
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (reportType === 'inactive_students') {
        if (s.status === 'ساکن') return false;
        if (statusFilter && s.status !== statusFilter) return false;
      } else {
        if (statusFilter && s.status !== statusFilter) return false;
        if (!statusFilter && reportType === 'dorm_students' && s.status !== 'ساکن') {
          return false;
        }
      }
      if (effectiveDormId && s.currentDormId !== effectiveDormId) {
        // For inactive students with no current dorm, allow only when no dorm filter is active
        return false;
      }
      if (roomIdFilter && s.currentRoomId !== roomIdFilter) return false;
      if (majorFilter && s.major !== majorFilter) return false;
      if (degreeFilter && s.degree !== degreeFilter) return false;
      if (entryTermFilter && s.entryTerm !== entryTermFilter) return false;
      if (semesterFilter && s.semester !== Number(semesterFilter)) return false;
      return true;
    });
  }, [
    students,
    reportType,
    statusFilter,
    effectiveDormId,
    roomIdFilter,
    majorFilter,
    degreeFilter,
    entryTermFilter,
    semesterFilter,
  ]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (effectiveDormId && r.dormId !== effectiveDormId) return false;
      if (roomStatusFilter && r.status !== roomStatusFilter) return false;
      return true;
    });
  }, [rooms, effectiveDormId, roomStatusFilter]);

  const filteredDorms = useMemo(() => {
    if (user.role === 'supervisor' && user.dormId) {
      return dorms.filter((d) => d.id === user.dormId);
    }
    return dorms;
  }, [dorms, user.role, user.dormId]);

  const filteredMovements = useMemo(() => {
    const internalOnly = movements.filter((m) => m.movementType === 'internal');
    const byDorm = effectiveDormId
      ? internalOnly.filter(
          (m) => m.fromDormId === effectiveDormId || m.toDormId === effectiveDormId
        )
      : internalOnly;
    return filterByDateRange(byDorm, (m) => m.movedAt, fromDate, toDate);
  }, [movements, effectiveDormId, fromDate, toDate]);

  const filteredTransfers = useMemo(() => {
    const byDorm = effectiveDormId
      ? transfers.filter(
          (t) => t.fromDormId === effectiveDormId || t.toDormId === effectiveDormId
        )
      : transfers;
    const byStatus = transferStatusFilter
      ? byDorm.filter((t) => t.status === transferStatusFilter)
      : byDorm;
    return filterByDateRange(byStatus, (t) => t.requestedAt, fromDate, toDate);
  }, [transfers, effectiveDormId, transferStatusFilter, fromDate, toDate]);

  const filteredExits = useMemo(() => {
    const byDorm = effectiveDormId
      ? exits.filter((e) => e.dormId === effectiveDormId)
      : exits;
    return filterByDateRange(byDorm, (e) => e.endDate, fromDate, toDate);
  }, [exits, effectiveDormId, fromDate, toDate]);

  const analyticalRows = useMemo(() => {
    const map = new Map<
      string,
      { major: string; degree: string; entryTerm: string; count: number }
    >();
    const pool = students.filter((s) => {
      if (s.status !== 'ساکن') return false;
      if (effectiveDormId && s.currentDormId !== effectiveDormId) return false;
      if (degreeFilter && s.degree !== degreeFilter) return false;
      if (entryTermFilter && s.entryTerm !== entryTermFilter) return false;
      return true;
    });
    for (const s of pool) {
      const key = `${s.major}|${s.degree}|${s.entryTerm}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          major: s.major,
          degree: s.degree ?? '',
          entryTerm: s.entryTerm ?? '',
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [students, effectiveDormId, degreeFilter, entryTermFilter]);

  const activeDormObj = dorms.find((d) => d.id === effectiveDormId);

  const reportHeaderDormName =
    effectiveDormId && activeDormObj
      ? `${activeDormObj.name} (${activeDormObj.subtitle})`
      : user.role === 'admin'
      ? 'کل خوابگاه‌های دانشگاه'
      : user.dormName ?? '';

  // Applied filter summary chips for the printable sheet
  const appliedFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (effectiveDormId && activeDormObj) {
      parts.push(`خوابگاه: ${activeDormObj.name}`);
    } else if (user.role === 'admin') {
      parts.push('خوابگاه: همه خوابگاه‌ها');
    }
    if (isStudentReport(reportType)) {
      if (statusFilter) parts.push(`وضعیت: ${statusFilter}`);
      else if (reportType === 'dorm_students') parts.push('وضعیت: ساکن');
      if (roomIdFilter) {
        const rm = rooms.find((r) => r.id === roomIdFilter);
        if (rm) parts.push(`اتاق: ${toPersianDigits(rm.roomNumber)}`);
      }
      if (majorFilter) parts.push(`رشته: ${majorFilter}`);
      if (degreeFilter) parts.push(`مقطع: ${degreeFilter}`);
      if (entryTermFilter) parts.push(`ورودی: ${entryTermFilter}`);
      if (semesterFilter) parts.push(`ترم: ${toPersianDigits(semesterFilter)}`);
    }
    if (reportType === 'room_capacities' && roomStatusFilter) {
      const label =
        roomStatusFilter === 'full'
          ? 'تکمیل ظرفیت'
          : roomStatusFilter === 'empty'
          ? 'خالی'
          : 'دارای ظرفیت';
      parts.push(`وضعیت اتاق: ${label}`);
    }
    if (reportType === 'transfers' && transferStatusFilter) {
      parts.push(`وضعیت درخواست: ${transferStatusFilter}`);
    }
    if (reportType === 'analytical') {
      if (degreeFilter) parts.push(`مقطع: ${degreeFilter}`);
      if (entryTermFilter) parts.push(`ورودی: ${entryTermFilter}`);
    }
    if (isTimeReport(reportType)) {
      if (fromDate) parts.push(`از تاریخ: ${formatShamsiDate(fromDate, false)}`);
      if (toDate) parts.push(`تا تاریخ: ${formatShamsiDate(toDate, false)}`);
    }
    return parts;
  }, [
    effectiveDormId,
    activeDormObj,
    user.role,
    reportType,
    statusFilter,
    roomIdFilter,
    rooms,
    majorFilter,
    degreeFilter,
    entryTermFilter,
    semesterFilter,
    roomStatusFilter,
    transferStatusFilter,
    fromDate,
    toDate,
  ]);

  const currentRecordCount = useMemo(() => {
    switch (reportType) {
      case 'all_students':
      case 'dorm_students':
      case 'inactive_students':
        return filteredStudents.length;
      case 'room_capacities':
        return filteredRooms.length;
      case 'dorm_capacities':
        return filteredDorms.length;
      case 'movements':
        return filteredMovements.length;
      case 'transfers':
        return filteredTransfers.length;
      case 'exits':
        return filteredExits.length;
      case 'analytical':
        return analyticalRows.length;
    }
  }, [
    reportType,
    filteredStudents.length,
    filteredRooms.length,
    filteredDorms.length,
    filteredMovements.length,
    filteredTransfers.length,
    filteredExits.length,
    analyticalRows.length,
  ]);

  const { dateLine, timeLine } = formatShamsiHeaderDate();

  const handlePrintPdf = () => {
    window.print();
  };

  const hasCustomFilters = Boolean(
    statusFilter ||
      majorFilter ||
      degreeFilter ||
      entryTermFilter ||
      semesterFilter ||
      roomIdFilter ||
      roomStatusFilter ||
      transferStatusFilter ||
      fromDate ||
      toDate ||
      (user.role === 'admin' && reportType !== 'dorm_students' && dormFilter !== 0)
  );

  return (
    <div className="space-y-5">
      {/* Screen-only Header & Controls */}
      <div className="no-print space-y-4">
        <PageHeader
          title="گزارش‌های مدیریتی و خروجی PDF فارسی"
          subtitle="انتخاب گزارش استاندارد، اعمال فیلترهای تخصصی و دریافت خروجی چاپی / PDF راست‌چین با تاریخ شمسی"
          breadcrumbLabel="گزارش‌ها و خروجی PDF فارسی"
          icon={<BarChart3 className="w-5 h-5" />}
          onNavigateDashboard={onNavigateDashboard}
          actions={
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold shadow-sm whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              <span>چاپ / ذخیره PDF</span>
            </button>
          }
        />

        <ErrorBanner message={error} onClose={() => setError('')} />

        {/* Contextual Filters Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">تنظیمات و فیلترهای گزارش</span>
            {hasCustomFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>پاک کردن فیلترها</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Report selector (always visible) */}
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="rep-type" className="block text-xs font-semibold text-slate-700 mb-1">
                نوع گزارش
              </label>
              <select
                id="rep-type"
                value={reportType}
                onChange={(e) => handleChangeReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {visibleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dorm filter for Admin on applicable reports */}
            {user.role === 'admin' && reportType !== 'dorm_capacities' && (
              <div>
                <label htmlFor="rep-dorm" className="block text-xs font-semibold text-slate-700 mb-1">
                  خوابگاه
                </label>
                <select
                  id="rep-dorm"
                  value={effectiveDormId}
                  onChange={(e) => {
                    setDormFilter(Number(e.target.value));
                    setRoomIdFilter(0);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {reportType !== 'dorm_students' && <option value={0}>همه خوابگاه‌ها</option>}
                  {dorms.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.subtitle})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Contextual filters for Student Reports */}
            {isStudentReport(reportType) && (
              <>
                <div>
                  <label htmlFor="rep-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    وضعیت دانشجو
                  </label>
                  <select
                    id="rep-status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StudentStatus | '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {reportType === 'inactive_students' ? (
                      <>
                        <option value="">همه وضعیت‌های غیرفعال</option>
                        {INACTIVE_STUDENT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </>
                    ) : (
                      <>
                        <option value="">
                          {reportType === 'dorm_students' ? 'ساکنین فعلی' : 'همه وضعیت‌ها'}
                        </option>
                        {STUDENT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {reportType !== 'inactive_students' && (
                  <div>
                    <label htmlFor="rep-room" className="block text-xs font-semibold text-slate-700 mb-1">
                      اتاق
                    </label>
                    <select
                      id="rep-room"
                      value={roomIdFilter}
                      onChange={(e) => setRoomIdFilter(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value={0}>همه اتاق‌ها</option>
                      {roomsForFilter.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.dormName} — اتاق {toPersianDigits(r.roomNumber)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="rep-major" className="block text-xs font-semibold text-slate-700 mb-1">
                    رشته تحصیلی
                  </label>
                  <select
                    id="rep-major"
                    value={majorFilter}
                    onChange={(e) => setMajorFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">همه رشته‌ها</option>
                    {majorOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rep-degree" className="block text-xs font-semibold text-slate-700 mb-1">
                    مقطع
                  </label>
                  <select
                    id="rep-degree"
                    value={degreeFilter}
                    onChange={(e) => setDegreeFilter(e.target.value as DegreeLevel | '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">همه مقاطع</option>
                    {DEGREE_LEVELS.map((deg) => (
                      <option key={deg} value={deg}>
                        {deg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rep-entry" className="block text-xs font-semibold text-slate-700 mb-1">
                    ورودی
                  </label>
                  <select
                    id="rep-entry"
                    value={entryTermFilter}
                    onChange={(e) => setEntryTermFilter(e.target.value as EntryTerm | '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">مهر و بهمن</option>
                    {entryTermOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rep-semester" className="block text-xs font-semibold text-slate-700 mb-1">
                    ترم تحصیلی
                  </label>
                  <select
                    id="rep-semester"
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">همه ترم‌ها</option>
                    {semesterOptions.map((sem) => (
                      <option key={sem} value={String(sem)}>
                        ترم {toPersianDigits(sem)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Contextual filter for Room Capacities */}
            {reportType === 'room_capacities' && (
              <div>
                <label htmlFor="rep-room-status" className="block text-xs font-semibold text-slate-700 mb-1">
                  وضعیت ظرفیت اتاق
                </label>
                <select
                  id="rep-room-status"
                  value={roomStatusFilter}
                  onChange={(e) =>
                    setRoomStatusFilter(e.target.value as '' | 'available' | 'full' | 'empty')
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">همه اتاق‌ها</option>
                  <option value="available">دارای ظرفیت خالی</option>
                  <option value="full">تکمیل ظرفیت</option>
                  <option value="empty">خالی</option>
                </select>
              </div>
            )}

            {/* Contextual filters for Analytical Report */}
            {reportType === 'analytical' && (
              <>
                <div>
                  <label htmlFor="rep-ana-deg" className="block text-xs font-semibold text-slate-700 mb-1">
                    مقطع
                  </label>
                  <select
                    id="rep-ana-deg"
                    value={degreeFilter}
                    onChange={(e) => setDegreeFilter(e.target.value as DegreeLevel | '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">همه مقاطع</option>
                    {DEGREE_LEVELS.map((deg) => (
                      <option key={deg} value={deg}>
                        {deg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rep-ana-ent" className="block text-xs font-semibold text-slate-700 mb-1">
                    ورودی
                  </label>
                  <select
                    id="rep-ana-ent"
                    value={entryTermFilter}
                    onChange={(e) => setEntryTermFilter(e.target.value as EntryTerm | '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">مهر و بهمن</option>
                    {entryTermOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Contextual filters for Time-Based Reports */}
            {isTimeReport(reportType) && (
              <>
                {reportType === 'transfers' && (
                  <div>
                    <label htmlFor="rep-tr-status" className="block text-xs font-semibold text-slate-700 mb-1">
                      وضعیت انتقال
                    </label>
                    <select
                      id="rep-tr-status"
                      value={transferStatusFilter}
                      onChange={(e) =>
                        setTransferStatusFilter(e.target.value as TransferStatus | '')
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value="">همه وضعیت‌ها</option>
                      {TRANSFER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="rep-from-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    از تاریخ (میلادی / ISO)
                  </label>
                  <input
                    id="rep-from-date"
                    type="date"
                    dir="ltr"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="rep-to-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    تا تاریخ (میلادی / ISO)
                  </label>
                  <input
                    id="rep-to-date"
                    type="date"
                    dir="ltr"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Printable A4 Sheet Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-8 print-container">
        {/* Official Report Header */}
        <div className="border-b-2 border-slate-800 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={nusLogo}
              alt="نشان دانشگاه ملی مهارت"
              className="h-12 w-auto shrink-0 object-contain"
            />
            <div>
              <div className="text-xs font-bold text-slate-500">{settings.universityName}</div>
              <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                {settings.systemTitle} —{' '}
                {visibleOptions
                  .find((o) => o.id === reportType)
                  ?.label.replace(/^[۰-۹0-9]+\.\s*/, '')}
              </h2>
              <div className="text-xs font-semibold text-blue-700 mt-1">
                محدوده گزارش: {reportHeaderDormName} · سال تحصیلی {settings.academicYear} (
                {settings.currentSemesterTitle})
              </div>
            </div>
          </div>
          <div className="text-left text-xs text-slate-600 tabular-nums space-y-1">
            <div>تاریخ تولید گزارش: {dateLine}</div>
            <div>ساعت: {timeLine}</div>
            <div className="font-bold text-slate-800">
              تعداد کل رکوردها: {toPersianDigits(currentRecordCount)} مورد
            </div>
            <div className="no-print inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Printer className="w-3.5 h-3.5" />
              <span>آماده چاپ A4 فارسی</span>
            </div>
          </div>
        </div>

        {/* Applied Filters Summary Strip */}
        <div className="mb-5 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold text-slate-800">خلاصه فیلترهای اعمال‌شده:</span>
          {appliedFilterSummary.map((part, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span>•</span>
              <span>{part}</span>
            </span>
          ))}
        </div>

        <p className="md:hidden mb-3 text-[11px] text-slate-500 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
          برای مشاهده کامل ستون‌های گزارش، جدول را به‌صورت افقی بکشید. خروجی PDF تمام ستون‌ها را در یک صفحه A4 نمایش می‌دهد.
        </p>

        {loading ? (
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-right text-xs border border-slate-200">
              <tbody>
                <TableSkeleton rows={6} cols={6} />
              </tbody>
            </table>
          </div>
        ) : currentRecordCount === 0 ? (
          <EmptyState
            title="رکوردی مطابق با فیلترهای انتخاب‌شده یافت نشد"
            description="برای مشاهده نتایج، فیلترهای اعمال‌شده را تغییر دهید یا پاک کنید."
          />
        ) : (
          <div className="overflow-x-auto table-scroll">
            {isStudentReport(reportType) && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">شماره دانشجویی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">کد ملی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">نام و نام خانوادگی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">خوابگاه / اتاق</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">نوع ظرفیت</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">مقطع و رشته</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ورودی / ترم</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">وضعیت</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">شهر</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">شماره همراه</th>
                    <th className="py-2.5 px-3">شماره ولی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents.map((s, idx) => (
                    <tr key={s.id}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        <span className="num font-bold">{toPersianDigits(s.studentNumber)}</span>
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        <span className="num">{s.nationalCode ? toPersianDigits(s.nationalCode) : '—'}</span>
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {s.currentDormName
                          ? `${s.currentDormName} — اتاق ${toPersianDigits(s.currentRoomNumber ?? '')}`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {s.isExtraCapacity ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10.5px]">
                            ظرفیت مازاد
                          </span>
                        ) : (
                          'عادی'
                        )}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {s.degree} {s.major}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {s.entryTerm ?? '—'} / ترم {toPersianDigits(s.semester ?? '—')}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        <StatusBadge label={s.status} />
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">{s.city}</td>
                      <td className="py-2 px-3">
                        <span className="num">{toPersianDigits(s.mobile)}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="num">
                          {s.guardianPhone ? toPersianDigits(s.guardianPhone) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'room_capacities' && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">خوابگاه</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">شماره اتاق</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">طبقه</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت کل</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ساکنین فعلی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت خالی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت مازاد (پر/کل)</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">درصد اشغال</th>
                    <th className="py-2.5 px-3">وضعیت اتاق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRooms.map((r, idx) => (
                    <tr key={r.id}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">{r.dormName}</td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold tabular-nums">
                        {toPersianDigits(r.roomNumber)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">{r.floor}</td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(r.capacity)} نفر
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(r.occupied)} نفر
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums font-bold">
                        {toPersianDigits(r.remaining)} نفر
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(r.extraOccupied)} / {toPersianDigits(r.extraCapacity)} نفر
                        <span className="block text-[10px] text-emerald-700">
                          {toPersianDigits(r.extraRemaining)} جای خالی مازاد
                        </span>
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(r.occupancyPercent)}٪
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge
                          label={
                            r.status === 'full'
                              ? 'تکمیل ظرفیت'
                              : r.status === 'empty'
                              ? 'خالی'
                              : 'دارای ظرفیت'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'dorm_capacities' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500">تعداد کل اتاق‌های فعال</div>
                    <div className="text-lg font-extrabold text-slate-900 mt-1 tabular-nums">
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.activeRooms, 0)
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500">ظرفیت کل</div>
                    <div className="text-lg font-extrabold text-slate-900 mt-1 tabular-nums">
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.totalCapacity, 0)
                      )}{' '}
                      نفر
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-[11px] text-blue-700">تعداد ساکنین فعلی</div>
                    <div className="text-lg font-extrabold text-blue-900 mt-1 tabular-nums">
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.occupiedCount, 0)
                      )}{' '}
                      نفر
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[11px] text-emerald-700">ظرفیت خالی کل</div>
                    <div className="text-lg font-extrabold text-emerald-900 mt-1 tabular-nums">
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.remainingCapacity, 0)
                      )}{' '}
                      نفر
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-[11px] text-amber-700">ظرفیت مازاد (پر/کل)</div>
                    <div className="text-lg font-extrabold text-amber-900 mt-1 tabular-nums">
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.extraOccupied, 0)
                      )}{' '}
                      /{' '}
                      {toPersianDigits(
                        filteredDorms.reduce((acc, d) => acc + d.extraCapacity, 0)
                      )}{' '}
                      نفر
                    </div>
                  </div>
                </div>

                <table className="w-full text-right text-xs border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 border-l border-slate-200">نام خوابگاه</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">عنوان</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">سرپرست</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">اتاق فعال</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت کل</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">ساکنین</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت خالی</th>
                      <th className="py-2.5 px-3 border-l border-slate-200">ظرفیت مازاد (پر/کل)</th>
                      <th className="py-2.5 px-3">درصد اشغال</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredDorms.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2.5 px-3 border-l border-slate-200 font-bold">{d.name}</td>
                        <td className="py-2.5 px-3 border-l border-slate-200">{d.subtitle}</td>
                        <td className="py-2.5 px-3 border-l border-slate-200">
                          {d.supervisorName ?? 'تعیین‌نشده'}
                        </td>
                        <td className="py-2.5 px-3 border-l border-slate-200 tabular-nums">
                          {toPersianDigits(d.activeRooms)}
                        </td>
                        <td className="py-2.5 px-3 border-l border-slate-200 tabular-nums">
                          {toPersianDigits(d.totalCapacity)} نفر
                        </td>
                        <td className="py-2.5 px-3 border-l border-slate-200 tabular-nums">
                          {toPersianDigits(d.occupiedCount)} نفر
                        </td>
                        <td className="py-2.5 px-3 border-l border-slate-200 tabular-nums">
                          {toPersianDigits(d.remainingCapacity)} نفر
                        </td>
                        <td className="py-2.5 px-3 border-l border-slate-200 tabular-nums">
                          {toPersianDigits(d.extraOccupied)} / {toPersianDigits(d.extraCapacity)} نفر
                        </td>
                        <td className="py-2.5 px-3 tabular-nums font-bold">
                          {toPersianDigits(d.occupancyPercent)}٪
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'movements' && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">دانشجو</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">مبدأ</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">مقصد</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">علت جابه‌جایی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ثبت‌کننده</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMovements.map((m, idx) => (
                    <tr key={m.id}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold">
                        {m.studentName} ({toPersianDigits(m.studentNumber)})
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {m.fromDormName
                          ? `${m.fromDormName} · اتاق ${toPersianDigits(m.fromRoomNumber ?? '')}`
                          : 'ثبت اولیه'}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {m.toDormName} · اتاق {toPersianDigits(m.toRoomNumber)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">{m.reason || '—'}</td>
                      <td className="py-2 px-3 border-l border-slate-200">{m.performedByName}</td>
                      <td className="py-2 px-3 tabular-nums">{formatShamsiDate(m.movedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'transfers' && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">دانشجو</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">از خوابگاه</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">به خوابگاه</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">وضعیت</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">تأیید/ردکننده</th>
                    <th className="py-2.5 px-3">تاریخ درخواست</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransfers.map((t, idx) => (
                    <tr key={t.id}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold">
                        {t.studentName} ({toPersianDigits(t.studentNumber)})
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {t.fromDormName} · اتاق {toPersianDigits(t.fromRoomNumber)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {t.toDormName} · اتاق {toPersianDigits(t.toRoomNumber ?? '—')}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        <StatusBadge label={t.status} />
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {t.reviewedByName ?? '—'}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{formatShamsiDate(t.requestedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'exits' && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">شماره دانشجویی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">نام و نام خانوادگی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">خوابگاه / اتاق</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">وضعیت خروج</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">تاریخ ورود</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">تاریخ خروج</th>
                    <th className="py-2.5 px-3">علت خروج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredExits.map((ex, idx) => (
                    <tr key={ex.residenceId}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 num font-semibold">
                        {toPersianDigits(ex.studentNumber)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold">
                        {ex.studentName}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        {ex.dormName} — اتاق {toPersianDigits(ex.roomNumber)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200">
                        <StatusBadge label={ex.status} />
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {formatShamsiDate(ex.startDate, false)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {formatShamsiDate(ex.endDate, false)}
                      </td>
                      <td className="py-2 px-3">{ex.exitReason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'analytical' && (
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 border-l border-slate-200">ردیف</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">رشته تحصیلی</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">مقطع</th>
                    <th className="py-2.5 px-3 border-l border-slate-200">ورودی</th>
                    <th className="py-2.5 px-3">تعداد دانشجویان ساکن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analyticalRows.map((row, idx) => (
                    <tr key={`${row.major}-${row.degree}-${row.entryTerm}`}>
                      <td className="py-2 px-3 border-l border-slate-200 tabular-nums">
                        {toPersianDigits(idx + 1)}
                      </td>
                      <td className="py-2 px-3 border-l border-slate-200 font-bold">{row.major}</td>
                      <td className="py-2 px-3 border-l border-slate-200">{row.degree}</td>
                      <td className="py-2 px-3 border-l border-slate-200">{row.entryTerm}</td>
                      <td className="py-2 px-3 tabular-nums font-bold">
                        {toPersianDigits(row.count)} نفر
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Printable Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 tabular-nums">
          <span>
            تنظیم‌کننده: {user.fullName} ({user.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'})
          </span>
          <span>
            تعداد ردیف‌ها: {toPersianDigits(currentRecordCount)} · تاریخ چاپ: {dateLine}
          </span>
        </div>
      </div>
    </div>
  );
}

function isStudentReport(type: ReportType): boolean {
  return (
    type === 'all_students' ||
    type === 'dorm_students' ||
    type === 'inactive_students'
  );
}

function isTimeReport(type: ReportType): boolean {
  return type === 'movements' || type === 'transfers' || type === 'exits';
}
