import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, FilterX, Search, SlidersHorizontal } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  DEGREE_LEVELS,
  SEMESTER_OPTIONS,
  type AuthUser,
  type MovementRecord,
  type RoomRecord,
  type StudentRecord,
  formatShamsiDate,
  getEntryTerms,
  sortEntryTerms,
  toPersianDigits,
} from '../shared/dormRules';
import { matchesKeywords } from '../shared/search';
import { useLiveRefresh } from '../lib/live';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { PaginationBar } from './ui/PaginationBar';
import { MobileCardList, MobileCardSkeleton, MobileRecordCard } from './ui/MobileCard';
import {
  EmptyState,
  ErrorBanner,
  SuccessBanner,
  TableSkeleton,
} from './ui/StateViews';

interface MovementsViewProps {
  user: AuthUser;
  onNavigateDashboard: () => void;
  onDataChanged: () => void;
}

const PAGE_SIZE = 12;

export function MovementsView({
  user,
  onNavigateDashboard,
  onDataChanged,
}: MovementsViewProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState<number>(0);
  const [toRoomId, setToRoomId] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [moveExtraCapacity, setMoveExtraCapacity] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');
  const [page, setPage] = useState(1);

  // جست‌وجوی پیشرفتهٔ انتخاب دانشجو
  const [studentQuery, setStudentQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sfDorm, setSfDorm] = useState('');
  const [sfRoom, setSfRoom] = useState('');
  const [sfCity, setSfCity] = useState('');
  const [sfMajor, setSfMajor] = useState('');
  const [sfDegree, setSfDegree] = useState('');
  const [sfEntry, setSfEntry] = useState('');
  const [sfSemester, setSfSemester] = useState('');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [sRes, rRes, mRes] = await Promise.all([
        apiRequest<{ students: StudentRecord[] }>(
          '/api/students?status=' + encodeURIComponent('ساکن')
        ),
        apiRequest<{ rooms: RoomRecord[] }>('/api/rooms'),
        apiRequest<{ movements: MovementRecord[] }>('/api/movements'),
      ]);
      setStudents(sRes.students.filter((s) => s.status === 'ساکن' && s.currentRoomId));
      setRooms(rRes.rooms);
      setMovements(mRes.movements);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در بارگذاری اطلاعات جابه‌جایی.'
      );
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useLiveRefresh(() => loadData(true));

  const dormOptions = useMemo(() => {
    const map = new Map<number, string>();
    students.forEach((s) => {
      if (s.currentDormId && s.currentDormName) map.set(s.currentDormId, s.currentDormName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [students]);

  const entryTermOptions = useMemo(() => {
    const values = new Set<string>(getEntryTerms());
    students.forEach((s) => {
      if (s.entryTerm) values.add(s.entryTerm);
    });
    return sortEntryTerms(values);
  }, [students]);

  const roomOptions = useMemo(() => {
    const ids = new Set<number>();
    return students
      .filter((s) => !sfDorm || String(s.currentDormId) === sfDorm)
      .filter((s) => {
        if (!s.currentRoomId || ids.has(s.currentRoomId)) return false;
        ids.add(s.currentRoomId);
        return true;
      })
      .map((s) => ({
        id: s.currentRoomId!,
        label: `${s.currentRoomNumber ?? ''} — ${s.currentDormName ?? ''}`,
      }));
  }, [students, sfDorm]);

  const activeStudentFilters =
    [sfDorm, sfRoom, sfCity, sfMajor, sfDegree, sfEntry, sfSemester].filter(Boolean).length +
    (studentQuery.trim() ? 1 : 0);

  const pickerStudents = useMemo(
    () =>
      students.filter((s) => {
        if (sfDorm && String(s.currentDormId) !== sfDorm) return false;
        if (sfRoom && String(s.currentRoomId) !== sfRoom) return false;
        if (sfCity && !(s.city ?? '').includes(sfCity.trim())) return false;
        if (sfMajor && !(s.major ?? '').includes(sfMajor.trim())) return false;
        if (sfDegree && s.degree !== sfDegree) return false;
        if (sfEntry && s.entryTerm !== sfEntry) return false;
        if (sfSemester && String(s.semester ?? '') !== sfSemester) return false;
        return matchesKeywords(
          [
            s.firstName,
            s.lastName,
            `${s.firstName} ${s.lastName}`,
            s.studentNumber,
            s.mobile,
            s.city,
            s.major,
            s.degree,
            s.entryTerm,
            s.semester,
            s.currentDormName,
            s.currentRoomNumber,
          ],
          studentQuery
        );
      }),
    [students, sfDorm, sfRoom, sfCity, sfMajor, sfDegree, sfEntry, sfSemester, studentQuery]
  );

  const clearStudentFilters = () => {
    setStudentQuery('');
    setSfDorm('');
    setSfRoom('');
    setSfCity('');
    setSfMajor('');
    setSfDegree('');
    setSfEntry('');
    setSfSemester('');
  };

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  const destinationRooms = useMemo(() => {
    if (!selectedStudent) return [];
    return rooms.filter(
      (r) =>
        r.dormId === selectedStudent.currentDormId &&
        r.id !== selectedStudent.currentRoomId &&
        r.isActive
    );
  }, [rooms, selectedStudent]);

  const selectedDestRoom = useMemo(
    () => destinationRooms.find((r) => r.id === toRoomId) ?? null,
    [destinationRooms, toRoomId]
  );

  const handlePreview = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!selectedStudent || !selectedDestRoom) {
      setError('انتخاب دانشجو و اتاق مقصد الزامی است.');
      return;
    }
    if (
      moveExtraCapacity
        ? selectedDestRoom.extraRemaining <= 0
        : selectedDestRoom.remaining <= 0
    ) {
      setError(
        moveExtraCapacity
          ? 'ظرفیت مازاد اتاق مقصد تکمیل شده است.'
          : 'ظرفیت اتاق مقصد تکمیل شده است.'
      );
      return;
    }
    if (reason.trim().length < 3) {
      setError('لطفاً علت جابه‌جایی را وارد کنید.');
      return;
    }
    setPreviewOpen(true);
  };

  const handleConfirmMove = async () => {
    if (!selectedStudent || !selectedDestRoom) return;
    setSubmitting(true);
    setError('');
    try {
      await apiRequest('/api/movements', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          toRoomId: selectedDestRoom.id,
          reason: reason.trim(),
          isExtraCapacity: moveExtraCapacity,
        }),
      });
      setPreviewOpen(false);
      setSelectedStudentId(0);
      setToRoomId(0);
      setReason('');
      setMoveExtraCapacity(false);
      setSuccessMsg(
        'جابه‌جایی دانشجو با موفقیت ثبت شد و ظرفیت اتاق‌ها به‌روزرسانی گردید.'
      );
      await loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ثبت جابه‌جایی.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMovements = useMemo(() => {
    if (!searchHistory.trim()) return movements;
    return movements.filter((m) =>
      matchesKeywords(
        [
          m.studentName,
          m.studentNumber,
          m.reason,
          m.fromDormName,
          m.fromRoomNumber,
          m.toDormName,
          m.toRoomNumber,
          m.performedByName,
        ],
        searchHistory
      )
    );
  }, [movements, searchHistory]);

  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / PAGE_SIZE));
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredMovements.slice(start, start + PAGE_SIZE);
  }, [filteredMovements, page]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="جابه‌جایی دانشجویان بین اتاق‌ها"
        subtitle="تغییر اتاق دانشجو در همان خوابگاه با بررسی خودکار ظرفیت و ثبت کامل در تاریخچه اقامت"
        breadcrumbLabel="جابه‌جایی دانشجویان"
        icon={<ArrowLeftRight className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
      />

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Movement Form */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-bold text-slate-800 mb-4">ثبت جابه‌جایی جدید</h2>
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="mv-student" className="block text-xs font-semibold text-slate-700 mb-1">
                انتخاب دانشجو *
              </label>

              {/* جست‌وجوی کلیدواژه‌ای + فیلترهای پیشرفته */}
              <div className="mb-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder="جست‌وجو با نام، شماره دانشجویی، موبایل، شهر، رشته..."
                      aria-label="جست‌وجوی کلیدواژه‌ای دانشجو"
                      className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    aria-expanded={advancedOpen}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap transition-colors ${
                      advancedOpen || activeStudentFilters > 1
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>جست‌وجوی پیشرفته</span>
                  </button>
                </div>

                {advancedOpen && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 animate-[labelIn_160ms_ease-out_both]">
                    <div className="col-span-2 sm:col-span-3 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">
                        فیلترهای پیشرفتهٔ دانشجو
                      </span>
                      <button
                        type="button"
                        onClick={clearStudentFilters}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline"
                      >
                        <FilterX className="w-3.5 h-3.5" />
                        پاک‌کردن فیلترها
                      </button>
                    </div>
                    <select
                      value={sfDorm}
                      onChange={(e) => {
                        setSfDorm(e.target.value);
                        setSfRoom('');
                      }}
                      aria-label="فیلتر خوابگاه"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">همه خوابگاه‌ها</option>
                      {dormOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sfRoom}
                      onChange={(e) => setSfRoom(e.target.value)}
                      aria-label="فیلتر اتاق"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">همه اتاق‌ها</option>
                      {roomOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          اتاق {toPersianDigits(r.label)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={sfCity}
                      onChange={(e) => setSfCity(e.target.value)}
                      placeholder="شهر"
                      aria-label="فیلتر شهر"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={sfMajor}
                      onChange={(e) => setSfMajor(e.target.value)}
                      placeholder="رشته"
                      aria-label="فیلتر رشته"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    />
                    <select
                      value={sfDegree}
                      onChange={(e) => setSfDegree(e.target.value)}
                      aria-label="فیلتر مقطع"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">همه مقاطع</option>
                      {DEGREE_LEVELS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sfEntry}
                      onChange={(e) => setSfEntry(e.target.value)}
                      aria-label="فیلتر ورودی"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">همه ورودی‌ها</option>
                      {entryTermOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sfSemester}
                      onChange={(e) => setSfSemester(e.target.value)}
                      aria-label="فیلتر ترم"
                      className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      <option value="">همه ترم‌ها</option>
                      {SEMESTER_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          ترم {toPersianDigits(n)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="text-[10.5px] text-slate-500">
                  {toPersianDigits(pickerStudents.length)} دانشجو مطابق جست‌وجو یافت شد.
                </div>
              </div>

              <select
                id="mv-student"
                required
                value={selectedStudentId || ''}
                onChange={(e) => {
                  setSelectedStudentId(Number(e.target.value));
                  setToRoomId(0);
                  setMoveExtraCapacity(false);
                  setPreviewOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="">-- انتخاب دانشجوی ساکن --</option>
                {selectedStudent && !pickerStudents.some((s) => s.id === selectedStudent.id) && (
                  <option value={selectedStudent.id}>
                    {selectedStudent.firstName} {selectedStudent.lastName} (
                    {toPersianDigits(selectedStudent.studentNumber)})
                  </option>
                )}
                {pickerStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({toPersianDigits(s.studentNumber)}) — اتاق{' '}
                    {toPersianDigits(s.currentRoomNumber ?? '')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="mv-dest-room" className="block text-xs font-semibold text-slate-700 mb-1">
                انتخاب اتاق مقصد (هم‌خوابگاه) *
              </label>
              <select
                id="mv-dest-room"
                required
                disabled={!selectedStudent}
                value={toRoomId || ''}
                onChange={(e) => {
                  setToRoomId(Number(e.target.value));
                  setPreviewOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">-- انتخاب اتاق مقصد --</option>
                {destinationRooms.map((r) => {
                  const free = moveExtraCapacity ? r.extraRemaining : r.remaining;
                  return (
                    <option key={r.id} value={r.id} disabled={free === 0}>
                      اتاق {toPersianDigits(r.roomNumber)} — ظرفیت خالی{' '}
                      {toPersianDigits(r.remaining)} نفر · ظرفیت مازاد خالی{' '}
                      {toPersianDigits(r.extraRemaining)} نفر
                      {free === 0 ? ' (تکمیل)' : ''}
                    </option>
                  );
                })}
              </select>
              <label className="mt-2 flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={moveExtraCapacity}
                  onChange={(e) => {
                    setMoveExtraCapacity(e.target.checked);
                    setToRoomId(0);
                    setPreviewOpen(false);
                  }}
                />
                <span>جابه‌جایی به ظرفیت مازاد اتاق مقصد (بدون تخت)</span>
              </label>
            </div>
          </div>

          {selectedStudent && (
            <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 text-xs text-slate-700 flex flex-wrap gap-6">
              <span>
                محل اقامت فعلی: <strong>{selectedStudent.currentDormName}</strong> — اتاق{' '}
                <strong className="text-blue-700">
                  {toPersianDigits(selectedStudent.currentRoomNumber ?? '')}
                </strong>
              </span>
              <span>
                رشته: <strong>{selectedStudent.major}</strong> ({selectedStudent.degree})
              </span>
              <span>
                نوع ظرفیت فعلی:{' '}
                <strong className={selectedStudent.isExtraCapacity ? 'text-amber-700' : 'text-emerald-700'}>
                  {selectedStudent.isExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت عادی'}
                </strong>
              </span>
            </div>
          )}

          <div>
            <label htmlFor="mv-reason" className="block text-xs font-semibold text-slate-700 mb-1">
              علت جابه‌جایی *
            </label>
            <input
              id="mv-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPreviewOpen(false);
              }}
              placeholder="مثال: درخواست دانشجو جهت هم‌اتاقی شدن با هم‌کلاسی‌ها"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          {!previewOpen ? (
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
              >
                پیش‌نمایش و بررسی جابه‌جایی
              </button>
            </div>
          ) : (
            selectedStudent &&
            selectedDestRoom && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                <div className="text-xs font-bold text-blue-900">
                  پیش‌نمایش جابه‌جایی پیش از تأیید نهایی:
                </div>
                <div className="text-xs text-slate-800 leading-relaxed">
                  دانشجو{' '}
                  <strong>
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </strong>{' '}
                  از اتاق{' '}
                  <strong>
                    {toPersianDigits(selectedStudent.currentRoomNumber ?? '')}
                  </strong>{' '}
                  به اتاق <strong>{toPersianDigits(selectedDestRoom.roomNumber)}</strong> در
                  خوابگاه <strong>{selectedStudent.currentDormName}</strong> منتقل می‌شود.
                  {moveExtraCapacity && (
                    <span className="font-bold text-amber-700"> (اسکان در ظرفیت مازاد)</span>
                  )}{' '}
                  (علت: {reason})
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmMove}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    تأیید و ثبت نهایی جابه‌جایی
                  </button>
                </div>
              </div>
            )
          )}
        </form>
      </div>

      {/* Movements History Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 bg-[#EEF4FF] border-b border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">سوابق جابه‌جایی و اسکان</h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchHistory}
              onChange={(e) => {
                setSearchHistory(e.target.value);
                setPage(1);
              }}
              placeholder="جست‌وجو در سوابق..."
              aria-label="جست‌وجو در سوابق جابه‌جایی"
              className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
            />
          </div>
        </div>
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="py-3 px-4">دانشجو</th>
                <th className="py-3 px-4">مبدأ</th>
                <th className="py-3 px-4">مقصد</th>
                <th className="py-3 px-4">نوع عملیات</th>
                <th className="py-3 px-4">علت</th>
                <th className="py-3 px-4">کاربر ثبت‌کننده</th>
                <th className="py-3 px-4">تاریخ و ساعت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="سابقه‌ای یافت نشد"
                      description="هنوز عملیات جابه‌جایی مطابق با جست‌وجو ثبت نشده است."
                    />
                  </td>
                </tr>
              ) : (
                paginatedMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {m.studentName}{' '}
                      <span className="num font-semibold text-slate-600">
                        ({toPersianDigits(m.studentNumber)})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {m.fromDormName
                        ? `${m.fromDormName} · اتاق ${toPersianDigits(
                            m.fromRoomNumber ?? ''
                          )}`
                        : 'پذیرش اولیه'}
                    </td>
                    <td className="py-3 px-4 text-blue-700 font-semibold whitespace-nowrap">
                      {m.toDormName} · اتاق {toPersianDigits(m.toRoomNumber)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge
                        label={
                          m.movementType === 'internal'
                            ? 'جابه‌جایی داخلی'
                            : m.movementType === 'transfer'
                            ? 'انتقال بین خوابگاهی'
                            : 'ثبت اولیه'
                        }
                        tone={
                          m.movementType === 'internal'
                            ? 'blue'
                            : m.movementType === 'transfer'
                            ? 'amber'
                            : 'emerald'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {m.reason || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {m.performedByName}
                    </td>
                    <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                      {formatShamsiDate(m.movedAt)}
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
            {paginatedMovements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 md:hidden">
                <EmptyState
                  title="سابقه‌ای یافت نشد"
                  description="هنوز عملیات جابه‌جایی مطابق با جست‌وجو ثبت نشده است."
                />
              </div>
            ) : (
              paginatedMovements.map((m) => (
                <MobileRecordCard
                  key={m.id}
                  accent={m.movementType === 'transfer' ? 'amber' : 'blue'}
                  title={m.studentName}
                  subtitle={
                    <span className="num">
                      {toPersianDigits(m.studentNumber)}
                    </span>
                  }
                  badge={
                    <StatusBadge
                      label={
                        m.movementType === 'internal'
                          ? 'جابه‌جایی داخلی'
                          : m.movementType === 'transfer'
                          ? 'انتقال بین خوابگاهی'
                          : 'ثبت اولیه'
                      }
                      tone={
                        m.movementType === 'internal'
                          ? 'blue'
                          : m.movementType === 'transfer'
                          ? 'amber'
                          : 'emerald'
                      }
                    />
                  }
                  rows={[
                    {
                      label: 'مبدأ',
                      value: m.fromDormName
                        ? `${m.fromDormName} · اتاق ${toPersianDigits(m.fromRoomNumber ?? '')}`
                        : 'پذیرش اولیه',
                      full: true,
                    },
                    {
                      label: 'مقصد',
                      value: `${m.toDormName} · اتاق ${toPersianDigits(m.toRoomNumber)}`,
                      full: true,
                    },
                    { label: 'ثبت‌کننده', value: m.performedByName },
                    { label: 'تاریخ', value: formatShamsiDate(m.movedAt) },
                  ]}
                  footer={
                    <div className="text-[11px] text-slate-600 leading-5">
                      <span className="text-slate-500">علت: </span>
                      {m.reason || '—'}
                    </div>
                  }
                />
              ))
            )}
          </MobileCardList>
        )}

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filteredMovements.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
