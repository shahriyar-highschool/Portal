import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  Calendar,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Edit3,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Medal,
  Megaphone,
  Paperclip,
  Plus,
  Printer,
  School,
  ShieldAlert,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type Announcement,
  type Assignment,
  type AssignmentSubmission,
  type AttendanceRecord,
  type CalendarEvent,
  type ChatThreadSummary,
  type DirectMessage,
  type GradeRecord,
  type GradeTerm,
  type ScheduleSlot,
  type SchoolClass,
  type SchoolSettings,
  type Subject,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { AIAssistantView } from '../ai/AIAssistantView';
import { PrivateTutorView } from '../ai/PrivateTutorView';
import { AcademicCalendarView } from '../education/AcademicCalendarView';
import { AcademicRiskView } from '../education/AcademicRiskView';
import { AdvancedReportCardView } from '../education/AdvancedReportCardView';
import { DigitalLibraryView } from '../education/DigitalLibraryView';
import { HonorsView } from '../education/HonorsView';
import { OnlineExamsView, type EnrichedExam } from '../education/OnlineExamsView';
import { AppShell, type NavItem } from '../layout/AppShell';
import { AnnouncementsView, MessagesView, ProfileView } from '../shared/AccountAndComms';
import { AttendanceBreakdownChart, HorizontalBarChart, LineTrendChart } from '../ui/Charts';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { StatCard } from '../ui/StatCard';
import { useToast } from '../ui/Toast';

interface TeacherOverview {
  classesCount: number;
  subjectsCount: number;
  studentsCount: number;
  gradesCount: number;
  averageScore: number;
  assignmentsCount: number;
  awaitingReviewCount: number;
  activeExamsCount: number;
  attendanceStats: { total: number; present: number; absent: number; late: number; excused: number };
  classAverages: Array<{ label: string; value: number; count: number }>;
  subjectAverages?: Array<{ label: string; value: number; count: number }>;
  termTrend: Array<{ label: string; value: number; count?: number }>;
  gradeDistribution: Array<{ label: string; count: number }>;
  assignmentBreakdown?: {
    totalAssignments: number;
    expectedSubmissions: number;
    submittedCount: number;
    gradedCount: number;
    pendingReviewCount: number;
    completionRate: number;
  };
  classSummaries?: Array<{
    id: string;
    name: string;
    gradeLevel: string;
    studentsCount: number;
    gradesCount: number;
    averageScore: number;
    attendanceRate: number;
  }>;
  examSummaries?: Array<{
    id: string;
    title: string;
    subjectName: string;
    className: string;
    active: boolean;
    attemptsCount: number;
    averageScore: number;
    maxScore: number;
  }>;
  topStudents?: Array<{
    id: string;
    fullName: string;
    className: string;
    gradesCount: number;
    average: number;
  }>;
  recentGrades?: Array<{
    id: string;
    studentName: string;
    subjectName: string;
    title: string;
    score: number;
    maxScore: number;
    date: string;
  }>;
}

interface EnrichedTeacherAssignment extends Assignment {
  submissionsCount: number;
  gradedCount: number;
}

interface SubmissionRow {
  studentId: string;
  studentName: string;
  submission: AssignmentSubmission;
}

