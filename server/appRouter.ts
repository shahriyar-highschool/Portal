import {
  type AcademicHistoryRecord,
  type AdvancedReportCard,
  type AdvancedReportCardSubjectRow,
  type AIConversation,
  type AIMessage,
  type Announcement,
  type AppLanguage,
  type AppTheme,
  type Assignment,
  type AssignmentSubmission,
  type AttendanceRecord,
  type AuditLog,
  type BulkUserImportCreatedItem,
  type BulkUserImportRow,
  type CalendarEvent,
  type ChatContact,
  type ChatMessage,
  type ChatThreadSummary,
  type DigitalLibraryItem,
  type DirectMessage,
  type ExamAttempt,
  type ExamDifficulty,
  type ExamQuestion,
  type ExamQuestionType,
  type GradeRecord,
  type HonorCategory,
  type HonorLevel,
  type LibraryResourceCategory,
  type OnlineExam,
  type PrivateTutorMessage,
  type PrivateTutorSession,
  type ProfileChangeFields,
  type ProfileChangeRequest,
  type RiskReviewNote,
  type RolePermissionConfig,
  type ScheduleSlot,
  type SchoolClass,
  type SchoolSettings,
  type SessionData,
  type StoredUser,
  type StudentHonor,
  type StudyFeedback,
  type StudyGoal,
  type StudyLeagueArchive,
  type StudyLeagueNotification,
  type StudyLeaguePrize,
  type StudyLeagueSeasonPeriod,
  type StudyLeagueTimeframe,
  type StudyLeagueWeights,
  type StudyLog,
  type StudyLogStatus,
  type StudyPlanTask,
  type Subject,
  type TeacherBankQuestion,
  type TeacherSourceMaterial,
  type TeacherSourcePage,
  type UserAccount,
  type UserRole,
} from '../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetCollection,
  kvGetIndex,
  kvGetJson,
  kvPutJson,
  kvRemoveFromIndex,
  type SchoolKVStore,
} from './kv/kvStore.ts';
import {
  generateSchoolAIResponse,
  streamSchoolAIResponse,
} from './services/aiService.ts';
import {
  analyzeExamQuality,
  cloneExamVersions,
  computeAcademicRiskReport,
  computeLearningDiagnosis,
  generateAdaptivePracticeWithAI,
  generateAIExamQuestions,
  generateRemedialPlanWithAI,
  generateSmartPlannerTasksWithAI,
  gradeExamSubmission,
  recordStudentMistake,
  resolveEffectiveStudentUser,
  streamPrivateTutorResponse,
} from './services/schoolFeaturesService.ts';
import {
  applyAdminOrTeacherLogEdit,
  archiveAndOptionallyResetSeason,
  awardManualBadge,
  checkAndNotifyDeadlines,
  computeAdminLeagueAnalytics,
  computeHallOfFame,
  computeLeaderboard,
  computeStudentAnalytics,
  computeTeacherLeagueAnalytics,
  createLeagueNotification,
  ensureLeagueConfig,
  evaluateStudentBadges,
  getStudentEarnedBadgesSummary,
  hydrateGoalProgress,
  isStudentEligibleForSeason,
  recomputeStudentSeasonLogs,
  STUDY_BADGE_DEFINITIONS,
  toIsoDate,
} from './services/studyLeagueService.ts';
import {
  clearUserDeletedTombstone,
  createRemoteInitialAdmin,
  getDeletedUserTombstones,
  getRemoteSetupStatus,
  markUserDeletedTombstone,
  RemoteAuthError,
  remoteCreateStudent,
  remoteCreateTeacher,
  remoteCreateUser,
  remoteDeleteUser,
  remoteGetMe,
  remoteLogin,
  remoteLogout,
  remoteUpdateUser,
  syncDirectoryFromRemote,
  syncRemoteUserToKV,
  withUserDirectoryLock,
} from './services/remoteAuthService.ts';
import {
  DEFAULT_ROLES,
  defaultSchoolSettings,
  ensureBaseConfig,
} from './services/seedService.ts';
import {
  getChatThreadId,
  getOnlineUserIds,
  getThreadMessages,
  isUserOnline,
  markChatThreadReadAndBroadcast,
  persistAndBroadcastChatMessage,
} from './services/chatHub.ts';
import {
  createSignedSessionToken,
  generateId,
  hashPassword,
  verifyPassword,
  verifySignedSessionToken,
} from './utils/crypto.ts';

export interface RouterEnv {
  SCHOOL_KV: SchoolKVStore;
  GEMINI_API_KEY?: string;
  AI_SERVER_URL?: string;
  AUTH_SERVER_URL?: string;
  SESSION_SECRET?: string;
  ADMIN_SETUP_KEY?: string;
  APP_ORIGIN?: string;
}

const SESSION_COOKIE_NAME = 'shahriar_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash: _ph, passwordSalt: _ps, displayPassword: _dp, ...safe } = user;
  return safe;
}

