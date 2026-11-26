import {
  type AdminLeagueAnalytics,
  type LeagueCompletionDistribution,
  type LeagueGradeLevelBreakdownItem,
  type LeagueHallOfFame,
  type LeagueLeaderboardEntry,
  type LeagueLogStatusBreakdown,
  type LeagueSubjectBreakdownItem,
  type LeagueWeeklyTrendPoint,
  type SchoolClass,
  type StoredUser,
  type StudentLeagueAnalytics,
  type StudentLeagueBadge,
  type StudyBadgeCode,
  type StudyBadgeDefinition,
  type StudyFeedback,
  type StudyGoal,
  type StudyGoalWithProgress,
  type StudyLeagueArchive,
  type StudyLeagueArchiveWinner,
  type StudyLeagueConfig,
  type StudyLeagueNotification,
  type StudyLeagueNotificationType,
  type StudyLeaguePrize,
  type StudyLeagueRules,
  type StudyLeagueSeason,
  type StudyLeagueSeasonPeriod,
  type StudyLeagueWeights,
  type StudyLog,
  type StudyLogEditEntry,
  type StudyLogStatus,
  type Subject,
  type TeacherLeagueAnalytics,
} from '../../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetCollection,
  kvGetJson,
  kvPutJson,
  kvRemoveFromIndex,
  type SchoolKVStore,
} from '../kv/kvStore.ts';
import { generateId } from '../utils/crypto.ts';

export const STUDY_BADGE_DEFINITIONS: StudyBadgeDefinition[] = [
  {
    code: 'strong_start',
    titleFa: 'شروع قدرتمند',
    titleEn: 'Strong Start',
    descriptionFa: 'تعریف نخستین هدف مطالعاتی و ثبت اولین عملکرد تأییدشده در لیگ',
    descriptionEn: 'Created first study goal and logged first approved study session',
    colorTier: 'bronze',
  },
  {
    code: 'hardworking_student',
    titleFa: 'دانش‌آموز پرتلاش',
    titleEn: 'Hardworking Scholar',
    descriptionFa: 'دستیابی به حداقل ۱۵ ساعت مطالعه مؤثر یا تکمیل ۱۰۰٪ یک هدف مطالعاتی',
    descriptionEn: 'Logged at least 15 approved study hours or 100% goal completion',
    colorTier: 'emerald',
  },
  {
    code: 'golden_streak',
    titleFa: 'استمرار طلایی',
    titleEn: 'Golden Streak',
    descriptionFa: 'ثبت مطالعه مستمر در ۵ روز متوالی بدون وقفه',
    descriptionEn: 'Maintained an approved 5-day consecutive study streak',
    colorTier: 'gold',
  },
  {
    code: 'test_king',
    titleFa: 'سلطان تست',
    titleEn: 'Test Master',
    descriptionFa: 'حل حداقل ۲۵۰ تست تأییدشده در فصل جاری لیگ',
    descriptionEn: 'Solved at least 250 approved practice tests in the active season',
    colorTier: 'indigo',
  },
  {
    code: 'big_improvement',
    titleFa: 'پیشرفت چشمگیر',
    titleEn: 'Remarkable Progress',
    descriptionFa: 'رشد ۳۰ درصدی یا جهش قابل‌توجه امتیاز مطالعه نسبت به هفته قبل',
    descriptionEn: 'Achieved 30%+ score improvement compared to the previous week',
    colorTier: 'silver',
  },
  {
    code: 'weekly_champion',
    titleFa: 'قهرمان لیگ',
    titleEn: 'League Champion',
    descriptionFa: 'کسب رتبه اول لیگ مطالعاتی در ارزیابی دوره‌ای یا پایان فصل ماهانه',
    descriptionEn: 'Ranked #1 in monthly evaluation or season finale',
    colorTier: 'gold',
  },
];

const BADGE_DEF_MAP = new Map<StudyBadgeCode, StudyBadgeDefinition>(
  STUDY_BADGE_DEFINITIONS.map((b) => [b.code, b])
);

export function toIsoDate(input?: string | Date): string {
  if (input instanceof Date) {
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input ?? '')
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw);
  if (raw && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const base = new Date(`${toIsoDate(isoDate)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = new Date(`${toIsoDate(fromIso)}T00:00:00.000Z`).getTime();
  const b = new Date(`${toIsoDate(toIso)}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function defaultPeriodEndDate(startIso: string, periodType: StudyLeagueSeasonPeriod): string {
  if (periodType === 'daily') return startIso;
  if (periodType === 'weekly') return addDaysIso(startIso, 6);
  if (periodType === 'monthly') return addDaysIso(startIso, 29);
  if (periodType === 'term') return addDaysIso(startIso, 89);
  return addDaysIso(startIso, 13);
}

export function createDefaultLeagueConfig(): StudyLeagueConfig {
  const today = toIsoDate();
  const now = new Date().toISOString();
  const defaultWeights: StudyLeagueWeights = {
    studyHoursWeight: 12,
    testCountWeight: 0.4,
    pagesWeight: 0.25,
    exercisesWeight: 1.5,
    completionBonusWeight: 40,
    streakWeight: 8,
  };
  const defaultRules: StudyLeagueRules = {
    dailyPointCap: 180,
    minGoalCompletionForBonus: 80,
    suspiciousHoursThreshold: 14,
    suspiciousTestsThreshold: 600,
    requireApprovalAboveThreshold: true,
    requireApprovalAllLogs: false,
    eligibleGradeLevels: [],
  };
  const defaultPrizes: StudyLeaguePrize[] = [
    {
      id: 'prz_gold',
      rankFrom: 1,
      rankTo: 1,
      title: 'مدال طلا و تندیس قهرمان لیگ مطالعاتی + ۳۰۰ سکه آموزشی',
      description: 'اعطای نشان قهرمان هفته، تقدیرنامه مدرسه و امتیاز ویژه کارنامه اخلاقی',
      rewardType: 'badge',
      coinsAmount: 300,
      badgeCode: 'weekly_champion',
    },
    {
      id: 'prz_silver',
      rankFrom: 2,
      rankTo: 2,
      title: 'مدال نقره رقابت علمی + ۲۰۰ سکه آموزشی',
      description: 'ثبت افتخار آموزشی در کارنامه و دریافت جایزه کتابخانه دیجیتال',
      rewardType: 'coins',
      coinsAmount: 200,
    },
    {
      id: 'prz_bronze',
      rankFrom: 3,
      rankTo: 3,
      title: 'مدال برنز تلاش مستمر + ۱۲۰ سکه آموزشی',
      description: 'لوح تقدیر مدرسه و نشان استمرار مطالعه',
      rewardType: 'certificate',
      coinsAmount: 120,
    },
  ];
  const season: StudyLeagueSeason = {
    id: generateId('lgs'),
    title: 'فصل اول لیگ ماهانه مطالعاتی استاد شهریار',
    periodType: 'monthly',
    status: 'active',
    startDate: addDaysIso(today, -3),
    endDate: addDaysIso(today, 26),
    allowedClassIds: [],
    allowedSubjectIds: [],
    description: 'رقابت ماهانه مطالعه مؤثر، تست‌زنی هدفمند و تکمیل برنامه شخصی دروس',
    createdAt: now,
    updatedAt: now,
  };
  return {
    enabled: true,
    activeSeason: season,
    weights: defaultWeights,
    rules: defaultRules,
    prizes: defaultPrizes,
    suspendedStudentIds: [],
    updatedAt: now,
  };
}

export async function ensureLeagueConfig(kv: SchoolKVStore): Promise<StudyLeagueConfig> {
  const existing = await kvGetJson<StudyLeagueConfig>(kv, KV_KEYS.LEAGUE_CONFIG);
  if (existing && existing.activeSeason) {
    return existing;
  }
  const created = createDefaultLeagueConfig();
  await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, created);
  return created;
}

export async function createLeagueNotification(
  kv: SchoolKVStore,
  params: {
    userId: string;
    seasonId: string;
    type: StudyLeagueNotificationType;
    title: string;
    body: string;
    relatedId?: string;
  }
): Promise<StudyLeagueNotification> {
  const notif: StudyLeagueNotification = {
    id: generateId('lgn'),
    userId: params.userId,
    seasonId: params.seasonId,
    type: params.type,
    title: params.title,
    body: params.body,
    read: false,
    createdAt: new Date().toISOString(),
    relatedId: params.relatedId,
  };
  await kvPutJson(kv, KV_KEYS.leagueNotificationItem(notif.id), notif);
  await kvAddToIndex(kv, KV_KEYS.LEAGUE_NOTIFICATIONS_INDEX, notif.id);
  return notif;
}

export function hydrateGoalProgress(goal: StudyGoal, logs: StudyLog[]): StudyGoalWithProgress {
  const approvedLogs = logs.filter((l) => l.goalId === goal.id && l.status === 'approved');
  const loggedHours = round2(approvedLogs.reduce((s, l) => s + l.hours, 0));
  const loggedTests = approvedLogs.reduce((s, l) => s + l.testCount, 0);
  const loggedPages = approvedLogs.reduce((s, l) => s + l.pagesRead, 0);
  const loggedExercises = approvedLogs.reduce((s, l) => s + l.exercisesDone, 0);

  const hoursPercent =
    goal.targetHours > 0 ? round2(Math.min(100, (loggedHours / goal.targetHours) * 100)) : 100;
  const testsPercent =
    goal.targetTests > 0 ? round2(Math.min(100, (loggedTests / goal.targetTests) * 100)) : 100;
  const hasPagesTarget = (goal.targetPages ?? 0) > 0;
  const hasExercisesTarget = (goal.targetExercises ?? 0) > 0;
  const pagesPercent = hasPagesTarget
    ? round2(Math.min(100, (loggedPages / (goal.targetPages ?? 1)) * 100))
    : 0;
  const exercisesPercent = hasExercisesTarget
    ? round2(Math.min(100, (loggedExercises / (goal.targetExercises ?? 1)) * 100))
    : 0;

  const activeMetrics: number[] = [];
  if (goal.targetHours > 0) activeMetrics.push(hoursPercent);
  if (goal.targetTests > 0) activeMetrics.push(testsPercent);
  if (hasPagesTarget) activeMetrics.push(pagesPercent);
  if (hasExercisesTarget) activeMetrics.push(exercisesPercent);

  const overallPercent =
    activeMetrics.length > 0
      ? round2(activeMetrics.reduce((s, v) => s + v, 0) / activeMetrics.length)
      : 0;

  const today = toIsoDate();
  const daysLeft = diffDaysIso(today, goal.endDate);

  return {
    ...goal,
    loggedHours,
    loggedTests,
    loggedPages,
    loggedExercises,
    hoursPercent,
    testsPercent,
    pagesPercent,
    exercisesPercent,
    overallPercent,
    remainingHours: round2(Math.max(0, goal.targetHours - loggedHours)),
    remainingTests: Math.max(0, goal.targetTests - loggedTests),
    remainingPages: Math.max(0, (goal.targetPages ?? 0) - loggedPages),
    remainingExercises: Math.max(0, (goal.targetExercises ?? 0) - loggedExercises),
    logsCount: logs.filter((l) => l.goalId === goal.id).length,
    daysLeft,
  };
}

export function computeStreakForDates(dates: string[], referenceDate?: string): number {
  if (dates.length === 0) return 0;
  const uniqueSorted = Array.from(new Set(dates.map((d) => toIsoDate(d)))).sort((a, b) =>
    b.localeCompare(a)
  );
  const ref = toIsoDate(referenceDate);
  // Allow streak to start from today or yesterday if student hasn't logged today yet
  const latest = uniqueSorted[0];
  const gapFromRef = diffDaysIso(latest, ref);
  if (!referenceDate && gapFromRef > 1) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueSorted.length; i++) {
    const gap = diffDaysIso(uniqueSorted[i], uniqueSorted[i - 1]);
    if (gap === 1) {
      streak += 1;
    } else if (gap > 1) {
      break;
    }
  }
  return streak;
}

