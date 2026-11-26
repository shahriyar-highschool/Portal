import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CircularSpinner({
  size = 'sm',
  label = 'Loading',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const sizeCls =
    size === 'xs'
      ? 'w-3.5 h-3.5 border-[1.75px]'
      : size === 'sm'
        ? 'w-4 h-4 border-2'
        : size === 'lg'
          ? 'w-7 h-7 border-[2.5px]'
          : 'w-5 h-5 border-2';
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full border-slate-200 dark:border-slate-700 border-t-[#0F274A] dark:border-t-sky-400 animate-spin shrink-0 ${sizeCls} ${className}`}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon: LucideIcon;
  loading?: boolean;
  subtitleLoading?: boolean;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  loading = false,
  subtitleLoading,
}: StatCardProps) {
  const showSubSpinner = subtitleLoading ?? loading;

  return (
    <div className="group bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 transition-colors duration-150 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
        {loading ? (
          <div className="mt-2.5 min-h-[26px] flex items-center">
            <CircularSpinner size="md" />
          </div>
        ) : (
          <p className="mt-2.5 text-[26px] leading-none font-extrabold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">
            {value}
          </p>
        )}
        {showSubSpinner ? (
          <div className="mt-2 min-h-[16px] flex items-center">
            <CircularSpinner size="xs" />
          </div>
        ) : (
          subtitle !== undefined &&
          subtitle !== null &&
          subtitle !== '' && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          )
        )}
      </div>
      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#0F274A] dark:text-sky-300 flex items-center justify-center shrink-0 group-hover:bg-[#0F274A] dark:group-hover:bg-sky-500 group-hover:text-white group-hover:border-[#0F274A] dark:group-hover:border-sky-500 transition-colors duration-150">
        <Icon className="w-[18px] h-[18px]" />
      </div>
    </div>
  );
}

