import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SchoolSettings, UserAccount } from '../shared/types';
import { apiRequest, getStoredToken, isWorkerApiMode } from './lib/api';
import { I18nProvider, useI18n } from './lib/i18n';
import { ThemeProvider, useTheme } from './lib/theme';
import { LoginView } from './components/auth/LoginView';
import { AdminPortal } from './components/panels/AdminPortal';
import { StudentPortal } from './components/panels/StudentPortal';
import { TeacherPortal } from './components/panels/TeacherPortal';
import { ToastProvider } from './components/ui/Toast';

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
          <SchoolPlatformRoot />
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
