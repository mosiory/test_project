import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Edit3,
  Eye,
  FilterX,
  History,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  DEGREE_LEVELS,
  MAX_SEMESTER,
  MIN_SEMESTER,
  STUDENT_STATUSES,
  type AuthUser,
  type DegreeLevel,
  type Dormitory,
  type EntryTerm,
  type MovementRecord,
  type ResidenceRecord,
  type RoomRecord,
  type StudentInput,
  type StudentRecord,
  type StudentStatus,
  type TransferRequestRecord,
  formatShamsiDate,
  getEntryTerms,
  sortEntryTerms,
  toEnglishDigits,
  toPersianDigits,
} from '../shared/dormRules';
import { matchesKeywords } from '../shared/search';
import { useLiveRefresh } from '../lib/live';
import { readCompressedImage } from '../lib/image';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { PaginationBar } from './ui/PaginationBar';
import { EmptyState, ErrorBanner, SuccessBanner, TableSkeleton } from './ui/StateViews';
import { MobileCardList, MobileCardSkeleton, MobileRecordCard } from './ui/MobileCard';
import { StatusBadge } from './ui/StatusBadge';
import { MajorCombobox } from './ui/MajorCombobox';

interface StudentsViewProps {
  user: AuthUser;
  dorms: Dormitory[];
  initialDormId?: number;
  onNavigateDashboard?: () => void;
  onDataChanged: () => void;
}

const EMPTY_FORM: StudentInput = {
  firstName: '',
  lastName: '',
  studentNumber: '',
  nationalCode: '',
  city: '',
  entryTerm: null,
  semester: null,
  degree: null,
  major: '',
  mobile: '',
  guardianPhone: '',
  photoUrl: '',
};

