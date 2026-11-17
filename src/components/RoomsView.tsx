import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Edit3,
  Eye,
  LayoutGrid,
  Plus,
  Power,
  Search,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type AuthUser,
  type Dormitory,
  type RoomRecord,
  toEnglishDigits,
  toPersianDigits,
} from '../shared/dormRules';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { useLiveRefresh } from '../lib/live';
import { PaginationBar } from './ui/PaginationBar';
import { CardGridSkeleton, EmptyState, ErrorBanner, SuccessBanner, TableSkeleton } from './ui/StateViews';
import { StatusBadge } from './ui/StatusBadge';

interface RoomsViewProps {
  user: AuthUser;
  dorms: Dormitory[];
  initialDormId?: number;
  initialStatusFilter?: string;
  onNavigateDashboard?: () => void;
  onDataChanged: () => void;
}

function getRoomStatusLabel(r: RoomRecord): string {
  if (!r.isActive) return 'غیرفعال';
  if (r.status === 'full') return 'تکمیل ظرفیت';
  if (r.status === 'empty') return 'خالی';
  return 'دارای ظرفیت';
}

export function RoomsView({
  user,
  dorms,
  initialDormId,
  initialStatusFilter = '',
  onNavigateDashboard,
  onDataChanged,
}: RoomsViewProps) {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // نمای پیش‌فرض تب مدیریت اتاق‌ها: کارت‌های نمایشی
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [dormFilter, setDormFilter] = useState<string>(
    initialDormId ? String(initialDormId) : ''
  );
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'roomNumber' | 'capacity' | 'remaining'>('roomNumber');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Add/Edit Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [formDormId, setFormDormId] = useState<number>(user.dormId ?? dorms[0]?.id ?? 1);
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [extraCapacity, setExtraCapacity] = useState(0);
  const [floor, setFloor] = useState('طبقه اول');
  const [notes, setNotes] = useState('');
  const [capacityWarningConfirmed, setCapacityWarningConfirmed] = useState(false);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete room confirmation
  const [deleteTarget, setDeleteTarget] = useState<RoomRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Detail Modal
  const [detailRoom, setDetailRoom] = useState<{
    room: RoomRecord;
    residents: Array<{
      id: number;
      studentNumber: string;
      firstName: string;
      lastName: string;
      nationalCode: string;
      major: string;
      degree: string;
      mobile: string;
      guardianPhone: string;
      photoUrl: string;
      isExtraCapacity: boolean;
    }>;
  } | null>(null);

  useEffect(() => {
    setDormFilter(initialDormId ? String(initialDormId) : '');
    setPage(1);
  }, [initialDormId]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setPage(1);
  }, [initialStatusFilter]);

  const loadRooms = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ rooms: RoomRecord[] }>('/api/rooms');
      setRooms(res.rooms);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت لیست اتاق‌ها.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  useLiveRefresh(() => loadRooms(true));

  const kpis = useMemo(() => {
    const scopeRooms = dormFilter
      ? rooms.filter((r) => String(r.dormId) === dormFilter)
      : rooms;
    const active = scopeRooms.filter((r) => r.isActive);
    return {
      total: scopeRooms.length,
      available: active.filter((r) => r.remaining > 0).length,
      full: active.filter((r) => r.status === 'full').length,
      empty: active.filter((r) => r.status === 'empty').length,
      extraCapacity: active.reduce((sum, r) => sum + r.extraCapacity, 0),
      extraOccupied: active.reduce((sum, r) => sum + r.extraOccupied, 0),
      extraRemaining: active.reduce((sum, r) => sum + r.extraRemaining, 0),
      extraRooms: active.filter((r) => r.extraCapacity > 0).length,
    };
  }, [rooms, dormFilter]);

  const filteredRooms = useMemo(() => {
    const q = toEnglishDigits(search.trim()).toLowerCase();
    let list = rooms.filter((r) => {
      if (dormFilter && String(r.dormId) !== dormFilter) return false;
      if (statusFilter === 'full' && (!r.isActive || r.status !== 'full')) return false;
      if (statusFilter === 'available' && (!r.isActive || r.remaining === 0)) return false;
      if (statusFilter === 'empty' && (!r.isActive || r.status !== 'empty')) return false;
      if (statusFilter === 'extra' && (!r.isActive || r.extraRemaining === 0)) return false;
      if (statusFilter === 'inactive' && r.isActive) return false;
      if (q) {
        const hit =
          r.roomNumber.toLowerCase().includes(q) ||
          r.floor.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });

    if (sortBy === 'capacity') {
      list = [...list].sort((a, b) => b.capacity - a.capacity);
    } else if (sortBy === 'remaining') {
      list = [...list].sort((a, b) => b.remaining - a.remaining);
    } else {
      list = [...list].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, 'en', { numeric: true })
      );
    }
    return list;
  }, [rooms, dormFilter, statusFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const pagedRooms = filteredRooms.slice((page - 1) * pageSize, page * pageSize);

  const openAddModal = () => {
    setEditingRoom(null);
    setFormDormId(
      user.dormId ?? (dormFilter ? Number(dormFilter) : dorms[0]?.id ?? 1)
    );
    setRoomNumber('');
    setCapacity(4);
    setExtraCapacity(0);
    setFloor('طبقه اول');
    setNotes('');
    setCapacityWarningConfirmed(false);
    setModalError('');
    setFormModalOpen(true);
  };

  const openEditModal = (r: RoomRecord) => {
    setEditingRoom(r);
    setFormDormId(r.dormId);
    setRoomNumber(r.roomNumber);
    setCapacity(r.capacity);
    setExtraCapacity(r.extraCapacity);
    setFloor(r.floor);
    setNotes(r.notes);
    setCapacityWarningConfirmed(false);
    setModalError('');
    setFormModalOpen(true);
  };

  const isReducingCapacity =
    editingRoom !== null && capacity < editingRoom.capacity;

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (isReducingCapacity && !capacityWarningConfirmed) {
      setModalError('لطفاً ابتدا هشدار کاهش ظرفیت اتاق را تأیید کنید.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingRoom) {
        await apiRequest(`/api/rooms/${editingRoom.id}`, {
          method: 'PUT',
          body: JSON.stringify({ roomNumber, capacity, extraCapacity, floor, notes }),
        });
        setSuccessMsg(`اتاق ${toPersianDigits(roomNumber)} با موفقیت ویرایش شد.`);
      } else {
        await apiRequest('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            dormId: formDormId,
            roomNumber,
            capacity,
            extraCapacity,
            floor,
            notes,
          }),
        });
        setSuccessMsg(`اتاق ${toPersianDigits(roomNumber)} با موفقیت ثبت شد.`);
      }
      setFormModalOpen(false);
      await loadRooms();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در ذخیره اطلاعات اتاق.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (r: RoomRecord) => {
    setError('');
    setSuccessMsg('');
    try {
      await apiRequest(`/api/rooms/${r.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      setSuccessMsg(
        `اتاق ${toPersianDigits(r.roomNumber)} ${r.isActive ? 'غیرفعال' : 'فعال'} شد.`
      );
      await loadRooms();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تغییر وضعیت اتاق مجاز نیست.');
    }
  };

  const openDeleteConfirm = (r: RoomRecord) => {
    setDeleteError('');
    setDeleteTarget(r);
  };

  const handleDeleteRoom = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiRequest<{ roomNumber: string; deletedStudents: number; archived: boolean }>(
        `/api/rooms/${deleteTarget.id}`,
        { method: 'DELETE' }
      );
      setSuccessMsg(
        res.archived
          ? `اتاق ${toPersianDigits(res.roomNumber)} بایگانی شد و سوابق آن حفظ گردید.`
          : `اتاق ${toPersianDigits(res.roomNumber)} حذف شد.`
      );
      if (detailRoom?.room.id === deleteTarget.id) setDetailRoom(null);
      setDeleteTarget(null);
      await loadRooms();
      onDataChanged();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'حذف اتاق انجام نشد.');
    } finally {
      setDeleting(false);
    }
  };

  const openRoomDetail = async (roomId: number) => {
    try {
      const res = await apiRequest<typeof detailRoom>(`/api/rooms/${roomId}`);
      setDetailRoom(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت جزئیات اتاق.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت اتاق‌ها و کنترل ظرفیت"
        subtitle="تعریف اتاق، محاسبه خودکار ظرفیت خالی و مشاهده فهرست ساکنین هر اتاق"
        breadcrumbLabel="مدیریت اتاق‌ها"
        icon={<BedDouble className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === 'table' ? 'bg-white text-[#2563EB] shadow-xs' : 'text-slate-600'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>جدول</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === 'cards' ? 'bg-white text-[#2563EB] shadow-xs' : 'text-slate-600'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>کارت</span>
              </button>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن اتاق جدید</span>
            </button>
          </div>
        }
      />

      {/* Top KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {toPersianDigits(kpis.total)}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-1">تعداد کل اتاق‌ها</div>
        </div>
        <div className="bg-blue-50/50 rounded-2xl border border-blue-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-[#2563EB] tabular-nums">
            {toPersianDigits(kpis.available)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">اتاق‌های دارای ظرفیت</div>
        </div>
        <div className="bg-rose-50/50 rounded-2xl border border-rose-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-rose-600 tabular-nums">
            {toPersianDigits(kpis.full)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">اتاق‌های تکمیل‌شده</div>
        </div>
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-emerald-600 tabular-nums">
            {toPersianDigits(kpis.empty)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">اتاق‌های خالی</div>
        </div>
      </section>

      {/* آمار ظرفیت مازاد */}
      <section className="bg-amber-50/60 rounded-2xl border border-amber-200/80 p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>آمار ظرفیت مازاد اتاق‌ها</span>
          </h2>
          <span className="text-[11px] font-semibold text-amber-800">
            {toPersianDigits(kpis.extraRooms)} اتاق دارای ظرفیت مازاد
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-amber-200/70 px-3 py-2.5">
            <div className="text-lg font-extrabold text-amber-700 tabular-nums">
              {toPersianDigits(kpis.extraCapacity)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">کل ظرفیت مازاد</div>
          </div>
          <div className="bg-white rounded-xl border border-rose-200/70 px-3 py-2.5">
            <div className="text-lg font-extrabold text-rose-600 tabular-nums">
              {toPersianDigits(kpis.extraOccupied)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">ظرفیت مازاد پرشده</div>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200/70 px-3 py-2.5">
            <div className="text-lg font-extrabold text-emerald-600 tabular-nums">
              {toPersianDigits(kpis.extraRemaining)}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">ظرفیت مازاد خالی</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 px-3 py-2.5">
            <div className="text-lg font-extrabold text-slate-800 tabular-nums">
              {toPersianDigits(
                kpis.extraCapacity > 0
                  ? Math.round((kpis.extraOccupied / kpis.extraCapacity) * 100)
                  : 0
              )}
              ٪
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-1">درصد اشغال ظرفیت مازاد</div>
          </div>
        </div>
      </section>

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="جست‌وجوی شماره اتاق یا طبقه..."
            aria-label="جست‌وجوی اتاق‌ها"
            className="w-full pr-10 pl-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </div>

        {user.role === 'admin' && (
          <select
            aria-label="فیلتر خوابگاه"
            value={dormFilter}
            onChange={(e) => {
              setDormFilter(e.target.value);
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
          aria-label="فیلتر وضعیت ظرفیت"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="available">دارای ظرفیت خالی</option>
          <option value="full">تکمیل ظرفیت (پر)</option>
          <option value="empty">کاملاً خالی</option>
          <option value="extra">دارای ظرفیت مازاد خالی</option>
          <option value="inactive">غیرفعال</option>
        </select>

        <select
          aria-label="مرتب‌سازی اتاق‌ها"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="roomNumber">مرتب‌سازی: شماره اتاق</option>
          <option value="capacity">مرتب‌سازی: ظرفیت کل</option>
          <option value="remaining">مرتب‌سازی: ظرفیت خالی</option>
        </select>
      </div>

      {/* Table or Card View */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="py-3.5 px-4">شماره اتاق</th>
                  <th className="py-3.5 px-4">خوابگاه</th>
                  <th className="py-3.5 px-4">طبقه</th>
                  <th className="py-3.5 px-4">ظرفیت کل</th>
                  <th className="py-3.5 px-4">ساکنین فعلی</th>
                  <th className="py-3.5 px-4">ظرفیت خالی</th>
                  <th className="py-3.5 px-4">ظرفیت مازاد (پر/خالی)</th>
                  <th className="py-3.5 px-4">وضعیت</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <TableSkeleton rows={6} cols={9} />
                ) : pagedRooms.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        title="اتاقی با فیلترهای انتخاب‌شده یافت نشد"
                        description="فیلترهای جست‌وجو را تغییر دهید یا اتاق جدیدی ثبت کنید."
                      />
                    </td>
                  </tr>
                ) : (
                  pagedRooms.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                        اتاق {toPersianDigits(r.roomNumber)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {r.dormName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{r.floor}</td>
                      <td className="py-3.5 px-4 tabular-nums font-semibold">
                        {toPersianDigits(r.capacity)} نفر
                      </td>
                      <td className="py-3.5 px-4 tabular-nums font-semibold text-blue-700">
                        {toPersianDigits(r.occupied)} نفر
                      </td>
                      <td className="py-3.5 px-4 tabular-nums font-bold text-emerald-700">
                        {toPersianDigits(r.remaining)} نفر
                      </td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">
                        <span className="font-bold text-amber-700">
                          {toPersianDigits(r.extraOccupied)}
                        </span>
                        <span className="text-slate-400"> / </span>
                        <span className="font-semibold text-slate-700">
                          {toPersianDigits(r.extraCapacity)}
                        </span>
                        <span className="block text-[10.5px] text-emerald-700 mt-0.5">
                          {toPersianDigits(r.extraRemaining)} جای خالی مازاد
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge label={getRoomStatusLabel(r)} />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openRoomDetail(r.id)}
                            aria-label={`مشاهده ساکنین اتاق ${r.roomNumber}`}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                            title="مشاهده جزئیات و ساکنین"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            aria-label={`ویرایش اتاق ${r.roomNumber}`}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-50 hover:text-amber-700"
                            title="ویرایش اتاق و ظرفیت"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(r)}
                            aria-label={`${r.isActive ? 'غیرفعالسازی' : 'فعال‌سازی'} اتاق ${r.roomNumber}`}
                            className={`p-1.5 rounded-lg ${
                              r.isActive
                                ? 'text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={r.isActive ? 'غیرفعالسازی اتاق' : 'فعال‌سازی اتاق'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          {user.role === 'admin' && (
                            <button
                              type="button"
                              onClick={() => openDeleteConfirm(r)}
                              aria-label={`حذف اتاق ${r.roomNumber}`}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                              title="بایگانی/حذف اتاق (فقط مسئول کل)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={filteredRooms.length}
            onPageChange={setPage}
          />
        </div>
      ) : loading ? (
        <CardGridSkeleton count={6} />
      ) : filteredRooms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState title="اتاقی با فیلترهای انتخاب‌شده یافت نشد" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRooms.map((r) => {
            const isFull = r.isActive && r.status === 'full';
            const isEmpty = r.isActive && r.status === 'empty';
            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                  !r.isActive
                    ? 'bg-slate-100/80 border-slate-200 opacity-75'
                    : isFull
                    ? 'bg-white border-rose-200'
                    : isEmpty
                    ? 'bg-white border-emerald-200'
                    : 'bg-white border-slate-200/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">
                        {r.dormName} · {r.floor}
                      </div>
                      <h2 className="text-lg font-extrabold text-slate-900 mt-0.5 tabular-nums">
                        اتاق {toPersianDigits(r.roomNumber)}
                      </h2>
                    </div>

                    <StatusBadge label={getRoomStatusLabel(r)} />
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs text-slate-600 tabular-nums">
                      <span>
                        ساکن: <strong className="text-slate-900">{toPersianDigits(r.occupied)}</strong> از{' '}
                        <strong>{toPersianDigits(r.capacity)}</strong> نفر
                      </span>
                      <span>
                        باقی‌مانده:{' '}
                        <strong className={r.remaining === 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {toPersianDigits(r.remaining)} نفر
                        </strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-amber-800 bg-amber-50/70 border border-amber-200/70 rounded-lg px-2 py-1.5 tabular-nums">
                      <span>
                        ظرفیت مازاد پر: <strong>{toPersianDigits(r.extraOccupied)}</strong>
                      </span>
                      <span>
                        خالی: <strong>{toPersianDigits(r.extraRemaining)}</strong> از{' '}
                        <strong>{toPersianDigits(r.extraCapacity)}</strong>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFull
                            ? 'bg-rose-500'
                            : isEmpty
                            ? 'bg-emerald-500'
                            : 'bg-[#2563EB]'
                        }`}
                        style={{ width: `${r.occupancyPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openRoomDetail(r.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>فهرست ساکنین ({toPersianDigits(r.occupied)})</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(r)}
                      aria-label={`ویرایش اتاق ${r.roomNumber}`}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-50 hover:text-amber-700"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(r)}
                      aria-label={`${r.isActive ? 'غیرفعالسازی' : 'فعال‌سازی'} اتاق ${r.roomNumber}`}
                      className={`p-1.5 rounded-lg ${
                        r.isActive
                          ? 'text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    {user.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(r)}
                        aria-label={`حذف اتاق ${r.roomNumber}`}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                        title="بایگانی/حذف اتاق (فقط مسئول کل)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Room Modal */}
      <Modal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title={editingRoom ? `ویرایش اتاق ${toPersianDigits(editingRoom.roomNumber)}` : 'ثبت اتاق جدید'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}

          {!editingRoom && user.role === 'admin' && (
            <div>
              <label htmlFor="rm-dorm" className="block text-xs font-semibold text-slate-700 mb-1">
                خوابگاه *
              </label>
              <select
                id="rm-dorm"
                value={formDormId}
                onChange={(e) => setFormDormId(Number(e.target.value))}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rm-number" className="block text-xs font-semibold text-slate-700 mb-1">
                شماره اتاق *
              </label>
              <input
                id="rm-number"
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="مثال: 105"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rm-capacity" className="block text-xs font-semibold text-slate-700 mb-1">
                ظرفیت (نفر) *
              </label>
              <input
                id="rm-capacity"
                type="number"
                min={1}
                max={30}
                required
                value={capacity}
                onChange={(e) => {
                  setCapacity(Number(e.target.value));
                  setCapacityWarningConfirmed(false);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rm-extra-capacity" className="block text-xs font-semibold text-slate-700 mb-1">
                ظرفیت مازاد (نفر)
              </label>
              <input
                id="rm-extra-capacity"
                type="number"
                min={0}
                max={30}
                value={extraCapacity}
                onChange={(e) => setExtraCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/40 text-sm text-amber-900 tabular-nums"
              />
              <p className="text-[10.5px] text-slate-500 mt-1 leading-4">
                دانشجویان مازاد تخت ندارند و روی زمین اسکان می‌یابند. برای هر اتاق می‌توانید حداکثر
                ظرفیت مازاد را تعیین کنید.
              </p>
            </div>
          </div>

          {isReducingCapacity && editingRoom && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>هشدار کاهش ظرفیت اتاق</span>
              </div>
              <p>
                شما در حال کاهش ظرفیت این اتاق از {toPersianDigits(editingRoom.capacity)} به{' '}
                {toPersianDigits(capacity)} نفر هستید (ساکنین فعلی: {toPersianDigits(editingRoom.occupied)} نفر).
              </p>
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={capacityWarningConfirmed}
                  onChange={(e) => setCapacityWarningConfirmed(e.target.checked)}
                />
                <span>کاهش ظرفیت اتاق را تأیید می‌کنم.</span>
              </label>
            </div>
          )}

          <div>
            <label htmlFor="rm-floor" className="block text-xs font-semibold text-slate-700 mb-1">
              طبقه / موقعیت
            </label>
            <input
              id="rm-floor"
              type="text"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label htmlFor="rm-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              توضیحات
            </label>
            <input
              id="rm-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
            >
              {editingRoom ? 'ذخیره تغییرات' : 'ثبت اتاق'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Room Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        title={
          deleteTarget
            ? `حذف اتاق ${toPersianDigits(deleteTarget.roomNumber)}`
            : 'حذف اتاق'
        }
        maxWidthClass="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>این عملیات غیرقابل بازگشت است.</span>
              </div>
              <p>
                اتاق <strong>{toPersianDigits(deleteTarget.roomNumber)}</strong> در{' '}
                <strong>{deleteTarget.dormName}</strong> از فهرست اتاق‌های فعال خارج می‌شود.
              </p>
              <p>
                {deleteTarget.occupied > 0
                  ? `${toPersianDigits(deleteTarget.occupied)} دانشجوی ساکن در این اتاق وجود دارد؛ ابتدا باید آن‌ها را منتقل کنید یا وضعیت‌شان را تغییر دهید.`
                  : 'سوابق اقامت و جابه‌جایی مرتبط با این اتاق حفظ می‌شود؛ اتاق بایگانی شده و شماره آن آزاد می‌گردد.'}
              </p>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold"
              >
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 disabled:opacity-60"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteRoom}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-60"
              >
                {deleting ? 'در حال حذف...' : 'حذف قطعی اتاق و دانشجویان'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Room Detail & Residents Modal */}
      <Modal
        open={Boolean(detailRoom)}
        onClose={() => setDetailRoom(null)}
        title={
          detailRoom
            ? `جزئیات اتاق ${toPersianDigits(detailRoom.room.roomNumber)} — ${detailRoom.room.dormName}`
            : ''
        }
        subtitle={
          detailRoom
            ? `ظرفیت کل: ${toPersianDigits(detailRoom.room.capacity)} نفر | ساکن: ${toPersianDigits(detailRoom.room.occupied)} نفر | خالی: ${toPersianDigits(detailRoom.room.remaining)} نفر | ظرفیت مازاد: ${toPersianDigits(detailRoom.room.extraOccupied)} از ${toPersianDigits(detailRoom.room.extraCapacity)}`
            : ''
        }
      >
        {detailRoom && (
          <div className="space-y-4">
            {detailRoom.residents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                در حال حاضر هیچ دانشجویی در این اتاق ساکن نیست.
              </div>
            ) : (
              <div className="table-scroll border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">شماره دانشجویی</th>
                    <th className="py-2.5 px-3">کد ملی</th>
                    <th className="py-2.5 px-3">نام و نام خانوادگی</th>
                    <th className="py-2.5 px-3">مقطع و رشته</th>
                    <th className="py-2.5 px-3">همراه</th>
                    <th className="py-2.5 px-3">ولی</th>
                    <th className="py-2.5 px-3">نوع ظرفیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailRoom.residents.map((st) => (
                    <tr key={st.id}>
                      <td className="py-2.5 px-3">
                        <span className="num text-[12.5px] font-bold text-slate-800">
                          {toPersianDigits(st.studentNumber)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="num text-[12px] font-semibold text-slate-700">
                          {st.nationalCode ? toPersianDigits(st.nationalCode) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {st.firstName} {st.lastName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {st.degree} {st.major}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="num text-[12.5px] font-semibold text-slate-700">
                          {toPersianDigits(st.mobile)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="num text-[12px] font-semibold text-slate-600">
                          {st.guardianPhone ? toPersianDigits(st.guardianPhone) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {st.isExtraCapacity ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10.5px] font-bold">
                            ظرفیت مازاد
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-slate-500">عادی</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
