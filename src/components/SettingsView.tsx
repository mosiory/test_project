import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Building2,
  Calendar,
  Camera,
  ImagePlus,
  KeyRound,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import type { AuthUser, SystemSettings } from '../shared/dormRules';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { ErrorBanner, SuccessBanner } from './ui/StateViews';
import { PasswordInput } from './ui/PasswordInput';
import { readCompressedImage } from '../lib/image';

interface SettingsViewProps {
  user: AuthUser;
  settings: SystemSettings;
  onNavigateDashboard: () => void;
  onSettingsUpdated: (s: SystemSettings) => void;
  onProfileUpdated: (user: AuthUser) => void;
}

export function SettingsView({
  user,
  settings,
  onNavigateDashboard,
  onSettingsUpdated,
  onProfileUpdated,
}: SettingsViewProps) {
  const [universityName, setUniversityName] = useState(settings.universityName);
  const [systemTitle, setSystemTitle] = useState(settings.systemTitle);
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [currentSemesterTitle, setCurrentSemesterTitle] = useState(
    settings.currentSemesterTitle
  );

  const [fullName, setFullName] = useState(user.fullName);
  const [profilePhoto, setProfilePhoto] = useState(user.photoUrl ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRequestSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!universityName.trim() || !systemTitle.trim() || !academicYear.trim() || !currentSemesterTitle.trim()) {
      setError('تکمیل تمامی فیلدهای تنظیمات دانشگاه و نیمسال تحصیلی الزامی است.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSaveSettings = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiRequest<{ settings: SystemSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          universityName: universityName.trim(),
          systemTitle: systemTitle.trim(),
          academicYear: academicYear.trim(),
          currentSemesterTitle: currentSemesterTitle.trim(),
        }),
      });
      onSettingsUpdated(res.settings);
      setConfirmOpen(false);
      setSuccessMsg('تنظیمات اصلی سامانه و سال تحصیلی با موفقیت ذخیره شد.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ذخیره تنظیمات.');
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleProfilePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setSuccessMsg('');
    setPhotoProcessing(true);
    try {
      const dataUrl = await readCompressedImage(file, 320, 0.8);
      setProfilePhoto(dataUrl);
      setSuccessMsg('تصویر انتخاب شد؛ برای ثبت نهایی، دکمه «ذخیره مشخصات» را بزنید.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'پردازش تصویر انجام نشد.');
    } finally {
      setPhotoProcessing(false);
    }
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (fullName.trim().length < 2) {
      setError('نام و نام خانوادگی باید حداقل ۲ کاراکتر باشد.');
      return;
    }
    setProfileSaving(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim(),
          photoUrl: profilePhoto,
        }),
      });
      onProfileUpdated(res.user);
      setFullName(res.user.fullName);
      setProfilePhoto(res.user.photoUrl ?? '');
      setSuccessMsg('نام نمایشی و تصویر پروفایل با موفقیت به‌روزرسانی شد.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ذخیره مشخصات کاربری.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('تکمیل هر سه فیلد رمز عبور الزامی است.');
      return;
    }
    if (newPassword.length < 8) {
      setError('رمز عبور جدید باید حداقل ۸ کاراکتر و شامل حرف و رقم باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg('رمز عبور حساب کاربری شما با موفقیت تغییر یافت.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در تغییر رمز عبور.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={user.role === 'admin' ? 'تنظیمات سامانه و امنیت حساب' : 'تنظیمات و امنیت حساب'}
        subtitle={
          user.role === 'admin'
            ? 'مشخصات و تصویر پروفایل، رمز عبور، مشخصات پایه دانشگاه و تنظیمات نیمسال تحصیلی'
            : 'مشخصات و تصویر پروفایل، رمز عبور و امنیت حساب کاربری سرپرست خوابگاه'
        }
        breadcrumbLabel="تنظیمات سامانه"
        icon={<Settings className="w-5 h-5" />}
        onNavigateDashboard={onNavigateDashboard}
      />

      <SuccessBanner message={successMsg} onClose={() => setSuccessMsg('')} />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* User profile: display name and avatar for both administrators and supervisors */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <UserRound className="w-4 h-4 text-[#2563EB]" />
            <span>مشخصات کاربری و تصویر پروفایل</span>
          </h2>
          <StatusBadge
            label={user.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'}
            tone={user.role === 'admin' ? 'blue' : 'emerald'}
          />
        </div>

        <form
          onSubmit={handleProfileSave}
          className="mt-4 flex flex-col sm:flex-row items-start gap-5"
        >
          <div className="shrink-0 self-center sm:self-start flex flex-col items-center gap-2">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-lg shadow-slate-200 bg-slate-100 flex items-center justify-center">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={`تصویر پروفایل ${fullName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-extrabold text-slate-400">
                  {fullName
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('') || '؟'}
                </span>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePhotoChange}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={photoProcessing}
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60 transition-colors"
              >
                {photoProcessing ? (
                  <ImagePlus className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                <span>{photoProcessing ? 'در حال پردازش' : 'انتخاب تصویر'}</span>
              </button>
              {profilePhoto && (
                <button
                  type="button"
                  onClick={() => setProfilePhoto('')}
                  aria-label="حذف تصویر پروفایل"
                  title="حذف تصویر پروفایل"
                  className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 w-full space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="set-fullname"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  نام نمایشی در سامانه *
                </label>
                <input
                  id="set-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">
                  نام کاربری
                </span>
                <div
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 font-mono"
                  dir="ltr"
                >
                  {user.username}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              تصویر انتخابی به‌صورت خودکار فشرده می‌شود و در نوار بالای سامانه، منوی کاربری و
              بخش‌های نمایش مشخصات شما استفاده خواهد شد.
              {user.dormName && ` · خوابگاه: ${user.dormName}`}
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={profileSaving || photoProcessing}
                className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold transition-colors"
              >
                {profileSaving ? 'در حال ذخیره...' : 'ذخیره مشخصات'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Category 1: Account Security & Password */}
        <form
          onSubmit={handlePasswordChange}
          className={`${
            user.role === 'admin' ? 'lg:col-span-5' : 'lg:col-span-6 lg:col-start-4'
          } bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4`}
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#2563EB]" />
              <span>امنیت حساب و رمز عبور</span>
            </h2>
            <StatusBadge
              label={user.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'}
              tone={user.role === 'admin' ? 'blue' : 'emerald'}
            />
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              <span>{user.fullName}</span>
            </div>
            <div className="text-slate-500">
              نام کاربری: <span className="font-mono text-slate-700">{user.username}</span>
              {user.dormName && ` · خوابگاه: ${user.dormName}`}
            </div>
          </div>

          <div>
            <label htmlFor="pw-curr" className="block text-xs font-semibold text-slate-700 mb-1">
              رمز عبور فعلی *
            </label>
            <PasswordInput
              id="pw-curr"
              value={currentPassword}
              onChange={setCurrentPassword}
              required
            />
          </div>
          <div>
            <label htmlFor="pw-new" className="block text-xs font-semibold text-slate-700 mb-1">
              رمز عبور جدید (حداقل ۸ کاراکتر، شامل حرف و رقم) *
            </label>
            <PasswordInput
              id="pw-new"
              value={newPassword}
              onChange={setNewPassword}
              required
              minLength={8}
            />
          </div>
          <div>
            <label htmlFor="pw-conf" className="block text-xs font-semibold text-slate-700 mb-1">
              تکرار رمز عبور جدید *
            </label>
            <PasswordInput
              id="pw-conf"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              minLength={8}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold"
          >
            {saving ? 'در حال ذخیره...' : 'به‌روزرسانی رمز عبور'}
          </button>
        </form>

        {/* Category 2 & 3: General University Settings & Semester Settings (Admin Only) */}
        {user.role === 'admin' && (
          <form
            onSubmit={handleRequestSaveSettings}
            className="lg:col-span-7 space-y-5"
          >
            {/* Category 2: General University Settings */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#2563EB]" />
                  <span>تنظیمات عمومی دانشگاه</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  این مشخصات در سربرگ داشبورد و گزارش‌های رسمی چاپی / PDF نمایش داده می‌شود.
                </p>
              </div>
              <div>
                <label htmlFor="set-uni" className="block text-xs font-semibold text-slate-700 mb-1">
                  نام دانشگاه / مؤسسه *
                </label>
                <input
                  id="set-uni"
                  type="text"
                  required
                  value={universityName}
                  onChange={(e) => setUniversityName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label htmlFor="set-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  عنوان سامانه *
                </label>
                <input
                  id="set-title"
                  type="text"
                  required
                  value={systemTitle}
                  onChange={(e) => setSystemTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
            </div>

            {/* Category 3: Semester & Academic Year Settings */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#2563EB]" />
                  <span>تنظیمات نیمسال و سال تحصیلی</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  تعیین سال و نیمسال جاری دانشگاه برای درج در اسناد اسکان و گزارش‌ها
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="set-year" className="block text-xs font-semibold text-slate-700 mb-1">
                    سال تحصیلی *
                  </label>
                  <input
                    id="set-year"
                    type="text"
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="set-term" className="block text-xs font-semibold text-slate-700 mb-1">
                    نیمسال جاری *
                  </label>
                  <input
                    id="set-term"
                    type="text"
                    required
                    value={currentSemesterTitle}
                    onChange={(e) => setCurrentSemesterTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-bold"
                >
                  {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات سامانه'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Confirmation Modal for Global System Settings */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="تأیید ذخیره تنظیمات سراسری سامانه"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-700 leading-relaxed">
            آیا از اعمال تغییرات زیر در تنظیمات سراسری سامانه اطمینان دارید؟ این تغییرات بلافاصله در سربرگ تمام صفحات و خروجی‌های PDF گزارش‌ها اعمال می‌شود.
          </p>
          <div className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200 space-y-1.5 text-slate-700">
            <div>
              نام دانشگاه: <strong className="text-slate-900">{universityName}</strong>
            </div>
            <div>
              عنوان سامانه: <strong className="text-slate-900">{systemTitle}</strong>
            </div>
            <div>
              سال و نیمسال تحصیلی:{' '}
              <strong className="text-slate-900">
                {academicYear} ({currentSemesterTitle})
              </strong>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirmSaveSettings}
              className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold"
            >
              {saving ? 'در حال ذخیره...' : 'تأیید و ذخیره نهایی'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