/**
 * Deterministically recomputes server-side computedPoints for all logs of a student in a season,
 * enforcing goal-alignment scaling, milestone bonus, daily streak bonus, and dailyPointCap.
 */
export async function recomputeStudentSeasonLogs(
  kv: SchoolKVStore,
  config: StudyLeagueConfig,
  studentId: string,
  seasonId: string
): Promise<{ updatedLogs: StudyLog[]; goalsWithProgress: StudyGoalWithProgress[]; streakDays: number }> {
  const [allGoals, allLogs] = await Promise.all([
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
  ]);

  const studentGoals = allGoals.filter((g) => g.studentId === studentId && g.seasonId === seasonId);
  const goalMap = new Map(studentGoals.map((g) => [g.id, g]));
  const studentLogs = allLogs
    .filter((l) => l.studentId === studentId && l.seasonId === seasonId)
    .sort((a, b) => `${a.date}_${a.createdAt}`.localeCompare(`${b.date}_${b.createdAt}`));

  const isSuspended = config.suspendedStudentIds.includes(studentId);
  const weights = config.weights;
  const rules = config.rules;

  // Running cumulative goal progress so points scale smoothly and milestone bonuses award once per goal
  const goalRunning: Record<string, { hours: number; tests: number; pages: number; exercises: number; bonusAwarded: boolean }> = {};
  const dailyPointsMap = new Map<string, number>();
  const approvedDates: string[] = [];
  const dailyStreakGiven = new Set<string>();

  const updatedLogs: StudyLog[] = [];

  for (const log of studentLogs) {
    if (log.status !== 'approved' || isSuspended) {
      const zeroed: StudyLog = {
        ...log,
        computedPoints: 0,
        rawScoreBreakdown: {
          hoursPts: 0,
          testsPts: 0,
          pagesPts: 0,
          exercisesPts: 0,
          completionBonusPts: 0,
          streakPts: 0,
          cappedDelta: 0,
        },
      };
      if (zeroed.computedPoints !== log.computedPoints || zeroed.rawScoreBreakdown.hoursPts !== log.rawScoreBreakdown.hoursPts) {
        await kvPutJson(kv, KV_KEYS.leagueLogItem(zeroed.id), zeroed);
      }
      updatedLogs.push(zeroed);
      continue;
    }

    const goal = goalMap.get(log.goalId);
    if (!goalRunning[log.goalId]) {
      goalRunning[log.goalId] = { hours: 0, tests: 0, pages: 0, exercises: 0, bonusAwarded: false };
    }
    const run = goalRunning[log.goalId];
    run.hours += log.hours;
    run.tests += log.testCount;
    run.pages += log.pagesRead;
    run.exercises += log.exercisesDone;

    let currentCompletionPct = 100;
    if (goal) {
      const parts: number[] = [];
      if (goal.targetHours > 0) parts.push(Math.min(100, (run.hours / goal.targetHours) * 100));
      if (goal.targetTests > 0) parts.push(Math.min(100, (run.tests / goal.targetTests) * 100));
      if ((goal.targetPages ?? 0) > 0) parts.push(Math.min(100, (run.pages / (goal.targetPages ?? 1)) * 100));
      if ((goal.targetExercises ?? 0) > 0) parts.push(Math.min(100, (run.exercises / (goal.targetExercises ?? 1)) * 100));
      currentCompletionPct = parts.length > 0 ? parts.reduce((s, v) => s + v, 0) / parts.length : 100;
    }

    // Scale activity score modestly by goal progress (0.80 to 1.15) so realistic target progress matters
    const goalAlignmentScale = 0.8 + (currentCompletionPct / 100) * 0.35;
    const hoursPts = round2(log.hours * weights.studyHoursWeight * goalAlignmentScale);
    const testsPts = round2(log.testCount * weights.testCountWeight * goalAlignmentScale);
    const pagesPts = round2(log.pagesRead * weights.pagesWeight);
    const exercisesPts = round2(log.exercisesDone * weights.exercisesWeight);

    let completionBonusPts = 0;
    if (goal && !run.bonusAwarded && currentCompletionPct >= rules.minGoalCompletionForBonus) {
      completionBonusPts = round2(weights.completionBonusWeight);
      run.bonusAwarded = true;
    }

    if (!approvedDates.includes(log.date)) {
      approvedDates.push(log.date);
    }
    const streakUpToDate = computeStreakForDates(approvedDates, log.date);
    let streakPts = 0;
    if (!dailyStreakGiven.has(log.date)) {
      streakPts = round2(Math.min(5, streakUpToDate) * weights.streakWeight);
      dailyStreakGiven.add(log.date);
    }

    const uncappedTotal = round2(hoursPts + testsPts + pagesPts + exercisesPts + completionBonusPts + streakPts);
    const usedToday = dailyPointsMap.get(log.date) ?? 0;
    const allowedRemaining = Math.max(0, rules.dailyPointCap - usedToday);
    const finalPoints = round2(Math.min(uncappedTotal, allowedRemaining));
    const cappedDelta = round2(Math.max(0, uncappedTotal - finalPoints));
    dailyPointsMap.set(log.date, round2(usedToday + finalPoints));

    const updatedLog: StudyLog = {
      ...log,
      computedPoints: finalPoints,
      rawScoreBreakdown: {
        hoursPts,
        testsPts,
        pagesPts,
        exercisesPts,
        completionBonusPts,
        streakPts,
        cappedDelta,
      },
    };
    if (
      updatedLog.computedPoints !== log.computedPoints ||
      JSON.stringify(updatedLog.rawScoreBreakdown) !== JSON.stringify(log.rawScoreBreakdown)
    ) {
      await kvPutJson(kv, KV_KEYS.leagueLogItem(updatedLog.id), updatedLog);
    }
    updatedLogs.push(updatedLog);
  }

  // Update goal status if >= 100% completed
  const goalsWithProgress: StudyGoalWithProgress[] = [];
  for (const goal of studentGoals) {
    const hydrated = hydrateGoalProgress(goal, updatedLogs);
    const nextStatus =
      goal.status === 'archived'
        ? 'archived'
        : hydrated.overallPercent >= 100
          ? 'completed'
          : 'active';
    if (nextStatus !== goal.status) {
      const patched: StudyGoal = { ...goal, status: nextStatus, updatedAt: new Date().toISOString() };
      await kvPutJson(kv, KV_KEYS.leagueGoalItem(goal.id), patched);
      hydrated.status = nextStatus;
    }
    goalsWithProgress.push(hydrated);
  }

  const today = toIsoDate();
  const streakDays = computeStreakForDates(approvedDates, today);
  return { updatedLogs, goalsWithProgress, streakDays };
}

