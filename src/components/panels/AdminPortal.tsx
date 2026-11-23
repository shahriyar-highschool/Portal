import {
  Activity,
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Bot,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileQuestion,
  FileSpreadsheet,
  GraduationCap,
  History,
  LayoutDashboard,
  Mail,
  Medal,
  Megaphone,
  Plus,
  Printer,
  School,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import type {
  AcademicHistoryRecord,
  Announcement,
  Assignment,
  AttendanceRecord,
  AuditLog,
  BulkUserImportCreatedItem,
  BulkUserImportRow,
  CalendarEvent,
  ChatThreadSummary,
  DirectMessage,
  GradeRecord,
  GradeTerm,
  ProfileChangeFields,
  ProfileChangeRequest,
  RolePermissionConfig,
  ScheduleSlot,
  SchoolClass,
  SchoolSettings,
  StudyPlanTask,
  Subject,
  UserAccount,
  UserRole,
} from '../../../shared/types';
import { apiRequest, isWorkerApiMode } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { GRADE_LEVELS_FA } from '../../lib/persian';
import { AIAssistantView } from '../ai/AIAssistantView';
import { PrivateTutorView } from '../ai/PrivateTutorView';
import { AcademicCalendarView } from '../education/AcademicCalendarView';
import { AcademicRiskView } from '../education/AcademicRiskView';
import { AdvancedReportCardView } from '../education/AdvancedReportCardView';
import { DigitalLibraryView } from '../education/DigitalLibraryView';
import { HonorsView } from '../education/HonorsView';
import { OnlineExamsView, type EnrichedExam } from '../education/OnlineExamsView';
import { StudyPlannerView } from '../education/StudyPlannerView';
import { AppShell, type NavItem } from '../layout/AppShell';
import { AnnouncementsView, MessagesView, ProfileView } from '../shared/AccountAndComms';
import { AttendanceBreakdownChart, HorizontalBarChart, LineTrendChart } from '../ui/Charts';
import { DataTable } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { StatCard } from '../ui/StatCard';
import { useToast } from '../ui/Toast';

interface AdminOverview {
  studentsCount: number;
  activeStudentsCount: number;
  activeAccountsCount: number;
  inactiveAccountsCount: number;
  teachersCount: number;
  classesCount: number;
  subjectsCount: number;
  gradesCount: number;
  schoolAverage: number;
  assignmentsCount: number;
  activeExamsCount: number;
  completedExamsCount: number;
  announcementsCount: number;
  pendingProfileRequestsCount: number;
  attendanceStats: { total: number; present: number; absent: number; late: number; excused: number };
  classAverages: Array<{ label: string; value: number; students: number }>;
  subjectAverages: Array<{ label: string; value: number; count: number }>;
  termTrend: Array<{ label: string; value: number; count?: number }>;
  gradeDistribution?: Array<{ label: string; count: number }>;
  gradeLevelStats?: Array<{
    label: string;
    studentsCount: number;
    classesCount: number;
    averageScore: number;
    attendanceRate: number;
  }>;
  classPerformance?: Array<{
    id: string;
    name: string;
    gradeLevel: string;
    studentsCount: number;
    capacity: number;
    gradesCount: number;
    averageScore: number;
    attendanceRate: number;
  }>;
  topStudents?: Array<{
    id: string;
    fullName: string;
    className: string;
    gradesCount: number;
    average: number;
    absences: number;
  }>;
  attentionStudents?: Array<{
    id: string;
    fullName: string;
    className: string;
    gradesCount: number;
    average: number;
    absences: number;
  }>;
  roleBreakdown?: {
    studentsActive: number;
    studentsInactive: number;
    teachersActive: number;
    teachersInactive: number;
    adminsCount: number;
  };
  engagementStats?: {
    assignmentsCount: number;
    totalSubmissions: number;
    gradedSubmissions: number;
    submissionRate: number;
    examsCount: number;
    examAttemptsCount: number;
    avgExamPercent: number;
    studyPlansCount: number;
    completedStudyPlansCount: number;
    directMessagesCount: number;
    calendarEventsCount: number;
  };
  recentActivity: AuditLog[];
}

function normalizeExcelDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function normalizeExcelHeaderKey(key: string): string {
  return key
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[()（）\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pickExcelCell(row: Record<string, unknown>, aliases: string[]): string {
  for (const [rawKey, rawVal] of Object.entries(row)) {
    const norm = normalizeExcelHeaderKey(rawKey);
    if (aliases.some((alias) => norm === alias || norm.startsWith(`${alias} `))) {
      const val = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();
      if (val) return val;
    }
  }
  return '';
}

function detectExcelRowRole(rawRole: string, mode: 'student' | 'teacher' | 'mixed'): 'student' | 'teacher' {
  if (mode === 'student') return 'student';
  if (mode === 'teacher') return 'teacher';
  const cleaned = rawRole
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .trim()
    .toLowerCase();
  if (
    cleaned.includes('معلم') ||
    cleaned.includes('دبیر') ||
    cleaned.includes('استاد') ||
    cleaned.includes('teacher')
  ) {
    return 'teacher';
  }
  return 'student';
}

function normalizeImportedGrade(raw: string): string {
  const cleaned = normalizeExcelDigits(raw).trim();
  if (!cleaned) return '';
  if (cleaned.includes('هفت') || /(^|\D)7(\D|$)/.test(cleaned)) return 'هفتم';
  if (cleaned.includes('هشت') || /(^|\D)8(\D|$)/.test(cleaned)) return 'هشتم';
  if (cleaned.includes('نه') || /(^|\D)9(\D|$)/.test(cleaned)) return 'نهم';
  return cleaned;
}

const PERMISSION_LABELS: Record<string, { fa: string; en: string }> = {
  manage_users: { fa: 'مدیریت کاربران', en: 'Manage Users' },
  manage_roles: { fa: 'مدیریت نقش‌ها و دسترسی‌ها', en: 'Manage Roles & Permissions' },
  manage_classes: { fa: 'مدیریت کلاس‌ها', en: 'Manage Classes' },
  manage_subjects: { fa: 'مدیریت دروس', en: 'Manage Subjects' },
  manage_grades: { fa: 'مدیریت نمرات کل مدرسه', en: 'Manage School Grades' },
  manage_attendance: { fa: 'مدیریت حضور و غیاب', en: 'Manage Attendance' },
  manage_assignments: { fa: 'مدیریت تکالیف', en: 'Manage Assignments' },
  manage_schedules: { fa: 'مدیریت برنامه هفتگی', en: 'Manage Weekly Schedules' },
  manage_announcements: { fa: 'مدیریت اطلاعیه‌ها', en: 'Manage Announcements' },
  view_reports: { fa: 'مشاهده گزارش‌های آماری', en: 'View Analytics Reports' },
  manage_settings: { fa: 'مدیریت تنظیمات سامانه', en: 'Manage System Settings' },
  view_audit_logs: { fa: 'مشاهده گزارش فعالیت کاربران', en: 'View Audit Logs' },
  use_ai_admin: { fa: 'دستیار هوش مصنوعی مدیریت', en: 'Admin AI Assistant' },
  view_assigned_classes: { fa: 'مشاهده کلاس‌های اختصاص‌یافته', en: 'View Assigned Classes' },
  manage_assigned_grades: { fa: 'ثبت نمرات کلاس‌های مجاز', en: 'Manage Assigned Class Grades' },
  manage_assigned_attendance: { fa: 'ثبت حضور و غیاب کلاس‌های مجاز', en: 'Manage Assigned Attendance' },
  manage_assigned_assignments: { fa: 'مدیریت تکالیف کلاس‌های مجاز', en: 'Manage Assigned Assignments' },
  send_class_announcements: { fa: 'ارسال اطلاعیه کلاسی', en: 'Send Class Announcements' },
  view_class_reports: { fa: 'مشاهده گزارش عملکرد کلاس', en: 'View Class Reports' },
  use_ai_teacher: { fa: 'دستیار هوش مصنوعی معلم', en: 'Teacher AI Assistant' },
  view_own_grades: { fa: 'مشاهده نمرات و کارنامه شخصی', en: 'View Own Grades' },
  view_own_attendance: { fa: 'مشاهده حضور و غیاب شخصی', en: 'View Own Attendance' },
  view_own_assignments: { fa: 'مشاهده تکالیف', en: 'View Own Assignments' },
  submit_assignments: { fa: 'ارسال پاسخ تکلیف', en: 'Submit Assignments' },
  view_own_schedule: { fa: 'مشاهده برنامه هفتگی', en: 'View Own Schedule' },
  view_announcements: { fa: 'مشاهده اطلاعیه‌ها', en: 'View Announcements' },
  use_ai_student: { fa: 'دستیار هوش مصنوعی دانش‌آموز', en: 'Student AI Assistant' },
};

export function AdminPortal({
  user,
  settings,
  onSettingsUpdated,
  onUserUpdated,
  onLogout,
}: {
  user: UserAccount;
  settings: SchoolSettings | null;
  onSettingsUpdated: (s: SchoolSettings) => void;
  onUserUpdated: (u: UserAccount) => void;
  onLogout: () => void;
}) {
  const {
    lang,
    tr,
    fmtNum,
    fmtDigits,
    fmtDate,
    fmtDateTime,
    roleLabel,
    termLabel,
    weekdayLabel,
    attendanceLabel,
    schoolTitle,
  } = useI18n();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RolePermissionConfig[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [profileRequests, setProfileRequests] = useState<ProfileChangeRequest[]>([]);
  const [exams, setExams] = useState<EnrichedExam[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlanTask[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Dashboard quick search
  const [quickSearch, setQuickSearch] = useState('');

  // Profile change review state
  const [reqFilter, setReqFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [rejectModalReq, setRejectModalReq] = useState<ProfileChangeRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewingReqId, setReviewingReqId] = useState<string | null>(null);

  // Filterable reports state
  const [repGradeLevel, setRepGradeLevel] = useState('all');
  const [repClassId, setRepClassId] = useState('all');
  const [repSubjectId, setRepSubjectId] = useState('all');

  // User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [uFullName, setUFullName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uNationalId, setUNationalId] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('student');
  const [uPhone, setUPhone] = useState('');
  const [uGradeLevel, setUGradeLevel] = useState('هفتم');
  const [uClassId, setUClassId] = useState('');
  const [uAssignedClasses, setUAssignedClasses] = useState<string[]>([]);
  const [uAssignedSubjects, setUAssignedSubjects] = useState<string[]>([]);
  const [uPermissions, setUPermissions] = useState<string[]>([]);
  const [uActive, setUActive] = useState(true);

  // Account credential visibility & copy feedback
  const [revealedPasswordIds, setRevealedPasswordIds] = useState<Set<string>>(() => new Set());
  const [copiedCredKey, setCopiedCredKey] = useState<string | null>(null);
  const [createdCredsAnnouncement, setCreatedCredsAnnouncement] = useState<{
    fullName: string;
    role: UserRole;
    username: string;
    password: string;
    autoGeneratedUsername: boolean;
    autoGeneratedPassword: boolean;
  } | null>(null);

  // Excel Bulk Import Modal
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [excelMode, setExcelMode] = useState<'student' | 'teacher' | 'mixed'>('mixed');
  const [excelAutoCreateClasses, setExcelAutoCreateClasses] = useState(true);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState<BulkUserImportRow[]>([]);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelResult, setExcelResult] = useState<{
    created: BulkUserImportCreatedItem[];
    errors: Array<{ rowNumber: number; fullName?: string; error: string }>;
    createdClassesCount: number;
    message: string;
  } | null>(null);

  // Class Modal
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [cName, setCName] = useState('');
  const [cGradeLevel, setCGradeLevel] = useState('هفتم');
  const [cCapacity, setCCapacity] = useState('30');
  const [cRoom, setCRoom] = useState('');
  const [cTeachers, setCTeachers] = useState<string[]>([]);
  const [cSubjects, setCSubjects] = useState<string[]>([]);

  // Subject Modal
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [sName, setSName] = useState('');
  const [sCode, setSCode] = useState('');
  const [sGradeLevel, setSGradeLevel] = useState('هفتم');
  const [sCoeff, setSCoeff] = useState('3');
  const [sTeacherId, setSTeacherId] = useState('');

  // Schedule form
  const [schClassFilter, setSchClassFilter] = useState('');
  const [schModalOpen, setSchModalOpen] = useState(false);
  const [schDay, setSchDay] = useState(0);
  const [schPeriod, setSchPeriod] = useState(1);
  const [schStart, setSchStart] = useState('08:00');
  const [schEnd, setSchEnd] = useState('09:30');
  const [schSubjectId, setSchSubjectId] = useState('');
  const [schTeacherId, setSchTeacherId] = useState('');
  const [schRoom, setSchRoom] = useState('');

  // Settings form
  const [cfgSchoolName, setCfgSchoolName] = useState(settings?.schoolName ?? 'دبیرستان استعدادهای درخشان استاد شهریار');
  const [cfgAcademicYear, setCfgAcademicYear] = useState(settings?.academicYear ?? '۱۴۰۴-۱۴۰۵');
  const [cfgPrincipal, setCfgPrincipal] = useState(settings?.principalName ?? '');
  const [cfgTerm, setCfgTerm] = useState<GradeTerm>(settings?.currentTerm ?? 'نوبت اول');
  const [cfgPassing, setCfgPassing] = useState(String(settings?.passingScore ?? 10));
  const [cfgAiEnabled, setCfgAiEnabled] = useState(settings?.aiEnabled ?? true);
  const [cfgAsgSub, setCfgAsgSub] = useState(settings?.allowStudentAssignmentSubmission ?? true);

  // Admin Grade modal & student selector
  const [selectedGradeStudentId, setSelectedGradeStudentId] = useState('');
  const [grdModalOpen, setGrdModalOpen] = useState(false);
  const [grdStudentId, setGrdStudentId] = useState('');
  const [grdSubjectId, setGrdSubjectId] = useState('');
  const [grdSubjectName, setGrdSubjectName] = useState('');
  const [grdTitle, setGrdTitle] = useState('');
  const [grdScore, setGrdScore] = useState('');
  const [grdTerm, setGrdTerm] = useState<GradeTerm>('نوبت اول');

  // Academic History Modal (Admin)
  const [historyStudent, setHistoryStudent] = useState<UserAccount | null>(null);
  const [studentHistories, setStudentHistories] = useState<AcademicHistoryRecord[]>([]);
  const [loadingHistories, setLoadingHistories] = useState(false);
  const [hisYear, setHisYear] = useState('۱۴۰۳-۱۴۰۴');
  const [hisGradeLevel, setHisGradeLevel] = useState('نهم');
  const [hisGpa, setHisGpa] = useState('');
  const [hisStatus, setHisStatus] = useState<AcademicHistoryRecord['status']>('قبول');
  const [hisSummary, setHisSummary] = useState('');
  const [savingHistory, setSavingHistory] = useState(false);

  // Batch / Single Attendance Modal & student selector (Admin)
  const [selectedAttStudentId, setSelectedAttStudentId] = useState('');
  const [attModalOpen, setAttModalOpen] = useState(false);
  const [attMode, setAttMode] = useState<'class' | 'single'>('class');
  const [attClassId, setAttClassId] = useState('');
  const [attSubjectId, setAttSubjectId] = useState('');
  const [attSingleStudentId, setAttSingleStudentId] = useState('');
  const [attSingleStatus, setAttSingleStatus] = useState<AttendanceRecord['status']>('present');
  const [attSingleNote, setAttSingleNote] = useState('');
  const [attDate, setAttDate] = useState(() => new Date().toLocaleDateString('fa-IR'));
  const [attEntries, setAttEntries] = useState<Record<string, { status: AttendanceRecord['status']; note: string }>>({});
  const [savingAtt, setSavingAtt] = useState(false);

  const workerMode = isWorkerApiMode();

  const fetchGradesForStudent = useCallback(async (studentId: string) => {
    if (!studentId) {
      setGrades([]);
      return;
    }
    try {
      const res = await apiRequest<{ grades: GradeRecord[] }>(
        `/api/grades?studentId=${encodeURIComponent(studentId)}`
      );
      setGrades(res.grades ?? []);
    } catch {
      // handled by apiRequest toast
    }
  }, []);

  const fetchAttendanceForStudent = useCallback(async (studentId: string) => {
    if (!studentId) {
      setAttendance([]);
      return;
    }
    try {
      const res = await apiRequest<{ attendance: AttendanceRecord[] }>(
        `/api/attendance?studentId=${encodeURIComponent(studentId)}`
      );
      setAttendance(res.attendance ?? []);
    } catch {
      // handled by apiRequest toast
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        apiRequest<AdminOverview>('/api/reports/overview'),
        apiRequest<{ users: UserAccount[] }>('/api/users'),
        apiRequest<{ roles: RolePermissionConfig[] }>('/api/roles'),
        apiRequest<{ classes: SchoolClass[] }>('/api/classes'),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
        workerMode
          ? Promise.resolve({ grades: [] as GradeRecord[] })
          : apiRequest<{ grades: GradeRecord[] }>('/api/grades'),
        workerMode
          ? Promise.resolve({ attendance: [] as AttendanceRecord[] })
          : apiRequest<{ attendance: AttendanceRecord[] }>('/api/attendance'),
        apiRequest<{ assignments: Assignment[] }>('/api/assignments'),
        apiRequest<{ schedules: ScheduleSlot[] }>('/api/schedules'),
        apiRequest<{ announcements: Announcement[] }>('/api/announcements'),
        apiRequest<{ messages: DirectMessage[] }>('/api/messages'),
        apiRequest<{ logs: AuditLog[] }>('/api/audit-logs'),
        apiRequest<{ requests: ProfileChangeRequest[] }>('/api/profile-requests'),
        apiRequest<{ exams: EnrichedExam[] }>('/api/exams'),
        apiRequest<{ plans: StudyPlanTask[] }>('/api/study-plans'),
        apiRequest<{ events: CalendarEvent[] }>('/api/calendar-events'),
        apiRequest<{ threads: ChatThreadSummary[] }>('/api/chat/threads'),
      ]);

      const [ov, usr, rls, cls, sub, grd, att, asg, sch, ann, msg, logs, preq, exm, stp, cal, chatTh] = results;

      if (ov.status === 'fulfilled') {
        setOverview(ov.value);
      } else {
        showToast(
          ov.reason instanceof Error
            ? ov.reason.message
            : tr('خطا در دریافت اطلاعات پنل مدیریت', 'Failed to load admin portal'),
          'error'
        );
      }

      if (usr.status === 'fulfilled') {
        const allUsers = usr.value.users ?? [];
        setUsers(allUsers);
        const firstStudentId = allUsers.find((u) => u.role === 'student')?.id ?? '';
        if (workerMode && firstStudentId) {
          setSelectedGradeStudentId((prev) => prev || firstStudentId);
          setSelectedAttStudentId((prev) => prev || firstStudentId);
        }
      }
      if (rls.status === 'fulfilled') setRoles(rls.value.roles ?? []);
      if (cls.status === 'fulfilled') {
        const list = cls.value.classes ?? [];
        setClasses(list);
        if (list.length > 0) {
          setSchClassFilter((prev) => prev || list[0].id);
        }
      }
      if (sub.status === 'fulfilled') setSubjects(sub.value.subjects ?? []);
      if (!workerMode && grd.status === 'fulfilled') setGrades(grd.value.grades ?? []);
      if (!workerMode && att.status === 'fulfilled') setAttendance(att.value.attendance ?? []);
      if (asg.status === 'fulfilled') setAssignments(asg.value.assignments ?? []);
      if (sch.status === 'fulfilled') setSchedules(sch.value.schedules ?? []);
      if (ann.status === 'fulfilled') setAnnouncements(ann.value.announcements ?? []);
      if (msg.status === 'fulfilled') setMessages(msg.value.messages ?? []);
      if (logs.status === 'fulfilled') setAuditLogs(logs.value.logs ?? []);
      if (preq.status === 'fulfilled') setProfileRequests(preq.value.requests ?? []);
      if (exm.status === 'fulfilled') setExams(exm.value.exams ?? []);
      if (stp.status === 'fulfilled') setStudyPlans(stp.value.plans ?? []);
      if (cal.status === 'fulfilled') setCalendarEvents(cal.value.events ?? []);
      if (chatTh.status === 'fulfilled') {
        setChatUnreadCount((chatTh.value.threads ?? []).reduce((sum, th) => sum + th.unreadCount, 0));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت اطلاعات پنل مدیریت', 'Failed to load admin portal'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr, workerMode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (workerMode && selectedGradeStudentId) {
      void fetchGradesForStudent(selectedGradeStudentId);
    }
  }, [workerMode, selectedGradeStudentId, fetchGradesForStudent]);

  useEffect(() => {
    if (workerMode && selectedAttStudentId) {
      void fetchAttendanceForStudent(selectedAttStudentId);
    }
  }, [workerMode, selectedAttStudentId, fetchAttendanceForStudent]);

  useEffect(() => {
    if (settings) {
      setCfgSchoolName(settings.schoolName);
      setCfgAcademicYear(settings.academicYear);
      setCfgPrincipal(settings.principalName);
      setCfgTerm(settings.currentTerm);
      setCfgPassing(String(settings.passingScore));
      setCfgAiEnabled(settings.aiEnabled);
      setCfgAsgSub(settings.allowStudentAssignmentSubmission);
    }
  }, [settings]);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const teachers = useMemo(() => users.filter((u) => u.role === 'teacher'), [users]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const unreadMessages = useMemo(
    () => messages.filter((m) => m.senderId !== user.id && !m.readBy.includes(user.id)),
    [messages, user.id]
  );

  const pendingProfileRequests = useMemo(
    () => profileRequests.filter((r) => r.status === 'pending'),
    [profileRequests]
  );

  const quickSearchResults = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return [];
    const matchedUsers = users
      .filter((u) => u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.nationalId.toLowerCase().includes(q))
      .slice(0, 5)
      .map((u) => ({
        id: u.id,
        title: u.fullName,
        sub: `${roleLabel(u.role)} · ${u.username}`,
        tab: u.role === 'student' ? 'students' : u.role === 'teacher' ? 'teachers' : 'accounts',
      }));
    const matchedClasses = classes
      .filter((c) => c.name.toLowerCase().includes(q) || c.gradeLevel.toLowerCase().includes(q))
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        title: c.name,
        sub: `${tr('کلاس · پایه', 'Class · Grade')} ${c.gradeLevel}`,
        tab: 'classes',
      }));
    return [...matchedUsers, ...matchedClasses];
  }, [quickSearch, users, classes, roleLabel, tr]);

  const recentUsers = useMemo(
    () => [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [users]
  );

  // Filterable reports calculation
  const filteredReportGrades = useMemo(() => {
    return grades.filter((g) => {
      const cls = classMap.get(g.classId);
      if (repGradeLevel !== 'all' && cls?.gradeLevel !== repGradeLevel) return false;
      if (repClassId !== 'all' && g.classId !== repClassId) return false;
      if (repSubjectId !== 'all' && g.subjectId !== repSubjectId) return false;
      return true;
    });
  }, [grades, classMap, repGradeLevel, repClassId, repSubjectId]);

  const filteredReportAvg = useMemo(() => {
    if (filteredReportGrades.length === 0) return 0;
    const sum = filteredReportGrades.reduce((acc, g) => acc + (g.score / g.maxScore) * 20, 0);
    return Number((sum / filteredReportGrades.length).toFixed(2));
  }, [filteredReportGrades]);

  const hasAdminPerm = (perm: string) =>
    user.role === 'admin' || !Array.isArray(user.permissions) || user.permissions.includes(perm);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: tr('داشبورد مدیریت', 'Admin Dashboard'), icon: LayoutDashboard, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
    ...(hasAdminPerm('use_ai_admin')
      ? [
          { id: 'ai', label: tr('هوش مصنوعی', 'AI Admin Assistant'), icon: Bot, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
          { id: 'private_tutor', label: tr('معلم خصوصی و جزوه‌ها', 'Private Tutor & Notes'), icon: GraduationCap, accent: true, section: tr('نمای کلی و هوشمند', 'Overview & AI') },
        ]
      : []),
    ...(hasAdminPerm('view_reports')
      ? [{ id: 'academic_risk', label: tr('پیش‌بینی افت تحصیلی', 'Academic Risk Radar'), icon: ShieldAlert, section: tr('نمای کلی و هوشمند', 'Overview & AI') }]
      : []),
    ...(hasAdminPerm('manage_users')
      ? [
          { id: 'students', label: tr('مدیریت دانش‌آموزان', 'Students'), icon: GraduationCap, badge: students.length, section: tr('ساختار مدرسه و کاربران', 'School & Users') },
          { id: 'teachers', label: tr('مدیریت معلمان', 'Teachers'), icon: Users, badge: teachers.length, section: tr('ساختار مدرسه و کاربران', 'School & Users') },
        ]
      : []),
    ...(hasAdminPerm('manage_classes')
      ? [{ id: 'classes', label: tr('کلاس‌ها و پایه‌ها', 'Classes & Grades'), icon: School, section: tr('ساختار مدرسه و کاربران', 'School & Users') }]
      : []),
    ...(hasAdminPerm('manage_subjects')
      ? [{ id: 'subjects', label: tr('مدیریت دروس', 'Subjects'), icon: BookOpen, section: tr('ساختار مدرسه و کاربران', 'School & Users') }]
      : []),
    ...(hasAdminPerm('manage_users')
      ? [
          { id: 'accounts', label: tr('حساب‌های کاربری', 'All Accounts'), icon: UserCog, section: tr('ساختار مدرسه و کاربران', 'School & Users') },
          { id: 'profile_requests', label: tr('درخواست‌های تغییر پروفایل', 'Profile Requests'), icon: UserCheck, badge: pendingProfileRequests.length, section: tr('ساختار مدرسه و کاربران', 'School & Users') },
        ]
      : []),
    ...(hasAdminPerm('manage_roles')
      ? [{ id: 'roles', label: tr('نقش‌ها و دسترسی‌ها', 'Roles & Permissions'), icon: Shield, section: tr('ساختار مدرسه و کاربران', 'School & Users') }]
      : []),
    ...(hasAdminPerm('manage_grades')
      ? [
          { id: 'grades', label: tr('مدیریت نمرات', 'Grades'), icon: Award, section: tr('امور آموزشی', 'Academics') },
          { id: 'report_card', label: tr('چاپ کارنامه پیشرفته', 'Advanced Report Card'), icon: Printer, section: tr('امور آموزشی', 'Academics') },
          { id: 'exams', label: tr('آزمون‌های آنلاین', 'Online Exams'), icon: FileQuestion, badge: overview?.activeExamsCount, section: tr('امور آموزشی', 'Academics') },
        ]
      : hasAdminPerm('view_reports')
        ? [{ id: 'report_card', label: tr('چاپ کارنامه پیشرفته', 'Advanced Report Card'), icon: Printer, section: tr('امور آموزشی', 'Academics') }]
        : []),
    ...(hasAdminPerm('manage_attendance')
      ? [{ id: 'attendance', label: tr('حضور و غیاب', 'Attendance'), icon: CheckSquare, section: tr('امور آموزشی', 'Academics') }]
      : []),
    ...(hasAdminPerm('manage_assignments')
      ? [{ id: 'assignments', label: tr('مدیریت تکالیف', 'Assignments'), icon: ClipboardList, section: tr('امور آموزشی', 'Academics') }]
      : []),
    ...(hasAdminPerm('manage_schedules')
      ? [
          { id: 'schedule', label: tr('برنامه هفتگی', 'Weekly Schedule'), icon: Calendar, section: tr('امور آموزشی', 'Academics') },
          { id: 'calendar', label: tr('تقویم آموزشی', 'Academic Calendar'), icon: CalendarDays, section: tr('امور آموزشی', 'Academics') },
        ]
      : []),
    { id: 'planner', label: tr('برنامه‌ریز هوشمند', 'Smart Planner'), icon: BookOpenCheck, section: tr('امور آموزشی', 'Academics') },
    { id: 'library', label: tr('کتابخانه دیجیتال', 'Digital Library'), icon: BookOpen, section: tr('امور آموزشی', 'Academics') },
    { id: 'honors', label: tr('پرونده افتخارات', 'Student Honors'), icon: Medal, section: tr('امور آموزشی', 'Academics') },
    ...(hasAdminPerm('manage_announcements')
      ? [{ id: 'announcements', label: tr('اطلاعیه‌ها', 'Announcements'), icon: Megaphone, section: tr('ارتباطات و تنظیمات', 'Comms & Settings') }]
      : []),
    { id: 'messages', label: tr('چت و پیام‌ها', 'Chat & Messages'), icon: Mail, badge: unreadMessages.length + chatUnreadCount, section: tr('ارتباطات و تنظیمات', 'Comms & Settings') },
    ...(hasAdminPerm('view_reports')
      ? [{ id: 'reports', label: tr('گزارش‌های آماری', 'Reports & Analytics'), icon: BarChart3, section: tr('ارتباطات و تنظیمات', 'Comms & Settings') }]
      : []),
    ...(hasAdminPerm('manage_settings')
      ? [{ id: 'settings', label: tr('تنظیمات سامانه', 'System Settings'), icon: Settings, section: tr('ارتباطات و تنظیمات', 'Comms & Settings') }]
      : []),
    ...(hasAdminPerm('view_audit_logs')
      ? [{ id: 'audit', label: tr('گزارش فعالیت کاربران', 'Audit Logs'), icon: Activity, section: tr('ارتباطات و تنظیمات', 'Comms & Settings') }]
      : []),
  ];

  // Profile change request review
  const handleReviewProfileRequest = async (reqId: string, status: 'approved' | 'rejected', reasonText?: string) => {
    setReviewingReqId(reqId);
    try {
      await apiRequest(`/api/profile-requests/${reqId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, rejectionReason: reasonText }),
      });
      setRejectModalReq(null);
      setRejectionReason('');
      await loadAll();
      showToast(
        status === 'approved'
          ? tr('درخواست تغییر پروفایل تأیید و اعمال شد.', 'Profile change approved and applied.')
          : tr('درخواست تغییر پروفایل رد شد.', 'Profile change request rejected.')
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در بررسی درخواست', 'Review failed'), 'error');
    } finally {
      setReviewingReqId(null);
    }
  };

  // Academic History handlers
  const openHistoryModal = async (stu: UserAccount) => {
    setHistoryStudent(stu);
    setLoadingHistories(true);
    try {
      const res = await apiRequest<{ histories: AcademicHistoryRecord[] }>('/api/history');
      setStudentHistories(res.histories.filter((h) => h.studentId === stu.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت سوابق تحصیلی', 'Failed to load academic history'), 'error');
    } finally {
      setLoadingHistories(false);
    }
  };

  const handleAddHistory = async (e: FormEvent) => {
    e.preventDefault();
    if (!historyStudent) return;
    setSavingHistory(true);
    try {
      const res = await apiRequest<{ history: AcademicHistoryRecord }>('/api/history', {
        method: 'POST',
        body: JSON.stringify({
          studentId: historyStudent.id,
          academicYear: hisYear,
          gradeLevel: hisGradeLevel,
          gpa: Number(hisGpa),
          status: hisStatus,
          summary: hisSummary,
        }),
      });
      setStudentHistories((prev) => [res.history, ...prev]);
      setHisGpa('');
      setHisSummary('');
      showToast(tr('سابقه تحصیلی ثبت شد.', 'Academic history saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت سابقه تحصیلی', 'Failed to save academic history'), 'error');
    } finally {
      setSavingHistory(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await apiRequest(`/api/history/${id}`, { method: 'DELETE' });
      setStudentHistories((prev) => prev.filter((h) => h.id !== id));
      showToast(tr('سابقه تحصیلی حذف شد.', 'Record deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف سابقه تحصیلی', 'Delete failed'), 'error');
    }
  };

  // Batch Attendance handlers (Admin)
  const attModalStudents = useMemo(
    () => students.filter((s) => s.classId === attClassId),
    [students, attClassId]
  );

  const initAttendanceEntriesForClass = (classId: string) => {
    setAttClassId(classId);
    const next: Record<string, { status: AttendanceRecord['status']; note: string }> = {};
    for (const stu of students.filter((s) => s.classId === classId)) {
      next[stu.id] = { status: 'present', note: '' };
    }
    setAttEntries(next);
  };

  const openAttendanceModal = () => {
    const firstClass = classes[0]?.id ?? '';
    initAttendanceEntriesForClass(firstClass);
    setAttSubjectId('');
    setAttSingleStudentId(selectedAttStudentId || students[0]?.id || '');
    setAttSingleStatus('present');
    setAttSingleNote('');
    setAttMode(firstClass ? 'class' : 'single');
    setAttModalOpen(true);
  };

  const handleSaveAdminAttendance = async (e: FormEvent) => {
    e.preventDefault();
    if (attMode === 'single') {
      if (!attSingleStudentId) {
        showToast(tr('لطفاً دانش‌آموز را انتخاب کنید.', 'Please select a student.'), 'error');
        return;
      }
      setSavingAtt(true);
      try {
        await apiRequest('/api/attendance', {
          method: 'POST',
          body: JSON.stringify({
            studentId: attSingleStudentId,
            date: attDate,
            status: attSingleStatus,
            note: attSingleNote,
          }),
        });
        setAttModalOpen(false);
        setSelectedAttStudentId(attSingleStudentId);
        if (workerMode) {
          await fetchAttendanceForStudent(attSingleStudentId);
        } else {
          await loadAll();
        }
        showToast(tr('حضور و غیاب دانش‌آموز ثبت شد.', 'Student attendance saved.'));
      } catch (err) {
        showToast(err instanceof Error ? err.message : tr('خطا در ثبت حضور و غیاب', 'Failed to save attendance'), 'error');
      } finally {
        setSavingAtt(false);
      }
      return;
    }

    if (!attClassId || attModalStudents.length === 0) {
      showToast(tr('کلاس یا دانش‌آموزی برای ثبت وجود ندارد.', 'No class or students selected.'), 'error');
      return;
    }
    setSavingAtt(true);
    try {
      await apiRequest('/api/attendance/batch', {
        method: 'POST',
        body: JSON.stringify({
          classId: attClassId,
          subjectId: attSubjectId || undefined,
          date: attDate,
          entries: attModalStudents.map((stu) => ({
            studentId: stu.id,
            status: attEntries[stu.id]?.status ?? 'present',
            note: attEntries[stu.id]?.note ?? '',
          })),
        }),
      });
      setAttModalOpen(false);
      if (workerMode && selectedAttStudentId) {
        await fetchAttendanceForStudent(selectedAttStudentId);
      } else {
        await loadAll();
      }
      showToast(tr('حضور و غیاب کلاس با موفقیت ثبت شد.', 'Attendance saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت حضور و غیاب', 'Failed to save attendance'), 'error');
    } finally {
      setSavingAtt(false);
    }
  };

  // User modal helpers
  const openCreateUser = (defaultRole: UserRole) => {
    setEditingUser(null);
    setURole(defaultRole);
    setUFullName('');
    setUUsername('');
    setUNationalId('');
    setUPassword('');
    setUPhone('');
    setUGradeLevel('هفتم');
    setUClassId(classes[0]?.id ?? '');
    setUAssignedClasses([]);
    setUAssignedSubjects([]);
    setUPermissions(roles.find((r) => r.role === defaultRole)?.permissions ?? []);
    setUActive(true);
    setUserModalOpen(true);
  };

  const openEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setURole(u.role);
    setUFullName(u.fullName);
    setUUsername(u.username);
    setUNationalId(u.nationalId);
    setUPassword('');
    setUPhone(u.phone ?? '');
    setUGradeLevel(u.gradeLevel ?? 'هفتم');
    setUClassId(u.classId ?? '');
    setUAssignedClasses(u.assignedClassIds ?? []);
    setUAssignedSubjects(u.assignedSubjectIds ?? []);
    setUPermissions(
      Array.isArray(u.permissions)
        ? u.permissions
        : roles.find((r) => r.role === u.role)?.permissions ?? []
    );
    setUActive(u.active);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: uFullName,
            nationalId: uNationalId,
            role: uRole,
            active: uActive,
            phone: uPhone,
            gradeLevel: uRole === 'student' ? uGradeLevel : undefined,
            classId: uRole === 'student' ? uClassId : undefined,
            assignedClassIds: uRole === 'teacher' ? uAssignedClasses : undefined,
            assignedSubjectIds: uRole === 'teacher' ? uAssignedSubjects : undefined,
            permissions: uPermissions,
            newPassword: uPassword || undefined,
          }),
        });
        showToast(tr('اطلاعات کاربر به‌روزرسانی شد.', 'User updated.'));
      } else {
        const res = await apiRequest<{
          user: UserAccount;
          generatedCredentials?: {
            username: string;
            password: string;
            autoGeneratedUsername: boolean;
            autoGeneratedPassword: boolean;
          };
        }>('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: uUsername,
            nationalId: uNationalId,
            fullName: uFullName,
            role: uRole,
            password: uPassword,
            phone: uPhone,
            gradeLevel: uRole === 'student' ? uGradeLevel : undefined,
            classId: uRole === 'student' ? uClassId : undefined,
            assignedClassIds: uRole === 'teacher' ? uAssignedClasses : undefined,
            assignedSubjectIds: uRole === 'teacher' ? uAssignedSubjects : undefined,
            permissions: uPermissions,
            active: uActive,
          }),
        });
        showToast(tr('حساب کاربری جدید ایجاد شد.', 'User created.'));
        if (
          res.generatedCredentials &&
          (res.generatedCredentials.autoGeneratedUsername || res.generatedCredentials.autoGeneratedPassword)
        ) {
          setCreatedCredsAnnouncement({
            fullName: res.user.fullName,
            role: res.user.role,
            username: res.generatedCredentials.username,
            password: res.generatedCredentials.password,
            autoGeneratedUsername: res.generatedCredentials.autoGeneratedUsername,
            autoGeneratedPassword: res.generatedCredentials.autoGeneratedPassword,
          });
        }
      }
      setUserModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره اطلاعات کاربر', 'Failed to save user'), 'error');
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast(tr('کاربر حذف شد.', 'User deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف کاربر', 'Delete failed'), 'error');
    }
  };

  const handleCopyCred = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredKey(key);
      setTimeout(() => {
        setCopiedCredKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      showToast(tr('امکان کپی در کلیپ‌بورد نبود.', 'Clipboard copy failed.'), 'error');
    }
  };

  const toggleRowPasswordVisible = (userId: string) => {
    setRevealedPasswordIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const accountsWithVisiblePasswords = useMemo(
    () => users.filter((u) => Boolean(u.displayPassword)),
    [users]
  );

  const allPasswordsVisible =
    accountsWithVisiblePasswords.length > 0 &&
    accountsWithVisiblePasswords.every((u) => revealedPasswordIds.has(u.id));

  const toggleAllPasswordsVisible = () => {
    if (allPasswordsVisible) {
      setRevealedPasswordIds(new Set());
    } else {
      setRevealedPasswordIds(new Set(accountsWithVisiblePasswords.map((u) => u.id)));
    }
  };

  const openExcelImportModal = (mode: 'student' | 'teacher' | 'mixed') => {
    setExcelMode(mode);
    setExcelAutoCreateClasses(true);
    setExcelFileName('');
    setExcelRows([]);
    setExcelResult(null);
    setExcelModalOpen(true);
  };

  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      {
        'نام و نام خانوادگی': 'امیرحسین رضایی',
        نقش: 'دانش‌آموز',
        'نام کاربری': 'amir_701',
        'رمز عبور': 'Amir@1405',
        'کد ملی': '1389112233',
        پایه: 'هفتم',
        کلاس: classes.find((c) => c.gradeLevel === 'هفتم')?.name ?? 'هفتم الف',
        'دروس (مخصوص معلم)': '',
        'شماره تماس': '09121112233',
        ایمیل: 'amir@school.ir',
      },
      {
        'نام و نام خانوادگی': 'پارسا مرادی',
        نقش: 'دانش‌آموز',
        'نام کاربری': '',
        'رمز عبور': '',
        'کد ملی': '1388445566',
        پایه: 'هشتم',
        کلاس: classes.find((c) => c.gradeLevel === 'هشتم')?.name ?? 'هشتم الف',
        'دروس (مخصوص معلم)': '',
        'شماره تماس': '09124445566',
        ایمیل: '',
      },
      {
        'نام و نام خانوادگی': 'سارا احمدی',
        نقش: 'دانش‌آموز',
        'نام کاربری': '',
        'رمز عبور': '',
        'کد ملی': '1387778899',
        پایه: 'نهم',
        کلاس: classes.find((c) => c.gradeLevel === 'نهم')?.name ?? 'نهم ب',
        'دروس (مخصوص معلم)': '',
        'شماره تماس': '09127778899',
        ایمیل: '',
      },
      {
        'نام و نام خانوادگی': 'استاد علی محمدی',
        نقش: 'معلم',
        'نام کاربری': '',
        'رمز عبور': '',
        'کد ملی': '1372001122',
        پایه: '',
        کلاس:
          classes.length >= 2
            ? `${classes[0].name}، ${classes[1].name}`
            : 'هفتم الف، هشتم الف',
        'دروس (مخصوص معلم)':
          subjects.length >= 2
            ? `${subjects[0].name}، ${subjects[1].name}`
            : 'ریاضی، علوم',
        'شماره تماس': '09145556677',
        ایمیل: 'mohammadi@school.ir',
      },
    ];

    const guideRows = [
      { ستون: 'نام و نام خانوادگی', وضعیت: 'الزامی', توضیح: 'نام کامل دانش‌آموز یا معلم' },
      { ستون: 'نقش', وضعیت: 'اختیاری (پیش‌فرض: دانش‌آموز)', توضیح: 'مقدار مجاز: دانش‌آموز یا معلم (دبیر)' },
      { ستون: 'نام کاربری', وضعیت: 'اختیاری', توضیح: 'اگر خالی باشد، به صورت خودکار نام کاربری تصادفی ساخته و اعلام می‌شود.' },
      { ستون: 'رمز عبور', وضعیت: 'اختیاری', توضیح: 'اگر خالی باشد، رمز عبور تصادفی ۸ کاراکتری ساخته و اعلام می‌شود.' },
      { ستون: 'پایه', وضعیت: 'مخصوص دانش‌آموز', توضیح: 'فقط پایه‌های هفتم، هشتم یا نهم مجاز است.' },
      { ستون: 'کلاس', وضعیت: 'اختیاری', توضیح: 'نام کلاس (برای معلم چند کلاس را با «،» جدا کنید). دانش‌آموز به صورت خودکار عضو کلاس می‌شود.' },
      { ستون: 'دروس (مخصوص معلم)', وضعیت: 'مخصوص معلم', توضیح: 'نام دروس معلم را با «،» جدا کنید.' },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws['!cols'] = [
      { wch: 24 },
      { wch: 13 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 10 },
      { wch: 22 },
      { wch: 24 },
      { wch: 15 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'نمونه کاربران');

    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    guideSheet['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 62 }];
    XLSX.utils.book_append_sheet(wb, guideSheet, 'راهنما');

    XLSX.writeFile(wb, 'نمونه_ورود_دانش_آموزان_و_معلمان.xlsx');
    showToast(tr('فایل نمونه اکسل دانلود شد.', 'Sample Excel template downloaded.'));
  };

  const handleExcelFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        showToast(tr('فایل اکسل خالی است.', 'Excel file has no sheets.'), 'error');
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rawObjects.length === 0) {
        showToast(tr('هیچ ردیفی در فایل اکسل یافت نشد.', 'No rows found in Excel sheet.'), 'error');
        return;
      }

      const parsed: BulkUserImportRow[] = rawObjects
        .map((raw, idx) => {
          const fullName = pickExcelCell(raw, ['نام و نام خانوادگی', 'نام کامل', 'نام دانش آموز', 'نام معلم', 'نام دبیر', 'نام', 'fullname', 'full name', 'name']);
          const rawRole = pickExcelCell(raw, ['نقش', 'سمت', 'نوع کاربر', 'نوع', 'role', 'type']);
          const username = normalizeExcelDigits(
            pickExcelCell(raw, ['نام کاربری', 'شناسه کاربری', 'کاربری', 'username', 'user name', 'user'])
          );
          const password = pickExcelCell(raw, ['رمز عبور', 'کلمه عبور', 'گذرواژه', 'رمز', 'password', 'pass']);
          const nationalId = normalizeExcelDigits(
            pickExcelCell(raw, ['کد ملی', 'کد دانش آموزی', 'کد پرسنلی', 'شماره ملی', 'nationalid', 'national id', 'studentcode'])
          );
          const gradeLevel = normalizeImportedGrade(
            pickExcelCell(raw, ['پایه تحصیلی', 'پایه', 'مقطع', 'gradelevel', 'grade level', 'grade'])
          );
          const className = pickExcelCell(raw, ['نام کلاس', 'کلاس ها', 'کلاسها', 'کلاس', 'classname', 'class name', 'class', 'classes']);
          const subjectNames = pickExcelCell(raw, ['دروس تخصصی', 'دروس', 'نام درس', 'درس', 'subjects', 'subject']);
          const phone = normalizeExcelDigits(
            pickExcelCell(raw, ['شماره تماس', 'شماره همراه', 'موبایل', 'تلفن', 'phone', 'mobile'])
          );
          const email = pickExcelCell(raw, ['پست الکترونیک', 'ایمیل', 'email']);

          return {
            rowNumber: idx + 2,
            fullName,
            role: detectExcelRowRole(rawRole, excelMode),
            username,
            password,
            nationalId,
            gradeLevel,
            className,
            subjectNames,
            phone,
            email,
          };
        })
        .filter(
          (r) =>
            r.fullName ||
            r.username ||
            r.nationalId ||
            r.className ||
            r.phone
        );

      if (parsed.length === 0) {
        showToast(tr('ردیف معتبری در فایل اکسل یافت نشد.', 'No valid rows detected in Excel file.'), 'error');
        return;
      }

      setExcelFileName(file.name);
      setExcelRows(parsed);
    } catch {
      showToast(tr('خطا در خواندن فایل اکسل. لطفاً فایل معتبر انتخاب کنید.', 'Failed to parse Excel file.'), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmitExcelImport = async () => {
    if (excelRows.length === 0) return;
    setExcelImporting(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        created: BulkUserImportCreatedItem[];
        errors: Array<{ rowNumber: number; fullName?: string; error: string }>;
        createdClassesCount: number;
        message: string;
      }>('/api/users/bulk', {
        method: 'POST',
        body: JSON.stringify({
          rows: excelRows,
          autoCreateMissingClasses: excelAutoCreateClasses,
        }),
      });
      setExcelResult({
        created: res.created ?? [],
        errors: res.errors ?? [],
        createdClassesCount: res.createdClassesCount ?? 0,
        message: res.message,
      });
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت گروهی کاربران', 'Bulk import failed'), 'error');
    } finally {
      setExcelImporting(false);
    }
  };

  const handleDownloadCredentialsExcel = (items: BulkUserImportCreatedItem[]) => {
    const rows = items.map((item, idx) => ({
      ردیف: idx + 1,
      'نام و نام خانوادگی': item.user.fullName,
      نقش: roleLabel(item.user.role),
      پایه: item.user.gradeLevel ?? '—',
      کلاس: item.className ?? '—',
      'نام کاربری': item.username,
      'وضعیت نام کاربری': item.autoGeneratedUsername ? 'تصادفی (سیستمی)' : 'از فایل اکسل',
      'رمز عبور': item.password,
      'وضعیت رمز عبور': item.autoGeneratedPassword ? 'تصادفی (سیستمی)' : 'از فایل اکسل',
      'کد ملی': item.user.nationalId || '—',
      'شماره تماس': item.user.phone || '—',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 7 },
      { wch: 24 },
      { wch: 13 },
      { wch: 10 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'اطلاعات ورود کاربران');
    XLSX.writeFile(wb, 'اطلاعات_ورود_کاربران_ثبت_شده.xlsx');
    showToast(tr('فایل اکسل اطلاعات ورود دانلود شد.', 'Credentials Excel downloaded.'));
  };

  const handleCopyAllCredentials = async (items: BulkUserImportCreatedItem[]) => {
    const lines = items.map(
      (item, idx) =>
        `${idx + 1}. ${item.user.fullName} (${roleLabel(item.user.role)}${item.className ? ` - کلاس ${item.className}` : ''}) | نام کاربری: ${item.username} | رمز عبور: ${item.password}`
    );
    await handleCopyCred(lines.join('\n'), 'all_bulk_creds');
    showToast(tr('اطلاعات ورود همه کاربران کپی شد.', 'All credentials copied to clipboard.'));
  };

  // Class modal helpers
  const openCreateClass = () => {
    setEditingClass(null);
    setCName('');
    setCGradeLevel('هفتم');
    setCCapacity('30');
    setCRoom('');
    setCTeachers([]);
    setCSubjects([]);
    setClassModalOpen(true);
  };

  const openEditClass = (cls: SchoolClass) => {
    setEditingClass(cls);
    setCName(cls.name);
    setCGradeLevel(cls.gradeLevel);
    setCCapacity(String(cls.capacity));
    setCRoom(cls.room ?? '');
    setCTeachers(cls.teacherIds);
    setCSubjects(cls.subjectIds);
    setClassModalOpen(true);
  };

  const handleSaveClass = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: cName,
        gradeLevel: cGradeLevel,
        capacity: Number(cCapacity) || 30,
        room: cRoom,
        teacherIds: cTeachers,
        subjectIds: cSubjects,
      };
      if (editingClass) {
        await apiRequest(`/api/classes/${editingClass.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast(tr('کلاس ویرایش شد.', 'Class updated.'));
      } else {
        await apiRequest('/api/classes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(tr('کلاس جدید ایجاد شد.', 'Class created.'));
      }
      setClassModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره کلاس', 'Failed to save class'), 'error');
    }
  };

  const handleDeleteClass = async (id: string) => {
    try {
      await apiRequest(`/api/classes/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast(tr('کلاس حذف شد.', 'Class deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف کلاس', 'Delete failed'), 'error');
    }
  };

  // Subject modal helpers
  const openCreateSubject = () => {
    setEditingSubject(null);
    setSName('');
    setSCode('');
    setSGradeLevel('هفتم');
    setSCoeff('3');
    setSTeacherId(teachers[0]?.id ?? '');
    setSubjectModalOpen(true);
  };

  const openEditSubject = (sub: Subject) => {
    setEditingSubject(sub);
    setSName(sub.name);
    setSCode(sub.code);
    setSGradeLevel(sub.gradeLevel);
    setSCoeff(String(sub.coefficient));
    setSTeacherId(sub.teacherId ?? '');
    setSubjectModalOpen(true);
  };

  const handleSaveSubject = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: sName,
        code: sCode,
        gradeLevel: sGradeLevel,
        coefficient: Number(sCoeff) || 2,
        teacherId: sTeacherId || undefined,
      };
      if (editingSubject) {
        await apiRequest(`/api/subjects/${editingSubject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast(tr('درس ویرایش شد.', 'Subject updated.'));
      } else {
        await apiRequest('/api/subjects', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(tr('درس جدید ایجاد شد.', 'Subject created.'));
      }
      setSubjectModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره درس', 'Failed to save subject'), 'error');
    }
  };

  const handleDeleteSubject = async (id: string) => {
    try {
      await apiRequest(`/api/subjects/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast(tr('درس حذف شد.', 'Subject deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف درس', 'Delete failed'), 'error');
    }
  };

  const toggleRolePermission = async (roleKey: UserRole, perm: string) => {
    const updated = roles.map((r) => {
      if (r.role !== roleKey) return r;
      const has = r.permissions.includes(perm);
      return {
        ...r,
        permissions: has ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm],
      };
    });
    setRoles(updated);
    try {
      await apiRequest('/api/roles', {
        method: 'PUT',
        body: JSON.stringify({ roles: updated }),
      });
      showToast(tr('دسترسی نقش با موفقیت ذخیره شد.', 'Role permissions updated.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره دسترسی', 'Failed to update permissions'), 'error');
    }
  };

  const handleCreateScheduleSlot = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          classId: schClassFilter || classes[0]?.id,
          dayOfWeek: schDay,
          period: schPeriod,
          startTime: schStart,
          endTime: schEnd,
          subjectId: schSubjectId || subjects[0]?.id,
          teacherId: schTeacherId || teachers[0]?.id,
          room: schRoom,
        }),
      });
      setSchModalOpen(false);
      await loadAll();
      showToast(tr('زنگ درسی به برنامه هفتگی اضافه شد.', 'Schedule slot added.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت زنگ', 'Failed to add slot'), 'error');
    }
  };

  const handleDeleteScheduleSlot = async (id: string) => {
    try {
      await apiRequest(`/api/schedules/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast(tr('زنگ از برنامه هفتگی حذف شد.', 'Schedule slot removed.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف زنگ', 'Delete failed'), 'error');
    }
  };

  const handleCreateAdminGrade = async (e: FormEvent) => {
    e.preventDefault();
    const stu = userMap.get(grdStudentId);
    if (!stu) {
      showToast(tr('لطفاً دانش‌آموز را انتخاب کنید.', 'Please select a student.'), 'error');
      return;
    }
    if (!workerMode && !stu.classId) {
      showToast(tr('دانش‌آموز باید عضو یک کلاس باشد.', 'Student must be assigned to a class.'), 'error');
      return;
    }
    const chosenSubjectId = grdSubjectId || subjects[0]?.id || '';
    const chosenSubjectName =
      subjectMap.get(chosenSubjectId)?.name || grdSubjectName.trim() || 'عمومی';

    try {
      await apiRequest('/api/grades', {
        method: 'POST',
        body: JSON.stringify({
          studentId: stu.id,
          classId: stu.classId || '',
          subjectId: chosenSubjectId || chosenSubjectName,
          subject: chosenSubjectName,
          term: grdTerm,
          title: grdTitle,
          score: Number(grdScore),
          maxScore: 20,
        }),
      });
      setGrdModalOpen(false);
      setGrdTitle('');
      setGrdScore('');
      setGrdSubjectName('');
      setSelectedGradeStudentId(stu.id);
      if (workerMode) {
        await fetchGradesForStudent(stu.id);
      } else {
        await loadAll();
      }
      showToast(tr('نمره ثبت شد.', 'Grade recorded.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت نمره', 'Failed to save grade'), 'error');
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiRequest<{ settings: SchoolSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          schoolName: cfgSchoolName,
          academicYear: cfgAcademicYear,
          principalName: cfgPrincipal,
          currentTerm: cfgTerm,
          passingScore: Number(cfgPassing) || 10,
          aiEnabled: cfgAiEnabled,
          allowStudentAssignmentSubmission: cfgAsgSub,
        }),
      });
      onSettingsUpdated(data.settings);
      showToast(tr('تنظیمات سامانه ذخیره شد.', 'System settings saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره تنظیمات', 'Failed to save settings'), 'error');
    }
  };

  const visibleRequests = useMemo(
    () => profileRequests.filter((r) => reqFilter === 'all' || r.status === reqFilter),
    [profileRequests, reqFilter]
  );

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
          <div className="bg-white dark:bg-slate-900 bg-arch-grid border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {tr('مدیریت متمرکز مدرسه', 'Centralized School Management')} · {tr('سال تحصیلی', 'Academic Year')}{' '}
                  {fmtDigits(settings?.academicYear ?? '1404-1405')}
                </p>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {tr('نمای کلی', 'Overview —')} {schoolTitle(settings?.schoolName)}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openCreateUser('student')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>{tr('ثبت دانش‌آموز', 'Add Student')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile_requests')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <span>
                    {tr('درخواست‌های پروفایل', 'Profile Requests')} ({fmtDigits(pendingProfileRequests.length)})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 shadow-sm transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>{tr('دستیار هوش مصنوعی مدیریت', 'AI Admin Assistant')}</span>
                </button>
              </div>
            </div>

            {/* Quick System Search */}
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={tr('جستجوی سریع دانش‌آموز، معلم یا کلاس...', 'Quick search student, teacher, or class...')}
                className="w-full ps-9 pe-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-500"
              />
              {quickSearchResults.length > 0 && (
                <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {quickSearchResults.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(res.tab);
                        setQuickSearch('');
                      }}
                      className="w-full px-3.5 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{res.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{res.sub}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label={tr('دانش‌آموزان و حساب‌ها', 'Students & Accounts')}
              value={fmtDigits(overview?.studentsCount ?? 0)}
              subtitle={`${fmtDigits(overview?.activeAccountsCount ?? 0)} ${tr('فعال', 'active')} · ${fmtDigits(overview?.inactiveAccountsCount ?? 0)} ${tr('غیرفعال', 'inactive')}`}
              icon={GraduationCap}
            />
            <StatCard
              label={tr('معلمان، کلاس‌ها و دروس', 'Faculty, Classes & Subjects')}
              value={`${fmtDigits(overview?.teachersCount ?? 0)} ${tr('معلم', 'teachers')}`}
              subtitle={`${fmtDigits(overview?.classesCount ?? 0)} ${tr('کلاس', 'classes')} · ${fmtDigits(overview?.subjectsCount ?? 0)} ${tr('درس', 'subjects')}`}
              icon={School}
            />
            <StatCard
              label={tr('میانگین نمرات کل مدرسه', 'School Average GPA')}
              value={overview && overview.gradesCount > 0 ? fmtNum(overview.schoolAverage) : '—'}
              subtitle={`${fmtDigits(overview?.gradesCount ?? 0)} ${tr('نمره ثبت‌شده', 'grades recorded')}`}
              icon={Award}
            />
            <StatCard
              label={tr('آزمون‌ها و درخواست‌های پروفایل', 'Exams & Pending Requests')}
              value={`${fmtDigits(overview?.activeExamsCount ?? 0)} ${tr('آزمون', 'exams')}`}
              subtitle={`${fmtDigits(overview?.completedExamsCount ?? 0)} ${tr('شرکت‌کننده', 'attempts')} · ${fmtDigits(overview?.pendingProfileRequestsCount ?? 0)} ${tr('درخواست پروفایل', 'profile reqs')}`}
              icon={UserCheck}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('عملکرد تحصیلی به تفکیک کلاس‌ها', 'Academic Performance by Class')}
              subtitle={tr('میانگین نمرات ثبت‌شده در هر کلاس', 'Average recorded grades per class')}
              data={
                (overview?.classAverages ?? []).map((c) => ({
                  label: c.label,
                  value: c.value,
                  sublabel: `${fmtDigits(c.students)} ${tr('دانش‌آموز', 'students')}`,
                }))
              }
            />
            <LineTrendChart
              title={tr('روند میانگین مدرسه در نوبت‌های تحصیلی', 'School Grade Trend by Term')}
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
              title={tr('میانگین نمرات به تفکیک دروس', 'Subject Grade Averages')}
              data={
                (overview?.subjectAverages ?? []).map((s) => ({
                  label: s.label,
                  value: s.value,
                  sublabel: `${fmtDigits(s.count)} ${tr('نمره', 'grades')}`,
                }))
              }
            />
            <AttendanceBreakdownChart
              title={tr('آمار حضور و غیاب کل مدرسه', 'School Attendance Summary')}
              stats={overview?.attendanceStats ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 }}
            />
          </div>

          {/* Pending Requests, Recently Added Users, Recent Audit Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('درخواست‌های تغییر پروفایل', 'Pending Profile Requests')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile_requests')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('بررسی همه', 'Review All')}
                </button>
              </div>
              {pendingProfileRequests.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('درخواست در انتظار بررسی وجود ندارد.', 'No pending profile requests.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingProfileRequests.slice(0, 4).map((r) => (
                    <div key={r.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {r.requestedValues.fullName ?? r.username}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {roleLabel(r.userRole)} · {fmtDateTime(r.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('profile_requests')}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold text-[11px]"
                      >
                        {tr('بررسی', 'Review')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('کاربران جدید سامانه', 'Recently Registered Users')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('حساب‌ها', 'Accounts')}
                </button>
              </div>
              {recentUsers.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('کاربری ثبت نشده است.', 'No users recorded.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentUsers.slice(0, 5).map((u) => (
                    <div key={u.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{u.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
                          {u.username}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                        {roleLabel(u.role)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('فعالیت‌های اخیر سامانه', 'Recent System Activity')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('گزارش کامل', 'Full Log')}
                </button>
              </div>
              {(overview?.recentActivity?.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('فعالیتی ثبت نشده است.', 'No activity logged yet.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(overview?.recentActivity ?? []).slice(0, 5).map((log) => (
                    <div key={log.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{log.action}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{fmtDateTime(log.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {log.userName} · {log.target}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Schoolwide Grade Distribution & Grade-Level Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('توزیع نمرات کل مدرسه', 'Schoolwide Grade Distribution')}
              subtitle={tr('تعداد نمرات ثبت‌شده در هر بازه علمی', 'Count of recorded grades across performance tiers')}
              maxValue={Math.max(1, ...(overview?.gradeDistribution?.map((d) => d.count) ?? [1]))}
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

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش مقایسه عملکرد پایه‌های تحصیلی', 'Grade-Level Performance Report')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('تعداد کلاس، دانش‌آموز، نرخ حضور و معدل هر پایه', 'Classes, students, attendance rate, and GPA by grade')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('گزارش تفصیلی', 'Analytics')}
                </button>
              </div>
              {!overview?.gradeLevelStats || overview.gradeLevelStats.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
                  {tr('هنوز پایه یا کلاسی در سامانه تعریف نشده است.', 'No grade levels recorded yet.')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2 font-semibold text-start">{tr('پایه تحصیلی', 'Grade Level')}</th>
                        <th className="py-2 font-semibold text-start">{tr('کلاس‌ها', 'Classes')}</th>
                        <th className="py-2 font-semibold text-start">{tr('دانش‌آموزان', 'Students')}</th>
                        <th className="py-2 font-semibold text-start">{tr('حضور', 'Attendance')}</th>
                        <th className="py-2 font-semibold text-end">{tr('معدل کل', 'Average GPA')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {overview.gradeLevelStats.map((lvl) => (
                        <tr key={lvl.label}>
                          <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{lvl.label}</td>
                          <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{fmtDigits(lvl.classesCount)}</td>
                          <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{fmtDigits(lvl.studentsCount)}</td>
                          <td className="py-2.5 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                            {fmtDigits(lvl.attendanceRate)}{tr('٪', '%')}
                          </td>
                          <td className="py-2.5 text-end tabular-nums font-bold text-[#0F274A] dark:text-sky-300">
                            {lvl.averageScore > 0 ? fmtNum(lvl.averageScore) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Role Accounts Breakdown & Academic Engagement */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گزارش تفکیک حساب‌های کاربری مدرسه', 'User Accounts & Roles Breakdown')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('وضعیت حساب‌های فعال و غیرفعال بر اساس نقش کاربری', 'Active vs inactive accounts across school roles')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('مدیریت حساب‌ها', 'Accounts')}
                </button>
              </div>
              {(() => {
                const rb = overview?.roleBreakdown ?? {
                  studentsActive: overview?.activeStudentsCount ?? 0,
                  studentsInactive: 0,
                  teachersActive: overview?.teachersCount ?? 0,
                  teachersInactive: 0,
                  adminsCount: 1,
                };
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-slate-500 dark:text-slate-400 font-medium">{tr('دانش‌آموزان', 'Students')}</p>
                      <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                        {fmtDigits(rb.studentsActive + rb.studentsInactive)}
                      </p>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                        {fmtDigits(rb.studentsActive)} {tr('فعال', 'active')} · {fmtDigits(rb.studentsInactive)} {tr('غیرفعال', 'inactive')}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-slate-500 dark:text-slate-400 font-medium">{tr('دبیران', 'Teachers')}</p>
                      <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                        {fmtDigits(rb.teachersActive + rb.teachersInactive)}
                      </p>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                        {fmtDigits(rb.teachersActive)} {tr('فعال', 'active')} · {fmtDigits(rb.teachersInactive)} {tr('غیرفعال', 'inactive')}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-slate-500 dark:text-slate-400 font-medium">{tr('کادر مدیریت', 'Administrators')}</p>
                      <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                        {fmtDigits(rb.adminsCount)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {tr('دسترسی کامل سامانه', 'Full access')}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش تعاملات و فعالیت‌های آموزشی سامانه', 'Academic Engagement & Activity Report')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr('آمار تکالیف، آزمون‌های آنلاین، برنامه‌ریز مطالعه و تقویم', 'Assignments, online exams, study planner, and calendar usage')}
                </p>
              </div>
              {(() => {
                const eng = overview?.engagementStats ?? {
                  assignmentsCount: overview?.assignmentsCount ?? 0,
                  totalSubmissions: 0,
                  gradedSubmissions: 0,
                  submissionRate: 0,
                  examsCount: overview?.activeExamsCount ?? 0,
                  examAttemptsCount: overview?.completedExamsCount ?? 0,
                  avgExamPercent: 0,
                  studyPlansCount: 0,
                  completedStudyPlansCount: 0,
                  directMessagesCount: 0,
                  calendarEventsCount: 0,
                };
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('نرخ تحویل تکالیف', 'Submission Rate')}</p>
                      <p className="text-base font-bold text-[#0F274A] dark:text-sky-300 tabular-nums mt-0.5">
                        {fmtDigits(eng.submissionRate)}{tr('٪', '%')}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {fmtDigits(eng.totalSubmissions)} {tr('ارسال', 'subs')} · {fmtDigits(eng.gradedSubmissions)} {tr('نمره‌دار', 'graded')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('مشارکت آزمون آنلاین', 'Exam Attempts')}</p>
                      <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                        {fmtDigits(eng.examAttemptsCount)}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {tr('میانگین نمره:', 'Avg:')} {fmtDigits(eng.avgExamPercent)}{tr('٪', '%')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('برنامه‌های مطالعه', 'Study Plans')}</p>
                      <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                        {fmtDigits(eng.completedStudyPlansCount)} / {fmtDigits(eng.studyPlansCount)}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {fmtDigits(eng.calendarEventsCount)} {tr('رویداد تقویم', 'events')}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Class Capacity & Performance Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش جامع عملکرد و ظرفیت کلاس‌های مدرسه', 'Schoolwide Class Capacity & Performance Matrix')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr('نمای کلی وضعیت ثبت‌نام، حضور و میانگین علمی تمام کلاس‌ها', 'Enrollment capacity, attendance rate, and academic average per class')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
              >
                {tr('مدیریت کلاس‌ها', 'Manage Classes')}
              </button>
            </div>
            {!overview?.classPerformance || overview.classPerformance.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                {tr('کلاسی در سامانه ثبت نشده است.', 'No classes registered yet.')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-semibold text-start">{tr('کلاس', 'Class')}</th>
                      <th className="py-2 font-semibold text-start">{tr('پایه', 'Grade')}</th>
                      <th className="py-2 font-semibold text-start">{tr('ظرفیت ثبت‌نام', 'Enrollment / Cap')}</th>
                      <th className="py-2 font-semibold text-start">{tr('تعداد نمرات', 'Grades')}</th>
                      <th className="py-2 font-semibold text-start">{tr('نرخ حضور', 'Attendance')}</th>
                      <th className="py-2 font-semibold text-end">{tr('میانگین کلاس', 'Class GPA')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overview.classPerformance.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-300">{c.gradeLevel}</td>
                        <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">
                          {fmtDigits(c.studentsCount)} / {fmtDigits(c.capacity)}
                        </td>
                        <td className="py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{fmtDigits(c.gradesCount)}</td>
                        <td className="py-2.5 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
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

          {/* Top Students & Attention Needed Report */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش برترین دانش‌آموزان مدرسه', 'Top Performing Students Across School')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('فهرست دانش‌آموزان', 'Students')}
                </button>
              </div>
              {!overview?.topStudents || overview.topStudents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('هنوز نمره‌ای برای رتبه‌بندی دانش‌آموزان ثبت نشده است.', 'No grades recorded for student ranking yet.')}
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
                  {tr('دانش‌آموزان نیازمند توجه و پیگیری انضباطی یا درسی', 'Students Needing Academic or Attendance Follow-Up')}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  {tr('گزارش کامل', 'Full Report')}
                </button>
              </div>
              {!overview?.attentionStudents || overview.attentionStudents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  {tr('در حال حاضر موردی از افت تحصیلی یا غیبت مکرر ثبت نشده است.', 'No academic alerts or repeated absences detected.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.attentionStudents.map((stu) => (
                    <div key={stu.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{stu.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{stu.className}</p>
                      </div>
                      <div className="text-end tabular-nums shrink-0">
                        {stu.gradesCount > 0 && (
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {tr('معدل:', 'Avg:')} {fmtNum(stu.average)}
                          </span>
                        )}
                        {stu.absences > 0 && (
                          <span className="ms-2 font-semibold text-red-700 dark:text-red-400">
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
        </div>
      )}

      {activeTab === 'ai' && <AIAssistantView user={user} />}

      {activeTab === 'students' && (
        <DataTable
          data={students}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی دانش‌آموز بر اساس نام، نام کاربری یا کد ملی...', 'Search student by name, username or national ID...')}
          searchFilter={(r, q) =>
            r.fullName.toLowerCase().includes(q) ||
            r.username.toLowerCase().includes(q) ||
            r.nationalId.toLowerCase().includes(q)
          }
          emptyTitle={tr('دانش‌آموزی ثبت نشده است', 'No students registered')}
          emptyDescription={tr('اولین دانش‌آموز مدرسه را ثبت کنید و به کلاس مورد نظر اختصاص دهید.', 'Add your first student and assign them to a class.')}
          toolbarExtra={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openExcelImportModal('student')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{tr('افزودن گروهی با اکسل', 'Import Excel')}</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateUser('student')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('افزودن دانش‌آموز', 'Add Student')}</span>
              </button>
            </div>
          }
          columns={[
            {
              key: 'fullName',
              header: tr('نام و نام خانوادگی', 'Full Name'),
              sortValue: (r) => r.fullName,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.fullName}</span>,
            },
            {
              key: 'username',
              header: tr('نام کاربری', 'Username'),
              render: (r) => <span className="font-mono text-xs">{r.username}</span>,
            },
            { key: 'gradeLevel', header: tr('پایه', 'Grade'), render: (r) => r.gradeLevel || '—' },
            {
              key: 'class',
              header: tr('کلاس', 'Class'),
              render: (r) => classMap.get(r.classId ?? '')?.name ?? tr('تخصیص‌نیافته', 'Unassigned'),
            },
            {
              key: 'active',
              header: tr('وضعیت', 'Status'),
              render: (r) => (
                <span className={`text-xs font-semibold ${r.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {r.active ? tr('فعال', 'Active') : tr('غیرفعال', 'Inactive')}
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
                    onClick={() => void openHistoryModal(r)}
                    title={tr('سوابق تحصیلی دانش‌آموز', 'Academic History')}
                    aria-label={tr('سوابق تحصیلی', 'Academic History')}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditUser(r)}
                    aria-label={tr('ویرایش دانش‌آموز', 'Edit Student')}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(r.id)}
                    aria-label={tr('حذف دانش‌آموز', 'Delete Student')}
                    className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'teachers' && (
        <DataTable
          data={teachers}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی معلم...', 'Search teacher...')}
          searchFilter={(r, q) =>
            r.fullName.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
          }
          emptyTitle={tr('معلمی ثبت نشده است', 'No teachers registered')}
          emptyDescription={tr('معلمان مدرسه را اضافه کرده و کلاس‌ها و دروس مجاز آن‌ها را تعیین کنید.', 'Add teachers and assign classes and subjects.')}
          toolbarExtra={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openExcelImportModal('teacher')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{tr('افزودن گروهی با اکسل', 'Import Excel')}</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateUser('teacher')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('افزودن معلم', 'Add Teacher')}</span>
              </button>
            </div>
          }
          columns={[
            {
              key: 'fullName',
              header: tr('نام معلم', 'Teacher Name'),
              sortValue: (r) => r.fullName,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.fullName}</span>,
            },
            {
              key: 'username',
              header: tr('نام کاربری', 'Username'),
              render: (r) => <span className="font-mono text-xs">{r.username}</span>,
            },
            {
              key: 'classes',
              header: tr('کلاس‌های اختصاص‌یافته', 'Assigned Classes'),
              render: (r) => {
                const names = (r.assignedClassIds ?? [])
                  .map((id) => classMap.get(id)?.name)
                  .filter(Boolean)
                  .join(lang === 'fa' ? '، ' : ', ');
                return <span className="text-xs text-slate-600 dark:text-slate-300">{names || tr('تخصیص‌نیافته', 'Unassigned')}</span>;
              },
            },
            {
              key: 'subjects',
              header: tr('دروس', 'Subjects'),
              render: (r) => {
                const names = (r.assignedSubjectIds ?? [])
                  .map((id) => subjectMap.get(id)?.name)
                  .filter(Boolean)
                  .join(lang === 'fa' ? '، ' : ', ');
                return <span className="text-xs text-slate-600 dark:text-slate-300">{names || '—'}</span>;
              },
            },
            {
              key: 'actions',
              header: tr('عملیات', 'Actions'),
              render: (r) => (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditUser(r)}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(r.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'classes' && (
        <DataTable
          data={classes}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی کلاس یا پایه...', 'Search class or grade...')}
          searchFilter={(r, q) =>
            r.name.toLowerCase().includes(q) || r.gradeLevel.toLowerCase().includes(q)
          }
          emptyTitle={tr('کلاسی تعریف نشده است', 'No classes created')}
          emptyDescription={tr('کلاس‌ها و پایه‌های تحصیلی مدرسه را تعریف کنید.', 'Define school classes and grade levels.')}
          toolbarExtra={
            <button
              type="button"
              onClick={openCreateClass}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('ایجاد کلاس جدید', 'Add Class')}</span>
            </button>
          }
          columns={[
            {
              key: 'name',
              header: tr('نام کلاس', 'Class Name'),
              sortValue: (r) => r.name,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</span>,
            },
            { key: 'gradeLevel', header: tr('پایه', 'Grade Level'), render: (r) => r.gradeLevel },
            {
              key: 'students',
              header: tr('تعداد دانش‌آموز', 'Students'),
              render: (r) => {
                const count = students.filter((s) => s.classId === r.id).length;
                return (
                  <span className="tabular-nums">
                    {fmtDigits(count)} {tr('از', '/')} {fmtDigits(r.capacity)}
                  </span>
                );
              },
            },
            {
              key: 'teachers',
              header: tr('معلمان', 'Teachers'),
              render: (r) =>
                r.teacherIds.map((id) => userMap.get(id)?.fullName).filter(Boolean).join(lang === 'fa' ? '، ' : ', ') || '—',
            },
            {
              key: 'actions',
              header: tr('عملیات', 'Actions'),
              render: (r) => (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditClass(r)}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteClass(r.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'subjects' && (
        <DataTable
          data={subjects}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی درس یا کد درس...', 'Search subject or code...')}
          searchFilter={(r, q) =>
            r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
          }
          emptyTitle={tr('درسی تعریف نشده است', 'No subjects defined')}
          emptyDescription={tr('دروس مدرسه همراه با ضریب و پایه تحصیلی را اضافه کنید.', 'Add subjects along with coefficients and grade levels.')}
          toolbarExtra={
            <button
              type="button"
              onClick={openCreateSubject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('تعریف درس جدید', 'Add Subject')}</span>
            </button>
          }
          columns={[
            {
              key: 'code',
              header: tr('کد درس', 'Code'),
              render: (r) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{r.code}</span>,
            },
            {
              key: 'name',
              header: tr('نام درس', 'Subject Name'),
              sortValue: (r) => r.name,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</span>,
            },
            { key: 'gradeLevel', header: tr('پایه', 'Grade Level'), render: (r) => r.gradeLevel },
            {
              key: 'coefficient',
              header: tr('ضریب', 'Weight'),
              sortValue: (r) => r.coefficient,
              render: (r) => <span className="tabular-nums font-semibold">{fmtDigits(r.coefficient)}</span>,
            },
            {
              key: 'teacher',
              header: tr('دبیر مسئول', 'Lead Teacher'),
              render: (r) => (r.teacherId ? userMap.get(r.teacherId)?.fullName ?? '—' : '—'),
            },
            {
              key: 'actions',
              header: tr('عملیات', 'Actions'),
              render: (r) => (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditSubject(r)}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSubject(r.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'accounts' && (
        <DataTable
          data={users}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجوی حساب کاربری...', 'Search accounts...')}
          searchFilter={(r, q) =>
            r.fullName.toLowerCase().includes(q) ||
            r.username.toLowerCase().includes(q) ||
            roleLabel(r.role).toLowerCase().includes(q)
          }
          toolbarExtra={
            <div className="flex flex-wrap items-center gap-2">
              {accountsWithVisiblePasswords.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllPasswordsVisible}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {allPasswordsVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{allPasswordsVisible ? tr('مخفی کردن رمزها', 'Hide Passwords') : tr('نمایش همه رمزها', 'Show Passwords')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => openExcelImportModal('mixed')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{tr('ورود گروهی با اکسل', 'Import Excel')}</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateUser('student')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('ایجاد حساب کاربری', 'Create Account')}</span>
              </button>
            </div>
          }
          columns={[
            {
              key: 'fullName',
              header: tr('نام کاربر', 'Full Name'),
              sortValue: (r) => r.fullName,
              render: (r) => <span className="font-semibold text-slate-900 dark:text-slate-100">{r.fullName}</span>,
            },
            {
              key: 'username',
              header: tr('نام کاربری', 'Username'),
              render: (r) => {
                const copyKey = `usr_${r.id}`;
                return (
                  <div className="inline-flex items-center gap-1.5" dir="ltr">
                    <span className="font-mono text-xs text-slate-800 dark:text-slate-200 select-all">{r.username}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCred(r.username, copyKey)}
                      title={tr('کپی نام کاربری', 'Copy username')}
                      className="p-1 rounded text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {copiedCredKey === copyKey ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              },
            },
            {
              key: 'password',
              header: tr('رمز عبور', 'Password'),
              render: (r) => {
                if (!r.displayPassword) {
                  return (
                    <button
                      type="button"
                      onClick={() => openEditUser(r)}
                      className="text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      {tr('تنظیم رمز جدید', 'Set Password')}
                    </button>
                  );
                }
                const isVisible = revealedPasswordIds.has(r.id);
                const copyKey = `pwd_${r.id}`;
                return (
                  <div className="inline-flex items-center gap-1" dir="ltr">
                    <span className="font-mono text-xs text-slate-800 dark:text-slate-200 min-w-[78px]">
                      {isVisible ? r.displayPassword : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleRowPasswordVisible(r.id)}
                      title={isVisible ? tr('مخفی کردن رمز', 'Hide password') : tr('نمایش رمز عبور', 'Show password')}
                      className="p-1 rounded text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyCred(r.displayPassword ?? '', copyKey)}
                      title={tr('کپی رمز عبور', 'Copy password')}
                      className="p-1 rounded text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {copiedCredKey === copyKey ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              },
            },
            {
              key: 'role',
              header: tr('نقش', 'Role'),
              sortValue: (r) => r.role,
              render: (r) => roleLabel(r.role),
            },
            {
              key: 'lastLogin',
              header: tr('آخرین ورود', 'Last Login'),
              render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{fmtDateTime(r.lastLoginAt)}</span>,
            },
            {
              key: 'active',
              header: tr('وضعیت', 'Status'),
              render: (r) => (
                <span className={`text-xs font-semibold ${r.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {r.active ? tr('فعال', 'Active') : tr('غیرفعال', 'Inactive')}
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
                    onClick={() => openEditUser(r)}
                    className="p-1.5 rounded text-slate-500 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {r.id !== user.id && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteUser(r.id)}
                      className="p-1.5 rounded text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'profile_requests' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('صف بررسی درخواست‌های تغییر پروفایل', 'Profile Change Requests Queue')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr(
                  'تغییرات اطلاعات پروفایل دانش‌آموزان و معلمان پس از تأیید شما اعمال می‌شود.',
                  'Student and teacher profile changes take effect only after administrator approval.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {[
                { id: 'pending', label: `${tr('در انتظار', 'Pending')} (${fmtDigits(pendingProfileRequests.length)})` },
                { id: 'approved', label: tr('تأییدشده', 'Approved') },
                { id: 'rejected', label: tr('ردشده', 'Rejected') },
                { id: 'all', label: tr('همه', 'All') },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReqFilter(t.id as typeof reqFilter)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    reqFilter === t.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
              <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {tr('درخواستی در این وضعیت یافت نشد', 'No requests match this filter')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((reqItem) => {
                const statusMeta =
                  reqItem.status === 'approved'
                    ? { icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-400', label: tr('تأییدشده', 'Approved') }
                    : reqItem.status === 'rejected'
                    ? { icon: XCircle, cls: 'text-red-700 dark:text-red-400', label: tr('ردشده', 'Rejected') }
                    : { icon: Clock, cls: 'text-amber-700 dark:text-amber-400', label: tr('در انتظار بررسی', 'Pending') };
                const StatusIcon = statusMeta.icon;

                return (
                  <div
                    key={reqItem.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                          <span className={`inline-flex items-center gap-1 font-bold ${statusMeta.cls}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            <span>{statusMeta.label}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{roleLabel(reqItem.userRole)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono" dir="ltr">{reqItem.username}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{fmtDateTime(reqItem.createdAt)}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {userMap.get(reqItem.userId)?.fullName ?? reqItem.username}
                        </h3>
                      </div>

                      {reqItem.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={reviewingReqId === reqItem.id}
                            onClick={() => void handleReviewProfileRequest(reqItem.id, 'approved')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{tr('تأیید و اعمال', 'Approve & Apply')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={reviewingReqId === reqItem.id}
                            onClick={() => {
                              setRejectModalReq(reqItem);
                              setRejectionReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{tr('رد درخواست', 'Reject')}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                      {Object.entries(reqItem.requestedValues).map(([key, newVal]) => {
                        const oldVal = reqItem.currentValues[key as keyof ProfileChangeFields];
                        const fieldLabel =
                          key === 'fullName'
                            ? tr('نام و نام خانوادگی', 'Full Name')
                            : key === 'age'
                            ? tr('سن', 'Age')
                            : key === 'phone'
                            ? tr('تلفن', 'Phone')
                            : key === 'email'
                            ? tr('ایمیل', 'Email')
                            : tr('تصویر پروفایل', 'Avatar');
                        return (
                          <div
                            key={key}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                          >
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              {fieldLabel}
                            </p>
                            {key === 'avatarUrl' && typeof newVal === 'string' && newVal ? (
                              <img
                                src={newVal}
                                alt="New avatar"
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div className="space-y-0.5">
                                <p className="line-through text-slate-400 truncate">{String(oldVal ?? '—')}</p>
                                <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{String(newVal ?? '—')}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {reqItem.reason && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {tr('علت درخواست:', 'Reason:')} {reqItem.reason}
                      </p>
                    )}
                    {reqItem.rejectionReason && (
                      <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                        {tr('دلیل رد:', 'Rejection reason:')} {reqItem.rejectionReason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Modal
            open={!!rejectModalReq}
            onClose={() => setRejectModalReq(null)}
            title={tr('رد درخواست تغییر پروفایل', 'Reject Profile Change Request')}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rejectModalReq) {
                  void handleReviewProfileRequest(rejectModalReq.id, 'rejected', rejectionReason);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('دلیل رد درخواست (اختیاری - برای کاربر پیام می‌شود)', 'Rejection Reason (Optional — sent to user)')}
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalReq(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {tr('انصراف', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                >
                  {tr('ثبت رد درخواست', 'Confirm Rejection')}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-4">
          {roles.map((r) => (
            <div key={r.role} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {lang === 'fa' ? r.titleFa : roleLabel(r.role)}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.descriptionFa}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-4">
                {Object.entries(PERMISSION_LABELS).map(([permKey, permText]) => {
                  const checked = r.permissions.includes(permKey);
                  return (
                    <label
                      key={permKey}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => void toggleRolePermission(r.role, permKey)}
                      />
                      <span className="text-slate-800 dark:text-slate-200">{lang === 'fa' ? permText.fa : permText.en}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'grades' && (
        <div className="space-y-4">
          <DataTable
            data={
              !workerMode && selectedGradeStudentId
                ? grades.filter((g) => g.studentId === selectedGradeStudentId)
                : grades
            }
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجو بر اساس نام دانش‌آموز، درس یا عنوان...', 'Search student, subject or title...')}
            searchFilter={(r, q) =>
              (userMap.get(r.studentId)?.fullName ?? r.studentName ?? '').toLowerCase().includes(q) ||
              (subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? r.subjectId ?? '').toLowerCase().includes(q) ||
              (r.title ?? '').toLowerCase().includes(q)
            }
            toolbarExtra={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedGradeStudentId}
                  onChange={(e) => setSelectedGradeStudentId(e.target.value)}
                  aria-label={tr('انتخاب دانش‌آموز', 'Select student')}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  {!workerMode && <option value="">{tr('همه دانش‌آموزان', 'All Students')}</option>}
                  {students.length === 0 && <option value="">{tr('دانش‌آموزی یافت نشد', 'No students')}</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
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
                  onClick={() => {
                    setGrdStudentId(selectedGradeStudentId || students[0]?.id || '');
                    setGrdSubjectId(subjects[0]?.id ?? '');
                    setGrdSubjectName('');
                    setGrdModalOpen(true);
                  }}
                  disabled={students.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('ثبت نمره', 'Record Grade')}</span>
                </button>
              </div>
            }
            columns={[
              {
                key: 'student',
                header: tr('دانش‌آموز', 'Student'),
                render: (r) => <span className="font-semibold">{userMap.get(r.studentId)?.fullName ?? r.studentName ?? '—'}</span>,
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
                    {fmtNum(r.score)} / {fmtDigits(r.maxScore)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: tr('حذف', 'Delete'),
                render: (r) => (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/grades/${r.id}`, { method: 'DELETE' });
                      if (workerMode && selectedGradeStudentId) {
                        await fetchGradesForStudent(selectedGradeStudentId);
                      } else {
                        await loadAll();
                      }
                      showToast(tr('نمره حذف شد.', 'Grade deleted.'));
                    }}
                    className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ),
              },
            ]}
          />

          <Modal open={grdModalOpen} onClose={() => setGrdModalOpen(false)} title={tr('ثبت نمره توسط مدیریت', 'Record Grade (Admin)')}>
            <form onSubmit={handleCreateAdminGrade} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دانش‌آموز', 'Student')}</label>
                <select
                  value={grdStudentId}
                  onChange={(e) => setGrdStudentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({classMap.get(s.classId ?? '')?.name ?? s.gradeLevel ?? tr('بدون کلاس', 'No class')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('درس', 'Subject')}</label>
                  {subjects.length > 0 ? (
                    <select
                      value={grdSubjectId}
                      onChange={(e) => setGrdSubjectId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={grdSubjectName}
                      onChange={(e) => setGrdSubjectName(e.target.value)}
                      placeholder={tr('مثلاً ریاضی', 'e.g. Mathematics')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                    />
                  )}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('عنوان', 'Title')}</label>
                  <input
                    type="text"
                    required
                    value={grdTitle}
                    onChange={(e) => setGrdTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نمره (از ۲۰)', 'Score (/20)')}</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="20"
                    required
                    dir="ltr"
                    value={grdScore}
                    onChange={(e) => setGrdScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setGrdModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                  {tr('انصراف', 'Cancel')}
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500">
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
        <div className="space-y-5">
          <AttendanceBreakdownChart
            title={tr('آمار حضور و غیاب کل مدرسه', 'School Attendance Summary')}
            stats={overview?.attendanceStats ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 }}
          />
          <DataTable
            data={
              !workerMode && selectedAttStudentId
                ? attendance.filter((a) => a.studentId === selectedAttStudentId)
                : attendance
            }
            keyExtractor={(r) => r.id}
            loading={loading}
            searchPlaceholder={tr('جستجوی دانش‌آموز یا تاریخ...', 'Search student or date...')}
            searchFilter={(r, q) =>
              (userMap.get(r.studentId)?.fullName ?? r.studentName ?? '').toLowerCase().includes(q) ||
              (r.date ?? '').toLowerCase().includes(q)
            }
            toolbarExtra={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedAttStudentId}
                  onChange={(e) => setSelectedAttStudentId(e.target.value)}
                  aria-label={tr('انتخاب دانش‌آموز', 'Select student')}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  {!workerMode && <option value="">{tr('همه دانش‌آموزان', 'All Students')}</option>}
                  {students.length === 0 && <option value="">{tr('دانش‌آموزی یافت نشد', 'No students')}</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={openAttendanceModal}
                  disabled={classes.length === 0 && students.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('ثبت حضور و غیاب', 'Record Attendance')}</span>
                </button>
              </div>
            }
            columns={[
              {
                key: 'student',
                header: tr('دانش‌آموز', 'Student'),
                render: (r) => <span className="font-semibold">{userMap.get(r.studentId)?.fullName ?? r.studentName ?? '—'}</span>,
              },
              { key: 'class', header: tr('کلاس', 'Class'), render: (r) => classMap.get(r.classId)?.name ?? r.className ?? '—' },
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
              {
                key: 'actions',
                header: tr('حذف', 'Delete'),
                render: (r) => (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/attendance/${r.id}`, { method: 'DELETE' });
                      if (workerMode && selectedAttStudentId) {
                        await fetchAttendanceForStudent(selectedAttStudentId);
                      } else {
                        await loadAll();
                      }
                      showToast(tr('رکورد حضور و غیاب حذف شد.', 'Record deleted.'));
                    }}
                    className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'assignments' && (
        <DataTable
          data={assignments}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجو در عنوان تکالیف...', 'Search assignments...')}
          searchFilter={(r, q) => (r.title ?? '').toLowerCase().includes(q)}
          columns={[
            { key: 'title', header: tr('عنوان تکلیف', 'Title'), render: (r) => <span className="font-semibold">{r.title}</span> },
            { key: 'class', header: tr('کلاس', 'Class'), render: (r) => classMap.get(r.classId)?.name ?? r.className ?? '—' },
            { key: 'subject', header: tr('درس', 'Subject'), render: (r) => subjectMap.get(r.subjectId)?.name ?? r.subjectName ?? (r.subjectId || '—') },
            { key: 'teacher', header: tr('معلم', 'Teacher'), render: (r) => userMap.get(r.teacherId)?.fullName ?? r.teacherName ?? '—' },
            { key: 'due', header: tr('مهلت تحویل', 'Due Date'), render: (r) => <span className="tabular-nums">{fmtDate(r.dueDate)}</span> },
            {
              key: 'actions',
              header: tr('حذف', 'Delete'),
              render: (r) => (
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/assignments/${r.id}`, { method: 'DELETE' });
                    await loadAll();
                    showToast(tr('تکلیف حذف شد.', 'Assignment deleted.'));
                  }}
                  className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ),
            },
          ]}
        />
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{tr('کلاس:', 'Class:')}</label>
              <select
                value={schClassFilter}
                onChange={(e) => setSchClassFilter(e.target.value)}
                className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setSchSubjectId(subjects[0]?.id ?? '');
                setSchTeacherId(teachers[0]?.id ?? '');
                setSchModalOpen(true);
              }}
              disabled={classes.length === 0 || subjects.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('افزودن زنگ درسی', 'Add Schedule Slot')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((dayIdx) => {
              const dayName = weekdayLabel(dayIdx);
              const daySlots = schedules.filter(
                (s) => s.classId === schClassFilter && s.dayOfWeek === dayIdx
              );
              return (
                <div key={dayIdx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-900 dark:text-slate-100">
                    {dayName}
                  </div>
                  {daySlots.length === 0 ? (
                    <p className="p-4 text-xs text-slate-400 dark:text-slate-500">{tr('برنامه‌ای ثبت نشده است', 'No sessions')}</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {daySlots.map((slot) => (
                        <div key={slot.id} className="p-3.5 flex items-start justify-between gap-2 text-xs">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">
                              {subjectMap.get(slot.subjectId)?.name ?? tr('درس', 'Subject')} · {tr('زنگ', 'Period')} {fmtDigits(slot.period)}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300 mt-1">{userMap.get(slot.teacherId)?.fullName ?? '—'}</p>
                            <p className="text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                              {fmtDigits(slot.startTime)} {tr('تا', '–')} {fmtDigits(slot.endTime)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteScheduleSlot(slot.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Modal open={schModalOpen} onClose={() => setSchModalOpen(false)} title={tr('افزودن زنگ به برنامه هفتگی', 'Add Timetable Slot')}>
            <form onSubmit={handleCreateScheduleSlot} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('روز هفته', 'Day of Week')}</label>
                  <select
                    value={schDay}
                    onChange={(e) => setSchDay(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <option key={idx} value={idx}>{weekdayLabel(idx)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('شماره زنگ', 'Period')}</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={schPeriod}
                    onChange={(e) => setSchPeriod(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('ساعت شروع', 'Start Time')}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={schStart}
                    onChange={(e) => setSchStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('ساعت پایان', 'End Time')}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={schEnd}
                    onChange={(e) => setSchEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('درس', 'Subject')}</label>
                  <select
                    value={schSubjectId}
                    onChange={(e) => setSchSubjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('معلم', 'Teacher')}</label>
                  <select
                    value={schTeacherId}
                    onChange={(e) => setSchTeacherId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس / آزمایشگاه', 'Room / Lab')}</label>
                <input
                  type="text"
                  value={schRoom}
                  onChange={(e) => setSchRoom(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSchModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                  {tr('انصراف', 'Cancel')}
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500">
                  {tr('ثبت در برنامه', 'Add Slot')}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {activeTab === 'private_tutor' && (
        <PrivateTutorView user={user} subjects={subjects} students={students} onSavedToPlanner={loadAll} />
      )}

      {activeTab === 'academic_risk' && (
        <AcademicRiskView />
      )}

      {activeTab === 'planner' && (
        <StudyPlannerView user={user} plans={studyPlans} subjects={subjects} onReload={loadAll} />
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
          recipients={users.filter((u) => u.id !== user.id).map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }))}
          onReload={loadAll}
          chatUnreadCount={chatUnreadCount}
          onChatUnreadChange={setChatUnreadCount}
        />
      )}

      {activeTab === 'report_card' && (
        <AdvancedReportCardView
          user={user}
          settings={settings}
          classes={classes}
          students={students}
          initialStudentId={selectedGradeStudentId || undefined}
        />
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Interactive Report Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tr('گزارش‌ساز پیشرفته و فیلترپذیر مدرسه', 'Filterable School Analytics')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {tr('تعداد نمرات منطبق با فیلتر:', 'Matching grades:')} {fmtDigits(filteredReportGrades.length)} ·{' '}
                  {tr('میانگین:', 'Average:')} {filteredReportGrades.length > 0 ? fmtNum(filteredReportAvg) : '—'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={repGradeLevel}
                  onChange={(e) => setRepGradeLevel(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">{tr('همه پایه‌ها', 'All Grades')}</option>
                  {GRADE_LEVELS_FA.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <select
                  value={repClassId}
                  onChange={(e) => setRepClassId(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">{tr('همه کلاس‌ها', 'All Classes')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={repSubjectId}
                  onChange={(e) => setRepSubjectId(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">{tr('همه دروس', 'All Subjects')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HorizontalBarChart
              title={tr('میانگین نمرات به تفکیک کلاس', 'Class Average Comparison')}
              data={
                (overview?.classAverages ?? []).map((c) => ({
                  label: c.label,
                  value: c.value,
                  sublabel: `${fmtDigits(c.students)} ${tr('دانش‌آموز', 'students')}`,
                }))
              }
            />
            <HorizontalBarChart
              title={tr('میانگین نمرات به تفکیک دروس', 'Subject Average Comparison')}
              data={
                (overview?.subjectAverages ?? []).map((s) => ({
                  label: s.label,
                  value: s.value,
                  sublabel: `${fmtDigits(s.count)} ${tr('نمره', 'grades')}`,
                }))
              }
            />
          </div>
          <AttendanceBreakdownChart
            title={tr('گزارش وضعیت حضور و غیاب مدرسه', 'School Attendance Breakdown')}
            stats={overview?.attendanceStats ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 }}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 max-w-3xl">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
              {tr('تنظیمات عمومی سامانه مدرسه', 'General School System Settings')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نام مدرسه', 'School Name')}</label>
                <input
                  type="text"
                  required
                  value={cfgSchoolName}
                  onChange={(e) => setCfgSchoolName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('سال تحصیلی', 'Academic Year')}</label>
                <input
                  type="text"
                  required
                  value={cfgAcademicYear}
                  onChange={(e) => setCfgAcademicYear(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نام مدیر مدرسه', 'Principal Name')}</label>
                <input
                  type="text"
                  value={cfgPrincipal}
                  onChange={(e) => setCfgPrincipal(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نوبت جاری', 'Current Term')}</label>
                <select
                  value={cfgTerm}
                  onChange={(e) => setCfgTerm(e.target.value as GradeTerm)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="مستمر اول">{termLabel('مستمر اول')}</option>
                  <option value="نوبت اول">{termLabel('نوبت اول')}</option>
                  <option value="مستمر دوم">{termLabel('مستمر دوم')}</option>
                  <option value="نوبت دوم">{termLabel('نوبت دوم')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('حدنصاب قبولی (از ۲۰)', 'Passing Score (/20)')}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  dir="ltr"
                  value={cfgPassing}
                  onChange={(e) => setCfgPassing(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgAiEnabled}
                  onChange={(e) => setCfgAiEnabled(e.target.checked)}
                />
                <span>{tr('فعال بودن دستیار هوش مصنوعی برای دانش‌آموزان و معلمان', 'Enable AI assistant for students and teachers')}</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgAsgSub}
                  onChange={(e) => setCfgAsgSub(e.target.checked)}
                />
                <span>{tr('اجازه ارسال پاسخ تکالیف توسط دانش‌آموزان', 'Allow students to submit assignments')}</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                {tr('ذخیره تنظیمات سامانه', 'Save Settings')}
              </button>
            </div>
          </form>

          <ProfileView user={user} onUpdated={onUserUpdated} />
        </div>
      )}

      {activeTab === 'audit' && (
        <DataTable
          data={auditLogs}
          keyExtractor={(r) => r.id}
          loading={loading}
          searchPlaceholder={tr('جستجو در نام کاربر، عملیات یا جزئیات...', 'Search user, action or details...')}
          searchFilter={(r, q) =>
            r.userName.toLowerCase().includes(q) ||
            r.action.toLowerCase().includes(q) ||
            r.details.toLowerCase().includes(q)
          }
          emptyTitle={tr('رویدادی ثبت نشده است', 'No activity logged yet')}
          emptyDescription={tr('رویدادهای مهم ورود، تغییرات کاربران، نمرات و تنظیمات در این جدول ثبت می‌شوند.', 'Important sign-in, user, grade, and settings audit events appear here.')}
          columns={[
            {
              key: 'timestamp',
              header: tr('زمان', 'Timestamp'),
              render: (r) => <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{fmtDateTime(r.timestamp)}</span>,
            },
            {
              key: 'user',
              header: tr('کاربر', 'User'),
              render: (r) => (
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {r.userName} ({roleLabel(r.userRole)})
                </span>
              ),
            },
            { key: 'action', header: tr('عملیات', 'Action'), render: (r) => r.action },
            { key: 'target', header: tr('هدف', 'Target'), render: (r) => r.target },
            { key: 'details', header: tr('جزئیات', 'Details'), render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300">{r.details}</span> },
          ]}
        />
      )}

      {/* User Create/Edit Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `${tr('ویرایش کاربر:', 'Edit User:')} ${editingUser.fullName}` : tr('ایجاد حساب کاربری جدید', 'Create New User Account')}
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نام و نام خانوادگی', 'Full Name')}</label>
              <input
                type="text"
                required
                value={uFullName}
                onChange={(e) => setUFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نقش کاربری', 'User Role')}</label>
              <select
                value={uRole}
                onChange={(e) => {
                  const nextRole = e.target.value as UserRole;
                  setURole(nextRole);
                  if (!editingUser) {
                    setUPermissions(roles.find((r) => r.role === nextRole)?.permissions ?? []);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="student">{roleLabel('student')}</option>
                <option value="teacher">{roleLabel('teacher')}</option>
                <option value="admin">{roleLabel('admin')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {editingUser
                  ? tr('نام کاربری', 'Username')
                  : tr('نام کاربری (خالی = تصادفی)', 'Username (blank = random)')}
              </label>
              <input
                type="text"
                disabled={!!editingUser}
                pattern={editingUser ? undefined : '([a-zA-Z0-9._-]{3,32})?'}
                dir="ltr"
                placeholder={editingUser ? undefined : tr('تولید خودکار در صورت خالی بودن', 'Auto-generated if empty')}
                value={uUsername}
                onChange={(e) => setUUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left disabled:bg-slate-100 dark:disabled:bg-slate-800/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کد ملی / کد دانش‌آموزی', 'National / Student ID')}</label>
              <input
                type="text"
                dir="ltr"
                value={uNationalId}
                onChange={(e) => setUNationalId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {editingUser
                  ? tr('رمز عبور جدید (اختیاری)', 'New Password (optional)')
                  : tr('رمز عبور (خالی = تصادفی)', 'Password (blank = random)')}
              </label>
              <input
                type="password"
                minLength={6}
                dir="ltr"
                placeholder={editingUser ? tr('بدون تغییر', 'Unchanged') : tr('تولید خودکار رمز ۸ کاراکتری', 'Auto-generated 8-char')}
                value={uPassword}
                onChange={(e) => setUPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('شماره تماس', 'Phone')}</label>
              <input
                type="text"
                dir="ltr"
                value={uPhone}
                onChange={(e) => setUPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
          </div>

          {uRole === 'student' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('پایه تحصیلی', 'Grade Level')}</label>
                <select
                  value={uGradeLevel}
                  onChange={(e) => setUGradeLevel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {GRADE_LEVELS_FA.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس', 'Class')}</label>
                <select
                  value={uClassId}
                  onChange={(e) => setUClassId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">{tr('تخصیص‌نیافته', 'Unassigned')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {uRole === 'teacher' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس‌های مجاز معلم:', 'Assigned Classes:')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={uAssignedClasses.includes(c.id)}
                        onChange={(e) =>
                          setUAssignedClasses((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          )
                        }
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دروس تخصصی معلم:', 'Assigned Subjects:')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {subjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={uAssignedSubjects.includes(s.id)}
                        onChange={(e) =>
                          setUAssignedSubjects((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                          )
                        }
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {tr('مجوزهای دسترسی کاربر (ذخیره در دیتابیس):', 'User Permissions (Saved in DB):')}
              </p>
              <button
                type="button"
                onClick={() => setUPermissions(roles.find((r) => r.role === uRole)?.permissions ?? [])}
                className="text-[11px] font-medium text-[#0F274A] dark:text-sky-400 hover:underline"
              >
                {tr('بازگردانی پیش‌فرض نقش', 'Reset to Role Defaults')}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
              {Object.entries(PERMISSION_LABELS).map(([permKey, permText]) => (
                <label key={permKey} className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uPermissions.includes(permKey)}
                    onChange={(e) =>
                      setUPermissions((prev) =>
                        e.target.checked ? [...prev, permKey] : prev.filter((p) => p !== permKey)
                      )
                    }
                  />
                  <span>{lang === 'fa' ? permText.fa : permText.en}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={uActive} onChange={(e) => setUActive(e.target.checked)} />
            <span>{tr('حساب کاربری فعال باشد', 'Account is active')}</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUserModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              {tr('انصراف', 'Cancel')}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500">
              {tr('ذخیره اطلاعات', 'Save User')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Class Modal */}
      <Modal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        title={editingClass ? tr('ویرایش کلاس', 'Edit Class') : tr('ایجاد کلاس جدید', 'Create New Class')}
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نام کلاس', 'Class Name')}</label>
              <input
                type="text"
                required
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('پایه تحصیلی', 'Grade Level')}</label>
              <select
                value={cGradeLevel}
                onChange={(e) => setCGradeLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('ظرفیت', 'Capacity')}</label>
              <input
                type="number"
                dir="ltr"
                value={cCapacity}
                onChange={(e) => setCCapacity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('شماره اتاق', 'Room')}</label>
              <input
                type="text"
                value={cRoom}
                onChange={(e) => setCRoom(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('معلمان کلاس:', 'Class Teachers:')}</p>
            <div className="grid grid-cols-2 gap-2">
              {teachers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={cTeachers.includes(t.id)}
                    onChange={(e) =>
                      setCTeachers((prev) =>
                        e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                      )
                    }
                  />
                  <span>{t.fullName}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دروس کلاس:', 'Class Subjects:')}</p>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={cSubjects.includes(s.id)}
                    onChange={(e) =>
                      setCSubjects((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setClassModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              {tr('انصراف', 'Cancel')}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500">
              {tr('ذخیره کلاس', 'Save Class')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Subject Modal */}
      <Modal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        title={editingSubject ? tr('ویرایش درس', 'Edit Subject') : tr('تعریف درس جدید', 'Define New Subject')}
      >
        <form onSubmit={handleSaveSubject} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('نام درس', 'Subject Name')}</label>
              <input
                type="text"
                required
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کد درس', 'Code')}</label>
              <input
                type="text"
                dir="ltr"
                value={sCode}
                onChange={(e) => setSCode(e.target.value)}
                placeholder="MTH-101"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('پایه', 'Grade')}</label>
              <select
                value={sGradeLevel}
                onChange={(e) => setSGradeLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('ضریب', 'Weight')}</label>
              <input
                type="number"
                min="1"
                max="10"
                dir="ltr"
                value={sCoeff}
                onChange={(e) => setSCoeff(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دبیر مسئول', 'Lead Teacher')}</label>
              <select
                value={sTeacherId}
                onChange={(e) => setSTeacherId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="">{tr('نامشخص', 'Unspecified')}</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSubjectModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              {tr('انصراف', 'Cancel')}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500">
              {tr('ذخیره درس', 'Save Subject')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Academic History Modal */}
      <Modal
        open={!!historyStudent}
        onClose={() => setHistoryStudent(null)}
        title={`${tr('سوابق تحصیلی دانش‌آموز:', 'Academic History:')} ${historyStudent?.fullName ?? ''}`}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-5">
          <form onSubmit={handleAddHistory} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{tr('ثبت سابقه تحصیلی سال گذشته', 'Add Prior Year Record')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">{tr('سال تحصیلی', 'Year')}</label>
                <input
                  type="text"
                  required
                  value={hisYear}
                  onChange={(e) => setHisYear(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">{tr('پایه', 'Grade')}</label>
                <select
                  value={hisGradeLevel}
                  onChange={(e) => setHisGradeLevel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                >
                  {GRADE_LEVELS_FA.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">{tr('معدل کل', 'GPA')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="20"
                  required
                  dir="ltr"
                  value={hisGpa}
                  onChange={(e) => setHisGpa(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs font-mono text-left"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">{tr('وضعیت', 'Status')}</label>
                <select
                  value={hisStatus}
                  onChange={(e) => setHisStatus(e.target.value as AcademicHistoryRecord['status'])}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs"
                >
                  <option value="قبول">{tr('قبول', 'Passed')}</option>
                  <option value="ممتاز">{tr('ممتاز', 'Honors')}</option>
                  <option value="نیاز به تلاش">{tr('نیاز به تلاش', 'Needs Improvement')}</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder={tr('توضیحات کارنامه یا رتبه کلاسی...', 'Summary or notes...')}
                value={hisSummary}
                onChange={(e) => setHisSummary(e.target.value)}
                className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={savingHistory}
                className="px-4 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {savingHistory ? tr('در حال ثبت...', 'Saving...') : tr('افزودن سابقه', 'Add Record')}
              </button>
            </div>
          </form>

          {loadingHistories ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">{tr('در حال دریافت سوابق...', 'Loading...')}</p>
          ) : studentHistories.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              {tr('سابقه تحصیلی برای این دانش‌آموز ثبت نشده است.', 'No academic history recorded for this student.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {studentHistories.map((h) => (
                <div key={h.id} className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 text-xs">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {tr('سال', 'Year')} {fmtDigits(h.academicYear)} · {tr('پایه', 'Grade')} {h.gradeLevel} · {tr('معدل', 'GPA')} {fmtNum(h.gpa)}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                      {tr('وضعیت:', 'Status:')} <span className="font-semibold text-emerald-700 dark:text-emerald-400">{h.status}</span>
                      {h.summary ? ` · ${h.summary}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteHistory(h.id)}
                    aria-label={tr('حذف سابقه', 'Delete record')}
                    className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Admin Batch / Single Attendance Modal */}
      <Modal
        open={attModalOpen}
        onClose={() => setAttModalOpen(false)}
        title={tr('ثبت حضور و غیاب توسط مدیریت', 'Record Attendance (Admin)')}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveAdminAttendance} className="space-y-4">
          {classes.length > 0 && students.length > 0 && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setAttMode('class')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  attMode === 'class'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tr('ثبت گروهی کلاس', 'Class Batch')}
              </button>
              <button
                type="button"
                onClick={() => setAttMode('single')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  attMode === 'single'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tr('ثبت برای یک دانش‌آموز', 'Single Student')}
              </button>
            </div>
          )}

          {attMode === 'single' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('دانش‌آموز', 'Student')}</label>
                  <select
                    value={attSingleStudentId}
                    onChange={(e) => setAttSingleStudentId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('وضعیت حضور', 'Status')}</label>
                  <select
                    value={attSingleStatus}
                    onChange={(e) => setAttSingleStatus(e.target.value as AttendanceRecord['status'])}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="present">{attendanceLabel('present')}</option>
                    <option value="absent">{attendanceLabel('absent')}</option>
                    <option value="late">{attendanceLabel('late')}</option>
                    <option value="excused">{attendanceLabel('excused')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('توضیحات', 'Note')}</label>
                  <input
                    type="text"
                    value={attSingleNote}
                    onChange={(e) => setAttSingleNote(e.target.value)}
                    placeholder={tr('توضیح اختیاری...', 'Optional note...')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{tr('کلاس', 'Class')}</label>
                  <select
                    value={attClassId}
                    onChange={(e) => initAttendanceEntriesForClass(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
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
                      <option key={s.id} value={s.id}>{s.name}</option>
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

              {attModalStudents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  {tr('دانش‌آموزی در این کلاس ثبت نشده است.', 'No students enrolled in this class.')}
                </p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {attModalStudents.map((stu) => {
                    const val = attEntries[stu.id] ?? { status: 'present', note: '' };
                    return (
                      <div key={stu.id} className="p-3 flex flex-wrap items-center justify-between gap-2.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 min-w-[140px]">{stu.fullName}</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {(['present', 'absent', 'late', 'excused'] as const).map((statusKey) => {
                            const active = val.status === statusKey;
                            const activeCls =
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
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                                  active
                                    ? `${activeCls} font-bold`
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
                          placeholder={tr('توضیح...', 'Note...')}
                          value={val.note}
                          onChange={(e) =>
                            setAttEntries((prev) => ({
                              ...prev,
                              [stu.id]: { ...val, note: e.target.value },
                            }))
                          }
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1 text-xs min-w-[130px]"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAttModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingAtt || (attMode === 'class' ? attModalStudents.length === 0 : !attSingleStudentId)}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
            >
              {savingAtt ? tr('در حال ثبت...', 'Saving...') : tr('ذخیره حضور و غیاب', 'Save Attendance')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Excel Bulk Import Modal (Students & Teachers) */}
      <Modal
        open={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        maxWidthClass="max-w-4xl"
        title={tr('ورود گروهی دانش‌آموزان و معلمان از فایل اکسل', 'Bulk Import Students & Teachers via Excel')}
      >
        <div className="space-y-4">
          {!excelResult ? (
            <>
              {/* Sample Template & Format Guide */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {tr('راهنمای ساختار فایل اکسل (.xlsx / .xls / .csv)', 'Excel Template & Format Guide')}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-5">
                      {tr(
                        'اگر ستون «نام کاربری» یا «رمز عبور» خالی باشد، سیستم به صورت خودکار نام کاربری و رمز عبور تصادفی می‌سازد، دانش‌آموز را عضو کلاس می‌کند و اطلاعات ورود را برای تحویل به دانش‌آموز/معلم به شما اعلام می‌کند.',
                        'Blank username or password cells are auto-generated securely, students are auto-enrolled in matching classes, and credentials are reported to you.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSampleExcel}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>{tr('دانلود فایل نمونه اکسل', 'Download Sample Excel')}</span>
                  </button>
                </div>

                {/* Compact visual sample preview */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <table className="w-full text-[11px] text-right">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('نام و نام خانوادگی *', 'Full Name *')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('نقش', 'Role')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('نام کاربری', 'Username')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('رمز عبور', 'Password')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('پایه', 'Grade')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('کلاس', 'Class')}</th>
                        <th className="px-2.5 py-1.5 font-semibold">{tr('کد ملی', 'National ID')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <td className="px-2.5 py-1.5">امیرحسین رضایی</td>
                        <td className="px-2.5 py-1.5">دانش‌آموز</td>
                        <td className="px-2.5 py-1.5 font-mono" dir="ltr">amir_701</td>
                        <td className="px-2.5 py-1.5 font-mono" dir="ltr">Amir@1405</td>
                        <td className="px-2.5 py-1.5">هفتم</td>
                        <td className="px-2.5 py-1.5">هفتم الف</td>
                        <td className="px-2.5 py-1.5 font-mono" dir="ltr">1389112233</td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5">پارسا مرادی</td>
                        <td className="px-2.5 py-1.5">دانش‌آموز</td>
                        <td className="px-2.5 py-1.5 text-amber-700 dark:text-amber-400">خالی (تصادفی)</td>
                        <td className="px-2.5 py-1.5 text-amber-700 dark:text-amber-400">خالی (تصادفی)</td>
                        <td className="px-2.5 py-1.5">هشتم</td>
                        <td className="px-2.5 py-1.5">هشتم الف</td>
                        <td className="px-2.5 py-1.5 font-mono" dir="ltr">1388445566</td>
                      </tr>
                      <tr>
                        <td className="px-2.5 py-1.5">استاد علی محمدی</td>
                        <td className="px-2.5 py-1.5">معلم</td>
                        <td className="px-2.5 py-1.5 text-amber-700 dark:text-amber-400">خالی (تصادفی)</td>
                        <td className="px-2.5 py-1.5 text-amber-700 dark:text-amber-400">خالی (تصادفی)</td>
                        <td className="px-2.5 py-1.5">—</td>
                        <td className="px-2.5 py-1.5">هفتم الف، هشتم الف</td>
                        <td className="px-2.5 py-1.5 font-mono" dir="ltr">1372001122</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Options + File Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('حالت تشخیص نقش کاربران فایل:', 'Import Role Mode:')}
                  </label>
                  <select
                    value={excelMode}
                    onChange={(e) => {
                      const nextMode = e.target.value as 'student' | 'teacher' | 'mixed';
                      setExcelMode(nextMode);
                      if (nextMode !== 'mixed') {
                        setExcelRows((prev) => prev.map((r) => ({ ...r, role: nextMode })));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="mixed">{tr('ترکیبی (تشخیص از ستون نقش در اکسل)', 'Mixed (Read Role Column)')}</option>
                    <option value="student">{tr('همه ردیف‌ها دانش‌آموز ثبت شوند', 'Import All as Students')}</option>
                    <option value="teacher">{tr('همه ردیف‌ها معلم ثبت شوند', 'Import All as Teachers')}</option>
                  </select>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excelAutoCreateClasses}
                      onChange={(e) => setExcelAutoCreateClasses(e.target.checked)}
                    />
                    <span>
                      {tr(
                        'کلاس‌های جدید درج‌شده در اکسل خودکار ساخته و دانش‌آموز عضو شود',
                        'Auto-create missing classes & enroll students'
                      )}
                    </span>
                  </label>
                </div>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0F274A] dark:hover:border-sky-500 bg-slate-50/50 dark:bg-slate-800/30 p-6 cursor-pointer transition-colors">
                <Upload className="w-6 h-6 text-[#0F274A] dark:text-sky-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {excelFileName
                    ? `${tr('فایل انتخاب‌شده:', 'Selected:')} ${excelFileName} (${fmtDigits(excelRows.length)} ${tr('ردیف', 'rows')})`
                    : tr('فایل اکسل (.xlsx، .xls یا .csv) را انتخاب کنید', 'Select Excel file (.xlsx, .xls, or .csv)')}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {tr('برای انتخاب فایل جدید کلیک کنید', 'Click to browse file')}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => void handleExcelFileUpload(e)}
                  className="hidden"
                />
              </label>

              {/* Parsed Rows Preview */}
              {excelRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {tr('پیش‌نمایش ردیف‌های آماده‌شده:', 'Parsed Rows Preview:')} ({fmtDigits(excelRows.length)})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {tr('ردیف‌های بدون نام کاربری/رمز، مقدار تصادفی می‌گیرند', 'Blank username/password will be auto-generated')}
                    </span>
                  </div>
                  <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 text-slate-700 dark:text-slate-300">
                        <tr>
                          <th className="px-2.5 py-2">#</th>
                          <th className="px-2.5 py-2">{tr('نام و نام خانوادگی', 'Full Name')}</th>
                          <th className="px-2.5 py-2">{tr('نقش', 'Role')}</th>
                          <th className="px-2.5 py-2">{tr('نام کاربری', 'Username')}</th>
                          <th className="px-2.5 py-2">{tr('رمز عبور', 'Password')}</th>
                          <th className="px-2.5 py-2">{tr('پایه / کلاس', 'Grade / Class')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {excelRows.map((row, idx) => (
                          <tr key={`${row.rowNumber ?? idx}-${idx}`} className={!row.fullName ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                            <td className="px-2.5 py-1.5 text-slate-500 tabular-nums">{fmtDigits(idx + 1)}</td>
                            <td className="px-2.5 py-1.5 font-semibold text-slate-900 dark:text-slate-100">
                              {row.fullName || <span className="text-red-600">{tr('نام خالی است', 'Missing name')}</span>}
                            </td>
                            <td className="px-2.5 py-1.5">{roleLabel(row.role)}</td>
                            <td className="px-2.5 py-1.5 font-mono text-[11px]" dir="ltr">
                              {row.username || (
                                <span className="text-amber-700 dark:text-amber-400 font-sans">
                                  {tr('تصادفی', 'Auto')}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-[11px]" dir="ltr">
                              {row.password ? '••••••' : (
                                <span className="text-amber-700 dark:text-amber-400 font-sans">
                                  {tr('تصادفی', 'Auto')}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              {[row.gradeLevel, row.className].filter(Boolean).join(' · ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExcelModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {tr('بستن', 'Close')}
                </button>
                <button
                  type="button"
                  disabled={excelImporting || excelRows.length === 0}
                  onClick={() => void handleSubmitExcelImport()}
                  className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  {excelImporting
                    ? tr('در حال ثبت و عضویت...', 'Importing...')
                    : tr('ثبت نهایی و عضویت کاربران', 'Import & Enroll Users')}
                </button>
              </div>
            </>
          ) : (
            /* Results & Generated Credentials Announcement View */
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                      {excelResult.message}
                    </h3>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                      {tr(
                        'نام کاربری و رمز عبور همه کاربران ثبت‌شده در جدول زیر و همچنین در بخش «حساب‌های کاربری» قابل مشاهده است.',
                        'All usernames and passwords are listed below and remain visible in the User Accounts tab.'
                      )}
                      {excelResult.createdClassesCount > 0 &&
                        ` (${fmtDigits(excelResult.createdClassesCount)} ${tr('کلاس جدید خودکار ایجاد شد', 'new classes auto-created')})`}
                    </p>
                  </div>
                </div>
                {excelResult.created.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyAllCredentials(excelResult.created)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{tr('کپی همه اطلاعات ورود', 'Copy All')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCredentialsExcel(excelResult.created)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{tr('دانلود اکسل اطلاعات ورود', 'Export Credentials Excel')}</span>
                    </button>
                  </div>
                )}
              </div>

              {excelResult.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4" />
                    <span>{tr('ردیف‌های دارای خطا:', 'Rows with errors:')} ({fmtDigits(excelResult.errors.length)})</span>
                  </div>
                  <ul className="text-[11px] text-amber-800 dark:text-amber-200 space-y-1 max-h-28 overflow-y-auto">
                    {excelResult.errors.map((errItem, i) => (
                      <li key={i}>
                        {tr('ردیف', 'Row')} {fmtDigits(errItem.rowNumber)}
                        {errItem.fullName ? ` (${errItem.fullName})` : ''}: {errItem.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {excelResult.created.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">{tr('نام و نام خانوادگی', 'Full Name')}</th>
                        <th className="px-3 py-2">{tr('نقش', 'Role')}</th>
                        <th className="px-3 py-2">{tr('پایه / کلاس', 'Grade / Class')}</th>
                        <th className="px-3 py-2">{tr('نام کاربری', 'Username')}</th>
                        <th className="px-3 py-2">{tr('رمز عبور', 'Password')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {excelResult.created.map((item, idx) => (
                        <tr key={item.user.id}>
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{fmtDigits(idx + 1)}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{item.user.fullName}</td>
                          <td className="px-3 py-2">{roleLabel(item.user.role)}</td>
                          <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                            {[item.user.gradeLevel, item.className].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="inline-flex items-center gap-1.5" dir="ltr">
                              <span className="font-mono text-xs text-slate-900 dark:text-slate-100">{item.username}</span>
                              {item.autoGeneratedUsername && (
                                <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">
                                  ({tr('تصادفی', 'Auto')})
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleCopyCred(item.username, `res_u_${item.user.id}`)}
                                className="p-0.5 text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300"
                              >
                                {copiedCredKey === `res_u_${item.user.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="inline-flex items-center gap-1.5" dir="ltr">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{item.password}</span>
                              {item.autoGeneratedPassword && (
                                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                  ({tr('تصادفی', 'Auto')})
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleCopyCred(item.password, `res_p_${item.user.id}`)}
                                className="p-0.5 text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300"
                              >
                                {copiedCredKey === `res_p_${item.user.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setExcelResult(null);
                    setExcelRows([]);
                    setExcelFileName('');
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {tr('بارگذاری فایل اکسل دیگر', 'Import Another File')}
                </button>
                <button
                  type="button"
                  onClick={() => setExcelModalOpen(false)}
                  className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
                >
                  {tr('تأیید و بستن', 'Done')}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Single-User Auto-Generated Credentials Announcement Modal */}
      <Modal
        open={Boolean(createdCredsAnnouncement)}
        onClose={() => setCreatedCredsAnnouncement(null)}
        title={tr('اطلاعات ورود تولیدشده برای کاربر جدید', 'Generated Credentials for New User')}
      >
        {createdCredsAnnouncement && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-6">
              {tr(
                'حساب کاربری با موفقیت ایجاد و عضو شد. اطلاعات ورود زیر را به کاربر تحویل دهید (این اطلاعات در بخش «حساب‌های کاربری» نیز قابل مشاهده است):',
                'The account has been created. Share these credentials with the user (they remain visible in User Accounts):'
              )}
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{tr('نام و نقش:', 'User:')}</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {createdCredsAnnouncement.fullName} ({roleLabel(createdCredsAnnouncement.role)})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{tr('نام کاربری:', 'Username:')}</span>
                <div className="inline-flex items-center gap-1.5" dir="ltr">
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {createdCredsAnnouncement.username}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCred(createdCredsAnnouncement.username, 'single_u')}
                    className="p-1 text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300"
                  >
                    {copiedCredKey === 'single_u' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{tr('رمز عبور:', 'Password:')}</span>
                <div className="inline-flex items-center gap-1.5" dir="ltr">
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {createdCredsAnnouncement.password}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCred(createdCredsAnnouncement.password, 'single_p')}
                    className="p-1 text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300"
                  >
                    {copiedCredKey === 'single_p' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  void handleCopyCred(
                    `${createdCredsAnnouncement.fullName}\nنام کاربری: ${createdCredsAnnouncement.username}\nرمز عبور: ${createdCredsAnnouncement.password}`,
                    'single_both'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copiedCredKey === 'single_both' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{tr('کپی اطلاعات ورود', 'Copy Credentials')}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredsAnnouncement(null)}
                className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
              >
                {tr('متوجه شدم', 'Got it')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
