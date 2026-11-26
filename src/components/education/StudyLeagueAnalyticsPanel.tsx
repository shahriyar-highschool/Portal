import {
  AlertTriangle,
  ArrowDownUp,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Flame,
  Layers,
  MessageSquareHeart,
  Printer,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  AdminLeagueAnalytics,
  LeagueCompletionDistribution,
  LeagueLogStatusBreakdown,
  LeagueSubjectBreakdownItem,
  LeagueWeeklyTrendPoint,
  SchoolClass,
  StudentLeagueAnalytics,
  StudyLog,
  Subject,
  TeacherLeagueAnalytics,
  UserRole,
} from '../../../shared/types';
import { useI18n } from '../../lib/i18n';
import { HorizontalBarChart, LineTrendChart } from '../ui/Charts';
import { CircularSpinner } from '../ui/StatCard';

type ReportSection = 'all' | 'overview' | 'classes_subjects' | 'students' | 'alerts_logs';
type DailyMetric = 'hours' | 'tests' | 'points' | 'logsCount' | 'activeStudents';
type WeeklyMetric = 'hours' | 'tests' | 'points' | 'activeStudents';
type ClassMetric = 'avgPoints' | 'avgCompletionPercent' | 'totalHours' | 'participationRate';
type StudentSortKey =
  | 'rank'
  | 'studentName'
  | 'points'
  | 'weeklyPoints'
  | 'hours'
  | 'tests'
  | 'completionPercent'
  | 'streakDays'
  | 'logsCount';

function ProgressBarCell({
  percent,
  fmtNum,
  pctSign,
}: {
  percent: number;
  fmtNum: (v: number, d?: number) => string;
  pctSign: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor =
    clamped >= 80
      ? 'bg-emerald-600 dark:bg-emerald-500'
      : clamped >= 50
        ? 'bg-sky-600 dark:bg-sky-500'
        : clamped >= 25
          ? 'bg-amber-500 dark:bg-amber-400'
          : 'bg-red-500 dark:bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200 w-10 text-end">
        {fmtNum(percent, 0)}
        {pctSign}
      </span>
    </div>
  );
}