export function TeacherPortal({
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
  } = useI18n();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<UserAccount[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assignments, setAssignments] = useState<EnrichedTeacherAssignment[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [directoryTeachers, setDirectoryTeachers] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [exams, setExams] = useState<EnrichedExam[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');

  // Grade modal state
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<GradeRecord | null>(null);
  const [grdClassId, setGrdClassId] = useState('');
  const [grdStudentId, setGrdStudentId] = useState('');
  const [grdSubjectId, setGrdSubjectId] = useState('');
  const [grdTerm, setGrdTerm] = useState<GradeTerm>('نوبت اول');
  const [grdTitle, setGrdTitle] = useState('');
  const [grdScore, setGrdScore] = useState('');
  const [grdMaxScore, setGrdMaxScore] = useState('20');
  const [grdDate, setGrdDate] = useState(() => new Date().toLocaleDateString('fa-IR'));
  const [grdNote, setGrdNote] = useState('');

  // Batch attendance state
  const [attClassId, setAttClassId] = useState('');
  const [attSubjectId, setAttSubjectId] = useState('');
  const [attDate, setAttDate] = useState(() => new Date().toLocaleDateString('fa-IR'));
  const [attEntries, setAttEntries] = useState<Record<string, { status: AttendanceRecord['status']; note: string }>>({});
  const [savingAtt, setSavingAtt] = useState(false);

  // Assignment create & submissions modal
  const [asgModalOpen, setAsgModalOpen] = useState(false);
  const [asgTitle, setAsgTitle] = useState('');
  const [asgDesc, setAsgDesc] = useState('');
  const [asgClassId, setAsgClassId] = useState('');
  const [asgSubjectId, setAsgSubjectId] = useState('');
  const [asgDueDate, setAsgDueDate] = useState('1404/10/15');
  const [asgMaxScore, setAsgMaxScore] = useState('20');

  const [subsModalAsg, setSubsModalAsg] = useState<EnrichedTeacherAssignment | null>(null);
  const [subsRows, setSubsRows] = useState<SubmissionRow[]>([]);
  const [gradingInputs, setGradingInputs] = useState<Record<string, { score: string; feedback: string }>>({});

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiRequest<TeacherOverview>('/api/reports/overview'),
        apiRequest<{ classes: SchoolClass[] }>('/api/classes'),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
        apiRequest<{ users: UserAccount[] }>('/api/users'),
        apiRequest<{ grades: GradeRecord[] }>('/api/grades'),
        apiRequest<{ attendance: AttendanceRecord[] }>('/api/attendance'),
        apiRequest<{ assignments: EnrichedTeacherAssignment[] }>('/api/assignments'),
        apiRequest<{ schedules: ScheduleSlot[] }>('/api/schedules'),
        apiRequest<{ announcements: Announcement[] }>('/api/announcements'),
        apiRequest<{ messages: DirectMessage[] }>('/api/messages'),
        apiRequest<{ teachers: Array<{ id: string; fullName: string; role: string }> }>('/api/directory/teachers'),
        apiRequest<{ exams: EnrichedExam[] }>('/api/exams'),
        apiRequest<{ events: CalendarEvent[] }>('/api/calendar-events'),
        apiRequest<{ threads: ChatThreadSummary[] }>('/api/chat/threads'),
      ]);

      const [ov, cls, sub, usr, grd, att, asg, sch, ann, msg, tch, exm, cal, chatTh] = results;
      if (ov.status === 'fulfilled') {
        setOverview(ov.value);
      } else {
        showToast(
          ov.reason instanceof Error
            ? ov.reason.message
            : tr('خطا در دریافت اطلاعات پنل معلم', 'Failed to load teacher portal'),
          'error'
        );
      }
      if (cls.status === 'fulfilled') {
        const list = cls.value.classes ?? [];
        setClasses(list);
        if (list.length > 0) {
          setAttClassId((prev) => prev || list[0].id);
          setGrdClassId((prev) => prev || list[0].id);
          setAsgClassId((prev) => prev || list[0].id);
        }
      }
      if (sub.status === 'fulfilled') {
        const list = sub.value.subjects ?? [];
        setSubjects(list);
        if (list.length > 0) {
          setGrdSubjectId((prev) => prev || list[0].id);
          setAsgSubjectId((prev) => prev || list[0].id);
        }
      }
      if (usr.status === 'fulfilled') {
        setStudents((usr.value.users ?? []).filter((u) => u.role === 'student'));
      }
      if (grd.status === 'fulfilled') setGrades(grd.value.grades ?? []);
      if (att.status === 'fulfilled') setAttendance(att.value.attendance ?? []);
      if (asg.status === 'fulfilled') setAssignments(asg.value.assignments ?? []);
      if (sch.status === 'fulfilled') setSchedules(sch.value.schedules ?? []);
      if (ann.status === 'fulfilled') setAnnouncements(ann.value.announcements ?? []);
      if (msg.status === 'fulfilled') setMessages(msg.value.messages ?? []);
      if (tch.status === 'fulfilled') setDirectoryTeachers(tch.value.teachers ?? []);
      if (exm.status === 'fulfilled') setExams(exm.value.exams ?? []);
      if (cal.status === 'fulfilled') setCalendarEvents(cal.value.events ?? []);
      if (chatTh.status === 'fulfilled') {
        setChatUnreadCount((chatTh.value.threads ?? []).reduce((sum, th) => sum + th.unreadCount, 0));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت اطلاعات پنل معلم', 'Failed to load teacher portal'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const unreadMessages = useMemo(
    () => messages.filter((m) => m.senderId !== user.id && !m.readBy.includes(user.id)),
    [messages, user.id]
  );

  const attClassStudents = useMemo(
    () => students.filter((s) => s.classId === attClassId),
    [students, attClassId]
  );

  useEffect(() => {
    const next: Record<string, { status: AttendanceRecord['status']; note: string }> = {};
    for (const st of attClassStudents) {
      next[st.id] = attEntries[st.id] ?? { status: 'present', note: '' };
    }
    setAttEntries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attClassId, students.length]);

  const todaySchoolDayIdx = (new Date().getDay() + 1) % 7;
  const todaysSlots = useMemo(
    () => schedules.filter((s) => s.dayOfWeek === todaySchoolDayIdx),
    [schedules, todaySchoolDayIdx]
  );

  const hasPerm = (perm: string) => !Array.isArray(user.permissions) || user.permissions.includes(perm);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: tr('داشبورد معلم', 'Teacher Dashboard'), icon: LayoutDashboard, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
    ...(hasPerm('use_ai_teacher')
      ? [
          { id: 'ai', label: tr('هوش مصنوعی', 'AI Teaching Assistant'), icon: Bot, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
          { id: 'private_tutor', label: tr('معلم خصوصی و جزوه‌ها', 'Private Tutor & Notes'), icon: GraduationCap, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
        ]
      : []),
    ...(hasPerm('view_assigned_classes')
      ? [{ id: 'classes', label: tr('کلاس‌ها و دانش‌آموزان', 'Classes & Students'), icon: School, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
      : []),
    ...(hasPerm('manage_assigned_grades')
      ? [
          { id: 'grades', label: tr('ثبت و مدیریت نمرات', 'Grades'), icon: Award, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') },
          { id: 'report_card', label: tr('چاپ کارنامه پیشرفته', 'Advanced Report Card'), icon: Printer, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') },
          { id: 'exams', label: tr('آزمون‌های آنلاین', 'Online Exams'), icon: FileQuestion, badge: overview?.activeExamsCount, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') },
        ]
      : hasPerm('view_class_reports')
        ? [{ id: 'report_card', label: tr('چاپ کارنامه پیشرفته', 'Advanced Report Card'), icon: Printer, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
        : []),
    ...(hasPerm('manage_assigned_attendance')
      ? [{ id: 'attendance', label: tr('حضور و غیاب', 'Attendance'), icon: CheckSquare, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
      : []),
    ...(hasPerm('manage_assigned_assignments')
      ? [{ id: 'assignments', label: tr('تکالیف کلاسی', 'Assignments'), icon: ClipboardList, badge: overview?.awaitingReviewCount, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
      : []),
    ...(hasPerm('view_class_reports')
      ? [{ id: 'academic_risk', label: tr('پیش‌بینی افت تحصیلی', 'Risk Radar'), icon: ShieldAlert, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
      : []),
    { id: 'library', label: tr('کتابخانه دیجیتال', 'Digital Library'), icon: BookOpen, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') },
    { id: 'honors', label: tr('پرونده افتخارات', 'Student Honors'), icon: Medal, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') },
    ...(hasPerm('view_class_reports')
      ? [{ id: 'reports', label: tr('گزارش عملکرد دانش‌آموزان', 'Performance Reports'), icon: BarChart3, section: tr('کلاس‌ها و ارزشیابی', 'Classes & Grading') }]
      : []),
    { id: 'schedule', label: tr('برنامه هفتگی', 'Weekly Schedule'), icon: Calendar, section: tr('برنامه و ارتباطات', 'Schedule & Comms') },
    { id: 'calendar', label: tr('تقویم آموزشی', 'Academic Calendar'), icon: CalendarDays, section: tr('برنامه و ارتباطات', 'Schedule & Comms') },
    ...(hasPerm('send_class_announcements')
      ? [{ id: 'announcements', label: tr('اطلاعیه‌های کلاس', 'Class Announcements'), icon: Megaphone, section: tr('برنامه و ارتباطات', 'Schedule & Comms') }]
      : []),
    { id: 'messages', label: tr('چت و پیام‌ها', 'Chat & Messages'), icon: Mail, badge: unreadMessages.length + chatUnreadCount, section: tr('برنامه و ارتباطات', 'Schedule & Comms') },
    { id: 'profile', label: tr('اطلاعات کاربری', 'Profile & Requests'), icon: User, section: tr('برنامه و ارتباطات', 'Schedule & Comms') },
  ];

  // Grade handlers
  const openCreateGradeModal = () => {
    setEditingGrade(null);
    const defaultCls = classes[0]?.id ?? '';
    setGrdClassId(defaultCls);
    const firstStu = students.find((s) => s.classId === defaultCls)?.id ?? '';
    setGrdStudentId(firstStu);
    setGrdSubjectId(subjects[0]?.id ?? '');
    setGrdTitle('');
    setGrdScore('');
    setGrdMaxScore('20');
    setGrdNote('');
    setGradeModalOpen(true);
  };

  const openEditGradeModal = (g: GradeRecord) => {
    setEditingGrade(g);
    setGrdClassId(g.classId);
    setGrdStudentId(g.studentId);
    setGrdSubjectId(g.subjectId);
    setGrdTerm(g.term);
    setGrdTitle(g.title);
    setGrdScore(String(g.score));
    setGrdMaxScore(String(g.maxScore));
    setGrdDate(g.date);
    setGrdNote(g.note ?? '');
    setGradeModalOpen(true);
  };

  const handleSaveGrade = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingGrade) {
        await apiRequest(`/api/grades/${editingGrade.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            term: grdTerm,
            title: grdTitle,
            score: Number(grdScore),
            maxScore: Number(grdMaxScore),
            date: grdDate,
            note: grdNote,
          }),
        });
        showToast(tr('نمره با موفقیت ویرایش شد.', 'Grade updated.'));
      } else {
        await apiRequest('/api/grades', {
          method: 'POST',
          body: JSON.stringify({
            studentId: grdStudentId,
            classId: grdClassId,
            subjectId: grdSubjectId,
            term: grdTerm,
            title: grdTitle,
            score: Number(grdScore),
            maxScore: Number(grdMaxScore),
            date: grdDate,
            note: grdNote,
          }),
        });
        showToast(tr('نمره جدید با موفقیت ثبت شد.', 'New grade recorded.'));
      }
      setGradeModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت نمره', 'Failed to save grade'), 'error');
    }
  };

  const handleDeleteGrade = async (id: string) => {
    try {
      await apiRequest(`/api/grades/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast(tr('نمره حذف شد.', 'Grade deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف نمره', 'Failed to delete grade'), 'error');
    }
  };

  const handleSaveBatchAttendance = async (e: FormEvent) => {
    e.preventDefault();
    if (!attClassId || attClassStudents.length === 0) {
      showToast(tr('کلاس یا دانش‌آموزی برای ثبت وجود ندارد.', 'No class or students available.'), 'error');
      return;
    }
    setSavingAtt(true);
    try {
      const entries = attClassStudents.map((st) => ({
        studentId: st.id,
        status: attEntries[st.id]?.status ?? 'present',
        note: attEntries[st.id]?.note ?? '',
      }));
      await apiRequest('/api/attendance/batch', {
        method: 'POST',
        body: JSON.stringify({
          classId: attClassId,
          subjectId: attSubjectId || undefined,
          date: attDate,
          entries,
        }),
      });
      await loadAll();
      showToast(tr('حضور و غیاب کلاس با موفقیت ذخیره شد.', 'Class attendance saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت حضور و غیاب', 'Failed to save attendance'), 'error');
    } finally {
      setSavingAtt(false);
    }
  };

  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: asgTitle,
          description: asgDesc,
          classId: asgClassId,
          subjectId: asgSubjectId,
          dueDate: asgDueDate,
          maxScore: Number(asgMaxScore),
        }),
      });
      setAsgTitle('');
      setAsgDesc('');
      setAsgModalOpen(false);
      await loadAll();
      showToast(tr('تکلیف جدید ثبت و برای دانش‌آموزان کلاس منتشر شد.', 'Assignment created and assigned.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ایجاد تکلیف', 'Failed to create assignment'), 'error');
    }
  };

  const openSubmissionsModal = async (asg: EnrichedTeacherAssignment) => {
    try {
      setSubsModalAsg(asg);
      const data = await apiRequest<{ rows: SubmissionRow[] }>(`/api/assignments/${asg.id}/submissions`);
      setSubsRows(data.rows);
      const map: Record<string, { score: string; feedback: string }> = {};
      for (const r of data.rows) {
        map[r.studentId] = {
          score: r.submission.score !== undefined ? String(r.submission.score) : '',
          feedback: r.submission.feedback ?? '',
        };
      }
      setGradingInputs(map);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت وضعیت تکلیف', 'Failed to load submissions'), 'error');
    }
  };

  const handleGradeSubmission = async (studentId: string) => {
    if (!subsModalAsg) return;
    const inp = gradingInputs[studentId];
    if (!inp || inp.score === '') {
      showToast(tr('نمره را وارد کنید.', 'Please enter a score.'), 'error');
      return;
    }
    try {
      await apiRequest('/api/submissions/grade', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: subsModalAsg.id,
          studentId,
          score: Number(inp.score),
          feedback: inp.feedback,
        }),
      });
      showToast(tr('نمره تکلیف ثبت شد.', 'Submission graded.'));
      await openSubmissionsModal(subsModalAsg);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت نمره تکلیف', 'Failed to grade submission'), 'error');
    }
  };

  const studentPerformanceRows = useMemo(() => {
    return students
      .filter((s) => selectedClassFilter === 'all' || s.classId === selectedClassFilter)
      .map((stu) => {
        const stuGrades = grades.filter((g) => g.studentId === stu.id);
        const avgScore =
          stuGrades.length > 0
            ? stuGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * 20, 0) / stuGrades.length
            : 0;
        const stuAtt = attendance.filter((a) => a.studentId === stu.id);
        const absences = stuAtt.filter((a) => a.status === 'absent').length;
        const lates = stuAtt.filter((a) => a.status === 'late').length;
        return {
          id: stu.id,
          fullName: stu.fullName,
          className: classMap.get(stu.classId ?? '')?.name ?? '—',
          gradesCount: stuGrades.length,
          average: Number(avgScore.toFixed(2)),
          absences,
          lates,
        };
      });
  }, [students, grades, attendance, classMap, selectedClassFilter]);

  const studentsNeedingAttention = useMemo(() => {
    const pass = (settings?.passingScore ?? 10) + 3;
    return studentPerformanceRows.filter(
      (r) => (r.gradesCount > 0 && r.average < pass) || r.absences >= 2
    );
  }, [studentPerformanceRows, settings?.passingScore]);

  const gradeCols: ColumnDef<GradeRecord>[] = [
    {
      key: 'student',
      header: tr('دانش‌آموز', 'Student'),
      sortValue: (r) => studentMap.get(r.studentId)?.fullName ?? r.studentName ?? '',
      render: (r) => (
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {studentMap.get(r.studentId)?.fullName ?? r.studentName ?? '—'}
        </span>
      ),
    },
    { key: 'class', header: tr('کلاس', 'Class'), render: (r) => classMap.get(r.classId)?.name ?? r.className ?? '—' },
    { key: 'subject', header: tr('درس', 'Subject'), render: (r) => subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? (r.subjectId || '—') },
    { key: 'title', header: tr('عنوان', 'Title'), render: (r) => r.title || '—' },
    { key: 'term', header: tr('نوبت', 'Term'), render: (r) => termLabel(r.term) },
    {
      key: 'score',
      header: tr('نمره', 'Score'),
      sortValue: (r) => r.score,
      render: (r) => (
        <span className="font-bold tabular-nums text-[#0F274A] dark:text-sky-400">
          {fmtNum(r.score)} {tr('از', '/')} {fmtDigits(r.maxScore)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tr('عملیات', 'Actions'),
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEditGradeModal(r)}
            aria-label={tr('ویرایش نمره', 'Edit grade')}
            className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteGrade(r.id)}
            aria-label={tr('حذف نمره', 'Delete grade')}
            className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const scopedRecipients = useMemo(() => {
    const admins = directoryTeachers.filter((t) => t.role === 'admin');
    return [
      ...admins.map((a) => ({ id: a.id, fullName: a.fullName, role: a.role })),
      ...students.map((s) => ({ id: s.id, fullName: s.fullName, role: s.role })),
    ];
  }, [directoryTeachers, students]);

  const maxDistCount = useMemo(
    () => Math.max(1, ...(overview?.gradeDistribution?.map((d) => d.count) ?? [1])),
    [overview?.gradeDistribution]
  );

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
          <div className="bg-white dark:bg-slate-900 bg-arch-grid border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr(
                  'پنل تخصصی دبیران · دسترسی محدود به کلاس‌های اختصاص‌یافته',
                  'Faculty Workspace · Scoped to Assigned Classes & Subjects'
                )}
              </p>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {tr('خوش آمدید،', 'Welcome,')} {user.fullName}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {hasPerm('manage_assigned_grades') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('grades')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Award className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>{tr('ثبت نمره', 'Record Grades')}</span>
                </button>
              )}
              {hasPerm('manage_assigned_attendance') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <CheckSquare className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>{tr('حضور و غیاب', 'Attendance')}</span>
                </button>
              )}
              {hasPerm('manage_assigned_grades') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('exams')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileQuestion className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>{tr('آزمون آنلاین', 'Online Exams')}</span>
                </button>
              )}
              {hasPerm('use_ai_teacher') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 shadow-sm transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>{tr('دستیار هوشمند معلم', 'AI Teaching Assistant')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label={tr('کلاس‌ها و دروس من', 'Assigned Classes & Subjects')}
              value={`${fmtDigits(overview?.classesCount ?? 0)}`}
              subtitle={`${fmtDigits(overview?.subjectsCount ?? 0)} ${tr('درس', 'subjects')} · ${fmtDigits(overview?.studentsCount ?? 0)} ${tr('دانش‌آموز', 'students')}`}
              icon={School}
            />
            <StatCard
              label={tr('میانگین نمرات کلاس‌ها', 'Average Class Score')}
              value={overview && overview.gradesCount > 0 ? fmtNum(overview.averageScore) : '—'}
              subtitle={`${fmtDigits(overview?.gradesCount ?? 0)} ${tr('نمره ثبت‌شده', 'grades recorded')}`}
              icon={Award}
            />
            <StatCard
              label={tr('تکالیف در انتظار بررسی', 'Submissions Awaiting Review')}
              value={fmtDigits(overview?.awaitingReviewCount ?? 0)}
              subtitle={`${fmtDigits(overview?.assignmentsCount ?? 0)} ${tr('تکلیف', 'assignments')} · ${fmtDigits(overview?.activeExamsCount ?? 0)} ${tr('آزمون فعال', 'active exams')}`}
              icon={ClipboardList}
            />
            <StatCard
              label={tr('غیبت‌ها و پیام‌های جدید', 'Absences & Unread Messages')}
              value={fmtDigits(safeAttStats.absent)}
              subtitle={`${fmtDigits(unreadMessages.length)} ${tr('پیام خوانده‌نشده', 'unread messages')}`}
              icon={Users}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('مقایسه میانگین نمرات کلاس‌های شما', 'Average Grades by Class')}
              data={
                (overview?.classAverages ?? []).map((c) => ({
                  label: c.label,
                  value: c.value,
                  sublabel: `${fmtDigits(c.count)} ${tr('نمره', 'grades')}`,
                }))
              }
            />
            <LineTrendChart
              title={tr('روند میانگین کلاس‌ها در نوبت‌های تحصیلی', 'Class Average Trend Across Terms')}
              data={
                (overview?.termTrend ?? []).map((t) => ({
                  label: termLabel(t.label),
                  value: t.value,
                  count: t.count,
                }))
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('توزیع نمرات ثبت‌شده', 'Grade Distribution Buckets')}
              subtitle={tr('تعداد نمرات در هر بازه نمره', 'Count of recorded grades per tier')}
              maxValue={maxDistCount}
              passingLine={0}
              data={
                (overview?.gradesCount ?? 0) > 0
                  ? (overview?.gradeDistribution ?? []).map((d) => ({
                      label: fmtDigits(d.label),
                      value: d.count,
                    }))
                  : []
              }
            />
            <AttendanceBreakdownChart
              title={tr('وضعیت حضور و غیاب کلاس‌های شما', 'Attendance Breakdown')}
              stats={safeAttStats}
            />
          </div>

          {/* Today's schedule & Attention Needed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('کلاس‌های امروز شما', "Today's Classes")}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('برنامه هفتگی', 'Full Schedule')}
                </button>
              </div>
              {todaysSlots.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('کلاسی برای امروز ثبت نشده است.', 'No classes scheduled for today.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {todaysSlots.map((slot) => (
                    <div key={slot.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100">
                          {subjectMap.get(slot.subjectId)?.name ?? tr('درس', 'Subject')}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {classMap.get(slot.classId)?.name ?? '—'}
                        </p>
                      </div>
                      <span className="tabular-nums font-semibold text-[#0F274A] dark:text-sky-300">
                        {fmtDigits(slot.startTime)}–{fmtDigits(slot.endTime)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('دانش‌آموزان نیازمند توجه و پیگیری', 'Students Needing Follow-Up')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('گزارش کامل', 'Full Report')}
                </button>
              </div>
              {studentsNeedingAttention.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('موردی از افت تحصیلی یا غیبت مکرر ثبت نشده است.', 'No academic alerts or repeated absences detected.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {studentsNeedingAttention.slice(0, 5).map((stu) => (
                    <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{stu.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{stu.className}</p>
                      </div>
                      <div className="text-end tabular-nums">
                        {stu.gradesCount > 0 && (
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {tr('معدل:', 'Avg:')} {fmtNum(stu.average)}
                          </span>
                        )}
                        {stu.absences > 0 && (
                          <span className="ms-2 text-red-700 dark:text-red-400">
                            {fmtDigits(stu.absences)} {tr('غیبت', 'abs')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subject Performance & Assignments / Online Exams Reports */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('میانگین نمرات به تفکیک دروس تدریسی', 'Subject Performance Report')}
              subtitle={tr('میانگین واقعی نمرات ثبت‌شده در هر درس', 'Average recorded scores per subject')}
              data={
                (overview?.subjectAverages ?? []).map((s) => ({
                  label: s.label,
                  value: s.value,
                  sublabel: `${fmtDigits(s.count)} ${tr('نمره', 'grades')}`,
                }))
              }
            />

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش تکالیف و آزمون‌های آنلاین', 'Assignments & Online Exams Report')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('نرخ تحویل تکالیف و آمار مشارکت در آزمون‌ها', 'Submission completion and exam participation')}
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
                const ab = overview?.assignmentBreakdown ?? {
                  totalAssignments: overview?.assignmentsCount ?? 0,
                  expectedSubmissions: 0,
                  submittedCount: 0,
                  gradedCount: 0,
                  pendingReviewCount: overview?.awaitingReviewCount ?? 0,
                  completionRate: 0,
                };
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">
                          {tr('نرخ ارسال تکالیف دانش‌آموزان', 'Overall Assignment Submission Rate')}
                        </span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {fmtDigits(ab.completionRate)}{tr('٪', '%')}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-[#0F274A] dark:bg-sky-500 rounded-full transition-all duration-500"
                          style={{ width: `${ab.completionRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('کل ارسالی‌ها', 'Submitted')}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                          {fmtDigits(ab.submittedCount)} / {fmtDigits(ab.expectedSubmissions)}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('نمره‌داده‌شده', 'Graded')}</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                          {fmtDigits(ab.gradedCount)}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('منتظر بررسی', 'Pending')}</p>
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                          {fmtDigits(ab.pendingReviewCount)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {tr('آمار آزمون‌های آنلاین اخیر', 'Recent Online Exams Summary')}
                </p>
                {!overview?.examSummaries || overview.examSummaries.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                    {tr('آزمون آنلاینی برای کلاس‌های شما ثبت نشده است.', 'No online exams created yet.')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overview.examSummaries.slice(0, 3).map((ex) => (
                      <div key={ex.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{ex.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {ex.className} · {ex.subjectName}
                          </p>
                        </div>
                        <div className="text-end tabular-nums shrink-0">
                          <span className="font-bold text-[#0F274A] dark:text-sky-300">
                            {fmtDigits(ex.attemptsCount)} {tr('شرکت‌کننده', 'attempts')}
                          </span>
                          {ex.attemptsCount > 0 && (
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                              {tr('میانگین:', 'Avg:')} {fmtNum(ex.averageScore)} / {fmtDigits(ex.maxScore)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Class Performance Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('جدول گزارش خلاصه عملکرد کلاس‌ها', 'Class-by-Class Performance Matrix')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr('مقایسه تعداد دانش‌آموز، میانگین نمرات و نرخ حضور هر کلاس', 'Students count, GPA average, and attendance rate per class')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
              >
                {tr('مشاهده کلاس‌ها', 'View Classes')}
              </button>
            </div>
            {!overview?.classSummaries || overview.classSummaries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('کلاسی برای گزارش‌گیری اختصاص داده نشده است.', 'No assigned classes to summarize.')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-semibold text-start">{tr('نام کلاس', 'Class Name')}</th>
                      <th className="py-2 font-semibold text-start">{tr('پایه', 'Grade')}</th>
                      <th className="py-2 font-semibold text-start">{tr('دانش‌آموزان', 'Students')}</th>
                      <th className="py-2 font-semibold text-start">{tr('تعداد نمرات', 'Grades')}</th>
                      <th className="py-2 font-semibold text-start">{tr('نرخ حضور', 'Attendance')}</th>
                      <th className="py-2 font-semibold text-end">{tr('میانگین نمرات', 'Average GPA')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overview.classSummaries.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-300">{c.gradeLevel}</td>
                        <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{fmtDigits(c.studentsCount)}</td>
                        <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{fmtDigits(c.gradesCount)}</td>
                        <td className="py-2.5 tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                          {fmtDigits(c.attendanceRate)}{tr('٪', '%')}
                        </td>
                        <td className="py-2.5 text-end tabular-nums font-bold text-[#0F274A] dark:text-sky-300">
                          {c.gradesCount > 0 ? fmtNum(c.averageScore) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Performing Students & Recent Recorded Grades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('دانش‌آموزان برتر کلاس‌های شما', 'Top Performing Students')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('گزارش کامل', 'Full Report')}
                </button>
              </div>
              {!overview?.topStudents || overview.topStudents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('پس از ثبت نمرات، رتبه‌بندی دانش‌آموزان برتر نمایش داده می‌شود.', 'Top students appear once grades are recorded.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.topStudents.map((stu, idx) => (
                    <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-[#0F274A]/10 dark:bg-sky-500/15 text-[#0F274A] dark:text-sky-300 font-bold tabular-nums flex items-center justify-center shrink-0">
                          {fmtDigits(idx + 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{stu.fullName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {stu.className} · {fmtDigits(stu.gradesCount)} {tr('نمره', 'grades')}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                        {fmtNum(stu.average)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش آخرین نمرات ثبت‌شده', 'Recent Recorded Grades')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('grades')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('دفتر نمره', 'Gradebook')}
                </button>
              </div>
              {!overview?.recentGrades || overview.recentGrades.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('هنوز نمره‌ای ثبت نشده است.', 'No grades recorded yet.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.recentGrades.map((g) => (
                    <div key={g.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{g.studentName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {g.subjectName} · {g.title}
                        </p>
                      </div>
                      <div className="text-end tabular-nums shrink-0">
                        <span className="font-bold text-[#0F274A] dark:text-sky-300">
                          {fmtNum(g.score)} / {fmtDigits(g.maxScore)}
                        </span>
                        <span className="block text-[10px] text-slate-400">{fmtDate(g.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && <AIAssistantView user={user} />}

      {activeTab === 'classes' && (
        <div className="space-y-5">
          {classes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {tr('هنوز کلاسی به حساب کاربری شما اختصاص داده نشده است. لطفاً با مدیر مدرسه هماهنگ کنید.', 'No classes are assigned to your account yet.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((c) => {
                const count = students.filter((s) => s.classId === c.id).length;
                return (
                  <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tr('پایه', 'Grade')} {c.gradeLevel} · {c.room || tr('بدون شماره اتاق', 'No room')}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">{c.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 tabular-nums">
                      {tr('تعداد دانش‌آموزان:', 'Students:')} {fmtDigits(count)} {tr('نفر', '')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <DataTable
            data={students}
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجوی دانش‌آموز...', 'Search student...')}
            searchFilter={(r, q) =>
              r.fullName.toLowerCase().includes(q) || r.nationalId.toLowerCase().includes(q)
            }
            emptyTitle={tr('دانش‌آموزی در کلاس‌های شما ثبت نشده است', 'No students in your assigned classes')}
            emptyDescription={tr('پس از تخصیص دانش‌آموزان به کلاس‌های شما توسط مدیر، فهرست آن‌ها اینجا نمایش داده می‌شود.', 'Students assigned to your classes will appear here.')}
            columns={[
              {
                key: 'fullName',
                header: tr('نام و نام خانوادگی', 'Full Name'),
                sortValue: (r) => r.fullName,
                render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.fullName}</span>,
              },
              { key: 'class', header: tr('کلاس', 'Class'), render: (r) => classMap.get(r.classId ?? '')?.name ?? '—' },
              { key: 'gradeLevel', header: tr('پایه', 'Grade Level'), render: (r) => r.gradeLevel || '—' },
              {
                key: 'nationalId',
                header: tr('کد ملی', 'National ID'),
                render: (r) => <span className="font-mono text-xs tabular-nums">{r.nationalId ? fmtDigits(r.nationalId) : '—'}</span>,
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'grades' && (
        <div className="space-y-4">
          <DataTable
            data={grades.filter((g) => selectedClassFilter === 'all' || g.classId === selectedClassFilter)}
            columns={gradeCols}
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجو در نام دانش‌آموز یا عنوان آزمون...', 'Search student or title...')}
            searchFilter={(r, q) =>
              r.title.toLowerCase().includes(q) ||
              (studentMap.get(r.studentId)?.fullName ?? '').toLowerCase().includes(q)
            }
            emptyTitle={tr('نمره‌ای ثبت نشده است', 'No grades recorded')}
            emptyDescription={tr('برای ثبت نمره جدید روی دکمه «ثبت نمره جدید» کلیک کنید.', 'Click Record Grade to enter scores.')}
            toolbarExtra={
              <>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <option value="all">{tr('همه کلاس‌های من', 'All My Classes')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setActiveTab('report_card')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Printer className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>{tr('چاپ کارنامه پیشرفته', 'Advanced Report Card')}</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateGradeModal}
                  disabled={classes.length === 0 || students.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('ثبت نمره جدید', 'Record Grade')}</span>
                </button>
              </>
            }
          />

          <Modal
            open={gradeModalOpen}
            onClose={() => setGradeModalOpen(false)}
            title={editingGrade ? tr('ویرایش نمره', 'Edit Grade') : tr('ثبت نمره جدید', 'Record New Grade')}
          >
            <form onSubmit={handleSaveGrade} className="space-y-4">
              {!editingGrade && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس', 'Class')}</label>
                      <select
                        value={grdClassId}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setGrdClassId(cid);
                          const stu = students.find((s) => s.classId === cid);
                          setGrdStudentId(stu?.id ?? '');
                        }}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دانش‌آموز', 'Student')}</label>
                      <select
                        required
                        value={grdStudentId}
                        onChange={(e) => setGrdStudentId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        {students
                          .filter((s) => s.classId === grdClassId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.fullName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('درس', 'Subject')}</label>
                    <select
                      required
                      value={grdSubjectId}
                      onChange={(e) => setGrdSubjectId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({tr('پایه', 'Grade')} {sub.gradeLevel})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('عنوان ارزشیابی', 'Assessment Title')}</label>
                  <input
                    type="text"
                    required
                    value={grdTitle}
                    onChange={(e) => setGrdTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نوبت', 'Term')}</label>
                  <select
                    value={grdTerm}
                    onChange={(e) => setGrdTerm(e.target.value as GradeTerm)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="مستمر اول">{termLabel('مستمر اول')}</option>
                    <option value="نوبت اول">{termLabel('نوبت اول')}</option>
                    <option value="مستمر دوم">{termLabel('مستمر دوم')}</option>
                    <option value="نوبت دوم">{termLabel('نوبت دوم')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نمره کسب‌شده', 'Score')}</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max={Number(grdMaxScore) || 20}
                    required
                    dir="ltr"
                    value={grdScore}
                    onChange={(e) => setGrdScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('سقف نمره', 'Max')}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    dir="ltr"
                    value={grdMaxScore}
                    onChange={(e) => setGrdMaxScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('تاریخ', 'Date')}</label>
                  <input
                    type="text"
                    value={grdDate}
                    onChange={(e) => setGrdDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('توضیحات (اختیاری)', 'Note (Optional)')}</label>
                <input
                  type="text"
                  value={grdNote}
                  onChange={(e) => setGrdNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGradeModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {tr('انصراف', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                >
                  {tr('ذخیره نمره', 'Save Grade')}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {activeTab === 'exams' && (
        <OnlineExamsView user={user} exams={exams} classes={classes} subjects={subjects} onReload={loadAll} />
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveBatchAttendance} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr('ثبت حضور و غیاب کلاسی', 'Record Class Attendance')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr('کلاس و تاریخ را انتخاب کرده و وضعیت هر دانش‌آموز را ثبت کنید', 'Select class and date, then mark each student')}
                </p>
              </div>
              <button
                type="submit"
                disabled={savingAtt || attClassStudents.length === 0}
                className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {savingAtt ? tr('در حال ثبت...', 'Saving...') : tr('ذخیره حضور و غیاب کلاس', 'Save Class Attendance')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس', 'Class')}</label>
                <select
                  value={attClassId}
                  onChange={(e) => setAttClassId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('درس (اختیاری)', 'Subject (Optional)')}</label>
                <select
                  value={attSubjectId}
                  onChange={(e) => setAttSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">{tr('حضور روزانه', 'Daily Roll Call')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('تاریخ', 'Date')}</label>
                <input
                  type="text"
                  required
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            </div>

            {attClassStudents.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                {tr('دانش‌آموزی در این کلاس ثبت نشده است.', 'No students enrolled in this class.')}
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {attClassStudents.map((stu) => {
                  const val = attEntries[stu.id] ?? { status: 'present', note: '' };
                  return (
                    <div key={stu.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-[160px]">{stu.fullName}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['present', 'absent', 'late', 'excused'] as const).map((statusKey) => {
                          const active = val.status === statusKey;
                          const activeColor =
                            statusKey === 'present'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                              : statusKey === 'absent'
                              ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
                              : statusKey === 'late'
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200';
                          return (
                            <button
                              key={statusKey}
                              type="button"
                              onClick={() =>
                                setAttEntries((prev) => ({
                                  ...prev,
                                  [stu.id]: { ...val, status: statusKey },
                                }))
                              }
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                active
                                  ? `${activeColor} font-bold`
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {attendanceLabel(statusKey)}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        placeholder={tr('توضیح (اختیاری)', 'Note (optional)')}
                        value={val.note}
                        onChange={(e) =>
                          setAttEntries((prev) => ({
                            ...prev,
                            [stu.id]: { ...val, note: e.target.value },
                          }))
                        }
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs min-w-[180px]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </form>

          <DataTable
            data={attendance}
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجو در سابقه حضور و غیاب...', 'Search attendance history...')}
            searchFilter={(r, q) =>
              (studentMap.get(r.studentId)?.fullName ?? '').toLowerCase().includes(q) ||
              r.date.toLowerCase().includes(q)
            }
            columns={[
              {
                key: 'student',
                header: tr('دانش‌آموز', 'Student'),
                render: (r) => <span className="font-semibold">{studentMap.get(r.studentId)?.fullName ?? '—'}</span>,
              },
              { key: 'class', header: tr('کلاس', 'Class'), render: (r) => classMap.get(r.classId)?.name ?? '—' },
              { key: 'date', header: tr('تاریخ', 'Date'), render: (r) => <span className="tabular-nums">{fmtDate(r.date)}</span> },
              {
                key: 'status',
                header: tr('وضعیت', 'Status'),
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
              { key: 'note', header: tr('توضیحات', 'Note'), render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.note || '—'}</span> },
            ]}
          />
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr('تکالیف کلاس‌های شما', 'Your Class Assignments')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr('تعریف تکلیف جدید و بررسی پاسخ‌های ارسالی دانش‌آموزان', 'Create assignments and grade student submissions')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAsgModalOpen(true)}
              disabled={classes.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('تعریف تکلیف جدید', 'New Assignment')}</span>
            </button>
          </div>

          {assignments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {tr('هنوز تکلیفی تعریف نکرده‌اید.', 'You have not created any assignments yet.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map((asg) => (
                <div key={asg.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      <span>
                        {classMap.get(asg.classId)?.name ?? asg.className ?? tr('کلاس', 'Class')} · {subjectMap.get(asg.subjectId)?.name ?? asg.subjectName ?? tr('درس', 'Subject')}
                      </span>
                      <span className="tabular-nums">{tr('مهلت:', 'Due:')} {fmtDate(asg.dueDate)}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{asg.title}</h3>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-6">{asg.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      {tr('ارسال‌شده:', 'Submitted:')} {fmtDigits(asg.submissionsCount)} · {tr('نمره‌داده‌شده:', 'Graded:')} {fmtDigits(asg.gradedCount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openSubmissionsModal(asg)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                    >
                      {tr('بررسی و نمره‌دهی', 'Review & Grade')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Modal open={asgModalOpen} onClose={() => setAsgModalOpen(false)} title={tr('تعریف تکلیف جدید', 'Create New Assignment')}>
            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('عنوان تکلیف', 'Assignment Title')}</label>
                <input
                  type="text"
                  required
                  value={asgTitle}
                  onChange={(e) => setAsgTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس', 'Class')}</label>
                  <select
                    value={asgClassId}
                    onChange={(e) => setAsgClassId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('درس', 'Subject')}</label>
                  <select
                    value={asgSubjectId}
                    onChange={(e) => setAsgSubjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('مهلت تحویل', 'Due Date')}</label>
                  <input
                    type="text"
                    required
                    value={asgDueDate}
                    onChange={(e) => setAsgDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('سقف نمره', 'Max Score')}</label>
                  <input
                    type="number"
                    required
                    dir="ltr"
                    value={asgMaxScore}
                    onChange={(e) => setAsgMaxScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('شرح تکلیف', 'Instructions')}</label>
                <textarea
                  rows={4}
                  required
                  value={asgDesc}
                  onChange={(e) => setAsgDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAsgModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {tr('انصراف', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                >
                  {tr('ثبت تکلیف', 'Publish Assignment')}
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            open={!!subsModalAsg}
            onClose={() => setSubsModalAsg(null)}
            title={`${tr('وضعیت انجام تکلیف:', 'Submissions:')} ${subsModalAsg?.title ?? ''}`}
            maxWidthClass="max-w-2xl"
          >
            {subsRows.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('دانش‌آموزی در این کلاس ثبت نشده است.', 'No students enrolled in this class.')}
              </p>
            ) : (
              <div className="space-y-4">
                {subsRows.map((row) => {
                  const inp = gradingInputs[row.studentId] ?? { score: '', feedback: '' };
                  return (
                    <div key={row.studentId} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{row.studentName}</span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {submissionLabel(row.submission.status)}
                        </span>
                      </div>
                      {row.submission.submittedText ? (
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          <p>{row.submission.submittedText}</p>
                          {row.submission.attachmentUrl && (
                            <a
                              href={row.submission.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-sky-700 dark:text-sky-400 hover:underline font-medium"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>{row.submission.attachmentName || tr('پیوست دانش‌آموز', 'Student Attachment')}</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{tr('هنوز پاسخی ارسال نکرده است.', 'No submission yet.')}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max={subsModalAsg?.maxScore ?? 20}
                          placeholder={tr('نمره', 'Score')}
                          dir="ltr"
                          value={inp.score}
                          onChange={(e) =>
                            setGradingInputs((prev) => ({
                              ...prev,
                              [row.studentId]: { ...inp, score: e.target.value },
                            }))
                          }
                          className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs font-mono text-left"
                        />
                        <input
                          type="text"
                          placeholder={tr('بازخورد معلم (اختیاری)', 'Feedback (optional)')}
                          value={inp.feedback}
                          onChange={(e) =>
                            setGradingInputs((prev) => ({
                              ...prev,
                              [row.studentId]: { ...inp, feedback: e.target.value },
                            }))
                          }
                          className="flex-1 min-w-[160px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleGradeSubmission(row.studentId)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                        >
                          {tr('ثبت نمره', 'Save Score')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Modal>
        </div>
      )}

      {activeTab === 'report_card' && (
        <AdvancedReportCardView
          user={user}
          settings={settings}
          classes={classes}
          students={students}
          initialClassId={selectedClassFilter !== 'all' ? selectedClassFilter : undefined}
        />
      )}

      {activeTab === 'reports' && (
        <DataTable
          data={studentPerformanceRows}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی دانش‌آموز...', 'Search student...')}
          searchFilter={(r, q) => r.fullName.toLowerCase().includes(q)}
          toolbarExtra={
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{tr('همه کلاس‌های من', 'All My Classes')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          }
          columns={[
            {
              key: 'fullName',
              header: tr('نام دانش‌آموز', 'Student Name'),
              sortValue: (r) => r.fullName,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.fullName}</span>,
            },
            { key: 'className', header: tr('کلاس', 'Class'), render: (r) => r.className },
            {
              key: 'gradesCount',
              header: tr('تعداد نمرات', 'Grades'),
              sortValue: (r) => r.gradesCount,
              render: (r) => <span className="tabular-nums">{fmtDigits(r.gradesCount)}</span>,
            },
            {
              key: 'average',
              header: tr('میانگین نمره', 'Average'),
              sortValue: (r) => r.average,
              render: (r) => (
                <span className={`font-bold tabular-nums ${r.average >= 12 ? 'text-emerald-700 dark:text-emerald-400' : r.gradesCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`}>
                  {r.gradesCount > 0 ? fmtNum(r.average) : '—'}
                </span>
              ),
            },
            {
              key: 'absences',
              header: tr('غیبت‌ها', 'Absences'),
              sortValue: (r) => r.absences,
              render: (r) => <span className="tabular-nums text-red-700 dark:text-red-400">{fmtDigits(r.absences)}</span>,
            },
            {
              key: 'lates',
              header: tr('تأخیرها', 'Lates'),
              sortValue: (r) => r.lates,
              render: (r) => <span className="tabular-nums text-amber-700 dark:text-amber-400">{fmtDigits(r.lates)}</span>,
            },
          ]}
        />
      )}

      {activeTab === 'schedule' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
            {tr('برنامه هفتگی کلاس‌های شما', 'Your Weekly Schedule')}
          </h2>
          {schedules.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
              {tr('برنامه هفتگی ثبت نشده است.', 'No weekly schedule configured.')}
            </p>
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
                      <p className="p-4 text-xs text-slate-400 dark:text-slate-500">{tr('کلاسی ثبت نشده است', 'No sessions')}</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {daySlots.map((slot) => (
                          <div key={slot.id} className="p-3.5 text-xs">
                            <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                              <span>{subjectMap.get(slot.subjectId)?.name ?? tr('درس', 'Subject')}</span>
                              <span className="text-[#0F274A] dark:text-sky-400 tabular-nums">
                                {tr('زنگ', 'Period')} {fmtDigits(slot.period)}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 mt-1">
                              {tr('کلاس:', 'Class:')} {classMap.get(slot.classId)?.name ?? '—'}
                            </p>
                            <p className="text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                              {fmtDigits(slot.startTime)} {tr('تا', '–')} {fmtDigits(slot.endTime)}
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

      {activeTab === 'private_tutor' && (
        <PrivateTutorView user={user} subjects={subjects} students={students} onSavedToPlanner={loadAll} />
      )}

      {activeTab === 'academic_risk' && (
        <AcademicRiskView />
      )}

      {activeTab === 'library' && (
        <DigitalLibraryView user={user} subjects={subjects} />
      )}

      {activeTab === 'honors' && (
        <HonorsView user={user} students={students} />
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

      {activeTab === 'announcements' && (
        <AnnouncementsView user={user} announcements={announcements} classes={classes} onReload={loadAll} />
      )}

      {activeTab === 'messages' && (
        <MessagesView
          user={user}
          messages={messages}
          recipients={scopedRecipients}
          onReload={loadAll}
          chatUnreadCount={chatUnreadCount}
          onChatUnreadChange={setChatUnreadCount}
        />
      )}

      {activeTab === 'profile' && <ProfileView user={user} onUpdated={onUserUpdated} />}
    </AppShell>
  );
}
