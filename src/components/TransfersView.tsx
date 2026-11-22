import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  Ban,
  BedDouble,
  Check,
  Eye,
  Info,
  Plus,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type AuthUser,
  type Dormitory,
  type RoomRecord,
  type StudentRecord,
  type TransferRequestRecord,
  formatShamsiDate,
  toPersianDigits,
} from '../shared/dormRules';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { PaginationBar } from './ui/PaginationBar';
import { EmptyState, ErrorBanner, SuccessBanner, TableSkeleton } from './ui/StateViews';
import { MobileCardList, MobileCardSkeleton, MobileRecordCard } from './ui/MobileCard';
import { StatusBadge } from './ui/StatusBadge';
import { useLiveRefresh } from '../lib/live';
import { StudentSearchSelect } from './ui/StudentSearchSelect';

interface TransfersViewProps {
  user: AuthUser;
  dorms: Dormitory[];
  onNavigateDashboard?: () => void;
  onDataChanged: () => void;
}

const TABS = [
  { key: '', label: 'همه درخواست‌ها' },
  { key: 'در انتظار تأیید', label: 'در انتظار بررسی' },
  { key: 'تأییدشده', label: 'تأییدشده' },
  { key: 'ردشده', label: 'ردشده' },
  { key: 'لغوشده', label: 'لغوشده' },
];

