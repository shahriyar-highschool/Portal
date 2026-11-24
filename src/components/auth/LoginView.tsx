import {
  AlertCircle,
  BookOpen,
  Calendar,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  KeyRound,
  Loader2,
  Moon,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SchoolSettings, UserAccount } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

interface LoginViewProps {
  initialized: boolean;
  schoolName: string;
  onRefreshStatus?: () => void;
  onAuthenticated: (user: UserAccount, settings?: SchoolSettings) => void;
}

const HERO_IMG = '/assets/aistudio/image_29532093_cropped.jpg';
const EMBLEM_IMG = '/assets/aistudio/image_1b3c1aaa.png';

export function LoginView({ initialized, schoolName, onRefreshStatus, onAuthenticated }: LoginViewProps) {
  const { lang, isRtl, toggleLang, tr, schoolTitle } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial / hidden admin creation state
  const [secretAdminOpen, setSecretAdminOpen] = useState(false);
  const [setupKey, setSetupKey] = useState('');
  const [setupFullName, setSetupFullName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupNationalId, setSetupNationalId] = useState('');
  const [setupPassword, setSetupPassword] = useState('');

  const [heroError, setHeroError] = useState(false);
  const [emblemError, setEmblemError] = useState(false);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const normalizeComboKey = (e: KeyboardEvent): string | null => {
      if (e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.key === 'ی') return 'Y';
      if (e.code === 'KeyB' || e.key.toLowerCase() === 'b' || e.key === 'ذ') return 'B';
      return null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = normalizeComboKey(e);
      if (!k) return;
      pressedKeysRef.current.add(k);
      if (pressedKeysRef.current.has('Y') && pressedKeysRef.current.has('B')) {
        e.preventDefault();
        setError(null);
        setSecretAdminOpen(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = normalizeComboKey(e);
      if (k) pressedKeysRef.current.delete(k);
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const localizeLoginError = (rawMessage: string): string => {
    if (lang === 'fa') return rawMessage;
    if (rawMessage.includes('حساب کاربری') && (rawMessage.includes('وجود ندارد') || rawMessage.includes('یافت نشد'))) {
      return 'No account exists with this username.';
    }
    if (rawMessage.includes('نام کاربری یا رمز عبور اشتباه')) {
      return 'Incorrect username or password.';
    }
    if (rawMessage.includes('غیرفعال')) {
      return 'This account has been disabled. Please contact the school administrator.';
    }
    if (rawMessage.includes('نام کاربری و رمز عبور')) {
      return 'Please enter your username and password.';
    }
    if (rawMessage.includes('نام کاربری')) {
      return 'Please enter your username.';
    }
    if (rawMessage.includes('رمز عبور')) {
      return 'Please enter your password.';
    }
    if (rawMessage.includes('Timeout') || rawMessage.includes('سرور احراز هویت') || rawMessage.includes('اتصال')) {
      return 'Unable to reach the authentication server. Please try again.';
    }
    return rawMessage;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier && !password) {
      setError(tr('لطفاً نام کاربری و رمز عبور خود را وارد کنید.', 'Please enter your username and password.'));
      return;
    }
    if (!trimmedIdentifier) {
      setError(tr('لطفاً نام کاربری خود را وارد کنید.', 'Please enter your username.'));
      return;
    }
    if (!password) {
      setError(tr('لطفاً رمز عبور خود را وارد کنید.', 'Please enter your password.'));
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ user: UserAccount; settings: SchoolSettings }>('/api/auth/login', {
        method: 'POST',
        notify: false,
        silentError: true,
        body: JSON.stringify({ identifier: trimmedIdentifier, password }),
      });
      onAuthenticated(data.user, data.settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr('خطا در ورود به سامانه.', 'Login failed.');
      setError(localizeLoginError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!setupKey.trim()) {
      setError(tr('وارد کردن کلید راه‌اندازی سرور الزامی است.', 'Server setup key is required.'));
      return;
    }
    setLoading(true);
    try {
      const endpoint = !initialized ? '/api/setup/initialize' : '/api/setup/admin';
      const data = await apiRequest<{ user: UserAccount; settings?: SchoolSettings }>(endpoint, {
        method: 'POST',
        notify: false,
        silentError: true,
        body: JSON.stringify({
          setupKey: setupKey.trim(),
          fullName: setupFullName.trim(),
          username: setupUsername.trim(),
          nationalId: setupNationalId.trim(),
          password: setupPassword,
        }),
      });
      onAuthenticated(data.user, data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('خطا در تعریف مدیر سامانه', 'Failed to create admin account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-slate-950 grid grid-cols-1 lg:grid-cols-12">
      {/* Form Column */}
      <div
        className={`lg:col-span-6 xl:col-span-5 flex flex-col justify-between px-4 py-6 sm:px-10 bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 ${
          isRtl ? 'lg:border-l' : 'lg:border-r'
        }`}
      >
        {/* Top Controls Bar: Language + Theme + Branding */}
        <div className="max-w-lg w-full mx-auto flex items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {!emblemError ? (
              <img
                src={EMBLEM_IMG}
                alt={schoolTitle(schoolName)}
                referrerPolicy="no-referrer"
                onError={() => setEmblemError(true)}
                className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#0F274A] text-white flex items-center justify-center font-bold text-base shrink-0">
                {tr('ش', 'S')}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {schoolTitle(schoolName)}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {tr('درگاه هوشمند آموزش و ارزشیابی', 'Smart Academic & AI Portal')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              title={tr('تغییر زبان به انگلیسی', 'Switch to Persian')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
              <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? tr('حالت روشن', 'Light Mode') : tr('حالت تیره', 'Dark Mode')}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="max-w-lg w-full mx-auto my-auto py-5">
          {!initialized || secretAdminOpen ? (
            <form onSubmit={handleSetup} className="space-y-4">
              {!initialized ? (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-sm font-extrabold text-amber-950 dark:text-amber-200">
                      {tr('مدیر سامانه هنوز تعریف نشده است', 'System Administrator Not Configured')}
                    </h2>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-5">
                      {tr(
                        'در حال حاضر هیچ حساب مدیری در سرور ثبت نشده است. لطفاً اولین مدیر سامانه را تعریف کنید تا پنل‌های مدرسه فعال شوند.',
                        'No administrator account is registered on the server yet. Create the initial administrator account to activate the school portal.'
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#0F274A] dark:text-sky-400 shrink-0" />
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {tr('ایجاد مدیر جدید', 'Create New Administrator')}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {tr('اطلاعات حساب مدیر جدید را وارد کنید.', 'Enter the new administrator account details.')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSecretAdminOpen(false);
                      setError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {tr('بازگشت', 'Back')}
                  </button>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('نام و نام خانوادگی مدیر', 'Administrator Full Name')}
                </label>
                <input
                  type="text"
                  required
                  value={setupFullName}
                  onChange={(e) => setSetupFullName(e.target.value)}
                  placeholder={tr('مثلاً یاشار حسینی', 'e.g. Yashar Hosseini')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('نام کاربری مدیر', 'Admin Username')}
                  </label>
                  <input
                    type="text"
                    required
                    pattern="[a-zA-Z0-9._-]{3,32}"
                    dir="ltr"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('کد ملی (اختیاری)', 'National ID (Optional)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={setupNationalId}
                    onChange={(e) => setSetupNationalId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('کلید راه‌اندازی سرور (الزامی)', 'Server Setup Key (Required)')}
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  placeholder="ADMIN_SETUP_KEY"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('رمز عبور مدیر (حداقل ۸ کاراکتر)', 'Admin Password (min 8 chars)')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    dir="ltr"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3.5 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-sm font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{tr('تعریف مدیر و ورود به سامانه', 'Create Admin & Enter Portal')}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} noValidate className="space-y-4">
              <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {tr('ورود به حساب کاربری', 'Sign In to Your Account')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-5">
                    {tr(
                      'نام کاربری و رمز عبور خود را برای ورود به پنل اختصاصی وارد کنید.',
                      'Enter your username and password assigned by the school administrator.'
                    )}
                  </p>
                </div>
                {onRefreshStatus && (
                  <button
                    type="button"
                    onClick={onRefreshStatus}
                    title={tr('بررسی مجدد وضعیت سرور', 'Refresh server status')}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-medium text-red-800 dark:text-red-300 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('نام کاربری', 'Username')}
                </label>
                <div className="relative">
                  <UserCheck
                    className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                      isRtl ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    id="login-identifier"
                    type="text"
                    dir="ltr"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-10 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-400 focus:ring-4 focus:ring-[#0F274A]/10 transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('رمز عبور', 'Password')}
                </label>
                <div className="relative">
                  <KeyRound
                    className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                      isRtl ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-10 py-2.5 text-sm font-mono text-left text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-400 focus:ring-4 focus:ring-[#0F274A]/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? tr('مخفی کردن رمز', 'Hide password') : tr('نمایش رمز', 'Show password')}
                    className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ${
                      isRtl ? 'left-3' : 'right-3'
                    }`}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-sm font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{tr('ورود به سامانه مدرسه', 'Sign In to Portal')}</span>
              </button>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center pt-1">
                {tr(
                  'ایجاد و ثبت‌نام حساب‌های کاربری فقط توسط مدیر مدرسه انجام می‌شود.',
                  'User accounts and registrations are managed exclusively by the school administrator.'
                )}
              </p>
            </form>
          )}
        </div>

        <div className="max-w-lg w-full mx-auto pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between gap-2">
          <span className="truncate">{schoolTitle(schoolName)}</span>
          <span className="shrink-0">{tr('ذخیره‌سازی امن پایگاه داده', 'Database-Backed Auth')}</span>
        </div>
      </div>

      {/* Architectural Visual Column */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative bg-slate-950 overflow-hidden items-end">
        {!heroError ? (
          <img
            src={HERO_IMG}
            alt={schoolTitle(schoolName)}
            referrerPolicy="no-referrer"
            onError={() => setHeroError(true)}
            className="absolute inset-0 w-full h-full object-cover object-[50%_20%]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0F274A] via-slate-900 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/10" />

        <div className="relative z-10 p-10 xl:p-12 w-full max-w-3xl text-white">
          <p className="text-xs font-semibold text-amber-300 mb-2">
            {tr('پلتفرم جامع مدیریت آموزشی', 'Comprehensive Smart School Platform')}
          </p>
          <h2 className="text-3xl xl:text-4xl font-extrabold leading-snug">
            {schoolTitle(schoolName)}
          </h2>
          <p className="mt-3 text-sm text-slate-200 leading-7 max-w-xl">
            {tr(
              'یکپارچه‌سازی فرآیندهای آموزشی، آزمون‌های آنلاین، برنامه‌ریز مطالعه، ارزشیابی مستمر و دستیار هوش مصنوعی اختصاصی برای دانش‌آموزان، دبیران و مدیریت مدرسه.',
              'Unifying grades, online exams, study planning, attendance, academic calendar, and role-scoped AI tutoring for students, teachers, and administration.'
            )}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/15">
            <div className="space-y-1">
              <GraduationCap className="w-4 h-4 text-amber-300" />
              <p className="text-xs font-bold text-white">{tr('پنل دانش‌آموز', 'Student Portal')}</p>
              <p className="text-[11px] text-slate-300">{tr('کارنامه، آزمون و برنامه', 'Grades, exams & planner')}</p>
            </div>
            <div className="space-y-1">
              <BookOpen className="w-4 h-4 text-amber-300" />
              <p className="text-xs font-bold text-white">{tr('پنل معلم', 'Teacher Portal')}</p>
              <p className="text-[11px] text-slate-300">{tr('نمرات، حضور و آزمون', 'Grading & classes')}</p>
            </div>
            <div className="space-y-1">
              <Users className="w-4 h-4 text-amber-300" />
              <p className="text-xs font-bold text-white">{tr('پنل مدیریت', 'Admin Console')}</p>
              <p className="text-[11px] text-slate-300">{tr('کلاس‌ها، دسترسی و آمار', 'Analytics & approvals')}</p>
            </div>
            <div className="space-y-1">
              <Calendar className="w-4 h-4 text-amber-300" />
              <p className="text-xs font-bold text-white">{tr('تقویم و هوش مصنوعی', 'Calendar & AI')}</p>
              <p className="text-[11px] text-slate-300">{tr('دستیار هوشمند هر نقش', 'Streaming AI assistant')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
