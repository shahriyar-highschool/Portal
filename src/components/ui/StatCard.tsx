import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
}

export function StatCard({ label, value, subtitle, icon: Icon }: StatCardProps) {
  return (
    <div className="group bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 transition-colors duration-150 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <p className="mt-2.5 text-[26px] leading-none font-extrabold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">
          {value}
        </p>
        {subtitle && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
      </div>
      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[#0F274A] dark:text-sky-300 flex items-center justify-center shrink-0 group-hover:bg-[#0F274A] dark:group-hover:bg-sky-500 group-hover:text-white group-hover:border-[#0F274A] dark:group-hover:border-sky-500 transition-colors duration-150">
        <Icon className="w-[18px] h-[18px]" />
      </div>
    </div>
  );
}
