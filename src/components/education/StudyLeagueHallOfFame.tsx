import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Crown,
  Flame,
  Medal,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  LeagueHallOfFame,
  StudyBadgeCode,
  StudyLeaguePrize,
  StudyLeagueSeason,
} from '../../../shared/types';
import { useI18n } from '../../lib/i18n';
import { CircularSpinner } from '../ui/StatCard';

export function BadgeIcon({ code, className = 'w-4 h-4' }: { code: StudyBadgeCode; className?: string }) {
  if (code === 'weekly_champion') return <Crown className={className} />;
  if (code === 'golden_streak') return <Flame className={className} />;
  if (code === 'test_king') return <CheckCircle2 className={className} />;
  if (code === 'big_improvement') return <TrendingUp className={className} />;
  if (code === 'hardworking_student') return <BookOpen className={className} />;
  return <Sparkles className={className} />;
}

export function badgeTierClasses(tier: string): string {
  if (tier === 'gold') {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
  }
  if (tier === 'emerald') {
    return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
  }
  if (tier === 'indigo') {
    return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60';
  }
  if (tier === 'silver') {
    return 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/60';
  }
  return 'bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800/60';
}

export function StudyLeagueHallOfFame({
  hallOfFame,
  season,
  prizes = [],
  loading,
}: {
  hallOfFame: LeagueHallOfFame | null;
  season?: StudyLeagueSeason | null;
  prizes?: StudyLeaguePrize[];
  loading?: boolean;
}) {
  const { tr, fmtNum, fmtDigits, fmtDate, lang } = useI18n();

  if (loading || !hallOfFame) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <CircularSpinner size="md" />
        <span>{tr('در حال دریافت فهرست برترین‌های لیگ مطالعاتی...', 'Loading League Hall of Fame...')}</span>
      </div>
    );
  }

  const topThree = hallOfFame?.topThree ?? [];
  const topBySubject = hallOfFame?.topBySubject ?? [];
  const studentOfWeek = hallOfFame?.studentOfWeek ?? null;
  const studentOfMonth = hallOfFame?.studentOfMonth ?? null;
  const mostImproved = hallOfFame?.mostImproved ?? [];
  const badgeShowcase = hallOfFame?.badgeShowcase ?? [];

  const podiumColors = [
    {
      ring: 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20',
      badge: 'text-amber-700 dark:text-amber-300',
      label: tr('رتبه اول — طلایی', '1st Place — Gold'),
      Icon: Crown,
    },
    {
      ring: 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40',
      badge: 'text-slate-700 dark:text-slate-200',
      label: tr('رتبه دوم — نقره‌ای', '2nd Place — Silver'),
      Icon: Medal,
    },
    {
      ring: 'border-orange-200 dark:border-orange-800/70 bg-orange-50/40 dark:bg-orange-950/20',
      badge: 'text-orange-700 dark:text-orange-300',
      label: tr('رتبه سوم — برنزی', '3rd Place — Bronze'),
      Icon: Award,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Trophy className="w-4 h-4" />
              <span>{tr('تالار افتخارات و برترین‌های لیگ مطالعاتی', 'Study League Hall of Fame')}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
              {season?.title ?? tr('برترینهای لیگ مطالعاتی', 'League Champions')}
            </h2>
            {season && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {tr('بازه فصل:', 'Season:')} {fmtDate(season.startDate)} {tr('تا', '–')} {fmtDate(season.endDate)}
                </span>
              </p>
            )}
          </div>

          {prizes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {prizes.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 text-xs"
                >
                  <p className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {p.rankFrom === p.rankTo
                      ? `${tr('جایزه رتبه', 'Rank')} ${fmtDigits(p.rankFrom)}`
                      : `${tr('رتبه', 'Ranks')} ${fmtDigits(p.rankFrom)}–${fmtDigits(p.rankTo)}`}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 max-w-[200px] truncate">
                    {p.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top 3 Showcase */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>{tr('۳ نفر برتر جدول کل لیگ', 'Top 3 Overall Champions')}</span>
        </h3>

        {topThree.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-12 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {tr(
              'هنوز عملکردی در فصل جاری ثبت نشده است. اولین نفرات برتر پس از ثبت مطالعه نمایش داده می‌شوند.',
              'No performance logs recorded in the active season yet.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topThree.map((entry, idx) => {
              const style = podiumColors[idx] ?? podiumColors[2];
              const RankIcon = style.Icon;
              return (
                <div
                  key={entry.studentId}
                  className={`rounded-2xl border p-5 flex flex-col justify-between ${style.ring}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${style.badge}`}>
                        <RankIcon className="w-4 h-4" />
                        <span>{style.label}</span>
                      </span>
                      <span className="text-xs font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
                        {fmtNum(entry.totalPoints, 1)} {tr('امتیاز', 'pts')}
                      </span>
                    </div>

                    <h4 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {entry.studentName}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {tr('کلاس:', 'Class:')} {entry.className}
                    </p>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('تحقق هدف', 'Goal %')}</p>
                        <p className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {fmtNum(entry.avgCompletionPercent, 0)}{tr('٪', '%')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('ساعت مطالعه', 'Hours')}</p>
                        <p className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {fmtNum(entry.totalHours, 1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('تست', 'Tests')}</p>
                        <p className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {fmtDigits(entry.totalTests)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {entry.badges.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-wrap gap-1.5">
                      {entry.badges.slice(0, 4).map((b) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-800 dark:text-slate-200"
                        >
                          <BadgeIcon code={b.code} className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>{lang === 'fa' ? b.titleFa : b.titleEn}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Student of the Week & Student of the Month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            title: tr('دانش‌آموز برتر هفته', 'Student of the Week'),
            subtitle: tr('بیشترین امتیاز در ۷ روز گذشته', 'Highest points earned in the last 7 days'),
            entry: studentOfWeek,
            points: studentOfWeek?.weeklyPoints ?? 0,
            hours: studentOfWeek?.weeklyHours ?? 0,
            accent: 'text-sky-700 dark:text-sky-400',
            Icon: Star,
          },
          {
            title: tr('دانش‌آموز برتر ماه', 'Student of the Month'),
            subtitle: tr('پیشتاز عملکرد در ۳۰ روز گذشته', 'Leading scholar over the past 30 days'),
            entry: studentOfMonth,
            points: studentOfMonth?.monthlyPoints ?? 0,
            hours: studentOfMonth?.monthlyHours ?? 0,
            accent: 'text-emerald-700 dark:text-emerald-400',
            Icon: Trophy,
          },
        ].map((card) => {
          const CardIcon = card.Icon;
          return (
            <div
              key={card.title}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${card.accent}`}>
                    <CardIcon className="w-4 h-4" />
                    <span>{card.title}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{card.subtitle}</p>
                </div>
                {card.entry && (
                  <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
                    {fmtNum(card.points, 1)} {tr('امتیاز', 'pts')}
                  </span>
                )}
              </div>

              {card.entry ? (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{card.entry.studentName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {card.entry.className} · {tr('تداوم:', 'Streak:')} {fmtDigits(card.entry.streakDays)}{' '}
                      {tr('روز', 'days')}
                    </p>
                  </div>
                  <div className="text-end text-xs tabular-nums">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {fmtNum(card.hours, 1)} {tr('ساعت', 'hrs')}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {fmtNum(card.entry.avgCompletionPercent, 0)}{tr('٪ تحقق هدف', '% goal')}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                  {tr('هنوز داده‌ای برای این بازه ثبت نشده است.', 'No activity recorded for this period.')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Most Improved & Top By Subject */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>{tr('بیشترین پیشرفت نسبت به هفته قبل', 'Most Improved vs Last Week')}</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {tr('جهش امتیازی و صعود در جدول رقابت', 'Score growth and ranking momentum')}
              </p>
            </div>
          </div>

          {mostImproved.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              {tr('رشد هفتگی پس از مقایسه دو بازه متوالی محاسبه می‌شود.', 'Weekly improvement calculates once sequential weeks are logged.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {mostImproved.map((item) => (
                <div key={item.studentId} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{item.studentName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.className} · {fmtNum(item.previousPoints, 0)} ← {fmtNum(item.currentPoints, 0)}{' '}
                      {tr('امتیاز', 'pts')}
                    </p>
                  </div>
                  <div className="text-end shrink-0 tabular-nums">
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                      +{fmtDigits(item.improvementPercent)}{tr('٪', '%')}
                    </span>
                    {item.rankDelta > 0 && (
                      <p className="text-[10px] text-sky-700 dark:text-sky-400">
                        ▲ {fmtDigits(item.rankDelta)} {tr('پله صعود', 'ranks up')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
              <span>{tr('نفرات برتر به تفکیک هر درس', 'Top Scholars by Subject')}</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {tr('برترین دانش‌آموزان در مطالعه و تست‌زنی هر درس', 'Highest-scoring participants in each subject')}
            </p>
          </div>

          {topBySubject.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              {tr('هنوز عملکرد تفکیک‌شده‌ای برای دروس ثبت نشده است.', 'No subject-level performance logged yet.')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topBySubject.map((sub) => (
                <div
                  key={sub.subjectId}
                  className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/40 dark:bg-slate-800/30"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 pb-2 mb-2 border-b border-slate-200/80 dark:border-slate-700">
                    {sub.subjectName}
                  </p>
                  <div className="space-y-1.5">
                    {sub.topStudents.map((st) => (
                      <div key={st.studentId} className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-bold text-[#0F274A] dark:text-sky-400 tabular-nums">
                            {fmtDigits(st.rank)}.
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {st.studentName}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                          {fmtNum(st.hours, 1)} {tr('س', 'h')} · {fmtDigits(st.tests)} {tr('تست', 'Q')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Badges & Achievements Catalog */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{tr('نشان‌ها و مدال‌های افتخار لیگ', 'League Badges & Achievements')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {tr(
              'نشان‌ها به‌صورت خودکار پس از تحقق شرایط علمی یا با تأیید مدیر و معلمان اهدا می‌شوند.',
              'Badges are automatically awarded upon hitting milestones or granted by faculty.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {badgeShowcase.map(({ badge, holders }) => (
            <div
              key={badge.code}
              className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${badgeTierClasses(badge.colorTier)}`}
                  >
                    <BadgeIcon code={badge.code} className="w-3.5 h-3.5" />
                    <span>{lang === 'fa' ? badge.titleFa : badge.titleEn}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    {fmtDigits(holders.length)} {tr('دارنده', 'earned')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">
                  {lang === 'fa' ? badge.descriptionFa : badge.descriptionEn}
                </p>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                {holders.length === 0 ? (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {tr('هنوز دانش‌آموزی این نشان را دریافت نکرده است', 'No holders yet in this season')}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-5">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      {tr('دریافت‌کنندگان:', 'Holders:')}{' '}
                    </span>
                    {holders.slice(0, 5).map((h) => h.studentName).join(lang === 'fa' ? '، ' : ', ')}
                    {holders.length > 5 ? ` (+${fmtDigits(holders.length - 5)})` : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
