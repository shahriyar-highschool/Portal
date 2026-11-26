import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  AppLanguage,
  AttendanceStatus,
  GradeTerm,
  SubmissionStatus,
  UserRole,
} from '../../shared/types';
import { formatFaNumber, toFaDigits } from './persian';

const LANG_STORAGE_KEY = 'shahriar_lang';

interface I18nContextValue {
  lang: AppLanguage;
  dir: 'rtl' | 'ltr';
  isRtl: boolean;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  /** Instant inline bilingual translator: returns fa when lang==='fa', else en */
  tr: (fa: string, en: string) => string;
  /** Format digits/numbers according to active language */
  fmtNum: (value: number | null | undefined, decimals?: number) => string;
  fmtDigits: (value: string | number | null | undefined) => string;
  fmtDate: (isoOrDate: string | undefined) => string;
  fmtDateTime: (iso: string | undefined) => string;
  roleLabel: (role: UserRole) => string;
  termLabel: (term: GradeTerm | string) => string;
  weekdayLabel: (dayIndex: number) => string;
  attendanceLabel: (status: AttendanceStatus) => string;
  submissionLabel: (status: SubmissionStatus) => string;
  priorityLabel: (priority: 'normal' | 'important' | 'urgent') => string;
  schoolTitle: (customName?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const ROLE_EN: Record<UserRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
};

const ROLE_FA: Record<UserRole, string> = {
  student: 'دانش‌آموز',
  teacher: 'معلم',
  admin: 'مدیر سامانه',
};

const TERM_EN: Record<string, string> = {
  'مستمر اول': 'Continuous Term 1',
  'نوبت اول': 'First Semester',
  'مستمر دوم': 'Continuous Term 2',
  'نوبت دوم': 'Second Semester',
};

const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];
const WEEKDAYS_EN = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

const ATT_FA: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غایب',
  late: 'تأخیر',
  excused: 'غیبت موجه',
};

const ATT_EN: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

const SUB_FA: Record<SubmissionStatus, string> = {
  pending: 'در انتظار ارسال',
  submitted: 'ارسال‌شده (در انتظار بررسی)',
  graded: 'نمره‌دهی شده',
  late: 'ارسال با تأخیر',
};

const SUB_EN: Record<SubmissionStatus, string> = {
  pending: 'Pending Submission',
  submitted: 'Submitted (Awaiting Review)',
  graded: 'Graded',
  late: 'Submitted Late',
};

const PRIO_FA: Record<'normal' | 'important' | 'urgent', string> = {
  normal: 'عادی',
  important: 'مهم',
  urgent: 'فوری',
};

const PRIO_EN: Record<'normal' | 'important' | 'urgent', string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
};

function readInitialLang(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {
    // ignore
  }
  return 'fa';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(readInitialLang);
  const dir: 'rtl' | 'ltr' = lang === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
    document.title =
      lang === 'fa'
        ? 'سامانه هوشمند دبیرستان استعدادهای درخشان استاد شهریار'
        : 'Ostad Shahriyar Gifted High School — Smart Portal';
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang, dir]);

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'fa' ? 'en' : 'fa'));
  }, []);

  const tr = useCallback((fa: string, en: string) => (lang === 'fa' ? fa : en), [lang]);

  const fmtDigits = useCallback(
    (value: string | number | null | undefined) => {
      if (value === null || value === undefined) return '';
      if (lang === 'fa') return toFaDigits(value);
      // Normalize Persian digits to Latin when switching to English
      return String(value)
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    },
    [lang]
  );

  const fmtNum = useCallback(
    (value: number | null | undefined, decimals = 2) => {
      if (value === undefined || value === null || Number.isNaN(value)) {
        return lang === 'fa' ? '۰' : '0';
      }
      if (lang === 'fa') return formatFaNumber(value, decimals);
      return Number.isInteger(value) ? String(value) : value.toFixed(decimals).replace(/\.?0+$/, '');
    },
    [lang]
  );

  const fmtDate = useCallback(
    (isoOrDate: string | undefined) => {
      if (!isoOrDate) return '—';
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(isoOrDate) || /^[۰-۹]{4}\//.test(isoOrDate)) {
        return fmtDigits(isoOrDate);
      }
      const d = new Date(isoOrDate);
      if (Number.isNaN(d.getTime())) return fmtDigits(isoOrDate);
      try {
        return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }).format(d);
      } catch {
        return fmtDigits(isoOrDate);
      }
    },
    [lang, fmtDigits]
  );

  const fmtDateTime = useCallback(
    (iso: string | undefined) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return fmtDigits(iso);
      try {
        return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(d);
      } catch {
        return fmtDigits(iso);
      }
    },
    [lang, fmtDigits]
  );

  const roleLabel = useCallback(
    (role: UserRole) => (lang === 'fa' ? ROLE_FA[role] : ROLE_EN[role]),
    [lang]
  );

  const termLabel = useCallback(
    (term: GradeTerm | string) => (lang === 'fa' ? term : TERM_EN[term] ?? term),
    [lang]
  );

  const weekdayLabel = useCallback(
    (dayIndex: number) =>
      lang === 'fa' ? WEEKDAYS_FA[dayIndex] ?? '' : WEEKDAYS_EN[dayIndex] ?? '',
    [lang]
  );

  const attendanceLabel = useCallback(
    (status: AttendanceStatus) => (lang === 'fa' ? ATT_FA[status] : ATT_EN[status]),
    [lang]
  );

  const submissionLabel = useCallback(
    (status: SubmissionStatus) => (lang === 'fa' ? SUB_FA[status] : SUB_EN[status]),
    [lang]
  );

  const priorityLabel = useCallback(
    (priority: 'normal' | 'important' | 'urgent') =>
      lang === 'fa' ? PRIO_FA[priority] : PRIO_EN[priority],
    [lang]
  );

  const schoolTitle = useCallback(
    (customName?: string) => {
      if (lang === 'fa') {
        return customName?.trim() || 'دبیرستان استعدادهای درخشان استاد شهریار';
      }
      return 'Ostad Shahriyar Gifted High School';
    },
    [lang]
  );

  return (
    <I18nContext.Provider
      value={{
        lang,
        dir,
        isRtl: dir === 'rtl',
        setLang,
        toggleLang,
        tr,
        fmtNum,
        fmtDigits,
        fmtDate,
        fmtDateTime,
        roleLabel,
        termLabel,
        weekdayLabel,
        attendanceLabel,
        submissionLabel,
        priorityLabel,
        schoolTitle,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
