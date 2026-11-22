import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DatabaseBackup,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  type AuthUser,
  type NavTab,
  type TransferRequestRecord,
  formatShamsiHeaderDate,
  toPersianDigits,
} from '../../shared/dormRules';
import campusAvatar from '../../assets/images/supervisor_avatar_1794735773677.jpg';
import nusLogo from '../../assets/images/nus_logo.png';
import { BrandIdentity, SYSTEM_NAME } from '../ui/BrandIdentity';

export type { NavTab };

const SIDEBAR_STORAGE_KEY = 'khabgah:sidebar-collapsed';

interface AppShellProps {
  user: AuthUser;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  pendingTransfers: TransferRequestRecord[];
  systemTitle: string;
  children: ReactNode;
}

export function AppShell({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  pendingTransfers,
  systemTitle,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const { dateLine, timeLine } = formatShamsiHeaderDate();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // ذخیره‌سازی محلی در دسترس نیست؛ وضعیت فقط در همین نشست نگه داشته می‌شود
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  const incomingPendingCount =
    user.role === 'supervisor'
      ? pendingTransfers.filter((t) => t.toDormId === user.dormId).length
      : pendingTransfers.length;

  const visiblePendingTransfers =
    user.role === 'supervisor'
      ? pendingTransfers.filter((t) => t.toDormId === user.dormId)
      : pendingTransfers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const adminNav: Array<{ id: NavTab; label: string; icon: typeof Home; badge?: number }> = [
    { id: 'dashboard', label: 'داشبورد', icon: Home },
    { id: 'students', label: 'مدیریت دانشجویان', icon: Users },
    { id: 'dormitories', label: 'مدیریت خوابگاه‌ها', icon: Building2 },
    { id: 'rooms', label: 'مدیریت اتاق‌ها', icon: BedDouble },
    { id: 'movements', label: 'جابه‌جایی دانشجویان', icon: ArrowLeftRight },
    { id: 'residence-history', label: 'تاریخچه اقامت', icon: History },
    {
      id: 'transfers',
      label: 'درخواست‌های انتقال',
      icon: ArrowLeftRight,
      badge: pendingTransfers.length > 0 ? pendingTransfers.length : undefined,
    },
    { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
    { id: 'audit-logs', label: 'تاریخچه فعالیت‌ها', icon: History },
    { id: 'users', label: 'مدیریت کاربران', icon: ShieldCheck },
    { id: 'backups', label: 'پشتیبان‌گیری', icon: DatabaseBackup },
    { id: 'settings', label: 'تنظیمات سامانه', icon: Settings },
  ];

  const adminNavGroups: Array<{ label: string; items: typeof adminNav }> = [
    { label: 'مدیریت و بهره‌برداری', items: adminNav.slice(0, 4) },
    { label: 'اقامت و جابه‌جایی', items: adminNav.slice(4, 7) },
    { label: 'نظارت و گزارش', items: adminNav.slice(7, 9) },
    { label: 'مدیریت سامانه', items: adminNav.slice(9) },
  ];

  const supervisorNav: typeof adminNav = [
    { id: 'dashboard', label: 'داشبورد', icon: Home },
    { id: 'students', label: 'مدیریت دانشجویان', icon: Users },
    { id: 'rooms', label: 'مدیریت اتاق‌ها', icon: BedDouble },
    { id: 'movements', label: 'جابه‌جایی دانشجویان', icon: ArrowLeftRight },
    {
      id: 'transfers',
      label: 'درخواست‌های انتقال ورودی',
      icon: ArrowLeftRight,
      badge: incomingPendingCount > 0 ? incomingPendingCount : undefined,
    },
    { id: 'residence-history', label: 'تاریخچه اقامت', icon: History },
    { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
    { id: 'settings', label: 'تنظیمات', icon: Settings },
  ];

  const supervisorNavGroups: Array<{ label: string; items: typeof supervisorNav }> = [
    { label: 'خوابگاه من', items: supervisorNav.slice(0, 4) },
    { label: 'نظارت و گزارش', items: supervisorNav.slice(4) },
  ];

  const navGroups = user.role === 'admin' ? adminNavGroups : supervisorNavGroups;

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setProfileMenuOpen(false);
  };

  const renderSidebar = (collapsed: boolean, showToggle: boolean, onClose?: () => void) => (
    <div className="relative flex flex-col h-full bg-[#131E3A] text-slate-100 select-none">
      {showToggle && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={collapsed ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری'}
          aria-expanded={!collapsed}
          title={collapsed ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری'}
          className="hidden lg:flex absolute top-8 -left-3 z-40 w-6 h-6 items-center justify-center rounded-full bg-white text-slate-500 border border-slate-200 shadow-md hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          {collapsed ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Brand Block */}
      <div
        className={`shrink-0 flex items-center border-b border-slate-800/70 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? 'justify-center px-3 py-4' : 'px-4 py-4'
        }`}
      >
        {collapsed ? (
          <img
            src={nusLogo}
            alt="نشان دانشگاه ملی مهارت"
            className="h-10 w-10 rounded-xl bg-white p-1 object-contain shadow-md shadow-slate-950/30 animate-[labelIn_200ms_ease-out_both]"
          />
        ) : (
          <BrandIdentity
            title={systemTitle || SYSTEM_NAME}
            logoClassName="h-10 w-10 rounded-xl bg-white p-1 shadow-md shadow-slate-950/30"
            titleClassName="text-[13px] font-extrabold text-white"
            subtitleClassName="text-[11.5px] font-semibold text-slate-200"
            className="animate-[labelIn_220ms_ease-out_both]"
          />
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            title="بستن منو"
            className="ms-auto me-1 shrink-0 p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        className={`flex-1 px-2.5 py-3 ${collapsed ? 'overflow-visible' : 'overflow-y-auto no-scrollbar'}`}
        aria-label="منوی اصلی"
      >
        {navGroups.map((group, groupIdx) => (
          <div
            key={group.label}
            className={
              groupIdx === 0
                ? ''
                : `mt-2 pt-2 border-t ${collapsed ? 'border-white/10' : 'border-white/5'}`
            }
          >
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] font-bold tracking-wide text-slate-500 animate-[labelIn_200ms_ease-out_both]">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`group relative w-full flex items-center rounded-xl text-sm transition-all duration-200 ${
                      collapsed ? 'justify-center px-0 py-2.5' : 'justify-between gap-3 px-4 py-2'
                    } ${
                      isActive
                        ? 'bg-[#2563EB] text-white font-semibold shadow-md shadow-blue-950/40'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white font-medium'
                    }`}
                  >
                    <span className={`flex items-center min-w-0 ${collapsed ? '' : 'gap-3'}`}>
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && (
                        <span className="truncate animate-[labelIn_200ms_ease-out_both]">
                          {item.label}
                        </span>
                      )}
                    </span>
                    {!collapsed && item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-md bg-rose-500 text-white tabular-nums">
                        {toPersianDigits(item.badge)}
                      </span>
                    )}
                    {collapsed && item.badge !== undefined && (
                      <span className="absolute top-1 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                        {toPersianDigits(item.badge)}
                      </span>
                    )}
                    {collapsed && (
                      <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-lg bg-slate-950 text-white text-[11px] font-medium px-2.5 py-1.5 shadow-xl border border-white/10 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 z-50">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout Footer */}
      <div
        className={`border-t border-slate-800/80 transition-all duration-300 ${
          collapsed ? 'p-2' : 'p-3'
        }`}
      >
        <button
          type="button"
          onClick={onLogout}
          aria-label="خروج از سامانه"
          title={collapsed ? 'خروج از سامانه' : undefined}
          className={`group relative w-full flex items-center rounded-xl text-sm font-medium text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition-colors whitespace-nowrap ${
            collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>خروج از سامانه</span>}
          {collapsed && (
            <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 -translate-x-1 rounded-lg bg-slate-950 text-white text-[11px] font-medium px-2.5 py-1.5 shadow-xl border border-white/10 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 z-50">
              خروج از سامانه
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F3F6FB] text-slate-800">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-white focus:text-blue-700 focus:text-xs focus:font-bold focus:shadow-lg no-print"
      >
        پرش به محتوای اصلی
      </a>
      {/* Desktop Fixed Right Sidebar (collapsible) */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen z-30 no-print transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarCollapsed ? 'w-[84px]' : 'w-[17rem]'
        }`}
      >
        {renderSidebar(sidebarCollapsed, true)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-[17rem] h-full shadow-2xl animate-[drawerIn_260ms_cubic-bezier(0.22,1,0.36,1)_both]">
            {renderSidebar(false, false, () => setMobileMenuOpen(false))}
          </div>
          <button
            type="button"
            aria-label="بستن منو"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-900/50 backdrop-blur-xs animate-[fadeIn_220ms_ease-out_both]"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar matching reference screenshots */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline lg:hidden text-xs font-bold text-slate-800 truncate">
              {systemTitle}
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {/* Persian Date & Time */}
            <div className="hidden sm:flex items-center gap-3 text-slate-700">
              <Calendar className="w-5 h-5 text-slate-600 shrink-0" />
              <div className="text-center leading-tight tabular-nums">
                <div className="text-[15px] font-extrabold text-slate-800 tracking-tight">
                  {dateLine}
                </div>
                {timeLine && (
                  <div className="text-[13px] font-bold text-slate-600 mt-1 num">{timeLine}</div>
                )}
              </div>
            </div>

            <div className="hidden sm:block h-7 w-px bg-slate-200" aria-hidden="true" />

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                aria-label="اعلان‌های انتقال"
                aria-expanded={notifOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {incomingPendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {toPersianDigits(incomingPendingCount)}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="menu"
                  className="fixed left-3 right-3 top-[4.5rem] w-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-40"
                >
                  <div className="px-4 py-3 bg-[#EEF4FF] border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      درخواست‌های انتقال در انتظار
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavClick('transfers')}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      مشاهده همه
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto no-scrollbar divide-y divide-slate-100">
                    {visiblePendingTransfers.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500">
                        اعلان جدیدی وجود ندارد.
                      </div>
                    ) : (
                      visiblePendingTransfers.slice(0, 5).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          onClick={() => handleNavClick('transfers')}
                          className="w-full text-right px-4 py-3 hover:bg-slate-50 transition-colors block"
                        >
                          <div className="text-xs font-semibold text-slate-800">
                            {t.studentName} ({toPersianDigits(t.studentNumber)})
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              از {t.fromDormName} به {t.toDormName} (اتاق{' '}
                              {toPersianDigits(t.toRoomNumber ?? '—')})
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="h-7 w-px bg-slate-200" aria-hidden="true" />

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2.5 py-1 px-1.5 sm:px-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <img
                  src={user.photoUrl || campusAvatar}
                  alt={user.fullName}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0"
                />
                <div className="text-right leading-tight hidden min-[360px]:block">
                  <div className="text-sm font-bold text-slate-800 whitespace-nowrap">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 whitespace-nowrap mt-0.5">
                    {user.role === 'admin' ? 'مدیر کل سامانه' : 'سرپرست خوابگاه'}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {profileMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40"
                >
                  <div className="px-4 py-2 border-b border-slate-100 sm:hidden">
                    <div className="text-xs font-bold text-slate-800">{user.fullName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {user.role === 'admin' ? 'مدیر کل سامانه' : user.dormName ?? 'سرپرست خوابگاه'}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleNavClick('settings')}
                    className="w-full text-right px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>تنظیمات و تغییر رمز عبور</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="w-full text-right px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>خروج از سامانه</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-3 sm:p-4 lg:p-6 pb-8 max-w-[1440px] w-full mx-auto outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