export async function evaluateStudentBadges(
  kv: SchoolKVStore,
  config: StudyLeagueConfig,
  studentId: string
): Promise<StudentLeagueBadge[]> {
  const seasonId = config.activeSeason.id;
  const [allGoals, allLogs, allBadges] = await Promise.all([
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
    kvGetCollection<StudentLeagueBadge>(kv, KV_KEYS.LEAGUE_BADGES_INDEX, KV_KEYS.leagueBadgeItem),
  ]);

  const studentGoals = allGoals.filter((g) => g.studentId === studentId && g.seasonId === seasonId);
  const approvedLogs = allLogs.filter(
    (l) => l.studentId === studentId && l.seasonId === seasonId && l.status === 'approved'
  );
  const existingCodes = new Set(
    allBadges
      .filter((b) => b.studentId === studentId && b.seasonId === seasonId)
      .map((b) => b.code)
  );

  const totalHours = approvedLogs.reduce((s, l) => s + l.hours, 0);
  const totalTests = approvedLogs.reduce((s, l) => s + l.testCount, 0);
  const completedGoalCount = studentGoals.filter(
    (g) => hydrateGoalProgress(g, approvedLogs).overallPercent >= 100
  ).length;
  const streakDays = computeStreakForDates(
    approvedLogs.map((l) => l.date),
    toIsoDate()
  );

  const today = toIsoDate();
  const last7Start = addDaysIso(today, -6);
  const prev7Start = addDaysIso(today, -13);
  const prev7End = addDaysIso(today, -7);
  const curr7Pts = approvedLogs
    .filter((l) => l.date >= last7Start && l.date <= today)
    .reduce((s, l) => s + l.computedPoints, 0);
  const prev7Pts = approvedLogs
    .filter((l) => l.date >= prev7Start && l.date <= prev7End)
    .reduce((s, l) => s + l.computedPoints, 0);

  const earnedChecks: Array<{ code: StudyBadgeCode; met: boolean; reason: string }> = [
    {
      code: 'strong_start',
      met: studentGoals.length >= 1 && approvedLogs.length >= 1,
      reason: 'تعریف هدف مطالعاتی و ثبت نخستین عملکرد تأییدشده',
    },
    {
      code: 'hardworking_student',
      met: totalHours >= 15 || completedGoalCount >= 1,
      reason:
        completedGoalCount >= 1
          ? 'تکمیل ۱۰۰٪ حداقل یک هدف مطالعاتی'
          : `ثبت ${round2(totalHours)} ساعت مطالعه مؤثر در فصل جاری`,
    },
    {
      code: 'golden_streak',
      met: streakDays >= 5,
      reason: `دستیابی به ${streakDays} روز مطالعه متوالی`,
    },
    {
      code: 'test_king',
      met: totalTests >= 250,
      reason: `حل ${totalTests} تست تأییدشده در فصل جاری`,
    },
    {
      code: 'big_improvement',
      met: prev7Pts >= 20 ? curr7Pts >= prev7Pts * 1.3 : curr7Pts >= 120 && approvedLogs.length >= 4,
      reason: 'رشد چشمگیر امتیاز و ساعات مطالعه در هفته اخیر',
    },
  ];

  const newlyAwarded: StudentLeagueBadge[] = [];
  for (const check of earnedChecks) {
    if (!check.met || existingCodes.has(check.code)) continue;
    const def = BADGE_DEF_MAP.get(check.code);
    if (!def) continue;
    const badge: StudentLeagueBadge = {
      id: generateId('bdg'),
      code: def.code,
      studentId,
      seasonId,
      titleFa: def.titleFa,
      titleEn: def.titleEn,
      descriptionFa: def.descriptionFa,
      descriptionEn: def.descriptionEn,
      awardReason: check.reason,
      awardedAt: new Date().toISOString(),
    };
    await kvPutJson(kv, KV_KEYS.leagueBadgeItem(badge.id), badge);
    await kvAddToIndex(kv, KV_KEYS.LEAGUE_BADGES_INDEX, badge.id);
    existingCodes.add(def.code);
    newlyAwarded.push(badge);

    await createLeagueNotification(kv, {
      userId: studentId,
      seasonId,
      type: 'badge_earned',
      title: `دستاورد جدید: نشان «${def.titleFa}»`,
      body: `تبریک! به دلیل «${check.reason}»، نشان ${def.titleFa} به کارنامه افتخارات لیگ شما اضافه شد.`,
      relatedId: badge.id,
    });
  }

  return newlyAwarded;
}

export async function awardManualBadge(
  kv: SchoolKVStore,
  config: StudyLeagueConfig,
  studentId: string,
  code: StudyBadgeCode,
  awardReason: string,
  awardedByName: string
): Promise<StudentLeagueBadge> {
  const def = BADGE_DEF_MAP.get(code);
  if (!def) throw new Error('نشان انتخاب‌شده معتبر نیست.');
  const seasonId = config.activeSeason.id;
  const allBadges = await kvGetCollection<StudentLeagueBadge>(
    kv,
    KV_KEYS.LEAGUE_BADGES_INDEX,
    KV_KEYS.leagueBadgeItem
  );
  const existing = allBadges.find(
    (b) => b.studentId === studentId && b.seasonId === seasonId && b.code === code
  );
  if (existing) return existing;

  const badge: StudentLeagueBadge = {
    id: generateId('bdg'),
    code: def.code,
    studentId,
    seasonId,
    titleFa: def.titleFa,
    titleEn: def.titleEn,
    descriptionFa: def.descriptionFa,
    descriptionEn: def.descriptionEn,
    awardReason: awardReason.trim() || def.descriptionFa,
    awardedBy: awardedByName,
    awardedAt: new Date().toISOString(),
  };
  await kvPutJson(kv, KV_KEYS.leagueBadgeItem(badge.id), badge);
  await kvAddToIndex(kv, KV_KEYS.LEAGUE_BADGES_INDEX, badge.id);

  await createLeagueNotification(kv, {
    userId: studentId,
    seasonId,
    type: 'badge_earned',
    title: `دریافت نشان «${def.titleFa}»`,
    body: `${awardedByName} نشان ${def.titleFa} را به شما اعطا کرد (${badge.awardReason}).`,
    relatedId: badge.id,
  });

  return badge;
}

export function isStudentEligibleForSeason(
  student: StoredUser,
  config: StudyLeagueConfig
): boolean {
  if (!student.active || student.role !== 'student') return false;
  const allowedClasses = config.activeSeason.allowedClassIds;
  if (allowedClasses.length > 0 && (!student.classId || !allowedClasses.includes(student.classId))) {
    return false;
  }
  const allowedGrades = config.rules.eligibleGradeLevels;
  if (allowedGrades.length > 0 && (!student.gradeLevel || !allowedGrades.includes(student.gradeLevel))) {
    return false;
  }
  return true;
}

export async function computeLeaderboard(
  kv: SchoolKVStore,
  options?: {
    period?: 'all' | 'weekly' | 'monthly';
    classIdFilter?: string;
    gradeLevelFilter?: string;
    subjectIdFilter?: string;
    seasonId?: string;
  }
): Promise<{
  config: StudyLeagueConfig;
  entries: LeagueLeaderboardEntry[];
}> {
  const config = await ensureLeagueConfig(kv);
  const seasonId = options?.seasonId || config.activeSeason.id;

  const [allUsers, allClasses, allSubjects, allGoals, allLogs, allBadges] = await Promise.all([
    kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
    kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
    kvGetCollection<StudentLeagueBadge>(kv, KV_KEYS.LEAGUE_BADGES_INDEX, KV_KEYS.leagueBadgeItem),
  ]);

  const classMap = new Map(allClasses.map((c) => [c.id, c]));
  const subjectMap = new Map(allSubjects.map((s) => [s.id, s]));

  const today = toIsoDate();
  const weekStart = addDaysIso(today, -6);
  const prevWeekStart = addDaysIso(today, -13);
  const prevWeekEnd = addDaysIso(today, -7);
  const monthStart = addDaysIso(today, -29);
  const period = options?.period ?? 'all';

  const seasonGoals = allGoals.filter((g) => g.seasonId === seasonId);
  const seasonLogs = allLogs.filter((l) => l.seasonId === seasonId && l.status === 'approved');
  const seasonBadges = allBadges.filter((b) => b.seasonId === seasonId);

  const eligibleStudents = allUsers.filter((u) => {
    if (!isStudentEligibleForSeason(u, config)) return false;
    if (options?.classIdFilter && options.classIdFilter !== 'all' && u.classId !== options.classIdFilter) {
      return false;
    }
    if (
      options?.gradeLevelFilter &&
      options.gradeLevelFilter !== 'all' &&
      u.gradeLevel !== options.gradeLevelFilter
    ) {
      return false;
    }
    return true;
  });

  // Only include students who have either a goal, an approved log, or a badge in this season (actual participants)
  const rawEntries: Array<
    Omit<LeagueLeaderboardEntry, 'rank' | 'previousRank' | 'rankDelta'> & {
      prevPeriodScore: number;
      sortScore: number;
    }
  > = [];

  for (const stu of eligibleStudents) {
    const stuGoals = seasonGoals.filter((g) => g.studentId === stu.id);
    const stuLogs = seasonLogs.filter((l) => l.studentId === stu.id);
    const stuBadges = seasonBadges.filter((b) => b.studentId === stu.id);

    if (stuGoals.length === 0 && stuLogs.length === 0 && stuBadges.length === 0) {
      continue;
    }

    const filteredLogsForSubject =
      options?.subjectIdFilter && options.subjectIdFilter !== 'all'
        ? stuLogs.filter((l) => l.subjectIds.includes(options.subjectIdFilter!))
        : stuLogs;

    if (
      options?.subjectIdFilter &&
      options.subjectIdFilter !== 'all' &&
      filteredLogsForSubject.length === 0 &&
      !stuGoals.some((g) => g.subjectIds.includes(options.subjectIdFilter!))
    ) {
      continue;
    }

    const logsToUse = filteredLogsForSubject;
    const totalPoints = round2(logsToUse.reduce((s, l) => s + l.computedPoints, 0));
    const weeklyLogs = logsToUse.filter((l) => l.date >= weekStart && l.date <= today);
    const monthlyLogs = logsToUse.filter((l) => l.date >= monthStart && l.date <= today);
    const prevWeekLogs = logsToUse.filter((l) => l.date >= prevWeekStart && l.date <= prevWeekEnd);

    const weeklyPoints = round2(weeklyLogs.reduce((s, l) => s + l.computedPoints, 0));
    const monthlyPoints = round2(monthlyLogs.reduce((s, l) => s + l.computedPoints, 0));
    const prevWeekPoints = round2(prevWeekLogs.reduce((s, l) => s + l.computedPoints, 0));

    const weeklyHours = round2(weeklyLogs.reduce((s, l) => s + l.hours, 0));
    const monthlyHours = round2(monthlyLogs.reduce((s, l) => s + l.hours, 0));
    const totalHours = round2(logsToUse.reduce((s, l) => s + l.hours, 0));
    const totalTests = logsToUse.reduce((s, l) => s + l.testCount, 0);
    const totalPages = logsToUse.reduce((s, l) => s + l.pagesRead, 0);
    const totalExercises = logsToUse.reduce((s, l) => s + l.exercisesDone, 0);

    const relevantGoals =
      options?.subjectIdFilter && options.subjectIdFilter !== 'all'
        ? stuGoals.filter((g) => g.subjectIds.includes(options.subjectIdFilter!))
        : stuGoals;
    const completionValues = relevantGoals.map((g) => hydrateGoalProgress(g, stuLogs).overallPercent);
    const avgCompletionPercent =
      completionValues.length > 0
        ? round2(completionValues.reduce((s, v) => s + v, 0) / completionValues.length)
        : 0;

    const activeDates = Array.from(new Set(logsToUse.map((l) => l.date)));
    const streakDays = computeStreakForDates(activeDates, today);

    // 7-day trend points for competitor micro-sparkline
    const recentTrendPoints: number[] = [];
    for (let d = 6; d >= 0; d--) {
      const dayIso = addDaysIso(today, -d);
      const dayPts = logsToUse
        .filter((l) => l.date === dayIso)
        .reduce((s, l) => s + l.computedPoints, 0);
      recentTrendPoints.push(round2(dayPts));
    }

    // Subject breakdown (hours/tests/points)
    const subAgg = new Map<string, { subjectId: string; subjectName: string; hours: number; tests: number; points: number }>();
    for (const l of stuLogs) {
      const ids = l.subjectIds.length > 0 ? l.subjectIds : ['general'];
      const share = 1 / ids.length;
      for (const sid of ids) {
        const prev = subAgg.get(sid) ?? {
          subjectId: sid,
          subjectName: subjectMap.get(sid)?.name ?? l.subjectNames?.[0] ?? 'عمومی',
          hours: 0,
          tests: 0,
          points: 0,
        };
        prev.hours = round2(prev.hours + l.hours * share);
        prev.tests += Math.round(l.testCount * share);
        prev.points = round2(prev.points + l.computedPoints * share);
        subAgg.set(sid, prev);
      }
    }

    const sortScore =
      period === 'weekly' ? weeklyPoints : period === 'monthly' ? monthlyPoints : totalPoints;
    const prevPeriodScore = prevWeekPoints;

    const trendDirection: 'up' | 'down' | 'stable' =
      weeklyPoints > prevWeekPoints + 5
        ? 'up'
        : weeklyPoints + 5 < prevWeekPoints
          ? 'down'
          : 'stable';

    rawEntries.push({
      studentId: stu.id,
      studentName: stu.fullName,
      classId: stu.classId,
      className: classMap.get(stu.classId ?? '')?.name ?? 'تخصیص‌نیافته',
      gradeLevel: stu.gradeLevel,
      totalPoints,
      weeklyPoints,
      monthlyPoints,
      weeklyHours,
      monthlyHours,
      totalHours,
      totalTests,
      totalPages,
      totalExercises,
      avgCompletionPercent,
      streakDays,
      activeDays: activeDates.length,
      trendDirection,
      recentTrendPoints,
      badges: stuBadges,
      suspended: config.suspendedStudentIds.includes(stu.id),
      subjectBreakdown: Array.from(subAgg.values()).sort((a, b) => b.points - a.points),
      prevPeriodScore,
      sortScore,
    });
  }

  // Compute previous rank ordering (points earned strictly before the last 7 days or prevWeek baseline)
  const prevRanking = [...rawEntries]
    .sort((a, b) => b.prevPeriodScore - a.prevPeriodScore || b.totalHours - a.totalHours)
    .map((e, idx) => [e.studentId, e.prevPeriodScore > 0 ? idx + 1 : null] as const);
  const prevRankMap = new Map<string, number | null>(prevRanking);

  rawEntries.sort((a, b) => {
    if (a.suspended !== b.suspended) return a.suspended ? 1 : -1;
    if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
    if (b.avgCompletionPercent !== a.avgCompletionPercent) {
      return b.avgCompletionPercent - a.avgCompletionPercent;
    }
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
    return a.studentName.localeCompare(b.studentName, 'fa');
  });

  const entries: LeagueLeaderboardEntry[] = rawEntries.map((item, idx) => {
    const rank = idx + 1;
    const previousRank = prevRankMap.get(item.studentId) ?? null;
    const rankDelta = previousRank !== null ? previousRank - rank : 0;
    const { prevPeriodScore: _p, sortScore: _s, ...clean } = item;
    return {
      ...clean,
      rank,
      previousRank,
      rankDelta,
    };
  });

  return { config, entries };
}

