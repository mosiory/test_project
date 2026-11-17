import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Edit3,
  KeyRound,
  Plus,
  Power,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  type AuthUser,
  type Dormitory,
  type UserRole,
  formatShamsiDate,
  toPersianDigits,
} from '../shared/dormRules';
import { Modal } from './ui/Modal';
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
import { PasswordInput } from './ui/PasswordInput';

interface UsersViewProps {
  currentUser: AuthUser;
  dorms: Dormitory[];
  onNavigateDashboard: () => void;
}

const PAGE_SIZE = 10;

export function UsersView({
  currentUser,
  dorms,
  onNavigateDashboard,
}: UsersViewProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('supervisor');
  const [dormId, setDormId] = useState<number>(dorms[0]?.id ?? 1);
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [confirmToggleUser, setConfirmToggleUser] = useState<AuthUser | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ users: AuthUser[] }>('/api/users');
      setUsers(res.users);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در دریافت لیست کاربران.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const kpis = useMemo(() => {
    const supervisors = users.filter((u) => u.role === 'supervisor').length;
    const active = users.filter((u) => u.isActive).length;
    const inactive = users.filter((u) => !u.isActive).length;
    return {
      total: users.length,
      supervisors,
      active,
      inactive,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (q) {
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.dormName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const openCreate = () => {
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setRole('supervisor');
    setDormId(dorms[0]?.id ?? 1);
    setPassword('');
    setIsActive(true);
    setModalError('');
    setModalOpen(true);
  };

  const openEdit = (u: AuthUser) => {
    setEditingUser(u);
    setUsername(u.username);
    setFullName(u.fullName);
    setRole(u.role);
    setDormId(u.dormId ?? dorms[0]?.id ?? 1);
    setPassword('');
    setIsActive(u.isActive);
    setModalError('');
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName,
            role: editingUser.id === currentUser.id ? editingUser.role : role,
            isActive,
            dormId: role === 'supervisor' ? dormId : null,
            password: password.trim() || undefined,
          }),
        });
        setSuccessMsg(`حساب کاربری ${fullName} با موفقیت به‌روزرسانی شد.`);
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            fullName,
            role,
            dormId: role === 'supervisor' ? dormId : null,
            password,
          }),
        });
        setSuccessMsg(`حساب کاربری ${fullName} ایجاد شد.`);
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      setModalError(
        err instanceof ApiError ? err.message : 'خطا در ذخیره اطلاعات کاربر.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('رمز عبور جدید باید حداقل ۸ کاراکتر و شامل حرف و رقم باشد.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }
    setResetting(true);
    try {
      await apiRequest(`/api/users/${resetTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPassword }),
      });
      setSuccessMsg(`رمز عبور حساب کاربری ${resetTarget.fullName} با موفقیت بازنشانی شد.`);
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
      await loadUsers();
    } catch (err) {
      setResetError(
        err instanceof ApiError ? err.message : 'خطا در بازنشانی رمز عبور حساب کاربری.'
      );
    } finally {
      setResetting(false);
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!confirmToggleUser) return;
    setToggling(true);
    setError('');
    setSuccessMsg('');
    try {
      const nextStatus = !confirmToggleUser.isActive;
      await apiRequest(`/api/users/${confirmToggleUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: confirmToggleUser.fullName,
          role: confirmToggleUser.role,
          dormId: confirmToggleUser.role === 'supervisor' ? confirmToggleUser.dormId : null,
          isActive: nextStatus,
        }),
      });
      setSuccessMsg(
        `وضعیت حساب کاربری ${confirmToggleUser.fullName} به «${
          nextStatus ? 'فعال' : 'غیرفعال'
        }» تغییر یافت.`
      );
      setConfirmToggleUser(null);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت حساب کاربری.'
      );
      setConfirmToggleUser(null);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت حساب‌های کاربری و سرپرستان"
        subtitle="ایجاد، ویرایش، تغییر رمز عبور و کنترل وضعیت فعال یا غیرفعال بودن سرپرستان خوابگاه‌ها"
        breadcrumbLabel="مدیریت کاربران"
        icon={<ShieldCheck className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-bold shadow-sm whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>ایجاد کاربر جدید</span>
          </button>
        }
      />

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">تعداد کل کاربران</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {toPersianDigits(kpis.total)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">تعداد سرپرستان</div>
            <div className="text-2xl font-extrabold text-indigo-700 mt-1 tabular-nums">
              {toPersianDigits(kpis.supervisors)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">کاربران فعال</div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
              {toPersianDigits(kpis.active)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">کاربران غیرفعال</div>
            <div className="text-2xl font-extrabold text-rose-700 mt-1 tabular-nums">
              {toPersianDigits(kpis.inactive)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <UserX className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="جست‌وجو بر اساس نام یا نام کاربری..."
            aria-label="جست‌وجوی کاربران"
            className="w-full pr-10 pl-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </div>
        <select
          aria-label="فیلتر نقش کاربری"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">همه نقش‌ها</option>
          <option value="admin">مدیر کل سامانه</option>
          <option value="supervisor">سرپرست خوابگاه</option>
        </select>
        <select
          aria-label="فیلتر وضعیت حساب"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="inactive">غیرفعال</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="hidden md:block table-scroll">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#EEF4FF] border-b border-slate-200 text-slate-700 font-bold">
              <tr>
                <th className="py-3.5 px-4">نام و نام خانوادگی</th>
                <th className="py-3.5 px-4">نام کاربری</th>
                <th className="py-3.5 px-4">نقش کاربری</th>
                <th className="py-3.5 px-4">خوابگاه مجاز</th>
                <th className="py-3.5 px-4">تاریخ ایجاد</th>
                <th className="py-3.5 px-4">وضعیت حساب</th>
                <th className="py-3.5 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="کاربری یافت نشد"
                      description="هیچ کاربری مطابق با فیلترهای انتخاب‌شده پیدا نشد."
                    />
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {u.fullName}
                      {u.id === currentUser.id && (
                        <span className="mr-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          شما
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {u.username}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge
                        label={u.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'}
                        tone={u.role === 'admin' ? 'blue' : 'slate'}
                      />
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {u.role === 'admin' ? 'هر دو خوابگاه' : u.dormName ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                      {formatShamsiDate(u.createdAt, false)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge label={u.isActive ? 'فعال' : 'غیرفعال'} />
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setResetPassword('');
                            setResetConfirm('');
                            setResetError('');
                          }}
                          aria-label={`بازنشانی رمز عبور ${u.fullName}`}
                          title="بازنشانی رمز عبور"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 font-semibold"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>بازنشانی رمز</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          aria-label={`ویرایش حساب ${u.fullName}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 font-semibold"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ویرایش</span>
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => setConfirmToggleUser(u)}
                            aria-label={`${u.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} حساب ${u.fullName}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold ${
                              u.isActive
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{u.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</span>
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

        {loading ? (
          <MobileCardSkeleton count={3} />
        ) : (
          <MobileCardList>
            {paginatedUsers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80">
                <EmptyState
                  title="کاربری یافت نشد"
                  description="هیچ کاربری مطابق با فیلترهای انتخاب‌شده پیدا نشد."
                />
              </div>
            ) : (
              paginatedUsers.map((u) => (
                <MobileRecordCard
                  key={u.id}
                  accent={u.isActive ? 'blue' : 'slate'}
                  title={
                    <span className="inline-flex items-center gap-2">
                      {u.fullName}
                      {u.id === currentUser.id && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          شما
                        </span>
                      )}
                    </span>
                  }
                  subtitle={<span className="font-mono">{u.username}</span>}
                  badge={<StatusBadge label={u.isActive ? 'فعال' : 'غیرفعال'} />}
                  rows={[
                    {
                      label: 'نقش کاربری',
                      value: (
                        <StatusBadge
                          label={u.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'}
                          tone={u.role === 'admin' ? 'blue' : 'slate'}
                        />
                      ),
                    },
                    {
                      label: 'خوابگاه مجاز',
                      value: u.role === 'admin' ? 'هر دو خوابگاه' : u.dormName ?? '—',
                    },
                    { label: 'تاریخ ایجاد', value: formatShamsiDate(u.createdAt, false) },
                  ]}
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(u);
                          setResetPassword('');
                          setResetConfirm('');
                          setResetError('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> بازنشانی رمز
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> ویرایش
                      </button>
                      {u.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmToggleUser(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold ${
                            u.isActive
                              ? 'border-rose-200 text-rose-700'
                              : 'border-emerald-200 text-emerald-700'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {u.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>
                      )}
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
          totalItems={filtered.length}
          onPageChange={setPage}
        />
      </div>

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="بازنشانی رمز عبور حساب کاربری"
        subtitle={
          resetTarget
            ? `${resetTarget.fullName} (${resetTarget.username})`
            : ''
        }
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          {resetError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
            >
              {resetError}
            </div>
          )}
          <div>
            <label htmlFor="usr-reset-pass" className="block text-xs font-semibold text-slate-700 mb-1">
              رمز عبور جدید *
            </label>
            <PasswordInput
              id="usr-reset-pass"
              value={resetPassword}
              onChange={setResetPassword}
              required
              minLength={8}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="usr-reset-confirm" className="block text-xs font-semibold text-slate-700 mb-1">
              تکرار رمز عبور جدید *
            </label>
            <PasswordInput
              id="usr-reset-confirm"
              value={resetConfirm}
              onChange={setResetConfirm}
              required
              minLength={8}
            />
          </div>
          <p className="text-[11px] text-slate-500 leading-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            پس از بازنشانی رمز، کاربر باید با رمز جدید وارد سامانه شود. این عملیات در تاریخچه فعالیت‌ها ثبت می‌شود.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={resetting}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold"
            >
              {resetting ? 'در حال بازنشانی...' : 'بازنشانی رمز عبور'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit User Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingUser ? `ویرایش حساب: ${editingUser.fullName}` : 'ایجاد حساب کاربری جدید'
        }
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {modalError && <ErrorBanner message={modalError} onClose={() => setModalError('')} />}

          {!editingUser && (
            <div>
              <label htmlFor="usr-username" className="block text-xs font-semibold text-slate-700 mb-1">
                نام کاربری (انگلیسی) *
              </label>
              <input
                id="usr-username"
                type="text"
                dir="ltr"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-left"
              />
            </div>
          )}

          <div>
            <label htmlFor="usr-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
              نام و نام خانوادگی *
            </label>
            <input
              id="usr-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label htmlFor="usr-role" className="block text-xs font-semibold text-slate-700 mb-1">
              نقش کاربری *
            </label>
            <select
              id="usr-role"
              value={role}
              disabled={editingUser?.id === currentUser.id}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white disabled:bg-slate-100"
            >
              <option value="supervisor">سرپرست خوابگاه</option>
              <option value="admin">مدیر کل سامانه</option>
            </select>
            {editingUser?.id === currentUser.id && (
              <p className="text-[11px] text-slate-500 mt-1">
                تغییر نقش کاربری حساب جاری امکان‌پذیر نیست.
              </p>
            )}
          </div>

          {role === 'supervisor' && (
            <div>
              <label htmlFor="usr-dorm" className="block text-xs font-semibold text-slate-700 mb-1">
                خوابگاه اختصاصی *
              </label>
              <select
                id="usr-dorm"
                value={dormId}
                onChange={(e) => setDormId(Number(e.target.value))}
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

          <div>
            <label htmlFor="usr-pass" className="block text-xs font-semibold text-slate-700 mb-1">
              {editingUser ? 'رمز عبور جدید (در صورت نیاز به بازنشانی)' : 'رمز عبور *'}
            </label>
            <PasswordInput
              id="usr-pass"
              value={password}
              onChange={setPassword}
              required={!editingUser}
            />
          </div>

          {editingUser && editingUser.id !== currentUser.id && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>حساب کاربری فعال باشد</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold"
            >
              {submitting ? 'در حال ذخیره...' : 'ذخیره حساب'}
            </button>
          </div>
        </form>
      </Modal>

      {/* In-app React Confirmation Modal for Toggle User Active/Inactive */}
      <Modal
        open={Boolean(confirmToggleUser)}
        onClose={() => setConfirmToggleUser(null)}
        title="تأیید تغییر وضعیت حساب کاربری"
        maxWidthClass="max-w-md"
      >
        {confirmToggleUser && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-700 leading-relaxed">
              آیا از{' '}
              <strong className={confirmToggleUser.isActive ? 'text-rose-700' : 'text-emerald-700'}>
                {confirmToggleUser.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
              </strong>{' '}
              حساب کاربری <strong>{confirmToggleUser.fullName}</strong> (
              <span className="font-mono">{confirmToggleUser.username}</span>) اطمینان دارید؟
            </p>
            {confirmToggleUser.isActive && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                پس از غیرفعال‌سازی، این کاربر تا زمان فعال‌سازی مجدد امکان ورود به سامانه را نخواهد داشت.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleUser(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={toggling}
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2 rounded-xl text-white font-bold ${
                  confirmToggleUser.isActive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {toggling
                  ? 'در حال اعمال...'
                  : confirmToggleUser.isActive
                  ? 'تأیید و غیرفعال‌سازی'
                  : 'تأیید و فعال‌سازی'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
