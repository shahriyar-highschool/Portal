import {
  type AdvancedReportCard,
  type AdvancedReportCardSubjectRow,
  type AIConversation,
  type AIMessage,
  type Announcement,
  type Assignment,
  type AttendanceRecord,
  type AttendanceStatus,
  type BulkUserImportCreatedItem,
  type BulkUserImportRow,
  type ChatContact,
  type ChatMessage,
  type ChatThreadSummary,
  type DigitalLibraryItem,
  type ExamAttempt,
  type ExamDifficulty,
  type ExamQualityAnalytics,
  type ExamQuestion,
  type ExamQuestionType,
  type GradeRecord,
  type GradeTerm,
  type OnlineExam,
  type PracticeExerciseItem,
  type PrivateTutorCitation,
  type PrivateTutorMessage,
  type PrivateTutorSession,
  type RemedialPlanItem,
  type RiskReviewNote,
  type RolePermissionConfig,
  type SchoolClass,
  type SchoolSettings,
  type StudentHonor,
  type StudentMistakeRecord,
  type StudentRiskAssessment,
  type StudyPlanTask,
  type TeacherBankQuestion,
  type TeacherSourceMaterial,
  type UserAccount,
  type UserRole,
} from '../../shared/types';

export const DEFAULT_WORKER_URL = 'https://shahriar-school-api.yashar-online-store.workers.dev';
export const DEFAULT_DEDICATED_AI_URL = 'https://mokhyar.ghaheri-maryam.workers.dev/v1/chat/completions';

interface WorkerUser {
  id: string;
  name?: string;
  fullName?: string;
  username: string;
  role: UserRole;
  grade?: string | null;
  gradeLevel?: string | null;
  className?: string | null;
  classId?: string | null;
  studentCode?: string | null;
  nationalId?: string | null;
  phone?: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  coins?: number;
  preferredLanguage?: UserAccount['preferredLanguage'];
  preferredTheme?: UserAccount['preferredTheme'];
  assignedClassIds?: string[];
  assignedSubjectIds?: string[];
  permissions?: string[];
  active?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

interface WorkerGrade {
  id: string;
  studentId: string;
  studentName?: string;
  classId?: string;
  className?: string;
  subject?: string;
  subjectId?: string;
  subjectName?: string;
  teacherId?: string;
  score: number;
  maxScore?: number;
  term?: string;
  title?: string;
  description?: string;
  note?: string;
  date?: string;
  createdAt?: string;
}

interface WorkerAttendance {
  id: string;
  studentId: string;
  studentName?: string;
  classId?: string;
  className?: string;
  subject?: string;
  subjectId?: string;
  subjectName?: string;
  teacherId?: string;
  date: string;
  status: string;
  description?: string;
  note?: string;
  createdAt?: string;
}

interface WorkerHomework {
  id: string;
  title: string;
  subject?: string;
  subjectId?: string;
  subjectName?: string;
  description?: string;
  grade?: string;
  classId?: string;
  className?: string;
  dueDate?: string;
  maxScore?: number;
  teacherId?: string;
  teacherName?: string;
  createdAt?: string;
}

interface WorkerAnnouncement {
  id: string;
  title: string;
  message?: string;
  body?: string;
  targetType?: Announcement['targetType'];
  targetGrade?: string;
  targetClass?: string;
  targetClassId?: string;
  authorId?: string;
  authorName?: string;
  createdBy?: string;
  createdById?: string;
  authorRole?: UserRole;
  priority?: Announcement['priority'];
  createdAt?: string;
}

const DEFAULT_SETTINGS: SchoolSettings = {
  schoolName: 'دبیرستان استعدادهای درخشان استاد شهریار',
  academicYear: '۱۴۰۵-۱۴۰۶',
  principalName: 'مدیر دبیرستان',
  currentTerm: 'نوبت اول',
  passingScore: 12,
  aiEnabled: true,
  allowStudentAssignmentSubmission: true,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_ROLES: RolePermissionConfig[] = [
  {
    role: 'student',
    titleFa: 'دانش‌آموز',
    descriptionFa: 'دسترسی به کارنامه، تکالیف، برنامه هفتگی، آزمون‌ها و دستیار هوش مصنوعی',
    permissions: [
      'view_own_grades',
      'view_own_attendance',
      'view_own_assignments',
      'submit_assignments',
      'view_own_schedule',
      'view_announcements',
      'use_ai_student',
    ],
  },
  {
    role: 'teacher',
    titleFa: 'دبیر',
    descriptionFa: 'مدیریت کلاس‌ها و دانش‌آموزان اختصاص‌یافته، ثبت نمرات، حضور و غیاب، تکالیف و طراحی آزمون',
    permissions: [
      'view_assigned_classes',
      'manage_assigned_grades',
      'manage_assigned_attendance',
      'manage_assigned_assignments',
      'send_class_announcements',
      'view_class_reports',
      'use_ai_teacher',
    ],
  },
  {
    role: 'admin',
    titleFa: 'مدیر سامانه',
    descriptionFa: 'دسترسی کامل به مدیریت دانش‌آموزان، معلمان، کلاس‌ها، دروس، گزارش‌ها و تنظیمات مدرسه',
    permissions: [
      'manage_users',
      'manage_roles',
      'manage_classes',
      'manage_subjects',
      'manage_grades',
      'manage_attendance',
      'manage_assignments',
      'manage_schedules',
      'manage_announcements',
      'view_reports',
      'manage_settings',
      'view_audit_logs',
      'use_ai_admin',
    ],
  },
];

const EMPTY_ATTENDANCE_STATS = {
  total: 0,
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
};

const userCache = new Map<string, UserAccount>();
const roleConfigCache = new Map<string, RolePermissionConfig | null>();
const authSettingsCache = new Map<string, SchoolSettings>();
const fullSupportCache = new Map<string, { value: boolean; checkedAt: number }>();

export function clearWorkerAuthCache(token?: string) {
  if (token) {
    userCache.delete(token);
    roleConfigCache.delete(token);
    authSettingsCache.delete(token);
  } else {
    userCache.clear();
    roleConfigCache.clear();
    authSettingsCache.clear();
  }
}

export function getWorkerBaseUrl(override?: string): string {
  const custom = (override || (import.meta.env.VITE_AUTH_SERVER_URL as string | undefined) || '').trim();
  return (custom || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

export function getDedicatedAiUrl(): string {
  const custom = ((import.meta.env.VITE_AI_SERVER_URL as string | undefined) || '').trim();
  const base = (custom || DEFAULT_DEDICATED_AI_URL).replace(/\/+$/, '');
  return base.endsWith('/v1/chat/completions') ? base : `${base}/v1/chat/completions`;
}

function getLocalAiStorageKey(userId: string): string {
  return `shahriar_ai_convs_${userId}`;
}

function readLocalAiConvs(userId: string): AIConversation[] {
  try {
    const raw = window.localStorage.getItem(getLocalAiStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AIConversation[]) : [];
  } catch {
    return [];
  }
}

function writeLocalAiConvs(userId: string, convs: AIConversation[]): void {
  try {
    window.localStorage.setItem(getLocalAiStorageKey(userId), JSON.stringify(convs.slice(0, 50)));
  } catch {
    // ignore storage quota errors
  }
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, val: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore storage errors
  }
}

const LOCAL_TOKEN_PREFIX = 'local_wk_';
const WK_EXTRA_USERS_KEY = 'shahriar_wk_extra_users';
const WK_USER_OVERRIDES_KEY = 'shahriar_wk_user_overrides';
const WK_DELETED_USERS_KEY = 'shahriar_wk_deleted_users';
const WK_SESSIONS_KEY = 'shahriar_wk_sessions';
const WK_CACHED_USERS_KEY = 'shahriar_wk_cached_users';
const WK_CACHED_SETTINGS_KEY = 'shahriar_wk_cached_settings';

interface StoredFallbackUser extends UserAccount {
  passwordHash: string;
  passwordSalt: string;
}

interface FallbackUserOverride extends Partial<UserAccount> {
  deleted?: boolean;
  passwordHash?: string;
  passwordSalt?: string;
}

interface FallbackSessionEntry {
  userId: string;
  expiresAt: number;
}

function isLocalWorkerToken(token?: string | null): boolean {
  return Boolean(token && token.startsWith(LOCAL_TOKEN_PREFIX));
}

function randomFallbackHex(bytes = 16): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

async function hashFallbackPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: enc.encode(salt),
          iterations: 100000,
          hash: 'SHA-256',
        },
        key,
        256
      );
      return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      try {
        const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${password}`));
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // fallback below
      }
    }
  }
  let hash = 2166136261;
  const input = `${salt}:${password}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeFallbackDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function generateFallbackPassword(length = 8): string {
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
  for (let i = 3; i < targetLen; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

function generateFallbackUsername(role: UserRole, taken: Set<string>): string {
  const prefix = role === 'teacher' ? 'tch' : role === 'admin' ? 'adm' : 'stu';
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 40; i++) {
    crypto.getRandomValues(bytes);
    const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 900000 + 100000;
    const candidate = `${prefix}_${num}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const fallback = `${prefix}_${Date.now().toString().slice(-6)}`;
  taken.add(fallback);
  return fallback;
}

function stripFallbackSecrets(u: StoredFallbackUser | UserAccount): UserAccount {
  const copy = { ...u } as Record<string, unknown>;
  delete copy.passwordHash;
  delete copy.passwordSalt;
  return copy as unknown as UserAccount;
}

function readExtraUsers(): StoredFallbackUser[] {
  return readLocalJson<StoredFallbackUser[]>(WK_EXTRA_USERS_KEY, []);
}

function writeExtraUsers(users: StoredFallbackUser[]): void {
  writeLocalJson(WK_EXTRA_USERS_KEY, users);
}

function readUserOverrides(): Record<string, FallbackUserOverride> {
  return readLocalJson<Record<string, FallbackUserOverride>>(WK_USER_OVERRIDES_KEY, {});
}

function writeUserOverrides(overrides: Record<string, FallbackUserOverride>): void {
  writeLocalJson(WK_USER_OVERRIDES_KEY, overrides);
}

interface DeletedFallbackUsers {
  ids: string[];
  usernames: string[];
}

const memoryDeletedUserIds = new Set<string>();
const memoryDeletedUsernames = new Set<string>();

function readDeletedUserTombstones(): { ids: Set<string>; usernames: Set<string> } {
  const fromLocal = readLocalJson<DeletedFallbackUsers>(WK_DELETED_USERS_KEY, { ids: [], usernames: [] });
  let fromSession: DeletedFallbackUsers = { ids: [], usernames: [] };
  try {
    const raw = window.sessionStorage.getItem(WK_DELETED_USERS_KEY);
    if (raw) fromSession = JSON.parse(raw) as DeletedFallbackUsers;
  } catch {
    // ignore
  }
  const overrides = readUserOverrides();
  const ids = new Set<string>([
    ...memoryDeletedUserIds,
    ...(fromLocal.ids ?? []).map((x) => String(x).trim()),
    ...(fromSession.ids ?? []).map((x) => String(x).trim()),
  ]);
  for (const [id, ov] of Object.entries(overrides)) {
    if (ov?.deleted) ids.add(id.trim());
  }
  const usernames = new Set<string>([
    ...memoryDeletedUsernames,
    ...(fromLocal.usernames ?? []).map((x) => String(x).trim().toLowerCase()),
    ...(fromSession.usernames ?? []).map((x) => String(x).trim().toLowerCase()),
  ]);
  ids.delete('');
  usernames.delete('');
  return { ids, usernames };
}

function markFallbackUserDeleted(userId: string, username?: string): void {
  const cleanId = userId.trim();
  const cleanUsername = (username ?? '').trim().toLowerCase();
  const current = readDeletedUserTombstones();
  if (cleanId) {
    current.ids.add(cleanId);
    memoryDeletedUserIds.add(cleanId);
  }
  if (cleanUsername) {
    current.usernames.add(cleanUsername);
    memoryDeletedUsernames.add(cleanUsername);
  }
  const payload: DeletedFallbackUsers = {
    ids: Array.from(current.ids),
    usernames: Array.from(current.usernames),
  };
  writeLocalJson(WK_DELETED_USERS_KEY, payload);
  try {
    window.sessionStorage.setItem(WK_DELETED_USERS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function clearFallbackUserDeleted(userId?: string, username?: string): void {
  const cleanId = (userId ?? '').trim();
  const cleanUsername = (username ?? '').trim().toLowerCase();
  const current = readDeletedUserTombstones();
  let changed = false;
  if (cleanId) {
    if (current.ids.delete(cleanId)) changed = true;
    memoryDeletedUserIds.delete(cleanId);
  }
  if (cleanUsername) {
    if (current.usernames.delete(cleanUsername)) changed = true;
    memoryDeletedUsernames.delete(cleanUsername);
  }
  if (changed) {
    const payload: DeletedFallbackUsers = {
      ids: Array.from(current.ids),
      usernames: Array.from(current.usernames),
    };
    writeLocalJson(WK_DELETED_USERS_KEY, payload);
    try {
      window.sessionStorage.setItem(WK_DELETED_USERS_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
}

function applySingleUserOverride(
  u: UserAccount,
  overrides: Record<string, FallbackUserOverride>,
  deletedTombstones?: { ids: Set<string>; usernames: Set<string> }
): UserAccount | null {
  const tombstones = deletedTombstones ?? readDeletedUserTombstones();
  const uname = (u.username ?? '').trim().toLowerCase();
  if (tombstones.ids.has(u.id) || (uname && tombstones.usernames.has(uname))) {
    return null;
  }
  const ov = overrides[u.id];
  if (ov?.deleted) return null;
  if (!ov) return u;
  const cleanOv: Record<string, unknown> = { ...ov };
  delete cleanOv.deleted;
  delete cleanOv.passwordHash;
  delete cleanOv.passwordSalt;
  return { ...u, ...(cleanOv as Partial<UserAccount>) };
}

function cacheKnownRemoteUsers(remoteUsers: UserAccount[]): void {
  const tombstones = readDeletedUserTombstones();
  const existing = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
  const map = new Map<string, UserAccount>();
  for (const u of existing) {
    const uname = (u.username ?? '').trim().toLowerCase();
    if (!tombstones.ids.has(u.id) && !(uname && tombstones.usernames.has(uname))) {
      map.set(u.id, u);
    }
  }
  for (const u of remoteUsers) {
    const uname = (u.username ?? '').trim().toLowerCase();
    if (!tombstones.ids.has(u.id) && !(uname && tombstones.usernames.has(uname))) {
      map.set(u.id, u);
    }
  }
  writeLocalJson(WK_CACHED_USERS_KEY, Array.from(map.values()));
}

function mergeAllKnownUsers(remoteUsers: UserAccount[] = []): UserAccount[] {
  const cached = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
  const extras = readExtraUsers().map(stripFallbackSecrets);
  const overrides = readUserOverrides();
  const tombstones = readDeletedUserTombstones();
  const byId = new Map<string, UserAccount>();
  for (const u of cached) byId.set(u.id, u);
  for (const u of remoteUsers) byId.set(u.id, u);
  for (const u of extras) byId.set(u.id, u);
  const result: UserAccount[] = [];
  for (const u of byId.values()) {
    const resolved = applySingleUserOverride(u, overrides, tombstones);
    if (resolved) result.push(resolved);
  }
  return result;
}

function createLocalFallbackSession(userId: string): string {
  const token = `${LOCAL_TOKEN_PREFIX}${randomFallbackHex(24)}`;
  const sessions = readLocalJson<Record<string, FallbackSessionEntry>>(WK_SESSIONS_KEY, {});
  const now = Date.now();
  for (const [k, v] of Object.entries(sessions)) {
    if (!v || v.expiresAt < now) delete sessions[k];
  }
  sessions[token] = { userId, expiresAt: now + 7 * 24 * 60 * 60 * 1000 };
  writeLocalJson(WK_SESSIONS_KEY, sessions);
  return token;
}

async function completeDedicatedAiFallback(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(getDedicatedAiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    }),
    credentials: 'omit',
  });
  if (!res.ok) throw { status: res.status, message: 'خطا در اتصال به سرور هوش مصنوعی' };
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    if (parsed.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
  } catch {
    // parse SSE lines if returned streamed
  }
  const lines = text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter((l) => l && l !== '[DONE]');
  let out = '';
  for (const l of lines) {
    try {
      const p = JSON.parse(l) as { choices?: Array<{ delta?: { content?: string } }>; delta?: string };
      out += p.choices?.[0]?.delta?.content ?? p.delta ?? '';
    } catch {
      // ignore
    }
  }
  return out;
}

function extractFallbackJson<T>(rawText: string): T | null {
  const t = rawText.trim();
  const cands = [t];
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f?.[1]) cands.unshift(f[1].trim());
  const a1 = t.indexOf('[');
  const a2 = t.lastIndexOf(']');
  if (a1 !== -1 && a2 > a1) cands.push(t.slice(a1, a2 + 1));
  const o1 = t.indexOf('{');
  const o2 = t.lastIndexOf('}');
  if (o1 !== -1 && o2 > o1) cands.push(t.slice(o1, o2 + 1));
  for (const c of cands) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // next
    }
  }
  return null;
}

function genLocalId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}_${rand}`;
}

export async function streamDedicatedAiWorkerFallback(params: {
  convId: string;
  content: string;
  mode?: string;
  lang?: string;
  token: string | null;
  onDelta: (delta: string) => void;
  onDone?: (payload: { conversation: AIConversation }) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const currentUser = await resolveWorkerUser(params.token);
  const convs = readLocalAiConvs(currentUser.id);
  const idx = convs.findIndex((c) => c.id === params.convId);
  if (idx === -1) {
    throw { status: 404, message: 'گفت‌وگو یافت نشد.' };
  }

  const conv = { ...convs[idx], messages: [...convs[idx].messages] };
  const userContent = params.content.trim();
  if (!userContent) {
    throw { status: 400, message: 'متن پیام نمی‌تواند خالی باشد.' };
  }
  if (params.mode?.trim()) {
    conv.mode = params.mode.trim();
  }

  const previousMessages = [...conv.messages];
  const userMsg: AIMessage = {
    id: genLocalId('msg'),
    role: 'user',
    content: userContent,
    createdAt: new Date().toISOString(),
  };
  conv.messages.push(userMsg);
  if ((conv.title === 'گفت‌وگوی جدید' || conv.title === 'New Chat') && previousMessages.length === 0) {
    conv.title = userContent.slice(0, 42) + (userContent.length > 42 ? '...' : '');
  }

  const langDirective =
    params.lang === 'en'
      ? 'Respond in clear, natural, well-structured English unless the user explicitly writes in Persian.'
      : 'تمام پاسخ‌ها را به زبان فارسی روان، دقیق، محترمانه و حرفه‌ای بنویس.';
  const roleLabel =
    currentUser.role === 'student'
      ? 'دانش‌آموز'
      : currentUser.role === 'teacher'
      ? 'دبیر'
      : 'مدیر مدرسه';
  const systemPrompt = [
    'تو دستیار هوش مصنوعی رسمی «دبیرستان استعدادهای درخشان استاد شهریار» هستی.',
    langDirective,
    'برای فرمول‌های ریاضی، فیزیک و شیمی از LaTeX استاندارد ($...$ و $$...$$) استفاده کن.',
    'برای خوانایی بالا، پاسخ را با Markdown استاندارد قالب‌بندی کن: از **متن پررنگ**، تیترها، فهرست‌ها، نقل‌قول، بلوک کد و جدول‌های Markdown (| ستون | ...) استفاده کن.',
    `کاربر فعلی: ${currentUser.fullName} | نقش: ${roleLabel} | حالت انتخابی: ${conv.mode}`,
  ].join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...previousMessages
      .filter((m) => !m.error && m.content.trim().length > 0)
      .slice(-14)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      })),
    { role: 'user', content: userContent },
  ];

  let response: Response;
  try {
    response = await fetch(getDedicatedAiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 4096 }),
      credentials: 'omit',
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) return;
    throw {
      status: 0,
      message: err instanceof Error ? `خطا در اتصال به سرور هوش مصنوعی: ${err.message}` : 'خطا در اتصال به سرور هوش مصنوعی.',
    };
  }

  if (!response.ok) {
    let errMsg = `خطا در سرور هوش مصنوعی (کد ${response.status})`;
    try {
      const parsed = (await response.json()) as { error?: string | { message?: string } };
      if (typeof parsed.error === 'string' && parsed.error) errMsg = parsed.error;
      else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) errMsg = parsed.error.message;
    } catch {
      // ignore non-json
    }
    throw { status: response.status, message: errMsg };
  }

  if (!response.body) {
    throw { status: 500, message: 'جریان پاسخ از سرور هوش مصنوعی دریافت نشد.' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  const processEventBlock = (evt: string) => {
    const dataLine = evt
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();

    if (!dataLine || dataLine === '[DONE]') return;
    let payload: {
      delta?: string;
      error?: string | { message?: string };
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }
    if (payload.error) {
      const errText =
        typeof payload.error === 'string' ? payload.error : payload.error.message || 'خطا در سرور هوش مصنوعی';
      throw { status: 502, message: errText };
    }
    const delta =
      payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? payload.delta ?? '';
    if (delta) {
      accumulated += delta;
      params.onDelta(delta);
    }
  };

  try {
    while (true) {
      if (params.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const evt = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processEventBlock(evt);
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    if (!params.signal?.aborted) {
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.trim()) {
        processEventBlock(buffer);
      }
    }
  } catch (err) {
    if (!params.signal?.aborted) {
      throw err;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (accumulated.trim()) {
      conv.messages.push({
        id: genLocalId('msg'),
        role: 'assistant',
        content: accumulated.trim(),
        createdAt: new Date().toISOString(),
      });
    }
    conv.updatedAt = new Date().toISOString();
    convs[idx] = conv;
    convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    writeLocalAiConvs(currentUser.id, convs);
  }
  params.onDone?.({ conversation: conv });
}

export async function streamPrivateTutorWorkerFallback(params: {
  sessionId: string;
  question: string;
  subjectId?: string;
  lang?: string;
  token: string | null;
  baseUrl?: string;
  onEvent?: (payload: Record<string, unknown>) => void;
  onDelta: (delta: string) => void;
  onDone?: (payload: { done: boolean; session: PrivateTutorSession; message: PrivateTutorMessage }) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const currentUser = await resolveWorkerUser(params.token, params.baseUrl).catch(() => null);
  const uid = currentUser?.id || 'local';
  const sessionKey = `shahriar_tutor_sessions_${uid}`;
  const sessions = readLocalJson<PrivateTutorSession[]>(sessionKey, []);
  const idx = sessions.findIndex((s) => s.id === params.sessionId);
  if (idx === -1) {
    throw { status: 404, message: 'جلسه یافت نشد.' };
  }

  const question = params.question.trim();
  if (!question) {
    throw { status: 400, message: 'متن پرسش نمی‌تواند خالی باشد.' };
  }

  const session: PrivateTutorSession = {
    ...sessions[idx],
    subjectId: params.subjectId !== undefined ? params.subjectId || undefined : sessions[idx].subjectId,
    messages: [...sessions[idx].messages],
  };

  const prevMessages = [...session.messages];
  const userMsg: PrivateTutorMessage = {
    id: genLocalId('ptm'),
    role: 'user',
    content: question,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(userMsg);
  if (prevMessages.length === 0) {
    session.title = question.slice(0, 42) + (question.length > 42 ? '...' : '');
  }

  const allSources = readLocalJson<TeacherSourceMaterial[]>('shahriar_tutor_sources', []).filter((s) => s.approved);
  const tokens = question
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const scoredPages: Array<{ score: number; source: TeacherSourceMaterial; pageNumber: number; heading?: string; content: string }> = [];
  for (const src of allSources) {
    if (session.subjectId && src.subjectId && src.subjectId !== session.subjectId) continue;
    for (const pg of src.pages || []) {
      const hay = `${src.title} ${src.chapter || ''} ${src.topic || ''} ${pg.heading || ''} ${pg.content}`.toLowerCase();
      let score = session.subjectId && src.subjectId === session.subjectId ? 2 : 0;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
      }
      if (score > 0 || scoredPages.length < 4) {
        scoredPages.push({
          score,
          source: src,
          pageNumber: pg.pageNumber,
          heading: pg.heading,
          content: pg.content,
        });
      }
    }
  }
  scoredPages.sort((a, b) => b.score - a.score);
  const picked = scoredPages.slice(0, 4);

  const citations: PrivateTutorCitation[] = picked.map((p) => ({
    sourceId: p.source.id,
    sourceTitle: p.source.title,
    chapter: p.source.chapter,
    pageNumber: p.pageNumber,
    excerpt: p.content.slice(0, 180) + (p.content.length > 180 ? '...' : ''),
  }));

  params.onEvent?.({ citations });

  const mistakes = readLocalJson<StudentMistakeRecord[]>(`shahriar_mistakes_${uid}`, []).slice(0, 5);
  const sourceBlock =
    picked.length > 0
      ? picked
          .map(
            (r, i) =>
              `[منبع ${i + 1}: عنوان="${r.source.title}" | درس="${r.source.subjectName || 'عمومی'}" | صفحه=${r.pageNumber}${r.heading ? ` | تیتر="${r.heading}"` : ''}]\n${r.content}`
          )
          .join('\n\n---\n\n')
      : 'هنوز جزوه یا منبع تأییدشده‌ای متناسب با این درس ثبت نشده است.';

  const mistakesBlock =
    mistakes.length > 0
      ? mistakes.map((m) => `- ${m.topic} (${m.mistakeType})`).join('\n')
      : 'مورد خاصی ثبت نشده است.';

  const langRule =
    params.lang === 'en'
      ? 'Respond in clear English, keeping Persian source titles intact in citations.'
      : 'پاسخ را به زبان فارسی دقیق، آموزشی و روان بنویس.';

  const systemPrompt = `تو «معلم خصوصی اختصاصی مدرسه» در دبیرستان استعدادهای درخشان استاد شهریار هستی.
قوانین پاسخ‌دهی:
1. ${langRule}
2. پاسخ را بر اساس منابع تأییدشده معلمان مدرسه بنویس و در پایان بخش‌های مهم بنویس: «[منبع: عنوان منبع | صفحه X]».
3. اگر مطلبی در منابع نبود صادقانه اعلام کن و دانش‌آموز را راهنمایی کن.
4. برای فرمول‌ها از LaTeX ($...$ و $$...$$) استفاده کن.

منابع واقعی معلمان مدرسه:
${sourceBlock}

سوابق اشتباهات دانش‌آموز:
${mistakesBlock}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...prevMessages
      .filter((m) => !m.error && m.content.trim())
      .slice(-10)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      })),
    { role: 'user', content: question },
  ];

  let response: Response;
  try {
    response = await fetch(getDedicatedAiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 4096 }),
      credentials: 'omit',
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) return;
    throw {
      status: 0,
      message: err instanceof Error ? `خطا در اتصال به سرور هوش مصنوعی: ${err.message}` : 'خطا در اتصال به سرور هوش مصنوعی.',
    };
  }

  if (!response.ok || !response.body) {
    throw { status: response.status || 502, message: `خطا در دریافت پاسخ معلم خصوصی (کد ${response.status})` };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  const processEventBlock = (evt: string) => {
    const dataLine = evt
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();

    if (!dataLine || dataLine === '[DONE]') return;
    let payload: {
      delta?: string;
      error?: string | { message?: string };
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }
    if (payload.error) {
      const errText =
        typeof payload.error === 'string' ? payload.error : payload.error.message || 'خطا در سرور هوش مصنوعی';
      throw { status: 502, message: errText };
    }
    const delta =
      payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? payload.delta ?? '';
    if (delta) {
      accumulated += delta;
      params.onDelta(delta);
    }
  };

  try {
    while (true) {
      if (params.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const evt = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processEventBlock(evt);
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    if (!params.signal?.aborted) {
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.trim()) {
        processEventBlock(buffer);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const assistantMsg: PrivateTutorMessage = {
    id: genLocalId('ptm'),
    role: 'assistant',
    content: accumulated.trim() || 'پاسخی از سرور دریافت نشد.',
    citations,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();
  sessions[idx] = session;
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeLocalJson(sessionKey, sessions);
  params.onDone?.({ done: true, session, message: assistantMsg });
}

function mapWorkerUser(u: WorkerUser): UserAccount {
  return {
    ...u,
    id: u.id,
    username: u.username,
    nationalId: u.nationalId || u.studentCode || '',
    fullName: u.fullName || u.name || u.username,
    role: u.role,
    active: u.active !== false,
    gradeLevel: u.gradeLevel || u.grade || undefined,
    classId: u.classId || u.className || undefined,
    assignedClassIds: Array.isArray(u.assignedClassIds) ? u.assignedClassIds : undefined,
    assignedSubjectIds: Array.isArray(u.assignedSubjectIds) ? u.assignedSubjectIds : undefined,
    permissions: Array.isArray(u.permissions) ? u.permissions : undefined,
    createdAt: u.createdAt || new Date().toISOString(),
  } as UserAccount;
}

function normalizeAttendanceStatus(raw: string): AttendanceStatus {
  if (raw === 'absent' || raw === 'late' || raw === 'excused' || raw === 'present') {
    return raw;
  }
  return 'present';
}

function mapWorkerGrade(g: WorkerGrade): GradeRecord {
  const subjectLabel = String(g.subjectName || g.subject || g.subjectId || 'عمومی');
  const maxScore = Number(g.maxScore ?? 20) || 20;
  return {
    id: String(g.id),
    studentId: String(g.studentId),
    studentName: g.studentName ? String(g.studentName) : undefined,
    classId: String(g.classId || g.className || ''),
    className: g.className ? String(g.className) : undefined,
    subjectId: String(g.subjectId || subjectLabel),
    subjectName: subjectLabel,
    teacherId: g.teacherId ? String(g.teacherId) : '',
    term: (g.term as GradeTerm) || 'نوبت اول',
    title: String(g.title || g.description || subjectLabel),
    score: Number(g.score ?? 0),
    maxScore,
    date: String(g.date || g.createdAt || new Date().toISOString()),
    note: g.note ? String(g.note) : g.description ? String(g.description) : undefined,
    createdAt: String(g.createdAt || new Date().toISOString()),
  };
}

function mapWorkerAttendance(a: WorkerAttendance): AttendanceRecord {
  return {
    id: String(a.id),
    studentId: String(a.studentId),
    studentName: a.studentName ? String(a.studentName) : undefined,
    classId: String(a.classId || a.className || ''),
    className: a.className ? String(a.className) : undefined,
    subjectId: a.subjectId ? String(a.subjectId) : a.subject ? String(a.subject) : undefined,
    subjectName: a.subjectName ? String(a.subjectName) : a.subject ? String(a.subject) : undefined,
    teacherId: a.teacherId ? String(a.teacherId) : '',
    date: String(a.date || a.createdAt || ''),
    status: normalizeAttendanceStatus(a.status),
    note: a.note ? String(a.note) : a.description ? String(a.description) : undefined,
    createdAt: String(a.createdAt || new Date().toISOString()),
  };
}

function mapWorkerHomework(
  h: WorkerHomework
): Assignment & { mySubmission: null; submissionsCount: number; gradedCount: number } {
  const subjectLabel = String(h.subjectName || h.subject || h.subjectId || 'عمومی');
  const classLabel = String(h.className || h.classId || h.grade || '');
  return {
    id: String(h.id),
    title: String(h.title || ''),
    description: String(h.description || ''),
    classId: String(h.classId || classLabel),
    className: classLabel || undefined,
    subjectId: String(h.subjectId || subjectLabel),
    subjectName: subjectLabel,
    teacherId: String(h.teacherId || ''),
    teacherName: h.teacherName ? String(h.teacherName) : undefined,
    dueDate: String(h.dueDate || h.createdAt || ''),
    maxScore: Number(h.maxScore ?? 20) || 20,
    createdAt: String(h.createdAt || new Date().toISOString()),
    mySubmission: null,
    submissionsCount: 0,
    gradedCount: 0,
  };
}

function mapWorkerAnnouncement(a: WorkerAnnouncement): Announcement {
  const targetType: Announcement['targetType'] =
    a.targetType ||
    (a.targetClass || a.targetClassId
      ? 'class'
      : a.targetGrade === 'students'
        ? 'students'
        : a.targetGrade === 'teachers'
          ? 'teachers'
          : 'all');
  return {
    id: String(a.id),
    title: String(a.title || ''),
    body: String(a.body ?? a.message ?? ''),
    authorId: String(a.authorId || a.createdById || ''),
    authorName: String(a.authorName || a.createdBy || 'مدیریت مدرسه'),
    authorRole: a.authorRole || 'admin',
    targetType,
    targetClassId: a.targetClassId || a.targetClass || undefined,
    priority: a.priority || 'normal',
    createdAt: String(a.createdAt || new Date().toISOString()),
  };
}

function computeAttendanceStats(records: AttendanceRecord[]) {
  return {
    total: records.length,
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    late: records.filter((r) => r.status === 'late').length,
    excused: records.filter((r) => r.status === 'excused').length,
  };
}

function synthesizeClassesFromUsers(users: UserAccount[], extraClasses: unknown[] = []): SchoolClass[] {
  const seen = new Map<string, SchoolClass>();
  for (const item of extraClasses) {
    if (typeof item === 'string' && item.trim()) {
      const cname = item.trim();
      seen.set(cname, {
        id: cname,
        name: cname,
        gradeLevel: 'هفتم',
        academicYear: DEFAULT_SETTINGS.academicYear,
        capacity: 30,
        teacherIds: [],
        subjectIds: [],
        createdAt: new Date().toISOString(),
      });
    } else if (item && typeof item === 'object') {
      const obj = item as Partial<SchoolClass>;
      const id = String(obj.id || obj.name || '').trim();
      const name = String(obj.name || obj.id || '').trim();
      if (id && name) {
        seen.set(id, {
          id,
          name,
          gradeLevel: obj.gradeLevel || 'هفتم',
          academicYear: obj.academicYear || DEFAULT_SETTINGS.academicYear,
          capacity: Number(obj.capacity) || 30,
          room: obj.room,
          teacherIds: Array.isArray(obj.teacherIds) ? obj.teacherIds : [],
          subjectIds: Array.isArray(obj.subjectIds) ? obj.subjectIds : [],
          createdAt: obj.createdAt || new Date().toISOString(),
        });
      }
    }
  }
  for (const u of users) {
    const className = u.classId?.trim();
    if (!className) continue;
    if (!seen.has(className)) {
      seen.set(className, {
        id: className,
        name: className,
        gradeLevel: u.gradeLevel || 'هفتم',
        academicYear: DEFAULT_SETTINGS.academicYear,
        capacity: 30,
        teacherIds: [],
        subjectIds: [],
        createdAt: u.createdAt,
      });
    }
  }
  return Array.from(seen.values());
}

async function workerFetch<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown; baseUrl?: string } = {}
): Promise<T> {
  const url = `${getWorkerBaseUrl(options.baseUrl)}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
    });
  } catch {
    throw {
      status: 0,
      message: 'خطا در برقراری ارتباط با سرور Cloudflare Worker.',
    };
  }

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok || parsed.success === false) {
    const rawErr = typeof parsed.error === 'string' ? parsed.error : '';
    if (res.status === 403 && rawErr.includes('Origin')) {
      throw {
        status: 403,
        message:
          'دامنه فعلی در لیست APP_ORIGIN سرور Cloudflare Worker مجاز نشده است. لطفاً این دامنه را به APP_ORIGIN در Worker اضافه نمایید.',
      };
    }
    throw {
      status: res.status || 500,
      message: rawErr || `خطا در ارتباط با سرور (کد ${res.status})`,
    };
  }

  return parsed as T;
}

