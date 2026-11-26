export interface KVListResult {
  keys: Array<{ name: string; expiration?: number }>;
  list_complete: boolean;
  cursor?: string;
}

export interface SchoolKVStore {
  get(key: string): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KVListResult>;
}

export const KV_KEYS = {
  INITIALIZED: 'school:meta:initialized',
  SETTINGS: 'school:settings',
  ROLES: 'school:roles',
  AUDIT_LOGS: 'school:audit:logs',
  USERS_INDEX: 'school:users:all',
  DELETED_USERS: 'school:users:deleted',
  CLASSES_INDEX: 'school:classes:all',
  SUBJECTS_INDEX: 'school:subjects:all',
  GRADES_INDEX: 'school:grades:all',
  HISTORY_INDEX: 'school:history:all',
  ATTENDANCE_INDEX: 'school:attendance:all',
  ASSIGNMENTS_INDEX: 'school:assignments:all',
  SUBMISSIONS_INDEX: 'school:submissions:all',
  SCHEDULES_INDEX: 'school:schedules:all',
  ANNOUNCEMENTS_INDEX: 'school:announcements:all',
  MESSAGES_INDEX: 'school:messages:all',
  EXAMS_INDEX: 'school:exams:all',
  EXAM_ATTEMPTS_INDEX: 'school:exam_attempts:all',
  STUDY_PLANS_INDEX: 'school:study_plans:all',
  CALENDAR_EVENTS_INDEX: 'school:calendar_events:all',
  PROFILE_REQUESTS_INDEX: 'school:profile_requests:all',
  TUTOR_SOURCES_INDEX: 'school:tutor:sources:all',
  MISTAKES_INDEX: 'school:tutor:mistakes:all',
  QUESTION_BANK_INDEX: 'school:question_bank:all',
  LIBRARY_INDEX: 'school:library:all',
  HONORS_INDEX: 'school:honors:all',
  RISK_NOTES_INDEX: 'school:risk_notes:all',
  user: (id: string) => `school:user:${id}`,
  usernameIdx: (username: string) => `school:user_idx:username:${username.trim().toLowerCase()}`,
  session: (token: string) => `school:session:${token}`,
  classItem: (id: string) => `school:class:${id}`,
  subjectItem: (id: string) => `school:subject:${id}`,
  gradeItem: (id: string) => `school:grade:${id}`,
  historyItem: (id: string) => `school:history:${id}`,
  attendanceItem: (id: string) => `school:attendance:${id}`,
  assignmentItem: (id: string) => `school:assignment:${id}`,
  submissionItem: (id: string) => `school:submission:${id}`,
  scheduleItem: (id: string) => `school:schedule:${id}`,
  announcementItem: (id: string) => `school:announcement:${id}`,
  messageItem: (id: string) => `school:message:${id}`,
  examItem: (id: string) => `school:exam:${id}`,
  examAttemptItem: (id: string) => `school:exam_attempt:${id}`,
  studyPlanItem: (id: string) => `school:study_plan:${id}`,
  calendarEventItem: (id: string) => `school:calendar_event:${id}`,
  profileRequestItem: (id: string) => `school:profile_request:${id}`,
  tutorSourceItem: (id: string) => `school:tutor:source:${id}`,
  tutorUserSessions: (userId: string) => `school:tutor:user_sessions:${userId}`,
  tutorSession: (userId: string, id: string) => `school:tutor:session:${userId}:${id}`,
  mistakeItem: (id: string) => `school:tutor:mistake:${id}`,
  questionBankItem: (id: string) => `school:question_bank:item:${id}`,
  libraryItem: (id: string) => `school:library:item:${id}`,
  honorItem: (id: string) => `school:honor:item:${id}`,
  riskNoteItem: (id: string) => `school:risk_note:item:${id}`,
  aiUserConvs: (userId: string) => `school:ai:user_convs:${userId}`,
  aiConv: (userId: string, convId: string) => `school:ai:conv:${userId}:${convId}`,
  chatThreadMessages: (threadId: string) => `school:chat:thread:${threadId}`,
  chatUserThreads: (userId: string) => `school:chat:user_threads:${userId}`,
  LEAGUE_CONFIG: 'school:league:config',
  LEAGUE_GOALS_INDEX: 'school:league:goals:all',
  LEAGUE_LOGS_INDEX: 'school:league:logs:all',
  LEAGUE_FEEDBACKS_INDEX: 'school:league:feedbacks:all',
  LEAGUE_BADGES_INDEX: 'school:league:badges:all',
  LEAGUE_NOTIFICATIONS_INDEX: 'school:league:notifications:all',
  LEAGUE_ARCHIVES_INDEX: 'school:league:archives:all',
  leagueGoalItem: (id: string) => `school:league:goal:${id}`,
  leagueLogItem: (id: string) => `school:league:log:${id}`,
  leagueFeedbackItem: (id: string) => `school:league:feedback:${id}`,
  leagueBadgeItem: (id: string) => `school:league:badge:${id}`,
  leagueNotificationItem: (id: string) => `school:league:notification:${id}`,
  leagueArchiveItem: (id: string) => `school:league:archive:${id}`,
};

export async function kvGetJson<T>(kv: SchoolKVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvPutJson<T>(
  kv: SchoolKVStore,
  key: string,
  value: T,
  options?: { expirationTtl?: number }
): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}

export async function kvGetIndex(kv: SchoolKVStore, indexKey: string): Promise<string[]> {
  return (await kvGetJson<string[]>(kv, indexKey)) ?? [];
}

export async function kvAddToIndex(kv: SchoolKVStore, indexKey: string, id: string): Promise<void> {
  const current = await kvGetIndex(kv, indexKey);
  if (!current.includes(id)) {
    current.push(id);
    await kvPutJson(kv, indexKey, current);
  }
}

export async function kvRemoveFromIndex(kv: SchoolKVStore, indexKey: string, id: string): Promise<void> {
  const current = await kvGetIndex(kv, indexKey);
  const next = current.filter((item) => item !== id);
  await kvPutJson(kv, indexKey, next);
}

export async function kvGetCollection<T>(
  kv: SchoolKVStore,
  indexKey: string,
  itemKeyFn: (id: string) => string
): Promise<T[]> {
  const ids = await kvGetIndex(kv, indexKey);
  if (ids.length === 0) return [];
  const items = await Promise.all(ids.map((id) => kvGetJson<T>(kv, itemKeyFn(id))));
  return items.filter((item) => item !== null) as T[];
}