function DailyActivityChart({
  title,
  subtitle,
  series,
  metric,
  windowDays,
  onChangeMetric,
  onChangeWindow,
}: {
  title: string;
  subtitle: string;
  series: Array<{
    date: string;
    label: string;
    hours: number;
    tests: number;
    pages: number;
    points: number;
    logsCount: number;
    activeStudents: number;
  }>;
  metric: DailyMetric;
  windowDays: 14 | 30;
  onChangeMetric: (m: DailyMetric) => void;
  onChangeWindow: (w: 14 | 30) => void;
}) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const sliced = series.slice(-windowDays);

  const metricLabel: Record<DailyMetric, string> = {
    hours: tr('ساعات مطالعه', 'Hours'),
    tests: tr('تعداد تست', 'Tests'),
    points: tr('امتیاز', 'Points'),
    logsCount: tr('تعداد گزارش', 'Logs'),
    activeStudents: tr('شرکت‌کنندگان فعال', 'Active Students'),
  };

  const values = sliced.map((d) => Number(d[metric] ?? 0));
  const maxVal = Math.max(metric === 'hours' ? 4 : 10, ...values);
  const totalInWindow = values.reduce((a, b) => a + b, 0);
  const avgPerDay = sliced.length > 0 ? totalInWindow / sliced.length : 0;

  const svgW = 640;
  const svgH = 200;
  const padL = 36;
  const padR = 16;
  const padT = 22;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const barW = Math.max(6, Math.min(20, (plotW / Math.max(1, sliced.length)) * 0.52));

  const labelStep = windowDays === 30 ? 3 : 2;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['hours', 'tests', 'points', 'logsCount', 'activeStudents'] as DailyMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMetric(m)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                metric === m
                  ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {metricLabel[m]}
            </button>
          ))}
          <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
          {([14, 30] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChangeWindow(w)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
                windowDays === w
                  ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {fmtDigits(w)} {tr('روز', 'd')}
            </button>
          ))}
        </div>
      </div>

      {sliced.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          {tr('داده‌ای برای بازه انتخاب‌شده ثبت نشده است.', 'No data recorded for this window.')}
        </div>
      ) : (
        <>
          <div className="w-full overflow-x-auto" dir="ltr">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-52 min-w-[420px]">
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const y = padT + plotH - frac * plotH;
                const tickVal = maxVal * frac;
                return (
                  <g key={frac}>
                    <line
                      x1={padL}
                      x2={svgW - padR}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray={frac === 0 ? undefined : '3 3'}
                    />
                    <text x={padL - 5} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px] tabular-nums">
                      {fmtNum(tickVal, metric === 'hours' && maxVal < 10 ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {sliced.map((d, idx) => {
                const val = Number(d[metric] ?? 0);
                const slotW = plotW / sliced.length;
                const cx = padL + slotW * (idx + 0.5);
                const h = Math.max(val > 0 ? 3 : 0, (Math.min(maxVal, val) / maxVal) * plotH);
                const y = padT + plotH - h;
                return (
                  <g key={d.date}>
                    <title>{`${d.label}: ${fmtNum(val, metric === 'hours' ? 1 : 0)}`}</title>
                    <rect
                      x={cx - barW / 2}
                      y={y}
                      width={barW}
                      height={h}
                      rx={2.5}
                      className={
                        val > 0
                          ? 'fill-sky-600/80 dark:fill-sky-500/80 hover:fill-[#0F274A] dark:hover:fill-sky-300 transition-colors'
                          : 'fill-slate-200 dark:fill-slate-800'
                      }
                    />
                    {(idx % labelStep === 0 || idx === sliced.length - 1) && (
                      <text
                        x={cx}
                        y={padT + plotH + 15}
                        textAnchor="middle"
                        className="fill-slate-500 dark:fill-slate-400 text-[9px] font-medium"
                      >
                        {fmtDigits(d.label)}
                      </text>
                    )}
                    {val > 0 && (windowDays === 14 || val >= maxVal * 0.75) && (
                      <text
                        x={cx}
                        y={Math.max(11, y - 4)}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[8.5px] font-bold"
                      >
                        {fmtNum(val, metric === 'hours' ? 1 : 0)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span>
              {tr('جمع بازه انتخاب‌شده:', 'Window total:')}{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {fmtNum(totalInWindow, metric === 'hours' ? 1 : 0)}
              </strong>{' '}
              {metricLabel[metric]}
            </span>
            <span>
              {tr('میانگین روزانه:', 'Daily average:')}{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {fmtNum(avgPerDay, 1)}
              </strong>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function LogIntegrityDonutCard({ breakdown }: { breakdown: LeagueLogStatusBreakdown }) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const total = breakdown.totalLogs;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const items = [
    {
      key: 'approved',
      label: tr('تأییدشده', 'Approved'),
      count: breakdown.approvedCount,
      stroke: '#15803d',
      dotClass: 'bg-emerald-700',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      key: 'pending',
      label: tr('در انتظار تأیید', 'Pending'),
      count: breakdown.pendingCount,
      stroke: '#d97706',
      dotClass: 'bg-amber-600',
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    {
      key: 'rejected',
      label: tr('ردشده', 'Rejected'),
      count: breakdown.rejectedCount,
      stroke: '#dc2626',
      dotClass: 'bg-red-600',
      textClass: 'text-red-700 dark:text-red-400',
    },
    {
      key: 'flagged',
      label: tr('دارای هشدار / مشکوک', 'Flagged'),
      count: breakdown.flaggedCount,
      stroke: '#7c3aed',
      dotClass: 'bg-violet-600',
      textClass: 'text-violet-700 dark:text-violet-400',
    },
  ];

  // Segment proportions on actual status buckets (approved + pending + rejected)
  const statusTotal = breakdown.approvedCount + breakdown.pendingCount + breakdown.rejectedCount;
  const ringItems = items.slice(0, 3);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {tr('وضعیت ممیزی و سلامت گزارش‌های مطالعه', 'Study Log Audit & Integrity Breakdown')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {tr('کل گزارش‌های ثبت‌شده:', 'Total submitted logs:')} {fmtDigits(total)}
          </p>
        </div>
        <div className="text-end text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <div>
            {tr('میانگین هر گزارش:', 'Avg/log:')} {fmtNum(breakdown.avgHoursPerLog, 1)} {tr('س', 'h')} ·{' '}
            {fmtNum(breakdown.avgTestsPerLog, 0)} {tr('تست', 'Q')}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          {tr('هنوز گزارش عملکردی در این محدوده ثبت نشده است.', 'No study logs submitted in this scope yet.')}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 108 108" className="w-full h-full -rotate-90">
              <circle
                cx="54"
                cy="54"
                r={radius}
                fill="none"
                stroke="currentColor"
                className="text-slate-100 dark:text-slate-800"
                strokeWidth="12"
              />
              {ringItems.map((it) => {
                if (it.count === 0 || statusTotal === 0) return null;
                const seg = (it.count / statusTotal) * circumference;
                const dashArray = `${seg} ${circumference - seg}`;
                const dashOffset = -cumulativeOffset;
                cumulativeOffset += seg;
                return (
                  <circle
                    key={it.key}
                    cx="54"
                    cy="54"
                    r={radius}
                    fill="none"
                    stroke={it.stroke}
                    strokeWidth="12"
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
                {fmtNum(breakdown.approvalRate, 0)}
                {tr('٪', '%')}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {tr('نرخ تأیید', 'Approval')}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full grid grid-cols-2 gap-2.5">
            {items.map((it) => {
              const pct = total > 0 ? (it.count / total) * 100 : 0;
              return (
                <div
                  key={it.key}
                  className="border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-2.5 bg-slate-50/50 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-sm ${it.dotClass}`} />
                      <span className="truncate">{it.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {fmtNum(pct, 0)}
                      {tr('٪', '%')}
                    </span>
                  </div>
                  <p className={`mt-1 text-base font-bold tabular-nums ${it.textClass}`}>{fmtDigits(it.count)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CompletionDistributionCard({
  distribution,
  totalStudents,
}: {
  distribution: LeagueCompletionDistribution;
  totalStudents: number;
}) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const tiers = [
    {
      key: 'excellent',
      label: tr('عالی (۹۰٪ به بالا)', 'Excellent (90%+)'),
      count: distribution.excellent,
      barClass: 'bg-emerald-600 dark:bg-emerald-500',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      key: 'onTrack',
      label: tr('مطلوب (۷۰ تا ۸۹٪)', 'On Track (70–89%)'),
      count: distribution.onTrack,
      barClass: 'bg-sky-600 dark:bg-sky-500',
      textClass: 'text-sky-700 dark:text-sky-400',
    },
    {
      key: 'moderate',
      label: tr('متوسط (۴۰ تا ۶۹٪)', 'Moderate (40–69%)'),
      count: distribution.moderate,
      barClass: 'bg-amber-500 dark:bg-amber-400',
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    {
      key: 'needsSupport',
      label: tr('نیازمند پیگیری (زیر ۴۰٪)', 'Needs Support (<40%)'),
      count: distribution.needsSupport,
      barClass: 'bg-red-600 dark:bg-red-500',
      textClass: 'text-red-700 dark:text-red-400',
    },
    {
      key: 'noGoal',
      label: tr('بدون هدف فعال', 'No Active Goal'),
      count: distribution.noGoal,
      barClass: 'bg-slate-400 dark:bg-slate-600',
      textClass: 'text-slate-600 dark:text-slate-300',
    },
  ];
  const denom = Math.max(
    1,
    totalStudents || tiers.reduce((acc, t) => acc + t.count, 0)
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {tr('توزیع سطوح تحقق اهداف دانش‌آموزان', 'Student Goal Completion Distribution')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {tr('تفکیک بازه‌های پیشرفت از کل', 'Breakdown across')} {fmtDigits(denom)} {tr('دانش‌آموز', 'students')}
          </p>
        </div>
      </div>

      {/* Stacked Segmented Bar */}
      <div className="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
        {tiers.map((t) => {
          const pct = (t.count / denom) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={t.key}
              className={`h-full ${t.barClass} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${t.label}: ${fmtDigits(t.count)} (${fmtNum(pct, 1)}%)`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {tiers.map((t) => {
          const pct = (t.count / denom) * 100;
          return (
            <div
              key={t.key}
              className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <span className={`w-2 h-2 rounded-sm shrink-0 ${t.barClass}`} />
                <span className="truncate">{t.label}</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-1 tabular-nums">
                <span className={`text-base font-extrabold ${t.textClass}`}>{fmtDigits(t.count)}</span>
                <span className="text-[11px] text-slate-400">
                  {fmtNum(pct, 0)}
                  {tr('٪', '%')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StudyLeagueAnalyticsPanel({
  role,
  studentAnalytics,
  teacherAnalytics,
  adminAnalytics,
  loading,
  classes = [],
  subjects = [],
  logs = [],
  seasonTitle,
  selectedClassId = 'all',
  onChangeClassId,
  onSendEncouragement,
  onJumpToReview,
}: {
  role: UserRole;
  studentAnalytics?: StudentLeagueAnalytics | null;
  teacherAnalytics?: TeacherLeagueAnalytics | null;
  adminAnalytics?: AdminLeagueAnalytics | null;
  loading?: boolean;
  classes?: SchoolClass[];
  subjects?: Subject[];
  logs?: StudyLog[];
  seasonTitle?: string;
  selectedClassId?: string;
  onChangeClassId?: (classId: string) => void;
  onSendEncouragement?: (studentId: string) => void;
  onJumpToReview?: () => void;
}) {
  const { tr, fmtNum, fmtDigits, fmtDate } = useI18n();

  const [section, setSection] = useState<ReportSection>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'excellent' | 'needs_support' | 'flagged_or_suspended'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('hours');
  const [dailyWindow, setDailyWindow] = useState<14 | 30>(14);
  const [weeklyMetric, setWeeklyMetric] = useState<WeeklyMetric>('hours');
  const [classMetric, setClassMetric] = useState<ClassMetric>('avgPoints');
  const [sortKey, setSortKey] = useState<StudentSortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [logTableFilter, setLogTableFilter] = useState<'all' | 'pending_flagged' | 'approved' | 'rejected'>('all');
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Select primary overview source cleanly
  const isSpecificClass = selectedClassId !== 'all';
  const useAdminScope = role === 'admin' && !isSpecificClass && Boolean(adminAnalytics);

  const overview = useMemo(() => {
    if (useAdminScope && adminAnalytics) {
      return {
        totalStudents: adminAnalytics.totalStudents,
        activeParticipants: adminAnalytics.totalParticipants,
        participationRate: adminAnalytics.participationRate,
        activeGoalsCount: adminAnalytics.activeGoalsCount,
        totalStudyHours: adminAnalytics.totalStudyHours,
        totalTests: adminAnalytics.totalTests,
        totalPages: adminAnalytics.totalPages,
        totalExercises: adminAnalytics.totalExercises,
        weeklyHours: teacherAnalytics?.weeklyHours ?? 0,
        weeklyTests: teacherAnalytics?.weeklyTests ?? 0,
        avgCompletionPercent: adminAnalytics.avgCompletionPercent,
        pendingLogsCount: adminAnalytics.pendingLogsCount,
        suspiciousLogsCount: adminAnalytics.suspiciousLogsCount,
        suspendedCount: adminAnalytics.suspendedCount,
        dailySeries: adminAnalytics.dailySchoolActivity,
        weeklyTrend: adminAnalytics.weeklyTrend,
        classComparison: adminAnalytics.classComparison,
        subjectBreakdown: adminAnalytics.subjectBreakdown,
        gradeLevelBreakdown: adminAnalytics.gradeLevelBreakdown,
        completionDistribution: adminAnalytics.completionDistribution,
        logStatusBreakdown: adminAnalytics.logStatusBreakdown,
      };
    }
    if (teacherAnalytics) {
      return {
        totalStudents: teacherAnalytics.totalStudents,
        activeParticipants: teacherAnalytics.activeParticipants,
        participationRate: teacherAnalytics.participationRate,
        activeGoalsCount: teacherAnalytics.activeGoalsCount,
        totalStudyHours: teacherAnalytics.totalStudyHours,
        totalTests: teacherAnalytics.totalTests,
        totalPages: teacherAnalytics.totalPages,
        totalExercises: teacherAnalytics.totalExercises,
        weeklyHours: teacherAnalytics.weeklyHours,
        weeklyTests: teacherAnalytics.weeklyTests,
        avgCompletionPercent: teacherAnalytics.avgCompletionPercent,
        pendingLogsCount: teacherAnalytics.pendingReviewsCount,
        suspiciousLogsCount: teacherAnalytics.logStatusBreakdown.flaggedCount,
        suspendedCount: teacherAnalytics.studentProgressSeries.filter((s) => s.suspended).length,
        dailySeries: teacherAnalytics.dailyActivity30d,
        weeklyTrend: teacherAnalytics.weeklyTrend,
        classComparison: teacherAnalytics.classComparison,
        subjectBreakdown: teacherAnalytics.subjectBreakdown,
        gradeLevelBreakdown: adminAnalytics?.gradeLevelBreakdown ?? [],
        completionDistribution: teacherAnalytics.completionDistribution,
        logStatusBreakdown: teacherAnalytics.logStatusBreakdown,
      };
    }
    return null;
  }, [useAdminScope, adminAnalytics, teacherAnalytics]);

  const distinctGrades = useMemo(() => {
    const set = new Set<string>();
    (overview?.classComparison ?? []).forEach((c) => {
      if (c.gradeLevel) set.add(c.gradeLevel);
    });
    (teacherAnalytics?.studentProgressSeries ?? []).forEach((s) => {
      if (s.gradeLevel) set.add(s.gradeLevel);
    });
    return Array.from(set);
  }, [overview?.classComparison, teacherAnalytics?.studentProgressSeries]);

  const filteredClassComparison = useMemo(() => {
    return (overview?.classComparison ?? []).filter((c) => {
      if (isSpecificClass && c.classId !== selectedClassId) return false;
      if (gradeFilter !== 'all' && c.gradeLevel !== gradeFilter) return false;
      return true;
    });
  }, [overview?.classComparison, isSpecificClass, selectedClassId, gradeFilter]);

  const filteredSubjects: LeagueSubjectBreakdownItem[] = useMemo(() => {
    return (overview?.subjectBreakdown ?? []).filter((s) => {
      if (subjectFilter !== 'all' && s.subjectId !== subjectFilter) return false;
      return true;
    });
  }, [overview?.subjectBreakdown, subjectFilter]);

  const lowActivityIds = useMemo(
    () => new Set((teacherAnalytics?.lowActivityStudents ?? []).map((s) => s.studentId)),
    [teacherAnalytics?.lowActivityStudents]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = (teacherAnalytics?.studentProgressSeries ?? []).filter((s) => {
      if (isSpecificClass && s.classId !== selectedClassId) return false;
      if (gradeFilter !== 'all' && s.gradeLevel !== gradeFilter) return false;
      if (q && !s.studentName.toLowerCase().includes(q) && !s.className.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active' && s.logsCount === 0) return false;
      if (statusFilter === 'excellent' && s.completionPercent < 75) return false;
      if (statusFilter === 'needs_support' && s.completionPercent >= 40 && !lowActivityIds.has(s.studentId)) return false;
      if (statusFilter === 'flagged_or_suspended' && s.flaggedLogsCount === 0 && !s.suspended) return false;
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'studentName') {
        return a.studentName.localeCompare(b.studentName, 'fa') * mul;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
    return sorted;
  }, [
    teacherAnalytics?.studentProgressSeries,
    isSpecificClass,
    selectedClassId,
    gradeFilter,
    searchQuery,
    statusFilter,
    lowActivityIds,
    sortKey,
    sortDir,
  ]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (isSpecificClass && l.classId !== selectedClassId) return false;
      if (gradeFilter !== 'all') {
        const cls = classes.find((c) => c.id === l.classId);
        if (cls && cls.gradeLevel !== gradeFilter) return false;
      }
      if (subjectFilter !== 'all' && !(l.subjectIds ?? []).includes(subjectFilter)) return false;
      if (
        q &&
        !(l.studentName ?? '').toLowerCase().includes(q) &&
        !(l.goalTitle ?? '').toLowerCase().includes(q)
      )
        return false;
      if (logTableFilter === 'pending_flagged' && l.status !== 'pending_review' && !l.flaggedReason) return false;
      if (logTableFilter === 'approved' && l.status !== 'approved') return false;
      if (logTableFilter === 'rejected' && l.status !== 'rejected') return false;
      return true;
    });
  }, [logs, isSpecificClass, selectedClassId, gradeFilter, classes, subjectFilter, searchQuery, logTableFilter]);

  const toggleSort = (key: StudentSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' || key === 'studentName' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <CircularSpinner size="md" />
        <span>{tr('در حال محاسبه و آماده‌سازی گزارش‌های جامع لیگ...', 'Preparing comprehensive Study League reports...')}</span>
      </div>
    );
  }

  // ==================== STUDENT VIEW ====================
  if (role === 'student') {
    const data = studentAnalytics;
    if (!data) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500 dark:text-slate-400">
          {tr('هنوز داده‌ای برای تحلیل عملکرد شما ثبت نشده است.', 'No study analytics available yet.')}
        </div>
      );
    }

    const cmp = data.periodComparison;
    const maxDailyHours = Math.max(4, ...data.dailySeries.map((d) => d.hours));
    const maxDailyTests = Math.max(20, ...data.dailySeries.map((d) => d.tests));

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: tr('ساعت مطالعه (هفته جاری در برابر هفته قبل)', 'Study Hours (This vs Last Week)'),
              curr: fmtNum(cmp.currentWeekHours, 1),
              prev: fmtNum(cmp.previousWeekHours, 1),
              delta: cmp.hoursDeltaPercent,
              unit: tr('ساعت', 'hrs'),
            },
            {
              label: tr('تعداد تست (هفته جاری در برابر هفته قبل)', 'Tests Solved (This vs Last Week)'),
              curr: fmtDigits(cmp.currentWeekTests),
              prev: fmtDigits(cmp.previousWeekTests),
              delta: cmp.testsDeltaPercent,
              unit: tr('تست', 'tests'),
            },
            {
              label: tr('امتیاز لیگ (هفته جاری در برابر هفته قبل)', 'League Points (This vs Last Week)'),
              curr: fmtNum(cmp.currentWeekPoints, 1),
              prev: fmtNum(cmp.previousWeekPoints, 1),
              delta: cmp.pointsDeltaPercent,
              unit: tr('امتیاز', 'pts'),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
            >
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                  {item.curr} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                </p>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    item.delta > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : item.delta < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-slate-500'
                  }`}
                >
                  {item.delta > 0 ? `+${fmtDigits(item.delta)}` : fmtDigits(item.delta)}
                  {tr('٪', '%')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {tr('هفته قبل:', 'Last week:')} {item.prev} {item.unit}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LineTrendChart
            title={tr('روند ساعت مطالعه روزانه (۱۴ روز اخیر)', 'Daily Study Hours (Last 14 Days)')}
            subtitle={tr('بر اساس گزارش‌های تأییدشده', 'Based on approved study logs')}
            maxValue={Math.ceil(maxDailyHours)}
            data={data.dailySeries.map((d) => ({ label: fmtDigits(d.label), value: d.hours }))}
          />
          <LineTrendChart
            title={tr('تعداد تست روزانه (۱۴ روز اخیر)', 'Daily Tests Count (Last 14 Days)')}
            subtitle={tr('روند تست‌زنی روزانه در لیگ', 'Daily test-solving activity')}
            maxValue={Math.ceil(maxDailyTests)}
            data={data.dailySeries.map((d) => ({ label: fmtDigits(d.label), value: d.tests }))}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <HorizontalBarChart
            title={tr('پیشرفت هفتگی تحقق برنامه', 'Weekly Goal Progress (%)')}
            subtitle={tr('درصد پیشرفت در ۴ هفته اخیر', 'Completion rate over the last 4 weeks')}
            maxValue={100}
            passingLine={70}
            data={data.weeklySeries.map((w) => ({
              label: w.label,
              value: w.completionPercent,
              sublabel: `${fmtNum(w.hours, 1)} ${tr('ساعت', 'h')} · ${fmtDigits(w.tests)} ${tr('تست', 'Q')}`,
            }))}
          />
          <HorizontalBarChart
            title={tr('درصد تحقق هدف به تفکیک هر درس', 'Goal Completion Rate by Subject')}
            subtitle={tr('مقایسه عملکرد ثبت‌شده با اهداف هر درس', 'Logged vs target metrics per subject')}
            maxValue={100}
            passingLine={75}
            data={data.subjectPerformance.map((s) => ({
              label: s.subjectName,
              value: s.completionPercent,
              sublabel: `${fmtNum(s.loggedHours, 1)}/${fmtNum(s.targetHours, 1)} ${tr('س', 'h')}`,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-3">
              <CheckCircle2 className="w-4 h-4" />
              <span>{tr('نقاط قوت مطالعاتی شما', 'Your Study Strengths')}</span>
            </h4>
            {data.strengths.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr(
                  'با رسیدن تحقق اهداف هر درس به بالای ۷۵٪، نقاط قوت شما در اینجا ثبت می‌شود.',
                  'Subjects reaching 75%+ goal completion appear here as strengths.'
                )}
              </p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {data.strengths.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-4 h-4" />
              <span>{tr('دروس نیازمند توجه و تلاش بیشتر', 'Areas Needing More Focus')}</span>
            </h4>
            {data.areasToImprove.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr(
                  'در حال حاضر درس عقب‌افتاده‌ای در اهداف شما وجود ندارد.',
                  'No lagging subjects detected across your active study goals.'
                )}
              </p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {data.areasToImprove.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== ADMIN & TEACHER COMPREHENSIVE REPORTING ====================
  if (!overview) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500 dark:text-slate-400">
        {tr('گزارش تحلیلی لیگ برای نمایش در دسترس نیست.', 'League analytics report is not available yet.')}
      </div>
    );
  }

  const exportComprehensiveExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const summaryRows = [
      {
        [tr('شاخص', 'Metric')]: tr('دوره فعال لیگ', 'Active Season'),
        [tr('مقدار', 'Value')]: seasonTitle || tr('دوره جاری', 'Current Season'),
      },
      {
        [tr('شاخص', 'Metric')]: tr('تعداد کل دانش‌آموزان محدوده', 'Total Students'),
        [tr('مقدار', 'Value')]: overview.totalStudents,
      },
      {
        [tr('شاخص', 'Metric')]: tr('شرکت‌کنندگان فعال', 'Active Participants'),
        [tr('مقدار', 'Value')]: overview.activeParticipants,
      },
      {
        [tr('شاخص', 'Metric')]: tr('نرخ مشارکت (٪)', 'Participation Rate (%)'),
        [tr('مقدار', 'Value')]: overview.participationRate,
      },
      {
        [tr('شاخص', 'Metric')]: tr('تعداد اهداف فعال', 'Active Goals'),
        [tr('مقدار', 'Value')]: overview.activeGoalsCount,
      },
      {
        [tr('شاخص', 'Metric')]: tr('مجموع ساعات مطالعه تأییدشده', 'Approved Study Hours'),
        [tr('مقدار', 'Value')]: overview.totalStudyHours,
      },
      {
        [tr('شاخص', 'Metric')]: tr('ساعات مطالعه ۷ روز اخیر', 'Weekly Hours'),
        [tr('مقدار', 'Value')]: overview.weeklyHours,
      },
      {
        [tr('شاخص', 'Metric')]: tr('مجموع تست‌های حل‌شده', 'Total Tests Solved'),
        [tr('مقدار', 'Value')]: overview.totalTests,
      },
      {
        [tr('شاخص', 'Metric')]: tr('مجموع صفحات مطالعه', 'Total Pages Read'),
        [tr('مقدار', 'Value')]: overview.totalPages,
      },
      {
        [tr('شاخص', 'Metric')]: tr('مجموع تمرین‌ها', 'Total Exercises'),
        [tr('مقدار', 'Value')]: overview.totalExercises,
      },
      {
        [tr('شاخص', 'Metric')]: tr('میانگین درصد تحقق اهداف', 'Avg Goal Completion (%)'),
        [tr('مقدار', 'Value')]: overview.avgCompletionPercent,
      },
      {
        [tr('شاخص', 'Metric')]: tr('کل گزارش‌ها', 'Total Logs'),
        [tr('مقدار', 'Value')]: overview.logStatusBreakdown.totalLogs,
      },
      {
        [tr('شاخص', 'Metric')]: tr('نرخ تأیید گزارش‌ها (٪)', 'Log Approval Rate (%)'),
        [tr('مقدار', 'Value')]: overview.logStatusBreakdown.approvalRate,
      },
      {
        [tr('شاخص', 'Metric')]: tr('گزارش‌های در انتظار بررسی', 'Pending Logs'),
        [tr('مقدار', 'Value')]: overview.pendingLogsCount,
      },
      {
        [tr('شاخص', 'Metric')]: tr('گزارش‌های مشکوک/پرچم‌دار', 'Flagged Logs'),
        [tr('مقدار', 'Value')]: overview.suspiciousLogsCount,
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'خلاصه مدیریتی');

    // Sheet 2: Classes
    const classRows = filteredClassComparison.map((c) => ({
      [tr('کلاس', 'Class')]: c.className,
      [tr('پایه', 'Grade')]: c.gradeLevel,
      [tr('کل دانش‌آموزان', 'Students')]: c.totalStudentsInClass,
      [tr('شرکت‌کنندگان', 'Participants')]: c.participantsCount,
      [tr('نرخ مشارکت ٪', 'Participation %')]: c.participationRate,
      [tr('اهداف فعال', 'Active Goals')]: c.activeGoalsCount,
      [tr('مجموع ساعات', 'Total Hours')]: c.totalHours,
      [tr('تست‌ها', 'Tests')]: c.totalTests,
      [tr('صفحات', 'Pages')]: c.totalPages,
      [tr('تمرین‌ها', 'Exercises')]: c.totalExercises,
      [tr('میانگین امتیاز', 'Avg Points')]: c.avgPoints,
      [tr('درصد تحقق هدف', 'Avg Completion %')]: c.avgCompletionPercent,
      [tr('منتظر بررسی', 'Pending Logs')]: c.pendingLogsCount,
      [tr('مشکوک', 'Flagged Logs')]: c.flaggedLogsCount,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classRows), 'گزارش کلاس‌ها');

    // Sheet 3: Subjects & Grades
    const subjectRows = filteredSubjects.map((s) => ({
      [tr('نام درس', 'Subject')]: s.subjectName,
      [tr('تعداد اهداف', 'Goals')]: s.goalsCount,
      [tr('شرکت‌کنندگان', 'Participants')]: s.participantsCount,
      [tr('ساعت هدف', 'Target Hours')]: s.targetHours,
      [tr('ساعت ثبت‌شده', 'Logged Hours')]: s.loggedHours,
      [tr('تست هدف', 'Target Tests')]: s.targetTests,
      [tr('تست ثبت‌شده', 'Logged Tests')]: s.loggedTests,
      [tr('صفحات مطالعه', 'Pages')]: s.loggedPages,
      [tr('تمرین‌ها', 'Exercises')]: s.loggedExercises,
      [tr('میانگین تحقق ٪', 'Completion %')]: s.avgCompletionPercent,
      [tr('امتیاز کل', 'Total Points')]: s.totalPoints,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subjectRows), 'گزارش دروس');

    // Sheet 4: Students Detailed Matrix
    const studentRows = filteredStudents.map((s) => ({
      [tr('رتبه', 'Rank')]: s.rank,
      [tr('تغییر رتبه', 'Rank Delta')]: s.rankDelta,
      [tr('دانش‌آموز', 'Student')]: s.studentName,
      [tr('کلاس', 'Class')]: s.className,
      [tr('پایه', 'Grade')]: s.gradeLevel,
      [tr('اهداف', 'Goals')]: s.goalsCount,
      [tr('امتیاز کل', 'Total Points')]: s.points,
      [tr('امتیاز هفته', 'Weekly Points')]: s.weeklyPoints,
      [tr('ساعت کل', 'Total Hours')]: s.hours,
      [tr('ساعت هفته', 'Weekly Hours')]: s.weeklyHours,
      [tr('تست کل', 'Total Tests')]: s.tests,
      [tr('تست هفته', 'Weekly Tests')]: s.weeklyTests,
      [tr('صفحات', 'Pages')]: s.pages,
      [tr('تمرین', 'Exercises')]: s.exercises,
      [tr('تحقق هدف ٪', 'Completion %')]: s.completionPercent,
      [tr('استمرار (روز)', 'Streak')]: s.streakDays,
      [tr('کل گزارش‌ها', 'Total Logs')]: s.logsCount,
      [tr('تأییدشده', 'Approved')]: s.approvedLogsCount,
      [tr('در انتظار', 'Pending')]: s.pendingLogsCount,
      [tr('مشکوک', 'Flagged')]: s.flaggedLogsCount,
      [tr('نشان‌ها', 'Badges')]: s.badgesCount,
      [tr('آخرین فعالیت', 'Last Log')]: s.lastLogDate || '—',
      [tr('وضعیت', 'Status')]: s.suspended ? tr('تعلیق‌شده', 'Suspended') : tr('فعال', 'Active'),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentRows), 'گزارش دانش‌آموزان');

    // Sheet 5: Detailed Logs Audit
    const logRows = filteredLogs.map((l) => ({
      [tr('تاریخ', 'Date')]: l.date,
      [tr('دانش‌آموز', 'Student')]: l.studentName ?? '',
      [tr('کلاس', 'Class')]: l.className ?? '',
      [tr('هدف', 'Goal')]: l.goalTitle ?? '',
      [tr('ساعت', 'Hours')]: l.hours,
      [tr('تست', 'Tests')]: l.testCount,
      [tr('صفحه', 'Pages')]: l.pagesRead,
      [tr('تمرین', 'Exercises')]: l.exercisesDone,
      [tr('امتیاز', 'Points')]: l.computedPoints,
      [tr('وضعیت', 'Status')]: l.status,
      [tr('هشدار سیستم', 'Flag Reason')]: l.flaggedReason || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'ممیزی عملکردها');

    XLSX.writeFile(wb, `study-league-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Totals for class comparison footer
  const classTotals = filteredClassComparison.reduce(
    (acc, c) => ({
      students: acc.students + c.totalStudentsInClass,
      participants: acc.participants + c.participantsCount,
      goals: acc.goals + c.activeGoalsCount,
      hours: acc.hours + c.totalHours,
      tests: acc.tests + c.totalTests,
      pages: acc.pages + c.totalPages,
      exercises: acc.exercises + c.totalExercises,
      pending: acc.pending + c.pendingLogsCount,
      flagged: acc.flagged + c.flaggedLogsCount,
      pointsSum: acc.pointsSum + c.avgPoints,
      compSum: acc.compSum + c.avgCompletionPercent,
    }),
    {
      students: 0,
      participants: 0,
      goals: 0,
      hours: 0,
      tests: 0,
      pages: 0,
      exercises: 0,
      pending: 0,
      flagged: 0,
      pointsSum: 0,
      compSum: 0,
    }
  );
  const classCountSafe = Math.max(1, filteredClassComparison.length);

  // Totals for subject breakdown footer
  const subjectTotals = filteredSubjects.reduce(
    (acc, s) => ({
      goals: acc.goals + s.goalsCount,
      targetHours: acc.targetHours + s.targetHours,
      loggedHours: acc.loggedHours + s.loggedHours,
      targetTests: acc.targetTests + s.targetTests,
      loggedTests: acc.loggedTests + s.loggedTests,
      pages: acc.pages + s.loggedPages,
      exercises: acc.exercises + s.loggedExercises,
      points: acc.points + s.totalPoints,
      compSum: acc.compSum + s.avgCompletionPercent,
    }),
    {
      goals: 0,
      targetHours: 0,
      loggedHours: 0,
      targetTests: 0,
      loggedTests: 0,
      pages: 0,
      exercises: 0,
      points: 0,
      compSum: 0,
    }
  );

  // Chart series preparations
  const weeklyTrend: LeagueWeeklyTrendPoint[] = overview.weeklyTrend ?? [];
  const weeklyValues = weeklyTrend.map((w) => Number(w[weeklyMetric] ?? 0));
  const maxWeeklyVal = Math.max(weeklyMetric === 'hours' ? 10 : 20, ...weeklyValues);

  const classChartMetricLabel: Record<ClassMetric, string> = {
    avgPoints: tr('میانگین امتیاز', 'Avg Points'),
    avgCompletionPercent: tr('میانگین تحقق هدف (٪)', 'Avg Completion (%)'),
    totalHours: tr('مجموع ساعات مطالعه', 'Total Hours'),
    participationRate: tr('نرخ مشارکت (٪)', 'Participation Rate (%)'),
  };
  const maxClassChartVal =
    classMetric === 'avgCompletionPercent' || classMetric === 'participationRate'
      ? 100
      : Math.max(20, ...filteredClassComparison.map((c) => Number(c[classMetric] ?? 0)));

  const subjectChartItems = filteredSubjects.slice(0, 10);
  const visibleStudents = showAllStudents ? filteredStudents : filteredStudents.slice(0, 25);
  const visibleLogs = showAllLogs ? filteredLogs : filteredLogs.slice(0, 40);

  const pctSign = tr('٪', '%');
  const showOverview = section === 'all' || section === 'overview';
  const showClassesSubjects = section === 'all' || section === 'classes_subjects';
  const showStudents = section === 'all' || section === 'students';
  const showAlertsLogs = section === 'all' || section === 'alerts_logs';

  const statusBadge = (status: StudyLog['status']) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          <span>{tr('تأییدشده', 'Approved')}</span>
        </span>
      );
    }
    if (status === 'pending_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Clock className="w-3 h-3" />
          <span>{tr('در انتظار', 'Pending')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
        <XCircle className="w-3 h-3" />
        <span>{tr('ردشده', 'Rejected')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ==================== REPORT HEADER, FILTERS & EXPORT BAR ==================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#0F274A] dark:text-sky-400" />
                <span>{tr('مرکز گزارش‌دهی جامع و تحلیلی لیگ مطالعاتی', 'Study League Comprehensive Reporting Suite')}</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {role === 'admin'
                  ? tr('گزارش مدیریتی مدرسه', 'Admin Schoolwide Report')
                  : tr('گزارش تخصصی کلاس‌های معلم', 'Teacher Class Report')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {seasonTitle ? `${tr('دوره فعال:', 'Active Season:')} ${seasonTitle} · ` : ''}
              {tr(
                'تحلیل چندبعدی مشارکت، روندهای زمانی، مقایسه کلاس‌ها و دروس، وضعیت ممیزی و کارنامه فردی دانش‌آموزان',
                'Multi-dimensional reporting on participation, trends, classes, subjects, log audits, and student progress'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={exportComprehensiveExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{tr('خروجی اکسل گزارش جامع (۵ شیت)', 'Export 5-Sheet Excel Report')}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('چاپ گزارش', 'Print Report')}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 print:hidden">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr('فیلتر کلاس', 'Class Filter')}
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => onChangeClassId?.(e.target.value)}
              disabled={!onChangeClassId}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{tr('همه کلاس‌های مجاز', 'All Assigned Classes')}</option>
              {(classes.length > 0 ? classes : overview.classComparison.map((c) => ({ id: c.classId, name: c.className }))).map(
                (c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr('فیلتر پایه تحصیلی', 'Grade Level')}
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{tr('همه پایه‌ها', 'All Grades')}</option>
              {distinctGrades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr('فیلتر درس', 'Subject Filter')}
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{tr('همه دروس', 'All Subjects')}</option>
              {(subjects.length > 0
                ? subjects.map((s) => ({ id: s.id, name: s.name }))
                : overview.subjectBreakdown.map((s) => ({ id: s.subjectId, name: s.subjectName }))
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr('وضعیت عملکرد دانش‌آموز', 'Student Performance Segment')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | 'active' | 'excellent' | 'needs_support' | 'flagged_or_suspended'
                )
              }
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{tr('همه دانش‌آموزان', 'All Students')}</option>
              <option value="active">{tr('دارای گزارش ثبت‌شده', 'With Submitted Logs')}</option>
              <option value="excellent">{tr('پیشرفت عالی (۷۵٪ به بالا)', 'High Completion (75%+)')}</option>
              <option value="needs_support">{tr('نیازمند پیگیری و حمایت', 'Needs Support')}</option>
              <option value="flagged_or_suspended">{tr('دارای گزارش مشکوک / تعلیق', 'Flagged or Suspended')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {tr('جستجوی دانش‌آموز یا هدف', 'Search Student or Goal')}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr('نام دانش‌آموز، کلاس یا هدف...', 'Name, class, or goal...')}
                className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ps-8 pe-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Report Section Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 print:hidden">
          {(
            [
              { id: 'all', label: tr('همه بخش‌های گزارش', 'Full Report (All)'), icon: Layers },
              { id: 'overview', label: tr('شاخص‌ها و نمودارها', 'KPIs & Charts'), icon: BarChart3 },
              { id: 'classes_subjects', label: tr('گزارش کلاس‌ها، پایه‌ها و دروس', 'Classes, Grades & Subjects'), icon: BookOpen },
              { id: 'students', label: tr('جدول جامع دانش‌آموزان', 'Detailed Student Matrix'), icon: Users },
              { id: 'alerts_logs', label: tr('هشدارها و ممیزی گزارش‌ها', 'Alerts & Log Audits'), icon: ShieldAlert },
            ] as const
          ).map((sec) => {
            const Icon = sec.icon;
            const active = section === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSection(sec.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== SECTION 1: 8 EXECUTIVE KPI CARDS ==================== */}
      {showOverview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: tr('نرخ مشارکت در لیگ', 'League Participation Rate'),
              value: `${fmtNum(overview.participationRate, 1)}${pctSign}`,
              sub: `${fmtDigits(overview.activeParticipants)} ${tr('از', 'of')} ${fmtDigits(overview.totalStudents)} ${tr('دانش‌آموز', 'students')}`,
              icon: Users,
              accent: 'text-[#0F274A] dark:text-sky-400',
            },
            {
              label: tr('ساعات مطالعه تأییدشده', 'Approved Study Hours'),
              value: `${fmtNum(overview.totalStudyHours, 1)} ${tr('ساعت', 'h')}`,
              sub: `${fmtNum(overview.weeklyHours, 1)} ${tr('ساعت در ۷ روز اخیر', 'hrs past 7d')}`,
              icon: Clock,
              accent: 'text-sky-700 dark:text-sky-400',
            },
            {
              label: tr('مجموع تست‌های حل‌شده', 'Total Tests Solved'),
              value: fmtDigits(overview.totalTests),
              sub: `${fmtDigits(overview.weeklyTests)} ${tr('تست در ۷ روز اخیر', 'tests past 7d')}`,
              icon: Target,
              accent: 'text-indigo-700 dark:text-indigo-400',
            },
            {
              label: tr('صفحات مطالعه و تمرین', 'Pages & Exercises'),
              value: `${fmtDigits(overview.totalPages)} ${tr('ص', 'p')}`,
              sub: `${fmtDigits(overview.totalExercises)} ${tr('تمرین / تکلیف ثبت‌شده', 'exercises completed')}`,
              icon: BookOpen,
              accent: 'text-cyan-700 dark:text-cyan-400',
            },
            {
              label: tr('میانگین تحقق اهداف', 'Avg Goal Completion'),
              value: `${fmtNum(overview.avgCompletionPercent, 1)}${pctSign}`,
              sub: `${fmtDigits(overview.activeGoalsCount)} ${tr('هدف فعال تعریف‌شده', 'active study goals')}`,
              icon: Trophy,
              accent: 'text-emerald-700 dark:text-emerald-400',
            },
            {
              label: tr('سلامت و نرخ تأیید گزارش‌ها', 'Log Approval Rate'),
              value: `${fmtNum(overview.logStatusBreakdown.approvalRate, 1)}${pctSign}`,
              sub: `${fmtDigits(overview.logStatusBreakdown.approvedCount)} ${tr('از', 'of')} ${fmtDigits(overview.logStatusBreakdown.totalLogs)} ${tr('گزارش', 'logs')}`,
              icon: CheckCircle2,
              accent: 'text-emerald-700 dark:text-emerald-400',
            },
            {
              label: tr('صف بررسی و موارد مشکوک', 'Pending & Flagged Logs'),
              value: fmtDigits(overview.pendingLogsCount),
              sub: `${fmtDigits(overview.suspiciousLogsCount)} ${tr('مشکوک', 'flagged')} · ${fmtDigits(overview.logStatusBreakdown.rejectedCount)} ${tr('ردشده', 'rejected')}`,
              icon: AlertTriangle,
              accent: overview.pendingLogsCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300',
            },
            {
              label: tr('هشدار کم‌فعالی و تعلیق', 'Low Activity & Suspended'),
              value: fmtDigits(teacherAnalytics?.lowActivityStudents.length ?? 0),
              sub: `${fmtDigits(overview.suspendedCount)} ${tr('حساب تعلیق‌شده در لیگ', 'suspended accounts')}`,
              icon: ShieldAlert,
              accent:
                (teacherAnalytics?.lowActivityStudents.length ?? 0) > 0 || overview.suspendedCount > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-700 dark:text-slate-300',
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
                  <Icon className={`w-4 h-4 shrink-0 ${kpi.accent}`} />
                </div>
                <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-2">{kpi.value}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{kpi.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== SECTION 2: 6 ANALYTICAL CHARTS ==================== */}
      {showOverview && (
        <div className="space-y-5">
          {/* Chart 1 & Chart 2: Daily (14d/30d) + Weekly 6-Week Trend */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DailyActivityChart
              title={tr('روند روزانه فعالیت‌های مطالعاتی', 'Daily Study Activity Trend')}
              subtitle={tr(
                'پایش روزبه‌روز ساعت مطالعه، تست، امتیاز و مشارکت در ۱۴ یا ۳۰ روز اخیر',
                'Day-by-day hours, tests, points, logs, and active participants'
              )}
              series={overview.dailySeries}
              metric={dailyMetric}
              windowDays={dailyWindow}
              onChangeMetric={setDailyMetric}
              onChangeWindow={setDailyWindow}
            />

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('روند مقایسه ۶ هفته اخیر', '6-Week Progression Trend')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('مقایسه تجمیعی هفته‌به‌هفته در فصل جاری', 'Week-over-week progression across recent 6 weeks')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'hours', label: tr('ساعت', 'Hours') },
                      { id: 'tests', label: tr('تست', 'Tests') },
                      { id: 'points', label: tr('امتیاز', 'Points') },
                      { id: 'activeStudents', label: tr('دانش‌آموزان', 'Students') },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setWeeklyMetric(m.id)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
                        weeklyMetric === m.id
                          ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <LineTrendChart
                title=""
                maxValue={Math.ceil(maxWeeklyVal)}
                data={weeklyTrend.map((w) => ({
                  label: fmtDigits(w.label),
                  value: Number(w[weeklyMetric] ?? 0),
                }))}
              />

              {weeklyTrend.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px] tabular-nums">
                  {weeklyTrend.map((w) => (
                    <div
                      key={w.startDate}
                      className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 px-2.5 py-1.5"
                    >
                      <div className="font-semibold text-slate-700 dark:text-slate-200 truncate">{fmtDigits(w.label)}</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {fmtNum(w.hours, 1)} {tr('س', 'h')} · {fmtDigits(w.tests)} {tr('ت', 'Q')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chart 3 & Chart 4: Class Comparison + Subject Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {(Object.keys(classChartMetricLabel) as ClassMetric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setClassMetric(m)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      classMetric === m
                        ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {classChartMetricLabel[m]}
                  </button>
                ))}
              </div>
              <HorizontalBarChart
                title={`${tr('مقایسه عملکرد کلاس‌ها:', 'Class Comparison:')} ${classChartMetricLabel[classMetric]}`}
                subtitle={tr('ارزیابی تطبیقی کلاس‌های تحت پوشش', 'Comparative view across classes')}
                maxValue={Math.ceil(maxClassChartVal)}
                passingLine={
                  classMetric === 'avgCompletionPercent' || classMetric === 'participationRate'
                    ? 60
                    : Math.round(maxClassChartVal * 0.5)
                }
                data={filteredClassComparison.map((c) => ({
                  label: c.className,
                  value: Number(c[classMetric] ?? 0),
                  sublabel: `${fmtDigits(c.participantsCount)}/${fmtDigits(c.totalStudentsInClass)} ${tr('نفر', 'stu')} · ${fmtNum(c.totalHours, 1)} ${tr('س', 'h')}`,
                }))}
              />
            </div>

            <HorizontalBarChart
              title={tr('درصد تحقق اهداف به تفکیک هر درس', 'Goal Completion Rate by Subject')}
              subtitle={tr('بر اساس میانگین تحقق اهداف ثبت‌شده برای هر درس', 'Average goal completion across all goals per subject')}
              maxValue={100}
              passingLine={70}
              data={subjectChartItems.map((s) => ({
                label: s.subjectName,
                value: s.avgCompletionPercent,
                sublabel: `${fmtNum(s.loggedHours, 1)}/${fmtNum(s.targetHours, 1)} ${tr('س', 'h')} · ${fmtDigits(s.participantsCount)} ${tr('نفر', 'stu')}`,
              }))}
            />
          </div>

          {/* Chart 5 & Chart 6: Completion Distribution + Log Integrity Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CompletionDistributionCard
              distribution={overview.completionDistribution}
              totalStudents={overview.totalStudents}
            />
            <LogIntegrityDonutCard breakdown={overview.logStatusBreakdown} />
          </div>
        </div>
      )}

      {/* ==================== SECTION 3: CLASS, GRADE & SUBJECT TABLES ==================== */}
      {showClassesSubjects && (
        <div className="space-y-5">
          {/* Table 1: Detailed Class Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('جدول مقایسه تفصیلی کلاس‌ها', 'Detailed Class Performance Matrix')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('نرخ مشارکت، حجم مطالعه، امتیازات و وضعیت گزارش‌های در انتظار بررسی هر کلاس', 'Participation, study volume, scores, and audit counts per class')}
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {fmtDigits(filteredClassComparison.length)} {tr('کلاس', 'classes')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                    <th className="py-2.5 px-3 font-semibold">{tr('کلاس', 'Class')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('پایه', 'Grade')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('کل دانش‌آموزان', 'Total')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('فعال', 'Active')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('مشارکت', 'Participation')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('اهداف', 'Goals')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('ساعت مطالعه', 'Hours')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('تست', 'Tests')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('صفحه', 'Pages')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('تمرین', 'Exer.')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('میانگین امتیاز', 'Avg Pts')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('میانگین تحقق هدف', 'Completion')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('منتظر / مشکوک', 'Pending / Flagged')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {filteredClassComparison.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        {tr('کلاسی مطابق فیلترهای انتخاب‌شده یافت نشد.', 'No classes match the active filters.')}
                      </td>
                    </tr>
                  ) : (
                    filteredClassComparison.map((c) => (
                      <tr key={c.classId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{c.className}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{c.gradeLevel}</td>
                        <td className="py-2.5 px-3">{fmtDigits(c.totalStudentsInClass)}</td>
                        <td className="py-2.5 px-3 font-semibold text-sky-700 dark:text-sky-400">
                          {fmtDigits(c.participantsCount)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {fmtNum(c.participationRate, 1)}
                          {pctSign}
                        </td>
                        <td className="py-2.5 px-3">{fmtDigits(c.activeGoalsCount)}</td>
                        <td className="py-2.5 px-3 font-semibold">{fmtNum(c.totalHours, 1)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(c.totalTests)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(c.totalPages)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(c.totalExercises)}</td>
                        <td className="py-2.5 px-3 font-extrabold text-[#0F274A] dark:text-sky-400">
                          {fmtNum(c.avgPoints, 1)}
                        </td>
                        <td className="py-2.5 px-3">
                          <ProgressBarCell percent={c.avgCompletionPercent} fmtNum={fmtNum} pctSign={pctSign} />
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            {fmtDigits(c.pendingLogsCount)}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span className={c.flaggedLogsCount > 0 ? 'text-red-700 dark:text-red-400 font-bold' : 'text-slate-500'}>
                            {fmtDigits(c.flaggedLogsCount)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredClassComparison.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      <td className="py-2.5 px-3" colSpan={2}>
                        {tr('جمع کل / میانگین کلاس‌ها', 'Totals / Class Average')}
                      </td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.students)}</td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.participants)}</td>
                      <td className="py-2.5 px-3">
                        {fmtNum(classTotals.students > 0 ? (classTotals.participants / classTotals.students) * 100 : 0, 1)}
                        {pctSign}
                      </td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.goals)}</td>
                      <td className="py-2.5 px-3">{fmtNum(classTotals.hours, 1)}</td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.tests)}</td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.pages)}</td>
                      <td className="py-2.5 px-3">{fmtDigits(classTotals.exercises)}</td>
                      <td className="py-2.5 px-3">{fmtNum(classTotals.pointsSum / classCountSafe, 1)}</td>
                      <td className="py-2.5 px-3">
                        {fmtNum(classTotals.compSum / classCountSafe, 1)}
                        {pctSign}
                      </td>
                      <td className="py-2.5 px-3">
                        {fmtDigits(classTotals.pending)} / {fmtDigits(classTotals.flagged)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Table 2: Subject Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('جدول تحلیل عملکرد به تفکیک دروس', 'Subject-by-Subject Study Performance')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('مقایسه ساعت و تست هدف‌گذاری‌شده با عملکرد واقعی تأییدشده در هر درس', 'Target vs approved study metrics across subjects')}
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {fmtDigits(filteredSubjects.length)} {tr('درس', 'subjects')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                    <th className="py-2.5 px-3 font-semibold">{tr('نام درس', 'Subject')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('اهداف', 'Goals')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('شرکت‌کنندگان', 'Students')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('ساعت (ثبت / هدف)', 'Hours (Logged / Target)')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('تست (ثبت / هدف)', 'Tests (Logged / Target)')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('صفحات مطالعه', 'Pages')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('تمرین‌ها', 'Exercises')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('میانگین تحقق هدف', 'Avg Completion')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('امتیاز کل', 'Total Points')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        {tr('هنوز هدفی برای دروس در این محدوده تعریف نشده است.', 'No subject goals recorded in this scope yet.')}
                      </td>
                    </tr>
                  ) : (
                    filteredSubjects.map((s) => (
                      <tr key={s.subjectId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{s.subjectName}</td>
                        <td className="py-2.5 px-3">{fmtDigits(s.goalsCount)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(s.participantsCount)}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {fmtNum(s.loggedHours, 1)}
                          </span>
                          <span className="text-slate-400"> / {fmtNum(s.targetHours, 1)}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {fmtDigits(s.loggedTests)}
                          </span>
                          <span className="text-slate-400"> / {fmtDigits(s.targetTests)}</span>
                        </td>
                        <td className="py-2.5 px-3">{fmtDigits(s.loggedPages)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(s.loggedExercises)}</td>
                        <td className="py-2.5 px-3">
                          <ProgressBarCell percent={s.avgCompletionPercent} fmtNum={fmtNum} pctSign={pctSign} />
                        </td>
                        <td className="py-2.5 px-3 font-extrabold text-[#0F274A] dark:text-sky-400">
                          {fmtNum(s.totalPoints, 1)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredSubjects.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      <td className="py-2.5 px-3">{tr('جمع / میانگین دروس', 'Totals / Average')}</td>
                      <td className="py-2.5 px-3">{fmtDigits(subjectTotals.goals)}</td>
                      <td className="py-2.5 px-3">—</td>
                      <td className="py-2.5 px-3">
                        {fmtNum(subjectTotals.loggedHours, 1)} / {fmtNum(subjectTotals.targetHours, 1)}
                      </td>
                      <td className="py-2.5 px-3">
                        {fmtDigits(subjectTotals.loggedTests)} / {fmtDigits(subjectTotals.targetTests)}
                      </td>
                      <td className="py-2.5 px-3">{fmtDigits(subjectTotals.pages)}</td>
                      <td className="py-2.5 px-3">{fmtDigits(subjectTotals.exercises)}</td>
                      <td className="py-2.5 px-3">
                        {fmtNum(subjectTotals.compSum / Math.max(1, filteredSubjects.length), 1)}
                        {pctSign}
                      </td>
                      <td className="py-2.5 px-3">{fmtNum(subjectTotals.points, 1)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Table 3: Grade Level Breakdown (when present) */}
          {overview.gradeLevelBreakdown.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش تجمیعی به تفکیک پایه تحصیلی', 'Grade-Level Summary Report')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('مقایسه عملکرد پایه‌های مختلف دبیرستان در لیگ مطالعاتی', 'Cross-grade league participation and academic volume')}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                      <th className="py-2.5 px-3 font-semibold">{tr('پایه تحصیلی', 'Grade Level')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('تعداد کلاس', 'Classes')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('کل دانش‌آموزان', 'Students')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('شرکت‌کنندگان', 'Participants')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('نرخ مشارکت', 'Participation')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('مجموع ساعات', 'Total Hours')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('تست‌ها', 'Tests')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('صفحات', 'Pages')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('میانگین امتیاز', 'Avg Points')}</th>
                      <th className="py-2.5 px-3 font-semibold">{tr('تحقق هدف', 'Completion')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                    {overview.gradeLevelBreakdown.map((g) => (
                      <tr key={g.gradeLevel} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{g.gradeLevel}</td>
                        <td className="py-2.5 px-3">{fmtDigits(g.classesCount)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(g.totalStudents)}</td>
                        <td className="py-2.5 px-3 font-semibold text-sky-700 dark:text-sky-400">
                          {fmtDigits(g.participantsCount)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {fmtNum(g.participationRate, 1)}
                          {pctSign}
                        </td>
                        <td className="py-2.5 px-3">{fmtNum(g.totalHours, 1)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(g.totalTests)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(g.totalPages)}</td>
                        <td className="py-2.5 px-3 font-extrabold text-[#0F274A] dark:text-sky-400">
                          {fmtNum(g.avgPoints, 1)}
                        </td>
                        <td className="py-2.5 px-3">
                          <ProgressBarCell percent={g.avgCompletionPercent} fmtNum={fmtNum} pctSign={pctSign} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SECTION 4: COMPREHENSIVE STUDENT MATRIX ==================== */}
      {showStudents && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('جدول جامع عملکرد فردی دانش‌آموزان', 'Comprehensive Student Performance Matrix')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr(
                  'رتبه، امتیاز کل و هفتگی، حجم مطالعه، درصد تحقق هدف، استمرار روزانه و وضعیت ممیزی هر دانش‌آموز (با قابلیت مرتب‌سازی ستون‌ها)',
                  'Sortable per-student metrics including rank, weekly velocity, study volume, goal completion, streak, and log status'
                )}
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {tr('نمایش', 'Showing')} {fmtDigits(visibleStudents.length)} {tr('از', 'of')}{' '}
              {fmtDigits(filteredStudents.length)} {tr('دانش‌آموز', 'students')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                  {[
                    { key: 'rank' as StudentSortKey, label: tr('رتبه', 'Rank') },
                    { key: 'studentName' as StudentSortKey, label: tr('دانش‌آموز', 'Student') },
                  ].map((col) => (
                    <th key={col.key} className="py-2.5 px-2.5 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        <span>{col.label}</span>
                        <ArrowDownUp className="w-3 h-3 opacity-60" />
                      </button>
                    </th>
                  ))}
                  <th className="py-2.5 px-2.5 font-semibold">{tr('کلاس / پایه', 'Class / Grade')}</th>
                  <th className="py-2.5 px-2.5 font-semibold">{tr('اهداف', 'Goals')}</th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('points')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('امتیاز کل (هفته)', 'Points (7d)')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('hours')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('ساعت (هفته)', 'Hours (7d)')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('tests')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('تست (هفته)', 'Tests (7d)')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">{tr('صفحه / تمرین', 'Pages / Ex.')}</th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('completionPercent')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('تحقق هدف', 'Completion')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('streakDays')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('استمرار', 'Streak')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('logsCount')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>{tr('گزارش‌ها', 'Logs')}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">{tr('نشان و آخرین ثبت', 'Badges & Last Log')}</th>
                  {onSendEncouragement && <th className="py-2.5 px-2.5 font-semibold print:hidden">{tr('اقدام', 'Action')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {visibleStudents.length === 0 ? (
                  <tr>
                    <td colSpan={onSendEncouragement ? 13 : 12} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      {tr('دانش‌آموزی مطابق فیلتر انتخاب‌شده یافت نشد.', 'No students match the selected filters.')}
                    </td>
                  </tr>
                ) : (
                  visibleStudents.map((s) => (
                    <tr key={s.studentId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">
                            #{fmtDigits(s.rank)}
                          </span>
                          {s.rankDelta > 0 && (
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              <TrendingUp className="w-3 h-3" />+{fmtDigits(s.rankDelta)}
                            </span>
                          )}
                          {s.rankDelta < 0 && (
                            <span className="inline-flex items-center text-[10px] font-bold text-red-700 dark:text-red-400">
                              <TrendingDown className="w-3 h-3" />
                              {fmtDigits(s.rankDelta)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{s.studentName}</div>
                        {s.suspended && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                            {tr('تعلیق‌شده', 'Suspended')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div>{s.className}</div>
                        {s.gradeLevel && <div className="text-[10px] text-slate-400">{s.gradeLevel}</div>}
                      </td>
                      <td className="py-2.5 px-2.5">{fmtDigits(s.goalsCount)}</td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-[#0F274A] dark:text-sky-400">{fmtNum(s.points, 1)}</div>
                        <div className="text-[10px] text-slate-400">
                          {tr('۷روز:', '7d:')} {fmtNum(s.weeklyPoints, 1)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-semibold">{fmtNum(s.hours, 1)}</div>
                        <div className="text-[10px] text-slate-400">
                          {tr('۷روز:', '7d:')} {fmtNum(s.weeklyHours, 1)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-semibold">{fmtDigits(s.tests)}</div>
                        <div className="text-[10px] text-slate-400">
                          {tr('۷روز:', '7d:')} {fmtDigits(s.weeklyTests)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {fmtDigits(s.pages)} / {fmtDigits(s.exercises)}
                      </td>
                      <td className="py-2.5 px-2.5">
                        <ProgressBarCell percent={s.completionPercent} fmtNum={fmtNum} pctSign={pctSign} />
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                          <Flame className="w-3.5 h-3.5" />
                          {fmtDigits(s.streakDays)} {tr('روز', 'd')}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div>
                          <span className="font-semibold">{fmtDigits(s.logsCount)}</span>
                          <span className="text-[10px] text-slate-400">
                            {' '}
                            ({fmtDigits(s.approvedLogsCount)} {tr('تأیید', 'ok')})
                          </span>
                        </div>
                        {(s.pendingLogsCount > 0 || s.flaggedLogsCount > 0) && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                            {s.pendingLogsCount > 0 ? `${fmtDigits(s.pendingLogsCount)} ${tr('منتظر', 'pend')}` : ''}
                            {s.flaggedLogsCount > 0 ? ` · ${fmtDigits(s.flaggedLogsCount)} ${tr('مشکوک', 'flag')}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Award className="w-3.5 h-3.5 text-amber-600" />
                          <span>{fmtDigits(s.badgesCount)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.lastLogDate ? fmtDate(s.lastLogDate) : tr('ثبتی ندارد', 'No logs')}
                        </div>
                      </td>
                      {onSendEncouragement && (
                        <td className="py-2.5 px-2.5 print:hidden">
                          <button
                            type="button"
                            onClick={() => onSendEncouragement(s.studentId)}
                            title={tr('ارسال بازخورد و پیام تشویقی', 'Send encouragement')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                          >
                            <MessageSquareHeart className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>{tr('بازخورد', 'Coach')}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredStudents.length > 25 && (
            <div className="flex justify-center pt-2 print:hidden">
              <button
                type="button"
                onClick={() => setShowAllStudents((prev) => !prev)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {showAllStudents
                  ? tr('نمایش ۲۵ نفر برتر جدول', 'Show Top 25 Rows')
                  : `${tr('نمایش همه', 'Show All')} (${fmtDigits(filteredStudents.length)} ${tr('دانش‌آموز', 'students')})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== SECTION 5: ALERTS, TOP IMPROVERS & LOG AUDITS ==================== */}
      {showAlertsLogs && (
        <div className="space-y-5">
          {teacherAnalytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Low-activity Alert Panel */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{tr('گزارش دانش‌آموزان کم‌فعالیت (۷ روز اخیر)', 'Low-Activity Alert Report (Past 7 Days)')}</span>
                  </h4>
                  <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {fmtDigits(teacherAnalytics.lowActivityStudents.length)} {tr('نفر', 'students')}
                  </span>
                </div>
                {teacherAnalytics.lowActivityStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    {tr('همه دانش‌آموزان فعالیت مطلوبی در هفته اخیر داشته‌اند.', 'All students maintained active study logs this week.')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                    {teacherAnalytics.lowActivityStudents.map((s) => (
                      <div key={s.studentId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{s.studentName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {s.className} · {tr('تحقق هدف:', 'Goal:')} {fmtNum(s.completionPercent, 0)}
                            {pctSign} · {tr('تست ۷ روز:', '7d tests:')} {fmtDigits(s.loggedTests7d)}
                            {s.lastLogDate ? ` · ${tr('آخرین ثبت:', 'Last:')} ${fmtDate(s.lastLogDate)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums font-bold text-amber-700 dark:text-amber-400">
                            {fmtNum(s.loggedHours7d, 1)} {tr('ساعت', 'hrs')}
                          </span>
                          {onSendEncouragement && (
                            <button
                              type="button"
                              onClick={() => onSendEncouragement(s.studentId)}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 print:hidden"
                              title={tr('ارسال پیام پیگیری و انگیزشی', 'Send follow-up encouragement')}
                            >
                              <MessageSquareHeart className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Highest Improvement Panel */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>{tr('گزارش پیشتازان رشد هفتگی', 'Highest Weekly Improvement Report')}</span>
                  </h4>
                  <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmtDigits(teacherAnalytics.highImprovementStudents.length)} {tr('نفر', 'students')}
                  </span>
                </div>
                {teacherAnalytics.highImprovementStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    {tr('داده‌های مقایسه هفتگی پس از ثبت دو هفته عملکرد ظاهر می‌شوند.', 'Improvement comparisons appear after consecutive weeks of logs.')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                    {teacherAnalytics.highImprovementStudents.map((s) => (
                      <div key={s.studentId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{s.studentName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {s.className} · {fmtNum(s.previousWeekPoints, 0)} ← {fmtNum(s.currentWeekPoints, 0)}{' '}
                            {tr('امتیاز', 'pts')}
                          </p>
                        </div>
                        <span className="tabular-nums font-extrabold text-emerald-700 dark:text-emerald-400">
                          +{fmtDigits(s.improvementPercent)}
                          {pctSign}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Log Audit Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش تفصیلی و ممیزی ثبت عملکردهای روزانه', 'Detailed Study Logs & Audit Trail')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('مرور ریز گزارش‌های ثبت‌شده دانش‌آموزان به تفکیک وضعیت تأیید و علت هشدارهای سیستم', 'Itemized log records with status and anti-cheat audit reasons')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                {(
                  [
                    { id: 'all', label: tr('همه', 'All') },
                    { id: 'pending_flagged', label: tr('منتظر / مشکوک', 'Pending / Flagged') },
                    { id: 'approved', label: tr('تأییدشده', 'Approved') },
                    { id: 'rejected', label: tr('ردشده', 'Rejected') },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLogTableFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      logTableFilter === f.id
                        ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                {onJumpToReview && overview.pendingLogsCount > 0 && (
                  <button
                    type="button"
                    onClick={onJumpToReview}
                    className="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold"
                  >
                    {tr('بررسی صف تأیید', 'Review Queue')} ({fmtDigits(overview.pendingLogsCount)})
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                    <th className="py-2.5 px-3 font-semibold">{tr('تاریخ', 'Date')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('دانش‌آموز و کلاس', 'Student & Class')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('هدف مطالعاتی', 'Study Goal')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('ساعت', 'Hours')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('تست', 'Tests')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('صفحه / تمرین', 'Pages / Ex.')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('امتیاز', 'Points')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('وضعیت', 'Status')}</th>
                    <th className="py-2.5 px-3 font-semibold">{tr('توضیح / هشدار ممیزی', 'Audit Note / Flag')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {visibleLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        {tr('گزارش عملکردی با فیلترهای انتخاب‌شده یافت نشد.', 'No study logs match the selected filters.')}
                      </td>
                    </tr>
                  ) : (
                    visibleLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {fmtDate(l.date)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{l.studentName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{l.className}</div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300">
                          {l.goalTitle}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{fmtNum(l.hours, 1)}</td>
                        <td className="py-2.5 px-3">{fmtDigits(l.testCount)}</td>
                        <td className="py-2.5 px-3">
                          {fmtDigits(l.pagesRead)} / {fmtDigits(l.exercisesDone)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#0F274A] dark:text-sky-400">
                          {fmtNum(l.computedPoints, 1)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge(l.status)}</td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {l.flaggedReason ? (
                            <span className="text-amber-700 dark:text-amber-300 font-semibold">{l.flaggedReason}</span>
                          ) : l.reviewNote ? (
                            <span className="text-slate-600 dark:text-slate-300">{l.reviewNote}</span>
                          ) : l.notes ? (
                            <span className="text-slate-500 dark:text-slate-400 truncate max-w-[180px] inline-block">
                              {l.notes}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredLogs.length > 40 && (
              <div className="flex justify-center pt-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setShowAllLogs((prev) => !prev)}
                  className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {showAllLogs
                    ? tr('نمایش ۴۰ گزارش اخیر', 'Show Latest 40 Logs')
                    : `${tr('نمایش همه گزارش‌ها', 'Show All Logs')} (${fmtDigits(filteredLogs.length)})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
