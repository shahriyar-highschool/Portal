import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import type { SchoolSettings, UserAccount } from '../shared/types';
import { apiRequest, getStoredToken, isWorkerApiMode } from './lib/api';
import { I18nProvider, useI18n } from './lib/i18n';
import { ThemeProvider, useTheme } from './lib/theme';
import { LoginView } from './components/auth/LoginView';
import { AdminPortal } from './components/panels/AdminPortal';
import { StudentPortal } from './components/panels/StudentPortal';
import { TeacherPortal } from './components/panels/TeacherPortal';
import { ToastProvider } from './components/ui/Toast';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const isRtl = typeof document !== 'undefined' && document.documentElement.dir !== 'ltr';
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'خطای غیرمنتظره در نمایش بخش' : 'Unexpected Interface Error'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {isRtl
                  ? 'در پردازش این نما مشکلی پیش آمد. می‌توانید بدون از دست رفتن نشست کاری خود دوباره تلاش کنید.'
                  : 'Something went wrong while rendering this view. You can retry safely without losing your session.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تلاش مجدد' : 'Retry'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span>{isRtl ? 'بارگذاری مجدد صفحه' : 'Reload Page'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SchoolPlatformRoot() {
  const { tr, setLang } = useI18n();
  const { setTheme } = useTheme();
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState(true);
  const [schoolName, setSchoolName] = useState('دبیرستان استعدادهای درخشان استاد شهریار');
  const [user, setUser] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);

  const syncAccountPreferences = useCallback(
    (u: UserAccount) => {
      if (u.preferredLanguage === 'fa' || u.preferredLanguage === 'en') {
        setLang(u.preferredLanguage);
      }
      if (u.preferredTheme === 'light' || u.preferredTheme === 'dark') {
        setTheme(u.preferredTheme);
      }
    },
    [setLang, setTheme]
  );

  const checkSession = useCallback(async () => {
    try {
      setChecking(true);
      const bootstrap = await apiRequest<{ initialized: boolean; schoolName: string }>(
        '/api/auth/bootstrap-status',
        { silentError: true }
      );
      setInitialized(bootstrap.initialized);
      setSchoolName(bootstrap.schoolName);

      if (bootstrap.initialized) {
        if (isWorkerApiMode() && !getStoredToken()) {
          setUser(null);
          return;
        }
        try {
          const me = await apiRequest<{ user: UserAccount; settings: SchoolSettings }>('/api/auth/me', {
            silentError: true,
          });
          setUser(me.user);
          setSettings(me.settings);
          syncAccountPreferences(me.user);
        } catch {
          setUser(null);
        }
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, [syncAccountPreferences]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    await checkSession();
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300 px-4 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0F274A] dark:text-sky-400" />
        <p className="text-xs font-medium">
          {tr(
            'در حال بارگذاری سامانه هوشمند دبیرستان استعدادهای درخشان استاد شهریار...',
            'Loading Ostad Shahriyar Gifted High School Smart Portal...'
          )}
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        initialized={initialized}
        schoolName={schoolName}
        onRefreshStatus={() => void checkSession()}
        onAuthenticated={(loggedInUser, loadedSettings) => {
          setUser(loggedInUser);
          setInitialized(true);
          syncAccountPreferences(loggedInUser);
          if (loadedSettings) setSettings(loadedSettings);
          else void checkSession();
        }}
      />
    );
  }

  if (user.role === 'student') {
    return (
      <StudentPortal
        user={user}
        settings={settings}
        onUserUpdated={setUser}
        onLogout={() => void handleLogout()}
      />
    );
  }

  if (user.role === 'teacher') {
    return (
      <TeacherPortal
        user={user}
        settings={settings}
        onUserUpdated={setUser}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <AdminPortal
      user={user}
      settings={settings}
      onSettingsUpdated={setSettings}
      onUserUpdated={setUser}
      onLogout={() => void handleLogout()}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AppErrorBoundary>
            <SchoolPlatformRoot />
          </AppErrorBoundary>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