export async function computeHallOfFame(kv: SchoolKVStore): Promise<LeagueHallOfFame> {
  const [allRes, weeklyRes, monthlyRes, subjects, badges] = await Promise.all([
    computeLeaderboard(kv, { period: 'all' }),
    computeLeaderboard(kv, { period: 'weekly' }),
    computeLeaderboard(kv, { period: 'monthly' }),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<StudentLeagueBadge>(kv, KV_KEYS.LEAGUE_BADGES_INDEX, KV_KEYS.leagueBadgeItem),
  ]);

  const seasonId = allRes.config.activeSeason.id;
  const activeEntries = allRes.entries.filter((e) => !e.suspended);
  const topThree = activeEntries.slice(0, 3);
  const studentOfWeek = weeklyRes.entries.find((e) => !e.suspended && e.weeklyPoints > 0) ?? activeEntries[0] ?? null;
  const studentOfMonth = monthlyRes.entries.find((e) => !e.suspended && e.monthlyPoints > 0) ?? activeEntries[0] ?? null;

  // Top students per subject
  const topBySubject: LeagueHallOfFame['topBySubject'] = [];
  for (const sub of subjects) {
    const withSubject = activeEntries
      .map((entry) => {
        const subRow = entry.subjectBreakdown.find((sb) => sb.subjectId === sub.id);
        return subRow
          ? {
              studentId: entry.studentId,
              studentName: entry.studentName,
              className: entry.className,
              hours: subRow.hours,
              tests: subRow.tests,
              points: subRow.points,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.points > 0)
      .sort((a, b) => b.points - a.points || b.hours - a.hours)
      .slice(0, 3)
      .map((x, idx) => ({ rank: idx + 1, ...x }));

    if (withSubject.length > 0) {
      topBySubject.push({
        subjectId: sub.id,
        subjectName: sub.name,
        topStudents: withSubject,
      });
    }
  }

  // Most improved vs previous week
  const allLogs = await kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem);
  const seasonApproved = allLogs.filter((l) => l.seasonId === seasonId && l.status === 'approved');
  const today = toIsoDate();
  const weekStart = addDaysIso(today, -6);
  const prevStart = addDaysIso(today, -13);
  const prevEnd = addDaysIso(today, -7);

  const mostImproved = activeEntries
    .map((entry) => {
      const stuLogs = seasonApproved.filter((l) => l.studentId === entry.studentId);
      const curr = round2(
        stuLogs.filter((l) => l.date >= weekStart && l.date <= today).reduce((s, l) => s + l.computedPoints, 0)
      );
      const prev = round2(
        stuLogs.filter((l) => l.date >= prevStart && l.date <= prevEnd).reduce((s, l) => s + l.computedPoints, 0)
      );
      const improvementPercent =
        prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
      return {
        studentId: entry.studentId,
        studentName: entry.studentName,
        className: entry.className,
        currentPoints: curr,
        previousPoints: prev,
        improvementPercent,
        rankDelta: entry.rankDelta,
      };
    })
    .filter((item) => item.currentPoints > item.previousPoints || item.rankDelta > 0)
    .sort((a, b) => b.improvementPercent - a.improvementPercent || b.currentPoints - a.currentPoints)
    .slice(0, 5);

  // Badge showcase
  const entryMap = new Map(allRes.entries.map((e) => [e.studentId, e]));
  const badgeShowcase = STUDY_BADGE_DEFINITIONS.map((def) => {
    const holders = badges
      .filter((b) => b.seasonId === seasonId && b.code === def.code)
      .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))
      .map((b) => ({
        studentId: b.studentId,
        studentName: entryMap.get(b.studentId)?.studentName ?? 'دانش‌آموز',
        className: entryMap.get(b.studentId)?.className ?? '—',
        awardedAt: b.awardedAt,
      }));
    return { badge: def, holders };
  });

  return {
    topThree,
    topBySubject,
    studentOfWeek,
    studentOfMonth,
    mostImproved,
    badgeShowcase,
  };
}

