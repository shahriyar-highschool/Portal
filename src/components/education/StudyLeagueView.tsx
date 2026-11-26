import {
  AlertTriangle,
  Archive,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Download,
  Edit3,
  FileSpreadsheet,
  Flame,
  History,
  Lock,
  MessageSquareHeart,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  type AdminLeagueAnalytics,
  type LeagueHallOfFame,
  type LeagueLeaderboardEntry,
  type SchoolClass,
  type StudentLeagueAnalytics,
  type StudentLeagueBadge,
  type StudyBadgeCode,
  type StudyBadgeDefinition,
  type StudyFeedback,
  type StudyGoalWithProgress,
  type StudyLeagueArchive,
  type StudyLeagueConfig,
  type StudyLeagueNotification,
  type StudyLeaguePrize,
  type StudyLeagueSeasonPeriod,
  type StudyLeagueTimeframe,
  type StudyLog,
  type StudyLogStatus,
  type Subject,
  type TeacherLeagueAnalytics,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { GRADE_LEVELS_FA } from '../../lib/persian';
import { Modal } from '../ui/Modal';
import { CircularSpinner } from '../ui/StatCard';
import { useToast } from '../ui/Toast';
import { StudyLeagueAnalyticsPanel } from './StudyLeagueAnalyticsPanel';
import { BadgeIcon, badgeTierClasses, StudyLeagueHallOfFame } from './StudyLeagueHallOfFame';

export type LeagueSubTab =
  | 'goals'
  | 'leaderboard'
  | 'hall'
  | 'analytics'
  | 'archives'
  | 'teacher_hub'
  | 'admin_control';

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) return <span className="text-slate-400">—</span>;
  const max = Math.max(10, ...values);
  const w = 72;
  const h = 22;
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2;
      const y = h - 3 - (Math.min(max, v) / max) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-sky-600 dark:text-sky-400"
        points={pts}
      />
    </svg>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function StudyLeagueView({
  user,
  classes,
  subjects,
  students = [],
  initialTab,
}: {
  user: UserAccount;
  classes: SchoolClass[];
  subjects: Subject[];
  students?: UserAccount[];
  initialTab?: LeagueSubTab;
}) {
  const { tr, fmtNum, fmtDigits, fmtDate, fmtDateTime, lang } = useI18n();
  const { showToast } = useToast();

  const defaultTabForRole: LeagueSubTab =
    initialTab ?? (user.role === 'student' ? 'goals' : user.role === 'teacher' ? 'teacher_hub' : 'leaderboard');

  const [subTab, setSubTab] = useState<LeagueSubTab>(defaultTabForRole);

  useEffect(() => {
    if (initialTab) setSubTab(initialTab);
  }, [initialTab]);

  // Core state
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<StudyLeagueConfig | null>(null);
  const [badgesCatalog, setBadgesCatalog] = useState<StudyBadgeDefinition[]>([]);
  const [myBadges, setMyBadges] = useState<StudentLeagueBadge[]>([]);
  const [goals, setGoals] = useState<StudyGoalWithProgress[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [feedbacks, setFeedbacks] = useState<StudyFeedback[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeagueLeaderboardEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeagueLeaderboardEntry | null>(null);
  const [hallOfFame, setHallOfFame] = useState<LeagueHallOfFame | null>(null);
  const [archives, setArchives] = useState<StudyLeagueArchive[]>([]);
  const [notifications, setNotifications] = useState<StudyLeagueNotification[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [studentAnalytics, setStudentAnalytics] = useState<StudentLeagueAnalytics | null>(null);
  const [teacherAnalytics, setTeacherAnalytics] = useState<TeacherLeagueAnalytics | null>(null);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminLeagueAnalytics | null>(null);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [hallLoaded, setHallLoaded] = useState(false);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  // Filters
  const [lbPeriod, setLbPeriod] = useState<'all' | 'weekly' | 'monthly'>('monthly');
  const [lbClassId, setLbClassId] = useState<string>('all');
  const [lbGradeLevel, setLbGradeLevel] = useState<string>('all');
  const [lbSubjectId, setLbSubjectId] = useState<string>('all');
  const [lbSearch, setLbSearch] = useState('');
  const [teacherClassFilter, setTeacherClassFilter] = useState<string>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | StudyLogStatus | 'flagged'>('all');

  // Notifications modal
  const [notifsOpen, setNotifsOpen] = useState(false);

  // Student Goal modal
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<StudyGoalWithProgress | null>(null);
  const [gTitle, setGTitle] = useState('');
  const [gSubjectIds, setGSubjectIds] = useState<string[]>([]);
  const [gTimeframe, setGTimeframe] = useState<StudyLeagueTimeframe>('monthly');
  const [gHours, setGHours] = useState('60');
  const [gTests, setGTests] = useState('800');
  const [gPages, setGPages] = useState('250');
  const [gExercises, setGExercises] = useState('120');
  const [gStart, setGStart] = useState(() => todayIso());
  const [gEnd, setGEnd] = useState(() => plusDaysIso(29));
  const [gPlan, setGPlan] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  // Daily Performance Log modal
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [lGoalId, setLGoalId] = useState('');
  const [lDate, setLDate] = useState(() => todayIso());
  const [lHours, setLHours] = useState('2');
  const [lTests, setLTests] = useState('35');
  const [lPages, setLPages] = useState('15');
  const [lExercises, setLExercises] = useState('5');
  const [lNotes, setLNotes] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  // Teacher/Admin Review & Edit Log modal
  const [editLogTarget, setEditLogTarget] = useState<StudyLog | null>(null);
  const [eHours, setEHours] = useState('');
  const [eTests, setETests] = useState('');
  const [ePages, setEPages] = useState('');
  const [eExercises, setEExercises] = useState('');
  const [eDate, setEDate] = useState('');
  const [eStatus, setEStatus] = useState<StudyLogStatus>('approved');
  const [eReason, setEReason] = useState('');
  const [savingEditLog, setSavingEditLog] = useState(false);
  const [historyLogTarget, setHistoryLogTarget] = useState<StudyLog | null>(null);

  // Teacher Feedback & Badge Modal
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [fbStudentId, setFbStudentId] = useState('');
  const [fbTag, setFbTag] = useState<StudyFeedback['encouragementTag']>('great_effort');
  const [fbMessage, setFbMessage] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const [awardBadgeStudentId, setAwardBadgeStudentId] = useState('');
  const [awardBadgeCode, setAwardBadgeCode] = useState<StudyBadgeCode>('hardworking_student');
  const [awardBadgeReason, setAwardBadgeReason] = useState('');
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);

  // Admin Settings Form State
  const [cfgEnabled, setCfgEnabled] = useState(true);
  const [cfgSeasonTitle, setCfgSeasonTitle] = useState('');
  const [cfgPeriodType, setCfgPeriodType] = useState<StudyLeagueSeasonPeriod>('monthly');
  const [cfgStartDate, setCfgStartDate] = useState('');
  const [cfgEndDate, setCfgEndDate] = useState('');
  const [cfgAllowedClasses, setCfgAllowedClasses] = useState<string[]>([]);
  const [cfgAllowedSubjects, setCfgAllowedSubjects] = useState<string[]>([]);
  const [cfgEligibleGrades, setCfgEligibleGrades] = useState<string[]>([]);
  const [cfgHoursW, setCfgHoursW] = useState('12');
  const [cfgTestsW, setCfgTestsW] = useState('0.4');
  const [cfgPagesW, setCfgPagesW] = useState('0.25');
  const [cfgExW, setCfgExW] = useState('1.5');
  const [cfgBonusW, setCfgBonusW] = useState('40');
  const [cfgStreakW, setCfgStreakW] = useState('8');
  const [cfgDailyCap, setCfgDailyCap] = useState('180');
  const [cfgMinCompBonus, setCfgMinCompBonus] = useState('80');
  const [cfgSuspHours, setCfgSuspHours] = useState('14');
  const [cfgSuspTests, setCfgSuspTests] = useState('600');
  const [cfgReqAbove, setCfgReqAbove] = useState(true);
  const [cfgReqAll, setCfgReqAll] = useState(false);
  const [cfgPrizes, setCfgPrizes] = useState<StudyLeaguePrize[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  // Admin New Season Modal
  const [newSeasonModalOpen, setNewSeasonModalOpen] = useState(false);
  const [nsTitle, setNsTitle] = useState('');
  const [nsPeriod, setNsPeriod] = useState<StudyLeagueSeasonPeriod>('monthly');
  const [nsStart, setNsStart] = useState(() => todayIso());
  const [nsEnd, setNsEnd] = useState(() => plusDaysIso(29));
  const [nsDesc, setNsDesc] = useState('');

  // Archive detail modal
  const [expandedArchive, setExpandedArchive] = useState<StudyLeagueArchive | null>(null);

  const loadLeaderboardAndAnalytics = useCallback(async () => {
    const qs = new URLSearchParams({ period: lbPeriod });
    if (lbClassId !== 'all') qs.set('classId', lbClassId);
    if (lbGradeLevel !== 'all') qs.set('gradeLevel', lbGradeLevel);
    if (lbSubjectId !== 'all') qs.set('subjectId', lbSubjectId);

    const anlQs = new URLSearchParams();
    if (teacherClassFilter !== 'all') anlQs.set('classId', teacherClassFilter);

    const [lbRes, anlRes] = await Promise.allSettled([
      apiRequest<{ config: StudyLeagueConfig; leaderboard: LeagueLeaderboardEntry[]; myEntry: LeagueLeaderboardEntry | null }>(
        `/api/league/leaderboard?${qs.toString()}`
      ),
      apiRequest<{
        studentAnalytics?: StudentLeagueAnalytics;
        teacherAnalytics?: TeacherLeagueAnalytics;
        adminAnalytics?: AdminLeagueAnalytics;
      }>(`/api/league/analytics?${anlQs.toString()}`),
    ]);

    if (lbRes.status === 'fulfilled') {
      setLeaderboard(lbRes.value.leaderboard ?? []);
      setMyEntry(lbRes.value.myEntry ?? null);
      setLeaderboardLoaded(true);
    }
    if (anlRes.status === 'fulfilled') {
      setStudentAnalytics(anlRes.value.studentAnalytics ?? null);
      setTeacherAnalytics(anlRes.value.teacherAnalytics ?? null);
      setAdminAnalytics(anlRes.value.adminAnalytics ?? null);
      setAnalyticsLoaded(true);
    }
  }, [lbPeriod, lbClassId, lbGradeLevel, lbSubjectId, teacherClassFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, goalsRes, logsRes, fbRes, hofRes, notifRes, archRes, bdgRes] = await Promise.allSettled([
        apiRequest<{ config: StudyLeagueConfig; badgesCatalog: StudyBadgeDefinition[] }>('/api/league/config'),
        apiRequest<{ goals: StudyGoalWithProgress[] }>('/api/league/goals'),
        apiRequest<{ logs: StudyLog[] }>('/api/league/logs'),
        apiRequest<{ feedbacks: StudyFeedback[] }>('/api/league/feedback'),
        apiRequest<{ hallOfFame: LeagueHallOfFame }>('/api/league/hall-of-fame'),
        apiRequest<{ notifications: StudyLeagueNotification[]; unreadCount: number }>('/api/league/notifications'),
        apiRequest<{ archives: StudyLeagueArchive[] }>('/api/league/archives'),
        apiRequest<{ definitions: StudyBadgeDefinition[]; earned: StudentLeagueBadge[] }>('/api/league/badges'),
      ]);

      if (cfgRes.status === 'fulfilled') {
        const c = cfgRes.value.config;
        setConfig(c);
        setBadgesCatalog(cfgRes.value.badgesCatalog ?? []);
        setCfgEnabled(c.enabled);
        setCfgSeasonTitle(c.activeSeason.title);
        setCfgPeriodType(c.activeSeason.periodType);
        setCfgStartDate(c.activeSeason.startDate);
        setCfgEndDate(c.activeSeason.endDate);
        setCfgAllowedClasses(c.activeSeason.allowedClassIds ?? []);
        setCfgAllowedSubjects(c.activeSeason.allowedSubjectIds ?? []);
        setCfgEligibleGrades(c.rules.eligibleGradeLevels ?? []);
        setCfgHoursW(String(c.weights.studyHoursWeight));
        setCfgTestsW(String(c.weights.testCountWeight));
        setCfgPagesW(String(c.weights.pagesWeight));
        setCfgExW(String(c.weights.exercisesWeight));
        setCfgBonusW(String(c.weights.completionBonusWeight));
        setCfgStreakW(String(c.weights.streakWeight));
        setCfgDailyCap(String(c.rules.dailyPointCap));
        setCfgMinCompBonus(String(c.rules.minGoalCompletionForBonus));
        setCfgSuspHours(String(c.rules.suspiciousHoursThreshold));
        setCfgSuspTests(String(c.rules.suspiciousTestsThreshold));
        setCfgReqAbove(c.rules.requireApprovalAboveThreshold);
        setCfgReqAll(c.rules.requireApprovalAllLogs);
        setCfgPrizes(c.prizes ?? []);
      }
      if (goalsRes.status === 'fulfilled') {
        const list = goalsRes.value.goals ?? [];
        setGoals(list);
        if (list.length > 0 && !lGoalId) setLGoalId(list[0].id);
      }
      if (logsRes.status === 'fulfilled') {
        setLogs(logsRes.value.logs ?? []);
        setLogsLoaded(true);
      }
      if (fbRes.status === 'fulfilled') setFeedbacks(fbRes.value.feedbacks ?? []);
      if (hofRes.status === 'fulfilled') {
        setHallOfFame(hofRes.value.hallOfFame ?? null);
        setHallLoaded(true);
      }
      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value.notifications ?? []);
        setUnreadNotifsCount(notifRes.value.unreadCount ?? 0);
      }
      if (archRes.status === 'fulfilled') setArchives(archRes.value.archives ?? []);
      if (bdgRes.status === 'fulfilled') {
        setMyBadges(bdgRes.value.earned ?? []);
        setBadgesLoaded(true);
      }

      await loadLeaderboardAndAnalytics();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در بارگذاری لیگ مطالعاتی', 'Failed to load Study League'), 'error');
    } finally {
      setLoading(false);
    }
  }, [lGoalId, loadLeaderboardAndAnalytics, showToast, tr]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadLeaderboardAndAnalytics();
  }, [loadLeaderboardAndAnalytics]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const allowedSubjectsForSelect = useMemo(() => {
    const allowed = config?.activeSeason.allowedSubjectIds ?? [];
    if (allowed.length === 0) return subjects;
    return subjects.filter((s) => allowed.includes(s.id));
  }, [config?.activeSeason.allowedSubjectIds, subjects]);

  const filteredLeaderboard = useMemo(() => {
    const q = lbSearch.trim().toLowerCase();
    if (!q) return leaderboard;
    return leaderboard.filter(
      (e) =>
        e.studentName.toLowerCase().includes(q) ||
        e.className.toLowerCase().includes(q)
    );
  }, [leaderboard, lbSearch]);

  const moderatedLogs = useMemo(() => {
    return logs.filter((l) => {
      if (teacherClassFilter !== 'all' && l.classId !== teacherClassFilter) return false;
      if (logStatusFilter === 'flagged') return Boolean(l.flaggedReason);
      if (logStatusFilter !== 'all') return l.status === logStatusFilter;
      return true;
    });
  }, [logs, teacherClassFilter, logStatusFilter]);

  const pendingLogs = useMemo(
    () =>
      logs.filter(
        (l) =>
          l.status === 'pending_review' &&
          (teacherClassFilter === 'all' || l.classId === teacherClassFilter)
      ),
    [logs, teacherClassFilter]
  );

  // Student Goal Helpers
  const openCreateGoal = () => {
    setEditingGoal(null);
    setGTitle('');
    setGSubjectIds(allowedSubjectsForSelect[0] ? [allowedSubjectsForSelect[0].id] : []);
    setGTimeframe('monthly');
    setGHours('60');
    setGTests('800');
    setGPages('250');
    setGExercises('120');
    setGStart(todayIso());
    setGEnd(plusDaysIso(29));
    setGPlan('');
    setGoalModalOpen(true);
  };

  const openEditGoal = (g: StudyGoalWithProgress) => {
    setEditingGoal(g);
    setGTitle(g.title);
    setGSubjectIds(g.subjectIds);
    setGTimeframe(g.timeframe);
    setGHours(String(g.targetHours));
    setGTests(String(g.targetTests));
    setGPages(g.targetPages ? String(g.targetPages) : '');
    setGExercises(g.targetExercises ? String(g.targetExercises) : '');
    setGStart(g.startDate);
    setGEnd(g.endDate);
    setGPlan(g.personalPlan ?? '');
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (gSubjectIds.length === 0) {
      showToast(tr('لطفاً حداقل یک درس انتخاب کنید.', 'Select at least one subject.'), 'error');
      return;
    }
    setSavingGoal(true);
    try {
      const payload = {
        title: gTitle.trim(),
        subjectIds: gSubjectIds,
        timeframe: gTimeframe,
        targetHours: Number(gHours),
        targetTests: Number(gTests) || 0,
        targetPages: gPages.trim() ? Number(gPages) : undefined,
        targetExercises: gExercises.trim() ? Number(gExercises) : undefined,
        startDate: gStart,
        endDate: gEnd,
        personalPlan: gPlan.trim() || undefined,
      };
      if (editingGoal) {
        await apiRequest(`/api/league/goals/${editingGoal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast(tr('هدف مطالعاتی به‌روزرسانی شد.', 'Study goal updated.'));
      } else {
        await apiRequest('/api/league/goals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(tr('هدف مطالعاتی جدید در لیگ ثبت شد.', 'Study goal created.'));
      }
      setGoalModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره هدف', 'Failed to save goal'), 'error');
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    try {
      await apiRequest(`/api/league/goals/${id}`, { method: 'DELETE' });
      showToast(tr('هدف مطالعاتی حذف شد.', 'Goal deleted.'));
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف هدف', 'Failed to delete goal'), 'error');
    }
  };

  const openLogModalForGoal = (goalId?: string) => {
    setLGoalId(goalId || goals[0]?.id || '');
    setLDate(todayIso());
    setLHours('2.5');
    setLTests('40');
    setLPages('15');
    setLExercises('5');
    setLNotes('');
    setLogModalOpen(true);
  };

  const handleSaveLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!lGoalId) {
      showToast(tr('ابتدا یک هدف مطالعاتی تعریف یا انتخاب کنید.', 'Select a study goal first.'), 'error');
      return;
    }
    setSavingLog(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/league/logs', {
        method: 'POST',
        body: JSON.stringify({
          goalId: lGoalId,
          date: lDate,
          hours: Number(lHours),
          testCount: Number(lTests) || 0,
          pagesRead: Number(lPages) || 0,
          exercisesDone: Number(lExercises) || 0,
          notes: lNotes.trim() || undefined,
        }),
      });
      setLogModalOpen(false);
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت عملکرد', 'Failed to log performance'), 'error');
    } finally {
      setSavingLog(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await apiRequest(`/api/league/logs/${id}`, { method: 'DELETE' });
      showToast(tr('گزارش حذف و امتیازها بازمحاسبه شد.', 'Log deleted and scores recalculated.'));
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف گزارش', 'Delete failed'), 'error');
    }
  };

  const handleReviewLog = async (logId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/league/logs/${logId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در بررسی گزارش', 'Review failed'), 'error');
    }
  };

  const openEditLogModal = (log: StudyLog) => {
    setEditLogTarget(log);
    setEHours(String(log.hours));
    setETests(String(log.testCount));
    setEPages(String(log.pagesRead));
    setEExercises(String(log.exercisesDone));
    setEDate(log.date);
    setEStatus(log.status);
    setEReason('');
  };

  const handleSaveEditedLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!editLogTarget) return;
    setSavingEditLog(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/league/logs/${editLogTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          hours: Number(eHours),
          testCount: Number(eTests),
          pagesRead: Number(ePages),
          exercisesDone: Number(eExercises),
          date: eDate,
          status: eStatus,
          reason: eReason.trim() || tr('اصلاح گزارش توسط مسئول آموزشی', 'Corrected by staff'),
        }),
      });
      setEditLogTarget(null);
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ویرایش گزارش', 'Edit failed'), 'error');
    } finally {
      setSavingEditLog(false);
    }
  };

  const handleSendFeedback = async (e: FormEvent) => {
    e.preventDefault();
    if (!fbStudentId || !fbMessage.trim()) return;
    setSavingFeedback(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/league/feedback', {
        method: 'POST',
        body: JSON.stringify({
          studentId: fbStudentId,
          encouragementTag: fbTag,
          message: fbMessage.trim(),
        }),
      });
      setFeedbackModalOpen(false);
      setFbMessage('');
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ارسال بازخورد', 'Feedback failed'), 'error');
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleAwardBadge = async (e: FormEvent) => {
    e.preventDefault();
    if (!awardBadgeStudentId) return;
    try {
      const res = await apiRequest<{ message: string }>('/api/league/badges/award', {
        method: 'POST',
        body: JSON.stringify({
          studentId: awardBadgeStudentId,
          code: awardBadgeCode,
          awardReason: awardBadgeReason.trim() || undefined,
        }),
      });
      setAwardBadgeOpen(false);
      setAwardBadgeReason('');
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در اعطای نشان', 'Badge award failed'), 'error');
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await apiRequest('/api/league/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadNotifsCount(0);
    } catch {
      // ignore
    }
  };

  // Admin handlers
  const handleSaveAdminConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/league/config', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: cfgEnabled,
          season: {
            title: cfgSeasonTitle.trim(),
            periodType: cfgPeriodType,
            startDate: cfgStartDate,
            endDate: cfgEndDate,
            allowedClassIds: cfgAllowedClasses,
            allowedSubjectIds: cfgAllowedSubjects,
          },
          weights: {
            studyHoursWeight: Number(cfgHoursW),
            testCountWeight: Number(cfgTestsW),
            pagesWeight: Number(cfgPagesW),
            exercisesWeight: Number(cfgExW),
            completionBonusWeight: Number(cfgBonusW),
            streakWeight: Number(cfgStreakW),
          },
          rules: {
            dailyPointCap: Number(cfgDailyCap),
            minGoalCompletionForBonus: Number(cfgMinCompBonus),
            suspiciousHoursThreshold: Number(cfgSuspHours),
            suspiciousTestsThreshold: Number(cfgSuspTests),
            requireApprovalAboveThreshold: cfgReqAbove,
            requireApprovalAllLogs: cfgReqAll,
            eligibleGradeLevels: cfgEligibleGrades,
          },
          prizes: cfgPrizes,
        }),
      });
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره تنظیمات', 'Failed to save settings'), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSeasonAction = async (
    action: 'pause' | 'resume' | 'extend' | 'end' | 'start_new',
    extra?: Record<string, unknown>
  ) => {
    try {
      const res = await apiRequest<{ message: string }>('/api/league/season/action', {
        method: 'POST',
        body: JSON.stringify({ action, ...extra }),
      });
      showToast(res.message);
      setNewSeasonModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در اجرای عملیات فصل', 'Season action failed'), 'error');
    }
  };

  const handleToggleSuspend = async (studentId: string, currentlySuspended: boolean) => {
    try {
      const res = await apiRequest<{ message: string }>('/api/league/suspend', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          suspended: !currentlySuspended,
          reason: !currentlySuspended ? 'تعلیق موقت جهت بررسی عملکرد در لیگ' : undefined,
        }),
      });
      showToast(res.message);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تغییر وضعیت تعلیق', 'Suspension failed'), 'error');
    }
  };

  const handleExportLeagueExcel = (mode: 'leaderboard' | 'logs') => {
    if (mode === 'leaderboard') {
      if (leaderboard.length === 0) {
        showToast(tr('داده‌ای برای خروجی جدول رده‌بندی وجود ندارد.', 'No ranking rows to export.'), 'error');
        return;
      }
      const rows = leaderboard.map((e) => ({
        رتبه: e.rank,
        'تغییر رتبه': e.rankDelta,
        'نام دانش‌آموز': e.studentName,
        کلاس: e.className,
        پایه: e.gradeLevel ?? '—',
        'امتیاز کل': e.totalPoints,
        'امتیاز هفته': e.weeklyPoints,
        'ساعت مطالعه': e.totalHours,
        'تعداد تست': e.totalTests,
        'صفحات مطالعه': e.totalPages,
        'درصد تحقق هدف': `${e.avgCompletionPercent}%`,
        'استمرار (روز)': e.streakDays,
        'تعداد نشان': e.badges.length,
        وضعیت: e.suspended ? 'مسدود موقت' : 'فعال',
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'رده‌بندی لیگ');
      XLSX.writeFile(wb, 'لیگ_مطالعاتی_رتبه_بندی.xlsx');
      showToast(tr('فایل اکسل رده‌بندی لیگ دانلود شد.', 'Leaderboard Excel exported.'));
      return;
    }

    if (logs.length === 0) {
      showToast(tr('گزارش عملکردی برای خروجی وجود ندارد.', 'No logs to export.'), 'error');
      return;
    }
    const logRows = logs.map((l, idx) => ({
      ردیف: idx + 1,
      تاریخ: fmtDate(l.date),
      'نام دانش‌آموز': l.studentName ?? l.studentId,
      کلاس: l.className ?? '—',
      هدف: l.goalTitle ?? '—',
      دروس: (l.subjectNames ?? []).join('، '),
      'ساعت مطالعه': l.hours,
      'تعداد تست': l.testCount,
      صفحات: l.pagesRead,
      تمرین: l.exercisesDone,
      'امتیاز محاسبه‌شده': l.computedPoints,
      وضعیت:
        l.status === 'approved' ? 'تأییدشده' : l.status === 'pending_review' ? 'در انتظار بررسی' : 'ردشده',
      'هشدار سیستمی': l.flaggedReason ?? '—',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(logRows);
    XLSX.utils.book_append_sheet(wb, ws, 'عملکردهای لیگ');
    XLSX.writeFile(wb, 'گزارش_عملکرد_لیگ.xlsx');
    showToast(tr('فایل اکسل گزارش‌های مطالعه دانلود شد.', 'Logs Excel exported.'));
  };

  const periodLabel = (p: StudyLeagueSeasonPeriod) => {
    if (p === 'daily') return tr('روزانه', 'Daily');
    if (p === 'weekly') return tr('هفتگی', 'Weekly');
    if (p === 'monthly') return tr('ماهانه', 'Monthly');
    if (p === 'term') return tr('ترمی', 'Semester');
    return tr('سفارشی', 'Custom');
  };

  const statusBadge = (status: StudyLogStatus) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{tr('تأییدشده', 'Approved')}</span>
        </span>
      );
    }
    if (status === 'pending_review') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Clock className="w-3.5 h-3.5" />
          <span>{tr('در انتظار بررسی', 'Pending Review')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
        <XCircle className="w-3.5 h-3.5" />
        <span>{tr('ردشده', 'Rejected')}</span>
      </span>
    );
  };

  const tabs: Array<{ id: LeagueSubTab; label: string; icon: typeof Trophy; badge?: number }> = [
    ...(user.role === 'student'
      ? [{ id: 'goals' as LeagueSubTab, label: tr('اهداف و ثبت عملکرد', 'Goals & Daily Log'), icon: Target }]
      : []),
    { id: 'leaderboard', label: tr('جدول رده‌بندی', 'Leaderboard'), icon: Trophy },
    { id: 'hall', label: tr('برترینهای لیگ', 'Hall of Fame'), icon: Crown },
    {
      id: 'analytics',
      label:
        user.role === 'student'
          ? tr('تحلیل و نمودارها', 'Analytics')
          : tr('گزارش‌دهی و تحلیل جامع', 'Reports & Analytics'),
      icon: BarChart3,
    },
    ...(user.role !== 'student'
      ? [
          {
            id: 'teacher_hub' as LeagueSubTab,
            label: tr('نظارت، بررسی و بازخورد', 'Review & Coaching'),
            icon: ShieldCheck,
            badge: pendingLogs.length > 0 ? pendingLogs.length : undefined,
          },
        ]
      : []),
    { id: 'archives', label: tr('آرشیو دوره‌ها', 'Season Archives'), icon: Archive },
    ...(user.role === 'admin'
      ? [{ id: 'admin_control' as LeagueSubTab, label: tr('مدیریت و تنظیمات لیگ', 'Admin Control'), icon: Settings }]
      : []),
  ];

  const isSuspendedStudent =
    user.role === 'student' && (config?.suspendedStudentIds ?? []).includes(user.id);

  const seasonActive = Boolean(config?.enabled && config?.activeSeason.status === 'active');

  return (
    <div className="space-y-5">
      {/* League Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-[#0F274A] dark:text-sky-400 flex items-center gap-1">
              <Trophy className="w-4 h-4" />
              <span>{tr('لیگ مطالعاتی دانش‌آموزان', 'Student Study League')}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{config ? periodLabel(config.activeSeason.periodType) : '—'}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-semibold ${
                seasonActive
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {!config?.enabled
                ? tr('غیرفعال', 'Disabled')
                : config.activeSeason.status === 'active'
                  ? tr('فصل فعال', 'Active Season')
                  : config.activeSeason.status === 'paused'
                    ? tr('متوقف موقت', 'Paused')
                    : tr('پایان‌یافته', 'Ended')}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
            {config?.activeSeason.title ?? tr('لیگ مطالعاتی', 'Study League')}
          </h2>
          {config?.activeSeason && (
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {fmtDate(config.activeSeason.startDate)} {tr('تا', '–')} {fmtDate(config.activeSeason.endDate)}
              </span>
              {config.activeSeason.description ? ` · ${config.activeSeason.description}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.role === 'student' && seasonActive && !isSuspendedStudent && (
            <>
              <button
                type="button"
                onClick={openCreateGoal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Plus className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                <span>{tr('هدف جدید', 'New Goal')}</span>
              </button>
              <button
                type="button"
                onClick={() => openLogModalForGoal()}
                disabled={goals.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{tr('ثبت عملکرد امروز', 'Log Study Session')}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setNotifsOpen(true)}
            className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Bell className="w-4 h-4" />
            <span>{tr('اعلان‌های لیگ', 'Notifications')}</span>
            {unreadNotifsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                {fmtDigits(unreadNotifsCount)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void loadAll()}
            aria-label={tr('به‌روزرسانی', 'Refresh')}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Suspension Notice */}
      {isSuspendedStudent && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 p-4 flex items-center gap-3 text-xs text-red-900 dark:text-red-200">
          <Lock className="w-4 h-4 shrink-0" />
          <p>
            {tr(
              'حساب شما در فصل جاری لیگ مطالعاتی توسط مدیریت به صورت موقت تعلیق شده است و امکان ثبت عملکرد جدید وجود ندارد.',
              'Your Study League participation is temporarily suspended by administration.'
            )}
          </p>
        </div>
      )}

      {/* Navigation Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {fmtDigits(t.badge)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ==================== TAB 1: STUDENT GOALS & DAILY LOGGING ==================== */}
      {subTab === 'goals' && (
        <div className="space-y-6">
          {/* Student Personal League KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: tr('رتبه فعلی شما در لیگ', 'Your Current Rank'),
                loadingVal: !leaderboardLoaded,
                loadingSub: !leaderboardLoaded,
                value: myEntry ? `#${fmtDigits(myEntry.rank)}` : '—',
                sub:
                  myEntry && myEntry.rankDelta !== 0
                    ? myEntry.rankDelta > 0
                      ? `▲ ${fmtDigits(myEntry.rankDelta)} ${tr('پله صعود', 'up')}`
                      : `▼ ${fmtDigits(Math.abs(myEntry.rankDelta))} ${tr('پله نزول', 'down')}`
                    : tr('ثبت عملکرد برای ورود به رده‌بندی', 'Log sessions to rank'),
              },
              {
                label: tr('مجموع امتیاز لیگ', 'Total League Points'),
                loadingVal: !leaderboardLoaded,
                loadingSub: !leaderboardLoaded,
                value: fmtNum(myEntry?.totalPoints ?? 0, 1),
                sub: `${tr('امتیاز این هفته:', 'This week:')} ${fmtNum(myEntry?.weeklyPoints ?? 0, 1)}`,
              },
              {
                label: tr('ساعت مطالعه و تست تأییدشده', 'Approved Hours & Tests'),
                loadingVal: !leaderboardLoaded,
                loadingSub: !leaderboardLoaded,
                value: `${fmtNum(myEntry?.totalHours ?? 0, 1)} ${tr('ساعت', 'hrs')}`,
                sub: `${fmtDigits(myEntry?.totalTests ?? 0)} ${tr('تست حل‌شده', 'tests solved')}`,
              },
              {
                label: tr('استمرار و نشان‌های افتخار', 'Streak & Badges'),
                loadingVal: !leaderboardLoaded,
                loadingSub: !badgesLoaded,
                value: `${fmtDigits(myEntry?.streakDays ?? 0)} ${tr('روز متوالی', 'day streak')}`,
                sub: `${fmtDigits(myBadges.length)} ${tr('نشان کسب‌شده', 'badges earned')}`,
              },
            ].map((k) => (
              <div
                key={k.label}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
              >
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{k.label}</p>
                {k.loadingVal ? (
                  <div className="mt-2 min-h-[28px] flex items-center">
                    <CircularSpinner size="md" />
                  </div>
                ) : (
                  <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                    {k.value}
                  </p>
                )}
                {k.loadingSub ? (
                  <div className="mt-1.5 min-h-[16px] flex items-center">
                    <CircularSpinner size="xs" />
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{k.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Earned Badges Strip */}
          {myBadges.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 me-1">
                {tr('نشان‌های کسب‌شده شما:', 'Your League Badges:')}
              </span>
              {myBadges.map((b) => {
                const def = badgesCatalog.find((d) => d.code === b.code);
                return (
                  <span
                    key={b.id}
                    title={b.awardReason}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${badgeTierClasses(def?.colorTier ?? 'gold')}`}
                  >
                    <BadgeIcon code={b.code} className="w-3.5 h-3.5" />
                    <span>{lang === 'fa' ? b.titleFa : b.titleEn}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Study Goals Cards */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('اهداف مطالعاتی تعریف‌شده شما', 'Your Study Goals')} ({fmtDigits(goals.length)})
              </h3>
              {seasonActive && !isSuspendedStudent && (
                <button
                  type="button"
                  onClick={openCreateGoal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('تعریف هدف جدید', 'Add Study Goal')}</span>
                </button>
              )}
            </div>

            {goals.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-12 px-4 text-center space-y-2">
                <Target className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('هنوز هدفی برای این فصل از لیگ تعریف نکرده‌اید', 'No study goals created yet')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {tr(
                    'برای ورود به رقابت، هدف مطالعه هر درس (ساعت مطالعه، تعداد تست، صفحات و تمرین) را تعریف کرده و عملکرد روزانه خود را ثبت کنید.',
                    'Define your target hours, tests, and pages for any subject to enter the Study League.'
                  )}
                </p>
                {seasonActive && !isSuspendedStudent && (
                  <button
                    type="button"
                    onClick={openCreateGoal}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{tr('ساخت اولین هدف مطالعاتی', 'Create First Goal')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            <span className="font-semibold text-[#0F274A] dark:text-sky-400">
                              {g.timeframe === 'daily'
                                ? tr('روزانه', 'Daily')
                                : g.timeframe === 'weekly'
                                  ? tr('هفتگی', 'Weekly')
                                  : tr('ماهانه', 'Monthly')}
                            </span>
                            <span>·</span>
                            <span className="tabular-nums">
                              {fmtDate(g.startDate)} {tr('تا', '–')} {fmtDate(g.endDate)}
                            </span>
                            <span>·</span>
                            <span
                              className={`font-semibold tabular-nums ${
                                g.daysLeft <= 2 && g.overallPercent < 95
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {g.daysLeft >= 0
                                ? `${fmtDigits(g.daysLeft)} ${tr('روز مانده', 'days left')}`
                                : tr('پایان بازه', 'Past due')}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{g.title}</h4>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {tr('دروس:', 'Subjects:')} {(g.subjectNames ?? []).join('، ')}
                          </p>
                        </div>

                        <div className="text-end shrink-0">
                          <span
                            className={`text-lg font-extrabold tabular-nums ${
                              g.overallPercent >= 100
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-[#0F274A] dark:text-sky-400'
                            }`}
                          >
                            {fmtNum(g.overallPercent, 0)}{tr('٪', '%')}
                          </span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {tr('پیشرفت کل', 'Overall')}
                          </p>
                        </div>
                      </div>

                      {/* Metric Progress Bars */}
                      <div className="space-y-2.5 text-xs">
                        <div>
                          <div className="flex justify-between mb-1 tabular-nums">
                            <span className="text-slate-600 dark:text-slate-300">{tr('ساعات مطالعه', 'Study Hours')}</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {fmtNum(g.loggedHours, 1)} / {fmtNum(g.targetHours, 1)} {tr('ساعت', 'h')} ({fmtNum(g.hoursPercent, 0)}{tr('٪', '%')})
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#0F274A] dark:bg-sky-500 transition-all"
                              style={{ width: `${Math.min(100, g.hoursPercent)}%` }}
                            />
                          </div>
                          {g.remainingHours > 0 && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              {tr('باقی‌مانده تا هدف:', 'Remaining:')} {fmtNum(g.remainingHours, 1)} {tr('ساعت', 'hrs')}
                            </p>
                          )}
                        </div>

                        {g.targetTests > 0 && (
                          <div>
                            <div className="flex justify-between mb-1 tabular-nums">
                              <span className="text-slate-600 dark:text-slate-300">{tr('تعداد تست', 'Tests')}</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {fmtDigits(g.loggedTests)} / {fmtDigits(g.targetTests)} ({fmtNum(g.testsPercent, 0)}{tr('٪', '%')})
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
                                style={{ width: `${Math.min(100, g.testsPercent)}%` }}
                              />
                            </div>
                            {g.remainingTests > 0 && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                {tr('باقی‌مانده:', 'Remaining:')} {fmtDigits(g.remainingTests)} {tr('تست', 'tests')}
                              </p>
                            )}
                          </div>
                        )}

                        {(g.targetPages ?? 0) > 0 && (
                          <div>
                            <div className="flex justify-between mb-1 tabular-nums">
                              <span className="text-slate-600 dark:text-slate-300">{tr('صفحات مطالعه', 'Pages Read')}</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {fmtDigits(g.loggedPages)} / {fmtDigits(g.targetPages)} ({fmtNum(g.pagesPercent, 0)}{tr('٪', '%')})
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-sky-600 dark:bg-sky-400 transition-all"
                                style={{ width: `${Math.min(100, g.pagesPercent)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {(g.targetExercises ?? 0) > 0 && (
                          <div>
                            <div className="flex justify-between mb-1 tabular-nums">
                              <span className="text-slate-600 dark:text-slate-300">{tr('تمرین و تکلیف', 'Exercises')}</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {fmtDigits(g.loggedExercises)} / {fmtDigits(g.targetExercises)} ({fmtNum(g.exercisesPercent, 0)}{tr('٪', '%')})
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all"
                                style={{ width: `${Math.min(100, g.exercisesPercent)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {g.personalPlan && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 leading-5">
                          <span className="font-semibold">{tr('برنامه شخصی:', 'Plan:')} </span>
                          {g.personalPlan}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditGoal(g)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={tr('ویرایش هدف', 'Edit Goal')}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteGoal(g.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title={tr('حذف هدف', 'Delete Goal')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {seasonActive && !isSuspendedStudent && (
                        <button
                          type="button"
                          onClick={() => openLogModalForGoal(g.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{tr('ثبت عملکرد برای این هدف', 'Log Session')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Teacher Encouragement Feedback */}
          {feedbacks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <MessageSquareHeart className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>{tr('بازخوردهای تشویقی معلمان', 'Teacher Coaching Feedback')}</span>
              </h3>
              <div className="space-y-2.5">
                {feedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/40 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{fb.teacherName}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {fmtDateTime(fb.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-6">{fb.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Performance Log History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
              <span>{tr('تاریخچه گزارش‌های روزانه مطالعه شما', 'Your Daily Study Log History')}</span>
            </h3>

            {logs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('هنوز عملکردی ثبت نکرده‌اید.', 'No daily study logs recorded yet.')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold text-start">{tr('تاریخ', 'Date')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('هدف / درس', 'Goal / Subject')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('ساعت', 'Hours')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('تست', 'Tests')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('صفحه / تمرین', 'Pages / Ex')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('امتیاز', 'Points')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('وضعیت', 'Status')}</th>
                      <th className="py-2.5 font-semibold text-end">{tr('عملیات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          <div>{fmtDate(l.date)}</div>
                          <div className="text-[10px] text-slate-400">{fmtDateTime(l.createdAt)}</div>
                        </td>
                        <td className="py-2.5">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{l.goalTitle}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {(l.subjectNames ?? []).join('، ')}
                            {l.notes ? ` · ${l.notes}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {fmtNum(l.hours, 1)}
                        </td>
                        <td className="py-2.5 tabular-nums text-slate-800 dark:text-slate-200">
                          {fmtDigits(l.testCount)}
                        </td>
                        <td className="py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                          {fmtDigits(l.pagesRead)} / {fmtDigits(l.exercisesDone)}
                        </td>
                        <td className="py-2.5 tabular-nums">
                          <span className="font-extrabold text-[#0F274A] dark:text-sky-400">
                            +{fmtNum(l.computedPoints, 1)}
                          </span>
                          {l.rawScoreBreakdown.cappedDelta > 0 && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400">
                              {tr('سقف روزانه اعمال شد', 'Daily cap applied')}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5">
                          {statusBadge(l.status)}
                          {l.flaggedReason && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 max-w-[180px]">
                              {l.flaggedReason}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 text-end">
                          <button
                            type="button"
                            onClick={() => void handleDeleteLog(l.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400"
                            title={tr('حذف گزارش', 'Delete log')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: LEADERBOARD ==================== */}
      {subTab === 'leaderboard' && (
        <div className="space-y-5">
          {/* Top 3 Quick Banner */}
          {leaderboard.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {leaderboard.slice(0, 3).map((e) => (
                <div
                  key={e.studentId}
                  className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${
                    e.rank === 1
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F274A] dark:text-sky-400">
                      <Crown className={`w-4 h-4 ${e.rank === 1 ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span>{tr('رتبه', 'Rank')} {fmtDigits(e.rank)}</span>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate mt-1">
                      {e.studentName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {e.className} · {fmtNum(e.totalHours, 1)} {tr('ساعت', 'h')} · {fmtDigits(e.totalTests)} {tr('تست', 'Q')}
                    </p>
                  </div>
                  <div className="text-end shrink-0 tabular-nums">
                    <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {fmtNum(lbPeriod === 'weekly' ? e.weeklyPoints : lbPeriod === 'monthly' ? e.monthlyPoints : e.totalPoints, 1)}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{tr('امتیاز', 'pts')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters & Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                {[
                  { id: 'monthly' as const, label: tr('ماهانه', 'Monthly') },
                  { id: 'weekly' as const, label: tr('هفتگی', 'Weekly') },
                  { id: 'all' as const, label: tr('کل فصل', 'Full Season') },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLbPeriod(p.id)}
                    className={`px-3 py-1.5 rounded-md font-semibold ${
                      lbPeriod === p.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <select
                value={lbClassId}
                onChange={(e) => setLbClassId(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                <option value="all">{tr('همه کلاس‌ها', 'All Classes')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={lbGradeLevel}
                onChange={(e) => setLbGradeLevel(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                <option value="all">{tr('همه پایه‌ها', 'All Grades')}</option>
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={lbSubjectId}
                onChange={(e) => setLbSubjectId(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                <option value="all">{tr('همه دروس', 'All Subjects')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={lbSearch}
                onChange={(e) => setLbSearch(e.target.value)}
                placeholder={tr('جستجوی دانش‌آموز...', 'Search student...')}
                className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => handleExportLeagueExcel('leaderboard')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>{tr('خروجی اکسل', 'Excel')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {!leaderboardLoaded ? (
              <div className="py-12 flex items-center justify-center">
                <CircularSpinner size="md" />
              </div>
            ) : filteredLeaderboard.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {tr(
                  'هنوز رتبه‌بندی با این فیلتر ثبت نشده است.',
                  'No leaderboard entries match the selected filters yet.'
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <th className="px-4 py-3 font-semibold text-start">{tr('رتبه', 'Rank')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('دانش‌آموز', 'Student')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('کلاس', 'Class')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('امتیاز', 'Points')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('تحقق هدف', 'Goal %')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('ساعت مطالعه', 'Hours')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('تست‌ها', 'Tests')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('تداوم', 'Streak')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('روند ۷ روزه', '7d Trend')}</th>
                      <th className="px-4 py-3 font-semibold text-start">{tr('نشان‌ها', 'Badges')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredLeaderboard.map((row) => {
                      const isMe = row.studentId === user.id;
                      const shownPts =
                        lbPeriod === 'weekly'
                          ? row.weeklyPoints
                          : lbPeriod === 'monthly'
                            ? row.monthlyPoints
                            : row.totalPoints;
                      const shownHrs =
                        lbPeriod === 'weekly'
                          ? row.weeklyHours
                          : lbPeriod === 'monthly'
                            ? row.monthlyHours
                            : row.totalHours;

                      return (
                        <tr
                          key={row.studentId}
                          className={
                            isMe
                              ? 'bg-sky-50/70 dark:bg-sky-950/30'
                              : row.suspended
                                ? 'opacity-60'
                                : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-slate-100">
                              <span>{fmtDigits(row.rank)}</span>
                              {row.rankDelta > 0 && (
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 inline-flex items-center">
                                  <TrendingUp className="w-3 h-3" />
                                  {fmtDigits(row.rankDelta)}
                                </span>
                              )}
                              {row.rankDelta < 0 && (
                                <span className="text-[10px] text-red-700 dark:text-red-400 inline-flex items-center">
                                  <TrendingDown className="w-3 h-3" />
                                  {fmtDigits(Math.abs(row.rankDelta))}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {row.studentName}
                              {isMe && (
                                <span className="ms-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                                  ({tr('شما', 'You')})
                                </span>
                              )}
                            </div>
                            {row.suspended && (
                              <span className="text-[10px] text-red-700 dark:text-red-400">
                                {tr('تعلیق موقت', 'Suspended')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.className}</td>
                          <td className="px-4 py-3 tabular-nums font-extrabold text-[#0F274A] dark:text-sky-400">
                            {fmtNum(shownPts, 1)}
                          </td>
                          <td className="px-4 py-3 tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                            {fmtNum(row.avgCompletionPercent, 0)}{tr('٪', '%')}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                            {fmtNum(shownHrs, 1)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                            {fmtDigits(row.totalTests)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                              <Flame className="w-3.5 h-3.5" />
                              {fmtDigits(row.streakDays)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Sparkline values={row.recentTrendPoints} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {row.badges.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                row.badges.slice(0, 3).map((b) => (
                                  <span
                                    key={b.id}
                                    title={lang === 'fa' ? b.titleFa : b.titleEn}
                                    className="p-1 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                                  >
                                    <BadgeIcon code={b.code} className="w-3.5 h-3.5" />
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: HALL OF FAME («برترینهای لیگ») ==================== */}
      {subTab === 'hall' && (
        <StudyLeagueHallOfFame
          hallOfFame={hallOfFame}
          season={config?.activeSeason}
          prizes={config?.prizes}
          loading={loading || !hallLoaded}
        />
      )}

      {/* ==================== TAB 4: ANALYTICS & COMPREHENSIVE REPORTS ==================== */}
      {subTab === 'analytics' && (
        <StudyLeagueAnalyticsPanel
          role={user.role}
          studentAnalytics={studentAnalytics}
          teacherAnalytics={teacherAnalytics}
          adminAnalytics={adminAnalytics}
          loading={loading || !analyticsLoaded}
          classes={classes}
          subjects={subjects}
          logs={logs}
          seasonTitle={config?.activeSeason.title}
          selectedClassId={teacherClassFilter}
          onChangeClassId={setTeacherClassFilter}
          onSendEncouragement={
            user.role !== 'student'
              ? (studentId) => {
                  setFbStudentId(studentId);
                  setFeedbackModalOpen(true);
                }
              : undefined
          }
          onJumpToReview={user.role !== 'student' ? () => setSubTab('teacher_hub') : undefined}
        />
      )}

      {/* ==================== TAB 5: TEACHER REVIEW, COACHING & SCOPED MONITORING ==================== */}
      {subTab === 'teacher_hub' && user.role !== 'student' && (
        <div className="space-y-6">
          {/* Teacher Filter + Quick Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={teacherClassFilter}
                onChange={(e) => setTeacherClassFilter(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                <option value="all">{tr('همه کلاس‌های مجاز', 'All Assigned Classes')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums inline-flex items-center gap-1.5">
                <span>{tr('گزارش‌های نیازمند تأیید:', 'Pending review:')}</span>
                {!logsLoaded ? <CircularSpinner size="xs" /> : <span>{fmtDigits(pendingLogs.length)}</span>}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const defaultStu =
                    teacherAnalytics?.studentProgressSeries[0]?.studentId || students[0]?.id || '';
                  setFbStudentId(defaultStu);
                  setFeedbackModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                <MessageSquareHeart className="w-4 h-4" />
                <span>{tr('ارسال پیام تشویقی به دانش‌آموز', 'Send Encouragement')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const defaultStu =
                    teacherAnalytics?.studentProgressSeries[0]?.studentId || students[0]?.id || '';
                  setAwardBadgeStudentId(defaultStu);
                  setAwardBadgeOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Award className="w-4 h-4 text-amber-600" />
                <span>{tr('اعطای نشان افتخار', 'Award Badge')}</span>
              </button>
            </div>
          </div>

          {/* Pending / Suspicious Logs Review Queue */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{tr('صف بررسی عملکردهای مشکوک یا در انتظار تأیید', 'Pending & Flagged Logs Review Queue')}</span>
            </h3>

            {pendingLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                {tr('در حال حاضر گزارشی در صف بررسی نیست.', 'No logs awaiting teacher approval.')}
              </p>
            ) : (
              <div className="space-y-3">
                {pendingLogs.map((l) => (
                  <div
                    key={l.id}
                    className="border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{l.studentName}</span>
                        <span className="text-slate-500 dark:text-slate-400">({l.className})</span>
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">{fmtDate(l.date)}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 tabular-nums">
                        {l.goalTitle} · {fmtNum(l.hours, 1)} {tr('ساعت مطالعه', 'hrs')} · {fmtDigits(l.testCount)}{' '}
                        {tr('تست', 'tests')} · {fmtDigits(l.pagesRead)} {tr('صفحه', 'pages')}
                      </p>
                      {l.flaggedReason && (
                        <p className="text-amber-800 dark:text-amber-300 font-semibold">{l.flaggedReason}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditLogModal(l)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold"
                      >
                        {tr('اصلاح مقادیر', 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewLog(l.id, 'rejected')}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        {tr('رد گزارش', 'Reject')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewLog(l.id, 'approved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
                      >
                        {tr('تأیید و ثبت امتیاز', 'Approve')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Class Student Goals & Progress Overview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {tr('اهداف مطالعاتی و عملکرد دانش‌آموزان', 'Student Study Goals & Completion')}
            </h3>
            {goals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('هنوز هدفی توسط دانش‌آموزان این کلاس‌ها ثبت نشده است.', 'No student study goals found in selected classes.')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold text-start">{tr('دانش‌آموز', 'Student')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('کلاس', 'Class')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('عنوان هدف', 'Goal')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('ساعت (واقعی/هدف)', 'Hours')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('تست (واقعی/هدف)', 'Tests')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('تحقق کل', 'Completion')}</th>
                      <th className="py-2.5 font-semibold text-end">{tr('بازخورد', 'Coach')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {goals
                      .filter((g) => teacherClassFilter === 'all' || g.classId === teacherClassFilter)
                      .map((g) => (
                        <tr key={g.id}>
                          <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{g.studentName}</td>
                          <td className="py-2.5 text-slate-600 dark:text-slate-300">{g.className}</td>
                          <td className="py-2.5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{g.title}</div>
                            <div className="text-[10px] text-slate-500">{(g.subjectNames ?? []).join('، ')}</div>
                          </td>
                          <td className="py-2.5 tabular-nums">
                            {fmtNum(g.loggedHours, 1)} / {fmtNum(g.targetHours, 1)}
                          </td>
                          <td className="py-2.5 tabular-nums">
                            {fmtDigits(g.loggedTests)} / {fmtDigits(g.targetTests)}
                          </td>
                          <td className="py-2.5 tabular-nums font-bold text-[#0F274A] dark:text-sky-400">
                            {fmtNum(g.overallPercent, 0)}{tr('٪', '%')}
                          </td>
                          <td className="py-2.5 text-end">
                            <button
                              type="button"
                              onClick={() => {
                                setFbStudentId(g.studentId);
                                setFeedbackModalOpen(true);
                              }}
                              className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                            >
                              {tr('ارسال بازخورد', 'Encourage')}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 6: PAST SEASON ARCHIVES ==================== */}
      {subTab === 'archives' && (
        <div className="space-y-4">
          {archives.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
              <Archive className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('هنوز دوره‌ای در آرشیو ثبت نشده است', 'No archived seasons yet')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {tr(
                  'پس از پایان یا شروع فصل جدید توسط مدیریت، برندگان و جدول رده‌بندی فصل قبلی در اینجا ذخیره می‌شود.',
                  'Completed seasons and their top winners are preserved here once closed.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {archives.map((arch) => (
                <div
                  key={arch.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{arch.seasonTitle}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {fmtDate(arch.startDate)} {tr('تا', '–')} {fmtDate(arch.endDate)} ·{' '}
                        {fmtDigits(arch.totalParticipants)} {tr('شرکت‌کننده', 'participants')} ·{' '}
                        {fmtNum(arch.totalHours, 1)} {tr('ساعت مطالعه', 'hrs')} ·{' '}
                        {fmtDigits(arch.totalTests)} {tr('تست', 'tests')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedArchive(arch)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {tr('مشاهده جدول کامل فصل', 'View Full Rankings')}
                    </button>
                  </div>

                  {arch.winners.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {arch.winners.map((w) => (
                        <div
                          key={w.studentId}
                          className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/40 text-xs"
                        >
                          <div className="flex justify-between font-bold">
                            <span className="text-amber-700 dark:text-amber-400">
                              {tr('رتبه', 'Rank')} {fmtDigits(w.rank)}
                            </span>
                            <span className="tabular-nums text-slate-900 dark:text-slate-100">
                              {fmtNum(w.totalPoints, 1)} {tr('امتیاز', 'pts')}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900 dark:text-slate-100 mt-1">{w.studentName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {w.className} · {fmtNum(w.totalHours, 1)} {tr('ساعت', 'h')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 7: ADMIN FULL CONTROL CENTER ==================== */}
      {subTab === 'admin_control' && user.role === 'admin' && config && (
        <div className="space-y-6">
          {/* Quick Season Lifecycle & Exports */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('کنترل چرخه لیگ و خروجی گزارش‌ها', 'League Lifecycle & Excel Exports')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr(
                  'شروع فصل جدید، توقف موقت، تمدید مهلت یا بایگانی برندگان دوره جاری',
                  'Start a new season, pause, extend deadline, or archive and close current season'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {config.activeSeason.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => void handleSeasonAction('pause')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>{tr('توقف موقت لیگ', 'Pause Season')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSeasonAction('resume')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>{tr('فعال‌سازی مجدد', 'Resume Season')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleSeasonAction('extend', { extendDays: 7 })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {tr('تمدید +۷ روز', 'Extend +7d')}
              </button>

              <button
                type="button"
                onClick={() => void handleSeasonAction('end')}
                className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                {tr('پایان فصل و ثبت برندگان', 'End & Archive')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setNsTitle('');
                  setNsPeriod('weekly');
                  setNsStart(todayIso());
                  setNsEnd(plusDaysIso(7));
                  setNsDesc('');
                  setNewSeasonModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('شروع فصل جدید', 'Start New Season')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportLeagueExcel('leaderboard')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>{tr('اکسل رتبه‌بندی', 'Export Ranks')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportLeagueExcel('logs')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                <span>{tr('اکسل عملکردها', 'Export Logs')}</span>
              </button>
            </div>
          </div>

          {/* Admin Configuration Form: Rules, Weights, Eligibility, Prizes */}
          <form
            onSubmit={handleSaveAdminConfig}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('تنظیمات قوانین، ضرایب امتیازدهی و جوایز لیگ', 'League Rules, Scoring Weights & Prizes')}
              </h3>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgEnabled}
                  onChange={(e) => setCfgEnabled(e.target.checked)}
                />
                <span>{tr('لیگ مطالعاتی فعال باشد', 'Study League Enabled')}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {tr('عنوان فصل جاری', 'Active Season Title')}
                </label>
                <input
                  type="text"
                  required
                  value={cfgSeasonTitle}
                  onChange={(e) => setCfgSeasonTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {tr('بازه فصل', 'Period Type')}
                </label>
                <select
                  value={cfgPeriodType}
                  onChange={(e) => setCfgPeriodType(e.target.value as StudyLeagueSeasonPeriod)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="daily">{tr('روزانه', 'Daily')}</option>
                  <option value="weekly">{tr('هفتگی', 'Weekly')}</option>
                  <option value="monthly">{tr('ماهانه', 'Monthly')}</option>
                  <option value="term">{tr('ترمی', 'Semester')}</option>
                  <option value="custom">{tr('سفارشی', 'Custom')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {tr('شروع', 'Start')}
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={cfgStartDate}
                    onChange={(e) => setCfgStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {tr('پایان', 'End')}
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={cfgEndDate}
                    onChange={(e) => setCfgEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Scoring Weights */}
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                {tr('ضرایب محاسبه امتیاز (محاسبه سمت سرور + بازمحاسبه خودکار)', 'Server Scoring Weights')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: tr('هر ساعت مطالعه', 'Per Hour'), val: cfgHoursW, set: setCfgHoursW, step: '0.5' },
                  { label: tr('هر تست', 'Per Test'), val: cfgTestsW, set: setCfgTestsW, step: '0.1' },
                  { label: tr('هر صفحه مطالعه', 'Per Page'), val: cfgPagesW, set: setCfgPagesW, step: '0.05' },
                  { label: tr('هر تمرین/تکلیف', 'Per Exercise'), val: cfgExW, set: setCfgExW, step: '0.25' },
                  { label: tr('پاداش تحقق هدف', 'Completion Bonus'), val: cfgBonusW, set: setCfgBonusW, step: '1' },
                  { label: tr('امتیاز استمرار روزانه', 'Streak Weight'), val: cfgStreakW, set: setCfgStreakW, step: '1' },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      step={f.step}
                      min="0"
                      dir="ltr"
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Anti-cheat & Approval Rules */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('سقف امتیاز مجاز روزانه', 'Daily Point Cap')}
                </label>
                <input
                  type="number"
                  min="20"
                  dir="ltr"
                  value={cfgDailyCap}
                  onChange={(e) => setCfgDailyCap(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('حداقل ٪ تحقق برای پاداش هدف', 'Min Goal % for Bonus')}
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  dir="ltr"
                  value={cfgMinCompBonus}
                  onChange={(e) => setCfgMinCompBonus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('آستانه ساعت مشکوک در روز', 'Suspicious Hours / Day')}
                </label>
                <input
                  type="number"
                  min="2"
                  max="24"
                  step="0.5"
                  dir="ltr"
                  value={cfgSuspHours}
                  onChange={(e) => setCfgSuspHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('آستانه تست مشکوک در روز', 'Suspicious Tests / Day')}
                </label>
                <input
                  type="number"
                  min="20"
                  dir="ltr"
                  value={cfgSuspTests}
                  onChange={(e) => setCfgSuspTests(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 text-xs text-slate-800 dark:text-slate-200">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgReqAbove}
                  onChange={(e) => setCfgReqAbove(e.target.checked)}
                />
                <span>{tr('گزارش‌های بالاتر از آستانه برای بررسی معلم ارسال شوند', 'Require teacher approval for flagged entries')}</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgReqAll}
                  onChange={(e) => setCfgReqAll(e.target.checked)}
                />
                <span>{tr('همه گزارش‌ها نیازمند تأیید دستی معلم باشند', 'Require manual teacher approval for all logs')}</span>
              </label>
            </div>

            {/* Allowed Classes & Subjects & Grades */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('پایه‌های مجاز (خالی = همه پایه‌ها)', 'Eligible Grades (empty = all)')}
                </p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {GRADE_LEVELS_FA.map((g) => (
                    <label key={g} className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={cfgEligibleGrades.includes(g)}
                        onChange={(e) =>
                          setCfgEligibleGrades((prev) =>
                            e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)
                          )
                        }
                      />
                      <span>{g}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('کلاس‌های شرکت‌کننده (خالی = همه کلاس‌ها)', 'Participating Classes (empty = all)')}
                </p>
                <div className="max-h-24 overflow-y-auto grid grid-cols-2 gap-1.5 text-xs">
                  {classes.map((c) => (
                    <label key={c.id} className="inline-flex items-center gap-1.5 truncate">
                      <input
                        type="checkbox"
                        checked={cfgAllowedClasses.includes(c.id)}
                        onChange={(e) =>
                          setCfgAllowedClasses((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                          )
                        }
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('دروس مجاز لیگ (خالی = همه دروس)', 'Allowed Subjects (empty = all)')}
                </p>
                <div className="max-h-24 overflow-y-auto grid grid-cols-2 gap-1.5 text-xs">
                  {subjects.map((s) => (
                    <label key={s.id} className="inline-flex items-center gap-1.5 truncate">
                      <input
                        type="checkbox"
                        checked={cfgAllowedSubjects.includes(s.id)}
                        onChange={(e) =>
                          setCfgAllowedSubjects((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                          )
                        }
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Prizes Management */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {tr('جوایز و امتیازات نفرات برتر', 'Season Rewards & Prizes')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCfgPrizes((prev) => [
                      ...prev,
                      {
                        id: `prz_${Date.now()}`,
                        rankFrom: prev.length + 1,
                        rankTo: prev.length + 1,
                        title: '',
                        rewardType: 'coins',
                        coinsAmount: 100,
                      },
                    ])
                  }
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  + {tr('افزودن جایزه', 'Add Prize')}
                </button>
              </div>
              <div className="space-y-2">
                {cfgPrizes.map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                    <input
                      type="number"
                      min="1"
                      dir="ltr"
                      value={p.rankFrom}
                      onChange={(e) =>
                        setCfgPrizes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, rankFrom: Number(e.target.value) || 1 } : x))
                        )
                      }
                      placeholder={tr('از رتبه', 'From')}
                      className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono"
                    />
                    <input
                      type="number"
                      min="1"
                      dir="ltr"
                      value={p.rankTo}
                      onChange={(e) =>
                        setCfgPrizes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, rankTo: Number(e.target.value) || 1 } : x))
                        )
                      }
                      placeholder={tr('تا رتبه', 'To')}
                      className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono"
                    />
                    <input
                      type="text"
                      value={p.title}
                      onChange={(e) =>
                        setCfgPrizes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                        )
                      }
                      placeholder={tr('عنوان جایزه یا نشان', 'Prize Title')}
                      className="sm:col-span-5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
                    />
                    <input
                      type="number"
                      min="0"
                      dir="ltr"
                      value={p.coinsAmount ?? 0}
                      onChange={(e) =>
                        setCfgPrizes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, coinsAmount: Number(e.target.value) || 0 } : x))
                        )
                      }
                      placeholder={tr('سکه', 'Coins')}
                      className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setCfgPrizes((prev) => prev.filter((_, i) => i !== idx))}
                      className="sm:col-span-1 p-1.5 text-slate-400 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-5 py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {savingConfig
                  ? tr('در حال ذخیره و بازمحاسبه...', 'Saving & Recalculating...')
                  : tr('ذخیره تنظیمات و بازمحاسبه امتیازها', 'Save Settings & Recalculate')}
              </button>
            </div>
          </form>

          {/* All Activity Logs Moderation Table with Edit History & Suspension */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('نظارت بر تمام گزارش‌های عملکرد و کنترل تخلفات', 'All League Activity & Integrity Moderation')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr(
                    'ویرایش یا حذف گزارش‌های نادرست با ثبت کامل تاریخچه تغییرات و امکان تعلیق موقت شرکت‌کنندگان',
                    'Edit or delete erroneous logs with full edit history, or suspend violating participants'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value as 'all' | StudyLogStatus | 'flagged')}
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5"
                >
                  <option value="all">{tr('همه وضعیت‌ها', 'All Logs')}</option>
                  <option value="pending_review">{tr('در انتظار بررسی', 'Pending Review')}</option>
                  <option value="flagged">{tr('دارای هشدار سیستمی', 'Flagged Only')}</option>
                  <option value="approved">{tr('تأییدشده', 'Approved')}</option>
                  <option value="rejected">{tr('ردشده', 'Rejected')}</option>
                </select>
              </div>
            </div>

            {moderatedLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('گزارشی با این فیلتر یافت نشد.', 'No activity logs match this filter.')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold text-start">{tr('تاریخ', 'Date')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('دانش‌آموز', 'Student')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('ساعت / تست', 'Hours / Tests')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('امتیاز', 'Pts')}</th>
                      <th className="py-2.5 font-semibold text-start">{tr('وضعیت', 'Status')}</th>
                      <th className="py-2.5 font-semibold text-end">{tr('اقدامات مدیر', 'Admin Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {moderatedLogs.slice(0, 60).map((l) => {
                      const isSusp = config.suspendedStudentIds.includes(l.studentId);
                      return (
                        <tr key={l.id}>
                          <td className="py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                            {fmtDate(l.date)}
                          </td>
                          <td className="py-2.5">
                            <p className="font-bold text-slate-900 dark:text-slate-100">{l.studentName}</p>
                            <p className="text-[10px] text-slate-500">{l.className} · {l.goalTitle}</p>
                          </td>
                          <td className="py-2.5 tabular-nums">
                            {fmtNum(l.hours, 1)} {tr('س', 'h')} · {fmtDigits(l.testCount)} {tr('تست', 'Q')}
                          </td>
                          <td className="py-2.5 tabular-nums font-bold text-[#0F274A] dark:text-sky-400">
                            {fmtNum(l.computedPoints, 1)}
                          </td>
                          <td className="py-2.5">
                            {statusBadge(l.status)}
                            {l.flaggedReason && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 max-w-[160px]">
                                {l.flaggedReason}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              {l.editHistory && l.editHistory.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryLogTarget(l)}
                                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  {tr('سابقه ویرایش', 'History')} ({fmtDigits(l.editHistory.length)})
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditLogModal(l)}
                                className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-400"
                                title={tr('ویرایش گزارش', 'Edit Log')}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleSuspend(l.studentId, isSusp)}
                                className={`p-1.5 rounded ${
                                  isSusp
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                                title={isSusp ? tr('رفع تعلیق دانش‌آموز', 'Unsuspend') : tr('تعلیق موقت دانش‌آموز', 'Suspend Student')}
                              >
                                <ShieldBan className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLog(l.id)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-700"
                                title={tr('حذف گزارش', 'Delete Log')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Suspended Students Manager */}
          {config.suspendedStudentIds.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>{tr('دانش‌آموزان تعلیق‌شده از لیگ', 'Suspended Participants')}</span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {config.suspendedStudentIds.map((sid) => {
                  const stu = students.find((s) => s.id === sid);
                  return (
                    <div
                      key={sid}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20 text-xs"
                    >
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {stu?.fullName ?? sid}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleToggleSuspend(sid, true)}
                        className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        {tr('رفع تعلیق', 'Restore')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Create/Edit Goal Modal */}
      <Modal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={editingGoal ? tr('ویرایش هدف مطالعاتی', 'Edit Study Goal') : tr('ایجاد هدف مطالعاتی و ورود به لیگ', 'Create Study Goal')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {tr('عنوان هدف (مثلاً آمادگی امتحان ریاضی)', 'Goal Title')}
            </label>
            <input
              type="text"
              required
              value={gTitle}
              onChange={(e) => setGTitle(e.target.value)}
              placeholder={tr('مثلاً: آمادگی آزمون جامع ریاضی و فیزیک', 'e.g. Math & Physics Exam Prep')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('انتخاب درس یا چند درس', 'Select Subject(s)')}
            </label>
            {allowedSubjectsForSelect.length === 0 ? (
              <p className="text-xs text-slate-500">{tr('درسی تعریف نشده است.', 'No subjects available.')}</p>
            ) : (
              <div className="max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {allowedSubjectsForSelect.map((sub) => (
                  <label key={sub.id} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gSubjectIds.includes(sub.id)}
                      onChange={(e) =>
                        setGSubjectIds((prev) =>
                          e.target.checked ? [...prev, sub.id] : prev.filter((id) => id !== sub.id)
                        )
                      }
                    />
                    <span className="truncate">{sub.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('بازه زمانی هدف', 'Timeframe')}
              </label>
              <select
                value={gTimeframe}
                onChange={(e) => {
                  const tf = e.target.value as StudyLeagueTimeframe;
                  setGTimeframe(tf);
                  if (!editingGoal) {
                    const baseMs = new Date(`${gStart || todayIso()}T00:00:00.000Z`).getTime();
                    const days = tf === 'daily' ? 0 : tf === 'weekly' ? 6 : 29;
                    if (!Number.isNaN(baseMs)) {
                      setGEnd(new Date(baseMs + days * 86400000).toISOString().slice(0, 10));
                    }
                    if (tf === 'daily') {
                      setGHours('3');
                      setGTests('40');
                      setGPages('15');
                      setGExercises('8');
                    } else if (tf === 'weekly') {
                      setGHours('18');
                      setGTests('250');
                      setGPages('80');
                      setGExercises('40');
                    } else {
                      setGHours('60');
                      setGTests('800');
                      setGPages('250');
                      setGExercises('120');
                    }
                  }
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="monthly">{tr('ماهانه', 'Monthly')}</option>
                <option value="weekly">{tr('هفتگی', 'Weekly')}</option>
                <option value="daily">{tr('روزانه', 'Daily')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تاریخ شروع', 'Start Date')}
              </label>
              <input
                type="date"
                required
                dir="ltr"
                value={gStart}
                onChange={(e) => setGStart(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تاریخ پایان', 'End Date')}
              </label>
              <input
                type="date"
                required
                dir="ltr"
                value={gEnd}
                onChange={(e) => setGEnd(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('ساعت مطالعه هدف *', 'Target Hours *')}
              </label>
              <input
                type="number"
                required
                min="0.5"
                max="500"
                step="0.5"
                dir="ltr"
                value={gHours}
                onChange={(e) => setGHours(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تعداد تست هدف', 'Target Tests')}
              </label>
              <input
                type="number"
                min="0"
                max="10000"
                dir="ltr"
                value={gTests}
                onChange={(e) => setGTests(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('صفحات مطالعه (اختیاری)', 'Pages (Opt)')}
              </label>
              <input
                type="number"
                min="0"
                dir="ltr"
                value={gPages}
                onChange={(e) => setGPages(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تکلیف/تمرین (اختیاری)', 'Exercises (Opt)')}
              </label>
              <input
                type="number"
                min="0"
                dir="ltr"
                value={gExercises}
                onChange={(e) => setGExercises(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {tr('توضیحات و برنامه شخصی (محرمانه برای شما)', 'Personal Study Plan & Notes')}
            </label>
            <textarea
              rows={3}
              value={gPlan}
              onChange={(e) => setGPlan(e.target.value)}
              placeholder={tr('مرور فصل ۱ تا ۳، حل تست‌های زمان‌دار و جمع‌بندی نکات...', 'Chapter review & timed test plan...')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingGoal}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingGoal ? tr('در حال ذخیره...', 'Saving...') : tr('ثبت هدف مطالعاتی', 'Save Goal')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Log Daily Performance Modal */}
      <Modal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        title={tr('ثبت عملکرد واقعی روزانه', 'Log Daily Study Performance')}
      >
        <form onSubmit={handleSaveLog} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('هدف مطالعاتی مرتبط', 'Target Goal')}
              </label>
              <select
                value={lGoalId}
                onChange={(e) => setLGoalId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({fmtNum(g.overallPercent, 0)}٪)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تاریخ مطالعه', 'Study Date')}
              </label>
              <input
                type="date"
                required
                dir="ltr"
                value={lDate}
                onChange={(e) => setLDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('ساعت مطالعه *', 'Hours *')}
              </label>
              <input
                type="number"
                required
                min="0.1"
                max="24"
                step="0.25"
                dir="ltr"
                value={lHours}
                onChange={(e) => setLHours(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تعداد تست', 'Tests')}
              </label>
              <input
                type="number"
                min="0"
                max="2000"
                dir="ltr"
                value={lTests}
                onChange={(e) => setLTests(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تعداد صفحه', 'Pages')}
              </label>
              <input
                type="number"
                min="0"
                max="2000"
                dir="ltr"
                value={lPages}
                onChange={(e) => setLPages(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tr('تمرین / تکلیف', 'Exercises')}
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                dir="ltr"
                value={lExercises}
                onChange={(e) => setLExercises(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono text-left"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {tr('یادداشت عملکرد (اختیاری و محرمانه)', 'Reflection Notes (Optional, Private)')}
            </label>
            <textarea
              rows={2}
              value={lNotes}
              onChange={(e) => setLNotes(e.target.value)}
              placeholder={tr('مباحث مطالعه‌شده یا نقاط نیازمند مرور...', 'Topics covered or areas to review...')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {tr(
              'امتیاز واقعی بر اساس درصد تحقق هدف، استمرار روزانه و سقف مجاز روزانه به‌صورت خودکار در سرور محاسبه می‌شود.',
              'Points are computed server-side from goal alignment, streak consistency, and daily cap.'
            )}
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLogModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingLog}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingLog ? tr('در حال ثبت...', 'Submitting...') : tr('ثبت عملکرد و محاسبه امتیاز', 'Submit Log')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Teacher/Admin Edit Log Modal */}
      <Modal
        open={Boolean(editLogTarget)}
        onClose={() => setEditLogTarget(null)}
        title={tr('اصلاح و بررسی گزارش عملکرد', 'Moderate & Edit Study Log')}
      >
        {editLogTarget && (
          <form onSubmit={handleSaveEditedLog} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tr('دانش‌آموز:', 'Student:')} <span className="font-bold">{editLogTarget.studentName}</span> ·{' '}
              {editLogTarget.goalTitle}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('ساعت', 'Hours')}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="24"
                  dir="ltr"
                  value={eHours}
                  onChange={(e) => setEHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('تست', 'Tests')}</label>
                <input
                  type="number"
                  min="0"
                  dir="ltr"
                  value={eTests}
                  onChange={(e) => setETests(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('صفحات', 'Pages')}</label>
                <input
                  type="number"
                  min="0"
                  dir="ltr"
                  value={ePages}
                  onChange={(e) => setEPages(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('تمرین', 'Exercises')}</label>
                <input
                  type="number"
                  min="0"
                  dir="ltr"
                  value={eExercises}
                  onChange={(e) => setEExercises(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('تاریخ', 'Date')}</label>
                <input
                  type="date"
                  dir="ltr"
                  value={eDate}
                  onChange={(e) => setEDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{tr('وضعیت', 'Status')}</label>
                <select
                  value={eStatus}
                  onChange={(e) => setEStatus(e.target.value as StudyLogStatus)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs"
                >
                  <option value="approved">{tr('تأییدشده', 'Approved')}</option>
                  <option value="pending_review">{tr('در انتظار بررسی', 'Pending Review')}</option>
                  <option value="rejected">{tr('ردشده', 'Rejected')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                {tr('علت ویرایش (ثبت در تاریخچه)', 'Edit Reason (Logged in Audit History)')}
              </label>
              <input
                type="text"
                required
                value={eReason}
                onChange={(e) => setEReason(e.target.value)}
                placeholder={tr('مثلاً اصلاح عدد اشتباه ثبت‌شده یا تأیید پس از بررسی', 'Reason for editing...')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditLogTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                {tr('انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={savingEditLog}
                className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingEditLog ? tr('در حال ذخیره...', 'Saving...') : tr('ذخیره اصلاح و بازمحاسبه', 'Save Edit')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Log Edit History Modal */}
      <Modal
        open={Boolean(historyLogTarget)}
        onClose={() => setHistoryLogTarget(null)}
        title={tr('تاریخچه ویرایش گزارش مطالعه', 'Study Log Edit History')}
      >
        {historyLogTarget && (
          <div className="space-y-3 text-xs">
            {(historyLogTarget.editHistory ?? []).map((h, i) => (
              <div
                key={i}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/40 space-y-1"
              >
                <div className="flex justify-between font-bold">
                  <span>{h.editedByName}</span>
                  <span className="tabular-nums text-slate-500">{fmtDateTime(h.editedAt)}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{h.reason}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {tr('قبل:', 'Before:')} {h.before.hours}h · {h.before.testCount}Q ({h.before.status}) ←{' '}
                  {tr('بعد:', 'After:')} {h.after.hours}h · {h.after.testCount}Q ({h.after.status})
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Teacher Send Feedback Modal */}
      <Modal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        title={tr('ارسال بازخورد و پیام تشویقی', 'Send Encouraging Feedback')}
      >
        <form onSubmit={handleSendFeedback} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('انتخاب دانش‌آموز', 'Student')}</label>
            <select
              required
              value={fbStudentId}
              onChange={(e) => setFbStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({classMap.get(s.classId ?? '')?.name ?? '—'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('محور تشویق', 'Encouragement Theme')}</label>
            <select
              value={fbTag}
              onChange={(e) => setFbTag(e.target.value as StudyFeedback['encouragementTag'])}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              <option value="great_effort">{tr('تلاش و پشتکار عالی', 'Great Effort')}</option>
              <option value="consistency">{tr('استمرار تحسین‌برانگیز', 'Outstanding Consistency')}</option>
              <option value="improvement">{tr('پیشرفت چشمگیر', 'Significant Improvement')}</option>
              <option value="keep_going">{tr('تشویق به ادامه مسیر', 'Keep Going')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('متن پیام', 'Message')}</label>
            <textarea
              rows={3}
              required
              value={fbMessage}
              onChange={(e) => setFbMessage(e.target.value)}
              placeholder={tr('آفرین بر استمرار و نظم مطالعاتی شما...', 'Great dedication on your study schedule...')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFeedbackModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingFeedback}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingFeedback ? tr('در حال ارسال...', 'Sending...') : tr('ارسال بازخورد', 'Send')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Award Badge Modal */}
      <Modal
        open={awardBadgeOpen}
        onClose={() => setAwardBadgeOpen(false)}
        title={tr('اعطای نشان افتخار لیگ مطالعاتی', 'Award League Badge')}
      >
        <form onSubmit={handleAwardBadge} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('دانش‌آموز', 'Student')}</label>
            <select
              required
              value={awardBadgeStudentId}
              onChange={(e) => setAwardBadgeStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('انتخاب نشان', 'Badge')}</label>
            <select
              value={awardBadgeCode}
              onChange={(e) => setAwardBadgeCode(e.target.value as StudyBadgeCode)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              {badgesCatalog.map((b) => (
                <option key={b.code} value={b.code}>
                  {lang === 'fa' ? b.titleFa : b.titleEn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('دلیل اعطا (اختیاری)', 'Reason (Optional)')}</label>
            <input
              type="text"
              value={awardBadgeReason}
              onChange={(e) => setAwardBadgeReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAwardBadgeOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold"
            >
              {tr('اعطای نشان', 'Award')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Start New Season Modal */}
      <Modal
        open={newSeasonModalOpen}
        onClose={() => setNewSeasonModalOpen(false)}
        title={tr('شروع فصل جدید لیگ مطالعاتی', 'Start New Study League Season')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSeasonAction('start_new', {
              title: nsTitle.trim(),
              periodType: nsPeriod,
              startDate: nsStart,
              endDate: nsEnd,
              description: nsDesc.trim(),
            });
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {tr(
              'با شروع فصل جدید، نتایج و برندگان فصل فعلی به‌صورت خودکار در آرشیو ذخیره شده و جدول رقابت فصل جدید آغاز می‌شود.',
              'Starting a new season automatically archives current season standings and winners.'
            )}
          </p>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('عنوان فصل جدید', 'New Season Title')}</label>
            <input
              type="text"
              required
              value={nsTitle}
              onChange={(e) => setNsTitle(e.target.value)}
              placeholder={tr('مثلاً: لیگ مطالعاتی دی‌ماه', 'e.g. Winter Study League')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('بازه', 'Period')}</label>
              <select
                value={nsPeriod}
                onChange={(e) => {
                  const p = e.target.value as StudyLeagueSeasonPeriod;
                  setNsPeriod(p);
                  const baseMs = new Date(`${nsStart || todayIso()}T00:00:00.000Z`).getTime();
                  const days = p === 'daily' ? 0 : p === 'weekly' ? 6 : p === 'monthly' ? 29 : p === 'term' ? 89 : 13;
                  if (!Number.isNaN(baseMs)) {
                    setNsEnd(new Date(baseMs + days * 86400000).toISOString().slice(0, 10));
                  }
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs"
              >
                <option value="monthly">{tr('ماهانه', 'Monthly')}</option>
                <option value="weekly">{tr('هفتگی', 'Weekly')}</option>
                <option value="daily">{tr('روزانه', 'Daily')}</option>
                <option value="term">{tr('ترمی', 'Semester')}</option>
                <option value="custom">{tr('سفارشی', 'Custom')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('شروع', 'Start')}</label>
              <input
                type="date"
                required
                dir="ltr"
                value={nsStart}
                onChange={(e) => setNsStart(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('پایان', 'End')}</label>
              <input
                type="date"
                required
                dir="ltr"
                value={nsEnd}
                onChange={(e) => setNsEnd(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('توضیحات فصل', 'Description')}</label>
            <input
              type="text"
              value={nsDesc}
              onChange={(e) => setNsDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewSeasonModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold"
            >
              {tr('آغاز فصل جدید', 'Start Season')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Notifications Drawer Modal */}
      <Modal
        open={notifsOpen}
        onClose={() => setNotifsOpen(false)}
        title={tr('اعلان‌های لیگ مطالعاتی', 'Study League Notifications')}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-3">
          {unreadNotifsCount > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleMarkAllNotifsRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{tr('علامت‌گذاری همه به‌عنوان خوانده‌شده', 'Mark all read')}</span>
              </button>
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              {tr('اعلانی ثبت نشده است.', 'No notifications yet.')}
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 text-xs ${
                    n.read
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      : 'border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{n.title}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                      {fmtDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-5">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Archive Full Ranking Modal */}
      <Modal
        open={Boolean(expandedArchive)}
        onClose={() => setExpandedArchive(null)}
        title={expandedArchive?.seasonTitle ?? tr('آرشیو رده‌بندی فصل', 'Archived Rankings')}
        maxWidthClass="max-w-2xl"
      >
        {expandedArchive && (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-start">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-start">{tr('رتبه', 'Rank')}</th>
                  <th className="py-2 text-start">{tr('نام دانش‌آموز', 'Student')}</th>
                  <th className="py-2 text-start">{tr('کلاس', 'Class')}</th>
                  <th className="py-2 text-start">{tr('امتیاز کل', 'Points')}</th>
                  <th className="py-2 text-start">{tr('ساعت', 'Hours')}</th>
                  <th className="py-2 text-start">{tr('تست', 'Tests')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expandedArchive.rankings.map((r) => (
                  <tr key={r.studentId}>
                    <td className="py-2 font-bold tabular-nums">{fmtDigits(r.rank)}</td>
                    <td className="py-2 font-semibold">{r.studentName}</td>
                    <td className="py-2 text-slate-500">{r.className}</td>
                    <td className="py-2 font-bold tabular-nums text-[#0F274A] dark:text-sky-400">
                      {fmtNum(r.totalPoints, 1)}
                    </td>
                    <td className="py-2 tabular-nums">{fmtNum(r.totalHours, 1)}</td>
                    <td className="py-2 tabular-nums">{fmtDigits(r.totalTests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
