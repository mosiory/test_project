import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from './lib/api';
import {
  type AuthUser,
  type NavTab,
  type SystemSettings,
  getPathForTab,
  getTabForPath,
  isTabAllowedForRole,
} from './shared/dormRules';
import { AppShell } from './components/layout/AppShell';
import { LoginView } from './components/LoginView';
import { DashboardView, type DashboardPayload } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { RoomsView } from './components/RoomsView';
import { MovementsView } from './components/MovementsView';
import { ResidenceHistoryView } from './components/ResidenceHistoryView';
import { TransfersView } from './components/TransfersView';
import { DormitoriesView } from './components/DormitoriesView';
import { ReportsView } from './components/ReportsView';
import { AuditLogsView } from './components/AuditLogsView';
import { UsersView } from './components/UsersView';
import { BackupsView } from './components/BackupsView';
import { SettingsView } from './components/SettingsView';
import { ErrorState, ForbiddenView, PageSkeleton } from './components/ui/StateViews';
import { triggerLiveRefresh } from './lib/live';

/** بازهٔ به‌روزرسانی خودکار اطلاعات (میلی‌ثانیه) */
const LIVE_REFRESH_INTERVAL = 15000;

const DEFAULT_SETTINGS: SystemSettings = {
  universityName: 'دانشگاه ملی مهارت',
  systemTitle: 'سامانه مدیریت خوابگاه',
  academicYear: '۱۴۰۴-۱۴۰۵',
  currentSemesterTitle: 'نیمسال اول ۱۴۰۴',
};

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'داشبورد',
  students: 'مدیریت دانشجویان',
  dormitories: 'مدیریت خوابگاه‌ها',
  rooms: 'مدیریت اتاق‌ها',
  movements: 'جابه‌جایی دانشجویان',
  'residence-history': 'تاریخچه اقامت',
  transfers: 'درخواست‌های انتقال',
  reports: 'گزارش‌ها',
  'audit-logs': 'تاریخچه فعالیت‌ها',
  users: 'مدیریت کاربران',
  backups: 'پشتیبان‌گیری',
  settings: 'تنظیمات سامانه',
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    getTabForPath(window.location.pathname)
  );
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  const [roomNavDormId, setRoomNavDormId] = useState<number | undefined>(undefined);
  const [roomNavStatus, setRoomNavStatus] = useState<string>('');
  const [studentNavDormId, setStudentNavDormId] = useState<number | undefined>(undefined);

  const loadDashboard = useCallback(async (showLoader = false) => {
    if (showLoader) setDashboardLoading(true);
    setDashboardError('');
    try {
      const data = await apiRequest<DashboardPayload>('/api/dashboard');
      setDashboardData(data);
    } catch (err) {
      setDashboardError(
        err instanceof ApiError
          ? err.message
          : 'دریافت اطلاعات داشبورد از سرور انجام نشد. لطفاً دوباره تلاش کنید.'
      );
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    apiRequest<{ user: AuthUser | null; settings: SystemSettings }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        if (res.settings) setSettings(res.settings);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveTab(getTabForPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard(!dashboardData);
    } else {
      setDashboardData(null);
      setDashboardError('');
    }
    // dashboardData intentionally omitted: only decide the initial loader
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadDashboard]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  // به‌روزرسانی زندهٔ داده‌ها در همهٔ تب‌ها (هر ۱۵ ثانیه و هنگام بازگشت به پنجره)
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      loadDashboard();
      triggerLiveRefresh();
    };
    const timer = window.setInterval(tick, LIVE_REFRESH_INTERVAL);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, loadDashboard]);

  useEffect(() => {
    document.title = user
      ? `${TAB_TITLES[activeTab]} | ${settings.systemTitle}`
      : `ورود به سامانه | ${settings.systemTitle}`;
  }, [activeTab, user, settings.systemTitle]);

  const syncUrlToTab = (tab: NavTab) => {
    const targetPath = getPathForTab(tab);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  const handleLoginSuccess = (loggedUser: AuthUser) => {
    setUser(loggedUser);
    const currentTab = getTabForPath(window.location.pathname);
    const nextTab = isTabAllowedForRole(currentTab, loggedUser.role) ? currentTab : 'dashboard';
    setActiveTab(nextTab);
    syncUrlToTab(nextTab);
    setRoomNavDormId(undefined);
    setRoomNavStatus('');
    setStudentNavDormId(undefined);
    apiRequest<{ settings: SystemSettings }>('/api/settings')
      .then((res) => setSettings(res.settings))
      .catch(() => {});
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setDashboardData(null);
    setActiveTab('dashboard');
    syncUrlToTab('dashboard');
  };

  const handleNavigate = (
    tab: NavTab,
    options?: { dormId?: number; roomFilter?: string }
  ) => {
    if (tab === 'rooms') {
      setRoomNavDormId(options?.dormId);
      setRoomNavStatus(options?.roomFilter ?? '');
    } else if (tab === 'students') {
      setStudentNavDormId(options?.dormId);
    }
    setActiveTab(tab);
    syncUrlToTab(tab);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center">
        <div className="text-sm font-semibold text-slate-600">
          در حال بررسی نشست کاربری...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const dorms = dashboardData?.dorms ?? [];
  const isAllowed = isTabAllowedForRole(activeTab, user.role);

  return (
    <AppShell
      user={user}
      activeTab={activeTab}
      onSelectTab={(tab) => handleNavigate(tab)}
      onLogout={handleLogout}
      pendingTransfers={dashboardData?.pendingTransfers ?? []}
      systemTitle={settings.systemTitle}
    >
      {!isAllowed ? (
        <ForbiddenView onBack={() => handleNavigate('dashboard')} />
      ) : dashboardLoading && !dashboardData ? (
        <PageSkeleton cards={4} rows={5} gridClass="grid-cols-2 xl:grid-cols-4" />
      ) : dashboardError && !dashboardData ? (
        <ErrorState
          title="داشبورد سامانه بارگذاری نشد"
          description={dashboardError}
          onRetry={() => loadDashboard(true)}
        />
      ) : (
        <>
          {dashboardError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between gap-3"
            >
              <span>به‌روزرسانی اطلاعات با خطا مواجه شد؛ آخرین داده‌های دریافت‌شده نمایش داده می‌شود.</span>
              <button
                type="button"
                onClick={() => loadDashboard(true)}
                className="shrink-0 hover:underline"
              >
                تلاش دوباره
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && dashboardData && (
            <DashboardView
              user={user}
              data={dashboardData}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'students' && (
            <StudentsView
              user={user}
              dorms={dorms}
              initialDormId={studentNavDormId}
              onNavigateDashboard={() => handleNavigate('dashboard')}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'dormitories' && (
            <DormitoriesView
              dorms={dorms}
              onNavigate={handleNavigate}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomsView
              user={user}
              dorms={dorms}
              initialDormId={roomNavDormId}
              initialStatusFilter={roomNavStatus}
              onNavigateDashboard={() => handleNavigate('dashboard')}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'movements' && (
            <MovementsView
              user={user}
              onNavigateDashboard={() => handleNavigate('dashboard')}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'residence-history' && (
            <ResidenceHistoryView
              onNavigateDashboard={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'transfers' && (
            <TransfersView
              user={user}
              dorms={dorms}
              onNavigateDashboard={() => handleNavigate('dashboard')}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              user={user}
              dorms={dorms}
              settings={settings}
              onNavigateDashboard={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'audit-logs' && (
            <AuditLogsView
              user={user}
              dorms={dorms}
              onNavigateDashboard={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              currentUser={user}
              dorms={dorms}
              onNavigateDashboard={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'backups' && (
            <BackupsView onNavigateDashboard={() => handleNavigate('dashboard')} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              settings={settings}
              onNavigateDashboard={() => handleNavigate('dashboard')}
              onSettingsUpdated={setSettings}
              onProfileUpdated={setUser}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
