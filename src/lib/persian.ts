const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFaDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function formatFaNumber(num: number | undefined | null, decimals = 2): string {
  if (num === undefined || num === null || Number.isNaN(num)) return '۰';
  const fixed = Number.isInteger(num) ? String(num) : num.toFixed(decimals).replace(/\.?0+$/, '');
  return toFaDigits(fixed);
}

export function formatJalaliDate(isoOrDate: string | undefined): string {
  if (!isoOrDate) return '—';
  // If already a Jalali formatted string like 1404/08/18
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(isoOrDate) || /^[۰-۹]{4}\//.test(isoOrDate)) {
    return toFaDigits(isoOrDate);
  }
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return toFaDigits(isoOrDate);
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return toFaDigits(isoOrDate);
  }
}

export function formatJalaliDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toFaDigits(iso);
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return toFaDigits(iso);
  }
}

export const ROLE_LABELS: Record<'student' | 'teacher' | 'admin', string> = {
  student: 'دانش‌آموز',
  teacher: 'معلم',
  admin: 'مدیر سامانه',
};

export const WEEKDAYS_FA = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
];

export const GRADE_LEVELS_FA = ['هفتم', 'هشتم', 'نهم'];

export const ATTENDANCE_STATUS_META: Record<
  'present' | 'absent' | 'late' | 'excused',
  { label: string; textClass: string; bgClass: string }
> = {
  present: { label: 'حاضر', textClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-200' },
  absent: { label: 'غایب', textClass: 'text-red-700', bgClass: 'bg-red-50 border-red-200' },
  late: { label: 'تأخیر', textClass: 'text-amber-700', bgClass: 'bg-amber-50 border-amber-200' },
  excused: { label: 'غیبت موجه', textClass: 'text-slate-700', bgClass: 'bg-slate-100 border-slate-200' },
};

export const SUBMISSION_STATUS_LABELS: Record<'pending' | 'submitted' | 'graded' | 'late', string> = {
  pending: 'در انتظار ارسال',
  submitted: 'ارسال‌شده (در انتظار بررسی)',
  graded: 'نمره‌دهی شده',
  late: 'ارسال با تأخیر',
};

export const PRIORITY_LABELS: Record<'normal' | 'important' | 'urgent', { label: string; textClass: string }> = {
  normal: { label: 'عادی', textClass: 'text-slate-600' },
  important: { label: 'مهم', textClass: 'text-amber-700' },
  urgent: { label: 'فوری', textClass: 'text-red-700' },
};