export function StudentsView({
  user,
  dorms,
  initialDormId,
  onNavigateDashboard,
  onDataChanged,
}: StudentsViewProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters & sorting
  const [search, setSearch] = useState('');
  const [filterDormId, setFilterDormId] = useState<string>(
    initialDormId ? String(initialDormId) : ''
  );
  const [filterEntry, setFilterEntry] = useState<string>('');
  const [filterDegree, setFilterDegree] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCity, setFilterCity] = useState<string>('');
  const [filterMajor, setFilterMajor] = useState<string>('');
  const [filterSemester, setFilterSemester] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'studentNumber' | 'semester'>('newest');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Registration / Lookup Modal state
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [lookupStudentNumber, setLookupStudentNumber] = useState('');
  const [lookupDone, setLookupDone] = useState(false);
  const [existingStudent, setExistingStudent] = useState<StudentRecord | null>(null);
  const [existingCanEdit, setExistingCanEdit] = useState(false);
  const [existingInOtherDorm, setExistingInOtherDorm] = useState(false);
  const [form, setForm] = useState<StudentInput>(EMPTY_FORM);
  const [selectedDormId, setSelectedDormId] = useState<number>(
    user.dormId ?? dorms[0]?.id ?? 1
  );
  const [selectedRoomId, setSelectedRoomId] = useState<number>(0);
  const [registerExtraCapacity, setRegisterExtraCapacity] = useState(false);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<StudentRecord | null>(null);

  // Detail modal
  const [detailTab, setDetailTab] = useState<'info' | 'residences' | 'movements' | 'transfers'>('info');
  const [detailData, setDetailData] = useState<{
    student: StudentRecord;
    residences: ResidenceRecord[];
    movements: MovementRecord[];
    transfers: TransferRequestRecord[];
  } | null>(null);

  // Status modal
  const [statusTarget, setStatusTarget] = useState<StudentRecord | null>(null);
  const [newStatus, setNewStatus] = useState<StudentStatus>('انصراف از خوابگاه');
  const [statusReason, setStatusReason] = useState('');
  const [reactivateRoomId, setReactivateRoomId] = useState<number>(0);
  const [reactivateExtraCapacity, setReactivateExtraCapacity] = useState(false);

  useEffect(() => {
    setFilterDormId(initialDormId ? String(initialDormId) : '');
    setPage(1);
  }, [initialDormId]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [sRes, rRes] = await Promise.all([
        apiRequest<{ students: StudentRecord[] }>('/api/students'),
        apiRequest<{ rooms: RoomRecord[] }>('/api/rooms'),
      ]);
      setStudents(sRes.students);
      setRooms(rRes.rooms);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت فهرست دانشجویان.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useLiveRefresh(() => loadData(true));

  const kpis = useMemo(() => {
    const scope = filterDormId
      ? students.filter((s) => String(s.currentDormId ?? '') === filterDormId)
      : students;
    const active = scope.filter((s) => s.status === 'ساکن').length;
    return {
      total: scope.length,
      active,
      inactive: scope.length - active,
    };
  }, [students, filterDormId]);

  const entryTermOptions = useMemo(() => {
    const values = new Set<string>(getEntryTerms());
    if (form.entryTerm) values.add(form.entryTerm);
    return sortEntryTerms(values);
  }, [form.entryTerm]);

  const filterEntryOptions = useMemo(() => {
    const values = new Set<string>(getEntryTerms());
    students.forEach((s) => {
      if (s.entryTerm) values.add(s.entryTerm);
    });
    return sortEntryTerms(values);
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qEng = toEnglishDigits(q);
    const semFilterEng = toEnglishDigits(filterSemester.trim());
    let list = students.filter((s) => {
      if (filterDormId && String(s.currentDormId ?? '') !== filterDormId) return false;
      if (filterEntry && s.entryTerm !== filterEntry) return false;
      if (filterDegree && s.degree !== filterDegree) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterCity && !s.city.includes(filterCity.trim())) return false;
      if (filterMajor && !s.major.includes(filterMajor.trim())) return false;
      if (semFilterEng && String(s.semester) !== semFilterEng) return false;
      if (q) {
        const hit = matchesKeywords(
          [
            s.firstName,
            s.lastName,
            `${s.firstName} ${s.lastName}`,
            s.studentNumber,
            s.nationalCode,
            s.mobile,
            s.guardianPhone,
            s.city,
            s.major,
            s.degree,
            s.entryTerm,
            s.semester,
            s.currentDormName,
            s.currentRoomNumber,
            s.status,
          ],
          search
        );
        if (!hit) return false;
      }
      return true;
    });

    if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.lastName.localeCompare(b.lastName, 'fa'));
    } else if (sortBy === 'studentNumber') {
      list = [...list].sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
    } else if (sortBy === 'semester') {
      list = [...list].sort((a, b) => (b.semester ?? 0) - (a.semester ?? 0));
    }
    return list;
  }, [
    students,
    search,
    filterDormId,
    filterEntry,
    filterDegree,
    filterStatus,
    filterCity,
    filterMajor,
    filterSemester,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  const availableRoomsForSelectedDorm = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.dormId === selectedDormId &&
          r.isActive &&
          (registerExtraCapacity ? r.extraRemaining > 0 : r.remaining > 0)
      ),
    [rooms, selectedDormId, registerExtraCapacity]
  );

  const openRegistrationModal = () => {
    const defaultDorm = user.dormId ?? dorms[0]?.id ?? 1;
    setRegModalOpen(true);
    setLookupStudentNumber('');
    setLookupDone(false);
    setExistingStudent(null);
    setExistingCanEdit(false);
    setExistingInOtherDorm(false);
    setForm(EMPTY_FORM);
    setSelectedDormId(defaultDorm);
    setSelectedRoomId(0);
    setRegisterExtraCapacity(false);
    setModalError('');
  };

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');
    const normalizedNum = toEnglishDigits(lookupStudentNumber.trim());
    if (!/^\d{5,20}$/.test(normalizedNum)) {
      setModalError('شماره دانشجویی باید عددی و بین ۵ تا ۲۰ رقم باشد.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        exists: boolean;
        student?: StudentRecord;
        canEdit?: boolean;
        inOtherDorm?: boolean;
      }>(`/api/students/lookup?studentNumber=${encodeURIComponent(normalizedNum)}`);

      setLookupDone(true);
      if (res.exists && res.student) {
        setExistingStudent(res.student);
        setExistingCanEdit(Boolean(res.canEdit));
        setExistingInOtherDorm(Boolean(res.inOtherDorm));
        setForm({
          firstName: res.student.firstName,
          lastName: res.student.lastName,
          studentNumber: res.student.studentNumber,
          nationalCode: res.student.nationalCode,
          city: res.student.city,
          entryTerm: res.student.entryTerm,
          semester: res.student.semester,
          degree: res.student.degree,
          major: res.student.major,
          mobile: res.student.mobile,
          guardianPhone: res.student.guardianPhone,
          photoUrl: res.student.photoUrl,
        });
      } else {
        setExistingStudent(null);
        setExistingCanEdit(false);
        setExistingInOtherDorm(false);
        setForm({ ...EMPTY_FORM, studentNumber: normalizedNum });
      }
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در استعلام شماره دانشجویی.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);
    try {
      if (existingStudent) {
        await apiRequest(`/api/students/${existingStudent.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        setSuccessMsg('اطلاعات دانشجو بدون تغییر محل اقامت با موفقیت به‌روزرسانی شد.');
      } else {
        if (!selectedRoomId) {
          setModalError('انتخاب اتاق دارای ظرفیت خالی الزامی است.');
          setSubmitting(false);
          return;
        }
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            dormId: selectedDormId,
            roomId: selectedRoomId,
            isExtraCapacity: registerExtraCapacity,
          }),
        });
        setSuccessMsg('دانشجوی جدید با موفقیت ثبت و به اتاق تخصیص داده شد.');
      }
      setRegModalOpen(false);
      await loadData();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در ذخیره اطلاعات دانشجو.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setModalError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/students/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setEditTarget(null);
      setSuccessMsg('اطلاعات دانشجو ویرایش شد.');
      await loadData();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در ویرایش اطلاعات.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailModal = async (studentId: number, tab: 'info' | 'residences' | 'movements' | 'transfers' = 'info') => {
    try {
      const res = await apiRequest<{
        student: StudentRecord;
        residences: ResidenceRecord[];
        movements: MovementRecord[];
        transfers: TransferRequestRecord[];
      }>(`/api/students/${studentId}`);
      setDetailTab(tab);
      setDetailData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت پرونده دانشجو.');
    }
  };

  const handleStatusSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    setModalError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/students/${statusTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reason: statusReason,
          roomId: newStatus === 'ساکن' ? reactivateRoomId : undefined,
          isExtraCapacity: newStatus === 'ساکن' ? reactivateExtraCapacity : undefined,
        }),
      });
      setStatusTarget(null);
      setSuccessMsg('وضعیت اقامت دانشجو با موفقیت ثبت شد و ظرفیت اتاق به‌روزرسانی گردید.');
      await loadData();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت دانشجو.');
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterDormId('');
    setFilterEntry('');
    setFilterDegree('');
    setFilterStatus('');
    setFilterCity('');
    setFilterMajor('');
    setFilterSemester('');
    setPage(1);
  };

  const renderFormFields = (disabled = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="st-fname" className="block text-xs font-semibold text-slate-700 mb-1">
          نام *
        </label>
        <input
          id="st-fname"
          type="text"
          required
          disabled={disabled}
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-lname" className="block text-xs font-semibold text-slate-700 mb-1">
          نام خانوادگی *
        </label>
        <input
          id="st-lname"
          type="text"
          required
          disabled={disabled}
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-num" className="block text-xs font-semibold text-slate-700 mb-1">
          شماره دانشجویی *
        </label>
        <input
          id="st-num"
          type="text"
          dir="ltr"
          required
          disabled={disabled || Boolean(existingStudent)}
          value={form.studentNumber}
          onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-left tabular-nums focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-national" className="block text-xs font-semibold text-slate-700 mb-1">
          کد ملی <span className="font-normal text-slate-400">(۱۰ رقم)</span>
        </label>
        <input
          id="st-national"
          type="text"
          dir="ltr"
          inputMode="numeric"
          maxLength={10}
          disabled={disabled}
          placeholder="مثال: 0012345678"
          value={form.nationalCode}
          onChange={(e) => setForm({ ...form, nationalCode: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-left num focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-city" className="block text-xs font-semibold text-slate-700 mb-1">
          شهر <span className="font-normal text-slate-400">(اختیاری)</span>
        </label>
        <input
          id="st-city"
          type="text"
          disabled={disabled}
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-entry" className="block text-xs font-semibold text-slate-700 mb-1">
          ورودی <span className="font-normal text-slate-400">(اختیاری)</span>
        </label>
        <select
          id="st-entry"
          disabled={disabled}
          value={form.entryTerm ?? ''}
          onChange={(e) => setForm({ ...form, entryTerm: e.target.value as EntryTerm })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        >
          <option value="">انتخاب نشده</option>
          {entryTermOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="st-sem" className="block text-xs font-semibold text-slate-700 mb-1">
          ترم <span className="font-normal text-slate-400">(اختیاری، ۱ تا ۹)</span>
        </label>
        <input
          id="st-sem"
          type="number"
          inputMode="numeric"
          min={MIN_SEMESTER}
          max={MAX_SEMESTER}
          step={1}
          disabled={disabled}
          value={form.semester ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setForm({ ...form, semester: null });
              return;
            }
            const next = Math.trunc(Number(toEnglishDigits(raw)));
            if (!Number.isFinite(next)) return;
            if (next < MIN_SEMESTER || next > MAX_SEMESTER) return;
            setForm({ ...form, semester: next });
          }}
          placeholder="۱ تا ۹"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor="st-degree" className="block text-xs font-semibold text-slate-700 mb-1">
          مقطع <span className="font-normal text-slate-400">(اختیاری)</span>
        </label>
        <select
          id="st-degree"
          disabled={disabled}
          value={form.degree ?? ''}
          onChange={(e) => setForm({ ...form, degree: e.target.value as DegreeLevel })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        >
          <option value="">انتخاب نشده</option>
          {DEGREE_LEVELS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="st-major" className="block text-xs font-semibold text-slate-700 mb-1">
          رشته <span className="font-normal text-slate-400">(اختیاری)</span>
        </label>
        <MajorCombobox
          id="st-major"
          value={form.major}
          onChange={(major) => setForm({ ...form, major })}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="st-mobile" className="block text-xs font-semibold text-slate-700 mb-1">
          شماره همراه *
        </label>
        <input
          id="st-mobile"
          type="text"
          dir="ltr"
          required
          disabled={disabled}
          placeholder="09151234567"
          value={form.mobile}
          onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-left num focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="st-guardian" className="block text-xs font-semibold text-slate-700 mb-1">
          شماره ولی <span className="font-normal text-slate-400">(اختیاری، ۱۱ رقم)</span>
        </label>
        <input
          id="st-guardian"
          type="text"
          dir="ltr"
          inputMode="numeric"
          maxLength={11}
          disabled={disabled}
          placeholder="09151234567"
          value={form.guardianPhone}
          onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-left num focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none disabled:bg-slate-100"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="st-photo" className="block text-xs font-semibold text-slate-700 mb-1">
          تصویر دانشجو <span className="font-normal text-slate-400">(اختیاری)</span>
        </label>
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70">
          {form.photoUrl ? (
            <img
              src={form.photoUrl}
              alt="پیش‌نمایش تصویر دانشجو"
              className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white shadow-xs"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-300">
              <ImagePlus className="w-6 h-6" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="st-photo"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{form.photoUrl ? 'تغییر تصویر' : 'انتخاب تصویر'}</span>
            </label>
            <input
              id="st-photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  setModalError('فایل انتخاب‌شده باید تصویر باشد.');
                  return;
                }
                if (file.size > 6 * 1024 * 1024) {
                  setModalError('حجم تصویر نباید بیشتر از ۶ مگابایت باشد.');
                  return;
                }
                try {
                  const dataUrl = await readCompressedImage(file, 200, 0.78);
                  setForm((prev) => ({ ...prev, photoUrl: dataUrl }));
                  setModalError('');
                } catch (err) {
                  setModalError(err instanceof Error ? err.message : 'بارگذاری تصویر انجام نشد.');
                }
              }}
            />
            {form.photoUrl && !disabled && (
              <button
                type="button"
                onClick={() => setForm({ ...form, photoUrl: '' })}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف تصویر</span>
              </button>
            )}
            <span className="text-[10.5px] text-slate-500">
              تصویر به‌صورت خودکار فشرده و ذخیره می‌شود.
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت دانشجویان"
        subtitle="جست‌وجو، ثبت دانشجوی جدید با کنترل ظرفیت اتاق و مشاهده تاریخچه اقامت و انتقال"
        breadcrumbLabel="مدیریت دانشجویان"
        icon={<Users className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
        actions={
          <button
            type="button"
            onClick={openRegistrationModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت دانشجوی جدید</span>
          </button>
        }
      />

      {/* 3 KPI Summary Cards */}
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
              {toPersianDigits(kpis.total)}
            </div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1 leading-4">
              تعداد کل دانشجویان
            </div>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/70 p-3 sm:p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
              {toPersianDigits(kpis.active)}
            </div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-1 leading-4">
              دانشجویان ساکن
            </div>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-amber-50/50 rounded-2xl border border-amber-200/70 p-3 sm:p-4 shadow-xs flex items-center justify-between gap-2">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-700 tabular-nums">
              {toPersianDigits(kpis.inactive)}
            </div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-1 leading-4">
              دانشجویان غیرفعال
            </div>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-amber-100/80 text-amber-700 items-center justify-center shrink-0">
            <UserMinus className="w-5 h-5" />
          </div>
        </div>
      </section>

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="جست‌وجوی سریع (نام، کد ملی، شماره دانشجویی، موبایل، اتاق، رشته)..."
              aria-label="جست‌وجوی دانشجویان"
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
            />
          </div>

          {user.role === 'admin' && (
            <select
              aria-label="فیلتر خوابگاه"
              value={filterDormId}
              onChange={(e) => {
                setFilterDormId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="">همه خوابگاه‌ها</option>
              {dorms.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="فیلتر وضعیت اقامت"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">همه وضعیت‌ها</option>
            {STUDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className={`${showAdvancedFilters ? 'grid' : 'hidden md:grid'} grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-center`}>
          <select
            aria-label="فیلتر ورودی"
            value={filterEntry}
            onChange={(e) => {
              setFilterEntry(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">همه ورودی‌ها</option>
            {filterEntryOptions.map((t) => (
              <option key={t} value={t}>
                ورودی {t}
              </option>
            ))}
          </select>

          <select
            aria-label="فیلتر مقطع"
            value={filterDegree}
            onChange={(e) => {
              setFilterDegree(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">همه مقاطع</option>
            {DEGREE_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="فیلتر ترم (عددی)..."
            aria-label="فیلتر ترم تحصیلی"
            value={filterSemester}
            onChange={(e) => {
              setFilterSemester(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs tabular-nums"
          />

          <input
            type="text"
            placeholder="فیلتر شهر..."
            aria-label="فیلتر شهر محل سکونت"
            value={filterCity}
            onChange={(e) => {
              setFilterCity(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
          />

          <input
            type="text"
            placeholder="فیلتر رشته..."
            aria-label="فیلتر رشته تحصیلی"
            value={filterMajor}
            onChange={(e) => {
              setFilterMajor(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
          />

          <select
            aria-label="مرتب‌سازی"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="newest">جدیدترین ثبت</option>
            <option value="name">نام خانوادگی</option>
            <option value="studentNumber">شماره دانشجویی</option>
            <option value="semester">ترم تحصیلی</option>
          </select>

          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>پاک کردن</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium tabular-nums flex items-center justify-between gap-2">
          <span>نمایش {toPersianDigits(filteredStudents.length)} نتیجه</span>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            aria-expanded={showAdvancedFilters}
            className="md:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold"
          >
            {showAdvancedFilters ? 'بستن فیلترها' : 'فیلترهای بیشتر'}
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="bg-[#EEF4FF] border-b border-slate-200/80 text-xs font-bold text-slate-700">
                <th className="py-3.5 px-3">ردیف</th>
                <th className="py-3.5 px-4">شماره دانشجویی</th>
                <th className="py-3.5 px-4">کد ملی</th>
                <th className="py-3.5 px-4">نام و نام خانوادگی</th>
                <th className="py-3.5 px-4">خوابگاه و اتاق</th>
                <th className="py-3.5 px-4">مقطع / رشته</th>
                <th className="py-3.5 px-4">ورودی / ترم</th>
                <th className="py-3.5 px-4">همراه</th>
                <th className="py-3.5 px-4">شماره ولی</th>
                <th className="py-3.5 px-4">وضعیت</th>
                <th className="py-3.5 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={6} cols={11} />
              ) : pagedStudents.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      title="دانشجویی با این مشخصات یافت نشد"
                      description="فیلترهای جست‌وجو را پاک کنید یا دانشجوی جدیدی ثبت نمایید."
                    />
                  </td>
                </tr>
              ) : (
                pagedStudents.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-xs text-slate-500 tabular-nums">
                      {toPersianDigits((page - 1) * pageSize + idx + 1)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="num text-[13px] font-bold text-slate-800">
                        {toPersianDigits(s.studentNumber)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="num text-[12.5px] font-semibold text-slate-700">
                        {s.nationalCode ? toPersianDigits(s.nationalCode) : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {s.photoUrl ? (
                          <img
                            src={s.photoUrl}
                            alt={`تصویر ${s.firstName} ${s.lastName}`}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {s.firstName.slice(0, 1)}
                            {s.lastName.slice(0, 1)}
                          </span>
                        )}
                        <span className="font-bold text-slate-800">
                          {s.firstName} {s.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {s.currentDormName ? (
                        <span>
                          {s.currentDormName} · اتاق{' '}
                          <strong className="text-blue-700 tabular-nums">
                            {toPersianDigits(s.currentRoomNumber ?? '')}
                          </strong>
                          {s.isExtraCapacity && (
                            <span className="ms-1.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold align-middle">
                              ظرفیت مازاد
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">بدون اتاق فعال</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{s.degree}</span> · {s.major}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {s.entryTerm ?? '—'} · ترم {toPersianDigits(s.semester ?? '—')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="num text-[13px] font-semibold text-slate-700">
                        {toPersianDigits(s.mobile)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="num text-[12.5px] font-semibold text-slate-600">
                        {s.guardianPhone ? toPersianDigits(s.guardianPhone) : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <StatusBadge label={s.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailModal(s.id, 'info')}
                          aria-label={`مشاهده پرونده ${s.firstName} ${s.lastName}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          title="مشاهده جزئیات و سوابق"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetailModal(s.id, 'residences')}
                          aria-label={`تاریخچه اقامت ${s.firstName} ${s.lastName}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                          title="مشاهده تاریخچه اقامت"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(s);
                            setForm({
                              firstName: s.firstName,
                              lastName: s.lastName,
                              studentNumber: s.studentNumber,
                              nationalCode: s.nationalCode,
                              city: s.city,
                              entryTerm: s.entryTerm,
                              semester: s.semester,
                              degree: s.degree,
                              major: s.major,
                              mobile: s.mobile,
                              guardianPhone: s.guardianPhone,
                              photoUrl: s.photoUrl,
                            });
                            setModalError('');
                          }}
                          aria-label={`ویرایش ${s.firstName} ${s.lastName}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                          title="ویرایش اطلاعات"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusTarget(s);
                            setNewStatus(s.status === 'ساکن' ? 'انصراف از خوابگاه' : 'ساکن');
                            setStatusReason('');
                            setReactivateRoomId(0);
                            setReactivateExtraCapacity(false);
                            setModalError('');
                          }}
                          aria-label={`تغییر وضعیت ${s.firstName} ${s.lastName}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          title="تغییر وضعیت اقامت"
                        >
                          {s.status === 'ساکن' ? (
                            <UserMinus className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      </div>
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
            {pagedStudents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80">
                <EmptyState
                  title="دانشجویی با این مشخصات یافت نشد"
                  description="فیلترهای جست‌وجو را پاک کنید یا دانشجوی جدیدی ثبت نمایید."
                  action={
                    <button
                      type="button"
                      onClick={openRegistrationModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      <span>ثبت دانشجوی جدید</span>
                    </button>
                  }
                />
              </div>
            ) : (
              pagedStudents.map((s) => (
                <MobileRecordCard
                  key={s.id}
                  accent={s.status === 'ساکن' ? 'emerald' : 'slate'}
                  title={`${s.firstName} ${s.lastName}`}
                  subtitle={
                    <span className="num">
                      {toPersianDigits(s.studentNumber)} · {s.city}
                    </span>
                  }
                  badge={<StatusBadge label={s.status} />}
                  rows={[
                    {
                      label: 'خوابگاه / اتاق',
                      value: s.currentDormName
                        ? `${s.currentDormName} · ${toPersianDigits(s.currentRoomNumber ?? '')}${
                            s.isExtraCapacity ? ' (ظرفیت مازاد)' : ''
                          }`
                        : 'بدون اتاق فعال',
                      full: true,
                    },
                    {
                      label: 'کد ملی',
                      value: (
                        <span className="num">
                          {s.nationalCode ? toPersianDigits(s.nationalCode) : '—'}
                        </span>
                      ),
                    },
                    {
                      label: 'نوع ظرفیت',
                      value: s.isExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت عادی',
                    },
                    { label: 'مقطع', value: s.degree ?? '—' },
                    {
                      label: 'ترم',
                      value: `ورودی ${s.entryTerm ?? '—'} · ترم ${toPersianDigits(s.semester ?? '—')}`,
                    },
                    { label: 'رشته', value: s.major, full: true },
                    {
                      label: 'شماره همراه',
                      value: <span className="num text-[13px]">{toPersianDigits(s.mobile)}</span>,
                    },
                    {
                      label: 'شماره ولی',
                      value: (
                        <span className="num text-[13px]">
                          {s.guardianPhone ? toPersianDigits(s.guardianPhone) : '—'}
                        </span>
                      ),
                    },
                  ]}
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => openDetailModal(s.id, 'info')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5" /> جزئیات
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetailModal(s.id, 'residences')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        <History className="w-3.5 h-3.5" /> اقامت
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditTarget(s);
                          setForm({
                            firstName: s.firstName,
                            lastName: s.lastName,
                            studentNumber: s.studentNumber,
                            nationalCode: s.nationalCode,
                            city: s.city,
                            entryTerm: s.entryTerm,
                            semester: s.semester,
                            degree: s.degree,
                            major: s.major,
                            mobile: s.mobile,
                            guardianPhone: s.guardianPhone,
                            photoUrl: s.photoUrl,
                          });
                          setModalError('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusTarget(s);
                          setNewStatus(s.status === 'ساکن' ? 'انصراف از خوابگاه' : 'ساکن');
                          setStatusReason('');
                          setReactivateRoomId(0);
                          setModalError('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        {s.status === 'ساکن' ? (
                          <UserMinus className="w-3.5 h-3.5" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        وضعیت
                      </button>
                    </>
                  }
                />
              ))
            )}
          </MobileCardList>
        )}

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filteredStudents.length}
          onPageChange={setPage}
        />
      </div>

      {/* Registration & Existing Lookup Modal */}
      <Modal
        open={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        title="ثبت یا استعلام دانشجو"
        subtitle="ابتدا شماره دانشجویی بررسی می‌شود تا از ثبت رکورد تکراری جلوگیری گردد."
      >
        <div className="space-y-5">
          <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-2.5 items-end">
            <div className="flex-1 w-full">
              <label
                htmlFor="lookup-student-number"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                شماره دانشجویی را وارد و بررسی کنید
              </label>
              <input
                id="lookup-student-number"
                type="text"
                dir="ltr"
                value={lookupStudentNumber}
                onChange={(e) => {
                  setLookupStudentNumber(e.target.value);
                  setLookupDone(false);
                }}
                placeholder="مثال: 40310501"
                required
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-left tabular-nums focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold whitespace-nowrap h-[38px]"
            >
              بررسی شماره دانشجویی
            </button>
          </form>

          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}

          {lookupDone && existingStudent && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>هشدار: این دانشجو قبلاً در سامانه ثبت شده است!</span>
              </div>
              <div>
                وضعیت فعلی: <strong>{existingStudent.status}</strong>{' '}
                {existingStudent.currentDormName && (
                  <>
                    — محل اقامت فعلی: <strong>{existingStudent.currentDormName}</strong> (اتاق{' '}
                    <strong>{toPersianDigits(existingStudent.currentRoomNumber ?? '')}</strong>)
                  </>
                )}
              </div>
              {existingInOtherDorm && (
                <div className="text-rose-700 font-semibold pt-1">
                  این دانشجو در خوابگاه دیگری ساکن است. انتقال بین دو خوابگاه فقط از طریق مسئول کل سامانه و تأیید سرپرست مقصد امکان‌پذیر است.
                </div>
              )}
            </div>
          )}

          {lookupDone && (!existingStudent || existingCanEdit) && (
            <form onSubmit={handleRegisterOrUpdate} className="space-y-5 pt-2 border-t border-slate-100">
              {renderFormFields(existingInOtherDorm)}

              {!existingStudent && (
                <div className="p-4 rounded-xl bg-[#F4F7FC] border border-slate-200/80 space-y-3">
                  <div className="text-xs font-bold text-slate-800">تخصیص محل اقامت اولیه</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {user.role === 'admin' && (
                      <div>
                        <label
                          htmlFor="reg-dorm"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          خوابگاه *
                        </label>
                        <select
                          id="reg-dorm"
                          value={selectedDormId}
                          onChange={(e) => {
                            setSelectedDormId(Number(e.target.value));
                            setSelectedRoomId(0);
                            setRegisterExtraCapacity(false);
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                        >
                          {dorms.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.subtitle})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className={user.role === 'admin' ? '' : 'sm:col-span-2'}>
                      <label
                        htmlFor="reg-room"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        انتخاب اتاق (فقط اتاق‌های دارای{' '}
                        {registerExtraCapacity ? 'ظرفیت مازاد خالی' : 'ظرفیت خالی'}) *
                      </label>
                      <select
                        id="reg-room"
                        required
                        value={selectedRoomId || ''}
                        onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                      >
                        <option value="">-- انتخاب اتاق --</option>
                        {rooms
                          .filter((r) => r.dormId === selectedDormId && r.isActive)
                          .map((r) => {
                            const free = registerExtraCapacity ? r.extraRemaining : r.remaining;
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
                      {availableRoomsForSelectedDorm.length === 0 && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          هیچ اتاق دارای {registerExtraCapacity ? 'ظرفیت مازاد خالی' : 'ظرفیت خالی'} در
                          این خوابگاه وجود ندارد. ابتدا ظرفیت اتاق‌ها را در بخش مدیریت اتاق‌ها افزایش
                          دهید.
                        </p>
                      )}
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={registerExtraCapacity}
                      onChange={(e) => {
                        setRegisterExtraCapacity(e.target.checked);
                        setSelectedRoomId(0);
                      }}
                    />
                    <span>
                      اسکان دانشجو در ظرفیت مازاد (بدون تخت — امکان انتخاب فقط اتاق‌های دارای ظرفیت
                      مازاد خالی)
                    </span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRegModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  انصراف
                </button>
                {!existingInOtherDorm && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    {existingStudent ? 'ذخیره ویرایش اطلاعات' : 'ثبت نهایی دانشجو و تخصیص اتاق'}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Direct Edit Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `ویرایش اطلاعات ${editTarget.firstName} ${editTarget.lastName}` : ''}
        subtitle="ویرایش اطلاعات فردی و تحصیلی باعث تغییر اتاق یا سابقه اقامت دانشجو نمی‌شود."
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}
          {renderFormFields(false)}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
            >
              ذخیره تغییرات
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Status Modal */}
      <Modal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `تغییر وضعیت اقامت: ${statusTarget.firstName} ${statusTarget.lastName}` : ''}
        subtitle="با ثبت خروج یا غیرفعالسازی، ظرفیت اتاق آزاد شده و سوابق اقامت حفظ می‌شوند."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleStatusSave} className="space-y-4">
          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}

          <div>
            <label htmlFor="st-new-status" className="block text-xs font-semibold text-slate-700 mb-1">
              وضعیت جدید
            </label>
            <select
              id="st-new-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as StudentStatus)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {STUDENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {newStatus === 'ساکن' && statusTarget?.status !== 'ساکن' && (
            <div>
              <label htmlFor="st-reactivate-room" className="block text-xs font-semibold text-slate-700 mb-1">
                انتخاب اتاق برای بازگشت به خوابگاه *
              </label>
              <select
                id="st-reactivate-room"
                required
                value={reactivateRoomId || ''}
                onChange={(e) => setReactivateRoomId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="">-- انتخاب اتاق --</option>
                {rooms
                  .filter(
                    (r) =>
                      r.isActive &&
                      (reactivateExtraCapacity ? r.extraRemaining > 0 : r.remaining > 0)
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.dormName} — اتاق {toPersianDigits(r.roomNumber)} (ظرفیت خالی:{' '}
                      {toPersianDigits(r.remaining)} · مازاد:{' '}
                      {toPersianDigits(r.extraRemaining)})
                    </option>
                  ))}
              </select>
              <label className="mt-2 flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={reactivateExtraCapacity}
                  onChange={(e) => {
                    setReactivateExtraCapacity(e.target.checked);
                    setReactivateRoomId(0);
                  }}
                />
                <span>اسکان مجدد در ظرفیت مازاد اتاق</span>
              </label>
            </div>
          )}

          <div>
            <label htmlFor="st-status-reason" className="block text-xs font-semibold text-slate-700 mb-1">
              توضیحات / علت تغییر وضعیت
            </label>
            <textarea
              id="st-status-reason"
              rows={3}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="مثال: پایان تحصیل، درخواست انصراف کتبی..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStatusTarget(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              تأیید و ثبت تغییر وضعیت
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Detail & Residence History Modal */}
      <Modal
        open={Boolean(detailData)}
        onClose={() => setDetailData(null)}
        title={
          detailData
            ? `پرونده دانشجو: ${detailData.student.firstName} ${detailData.student.lastName}`
            : ''
        }
        subtitle={
          detailData
            ? `شماره دانشجویی: ${toPersianDigits(detailData.student.studentNumber)}`
            : ''
        }
        maxWidthClass="max-w-3xl"
      >
        {detailData && (
          <div className="space-y-5">
            {/* Modal Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {[
                { key: 'info', label: 'مشخصات و اقامت فعلی' },
                { key: 'residences', label: `تاریخچه اقامت (${toPersianDigits(detailData.residences.length)})` },
                { key: 'movements', label: `جابه‌جایی‌ها (${toPersianDigits(detailData.movements.length)})` },
                { key: 'transfers', label: `درخواست‌های انتقال (${toPersianDigits(detailData.transfers.length)})` },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDetailTab(t.key as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    detailTab === t.key
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'info' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200/70 text-xs">
                <div className="col-span-2 sm:col-span-3 flex items-center gap-3 pb-3 border-b border-slate-200">
                  {detailData.student.photoUrl ? (
                    <img
                      src={detailData.student.photoUrl}
                      alt={`تصویر ${detailData.student.firstName} ${detailData.student.lastName}`}
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 bg-white"
                    />
                  ) : (
                    <span className="w-16 h-16 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center text-lg font-bold">
                      {detailData.student.firstName.slice(0, 1)}
                      {detailData.student.lastName.slice(0, 1)}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {detailData.student.firstName} {detailData.student.lastName}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      شماره دانشجویی: <span className="num">{toPersianDigits(detailData.student.studentNumber)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">شماره دانشجویی</span>
                  <strong className="text-slate-900 mt-1 block num text-[13px]">
                    {toPersianDigits(detailData.student.studentNumber)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">کد ملی</span>
                  <strong className="text-slate-900 mt-1 block num text-[13px]">
                    {detailData.student.nationalCode
                      ? toPersianDigits(detailData.student.nationalCode)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">نوع ظرفیت</span>
                  <strong
                    className={`mt-1 block font-bold ${
                      detailData.student.isExtraCapacity ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {detailData.student.isExtraCapacity ? 'ظرفیت مازاد (بدون تخت)' : 'ظرفیت عادی'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">وضعیت اقامت</span>
                  <div className="mt-1">
                    <StatusBadge label={detailData.student.status} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">خوابگاه فعلی</span>
                  <strong className="text-slate-900 mt-1 block">
                    {detailData.student.currentDormName ?? '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">اتاق فعلی</span>
                  <strong className="text-blue-700 mt-1 block tabular-nums">
                    {detailData.student.currentRoomNumber
                      ? `اتاق ${toPersianDigits(detailData.student.currentRoomNumber)}`
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">شماره همراه</span>
                  <strong className="text-slate-900 mt-1 block num text-[13px]">
                    {toPersianDigits(detailData.student.mobile)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">شماره ولی</span>
                  <strong className="text-slate-900 mt-1 block num text-[13px]">
                    {detailData.student.guardianPhone
                      ? toPersianDigits(detailData.student.guardianPhone)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">رشته و مقطع</span>
                  <strong className="text-slate-900 mt-1 block">
                    {detailData.student.degree} · {detailData.student.major}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">ورودی و ترم</span>
                  <strong className="text-slate-900 mt-1 block tabular-nums">
                    ورودی {detailData.student.entryTerm ?? '—'} · ترم {toPersianDigits(detailData.student.semester ?? '—')}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">شهر محل سکونت</span>
                  <strong className="text-slate-900 mt-1 block">{detailData.student.city}</strong>
                </div>
              </div>
            )}

            {detailTab === 'residences' && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-[#2563EB]" />
                  <span>تاریخچه اقامت در اتاق‌ها و خوابگاه‌ها</span>
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">خوابگاه</th>
                        <th className="py-2.5 px-3">اتاق</th>
                        <th className="py-2.5 px-3">تاریخ شروع</th>
                        <th className="py-2.5 px-3">تاریخ پایان</th>
                        <th className="py-2.5 px-3">وضعیت / علت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailData.residences.map((res) => (
                        <tr key={res.id}>
                          <td className="py-2.5 px-3 font-semibold">{res.dormName}</td>
                          <td className="py-2.5 px-3 tabular-nums">
                            {toPersianDigits(res.roomNumber)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            {formatShamsiDate(res.startDate)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            {res.endDate ? formatShamsiDate(res.endDate) : 'ادامه دارد'}
                          </td>
                          <td className="py-2.5 px-3">
                            {res.isActive ? (
                              <StatusBadge label="اقامت فعال" />
                            ) : (
                              <span className="text-slate-500">{res.exitReason || 'پایان‌یافته'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailTab === 'movements' && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3">تاریخچه جابه‌جایی‌های اتاق</h3>
                {detailData.movements.length === 0 ? (
                  <div className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">
                    سابقه‌ای ثبت نشده است.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailData.movements.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-slate-800">
                            {m.fromDormName
                              ? `از ${m.fromDormName} (اتاق ${toPersianDigits(m.fromRoomNumber ?? '')}) به ${m.toDormName} (اتاق ${toPersianDigits(m.toRoomNumber)})`
                              : `ثبت اولیه در ${m.toDormName} (اتاق ${toPersianDigits(m.toRoomNumber)})`}
                          </span>
                          <div className="text-slate-500 mt-0.5">علت: {m.reason || '—'}</div>
                        </div>
                        <div className="text-left text-slate-500 tabular-nums">
                          <div>{formatShamsiDate(m.movedAt)}</div>
                          <div className="text-[11px]">توسط: {m.performedByName}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'transfers' && (
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-[#2563EB]" />
                  <span>تاریخچه درخواست‌های انتقال بین خوابگاه‌ها</span>
                </h3>
                {detailData.transfers.length === 0 ? (
                  <div className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">
                    درخواست انتقالی برای این دانشجو ثبت نشده است.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {detailData.transfers.map((tr) => (
                      <div
                        key={tr.id}
                        className="p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">
                            از {tr.fromDormName} (اتاق {toPersianDigits(tr.fromRoomNumber)}) به{' '}
                            <span className="text-blue-700">{tr.toDormName}</span> (اتاق{' '}
                            {toPersianDigits(tr.toRoomNumber ?? '—')})
                          </span>
                          <StatusBadge label={tr.status} />
                        </div>
                        <div className="text-slate-600">علت: {tr.reason}</div>
                        {tr.rejectionReason && (
                          <div className="text-rose-600 font-semibold">
                            علت رد: {tr.rejectionReason}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 flex flex-wrap justify-between gap-2 pt-1 border-t border-slate-100 tabular-nums">
                          <span>ثبت: {formatShamsiDate(tr.requestedAt)} ({tr.requestedByName})</span>
                          {tr.reviewedByName && (
                            <span>بررسی: {tr.reviewedByName} ({formatShamsiDate(tr.reviewedAt)})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