export async function computeStudentAnalytics(
  kv: SchoolKVStore,
  studentId: string
): Promise<StudentLeagueAnalytics> {
  const config = await ensureLeagueConfig(kv);
  const seasonId = config.activeSeason.id;

  const [allGoals, allLogs, allSubjects] = await Promise.all([
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
  ]);

  const subjectMap = new Map(allSubjects.map((s) => [s.id, s]));
  const goals = allGoals.filter((g) => g.studentId === studentId && g.seasonId === seasonId);
  const logs = allLogs.filter(
    (l) => l.studentId === studentId && l.seasonId === seasonId && l.status === 'approved'
  );

  const today = toIsoDate();
  const dailySeries: StudentLeagueAnalytics['dailySeries'] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDaysIso(today, -i);
    const dayLogs = logs.filter((l) => l.date === d);
    dailySeries.push({
      date: d,
      label: d.slice(5),
      hours: round2(dayLogs.reduce((s, l) => s + l.hours, 0)),
      tests: dayLogs.reduce((s, l) => s + l.testCount, 0),
      points: round2(dayLogs.reduce((s, l) => s + l.computedPoints, 0)),
    });
  }

  const weeklySeries: StudentLeagueAnalytics['weeklySeries'] = [];
  for (let w = 3; w >= 0; w--) {
    const start = addDaysIso(today, -(w * 7 + 6));
    const end = addDaysIso(today, -w * 7);
    const wLogs = logs.filter((l) => l.date >= start && l.date <= end);
    const hours = round2(wLogs.reduce((s, l) => s + l.hours, 0));
    const tests = wLogs.reduce((s, l) => s + l.testCount, 0);
    const points = round2(wLogs.reduce((s, l) => s + l.computedPoints, 0));
    const totalTargetH = goals.reduce((s, g) => s + g.targetHours, 0);
    const completionPercent =
      totalTargetH > 0 ? round2(Math.min(100, (hours / totalTargetH) * 100)) : hours > 0 ? 100 : 0;
    weeklySeries.push({
      label: w === 0 ? 'هفته جاری' : w === 1 ? 'هفته قبل' : `${w} هفته پیش`,
      hours,
      tests,
      points,
      completionPercent,
    });
  }

  // Subject breakdown against targets
  const subStats = new Map<
    string,
    { subjectId: string; subjectName: string; loggedHours: number; targetHours: number; loggedTests: number; targetTests: number }
  >();
  for (const g of goals) {
    const ids = g.subjectIds.length > 0 ? g.subjectIds : ['general'];
    const share = 1 / ids.length;
    for (const sid of ids) {
      const entry = subStats.get(sid) ?? {
        subjectId: sid,
        subjectName: subjectMap.get(sid)?.name ?? 'درس تخصصی',
        loggedHours: 0,
        targetHours: 0,
        loggedTests: 0,
        targetTests: 0,
      };
      entry.targetHours = round2(entry.targetHours + g.targetHours * share);
      entry.targetTests += Math.round(g.targetTests * share);
      subStats.set(sid, entry);
    }
  }
  for (const l of logs) {
    const ids = l.subjectIds.length > 0 ? l.subjectIds : ['general'];
    const share = 1 / ids.length;
    for (const sid of ids) {
      const entry = subStats.get(sid) ?? {
        subjectId: sid,
        subjectName: subjectMap.get(sid)?.name ?? l.subjectNames?.[0] ?? 'درس تخصصی',
        loggedHours: 0,
        targetHours: 0,
        loggedTests: 0,
        targetTests: 0,
      };
      entry.loggedHours = round2(entry.loggedHours + l.hours * share);
      entry.loggedTests += Math.round(l.testCount * share);
      subStats.set(sid, entry);
    }
  }

  const subjectPerformance: StudentLeagueAnalytics['subjectPerformance'] = Array.from(subStats.values()).map((s) => {
    const pctH = s.targetHours > 0 ? Math.min(100, (s.loggedHours / s.targetHours) * 100) : s.loggedHours > 0 ? 100 : 0;
    const pctT = s.targetTests > 0 ? Math.min(100, (s.loggedTests / s.targetTests) * 100) : s.loggedTests > 0 ? 100 : 0;
    const completionPercent = round2((pctH + pctT) / 2);
    const status: 'strength' | 'developing' | 'needs_focus' =
      completionPercent >= 75 ? 'strength' : completionPercent >= 45 ? 'developing' : 'needs_focus';
    return { ...s, completionPercent, status };
  });

  const currStart = addDaysIso(today, -6);
  const prevStart = addDaysIso(today, -13);
  const prevEnd = addDaysIso(today, -7);
  const currWeekLogs = logs.filter((l) => l.date >= currStart && l.date <= today);
  const prevWeekLogs = logs.filter((l) => l.date >= prevStart && l.date <= prevEnd);

  const currH = round2(currWeekLogs.reduce((s, l) => s + l.hours, 0));
  const prevH = round2(prevWeekLogs.reduce((s, l) => s + l.hours, 0));
  const currT = currWeekLogs.reduce((s, l) => s + l.testCount, 0);
  const prevT = prevWeekLogs.reduce((s, l) => s + l.testCount, 0);
  const currP = round2(currWeekLogs.reduce((s, l) => s + l.computedPoints, 0));
  const prevP = round2(prevWeekLogs.reduce((s, l) => s + l.computedPoints, 0));

  const pctDelta = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0);

  const strengths = subjectPerformance
    .filter((s) => s.status === 'strength')
    .map((s) => `${s.subjectName} (${s.completionPercent}٪ تحقق هدف)`);
  const areasToImprove = subjectPerformance
    .filter((s) => s.status === 'needs_focus')
    .map((s) => `${s.subjectName} (نیازمند افزایش مطالعه و تست)`);

  return {
    dailySeries,
    weeklySeries,
    subjectPerformance,
    periodComparison: {
      currentWeekHours: currH,
      previousWeekHours: prevH,
      hoursDeltaPercent: pctDelta(currH, prevH),
      currentWeekTests: currT,
      previousWeekTests: prevT,
      testsDeltaPercent: pctDelta(currT, prevT),
      currentWeekPoints: currP,
      previousWeekPoints: prevP,
      pointsDeltaPercent: pctDelta(currP, prevP),
    },
    strengths,
    areasToImprove,
  };
}

function buildDailySeries(
  approvedLogs: StudyLog[],
  today: string,
  days = 30
): TeacherLeagueAnalytics['dailyActivity30d'] {
  const res: TeacherLeagueAnalytics['dailyActivity30d'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDaysIso(today, -i);
    const dayLogs = approvedLogs.filter((l) => l.date === d);
    res.push({
      date: d,
      label: d.slice(5),
      hours: round2(dayLogs.reduce((s, l) => s + l.hours, 0)),
      tests: dayLogs.reduce((s, l) => s + l.testCount, 0),
      pages: dayLogs.reduce((s, l) => s + l.pagesRead, 0),
      points: round2(dayLogs.reduce((s, l) => s + l.computedPoints, 0)),
      logsCount: dayLogs.length,
      activeStudents: new Set(dayLogs.map((l) => l.studentId)).size,
    });
  }
  return res;
}

function buildWeeklyTrend(approvedLogs: StudyLog[], today: string, weeks = 6): LeagueWeeklyTrendPoint[] {
  const res: LeagueWeeklyTrendPoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const endOffset = -(w * 7);
    const startOffset = endOffset - 6;
    const startDate = addDaysIso(today, startOffset);
    const endDate = addDaysIso(today, endOffset);
    const wLogs = approvedLogs.filter((l) => l.date >= startDate && l.date <= endDate);
    res.push({
      label: w === 0 ? 'هفته جاری' : `${w} هفته قبل`,
      startDate,
      endDate,
      hours: round2(wLogs.reduce((s, l) => s + l.hours, 0)),
      tests: wLogs.reduce((s, l) => s + l.testCount, 0),
      pages: wLogs.reduce((s, l) => s + l.pagesRead, 0),
      exercises: wLogs.reduce((s, l) => s + l.exercisesDone, 0),
      points: round2(wLogs.reduce((s, l) => s + l.computedPoints, 0)),
      logsCount: wLogs.length,
      activeStudents: new Set(wLogs.map((l) => l.studentId)).size,
    });
  }
  return res;
}

function buildSubjectBreakdown(
  subjects: Subject[],
  goals: StudyGoal[],
  approvedLogs: StudyLog[]
): LeagueSubjectBreakdownItem[] {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const ids = new Set<string>(subjects.map((s) => s.id));
  for (const g of goals) {
    for (const sid of g.subjectIds ?? []) ids.add(sid);
  }
  const items: LeagueSubjectBreakdownItem[] = [];
  for (const sid of ids) {
    const subGoals = goals.filter((g) => (g.subjectIds ?? []).includes(sid));
    if (subGoals.length === 0) continue;
    const subGoalIds = new Set(subGoals.map((g) => g.id));
    const subLogs = approvedLogs.filter((l) => subGoalIds.has(l.goalId));
    const hydrated = subGoals.map((g) => hydrateGoalProgress(g, subLogs));
    const targetHours = round2(subGoals.reduce((s, g) => s + g.targetHours, 0));
    const loggedHours = round2(subLogs.reduce((s, l) => s + l.hours, 0));
    const targetTests = subGoals.reduce((s, g) => s + g.targetTests, 0);
    const loggedTests = subLogs.reduce((s, l) => s + l.testCount, 0);
    const loggedPages = subLogs.reduce((s, l) => s + l.pagesRead, 0);
    const loggedExercises = subLogs.reduce((s, l) => s + l.exercisesDone, 0);
    const totalPoints = round2(subLogs.reduce((s, l) => s + l.computedPoints, 0));
    const avgCompletionPercent =
      hydrated.length > 0
        ? round2(hydrated.reduce((s, h) => s + h.overallPercent, 0) / hydrated.length)
        : 0;

    items.push({
      subjectId: sid,
      subjectName: subjectMap.get(sid)?.name ?? subGoals[0]?.subjectNames?.[0] ?? sid,
      goalsCount: subGoals.length,
      participantsCount: new Set(subGoals.map((g) => g.studentId)).size,
      targetHours,
      loggedHours,
      targetTests,
      loggedTests,
      loggedPages,
      loggedExercises,
      avgCompletionPercent,
      totalPoints,
    });
  }
  return items.sort((a, b) => b.loggedHours - a.loggedHours || b.goalsCount - a.goalsCount);
}

function buildLogStatusBreakdown(seasonLogs: StudyLog[]): LeagueLogStatusBreakdown {
  const approvedLogs = seasonLogs.filter((l) => l.status === 'approved');
  const pendingCount = seasonLogs.filter((l) => l.status === 'pending_review').length;
  const rejectedCount = seasonLogs.filter((l) => l.status === 'rejected').length;
  const flaggedCount = seasonLogs.filter((l) => Boolean(l.flaggedReason)).length;
  const totalLogs = seasonLogs.length;
  const approvalRate = totalLogs > 0 ? Math.round((approvedLogs.length / totalLogs) * 100) : 0;
  const totalPagesRead = approvedLogs.reduce((s, l) => s + l.pagesRead, 0);
  const totalExercisesDone = approvedLogs.reduce((s, l) => s + l.exercisesDone, 0);
  const avgHoursPerLog =
    approvedLogs.length > 0
      ? round2(approvedLogs.reduce((s, l) => s + l.hours, 0) / approvedLogs.length)
      : 0;
  const avgTestsPerLog =
    approvedLogs.length > 0
      ? Math.round(approvedLogs.reduce((s, l) => s + l.testCount, 0) / approvedLogs.length)
      : 0;
  return {
    totalLogs,
    approvedCount: approvedLogs.length,
    pendingCount,
    rejectedCount,
    flaggedCount,
    approvalRate,
    totalPagesRead,
    totalExercisesDone,
    avgHoursPerLog,
    avgTestsPerLog,
  };
}

