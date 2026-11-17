import { useState, type FormEvent } from 'react';
import { Lock, User } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import type { AuthUser } from '../shared/dormRules';
import campusBanner from '../assets/images/campus_dorm_banner_1794735771856.jpg';
import { BrandIdentity } from './ui/BrandIdentity';
import { PasswordInput } from './ui/PasswordInput';

interface LoginViewProps {
  onSuccess: (user: AuthUser) => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onSuccess(res.user);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'ورود با خطا مواجه شد. لطفاً مجدداً تلاش کنید.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF3FA] flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Right Side: Login Form */}
        <div className="lg:col-span-6 p-8 lg:p-12 flex flex-col justify-center">
          <div className="mb-8">
            <BrandIdentity
              logoClassName="h-14 w-auto"
              titleClassName="text-lg sm:text-xl font-extrabold text-slate-900"
              subtitleClassName="text-xs font-semibold text-slate-600"
              className="animate-[labelIn_260ms_ease-out_both]"
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                نام کاربری
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-username"
                  type="text"
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all text-left"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                رمز عبور
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="py-2.5 pr-10 bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-md shadow-blue-600/20 transition-all"
            >
              {loading ? 'در حال بررسی اطلاعات...' : 'ورود به سامانه'}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-slate-500 leading-5 text-center border-t border-slate-100 pt-5">
            دسترسی به این پورتال فقط برای حساب‌های مدیریتی مجاز است. در صورت فراموشی رمز عبور
            با مسئول کل سامانه تماس بگیرید.
          </p>
        </div>

        {/* Left Side: Campus Visual Showcase */}
        <div className="lg:col-span-6 relative min-h-[280px] lg:min-h-[540px] bg-[#131E3A] overflow-hidden flex flex-col justify-end">
          <img
            src={campusBanner}
            alt="ساختمان خوابگاه دانشگاه"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131E3A] via-[#131E3A]/45 to-transparent" />

          <div className="relative z-10 p-8 text-white">
            <h2 className="text-2xl font-extrabold leading-snug">
              مدیریت متمرکز و هوشمند خوابگاه‌های دانشجویی
            </h2>
            <p className="text-xs text-slate-200 mt-3 leading-relaxed">
              کنترل دقیق ظرفیت اتاق‌ها، ثبت و پیگیری جابه‌جایی‌های داخلی، فرآیند تاییدشده انتقال بین خوابگاه‌ها و گزارش‌گیری جامع در یک بستر امن.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
