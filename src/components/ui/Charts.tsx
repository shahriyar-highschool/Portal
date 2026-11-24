import { useI18n } from '../../lib/i18n';

export interface BarChartDatum {
  label: string;
  value: number;
  sublabel?: string;
}

export function HorizontalBarChart({
  title,
  subtitle,
  data,
  maxValue = 20,
  passingLine = 10,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  data: BarChartDatum[];
  maxValue?: number;
  passingLine?: number;
  emptyText?: string;
}) {
  const { isRtl, tr, fmtNum, fmtDigits } = useI18n();
  const passPct = Math.max(0, Math.min(100, (passingLine / maxValue) * 100));
  const resolvedEmpty = emptyText ?? tr('هنوز داده‌ای برای نمایش نمودار ثبت نشده است.', 'No chart data recorded yet.');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {data.length > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {tr('حدنصاب:', 'Threshold:')} {fmtDigits(passingLine)} {tr('از', 'of')} {fmtDigits(maxValue)}
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/30">
          {resolvedEmpty}
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((item) => {
            const pct = Math.max(0, Math.min(100, (item.value / maxValue) * 100));
            const colorClass =
              item.value >= maxValue * 0.75
                ? 'bg-[#0F274A] dark:bg-sky-500'
                : item.value >= passingLine
                ? 'bg-blue-700 dark:bg-blue-500'
                : 'bg-red-600 dark:bg-red-500';

            return (
              <div key={item.label} className="group space-y-1.5">
                <div className="flex items-center justify-between text-xs gap-3">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.label}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                    {fmtNum(item.value)}
                    <span className="text-slate-400 font-normal"> / {fmtDigits(maxValue)}</span>
                    {item.sublabel ? (
                      <span className="text-slate-500 dark:text-slate-400 font-normal"> · {item.sublabel}</span>
                    ) : null}
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${colorClass}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-px bg-slate-400/70 dark:bg-slate-500/80"
                    style={isRtl ? { right: `${passPct}%` } : { left: `${passPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LineTrendChart({
  title,
  subtitle,
  data,
  maxValue = 20,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; value: number; count?: number }>;
  maxValue?: number;
  emptyText?: string;
}) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const resolvedEmpty =
    emptyText ?? tr('هنوز داده‌ای برای ترسیم روند پیشرفت ثبت نشده است.', 'No trend data recorded yet.');

  const width = 460;
  const height = 170;
  const padX = 28;
  const padY = 22;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {data.length > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {tr('بازه:', 'Scale:')} {fmtDigits(0)}–{fmtDigits(maxValue)}
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/30">
          {resolvedEmpty}
        </div>
      ) : (
        <div className="w-full">
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 min-w-[280px]">
              {/* Horizontal grid lines */}
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = height - padY - frac * (height - padY * 2);
                return (
                  <g key={frac}>
                    <line
                      x1={padX}
                      x2={width - padX}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray="3 3"
                    />
                  </g>
                );
              })}

              {/* Polyline */}
              {data.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={data
                    .map((d, i) => {
                      const x = padX + (i / (data.length - 1)) * (width - padX * 2);
                      const y = height - padY - (Math.min(maxValue, d.value) / maxValue) * (height - padY * 2);
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}

              {/* Data nodes */}
              {data.map((d, i) => {
                const x = data.length === 1 ? width / 2 : padX + (i / (data.length - 1)) * (width - padX * 2);
                const y = height - padY - (Math.min(maxValue, d.value) / maxValue) * (height - padY * 2);
                return (
                  <g key={d.label}>
                    <circle cx={x} cy={y} r="5" fill="#0F274A" className="dark:fill-sky-400" stroke="#ffffff" strokeWidth="2" />
                    <text
                      x={x}
                      y={y - 11}
                      textAnchor="middle"
                      className="fill-slate-800 dark:fill-slate-100 text-[11px] font-bold"
                    >
                      {fmtNum(d.value)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="grid gap-2 mt-1 text-center" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d) => (
              <div key={d.label} className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium">
                {d.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AttendanceBreakdownChart({
  title,
  stats,
}: {
  title: string;
  stats: { total: number; present: number; absent: number; late: number; excused: number };
}) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const total = stats.total;
  const presentRate = total > 0 ? (stats.present / total) * 100 : 0;

  const items = [
    { key: 'present', label: tr('حاضر', 'Present'), count: stats.present, stroke: '#15803d', dotClass: 'bg-emerald-700', textClass: 'text-emerald-700 dark:text-emerald-400' },
    { key: 'late', label: tr('تأخیر', 'Late'), count: stats.late, stroke: '#d97706', dotClass: 'bg-amber-600', textClass: 'text-amber-700 dark:text-amber-400' },
    { key: 'excused', label: tr('غیبت موجه', 'Excused'), count: stats.excused, stroke: '#64748b', dotClass: 'bg-slate-500', textClass: 'text-slate-700 dark:text-slate-300' },
    { key: 'absent', label: tr('غایب', 'Absent'), count: stats.absent, stroke: '#dc2626', dotClass: 'bg-red-600', textClass: 'text-red-700 dark:text-red-400' },
  ];

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {tr('مجموع رکوردهای ثبت‌شده:', 'Total records:')} {fmtDigits(total)}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/30">
          {tr('هنوز رکورد حضور و غیابی ثبت نشده است.', 'No attendance records logged yet.')}
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
              {items.map((it) => {
                if (it.count === 0) return null;
                const segmentLength = (it.count / total) * circumference;
                const dashArray = `${segmentLength} ${circumference - segmentLength}`;
                const dashOffset = -cumulativeOffset;
                cumulativeOffset += segmentLength;
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
                    className="transition-all duration-500"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
                {fmtNum(presentRate, 0)}{tr('٪', '%')}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {tr('نرخ حضور', 'Attendance')}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full grid grid-cols-2 gap-2.5">
            {items.map((it) => {
              const pct = total > 0 ? (it.count / total) * 100 : 0;
              return (
                <div key={it.key} className="border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-2.5 bg-slate-50/40 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-sm ${it.dotClass}`} />
                      <span>{it.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">{fmtNum(pct, 0)}{tr('٪', '%')}</span>
                  </div>
                  <p className={`mt-1 text-base font-bold tabular-nums ${it.textClass}`}>
                    {fmtDigits(it.count)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ReportCardChartItem {
  subjectName: string;
  studentAverage: number | null;
  classAverage: number | null;
}

function splitSubjectLabel(label: string): [string, string?] {
  const clean = label.trim();
  if (clean.length <= 12) return [clean];
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(' ');
    const line2 = words.slice(mid).join(' ');
    return [line1.slice(0, 14), line2.length > 14 ? `${line2.slice(0, 13)}…` : line2];
  }
  return [`${clean.slice(0, 11)}…`];
}

export function ReportCardComparisonChart({
  title,
  items,
  passingScore = 10,
}: {
  title?: string;
  items: ReportCardChartItem[];
  passingScore?: number;
}) {
  const { tr, fmtNum, fmtDigits } = useI18n();
  const visibleItems = items.filter((it) => it.studentAverage !== null || it.classAverage !== null);

  if (visibleItems.length === 0) {
    return null;
  }

  const maxVal = 20;
  const count = visibleItems.length;
  const width = Math.max(660, count * 44 + 54);
  const height = 162;
  const padLeft = 30;
  const padRight = 12;
  const padTop = 18;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const slotW = plotW / count;
  const barW = Math.min(16, Math.max(7, slotW * 0.28));
  const barGap = 2.5;

  const yFor = (val: number) => {
    const clamped = Math.max(0, Math.min(maxVal, val));
    return padTop + plotH - (clamped / maxVal) * plotH;
  };

  const passY = yFor(passingScore);

  return (
    <div className="print-avoid-break mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-2.5 sm:p-3 print-light-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2">
          <h4 className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100">
            {title ?? tr('نمودار مقایسه نمرات با میانگین کلاس', 'Student vs. Class Average Chart')}
          </h4>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            ({tr('مقیاس ۰ تا ۲۰', '0–20 scale')})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0F274A] dark:bg-sky-500 inline-block print-exact" />
            <span>{tr('میانگین دانش‌آموز', 'Student Avg')}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 dark:bg-slate-400 inline-block print-exact" />
            <span>{tr('میانگین کلاس', 'Class Avg')}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3.5 border-t-2 border-dashed border-amber-600 inline-block" />
            <span>
              {tr('حدنصاب', 'Pass')} ({fmtDigits(passingScore)})
            </span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto" dir="ltr">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[460px] max-h-[168px]"
          role="img"
          aria-label={tr('نمودار مقایسه نمرات دروس', 'Subject scores comparison chart')}
        >
          {/* Horizontal grid lines & Y-axis ticks */}
          {[0, 5, 10, 15, 20].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="#cbd5e1"
                  strokeOpacity={0.7}
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 text-[9px] font-semibold"
                >
                  {fmtDigits(tick)}
                </text>
              </g>
            );
          })}

          {/* Passing threshold line */}
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={passY}
            y2={passY}
            stroke="#d97706"
            strokeWidth={1.3}
            strokeDasharray="4 3"
          />

          {/* Subject bar pairs */}
          {visibleItems.map((item, idx) => {
            const cx = padLeft + slotW * (idx + 0.5);
            const stuX = cx - barW - barGap / 2;
            const clsX = cx + barGap / 2;
            const [line1, line2] = splitSubjectLabel(item.subjectName);

            const stuVal = item.studentAverage;
            const clsVal = item.classAverage;

            const stuColor =
              stuVal === null
                ? '#0F274A'
                : stuVal >= 18
                ? '#047857'
                : stuVal < passingScore
                ? '#dc2626'
                : '#0F274A';

            return (
              <g key={`${item.subjectName}_${idx}`}>
                {/* Student Bar */}
                {stuVal !== null && (
                  <>
                    <rect
                      x={stuX}
                      y={yFor(stuVal)}
                      width={barW}
                      height={Math.max(2, padTop + plotH - yFor(stuVal))}
                      rx={2}
                      fill={stuColor}
                    />
                    <text
                      x={stuX + barW / 2}
                      y={Math.max(10, yFor(stuVal) - 3.5)}
                      textAnchor="middle"
                      className="fill-slate-800 dark:fill-slate-100 text-[8px] font-bold"
                    >
                      {fmtNum(stuVal, 1)}
                    </text>
                  </>
                )}

                {/* Class Average Bar */}
                {clsVal !== null && (
                  <>
                    <rect
                      x={clsX}
                      y={yFor(clsVal)}
                      width={barW}
                      height={Math.max(2, padTop + plotH - yFor(clsVal))}
                      rx={2}
                      fill="#38bdf8"
                    />
                    <text
                      x={clsX + barW / 2}
                      y={Math.max(10, yFor(clsVal) - 3.5)}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-300 text-[8px] font-semibold"
                    >
                      {fmtNum(clsVal, 1)}
                    </text>
                  </>
                )}

                {/* Subject Name X-Axis Label */}
                <text
                  x={cx}
                  y={padTop + plotH + 12}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-300 text-[8.5px] font-semibold"
                >
                  <tspan x={cx} dy={0}>
                    {line1}
                  </tspan>
                  {line2 && (
                    <tspan x={cx} dy={10}>
                      {line2}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