export function TransfersView({
  user,
  dorms,
  onNavigateDashboard,
  onDataChanged,
}: TransfersViewProps) {
  const [transfers, setTransfers] = useState<TransferRequestRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  // فقط نام خوابگاه‌ها برای انتخاب مقصد (بدون هیچ اطلاعات ظرفیت)
  const [dormOptions, setDormOptions] = useState<Array<{ id: number; name: string; subtitle: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const dormRoomLabel = (dormName: string, roomNumber?: string | number | null) =>
    dormName
      ? `${dormName} · اتاق ${toPersianDigits(roomNumber ?? '—')}`
      : `اتاق ${toPersianDigits(roomNumber ?? '—')}`;
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Detail modal
  const [detailTarget, setDetailTarget] = useState<TransferRequestRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'approve' | 'cancel';
    transfer: TransferRequestRecord;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Admin Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [studentId, setStudentId] = useState<number>(0);
  const [toDormId, setToDormId] = useState<number>(0);
  const [toRoomId, setToRoomId] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [createExtraCapacity, setCreateExtraCapacity] = useState(false);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Supervisor Reject Modal
  const [rejectTarget, setRejectTarget] = useState<TransferRequestRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Admin: اجرای درخواست در انتظار با انتخاب اتاق مقصد
  const [executeTarget, setExecuteTarget] = useState<TransferRequestRecord | null>(null);
  const [executeRoomId, setExecuteRoomId] = useState<number>(0);
  const [executeExtraCapacity, setExecuteExtraCapacity] = useState(false);

  const executeRooms = useMemo(
    () =>
      executeTarget
        ? rooms.filter(
            (r) =>
              r.dormId === executeTarget.toDormId &&
              r.isActive &&
              (executeExtraCapacity ? r.extraRemaining > 0 : r.remaining > 0)
          )
        : [],
    [rooms, executeTarget, executeExtraCapacity]
  );

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [tRes, sRes, rRes, dRes] = await Promise.all([
        apiRequest<{ transfers: TransferRequestRecord[] }>('/api/transfers'),
        apiRequest<{ students: StudentRecord[] }>(
          '/api/students?status=' + encodeURIComponent('ساکن')
        ),
        apiRequest<{ rooms: RoomRecord[] }>('/api/rooms'),
        apiRequest<{ dormitories: Array<{ id: number; name: string; subtitle: string }> }>(
          '/api/dormitories/options'
        ),
      ]);
      setTransfers(tRes.transfers);
      setStudents(sRes.students.filter((s) => s.status === 'ساکن' && s.currentDormId));
      setRooms(rRes.rooms);
      setDormOptions(dRes.dormitories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت درخواست‌های انتقال.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.role, user.id]);

  useLiveRefresh(() => loadData(true));

  const kpis = useMemo(
    () => ({
      total: transfers.length,
      pending: transfers.filter((t) => t.status === 'در انتظار تأیید').length,
      approved: transfers.filter((t) => t.status === 'تأییدشده').length,
      rejected: transfers.filter((t) => t.status === 'ردشده').length,
    }),
    [transfers]
  );

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) ?? null,
    [students, studentId]
  );

  const destinationDorms = useMemo(() => {
    if (!selectedStudent) return [];
    return dormOptions.filter((d) => d.id !== selectedStudent.currentDormId);
  }, [dormOptions, selectedStudent]);

  useEffect(() => {
    if (selectedStudent) {
      const otherDorm = dormOptions.find((d) => d.id !== selectedStudent.currentDormId);
      setToDormId(otherDorm?.id ?? 0);
      setToRoomId(0);
    }
  }, [selectedStudent, dormOptions]);

  const destinationRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.dormId === toDormId &&
          r.isActive &&
          (createExtraCapacity ? r.extraRemaining > 0 : r.remaining > 0)
      ),
    [rooms, toDormId, createExtraCapacity]
  );

  const availableDestinationRooms = destinationRooms;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);
    try {
      const isAdmin = user.role === 'admin';
      await apiRequest('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          toDormId,
          toRoomId: isAdmin ? toRoomId : null,
          reason,
          isExtraCapacity: isAdmin ? createExtraCapacity : false,
          execute: isAdmin,
        }),
      });
      setCreateOpen(false);
      setStudentId(0);
      setToRoomId(0);
      setReason('');
      setCreateExtraCapacity(false);
      setSuccessMsg(
        isAdmin
          ? 'انتقال دانشجو بین دو خوابگاه با موفقیت انجام شد و ظرفیت اتاق‌ها به‌روزرسانی گردید.'
          : 'درخواست انتقال ثبت شد و برای بررسی و اجرا به مسئول کل سامانه ارسال گردید.'
      );
      await loadData();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در ثبت درخواست انتقال.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (
    t: TransferRequestRecord,
    roomId?: number,
    isExtraCapacity = false
  ) => {
    setError('');
    setSuccessMsg('');
    try {
      await apiRequest(`/api/transfers/${t.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve', toRoomId: roomId, isExtraCapacity }),
      });
      const room = rooms.find((r) => r.id === roomId);
      setSuccessMsg(
        `درخواست انتقال ${t.studentName} تأیید و اقامت دانشجو به اتاق ${
          room ? toPersianDigits(room.roomNumber) : toPersianDigits(t.toRoomNumber ?? '—')
        }${isExtraCapacity ? ' (ظرفیت مازاد)' : ''} منتقل شد.`
      );
      await loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در تأیید درخواست انتقال.');
    }
  };

  const handleRejectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setModalError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/transfers/${rejectTarget.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'reject', rejectionReason }),
      });
      setRejectTarget(null);
      setRejectionReason('');
      setSuccessMsg('درخواست انتقال رد شد و محل اقامت قبلی دانشجو حفظ گردید.');
      await loadData();
      onDataChanged();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'خطا در رد درخواست.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (t: TransferRequestRecord) => {
    setError('');
    setSuccessMsg('');
    try {
      await apiRequest(`/api/transfers/${t.id}/cancel`, { method: 'POST' });
      setSuccessMsg('درخواست انتقال لغو شد.');
      await loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در لغو درخواست.');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    await handleCancel(confirmAction.transfer);
    setActionBusy(false);
    setConfirmAction(null);
  };

  const handleExecuteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!executeTarget) return;
    setSubmitting(true);
    setModalError('');
    await handleApprove(executeTarget, executeRoomId, executeExtraCapacity);
    setSubmitting(false);
    setExecuteTarget(null);
    setExecuteRoomId(0);
    setExecuteExtraCapacity(false);
  };

  const filteredTransfers = transfers.filter((t) =>
    statusFilter ? t.status === statusFilter : true
  );
  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / pageSize));
  const pagedTransfers = filteredTransfers.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <PageHeader
        title="درخواست‌های انتقال بین خوابگاه‌ها"
        subtitle={
          user.role === 'admin'
            ? 'انتقال مستقیم دانشجو بین دو خوابگاه با مشاهدهٔ ظرفیت و اتاق‌های هر دو خوابگاه'
            : 'ثبت درخواست انتقال برای دانشجویان خوابگاه خود و تأیید درخواست‌های ورودی به خوابگاه شما (بدون دسترسی به اتاق و ظرفیت خوابگاه دیگر)'
        }
        breadcrumbLabel="درخواست‌های انتقال"
        icon={<ArrowLeftRight className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setModalError('');
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{user.role === 'admin' ? 'انتقال جدید دانشجو' : 'ثبت درخواست انتقال'}</span>
          </button>
        }
      />

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {toPersianDigits(kpis.total)}
          </div>
          <div className="text-xs font-semibold text-slate-500 mt-1">کل درخواست‌ها</div>
        </div>
        <div className="bg-amber-50/50 rounded-2xl border border-amber-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-amber-700 tabular-nums">
            {toPersianDigits(kpis.pending)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">در انتظار بررسی</div>
        </div>
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-emerald-700 tabular-nums">
            {toPersianDigits(kpis.approved)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">تأییدشده</div>
        </div>
        <div className="bg-rose-50/50 rounded-2xl border border-rose-200/70 p-4 shadow-xs">
          <div className="text-2xl font-extrabold text-rose-600 tabular-nums">
            {toPersianDigits(kpis.rejected)}
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">ردشده</div>
        </div>
      </section>

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Filter Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key || 'all'}
            type="button"
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              statusFilter === tab.key
                ? 'bg-[#2563EB] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transfers List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th className="py-3.5 px-4">دانشجو</th>
                <th className="py-3.5 px-4">مبدأ</th>
                <th className="py-3.5 px-4">مقصد</th>
                <th className="py-3.5 px-4 hidden 2xl:table-cell">علت انتقال</th>
                <th className="py-3.5 px-4">وضعیت</th>
                <th className="py-3.5 px-4">تاریخ ثبت</th>
                <th className="py-3.5 px-4 text-center">اقدام</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : pagedTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="درخواست انتقالی در این بخش وجود ندارد"
                      description="می‌توانید فیلتر وضعیت را تغییر دهید یا از دکمه ثبت درخواست جدید استفاده کنید."
                    />
                  </td>
                </tr>
              ) : (
                pagedTransfers.map((t) => {
                  const canApprove =
                    t.status === 'در انتظار تأیید' &&
                    (user.role === 'admin' ||
                      (user.role === 'supervisor' && user.dormId === t.toDormId));
                  const canCancel =
                    t.status === 'در انتظار تأیید' &&
                    (user.role === 'admin' ||
                      (user.role === 'supervisor' && t.requestedById === user.id));

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {t.studentName}{' '}
                        <span className="num font-semibold text-slate-600">
                          ({toPersianDigits(t.studentNumber)})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {dormRoomLabel(t.fromDormName, t.fromRoomNumber)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-blue-700 whitespace-nowrap">
                        {dormRoomLabel(t.toDormName, t.toRoomNumber)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs hidden 2xl:table-cell">
                        <div className="truncate max-w-[150px]">{t.reason}</div>
                        {t.rejectionReason && (
                          <div className="text-rose-600 mt-0.5 truncate max-w-[150px]">
                            علت رد: {t.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge label={t.status} />
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatShamsiDate(t.requestedAt)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailTarget(t)}
                            aria-label={`جزئیات انتقال ${t.studentName}`}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600"
                            title="مشاهده جزئیات"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canApprove && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setExecuteTarget(t);
                                  setExecuteRoomId(0);
                                  setExecuteExtraCapacity(false);
                                  setModalError('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>
                                  {user.role === 'admin' ? 'اجرای انتقال' : 'تأیید'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(t);
                                  setRejectionReason('');
                                  setModalError('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>رد</span>
                              </button>
                            </>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ kind: 'cancel', transfer: t })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>لغو</span>
                            </button>
                          )}
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
          <MobileCardSkeleton count={3} />
        ) : (
          <MobileCardList>
            {pagedTransfers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80">
                <EmptyState
                  title="درخواست انتقالی در این بخش وجود ندارد"
                  description="می‌توانید فیلتر وضعیت را تغییر دهید یا از دکمه ثبت درخواست جدید استفاده کنید."
                />
              </div>
            ) : (
              pagedTransfers.map((t) => {
                const canApprove =
                  t.status === 'در انتظار تأیید' &&
                  (user.role === 'admin' ||
                    (user.role === 'supervisor' && user.dormId === t.toDormId));
                const canCancel =
                  t.status === 'در انتظار تأیید' &&
                  (user.role === 'admin' ||
                    (user.role === 'supervisor' && t.requestedById === user.id));
                return (
                  <MobileRecordCard
                    key={t.id}
                    accent={
                      t.status === 'تأییدشده'
                        ? 'emerald'
                        : t.status === 'ردشده'
                        ? 'rose'
                        : t.status === 'در انتظار تأیید'
                        ? 'amber'
                        : 'slate'
                    }
                    title={t.studentName}
                    subtitle={
                      <span className="num">
                        {toPersianDigits(t.studentNumber)}
                      </span>
                    }
                    badge={<StatusBadge label={t.status} />}
                    rows={[
                      {
                        label: 'مبدأ',
                        value: dormRoomLabel(t.fromDormName, t.fromRoomNumber),
                        full: true,
                      },
                      {
                        label: 'مقصد',
                        value: dormRoomLabel(t.toDormName, t.toRoomNumber),
                        full: true,
                      },
                      { label: 'تاریخ ثبت', value: formatShamsiDate(t.requestedAt) },
                      { label: 'درخواست‌دهنده', value: t.requestedByName },
                    ]}
                    footer={
                      <div className="text-[11px] text-slate-600 leading-5">
                        <span className="text-slate-500">علت: </span>
                        {t.reason}
                        {t.rejectionReason && (
                          <div className="text-rose-600 mt-1">علت رد: {t.rejectionReason}</div>
                        )}
                      </div>
                    }
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => setDetailTarget(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" /> جزئیات
                        </button>
                        {canApprove && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setExecuteTarget(t);
                                setExecuteRoomId(0);
                                setExecuteExtraCapacity(false);
                                setModalError('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              <Check className="w-3.5 h-3.5" />{' '}
                              {user.role === 'admin' ? 'اجرای انتقال' : 'تأیید'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(t);
                                setRejectionReason('');
                                setModalError('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
                            >
                              <X className="w-3.5 h-3.5" /> رد
                            </button>
                          </>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ kind: 'cancel', transfer: t })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                          >
                            <Ban className="w-3.5 h-3.5" /> لغو
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })
            )}
          </MobileCardList>
        )}

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filteredTransfers.length}
          onPageChange={setPage}
        />
      </div>

      {/* Transfer Detail Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="جزئیات درخواست انتقال بین خوابگاهی"
        subtitle={
          detailTarget
            ? `دانشجو: ${detailTarget.studentName} (${toPersianDigits(detailTarget.studentNumber)})`
            : ''
        }
        maxWidthClass="max-w-lg"
      >
        {detailTarget && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <div>
                <span className="text-slate-500 block">خوابگاه و اتاق مبدأ</span>
                <strong className="text-slate-900 mt-1 block">
                  {dormRoomLabel(detailTarget.fromDormName, detailTarget.fromRoomNumber)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">خوابگاه و اتاق مقصد</span>
                <strong className="text-blue-700 mt-1 block">
                  {dormRoomLabel(detailTarget.toDormName, detailTarget.toRoomNumber)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">وضعیت فعلی</span>
                <div className="mt-1">
                  <StatusBadge label={detailTarget.status} />
                </div>
              </div>
              <div>
                <span className="text-slate-500 block">درخواست‌دهنده</span>
                <strong className="text-slate-900 mt-1 block">
                  {detailTarget.requestedByName}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">تاریخ ثبت درخواست</span>
                <strong className="text-slate-900 mt-1 block tabular-nums">
                  {formatShamsiDate(detailTarget.requestedAt)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">بررسی‌کننده و زمان پاسخ</span>
                <strong className="text-slate-900 mt-1 block tabular-nums">
                  {detailTarget.reviewedByName
                    ? `${detailTarget.reviewedByName} (${formatShamsiDate(detailTarget.reviewedAt)})`
                    : 'در انتظار بررسی مسئول کل سامانه'}
                </strong>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block mb-1">علت انتقال:</span>
              <p className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-800">
                {detailTarget.reason}
              </p>
            </div>

            {detailTarget.rejectionReason && (
              <div>
                <span className="text-rose-600 font-bold block mb-1">علت رد درخواست:</span>
                <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                  {detailTarget.rejectionReason}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Transfer Modal (Admin) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={
          user.role === 'admin'
            ? 'انتقال مستقیم دانشجو بین دو خوابگاه'
            : 'ثبت درخواست انتقال بین خوابگاه‌ها'
        }
        subtitle={
          user.role === 'admin'
            ? 'ظرفیت و اتاق‌های هر دو خوابگاه در همین صفحه نمایش داده می‌شود و انتقال بلافاصله اجرا می‌گردد.'
            : 'درخواست شما برای بررسی، تعیین اتاق و اجرا به مسئول کل سامانه ارسال می‌شود.'
        }
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {user.role === 'admin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dorms.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-xl border p-3 ${
                    selectedStudent?.currentDormId === d.id
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-blue-200/70 bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 truncate">{d.name}</span>
                    <span className="text-[10px] font-semibold text-slate-500 truncate">
                      {d.subtitle}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900 tabular-nums">
                        {toPersianDigits(d.totalCapacity)}
                      </div>
                      <div className="text-[9.5px] text-slate-500">ظرفیت کل</div>
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-blue-700 tabular-nums">
                        {toPersianDigits(d.occupiedCount)}
                      </div>
                      <div className="text-[9.5px] text-slate-500">ساکن</div>
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-emerald-700 tabular-nums">
                        {toPersianDigits(d.remainingCapacity)}
                      </div>
                      <div className="text-[9.5px] text-slate-500">خالی</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {user.role === 'supervisor' && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                پس از ثبت، درخواست برای بررسی به خوابگاه مقصد ارسال می‌شود و سرپرست خوابگاه مقصد
                یا مسئول کل سامانه، اتاق مقصد را از میان اتاق‌های دارای ظرفیت (یا ظرفیت مازاد)
                به‌صورت دستی انتخاب و انتقال را تأیید می‌کند.
              </span>
            </div>
          )}

          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}

          <div>
            <label htmlFor="tr-student" className="block text-xs font-semibold text-slate-700 mb-1">
              انتخاب دانشجو *
            </label>
            <StudentSearchSelect
              id="tr-student"
              students={students}
              value={studentId}
              onChange={(id) => setStudentId(id)}
              placeholder="جست‌وجو با نام، نام خانوادگی، کد ملی یا شماره دانشجویی..."
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              جست‌وجوی زنده بین دانشجویان ساکن؛ با تایپ نام، نام خانوادگی یا کد ملی، پیشنهادهای
              مطابق نمایش داده می‌شود.
            </p>
          </div>

          {selectedStudent && (
            <>
              <div>
                <label htmlFor="tr-dorm" className="block text-xs font-semibold text-slate-700 mb-1">
                  خوابگاه مقصد *
                </label>
                <select
                  id="tr-dorm"
                  required
                  value={toDormId || ''}
                  onChange={(e) => {
                    setToDormId(Number(e.target.value));
                    setToRoomId(0);
                    setCreateExtraCapacity(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {destinationDorms.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.subtitle})
                    </option>
                  ))}
                </select>
              </div>

              {user.role === 'admin' && (
              <div className="space-y-2">
                <div>
                  <label htmlFor="tr-room" className="block text-xs font-semibold text-slate-700 mb-1">
                    اتاق مقصد *
                  </label>
                  <select
                    id="tr-room"
                    required
                    value={toRoomId || ''}
                    onChange={(e) => setToRoomId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">-- انتخاب اتاق دارای ظرفیت --</option>
                    {destinationRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        اتاق {toPersianDigits(r.roomNumber)} — ظرفیت خالی{' '}
                        {toPersianDigits(r.remaining)} نفر · ظرفیت مازاد خالی{' '}
                        {toPersianDigits(r.extraRemaining)} نفر
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={createExtraCapacity}
                    onChange={(e) => {
                      setCreateExtraCapacity(e.target.checked);
                      setToRoomId(0);
                    }}
                  />
                  <span>
                    اسکان در ظرفیت مازاد اتاق (دانشجو تخت ندارد و روی زمین اسکان می‌یابد)
                  </span>
                </label>
                <div
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                    availableDestinationRooms.length > 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      availableDestinationRooms.length > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  {availableDestinationRooms.length > 0
                    ? `${toPersianDigits(
                        availableDestinationRooms.reduce(
                          (sum, r) =>
                            sum + (createExtraCapacity ? r.extraRemaining : r.remaining),
                          0
                        )
                      )} نفر ${createExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت'} خالی در ${toPersianDigits(
                        availableDestinationRooms.length
                      )} اتاق این خوابگاه`
                    : `در حال حاضر هیچ اتاق دارای ${
                        createExtraCapacity ? 'ظرفیت مازاد خالی' : 'ظرفیت خالی'
                      } در خوابگاه مقصد وجود ندارد.`}
                </div>
              </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="tr-reason" className="block text-xs font-semibold text-slate-700 mb-1">
              علت انتقال بین خوابگاهی *
            </label>
            <textarea
              id="tr-reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تغییر رشته دانشجو و انتقال به دانشکده کشاورزی"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting || (user.role === 'admin' && !toRoomId)}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold"
            >
              {user.role === 'admin' ? 'اجرای انتقال دانشجو' : 'ثبت و ارسال درخواست'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Approve / Cancel Modal */}
      <Modal
        open={Boolean(confirmAction)}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        title={
          confirmAction?.kind === 'approve'
            ? 'تأیید نهایی درخواست انتقال'
            : 'لغو درخواست انتقال'
        }
        subtitle={
          confirmAction
            ? `دانشجو: ${confirmAction.transfer.studentName} (${toPersianDigits(
                confirmAction.transfer.studentNumber
              )})`
            : ''
        }
        maxWidthClass="max-w-md"
      >
        {confirmAction && (
          <div className="space-y-4 text-xs">
            <div
              className={`p-3.5 rounded-xl border leading-relaxed ${
                confirmAction.kind === 'approve'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {confirmAction.kind === 'approve'
                ? 'با تأیید این درخواست، اقامت دانشجو از خوابگاه مبدأ حذف و در اتاق مقصد ثبت می‌شود. این تغییر قابل بازگشت نیست؛ آیا اطمینان دارید؟'
                : 'با لغو این درخواست، فرآیند بررسی آن متوقف می‌شود و دانشجو در محل اقامت فعلی خود باقی می‌ماند. آیا اطمینان دارید؟'}
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">خوابگاه مبدأ</span>
                <strong className="text-slate-900">
                  {dormRoomLabel(
                    confirmAction.transfer.fromDormName,
                    confirmAction.transfer.fromRoomNumber
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">خوابگاه مقصد</span>
                <strong className="text-slate-900">
                  {dormRoomLabel(
                    confirmAction.transfer.toDormName,
                    confirmAction.transfer.toRoomNumber
                  )}
                </strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={actionBusy}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={actionBusy}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-60 ${
                  confirmAction.kind === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionBusy
                  ? 'در حال انجام...'
                  : confirmAction.kind === 'approve'
                    ? 'تأیید و انتقال دانشجو'
                    : 'لغو قطعی درخواست'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Admin: اجرای درخواست در انتظار با انتخاب اتاق مقصد */}
      <Modal
        open={Boolean(executeTarget)}
        onClose={() => {
          if (!submitting) {
            setExecuteTarget(null);
            setModalError('');
          }
        }}
        title={
          user.role === 'admin' ? 'اجرای انتقال و تعیین اتاق مقصد' : 'تأیید انتقال ورودی'
        }
        subtitle={
          executeTarget
            ? `دانشجو: ${executeTarget.studentName} (${toPersianDigits(executeTarget.studentNumber)})`
            : ''
        }
        maxWidthClass="max-w-lg"
      >
        {executeTarget && (
          <form onSubmit={handleExecuteSubmit} className="space-y-4 text-xs">
            {modalError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
              >
                {modalError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">مبدأ</span>
                <strong className="text-slate-900">
                  {dormRoomLabel(executeTarget.fromDormName, executeTarget.fromRoomNumber)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">مقصد</span>
                <strong className="text-blue-700">
                  {executeTarget.toDormName}
                  {executeTarget.toRoomNumber
                    ? dormRoomLabel('', executeTarget.toRoomNumber)
                    : ' (اتاق هنوز تعیین نشده)'}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">درخواست‌دهنده</span>
                <strong className="text-slate-900">{executeTarget.requestedByName}</strong>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label
                  htmlFor="tr-execute-room"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  انتخاب دستی اتاق مقصد در {executeTarget.toDormName} *
                </label>
                <select
                  id="tr-execute-room"
                  required
                  value={executeRoomId || ''}
                  onChange={(e) => setExecuteRoomId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="">-- انتخاب اتاق دارای ظرفیت --</option>
                  {executeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      اتاق {toPersianDigits(r.roomNumber)} — ظرفیت خالی{' '}
                      {toPersianDigits(r.remaining)} نفر · ظرفیت مازاد خالی{' '}
                      {toPersianDigits(r.extraRemaining)} نفر
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={executeExtraCapacity}
                  onChange={(e) => {
                    setExecuteExtraCapacity(e.target.checked);
                    setExecuteRoomId(0);
                  }}
                />
                <span>اسکان دانشجو در ظرفیت مازاد اتاق انتخاب‌شده</span>
              </label>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                <BedDouble className="w-3.5 h-3.5" />
                {toPersianDigits(
                  executeRooms.reduce(
                    (sum, r) =>
                      sum + Math.max(0, executeExtraCapacity ? r.extraRemaining : r.remaining),
                    0
                  )
                )}{' '}
                نفر {executeExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت'} خالی در این خوابگاه
              </div>
              {executeRooms.length === 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-900">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    در حال حاضر اتاق دارای {executeExtraCapacity ? 'ظرفیت مازاد' : 'ظرفیت'} خالی در
                    این خوابگاه وجود ندارد؛ در صورت نیاز ابتدا ظرفیت اتاق‌ها را در بخش مدیریت اتاق‌ها
                    افزایش دهید.
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setExecuteTarget(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={submitting || !executeRoomId}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
              >
                {submitting
                  ? 'در حال انجام...'
                  : user.role === 'admin'
                    ? 'تأیید و اجرای انتقال'
                    : 'تأیید انتقال'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Reason Modal (Supervisor) */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="رد درخواست انتقال"
        subtitle={rejectTarget ? `دانشجو: ${rejectTarget.studentName}` : ''}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          {modalError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {modalError}
            </div>
          )}
          <div>
            <label htmlFor="tr-reject-reason" className="block text-xs font-semibold text-slate-700 mb-1">
              علت رد درخواست انتقال *
            </label>
            <textarea
              id="tr-reject-reason"
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="مثال: اتاق انتخاب‌شده در حال تعمیرات است."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              ثبت رد درخواست
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