export async function hasFullWorkerSupport(baseUrl?: string): Promise<boolean> {
  const key = getWorkerBaseUrl(baseUrl);
  const cached = fullSupportCache.get(key);
  if (cached && (cached.value || Date.now() - cached.checkedAt < 15000)) {
    return cached.value;
  }
  try {
    const health = await workerFetch<{ fullSupport?: boolean; apiVersion?: number }>('/api/health', { baseUrl: key });
    const full = Boolean(health.fullSupport || (typeof health.apiVersion === 'number' && health.apiVersion >= 2));
    fullSupportCache.set(key, { value: full, checkedAt: Date.now() });
    return full;
  } catch {
    return false;
  }
}

async function resolveWorkerUser(token: string | null, baseUrl?: string): Promise<UserAccount> {
  if (!token) {
    throw { status: 401, message: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' };
  }
  const overrides = readUserOverrides();
  const cached = userCache.get(token);
  if (cached) {
    const fullRemote = !isLocalWorkerToken(token) && (await hasFullWorkerSupport(baseUrl));
    const resolvedCached = fullRemote ? cached : applySingleUserOverride(cached, overrides);
    if (!resolvedCached || resolvedCached.active === false) {
      userCache.delete(token);
      throw { status: 401, message: 'حساب کاربری غیرفعال یا حذف شده است.' };
    }
    return resolvedCached;
  }

  if (isLocalWorkerToken(token)) {
    const sessions = readLocalJson<Record<string, FallbackSessionEntry>>(WK_SESSIONS_KEY, {});
    const sess = sessions[token];
    if (!sess || sess.expiresAt < Date.now()) {
      if (sess) {
        delete sessions[token];
        writeLocalJson(WK_SESSIONS_KEY, sessions);
      }
      throw { status: 401, message: 'نشست کاربری منقضی شده است. لطفاً دوباره وارد شوید.' };
    }
    const all = mergeAllKnownUsers();
    const found = all.find((u) => u.id === sess.userId);
    if (!found || found.active === false) {
      throw { status: 401, message: 'حساب کاربری یافت نشد یا غیرفعال است.' };
    }
    userCache.set(token, found);
    return found;
  }

  const me = await workerFetch<{
    user: WorkerUser;
    settings?: SchoolSettings;
    roleConfig?: RolePermissionConfig | null;
  }>('/api/auth/me', { token, baseUrl });
  const mappedBase = mapWorkerUser(me.user);
  cacheKnownRemoteUsers([mappedBase]);
  const fullRemote = await hasFullWorkerSupport(baseUrl);
  const mapped = fullRemote ? mappedBase : applySingleUserOverride(mappedBase, overrides) ?? mappedBase;
  userCache.set(token, mapped);
  if (me.roleConfig) roleConfigCache.set(token, me.roleConfig);
  if (me.settings) authSettingsCache.set(token, me.settings);
  return mapped;
}

async function fetchRawAdminSettings(token: string | null, baseUrl?: string) {
  if (isLocalWorkerToken(token)) {
    return readLocalJson<{
      name?: string;
      schoolName?: string;
      academicYear?: string;
      principalName?: string;
      currentTerm?: GradeTerm;
      passingScore?: number;
      aiEnabled?: boolean;
      allowStudentAssignmentSubmission?: boolean;
      grades?: string[];
      classes?: unknown[];
    }>(WK_CACHED_SETTINGS_KEY, {});
  }
  try {
    const s = await workerFetch<{
      settings?: {
        name?: string;
        schoolName?: string;
        academicYear?: string;
        principalName?: string;
        currentTerm?: GradeTerm;
        passingScore?: number;
        aiEnabled?: boolean;
        allowStudentAssignmentSubmission?: boolean;
        grades?: string[];
        classes?: unknown[];
      };
    }>('/api/admin/settings', { token, baseUrl });
    if (s.settings) {
      writeLocalJson(WK_CACHED_SETTINGS_KEY, s.settings);
    }
    return s.settings || {};
  } catch {
    return readLocalJson<Record<string, never>>(WK_CACHED_SETTINGS_KEY, {});
  }
}

async function fetchAdminSettings(token: string | null, baseUrl?: string): Promise<SchoolSettings> {
  const raw = await fetchRawAdminSettings(token, baseUrl);
  return {
    ...DEFAULT_SETTINGS,
    schoolName: raw.schoolName || raw.name || DEFAULT_SETTINGS.schoolName,
    academicYear: raw.academicYear || DEFAULT_SETTINGS.academicYear,
    principalName: raw.principalName || DEFAULT_SETTINGS.principalName,
    currentTerm: raw.currentTerm || DEFAULT_SETTINGS.currentTerm,
    passingScore: typeof raw.passingScore === 'number' ? raw.passingScore : DEFAULT_SETTINGS.passingScore,
    aiEnabled: typeof raw.aiEnabled === 'boolean' ? raw.aiEnabled : DEFAULT_SETTINGS.aiEnabled,
    allowStudentAssignmentSubmission:
      typeof raw.allowStudentAssignmentSubmission === 'boolean'
        ? raw.allowStudentAssignmentSubmission
        : DEFAULT_SETTINGS.allowStudentAssignmentSubmission,
  };
}

export async function invokeWorkerFallback<T>(
  path: string,
  options: { method?: string; body?: BodyInit | null; token?: string | null; baseUrl?: string }
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  let parsedBody: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body) {
    try {
      parsedBody = JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      parsedBody = {};
    }
  }
  const token = options.token ?? null;
  const baseUrl = options.baseUrl;
  const urlObj = new URL(path, 'http://localhost');
  const pathname = urlObj.pathname;

  if (pathname === '/api/health' && method === 'GET') {
    const data = await workerFetch<Record<string, unknown>>('/api/health', { baseUrl });
    return { ok: true, storage: 'CLOUDFLARE_WORKER', ...data } as T;
  }

  if (pathname === '/api/auth/bootstrap-status' || pathname === '/api/setup/status') {
    if (method === 'GET') {
      const status = await workerFetch<{
        hasAdmin?: boolean;
        adminExists?: boolean;
        needsSetup?: boolean;
        initialized?: boolean;
        schoolName?: string;
      }>('/api/setup/status', { baseUrl });
      const hasAdmin = Boolean(status.initialized ?? status.hasAdmin ?? status.adminExists ?? !status.needsSetup);
      return {
        initialized: hasAdmin,
        hasAdmin,
        adminExists: hasAdmin,
        needsSetup: !hasAdmin,
        setupRequired: !hasAdmin,
        remoteReachable: true,
        schoolName: status.schoolName || DEFAULT_SETTINGS.schoolName,
      } as T;
    }
  }

  if ((pathname === '/api/setup/initialize' || pathname === '/api/setup/admin') && method === 'POST') {
    const fullName = String(parsedBody.fullName || parsedBody.name || '').trim();
    const username = String(parsedBody.username || '').trim().toLowerCase();
    const nationalId = String(parsedBody.nationalId || '').trim();
    const password = String(parsedBody.password || '');
    const setupKey = String(parsedBody.setupKey || '').trim();

    if (!setupKey) {
      throw { status: 400, message: 'وارد کردن کلید راه‌اندازی سرور الزامی است.' };
    }

    const setupRes = await workerFetch<{
      token?: string;
      user?: WorkerUser;
      settings?: SchoolSettings;
      roleConfig?: RolePermissionConfig | null;
    }>(pathname, {
      method: 'POST',
      baseUrl,
      body: { setupKey, name: fullName, fullName, username, nationalId, password },
    });

    if (setupRes.token && setupRes.user) {
      const user = mapWorkerUser(setupRes.user);
      userCache.set(setupRes.token, user);
      if (setupRes.roleConfig) roleConfigCache.set(setupRes.token, setupRes.roleConfig);
      if (setupRes.settings) authSettingsCache.set(setupRes.token, setupRes.settings);
      return {
        user,
        token: setupRes.token,
        settings: setupRes.settings || DEFAULT_SETTINGS,
        roleConfig: setupRes.roleConfig || DEFAULT_ROLES.find((r) => r.role === 'admin') || null,
        message: 'حساب مدیر سامانه با موفقیت تعریف شد.',
      } as T;
    }

    const loginRes = await workerFetch<{
      token: string;
      user: WorkerUser;
      settings?: SchoolSettings;
      roleConfig?: RolePermissionConfig | null;
    }>('/api/auth/login', {
      method: 'POST',
      baseUrl,
      body: { username, password },
    });
    const user = mapWorkerUser(loginRes.user);
    if (loginRes.token) {
      userCache.set(loginRes.token, user);
      if (loginRes.roleConfig) roleConfigCache.set(loginRes.token, loginRes.roleConfig);
      if (loginRes.settings) authSettingsCache.set(loginRes.token, loginRes.settings);
    }
    return {
      user,
      token: loginRes.token,
      settings: loginRes.settings || DEFAULT_SETTINGS,
      roleConfig: loginRes.roleConfig || DEFAULT_ROLES.find((r) => r.role === 'admin') || null,
      message: 'حساب مدیر سامانه با موفقیت تعریف شد.',
    } as T;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const username = String(parsedBody.identifier ?? parsedBody.username ?? '').trim().toLowerCase();
    const password = String(parsedBody.password ?? '');

    if (!username && !password) {
      throw { status: 400, message: 'لطفاً نام کاربری و رمز عبور خود را وارد کنید.' };
    }
    if (!username) {
      throw { status: 400, message: 'لطفاً نام کاربری خود را وارد کنید.' };
    }
    if (!password) {
      throw { status: 400, message: 'لطفاً رمز عبور خود را وارد کنید.' };
    }

    const overrides = readUserOverrides();
    const extraUsers = readExtraUsers();

    // Always try the remote Worker SCHOOL_KV database FIRST so accounts created on any device/browser authenticate everywhere
    try {
      const loginRes = await workerFetch<{
        token: string;
        user: WorkerUser;
        settings?: SchoolSettings;
        roleConfig?: RolePermissionConfig | null;
      }>('/api/auth/login', {
        method: 'POST',
        baseUrl,
        body: { username, password },
      });
      const fullRemote = await hasFullWorkerSupport(baseUrl);
      const mapped = mapWorkerUser(loginRes.user);
      cacheKnownRemoteUsers([mapped]);
      const user = fullRemote ? mapped : applySingleUserOverride(mapped, overrides) ?? mapped;
      if (user.active === false) {
        throw { status: 403, message: 'این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.' };
      }
      const roleConfig =
        loginRes.roleConfig ??
        (user.permissions
          ? {
              ...(DEFAULT_ROLES.find((r) => r.role === user.role) ?? {
                role: user.role,
                titleFa: user.role,
                descriptionFa: '',
              }),
              permissions: user.permissions,
            }
          : DEFAULT_ROLES.find((r) => r.role === user.role) ?? null);
      if (loginRes.token) {
        userCache.set(loginRes.token, user);
        roleConfigCache.set(loginRes.token, roleConfig);
        if (loginRes.settings) authSettingsCache.set(loginRes.token, loginRes.settings);
      }
      const settings =
        loginRes.settings || (user.role === 'admin' ? await fetchAdminSettings(loginRes.token, baseUrl) : DEFAULT_SETTINGS);

      return {
        user,
        settings,
        roleConfig,
        token: loginRes.token,
        message: `${user.fullName} عزیز، خوش آمدید.`,
      } as T;
    } catch (remoteErr) {
      const errObj = remoteErr as { status?: number };
      if (errObj?.status === 403) {
        throw remoteErr;
      }

      const localIdx = extraUsers.findIndex((u) => u.username.toLowerCase() === username);
      if (localIdx !== -1) {
        const localRecord = extraUsers[localIdx];
        if (!overrides[localRecord.id]?.deleted) {
          const targetSalt = overrides[localRecord.id]?.passwordSalt || localRecord.passwordSalt;
          const targetHash = overrides[localRecord.id]?.passwordHash || localRecord.passwordHash;
          const candidateHash = await hashFallbackPassword(password, targetSalt);
          if (candidateHash !== targetHash) {
            throw { status: 401, message: 'نام کاربری یا رمز عبور اشتباه است.' };
          }
          const resolvedUser = applySingleUserOverride(stripFallbackSecrets(localRecord), overrides);
          if (!resolvedUser || resolvedUser.active === false) {
            throw { status: 403, message: 'این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.' };
          }
          const nowIso = new Date().toISOString();
          extraUsers[localIdx] = { ...localRecord, lastLoginAt: nowIso };
          writeExtraUsers(extraUsers);
          const localToken = createLocalFallbackSession(resolvedUser.id);
          const finalUser = { ...resolvedUser, lastLoginAt: nowIso };
          userCache.set(localToken, finalUser);
          const settings = await fetchAdminSettings(localToken, baseUrl);
          return {
            user: finalUser,
            settings,
            roleConfig: DEFAULT_ROLES.find((r) => r.role === finalUser.role) ?? null,
            token: localToken,
            message: `${finalUser.fullName} عزیز، خوش آمدید.`,
          } as T;
        }
      }

      const cachedUsers = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
      const cachedMatch = cachedUsers.find((u) => u.username.toLowerCase() === username);
      const ov = cachedMatch ? overrides[cachedMatch.id] : undefined;
      if (cachedMatch && !ov?.deleted && ov?.passwordHash && ov.passwordSalt) {
        const candidateHash = await hashFallbackPassword(password, ov.passwordSalt);
        if (candidateHash === ov.passwordHash) {
          const finalUser = applySingleUserOverride(cachedMatch, overrides);
          if (!finalUser || finalUser.active === false) {
            throw { status: 403, message: 'این حساب کاربری غیرفعال شده است. با مدیر مدرسه تماس بگیرید.' };
          }
          const localToken = createLocalFallbackSession(finalUser.id);
          userCache.set(localToken, finalUser);
          const settings = await fetchAdminSettings(localToken, baseUrl);
          return {
            user: finalUser,
            settings,
            roleConfig: DEFAULT_ROLES.find((r) => r.role === finalUser.role) ?? null,
            token: localToken,
            message: `${finalUser.fullName} عزیز، خوش آمدید.`,
          } as T;
        }
      }
      throw remoteErr;
    }
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (token) {
      userCache.delete(token);
      if (isLocalWorkerToken(token)) {
        const sessions = readLocalJson<Record<string, FallbackSessionEntry>>(WK_SESSIONS_KEY, {});
        delete sessions[token];
        writeLocalJson(WK_SESSIONS_KEY, sessions);
      } else {
        await workerFetch('/api/auth/logout', { method: 'POST', token, baseUrl }).catch(() => {});
      }
    }
    return { ok: true, message: 'با موفقیت از حساب کاربری خارج شدید.' } as T;
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!token) {
      throw { status: 401, message: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' };
    }
    const user = await resolveWorkerUser(token, baseUrl);
    const settings =
      authSettingsCache.get(token) ||
      (user.role === 'admin' ? await fetchAdminSettings(token, baseUrl) : DEFAULT_SETTINGS);
    const roleConfig =
      roleConfigCache.get(token) ??
      (user.permissions
        ? {
            ...(DEFAULT_ROLES.find((r) => r.role === user.role) ?? {
              role: user.role,
              titleFa: user.role,
              descriptionFa: '',
            }),
            permissions: user.permissions,
          }
        : DEFAULT_ROLES.find((r) => r.role === user.role) ?? null);
    return {
      user,
      settings,
      roleConfig,
    } as T;
  }

  // If the deployed Cloudflare Worker is full-support v2, proxy all /api/* endpoints (including AI conversations & users) directly to SCHOOL_KV!
  const fullSupport = isLocalWorkerToken(token) ? false : await hasFullWorkerSupport(baseUrl);
  if (fullSupport) {
    try {
      const res = await workerFetch<Record<string, unknown>>(path, {
        method,
        token,
        baseUrl,
        body: method !== 'GET' && method !== 'HEAD' && options.body ? parsedBody : undefined,
      });
      if (pathname === '/api/auth/me' && method === 'PATCH' && res.user && token) {
        userCache.set(token, mapWorkerUser(res.user as WorkerUser));
      }
      if (pathname === '/api/users' && method === 'GET' && Array.isArray(res.users)) {
        const tombstones = readDeletedUserTombstones();
        const mappedUsers = (res.users as WorkerUser[])
          .map(mapWorkerUser)
          .filter(
            (u) =>
              !tombstones.ids.has(u.id) &&
              !(u.username && tombstones.usernames.has(u.username.trim().toLowerCase()))
          );
        cacheKnownRemoteUsers(mappedUsers);
        return { ...res, users: mappedUsers } as T;
      }
      if ((pathname === '/api/users' || pathname.startsWith('/api/users/')) && method !== 'DELETE' && res.user) {
        const mapped = mapWorkerUser(res.user as WorkerUser);
        clearFallbackUserDeleted(mapped.id, mapped.username);
        cacheKnownRemoteUsers([mapped]);
        return { ...res, user: mapped } as T;
      }
      if (pathname.startsWith('/api/users/') && method === 'DELETE') {
        const deletedId = decodeURIComponent(pathname.split('/')[3] ?? '').trim();
        if (deletedId) {
          const cachedList = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
          const matchedCached = cachedList.find((u) => u.id === deletedId);
          markFallbackUserDeleted(deletedId, matchedCached?.username);
          writeLocalJson(
            WK_CACHED_USERS_KEY,
            cachedList.filter((u) => u.id !== deletedId)
          );
        }
      }
      return res as T;
    } catch (proxyErr) {
      const pErr = proxyErr as { status?: number };
      if (pErr?.status !== 404) {
        throw proxyErr;
      }
      // Fall through to local compatibility handler if an optional sub-route returns 404
    }
  }

  // Handle AI conversations locally ONLY when full-support Worker is not deployed
  if (pathname === '/api/ai/conversations' || pathname.startsWith('/api/ai/conversations/')) {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    const convs = readLocalAiConvs(currentUser.id);

    if (pathname === '/api/ai/conversations' && method === 'GET') {
      const sorted = [...convs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {
        conversations: sorted.map((c) => ({
          id: c.id,
          title: c.title,
          mode: c.mode,
          role: c.role,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: c.messages.length,
        })),
      } as T;
    }

    if (pathname === '/api/ai/conversations' && method === 'POST') {
      const now = new Date().toISOString();
      const conv: AIConversation = {
        id: genLocalId('ai'),
        userId: currentUser.id,
        role: currentUser.role,
        title: String(parsedBody.title || 'گفت‌وگوی جدید').trim(),
        mode: String(parsedBody.mode || 'پاسخگویی و آموزش مفاهیم درسی').trim(),
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      writeLocalAiConvs(currentUser.id, [conv, ...convs]);
      return { conversation: conv } as T;
    }

    const aiMatch = pathname.match(/^\/api\/ai\/conversations\/([^/]+)$/);
    if (aiMatch) {
      const cid = decodeURIComponent(aiMatch[1]);
      const targetIdx = convs.findIndex((c) => c.id === cid);
      if (targetIdx === -1) {
        throw { status: 404, message: 'گفت‌وگو یافت نشد.' };
      }
      if (method === 'GET') {
        return { conversation: convs[targetIdx] } as T;
      }
      if (method === 'PATCH') {
        const cleanTitle = String(parsedBody.title || '').trim();
        if (!cleanTitle) throw { status: 400, message: 'عنوان گفت‌وگو نمی‌تواند خالی باشد.' };
        const updated = { ...convs[targetIdx], title: cleanTitle.slice(0, 80), updatedAt: new Date().toISOString() };
        convs[targetIdx] = updated;
        writeLocalAiConvs(currentUser.id, convs);
        return { conversation: updated, message: 'عنوان گفت‌وگو تغییر یافت.' } as T;
      }
      if (method === 'DELETE') {
        writeLocalAiConvs(
          currentUser.id,
          convs.filter((c) => c.id !== cid)
        );
        return { ok: true, message: 'گفت‌وگو حذف شد.' } as T;
      }
    }
  }

  // === Legacy v1 Cloudflare Worker compatibility layer ===
  if (pathname === '/api/auth/me' && method === 'PATCH') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    const updates: FallbackUserOverride = {
      ...(parsedBody.preferredLanguage === 'fa' || parsedBody.preferredLanguage === 'en'
        ? { preferredLanguage: parsedBody.preferredLanguage }
        : {}),
      ...(parsedBody.preferredTheme === 'light' || parsedBody.preferredTheme === 'dark'
        ? { preferredTheme: parsedBody.preferredTheme }
        : {}),
      ...(typeof parsedBody.phone === 'string' ? { phone: parsedBody.phone.trim() } : {}),
      ...(typeof parsedBody.email === 'string' ? { email: parsedBody.email.trim() } : {}),
      ...(typeof parsedBody.bio === 'string' ? { bio: parsedBody.bio.trim() } : {}),
    };
    const overrides = readUserOverrides();
    overrides[currentUser.id] = { ...(overrides[currentUser.id] ?? {}), ...updates };
    writeUserOverrides(overrides);

    const updatedUser: UserAccount = { ...currentUser, ...updates };
    if (token) userCache.set(token, updatedUser);
    return { user: updatedUser } as T;
  }

  if (pathname === '/api/users' && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      return { users: [] } as T;
    }
    if (isLocalWorkerToken(token)) {
      return { users: mergeAllKnownUsers([currentUser]) } as T;
    }
    try {
      const fullRes = await workerFetch<{ users?: WorkerUser[] }>('/api/users', { token, baseUrl });
      if (Array.isArray(fullRes.users)) {
        fullSupportCache.set(getWorkerBaseUrl(baseUrl), { value: true, checkedAt: Date.now() });
        const mapped = fullRes.users.map(mapWorkerUser);
        cacheKnownRemoteUsers(mapped);
        return { users: mergeAllKnownUsers(mapped) } as T;
      }
    } catch (err) {
      const e = err as { status?: number };
      if (e?.status && e.status !== 404) {
        throw err;
      }
    }
    const [studentsRes, teachersRes] = await Promise.allSettled([
      workerFetch<{ students: WorkerUser[] }>('/api/admin/students', { token, baseUrl }),
      workerFetch<{ teachers: WorkerUser[] }>('/api/admin/teachers', { token, baseUrl }),
    ]);
    const remoteUsers: UserAccount[] = [currentUser];
    if (studentsRes.status === 'fulfilled' && Array.isArray(studentsRes.value.students)) {
      remoteUsers.push(...studentsRes.value.students.map(mapWorkerUser));
    }
    if (teachersRes.status === 'fulfilled' && Array.isArray(teachersRes.value.teachers)) {
      remoteUsers.push(...teachersRes.value.teachers.map(mapWorkerUser));
    }
    cacheKnownRemoteUsers(remoteUsers);
    return { users: mergeAllKnownUsers(remoteUsers) } as T;
  }

  if (pathname === '/api/users/sync-tombstones' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      throw { status: 403, message: 'فقط مدیر مدرسه مجاز به همگام‌سازی حذف کاربران است.' };
    }
    const items = Array.isArray(parsedBody.tombstones)
      ? (parsedBody.tombstones as Array<{ id?: string; username?: string }>)
      : [];
    const extraUsers = readExtraUsers();
    const cachedList = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
    const overrides = readUserOverrides();
    let appliedCount = 0;

    for (const item of items) {
      const cleanId = String(item?.id ?? '').trim();
      const cleanUsername = String(item?.username ?? '').trim().toLowerCase();
      if (!cleanId && !cleanUsername) continue;
      if (cleanId === currentUser.id) continue;
      markFallbackUserDeleted(cleanId, cleanUsername);
      if (cleanId) {
        overrides[cleanId] = { ...(overrides[cleanId] ?? {}), deleted: true };
      }
      appliedCount++;
    }
    writeUserOverrides(overrides);
    const tombstones = readDeletedUserTombstones();
    writeExtraUsers(
      extraUsers.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      )
    );
    writeLocalJson(
      WK_CACHED_USERS_KEY,
      cachedList.filter(
        (u) => !tombstones.ids.has(u.id) && !tombstones.usernames.has(u.username.trim().toLowerCase())
      )
    );
    return { ok: true, appliedCount } as T;
  }

  if (pathname === '/api/users/bulk' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      throw { status: 403, message: 'فقط مدیر مدرسه مجاز به ورود گروهی کاربران است.' };
    }
    const rawRows = Array.isArray(parsedBody.rows) ? (parsedBody.rows as BulkUserImportRow[]) : [];
    if (rawRows.length === 0) {
      throw { status: 400, message: 'فهرست کاربران برای ثبت خالی است.' };
    }

    const existingUsers = mergeAllKnownUsers([currentUser]);
    const taken = new Set(existingUsers.map((u) => u.username.toLowerCase()));
    const extraUsers = readExtraUsers();
    const created: BulkUserImportCreatedItem[] = [];
    const errors: Array<{ rowNumber: number; fullName?: string; error: string }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNumber = row.rowNumber ?? i + 1;
      const fullName = String(row.fullName ?? '').trim();
      if (!fullName) {
        errors.push({ rowNumber, error: 'نام و نام خانوادگی خالی است.' });
        continue;
      }
      const role: UserRole = row.role === 'teacher' ? 'teacher' : 'student';
      const rawUsername = normalizeFallbackDigits(String(row.username ?? '').trim()).toLowerCase();
      const autoGeneratedUsername = !rawUsername;
      const username = autoGeneratedUsername ? generateFallbackUsername(role, taken) : rawUsername;

      if (!autoGeneratedUsername) {
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
          errors.push({ rowNumber, fullName, error: `نام کاربری «${rawUsername}» نامعتبر است.` });
          continue;
        }
        if (taken.has(username)) {
          errors.push({ rowNumber, fullName, error: `نام کاربری «${username}» قبلاً ثبت شده است.` });
          continue;
        }
        taken.add(username);
      }

      const rawPassword = String(row.password ?? '').trim();
      const autoGeneratedPassword = !rawPassword;
      const finalPassword = autoGeneratedPassword ? generateFallbackPassword(8) : rawPassword;
      if (!autoGeneratedPassword && finalPassword.length < 6) {
        taken.delete(username);
        errors.push({ rowNumber, fullName, error: 'رمز عبور واردشده باید حداقل ۶ کاراکتر باشد.' });
        continue;
      }

      const gradeNorm = String(row.gradeLevel ?? '').trim();
      const gradeLevel = ['هفتم', 'هشتم', 'نهم'].includes(gradeNorm)
        ? gradeNorm
        : gradeNorm.includes('هشت') || gradeNorm.includes('8') || gradeNorm.includes('۸')
          ? 'هشتم'
          : gradeNorm.includes('نه') || gradeNorm.includes('9') || gradeNorm.includes('۹')
            ? 'نهم'
            : 'هفتم';

      const salt = randomFallbackHex(16);
      const passwordHash = await hashFallbackPassword(finalPassword, salt);
      const createdUser: StoredFallbackUser = {
        id: genLocalId('usr'),
        username,
        nationalId: normalizeFallbackDigits(String(row.nationalId ?? '').trim()),
        fullName,
        role,
        active: true,
        phone: row.phone?.trim() || undefined,
        email: row.email?.trim() || undefined,
        gradeLevel: role === 'student' ? gradeLevel : undefined,
        classId: role === 'student' ? row.classId || undefined : undefined,
        coins: 0,
        displayPassword: finalPassword,
        createdAt: new Date().toISOString(),
        passwordHash,
        passwordSalt: salt,
      };
      clearFallbackUserDeleted(createdUser.id, createdUser.username);
      extraUsers.unshift(createdUser);
      created.push({
        rowNumber,
        user: stripFallbackSecrets(createdUser),
        username,
        password: finalPassword,
        autoGeneratedUsername,
        autoGeneratedPassword,
        className: row.className?.trim() || undefined,
      });
    }

    writeExtraUsers(extraUsers);
    return {
      success: created.length > 0,
      created,
      errors,
      createdClassesCount: 0,
      message: `${created.length} حساب کاربری با موفقیت ثبت شد.`,
    } as T;
  }

  if (pathname === '/api/users' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      throw { status: 403, message: 'فقط مدیر مدرسه مجاز به ایجاد کاربر جدید است.' };
    }
    const fullName = String(parsedBody.fullName || parsedBody.name || '').trim();
    const rawUsername = normalizeFallbackDigits(String(parsedBody.username || '').trim()).toLowerCase();
    const rawPassword = String(parsedBody.password || '').trim();
    if (!fullName) {
      throw { status: 400, message: 'نام و نام خانوادگی الزامی است.' };
    }

    const role = (['student', 'teacher', 'admin'].includes(String(parsedBody.role))
      ? String(parsedBody.role)
      : 'student') as UserRole;

    const existingUsers = mergeAllKnownUsers([currentUser]);
    const taken = new Set(existingUsers.map((u) => u.username.toLowerCase()));
    const autoGeneratedUsername = !rawUsername;
    const username = autoGeneratedUsername ? generateFallbackUsername(role, taken) : rawUsername;

    if (!autoGeneratedUsername) {
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
        throw { status: 400, message: 'نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.' };
      }
      if (taken.has(username)) {
        throw { status: 409, message: 'این نام کاربری قبلاً ثبت شده است.' };
      }
    }

    const autoGeneratedPassword = !rawPassword;
    const password = autoGeneratedPassword ? generateFallbackPassword(8) : rawPassword;
    if (!autoGeneratedPassword && password.length < 6) {
      throw { status: 400, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
    }

    if (!isLocalWorkerToken(token)) {
      try {
        const res = await workerFetch<{ user: WorkerUser; message?: string }>('/api/users', {
          method: 'POST',
          token,
          baseUrl,
          body: {
            ...parsedBody,
            name: fullName,
            fullName,
            username,
            password,
            role,
          },
        });
        fullSupportCache.set(getWorkerBaseUrl(baseUrl), { value: true, checkedAt: Date.now() });
        const mapped = { ...mapWorkerUser(res.user), displayPassword: password };
        const overrides = readUserOverrides();
        overrides[mapped.id] = { ...(overrides[mapped.id] ?? {}), displayPassword: password };
        writeUserOverrides(overrides);
        clearFallbackUserDeleted(mapped.id, mapped.username);
        cacheKnownRemoteUsers([mapped]);
        return {
          user: mapped,
          generatedCredentials: { username, password, autoGeneratedUsername, autoGeneratedPassword },
          message: res.message || 'حساب کاربری جدید با موفقیت در دیتابیس ثبت شد.',
        } as T;
      } catch (remoteErr) {
        const e = remoteErr as { status?: number };
        if (e?.status !== 404) {
          throw remoteErr;
        }
      }
    }

    if (role === 'student' && !isLocalWorkerToken(token)) {
      const res = await workerFetch<{ student: WorkerUser }>('/api/admin/students', {
        method: 'POST',
        token,
        baseUrl,
        body: {
          name: fullName,
          username,
          password,
          grade: parsedBody.gradeLevel || 'هفتم',
          className: parsedBody.classId || '',
          studentCode: parsedBody.nationalId || '',
        },
      });
      const mapped = { ...mapWorkerUser(res.student), displayPassword: password };
      const overrides = readUserOverrides();
      overrides[mapped.id] = { ...(overrides[mapped.id] ?? {}), displayPassword: password };
      writeUserOverrides(overrides);
      clearFallbackUserDeleted(mapped.id, mapped.username);
      cacheKnownRemoteUsers([mapped]);
      return {
        user: mapped,
        generatedCredentials: { username, password, autoGeneratedUsername, autoGeneratedPassword },
        message: 'حساب دانش‌آموز با موفقیت ایجاد شد.',
      } as T;
    }

    if (role === 'teacher' && !isLocalWorkerToken(token)) {
      const res = await workerFetch<{ teacher: WorkerUser }>('/api/admin/teachers', {
        method: 'POST',
        token,
        baseUrl,
        body: {
          name: fullName,
          username,
          password,
        },
      });
      const mapped = { ...mapWorkerUser(res.teacher), displayPassword: password };
      const overrides = readUserOverrides();
      overrides[mapped.id] = {
        ...(overrides[mapped.id] ?? {}),
        displayPassword: password,
        ...(Array.isArray(parsedBody.assignedClassIds) ? { assignedClassIds: parsedBody.assignedClassIds } : {}),
        ...(Array.isArray(parsedBody.assignedSubjectIds) ? { assignedSubjectIds: parsedBody.assignedSubjectIds } : {}),
      };
      writeUserOverrides(overrides);
      clearFallbackUserDeleted(mapped.id, mapped.username);
      cacheKnownRemoteUsers([mapped]);
      return {
        user: mapped,
        generatedCredentials: { username, password, autoGeneratedUsername, autoGeneratedPassword },
        message: 'حساب دبیر با موفقیت ایجاد شد.',
      } as T;
    }

    const salt = randomFallbackHex(16);
    const passwordHash = await hashFallbackPassword(password, salt);
    const created: StoredFallbackUser = {
      id: genLocalId('usr'),
      username,
      nationalId: String(parsedBody.nationalId || '').trim(),
      fullName,
      role,
      active: parsedBody.active !== false,
      phone: typeof parsedBody.phone === 'string' ? parsedBody.phone.trim() || undefined : undefined,
      email: typeof parsedBody.email === 'string' ? parsedBody.email.trim() || undefined : undefined,
      gradeLevel: role === 'student' ? String(parsedBody.gradeLevel || 'هفتم') : undefined,
      classId: role === 'student' ? (typeof parsedBody.classId === 'string' ? parsedBody.classId : undefined) : undefined,
      assignedClassIds: role === 'teacher' && Array.isArray(parsedBody.assignedClassIds) ? parsedBody.assignedClassIds : undefined,
      assignedSubjectIds: role === 'teacher' && Array.isArray(parsedBody.assignedSubjectIds) ? parsedBody.assignedSubjectIds : undefined,
      coins: 0,
      displayPassword: password,
      createdAt: new Date().toISOString(),
      passwordHash,
      passwordSalt: salt,
    };

    clearFallbackUserDeleted(created.id, created.username);
    writeExtraUsers([created, ...readExtraUsers()]);
    return {
      user: stripFallbackSecrets(created),
      generatedCredentials: { username, password, autoGeneratedUsername, autoGeneratedPassword },
      message: 'حساب کاربری جدید با موفقیت ایجاد شد.',
    } as T;
  }

  const userItemMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userItemMatch) {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      throw { status: 403, message: 'فقط مدیر مدرسه مجاز به مدیریت کاربران است.' };
    }
    const targetId = decodeURIComponent(userItemMatch[1]);
    const extraUsers = readExtraUsers();
    const extraIdx = extraUsers.findIndex((u) => u.id === targetId);
    const overrides = readUserOverrides();

    if (method === 'PATCH' || method === 'PUT') {
      if (targetId === currentUser.id && parsedBody.active === false) {
        throw { status: 400, message: 'امکان غیرفعال کردن حساب کاربری خودتان وجود ندارد.' };
      }

      if (!isLocalWorkerToken(token) && extraIdx === -1) {
        try {
          const remoteRes = await workerFetch<{ user: WorkerUser; message?: string }>(
            `/api/users/${encodeURIComponent(targetId)}`,
            {
              method: 'PATCH',
              token,
              baseUrl,
              body: parsedBody,
            }
          );
          fullSupportCache.set(getWorkerBaseUrl(baseUrl), { value: true, checkedAt: Date.now() });
          const mapped = mapWorkerUser(remoteRes.user);
          if (typeof parsedBody.newPassword === 'string' && parsedBody.newPassword.trim()) {
            mapped.displayPassword = parsedBody.newPassword;
            overrides[targetId] = { ...(overrides[targetId] ?? {}), displayPassword: parsedBody.newPassword };
            writeUserOverrides(overrides);
          }
          cacheKnownRemoteUsers([mapped]);
          return { user: mapped, message: remoteRes.message || 'اطلاعات کاربر به‌روزرسانی شد.' } as T;
        } catch (remoteErr) {
          const e = remoteErr as { status?: number };
          if (e?.status !== 404) {
            throw remoteErr;
          }
        }
      }

      const patch: FallbackUserOverride = {};
      if (typeof parsedBody.fullName === 'string' && parsedBody.fullName.trim()) {
        patch.fullName = parsedBody.fullName.trim();
      }
      if (typeof parsedBody.nationalId === 'string') patch.nationalId = parsedBody.nationalId.trim();
      if (typeof parsedBody.role === 'string' && ['student', 'teacher', 'admin'].includes(parsedBody.role)) {
        patch.role = parsedBody.role as UserRole;
      }
      if (typeof parsedBody.active === 'boolean') patch.active = parsedBody.active;
      if (typeof parsedBody.phone === 'string') patch.phone = parsedBody.phone.trim();
      if (typeof parsedBody.email === 'string') patch.email = parsedBody.email.trim();
      if (typeof parsedBody.gradeLevel === 'string') patch.gradeLevel = parsedBody.gradeLevel.trim();
      if (parsedBody.classId !== undefined) patch.classId = parsedBody.classId ? String(parsedBody.classId) : undefined;
      if (Array.isArray(parsedBody.assignedClassIds)) patch.assignedClassIds = parsedBody.assignedClassIds;
      if (Array.isArray(parsedBody.assignedSubjectIds)) patch.assignedSubjectIds = parsedBody.assignedSubjectIds;

      if (typeof parsedBody.newPassword === 'string' && parsedBody.newPassword.trim()) {
        if (parsedBody.newPassword.length < 6) {
          throw { status: 400, message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' };
        }
        const newSalt = randomFallbackHex(16);
        const newHash = await hashFallbackPassword(parsedBody.newPassword, newSalt);
        patch.passwordSalt = newSalt;
        patch.passwordHash = newHash;
        patch.displayPassword = parsedBody.newPassword;
      }

      if (extraIdx !== -1) {
        const updatedRecord: StoredFallbackUser = { ...extraUsers[extraIdx], ...patch };
        extraUsers[extraIdx] = updatedRecord;
        writeExtraUsers(extraUsers);
        return { user: stripFallbackSecrets(updatedRecord), message: 'اطلاعات کاربر به‌روزرسانی شد.' } as T;
      }

      const targetBase = mergeAllKnownUsers([currentUser]).find((u) => u.id === targetId);
      if (!targetBase) {
        throw { status: 404, message: 'کاربر مورد نظر یافت نشد.' };
      }
      overrides[targetId] = { ...(overrides[targetId] ?? {}), ...patch };
      writeUserOverrides(overrides);
      const updatedUser = applySingleUserOverride(targetBase, overrides) ?? { ...targetBase, ...patch };
      return { user: updatedUser, message: 'اطلاعات کاربر به‌روزرسانی شد.' } as T;
    }

    if (method === 'DELETE') {
      if (targetId === currentUser.id) {
        throw { status: 400, message: 'حذف حساب کاربری فعال خودتان مجاز نیست.' };
      }
      const cached = readLocalJson<UserAccount[]>(WK_CACHED_USERS_KEY, []);
      const extraTarget = extraIdx !== -1 ? extraUsers[extraIdx] : undefined;
      const cachedTarget = cached.find((u) => u.id === targetId);
      const targetUser = extraTarget ?? cachedTarget;
      const targetRole = targetUser?.role;
      const targetUsername = targetUser?.username;

      if (!isLocalWorkerToken(token) && extraIdx === -1) {
        let deletedRemotely = false;
        try {
          await workerFetch(`/api/users/${encodeURIComponent(targetId)}`, {
            method: 'DELETE',
            token,
            baseUrl,
          });
          fullSupportCache.set(getWorkerBaseUrl(baseUrl), { value: true, checkedAt: Date.now() });
          deletedRemotely = true;
        } catch (remoteErr) {
          const e = remoteErr as { status?: number };
          if (e?.status !== 404 && e?.status !== 405 && e?.status !== 502 && e?.status !== 504) {
            throw remoteErr;
          }
        }
        if (!deletedRemotely && (targetRole === 'student' || targetRole === 'teacher')) {
          const fallbackPath =
            targetRole === 'student'
              ? `/api/admin/students/${encodeURIComponent(targetId)}`
              : `/api/admin/teachers/${encodeURIComponent(targetId)}`;
          await workerFetch(fallbackPath, { method: 'DELETE', token, baseUrl }).catch(() => {});
        }
      }
      if (extraIdx !== -1) {
        writeExtraUsers(extraUsers.filter((u) => u.id !== targetId));
      }
      markFallbackUserDeleted(targetId, targetUsername);
      overrides[targetId] = { ...(overrides[targetId] ?? {}), deleted: true };
      writeUserOverrides(overrides);
      if (cached.some((u) => u.id === targetId)) {
        writeLocalJson(WK_CACHED_USERS_KEY, cached.filter((u) => u.id !== targetId));
      }
      return { ok: true, message: 'کاربر با موفقیت حذف شد.' } as T;
    }
  }

  if (pathname === '/api/classes' && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'admin') {
      if (isLocalWorkerToken(token)) {
        const rawSettings = await fetchRawAdminSettings(token, baseUrl);
        return { classes: synthesizeClassesFromUsers(mergeAllKnownUsers([currentUser]), rawSettings.classes ?? []) } as T;
      }
      const [stuRes, rawSettings] = await Promise.all([
        workerFetch<{ students?: WorkerUser[] }>('/api/admin/students', { token, baseUrl }).catch(() => ({
          students: [],
        })),
        fetchRawAdminSettings(token, baseUrl),
      ]);
      const users = (stuRes.students ?? []).map(mapWorkerUser);
      return { classes: synthesizeClassesFromUsers(users, rawSettings.classes ?? []) } as T;
    }
    return { classes: synthesizeClassesFromUsers([currentUser]) } as T;
  }

  if (pathname === '/api/grades' && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (isLocalWorkerToken(token)) return { grades: [] } as T;
    if (currentUser.role === 'student') {
      const res = await workerFetch<{ grades?: WorkerGrade[] }>('/api/grades', { token, baseUrl });
      return { grades: (res.grades ?? []).map(mapWorkerGrade) } as T;
    }
    const studentId = urlObj.searchParams.get('studentId')?.trim();
    if (!studentId) {
      return { grades: [] } as T;
    }
    const res = await workerFetch<{ grades?: WorkerGrade[] }>(
      `/api/grades?studentId=${encodeURIComponent(studentId)}`,
      { token, baseUrl }
    );
    return { grades: (res.grades ?? []).map(mapWorkerGrade) } as T;
  }

  if (pathname === '/api/grades' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'student') {
      throw { status: 403, message: 'دانش‌آموز و والدین مجاز به ثبت نمره نیستند.' };
    }
    if (isLocalWorkerToken(token)) {
      throw { status: 400, message: 'برای ثبت نمره روی سرور اصلی، با حساب دبیر یا مدیر اصلی وارد شوید.' };
    }
    const subjectVal = String(parsedBody.subject || parsedBody.subjectName || parsedBody.subjectId || 'عمومی').trim();
    const res = await workerFetch<{ grade: WorkerGrade }>('/api/grades', {
      method: 'POST',
      token,
      baseUrl,
      body: {
        studentId: parsedBody.studentId,
        subject: subjectVal,
        score: Number(parsedBody.score),
        maxScore: Number(parsedBody.maxScore ?? 20) || 20,
        term: parsedBody.term || 'نوبت اول',
        description: String(parsedBody.description || parsedBody.title || parsedBody.note || '').trim(),
      },
    });
    return { grade: mapWorkerGrade(res.grade), message: 'نمره با موفقیت ثبت شد.' } as T;
  }

  if (pathname === '/api/attendance' && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (isLocalWorkerToken(token)) return { attendance: [] } as T;
    if (currentUser.role === 'student') {
      const res = await workerFetch<{ attendance?: WorkerAttendance[] }>('/api/attendance', { token, baseUrl });
      return { attendance: (res.attendance ?? []).map(mapWorkerAttendance) } as T;
    }
    const studentId = urlObj.searchParams.get('studentId')?.trim();
    if (!studentId) {
      return { attendance: [] } as T;
    }
    const res = await workerFetch<{ attendance?: WorkerAttendance[] }>(
      `/api/attendance?studentId=${encodeURIComponent(studentId)}`,
      { token, baseUrl }
    );
    return { attendance: (res.attendance ?? []).map(mapWorkerAttendance) } as T;
  }

  if (pathname === '/api/attendance' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'student') {
      throw { status: 403, message: 'دانش‌آموز و والدین مجاز به ثبت حضور و غیاب نیستند.' };
    }
    if (isLocalWorkerToken(token)) {
      throw { status: 400, message: 'برای ثبت حضور و غیاب روی سرور اصلی، با حساب دبیر یا مدیر اصلی وارد شوید.' };
    }
    const res = await workerFetch<{ record?: WorkerAttendance; attendance?: WorkerAttendance }>('/api/attendance', {
      method: 'POST',
      token,
      baseUrl,
      body: {
        studentId: parsedBody.studentId,
        date: parsedBody.date,
        status: parsedBody.status || 'present',
        description: String(parsedBody.description || parsedBody.note || '').trim(),
      },
    });
    const rec = res.record || res.attendance;
    return {
      attendance: rec ? mapWorkerAttendance(rec) : undefined,
      message: 'حضور و غیاب با موفقیت ثبت شد.',
    } as T;
  }

  if (pathname === '/api/attendance/batch' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'student') {
      throw { status: 403, message: 'دانش‌آموز و والدین مجاز به ثبت حضور و غیاب نیستند.' };
    }
    if (isLocalWorkerToken(token)) {
      throw { status: 400, message: 'برای ثبت حضور و غیاب روی سرور اصلی، با حساب دبیر یا مدیر اصلی وارد شوید.' };
    }
    const entries = Array.isArray(parsedBody.entries)
      ? (parsedBody.entries as Array<{ studentId: string; status: string; note?: string }>)
      : [];
    const date = String(parsedBody.date || new Date().toLocaleDateString('fa-IR'));
    const created: AttendanceRecord[] = [];
    for (const entry of entries) {
      const res = await workerFetch<{ record?: WorkerAttendance; attendance?: WorkerAttendance }>('/api/attendance', {
        method: 'POST',
        token,
        baseUrl,
        body: {
          studentId: entry.studentId,
          date,
          status: entry.status || 'present',
          description: entry.note || '',
        },
      });
      const rec = res.record || res.attendance;
      if (rec) created.push(mapWorkerAttendance(rec));
    }
    return { records: created, message: 'حضور و غیاب با موفقیت ثبت شد.' } as T;
  }

  if (pathname === '/api/assignments' && method === 'GET') {
    await resolveWorkerUser(token, baseUrl);
    if (isLocalWorkerToken(token)) {
      return { assignments: readLocalJson('shahriar_wk_cached_assignments', []) } as T;
    }
    const res = await workerFetch<{ homework?: WorkerHomework[] }>('/api/homework', { token, baseUrl });
    const mapped = (res.homework ?? []).map(mapWorkerHomework);
    writeLocalJson('shahriar_wk_cached_assignments', mapped);
    return { assignments: mapped } as T;
  }

  if (pathname === '/api/assignments' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'student') {
      throw { status: 403, message: 'فقط دبیر یا مدیر مجاز به ثبت تکلیف است.' };
    }
    if (isLocalWorkerToken(token)) {
      const existing = readLocalJson<ReturnType<typeof mapWorkerHomework>[]>('shahriar_wk_cached_assignments', []);
      const created = mapWorkerHomework({
        id: genLocalId('hw'),
        title: String(parsedBody.title || ''),
        subject: String(parsedBody.subject || parsedBody.subjectId || 'عمومی'),
        description: String(parsedBody.description || ''),
        grade: String(parsedBody.grade || ''),
        className: String(parsedBody.classId || ''),
        dueDate: String(parsedBody.dueDate || ''),
        teacherId: currentUser.id,
        teacherName: currentUser.fullName,
        createdAt: new Date().toISOString(),
      });
      writeLocalJson('shahriar_wk_cached_assignments', [created, ...existing]);
      return { assignment: created, message: 'تکلیف جدید ثبت شد.' } as T;
    }
    const res = await workerFetch<{ homework: WorkerHomework }>('/api/homework', {
      method: 'POST',
      token,
      baseUrl,
      body: {
        title: parsedBody.title,
        subject: parsedBody.subject || parsedBody.subjectId || 'عمومی',
        description: parsedBody.description || '',
        grade: parsedBody.grade || '',
        className: parsedBody.classId || '',
        dueDate: parsedBody.dueDate || '',
      },
    });
    return { assignment: mapWorkerHomework(res.homework), message: 'تکلیف جدید ثبت شد.' } as T;
  }

  if (pathname === '/api/announcements' && method === 'GET') {
    await resolveWorkerUser(token, baseUrl);
    if (isLocalWorkerToken(token)) {
      return { announcements: readLocalJson('shahriar_wk_cached_announcements', []) } as T;
    }
    const res = await workerFetch<{ announcements?: WorkerAnnouncement[] }>('/api/announcements', { token, baseUrl });
    const mapped = (res.announcements ?? []).map(mapWorkerAnnouncement);
    writeLocalJson('shahriar_wk_cached_announcements', mapped);
    return { announcements: mapped } as T;
  }

  if (pathname === '/api/announcements' && method === 'POST') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role === 'student') {
      throw { status: 403, message: 'دانش‌آموز و والدین مجاز به انتشار اطلاعیه نیستند.' };
    }
    if (isLocalWorkerToken(token)) {
      const existing = readLocalJson<Announcement[]>('shahriar_wk_cached_announcements', []);
      const created: Announcement = {
        id: genLocalId('ann'),
        title: String(parsedBody.title || ''),
        body: String(parsedBody.body ?? parsedBody.message ?? ''),
        authorId: currentUser.id,
        authorName: currentUser.fullName,
        authorRole: currentUser.role,
        targetType: (parsedBody.targetType as Announcement['targetType']) || 'all',
        targetClassId: parsedBody.targetClassId ? String(parsedBody.targetClassId) : undefined,
        priority: (parsedBody.priority as Announcement['priority']) || 'normal',
        createdAt: new Date().toISOString(),
      };
      writeLocalJson('shahriar_wk_cached_announcements', [created, ...existing]);
      return { announcement: created, message: 'اطلاعیه منتشر شد.' } as T;
    }
    // Note: Legacy v1 Worker filters announcements with (!item.targetGrade || item.targetGrade === user.grade)
    // so targetGrade MUST be "" for "all"/"students" in order for students to see them!
    const targetGrade = parsedBody.targetType === 'teachers' ? 'teachers' : '';
    const res = await workerFetch<{ announcement: WorkerAnnouncement }>('/api/announcements', {
      method: 'POST',
      token,
      baseUrl,
      body: {
        title: parsedBody.title,
        message: parsedBody.body ?? parsedBody.message ?? '',
        targetGrade,
        targetClass: parsedBody.targetClassId || '',
      },
    });
    return { announcement: mapWorkerAnnouncement(res.announcement), message: 'اطلاعیه منتشر شد.' } as T;
  }

  if (pathname === '/api/settings') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    if (currentUser.role !== 'admin') {
      if (method === 'PUT') {
        throw { status: 403, message: 'فقط مدیر یا معاون مدرسه مجاز به تغییر تنظیمات است.' };
      }
      return { settings: DEFAULT_SETTINGS } as T;
    }
    const existingRaw = await fetchRawAdminSettings(token, baseUrl);
    if (isLocalWorkerToken(token)) {
      if (method === 'PUT') {
        const nextRaw = {
          ...existingRaw,
          name: parsedBody.schoolName || existingRaw.name || DEFAULT_SETTINGS.schoolName,
          schoolName: parsedBody.schoolName || existingRaw.schoolName || DEFAULT_SETTINGS.schoolName,
          academicYear: parsedBody.academicYear || existingRaw.academicYear || DEFAULT_SETTINGS.academicYear,
        };
        writeLocalJson(WK_CACHED_SETTINGS_KEY, nextRaw);
        return {
          settings: {
            ...DEFAULT_SETTINGS,
            schoolName: String(nextRaw.schoolName),
            academicYear: String(nextRaw.academicYear),
          },
          message: 'تنظیمات سامانه ذخیره شد.',
        } as T;
      }
      return { settings: await fetchAdminSettings(token, baseUrl) } as T;
    }
    const res = await workerFetch<{ settings?: { name?: string; academicYear?: string } }>('/api/admin/settings', {
      method: method === 'PUT' ? 'PUT' : 'GET',
      token,
      baseUrl,
      body:
        method === 'PUT'
          ? {
              settings: {
                name: parsedBody.schoolName,
                academicYear: parsedBody.academicYear,
                grades: ['هفتم', 'هشتم', 'نهم'],
                classes: existingRaw.classes ?? [],
              },
            }
          : undefined,
    });
    return {
      settings: {
        ...DEFAULT_SETTINGS,
        schoolName: res.settings?.name || (parsedBody.schoolName as string) || DEFAULT_SETTINGS.schoolName,
        academicYear: res.settings?.academicYear || (parsedBody.academicYear as string) || DEFAULT_SETTINGS.academicYear,
      },
      message: method === 'PUT' ? 'تنظیمات سامانه ذخیره شد.' : undefined,
    } as T;
  }

  if ((pathname === '/api/reports/card' || pathname === '/api/reports/class-cards') && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    const params = urlObj.searchParams;
    const requestedStudentId = (params.get('studentId') || '').trim();
    const requestedClassId = (params.get('classId') || '').trim();
    const rawTerm = (params.get('term') || 'all').trim();
    const validTerms: GradeTerm[] = ['مستمر اول', 'نوبت اول', 'مستمر دوم', 'نوبت دوم'];
    const termFilter: 'all' | GradeTerm = validTerms.includes(rawTerm as GradeTerm) ? (rawTerm as GradeTerm) : 'all';

    if (pathname === '/api/reports/class-cards' && currentUser.role === 'student') {
      throw { status: 403, message: 'دسترسی غیرمجاز' };
    }

    const rawSettings = await fetchRawAdminSettings(token, baseUrl);
    const cachedUsers = mergeAllKnownUsers([currentUser]);
    let allStudents = cachedUsers.filter((u) => u.role === 'student');
    if (!isLocalWorkerToken(token) && currentUser.role === 'admin') {
      try {
        const stuRes = await workerFetch<{ students?: WorkerUser[] }>('/api/admin/students', { token, baseUrl });
        if (Array.isArray(stuRes.students)) {
          const mapped = stuRes.students.map(mapWorkerUser);
          cacheKnownRemoteUsers(mapped);
          allStudents = mergeAllKnownUsers([currentUser, ...mapped]).filter((u) => u.role === 'student');
        }
      } catch {
        // Use cached users
      }
    }

    const classes = synthesizeClassesFromUsers(allStudents, rawSettings.classes ?? []);
    const allGrades: GradeRecord[] = [];
    if (!isLocalWorkerToken(token)) {
      if (currentUser.role === 'student') {
        const gr = await workerFetch<{ grades?: WorkerGrade[] }>('/api/grades', { token, baseUrl }).catch(() => ({ grades: [] }));
        if (Array.isArray(gr.grades)) allGrades.push(...gr.grades.map(mapWorkerGrade));
      } else {
        const targetClassObj = classes.find((c) => c.id === requestedClassId);
        const targetStudentsList = targetClassObj
          ? allStudents.filter((s) => s.classId === targetClassObj.id || s.gradeLevel === targetClassObj.gradeLevel)
          : allStudents.slice(0, 30);
        const batches = await Promise.allSettled(
          targetStudentsList.slice(0, 30).map((s) =>
            workerFetch<{ grades?: WorkerGrade[] }>(`/api/grades?studentId=${encodeURIComponent(s.id)}`, { token, baseUrl })
          )
        );
        for (const b of batches) {
          if (b.status === 'fulfilled' && Array.isArray(b.value.grades)) {
            allGrades.push(...b.value.grades.map(mapWorkerGrade));
          }
        }
      }
    }

    const buildFallbackCard = (stu: UserAccount, cls: SchoolClass | null): AdvancedReportCard => {
      const clsId = cls?.id ?? stu.classId ?? '';
      const classmates = clsId ? allStudents.filter((s) => s.classId === clsId) : [stu];
      const classmateIds = new Set(classmates.map((s) => s.id));
      const classGrades = allGrades.filter(
        (g) =>
          (clsId ? g.classId === clsId || classmateIds.has(g.studentId) : g.studentId === stu.id) &&
          (termFilter === 'all' || g.term === termFilter)
      );

      const subNames = new Map<string, string>();
      for (const sid of cls?.subjectIds ?? []) {
        subNames.set(sid, sid);
      }
      for (const g of classGrades) {
        if (!subNames.has(g.subjectId)) {
          subNames.set(g.subjectId, g.subjectName || g.subjectId);
        }
      }

      const stuAccum = new Map<string, { sum: number; count: number }>();
      const rows: AdvancedReportCardSubjectRow[] = Array.from(subNames.entries()).map(([sid, sName]) => {
        const subGrades = classGrades.filter((g) => g.subjectId === sid);
        const byStu = new Map<string, number[]>();
        for (const g of subGrades) {
          const norm = (g.score / (g.maxScore || 20)) * 20;
          byStu.set(g.studentId, [...(byStu.get(g.studentId) ?? []), norm]);
        }
        const stuAvgs: number[] = [];
        for (const [sId, vals] of byStu.entries()) {
          const sAvg = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
          stuAvgs.push(sAvg);
          const acc = stuAccum.get(sId) ?? { sum: 0, count: 0 };
          acc.sum += sAvg;
          acc.count += 1;
          stuAccum.set(sId, acc);
        }
        const myVals = byStu.get(stu.id) ?? [];
        const studentAverage =
          myVals.length > 0 ? Number((myVals.reduce((a, b) => a + b, 0) / myVals.length).toFixed(2)) : null;
        const classAverage =
          stuAvgs.length > 0 ? Number((stuAvgs.reduce((a, b) => a + b, 0) / stuAvgs.length).toFixed(2)) : null;
        return {
          subjectId: sid,
          subjectCode: '—',
          subjectName: sName,
          coefficient: 1,
          studentGradesCount: myVals.length,
          studentAverage,
          classAverage,
          classGradedStudentsCount: stuAvgs.length,
          subjectRank:
            studentAverage !== null ? 1 + stuAvgs.filter((v) => v > studentAverage + 0.0001).length : null,
          subjectRankedTotal: stuAvgs.length,
          highestSubjectAverage: stuAvgs.length > 0 ? Math.max(...stuAvgs) : null,
          lowestSubjectAverage: stuAvgs.length > 0 ? Math.min(...stuAvgs) : null,
        };
      });

      const gpas = Array.from(stuAccum.entries()).map(([id, acc]) => ({
        id,
        gpa: Number((acc.sum / Math.max(1, acc.count)).toFixed(2)),
      }));
      const myGpa = gpas.find((x) => x.id === stu.id)?.gpa ?? null;
      const gpaVals = gpas.map((x) => x.gpa);

      return {
        studentId: stu.id,
        studentName: stu.fullName,
        nationalId: stu.nationalId || '',
        username: stu.username,
        gradeLevel: cls?.gradeLevel ?? stu.gradeLevel ?? 'نامشخص',
        classId: clsId,
        className: cls?.name ?? (stu.gradeLevel ? `کلاس پایه ${stu.gradeLevel}` : 'تخصیص‌نیافته'),
        academicYear: rawSettings.academicYear || DEFAULT_SETTINGS.academicYear,
        term: termFilter,
        schoolName: rawSettings.schoolName || DEFAULT_SETTINGS.schoolName,
        principalName: rawSettings.principalName || DEFAULT_SETTINGS.principalName,
        passingScore: 10,
        generatedAt: new Date().toISOString(),
        subjects: rows,
        overallGpa: myGpa,
        classHighestGpa: gpaVals.length > 0 ? Math.max(...gpaVals) : null,
        classLowestGpa: gpaVals.length > 0 ? Math.min(...gpaVals) : null,
        overallRank: myGpa !== null ? 1 + gpaVals.filter((v) => v > myGpa + 0.0001).length : null,
        rankedStudentsCount: gpaVals.length,
        totalClassStudents: classmates.length,
        attendanceSummary: { ...EMPTY_ATTENDANCE_STATS },
      };
    };

    if (pathname === '/api/reports/class-cards') {
      const targetCls = classes.find((c) => c.id === requestedClassId) ?? classes[0] ?? null;
      const clsStudents = targetCls
        ? allStudents.filter((s) => s.classId === targetCls.id)
        : allStudents;
      return {
        reportCards: clsStudents.map((s) => buildFallbackCard(s, targetCls)),
        classInfo: targetCls,
      } as T;
    }

    const targetStu =
      currentUser.role === 'student'
        ? currentUser
        : allStudents.find((s) => s.id === requestedStudentId) ??
          allStudents.find((s) => !requestedClassId || s.classId === requestedClassId) ??
          allStudents[0] ??
          currentUser;
    const targetCls =
      classes.find((c) => c.id === (requestedClassId || targetStu.classId || '')) ?? null;
    return { reportCard: buildFallbackCard(targetStu, targetCls) } as T;
  }

  if (pathname === '/api/reports/overview' && method === 'GET') {
    const currentUser = await resolveWorkerUser(token, baseUrl);

    if (currentUser.role === 'admin') {
      const [statsRes, stuRes, tchRes, hwRes, annRes, rawSettings] = isLocalWorkerToken(token)
        ? [
            { data: undefined },
            { students: [] as WorkerUser[] },
            { teachers: [] as WorkerUser[] },
            { homework: [] as WorkerHomework[] },
            { announcements: [] as WorkerAnnouncement[] },
            await fetchRawAdminSettings(token, baseUrl),
          ]
        : await Promise.all([
            workerFetch<{ data?: { students?: number; teachers?: number; announcements?: number; homework?: number } }>(
              '/api/dashboard/stats',
              { token, baseUrl }
            ).catch((): { data?: { students?: number; teachers?: number; announcements?: number; homework?: number } } => ({
              data: undefined,
            })),
            workerFetch<{ students?: WorkerUser[] }>('/api/admin/students', { token, baseUrl }).catch(
              (): { students?: WorkerUser[] } => ({ students: [] })
            ),
            workerFetch<{ teachers?: WorkerUser[] }>('/api/admin/teachers', { token, baseUrl }).catch(
              (): { teachers?: WorkerUser[] } => ({ teachers: [] })
            ),
            workerFetch<{ homework?: WorkerHomework[] }>('/api/homework', { token, baseUrl }).catch(
              (): { homework?: WorkerHomework[] } => ({ homework: [] })
            ),
            workerFetch<{ announcements?: WorkerAnnouncement[] }>('/api/announcements', { token, baseUrl }).catch(
              (): { announcements?: WorkerAnnouncement[] } => ({ announcements: [] })
            ),
            fetchRawAdminSettings(token, baseUrl),
          ]);

      const stats: { students?: number; teachers?: number; announcements?: number; homework?: number } =
        statsRes.data ?? {};
      const remoteStudents = Array.isArray(stuRes.students) ? stuRes.students.map(mapWorkerUser) : [];
      const remoteTeachers = Array.isArray(tchRes.teachers) ? tchRes.teachers.map(mapWorkerUser) : [];
      if (!isLocalWorkerToken(token) && (remoteStudents.length || remoteTeachers.length)) {
        cacheKnownRemoteUsers([currentUser, ...remoteStudents, ...remoteTeachers]);
      }
      const allKnown = mergeAllKnownUsers([currentUser, ...remoteStudents, ...remoteTeachers]);
      const studentUsers = allKnown.filter((u) => u.role === 'student');
      const teacherUsers = allKnown.filter((u) => u.role === 'teacher');
      const homework = Array.isArray(hwRes.homework) ? hwRes.homework : [];
      const announcements = Array.isArray(annRes.announcements) ? annRes.announcements : [];

      const sampledStudents = isLocalWorkerToken(token) ? [] : studentUsers.slice(0, 25);
      const [gradeBatches, attBatches] = await Promise.all([
        Promise.allSettled(
          sampledStudents.map((s) =>
            workerFetch<{ grades?: WorkerGrade[] }>(`/api/grades?studentId=${encodeURIComponent(s.id)}`, {
              token,
              baseUrl,
            })
          )
        ),
        Promise.allSettled(
          sampledStudents.map((s) =>
            workerFetch<{ attendance?: WorkerAttendance[] }>(
              `/api/attendance?studentId=${encodeURIComponent(s.id)}`,
              { token, baseUrl }
            )
          )
        ),
      ]);

      const allGrades: GradeRecord[] = [];
      for (const b of gradeBatches) {
        if (b.status === 'fulfilled' && Array.isArray(b.value.grades)) {
          allGrades.push(...b.value.grades.map(mapWorkerGrade));
        }
      }
      const allAttendance: AttendanceRecord[] = [];
      for (const b of attBatches) {
        if (b.status === 'fulfilled' && Array.isArray(b.value.attendance)) {
          allAttendance.push(...b.value.attendance.map(mapWorkerAttendance));
        }
      }

      const attendanceStats = computeAttendanceStats(allAttendance);
      const normScores = allGrades.map((g) => (g.score / (g.maxScore || 20)) * 20);
      const schoolAverage =
        normScores.length > 0 ? Number((normScores.reduce((a, b) => a + b, 0) / normScores.length).toFixed(2)) : 0;

      const bySubject = new Map<string, number[]>();
      const byTerm = new Map<string, number[]>();
      const byStudent = new Map<string, number[]>();
      for (const g of allGrades) {
        const norm = (g.score / (g.maxScore || 20)) * 20;
        const subName = g.subjectName || g.subjectId || 'عمومی';
        bySubject.set(subName, [...(bySubject.get(subName) ?? []), norm]);
        byTerm.set(g.term, [...(byTerm.get(g.term) ?? []), norm]);
        byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), norm]);
      }

      const studentRankings = studentUsers
        .map((s) => {
          const vals = byStudent.get(s.id) ?? [];
          const avg = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
          return {
            studentId: s.id,
            fullName: s.fullName,
            className: s.classId || s.gradeLevel || '—',
            average: avg,
            gradesCount: vals.length,
          };
        })
        .filter((r) => r.gradesCount > 0);

      const classes = synthesizeClassesFromUsers(studentUsers, rawSettings.classes ?? []);
      const studentsCount = stats.students ?? studentUsers.length;
      const teachersCount = stats.teachers ?? teacherUsers.length;
      const activeStudentsCount = studentUsers.filter((s) => s.active).length || studentsCount;
      const inactiveStudentsCount = Math.max(0, studentsCount - activeStudentsCount);
      const activeTeachersCount = teacherUsers.filter((t) => t.active).length || teachersCount;
      const inactiveTeachersCount = Math.max(0, teachersCount - activeTeachersCount);

      const gradeGroups = new Map<string, { studentsCount: number; classSet: Set<string> }>();
      for (const s of studentUsers) {
        const g = s.gradeLevel || 'ثبت‌نشده';
        const entry = gradeGroups.get(g) ?? { studentsCount: 0, classSet: new Set<string>() };
        entry.studentsCount += 1;
        if (s.classId) entry.classSet.add(s.classId);
        gradeGroups.set(g, entry);
      }

      const adminUsers = allKnown.filter((u) => u.role === 'admin');
      const activeAdminsCount = Math.max(1, adminUsers.filter((a) => a.active).length);
      const inactiveAdminsCount = adminUsers.filter((a) => !a.active).length;

      return {
        studentsCount,
        activeStudentsCount,
        activeAccountsCount: activeStudentsCount + activeTeachersCount + activeAdminsCount,
        inactiveAccountsCount: inactiveStudentsCount + inactiveTeachersCount + inactiveAdminsCount,
        teachersCount,
        classesCount: classes.length,
        subjectsCount: bySubject.size,
        gradesCount: allGrades.length,
        schoolAverage,
        assignmentsCount: stats.homework ?? homework.length,
        activeExamsCount: 0,
        completedExamsCount: 0,
        announcementsCount: stats.announcements ?? announcements.length,
        pendingProfileRequestsCount: 0,
        attendanceStats,
        classAverages: [],
        subjectAverages: Array.from(bySubject.entries()).map(([label, vals]) => ({
          label,
          value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
        })),
        termTrend: Array.from(byTerm.entries()).map(([label, vals]) => ({
          label,
          value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
          count: vals.length,
        })),
        gradeDistribution: [],
        gradeLevelStats: Array.from(gradeGroups.entries()).map(([label, d]) => {
          const lvlStudents = studentUsers.filter((s) => (s.gradeLevel || 'ثبت‌نشده') === label);
          const lvlStuIds = new Set(lvlStudents.map((s) => s.id));
          const lvlGrades = allGrades.filter((g) => lvlStuIds.has(g.studentId));
          const lvlAtt = allAttendance.filter((a) => lvlStuIds.has(a.studentId));
          const lvlPresent = lvlAtt.filter((a) => a.status === 'present').length;
          return {
            label,
            studentsCount: d.studentsCount,
            classesCount: d.classSet.size,
            averageScore:
              lvlGrades.length > 0
                ? Number(
                    (
                      lvlGrades.reduce((sum, g) => sum + (g.score / (g.maxScore || 20)) * 20, 0) /
                      lvlGrades.length
                    ).toFixed(2)
                  )
                : 0,
            attendanceRate: lvlAtt.length > 0 ? Math.round((lvlPresent / lvlAtt.length) * 100) : 0,
          };
        }),
        classPerformance: classes.map((c) => {
          const clsStuIds = new Set(studentUsers.filter((s) => s.classId === c.id).map((s) => s.id));
          const clsGrades = allGrades.filter((g) => g.classId === c.id || clsStuIds.has(g.studentId));
          const clsAtt = allAttendance.filter((a) => a.classId === c.id || clsStuIds.has(a.studentId));
          const clsPresent = clsAtt.filter((a) => a.status === 'present').length;
          return {
            id: c.id,
            name: c.name,
            gradeLevel: c.gradeLevel,
            studentsCount: clsStuIds.size,
            capacity: c.capacity,
            gradesCount: clsGrades.length,
            averageScore:
              clsGrades.length > 0
                ? Number(
                    (
                      clsGrades.reduce((sum, g) => sum + (g.score / (g.maxScore || 20)) * 20, 0) /
                      clsGrades.length
                    ).toFixed(2)
                  )
                : 0,
            attendanceRate: clsAtt.length > 0 ? Math.round((clsPresent / clsAtt.length) * 100) : 0,
          };
        }),
        topStudents: [...studentRankings].sort((a, b) => b.average - a.average).slice(0, 5),
        attentionStudents: studentRankings.filter((r) => r.average < 14).sort((a, b) => a.average - b.average).slice(0, 5),
        roleBreakdown: {
          studentsActive: activeStudentsCount,
          studentsInactive: inactiveStudentsCount,
          teachersActive: activeTeachersCount,
          teachersInactive: inactiveTeachersCount,
          adminsCount: activeAdminsCount,
        },
        engagementStats: {
          assignmentsCount: stats.homework ?? homework.length,
          totalSubmissions: 0,
          gradedSubmissions: 0,
          submissionRate: 0,
          examsCount: 0,
          examAttemptsCount: 0,
          avgExamPercent: 0,
          studyPlansCount: 0,
          completedStudyPlansCount: 0,
          directMessagesCount: 0,
          calendarEventsCount: 0,
        },
        recentActivity: [],
      } as T;
    }

    if (currentUser.role === 'student') {
      if (isLocalWorkerToken(token)) {
        return {
          gpa: 0,
          currentTermGpa: 0,
          gradesCount: 0,
          subjectsCount: 0,
          academicProgress: 0,
          classRank: null,
          attendanceStats: { ...EMPTY_ATTENDANCE_STATS },
          pendingAssignments: 0,
          submittedAssignments: 0,
          totalAssignments: 0,
          assignmentBreakdown: { pending: 0, submitted: 0, graded: 0, late: 0 },
          activeExamsCount: 0,
          completedExamsCount: 0,
          recentGrades: [],
          upcomingEvents: [],
          historiesCount: 0,
          latestHistory: null,
          subjectChart: [],
          termTrend: [],
          coins: 0,
        } as T;
      }
      const [gradesRes, attRes, hwRes] = await Promise.allSettled([
        workerFetch<{ grades?: WorkerGrade[] }>('/api/grades', { token, baseUrl }),
        workerFetch<{ attendance?: WorkerAttendance[] }>('/api/attendance', { token, baseUrl }),
        workerFetch<{ homework?: WorkerHomework[] }>('/api/homework', { token, baseUrl }),
      ]);

      const grades =
        gradesRes.status === 'fulfilled' && Array.isArray(gradesRes.value.grades)
          ? gradesRes.value.grades.map(mapWorkerGrade)
          : [];
      const attendance =
        attRes.status === 'fulfilled' && Array.isArray(attRes.value.attendance)
          ? attRes.value.attendance.map(mapWorkerAttendance)
          : [];
      const homework =
        hwRes.status === 'fulfilled' && Array.isArray(hwRes.value.homework)
          ? hwRes.value.homework.map(mapWorkerHomework)
          : [];

      const attendanceStats = computeAttendanceStats(attendance);
      const normalizedScores = grades.map((g) => (g.score / g.maxScore) * 20);
      const gpa =
        normalizedScores.length > 0
          ? Number((normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length).toFixed(2))
          : 0;

      const bySubject = new Map<string, number[]>();
      const byTerm = new Map<string, number[]>();
      for (const g of grades) {
        const norm = (g.score / g.maxScore) * 20;
        const subName = g.subjectName || g.subjectId || 'عمومی';
        bySubject.set(subName, [...(bySubject.get(subName) ?? []), norm]);
        byTerm.set(g.term, [...(byTerm.get(g.term) ?? []), norm]);
      }

      return {
        gpa,
        currentTermGpa: gpa,
        gradesCount: grades.length,
        subjectsCount: bySubject.size,
        academicProgress: gpa > 0 ? Math.min(100, Math.round((gpa / 20) * 100)) : 0,
        classRank: null,
        attendanceStats,
        pendingAssignments: homework.length,
        submittedAssignments: 0,
        totalAssignments: homework.length,
        assignmentBreakdown: {
          pending: homework.length,
          submitted: 0,
          graded: 0,
          late: 0,
        },
        activeExamsCount: 0,
        completedExamsCount: 0,
        recentGrades: grades.slice(0, 6).map((g) => ({
          id: g.id,
          title: g.title,
          subjectName: g.subjectName || g.subjectId,
          term: g.term,
          score: g.score,
          maxScore: g.maxScore,
          normalized: Number(((g.score / g.maxScore) * 20).toFixed(2)),
          date: g.date,
        })),
        upcomingEvents: [],
        historiesCount: 0,
        latestHistory: null,
        subjectChart: Array.from(bySubject.entries()).map(([label, vals]) => ({
          label,
          value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
        })),
        termTrend: Array.from(byTerm.entries()).map(([label, vals]) => ({
          label,
          value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
          count: vals.length,
        })),
        coins: 0,
      } as T;
    }

    // Teacher role
    const [hwRes] = await Promise.allSettled([
      workerFetch<{ homework?: WorkerHomework[] }>('/api/homework', { token, baseUrl }),
    ]);
    const homework =
      hwRes.status === 'fulfilled' && Array.isArray(hwRes.value.homework) ? hwRes.value.homework : [];

    return {
      classesCount: currentUser.classId ? 1 : 0,
      subjectsCount: 0,
      studentsCount: 0,
      gradesCount: 0,
      averageScore: 0,
      assignmentsCount: homework.length,
      awaitingReviewCount: 0,
      activeExamsCount: 0,
      attendanceStats: { ...EMPTY_ATTENDANCE_STATS },
      classAverages: [],
      subjectAverages: [],
      termTrend: [],
      gradeDistribution: [],
      assignmentBreakdown: {
        totalAssignments: homework.length,
        expectedSubmissions: 0,
        submittedCount: 0,
        gradedCount: 0,
        pendingReviewCount: 0,
        completionRate: 0,
      },
      classSummaries: [],
      examSummaries: [],
      topStudents: [],
      recentGrades: [],
    } as T;
  }

  // LocalStorage + Mokhyar AI fallback handlers for Private Tutor, Study Plans, Library, Honors, Question Bank, Exams, Academic Risk
  const currentUser = await resolveWorkerUser(token, baseUrl).catch(() => null);

  if (pathname === '/api/study-plans') {
    const uid = currentUser?.id || 'local';
    const key = `shahriar_study_plans_${uid}`;
    const list = readLocalJson<StudyPlanTask[]>(key, []);
    if (method === 'GET') return { plans: list } as T;
    if (method === 'POST') {
      const task: StudyPlanTask = {
        id: genLocalId('stp'),
        studentId: uid,
        title: String(parsedBody.title || '').trim(),
        subjectId: parsedBody.subjectId ? String(parsedBody.subjectId) : undefined,
        targetDate: String(parsedBody.targetDate || new Date().toLocaleDateString('fa-IR')),
        durationMinutes: Number(parsedBody.durationMinutes) || 45,
        completed: false,
        notes: parsedBody.notes ? String(parsedBody.notes) : undefined,
        category: (parsedBody.category as StudyPlanTask['category']) || 'study',
        aiGenerated: Boolean(parsedBody.aiGenerated),
        createdAt: new Date().toISOString(),
      };
      writeLocalJson(key, [task, ...list]);
      return { plan: task, message: 'برنامه ذخیره شد.' } as T;
    }
  }

  if (pathname.startsWith('/api/study-plans/')) {
    const uid = currentUser?.id || 'local';
    const key = `shahriar_study_plans_${uid}`;
    const list = readLocalJson<StudyPlanTask[]>(key, []);
    const id = decodeURIComponent(pathname.split('/')[3] || '');
    if (method === 'PATCH') {
      const updated = list.map((p) => (p.id === id ? { ...p, ...parsedBody } : p));
      writeLocalJson(key, updated);
      return { plan: updated.find((p) => p.id === id) } as T;
    }
    if (method === 'DELETE') {
      writeLocalJson(key, list.filter((p) => p.id !== id));
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/smart-planner/generate' && method === 'POST') {
    const isAdmin = currentUser ? currentUser.role === 'admin' : false;
    const raw = await completeDedicatedAiFallback(
      'فقط JSON برگردان شامل {"summary":"...","tasks":[{"title":"...","targetDate":"1404/10/15","durationMinutes":45,"notes":"...","category":"study"}]}',
      `برنامه هوشمند ${isAdmin ? 'مدیریتی مدرسه' : 'مطالعه دانش‌آموزی'} درباره: ${String(parsedBody.focusGoal || 'بهبود آموزشی')} برای ${Number(parsedBody.daysCount) || 5} روز.`
    );
    const parsed = extractFallbackJson<{ summary?: string; tasks?: Array<Record<string, unknown>> }>(raw);
    return {
      summary: parsed?.summary || 'برنامه هوشمند تولیدشده',
      tasks: (parsed?.tasks || []).map((t) => ({
        title: String(t.title || 'برنامه مطالعه'),
        targetDate: String(t.targetDate || new Date().toLocaleDateString('fa-IR')),
        durationMinutes: Number(t.durationMinutes) || 45,
        notes: String(t.notes || ''),
        category: isAdmin ? 'administrative' : 'study',
      })),
    } as T;
  }

  if (pathname === '/api/private-tutor/sources') {
    const key = 'shahriar_tutor_sources';
    const list = readLocalJson<TeacherSourceMaterial[]>(key, []);
    if (method === 'GET') {
      return {
        sources: currentUser && currentUser.role === 'student' ? list.filter((s) => s.approved) : list,
      } as T;
    }
    if (method === 'POST' && currentUser && currentUser.role !== 'student') {
      const now = new Date().toISOString();
      const item: TeacherSourceMaterial = {
        id: genLocalId('tsrc'),
        title: String(parsedBody.title || ''),
        subjectId: parsedBody.subjectId ? String(parsedBody.subjectId) : undefined,
        subjectName: String(parsedBody.subjectName || 'عمومی'),
        gradeLevel: String(parsedBody.gradeLevel || 'هفتم'),
        chapter: parsedBody.chapter ? String(parsedBody.chapter) : undefined,
        topic: parsedBody.topic ? String(parsedBody.topic) : undefined,
        authorId: currentUser.id,
        authorName: currentUser.fullName,
        authorRole: currentUser.role,
        approved: true,
        pages: Array.isArray(parsedBody.pages) ? parsedBody.pages : [],
        createdAt: now,
        updatedAt: now,
      };
      writeLocalJson(key, [item, ...list]);
      return { source: item, message: 'منبع ذخیره شد.' } as T;
    }
  }

  if (pathname.startsWith('/api/private-tutor/sources/')) {
    const key = 'shahriar_tutor_sources';
    const list = readLocalJson<TeacherSourceMaterial[]>(key, []);
    const id = decodeURIComponent(pathname.split('/')[4] || '');
    if (method === 'PATCH') {
      const next = list.map((s) => (s.id === id ? { ...s, ...parsedBody, updatedAt: new Date().toISOString() } : s));
      writeLocalJson(key, next);
      return { source: next.find((s) => s.id === id) } as T;
    }
    if (method === 'DELETE') {
      writeLocalJson(key, list.filter((s) => s.id !== id));
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/private-tutor/sessions') {
    const uid = currentUser?.id || 'local';
    const key = `shahriar_tutor_sessions_${uid}`;
    const list = readLocalJson<PrivateTutorSession[]>(key, []);
    if (method === 'GET') return { sessions: list } as T;
    if (method === 'POST') {
      const now = new Date().toISOString();
      const s: PrivateTutorSession = {
        id: genLocalId('pts'),
        userId: uid,
        title: String(parsedBody.title || 'جلسه معلم خصوصی'),
        subjectId: parsedBody.subjectId ? String(parsedBody.subjectId) : undefined,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      writeLocalJson(key, [s, ...list]);
      return { session: s } as T;
    }
  }

  if (pathname.startsWith('/api/private-tutor/sessions/')) {
    const uid = currentUser?.id || 'local';
    const key = `shahriar_tutor_sessions_${uid}`;
    const list = readLocalJson<PrivateTutorSession[]>(key, []);
    const id = decodeURIComponent(pathname.split('/')[4] || '');
    if (method === 'GET') return { session: list.find((s) => s.id === id) } as T;
    if (method === 'DELETE') {
      writeLocalJson(key, list.filter((s) => s.id !== id));
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/private-tutor/diagnosis') {
    const uid = currentUser?.id || 'local';
    const mistakes = readLocalJson<StudentMistakeRecord[]>(`shahriar_mistakes_${uid}`, []);
    const sources = readLocalJson<TeacherSourceMaterial[]>('shahriar_tutor_sources', []).filter((s) => s.approved);
    const localExams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    const localAttempts = localExams
      .map((ex) => {
        const atts = readLocalJson<ExamAttempt[]>(`shahriar_exam_attempts_${ex.id}`, []);
        return atts.find((a) => a.studentId === uid);
      })
      .filter((a): a is ExamAttempt => Boolean(a));
    const examNorms = localAttempts
      .filter((a) => a.maxScore > 0)
      .map((a) => (a.score / a.maxScore) * 20);
    const learningLevel =
      examNorms.length > 0
        ? (() => {
            const avg = examNorms.reduce((s, v) => s + v, 0) / examNorms.length;
            return avg >= 18
              ? 'پیشرفته و المپیادی'
              : avg >= 14.5
              ? 'متوسط و رو به پیشرفت'
              : 'مبتدی و نیازمند مرور پایه';
          })()
        : 'در حال ارزیابی اولیه (بدون نمره ثبت‌شده)';
    return {
      diagnosis: {
        studentId: uid,
        learningLevel,
        weakTopics: mistakes.slice(0, 5).map((m) => ({
          topic: m.topic,
          subjectName: m.subjectName || 'عمومی',
          evidence: `${m.count} بار تکرار در ${m.mistakeType}`,
          priority: m.count >= 2 ? 'بالا' : 'متوسط',
        })),
        recurringMistakes: mistakes,
        recommendedSources: sources.slice(0, 4).map((s) => ({
          sourceId: s.id,
          title: s.title,
          subjectName: s.subjectName,
          pageCount: s.pages.length,
        })),
      },
    } as T;
  }

  if (pathname === '/api/private-tutor/mistakes' && method === 'POST') {
    const uid = currentUser?.id || 'local';
    const key = `shahriar_mistakes_${uid}`;
    const list = readLocalJson<StudentMistakeRecord[]>(key, []);
    const now = new Date().toISOString();
    const rec: StudentMistakeRecord = {
      id: genLocalId('mst'),
      studentId: uid,
      topic: String(parsedBody.topic || ''),
      mistakeType: String(parsedBody.mistakeType || ''),
      subjectName: parsedBody.subjectName ? String(parsedBody.subjectName) : undefined,
      severity: (parsedBody.severity as StudentMistakeRecord['severity']) || 'medium',
      count: 1,
      lastOccurredAt: now,
      createdAt: now,
    };
    writeLocalJson(key, [rec, ...list]);
    return { mistake: rec } as T;
  }

  if (pathname === '/api/private-tutor/generate-practice' && method === 'POST') {
    const uid = currentUser?.id || 'local';
    const localExams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    const localAttempts = localExams
      .map((ex) => readLocalJson<ExamAttempt[]>(`shahriar_exam_attempts_${ex.id}`, []).find((a) => a.studentId === uid))
      .filter((a): a is ExamAttempt => Boolean(a));
    const examNorms = localAttempts.filter((a) => a.maxScore > 0).map((a) => (a.score / a.maxScore) * 20);
    const learningLevel =
      examNorms.length > 0
        ? (() => {
            const avg = examNorms.reduce((s, v) => s + v, 0) / examNorms.length;
            return avg >= 18
              ? 'پیشرفته و المپیادی'
              : avg >= 14.5
              ? 'متوسط و رو به پیشرفت'
              : 'مبتدی و نیازمند مرور پایه';
          })()
        : 'در حال ارزیابی اولیه (بدون نمره ثبت‌شده)';
    const raw = await completeDedicatedAiFallback(
      'فقط JSON آرایه‌ای از تمرین‌ها برگردان: [{"question":"...","type":"mcq","options":["...","...","...","..."],"correctIndex":0,"correctAnswer":"...","explanation":"...","topic":"...","difficulty":"medium"}]',
      `برای مبحث «${String(parsedBody.topic || 'ریاضی')}» تعداد ${Number(parsedBody.count) || 3} تمرین طراحی کن.`
    );
    const parsed = extractFallbackJson<Partial<PracticeExerciseItem>[]>(raw) || [];
    return {
      level: learningLevel,
      learningLevel,
      exercises: parsed.map((p) => ({
        id: genLocalId('prc'),
        question: String(p.question || ''),
        type: p.type === 'short_answer' ? 'short_answer' : 'mcq',
        options: Array.isArray(p.options) ? p.options.map(String) : [],
        correctIndex: typeof p.correctIndex === 'number' ? p.correctIndex : 0,
        correctAnswer: String(p.correctAnswer || ''),
        explanation: String(p.explanation || ''),
        topic: String(p.topic || parsedBody.topic || ''),
        difficulty: (p.difficulty as 'easy' | 'medium' | 'hard') || 'medium',
      })),
    } as T;
  }

  if (pathname === '/api/private-tutor/generate-remedial-plan' && method === 'POST') {
    const raw = await completeDedicatedAiFallback(
      'فقط JSON آرایه‌ای از گام‌های جبرانی برگردان: [{"dayLabel":"روز اول","focusTopic":"...","activity":"...","durationMinutes":45,"sourceReference":"..."}]',
      `برنامه جبرانی برای تمرکز: ${String(parsedBody.focusTopic || 'تقویت دروس')}`
    );
    const plan = extractFallbackJson<RemedialPlanItem[]>(raw) || [];
    const summary = `برنامه جبرانی ${plan.length} گامه${parsedBody.focusTopic ? ` برای مبحث «${String(parsedBody.focusTopic)}»` : ''} آماده شد.`;
    return { summary, items: plan, plan } as T;
  }

  if (pathname === '/api/exams/ai-generate' && method === 'POST') {
    const raw = await completeDedicatedAiFallback(
      'فقط آرایه JSON سؤالات آزمون برگردان: [{"type":"mcq","prompt":"...","options":["...","...","...","..."],"correctIndex":0,"correctText":"...","points":2,"topic":"..."}]',
      `طراحی ${Number(parsedBody.count) || 5} سؤال سطح ${String(parsedBody.difficulty || 'medium')} از فصل ${String(parsedBody.chapter || '')} مبحث ${String(parsedBody.topic || '')}`
    );
    const parsed = extractFallbackJson<Partial<ExamQuestion>[]>(raw) || [];
    return {
      questions: parsed.map((q) => ({
        id: genLocalId('q'),
        type: (q.type as ExamQuestionType) || 'mcq',
        prompt: String(q.prompt || ''),
        options: Array.isArray(q.options) ? q.options : [],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        correctText: q.correctText,
        points: Number(q.points) || 2,
        topic: q.topic,
        difficulty: (parsedBody.difficulty as ExamDifficulty) || 'medium',
      })),
    } as T;
  }

  if (pathname === '/api/question-bank') {
    const key = 'shahriar_question_bank';
    const list = readLocalJson<TeacherBankQuestion[]>(key, []);
    if (method === 'GET') return { questions: list } as T;
    if (method === 'POST' && currentUser) {
      const item: TeacherBankQuestion = {
        id: genLocalId('qbq'),
        teacherId: currentUser.id,
        teacherName: currentUser.fullName,
        subjectId: String(parsedBody.subjectId || ''),
        gradeLevel: String(parsedBody.gradeLevel || 'هفتم'),
        chapter: parsedBody.chapter ? String(parsedBody.chapter) : undefined,
        topic: parsedBody.topic ? String(parsedBody.topic) : undefined,
        difficulty: (parsedBody.difficulty as ExamDifficulty) || 'medium',
        type: (parsedBody.type as ExamQuestionType) || 'mcq',
        prompt: String(parsedBody.prompt || ''),
        options: Array.isArray(parsedBody.options) ? parsedBody.options : [],
        correctIndex: Number(parsedBody.correctIndex) || 0,
        correctText: parsedBody.correctText ? String(parsedBody.correctText) : undefined,
        points: Number(parsedBody.points) || 2,
        createdAt: new Date().toISOString(),
      };
      writeLocalJson(key, [item, ...list]);
      return { question: item } as T;
    }
  }

  if (pathname.startsWith('/api/question-bank/') && method === 'DELETE') {
    const key = 'shahriar_question_bank';
    const id = decodeURIComponent(pathname.split('/')[3] || '');
    writeLocalJson(key, readLocalJson<TeacherBankQuestion[]>(key, []).filter((q) => q.id !== id));
    return { ok: true } as T;
  }

  if (pathname === '/api/library') {
    const key = 'shahriar_digital_library';
    const list = readLocalJson<DigitalLibraryItem[]>(key, []);
    if (method === 'GET') return { items: list } as T;
    if (method === 'POST' && currentUser && currentUser.role !== 'student') {
      const item: DigitalLibraryItem = {
        id: genLocalId('lib'),
        title: String(parsedBody.title || ''),
        description: String(parsedBody.description || ''),
        category: (parsedBody.category as DigitalLibraryItem['category']) || 'handout',
        gradeLevel: String(parsedBody.gradeLevel || 'هفتم'),
        subjectId: parsedBody.subjectId ? String(parsedBody.subjectId) : undefined,
        subjectName: parsedBody.subjectName ? String(parsedBody.subjectName) : undefined,
        fileUrl: parsedBody.fileUrl ? String(parsedBody.fileUrl) : undefined,
        contentPreview: parsedBody.contentPreview ? String(parsedBody.contentPreview) : undefined,
        durationOrPages: parsedBody.durationOrPages ? String(parsedBody.durationOrPages) : undefined,
        authorId: currentUser.id,
        authorName: currentUser.fullName,
        approved: true,
        createdAt: new Date().toISOString(),
      };
      writeLocalJson(key, [item, ...list]);
      return { item } as T;
    }
  }

  if (pathname.startsWith('/api/library/')) {
    const key = 'shahriar_digital_library';
    const id = decodeURIComponent(pathname.split('/')[3] || '');
    const list = readLocalJson<DigitalLibraryItem[]>(key, []);
    if (method === 'PATCH') {
      const next = list.map((i) => (i.id === id ? { ...i, ...parsedBody } : i));
      writeLocalJson(key, next);
      return { item: next.find((i) => i.id === id) } as T;
    }
    if (method === 'DELETE') {
      writeLocalJson(key, list.filter((i) => i.id !== id));
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/honors') {
    const key = 'shahriar_student_honors';
    const list = readLocalJson<StudentHonor[]>(key, []);
    if (method === 'GET') return { honors: list } as T;
    if (method === 'POST' && currentUser && currentUser.role !== 'student') {
      const honor: StudentHonor = {
        id: genLocalId('hnr'),
        studentId: String(parsedBody.studentId || ''),
        title: String(parsedBody.title || ''),
        category: (parsedBody.category as StudentHonor['category']) || 'academic',
        level: (parsedBody.level as StudentHonor['level']) || 'school',
        rankOrMedal: parsedBody.rankOrMedal ? String(parsedBody.rankOrMedal) : undefined,
        date: String(parsedBody.date || ''),
        description: parsedBody.description ? String(parsedBody.description) : undefined,
        issuer: parsedBody.issuer ? String(parsedBody.issuer) : undefined,
        certificateRef: parsedBody.certificateRef ? String(parsedBody.certificateRef) : undefined,
        createdBy: currentUser.id,
        createdByName: currentUser.fullName,
        createdAt: new Date().toISOString(),
      };
      writeLocalJson(key, [honor, ...list]);
      return { honor } as T;
    }
  }

  if (pathname.startsWith('/api/honors/') && method === 'DELETE') {
    const key = 'shahriar_student_honors';
    const id = decodeURIComponent(pathname.split('/')[3] || '');
    writeLocalJson(key, readLocalJson<StudentHonor[]>(key, []).filter((h) => h.id !== id));
    return { ok: true } as T;
  }

  if (pathname === '/api/academic-risk' && method === 'GET') {
    const notes = readLocalJson<RiskReviewNote[]>('shahriar_academic_risk_notes', []);
    const stuRes =
      currentUser && currentUser.role === 'admin' && !isLocalWorkerToken(token)
        ? await workerFetch<{ students?: WorkerUser[] }>('/api/admin/students', { token, baseUrl }).catch(() => ({
            students: [] as WorkerUser[],
          }))
        : { students: [] as WorkerUser[] };
    const remoteStu = Array.isArray(stuRes.students) ? stuRes.students.map(mapWorkerUser) : [];
    const students = remoteStu.length > 0
      ? remoteStu
      : mergeAllKnownUsers(currentUser ? [currentUser] : []).filter((u) => u.role === 'student');
    const assessments: StudentRiskAssessment[] = students.map((st) => {
      const stuNotes = notes.filter((n) => n.studentId === st.id);
      return {
        studentId: st.id,
        studentName: st.fullName,
        classId: st.classId,
        className: st.classId || st.gradeLevel || '—',
        gradeLevel: st.gradeLevel || 'هفتم',
        category: 'stable',
        categoryLabelFa: 'وضعیت پایدار',
        categoryLabelEn: 'Stable Progress',
        averageScore: 0,
        gradesCount: 0,
        absencesCount: 0,
        latesCount: 0,
        assignmentSubmissionRate: 0,
        examAveragePercent: null,
        evidence: ['هنوز داده‌ای در وضعیت آفلاین برای تحلیل تاریخی ثبت نشده است (Worker را به‌روزرسانی کنید)'],
        suggestedAction: 'ثبت یادداشت پایش دبیر یا معاون',
        reviewNotes: stuNotes.slice(0, 5),
      };
    });
    return { assessments } as T;
  }

  if (pathname === '/api/academic-risk/notes' && method === 'POST') {
    const note: RiskReviewNote = {
      id: genLocalId('rsk'),
      studentId: String(parsedBody.studentId || ''),
      authorId: currentUser?.id || '',
      authorName: currentUser?.fullName || '',
      note: String(parsedBody.note || ''),
      actionTaken: parsedBody.actionTaken ? String(parsedBody.actionTaken) : undefined,
      createdAt: new Date().toISOString(),
    };
    const notes = readLocalJson<RiskReviewNote[]>('shahriar_academic_risk_notes', []);
    writeLocalJson('shahriar_academic_risk_notes', [note, ...notes]);
    return { note, message: 'یادداشت بررسی آموزشی ثبت شد.' } as T;
  }

  if (pathname === '/api/exams') {
    const exams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    if (method === 'GET') return { exams } as T;
    if (method === 'POST' && currentUser && currentUser.role !== 'student') {
      const qs: ExamQuestion[] = Array.isArray(parsedBody.questions)
        ? (parsedBody.questions as Partial<ExamQuestion>[]).map((q) => ({
            id: genLocalId('q'),
            type: (q.type as ExamQuestionType) || 'mcq',
            prompt: String(q.prompt || ''),
            options: Array.isArray(q.options) ? q.options.map(String) : [],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            correctText: q.correctText ? String(q.correctText) : undefined,
            points: Number(q.points) || 2,
            chapter: q.chapter ? String(q.chapter) : undefined,
            topic: q.topic ? String(q.topic) : undefined,
            difficulty: (q.difficulty as ExamDifficulty) || 'medium',
            explanation: q.explanation ? String(q.explanation) : undefined,
          }))
        : [];
      const created: OnlineExam = {
        id: genLocalId('exm'),
        title: String(parsedBody.title || 'آزمون آنلاین'),
        description: parsedBody.description ? String(parsedBody.description) : '',
        classId: String(parsedBody.classId || ''),
        subjectId: String(parsedBody.subjectId || ''),
        teacherId: currentUser.id,
        gradeLevel: parsedBody.gradeLevel ? String(parsedBody.gradeLevel) : undefined,
        chapter: parsedBody.chapter ? String(parsedBody.chapter) : undefined,
        topic: parsedBody.topic ? String(parsedBody.topic) : undefined,
        difficulty: (parsedBody.difficulty as ExamDifficulty) || 'medium',
        generatedByAI: Boolean(parsedBody.generatedByAI),
        versionLabel: 'نسخه اصلی',
        durationMinutes: Number(parsedBody.durationMinutes) || 30,
        dueDate: String(parsedBody.dueDate || '1404/10/20'),
        active: true,
        questions: qs,
        createdAt: new Date().toISOString(),
      };
      writeLocalJson('shahriar_local_exams', [created, ...exams]);
      return { exam: created, message: 'آزمون آنلاین ثبت شد.' } as T;
    }
  }

  if (pathname.match(/^\/api\/exams\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const exams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    writeLocalJson('shahriar_local_exams', exams.filter((e) => e.id !== id));
    return { ok: true, message: 'آزمون حذف شد.' } as T;
  }

  if (pathname.match(/^\/api\/exams\/[^/]+\/clone-versions$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    const exams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    const src = exams.find((e) => e.id === id);
    if (!src) throw { status: 404, message: 'آزمون یافت نشد.' };
    const labels = Array.isArray(parsedBody.labels) ? parsedBody.labels.map(String) : ['نسخه B', 'نسخه C'];
    const clones: OnlineExam[] = labels.map((label) => ({
      ...src,
      id: genLocalId('exm'),
      title: `${src.title} (${label})`,
      versionLabel: label,
      versionGroupId: src.versionGroupId || src.id,
      questions: [...src.questions].sort(() => Math.random() - 0.5),
      createdAt: new Date().toISOString(),
    }));
    writeLocalJson('shahriar_local_exams', [...clones, ...exams]);
    return { exams: clones, message: `${clones.length} نسخه متفاوت ساخته شد.` } as T;
  }

  if (pathname.match(/^\/api\/exams\/[^/]+\/submit$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    const exams = readLocalJson<OnlineExam[]>('shahriar_local_exams', []);
    const exam = exams.find((e) => e.id === id);
    if (!exam) throw { status: 404, message: 'آزمون یافت نشد.' };
    const answers = Array.isArray(parsedBody.answers) ? (parsedBody.answers as Array<number | string>) : [];
    let score = 0;
    let maxScore = 0;
    let needsManualGrading = false;
    const questionScores = exam.questions.map((q, i) => {
      maxScore += q.points || 2;
      const ans = answers[i];
      if (q.type === 'descriptive') {
        needsManualGrading = true;
        return {
          questionId: q.id,
          maxPoints: q.points || 2,
          autoScore: 0,
          finalScore: 0,
          needsReview: true,
        };
      }
      const correct =
        q.type === 'fill_blank'
          ? String(ans ?? '').trim().toLowerCase() === String(q.correctText ?? '').trim().toLowerCase()
          : Number(ans) === q.correctIndex;
      const pts = correct ? q.points || 2 : 0;
      score += pts;
      return {
        questionId: q.id,
        maxPoints: q.points || 2,
        autoScore: pts,
        finalScore: pts,
        needsReview: false,
        isCorrect: correct,
      };
    });
    const attempt: ExamAttempt = {
      id: genLocalId('exa'),
      examId: exam.id,
      studentId: currentUser?.id || 'local',
      studentName: currentUser?.fullName || 'دانش‌آموز',
      answers,
      questionScores,
      needsManualGrading,
      score,
      maxScore,
      startedAt: String(parsedBody.startedAt || new Date().toISOString()),
      submittedAt: new Date().toISOString(),
    };
    const attempts = readLocalJson<ExamAttempt[]>('shahriar_local_exam_attempts', []);
    writeLocalJson('shahriar_local_exam_attempts', [attempt, ...attempts]);
    return { attempt, message: 'پاسخ آزمون ثبت شد.' } as T;
  }

  if (pathname === '/api/exam-attempts' && method === 'GET') {
    const attempts = readLocalJson<ExamAttempt[]>('shahriar_local_exam_attempts', []);
    return { attempts } as T;
  }

  if (pathname.match(/^\/api\/exams\/[^/]+\/attempts$/) && method === 'GET') {
    const examId = pathname.split('/')[3];
    const exam = readLocalJson<OnlineExam[]>('shahriar_local_exams', []).find((e) => e.id === examId);
    const attempts = readLocalJson<ExamAttempt[]>('shahriar_local_exam_attempts', []).filter((a) => a.examId === examId);
    return { exam, attempts } as T;
  }

  if (pathname.match(/^\/api\/exams\/[^/]+\/attempts\/[^/]+\/grade$/) && method === 'POST') {
    const parts = pathname.split('/');
    const attemptId = parts[5];
    const attempts = readLocalJson<ExamAttempt[]>('shahriar_local_exam_attempts', []);
    const target = attempts.find((a) => a.id === attemptId);
    if (!target) throw { status: 404, message: 'برگه یافت نشد.' };
    const scores = Array.isArray(parsedBody.scores)
      ? (parsedBody.scores as Array<{ questionId: string; finalScore: number; teacherComment?: string }>)
      : [];
    const map = new Map(scores.map((s) => [s.questionId, s]));
    const updatedDetails = (target.questionScores ?? []).map((det) => {
      const upd = map.get(det.questionId);
      if (!upd) return det;
      const val = Math.min(det.maxPoints, Math.max(0, Number(upd.finalScore) || 0));
      return {
        ...det,
        manualScore: val,
        finalScore: val,
        needsReview: false,
        isCorrect: val >= det.maxPoints * 0.6,
        teacherComment: upd.teacherComment || det.teacherComment,
      };
    });
    const updatedAttempt: ExamAttempt = {
      ...target,
      questionScores: updatedDetails,
      score: Number(updatedDetails.reduce((s, d) => s + d.finalScore, 0).toFixed(2)),
      needsManualGrading: updatedDetails.some((d) => d.needsReview),
      gradedBy: currentUser?.id,
      gradedAt: new Date().toISOString(),
    };
    writeLocalJson(
      'shahriar_local_exam_attempts',
      attempts.map((a) => (a.id === attemptId ? updatedAttempt : a))
    );
    return { attempt: updatedAttempt, message: 'نمره تشریحی ثبت و تأیید شد.' } as T;
  }

  if (pathname.match(/^\/api\/exams\/[^/]+\/analytics$/) && method === 'GET') {
    const examId = pathname.split('/')[3];
    const exam = readLocalJson<OnlineExam[]>('shahriar_local_exams', []).find((e) => e.id === examId);
    const attempts = readLocalJson<ExamAttempt[]>('shahriar_local_exam_attempts', []).filter((a) => a.examId === examId);
    const questionStats = (exam?.questions ?? []).map((q, qIdx) => {
      let correctCount = 0;
      let wrongCount = 0;
      const optionCounts = (q.options || []).map(() => 0);
      for (const att of attempts) {
        const det = att.questionScores?.find((d) => d.questionId === q.id);
        if (det && !det.needsReview) {
          if (det.isCorrect) correctCount += 1;
          else wrongCount += 1;
        }
        const ans = att.answers[qIdx];
        if (typeof ans === 'number' && ans >= 0 && ans < optionCounts.length) {
          optionCounts[ans] += 1;
        }
      }
      const totalResponses = correctCount + wrongCount;
      const correctRate = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;
      let mostWrongIdx: number | null = null;
      let mostWrongCount = 0;
      optionCounts.forEach((cnt, idx) => {
        if (idx !== q.correctIndex && cnt > mostWrongCount) {
          mostWrongCount = cnt;
          mostWrongIdx = idx;
        }
      });
      return {
        questionId: q.id,
        questionIndex: qIdx + 1,
        type: (q.type || 'mcq') as ExamQuestionType,
        prompt: q.prompt,
        topic: q.topic || exam?.topic || 'عمومی',
        totalResponses,
        correctCount,
        wrongCount,
        correctRate,
        wrongRate: totalResponses > 0 ? 100 - correctRate : 0,
        optionCounts,
        mostChosenWrongOptionIndex: mostWrongIdx,
        mostChosenWrongOptionText: mostWrongIdx !== null ? q.options?.[mostWrongIdx] ?? null : null,
        mostChosenWrongCount: mostWrongCount,
      };
    });
    const avgScore = attempts.length
      ? Number((attempts.reduce((s, a) => s + a.score, 0) / attempts.length).toFixed(2))
      : 0;
    const distractorStat =
      [...questionStats]
        .filter((s) => (s.mostChosenWrongCount ?? 0) > 0 && s.mostChosenWrongOptionText)
        .sort((a, b) => (b.mostChosenWrongCount ?? 0) - (a.mostChosenWrongCount ?? 0))[0] ?? null;
    return {
      analytics: {
        examId,
        examTitle: exam?.title || 'آزمون',
        attemptsCount: attempts.length,
        averageScore: avgScore,
        maxScore: exam?.questions.reduce((s, q) => s + (q.points || 2), 0) ?? 0,
        pendingManualCount: attempts.filter((a) => a.needsManualGrading).length,
        questionStats,
        hardestQuestion: [...questionStats].sort((a, b) => b.wrongRate - a.wrongRate)[0] || null,
        easiestQuestion: [...questionStats].sort((a, b) => b.correctRate - a.correctRate)[0] || null,
        weakestTopics: questionStats
          .filter((q) => q.wrongCount > 0)
          .slice(0, 4)
          .map((q) => ({
            topic: q.topic,
            questionsCount: 1,
            wrongRate: q.wrongRate,
            correctRate: q.correctRate,
          })),
        topDistractorQuestion: distractorStat
          ? {
              questionIndex: distractorStat.questionIndex,
              prompt: distractorStat.prompt,
              optionText: distractorStat.mostChosenWrongOptionText || '',
              selectedCount: distractorStat.mostChosenWrongCount || 0,
              totalResponses: distractorStat.totalResponses,
            }
          : null,
      } satisfies ExamQualityAnalytics,
    } as T;
  }

  if (pathname.startsWith('/api/chat/')) {
    const currentUser = await resolveWorkerUser(token, baseUrl);
    const chatKey = 'shahriar_chat_messages';
    const allUsers = mergeAllKnownUsers([currentUser]);

    if (pathname === '/api/chat/contacts' && method === 'GET') {
      const contacts: ChatContact[] = allUsers
        .filter((u) => u.active && u.id !== currentUser.id)
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          role: u.role,
          avatarUrl: u.avatarUrl,
          gradeLevel: u.gradeLevel,
          className: u.classId,
          online: true,
        }));
      return { contacts } as T;
    }

    if (pathname === '/api/chat/threads' && method === 'GET') {
      const allMsgs = readLocalJson<ChatMessage[]>(chatKey, []);
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const byPeer = new Map<string, ChatThreadSummary>();
      for (const m of allMsgs) {
        if (m.senderId !== currentUser.id && m.recipientId !== currentUser.id) continue;
        const peerId = m.senderId === currentUser.id ? m.recipientId : m.senderId;
        const peer = userMap.get(peerId);
        if (!peer) continue;
        const existing: ChatThreadSummary = byPeer.get(peerId) ?? {
          threadId: m.threadId,
          peer: {
            id: peer.id,
            fullName: peer.fullName,
            username: peer.username,
            role: peer.role,
            avatarUrl: peer.avatarUrl,
            gradeLevel: peer.gradeLevel,
            className: peer.classId,
            online: true,
          },
          lastMessage: null,
          unreadCount: 0,
          updatedAt: m.createdAt,
        };
        if (!existing.lastMessage || m.createdAt >= existing.lastMessage.createdAt) {
          existing.lastMessage = m;
          existing.updatedAt = m.createdAt;
        }
        if (m.recipientId === currentUser.id && !m.readBy.includes(currentUser.id)) {
          existing.unreadCount += 1;
        }
        byPeer.set(peerId, existing);
      }
      const threads = Array.from(byPeer.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { threads } as T;
    }

    const threadMsgsMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
    if (threadMsgsMatch && method === 'GET') {
      const peerId = decodeURIComponent(threadMsgsMatch[1]);
      const threadId = [currentUser.id, peerId].sort().join('__');
      const messages = readLocalJson<ChatMessage[]>(chatKey, [])
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { messages } as T;
    }

    const threadReadMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/read$/);
    if (threadReadMatch && method === 'POST') {
      const peerId = decodeURIComponent(threadReadMatch[1]);
      const threadId = [currentUser.id, peerId].sort().join('__');
      let markedCount = 0;
      const updated = readLocalJson<ChatMessage[]>(chatKey, []).map((m) => {
        if (m.threadId === threadId && m.recipientId === currentUser.id && !m.readBy.includes(currentUser.id)) {
          markedCount++;
          return { ...m, readBy: [...m.readBy, currentUser.id] };
        }
        return m;
      });
      if (markedCount > 0) writeLocalJson(chatKey, updated);
      return { ok: true, markedCount } as T;
    }

    if (pathname === '/api/chat/messages' && method === 'POST') {
      const recipientId = String(parsedBody.recipientId || '').trim();
      const text = String(parsedBody.body || '').trim().slice(0, 2000);
      if (!recipientId || !text) {
        throw { status: 400, message: 'گیرنده و متن پیام الزامی است.' };
      }
      const threadId = [currentUser.id, recipientId].sort().join('__');
      const msg: ChatMessage = {
        id: genLocalId('chat'),
        threadId,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        senderRole: currentUser.role,
        recipientId,
        body: text,
        readBy: [currentUser.id],
        createdAt: new Date().toISOString(),
      };
      const allMsgs = readLocalJson<ChatMessage[]>(chatKey, []);
      writeLocalJson(chatKey, [...allMsgs, msg].slice(-400));
      return { message: msg, chatMessage: msg } as T;
    }
  }

  if (method === 'GET') {
    if (pathname === '/api/subjects') return { subjects: [] } as T;
    if (pathname === '/api/schedules') return { schedules: [] } as T;
    if (pathname === '/api/messages') return { messages: [] } as T;
    if (pathname === '/api/exams') return { exams: [] as OnlineExam[] } as T;
    if (pathname === '/api/study-plans') return { plans: [] } as T;
    if (pathname === '/api/calendar-events') return { events: [] } as T;
    if (pathname === '/api/history') return { histories: [] } as T;
    if (pathname === '/api/profile-requests') return { requests: [] } as T;
    if (pathname === '/api/roles') return { roles: DEFAULT_ROLES } as T;
    if (pathname === '/api/audit-logs') return { logs: [] } as T;
    if (pathname === '/api/directory/teachers') return { teachers: [] } as T;
    if (pathname === '/api/ai/conversations') return { conversations: [] } as T;
    if (pathname === '/api/league/config') {
      return {
        config: {
          enabled: true,
          activeSeason: {
            id: 'default',
            title: 'فصل اول لیگ ماهانه مطالعاتی',
            periodType: 'monthly',
            status: 'active',
            startDate: new Date().toISOString().slice(0, 10),
            endDate: new Date(Date.now() + 29 * 86400000).toISOString().slice(0, 10),
            allowedClassIds: [],
            allowedSubjectIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          weights: {
            studyHoursWeight: 12,
            testCountWeight: 0.4,
            pagesWeight: 0.25,
            exercisesWeight: 1.5,
            completionBonusWeight: 40,
            streakWeight: 8,
          },
          rules: {
            dailyPointCap: 180,
            minGoalCompletionForBonus: 80,
            suspiciousHoursThreshold: 14,
            suspiciousTestsThreshold: 600,
            requireApprovalAboveThreshold: true,
            requireApprovalAllLogs: false,
            eligibleGradeLevels: [],
          },
          prizes: [],
          suspendedStudentIds: [],
          updatedAt: new Date().toISOString(),
        },
        badgesCatalog: [],
      } as T;
    }
    if (pathname === '/api/league/goals') return { goals: [] } as T;
    if (pathname === '/api/league/logs') return { logs: [] } as T;
    if (pathname === '/api/league/feedback') return { feedbacks: [] } as T;
    if (pathname === '/api/league/leaderboard') return { leaderboard: [], myEntry: null, prizes: [] } as T;
    if (pathname === '/api/league/hall-of-fame') {
      return {
        hallOfFame: {
          topThree: [],
          topBySubject: [],
          studentOfWeek: null,
          studentOfMonth: null,
          mostImproved: [],
          badgeShowcase: [],
        },
      } as T;
    }
    if (pathname === '/api/league/analytics') return {} as T;
    if (pathname === '/api/league/notifications') return { notifications: [], unreadCount: 0 } as T;
    if (pathname === '/api/league/badges') return { definitions: [], earned: [] } as T;
    if (pathname === '/api/league/archives') return { archives: [] } as T;
  }

  throw {
    status: 501,
    message: 'این عملیات در حال حاضر پشتیبانی نمی‌شود.',
  };
}
