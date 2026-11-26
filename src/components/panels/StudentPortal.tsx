import {
  Award,
  BookOpen,
  BookOpenCheck,
  Bot,
  Calendar,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Coins,
  Crown,
  FileQuestion,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  Mail,
  Medal,
  Megaphone,
  Paperclip,
  Printer,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  AcademicHistoryRecord,
  Announcement,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  CalendarEvent,
  ChatThreadSummary,
  DirectMessage,
  GradeRecord,
  ScheduleSlot,
  SchoolClass,
  SchoolSettings,
  StudyPlanTask,
  Subject,
  UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { AIAssistantView } from '../ai/AIAssistantView';
import { PrivateTutorView } from '../ai/PrivateTutorView';
import { AcademicCalendarView } from '../education/AcademicCalendarView';
import { AdvancedReportCardView } from '../education/AdvancedReportCardView';
import { DigitalLibraryView } from '../education/DigitalLibraryView';
import { HonorsView } from '../education/HonorsView';
import { OnlineExamsView, type EnrichedExam } from '../education/OnlineExamsView';
import { DashboardPromoCarousel } from '../education/DashboardPromoCarousel';
import { StudyLeagueView } from '../education/StudyLeagueView';
import { StudyPlannerView } from '../education/StudyPlannerView';
import { AppShell, type NavItem } from '../layout/AppShell';
import { AnnouncementsView, MessagesView, ProfileView } from '../shared/AccountAndComms';
import { AttendanceBreakdownChart, HorizontalBarChart, LineTrendChart } from '../ui/Charts';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { CircularSpinner, StatCard } from '../ui/StatCard';
import { useToast } from '../ui/Toast';

interface EnrichedStudentAssignment extends Assignment {
  mySubmission: AssignmentSubmission | null;
}

interface StudentOverview {
  gpa: number;
  currentTermGpa: number;
  gradesCount: number;
  subjectsCount: number;
  academicProgress: number;
  classRank: { rank: number; total: number } | null;
  attendanceStats: { total: number; present: number; absent: number; late: number; excused: number };
  pendingAssignments: number;
  submittedAssignments: number;
  totalAssignments: number;
  assignmentBreakdown?: { pending: number; submitted: number; graded: number; late: number };
  activeExamsCount: number;
  completedExamsCount: number;
  examStats?: {
    availableCount: number;
    completedCount: number;
    avgPercent: number;
    recentAttempts: Array<{
      id: string;
      examTitle: string;
      subjectName: string;
      score: number;
      maxScore: number;
      percent: number;
      submittedAt: string;
    }>;
  };
  studyStats?: {
    totalTasks: number;
    completedTasks: number;
    totalMinutes: number;
    completedMinutes: number;
  };
  recentGrades?: Array<{
    id: string;
    title: string;
    subjectName: string;
    term: string;
    score: number;
    maxScore: number;
    normalized: number;
    date: string;
  }>;
  upcomingEvents?: CalendarEvent[];
  historiesCount?: number;
  latestHistory?: AcademicHistoryRecord | null;
  subjectChart: Array<{ label: string; value: number }>;
  termTrend: Array<{ label: string; value: number; count?: number }>;
  coins: number;
}

export function StudentPortal({
  user,
  settings,
  onUserUpdated,
  onLogout,
}: {
  user: UserAccount;
  settings: SchoolSettings | null;
  onUserUpdated: (u: UserAccount) => void;
  onLogout: () => void;
}) {
  const {
    tr,
    fmtNum,
    fmtDigits,
    fmtDate,
    termLabel,
    weekdayLabel,
    attendanceLabel,
    submissionLabel,
    schoolTitle,
  } = useI18n();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [histories, setHistories] = useState<AcademicHistoryRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assignments, setAssignments] = useState<EnrichedStudentAssignment[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [exams, setExams] = useState<EnrichedExam[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlanTask[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [historiesLoaded, setHistoriesLoaded] = useState(false);

  const [termFilter, setTermFilter] = useState<string>('all');
  const [submitModalAsg, setSubmitModalAsg] = useState<EnrichedStudentAssignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [submittingAsg, setSubmittingAsg] = useState(false);

  const userRef = useRef(user);
  userRef.current = user;

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiRequest<StudentOverview>('/api/reports/overview'),
        apiRequest<{ classes: SchoolClass[] }>('/api/classes'),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
        apiRequest<{ teachers: Array<{ id: string; fullName: string; role: string }> }>('/api/directory/teachers'),
        apiRequest<{ grades: GradeRecord[] }>('/api/grades', { silentError: true }),
        apiRequest<{ histories: AcademicHistoryRecord[] }>('/api/history'),
        apiRequest<{ attendance: AttendanceRecord[] }>('/api/attendance', { silentError: true }),
        apiRequest<{ assignments: EnrichedStudentAssignment[] }>('/api/assignments'),
        apiRequest<{ schedules: ScheduleSlot[] }>('/api/schedules'),
        apiRequest<{ announcements: Announcement[] }>('/api/announcements'),
        apiRequest<{ messages: DirectMessage[] }>('/api/messages'),
        apiRequest<{ exams: EnrichedExam[] }>('/api/exams'),
        apiRequest<{ plans: StudyPlanTask[] }>('/api/study-plans'),
        apiRequest<{ events: CalendarEvent[] }>('/api/calendar-events'),
        apiRequest<{ threads: ChatThreadSummary[] }>('/api/chat/threads'),
      ]);

      const [ov, cls, sub, tch, grd, his, att, asg, sch, ann, msg, exm, stp, cal, chatTh] = results;
      if (ov.status === 'fulfilled') {
        setOverview(ov.value);
        const curUser = userRef.current;
        if (ov.value.coins !== undefined && ov.value.coins !== (curUser.coins ?? 0)) {
          onUserUpdated({ ...curUser, coins: ov.value.coins });
        }
      } else {
        showToast(
          ov.reason instanceof Error
            ? ov.reason.message
            : tr('خطا در بارگذاری اطلاعات پنل دانش‌آموز', 'Failed to load student dashboard'),
          'error'
        );
      }
      if (cls.status === 'fulfilled') setClasses(cls.value.classes ?? []);
      if (sub.status === 'fulfilled') setSubjects(sub.value.subjects ?? []);
      if (tch.status === 'fulfilled') setTeachers(tch.value.teachers ?? []);
      if (grd.status === 'fulfilled') setGrades(grd.value.grades ?? []);
      if (his.status === 'fulfilled') {
        setHistories(his.value.histories ?? []);
        setHistoriesLoaded(true);
      }
      if (att.status === 'fulfilled') setAttendance(att.value.attendance ?? []);
      if (asg.status === 'fulfilled') setAssignments(asg.value.assignments ?? []);
      if (sch.status === 'fulfilled') setSchedules(sch.value.schedules ?? []);
      if (ann.status === 'fulfilled') setAnnouncements(ann.value.announcements ?? []);
      if (msg.status === 'fulfilled') {
        setMessages(msg.value.messages ?? []);
        setMessagesLoaded(true);
      }
      if (exm.status === 'fulfilled') setExams(exm.value.exams ?? []);
      if (stp.status === 'fulfilled') setStudyPlans(stp.value.plans ?? []);
      if (cal.status === 'fulfilled') setCalendarEvents(cal.value.events ?? []);
      if (chatTh.status === 'fulfilled') {
        setChatUnreadCount((chatTh.value.threads ?? []).reduce((sum, th) => sum + th.unreadCount, 0));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در بارگذاری اطلاعات پنل دانش‌آموز', 'Failed to load student dashboard'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr, onUserUpdated]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.fullName])), [teachers]);
  const myClass = classes[0];

  const unreadMessages = useMemo(
    () => messages.filter((m) => m.senderId !== user.id && !m.readBy.includes(user.id)),
    [messages, user.id]
  );

  // Today's weekday index in Persian school week (0 = Sat ... 5 = Thu, 6 = Fri)
  const todaySchoolDayIdx = (new Date().getDay() + 1) % 7;
  const todaysSlots = useMemo(
    () => schedules.filter((s) => s.dayOfWeek === todaySchoolDayIdx),
    [schedules, todaySchoolDayIdx]
  );

  const strengthSubjects = useMemo(() => {
    const list = [...(overview?.subjectChart ?? [])].sort((a, b) => b.value - a.value);
    return {
      strong: list.slice(0, 3),
      needsPractice: [...list].reverse().filter((s) => s.value < 17).slice(0, 3),
    };
  }, [overview?.subjectChart]);

  const hasPerm = (perm: string) => !Array.isArray(user.permissions) || user.permissions.includes(perm);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: tr('داشبورد دانش‌آموز', 'Student Dashboard'), icon: LayoutDashboard, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
    ...(hasPerm('use_ai_student')
      ? [
          { id: 'ai', label: tr('هوش مصنوعی', 'AI Tutor'), icon: Bot, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
          { id: 'private_tutor', label: tr('معلم خصوصی', 'Private Tutor'), icon: GraduationCap, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
        ]
      : []),
    ...(hasPerm('view_own_grades')
      ? [
          { id: 'grades', label: tr('نمرات و کارنامه', 'Grades & Report Card'), icon: Award, section: tr('امور آموزشی', 'Academics') },
          { id: 'report_card', label: tr('چاپ کارنامه پیشرفته', 'Advanced Report Card'), icon: Printer, section: tr('امور آموزشی', 'Academics') },
        ]
      : []),
    { id: 'exams', label: tr('آزمون‌های آنلاین', 'Online Exams'), icon: FileQuestion, badge: overview?.activeExamsCount, section: tr('امور آموزشی', 'Academics') },
    ...(hasPerm('view_own_assignments')
      ? [{ id: 'assignments', label: tr('تکالیف درسی', 'Assignments'), icon: ClipboardList, badge: overview?.pendingAssignments, section: tr('امور آموزشی', 'Academics') }]
      : []),
    ...(hasPerm('view_own_attendance')
      ? [{ id: 'attendance', label: tr('حضور و غیاب', 'Attendance'), icon: CheckSquare, section: tr('امور آموزشی', 'Academics') }]
      : []),
    ...(hasPerm('view_own_schedule')
      ? [{ id: 'schedule', label: tr('برنامه هفتگی', 'Weekly Schedule'), icon: Calendar, section: tr('امور آموزشی', 'Academics') }]
      : []),
    { id: 'calendar', label: tr('تقویم آموزشی', 'Academic Calendar'), icon: CalendarDays, section: tr('امور آموزشی', 'Academics') },
    { id: 'planner', label: tr('برنامه‌ریز هوشمند', 'Smart Planner'), icon: BookOpenCheck, section: tr('امور آموزشی', 'Academics') },
    { id: 'league', label: tr('لیگ مطالعاتی', 'Study League'), icon: Trophy, accent: true, section: tr('امور آموزشی', 'Academics') },
    { id: 'league_hall', label: tr('برترینهای لیگ', 'League Hall of Fame'), icon: Crown, section: tr('امور آموزشی', 'Academics') },
    { id: 'library', label: tr('کتابخانه دیجیتال', 'Digital Library'), icon: BookOpen, section: tr('امور آموزشی', 'Academics') },
    { id: 'honors', label: tr('پرونده افتخارات', 'Honors File'), icon: Medal, section: tr('امور آموزشی', 'Academics') },
    { id: 'history', label: tr('سوابق تحصیلی', 'Academic History'), icon: History, section: tr('امور آموزشی', 'Academics') },
    ...(hasPerm('view_announcements')
      ? [{ id: 'announcements', label: tr('اطلاعیه‌های مدرسه', 'Announcements'), icon: Megaphone, section: tr('ارتباطات و حساب', 'Comms & Account') }]
      : []),
    { id: 'messages', label: tr('چت و پیام‌ها', 'Chat & Messages'), icon: Mail, badge: messagesLoaded ? unreadMessages.length + chatUnreadCount : undefined, section: tr('ارتباطات و حساب', 'Comms & Account') },
    { id: 'profile', label: tr('اطلاعات کاربری', 'Profile & Requests'), icon: User, section: tr('ارتباطات و حساب', 'Comms & Account') },
  ];

  // Weighted GPA & Report card calculation per subject
  const filteredGrades = useMemo(
    () => grades.filter((g) => termFilter === 'all' || g.term === termFilter),
    [grades, termFilter]
  );

  const reportCardRows = useMemo(() => {
    const map = new Map<string, { subject: Subject | undefined; fallbackName?: string; scores: number[] }>();
    for (const g of filteredGrades) {
      const key = g.subjectId || g.subjectName || 'عمومی';
      const entry = map.get(key) ?? {
        subject: subjectMap.get(g.subjectId),
        fallbackName: g.subjectName || g.subjectId,
        scores: [],
      };
      const max = g.maxScore > 0 ? g.maxScore : 20;
      entry.scores.push((g.score / max) * 20);
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([subjectId, data]) => {
      const average =
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0;
      const coeff = data.subject?.coefficient ?? 1;
      return {
        subjectId,
        name: data.subject?.name ?? data.fallbackName ?? tr('درس', 'Subject'),
        code: data.subject?.code ?? '—',
        coefficient: coeff,
        count: data.scores.length,
        average: Number(average.toFixed(2)),
        weighted: Number((average * coeff).toFixed(2)),
      };
    });
  }, [filteredGrades, subjectMap, tr]);

  const weightedGpa = useMemo(() => {
    if (reportCardRows.length === 0) return 0;
    const totalCoeff = reportCardRows.reduce((s, r) => s + r.coefficient, 0);
    const totalWeighted = reportCardRows.reduce((s, r) => s + r.weighted, 0);
    return totalCoeff > 0 ? Number((totalWeighted / totalCoeff).toFixed(2)) : 0;
  }, [reportCardRows]);

  const handleAssignmentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!submitModalAsg) return;
    setSubmittingAsg(true);
    try {
      await apiRequest(`/api/assignments/${submitModalAsg.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          submittedText: submissionText,
          attachmentName: attachmentName.trim() || undefined,
          attachmentUrl: attachmentUrl.trim() || undefined,
        }),
      });
      setSubmitModalAsg(null);
      setSubmissionText('');
      setAttachmentName('');
      setAttachmentUrl('');
      await loadAll();
      showToast(tr('پاسخ تکلیف با موفقیت ثبت شد.', 'Assignment submission saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ارسال تکلیف', 'Submission failed'), 'error');
    } finally {
      setSubmittingAsg(false);
    }
  };

  const gradeColumns: ColumnDef<GradeRecord>[] = [
    {
      key: 'subject',
      header: tr('درس', 'Subject'),
      sortValue: (r) => subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? r.subjectId ?? '',
      render: (r) => (
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? (r.subjectId || '—')}
        </span>
      ),
    },
    {
      key: 'title',
      header: tr('عنوان ارزشیابی', 'Assessment'),
      sortValue: (r) => r.title ?? '',
      render: (r) => r.title || '—',
    },
    {
      key: 'term',
      header: tr('نوبت', 'Term'),
      sortValue: (r) => r.term ?? '',
      render: (r) => termLabel(r.term),
    },
    {
      key: 'date',
      header: tr('تاریخ', 'Date'),
      sortValue: (r) => r.date ?? '',
      render: (r) => <span className="tabular-nums text-slate-600 dark:text-slate-400">{fmtDate(r.date)}</span>,
    },
    {
      key: 'score',
      header: tr('نمره', 'Score'),
      sortValue: (r) => r.score,
      render: (r) => {
        const max = r.maxScore > 0 ? r.maxScore : 20;
        const normalized = (r.score / max) * 20;
        const pass = normalized >= (settings?.passingScore ?? 10);
        return (
          <span className={`font-bold tabular-nums ${pass ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {fmtNum(r.score)} {tr('از', '/')} {fmtDigits(max)}
          </span>
        );
      },
    },
    {
      key: 'note',
      header: tr('توضیحات معلم', 'Teacher Note'),
      render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.note || '—'}</span>,
    },
  ];

  const attendanceColumns: ColumnDef<AttendanceRecord>[] = [
    {
      key: 'date',
      header: tr('تاریخ', 'Date'),
      sortValue: (r) => r.date ?? '',
      render: (r) => <span className="font-medium tabular-nums">{fmtDate(r.date)}</span>,
    },
    {
      key: 'subject',
      header: tr('درس', 'Subject'),
      render: (r) =>
        r.subjectId
          ? subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? r.subjectId
          : r.subjectName ?? tr('حضور روزانه', 'Daily Roll Call'),
    },
    {
      key: 'status',
      header: tr('وضعیت', 'Status'),
      sortValue: (r) => r.status,
      render: (r) => {
        const cls =
          r.status === 'present'
            ? 'text-emerald-700 dark:text-emerald-400'
            : r.status === 'absent'
            ? 'text-red-700 dark:text-red-400'
            : r.status === 'late'
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-slate-600 dark:text-slate-300';
        return <span className={`font-semibold text-xs ${cls}`}>{attendanceLabel(r.status)}</span>;
      },
    },
    {
      key: 'note',
      header: tr('توضیحات', 'Note'),
      render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.note || '—'}</span>,
    },
  ];

  const safeAttStats = overview?.attendanceStats ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 };

  return (
    <AppShell
      user={user}
      settings={settings}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={onLogout}
      announcements={announcements}
      unreadMessages={unreadMessages}
      onNavigateNotifications={() => setActiveTab('messages')}
    >
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Student Overview Header */}
          <div className="bg-white dark:bg-slate-900 bg-arch-grid border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {`${tr('پایه', 'Grade')} ${user.gradeLevel || tr('ثبت‌نشده', 'Unassigned')} · ${tr('کلاس', 'Class')} ${myClass?.name || tr('تخصیص‌نیافته', 'Unassigned')} · ${tr('سال تحصیلی', 'Academic Year')} ${fmtDigits(settings?.academicYear ?? '1404-1405')}`}
              </p>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {tr('خوش آمدید،', 'Welcome,')} {user.fullName}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('grades')}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Award className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                <span>{tr('مشاهده کارنامه', 'Report Card')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('exams')}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <FileQuestion className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                <span>{tr('آزمون‌های آنلاین', 'Online Exams')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('planner')}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <BookOpenCheck className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                <span>{tr('برنامه‌ریز مطالعه', 'Study Planner')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 shadow-sm transition-colors"
              >
                <Bot className="w-4 h-4" />
                <span>{tr('دستیار هوشمند درسی', 'AI Study Assistant')}</span>
              </button>
            </div>
          </div>

          {/* Primary KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label={tr('معدل کل و نوبت جاری', 'Overall & Current Term GPA')}
              value={overview && overview.gradesCount > 0 ? fmtNum(overview.gpa) : '—'}
              subtitle={
                overview && overview.currentTermGpa > 0
                  ? `${tr('نوبت جاری:', 'Current term:')} ${fmtNum(overview.currentTermGpa)} · ${fmtDigits(overview.gradesCount)} ${tr('نمره', 'grades')}`
                  : `${fmtDigits(overview?.gradesCount ?? 0)} ${tr('نمره ثبت‌شده', 'grades recorded')}`
              }
              icon={Award}
              loading={!overview}
            />
            <StatCard
              label={tr('نرخ حضور در کلاس', 'Attendance Rate')}
              value={
                safeAttStats.total > 0
                  ? `${fmtNum((safeAttStats.present / safeAttStats.total) * 100, 1)}${tr('٪', '%')}`
                  : '—'
              }
              subtitle={`${fmtDigits(safeAttStats.absent)} ${tr('غیبت', 'absences')} · ${fmtDigits(safeAttStats.late)} ${tr('تأخیر', 'late')}`}
              icon={CheckSquare}
              loading={!overview}
            />
            <StatCard
              label={tr('تکالیف و آزمون‌ها', 'Assignments & Exams')}
              value={fmtDigits(overview?.pendingAssignments ?? 0)}
              subtitle={`${tr('تکلیف در انتظار', 'pending')} · ${fmtDigits(overview?.activeExamsCount ?? 0)} ${tr('آزمون فعال', 'active exams')}`}
              icon={ClipboardList}
              loading={!overview}
            />
            <StatCard
              label={overview?.classRank ? tr('رتبه کلاسی و سکه', 'Class Rank & Coins') : tr('پیشرفت و سکه آموزشی', 'Progress & Study Coins')}
              value={
                overview?.classRank
                  ? `${fmtDigits(overview.classRank.rank)} ${tr('از', 'of')} ${fmtDigits(overview.classRank.total)}`
                  : `${fmtDigits(overview?.academicProgress ?? 0)}${tr('٪', '%')}`
              }
              subtitle={`${tr('سکه:', 'Coins:')} ${fmtDigits(overview?.coins ?? user.coins ?? 0)} · ${fmtDigits(unreadMessages.length)} ${tr('پیام جدید', 'unread')}`}
              icon={overview?.classRank ? Trophy : Coins}
              loading={!overview}
              subtitleLoading={!overview || !messagesLoaded}
            />
          </div>

          {/* Featured Platform Promo Carousel */}
          <DashboardPromoCarousel
            role="student"
            onNavigate={(tab) => setActiveTab(tab)}
          />

          {/* Analytics & Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <LineTrendChart
              title={tr('روند پیشرفت نمرات در نوبت‌های تحصیلی', 'Grade Progression Across Terms')}
              subtitle={tr('میانگین واقعی نمرات ثبت‌شده در هر نوبت', 'Real average across recorded academic terms')}
              loading={!overview}
              data={
                (overview?.termTrend ?? []).map((t) => ({
                  label: termLabel(t.label),
                  value: t.value,
                  count: t.count,
                }))
              }
            />
            <HorizontalBarChart
              title={tr('وضعیت تحصیلی به تفکیک دروس', 'Subject Performance Breakdown')}
              subtitle={tr('میانگین نمرات ثبت‌شده در مقیاس ۲۰', 'Average grades out of 20')}
              loading={!overview}
              data={overview?.subjectChart ?? []}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AttendanceBreakdownChart
              title={tr('خلاصه وضعیت حضور و غیاب', 'Attendance Breakdown')}
              loading={!overview}
              stats={safeAttStats}
            />

            {/* Strengths vs Needs Practice */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('نقاط قوت و دروس نیازمند تمرین بیشتر', 'Strengths & Focus Areas')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('تحلیل مستقیم بر اساس نمرات واقعی شما', 'Computed directly from your recorded grades')}
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
              </div>

              {!overview ? (
                <div className="py-10 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  <CircularSpinner size="md" />
                </div>
              ) : (overview.subjectChart?.length ?? 0) === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  {tr('پس از ثبت نمرات دروس، نقاط قوت و نیاز به تمرین شما تحلیل می‌شود.', 'Once subject grades are recorded, strengths and focus areas appear here.')}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">
                      {tr('دروس برتر شما', 'Top Subjects')}
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {strengthSubjects.strong.map((s) => (
                        <div key={s.label} className="flex items-center justify-between gap-2">
                          <span className="text-slate-700 dark:text-slate-200 truncate">{s.label}</span>
                          <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {fmtNum(s.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">
                      {tr('نیازمند تمرکز بیشتر', 'Needs More Practice')}
                    </p>
                    {strengthSubjects.needsPractice.length === 0 ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {tr('همه دروس شما بالای ۱۷ هستند.', 'All recorded subjects are 17 or higher.')}
                      </p>
                    ) : (
                      <div className="space-y-1.5 text-xs">
                        {strengthSubjects.needsPractice.map((s) => (
                          <div key={s.label} className="flex items-center justify-between gap-2">
                            <span className="text-slate-700 dark:text-slate-200 truncate">{s.label}</span>
                            <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                              {fmtNum(s.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Today's Classes, Recent Assignments, Recent Grades, Announcements */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Today's Classes */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('برنامه کلاس‌های امروز', "Today's Schedule")}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('برنامه کامل', 'Full Week')}
                </button>
              </div>
              {todaysSlots.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {todaySchoolDayIdx === 6
                    ? tr('امروز جمعه است و کلاس درسی ثبت نشده است.', 'Today is Friday — no scheduled classes.')
                    : tr('برنامه‌ای برای امروز ثبت نشده است.', 'No classes scheduled for today.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {todaysSlots.map((slot) => (
                    <div key={slot.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                          {subjectMap.get(slot.subjectId)?.name ?? tr('درس', 'Subject')}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {teacherMap.get(slot.teacherId) ?? '—'}
                        </p>
                      </div>
                      <span className="tabular-nums text-[11px] font-semibold text-[#0F274A] dark:text-sky-300 shrink-0">
                        {fmtDigits(slot.startTime)}–{fmtDigits(slot.endTime)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Assignments & Exams */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('تکالیف و آزمون‌های پیش‌رو', 'Upcoming Assignments & Exams')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('assignments')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('مشاهده همه', 'View All')}
                </button>
              </div>
              {assignments.length === 0 && exams.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('تکلیف یا آزمون فعالی ثبت نشده است.', 'No active assignments or exams yet.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exams.slice(0, 2).map((ex) => (
                    <div key={ex.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{ex.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tr('آزمون آنلاین', 'Online Exam')} · {fmtDate(ex.dueDate)}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 shrink-0">
                        {ex.myAttempt ? tr('انجام شده', 'Completed') : tr('آماده شرکت', 'Available')}
                      </span>
                    </div>
                  ))}
                  {assignments.slice(0, 3).map((a) => (
                    <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{a.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {subjectMap.get(a.subjectId)?.name ?? a.subjectName ?? tr('درس', 'Subject')} · {fmtDate(a.dueDate)}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 shrink-0">
                        {submissionLabel(a.mySubmission?.status ?? 'pending')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latest Announcements */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('آخرین اطلاعیه‌های مدرسه', 'Latest Announcements')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('announcements')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('مشاهده همه', 'View All')}
                </button>
              </div>
              {announcements.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('اطلاعیه‌ای منتشر نشده است.', 'No announcements published yet.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {announcements.slice(0, 4).map((ann) => (
                    <div key={ann.id} className="py-2.5">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{ann.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{ann.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comprehensive Student Reports: Assignments, Exams, Study Planner */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Assignment Breakdown Report */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش وضعیت تکالیف درسی', 'Assignment Status Report')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums inline-flex items-center gap-1.5">
                    <span>{tr('مجموع تکالیف کلاس:', 'Total class assignments:')}</span>
                    {!overview ? <CircularSpinner size="xs" /> : <span>{fmtDigits(overview.totalAssignments ?? 0)}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('assignments')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('مدیریت تکالیف', 'Assignments')}
                </button>
              </div>
              {(() => {
                if (!overview) {
                  return (
                    <div className="py-10 flex items-center justify-center">
                      <CircularSpinner size="md" />
                    </div>
                  );
                }
                const b = overview.assignmentBreakdown ?? {
                  pending: overview.pendingAssignments ?? 0,
                  submitted: overview.submittedAssignments ?? 0,
                  graded: 0,
                  late: 0,
                };
                const total = Math.max(1, overview.totalAssignments ?? 0);
                const doneCount = (overview.submittedAssignments ?? 0);
                const completionPct = (overview.totalAssignments ?? 0) > 0 ? Math.round((doneCount / total) * 100) : 0;
                const rows = [
                  { label: tr('نمره‌گذاری‌شده', 'Graded'), val: b.graded, cls: 'text-emerald-700 dark:text-emerald-400' },
                  { label: tr('ارسال‌شده (در انتظار نمره)', 'Submitted'), val: b.submitted, cls: 'text-sky-700 dark:text-sky-400' },
                  { label: tr('در انتظار انجام', 'Pending'), val: b.pending, cls: 'text-amber-700 dark:text-amber-400' },
                  { label: tr('تحویل با تأخیر', 'Late'), val: b.late, cls: 'text-red-700 dark:text-red-400' },
                ];
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">{tr('نرخ تحویل تکالیف', 'Submission Rate')}</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {fmtDigits(completionPct)}{tr('٪', '%')}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-[#0F274A] dark:bg-sky-500 rounded-full transition-all duration-500"
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {rows.map((r) => (
                        <div
                          key={r.label}
                          className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
                        >
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.label}</p>
                          <p className={`text-base font-bold tabular-nums mt-0.5 ${r.cls}`}>{fmtDigits(r.val)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Online Exams Performance Report */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش آزمون‌های آنلاین', 'Online Exams Report')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums inline-flex items-center gap-1.5">
                    <span>{tr('میانگین تسلط:', 'Avg Accuracy:')}</span>
                    {!overview ? (
                      <CircularSpinner size="xs" />
                    ) : (
                      <span>
                        {overview.examStats && overview.examStats.completedCount > 0
                          ? `${fmtDigits(overview.examStats.avgPercent)}${tr('٪', '%')}`
                          : '—'}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('exams')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('ورود به آزمون‌ها', 'Open Exams')}
                </button>
              </div>
              {!overview ? (
                <div className="py-10 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  <CircularSpinner size="md" />
                </div>
              ) : !overview.examStats || overview.examStats.recentAttempts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  {tr('هنوز در آزمون آنلاینی شرکت نکرده‌اید.', 'No online exam attempts recorded yet.')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.examStats.recentAttempts.slice(0, 4).map((att) => (
                    <div key={att.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{att.examTitle}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{att.subjectName}</p>
                      </div>
                      <div className="text-end tabular-nums shrink-0">
                        <span className="font-bold text-[#0F274A] dark:text-sky-300">
                          {fmtNum(att.score)} / {fmtDigits(att.maxScore)}
                        </span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                          {fmtDigits(att.percent)}{tr('٪', '%')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Study Planner & Academic History Report */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش برنامه‌ریزی مطالعه و سوابق', 'Study Planner & History')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums inline-flex items-center gap-1.5">
                    <span>{tr('تعداد کل برنامه‌ها:', 'Total tasks:')}</span>
                    {!overview ? <CircularSpinner size="xs" /> : <span>{fmtDigits(overview.studyStats?.totalTasks ?? 0)}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('planner')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('برنامه‌ریز', 'Planner')}
                </button>
              </div>
              {(() => {
                if (!overview) {
                  return (
                    <div className="py-10 flex items-center justify-center">
                      <CircularSpinner size="md" />
                    </div>
                  );
                }
                const st = overview.studyStats ?? { totalTasks: 0, completedTasks: 0, totalMinutes: 0, completedMinutes: 0 };
                const taskPct = st.totalTasks > 0 ? Math.round((st.completedTasks / st.totalTasks) * 100) : 0;
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">{tr('پیشرفت اجرای برنامه مطالعه', 'Study Plan Completion')}</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {fmtDigits(taskPct)}{tr('٪', '%')}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${taskPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('دقیقه مطالعه تکمیل‌شده', 'Completed Study')}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {fmtDigits(st.completedMinutes)} / {fmtDigits(st.totalMinutes)} {tr('دقیقه', 'min')}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('سوابق تحصیلی ثبت‌شده', 'Academic Histories')}</p>
                        {!historiesLoaded && overview.historiesCount === undefined ? (
                          <div className="mt-1">
                            <CircularSpinner size="xs" />
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                            {fmtDigits(overview.historiesCount ?? histories.length)}{' '}
                            {overview.latestHistory ? `· ${tr('معدل', 'GPA')} ${fmtNum(overview.latestHistory.gpa)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Recent Grades Report & Upcoming Calendar Events */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش آخرین نمرات ثبت‌شده', 'Recent Recorded Grades Report')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('جزئیات ۶ ارزشیابی اخیر در تمامی دروس', 'Latest 6 assessments across your subjects')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('grades')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('کارنامه کامل', 'Full Report Card')}
                </button>
              </div>
              {!overview ? (
                <div className="py-8 flex items-center justify-center">
                  <CircularSpinner size="md" />
                </div>
              ) : !overview.recentGrades || overview.recentGrades.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('هنوز نمره‌ای برای شما ثبت نشده است.', 'No grades recorded yet.')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2 font-semibold text-start">{tr('درس', 'Subject')}</th>
                        <th className="py-2 font-semibold text-start">{tr('ارزشیابی', 'Title')}</th>
                        <th className="py-2 font-semibold text-start">{tr('نوبت', 'Term')}</th>
                        <th className="py-2 font-semibold text-end">{tr('نمره', 'Score')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {overview.recentGrades.map((g) => {
                        const pass = g.normalized >= (settings?.passingScore ?? 10);
                        return (
                          <tr key={g.id}>
                            <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100">{g.subjectName}</td>
                            <td className="py-2.5 text-slate-600 dark:text-slate-300">{g.title}</td>
                            <td className="py-2.5 text-slate-500 dark:text-slate-400">{termLabel(g.term)}</td>
                            <td className={`py-2.5 text-end font-bold tabular-nums ${pass ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                              {fmtNum(g.score)} / {fmtDigits(g.maxScore)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش رویدادهای تقویم آموزشی', 'Upcoming Academic Calendar')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('مناسبت‌ها و تاریخ‌های مهم مدرسه و کلاس', 'Important school & class dates')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('calendar')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('تقویم کامل', 'Full Calendar')}
                </button>
              </div>
              {!overview?.upcomingEvents || overview.upcomingEvents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('رویداد آموزشی پیش‌رویی ثبت نشده است.', 'No upcoming calendar events.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.upcomingEvents.map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{ev.title}</p>
                        {ev.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{ev.description}</p>
                        )}
                      </div>
                      <span className="tabular-nums text-[11px] font-semibold text-[#0F274A] dark:text-sky-300 shrink-0">
                        {fmtDate(ev.date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && <AIAssistantView user={user} />}

      {activeTab === 'grades' && (
        <div className="space-y-6">
          <div className="print-report-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/aistudio/image_1b3c1aaa.png"
                  alt={schoolTitle(settings?.schoolName)}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-contain bg-white p-1 border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {tr('کارنامه تحصیلی دانش‌آموز', 'Student Academic Report Card')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {user.fullName} · {tr('کلاس', 'Class')} {myClass?.name ?? tr('تخصیص‌نیافته', 'Unassigned')} ·{' '}
                    {tr('سال تحصیلی', 'Year')} {fmtDigits(settings?.academicYear ?? '1404-1405')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 no-print">
                <select
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <option value="all">{tr('همه نوبت‌ها', 'All Terms')}</option>
                  <option value="مستمر اول">{termLabel('مستمر اول')}</option>
                  <option value="نوبت اول">{termLabel('نوبت اول')}</option>
                  <option value="مستمر دوم">{termLabel('مستمر دوم')}</option>
                  <option value="نوبت دوم">{termLabel('نوبت دوم')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveTab('report_card')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                >
                  <Award className="w-4 h-4" />
                  <span>{tr('کارنامه پیشرفته و مقایسه کلاس', 'Advanced Report Card')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tr('چاپ کارنامه', 'Print')}</span>
                </button>
              </div>
            </div>

            {reportCardRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {tr('هنوز نمره‌ای برای صدور کارنامه در این نوبت ثبت نشده است.', 'No grades recorded for this term yet.')}
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                      <th className="px-4 py-2.5 text-start">{tr('کد درس', 'Code')}</th>
                      <th className="px-4 py-2.5 text-start">{tr('نام درس', 'Subject')}</th>
                      <th className="px-4 py-2.5 text-center">{tr('ضریب', 'Weight')}</th>
                      <th className="px-4 py-2.5 text-center">{tr('تعداد ارزشیابی', 'Count')}</th>
                      <th className="px-4 py-2.5 text-center">{tr('میانگین نمره (از ۲۰)', 'Avg (/20)')}</th>
                      <th className="px-4 py-2.5 text-center">{tr('نمره با ضریب', 'Weighted')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reportCardRows.map((row) => (
                      <tr key={row.subjectId}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{row.code}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{row.name}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{fmtDigits(row.coefficient)}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{fmtDigits(row.count)}</td>
                        <td
                          className={`px-4 py-2.5 text-center font-bold tabular-nums ${
                            row.average >= (settings?.passingScore ?? 10)
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {fmtNum(row.average)}
                        </td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-slate-700 dark:text-slate-300">
                          {fmtNum(row.weighted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 font-bold">
                      <td colSpan={4} className="px-4 py-3 text-start text-slate-900 dark:text-slate-100">
                        {tr('معدل کل وزنی در این بازه', 'Weighted GPA for Selected Term')}
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-center text-base text-[#0F274A] dark:text-sky-300 tabular-nums">
                        {fmtNum(weightedGpa)} {tr('از ۲۰', '/ 20')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {reportCardRows.length > 0 && (
              <div className="mt-5 print-avoid-break">
                <HorizontalBarChart
                  title={tr('نمودار وضعیت نمرات دروس کارنامه', 'Report Card Subject Scores Chart')}
                  subtitle={tr('میانگین نمره شما در هر درس از ۲۰', 'Your average score out of 20 per subject')}
                  data={reportCardRows.map((row) => ({
                    label: row.name,
                    value: row.average,
                  }))}
                  passingLine={settings?.passingScore ?? 10}
                />
              </div>
            )}
          </div>

          <div className="no-print">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
              {tr('ریز نمرات ثبت‌شده', 'Detailed Grade Records')}
            </h3>
            <DataTable
              data={filteredGrades}
              columns={gradeColumns}
              keyExtractor={(r) => r.id}
              loading={loading}
              searchPlaceholder={tr('جستجو در عنوان آزمون یا درس...', 'Search assessment or subject...')}
              searchFilter={(r, q) =>
                (r.title ?? '').toLowerCase().includes(q) ||
                (subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? '').toLowerCase().includes(q)
              }
              emptyTitle={tr('نمره‌ای ثبت نشده است', 'No grades recorded')}
              emptyDescription={tr('پس از ثبت نمرات توسط معلمان، فهرست کامل در اینجا نمایش داده می‌شود.', 'Detailed grades recorded by teachers will appear here.')}
            />
          </div>
        </div>
      )}

      {activeTab === 'report_card' && (
        <AdvancedReportCardView user={user} settings={settings} />
      )}

      {activeTab === 'exams' && (
        <OnlineExamsView user={user} exams={exams} classes={classes} subjects={subjects} onReload={loadAll} />
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-5">
          <AttendanceBreakdownChart
            title={tr('نمای کلی حضور و غیاب شما', 'Your Attendance Overview')}
            stats={safeAttStats}
          />
          <DataTable
            data={attendance}
            columns={attendanceColumns}
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجو بر اساس تاریخ یا درس...', 'Search by date or subject...')}
            searchFilter={(r, q) =>
              (r.date ?? '').toLowerCase().includes(q) ||
              (subjectMap.get(r.subjectId ?? '')?.name ?? r.subjectName ?? '').toLowerCase().includes(q)
            }
            emptyTitle={tr('رکورد حضور و غیابی ثبت نشده است', 'No attendance records yet')}
            emptyDescription={tr('سابقه حضور، تأخیر و غیبت‌های شما در این جدول ثبت خواهد شد.', 'Your attendance history will appear here.')}
          />
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
              <FileText className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {tr('تکلیفی ثبت نشده است', 'No assignments posted')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {tr('تکالیف جدید معلمان کلاس شما در این بخش قرار می‌گیرند.', 'Assignments posted for your class will appear here.')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map((asg) => {
                const sub = asg.mySubmission;
                const status = sub?.status ?? 'pending';
                return (
                  <div
                    key={asg.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                        <span>{subjectMap.get(asg.subjectId)?.name ?? asg.subjectName ?? tr('درس', 'Subject')}</span>
                        <span className="tabular-nums">
                          {tr('مهلت تحویل:', 'Due:')} {fmtDate(asg.dueDate)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{asg.title}</h3>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-6 whitespace-pre-wrap">
                        {asg.description}
                      </p>

                      {sub?.submittedText && (
                        <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                            {tr('پاسخ ارسالی شما:', 'Your Submission:')}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{sub.submittedText}</p>
                          {sub.attachmentUrl && (
                            <a
                              href={sub.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-sky-700 dark:text-sky-400 hover:underline font-medium"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>{sub.attachmentName || tr('پیوست ارسالی', 'Attachment')}</span>
                            </a>
                          )}
                        </div>
                      )}

                      {sub?.status === 'graded' && (
                        <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-xs">
                          <p className="font-bold text-emerald-900 dark:text-emerald-300 tabular-nums">
                            {tr('نمره:', 'Score:')} {fmtNum(sub.score)} {tr('از', '/')} {fmtDigits(asg.maxScore)}
                          </p>
                          {sub.feedback && (
                            <p className="text-emerald-800 dark:text-emerald-200 mt-1">
                              {tr('بازخورد معلم:', 'Feedback:')} {sub.feedback}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {submissionLabel(status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSubmitModalAsg(asg);
                          setSubmissionText(sub?.submittedText ?? '');
                          setAttachmentName(sub?.attachmentName ?? '');
                          setAttachmentUrl(sub?.attachmentUrl ?? '');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors"
                      >
                        {sub?.submittedText ? tr('ویرایش پاسخ', 'Edit Submission') : tr('ارسال پاسخ تکلیف', 'Submit Answer')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Modal
            open={!!submitModalAsg}
            onClose={() => setSubmitModalAsg(null)}
            title={`${tr('ارسال پاسخ:', 'Submit Assignment:')} ${submitModalAsg?.title ?? ''}`}
          >
            <form onSubmit={handleAssignmentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('متن پاسخ یا گزارش انجام تکلیف', 'Written Answer / Solution')}
                </label>
                <textarea
                  rows={5}
                  required
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder={tr('راه‌حل، توضیحات یا متن تکلیف خود را اینجا بنویسید...', 'Write your solution or explanation here...')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('عنوان فایل پیوست (اختیاری)', 'Attachment Name (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    placeholder={tr('مثلاً حل تمرین فصل ۲', 'e.g. Chapter 2 PDF')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('لینک فایل / سند (اختیاری)', 'File / Document URL (Optional)')}
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs font-mono text-left"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitModalAsg(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {tr('انصراف', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingAsg}
                  className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  {submittingAsg ? tr('در حال ثبت...', 'Submitting...') : tr('ثبت و ارسال', 'Submit')}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {tr('برنامه هفتگی کلاس', 'Weekly Class Schedule')} {myClass?.name ?? ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {tr('برنامه درسی تنظیم‌شده برای هفته آموزشی', 'Configured weekly timetable for your class')}
            </p>
          </div>
          {schedules.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {tr('هنوز برنامه هفتگی برای کلاس شما ثبت نشده است.', 'No weekly schedule configured for your class yet.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((dayIdx) => {
                const dayName = weekdayLabel(dayIdx);
                const daySlots = schedules.filter((s) => s.dayOfWeek === dayIdx);
                return (
                  <div key={dayIdx} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-900 dark:text-slate-100">
                      {dayName}
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400 dark:text-slate-500">
                        {tr('برنامه‌ای ثبت نشده است', 'No sessions')}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {daySlots.map((slot) => (
                          <div key={slot.id} className="p-3.5 text-xs">
                            <div className="flex items-center justify-between gap-2 font-bold text-slate-900 dark:text-slate-100">
                              <span>{subjectMap.get(slot.subjectId)?.name ?? tr('درس', 'Subject')}</span>
                              <span className="tabular-nums text-[#0F274A] dark:text-sky-400">
                                {tr('زنگ', 'Period')} {fmtDigits(slot.period)}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 mt-1">
                              {tr('دبیر:', 'Teacher:')} {teacherMap.get(slot.teacherId) ?? tr('ثبت‌نشده', 'Unassigned')}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                              {fmtDigits(slot.startTime)} {tr('تا', '–')} {fmtDigits(slot.endTime)}
                              {slot.room ? ` · ${tr('مکان:', 'Room:')} ${fmtDigits(slot.room)}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <AcademicCalendarView
          user={user}
          events={calendarEvents}
          assignments={assignments}
          exams={exams}
          classes={classes}
          onReload={loadAll}
        />
      )}

      {activeTab === 'private_tutor' && (
        <PrivateTutorView user={user} subjects={subjects} onSavedToPlanner={loadAll} />
      )}

      {activeTab === 'planner' && (
        <StudyPlannerView user={user} plans={studyPlans} subjects={subjects} onReload={loadAll} />
      )}

      {activeTab === 'league' && (
        <StudyLeagueView user={user} classes={classes} subjects={subjects} initialTab="goals" />
      )}

      {activeTab === 'league_hall' && (
        <StudyLeagueView user={user} classes={classes} subjects={subjects} initialTab="hall" />
      )}

      {activeTab === 'library' && (
        <DigitalLibraryView user={user} subjects={subjects} />
      )}

      {activeTab === 'honors' && (
        <HonorsView user={user} />
      )}

      {activeTab === 'history' && (
        <DataTable
          data={histories}
          keyExtractor={(r) => r.id}
          loading={loading}
          emptyTitle={tr('سابقه تحصیلی ثبت نشده است', 'No academic history recorded')}
          emptyDescription={tr('سوابق سال‌های تحصیلی گذشته پس از ثبت توسط مدیریت در این جدول نمایش داده می‌شود.', 'Prior academic year records added by administration will appear here.')}
          columns={[
            {
              key: 'year',
              header: tr('سال تحصیلی', 'Academic Year'),
              sortValue: (r) => r.academicYear,
              render: (r) => <span className="font-semibold tabular-nums">{fmtDigits(r.academicYear)}</span>,
            },
            {
              key: 'gradeLevel',
              header: tr('پایه', 'Grade Level'),
              render: (r) => r.gradeLevel,
            },
            {
              key: 'gpa',
              header: tr('معدل کل', 'GPA'),
              sortValue: (r) => r.gpa,
              render: (r) => (
                <span className="font-bold tabular-nums text-[#0F274A] dark:text-sky-400">{fmtNum(r.gpa)}</span>
              ),
            },
            {
              key: 'status',
              header: tr('وضعیت', 'Status'),
              render: (r) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">{r.status}</span>,
            },
            {
              key: 'summary',
              header: tr('توضیحات', 'Summary'),
              render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300">{r.summary}</span>,
            },
          ]}
        />
      )}

      {activeTab === 'announcements' && (
        <AnnouncementsView user={user} announcements={announcements} classes={classes} onReload={loadAll} />
      )}

      {activeTab === 'messages' && (
        <MessagesView
          user={user}
          messages={messages}
          recipients={teachers}
          onReload={loadAll}
          chatUnreadCount={chatUnreadCount}
          onChatUnreadChange={setChatUnreadCount}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileView user={user} classNameLabel={myClass?.name} onUpdated={onUserUpdated} />
      )}
    </AppShell>
  );
}