function buildCompletionDistribution(
  students: StoredUser[],
  progressByStuId: Map<string, { goalsCount: number; completionPercent: number }>
): LeagueCompletionDistribution {
  const dist: LeagueCompletionDistribution = {
    excellent: 0,
    onTrack: 0,
    moderate: 0,
    needsSupport: 0,
    noGoal: 0,
  };
  for (const stu of students) {
    const info = progressByStuId.get(stu.id);
    if (!info || info.goalsCount === 0) {
      dist.noGoal += 1;
    } else if (info.completionPercent >= 90) {
      dist.excellent += 1;
    } else if (info.completionPercent >= 70) {
      dist.onTrack += 1;
    } else if (info.completionPercent >= 40) {
      dist.moderate += 1;
    } else {
      dist.needsSupport += 1;
    }
  }
  return dist;
}

export async function computeTeacherLeagueAnalytics(
  kv: SchoolKVStore,
  teacherAllowedClassIds: Set<string>,
  classIdFilter?: string
): Promise<TeacherLeagueAnalytics> {
  const config = await ensureLeagueConfig(kv);
  const seasonId = config.activeSeason.id;

  const [allUsers, allClasses, allSubjects, allGoals, allLogs, allBadges, lbRes] = await Promise.all([
    kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
    kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
    kvGetCollection<StudentLeagueBadge>(kv, KV_KEYS.LEAGUE_BADGES_INDEX, KV_KEYS.leagueBadgeItem),
    computeLeaderboard(kv, { period: 'all' }),
  ]);

  const scopedClasses = allClasses.filter(
    (c) =>
      teacherAllowedClassIds.has(c.id) &&
      (!classIdFilter || classIdFilter === 'all' || c.id === classIdFilter)
  );
  const scopedClassIds = new Set(scopedClasses.map((c) => c.id));
  const classMap = new Map(allClasses.map((c) => [c.id, c]));
  const lbMap = new Map(lbRes.entries.map((e) => [e.studentId, e]));
  const suspendedSet = new Set(config.suspendedStudentIds);

  const scopedStudents = allUsers.filter(
    (u) => u.role === 'student' && u.active && u.classId && scopedClassIds.has(u.classId)
  );
  const studentIds = new Set(scopedStudents.map((s) => s.id));

  const seasonGoals = allGoals.filter((g) => g.seasonId === seasonId && studentIds.has(g.studentId));
  const seasonLogs = allLogs.filter((l) => l.seasonId === seasonId && studentIds.has(l.studentId));
  const approvedLogs = seasonLogs.filter((l) => l.status === 'approved');

  const today = toIsoDate();
  const weekStart = addDaysIso(today, -6);
  const prevStart = addDaysIso(today, -13);
  const prevEnd = addDaysIso(today, -7);

  const studentProgressSeries: TeacherLeagueAnalytics['studentProgressSeries'] = [];
  const lowActivityStudents: TeacherLeagueAnalytics['lowActivityStudents'] = [];
  const highImprovementStudents: TeacherLeagueAnalytics['highImprovementStudents'] = [];
  const progressMap = new Map<string, { goalsCount: number; completionPercent: number }>();

  for (const stu of scopedStudents) {
    const stuGoals = seasonGoals.filter((g) => g.studentId === stu.id);
    const stuAllLogs = seasonLogs.filter((l) => l.studentId === stu.id);
    const stuLogs = approvedLogs.filter((l) => l.studentId === stu.id);
    const cls = classMap.get(stu.classId ?? '');
    const className = cls?.name ?? '—';
    const gradeLevel = stu.gradeLevel ?? cls?.gradeLevel ?? '—';

    const points = round2(stuLogs.reduce((s, l) => s + l.computedPoints, 0));
    const hours = round2(stuLogs.reduce((s, l) => s + l.hours, 0));
    const tests = stuLogs.reduce((s, l) => s + l.testCount, 0);
    const pages = stuLogs.reduce((s, l) => s + l.pagesRead, 0);
    const exercises = stuLogs.reduce((s, l) => s + l.exercisesDone, 0);
    const completionValues = stuGoals.map((g) => hydrateGoalProgress(g, stuLogs).overallPercent);
    const completionPercent =
      completionValues.length > 0
        ? round2(completionValues.reduce((s, v) => s + v, 0) / completionValues.length)
        : 0;
    const streakDays = computeStreakForDates(
      stuLogs.map((l) => l.date),
      today
    );

    const weekLogs = stuLogs.filter((l) => l.date >= weekStart && l.date <= today);
    const prevLogs = stuLogs.filter((l) => l.date >= prevStart && l.date <= prevEnd);
    const hours7d = round2(weekLogs.reduce((s, l) => s + l.hours, 0));
    const tests7d = weekLogs.reduce((s, l) => s + l.testCount, 0);
    const currW = round2(weekLogs.reduce((s, l) => s + l.computedPoints, 0));
    const prevW = round2(prevLogs.reduce((s, l) => s + l.computedPoints, 0));
    const sortedDates = stuLogs.map((l) => l.date).sort((a, b) => b.localeCompare(a));
    const lbEntry = lbMap.get(stu.id);
    const stuBadgesCount = allBadges.filter((b) => b.studentId === stu.id && b.seasonId === seasonId).length;

    progressMap.set(stu.id, { goalsCount: stuGoals.length, completionPercent });

    studentProgressSeries.push({
      studentId: stu.id,
      studentName: stu.fullName,
      classId: stu.classId ?? '',
      className,
      gradeLevel,
      rank: lbEntry?.rank ?? 0,
      rankDelta: lbEntry?.rankDelta ?? 0,
      goalsCount: stuGoals.length,
      points,
      weeklyPoints: currW,
      hours,
      weeklyHours: hours7d,
      tests,
      weeklyTests: tests7d,
      pages,
      exercises,
      completionPercent,
      streakDays,
      logsCount: stuAllLogs.length,
      approvedLogsCount: stuLogs.length,
      pendingLogsCount: stuAllLogs.filter((l) => l.status === 'pending_review').length,
      flaggedLogsCount: stuAllLogs.filter((l) => Boolean(l.flaggedReason)).length,
      badgesCount: stuBadgesCount,
      lastLogDate: sortedDates[0],
      suspended: suspendedSet.has(stu.id),
    });

    if (hours7d < 2 || stuLogs.length === 0) {
      lowActivityStudents.push({
        studentId: stu.id,
        studentName: stu.fullName,
        className,
        loggedHours7d: hours7d,
        loggedTests7d: tests7d,
        completionPercent,
        lastLogDate: sortedDates[0],
      });
    }

    if (currW > prevW && currW >= 15) {
      const improvementPercent = prevW > 0 ? Math.round(((currW - prevW) / prevW) * 100) : 100;
      highImprovementStudents.push({
        studentId: stu.id,
        studentName: stu.fullName,
        className,
        currentWeekPoints: currW,
        previousWeekPoints: prevW,
        improvementPercent,
      });
    }
  }

  studentProgressSeries.sort((a, b) => b.points - a.points || b.completionPercent - a.completionPercent);
  lowActivityStudents.sort((a, b) => a.loggedHours7d - b.loggedHours7d);
  highImprovementStudents.sort((a, b) => b.improvementPercent - a.improvementPercent);

  const activeParticipantsList = studentProgressSeries.filter((p) => p.goalsCount > 0 || p.logsCount > 0);

  const classComparison: TeacherLeagueAnalytics['classComparison'] = scopedClasses.map((cls) => {
    const clsStudents = scopedStudents.filter((s) => s.classId === cls.id);
    const clsStuIds = new Set(clsStudents.map((s) => s.id));
    const clsProgress = activeParticipantsList.filter((p) => clsStuIds.has(p.studentId));
    const clsGoals = seasonGoals.filter((g) => clsStuIds.has(g.studentId));
    const clsLogs = seasonLogs.filter((l) => clsStuIds.has(l.studentId));
    const totalHours = round2(clsProgress.reduce((s, p) => s + p.hours, 0));
    const totalTests = clsProgress.reduce((s, p) => s + p.tests, 0);
    const totalPages = clsProgress.reduce((s, p) => s + p.pages, 0);
    const totalExercises = clsProgress.reduce((s, p) => s + p.exercises, 0);
    const avgPoints =
      clsProgress.length > 0 ? round2(clsProgress.reduce((s, p) => s + p.points, 0) / clsProgress.length) : 0;
    const avgComp =
      clsProgress.length > 0
        ? round2(clsProgress.reduce((s, p) => s + p.completionPercent, 0) / clsProgress.length)
        : 0;
    const participationRate =
      clsStudents.length > 0 ? Math.round((clsProgress.length / clsStudents.length) * 100) : 0;

    return {
      classId: cls.id,
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      totalStudentsInClass: clsStudents.length,
      participantsCount: clsProgress.length,
      participationRate,
      activeGoalsCount: clsGoals.filter((g) => g.status === 'active').length,
      avgPoints,
      totalHours,
      totalTests,
      totalPages,
      totalExercises,
      avgCompletionPercent: avgComp,
      pendingLogsCount: clsLogs.filter((l) => l.status === 'pending_review').length,
      flaggedLogsCount: clsLogs.filter((l) => Boolean(l.flaggedReason)).length,
    };
  });

  const avgCompletionPercent =
    activeParticipantsList.length > 0
      ? round2(
          activeParticipantsList.reduce((s, p) => s + p.completionPercent, 0) /
            activeParticipantsList.length
        )
      : 0;

  const weeklyApproved = approvedLogs.filter((l) => l.date >= weekStart && l.date <= today);

  return {
    totalStudents: scopedStudents.length,
    activeParticipants: activeParticipantsList.length,
    participationRate:
      scopedStudents.length > 0
        ? Math.round((activeParticipantsList.length / scopedStudents.length) * 100)
        : 0,
    activeGoalsCount: seasonGoals.filter((g) => g.status === 'active').length,
    pendingReviewsCount: seasonLogs.filter((l) => l.status === 'pending_review').length,
    avgCompletionPercent,
    totalStudyHours: round2(approvedLogs.reduce((s, l) => s + l.hours, 0)),
    totalTests: approvedLogs.reduce((s, l) => s + l.testCount, 0),
    totalPages: approvedLogs.reduce((s, l) => s + l.pagesRead, 0),
    totalExercises: approvedLogs.reduce((s, l) => s + l.exercisesDone, 0),
    weeklyHours: round2(weeklyApproved.reduce((s, l) => s + l.hours, 0)),
    weeklyTests: weeklyApproved.reduce((s, l) => s + l.testCount, 0),
    classComparison,
    lowActivityStudents: lowActivityStudents.slice(0, 15),
    highImprovementStudents: highImprovementStudents.slice(0, 15),
    studentProgressSeries,
    dailyActivity30d: buildDailySeries(approvedLogs, today, 30),
    weeklyTrend: buildWeeklyTrend(approvedLogs, today, 6),
    subjectBreakdown: buildSubjectBreakdown(allSubjects, seasonGoals, approvedLogs),
    completionDistribution: buildCompletionDistribution(scopedStudents, progressMap),
    logStatusBreakdown: buildLogStatusBreakdown(seasonLogs),
  };
}