function sanitizeUserForAdmin(user: StoredUser): UserAccount {
  const { passwordHash: _ph, passwordSalt: _ps, ...safe } = user;
  return safe;
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const ALLOWED_SCHOOL_GRADES = ['هفتم', 'هشتم', 'نهم'] as const;

function normalizeGradeLevel(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = normalizeDigits(raw).trim();
  if (!cleaned) return undefined;
  if (cleaned.includes('هفت') || /(^|\D)7(\D|$)/.test(cleaned)) return 'هفتم';
  if (cleaned.includes('هشت') || /(^|\D)8(\D|$)/.test(cleaned)) return 'هشتم';
  if (cleaned.includes('نه') || /(^|\D)9(\D|$)/.test(cleaned)) return 'نهم';
  return ALLOWED_SCHOOL_GRADES.includes(cleaned as (typeof ALLOWED_SCHOOL_GRADES)[number])
    ? cleaned
    : undefined;
}

function normalizeClassMatchKey(raw: string): string {
  return normalizeDigits(raw)
    .replace(/^کلاس\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function generateRandomPassword(length = 8): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const targetLen = Math.max(8, length);
  const bytes = new Uint8Array(targetLen + 4);
  crypto.getRandomValues(bytes);

  const chars: string[] = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
  ];
  for (let i = 3; i < targetLen; i++) {
    chars.push(all[bytes[i] % all.length]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

async function generateUniqueUsername(
  role: UserRole,
  takenUsernames: Set<string>,
  kv: SchoolKVStore
): Promise<string> {
  const prefix = role === 'teacher' ? 'tch' : role === 'admin' ? 'adm' : 'stu';
  const bytes = new Uint8Array(4);
  for (let attempt = 0; attempt < 40; attempt++) {
    crypto.getRandomValues(bytes);
    const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 900000 + 100000;
    const candidate = `${prefix}_${num}`;
    if (takenUsernames.has(candidate)) continue;
    const existing = await kv.get(KV_KEYS.usernameIdx(candidate));
    if (!existing) {
      takenUsernames.add(candidate);
      return candidate;
    }
  }
  const fallback = `${prefix}_${Date.now().toString().slice(-6)}`;
  takenUsernames.add(fallback);
  return fallback;
}

function buildSessionCookie(token: string, requestUrl: string, maxAge = SESSION_TTL_SECONDS): string {
  const isHttps = requestUrl.startsWith('https://');
  const flags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  return flags.join('; ');
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.get('cookie'));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

const STATIC_ALLOWED_ORIGINS = [
  'https://shahriar_school.stormkit.dev',
  'https://yashar-1392.github.io',
  'https://shahriar-school-api.yashar-online-store.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function resolveAllowedOrigin(req: Request, customAppOrigin?: string): string | null {
  const origin = (req.headers.get('origin') || '').trim();
  if (!origin) return '';

  const configured = (customAppOrigin || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const normalizedOrigin = origin.replace(/\/+$/, '');
  if (STATIC_ALLOWED_ORIGINS.includes(normalizedOrigin) || configured.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  try {
    const reqOrigin = new URL(req.url).origin;
    if (reqOrigin === normalizedOrigin) return normalizedOrigin;
    const parsedOrigin = new URL(normalizedOrigin);
    if (
      parsedOrigin.protocol === 'https:' &&
      (parsedOrigin.hostname.endsWith('.stormkit.dev') ||
        parsedOrigin.hostname.endsWith('.workers.dev') ||
        parsedOrigin.hostname.endsWith('.pages.dev') ||
        parsedOrigin.hostname.endsWith('.run.app'))
    ) {
      return normalizedOrigin;
    }
  } catch {
    return null;
  }

  return null;
}

function withCorsHeaders(req: Request, res: Response, allowedOrigin: string | null): Response {
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Origin');
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function readJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError('ساختار JSON درخواست نامعتبر است.', 400);
  }
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function appendAuditLog(
  kv: SchoolKVStore,
  user: Pick<StoredUser, 'id' | 'fullName' | 'role'>,
  action: string,
  target: string,
  details: string
): Promise<void> {
  const existing = (await kvGetJson<AuditLog[]>(kv, KV_KEYS.AUDIT_LOGS)) ?? [];
  const entry: AuditLog = {
    id: generateId('log'),
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action,
    target,
    details,
    timestamp: new Date().toISOString(),
  };
  const next = [entry, ...existing].slice(0, 300);
  await kvPutJson(kv, KV_KEYS.AUDIT_LOGS, next);
}

async function getAuthenticatedUser(
  req: Request,
  kv: SchoolKVStore,
  env: RouterEnv
): Promise<{ user: StoredUser; session: SessionData } | null> {
  const token = extractSessionToken(req);
  if (!token) return null;

  const session = await kvGetJson<SessionData>(kv, KV_KEYS.session(token));
  if (session) {
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await kv.delete(KV_KEYS.session(token));
      return null;
    }
    const user = await kvGetJson<StoredUser>(kv, KV_KEYS.user(session.userId));
    if (user && user.active) {
      return { user, session };
    }
  }

  // Stateless recovery for serverless / multi-instance deployments (e.g. Stormkit AWS Lambda)
  const signedPayload = await verifySignedSessionToken(token, env.SESSION_SECRET);
  if (signedPayload) {
    await ensureBaseConfig(kv);

    if (signedPayload.remoteToken) {
      try {
        const remoteMe = await remoteGetMe(env.AUTH_SERVER_URL, signedPayload.remoteToken);
        const syncedUser = await syncRemoteUserToKV(kv, remoteMe.user);
        if (!syncedUser.active) return null;

        const restoredSession: SessionData = {
          token,
          userId: syncedUser.id,
          role: syncedUser.role,
          remoteToken: signedPayload.remoteToken,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(signedPayload.exp).toISOString(),
        };
        const ttl = Math.max(60, Math.floor((signedPayload.exp - Date.now()) / 1000));
        await kvPutJson(kv, KV_KEYS.session(token), restoredSession, { expirationTtl: ttl });
        return { user: syncedUser, session: restoredSession };
      } catch (err) {
        if (err instanceof RemoteAuthError && (err.status === 401 || err.status === 403)) {
          return null;
        }
        // Remote auth temporarily unreachable: allow signed snapshot if user exists locally
        const cachedUser = await kvGetJson<StoredUser>(kv, KV_KEYS.user(signedPayload.userId));
        if (cachedUser && cachedUser.active) {
          return {
            user: cachedUser,
            session: {
              token,
              userId: cachedUser.id,
              role: cachedUser.role,
              remoteToken: signedPayload.remoteToken,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(signedPayload.exp).toISOString(),
            },
          };
        }
        return null;
      }
    }

    const localUser = await kvGetJson<StoredUser>(kv, KV_KEYS.user(signedPayload.userId));
    if (localUser && localUser.active) {
      const restoredSession: SessionData = {
        token,
        userId: localUser.id,
        role: localUser.role,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(signedPayload.exp).toISOString(),
      };
      const ttl = Math.max(60, Math.floor((signedPayload.exp - Date.now()) / 1000));
      await kvPutJson(kv, KV_KEYS.session(token), restoredSession, { expirationTtl: ttl });
      return { user: localUser, session: restoredSession };
    }
    return null;
  }

  // Fallback: direct Cloudflare Worker bearer token
  try {
    const remoteMe = await remoteGetMe(env.AUTH_SERVER_URL, token);
    await ensureBaseConfig(kv);
    const syncedUser = await syncRemoteUserToKV(kv, remoteMe.user);
    if (!syncedUser.active) return null;
    const restoredSession: SessionData = {
      token,
      userId: syncedUser.id,
      role: syncedUser.role,
      remoteToken: token,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    };
    await kvPutJson(kv, KV_KEYS.session(token), restoredSession, { expirationTtl: SESSION_TTL_SECONDS });
    return { user: syncedUser, session: restoredSession };
  } catch {
    return null;
  }
}

function getTeacherAllowedClassIds(user: StoredUser, allClasses: SchoolClass[]): Set<string> {
  const set = new Set<string>(user.assignedClassIds ?? []);
  for (const cls of allClasses) {
    if (cls.teacherIds.includes(user.id)) {
      set.add(cls.id);
    }
  }
  return set;
}

function getTeacherAllowedSubjectIds(user: StoredUser, allSubjects: Subject[]): Set<string> {
  const set = new Set<string>(user.assignedSubjectIds ?? []);
  for (const sub of allSubjects) {
    if (sub.teacherId === user.id) {
      set.add(sub.id);
    }
  }
  return set;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

const VALID_GRADE_TERMS: GradeRecord['term'][] = ['مستمر اول', 'نوبت اول', 'مستمر دوم', 'نوبت دوم'];

function buildAdvancedReportCard(params: {
  targetStudent: StoredUser;
  targetClass: SchoolClass | null;
  allUsers: StoredUser[];
  allSubjects: Subject[];
  allGrades: GradeRecord[];
  allAttendance: AttendanceRecord[];
  allSchedules: ScheduleSlot[];
  settings: SchoolSettings;
  termFilter: 'all' | GradeRecord['term'];
}): AdvancedReportCard {
  const {
    targetStudent,
    targetClass,
    allUsers,
    allSubjects,
    allGrades,
    allAttendance,
    allSchedules,
    settings,
    termFilter,
  } = params;

  const classId = targetClass?.id ?? targetStudent.classId ?? '';
  const gradeLevel = targetClass?.gradeLevel ?? targetStudent.gradeLevel ?? 'نامشخص';
  const className =
    targetClass?.name ??
    (targetStudent.gradeLevel ? `کلاس پایه ${targetStudent.gradeLevel}` : 'تخصیص‌نیافته');

  const classmatesMap = new Map<string, StoredUser>();
  if (classId) {
    for (const u of allUsers) {
      if (u.role === 'student' && u.classId === classId) {
        classmatesMap.set(u.id, u);
      }
    }
  }
  classmatesMap.set(targetStudent.id, targetStudent);
  const classmates = Array.from(classmatesMap.values());
  const classmateIds = new Set(classmates.map((s) => s.id));

  const classGradesAllTerms = allGrades.filter((g) =>
    classId
      ? g.classId === classId || (!g.classId && classmateIds.has(g.studentId))
      : g.studentId === targetStudent.id
  );
  const scopedGrades = classGradesAllTerms.filter((g) => termFilter === 'all' || g.term === termFilter);

  const subjectMap = new Map<string, Subject>(allSubjects.map((s) => [s.id, s]));
  const orderedSubjectIds: string[] = [];
  const seenSubjectIds = new Set<string>();
  const addSubjectId = (sid?: string) => {
    if (!sid || seenSubjectIds.has(sid)) return;
    seenSubjectIds.add(sid);
    orderedSubjectIds.push(sid);
  };

  if (targetClass && Array.isArray(targetClass.subjectIds) && targetClass.subjectIds.length > 0) {
    for (const sid of targetClass.subjectIds) addSubjectId(sid);
  } else {
    for (const s of allSubjects) {
      if (!gradeLevel || gradeLevel === 'نامشخص' || s.gradeLevel === gradeLevel) {
        addSubjectId(s.id);
      }
    }
  }

  for (const sc of allSchedules) {
    if (classId && sc.classId === classId) addSubjectId(sc.subjectId);
  }
  for (const g of classGradesAllTerms) {
    addSubjectId(g.subjectId);
  }

  // Group normalized scores by subjectId -> studentId -> number[]
  const scoresBySubjectStudent = new Map<string, Map<string, number[]>>();
  for (const g of scopedGrades) {
    const maxS = g.maxScore > 0 ? g.maxScore : 20;
    const normalized = Number(((g.score / maxS) * 20).toFixed(4));
    let stuMap = scoresBySubjectStudent.get(g.subjectId);
    if (!stuMap) {
      stuMap = new Map<string, number[]>();
      scoresBySubjectStudent.set(g.subjectId, stuMap);
    }
    const list = stuMap.get(g.studentId) ?? [];
    list.push(normalized);
    stuMap.set(g.studentId, list);
  }

  // Resolve metadata for every subject in class (including fallback if deleted)
  const resolvedSubjects: Subject[] = orderedSubjectIds.map((sid) => {
    const existing = subjectMap.get(sid);
    if (existing) return existing;
    const sampleGrade = classGradesAllTerms.find((g) => g.subjectId === sid);
    return {
      id: sid,
      code: '—',
      name: sampleGrade?.subjectName || sid,
      gradeLevel,
      coefficient: 1,
      createdAt: '',
    };
  });

  // Track weighted GPA components per classmate across subjects they have grades in
  const studentWeightedAccum = new Map<string, { weightedSum: number; coeffSum: number }>();

  const subjectRows: AdvancedReportCardSubjectRow[] = resolvedSubjects.map((sub) => {
    const stuMap = scoresBySubjectStudent.get(sub.id);
    const coeff = sub.coefficient > 0 ? sub.coefficient : 1;

    const classmateSubAvgs: Array<{ studentId: string; value: number }> = [];
    if (stuMap) {
      for (const [stuId, vals] of stuMap.entries()) {
        if (vals.length === 0) continue;
        const sAvg = avg(vals);
        classmateSubAvgs.push({ studentId: stuId, value: sAvg });

        const acc = studentWeightedAccum.get(stuId) ?? { weightedSum: 0, coeffSum: 0 };
        acc.weightedSum += sAvg * coeff;
        acc.coeffSum += coeff;
        studentWeightedAccum.set(stuId, acc);
      }
    }

    const targetScores = stuMap?.get(targetStudent.id) ?? [];
    const studentAverage = targetScores.length > 0 ? avg(targetScores) : null;
    const avgValues = classmateSubAvgs.map((x) => x.value);
    const classAverage = avgValues.length > 0 ? avg(avgValues) : null;
    const highestSubjectAverage = avgValues.length > 0 ? Number(Math.max(...avgValues).toFixed(2)) : null;
    const lowestSubjectAverage = avgValues.length > 0 ? Number(Math.min(...avgValues).toFixed(2)) : null;
    const subjectRank =
      studentAverage !== null
        ? 1 + avgValues.filter((v) => v > studentAverage + 0.0001).length
        : null;

    return {
      subjectId: sub.id,
      subjectCode: sub.code,
      subjectName: sub.name,
      coefficient: coeff,
      studentGradesCount: targetScores.length,
      studentAverage,
      classAverage,
      classGradedStudentsCount: avgValues.length,
      subjectRank,
      subjectRankedTotal: avgValues.length,
      highestSubjectAverage,
      lowestSubjectAverage,
    };
  });

  const classmateGpas: Array<{ studentId: string; gpa: number }> = [];
  for (const [stuId, acc] of studentWeightedAccum.entries()) {
    if (acc.coeffSum > 0) {
      classmateGpas.push({
        studentId: stuId,
        gpa: Number((acc.weightedSum / acc.coeffSum).toFixed(2)),
      });
    }
  }

  const targetGpaEntry = classmateGpas.find((x) => x.studentId === targetStudent.id) ?? null;
  const overallGpa = targetGpaEntry ? targetGpaEntry.gpa : null;
  const allGpaValues = classmateGpas.map((x) => x.gpa);
  const classHighestGpa = allGpaValues.length > 0 ? Number(Math.max(...allGpaValues).toFixed(2)) : null;
  const classLowestGpa = allGpaValues.length > 0 ? Number(Math.min(...allGpaValues).toFixed(2)) : null;
  const overallRank =
    overallGpa !== null ? 1 + allGpaValues.filter((g) => g > overallGpa + 0.0001).length : null;

  const stuAtt = allAttendance.filter((a) => a.studentId === targetStudent.id);

  return {
    studentId: targetStudent.id,
    studentName: targetStudent.fullName,
    nationalId: targetStudent.nationalId || '',
    username: targetStudent.username,
    gradeLevel,
    classId,
    className,
    academicYear: targetClass?.academicYear || settings.academicYear || '1404-1405',
    term: termFilter,
    schoolName: settings.schoolName,
    principalName: settings.principalName,
    passingScore: settings.passingScore ?? 10,
    generatedAt: new Date().toISOString(),
    subjects: subjectRows,
    overallGpa,
    classHighestGpa,
    classLowestGpa,
    overallRank,
    rankedStudentsCount: classmateGpas.length,
    totalClassStudents: classmates.length,
    attendanceSummary: {
      total: stuAtt.length,
      present: stuAtt.filter((a) => a.status === 'present').length,
      absent: stuAtt.filter((a) => a.status === 'absent').length,
      late: stuAtt.filter((a) => a.status === 'late').length,
      excused: stuAtt.filter((a) => a.status === 'excused').length,
    },
  };
}

function isSafeResourceUrl(raw?: string): boolean {
  if (!raw || !raw.trim()) return true;
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) return true;
  if (/^data:(application\/pdf|image\/|text\/)/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function handleApiRequest(req: Request, env: RouterEnv): Promise<Response> {
  const allowedOrigin = resolveAllowedOrigin(req, env.APP_ORIGIN);
  if (allowedOrigin === null) {
    return new Response('Origin not allowed', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Vary: 'Origin',
      },
    });
  }

  if (req.method.toUpperCase() === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(null, { status: 204, headers });
  }

  const res = await handleApiRequestInner(req, env);
  return withCorsHeaders(req, res, allowedOrigin);
}

async function handleApiRequestInner(req: Request, env: RouterEnv): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  const kv = env.SCHOOL_KV;

  try {
    if (path === '/api/health' && method === 'GET') {
      return jsonResponse({
        ok: true,
        success: true,
        fullSupport: true,
        apiVersion: 3,
        storage: 'SCHOOL_KV',
        timestamp: new Date().toISOString(),
      });
    }

    // Bootstrap & setup status (public, backed by remote auth server with resilient KV fallback)
    if ((path === '/api/auth/bootstrap-status' || path === '/api/setup/status') && method === 'GET') {
      let hasAdmin = false;
      let remoteReachable = true;
      try {
        const remoteStatus = await getRemoteSetupStatus(env.AUTH_SERVER_URL);
        hasAdmin = Boolean(remoteStatus.hasAdmin ?? remoteStatus.adminExists ?? !remoteStatus.needsSetup);
      } catch {
        remoteReachable = false;
        try {
          const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
          hasAdmin = allUsers.some((u) => u.role === 'admin');
        } catch {
          hasAdmin = false;
        }
      }
      let settings: SchoolSettings | null = null;
      try {
        settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      } catch {
        settings = null;
      }
      return jsonResponse({
        success: true,
        initialized: hasAdmin,
        hasAdmin,
        adminExists: hasAdmin,
        needsSetup: !hasAdmin,
        setupRequired: !hasAdmin,
        remoteReachable,
        schoolName: settings?.schoolName ?? 'دبیرستان استعدادهای درخشان استاد شهریار',
      });
    }

    // Admin setup (initial setup via /api/setup/initialize, and new admin creation via /api/setup/admin)
    if ((path === '/api/setup/initialize' || path === '/api/setup/admin') && method === 'POST') {
      const isInitialOnly = path === '/api/setup/initialize';
      let remoteHasAdmin = false;
      let remoteReachable = true;
      try {
        const remoteStatus = await getRemoteSetupStatus(env.AUTH_SERVER_URL);
        remoteHasAdmin = Boolean(remoteStatus.hasAdmin || remoteStatus.adminExists);
      } catch {
        remoteReachable = false;
        const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
        remoteHasAdmin = allUsers.some((u) => u.role === 'admin');
      }

      if (isInitialOnly && remoteHasAdmin) {
        return errorResponse('مدیر سامانه قبلاً تعریف شده است. لطفاً با حساب کاربری وارد شوید.', 409);
      }

      const body = await readJsonBody<{
        setupKey?: string;
        fullName?: string;
        name?: string;
        username?: string;
        nationalId?: string;
        password?: string;
      }>(req);

      const cleanFullName = (body.fullName ?? body.name ?? '').trim();
      const cleanUsername = normalizeDigits((body.username ?? '').trim()).toLowerCase();
      const cleanSetupKey = (body.setupKey ?? '').trim();
      const rawPassword = body.password ?? '';

      if (!cleanSetupKey) {
        return errorResponse('وارد کردن کلید راه‌اندازی سرور الزامی است.', 400);
      }

      if (env.ADMIN_SETUP_KEY) {
        if (cleanSetupKey !== env.ADMIN_SETUP_KEY) {
          return errorResponse('کلید راه‌اندازی مدیر اشتباه است.', 403);
        }
      } else if (!isInitialOnly || remoteHasAdmin || !remoteReachable) {
        return errorResponse('کلید راه‌اندازی مدیر (ADMIN_SETUP_KEY) روی سرور تنظیم نشده است.', 403);
      }

      if (!cleanFullName || !cleanUsername || !rawPassword || rawPassword.length < 8) {
        return errorResponse('نام کامل، نام کاربری و رمز عبور (حداقل ۸ کاراکتر) الزامی است.', 400);
      }
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
        return errorResponse('نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.', 400);
      }

      const existingByUsernameId = await kv.get(KV_KEYS.usernameIdx(cleanUsername));
      if (existingByUsernameId) {
        return errorResponse('این نام کاربری قبلاً ثبت شده است.', 409);
      }

      let admin: StoredUser | undefined;
      let remoteToken: string | undefined;

      if (remoteReachable && (!remoteHasAdmin || !isInitialOnly)) {
        try {
          await createRemoteInitialAdmin(env.AUTH_SERVER_URL, {
            setupKey: cleanSetupKey,
            name: cleanFullName,
            username: cleanUsername,
            password: rawPassword,
          });
          const remoteAuth = await remoteLogin(env.AUTH_SERVER_URL, cleanUsername, rawPassword);
          remoteToken = remoteAuth.token;
          await ensureBaseConfig(kv, cleanFullName);
          admin = await syncRemoteUserToKV(kv, remoteAuth.user);
          if (body.nationalId?.trim()) {
            admin.nationalId = body.nationalId.trim();
            await kvPutJson(kv, KV_KEYS.user(admin.id), admin);
          }
        } catch (err) {
          if (!remoteHasAdmin) throw err;
          if (err instanceof RemoteAuthError && err.status !== 409 && err.status !== 404) {
            throw err;
          }
        }
      }

      if (!admin) {
        await ensureBaseConfig(kv, cleanFullName);
        const { hash, salt } = await hashPassword(rawPassword);
        admin = {
          id: generateId('usr'),
          username: cleanUsername,
          nationalId: (body.nationalId ?? '').trim(),
          fullName: cleanFullName,
          role: 'admin',
          active: true,
          coins: 0,
          displayPassword: rawPassword,
          passwordHash: hash,
          passwordSalt: salt,
          createdAt: new Date().toISOString(),
        };
        await kvPutJson(kv, KV_KEYS.user(admin.id), admin);
        await kv.put(KV_KEYS.usernameIdx(cleanUsername), admin.id);
        await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, admin.id);
      }

      await appendAuditLog(kv, admin, 'تعریف مدیر سامانه', 'سیستم', `ثبت حساب مدیر کل: ${admin.username}`);

      const now = Date.now();
      const expiresAtMs = now + SESSION_TTL_SECONDS * 1000;
      const token = await createSignedSessionToken(
        {
          userId: admin.id,
          role: admin.role,
          username: admin.username,
          fullName: admin.fullName,
          remoteToken,
          exp: expiresAtMs,
        },
        env.SESSION_SECRET
      );
      const session: SessionData = {
        token,
        userId: admin.id,
        role: admin.role,
        remoteToken,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.session(token), session, { expirationTtl: SESSION_TTL_SECONDS });

      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();

      return jsonResponse(
        {
          success: true,
          user: sanitizeUser(admin),
          settings,
          token,
          message: 'حساب مدیر جدید با موفقیت ایجاد شد.',
        },
        201,
        { 'Set-Cookie': buildSessionCookie(token, req.url) }
      );
    }

    // Public self-registration is disabled; accounts must be created by the school administrator
    if (path === '/api/auth/register' && method === 'POST') {
      return errorResponse('امکان ثبت‌نام عمومی وجود ندارد. حساب کاربری فقط توسط مدیر مدرسه ایجاد می‌شود.', 403);
    }

    // Login (primary: Cloudflare Worker auth server; secondary fallback: locally managed DB accounts)
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody<{ identifier?: string; username?: string; password?: string }>(req);
      const rawIdentifier = (body.identifier ?? body.username ?? '').trim();
      const identifier = normalizeDigits(rawIdentifier).toLowerCase();
      const password = body.password ?? '';

      if (!identifier && !password) {
        return errorResponse('لطفاً نام کاربری و رمز عبور خود را وارد کنید.', 400);
      }
      if (!identifier) {
        return errorResponse('لطفاً نام کاربری خود را وارد کنید.', 400);
      }
      if (!password) {
        return errorResponse('لطفاً رمز عبور خود را وارد کنید.', 400);
      }

      await ensureBaseConfig(kv);

      let user: StoredUser | null = null;
      let remoteToken: string | undefined;

      try {
        const remoteAuth = await remoteLogin(env.AUTH_SERVER_URL, identifier, password);
        remoteToken = remoteAuth.token;
        user = await syncRemoteUserToKV(kv, remoteAuth.user);
      } catch (remoteErr) {
        const localUserId = await kv.get(KV_KEYS.usernameIdx(identifier));
        const isRemoteNetworkErr =
          remoteErr instanceof RemoteAuthError &&
          (remoteErr.status === 502 || remoteErr.status === 504 || remoteErr.status >= 500);

        if (localUserId) {
          const candidate = await kvGetJson<StoredUser>(kv, KV_KEYS.user(localUserId));
          if (candidate) {
            if (!candidate.active) {
              return errorResponse('این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.', 403);
            }
            if (candidate.passwordHash && candidate.passwordSalt) {
              const ok = await verifyPassword(password, candidate.passwordHash, candidate.passwordSalt);
              if (ok) {
                user = candidate;
              } else if (!isRemoteNetworkErr) {
                return errorResponse('نام کاربری یا رمز عبور اشتباه است.', 401);
              }
            }
          }
        }

        if (!user) {
          if (isRemoteNetworkErr && remoteErr instanceof RemoteAuthError) {
            return errorResponse(
              remoteErr.message || 'خطا در برقراری ارتباط با سرور احراز هویت. لطفاً دوباره تلاش کنید.',
              remoteErr.status
            );
          }
          if (remoteErr instanceof RemoteAuthError && remoteErr.status === 403) {
            return errorResponse(
              remoteErr.message || 'این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.',
              403
            );
          }
          if (
            remoteErr instanceof RemoteAuthError &&
            (remoteErr.status === 404 || /وجود ندارد|یافت نشد|not found/i.test(remoteErr.message))
          ) {
            return errorResponse('حساب کاربری با این نام کاربری وجود ندارد.', 404);
          }

          const allUserIds = await kvGetIndex(kv, KV_KEYS.USERS_INDEX);
          if (!localUserId && allUserIds.length > 0) {
            return errorResponse('حساب کاربری با این نام کاربری وجود ندارد.', 404);
          }

          return errorResponse('نام کاربری یا رمز عبور اشتباه است.', 401);
        }
      }

      if (!user.active) {
        return errorResponse('این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.', 403);
      }

      user.lastLoginAt = new Date().toISOString();
      if (user.coins === undefined) user.coins = 0;
      await kvPutJson(kv, KV_KEYS.user(user.id), user);

      if (user.role === 'admin' && remoteToken) {
        await syncDirectoryFromRemote(kv, env.AUTH_SERVER_URL, remoteToken);
      }

      const now = Date.now();
      const expiresAtMs = now + SESSION_TTL_SECONDS * 1000;
      const token = await createSignedSessionToken(
        {
          userId: user.id,
          role: user.role,
          username: user.username,
          fullName: user.fullName,
          remoteToken,
          exp: expiresAtMs,
        },
        env.SESSION_SECRET
      );
      const session: SessionData = {
        token,
        userId: user.id,
        role: user.role,
        remoteToken,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.session(token), session, { expirationTtl: SESSION_TTL_SECONDS });

      await appendAuditLog(kv, user, 'ورود به سامانه', 'احراز هویت', `ورود موفق کاربر با نقش ${user.role}`);

      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      const roles = (await kvGetJson<RolePermissionConfig[]>(kv, KV_KEYS.ROLES)) ?? DEFAULT_ROLES;

      return jsonResponse(
        {
          user: sanitizeUser(user),
          settings,
          roleConfig: roles.find((r) => r.role === user.role) ?? null,
          token,
          message: `${user.fullName} عزیز، خوش آمدید.`,
        },
        200,
        { 'Set-Cookie': buildSessionCookie(token, req.url) }
      );
    }

    // Logout
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = extractSessionToken(req);
      if (token) {
        const session = await kvGetJson<SessionData>(kv, KV_KEYS.session(token));
        let remoteTok = session?.remoteToken;
        if (!remoteTok) {
          const signed = await verifySignedSessionToken(token, env.SESSION_SECRET);
          remoteTok = signed?.remoteToken ?? (token.startsWith('st1.') ? undefined : token);
        }
        if (remoteTok) {
          await remoteLogout(env.AUTH_SERVER_URL, remoteTok).catch(() => {});
        }
        if (session) {
          const user = await kvGetJson<StoredUser>(kv, KV_KEYS.user(session.userId));
          if (user) {
            await appendAuditLog(kv, user, 'خروج از سامانه', 'احراز هویت', 'خروج کاربر از نشست فعال');
          }
          await kv.delete(KV_KEYS.session(token));
        }
      }
      return jsonResponse(
        { ok: true, message: 'با موفقیت از حساب کاربری خارج شدید.' },
        200,
        {
          'Set-Cookie': buildSessionCookie('', req.url, 0),
        }
      );
    }

    // Require authentication for all routes below
    const auth = await getAuthenticatedUser(req, kv, env);
    if (!auth) {
      return errorResponse('نشست کاربری معتبر نیست یا منقضی شده است. لطفاً دوباره وارد شوید.', 401);
    }
    let { user } = auth;

    // Current user session profile (validated against remote auth server when remoteToken exists)
    if (path === '/api/auth/me' && method === 'GET') {
      if (auth.session.remoteToken) {
        try {
          const remoteMe = await remoteGetMe(env.AUTH_SERVER_URL, auth.session.remoteToken);
          user = await syncRemoteUserToKV(kv, remoteMe.user);
        } catch (err) {
          if (err instanceof RemoteAuthError && (err.status === 401 || err.status === 403)) {
            await kv.delete(KV_KEYS.session(auth.session.token));
            return errorResponse('نشست کاربری معتبر نیست یا منقضی شده است. لطفاً دوباره وارد شوید.', 401);
          }
        }
      }
      if (!user || !user.active) {
        await kv.delete(KV_KEYS.session(auth.session.token));
        return errorResponse('این حساب کاربری غیرفعال شده یا حذف گردیده است.', 401);
      }
      await ensureBaseConfig(kv);
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      const roles = (await kvGetJson<RolePermissionConfig[]>(kv, KV_KEYS.ROLES)) ?? DEFAULT_ROLES;
      return jsonResponse({
        user: sanitizeUser(user),
        settings,
        roleConfig: roles.find((r) => r.role === user.role) ?? null,
      });
    }

    if (path === '/api/auth/me' && method === 'PATCH') {
      const body = await readJsonBody<{
        fullName?: string;
        age?: number;
        avatarUrl?: string;
        phone?: string;
        email?: string;
        preferredLanguage?: AppLanguage;
        preferredTheme?: AppTheme;
        currentPassword?: string;
        newPassword?: string;
      }>(req);

      let touchedSecurity = false;
      if (body.newPassword) {
        if (!body.currentPassword) {
          return errorResponse('برای تغییر رمز عبور، وارد کردن رمز فعلی الزامی است.', 400);
        }
        const ok = await verifyPassword(body.currentPassword, user.passwordHash, user.passwordSalt);
        if (!ok) {
          return errorResponse('رمز عبور فعلی صحیح نیست.', 400);
        }
        if (body.newPassword.length < 6) {
          return errorResponse('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 400);
        }
        const hashed = await hashPassword(body.newPassword);
        user.passwordHash = hashed.hash;
        user.passwordSalt = hashed.salt;
        user.displayPassword = body.newPassword;
        touchedSecurity = true;
      }

      if (body.preferredLanguage === 'fa' || body.preferredLanguage === 'en') {
        user.preferredLanguage = body.preferredLanguage;
      }
      if (body.preferredTheme === 'light' || body.preferredTheme === 'dark') {
        user.preferredTheme = body.preferredTheme;
      }

      // Admin/Deputy edits apply immediately; students/teachers/parents submit profile requests for identity fields
      if (user.role === 'admin') {
        if (body.fullName !== undefined && body.fullName.trim()) user.fullName = body.fullName.trim();
        if (body.age !== undefined && !Number.isNaN(Number(body.age))) user.age = Number(body.age);
        if (body.avatarUrl !== undefined) user.avatarUrl = body.avatarUrl;
        if (body.phone !== undefined) user.phone = body.phone.trim();
        if (body.email !== undefined) user.email = body.email.trim();
      } else {
        // Non-admin direct edits only update preferences/password; contact & identity edits go via /api/profile-requests
        if (
          body.fullName !== undefined ||
          body.age !== undefined ||
          body.avatarUrl !== undefined ||
          body.phone !== undefined ||
          body.email !== undefined
        ) {
          // If only contact fields sent via legacy form without password/pref, inform cleanly unless pref/password updated
          if (!touchedSecurity && body.preferredLanguage === undefined && body.preferredTheme === undefined) {
            return errorResponse('تغییر اطلاعات پروفایل نیازمند ثبت درخواست و تأیید مدیر سامانه است.', 403);
          }
        }
      }

      await kvPutJson(kv, KV_KEYS.user(user.id), user);
      if (touchedSecurity || user.role === 'admin') {
        await appendAuditLog(kv, user, 'به‌روزرسانی پروفایل', 'حساب کاربری', 'به‌روزرسانی تنظیمات یا امنیت حساب');
      }
      return jsonResponse({
        user: sanitizeUser(user),
        message: touchedSecurity || user.role === 'admin' ? 'اطلاعات پروفایل با موفقیت به‌روزرسانی شد.' : undefined,
      });
    }

    // Profile Change Requests (Admin/Deputy approval required for students, teachers & parents)
    if (path === '/api/profile-requests' && method === 'GET') {
      const requests = await kvGetCollection<ProfileChangeRequest>(
        kv,
        KV_KEYS.PROFILE_REQUESTS_INDEX,
        KV_KEYS.profileRequestItem
      );
      const scoped =
        user.role === 'admin'
          ? requests
          : requests.filter((r) => r.userId === user.id);
      return jsonResponse({
        requests: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      });
    }

    if (path === '/api/profile-requests' && method === 'POST') {
      if (user.role === 'admin') {
        return errorResponse('مدیر و معاون مدرسه می‌توانند پروفایل خود را مستقیماً ویرایش کنند.', 400);
      }

      const body = await readJsonBody<{
        requestedValues: ProfileChangeFields;
        reason?: string;
      }>(req);

      const reqVals = body.requestedValues ?? {};
      const cleanedRequested: ProfileChangeFields = {};
      const currentSnapshot: ProfileChangeFields = {};

      if (reqVals.fullName !== undefined && reqVals.fullName.trim() && reqVals.fullName.trim() !== user.fullName) {
        cleanedRequested.fullName = reqVals.fullName.trim();
        currentSnapshot.fullName = user.fullName;
      }
      if (reqVals.age !== undefined && !Number.isNaN(Number(reqVals.age)) && Number(reqVals.age) !== user.age) {
        const ageNum = Number(reqVals.age);
        if (ageNum < 7 || ageNum > 99) return errorResponse('سن واردشده معتبر نیست.', 400);
        cleanedRequested.age = ageNum;
        currentSnapshot.age = user.age;
      }
      if (reqVals.phone !== undefined && reqVals.phone.trim() !== (user.phone ?? '')) {
        cleanedRequested.phone = reqVals.phone.trim();
        currentSnapshot.phone = user.phone ?? '';
      }
      if (reqVals.email !== undefined && reqVals.email.trim() !== (user.email ?? '')) {
        cleanedRequested.email = reqVals.email.trim();
        currentSnapshot.email = user.email ?? '';
      }
      if (reqVals.avatarUrl !== undefined && reqVals.avatarUrl !== (user.avatarUrl ?? '')) {
        cleanedRequested.avatarUrl = reqVals.avatarUrl;
        currentSnapshot.avatarUrl = user.avatarUrl ?? '';
      }

      if (Object.keys(cleanedRequested).length === 0) {
        return errorResponse('هیچ تغییری نسبت به اطلاعات فعلی وارد نشده است.', 400);
      }

      const reqItem: ProfileChangeRequest = {
        id: generateId('prf'),
        userId: user.id,
        username: user.username,
        userRole: user.role,
        currentValues: currentSnapshot,
        requestedValues: cleanedRequested,
        reason: body.reason?.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.profileRequestItem(reqItem.id), reqItem);
      await kvAddToIndex(kv, KV_KEYS.PROFILE_REQUESTS_INDEX, reqItem.id);
      await appendAuditLog(kv, user, 'درخواست تغییر پروفایل', user.fullName, 'ارسال درخواست ویرایش اطلاعات برای تأیید مدیر');

      return jsonResponse(
        {
          request: reqItem,
          message: 'درخواست تغییر پروفایل ثبت شد و پس از بررسی مدیر اعمال می‌شود.',
        },
        201
      );
    }

    if (path.match(/^\/api\/profile-requests\/[^/]+\/review$/) && method === 'POST') {
      if (user.role !== 'admin') {
        return errorResponse('فقط مدیر یا معاون مدرسه مجاز به بررسی درخواست‌های تغییر پروفایل است.', 403);
      }
      const reqId = path.split('/')[3];
      const reqItem = await kvGetJson<ProfileChangeRequest>(kv, KV_KEYS.profileRequestItem(reqId));
      if (!reqItem) return errorResponse('درخواست یافت نشد.', 404);
      if (reqItem.status !== 'pending') {
        return errorResponse('این درخواست قبلاً بررسی شده است.', 400);
      }

      const body = await readJsonBody<{ status: 'approved' | 'rejected'; rejectionReason?: string }>(req);
      if (body.status !== 'approved' && body.status !== 'rejected') {
        return errorResponse('وضعیت بررسی نامعتبر است.', 400);
      }

      reqItem.status = body.status;
      reqItem.rejectionReason = body.rejectionReason?.trim();
      reqItem.reviewedBy = user.id;
      reqItem.reviewedByName = user.fullName;
      reqItem.reviewedAt = new Date().toISOString();

      if (body.status === 'approved') {
        const targetUser = await kvGetJson<StoredUser>(kv, KV_KEYS.user(reqItem.userId));
        if (targetUser) {
          if (reqItem.requestedValues.fullName !== undefined) targetUser.fullName = reqItem.requestedValues.fullName;
          if (reqItem.requestedValues.age !== undefined) targetUser.age = reqItem.requestedValues.age;
          if (reqItem.requestedValues.phone !== undefined) targetUser.phone = reqItem.requestedValues.phone;
          if (reqItem.requestedValues.email !== undefined) targetUser.email = reqItem.requestedValues.email;
          if (reqItem.requestedValues.avatarUrl !== undefined) targetUser.avatarUrl = reqItem.requestedValues.avatarUrl;
          await kvPutJson(kv, KV_KEYS.user(targetUser.id), targetUser);
        }
      }

      await kvPutJson(kv, KV_KEYS.profileRequestItem(reqItem.id), reqItem);

      // Send notification message to the requester
      const notifMsg: DirectMessage = {
        id: generateId('msg'),
        senderId: user.id,
        senderName: user.fullName,
        senderRole: user.role,
        recipientId: reqItem.userId,
        subject: body.status === 'approved' ? 'تأیید درخواست تغییر پروفایل' : 'رد درخواست تغییر پروفایل',
        body:
          body.status === 'approved'
            ? 'درخواست شما برای به‌روزرسانی اطلاعات پروفایل توسط مدیریت مدرسه تأیید و اعمال شد.'
            : `درخواست تغییر پروفایل شما توسط مدیریت مدرسه تأیید نشد.${reqItem.rejectionReason ? ` دلیل: ${reqItem.rejectionReason}` : ''}`,
        readBy: [user.id],
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.messageItem(notifMsg.id), notifMsg);
      await kvAddToIndex(kv, KV_KEYS.MESSAGES_INDEX, notifMsg.id);

      await appendAuditLog(
        kv,
        user,
        body.status === 'approved' ? 'تأیید تغییر پروفایل' : 'رد تغییر پروفایل',
        reqItem.username,
        `وضعیت: ${body.status}`
      );

      return jsonResponse({
        request: reqItem,
        message: body.status === 'approved' ? 'درخواست تغییر پروفایل تأیید و اعمال شد.' : 'درخواست تغییر پروفایل رد شد.',
      });
    }

    // Directory of teachers (safe public names for schedules & messaging)
    if (path === '/api/directory/teachers' && method === 'GET') {
      const [rawUsers, tombstones] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        getDeletedUserTombstones(kv),
      ]);
      const allUsers = rawUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      );
      const teachers = allUsers
        .filter((u) => (u.role === 'teacher' || u.role === 'admin') && u.active)
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          role: u.role,
          assignedSubjectIds: u.assignedSubjectIds ?? [],
          assignedClassIds: u.assignedClassIds ?? [],
        }));
      return jsonResponse({ teachers });
    }

    // Users CRUD
    if (path === '/api/users' && method === 'GET') {
      if (user.role === 'admin' && auth.session.remoteToken) {
        await syncDirectoryFromRemote(kv, env.AUTH_SERVER_URL, auth.session.remoteToken).catch(() => {});
      }
      const [rawUsers, tombstones] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        getDeletedUserTombstones(kv),
      ]);
      const allUsers = rawUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      );
      if (user.role === 'admin') {
        const roleFilter = url.searchParams.get('role');
        const filtered = roleFilter ? allUsers.filter((u) => u.role === roleFilter) : allUsers;
        return jsonResponse({ users: filtered.map(sanitizeUserForAdmin) });
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        const scopedUsers = allUsers.filter(
          (u) => u.id === user.id || (u.role === 'student' && u.classId && allowedClasses.has(u.classId))
        );
        return jsonResponse({ users: scopedUsers.map(sanitizeUser) });
      }
      return errorResponse('شما مجوز مشاهده فهرست کاربران را ندارید.', 403);
    }

    if (path === '/api/users/bulk' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مدرسه مجاز به ورود گروهی کاربران است.', 403);

      const body = await readJsonBody<{
        rows?: BulkUserImportRow[];
        autoCreateMissingClasses?: boolean;
      }>(req);

      const rawRows = Array.isArray(body.rows) ? body.rows : [];
      if (rawRows.length === 0) {
        return errorResponse('فهرست کاربران برای ثبت خالی است.', 400);
      }
      if (rawRows.length > 500) {
        return errorResponse('حداکثر ۵۰۰ ردیف در هر بار ورود اکسل مجاز است.', 400);
      }

      const autoCreateMissingClasses = body.autoCreateMissingClasses !== false;
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
      const takenUsernames = new Set(allUsers.map((u) => u.username.toLowerCase()));
      const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
      const allSubjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);

      const created: BulkUserImportCreatedItem[] = [];
      const errors: Array<{ rowNumber: number; fullName?: string; error: string }> = [];
      let createdClassesCount = 0;

      const resolveClassByHint = async (
        classIdHint?: string,
        classNameHint?: string,
        gradeHint?: string
      ): Promise<{ schoolClass: SchoolClass | null; autoCreated: boolean }> => {
        if (classIdHint?.trim()) {
          const byId = allClasses.find((c) => c.id === classIdHint.trim());
          if (byId) return { schoolClass: byId, autoCreated: false };
        }
        const cleanName = (classNameHint ?? '').trim();
        if (!cleanName) return { schoolClass: null, autoCreated: false };

        const targetKey = normalizeClassMatchKey(cleanName);
        const normalizedGrade = normalizeGradeLevel(gradeHint ?? cleanName);
        const byName =
          allClasses.find(
            (c) =>
              normalizeClassMatchKey(c.name) === targetKey &&
              (!normalizedGrade || c.gradeLevel === normalizedGrade)
          ) ?? allClasses.find((c) => normalizeClassMatchKey(c.name) === targetKey);

        if (byName) return { schoolClass: byName, autoCreated: false };
        if (!autoCreateMissingClasses) return { schoolClass: null, autoCreated: false };

        const newCls: SchoolClass = {
          id: generateId('cls'),
          name: cleanName.replace(/^کلاس\s+/u, '').trim(),
          gradeLevel: normalizedGrade ?? 'هفتم',
          academicYear: settings.academicYear || '۱۴۰۴-۱۴۰۵',
          capacity: 32,
          teacherIds: [],
          subjectIds: [],
          createdAt: new Date().toISOString(),
        };
        await kvPutJson(kv, KV_KEYS.classItem(newCls.id), newCls);
        await kvAddToIndex(kv, KV_KEYS.CLASSES_INDEX, newCls.id);
        allClasses.push(newCls);
        createdClassesCount++;
        return { schoolClass: newCls, autoCreated: true };
      };

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNumber = row.rowNumber ?? i + 1;
        const fullName = String(row.fullName ?? '').trim();
        if (!fullName) {
          errors.push({ rowNumber, error: 'نام و نام خانوادگی خالی است.' });
          continue;
        }

        const role: UserRole = row.role === 'teacher' ? 'teacher' : 'student';
        const rawUsername = normalizeDigits(String(row.username ?? '').trim()).toLowerCase();
        const autoGeneratedUsername = !rawUsername;
        let username = rawUsername;

        if (autoGeneratedUsername) {
          username = await generateUniqueUsername(role, takenUsernames, kv);
        } else {
          if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
            errors.push({
              rowNumber,
              fullName,
              error: `نام کاربری «${rawUsername}» نامعتبر است (۳ تا ۳۲ کاراکتر انگلیسی، عدد، نقطه، خط تیره یا زیرخط).`,
            });
            continue;
          }
          const existingId = takenUsernames.has(username) || (await kv.get(KV_KEYS.usernameIdx(username)));
          if (existingId) {
            errors.push({
              rowNumber,
              fullName,
              error: `نام کاربری «${username}» قبلاً ثبت شده است.`,
            });
            continue;
          }
          takenUsernames.add(username);
        }

        const rawPassword = String(row.password ?? '').trim();
        const autoGeneratedPassword = !rawPassword;
        const finalPassword = autoGeneratedPassword ? generateRandomPassword(8) : rawPassword;
        if (!autoGeneratedPassword && finalPassword.length < 6) {
          takenUsernames.delete(username);
          errors.push({
            rowNumber,
            fullName,
            error: 'رمز عبور واردشده باید حداقل ۶ کاراکتر باشد.',
          });
          continue;
        }

        let resolvedGrade = normalizeGradeLevel(row.gradeLevel) ?? normalizeGradeLevel(row.className);
        let assignedStudentClassId: string | undefined;
        let assignedClassLabel: string | undefined;
        let autoCreatedClass = false;
        const teacherClassIds: string[] = [];
        const teacherSubjectIds: string[] = [];

        if (role === 'student') {
          const { schoolClass, autoCreated } = await resolveClassByHint(
            row.classId,
            row.className,
            resolvedGrade
          );
          if (schoolClass) {
            assignedStudentClassId = schoolClass.id;
            assignedClassLabel = schoolClass.name;
            autoCreatedClass = autoCreated;
            if (!resolvedGrade) {
              resolvedGrade = normalizeGradeLevel(schoolClass.gradeLevel) ?? schoolClass.gradeLevel;
            }
          } else if (row.className?.trim()) {
            assignedClassLabel = row.className.trim();
          }
          if (!resolvedGrade) {
            resolvedGrade = 'هفتم';
          }
        } else {
          const classHints = String(row.className ?? '')
            .split(/[،,;؛|]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          const labels: string[] = [];
          for (const hint of classHints) {
            const { schoolClass, autoCreated } = await resolveClassByHint(undefined, hint, resolvedGrade);
            if (schoolClass && !teacherClassIds.includes(schoolClass.id)) {
              teacherClassIds.push(schoolClass.id);
              labels.push(schoolClass.name);
              if (autoCreated) autoCreatedClass = true;
            }
          }
          if (row.classId?.trim() && !teacherClassIds.includes(row.classId.trim())) {
            const cls = allClasses.find((c) => c.id === row.classId?.trim());
            if (cls) {
              teacherClassIds.push(cls.id);
              labels.push(cls.name);
            }
          }
          if (labels.length > 0) {
            assignedClassLabel = labels.join('، ');
          }

          const subjectHints = String(row.subjectNames ?? '')
            .split(/[،,;؛|]+/)
            .map((s) => normalizeDigits(s).trim().toLowerCase())
            .filter(Boolean);
          for (const subHint of subjectHints) {
            const matchedSub = allSubjects.find(
              (s) =>
                s.id.toLowerCase() === subHint ||
                normalizeDigits(s.name).trim().toLowerCase() === subHint ||
                normalizeDigits(s.name).trim().toLowerCase().includes(subHint)
            );
            if (matchedSub && !teacherSubjectIds.includes(matchedSub.id)) {
              teacherSubjectIds.push(matchedSub.id);
            }
          }
        }

        let resolvedUserId = generateId('usr');
        let resolvedCreatedAt = new Date().toISOString();

        if (auth.session.remoteToken) {
          try {
            const remoteCreated = await remoteCreateUser(env.AUTH_SERVER_URL, auth.session.remoteToken, {
              name: fullName,
              fullName,
              username,
              password: finalPassword,
              role,
              nationalId: row.nationalId?.trim() || undefined,
              phone: row.phone?.trim() || undefined,
              email: row.email?.trim() || undefined,
              grade: role === 'student' ? resolvedGrade : undefined,
              gradeLevel: role === 'student' ? resolvedGrade : undefined,
              className: assignedClassLabel || undefined,
              classId: role === 'student' ? assignedStudentClassId : undefined,
              assignedClassIds: role === 'teacher' ? teacherClassIds : undefined,
              assignedSubjectIds: role === 'teacher' ? teacherSubjectIds : undefined,
              active: true,
            });
            resolvedUserId = remoteCreated.user.id;
            resolvedCreatedAt = remoteCreated.user.createdAt ?? resolvedCreatedAt;
          } catch (err) {
            if (err instanceof RemoteAuthError && err.status === 404) {
              try {
                if (role === 'student') {
                  const remoteStudent = await remoteCreateStudent(env.AUTH_SERVER_URL, auth.session.remoteToken, {
                    name: fullName,
                    username,
                    password: finalPassword,
                    grade: resolvedGrade ?? 'هفتم',
                    className: assignedClassLabel || undefined,
                    studentCode: row.nationalId?.trim() || undefined,
                  });
                  resolvedUserId = remoteStudent.student.id;
                  resolvedCreatedAt = remoteStudent.student.createdAt ?? resolvedCreatedAt;
                } else {
                  const remoteTeacher = await remoteCreateTeacher(env.AUTH_SERVER_URL, auth.session.remoteToken, {
                    name: fullName,
                    username,
                    password: finalPassword,
                  });
                  resolvedUserId = remoteTeacher.teacher.id;
                  resolvedCreatedAt = remoteTeacher.teacher.createdAt ?? resolvedCreatedAt;
                }
              } catch {
                // Local persistence remains authoritative if remote sub-endpoint fails
              }
            }
          }
        }

        const { hash, salt } = await hashPassword(finalPassword);
        const newUser: StoredUser = {
          id: resolvedUserId,
          username,
          nationalId: normalizeDigits(String(row.nationalId ?? '').trim()),
          fullName,
          role,
          active: true,
          phone: row.phone?.trim() || undefined,
          email: row.email?.trim() || undefined,
          gradeLevel: role === 'student' ? resolvedGrade : undefined,
          classId: role === 'student' ? assignedStudentClassId : undefined,
          assignedClassIds: role === 'teacher' ? teacherClassIds : undefined,
          assignedSubjectIds: role === 'teacher' ? teacherSubjectIds : undefined,
          displayPassword: finalPassword,
          passwordHash: hash,
          passwordSalt: salt,
          createdAt: resolvedCreatedAt,
        };

        await clearUserDeletedTombstone(kv, newUser.id, username);
        await kvPutJson(kv, KV_KEYS.user(newUser.id), newUser);
        await kv.put(KV_KEYS.usernameIdx(username), newUser.id);
        await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, newUser.id);

        if (role === 'teacher' && teacherClassIds.length > 0) {
          for (const cid of teacherClassIds) {
            const cls = allClasses.find((c) => c.id === cid) ?? (await kvGetJson<SchoolClass>(kv, KV_KEYS.classItem(cid)));
            if (cls && !cls.teacherIds.includes(newUser.id)) {
              cls.teacherIds.push(newUser.id);
              await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
            }
          }
        }

        created.push({
          rowNumber,
          user: sanitizeUserForAdmin(newUser),
          username,
          password: finalPassword,
          autoGeneratedUsername,
          autoGeneratedPassword,
          className: assignedClassLabel,
          autoCreatedClass,
        });
      }

      if (created.length > 0) {
        await appendAuditLog(
          kv,
          user,
          'ورود گروهی با اکسل',
          `${created.length} کاربر`,
          `ثبت ${created.filter((c) => c.user.role === 'student').length} دانش‌آموز و ${created.filter((c) => c.user.role === 'teacher').length} معلم${createdClassesCount > 0 ? ` (${createdClassesCount} کلاس جدید)` : ''}`
        );
      }

      return jsonResponse(
        {
          success: created.length > 0,
          created,
          errors,
          createdClassesCount,
          message:
            created.length > 0
              ? `${created.length} حساب کاربری با موفقیت ثبت و عضو شد.`
              : 'هیچ کاربری ثبت نشد. خطاهای ردیف‌ها را بررسی کنید.',
        },
        created.length > 0 ? 201 : 400
      );
    }

    if (path === '/api/users' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مدرسه مجاز به ایجاد کاربر است.', 403);
      const body = await readJsonBody<{
        username?: string;
        nationalId?: string;
        fullName: string;
        role: UserRole;
        password?: string;
        phone?: string;
        email?: string;
        gradeLevel?: string;
        classId?: string;
        assignedClassIds?: string[];
        assignedSubjectIds?: string[];
        active?: boolean;
      }>(req);

      const cleanFullName = (body.fullName ?? '').trim();
      if (!cleanFullName) {
        return errorResponse('وارد کردن نام و نام خانوادگی الزامی است.', 400);
      }

      const rawUsername = normalizeDigits((body.username ?? '').trim()).toLowerCase();
      const autoGeneratedUsername = !rawUsername;
      let username = rawUsername;

      if (autoGeneratedUsername) {
        const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
        const taken = new Set(allUsers.map((u) => u.username.toLowerCase()));
        username = await generateUniqueUsername(body.role, taken, kv);
      } else {
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
          return errorResponse('نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.', 400);
        }
        const existingId = await kv.get(KV_KEYS.usernameIdx(username));
        if (existingId) {
          return errorResponse('این نام کاربری قبلاً ثبت شده است.', 409);
        }
      }

      const rawPassword = (body.password ?? '').trim();
      const autoGeneratedPassword = !rawPassword;
      const finalPassword = autoGeneratedPassword ? generateRandomPassword(8) : rawPassword;
      if (!autoGeneratedPassword && finalPassword.length < 6) {
        return errorResponse('رمز عبور باید حداقل ۶ کاراکتر باشد.', 400);
      }

      let resolvedUserId = generateId('usr');
      let resolvedCreatedAt = new Date().toISOString();

      const selectedClass = body.classId
        ? await kvGetJson<SchoolClass>(kv, KV_KEYS.classItem(body.classId))
        : null;
      const resolvedGradeLevel =
        normalizeGradeLevel(body.gradeLevel) ??
        normalizeGradeLevel(selectedClass?.gradeLevel) ??
        (body.role === 'student' ? 'هفتم' : undefined);

      if (auth.session.remoteToken) {
        try {
          const remoteCreated = await remoteCreateUser(env.AUTH_SERVER_URL, auth.session.remoteToken, {
            name: cleanFullName,
            fullName: cleanFullName,
            username,
            password: finalPassword,
            role: body.role,
            nationalId: body.nationalId?.trim() || undefined,
            phone: body.phone?.trim() || undefined,
            email: body.email?.trim() || undefined,
            grade: resolvedGradeLevel,
            gradeLevel: resolvedGradeLevel,
            className: selectedClass?.name || undefined,
            classId: body.classId || undefined,
            assignedClassIds: body.role === 'teacher' ? body.assignedClassIds ?? [] : undefined,
            assignedSubjectIds: body.role === 'teacher' ? body.assignedSubjectIds ?? [] : undefined,
            active: body.active ?? true,
          });
          resolvedUserId = remoteCreated.user.id;
          resolvedCreatedAt = remoteCreated.user.createdAt ?? resolvedCreatedAt;
        } catch (err) {
          if (err instanceof RemoteAuthError && err.status === 404) {
            if (body.role === 'student') {
              const remoteStudent = await remoteCreateStudent(env.AUTH_SERVER_URL, auth.session.remoteToken, {
                name: cleanFullName,
                username,
                password: finalPassword,
                grade: resolvedGradeLevel || 'هفتم',
                className: selectedClass?.name || undefined,
                studentCode: body.nationalId?.trim() || undefined,
              });
              resolvedUserId = remoteStudent.student.id;
              resolvedCreatedAt = remoteStudent.student.createdAt ?? resolvedCreatedAt;
            } else if (body.role === 'teacher') {
              const remoteTeacher = await remoteCreateTeacher(env.AUTH_SERVER_URL, auth.session.remoteToken, {
                name: cleanFullName,
                username,
                password: finalPassword,
              });
              resolvedUserId = remoteTeacher.teacher.id;
              resolvedCreatedAt = remoteTeacher.teacher.createdAt ?? resolvedCreatedAt;
            }
          } else if (!(err instanceof RemoteAuthError && (err.status === 502 || err.status === 504))) {
            throw err;
          }
        }
      }

      const { hash, salt } = await hashPassword(finalPassword);
      const newUser: StoredUser = {
        id: resolvedUserId,
        username,
        nationalId: (body.nationalId ?? '').trim(),
        fullName: cleanFullName,
        role: body.role,
        active: body.active ?? true,
        phone: body.phone?.trim(),
        email: body.email?.trim(),
        gradeLevel: body.role === 'student' ? resolvedGradeLevel : undefined,
        classId: body.role === 'student' ? body.classId : undefined,
        assignedClassIds: body.role === 'teacher' ? body.assignedClassIds ?? [] : undefined,
        assignedSubjectIds: body.role === 'teacher' ? body.assignedSubjectIds ?? [] : undefined,
        displayPassword: finalPassword,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: resolvedCreatedAt,
      };

      await clearUserDeletedTombstone(kv, newUser.id, username);
      await kvPutJson(kv, KV_KEYS.user(newUser.id), newUser);
      await kv.put(KV_KEYS.usernameIdx(username), newUser.id);
      await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, newUser.id);

      // Keep class teacherIds synced if teacher
      if (newUser.role === 'teacher' && newUser.assignedClassIds?.length) {
        for (const cid of newUser.assignedClassIds) {
          const cls = await kvGetJson<SchoolClass>(kv, KV_KEYS.classItem(cid));
          if (cls && !cls.teacherIds.includes(newUser.id)) {
            cls.teacherIds.push(newUser.id);
            await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
          }
        }
      }

      await appendAuditLog(kv, user, 'ایجاد حساب کاربری', newUser.fullName, `نقش: ${newUser.role} | نام کاربری: ${newUser.username}`);
      return jsonResponse(
        {
          user: sanitizeUserForAdmin(newUser),
          generatedCredentials: {
            username,
            password: finalPassword,
            autoGeneratedUsername,
            autoGeneratedPassword,
          },
          message: 'حساب کاربری جدید با موفقیت ایجاد شد.',
        },
        201
      );
    }

    if (path.startsWith('/api/users/') && method === 'PATCH') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مدرسه مجاز به ویرایش کاربران است.', 403);
      const targetId = decodeURIComponent(path.split('/')[3] ?? '').trim();
      const target = await kvGetJson<StoredUser>(kv, KV_KEYS.user(targetId));
      if (!target) return errorResponse('کاربر مورد نظر یافت نشد.', 404);

      const body = await readJsonBody<{
        fullName?: string;
        nationalId?: string;
        role?: UserRole;
        active?: boolean;
        phone?: string;
        email?: string;
        gradeLevel?: string;
        classId?: string;
        assignedClassIds?: string[];
        assignedSubjectIds?: string[];
        newPassword?: string;
      }>(req);

      if (target.id === user.id && body.active === false) {
        return errorResponse('امکان غیرفعال کردن حساب کاربری خودتان وجود ندارد.', 400);
      }

      if (body.fullName !== undefined) target.fullName = body.fullName.trim();
      if (body.nationalId !== undefined) target.nationalId = body.nationalId.trim();
      if (body.role !== undefined) target.role = body.role;
      if (body.active !== undefined) target.active = body.active;
      if (body.phone !== undefined) target.phone = body.phone.trim();
      if (body.email !== undefined) target.email = body.email.trim();
      if (body.gradeLevel !== undefined) target.gradeLevel = normalizeGradeLevel(body.gradeLevel) ?? body.gradeLevel.trim();
      if (body.classId !== undefined) target.classId = body.classId || undefined;
      if (body.assignedClassIds !== undefined) target.assignedClassIds = body.assignedClassIds;
      if (body.assignedSubjectIds !== undefined) target.assignedSubjectIds = body.assignedSubjectIds;

      if (body.newPassword) {
        if (body.newPassword.length < 6) return errorResponse('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 400);
        const hashed = await hashPassword(body.newPassword);
        target.passwordHash = hashed.hash;
        target.passwordSalt = hashed.salt;
        target.displayPassword = body.newPassword;
      }

      if (auth.session.remoteToken) {
        try {
          await remoteUpdateUser(env.AUTH_SERVER_URL, auth.session.remoteToken, target.id, {
            ...(body.fullName !== undefined ? { fullName: target.fullName, name: target.fullName } : {}),
            ...(body.nationalId !== undefined ? { nationalId: target.nationalId } : {}),
            ...(body.role !== undefined ? { role: target.role } : {}),
            ...(body.active !== undefined ? { active: target.active } : {}),
            ...(body.phone !== undefined ? { phone: target.phone } : {}),
            ...(body.email !== undefined ? { email: target.email } : {}),
            ...(body.gradeLevel !== undefined ? { gradeLevel: target.gradeLevel, grade: target.gradeLevel } : {}),
            ...(body.classId !== undefined ? { classId: target.classId, className: target.classId } : {}),
            ...(body.assignedClassIds !== undefined ? { assignedClassIds: target.assignedClassIds } : {}),
            ...(body.assignedSubjectIds !== undefined ? { assignedSubjectIds: target.assignedSubjectIds } : {}),
            ...(body.newPassword ? { newPassword: body.newPassword } : {}),
          });
        } catch (err) {
          if (!(err instanceof RemoteAuthError && (err.status === 404 || err.status === 502 || err.status === 504))) {
            throw err;
          }
        }
      }

      await kvPutJson(kv, KV_KEYS.user(target.id), target);

      // Sync teacherIds across classes
      if (target.role === 'teacher' && body.assignedClassIds !== undefined) {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const assignedSet = new Set(target.assignedClassIds ?? []);
        for (const cls of allClasses) {
          const has = cls.teacherIds.includes(target.id);
          if (assignedSet.has(cls.id) && !has) {
            cls.teacherIds.push(target.id);
            await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
          } else if (!assignedSet.has(cls.id) && has) {
            cls.teacherIds = cls.teacherIds.filter((id) => id !== target.id);
            await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
          }
        }
      }

      await appendAuditLog(kv, user, 'ویرایش حساب کاربری', target.fullName, `به‌روزرسانی اطلاعات کاربر ${target.username}`);
      return jsonResponse({ user: sanitizeUserForAdmin(target), message: 'اطلاعات کاربر به‌روزرسانی شد.' });
    }

    if (path === '/api/users/sync-tombstones' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مدرسه مجاز به همگام‌سازی حذف کاربران است.', 403);
      const body = await readJsonBody<{
        tombstones?: Array<{ id?: string; username?: string; deletedAt?: string }>;
      }>(req);
      const incoming = Array.isArray(body.tombstones) ? body.tombstones.slice(0, 500) : [];
      if (incoming.length === 0) {
        return jsonResponse({ ok: true, appliedCount: 0 });
      }

      const removedTargets: StoredUser[] = [];
      let appliedCount = 0;

      await withUserDirectoryLock(kv, async () => {
        for (const item of incoming) {
          const cleanId = String(item?.id ?? '').trim();
          const cleanUsername = String(item?.username ?? '').trim().toLowerCase();
          const deletedAtMs = item?.deletedAt ? Date.parse(String(item.deletedAt)) : NaN;
          if (!cleanId && !cleanUsername) continue;
          if (cleanId && cleanId === user.id) continue;

          let target = cleanId ? await kvGetJson<StoredUser>(kv, KV_KEYS.user(cleanId)) : null;
          let matchedByUsernameOnly = false;
          if (!target && cleanUsername) {
            const byUnameId = await kv.get(KV_KEYS.usernameIdx(cleanUsername));
            if (byUnameId && byUnameId !== user.id) {
              target = await kvGetJson<StoredUser>(kv, KV_KEYS.user(byUnameId));
              matchedByUsernameOnly = Boolean(target);
            }
          }

          if (target && target.id === user.id) continue;

          if (target && matchedByUsernameOnly && Number.isFinite(deletedAtMs) && target.createdAt) {
            const createdMs = Date.parse(target.createdAt);
            if (Number.isFinite(createdMs) && createdMs > deletedAtMs + 1000) {
              continue;
            }
          }

          if (target) {
            if (auth.session.remoteToken) {
              await remoteDeleteUser(env.AUTH_SERVER_URL, auth.session.remoteToken, target.id, target.role).catch(() => {});
            }
            await markUserDeletedTombstone(kv, target.id, target.username);
            await kv.delete(KV_KEYS.user(target.id));
            await kv.delete(KV_KEYS.usernameIdx(target.username));
            await kvRemoveFromIndex(kv, KV_KEYS.USERS_INDEX, target.id);
            removedTargets.push(target);
            appliedCount++;
          } else {
            await markUserDeletedTombstone(kv, cleanId, cleanUsername);
            if (cleanId) {
              await kvRemoveFromIndex(kv, KV_KEYS.USERS_INDEX, cleanId);
            }
            appliedCount++;
          }
        }
      });

      if (removedTargets.length > 0) {
        const removedTeacherIds = new Set(removedTargets.filter((t) => t.role === 'teacher').map((t) => t.id));
        if (removedTeacherIds.size > 0) {
          const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
          for (const cls of allClasses) {
            const nextTeachers = cls.teacherIds.filter((id) => !removedTeacherIds.has(id));
            if (nextTeachers.length !== cls.teacherIds.length) {
              cls.teacherIds = nextTeachers;
              await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
            }
          }
        }

        const removedIds = new Set(removedTargets.map((t) => t.id));
        const sessionList = await kv.list({ prefix: 'school:session:' });
        for (const entry of sessionList.keys) {
          const sess = await kvGetJson<SessionData>(kv, entry.name);
          if (sess && removedIds.has(sess.userId)) {
            await kv.delete(entry.name);
          }
        }

        await appendAuditLog(
          kv,
          user,
          'همگام‌سازی حذف حساب‌های کاربری',
          `${removedTargets.length} کاربر`,
          removedTargets.map((t) => t.username).join('، ')
        );
      }

      return jsonResponse({ ok: true, appliedCount });
    }

    if (path.startsWith('/api/users/') && method === 'DELETE') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مدرسه مجاز به حذف کاربران است.', 403);
      const targetId = decodeURIComponent(path.split('/')[3] ?? '').trim();
      if (!targetId) return errorResponse('شناسه کاربر نامعتبر است.', 400);
      if (targetId === user.id) return errorResponse('حذف حساب کاربری فعال خودتان مجاز نیست.', 400);

      let alreadyTombstoned = false;
      const deletedTarget = await withUserDirectoryLock(kv, async () => {
        const target = await kvGetJson<StoredUser>(kv, KV_KEYS.user(targetId));
        if (!target) {
          const allIdx = await kvGetIndex(kv, KV_KEYS.USERS_INDEX);
          const tombstones = await getDeletedUserTombstones(kv);
          if (allIdx.includes(targetId) || tombstones.ids.has(targetId)) {
            alreadyTombstoned = tombstones.ids.has(targetId);
            await markUserDeletedTombstone(kv, targetId, '');
            await kvRemoveFromIndex(kv, KV_KEYS.USERS_INDEX, targetId);
            return null;
          }
          return undefined;
        }

        if (auth.session.remoteToken) {
          await remoteDeleteUser(env.AUTH_SERVER_URL, auth.session.remoteToken, target.id, target.role).catch(() => {});
        }

        await markUserDeletedTombstone(kv, target.id, target.username);
        await kv.delete(KV_KEYS.user(target.id));
        await kv.delete(KV_KEYS.usernameIdx(target.username));
        await kvRemoveFromIndex(kv, KV_KEYS.USERS_INDEX, target.id);
        return target;
      });

      if (deletedTarget === undefined && !alreadyTombstoned) {
        return errorResponse('کاربر یافت نشد.', 404);
      }

      if (deletedTarget) {
        if (deletedTarget.role === 'teacher') {
          const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
          for (const cls of allClasses) {
            if (cls.teacherIds.includes(deletedTarget.id)) {
              cls.teacherIds = cls.teacherIds.filter((id) => id !== deletedTarget.id);
              await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
            }
          }
        }

        // Revoke active sessions belonging to the deleted user
        const sessionList = await kv.list({ prefix: 'school:session:' });
        for (const entry of sessionList.keys) {
          const sess = await kvGetJson<SessionData>(kv, entry.name);
          if (sess?.userId === deletedTarget.id) {
            await kv.delete(entry.name);
          }
        }

        await appendAuditLog(
          kv,
          user,
          'حذف حساب کاربری',
          deletedTarget.fullName,
          `حذف کاربر ${deletedTarget.username}`
        );
      }

      return jsonResponse({ ok: true, message: 'کاربر با موفقیت حذف شد.' });
    }

    // Roles & Permissions
    if (path === '/api/roles' && method === 'GET') {
      if (user.role !== 'admin') return errorResponse('دسترسی غیرمجاز', 403);
      const rawRoles = (await kvGetJson<RolePermissionConfig[]>(kv, KV_KEYS.ROLES)) ?? DEFAULT_ROLES;
      const roles = rawRoles.filter((r) => r.role === 'admin' || r.role === 'teacher' || r.role === 'student');
      return jsonResponse({ roles });
    }

    if (path === '/api/roles' && method === 'PUT') {
      if (user.role !== 'admin') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<{ roles: RolePermissionConfig[] }>(req);
      if (!Array.isArray(body.roles)) return errorResponse('فرمت نقش‌ها نامعتبر است.', 400);
      await kvPutJson(kv, KV_KEYS.ROLES, body.roles);
      await appendAuditLog(kv, user, 'تغییر سطوح دسترسی', 'نقش‌ها', 'به‌روزرسانی ماتریس مجوزهای نقش‌های سامانه');
      return jsonResponse({ roles: body.roles, message: 'سطوح دسترسی نقش‌ها ذخیره شد.' });
    }

    // Classes
    if (path === '/api/classes' && method === 'GET') {
      const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
      if (user.role === 'admin') return jsonResponse({ classes: allClasses });
      if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        return jsonResponse({ classes: allClasses.filter((c) => allowed.has(c.id)) });
      }
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      return jsonResponse({ classes: allClasses.filter((c) => c.id === effStudent.classId) });
    }

    if (path === '/api/classes' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به ایجاد کلاس است.', 403);
      const body = await readJsonBody<{
        name: string;
        gradeLevel: string;
        academicYear?: string;
        capacity?: number;
        room?: string;
        teacherIds?: string[];
        subjectIds?: string[];
      }>(req);

      if (!body.name?.trim() || !body.gradeLevel?.trim()) {
        return errorResponse('نام کلاس و پایه تحصیلی الزامی است.', 400);
      }

      const settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      const cls: SchoolClass = {
        id: generateId('cls'),
        name: body.name.trim(),
        gradeLevel: body.gradeLevel.trim(),
        academicYear: body.academicYear?.trim() || settings?.academicYear || '۱۴۰۴-۱۴۰۵',
        capacity: Number(body.capacity) || 30,
        room: body.room?.trim(),
        teacherIds: body.teacherIds ?? [],
        subjectIds: body.subjectIds ?? [],
        createdAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
      await kvAddToIndex(kv, KV_KEYS.CLASSES_INDEX, cls.id);

      // Sync teachers' assignedClassIds
      for (const tid of cls.teacherIds) {
        const t = await kvGetJson<StoredUser>(kv, KV_KEYS.user(tid));
        if (t && t.role === 'teacher') {
          const list = new Set(t.assignedClassIds ?? []);
          list.add(cls.id);
          t.assignedClassIds = Array.from(list);
          await kvPutJson(kv, KV_KEYS.user(t.id), t);
        }
      }

      await appendAuditLog(kv, user, 'ایجاد کلاس', cls.name, `پایه: ${cls.gradeLevel}`);
      return jsonResponse({ classItem: cls, message: 'کلاس جدید با موفقیت ایجاد شد.' }, 201);
    }

    if (path.startsWith('/api/classes/') && method === 'PATCH') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مجاز به ویرایش کلاس است.', 403);
      const id = path.split('/')[3];
      const cls = await kvGetJson<SchoolClass>(kv, KV_KEYS.classItem(id));
      if (!cls) return errorResponse('کلاس یافت نشد.', 404);

      const body = await readJsonBody<Partial<SchoolClass>>(req);
      if (body.name !== undefined) cls.name = body.name.trim();
      if (body.gradeLevel !== undefined) cls.gradeLevel = body.gradeLevel.trim();
      if (body.academicYear !== undefined) cls.academicYear = body.academicYear.trim();
      if (body.capacity !== undefined) cls.capacity = Number(body.capacity) || cls.capacity;
      if (body.room !== undefined) cls.room = body.room.trim();
      if (body.subjectIds !== undefined) cls.subjectIds = body.subjectIds;
      if (body.teacherIds !== undefined) {
        cls.teacherIds = body.teacherIds;
        const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
        const teacherSet = new Set(body.teacherIds);
        for (const u of allUsers) {
          if (u.role !== 'teacher') continue;
          const current = new Set(u.assignedClassIds ?? []);
          if (teacherSet.has(u.id) && !current.has(cls.id)) {
            current.add(cls.id);
            u.assignedClassIds = Array.from(current);
            await kvPutJson(kv, KV_KEYS.user(u.id), u);
          } else if (!teacherSet.has(u.id) && current.has(cls.id)) {
            current.delete(cls.id);
            u.assignedClassIds = Array.from(current);
            await kvPutJson(kv, KV_KEYS.user(u.id), u);
          }
        }
      }

      await kvPutJson(kv, KV_KEYS.classItem(cls.id), cls);
      await appendAuditLog(kv, user, 'ویرایش کلاس', cls.name, `به‌روزرسانی مشخصات کلاس`);
      return jsonResponse({ classItem: cls, message: 'اطلاعات کلاس ویرایش شد.' });
    }

    if (path.startsWith('/api/classes/') && method === 'DELETE') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مجاز به حذف کلاس است.', 403);
      const id = path.split('/')[3];
      const cls = await kvGetJson<SchoolClass>(kv, KV_KEYS.classItem(id));
      if (!cls) return errorResponse('کلاس یافت نشد.', 404);
      await kv.delete(KV_KEYS.classItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.CLASSES_INDEX, id);
      await appendAuditLog(kv, user, 'حذف کلاس', cls.name, 'کلاس از سامانه حذف شد');
      return jsonResponse({ ok: true, message: 'کلاس با موفقیت حذف شد.' });
    }

    // Subjects
    if (path === '/api/subjects' && method === 'GET') {
      const subjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
      return jsonResponse({ subjects });
    }

    if (path === '/api/subjects' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مجاز به تعریف درس است.', 403);
      const body = await readJsonBody<{
        code: string;
        name: string;
        gradeLevel: string;
        coefficient: number;
        teacherId?: string;
      }>(req);

      if (!body.name?.trim() || !body.gradeLevel?.trim()) {
        return errorResponse('نام درس و پایه تحصیلی الزامی است.', 400);
      }

      const subject: Subject = {
        id: generateId('sub'),
        code: (body.code ?? '').trim() || `CRS-${Math.floor(100 + Math.random() * 900)}`,
        name: body.name.trim(),
        gradeLevel: body.gradeLevel.trim(),
        coefficient: Number(body.coefficient) || 2,
        teacherId: body.teacherId || undefined,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.subjectItem(subject.id), subject);
      await kvAddToIndex(kv, KV_KEYS.SUBJECTS_INDEX, subject.id);
      await appendAuditLog(kv, user, 'ایجاد درس', subject.name, `کد: ${subject.code} | ضریب: ${subject.coefficient}`);
      return jsonResponse({ subject, message: 'درس جدید با موفقیت ثبت شد.' }, 201);
    }

    if (path.startsWith('/api/subjects/') && method === 'PATCH') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مجاز به ویرایش درس است.', 403);
      const id = path.split('/')[3];
      const sub = await kvGetJson<Subject>(kv, KV_KEYS.subjectItem(id));
      if (!sub) return errorResponse('درس یافت نشد.', 404);
      const body = await readJsonBody<Partial<Subject>>(req);
      if (body.name !== undefined) sub.name = body.name.trim();
      if (body.code !== undefined) sub.code = body.code.trim();
      if (body.gradeLevel !== undefined) sub.gradeLevel = body.gradeLevel.trim();
      if (body.coefficient !== undefined) sub.coefficient = Number(body.coefficient) || sub.coefficient;
      if (body.teacherId !== undefined) sub.teacherId = body.teacherId || undefined;
      await kvPutJson(kv, KV_KEYS.subjectItem(sub.id), sub);
      await appendAuditLog(kv, user, 'ویرایش درس', sub.name, 'به‌روزرسانی اطلاعات درس');
      return jsonResponse({ subject: sub, message: 'مشخصات درس ویرایش شد.' });
    }

    if (path.startsWith('/api/subjects/') && method === 'DELETE') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر مجاز به حذف درس است.', 403);
      const id = path.split('/')[3];
      const sub = await kvGetJson<Subject>(kv, KV_KEYS.subjectItem(id));
      if (!sub) return errorResponse('درس یافت نشد.', 404);
      await kv.delete(KV_KEYS.subjectItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.SUBJECTS_INDEX, id);
      await appendAuditLog(kv, user, 'حذف درس', sub.name, 'درس از سامانه حذف شد');
      return jsonResponse({ ok: true, message: 'درس حذف شد.' });
    }

    // Grades
    if (path === '/api/grades' && method === 'GET') {
      const allGrades = await kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem);
      const classIdFilter = url.searchParams.get('classId');
      const subjectIdFilter = url.searchParams.get('subjectId');
      const termFilter = url.searchParams.get('term');

      let scoped = allGrades;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        scoped = scoped.filter((g) => g.studentId === effStudent.id);
      } else if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        scoped = scoped.filter((g) => allowedClasses.has(g.classId));
      }

      if (classIdFilter) scoped = scoped.filter((g) => g.classId === classIdFilter);
      if (subjectIdFilter) scoped = scoped.filter((g) => g.subjectId === subjectIdFilter);
      if (termFilter) scoped = scoped.filter((g) => g.term === termFilter);

      return jsonResponse({ grades: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (path === '/api/grades' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دانش‌آموز و والدین مجاز به ثبت نمره نیستند.', 403);
      const body = await readJsonBody<{
        studentId: string;
        classId: string;
        subjectId: string;
        term: GradeRecord['term'];
        title: string;
        score: number;
        maxScore?: number;
        date?: string;
        note?: string;
      }>(req);

      const student = await kvGetJson<StoredUser>(kv, KV_KEYS.user(body.studentId));
      if (!student || student.role !== 'student') {
        return errorResponse('دانش‌آموز معتبر یافت نشد.', 404);
      }

      const classId = body.classId || student.classId || '';
      if (!classId) return errorResponse('کلاس دانش‌آموز مشخص نشده است.', 400);
      if (student.classId && student.classId !== classId) {
        return errorResponse('این دانش‌آموز عضو کلاس انتخاب‌شده نیست.', 400);
      }

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        if (!allowedClasses.has(classId)) {
          return errorResponse('شما فقط مجاز به ثبت نمره برای کلاس‌های اختصاص‌یافته به خود هستید.', 403);
        }
      }

      const maxScore = Number(body.maxScore) || 20;
      const score = Number(body.score);
      if (Number.isNaN(score) || score < 0 || score > maxScore) {
        return errorResponse(`نمره باید عددی بین ۰ تا ${maxScore} باشد.`, 400);
      }

      const grade: GradeRecord = {
        id: generateId('grd'),
        studentId: student.id,
        classId,
        subjectId: body.subjectId,
        teacherId: user.id,
        term: body.term || 'نوبت اول',
        title: body.title?.trim() || 'ارزشیابی کلاسی',
        score,
        maxScore,
        date: body.date?.trim() || new Date().toLocaleDateString('fa-IR'),
        note: body.note?.trim(),
        createdAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.gradeItem(grade.id), grade);
      await kvAddToIndex(kv, KV_KEYS.GRADES_INDEX, grade.id);
      await appendAuditLog(kv, user, 'ثبت نمره', student.fullName, `عنوان: ${grade.title} | نمره: ${grade.score}/${grade.maxScore}`);
      return jsonResponse({ grade, message: 'نمره با موفقیت ثبت شد.' }, 201);
    }

    if (path.startsWith('/api/grades/') && method === 'PATCH') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const grade = await kvGetJson<GradeRecord>(kv, KV_KEYS.gradeItem(id));
      if (!grade) return errorResponse('نمره یافت نشد.', 404);

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        if (!allowedClasses.has(grade.classId)) {
          return errorResponse('شما مجاز به ویرایش نمره این کلاس نیستید.', 403);
        }
      }

      const body = await readJsonBody<Partial<GradeRecord>>(req);
      const nextMax = body.maxScore !== undefined ? Number(body.maxScore) : grade.maxScore;
      if (!Number.isFinite(nextMax) || nextMax <= 0 || nextMax > 1000) {
        return errorResponse('سقف نمره باید عددی معتبر و بزرگ‌تر از صفر باشد.', 400);
      }
      if (body.score !== undefined) {
        const nextScore = Number(body.score);
        if (!Number.isFinite(nextScore) || nextScore < 0 || nextScore > nextMax) {
          return errorResponse(`نمره باید عددی معتبر بین ۰ تا ${nextMax} باشد.`, 400);
        }
        grade.score = nextScore;
      } else if (grade.score > nextMax) {
        return errorResponse(`نمره ثبت‌شده فعلی از سقف جدید (${nextMax}) بیشتر است.`, 400);
      }
      if (body.maxScore !== undefined) grade.maxScore = nextMax;
      if (body.title !== undefined) grade.title = String(body.title).trim();
      if (body.term !== undefined) grade.term = body.term;
      if (body.date !== undefined) grade.date = String(body.date).trim();
      if (body.note !== undefined) grade.note = String(body.note).trim();

      await kvPutJson(kv, KV_KEYS.gradeItem(grade.id), grade);
      await appendAuditLog(kv, user, 'ویرایش نمره', grade.id, `نمره جدید: ${grade.score}`);
      return jsonResponse({ grade, message: 'نمره با موفقیت ویرایش شد.' });
    }

    if (path.startsWith('/api/grades/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const grade = await kvGetJson<GradeRecord>(kv, KV_KEYS.gradeItem(id));
      if (!grade) return errorResponse('نمره یافت نشد.', 404);

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        if (!allowedClasses.has(grade.classId)) {
          return errorResponse('شما مجاز به حذف نمره این کلاس نیستید.', 403);
        }
      }

      await kv.delete(KV_KEYS.gradeItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.GRADES_INDEX, id);
      await appendAuditLog(kv, user, 'حذف نمره', grade.title, `حذف رکورد نمره ${grade.id}`);
      return jsonResponse({ ok: true, message: 'نمره با موفقیت حذف شد.' });
    }

    // Academic History
    if (path === '/api/history' && method === 'GET') {
      const histories = await kvGetCollection<AcademicHistoryRecord>(kv, KV_KEYS.HISTORY_INDEX, KV_KEYS.historyItem);
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        return jsonResponse({ histories: histories.filter((h) => h.studentId === effStudent.id) });
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        const allUsers = await kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user);
        const allowedStudentIds = new Set(
          allUsers.filter((u) => u.role === 'student' && u.classId && allowedClasses.has(u.classId)).map((u) => u.id)
        );
        return jsonResponse({ histories: histories.filter((h) => allowedStudentIds.has(h.studentId)) });
      }
      return jsonResponse({ histories });
    }

    if (path === '/api/history' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به ثبت سوابق تحصیلی است.', 403);
      const body = await readJsonBody<{
        studentId?: string;
        academicYear?: string;
        gradeLevel?: string;
        gpa?: number;
        status?: AcademicHistoryRecord['status'];
        summary?: string;
      }>(req);
      const cleanStudentId = String(body.studentId ?? '').trim();
      const cleanYear = String(body.academicYear ?? '').trim();
      const cleanGradeLevel = String(body.gradeLevel ?? '').trim();
      const parsedGpa = Number(body.gpa);
      if (!cleanStudentId || !cleanYear || !cleanGradeLevel) {
        return errorResponse('شناسه دانش‌آموز، سال تحصیلی و پایه الزامی است.', 400);
      }
      if (!Number.isFinite(parsedGpa) || parsedGpa < 0 || parsedGpa > 20) {
        return errorResponse('معدل باید عددی معتبر بین ۰ تا ۲۰ باشد.', 400);
      }
      const validStatus: AcademicHistoryRecord['status'] =
        body.status === 'ممتاز' || body.status === 'قبول' || body.status === 'نیاز به تلاش'
          ? body.status
          : 'قبول';
      const record: AcademicHistoryRecord = {
        id: generateId('his'),
        studentId: cleanStudentId,
        academicYear: cleanYear,
        gradeLevel: cleanGradeLevel,
        gpa: Number(parsedGpa.toFixed(2)),
        status: validStatus,
        summary: String(body.summary ?? '').trim(),
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.historyItem(record.id), record);
      await kvAddToIndex(kv, KV_KEYS.HISTORY_INDEX, record.id);
      await appendAuditLog(kv, user, 'ثبت سابقه تحصیلی', record.studentId, `سال ${record.academicYear} | معدل ${record.gpa}`);
      return jsonResponse({ history: record, message: 'سابقه تحصیلی با موفقیت ثبت شد.' }, 201);
    }

    if (path.startsWith('/api/history/') && method === 'DELETE') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به حذف سابقه تحصیلی است.', 403);
      const id = path.split('/')[3];
      await kv.delete(KV_KEYS.historyItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.HISTORY_INDEX, id);
      return jsonResponse({ ok: true, message: 'سابقه تحصیلی حذف شد.' });
    }

    // Attendance
    if (path === '/api/attendance' && method === 'GET') {
      const records = await kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem);
      const classId = url.searchParams.get('classId');
      const dateFilter = url.searchParams.get('date');

      let scoped = records;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        scoped = scoped.filter((a) => a.studentId === effStudent.id);
      } else if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        scoped = scoped.filter((a) => allowedClasses.has(a.classId));
      }

      if (classId) scoped = scoped.filter((a) => a.classId === classId);
      if (dateFilter) scoped = scoped.filter((a) => a.date === dateFilter);

      return jsonResponse({ attendance: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (path === '/api/attendance/batch' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<{
        classId: string;
        subjectId?: string;
        date: string;
        entries: Array<{ studentId: string; status: AttendanceRecord['status']; note?: string }>;
      }>(req);

      if (!body.classId || !body.date || !Array.isArray(body.entries)) {
        return errorResponse('اطلاعات کلاس، تاریخ و فهرست دانش‌آموزان الزامی است.', 400);
      }

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        if (!allowedClasses.has(body.classId)) {
          return errorResponse('شما مجاز به ثبت حضور و غیاب برای این کلاس نیستید.', 403);
        }
      }

      const existingAll = await kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem);
      const saved: AttendanceRecord[] = [];

      for (const entry of body.entries) {
        const match = existingAll.find(
          (a) =>
            a.studentId === entry.studentId &&
            a.classId === body.classId &&
            a.date === body.date.trim() &&
            (a.subjectId ?? '') === (body.subjectId ?? '')
        );

        if (match) {
          match.status = entry.status;
          match.note = entry.note?.trim();
          match.teacherId = user.id;
          await kvPutJson(kv, KV_KEYS.attendanceItem(match.id), match);
          saved.push(match);
        } else {
          const rec: AttendanceRecord = {
            id: generateId('att'),
            studentId: entry.studentId,
            classId: body.classId,
            subjectId: body.subjectId || undefined,
            teacherId: user.id,
            date: body.date.trim(),
            status: entry.status,
            note: entry.note?.trim(),
            createdAt: new Date().toISOString(),
          };
          await kvPutJson(kv, KV_KEYS.attendanceItem(rec.id), rec);
          await kvAddToIndex(kv, KV_KEYS.ATTENDANCE_INDEX, rec.id);
          saved.push(rec);
        }
      }

      await appendAuditLog(kv, user, 'ثبت حضور و غیاب', `کلاس ${body.classId}`, `تاریخ: ${body.date} | تعداد: ${saved.length} نفر`);
      return jsonResponse({ attendance: saved, message: 'حضور و غیاب کلاس با موفقیت ثبت شد.' }, 201);
    }

    if (path.startsWith('/api/attendance/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const rec = await kvGetJson<AttendanceRecord>(kv, KV_KEYS.attendanceItem(id));
      if (!rec) return errorResponse('رکورد یافت نشد.', 404);
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(rec.classId)) return errorResponse('دسترسی غیرمجاز', 403);
      }
      await kv.delete(KV_KEYS.attendanceItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.ATTENDANCE_INDEX, id);
      return jsonResponse({ ok: true, message: 'رکورد حضور و غیاب حذف شد.' });
    }

    // Assignments & Submissions
    if (path === '/api/assignments' && method === 'GET') {
      const [assignments, submissions, classes] = await Promise.all([
        kvGetCollection<Assignment>(kv, KV_KEYS.ASSIGNMENTS_INDEX, KV_KEYS.assignmentItem),
        kvGetCollection<AssignmentSubmission>(kv, KV_KEYS.SUBMISSIONS_INDEX, KV_KEYS.submissionItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      const effStudent = user.role === 'student'
        ? await resolveEffectiveStudentUser(kv, user)
        : null;

      let scoped = assignments;
      if (effStudent) {
        scoped = scoped.filter((a) => a.classId === effStudent.classId);
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        scoped = scoped.filter((a) => allowed.has(a.classId));
      }

      const enriched = scoped
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => {
          const asgSubs = submissions.filter((s) => s.assignmentId === a.id);
          if (effStudent) {
            return {
              ...a,
              mySubmission: asgSubs.find((s) => s.studentId === effStudent.id) ?? null,
            };
          }
          return {
            ...a,
            submissionsCount: asgSubs.length,
            gradedCount: asgSubs.filter((s) => s.status === 'graded').length,
          };
        });

      return jsonResponse({ assignments: enriched });
    }

    if (path === '/api/assignments' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دانش‌آموز و والدین مجاز به تعریف تکلیف نیستند.', 403);
      const body = await readJsonBody<{
        title: string;
        description: string;
        classId: string;
        subjectId: string;
        dueDate: string;
        maxScore?: number;
      }>(req);

      if (!body.title?.trim() || !body.classId || !body.subjectId || !body.dueDate?.trim()) {
        return errorResponse('عنوان، کلاس، درس و مهلت تحویل الزامی است.', 400);
      }

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(body.classId)) {
          return errorResponse('شما فقط مجاز به تعریف تکلیف برای کلاس‌های اختصاص‌یافته به خود هستید.', 403);
        }
      }

      const asg: Assignment = {
        id: generateId('asg'),
        title: body.title.trim(),
        description: (body.description ?? '').trim(),
        classId: body.classId,
        subjectId: body.subjectId,
        teacherId: user.id,
        dueDate: body.dueDate.trim(),
        maxScore: Number(body.maxScore) || 20,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.assignmentItem(asg.id), asg);
      await kvAddToIndex(kv, KV_KEYS.ASSIGNMENTS_INDEX, asg.id);
      await appendAuditLog(kv, user, 'تعریف تکلیف جدید', asg.title, `مهلت: ${asg.dueDate}`);
      return jsonResponse({ assignment: asg, message: 'تکلیف جدید با موفقیت ثبت شد.' }, 201);
    }

    if (path.match(/^\/api\/assignments\/[^/]+$/) && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const asg = await kvGetJson<Assignment>(kv, KV_KEYS.assignmentItem(id));
      if (!asg) return errorResponse('تکلیف یافت نشد.', 404);
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(asg.classId)) return errorResponse('دسترسی غیرمجاز', 403);
      }
      await kv.delete(KV_KEYS.assignmentItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.ASSIGNMENTS_INDEX, id);
      await appendAuditLog(kv, user, 'حذف تکلیف', asg.title, 'تکلیف از سامانه حذف شد');
      return jsonResponse({ ok: true, message: 'تکلیف حذف شد.' });
    }

    if (path.match(/^\/api\/assignments\/[^/]+\/submissions$/) && method === 'GET') {
      const assignmentId = path.split('/')[3];
      const asg = await kvGetJson<Assignment>(kv, KV_KEYS.assignmentItem(assignmentId));
      if (!asg) return errorResponse('تکلیف یافت نشد.', 404);

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(asg.classId)) return errorResponse('دسترسی غیرمجاز', 403);
      }

      const [allSubmissions, allUsers] = await Promise.all([
        kvGetCollection<AssignmentSubmission>(kv, KV_KEYS.SUBMISSIONS_INDEX, KV_KEYS.submissionItem),
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
      ]);

      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        if (asg.classId !== effStudent.classId) return errorResponse('دسترسی غیرمجاز', 403);
        const mine = allSubmissions.find((s) => s.assignmentId === assignmentId && s.studentId === effStudent.id) ?? null;
        return jsonResponse({ submissions: mine ? [mine] : [] });
      }

      const classStudents = allUsers.filter((u) => u.role === 'student' && u.classId === asg.classId);
      const asgSubs = allSubmissions.filter((s) => s.assignmentId === assignmentId);
      const rows = classStudents.map((stu) => {
        const sub = asgSubs.find((s) => s.studentId === stu.id);
        return {
          studentId: stu.id,
          studentName: stu.fullName,
          submission: sub ?? {
            id: '',
            assignmentId,
            studentId: stu.id,
            status: 'pending' as const,
          },
        };
      });

      return jsonResponse({ assignment: asg, rows });
    }

    if (path.match(/^\/api\/assignments\/[^/]+\/submit$/) && method === 'POST') {
      if (user.role !== 'student') return errorResponse('فقط دانش‌آموزان می‌توانند تکلیف ارسال کنند.', 403);
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const assignmentId = path.split('/')[3];
      const asg = await kvGetJson<Assignment>(kv, KV_KEYS.assignmentItem(assignmentId));
      if (!asg) return errorResponse('تکلیف یافت نشد.', 404);
      if (asg.classId !== effStudent.classId) return errorResponse('این تکلیف مربوط به کلاس شما نیست.', 403);

      const settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      if (settings && !settings.allowStudentAssignmentSubmission) {
        return errorResponse('در حال حاضر امکان ارسال تکلیف در تنظیمات مدرسه غیرفعال است.', 403);
      }

      const body = await readJsonBody<{
        submittedText: string;
        attachmentName?: string;
        attachmentUrl?: string;
      }>(req);
      if (!body.submittedText?.trim() && !body.attachmentUrl?.trim()) {
        return errorResponse('متن پاسخ تکلیف یا پیوست را وارد کنید.', 400);
      }

      const allSubmissions = await kvGetCollection<AssignmentSubmission>(
        kv,
        KV_KEYS.SUBMISSIONS_INDEX,
        KV_KEYS.submissionItem
      );
      let sub = allSubmissions.find((s) => s.assignmentId === assignmentId && s.studentId === effStudent.id);

      if (sub) {
        sub.submittedText = (body.submittedText ?? '').trim();
        sub.attachmentName = body.attachmentName?.trim() || undefined;
        sub.attachmentUrl = body.attachmentUrl?.trim() || undefined;
        sub.submittedAt = new Date().toISOString();
        sub.status = sub.status === 'graded' ? 'graded' : 'submitted';
        await kvPutJson(kv, KV_KEYS.submissionItem(sub.id), sub);
      } else {
        sub = {
          id: generateId('sbm'),
          assignmentId,
          studentId: effStudent.id,
          status: 'submitted',
          submittedText: (body.submittedText ?? '').trim(),
          attachmentName: body.attachmentName?.trim() || undefined,
          attachmentUrl: body.attachmentUrl?.trim() || undefined,
          submittedAt: new Date().toISOString(),
        };
        await kvPutJson(kv, KV_KEYS.submissionItem(sub.id), sub);
        await kvAddToIndex(kv, KV_KEYS.SUBMISSIONS_INDEX, sub.id);
      }

      return jsonResponse({ submission: sub, message: 'پاسخ تکلیف با موفقیت ارسال شد.' });
    }

    if (path.match(/^\/api\/submissions\/grade$/) && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<{
        assignmentId: string;
        studentId: string;
        score: number;
        feedback?: string;
      }>(req);

      const asg = await kvGetJson<Assignment>(kv, KV_KEYS.assignmentItem(body.assignmentId));
      if (!asg) return errorResponse('تکلیف یافت نشد.', 404);

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(asg.classId)) return errorResponse('دسترسی غیرمجاز', 403);
      }

      const allSubmissions = await kvGetCollection<AssignmentSubmission>(
        kv,
        KV_KEYS.SUBMISSIONS_INDEX,
        KV_KEYS.submissionItem
      );
      let sub = allSubmissions.find((s) => s.assignmentId === body.assignmentId && s.studentId === body.studentId);

      const score = Number(body.score);
      if (Number.isNaN(score) || score < 0 || score > asg.maxScore) {
        return errorResponse(`نمره باید بین ۰ تا ${asg.maxScore} باشد.`, 400);
      }

      if (!sub) {
        sub = {
          id: generateId('sbm'),
          assignmentId: body.assignmentId,
          studentId: body.studentId,
          status: 'graded',
          score,
          feedback: body.feedback?.trim(),
          gradedAt: new Date().toISOString(),
          gradedBy: user.id,
        };
        await kvPutJson(kv, KV_KEYS.submissionItem(sub.id), sub);
        await kvAddToIndex(kv, KV_KEYS.SUBMISSIONS_INDEX, sub.id);
      } else {
        sub.status = 'graded';
        sub.score = score;
        sub.feedback = body.feedback?.trim();
        sub.gradedAt = new Date().toISOString();
        sub.gradedBy = user.id;
        await kvPutJson(kv, KV_KEYS.submissionItem(sub.id), sub);
      }

      return jsonResponse({ submission: sub, message: 'نمره تکلیف ثبت شد.' });
    }

    // Weekly Schedule
    if (path === '/api/schedules' && method === 'GET') {
      const [slots, classes] = await Promise.all([
        kvGetCollection<ScheduleSlot>(kv, KV_KEYS.SCHEDULES_INDEX, KV_KEYS.scheduleItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      const classIdFilter = url.searchParams.get('classId');
      let scoped = slots;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        scoped = scoped.filter((s) => s.classId === effStudent.classId);
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        scoped = scoped.filter((s) => allowed.has(s.classId) || s.teacherId === user.id);
      }
      if (classIdFilter) scoped = scoped.filter((s) => s.classId === classIdFilter);

      return jsonResponse({ schedules: scoped.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period) });
    }

    if (path === '/api/schedules' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به ویرایش برنامه هفتگی است.', 403);
      const body = await readJsonBody<{
        classId: string;
        dayOfWeek: number;
        period: number;
        startTime: string;
        endTime: string;
        subjectId: string;
        teacherId: string;
        room?: string;
      }>(req);

      const slot: ScheduleSlot = {
        id: generateId('sch'),
        classId: body.classId,
        dayOfWeek: Number(body.dayOfWeek),
        period: Number(body.period),
        startTime: body.startTime,
        endTime: body.endTime,
        subjectId: body.subjectId,
        teacherId: body.teacherId,
        room: body.room?.trim(),
      };
      await kvPutJson(kv, KV_KEYS.scheduleItem(slot.id), slot);
      await kvAddToIndex(kv, KV_KEYS.SCHEDULES_INDEX, slot.id);
      await appendAuditLog(kv, user, 'ثبت زنگ برنامه هفتگی', `کلاس ${slot.classId}`, `روز ${slot.dayOfWeek} زنگ ${slot.period}`);
      return jsonResponse({ schedule: slot, message: 'زنگ درسی به برنامه هفتگی اضافه شد.' }, 201);
    }

    if (path.startsWith('/api/schedules/') && method === 'DELETE') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به حذف برنامه هفتگی است.', 403);
      const id = path.split('/')[3];
      await kv.delete(KV_KEYS.scheduleItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.SCHEDULES_INDEX, id);
      return jsonResponse({ ok: true, message: 'زنگ از برنامه هفتگی حذف شد.' });
    }

    // Announcements
    if (path === '/api/announcements' && method === 'GET') {
      const [announcements, classes] = await Promise.all([
        kvGetCollection<Announcement>(kv, KV_KEYS.ANNOUNCEMENTS_INDEX, KV_KEYS.announcementItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      let scoped = announcements;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        scoped = scoped.filter(
          (a) =>
            a.targetType === 'all' ||
            a.targetType === 'students' ||
            (a.targetType === 'class' && a.targetClassId === effStudent.classId)
        );
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        scoped = scoped.filter(
          (a) =>
            a.authorId === user.id ||
            a.targetType === 'all' ||
            a.targetType === 'teachers' ||
            (a.targetType === 'class' && a.targetClassId && allowed.has(a.targetClassId))
        );
      }

      return jsonResponse({ announcements: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (path === '/api/announcements' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دانش‌آموز و والدین مجاز به انتشار اطلاعیه نیستند.', 403);
      const body = await readJsonBody<{
        title: string;
        body: string;
        targetType: Announcement['targetType'];
        targetClassId?: string;
        priority: Announcement['priority'];
      }>(req);

      if (!body.title?.trim() || !body.body?.trim()) {
        return errorResponse('عنوان و متن اطلاعیه الزامی است.', 400);
      }

      if (user.role === 'teacher') {
        if (body.targetType !== 'class' || !body.targetClassId) {
          return errorResponse('معلم فقط مجاز به ارسال اطلاعیه برای کلاس‌های اختصاص‌یافته خود است.', 403);
        }
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(body.targetClassId)) {
          return errorResponse('شما به این کلاس دسترسی ندارید.', 403);
        }
      }

      const ann: Announcement = {
        id: generateId('ann'),
        title: body.title.trim(),
        body: body.body.trim(),
        authorId: user.id,
        authorName: user.fullName,
        authorRole: user.role,
        targetType: body.targetType,
        targetClassId: body.targetType === 'class' ? body.targetClassId : undefined,
        priority: body.priority || 'normal',
        createdAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.announcementItem(ann.id), ann);
      await kvAddToIndex(kv, KV_KEYS.ANNOUNCEMENTS_INDEX, ann.id);
      await appendAuditLog(kv, user, 'انتشار اطلاعیه', ann.title, `مخاطب: ${ann.targetType}`);
      return jsonResponse({ announcement: ann, message: 'اطلاعیه با موفقیت منتشر شد.' }, 201);
    }

    if (path.startsWith('/api/announcements/') && method === 'DELETE') {
      const id = path.split('/')[3];
      const ann = await kvGetJson<Announcement>(kv, KV_KEYS.announcementItem(id));
      if (!ann) return errorResponse('اطلاعیه یافت نشد.', 404);
      if (user.role !== 'admin' && ann.authorId !== user.id) {
        return errorResponse('شما مجاز به حذف این اطلاعیه نیستید.', 403);
      }
      await kv.delete(KV_KEYS.announcementItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.ANNOUNCEMENTS_INDEX, id);
      return jsonResponse({ ok: true, message: 'اطلاعیه حذف شد.' });
    }

    // Direct Messages & Notifications
    if (path === '/api/messages' && method === 'GET') {
      const all = await kvGetCollection<DirectMessage>(kv, KV_KEYS.MESSAGES_INDEX, KV_KEYS.messageItem);
      const scoped = all
        .filter(
          (m) =>
            m.recipientId === user.id ||
            m.recipientId === 'all' ||
            m.senderId === user.id ||
            user.role === 'admin'
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return jsonResponse({ messages: scoped });
    }

    if (path === '/api/messages' && method === 'POST') {
      const body = await readJsonBody<{ recipientId: string; subject: string; body: string }>(req);
      if (!body.recipientId || !body.subject?.trim() || !body.body?.trim()) {
        return errorResponse('گیرنده، موضوع و متن پیام الزامی است.', 400);
      }
      if (body.recipientId === 'all' && user.role !== 'admin') {
        return errorResponse('فقط مدیر یا معاون مجاز به ارسال پیام همگانی است.', 403);
      }
      const msg: DirectMessage = {
        id: generateId('msg'),
        senderId: user.id,
        senderName: user.fullName,
        senderRole: user.role,
        recipientId: body.recipientId,
        subject: body.subject.trim(),
        body: body.body.trim(),
        readBy: [user.id],
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.messageItem(msg.id), msg);
      await kvAddToIndex(kv, KV_KEYS.MESSAGES_INDEX, msg.id);
      return jsonResponse({ message: msg, notification: 'پیام با موفقیت ارسال شد.' }, 201);
    }

    if (path.match(/^\/api\/messages\/[^/]+\/read$/) && method === 'POST') {
      const id = path.split('/')[3];
      const msg = await kvGetJson<DirectMessage>(kv, KV_KEYS.messageItem(id));
      if (!msg) return errorResponse('پیام یافت نشد.', 404);
      if (!msg.readBy.includes(user.id)) {
        msg.readBy.push(user.id);
        await kvPutJson(kv, KV_KEYS.messageItem(msg.id), msg);
      }
      return jsonResponse({ message: msg });
    }

    // Real-Time User-to-User Chat Contacts, Threads & Messages
    if (path === '/api/chat/contacts' && method === 'GET') {
      const [allUsers, allClasses] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);
      const classMap = new Map(allClasses.map((c) => [c.id, c.name]));
      const onlineSet = new Set(getOnlineUserIds());
      const roleOrder: Record<UserRole, number> = { admin: 0, teacher: 1, student: 2 };

      const contacts: ChatContact[] = allUsers
        .filter((u) => u.active && u.id !== user.id)
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          role: u.role,
          avatarUrl: u.avatarUrl,
          gradeLevel: u.gradeLevel,
          className: u.classId ? classMap.get(u.classId) : undefined,
          online: onlineSet.has(u.id),
        }))
        .sort((a, b) => {
          if (Boolean(b.online) !== Boolean(a.online)) return b.online ? 1 : -1;
          if (roleOrder[a.role] !== roleOrder[b.role]) return roleOrder[a.role] - roleOrder[b.role];
          return a.fullName.localeCompare(b.fullName, 'fa');
        });

      return jsonResponse({ contacts });
    }

    if (path === '/api/chat/threads' && method === 'GET') {
      const [peerIds, allClasses] = await Promise.all([
        kvGetIndex(kv, KV_KEYS.chatUserThreads(user.id)),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);
      const classMap = new Map(allClasses.map((c) => [c.id, c.name]));

      const summaries: ChatThreadSummary[] = [];
      for (const peerId of peerIds) {
        if (!peerId || peerId === user.id) continue;
        const peerUser = await kvGetJson<StoredUser>(kv, KV_KEYS.user(peerId));
        if (!peerUser || !peerUser.active) continue;
        const threadId = getChatThreadId(user.id, peerId);
        const threadMsgs = await getThreadMessages(kv, user.id, peerId);
        if (threadMsgs.length === 0) continue;
        const lastMessage = threadMsgs[threadMsgs.length - 1] ?? null;
        const unreadCount = threadMsgs.filter(
          (m) => m.recipientId === user.id && !m.readBy.includes(user.id)
        ).length;

        summaries.push({
          threadId,
          peer: {
            id: peerUser.id,
            fullName: peerUser.fullName,
            username: peerUser.username,
            role: peerUser.role,
            avatarUrl: peerUser.avatarUrl,
            gradeLevel: peerUser.gradeLevel,
            className: peerUser.classId ? classMap.get(peerUser.classId) : undefined,
            online: isUserOnline(peerUser.id),
          },
          lastMessage,
          unreadCount,
          updatedAt: lastMessage?.createdAt ?? peerUser.createdAt,
        });
      }

      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return jsonResponse({ threads: summaries });
    }

    if (path.match(/^\/api\/chat\/threads\/[^/]+\/messages$/) && method === 'GET') {
      const peerId = decodeURIComponent(path.split('/')[4]);
      const peer = await kvGetJson<StoredUser>(kv, KV_KEYS.user(peerId));
      if (!peer) return errorResponse('کاربر مورد نظر یافت نشد.', 404);
      const msgs = await getThreadMessages(kv, user.id, peerId);
      return jsonResponse({ messages: msgs });
    }

    if (path.match(/^\/api\/chat\/threads\/[^/]+\/read$/) && method === 'POST') {
      const peerId = decodeURIComponent(path.split('/')[4]);
      const changed = await markChatThreadReadAndBroadcast(kv, user.id, peerId);
      return jsonResponse({ ok: true, markedCount: changed });
    }

    if (path === '/api/chat/messages' && method === 'POST') {
      const body = await readJsonBody<{ recipientId: string; body: string; clientTempId?: string }>(req);
      try {
        const msg = await persistAndBroadcastChatMessage(
          kv,
          user,
          body.recipientId,
          body.body ?? '',
          body.clientTempId
        );
        return jsonResponse({ chatMessage: msg, message: msg }, 201);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'خطا در ارسال پیام چت.', 400);
      }
    }

    // Online Exams, AI Exam Generator, Question Bank, Multi-version, Grading & Quality Analytics
    if (path === '/api/exams' && method === 'GET') {
      const [exams, attempts, classes] = await Promise.all([
        kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
        kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      const effStudent = user.role === 'student'
        ? await resolveEffectiveStudentUser(kv, user)
        : null;

      let scoped = exams;
      if (effStudent) {
        scoped = scoped.filter((e) => e.active && (!effStudent.classId || e.classId === effStudent.classId));
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        scoped = scoped.filter((e) => allowed.has(e.classId) || e.teacherId === user.id);
      }

      const enriched = scoped
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => {
          const examAttempts = attempts.filter((a) => a.examId === e.id);
          if (effStudent) {
            const mine = examAttempts.find((a) => a.studentId === effStudent.id) ?? null;
            return {
              ...e,
              questions: mine
                ? e.questions
                : e.questions.map(({ correctIndex: _c, correctText: _ct, ...rest }) => rest),
              myAttempt: mine,
            };
          }
          return {
            ...e,
            attemptsCount: examAttempts.length,
            averageScore: avg(examAttempts.map((a) => a.score)),
            pendingManualCount: examAttempts.filter((a) => a.needsManualGrading).length,
          };
        });

      return jsonResponse({ exams: enriched });
    }

    if (path === '/api/exams' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دانش‌آموز و والدین مجاز به تعریف آزمون نیستند.', 403);
      const body = await readJsonBody<{
        title: string;
        description?: string;
        classId: string;
        subjectId: string;
        gradeLevel?: string;
        chapter?: string;
        topic?: string;
        difficulty?: ExamDifficulty;
        versionGroupId?: string;
        versionLabel?: string;
        generatedByAI?: boolean;
        durationMinutes: number;
        dueDate: string;
        questions: Array<{
          type?: ExamQuestionType;
          prompt: string;
          options?: string[];
          correctIndex?: number;
          correctText?: string;
          points?: number;
          chapter?: string;
          topic?: string;
          difficulty?: ExamDifficulty;
          explanation?: string;
        }>;
      }>(req);

      if (!body.title?.trim() || !body.classId || !body.subjectId || !Array.isArray(body.questions) || body.questions.length === 0) {
        return errorResponse('عنوان، کلاس، درس و حداقل یک سؤال برای آزمون الزامی است.', 400);
      }

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(body.classId)) {
          return errorResponse('شما فقط مجاز به تعریف آزمون برای کلاس‌های اختصاص‌یافته به خود هستید.', 403);
        }
      }

      const normalizedQuestions: ExamQuestion[] = body.questions.map((q) => {
        const qType: ExamQuestionType = q.type || 'mcq';
        let opts = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
        let correctIdx = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        if (qType === 'true_false') {
          opts = ['صحیح', 'غلط'];
          correctIdx = correctIdx === 1 ? 1 : 0;
        } else if (qType === 'descriptive' || qType === 'fill_blank') {
          opts = [];
          correctIdx = -1;
        }
        return {
          id: generateId('q'),
          type: qType,
          prompt: q.prompt.trim(),
          options: opts,
          correctIndex: correctIdx,
          correctText: q.correctText?.trim() || undefined,
          points: Number(q.points) || 1,
          chapter: q.chapter?.trim() || body.chapter?.trim() || undefined,
          topic: q.topic?.trim() || body.topic?.trim() || undefined,
          difficulty: q.difficulty || body.difficulty,
          explanation: q.explanation?.trim() || undefined,
        };
      });

      const exam: OnlineExam = {
        id: generateId('exm'),
        title: body.title.trim(),
        description: (body.description ?? '').trim(),
        classId: body.classId,
        subjectId: body.subjectId,
        teacherId: user.id,
        gradeLevel: body.gradeLevel?.trim() || undefined,
        chapter: body.chapter?.trim() || undefined,
        topic: body.topic?.trim() || undefined,
        difficulty: body.difficulty,
        versionGroupId: body.versionGroupId,
        versionLabel: body.versionLabel,
        generatedByAI: Boolean(body.generatedByAI),
        durationMinutes: Math.max(5, Number(body.durationMinutes) || 20),
        dueDate: (body.dueDate ?? '').trim() || new Date().toLocaleDateString('fa-IR'),
        active: true,
        questions: normalizedQuestions,
        createdAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.examItem(exam.id), exam);
      await kvAddToIndex(kv, KV_KEYS.EXAMS_INDEX, exam.id);
      await appendAuditLog(kv, user, 'ایجاد آزمون آنلاین', exam.title, `تعداد سؤال: ${exam.questions.length}`);
      return jsonResponse({ exam, message: 'آزمون آنلاین با موفقیت ایجاد و منتشر شد.' }, 201);
    }

    if (path === '/api/exams/ai-generate' && method === 'POST') {
      if (user.role === 'student') return errorResponse('فقط دبیر، معاون یا مدیر مجاز به تولید آزمون با هوش مصنوعی است.', 403);
      const body = await readJsonBody<{
        gradeLevel?: string;
        subjectId?: string;
        subjectName?: string;
        chapter?: string;
        topic?: string;
        difficulty?: ExamDifficulty;
        count?: number;
        questionTypes?: ExamQuestionType[];
      }>(req);

      const subjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
      const subObj = body.subjectId ? subjects.find((s) => s.id === body.subjectId) : undefined;
      const subjectName = (body.subjectName || subObj?.name || 'ریاضی').trim();

      try {
        const questions = await generateAIExamQuestions({
          aiServerUrl: env.AI_SERVER_URL,
          kv,
          gradeLevel: (body.gradeLevel || subObj?.gradeLevel || 'هفتم').trim(),
          subjectName,
          subjectId: body.subjectId,
          chapter: (body.chapter || '').trim(),
          topic: (body.topic || '').trim(),
          difficulty: body.difficulty || 'medium',
          count: Number(body.count) || 5,
          questionTypes: Array.isArray(body.questionTypes) && body.questionTypes.length > 0 ? body.questionTypes : ['mcq'],
        });
        return jsonResponse({ questions, message: `${questions.length} سؤال با هوش مصنوعی طراحی شد.` });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'خطا در تولید سؤال با هوش مصنوعی', 502);
      }
    }

    if (path.match(/^\/api\/exams\/[^/]+\/clone-versions$/) && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const examId = path.split('/')[3];
      const sourceExam = await kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(examId));
      if (!sourceExam) return errorResponse('آزمون یافت نشد.', 404);
      if (user.role === 'teacher' && sourceExam.teacherId !== user.id) {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(sourceExam.classId)) return errorResponse('دسترسی غیرمجاز', 403);
      }

      const body = await readJsonBody<{ labels?: string[] }>(req);
      const labels = Array.isArray(body.labels) && body.labels.length > 0 ? body.labels.slice(0, 5) : ['نسخه B', 'نسخه C'];
      const clones = cloneExamVersions(sourceExam, labels, user.id);

      for (const cloned of clones) {
        await kvPutJson(kv, KV_KEYS.examItem(cloned.id), cloned);
        await kvAddToIndex(kv, KV_KEYS.EXAMS_INDEX, cloned.id);
      }
      await appendAuditLog(kv, user, 'ساخت نسخه‌های متفاوت آزمون', sourceExam.title, `تعداد نسخه: ${clones.length}`);
      return jsonResponse({ exams: clones, message: `${clones.length} نسخه متفاوت با ترتیب تصادفی سؤالات و گزینه‌ها ساخته شد.` }, 201);
    }

    if (path.match(/^\/api\/exams\/[^/]+\/attempts$/) && method === 'GET') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const examId = path.split('/')[3];
      const exam = await kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(examId));
      if (!exam) return errorResponse('آزمون یافت نشد.', 404);

      const [allAttempts, allUsers] = await Promise.all([
        kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
      ]);
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const attempts = allAttempts
        .filter((a) => a.examId === examId)
        .map((a) => ({
          ...a,
          studentName: a.studentName || userMap.get(a.studentId)?.fullName || 'دانش‌آموز',
        }))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      return jsonResponse({ exam, attempts });
    }

    if (path.match(/^\/api\/exams\/[^/]+\/attempts\/[^/]+\/grade$/) && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const parts = path.split('/');
      const examId = parts[3];
      const attemptId = parts[5];
      const [exam, attempt] = await Promise.all([
        kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(examId)),
        kvGetJson<ExamAttempt>(kv, KV_KEYS.examAttemptItem(attemptId)),
      ]);
      if (!exam || !attempt || attempt.examId !== examId) {
        return errorResponse('آزمون یا برگه پاسخ یافت نشد.', 404);
      }

      const body = await readJsonBody<{
        scores: Array<{ questionId: string; finalScore: number; teacherComment?: string }>;
      }>(req);

      const existingDetails =
        attempt.questionScores && attempt.questionScores.length > 0
          ? attempt.questionScores
          : gradeExamSubmission(exam, attempt.answers).questionScores;

      const scoreMap = new Map((body.scores ?? []).map((s) => [s.questionId, s]));
      const updatedDetails = existingDetails.map((det) => {
        const upd = scoreMap.get(det.questionId);
        if (!upd) return det;
        const clamped = Math.min(det.maxPoints, Math.max(0, Number(upd.finalScore) || 0));
        return {
          ...det,
          manualScore: clamped,
          finalScore: clamped,
          needsReview: false,
          isCorrect: clamped >= det.maxPoints * 0.6,
          teacherComment: upd.teacherComment?.trim() || det.teacherComment,
        };
      });

      attempt.questionScores = updatedDetails;
      attempt.score = Number(updatedDetails.reduce((s, d) => s + d.finalScore, 0).toFixed(2));
      attempt.needsManualGrading = updatedDetails.some((d) => d.needsReview);
      attempt.gradedBy = user.id;
      attempt.gradedAt = new Date().toISOString();

      await kvPutJson(kv, KV_KEYS.examAttemptItem(attempt.id), attempt);
      await appendAuditLog(kv, user, 'تأیید نمره تشریحی آزمون', exam.title, `برگه ${attempt.studentName || attempt.studentId} · نمره ${attempt.score}/${attempt.maxScore}`);
      return jsonResponse({ attempt, message: 'نمره‌دهی سؤالات تشریحی ثبت و تأیید شد.' });
    }

    if (path.match(/^\/api\/exams\/[^/]+\/analytics$/) && method === 'GET') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const examId = path.split('/')[3];
      const exam = await kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(examId));
      if (!exam) return errorResponse('آزمون یافت نشد.', 404);
      const allAttempts = await kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem);
      const examAttempts = allAttempts.filter((a) => a.examId === examId);
      const analytics = analyzeExamQuality(exam, examAttempts);
      return jsonResponse({ analytics });
    }

    if (path.match(/^\/api\/exams\/[^/]+$/) && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const exam = await kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(id));
      if (!exam) return errorResponse('آزمون یافت نشد.', 404);
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!allowed.has(exam.classId) && exam.teacherId !== user.id) {
          return errorResponse('دسترسی غیرمجاز', 403);
        }
      }
      await kv.delete(KV_KEYS.examItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.EXAMS_INDEX, id);
      return jsonResponse({ ok: true, message: 'آزمون حذف شد.' });
    }

    if (path.match(/^\/api\/exams\/[^/]+\/submit$/) && method === 'POST') {
      if (user.role !== 'student') return errorResponse('فقط دانش‌آموزان مجاز به شرکت در آزمون هستند.', 403);
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const examId = path.split('/')[3];
      const exam = await kvGetJson<OnlineExam>(kv, KV_KEYS.examItem(examId));
      if (!exam || !exam.active) return errorResponse('آزمون فعال یافت نشد.', 404);

      const allAttempts = await kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem);
      const already = allAttempts.find((a) => a.examId === examId && a.studentId === effStudent.id);
      if (already) return errorResponse('شما قبلاً در این آزمون شرکت کرده‌اید.', 409);

      const body = await readJsonBody<{ answers: Array<number | string>; startedAt?: string }>(req);
      const answers = Array.isArray(body.answers) ? body.answers : [];

      const graded = gradeExamSubmission(exam, answers);

      const attempt: ExamAttempt = {
        id: generateId('exa'),
        examId,
        studentId: effStudent.id,
        studentName: effStudent.fullName,
        answers,
        questionScores: graded.questionScores,
        needsManualGrading: graded.needsManualGrading,
        score: graded.score,
        maxScore: graded.maxScore,
        startedAt: body.startedAt || new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      };

      await kvPutJson(kv, KV_KEYS.examAttemptItem(attempt.id), attempt);
      await kvAddToIndex(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, attempt.id);

      // Log objective mistakes for Private Tutor weak-topic / mistake tracking
      const subjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
      const subName = subjects.find((s) => s.id === exam.subjectId)?.name;
      for (let i = 0; i < exam.questions.length; i++) {
        const q = exam.questions[i];
        const det = graded.questionScores[i];
        if (det && !det.needsReview && det.isCorrect === false) {
          await recordStudentMistake(kv, {
            studentId: effStudent.id,
            subjectId: exam.subjectId,
            subjectName: subName,
            topic: q.topic || exam.topic || exam.title,
            mistakeType: 'پاسخ نادرست در آزمون آنلاین',
            questionPrompt: q.prompt,
            studentAnswer: typeof answers[i] === 'number' ? q.options[Number(answers[i])] || String(answers[i]) : String(answers[i] ?? ''),
            expectedAnswer: q.correctText || (q.correctIndex >= 0 ? q.options[q.correctIndex] : ''),
            severity: 'medium',
          });
        }
      }

      // Award coins in DB when completing an exam
      effStudent.coins = (effStudent.coins ?? 0) + 15;
      await kvPutJson(kv, KV_KEYS.user(effStudent.id), effStudent);

      await appendAuditLog(kv, user, 'ثبت پاسخ آزمون آنلاین', exam.title, `نمره: ${graded.score}/${graded.maxScore}`);
      return jsonResponse({
        attempt,
        coins: effStudent.coins,
        message: graded.needsManualGrading
          ? `آزمون ثبت شد. نمره تستی شما: ${graded.score} از ${graded.maxScore} (بخش تشریحی پس از تأیید دبیر اضافه می‌شود)`
          : `آزمون با موفقیت ثبت شد. نمره شما: ${graded.score} از ${graded.maxScore}`,
      });
    }

    if (path === '/api/exam-attempts' && method === 'GET') {
      const [attempts, exams, classes] = await Promise.all([
        kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
        kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        return jsonResponse({ attempts: attempts.filter((a) => a.studentId === effStudent.id) });
      }
      if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        const allowedExamIds = new Set(exams.filter((e) => allowed.has(e.classId) || e.teacherId === user.id).map((e) => e.id));
        return jsonResponse({ attempts: attempts.filter((a) => allowedExamIds.has(a.examId)) });
      }
      return jsonResponse({ attempts });
    }

    // Personal Teacher Question Bank
    if (path === '/api/question-bank' && method === 'GET') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const bank = await kvGetCollection<TeacherBankQuestion>(
        kv,
        KV_KEYS.QUESTION_BANK_INDEX,
        KV_KEYS.questionBankItem
      );
      const mineOnly = url.searchParams.get('mineOnly') === '1' || user.role === 'teacher';
      const scoped = mineOnly ? bank.filter((q) => q.teacherId === user.id) : bank;
      return jsonResponse({ questions: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (path === '/api/question-bank' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<{
        subjectId: string;
        gradeLevel?: string;
        chapter?: string;
        topic?: string;
        difficulty?: ExamDifficulty;
        type?: ExamQuestionType;
        prompt: string;
        options?: string[];
        correctIndex?: number;
        correctText?: string;
        points?: number;
        explanation?: string;
      }>(req);

      if (!body.prompt?.trim() || !body.subjectId) {
        return errorResponse('صورت سؤال و درس الزامی است.', 400);
      }

      const qType: ExamQuestionType = body.type || 'mcq';
      const item: TeacherBankQuestion = {
        id: generateId('qbq'),
        teacherId: user.id,
        teacherName: user.fullName,
        subjectId: body.subjectId,
        gradeLevel: (body.gradeLevel || 'هفتم').trim(),
        chapter: body.chapter?.trim() || undefined,
        topic: body.topic?.trim() || undefined,
        difficulty: body.difficulty || 'medium',
        type: qType,
        prompt: body.prompt.trim(),
        options:
          qType === 'true_false'
            ? ['صحیح', 'غلط']
            : qType === 'mcq'
            ? (body.options ?? []).map((o) => o.trim())
            : [],
        correctIndex: qType === 'mcq' || qType === 'true_false' ? Number(body.correctIndex) || 0 : -1,
        correctText: body.correctText?.trim() || undefined,
        points: Math.max(0.5, Number(body.points) || 2),
        explanation: body.explanation?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.questionBankItem(item.id), item);
      await kvAddToIndex(kv, KV_KEYS.QUESTION_BANK_INDEX, item.id);
      return jsonResponse({ question: item, message: 'سؤال در بانک سؤال اختصاصی شما ذخیره شد.' }, 201);
    }

    if (path.startsWith('/api/question-bank/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const item = await kvGetJson<TeacherBankQuestion>(kv, KV_KEYS.questionBankItem(id));
      if (!item) return errorResponse('سؤال یافت نشد.', 404);
      if (item.teacherId !== user.id && user.role !== 'admin') {
        return errorResponse('شما فقط مجاز به حذف سؤالات بانک اختصاصی خود هستید.', 403);
      }
      await kv.delete(KV_KEYS.questionBankItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.QUESTION_BANK_INDEX, id);
      return jsonResponse({ ok: true, message: 'سؤال از بانک سؤال حذف شد.' });
    }

    // Study Planner (Student & Admin)
    if (path === '/api/study-plans' && method === 'GET') {
      const plans = await kvGetCollection<StudyPlanTask>(kv, KV_KEYS.STUDY_PLANS_INDEX, KV_KEYS.studyPlanItem);
      const scopeAll = url.searchParams.get('scope') === 'all';
      const scoped =
        user.role === 'admin' && scopeAll
          ? plans
          : plans.filter((p) => p.studentId === user.id);
      return jsonResponse({ plans: scoped.sort((a, b) => a.targetDate.localeCompare(b.targetDate)) });
    }

    if (path === '/api/study-plans' && method === 'POST') {
      const body = await readJsonBody<{
        title: string;
        subjectId?: string;
        targetDate: string;
        durationMinutes: number;
        notes?: string;
        category?: StudyPlanTask['category'];
        aiGenerated?: boolean;
      }>(req);
      if (!body.title?.trim() || !body.targetDate?.trim()) {
        return errorResponse('عنوان هدف مطالعه و تاریخ الزامی است.', 400);
      }
      const task: StudyPlanTask = {
        id: generateId('stp'),
        studentId: user.id,
        title: body.title.trim(),
        subjectId: body.subjectId || undefined,
        targetDate: body.targetDate.trim(),
        durationMinutes: Math.max(10, Number(body.durationMinutes) || 45),
        completed: false,
        notes: body.notes?.trim(),
        category: body.category || (user.role === 'admin' ? 'administrative' : 'study'),
        aiGenerated: Boolean(body.aiGenerated),
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.studyPlanItem(task.id), task);
      await kvAddToIndex(kv, KV_KEYS.STUDY_PLANS_INDEX, task.id);
      return jsonResponse({ plan: task, message: 'برنامه در پایگاه داده ذخیره شد.' }, 201);
    }

    if (path.startsWith('/api/study-plans/') && method === 'PATCH') {
      const id = path.split('/')[3];
      const task = await kvGetJson<StudyPlanTask>(kv, KV_KEYS.studyPlanItem(id));
      if (!task) return errorResponse('مورد یافت نشد.', 404);
      if (task.studentId !== user.id && user.role !== 'admin') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<Partial<StudyPlanTask>>(req);
      if (body.completed !== undefined) task.completed = Boolean(body.completed);
      if (body.title !== undefined) task.title = body.title.trim();
      if (body.durationMinutes !== undefined) task.durationMinutes = Number(body.durationMinutes) || task.durationMinutes;
      if (body.notes !== undefined) task.notes = body.notes.trim();
      await kvPutJson(kv, KV_KEYS.studyPlanItem(task.id), task);
      return jsonResponse({ plan: task, message: 'وضعیت برنامه به‌روزرسانی شد.' });
    }

    if (path.startsWith('/api/study-plans/') && method === 'DELETE') {
      const id = path.split('/')[3];
      const task = await kvGetJson<StudyPlanTask>(kv, KV_KEYS.studyPlanItem(id));
      if (!task) return errorResponse('مورد یافت نشد.', 404);
      if (task.studentId !== user.id && user.role !== 'admin') return errorResponse('دسترسی غیرمجاز', 403);
      await kv.delete(KV_KEYS.studyPlanItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.STUDY_PLANS_INDEX, id);
      return jsonResponse({ ok: true, message: 'مورد از برنامه حذف شد.' });
    }

    // AI Smart Planner (Student/Parent + Admin/Deputy)
    if (path === '/api/smart-planner/generate' && method === 'POST') {
      if (user.role !== 'student' && user.role !== 'admin') {
        return errorResponse('برنامه‌ریز هوشمند در پنل دانش‌آموزان، والدین، معاونین و مدیران فعال است.', 403);
      }
      const body = await readJsonBody<{
        focusGoal?: string;
        daysCount?: number;
        dailyMinutes?: number;
      }>(req);
      try {
        const result = await generateSmartPlannerTasksWithAI({
          aiServerUrl: env.AI_SERVER_URL,
          kv,
          user,
          focusGoal: body.focusGoal?.trim(),
          daysCount: Number(body.daysCount) || 5,
          dailyMinutes: Number(body.dailyMinutes) || 90,
        });
        return jsonResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'خطا در تولید برنامه هوشمند', 502);
      }
    }

    // Calendar Events
    if (path === '/api/calendar-events' && method === 'GET') {
      const events = await kvGetCollection<CalendarEvent>(kv, KV_KEYS.CALENDAR_EVENTS_INDEX, KV_KEYS.calendarEventItem);
      const effStudent = user.role === 'student' ? await resolveEffectiveStudentUser(kv, user) : null;
      const scoped = effStudent
        ? events.filter((e) => !e.classId || e.classId === effStudent.classId)
        : events;
      return jsonResponse({ events: scoped.sort((a, b) => a.date.localeCompare(b.date)) });
    }

    if (path === '/api/calendar-events' && method === 'POST') {
      if (user.role === 'student') return errorResponse('فقط معلم، معاون یا مدیر مجاز به ثبت رویداد در تقویم است.', 403);
      const body = await readJsonBody<{
        title: string;
        description?: string;
        date: string;
        time?: string;
        type: CalendarEvent['type'];
        classId?: string;
      }>(req);
      if (!body.title?.trim() || !body.date?.trim()) {
        return errorResponse('عنوان و تاریخ رویداد الزامی است.', 400);
      }
      const ev: CalendarEvent = {
        id: generateId('cal'),
        title: body.title.trim(),
        description: body.description?.trim(),
        date: body.date.trim(),
        time: body.time?.trim(),
        type: body.type || 'meeting',
        classId: body.classId || undefined,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.calendarEventItem(ev.id), ev);
      await kvAddToIndex(kv, KV_KEYS.CALENDAR_EVENTS_INDEX, ev.id);
      return jsonResponse({ event: ev, message: 'رویداد به تقویم آموزشی اضافه شد.' }, 201);
    }

    if (path.startsWith('/api/calendar-events/') && method === 'DELETE') {
      const id = path.split('/')[3];
      const ev = await kvGetJson<CalendarEvent>(kv, KV_KEYS.calendarEventItem(id));
      if (!ev) return errorResponse('رویداد یافت نشد.', 404);
      if (user.role !== 'admin' && ev.createdBy !== user.id) return errorResponse('دسترسی غیرمجاز', 403);
      await kv.delete(KV_KEYS.calendarEventItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.CALENDAR_EVENTS_INDEX, id);
      return jsonResponse({ ok: true, message: 'رویداد از تقویم حذف شد.' });
    }

    // Advanced Printable Report Card (per student + batch class print)
    if (path === '/api/reports/card' && method === 'GET') {
      const requestedStudentId = (url.searchParams.get('studentId') || '').trim();
      const requestedClassId = (url.searchParams.get('classId') || '').trim();
      const rawTerm = (url.searchParams.get('term') || 'all').trim();
      const termFilter: 'all' | GradeRecord['term'] = VALID_GRADE_TERMS.includes(rawTerm as GradeRecord['term'])
        ? (rawTerm as GradeRecord['term'])
        : 'all';

      const [rawUsers, tombstones, classes, subjects, grades, attendance, schedules] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        getDeletedUserTombstones(kv),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
        kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
        kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
        kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
        kvGetCollection<ScheduleSlot>(kv, KV_KEYS.SCHEDULES_INDEX, KV_KEYS.scheduleItem),
      ]);
      const users = rawUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      );
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();

      let targetStudent: StoredUser | undefined;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        if (requestedStudentId && requestedStudentId !== effStudent.id && requestedStudentId !== user.id) {
          return errorResponse('شما فقط مجاز به مشاهده کارنامه تحصیلی خود هستید.', 403);
        }
        targetStudent = effStudent;
      } else {
        if (requestedStudentId) {
          targetStudent = users.find((u) => u.id === requestedStudentId && u.role === 'student');
        } else if (requestedClassId) {
          targetStudent = users.find((u) => u.role === 'student' && u.classId === requestedClassId);
        } else {
          targetStudent = users.find((u) => u.role === 'student');
        }
        if (!targetStudent) {
          return errorResponse('دانش‌آموزی برای صدور کارنامه یافت نشد.', 404);
        }
      }

      const resolvedClassId = requestedClassId && user.role !== 'student'
        ? requestedClassId
        : (targetStudent.classId || '');
      const targetClass = classes.find((c) => c.id === resolvedClassId)
        ?? (targetStudent.classId ? classes.find((c) => c.id === targetStudent.classId) : undefined)
        ?? null;

      if (user.role === 'teacher') {
        const allowedClasses = getTeacherAllowedClassIds(user, classes);
        const stuClassId = targetClass?.id ?? targetStudent.classId ?? '';
        if (!stuClassId || !allowedClasses.has(stuClassId)) {
          return errorResponse('شما فقط مجاز به مشاهده کارنامه دانش‌آموزان کلاس‌های اختصاص‌یافته به خود هستید.', 403);
        }
      }

      const reportCard = buildAdvancedReportCard({
        targetStudent,
        targetClass,
        allUsers: users,
        allSubjects: subjects,
        allGrades: grades,
        allAttendance: attendance,
        allSchedules: schedules,
        settings,
        termFilter,
      });

      return jsonResponse({ reportCard });
    }

    if (path === '/api/reports/class-cards' && method === 'GET') {
      if (user.role === 'student') {
        return errorResponse('دسترسی غیرمجاز', 403);
      }
      const classId = (url.searchParams.get('classId') || '').trim();
      const rawTerm = (url.searchParams.get('term') || 'all').trim();
      const termFilter: 'all' | GradeRecord['term'] = VALID_GRADE_TERMS.includes(rawTerm as GradeRecord['term'])
        ? (rawTerm as GradeRecord['term'])
        : 'all';

      const [rawUsers, tombstones, classes, subjects, grades, attendance, schedules] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        getDeletedUserTombstones(kv),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
        kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
        kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
        kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
        kvGetCollection<ScheduleSlot>(kv, KV_KEYS.SCHEDULES_INDEX, KV_KEYS.scheduleItem),
      ]);
      const users = rawUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      );
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();

      const targetClass = classes.find((c) => c.id === classId);
      if (!targetClass) {
        return errorResponse('کلاس مورد نظر یافت نشد.', 404);
      }
      if (user.role === 'teacher') {
        const allowedClasses = getTeacherAllowedClassIds(user, classes);
        if (!allowedClasses.has(targetClass.id)) {
          return errorResponse('شما مجاز به مشاهده کارنامه‌های این کلاس نیستید.', 403);
        }
      }

      const classStudents = users
        .filter((u) => u.role === 'student' && u.classId === targetClass.id)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'));

      const reportCards = classStudents.map((stu) =>
        buildAdvancedReportCard({
          targetStudent: stu,
          targetClass,
          allUsers: users,
          allSubjects: subjects,
          allGrades: grades,
          allAttendance: attendance,
          allSchedules: schedules,
          settings,
          termFilter,
        })
      );

      return jsonResponse({ reportCards, classInfo: targetClass });
    }

    // Scoped Reports & Dashboard Metrics (100% real computed data)
    if (path === '/api/reports/overview' && method === 'GET') {
      if (user.role === 'admin' && auth.session.remoteToken) {
        const existingIndex = await kvGetIndex(kv, KV_KEYS.USERS_INDEX);
        if (existingIndex.length <= 1) {
          await syncDirectoryFromRemote(kv, env.AUTH_SERVER_URL, auth.session.remoteToken).catch(() => {});
        }
      }
      const [
        rawUsers,
        tombstones,
        classes,
        subjects,
        grades,
        attendance,
        assignments,
        submissions,
        announcements,
        exams,
        examAttempts,
        profileRequests,
        auditLogs,
        studyPlans,
        calendarEvents,
        histories,
        directMessages,
      ] = await Promise.all([
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        getDeletedUserTombstones(kv),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
        kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
        kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
        kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
        kvGetCollection<Assignment>(kv, KV_KEYS.ASSIGNMENTS_INDEX, KV_KEYS.assignmentItem),
        kvGetCollection<AssignmentSubmission>(kv, KV_KEYS.SUBMISSIONS_INDEX, KV_KEYS.submissionItem),
        kvGetCollection<Announcement>(kv, KV_KEYS.ANNOUNCEMENTS_INDEX, KV_KEYS.announcementItem),
        kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
        kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
        kvGetCollection<ProfileChangeRequest>(kv, KV_KEYS.PROFILE_REQUESTS_INDEX, KV_KEYS.profileRequestItem),
        kvGetJson<AuditLog[]>(kv, KV_KEYS.AUDIT_LOGS),
        kvGetCollection<StudyPlanTask>(kv, KV_KEYS.STUDY_PLANS_INDEX, KV_KEYS.studyPlanItem),
        kvGetCollection<CalendarEvent>(kv, KV_KEYS.CALENDAR_EVENTS_INDEX, KV_KEYS.calendarEventItem),
        kvGetCollection<AcademicHistoryRecord>(kv, KV_KEYS.HISTORY_INDEX, KV_KEYS.historyItem),
        kvGetCollection<DirectMessage>(kv, KV_KEYS.MESSAGES_INDEX, KV_KEYS.messageItem),
      ]);

      const users = rawUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      );
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      const subjectMap = new Map(subjects.map((s) => [s.id, s]));
      const classMap = new Map(classes.map((c) => [c.id, c]));
      const userMap = new Map(users.map((u) => [u.id, u]));
      const termOrder: GradeRecord['term'][] = ['مستمر اول', 'نوبت اول', 'مستمر دوم', 'نوبت دوم'];

      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        const myGrades = grades.filter((g) => g.studentId === effStudent.id);
        const myAtt = attendance.filter((a) => a.studentId === effStudent.id);
        const myAsgs = effStudent.classId ? assignments.filter((a) => a.classId === effStudent.classId) : [];
        const mySubs = submissions.filter((s) => s.studentId === effStudent.id);
        const myExams = effStudent.classId ? exams.filter((e) => e.active && e.classId === effStudent.classId) : [];
        const myAttempts = examAttempts.filter((a) => a.studentId === effStudent.id);
        const myPlans = studyPlans.filter((p) => p.studentId === user.id || p.studentId === effStudent.id);
        const myHistories = histories
          .filter((h) => h.studentId === effStudent.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const subjectAveragesMap = new Map<string, number[]>();
        for (const g of myGrades) {
          const name = subjectMap.get(g.subjectId)?.name ?? 'سایر';
          const list = subjectAveragesMap.get(name) ?? [];
          list.push(Number(((g.score / g.maxScore) * 20).toFixed(2)));
          subjectAveragesMap.set(name, list);
        }

        const subjectChart = Array.from(subjectAveragesMap.entries()).map(([label, scores]) => ({
          label,
          value: avg(scores),
        }));

        const termTrend = termOrder
          .map((t) => {
            const tg = myGrades.filter((g) => g.term === t);
            return tg.length > 0
              ? { label: t, value: avg(tg.map((g) => (g.score / g.maxScore) * 20)), count: tg.length }
              : null;
          })
          .filter(Boolean);

        const currentTermGrades = myGrades.filter((g) => g.term === settings.currentTerm);
        const currentTermGpa = avg(currentTermGrades.map((g) => (g.score / g.maxScore) * 20));
        const overallGpa = avg(myGrades.map((g) => (g.score / g.maxScore) * 20));

        let classRank: { rank: number; total: number } | null = null;
        if (effStudent.classId) {
          const classmates = users.filter((u) => u.role === 'student' && u.classId === effStudent.classId);
          const classmateGpas = classmates
            .map((stu) => {
              const sg = grades.filter((g) => g.studentId === stu.id);
              return sg.length > 0 ? { id: stu.id, gpa: avg(sg.map((g) => (g.score / g.maxScore) * 20)) } : null;
            })
            .filter((x): x is { id: string; gpa: number } => x !== null)
            .sort((a, b) => b.gpa - a.gpa);

          if (classmateGpas.length >= 2) {
            const idx = classmateGpas.findIndex((c) => c.id === effStudent.id);
            if (idx >= 0) {
              classRank = { rank: idx + 1, total: classmateGpas.length };
            }
          }
        }

        const submittedCount = myAsgs.filter((a) =>
          mySubs.some((s) => s.assignmentId === a.id && s.status !== 'pending')
        ).length;
        const gradedAsgCount = myAsgs.filter((a) =>
          mySubs.some((s) => s.assignmentId === a.id && s.status === 'graded')
        ).length;
        const lateAsgCount = myAsgs.filter((a) =>
          mySubs.some((s) => s.assignmentId === a.id && s.status === 'late')
        ).length;
        const pendingAssignments = myAsgs.length - submittedCount;

        const academicProgress =
          myGrades.length > 0 ? Math.min(100, Math.round((overallGpa / 20) * 100)) : 0;

        const examMap = new Map(exams.map((e) => [e.id, e]));
        const recentExamAttempts = [...myAttempts]
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
          .slice(0, 5)
          .map((att) => {
            const ex = examMap.get(att.examId);
            const pct = att.maxScore > 0 ? Math.round((att.score / att.maxScore) * 100) : 0;
            return {
              id: att.id,
              examTitle: ex?.title ?? 'آزمون',
              subjectName: ex ? subjectMap.get(ex.subjectId)?.name ?? 'درس' : 'درس',
              score: att.score,
              maxScore: att.maxScore,
              percent: pct,
              submittedAt: att.submittedAt,
            };
          });

        const avgExamPercent =
          myAttempts.length > 0
            ? Math.round(
                myAttempts.reduce(
                  (sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0),
                  0
                ) / myAttempts.length
              )
            : 0;

        const recentGrades = [...myGrades]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((g) => ({
            id: g.id,
            title: g.title,
            subjectName: subjectMap.get(g.subjectId)?.name ?? 'درس',
            term: g.term,
            score: g.score,
            maxScore: g.maxScore,
            normalized: Number(((g.score / g.maxScore) * 20).toFixed(2)),
            date: g.date,
          }));

        const completedStudyTasks = myPlans.filter((p) => p.completed).length;
        const totalStudyMinutes = myPlans.reduce((s, p) => s + p.durationMinutes, 0);
        const completedStudyMinutes = myPlans
          .filter((p) => p.completed)
          .reduce((s, p) => s + p.durationMinutes, 0);

        const upcomingEvents = calendarEvents
          .filter((e) => !e.classId || e.classId === effStudent.classId)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5);

        return jsonResponse({
          gpa: overallGpa,
          currentTermGpa,
          gradesCount: myGrades.length,
          subjectsCount: subjects.length,
          academicProgress,
          classRank,
          attendanceStats: {
            total: myAtt.length,
            present: myAtt.filter((a) => a.status === 'present').length,
            absent: myAtt.filter((a) => a.status === 'absent').length,
            late: myAtt.filter((a) => a.status === 'late').length,
            excused: myAtt.filter((a) => a.status === 'excused').length,
          },
          pendingAssignments,
          submittedAssignments: submittedCount,
          totalAssignments: myAsgs.length,
          assignmentBreakdown: {
            pending: pendingAssignments,
            submitted: Math.max(0, submittedCount - gradedAsgCount - lateAsgCount),
            graded: gradedAsgCount,
            late: lateAsgCount,
          },
          activeExamsCount: myExams.length,
          completedExamsCount: myAttempts.length,
          examStats: {
            availableCount: myExams.filter((ex) => !myAttempts.some((a) => a.examId === ex.id)).length,
            completedCount: myAttempts.length,
            avgPercent: avgExamPercent,
            recentAttempts: recentExamAttempts,
          },
          studyStats: {
            totalTasks: myPlans.length,
            completedTasks: completedStudyTasks,
            totalMinutes: totalStudyMinutes,
            completedMinutes: completedStudyMinutes,
          },
          recentGrades,
          upcomingEvents,
          historiesCount: myHistories.length,
          latestHistory: myHistories[0] ?? null,
          subjectChart,
          termTrend,
          coins: effStudent.coins ?? 0,
        });
      }

      if (user.role === 'teacher') {
        const allowedClasses = getTeacherAllowedClassIds(user, classes);
        const allowedSubjects = getTeacherAllowedSubjectIds(user, subjects);
        const myClasses = classes.filter((c) => allowedClasses.has(c.id));
        const myStudents = users.filter((u) => u.role === 'student' && u.classId && allowedClasses.has(u.classId));
        const myGrades = grades.filter((g) => allowedClasses.has(g.classId));
        const myAtt = attendance.filter((a) => allowedClasses.has(a.classId));
        const myAsgs = assignments.filter((a) => allowedClasses.has(a.classId));
        const myAsgIds = new Set(myAsgs.map((a) => a.id));
        const mySubs = submissions.filter((s) => myAsgIds.has(s.assignmentId));
        const awaitingReviewCount = mySubs.filter((s) => s.status === 'submitted').length;
        const gradedAsgSubsCount = mySubs.filter((s) => s.status === 'graded').length;
        const myExams = exams.filter((e) => allowedClasses.has(e.classId) || e.teacherId === user.id);

        const classAverages = myClasses.map((c) => {
          const clsGrades = myGrades.filter((g) => g.classId === c.id);
          return {
            label: c.name,
            value: avg(clsGrades.map((g) => (g.score / g.maxScore) * 20)),
            count: clsGrades.length,
          };
        });

        const mySubjectsList = subjects.filter(
          (s) => allowedSubjects.has(s.id) || myGrades.some((g) => g.subjectId === s.id)
        );
        const subjectAverages = mySubjectsList.map((s) => {
          const subGrades = myGrades.filter((g) => g.subjectId === s.id);
          return {
            label: s.name,
            value: avg(subGrades.map((g) => (g.score / g.maxScore) * 20)),
            count: subGrades.length,
          };
        });

        const termTrend = termOrder
          .map((t) => {
            const tg = myGrades.filter((g) => g.term === t);
            return tg.length > 0
              ? { label: t, value: avg(tg.map((g) => (g.score / g.maxScore) * 20)), count: tg.length }
              : null;
          })
          .filter(Boolean);

        const dist = [
          { label: '۱۸ تا ۲۰', count: 0 },
          { label: '۱۵ تا ۱۷.۹۹', count: 0 },
          { label: '۱۲ تا ۱۴.۹۹', count: 0 },
          { label: 'زیر ۱۲', count: 0 },
        ];
        for (const g of myGrades) {
          const n = (g.score / g.maxScore) * 20;
          if (n >= 18) dist[0].count++;
          else if (n >= 15) dist[1].count++;
          else if (n >= 12) dist[2].count++;
          else dist[3].count++;
        }

        const expectedSubmissions = myAsgs.reduce(
          (sum, asg) => sum + myStudents.filter((s) => s.classId === asg.classId).length,
          0
        );
        const totalSubmittedOrGraded = mySubs.filter((s) => s.status !== 'pending').length;

        const classSummaries = myClasses.map((c) => {
          const clsStudents = myStudents.filter((s) => s.classId === c.id);
          const clsGrades = myGrades.filter((g) => g.classId === c.id);
          const clsAtt = myAtt.filter((a) => a.classId === c.id);
          const clsPresent = clsAtt.filter((a) => a.status === 'present').length;
          return {
            id: c.id,
            name: c.name,
            gradeLevel: c.gradeLevel,
            studentsCount: clsStudents.length,
            gradesCount: clsGrades.length,
            averageScore: avg(clsGrades.map((g) => (g.score / g.maxScore) * 20)),
            attendanceRate: clsAtt.length > 0 ? Math.round((clsPresent / clsAtt.length) * 100) : 0,
          };
        });

        const examSummaries = myExams.slice(0, 6).map((ex) => {
          const attemptsForEx = examAttempts.filter((a) => a.examId === ex.id);
          const maxPts = ex.questions.reduce((s, q) => s + q.points, 0);
          return {
            id: ex.id,
            title: ex.title,
            subjectName: subjectMap.get(ex.subjectId)?.name ?? 'درس',
            className: classMap.get(ex.classId)?.name ?? 'کلاس',
            active: ex.active,
            attemptsCount: attemptsForEx.length,
            averageScore: avg(attemptsForEx.map((a) => a.score)),
            maxScore: maxPts,
          };
        });

        const topStudents = myStudents
          .map((stu) => {
            const sg = myGrades.filter((g) => g.studentId === stu.id);
            return {
              id: stu.id,
              fullName: stu.fullName,
              className: classMap.get(stu.classId ?? '')?.name ?? '—',
              gradesCount: sg.length,
              average: avg(sg.map((g) => (g.score / g.maxScore) * 20)),
            };
          })
          .filter((r) => r.gradesCount > 0)
          .sort((a, b) => b.average - a.average)
          .slice(0, 5);

        const recentGrades = [...myGrades]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((g) => ({
            id: g.id,
            studentName: userMap.get(g.studentId)?.fullName ?? 'دانش‌آموز',
            subjectName: subjectMap.get(g.subjectId)?.name ?? 'درس',
            title: g.title,
            score: g.score,
            maxScore: g.maxScore,
            date: g.date,
          }));

        return jsonResponse({
          classesCount: myClasses.length,
          subjectsCount: allowedSubjects.size,
          studentsCount: myStudents.length,
          gradesCount: myGrades.length,
          averageScore: avg(myGrades.map((g) => (g.score / g.maxScore) * 20)),
          assignmentsCount: myAsgs.length,
          awaitingReviewCount,
          activeExamsCount: myExams.filter((e) => e.active).length,
          attendanceStats: {
            total: myAtt.length,
            present: myAtt.filter((a) => a.status === 'present').length,
            absent: myAtt.filter((a) => a.status === 'absent').length,
            late: myAtt.filter((a) => a.status === 'late').length,
            excused: myAtt.filter((a) => a.status === 'excused').length,
          },
          classAverages,
          subjectAverages,
          termTrend,
          gradeDistribution: dist,
          assignmentBreakdown: {
            totalAssignments: myAsgs.length,
            expectedSubmissions,
            submittedCount: totalSubmittedOrGraded,
            gradedCount: gradedAsgSubsCount,
            pendingReviewCount: awaitingReviewCount,
            completionRate: expectedSubmissions > 0 ? Math.round((totalSubmittedOrGraded / expectedSubmissions) * 100) : 0,
          },
          classSummaries,
          examSummaries,
          topStudents,
          recentGrades,
        });
      }

      // Admin overview
      const students = users.filter((u) => u.role === 'student');
      const teachers = users.filter((u) => u.role === 'teacher');
      const admins = users.filter((u) => u.role === 'admin');
      const classAverages = classes.map((c) => {
        const clsGrades = grades.filter((g) => g.classId === c.id);
        return {
          label: c.name,
          value: avg(clsGrades.map((g) => (g.score / g.maxScore) * 20)),
          students: students.filter((s) => s.classId === c.id).length,
        };
      });

      const subjectAverages = subjects.map((s) => {
        const subGrades = grades.filter((g) => g.subjectId === s.id);
        return {
          label: s.name,
          value: avg(subGrades.map((g) => (g.score / g.maxScore) * 20)),
          count: subGrades.length,
        };
      });

      const termTrend = termOrder
        .map((t) => {
          const tg = grades.filter((g) => g.term === t);
          return tg.length > 0
            ? { label: t, value: avg(tg.map((g) => (g.score / g.maxScore) * 20)), count: tg.length }
            : null;
        })
        .filter(Boolean);

      const gradeDistribution = [
        { label: '۱۸ تا ۲۰', count: 0 },
        { label: '۱۵ تا ۱۷.۹۹', count: 0 },
        { label: '۱۲ تا ۱۴.۹۹', count: 0 },
        { label: 'زیر ۱۲', count: 0 },
      ];
      for (const g of grades) {
        const n = (g.score / g.maxScore) * 20;
        if (n >= 18) gradeDistribution[0].count++;
        else if (n >= 15) gradeDistribution[1].count++;
        else if (n >= 12) gradeDistribution[2].count++;
        else gradeDistribution[3].count++;
      }

      const gradeLevelsSet = new Set<string>();
      for (const c of classes) if (c.gradeLevel) gradeLevelsSet.add(c.gradeLevel);
      for (const s of students) if (s.gradeLevel) gradeLevelsSet.add(s.gradeLevel);
      const gradeLevelStats = Array.from(gradeLevelsSet).map((lvl) => {
        const lvlClasses = classes.filter((c) => c.gradeLevel === lvl);
        const lvlClassIds = new Set(lvlClasses.map((c) => c.id));
        const lvlStudents = students.filter(
          (s) => s.gradeLevel === lvl || (s.classId && lvlClassIds.has(s.classId))
        );
        const lvlStudentIds = new Set(lvlStudents.map((s) => s.id));
        const lvlGrades = grades.filter((g) => lvlClassIds.has(g.classId) || lvlStudentIds.has(g.studentId));
        const lvlAtt = attendance.filter((a) => lvlClassIds.has(a.classId) || lvlStudentIds.has(a.studentId));
        const present = lvlAtt.filter((a) => a.status === 'present').length;
        return {
          label: lvl,
          studentsCount: lvlStudents.length,
          classesCount: lvlClasses.length,
          averageScore: avg(lvlGrades.map((g) => (g.score / g.maxScore) * 20)),
          attendanceRate: lvlAtt.length > 0 ? Math.round((present / lvlAtt.length) * 100) : 0,
        };
      });

      const classPerformance = classes.map((c) => {
        const clsStudents = students.filter((s) => s.classId === c.id);
        const clsGrades = grades.filter((g) => g.classId === c.id);
        const clsAtt = attendance.filter((a) => a.classId === c.id);
        const present = clsAtt.filter((a) => a.status === 'present').length;
        return {
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          studentsCount: clsStudents.length,
          capacity: c.capacity,
          gradesCount: clsGrades.length,
          averageScore: avg(clsGrades.map((g) => (g.score / g.maxScore) * 20)),
          attendanceRate: clsAtt.length > 0 ? Math.round((present / clsAtt.length) * 100) : 0,
        };
      });

      const studentMetrics = students.map((stu) => {
        const sg = grades.filter((g) => g.studentId === stu.id);
        const sa = attendance.filter((a) => a.studentId === stu.id);
        return {
          id: stu.id,
          fullName: stu.fullName,
          className: classMap.get(stu.classId ?? '')?.name ?? '—',
          gradesCount: sg.length,
          average: avg(sg.map((g) => (g.score / g.maxScore) * 20)),
          absences: sa.filter((a) => a.status === 'absent').length,
        };
      });

      const topStudents = studentMetrics
        .filter((s) => s.gradesCount > 0)
        .sort((a, b) => b.average - a.average)
        .slice(0, 5);

      const attentionStudents = studentMetrics
        .filter((s) => (s.gradesCount > 0 && s.average < (settings.passingScore ?? 10) + 3) || s.absences >= 2)
        .slice(0, 6);

      const totalExpectedSubs = assignments.reduce(
        (sum, asg) => sum + students.filter((s) => s.classId === asg.classId).length,
        0
      );
      const totalSubmittedSubs = submissions.filter((s) => s.status !== 'pending').length;
      const avgExamPercent =
        examAttempts.length > 0
          ? Math.round(
              examAttempts.reduce(
                (sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0),
                0
              ) / examAttempts.length
            )
          : 0;

      return jsonResponse({
        studentsCount: students.length,
        activeStudentsCount: students.filter((s) => s.active).length,
        activeAccountsCount: users.filter((u) => u.active).length,
        inactiveAccountsCount: users.filter((u) => !u.active).length,
        teachersCount: teachers.length,
        classesCount: classes.length,
        subjectsCount: subjects.length,
        gradesCount: grades.length,
        schoolAverage: avg(grades.map((g) => (g.score / g.maxScore) * 20)),
        assignmentsCount: assignments.length,
        activeExamsCount: exams.filter((e) => e.active).length,
        completedExamsCount: examAttempts.length,
        announcementsCount: announcements.length,
        pendingProfileRequestsCount: profileRequests.filter((r) => r.status === 'pending').length,
        attendanceStats: {
          total: attendance.length,
          present: attendance.filter((a) => a.status === 'present').length,
          absent: attendance.filter((a) => a.status === 'absent').length,
          late: attendance.filter((a) => a.status === 'late').length,
          excused: attendance.filter((a) => a.status === 'excused').length,
        },
        classAverages,
        subjectAverages,
        termTrend,
        gradeDistribution,
        gradeLevelStats,
        classPerformance,
        topStudents,
        attentionStudents,
        roleBreakdown: {
          studentsActive: students.filter((s) => s.active).length,
          studentsInactive: students.filter((s) => !s.active).length,
          teachersActive: teachers.filter((t) => t.active).length,
          teachersInactive: teachers.filter((t) => !t.active).length,
          adminsCount: admins.length,
        },
        engagementStats: {
          assignmentsCount: assignments.length,
          totalSubmissions: totalSubmittedSubs,
          gradedSubmissions: submissions.filter((s) => s.status === 'graded').length,
          submissionRate: totalExpectedSubs > 0 ? Math.round((totalSubmittedSubs / totalExpectedSubs) * 100) : 0,
          examsCount: exams.length,
          examAttemptsCount: examAttempts.length,
          avgExamPercent,
          studyPlansCount: studyPlans.length,
          completedStudyPlansCount: studyPlans.filter((p) => p.completed).length,
          directMessagesCount: directMessages.length,
          calendarEventsCount: calendarEvents.length,
        },
        recentActivity: (auditLogs ?? []).slice(0, 8),
      });
    }

    // Settings
    if (path === '/api/settings' && method === 'GET') {
      await ensureBaseConfig(kv);
      const settings = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      return jsonResponse({ settings });
    }

    if (path === '/api/settings' && method === 'PUT') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به تغییر تنظیمات سامانه است.', 403);
      const body = await readJsonBody<Partial<SchoolSettings>>(req);
      const current = (await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS)) ?? defaultSchoolSettings();
      const updated: SchoolSettings = {
        ...current,
        ...body,
        passingScore: body.passingScore !== undefined ? Number(body.passingScore) : current.passingScore,
        updatedAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.SETTINGS, updated);
      await appendAuditLog(kv, user, 'تغییر تنظیمات سامانه', updated.schoolName, `سال تحصیلی: ${updated.academicYear}`);
      return jsonResponse({ settings: updated, message: 'تنظیمات سامانه با موفقیت ذخیره شد.' });
    }

    // Audit Logs
    if (path === '/api/audit-logs' && method === 'GET') {
      if (user.role !== 'admin') return errorResponse('فقط مدیر یا معاون مدرسه مجاز به مشاهده گزارش فعالیت کاربران است.', 403);
      const logs = (await kvGetJson<AuditLog[]>(kv, KV_KEYS.AUDIT_LOGS)) ?? [];
      return jsonResponse({ logs });
    }

    // --- Separate Private Tutor («معلم خصوصی» — completely separate from /api/ai/*) ---
    if (path === '/api/private-tutor/sources' && method === 'GET') {
      const sources = await kvGetCollection<TeacherSourceMaterial>(
        kv,
        KV_KEYS.TUTOR_SOURCES_INDEX,
        KV_KEYS.tutorSourceItem
      );
      const scoped = user.role === 'student' ? sources.filter((s) => s.approved) : sources;
      return jsonResponse({ sources: scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    }

    if (path === '/api/private-tutor/sources' && method === 'POST') {
      if (user.role === 'student') {
        return errorResponse('افزودن جزوه و منبع درسی فقط برای دبیران، معاونین و مدیران فعال است.', 403);
      }
      const body = await readJsonBody<{
        title: string;
        subjectId?: string;
        subjectName?: string;
        gradeLevel?: string;
        chapter?: string;
        topic?: string;
        summary?: string;
        approved?: boolean;
        pages: Array<{ pageNumber?: number; heading?: string; content: string }>;
      }>(req);

      if (!body.title?.trim() || !Array.isArray(body.pages) || body.pages.length === 0) {
        return errorResponse('عنوان جزوه و حداقل یک صفحه محتوا الزامی است.', 400);
      }

      const subjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
      const subObj = body.subjectId ? subjects.find((s) => s.id === body.subjectId) : undefined;
      const now = new Date().toISOString();
      const pages: TeacherSourcePage[] = body.pages
        .filter((p) => p.content?.trim())
        .map((p, idx) => ({
          pageNumber: Number(p.pageNumber) || idx + 1,
          heading: p.heading?.trim() || undefined,
          content: p.content.trim(),
        }));

      if (pages.length === 0) {
        return errorResponse('متن صفحات جزوه نمی‌تواند خالی باشد.', 400);
      }

      const material: TeacherSourceMaterial = {
        id: generateId('tsrc'),
        title: body.title.trim(),
        subjectId: body.subjectId || undefined,
        subjectName: body.subjectName?.trim() || subObj?.name || 'عمومی',
        gradeLevel: (body.gradeLevel || subObj?.gradeLevel || 'هفتم').trim(),
        chapter: body.chapter?.trim() || undefined,
        topic: body.topic?.trim() || undefined,
        authorId: user.id,
        authorName: user.fullName,
        authorRole: user.role,
        approved: user.role === 'admin' ? body.approved !== false : body.approved ?? true,
        summary: body.summary?.trim() || undefined,
        pages,
        createdAt: now,
        updatedAt: now,
      };
      await kvPutJson(kv, KV_KEYS.tutorSourceItem(material.id), material);
      await kvAddToIndex(kv, KV_KEYS.TUTOR_SOURCES_INDEX, material.id);
      await appendAuditLog(kv, user, 'ثبت جزوه معلم خصوصی', material.title, `${pages.length} صفحه`);
      return jsonResponse({ source: material, message: 'جزوه و منبع مدرسه با موفقیت ذخیره شد.' }, 201);
    }

    if (path.startsWith('/api/private-tutor/sources/') && method === 'PATCH') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[4];
      const existing = await kvGetJson<TeacherSourceMaterial>(kv, KV_KEYS.tutorSourceItem(id));
      if (!existing) return errorResponse('منبع یافت نشد.', 404);
      if (user.role !== 'admin' && existing.authorId !== user.id) {
        return errorResponse('فقط ثبت‌کننده منبع یا مدیریت مجاز به ویرایش است.', 403);
      }
      const body = await readJsonBody<Partial<TeacherSourceMaterial>>(req);
      if (body.title !== undefined) existing.title = body.title.trim();
      if (body.subjectId !== undefined) existing.subjectId = body.subjectId || undefined;
      if (body.subjectName !== undefined) existing.subjectName = body.subjectName.trim();
      if (body.gradeLevel !== undefined) existing.gradeLevel = body.gradeLevel.trim();
      if (body.chapter !== undefined) existing.chapter = body.chapter.trim();
      if (body.topic !== undefined) existing.topic = body.topic.trim();
      if (body.approved !== undefined) existing.approved = Boolean(body.approved);
      if (Array.isArray(body.pages) && body.pages.length > 0) {
        existing.pages = body.pages.map((p, idx) => ({
          pageNumber: Number(p.pageNumber) || idx + 1,
          heading: p.heading?.trim() || undefined,
          content: String(p.content || '').trim(),
        }));
      }
      existing.updatedAt = new Date().toISOString();
      await kvPutJson(kv, KV_KEYS.tutorSourceItem(existing.id), existing);
      return jsonResponse({ source: existing, message: 'منبع آموزشی به‌روزرسانی شد.' });
    }

    if (path.startsWith('/api/private-tutor/sources/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[4];
      const existing = await kvGetJson<TeacherSourceMaterial>(kv, KV_KEYS.tutorSourceItem(id));
      if (!existing) return errorResponse('منبع یافت نشد.', 404);
      if (user.role !== 'admin' && existing.authorId !== user.id) {
        return errorResponse('دسترسی غیرمجاز', 403);
      }
      await kv.delete(KV_KEYS.tutorSourceItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.TUTOR_SOURCES_INDEX, id);
      return jsonResponse({ ok: true, message: 'منبع حذف شد.' });
    }

    if (path === '/api/private-tutor/sessions' && method === 'GET') {
      const ids = await kvGetIndex(kv, KV_KEYS.tutorUserSessions(user.id));
      const sessions = (
        await Promise.all(ids.map((id) => kvGetJson<PrivateTutorSession>(kv, KV_KEYS.tutorSession(user.id, id))))
      ).filter((s): s is PrivateTutorSession => s !== null);
      sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return jsonResponse({ sessions });
    }

    if (path === '/api/private-tutor/sessions' && method === 'POST') {
      const body = await readJsonBody<{ title?: string; subjectId?: string }>(req);
      const now = new Date().toISOString();
      const session: PrivateTutorSession = {
        id: generateId('pts'),
        userId: user.id,
        title: body.title?.trim() || 'جلسه معلم خصوصی',
        subjectId: body.subjectId || undefined,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      await kvPutJson(kv, KV_KEYS.tutorSession(user.id, session.id), session);
      await kvAddToIndex(kv, KV_KEYS.tutorUserSessions(user.id), session.id);
      return jsonResponse({ session }, 201);
    }

    if (path.match(/^\/api\/private-tutor\/sessions\/[^/]+$/) && method === 'GET') {
      const id = path.split('/')[4];
      const session = await kvGetJson<PrivateTutorSession>(kv, KV_KEYS.tutorSession(user.id, id));
      if (!session || session.userId !== user.id) return errorResponse('جلسه یافت نشد.', 404);
      return jsonResponse({ session });
    }

    if (path.match(/^\/api\/private-tutor\/sessions\/[^/]+$/) && method === 'DELETE') {
      const id = path.split('/')[4];
      const session = await kvGetJson<PrivateTutorSession>(kv, KV_KEYS.tutorSession(user.id, id));
      if (!session || session.userId !== user.id) return errorResponse('جلسه یافت نشد.', 404);
      await kv.delete(KV_KEYS.tutorSession(user.id, id));
      await kvRemoveFromIndex(kv, KV_KEYS.tutorUserSessions(user.id), id);
      return jsonResponse({ ok: true, message: 'جلسه معلم خصوصی حذف شد.' });
    }

    if (path.match(/^\/api\/private-tutor\/sessions\/[^/]+\/ask\/stream$/) && method === 'POST') {
      const sessionId = path.split('/')[4];
      const session = await kvGetJson<PrivateTutorSession>(kv, KV_KEYS.tutorSession(user.id, sessionId));
      if (!session || session.userId !== user.id) return errorResponse('جلسه یافت نشد.', 404);

      const body = await readJsonBody<{ question: string; subjectId?: string; lang?: AppLanguage }>(req);
      const question = (body.question ?? '').trim();
      if (!question) return errorResponse('متن پرسش نمی‌تواند خالی باشد.', 400);
      if (body.subjectId !== undefined) session.subjectId = body.subjectId || undefined;

      const userMsg: PrivateTutorMessage = {
        id: generateId('ptm'),
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      };
      const prevMessages = [...session.messages];
      session.messages.push(userMsg);
      if (prevMessages.length === 0) {
        session.title = question.slice(0, 42) + (question.length > 42 ? '...' : '');
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          const sendEvent = (payload: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch {
              closed = true;
            }
          };

          let accumulated = '';
          let lastCitations: PrivateTutorMessage['citations'] = [];
          try {
            for await (const chunk of streamPrivateTutorResponse({
              aiServerUrl: env.AI_SERVER_URL,
              kv,
              user,
              question,
              subjectId: session.subjectId,
              history: prevMessages,
              lang: body.lang === 'en' ? 'en' : 'fa',
              signal: req.signal,
            })) {
              if (chunk.citations) {
                lastCitations = chunk.citations;
                sendEvent({ citations: chunk.citations });
              }
              if (chunk.delta) {
                accumulated += chunk.delta;
                sendEvent({ delta: chunk.delta });
              }
            }

            const assistantMsg: PrivateTutorMessage = {
              id: generateId('ptm'),
              role: 'assistant',
              content: accumulated.trim() || 'پاسخی از سرور دریافت نشد.',
              citations: lastCitations,
              createdAt: new Date().toISOString(),
            };
            session.messages.push(assistantMsg);
            session.updatedAt = new Date().toISOString();
            await kvPutJson(kv, KV_KEYS.tutorSession(user.id, session.id), session);
            sendEvent({ done: true, session, message: assistantMsg });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'خطا در ارتباط با معلم خصوصی';
            sendEvent({ error: msg });
          } finally {
            if (!closed) {
              closed = true;
              try {
                controller.close();
              } catch {
                // ignore
              }
            }
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    if (path === '/api/private-tutor/diagnosis' && method === 'GET') {
      const requestedStudentId = url.searchParams.get('studentId')?.trim();
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const targetStudentId =
        user.role !== 'student' && requestedStudentId ? requestedStudentId : effStudent.id;
      const diagnosis = await computeLearningDiagnosis(kv, targetStudentId);
      return jsonResponse({ diagnosis });
    }

    if (path === '/api/private-tutor/mistakes' && method === 'POST') {
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const body = await readJsonBody<{
        studentId?: string;
        subjectId?: string;
        subjectName?: string;
        topic: string;
        mistakeType: string;
        questionPrompt?: string;
        studentAnswer?: string;
        expectedAnswer?: string;
        severity?: 'low' | 'medium' | 'high';
      }>(req);

      if (!body.topic?.trim() || !body.mistakeType?.trim()) {
        return errorResponse('موضوع و نوع اشتباه الزامی است.', 400);
      }

      const targetId = user.role !== 'student' && body.studentId ? body.studentId : effStudent.id;
      const mistake = await recordStudentMistake(kv, {
        studentId: targetId,
        subjectId: body.subjectId,
        subjectName: body.subjectName,
        topic: body.topic,
        mistakeType: body.mistakeType,
        questionPrompt: body.questionPrompt,
        studentAnswer: body.studentAnswer,
        expectedAnswer: body.expectedAnswer,
        severity: body.severity,
      });
      return jsonResponse({ mistake, message: 'اشتباه یادگیری در پرونده تشخیص ثبت شد.' }, 201);
    }

    if (path === '/api/private-tutor/generate-practice' && method === 'POST') {
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const body = await readJsonBody<{
        topic?: string;
        subjectId?: string;
        difficulty?: 'easy' | 'medium' | 'hard';
        count?: number;
      }>(req);
      try {
        const result = await generateAdaptivePracticeWithAI({
          aiServerUrl: env.AI_SERVER_URL,
          kv,
          studentId: effStudent.id,
          topic: (body.topic || 'مفاهیم کلیدی درس').trim(),
          subjectId: body.subjectId,
          difficulty: body.difficulty,
          count: Number(body.count) || 3,
        });
        return jsonResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'خطا در تولید تمرین متناسب', 502);
      }
    }

    if (path === '/api/private-tutor/generate-remedial-plan' && method === 'POST') {
      const effStudent = await resolveEffectiveStudentUser(kv, user);
      const body = await readJsonBody<{ focusTopic?: string }>(req);
      try {
        const result = await generateRemedialPlanWithAI({
          aiServerUrl: env.AI_SERVER_URL,
          kv,
          studentId: effStudent.id,
          focusTopic: body.focusTopic?.trim(),
        });
        return jsonResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'خطا در تولید برنامه جبرانی', 502);
      }
    }

    // --- Academic Decline / Risk Prediction ---
    if (path === '/api/academic-risk' && method === 'GET') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const assessments = await computeAcademicRiskReport(kv, user);
      return jsonResponse({ assessments });
    }

    if (path === '/api/academic-risk/notes' && method === 'POST') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<{
        studentId: string;
        note: string;
        actionTaken?: string;
      }>(req);
      if (!body.studentId || !body.note?.trim()) {
        return errorResponse('شناسه دانش‌آموز و متن یادداشت الزامی است.', 400);
      }
      const reviewNote: RiskReviewNote = {
        id: generateId('rsk'),
        studentId: body.studentId,
        authorId: user.id,
        authorName: user.fullName,
        note: body.note.trim(),
        actionTaken: body.actionTaken?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.riskNoteItem(reviewNote.id), reviewNote);
      await kvAddToIndex(kv, KV_KEYS.RISK_NOTES_INDEX, reviewNote.id);
      return jsonResponse({ note: reviewNote, message: 'یادداشت بررسی آموزشی ثبت شد.' }, 201);
    }

    // --- Digital Library ---
    if (path === '/api/library' && method === 'GET') {
      const items = await kvGetCollection<DigitalLibraryItem>(kv, KV_KEYS.LIBRARY_INDEX, KV_KEYS.libraryItem);
      const scoped = user.role === 'student' ? items.filter((i) => i.approved) : items;
      return jsonResponse({ items: scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (path === '/api/library' && method === 'POST') {
      if (user.role === 'student') {
        return errorResponse('افزودن منبع به کتابخانه دیجیتال فقط برای دبیران، معاونین و مدیران مجاز است.', 403);
      }
      const body = await readJsonBody<{
        title: string;
        description: string;
        category: LibraryResourceCategory;
        subjectId?: string;
        subjectName?: string;
        gradeLevel?: string;
        fileUrl?: string;
        contentPreview?: string;
        durationOrPages?: string;
        approved?: boolean;
      }>(req);

      if (!body.title?.trim() || !body.description?.trim()) {
        return errorResponse('عنوان و توضیحات منبع الزامی است.', 400);
      }
      if (!isSafeResourceUrl(body.fileUrl)) {
        return errorResponse('نشانی پیوند یا فایل نامعتبر است. فقط پیوندهای http/https مجاز هستند.', 400);
      }

      const subjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
      const subObj = body.subjectId ? subjects.find((s) => s.id === body.subjectId) : undefined;
      const item: DigitalLibraryItem = {
        id: generateId('lib'),
        title: body.title.trim(),
        description: body.description.trim(),
        category: body.category || 'handout',
        subjectId: body.subjectId || undefined,
        subjectName: body.subjectName?.trim() || subObj?.name || 'عمومی',
        gradeLevel: (body.gradeLevel || subObj?.gradeLevel || 'هفتم').trim(),
        fileUrl: body.fileUrl?.trim() || undefined,
        contentPreview: body.contentPreview?.trim() || undefined,
        durationOrPages: body.durationOrPages?.trim() || undefined,
        authorId: user.id,
        authorName: user.fullName,
        approved: user.role === 'admin' ? body.approved !== false : body.approved ?? true,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.libraryItem(item.id), item);
      await kvAddToIndex(kv, KV_KEYS.LIBRARY_INDEX, item.id);
      await appendAuditLog(kv, user, 'افزودن به کتابخانه دیجیتال', item.title, `دسته: ${item.category}`);
      return jsonResponse({ item, message: 'منبع به کتابخانه دیجیتال اضافه شد.' }, 201);
    }

    if (path.startsWith('/api/library/') && method === 'PATCH') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const item = await kvGetJson<DigitalLibraryItem>(kv, KV_KEYS.libraryItem(id));
      if (!item) return errorResponse('منبع یافت نشد.', 404);
      if (user.role !== 'admin' && item.authorId !== user.id) return errorResponse('دسترسی غیرمجاز', 403);
      const body = await readJsonBody<Partial<DigitalLibraryItem>>(req);
      if (body.fileUrl !== undefined && !isSafeResourceUrl(body.fileUrl)) {
        return errorResponse('نشانی پیوند نامعتبر است.', 400);
      }
      if (body.approved !== undefined) item.approved = Boolean(body.approved);
      if (body.title !== undefined) item.title = body.title.trim();
      if (body.description !== undefined) item.description = body.description.trim();
      if (body.fileUrl !== undefined) item.fileUrl = body.fileUrl.trim() || undefined;
      if (body.contentPreview !== undefined) item.contentPreview = body.contentPreview.trim() || undefined;
      await kvPutJson(kv, KV_KEYS.libraryItem(item.id), item);
      return jsonResponse({ item, message: 'منبع کتابخانه به‌روزرسانی شد.' });
    }

    if (path.startsWith('/api/library/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const item = await kvGetJson<DigitalLibraryItem>(kv, KV_KEYS.libraryItem(id));
      if (!item) return errorResponse('منبع یافت نشد.', 404);
      if (user.role !== 'admin' && item.authorId !== user.id) return errorResponse('دسترسی غیرمجاز', 403);
      await kv.delete(KV_KEYS.libraryItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.LIBRARY_INDEX, id);
      return jsonResponse({ ok: true, message: 'منبع از کتابخانه حذف شد.' });
    }

    // --- Student Honors File ---
    if (path === '/api/honors' && method === 'GET') {
      const [honors, users, classes] = await Promise.all([
        kvGetCollection<StudentHonor>(kv, KV_KEYS.HONORS_INDEX, KV_KEYS.honorItem),
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);
      const userMap = new Map(users.map((u) => [u.id, u]));
      let scoped = honors;
      if (user.role === 'student') {
        const effStudent = await resolveEffectiveStudentUser(kv, user);
        scoped = scoped.filter((h) => h.studentId === effStudent.id);
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, classes);
        const allowedStudentIds = new Set(
          users.filter((u) => u.role === 'student' && u.classId && allowed.has(u.classId)).map((u) => u.id)
        );
        scoped = scoped.filter((h) => allowedStudentIds.has(h.studentId) || h.createdBy === user.id);
      }
      const enriched = scoped
        .map((h) => ({
          ...h,
          studentName: h.studentName || userMap.get(h.studentId)?.fullName || 'دانش‌آموز',
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return jsonResponse({ honors: enriched });
    }

    if (path === '/api/honors' && method === 'POST') {
      if (user.role === 'student') return errorResponse('ثبت افتخار فقط توسط دبیر، معاون یا مدیر مدرسه مجاز است.', 403);
      const body = await readJsonBody<{
        studentId: string;
        title: string;
        category: HonorCategory;
        level: HonorLevel;
        rankOrMedal?: string;
        date: string;
        description?: string;
        issuer?: string;
        certificateRef?: string;
      }>(req);

      if (!body.studentId || !body.title?.trim() || !body.date?.trim()) {
        return errorResponse('انتخاب دانش‌آموز، عنوان افتخار و تاریخ الزامی است.', 400);
      }
      const stu = await kvGetJson<StoredUser>(kv, KV_KEYS.user(body.studentId));
      const honor: StudentHonor = {
        id: generateId('hnr'),
        studentId: body.studentId,
        studentName: stu?.fullName || undefined,
        title: body.title.trim(),
        category: body.category || 'academic',
        level: body.level || 'school',
        rankOrMedal: body.rankOrMedal?.trim() || undefined,
        date: body.date.trim(),
        description: body.description?.trim() || undefined,
        issuer: body.issuer?.trim() || undefined,
        certificateRef: body.certificateRef?.trim() || undefined,
        createdBy: user.id,
        createdByName: user.fullName,
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.honorItem(honor.id), honor);
      await kvAddToIndex(kv, KV_KEYS.HONORS_INDEX, honor.id);
      await appendAuditLog(kv, user, 'ثبت در پرونده افتخارات', stu?.fullName || body.studentId, honor.title);
      return jsonResponse({ honor, message: 'افتخار جدید در پرونده دانش‌آموز ثبت شد.' }, 201);
    }

    if (path.startsWith('/api/honors/') && method === 'DELETE') {
      if (user.role === 'student') return errorResponse('دسترسی غیرمجاز', 403);
      const id = path.split('/')[3];
      const honor = await kvGetJson<StudentHonor>(kv, KV_KEYS.honorItem(id));
      if (!honor) return errorResponse('مورد یافت نشد.', 404);
      if (user.role !== 'admin' && honor.createdBy !== user.id) return errorResponse('دسترسی غیرمجاز', 403);
      await kv.delete(KV_KEYS.honorItem(id));
      await kvRemoveFromIndex(kv, KV_KEYS.HONORS_INDEX, id);
      return jsonResponse({ ok: true, message: 'مورد از پرونده افتخارات حذف شد.' });
    }

    // AI Assistant Conversations & Messaging
    if (path === '/api/ai/conversations' && method === 'GET') {
      const convIds = await kvGetIndex(kv, KV_KEYS.aiUserConvs(user.id));
      const convs = (
        await Promise.all(convIds.map((id) => kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, id))))
      ).filter((c): c is AIConversation => c !== null);

      convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return jsonResponse({
        conversations: convs.map((c) => ({
          id: c.id,
          title: c.title,
          mode: c.mode,
          role: c.role,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: c.messages.length,
        })),
      });
    }

    if (path === '/api/ai/conversations' && method === 'POST') {
      const settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      if (settings && !settings.aiEnabled && user.role !== 'admin') {
        return errorResponse('دستیار هوش مصنوعی در حال حاضر توسط مدیریت غیرفعال شده است.', 403);
      }
      const body = await readJsonBody<{ title?: string; mode?: string }>(req);
      const defaultModes: Record<UserRole, string> = {
        student: 'پاسخگویی و آموزش مفاهیم درسی',
        teacher: 'طراحی سؤال و تحلیل کلاس',
        admin: 'تحلیل وضعیت تحصیلی و گزارش مدیریتی',
      };
      const now = new Date().toISOString();
      const conv: AIConversation = {
        id: generateId('ai'),
        userId: user.id,
        role: user.role,
        title: body.title?.trim() || 'گفت‌وگوی جدید',
        mode: body.mode?.trim() || defaultModes[user.role],
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);
      await kvAddToIndex(kv, KV_KEYS.aiUserConvs(user.id), conv.id);
      return jsonResponse({ conversation: conv }, 201);
    }

    if (path.match(/^\/api\/ai\/conversations\/[^/]+$/) && method === 'GET') {
      const convId = path.split('/')[4];
      const conv = await kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, convId));
      if (!conv || conv.userId !== user.id) return errorResponse('گفت‌وگو یافت نشد.', 404);
      return jsonResponse({ conversation: conv });
    }

    if (path.match(/^\/api\/ai\/conversations\/[^/]+$/) && method === 'PATCH') {
      const convId = path.split('/')[4];
      const conv = await kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, convId));
      if (!conv || conv.userId !== user.id) return errorResponse('گفت‌وگو یافت نشد.', 404);
      const body = await readJsonBody<{ title: string }>(req);
      const cleanTitle = (body.title ?? '').trim();
      if (!cleanTitle) return errorResponse('عنوان گفت‌وگو نمی‌تواند خالی باشد.', 400);
      conv.title = cleanTitle.slice(0, 80);
      conv.updatedAt = new Date().toISOString();
      await kvPutJson(kv, KV_KEYS.aiConv(user.id, convId), conv);
      return jsonResponse({ conversation: conv, message: 'عنوان گفت‌وگو تغییر یافت.' });
    }

    if (path.match(/^\/api\/ai\/conversations\/[^/]+$/) && method === 'DELETE') {
      const convId = path.split('/')[4];
      const conv = await kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, convId));
      if (!conv || conv.userId !== user.id) return errorResponse('گفت‌وگو یافت نشد.', 404);
      await kv.delete(KV_KEYS.aiConv(user.id, convId));
      await kvRemoveFromIndex(kv, KV_KEYS.aiUserConvs(user.id), convId);
      return jsonResponse({ ok: true, message: 'گفت‌وگو حذف شد.' });
    }

    if (path.match(/^\/api\/ai\/conversations\/[^/]+\/messages\/stream$/) && method === 'POST') {
      const settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      if (settings && !settings.aiEnabled && user.role !== 'admin') {
        return errorResponse('دستیار هوش مصنوعی در حال حاضر توسط مدیریت غیرفعال شده است.', 403);
      }

      const convId = path.split('/')[4];
      const conv = await kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, convId));
      if (!conv || conv.userId !== user.id) return errorResponse('گفت‌وگو یافت نشد.', 404);

      const body = await readJsonBody<{ content: string; mode?: string; lang?: AppLanguage }>(req);
      const userContent = (body.content ?? '').trim();
      if (!userContent) return errorResponse('متن پیام نمی‌تواند خالی باشد.', 400);

      if (body.mode?.trim()) conv.mode = body.mode.trim();

      const userMsg: AIMessage = {
        id: generateId('msg'),
        role: 'user',
        content: userContent,
        createdAt: new Date().toISOString(),
      };

      const previousMessages = [...conv.messages];
      conv.messages.push(userMsg);
      if ((conv.title === 'گفت‌وگوی جدید' || conv.title === 'New Chat') && previousMessages.length === 0) {
        conv.title = userContent.slice(0, 42) + (userContent.length > 42 ? '...' : '');
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let streamClosed = false;
          const sendEvent = (payload: Record<string, unknown>) => {
            if (streamClosed) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch {
              streamClosed = true;
            }
          };

          let accumulated = '';
          try {
            for await (const delta of streamSchoolAIResponse({
              apiKey: env.GEMINI_API_KEY,
              aiServerUrl: env.AI_SERVER_URL,
              kv,
              user,
              mode: conv.mode,
              history: previousMessages,
              userMessage: userContent,
              lang: body.lang === 'en' ? 'en' : 'fa',
              signal: req.signal,
            })) {
              accumulated += delta;
              sendEvent({ delta });
            }

            if (accumulated.trim()) {
              const assistantMsg: AIMessage = {
                id: generateId('msg'),
                role: 'assistant',
                content: accumulated.trim(),
                createdAt: new Date().toISOString(),
              };
              conv.messages.push(assistantMsg);
            }
            conv.updatedAt = new Date().toISOString();
            await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);
            sendEvent({ done: true, conversation: conv });
          } catch (err) {
            if (req.signal.aborted && accumulated.trim()) {
              const assistantMsg: AIMessage = {
                id: generateId('msg'),
                role: 'assistant',
                content: accumulated.trim(),
                createdAt: new Date().toISOString(),
              };
              conv.messages.push(assistantMsg);
              conv.updatedAt = new Date().toISOString();
              await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);
            } else if (!req.signal.aborted) {
              const errMessage = err instanceof Error ? err.message : 'خطا در ارتباط با سرویس هوش مصنوعی';
              const errMsg: AIMessage = {
                id: generateId('msg'),
                role: 'assistant',
                content: errMessage,
                createdAt: new Date().toISOString(),
                error: true,
              };
              conv.messages.push(errMsg);
              conv.updatedAt = new Date().toISOString();
              await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);
              sendEvent({ error: errMessage, conversation: conv });
            }
          } finally {
            if (!streamClosed) {
              streamClosed = true;
              try {
                controller.close();
              } catch {
                // stream already closed
              }
            }
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    if (path.match(/^\/api\/ai\/conversations\/[^/]+\/messages$/) && method === 'POST') {
      const settings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
      if (settings && !settings.aiEnabled && user.role !== 'admin') {
        return errorResponse('دستیار هوش مصنوعی در حال حاضر توسط مدیریت غیرفعال شده است.', 403);
      }

      const convId = path.split('/')[4];
      const conv = await kvGetJson<AIConversation>(kv, KV_KEYS.aiConv(user.id, convId));
      if (!conv || conv.userId !== user.id) return errorResponse('گفت‌وگو یافت نشد.', 404);

      const body = await readJsonBody<{ content: string; mode?: string; lang?: AppLanguage }>(req);
      const userContent = (body.content ?? '').trim();
      if (!userContent) return errorResponse('متن پیام نمی‌تواند خالی باشد.', 400);

      if (body.mode?.trim()) conv.mode = body.mode.trim();

      const userMsg: AIMessage = {
        id: generateId('msg'),
        role: 'user',
        content: userContent,
        createdAt: new Date().toISOString(),
      };

      const previousMessages = [...conv.messages];
      conv.messages.push(userMsg);
      if ((conv.title === 'گفت‌وگوی جدید' || conv.title === 'New Chat') && previousMessages.length === 0) {
        conv.title = userContent.slice(0, 42) + (userContent.length > 42 ? '...' : '');
      }

      try {
        const replyText = await generateSchoolAIResponse({
          apiKey: env.GEMINI_API_KEY,
          aiServerUrl: env.AI_SERVER_URL,
          kv,
          user,
          mode: conv.mode,
          history: previousMessages,
          userMessage: userContent,
          lang: body.lang === 'en' ? 'en' : 'fa',
        });

        const assistantMsg: AIMessage = {
          id: generateId('msg'),
          role: 'assistant',
          content: replyText,
          createdAt: new Date().toISOString(),
        };
        conv.messages.push(assistantMsg);
        conv.updatedAt = new Date().toISOString();
        await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);

        return jsonResponse({ conversation: conv, assistantMessage: assistantMsg });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : 'خطا در ارتباط با سرویس هوش مصنوعی';
        const errMsg: AIMessage = {
          id: generateId('msg'),
          role: 'assistant',
          content: errMessage,
          createdAt: new Date().toISOString(),
          error: true,
        };
        conv.messages.push(errMsg);
        conv.updatedAt = new Date().toISOString();
        await kvPutJson(kv, KV_KEYS.aiConv(user.id, conv.id), conv);
        return jsonResponse({ error: errMessage, conversation: conv }, 502);
      }
    }

    // ==================== Study League («لیگ مطالعاتی») ====================
    if (path === '/api/league/config' && method === 'GET') {
      const config = await ensureLeagueConfig(kv);
      return jsonResponse({
        config,
        badgesCatalog: STUDY_BADGE_DEFINITIONS,
      });
    }

    if (path === '/api/league/config' && method === 'PATCH') {
      if (user.role !== 'admin') {
        return errorResponse('فقط مدیر سامانه مجاز به تغییر تنظیمات لیگ مطالعاتی است.', 403);
      }
      const config = await ensureLeagueConfig(kv);
      const body = await readJsonBody<{
        enabled?: boolean;
        weights?: Partial<StudyLeagueWeights>;
        rules?: Partial<typeof config.rules>;
        prizes?: StudyLeaguePrize[];
        season?: {
          title?: string;
          periodType?: StudyLeagueSeasonPeriod;
          startDate?: string;
          endDate?: string;
          allowedClassIds?: string[];
          allowedSubjectIds?: string[];
          description?: string;
        };
      }>(req);

      let weightsOrCapChanged = false;
      if (typeof body.enabled === 'boolean') config.enabled = body.enabled;

      if (body.weights) {
        const w = body.weights;
        if (w.studyHoursWeight !== undefined) config.weights.studyHoursWeight = Math.max(0, Math.min(100, Number(w.studyHoursWeight)));
        if (w.testCountWeight !== undefined) config.weights.testCountWeight = Math.max(0, Math.min(20, Number(w.testCountWeight)));
        if (w.pagesWeight !== undefined) config.weights.pagesWeight = Math.max(0, Math.min(20, Number(w.pagesWeight)));
        if (w.exercisesWeight !== undefined) config.weights.exercisesWeight = Math.max(0, Math.min(30, Number(w.exercisesWeight)));
        if (w.completionBonusWeight !== undefined) config.weights.completionBonusWeight = Math.max(0, Math.min(500, Number(w.completionBonusWeight)));
        if (w.streakWeight !== undefined) config.weights.streakWeight = Math.max(0, Math.min(100, Number(w.streakWeight)));
        weightsOrCapChanged = true;
      }

      if (body.rules) {
        const r = body.rules;
        if (r.dailyPointCap !== undefined) {
          config.rules.dailyPointCap = Math.max(20, Math.min(5000, Number(r.dailyPointCap)));
          weightsOrCapChanged = true;
        }
        if (r.minGoalCompletionForBonus !== undefined) {
          config.rules.minGoalCompletionForBonus = Math.max(10, Math.min(100, Number(r.minGoalCompletionForBonus)));
          weightsOrCapChanged = true;
        }
        if (r.suspiciousHoursThreshold !== undefined) {
          config.rules.suspiciousHoursThreshold = Math.max(2, Math.min(24, Number(r.suspiciousHoursThreshold)));
        }
        if (r.suspiciousTestsThreshold !== undefined) {
          config.rules.suspiciousTestsThreshold = Math.max(20, Math.min(2000, Number(r.suspiciousTestsThreshold)));
        }
        if (typeof r.requireApprovalAboveThreshold === 'boolean') {
          config.rules.requireApprovalAboveThreshold = r.requireApprovalAboveThreshold;
        }
        if (typeof r.requireApprovalAllLogs === 'boolean') {
          config.rules.requireApprovalAllLogs = r.requireApprovalAllLogs;
        }
        if (Array.isArray(r.eligibleGradeLevels)) {
          config.rules.eligibleGradeLevels = r.eligibleGradeLevels.map((g) => String(g));
        }
      }

      if (Array.isArray(body.prizes)) {
        config.prizes = body.prizes
          .filter((p) => p && p.title?.trim())
          .map((p) => ({
            id: p.id || generateId('prz'),
            rankFrom: Math.max(1, Number(p.rankFrom) || 1),
            rankTo: Math.max(1, Number(p.rankTo) || Number(p.rankFrom) || 1),
            title: p.title.trim(),
            description: p.description?.trim(),
            rewardType: p.rewardType || 'custom',
            coinsAmount: p.coinsAmount !== undefined ? Math.max(0, Number(p.coinsAmount)) : undefined,
            badgeCode: p.badgeCode,
          }));
      }

      if (body.season) {
        const s = body.season;
        if (s.title?.trim()) config.activeSeason.title = s.title.trim();
        if (s.periodType) config.activeSeason.periodType = s.periodType;
        if (s.startDate) config.activeSeason.startDate = toIsoDate(s.startDate);
        if (s.endDate) config.activeSeason.endDate = toIsoDate(s.endDate);
        if (Array.isArray(s.allowedClassIds)) config.activeSeason.allowedClassIds = s.allowedClassIds;
        if (Array.isArray(s.allowedSubjectIds)) config.activeSeason.allowedSubjectIds = s.allowedSubjectIds;
        if (s.description !== undefined) config.activeSeason.description = s.description.trim();
        config.activeSeason.updatedAt = new Date().toISOString();
      }

      config.updatedAt = new Date().toISOString();
      config.updatedBy = user.fullName;
      await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);

      if (weightsOrCapChanged) {
        const allLogs = await kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem);
        const participantIds = Array.from(
          new Set(allLogs.filter((l) => l.seasonId === config.activeSeason.id).map((l) => l.studentId))
        );
        for (const sid of participantIds) {
          await recomputeStudentSeasonLogs(kv, config, sid, config.activeSeason.id);
        }
      }

      await appendAuditLog(kv, user, 'تنظیمات لیگ مطالعاتی', config.activeSeason.title, 'به‌روزرسانی قوانین، ضرایب امتیاز یا جوایز لیگ');
      return jsonResponse({ config, message: 'تنظیمات لیگ مطالعاتی ذخیره شد.' });
    }

    if (path === '/api/league/season/action' && method === 'POST') {
      if (user.role !== 'admin') {
        return errorResponse('فقط مدیر سامانه مجاز به کنترل چرخه فصل لیگ است.', 403);
      }
      const body = await readJsonBody<{
        action: 'start_new' | 'pause' | 'resume' | 'extend' | 'end';
        title?: string;
        periodType?: StudyLeagueSeasonPeriod;
        startDate?: string;
        endDate?: string;
        extendDays?: number;
        allowedClassIds?: string[];
        allowedSubjectIds?: string[];
        description?: string;
      }>(req);

      if (!['start_new', 'pause', 'resume', 'extend', 'end'].includes(body.action)) {
        return errorResponse('عملیات فصل لیگ نامعتبر است.', 400);
      }

      const result = await archiveAndOptionallyResetSeason(kv, user, body);
      await appendAuditLog(kv, user, 'مدیریت فصل لیگ مطالعاتی', result.config.activeSeason.title, result.message);
      return jsonResponse(result);
    }

    if (path === '/api/league/goals' && method === 'GET') {
      const config = await ensureLeagueConfig(kv);
      const seasonId = url.searchParams.get('seasonId') || config.activeSeason.id;
      const studentIdFilter = url.searchParams.get('studentId');
      const classIdFilter = url.searchParams.get('classId');

      const [allGoals, allLogs, allClasses] = await Promise.all([
        kvGetCollection<StudyGoal>(kv, KV_KEYS.LEAGUE_GOALS_INDEX, KV_KEYS.leagueGoalItem),
        kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      let scopedGoals = allGoals.filter((g) => g.seasonId === seasonId);
      if (user.role === 'student') {
        scopedGoals = scopedGoals.filter((g) => g.studentId === user.id);
      } else if (user.role === 'teacher') {
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        scopedGoals = scopedGoals.filter((g) => g.classId && allowedClasses.has(g.classId));
      }

      if (studentIdFilter && user.role !== 'student') {
        scopedGoals = scopedGoals.filter((g) => g.studentId === studentIdFilter);
      }
      if (classIdFilter && classIdFilter !== 'all' && user.role !== 'student') {
        scopedGoals = scopedGoals.filter((g) => g.classId === classIdFilter);
      }

      const hydrated = scopedGoals
        .map((g) => hydrateGoalProgress(g, allLogs))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (user.role === 'student') {
        await checkAndNotifyDeadlines(kv, user.id, seasonId, hydrated);
      }

      return jsonResponse({ goals: hydrated });
    }

    if (path === '/api/league/goals' && method === 'POST') {
      if (user.role === 'teacher') {
        return errorResponse('تعریف هدف مطالعاتی توسط دانش‌آموز انجام می‌شود.', 403);
      }
      const config = await ensureLeagueConfig(kv);
      if (!config.enabled && user.role !== 'admin') {
        return errorResponse('لیگ مطالعاتی در حال حاضر غیرفعال است.', 403);
      }
      if (config.activeSeason.status !== 'active' && user.role !== 'admin') {
        return errorResponse('فصل جاری لیگ در حال حاضر فعال نیست.', 400);
      }

      const body = await readJsonBody<{
        studentId?: string;
        title: string;
        subjectIds: string[];
        timeframe: StudyLeagueTimeframe;
        targetHours: number;
        targetTests: number;
        targetPages?: number;
        targetExercises?: number;
        startDate: string;
        endDate: string;
        personalPlan?: string;
      }>(req);

      const targetStudentId = user.role === 'admin' && body.studentId ? body.studentId : user.id;
      const targetUser =
        targetStudentId === user.id
          ? user
          : await kvGetJson<StoredUser>(kv, KV_KEYS.user(targetStudentId));

      if (!targetUser || targetUser.role !== 'student') {
        return errorResponse('دانش‌آموز معتبر یافت نشد.', 404);
      }
      if (config.suspendedStudentIds.includes(targetUser.id)) {
        return errorResponse('حساب شما در لیگ مطالعاتی موقتاً مسدود شده است.', 403);
      }
      if (!isStudentEligibleForSeason(targetUser, config) && user.role !== 'admin') {
        return errorResponse('کلاس یا پایه تحصیلی شما در فهرست کلاس‌های مجاز این دوره لیگ نیست.', 403);
      }

      const cleanTitle = String(body.title ?? '').trim();
      if (cleanTitle.length < 2) {
        return errorResponse('عنوان هدف مطالعاتی الزامی است.', 400);
      }

      const subjectIds = Array.isArray(body.subjectIds)
        ? body.subjectIds.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (subjectIds.length === 0) {
        return errorResponse('لطفاً حداقل یک درس برای هدف مطالعاتی انتخاب کنید.', 400);
      }

      if (config.activeSeason.allowedSubjectIds.length > 0) {
        const forbidden = subjectIds.find((sid) => !config.activeSeason.allowedSubjectIds.includes(sid));
        if (forbidden) {
          return errorResponse('یکی از دروس انتخاب‌شده در فهرست دروس مجاز این فصل لیگ نیست.', 400);
        }
      }

      const targetHours = Number(body.targetHours);
      const targetTests = Number(body.targetTests ?? 0);
      const targetPages = body.targetPages !== undefined && body.targetPages !== null && Number(body.targetPages) > 0
        ? Math.round(Number(body.targetPages))
        : undefined;
      const targetExercises = body.targetExercises !== undefined && body.targetExercises !== null && Number(body.targetExercises) > 0
        ? Math.round(Number(body.targetExercises))
        : undefined;

      if (!Number.isFinite(targetHours) || targetHours <= 0 || targetHours > 500) {
        return errorResponse('مدت زمان مطالعه هدف باید عددی معتبر بین ۱ تا ۵۰۰ ساعت باشد.', 400);
      }
      if (!Number.isFinite(targetTests) || targetTests < 0 || targetTests > 10000) {
        return errorResponse('تعداد تست هدف نامعتبر است.', 400);
      }

      const startDate = toIsoDate(body.startDate);
      const endDate = toIsoDate(body.endDate);
      if (endDate < startDate) {
        return errorResponse('تاریخ پایان هدف نمی‌تواند قبل از تاریخ شروع باشد.', 400);
      }

      const timeframe: StudyLeagueTimeframe =
        body.timeframe === 'daily' || body.timeframe === 'weekly' ? body.timeframe : 'monthly';

      const [allSubjects, allClasses] = await Promise.all([
        kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);
      const subjectMap = new Map(allSubjects.map((s) => [s.id, s.name]));
      const classMap = new Map(allClasses.map((c) => [c.id, c.name]));

      const nowIso = new Date().toISOString();
      const goal: StudyGoal = {
        id: generateId('lgg'),
        seasonId: config.activeSeason.id,
        studentId: targetUser.id,
        studentName: targetUser.fullName,
        classId: targetUser.classId,
        className: classMap.get(targetUser.classId ?? '') ?? '—',
        title: cleanTitle,
        subjectIds,
        subjectNames: subjectIds.map((sid) => subjectMap.get(sid) ?? sid),
        timeframe,
        targetHours,
        targetTests: Math.round(targetTests),
        targetPages,
        targetExercises,
        startDate,
        endDate,
        personalPlan: body.personalPlan?.trim() || undefined,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await kvPutJson(kv, KV_KEYS.leagueGoalItem(goal.id), goal);
      await kvAddToIndex(kv, KV_KEYS.LEAGUE_GOALS_INDEX, goal.id);

      const allLogs = await kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem);
      const hydrated = hydrateGoalProgress(goal, allLogs);
      return jsonResponse({ goal: hydrated, message: 'هدف مطالعاتی با موفقیت در لیگ ثبت شد.' }, 201);
    }

    if (path.match(/^\/api\/league\/goals\/[^/]+$/) && method === 'PATCH') {
      const goalId = path.split('/')[4];
      const existing = await kvGetJson<StudyGoal>(kv, KV_KEYS.leagueGoalItem(goalId));
      if (!existing) return errorResponse('هدف مطالعاتی یافت نشد.', 404);
      if (user.role === 'teacher') return errorResponse('شما مجوز ویرایش اهداف دانش‌آموزان را ندارید.', 403);
      if (user.role === 'student' && existing.studentId !== user.id) {
        return errorResponse('فقط مجاز به ویرایش اهداف مطالعاتی خود هستید.', 403);
      }

      const body = await readJsonBody<Partial<StudyGoal>>(req);
      if (body.title !== undefined && body.title.trim()) existing.title = body.title.trim();
      if (Array.isArray(body.subjectIds) && body.subjectIds.length > 0) {
        const allSubjects = await kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem);
        const subjectMap = new Map(allSubjects.map((s) => [s.id, s.name]));
        existing.subjectIds = body.subjectIds;
        existing.subjectNames = body.subjectIds.map((sid) => subjectMap.get(sid) ?? sid);
      }
      if (body.timeframe && ['daily', 'weekly', 'monthly'].includes(body.timeframe)) {
        existing.timeframe = body.timeframe;
      }
      if (body.targetHours !== undefined && Number(body.targetHours) > 0) {
        existing.targetHours = Number(body.targetHours);
      }
      if (body.targetTests !== undefined && Number(body.targetTests) >= 0) {
        existing.targetTests = Math.round(Number(body.targetTests));
      }
      if (body.targetPages !== undefined) {
        existing.targetPages = Number(body.targetPages) > 0 ? Math.round(Number(body.targetPages)) : undefined;
      }
      if (body.targetExercises !== undefined) {
        existing.targetExercises = Number(body.targetExercises) > 0 ? Math.round(Number(body.targetExercises)) : undefined;
      }
      if (body.startDate) existing.startDate = toIsoDate(body.startDate);
      if (body.endDate) existing.endDate = toIsoDate(body.endDate);
      if (body.personalPlan !== undefined) existing.personalPlan = body.personalPlan.trim() || undefined;
      existing.updatedAt = new Date().toISOString();

      await kvPutJson(kv, KV_KEYS.leagueGoalItem(existing.id), existing);
      const config = await ensureLeagueConfig(kv);
      const { goalsWithProgress } = await recomputeStudentSeasonLogs(kv, config, existing.studentId, existing.seasonId);
      const updatedGoal = goalsWithProgress.find((g) => g.id === existing.id) ?? existing;
      return jsonResponse({ goal: updatedGoal, message: 'هدف مطالعاتی به‌روزرسانی شد.' });
    }

    if (path.match(/^\/api\/league\/goals\/[^/]+$/) && method === 'DELETE') {
      const goalId = path.split('/')[4];
      const existing = await kvGetJson<StudyGoal>(kv, KV_KEYS.leagueGoalItem(goalId));
      if (!existing) return errorResponse('هدف مطالعاتی یافت نشد.', 404);
      if (user.role === 'teacher') return errorResponse('شما مجوز حذف اهداف دانش‌آموزان را ندارید.', 403);
      if (user.role === 'student' && existing.studentId !== user.id) {
        return errorResponse('فقط مجاز به حذف اهداف مطالعاتی خود هستید.', 403);
      }

      const allLogs = await kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem);
      const goalLogs = allLogs.filter((l) => l.goalId === goalId);
      for (const gl of goalLogs) {
        await kv.delete(KV_KEYS.leagueLogItem(gl.id));
        await kvRemoveFromIndex(kv, KV_KEYS.LEAGUE_LOGS_INDEX, gl.id);
      }
      await kv.delete(KV_KEYS.leagueGoalItem(goalId));
      await kvRemoveFromIndex(kv, KV_KEYS.LEAGUE_GOALS_INDEX, goalId);

      const config = await ensureLeagueConfig(kv);
      await recomputeStudentSeasonLogs(kv, config, existing.studentId, existing.seasonId);
      if (user.role === 'admin') {
        await appendAuditLog(kv, user, 'حذف هدف مطالعاتی', existing.studentName || existing.studentId, existing.title);
      }
      return jsonResponse({ ok: true, message: 'هدف مطالعاتی و گزارش‌های مرتبط حذف شدند.' });
    }

    if (path === '/api/league/logs' && method === 'GET') {
      const config = await ensureLeagueConfig(kv);
      const seasonId = url.searchParams.get('seasonId') || config.activeSeason.id;
      const statusFilter = url.searchParams.get('status');
      const studentIdFilter = url.searchParams.get('studentId');
      const goalIdFilter = url.searchParams.get('goalId');
      const flaggedOnly = url.searchParams.get('flaggedOnly') === 'true';

      const [allLogs, allClasses] = await Promise.all([
        kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      ]);

      let scoped = allLogs.filter((l) => l.seasonId === seasonId);
      if (user.role === 'student') {
        scoped = scoped.filter((l) => l.studentId === user.id);
      } else if (user.role === 'teacher') {
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        scoped = scoped.filter((l) => l.classId && allowedClasses.has(l.classId));
      }

      if (statusFilter && statusFilter !== 'all') {
        scoped = scoped.filter((l) => l.status === statusFilter);
      }
      if (studentIdFilter && user.role !== 'student') {
        scoped = scoped.filter((l) => l.studentId === studentIdFilter);
      }
      if (goalIdFilter) {
        scoped = scoped.filter((l) => l.goalId === goalIdFilter);
      }
      if (flaggedOnly && user.role !== 'student') {
        scoped = scoped.filter((l) => Boolean(l.flaggedReason));
      }

      scoped.sort((a, b) => `${b.date}_${b.createdAt}`.localeCompare(`${a.date}_${a.createdAt}`));
      return jsonResponse({ logs: scoped });
    }

    if (path === '/api/league/logs' && method === 'POST') {
      if (user.role !== 'student') {
        return errorResponse('ثبت عملکرد روزانه مطالعه مخصوص دانش‌آموزان است.', 403);
      }
      const config = await ensureLeagueConfig(kv);
      if (!config.enabled) {
        return errorResponse('لیگ مطالعاتی در حال حاضر غیرفعال است.', 403);
      }
      if (config.activeSeason.status !== 'active') {
        return errorResponse('ثبت گزارش در وضعیت فعلی فصل لیگ مجاز نیست.', 400);
      }
      if (config.suspendedStudentIds.includes(user.id)) {
        return errorResponse('حساب شما در لیگ مطالعاتی موقتاً تعلیق شده است.', 403);
      }

      const body = await readJsonBody<{
        goalId: string;
        date?: string;
        hours: number;
        testCount: number;
        pagesRead?: number;
        exercisesDone?: number;
        notes?: string;
      }>(req);

      const goal = await kvGetJson<StudyGoal>(kv, KV_KEYS.leagueGoalItem(body.goalId));
      if (!goal || goal.studentId !== user.id) {
        return errorResponse('هدف مطالعاتی انتخاب‌شده یافت نشد یا متعلق به شما نیست.', 404);
      }

      const hours = Number(body.hours);
      const testCount = Math.round(Number(body.testCount ?? 0));
      const pagesRead = Math.round(Number(body.pagesRead ?? 0));
      const exercisesDone = Math.round(Number(body.exercisesDone ?? 0));

      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return errorResponse('ساعت مطالعه باید بین ۰.۱ تا ۲۴ ساعت باشد.', 400);
      }
      if (!Number.isFinite(testCount) || testCount < 0 || testCount > 2000) {
        return errorResponse('تعداد تست ثبت‌شده نامعتبر است.', 400);
      }
      if (!Number.isFinite(pagesRead) || pagesRead < 0 || pagesRead > 2000) {
        return errorResponse('تعداد صفحات مطالعه‌شده نامعتبر است.', 400);
      }
      if (!Number.isFinite(exercisesDone) || exercisesDone < 0 || exercisesDone > 1000) {
        return errorResponse('تعداد تمرین یا تکلیف نامعتبر است.', 400);
      }

      const logDate = toIsoDate(body.date);
      const tomorrow = toIsoDate(new Date(Date.now() + 86400000));
      if (logDate > tomorrow) {
        return errorResponse('ثبت عملکرد برای تاریخ‌های آینده مجاز نیست.', 400);
      }

      // Rank snapshot before logging
      const beforeLb = await computeLeaderboard(kv, { period: 'all' });
      const prevRank = beforeLb.entries.find((e) => e.studentId === user.id)?.rank ?? null;

      // Suspicious entry & daily cumulative checks
      const allLogs = await kvGetCollection<StudyLog>(kv, KV_KEYS.LEAGUE_LOGS_INDEX, KV_KEYS.leagueLogItem);
      const sameDayLogs = allLogs.filter(
        (l) => l.studentId === user.id && l.seasonId === config.activeSeason.id && l.date === logDate && l.status !== 'rejected'
      );
      const sameDayHours = sameDayLogs.reduce((s, l) => s + l.hours, 0) + hours;
      const sameDayTests = sameDayLogs.reduce((s, l) => s + l.testCount, 0) + testCount;

      const reasons: string[] = [];
      if (hours > config.rules.suspiciousHoursThreshold || sameDayHours > config.rules.suspiciousHoursThreshold) {
        reasons.push(`مجموع ساعات مطالعه در این روز (${sameDayHours.toFixed(1)} ساعت) بیش از آستانه مجاز است`);
      }
      if (testCount > config.rules.suspiciousTestsThreshold || sameDayTests > config.rules.suspiciousTestsThreshold) {
        reasons.push(`مجموع تست‌های ثبت‌شده در این روز (${sameDayTests} تست) نیازمند بررسی دبیر است`);
      }
      if (config.rules.requireApprovalAllLogs) {
        reasons.push('نیازمند تأیید معلم طبق تنظیمات لیگ');
      }

      const flaggedReason = reasons.length > 0 ? reasons.join('؛ ') : undefined;
      const needsReview =
        config.rules.requireApprovalAllLogs ||
        (config.rules.requireApprovalAboveThreshold && Boolean(flaggedReason));

      const status: StudyLogStatus = needsReview ? 'pending_review' : 'approved';
      const nowIso = new Date().toISOString();

      const newLog: StudyLog = {
        id: generateId('lgl'),
        seasonId: config.activeSeason.id,
        goalId: goal.id,
        goalTitle: goal.title,
        studentId: user.id,
        studentName: user.fullName,
        classId: user.classId,
        className: goal.className,
        subjectIds: goal.subjectIds,
        subjectNames: goal.subjectNames,
        date: logDate,
        hours: Math.round(hours * 100) / 100,
        testCount,
        pagesRead,
        exercisesDone,
        notes: body.notes?.trim() || undefined,
        status,
        flaggedReason,
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
        editHistory: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await kvPutJson(kv, KV_KEYS.leagueLogItem(newLog.id), newLog);
      await kvAddToIndex(kv, KV_KEYS.LEAGUE_LOGS_INDEX, newLog.id);

      const { goalsWithProgress } = await recomputeStudentSeasonLogs(kv, config, user.id, config.activeSeason.id);
      await evaluateStudentBadges(kv, config, user.id);
      await checkAndNotifyDeadlines(kv, user.id, config.activeSeason.id, goalsWithProgress);

      const refreshedLog = (await kvGetJson<StudyLog>(kv, KV_KEYS.leagueLogItem(newLog.id))) ?? newLog;

      await createLeagueNotification(kv, {
        userId: user.id,
        seasonId: config.activeSeason.id,
        type: 'log_recorded',
        title: needsReview ? 'گزارش مطالعه ثبت و در صف بررسی قرار گرفت' : 'گزارش مطالعه با موفقیت ثبت شد',
        body: needsReview
          ? `عملکرد تاریخ ${logDate} (${hours} ساعت، ${testCount} تست) ثبت شد و پس از تأیید معلم امتیاز آن اعمال می‌شود.`
          : `عملکرد تاریخ ${logDate} ثبت و ${refreshedLog.computedPoints} امتیاز توسط سامانه محاسبه شد.`,
        relatedId: refreshedLog.id,
      });

      const afterLb = await computeLeaderboard(kv, { period: 'all' });
      const newRank = afterLb.entries.find((e) => e.studentId === user.id)?.rank ?? null;
      if (newRank !== null && (prevRank === null || newRank !== prevRank)) {
        await createLeagueNotification(kv, {
          userId: user.id,
          seasonId: config.activeSeason.id,
          type: 'rank_changed',
          title:
            prevRank === null
              ? `ورود به رده‌بندی لیگ با رتبه ${newRank}`
              : newRank < prevRank
                ? `صعود به رتبه ${newRank} در لیگ مطالعاتی`
                : `تغییر رتبه در لیگ مطالعاتی (رتبه ${newRank})`,
          body:
            prevRank === null
              ? `شما با ثبت عملکرد جدید در رتبه ${newRank} جدول لیگ قرار گرفتید.`
              : `رتبه شما از ${prevRank} به ${newRank} تغییر یافت.`,
        });
      }

      return jsonResponse(
        {
          log: refreshedLog,
          goals: goalsWithProgress,
          message: needsReview
            ? 'گزارش ثبت شد و برای بررسی به معلم ارجاع گردید.'
            : `عملکرد با موفقیت ثبت شد (+${refreshedLog.computedPoints} امتیاز).`,
        },
        201
      );
    }

    if (path.match(/^\/api\/league\/logs\/[^/]+$/) && method === 'PATCH') {
      const logId = path.split('/')[4];
      const existing = await kvGetJson<StudyLog>(kv, KV_KEYS.leagueLogItem(logId));
      if (!existing) return errorResponse('گزارش مطالعه یافت نشد.', 404);

      const config = await ensureLeagueConfig(kv);

      if (user.role === 'student') {
        if (existing.studentId !== user.id) {
          return errorResponse('فقط مجاز به ویرایش گزارش‌های خود هستید.', 403);
        }
        if (existing.status !== 'pending_review') {
          return errorResponse('گزارش‌های تأییدشده قابل ویرایش مستقیم نیستند؛ برای اصلاح با معلم یا مدیر هماهنگ کنید.', 403);
        }
        const body = await readJsonBody<{
          hours?: number;
          testCount?: number;
          pagesRead?: number;
          exercisesDone?: number;
          notes?: string;
        }>(req);
        if (body.hours !== undefined) {
          const h = Number(body.hours);
          if (!Number.isFinite(h) || h <= 0 || h > 24) return errorResponse('ساعت مطالعه نامعتبر است.', 400);
          existing.hours = Math.round(h * 100) / 100;
        }
        if (body.testCount !== undefined) existing.testCount = Math.max(0, Math.min(2000, Math.round(Number(body.testCount))));
        if (body.pagesRead !== undefined) existing.pagesRead = Math.max(0, Math.min(2000, Math.round(Number(body.pagesRead))));
        if (body.exercisesDone !== undefined) existing.exercisesDone = Math.max(0, Math.min(1000, Math.round(Number(body.exercisesDone))));
        if (body.notes !== undefined) existing.notes = body.notes.trim() || undefined;
        existing.updatedAt = new Date().toISOString();
        await kvPutJson(kv, KV_KEYS.leagueLogItem(existing.id), existing);
        return jsonResponse({ log: existing, message: 'گزارش در انتظار بررسی ویرایش شد.' });
      }

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!existing.classId || !allowed.has(existing.classId)) {
          return errorResponse('شما فقط مجاز به ویرایش گزارش دانش‌آموزان کلاس‌های خود هستید.', 403);
        }
      }

      const body = await readJsonBody<{
        hours?: number;
        testCount?: number;
        pagesRead?: number;
        exercisesDone?: number;
        date?: string;
        notes?: string;
        status?: StudyLogStatus;
        reason?: string;
      }>(req);

      const updated = await applyAdminOrTeacherLogEdit(kv, config, user, existing, body);
      await appendAuditLog(
        kv,
        user,
        'ویرایش عملکرد لیگ مطالعاتی',
        updated.studentName || updated.studentId,
        `تاریخ ${updated.date} · ساعت: ${updated.hours} · تست: ${updated.testCount} (${body.reason || 'اصلاح گزارش'})`
      );
      return jsonResponse({ log: updated, message: 'گزارش مطالعه ویرایش و سوابق تغییرات ثبت شد.' });
    }

    if (path.match(/^\/api\/league\/logs\/[^/]+$/) && method === 'DELETE') {
      const logId = path.split('/')[4];
      const existing = await kvGetJson<StudyLog>(kv, KV_KEYS.leagueLogItem(logId));
      if (!existing) return errorResponse('گزارش مطالعه یافت نشد.', 404);

      if (user.role === 'student' && existing.studentId !== user.id) {
        return errorResponse('فقط مجاز به حذف گزارش‌های خود هستید.', 403);
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!existing.classId || !allowed.has(existing.classId)) {
          return errorResponse('دسترسی غیرمجاز به گزارش دانش‌آموز کلاس دیگر.', 403);
        }
      }

      await kv.delete(KV_KEYS.leagueLogItem(logId));
      await kvRemoveFromIndex(kv, KV_KEYS.LEAGUE_LOGS_INDEX, logId);

      const config = await ensureLeagueConfig(kv);
      await recomputeStudentSeasonLogs(kv, config, existing.studentId, existing.seasonId);
      if (user.role !== 'student') {
        await appendAuditLog(
          kv,
          user,
          'حذف گزارش لیگ مطالعاتی',
          existing.studentName || existing.studentId,
          `تاریخ ${existing.date} · ${existing.hours} ساعت مطالعه`
        );
      }
      return jsonResponse({ ok: true, message: 'گزارش عملکرد حذف و امتیازها بازمحاسبه شد.' });
    }

    if (path.match(/^\/api\/league\/logs\/[^/]+\/review$/) && method === 'POST') {
      if (user.role === 'student') {
        return errorResponse('دانش‌آموز مجاز به تأیید یا رد گزارش‌ها نیست.', 403);
      }
      const logId = path.split('/')[4];
      const existing = await kvGetJson<StudyLog>(kv, KV_KEYS.leagueLogItem(logId));
      if (!existing) return errorResponse('گزارش مطالعه یافت نشد.', 404);

      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!existing.classId || !allowed.has(existing.classId)) {
          return errorResponse('فقط مجاز به بررسی گزارش‌های دانش‌آموزان کلاس‌های خود هستید.', 403);
        }
      }

      const body = await readJsonBody<{ status: 'approved' | 'rejected'; reviewNote?: string }>(req);
      if (body.status !== 'approved' && body.status !== 'rejected') {
        return errorResponse('وضعیت بررسی باید تأیید یا رد باشد.', 400);
      }

      const config = await ensureLeagueConfig(kv);
      const updated = await applyAdminOrTeacherLogEdit(kv, config, user, existing, {
        status: body.status,
        reason: body.reviewNote?.trim() || (body.status === 'approved' ? 'تأیید عملکرد توسط معلم' : 'رد گزارش نیازمند اصلاح'),
      });
      updated.reviewNote = body.reviewNote?.trim() || undefined;
      await kvPutJson(kv, KV_KEYS.leagueLogItem(updated.id), updated);

      await createLeagueNotification(kv, {
        userId: updated.studentId,
        seasonId: updated.seasonId,
        type: 'log_reviewed',
        title: body.status === 'approved' ? 'گزارش مطالعه شما تأیید شد' : 'گزارش مطالعه شما نیاز به اصلاح دارد',
        body:
          body.status === 'approved'
            ? `گزارش تاریخ ${updated.date} توسط ${user.fullName} تأیید شد و ${updated.computedPoints} امتیاز ثبت گردید.`
            : `گزارش تاریخ ${updated.date} توسط ${user.fullName} تأیید نشد.${updated.reviewNote ? ` توضیح: ${updated.reviewNote}` : ''}`,
        relatedId: updated.id,
      });

      await appendAuditLog(
        kv,
        user,
        body.status === 'approved' ? 'تأیید گزارش لیگ' : 'رد گزارش لیگ',
        updated.studentName || updated.studentId,
        `تاریخ ${updated.date} · امتیاز: ${updated.computedPoints}`
      );

      return jsonResponse({
        log: updated,
        message: body.status === 'approved' ? 'گزارش تأیید و امتیاز آن اعمال شد.' : 'گزارش رد شد و به دانش‌آموز اطلاع داده شد.',
      });
    }

    if (path === '/api/league/feedback' && method === 'GET') {
      const config = await ensureLeagueConfig(kv);
      const seasonId = url.searchParams.get('seasonId') || config.activeSeason.id;
      const studentIdFilter = url.searchParams.get('studentId');

      const [allFeedbacks, allClasses, allUsers] = await Promise.all([
        kvGetCollection<StudyFeedback>(kv, KV_KEYS.LEAGUE_FEEDBACKS_INDEX, KV_KEYS.leagueFeedbackItem),
        kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
        kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
      ]);

      let scoped = allFeedbacks.filter((f) => f.seasonId === seasonId);
      if (user.role === 'student') {
        scoped = scoped.filter((f) => f.studentId === user.id);
      } else if (user.role === 'teacher') {
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        const allowedStuIds = new Set(
          allUsers.filter((u) => u.role === 'student' && u.classId && allowed.has(u.classId)).map((u) => u.id)
        );
        scoped = scoped.filter((f) => allowedStuIds.has(f.studentId));
      }
      if (studentIdFilter && user.role !== 'student') {
        scoped = scoped.filter((f) => f.studentId === studentIdFilter);
      }

      scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return jsonResponse({ feedbacks: scoped });
    }

    if (path === '/api/league/feedback' && method === 'POST') {
      if (user.role === 'student') {
        return errorResponse('فقط معلمان و مدیریت مجاز به ارسال بازخورد تشویقی هستند.', 403);
      }
      const body = await readJsonBody<{
        studentId: string;
        goalId?: string;
        logId?: string;
        message: string;
        encouragementTag?: StudyFeedback['encouragementTag'];
      }>(req);

      const cleanMsg = String(body.message ?? '').trim();
      if (!body.studentId || !cleanMsg) {
        return errorResponse('انتخاب دانش‌آموز و متن پیام تشویقی الزامی است.', 400);
      }

      const targetStu = await kvGetJson<StoredUser>(kv, KV_KEYS.user(body.studentId));
      if (!targetStu || targetStu.role !== 'student') {
        return errorResponse('دانش‌آموز یافت نشد.', 404);
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!targetStu.classId || !allowed.has(targetStu.classId)) {
          return errorResponse('فقط مجاز به ارسال بازخورد برای دانش‌آموزان کلاس‌های خود هستید.', 403);
        }
      }

      const config = await ensureLeagueConfig(kv);
      const feedback: StudyFeedback = {
        id: generateId('lgf'),
        seasonId: config.activeSeason.id,
        studentId: targetStu.id,
        teacherId: user.id,
        teacherName: user.fullName,
        goalId: body.goalId,
        logId: body.logId,
        message: cleanMsg,
        encouragementTag: body.encouragementTag || 'great_effort',
        createdAt: new Date().toISOString(),
      };
      await kvPutJson(kv, KV_KEYS.leagueFeedbackItem(feedback.id), feedback);
      await kvAddToIndex(kv, KV_KEYS.LEAGUE_FEEDBACKS_INDEX, feedback.id);

      await createLeagueNotification(kv, {
        userId: targetStu.id,
        seasonId: config.activeSeason.id,
        type: 'teacher_feedback',
        title: `بازخورد تشویقی جدید از ${user.fullName}`,
        body: cleanMsg,
        relatedId: feedback.id,
      });

      await appendAuditLog(kv, user, 'ارسال بازخورد لیگ مطالعاتی', targetStu.fullName, cleanMsg.slice(0, 80));
      return jsonResponse({ feedback, message: 'بازخورد تشویقی با موفقیت برای دانش‌آموز ارسال شد.' }, 201);
    }

    if (path === '/api/league/leaderboard' && method === 'GET') {
      const periodParam = url.searchParams.get('period');
      const period: 'all' | 'weekly' | 'monthly' =
        periodParam === 'weekly' || periodParam === 'monthly' ? periodParam : 'all';
      const classIdFilter = url.searchParams.get('classId') || undefined;
      const gradeLevelFilter = url.searchParams.get('gradeLevel') || undefined;
      const subjectIdFilter = url.searchParams.get('subjectId') || undefined;

      const { config, entries } = await computeLeaderboard(kv, {
        period,
        classIdFilter,
        gradeLevelFilter,
        subjectIdFilter,
      });

      let visibleEntries = entries;
      if (user.role === 'teacher' && url.searchParams.get('scope') === 'mine') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        visibleEntries = entries.filter((e) => e.classId && allowed.has(e.classId));
      }

      const myEntry = user.role === 'student' ? entries.find((e) => e.studentId === user.id) ?? null : null;
      return jsonResponse({
        config,
        leaderboard: visibleEntries,
        myEntry,
        prizes: config.prizes,
      });
    }

    if (path === '/api/league/hall-of-fame' && method === 'GET') {
      const config = await ensureLeagueConfig(kv);
      const hallOfFame = await computeHallOfFame(kv);
      return jsonResponse({ hallOfFame, season: config.activeSeason, prizes: config.prizes });
    }

    if (path === '/api/league/analytics' && method === 'GET') {
      const classIdFilter = url.searchParams.get('classId') || undefined;
      if (user.role === 'student') {
        const studentAnalytics = await computeStudentAnalytics(kv, user.id);
        return jsonResponse({ studentAnalytics });
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        const teacherAnalytics = await computeTeacherLeagueAnalytics(kv, allowed, classIdFilter);
        return jsonResponse({ teacherAnalytics });
      }
      const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
      const allClassSet = new Set(allClasses.map((c) => c.id));
      const [adminAnalytics, teacherAnalytics] = await Promise.all([
        computeAdminLeagueAnalytics(kv),
        computeTeacherLeagueAnalytics(kv, allClassSet, classIdFilter),
      ]);
      return jsonResponse({ adminAnalytics, teacherAnalytics });
    }

    if (path === '/api/league/notifications' && method === 'GET') {
      const allNotifs = await kvGetCollection<StudyLeagueNotification>(
        kv,
        KV_KEYS.LEAGUE_NOTIFICATIONS_INDEX,
        KV_KEYS.leagueNotificationItem
      );
      const mine = allNotifs
        .filter((n) => n.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 60);
      return jsonResponse({
        notifications: mine,
        unreadCount: mine.filter((n) => !n.read).length,
      });
    }

    if (path === '/api/league/notifications/read' && method === 'POST') {
      const body = await readJsonBody<{ ids?: string[]; all?: boolean }>(req);
      const allNotifs = await kvGetCollection<StudyLeagueNotification>(
        kv,
        KV_KEYS.LEAGUE_NOTIFICATIONS_INDEX,
        KV_KEYS.leagueNotificationItem
      );
      const idSet = Array.isArray(body.ids) ? new Set(body.ids) : null;
      let marked = 0;
      for (const n of allNotifs) {
        if (n.userId !== user.id || n.read) continue;
        if (body.all || (idSet && idSet.has(n.id))) {
          n.read = true;
          await kvPutJson(kv, KV_KEYS.leagueNotificationItem(n.id), n);
          marked++;
        }
      }
      return jsonResponse({ ok: true, marked });
    }

    if (path === '/api/league/badges' && method === 'GET') {
      const requestedStudentId = url.searchParams.get('studentId');
      const targetStudentId =
        user.role === 'student' || !requestedStudentId ? user.id : requestedStudentId;

      if (user.role === 'teacher' && targetStudentId !== user.id) {
        const stu = await kvGetJson<StoredUser>(kv, KV_KEYS.user(targetStudentId));
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!stu || !stu.classId || !allowed.has(stu.classId)) {
          return errorResponse('دسترسی غیرمجاز', 403);
        }
      }

      const earned = await getStudentEarnedBadgesSummary(kv, targetStudentId);
      return jsonResponse({
        definitions: STUDY_BADGE_DEFINITIONS,
        earned,
      });
    }

    if (path === '/api/league/badges/award' && method === 'POST') {
      if (user.role === 'student') {
        return errorResponse('دانش‌آموز مجاز به اعطای نشان نیست.', 403);
      }
      const body = await readJsonBody<{
        studentId: string;
        code: Parameters<typeof awardManualBadge>[3];
        awardReason?: string;
      }>(req);
      const stu = await kvGetJson<StoredUser>(kv, KV_KEYS.user(body.studentId));
      if (!stu || stu.role !== 'student') {
        return errorResponse('دانش‌آموز یافت نشد.', 404);
      }
      if (user.role === 'teacher') {
        const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
        const allowed = getTeacherAllowedClassIds(user, allClasses);
        if (!stu.classId || !allowed.has(stu.classId)) {
          return errorResponse('فقط مجاز به اعطای نشان به دانش‌آموزان کلاس‌های خود هستید.', 403);
        }
      }

      const config = await ensureLeagueConfig(kv);
      const badge = await awardManualBadge(
        kv,
        config,
        stu.id,
        body.code,
        body.awardReason || 'اعطای نشان افتخار توسط مسئول آموزشی',
        user.fullName
      );
      await appendAuditLog(kv, user, 'اعطای نشان لیگ مطالعاتی', stu.fullName, badge.titleFa);
      return jsonResponse({ badge, message: `نشان «${badge.titleFa}» به ${stu.fullName} اعطا شد.` }, 201);
    }

    if (path === '/api/league/suspend' && method === 'POST') {
      if (user.role !== 'admin') {
        return errorResponse('فقط مدیر سامانه مجاز به مسدودسازی موقت شرکت‌کنندگان است.', 403);
      }
      const body = await readJsonBody<{ studentId: string; suspended: boolean; reason?: string }>(req);
      const stu = await kvGetJson<StoredUser>(kv, KV_KEYS.user(body.studentId));
      if (!stu || stu.role !== 'student') {
        return errorResponse('دانش‌آموز یافت نشد.', 404);
      }

      const config = await ensureLeagueConfig(kv);
      const nextSet = new Set(config.suspendedStudentIds);
      if (body.suspended) nextSet.add(stu.id);
      else nextSet.delete(stu.id);
      config.suspendedStudentIds = Array.from(nextSet);
      config.updatedAt = new Date().toISOString();
      config.updatedBy = user.fullName;
      await kvPutJson(kv, KV_KEYS.LEAGUE_CONFIG, config);

      await recomputeStudentSeasonLogs(kv, config, stu.id, config.activeSeason.id);

      await createLeagueNotification(kv, {
        userId: stu.id,
        seasonId: config.activeSeason.id,
        type: 'log_reviewed',
        title: body.suspended ? 'تعلیق موقت در لیگ مطالعاتی' : 'رفع تعلیق در لیگ مطالعاتی',
        body: body.suspended
          ? `حضور شما در لیگ مطالعاتی موقتاً متوقف شد.${body.reason ? ` علت: ${body.reason}` : ''}`
          : 'محدودیت حضور شما در لیگ مطالعاتی برطرف شد و می‌توانید دوباره عملکرد خود را ثبت کنید.',
      });

      await appendAuditLog(
        kv,
        user,
        body.suspended ? 'تعلیق شرکت‌کننده لیگ' : 'رفع تعلیق شرکت‌کننده لیگ',
        stu.fullName,
        body.reason || ''
      );

      return jsonResponse({
        config,
        message: body.suspended
          ? `${stu.fullName} موقتاً از لیگ تعلیق شد.`
          : `تعلیق ${stu.fullName} برطرف شد.`,
      });
    }

    if (path === '/api/league/archives' && method === 'GET') {
      const archives = await kvGetCollection<StudyLeagueArchive>(
        kv,
        KV_KEYS.LEAGUE_ARCHIVES_INDEX,
        KV_KEYS.leagueArchiveItem
      );
      archives.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
      return jsonResponse({ archives });
    }

    return errorResponse('مسیر درخواستی یافت نشد.', 404);
  } catch (err) {
    if (err instanceof HttpError || err instanceof RemoteAuthError) {
      return errorResponse(err.message, err.status);
    }
    console.error('API Error:', err);
    return errorResponse('خطای داخلی سرور رخ داد.', 500);
  }
}