export async function computeAdminLeagueAnalytics(kv: SchoolKVStore): Promise<AdminLeagueAnalytics> {
  const [lbRes, allUsers, allClasses, allSubjects, allGoals, allLogs] = await Promise.all([
    computeLeaderboard(kv, { period: 'all' }),
    kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
    kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
    kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
  ]);

  const { config, entries } = lbRes;
  const seasonId = config.activeSeason.id;
  const activeStudents = allUsers.filter((u) => u.role === 'student' && u.active);
  const seasonGoals = allGoals.filter((g) => g.seasonId === seasonId);
  const seasonLogs = allLogs.filter((l) => l.seasonId === seasonId);
  const approvedLogs = seasonLogs.filter((l) => l.status === 'approved');
  const today = toIsoDate();

  const dailySchoolActivity = buildDailySeries(approvedLogs, today, 30);
  const weeklyTrend = buildWeeklyTrend(approvedLogs, today, 6);
  const entryMap = new Map(entries.map((e) => [e.studentId, e]));
  const progressMap = new Map<string, { goalsCount: number; completionPercent: number }>();

  for (const stu of activeStudents) {
    const stuGoals = seasonGoals.filter((g) => g.studentId === stu.id);
    const e = entryMap.get(stu.id);
    progressMap.set(stu.id, {
      goalsCount: stuGoals.length,
      completionPercent: e?.avgCompletionPercent ?? 0,
    });
  }

  const classComparison: AdminLeagueAnalytics['classComparison'] = allClasses.map((cls) => {
    const clsStudents = activeStudents.filter((s) => s.classId === cls.id);
    const clsStuIds = new Set(clsStudents.map((s) => s.id));
    const clsEntries = entries.filter((e) => e.classId === cls.id || clsStuIds.has(e.studentId));
    const clsGoals = seasonGoals.filter((g) => g.classId === cls.id || clsStuIds.has(g.studentId));
    const clsLogs = seasonLogs.filter((l) => l.classId === cls.id || clsStuIds.has(l.studentId));
    const totalHours = round2(clsEntries.reduce((s, e) => s + e.totalHours, 0));
    const totalTests = clsEntries.reduce((s, e) => s + e.totalTests, 0);
    const totalPages = clsEntries.reduce((s, e) => s + e.totalPages, 0);
    const totalExercises = clsLogs
      .filter((l) => l.status === 'approved')
      .reduce((s, l) => s + l.exercisesDone, 0);
    const avgPoints =
      clsEntries.length > 0 ? round2(clsEntries.reduce((s, e) => s + e.totalPoints, 0) / clsEntries.length) : 0;
    const avgCompletionPercent =
      clsEntries.length > 0
        ? round2(clsEntries.reduce((s, e) => s + e.avgCompletionPercent, 0) / clsEntries.length)
        : 0;
    const participationRate =
      clsStudents.length > 0 ? Math.round((clsEntries.length / clsStudents.length) * 100) : 0;

    return {
      classId: cls.id,
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      totalStudentsInClass: clsStudents.length,
      participantsCount: clsEntries.length,
      participationRate,
      activeGoalsCount: clsGoals.filter((g) => g.status === 'active').length,
      avgPoints,
      totalHours,
      totalTests,
      totalPages,
      totalExercises,
      avgCompletionPercent,
      pendingLogsCount: clsLogs.filter((l) => l.status === 'pending_review').length,
      flaggedLogsCount: clsLogs.filter((l) => Boolean(l.flaggedReason)).length,
    };
  });

  const gradeLevels = Array.from(new Set(allClasses.map((c) => c.gradeLevel).filter(Boolean)));
  const gradeLevelBreakdown: LeagueGradeLevelBreakdownItem[] = gradeLevels.map((gl) => {
    const glClasses = classComparison.filter((c) => c.gradeLevel === gl);
    const totalStudents = glClasses.reduce((s, c) => s + c.totalStudentsInClass, 0);
    const participantsCount = glClasses.reduce((s, c) => s + c.participantsCount, 0);
    const totalHours = round2(glClasses.reduce((s, c) => s + c.totalHours, 0));
    const totalTests = glClasses.reduce((s, c) => s + c.totalTests, 0);
    const totalPages = glClasses.reduce((s, c) => s + c.totalPages, 0);
    const glEntries = entries.filter((e) => e.gradeLevel === gl);
    const avgPoints =
      glEntries.length > 0 ? round2(glEntries.reduce((s, e) => s + e.totalPoints, 0) / glEntries.length) : 0;
    const avgCompletionPercent =
      glEntries.length > 0
        ? round2(glEntries.reduce((s, e) => s + e.avgCompletionPercent, 0) / glEntries.length)
        : 0;
    return {
      gradeLevel: gl,
      classesCount: glClasses.length,
      totalStudents,
      participantsCount,
      participationRate: totalStudents > 0 ? Math.round((participantsCount / totalStudents) * 100) : 0,
      totalHours,
      totalTests,
      totalPages,
      avgPoints,
      avgCompletionPercent,
    };
  });

  const avgCompletionPercent =
    entries.length > 0
      ? round2(entries.reduce((s, e) => s + e.avgCompletionPercent, 0) / entries.length)
      : 0;

  return {
    totalStudents: activeStudents.length,
    totalParticipants: entries.length,
    participationRate:
      activeStudents.length > 0 ? Math.round((entries.length / activeStudents.length) * 100) : 0,
    activeGoalsCount: seasonGoals.filter((g) => g.status === 'active').length,
    totalLogsCount: seasonLogs.length,
    approvedLogsCount: approvedLogs.length,
    pendingLogsCount: seasonLogs.filter((l) => l.status === 'pending_review').length,
    rejectedLogsCount: seasonLogs.filter((l) => l.status === 'rejected').length,
    suspiciousLogsCount: seasonLogs.filter((l) => Boolean(l.flaggedReason)).length,
    suspendedCount: config.suspendedStudentIds.length,
    avgCompletionPercent,
    totalStudyHours: round2(approvedLogs.reduce((s, l) => s + l.hours, 0)),
    totalTests: approvedLogs.reduce((s, l) => s + l.testCount, 0),
    totalPages: approvedLogs.reduce((s, l) => s + l.pagesRead, 0),
    totalExercises: approvedLogs.reduce((s, l) => s + l.exercisesDone, 0),
    dailySchoolActivity,
    weeklyTrend,
    classComparison,
    subjectBreakdown: buildSubjectBreakdown(allSubjects, seasonGoals, approvedLogs),
    gradeLevelBreakdown,
    completionDistribution: buildCompletionDistribution(activeStudents, progressMap),
    logStatusBreakdown: buildLogStatusBreakdown(seasonLogs),
  };
}

export async function archiveAndOptionallyResetSeason(
  kv: SchoolKVStore,
  actor: Pick<StoredUser, 'id' | 'fullName' | 'role'>,
  params: {
    action: 'start_new' | 'pause' | 'resume' | 'extend' | 'end';
    title?: string;
    periodType?: StudyLeagueSeasonPeriod;
    startDate?: string;
    endDate?: string;
    extendDays?: number;
    allowedClassIds?: string[];
    allowedSubjectIds?: string[];
    description?: string;
  }
): Promise<{ config: StudyLeagueConfig; archive?: StudyLeagueArchive; message: string }> {
  const config = await ensureLeagueConfig(kv);
  const nowIso = new Date().toISOString();

  if (params.action === 'pause') {
    config.activeSeason.status = 'paused';
    config.activeSeason.updatedAt = nowIso;
    config.updatedAt = nowIso;
    config.updatedBy = actor.fullName;
    await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);
    return { config, message: 'لیگ مطالعاتی موقتاً متوقف شد.' };
  }

  if (params.action === 'resume') {
    config.activeSeason.status = 'active';
    config.activeSeason.updatedAt = nowIso;
    config.updatedAt = nowIso;
    config.updatedBy = actor.fullName;
    await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);
    return { config, message: 'لیگ مطالعاتی مجدداً فعال شد.' };
  }

  if (params.action === 'extend') {
    const days = Math.max(1, Math.min(90, Number(params.extendDays) || 7));
    config.activeSeason.endDate = params.endDate
      ? toIsoDate(params.endDate)
      : addDaysIso(config.activeSeason.endDate, days);
    config.activeSeason.updatedAt = nowIso;
    config.updatedAt = nowIso;
    config.updatedBy = actor.fullName;
    await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);
    return { config, message: `مهلت فصل جاری لیگ تا تاریخ ${config.activeSeason.endDate} تمدید شد.` };
  }

  // 'end' or 'start_new': Archive current season results if not already archived
  const { entries } = await computeLeaderboard(kv, { period: 'all' });
  const rankings: StudyLeagueArchiveWinner[] = entries.map((e) => ({
    rank: e.rank,
    studentId: e.studentId,
    studentName: e.studentName,
    classId: e.classId,
    className: e.className,
    totalPoints: e.totalPoints,
    totalHours: e.totalHours,
    totalTests: e.totalTests,
    avgCompletionPercent: e.avgCompletionPercent,
    badgesCount: e.badges.length,
  }));

  const archive: StudyLeagueArchive = {
    id: generateId('lga'),
    seasonId: config.activeSeason.id,
    seasonTitle: config.activeSeason.title,
    periodType: config.activeSeason.periodType,
    startDate: config.activeSeason.startDate,
    endDate: config.activeSeason.endDate,
    archivedAt: nowIso,
    archivedByName: actor.fullName,
    totalParticipants: rankings.length,
    totalHours: round2(rankings.reduce((s, r) => s + r.totalHours, 0)),
    totalTests: rankings.reduce((s, r) => s + r.totalTests, 0),
    winners: rankings.slice(0, 3),
    rankings: rankings.slice(0, 50),
  };
  await kvPutJson(kv, KV_KEYS.leagueArchiveItem(archive.id), archive);
  await kvAddToIndex(kv, KV_KEYS.LEAGUE_ARCHIVES_INDEX, archive.id);

  // Award weekly_champion badge to Rank #1 winner and coin rewards if configured
  const topWinner = rankings[0];
  if (topWinner) {
    await awardManualBadge(
      kv,
      config,
      topWinner.studentId,
      'weekly_champion',
      `کسب رتبه اول در ${config.activeSeason.title}`,
      actor.fullName
    );
  }
  const users = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
  const userMap = new Map(users.map((u) => [u.id, u]));
  for (const w of archive.winners) {
    const prize = config.prizes.find((p) => w.rank >= p.rankFrom && w.rank <= p.rankTo);
    if (prize?.coinsAmount && prize.coinsAmount > 0) {
      const targetStu = userMap.get(w.studentId);
      if (targetStu) {
        targetStu.coins = (targetStu.coins ?? 0) + prize.coinsAmount;
        await kvPutJson(kv, KV_KEYS.user(targetStu.id), targetStu);
      }
    }
    await createLeagueNotification(kv, {
      userId: w.studentId,
      seasonId: config.activeSeason.id,
      type: 'season_winners',
      title: `تبریک! رتبه ${w.rank} در «${config.activeSeason.title}»`,
      body: `فصل لیگ مطالعاتی به پایان رسید و شما با ${w.totalPoints} امتیاز رتبه ${w.rank} را کسب کردید.`,
      relatedId: archive.id,
    });
  }

  if (params.action === 'end') {
    config.activeSeason.status = 'ended';
    config.activeSeason.endedAt = nowIso;
    config.activeSeason.updatedAt = nowIso;
    config.updatedAt = nowIso;
    config.updatedBy = actor.fullName;
    await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);
    return {
      config,
      archive,
      message: 'فصل جاری لیگ مطالعاتی پایان یافت و نفرات برتر در آرشیو ثبت شدند.',
    };
  }

  // 'start_new'
  const startDate = params.startDate ? toIsoDate(params.startDate) : toIsoDate();
  const periodType = params.periodType ?? config.activeSeason.periodType ?? 'monthly';
  const endDate = params.endDate ? toIsoDate(params.endDate) : defaultPeriodEndDate(startDate, periodType);
  const newSeason: StudyLeagueSeason = {
    id: generateId('lgs'),
    title: params.title?.trim() || `دوره جدید لیگ مطالعاتی (${startDate})`,
    periodType,
    status: 'active',
    startDate,
    endDate,
    allowedClassIds: params.allowedClassIds ?? config.activeSeason.allowedClassIds,
    allowedSubjectIds: params.allowedSubjectIds ?? config.activeSeason.allowedSubjectIds,
    description: params.description?.trim() ?? config.activeSeason.description,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  config.activeSeason = newSeason;
  config.updatedAt = nowIso;
  config.updatedBy = actor.fullName;
  await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);

  // Notify eligible active students of the new season
  const activeStudents = users.filter((u) => isStudentEligibleForSeason(u, config));
  for (const stu of activeStudents.slice(0, 200)) {
    await createLeagueNotification(kv, {
      userId: stu.id,
      seasonId: newSeason.id,
      type: 'new_league_started',
      title: `شروع ${newSeason.title}`,
      body: `دوره جدید لیگ مطالعاتی از تاریخ ${newSeason.startDate} تا ${newSeason.endDate} آغاز شد. هدف خود را ثبت کنید!`,
      relatedId: newSeason.id,
    });
  }

  return {
    config,
    archive,
    message: `فصل جدید «${newSeason.title}» آغاز و فصل قبلی بایگانی شد.`,
  };
}

export async function checkAndNotifyDeadlines(
  kv: SchoolKVStore,
  studentId: string,
  seasonId: string,
  goalsWithProgress: StudyGoalWithProgress[]
): Promise<void> {
  const existingNotifs = await kvGetCollection<StudyLeagueNotification>(
    kv,
    KV_KEYS.LEAGUE_NOTIFICATIONS_INDEX,
    KV_KEYS.leagueNotificationItem
  );
  for (const g of goalsWithProgress) {
    if (g.status === 'active' && g.daysLeft >= 0 && g.daysLeft <= 2 && g.overallPercent < 95) {
      const alreadySent = existingNotifs.some(
        (n) =>
          n.userId === studentId &&
          n.type === 'goal_deadline_near' &&
          n.relatedId === g.id
      );
      if (!alreadySent) {
        await createLeagueNotification(kv, {
          userId: studentId,
          seasonId,
          type: 'goal_deadline_near',
          title: `یادآوری مهلت هدف «${g.title}»`,
          body:
            g.daysLeft === 0
              ? `امروز آخرین مهلت هدف «${g.title}» است و ${g.overallPercent}٪ آن تکمیل شده.`
              : `تنها ${g.daysLeft} روز تا پایان مهلت هدف «${g.title}» باقی مانده است (${g.overallPercent}٪ تکمیل).`,
          relatedId: g.id,
        });
      }
    }
  }
}

export async function getStudentEarnedBadgesSummary(
  kv: SchoolKVStore,
  studentId: string
): Promise<StudentLeagueBadge[]> {
  const badges = await kvGetCollection<StudentLeagueBadge>(
    kv,
    KV_KEYS.LEAGUE_BADGES_INDEX,
    KV_KEYS.leagueBadgeItem
  );
  return badges
    .filter((b) => b.studentId === studentId)
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
}

export type LeagueLogPatchInput = {
  hours?: number;
  testCount?: number;
  pagesRead?: number;
  exercisesDone?: number;
  date?: string;
  notes?: string;
  status?: StudyLogStatus;
  reason?: string;
};

export async function applyAdminOrTeacherLogEdit(
  kv: SchoolKVStore,
  config: StudyLeagueConfig,
  actor: Pick<StoredUser, 'id' | 'fullName' | 'role'>,
  existing: StudyLog,
  patch: LeagueLogPatchInput
): Promise<StudyLog> {
  const before: StudyLogEditEntry['before'] = {
    hours: existing.hours,
    testCount: existing.testCount,
    pagesRead: existing.pagesRead,
    exercisesDone: existing.exercisesDone,
    date: existing.date,
    status: existing.status,
  };

  const rawHours = patch.hours !== undefined ? Number(patch.hours) : existing.hours;
  const rawTests = patch.testCount !== undefined ? Number(patch.testCount) : existing.testCount;
  const rawPages = patch.pagesRead !== undefined ? Number(patch.pagesRead) : existing.pagesRead;
  const rawEx = patch.exercisesDone !== undefined ? Number(patch.exercisesDone) : existing.exercisesDone;

  const nextHours = Number.isFinite(rawHours) ? Math.max(0.1, Math.min(24, rawHours)) : existing.hours;
  const nextTests = Number.isFinite(rawTests) ? Math.max(0, Math.min(2000, Math.round(rawTests))) : existing.testCount;
  const nextPages = Number.isFinite(rawPages) ? Math.max(0, Math.min(2000, Math.round(rawPages))) : existing.pagesRead;
  const nextEx = Number.isFinite(rawEx) ? Math.max(0, Math.min(1000, Math.round(rawEx))) : existing.exercisesDone;
  const nextDate = patch.date !== undefined ? toIsoDate(patch.date) : existing.date;
  const nextStatus: StudyLogStatus =
    patch.status && (patch.status === 'approved' || patch.status === 'pending_review' || patch.status === 'rejected')
      ? patch.status
      : existing.status;

  const after: StudyLogEditEntry['after'] = {
    hours: nextHours,
    testCount: nextTests,
    pagesRead: nextPages,
    exercisesDone: nextEx,
    date: nextDate,
    status: nextStatus,
  };

  const editEntry: StudyLogEditEntry = {
    editedAt: new Date().toISOString(),
    editedById: actor.id,
    editedByName: actor.fullName,
    editedByRole: actor.role,
    reason: patch.reason?.trim() || 'اصلاح عملکرد ثبت‌شده توسط مسئول آموزشی',
    before,
    after,
  };

  const updated: StudyLog = {
    ...existing,
    hours: nextHours,
    testCount: nextTests,
    pagesRead: nextPages,
    exercisesDone: nextEx,
    date: nextDate,
    notes: patch.notes !== undefined ? patch.notes.trim() : existing.notes,
    status: nextStatus,
    reviewedById: actor.id,
    reviewedByName: actor.fullName,
    reviewedAt: new Date().toISOString(),
    editHistory: [editEntry, ...(existing.editHistory ?? [])],
    updatedAt: new Date().toISOString(),
  };

  await kvPutJson(kv, KV_KEYS.leagueLogItem(updated.id), updated);
  await recomputeStudentSeasonLogs(kv, config, updated.studentId, updated.seasonId);
  await evaluateStudentBadges(kv, config, updated.studentId);

  const refreshed = await kvGetJson<StudyLog>(kv, KV_KEYS.leagueLogItem(updated.id));
  return refreshed ?? updated;
}
