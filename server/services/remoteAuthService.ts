import type { SchoolClass, StoredUser, UserRole } from '../../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetCollection,
  kvGetJson,
  kvPutJson,
  kvRemoveFromIndex,
  type SchoolKVStore,
} from '../kv/kvStore.ts';
import { hashPassword } from '../utils/crypto.ts';

export const DEFAULT_AUTH_SERVER_URL = 'https://shahriar-school-api.yashar-online-store.workers.dev';

export interface RemoteUserPayload {
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
  phone?: string | null;
  email?: string | null;
  assignedClassIds?: string[];
  assignedSubjectIds?: string[];
  active?: boolean;
  createdAt?: string;
}

export class RemoteAuthError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function resolveAuthServerUrl(customUrl?: string): string {
  const raw = (customUrl ?? DEFAULT_AUTH_SERVER_URL).trim();
  return raw.replace(/\/+$/, '');
}

async function remoteRequest<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const res = await fetch(`${resolveAuthServerUrl(baseUrl)}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    if (!res.ok || parsed.success === false) {
      const msg =
        typeof parsed.error === 'string' && parsed.error
          ? parsed.error
          : `خطای سرور احراز هویت (کد ${res.status})`;
      throw new RemoteAuthError(msg, res.status || 502);
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof RemoteAuthError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new RemoteAuthError('پاسخ از سرور احراز هویت دریافت نشد (Timeout).', 504);
    }
    throw new RemoteAuthError('خطا در برقراری ارتباط با سرور احراز هویت.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getRemoteSetupStatus(baseUrl?: string) {
  return remoteRequest<{
    success: boolean;
    hasAdmin: boolean;
    adminExists: boolean;
    needsSetup: boolean;
    setupRequired: boolean;
  }>(resolveAuthServerUrl(baseUrl), '/api/setup/status');
}

export async function createRemoteInitialAdmin(
  baseUrl: string | undefined,
  input: { setupKey: string; name: string; username: string; password: string }
) {
  return remoteRequest<{ success: boolean; user: RemoteUserPayload }>(
    resolveAuthServerUrl(baseUrl),
    '/api/setup/admin',
    { method: 'POST', body: input }
  );
}

export async function remoteLogin(baseUrl: string | undefined, username: string, password: string) {
  return remoteRequest<{
    success: boolean;
    token: string;
    expiresAt: number;
    user: RemoteUserPayload;
  }>(resolveAuthServerUrl(baseUrl), '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export async function remoteGetMe(baseUrl: string | undefined, token: string) {
  return remoteRequest<{ success: boolean; user: RemoteUserPayload }>(
    resolveAuthServerUrl(baseUrl),
    '/api/auth/me',
    { token }
  );
}

export async function remoteLogout(baseUrl: string | undefined, token: string) {
  return remoteRequest<{ success: boolean }>(
    resolveAuthServerUrl(baseUrl),
    '/api/auth/logout',
    { method: 'POST', token }
  );
}

export async function remoteListStudents(baseUrl: string | undefined, token: string) {
  return remoteRequest<{ success: boolean; students: RemoteUserPayload[] }>(
    resolveAuthServerUrl(baseUrl),
    '/api/admin/students',
    { token }
  );
}

export async function remoteListTeachers(baseUrl: string | undefined, token: string) {
  return remoteRequest<{ success: boolean; teachers: RemoteUserPayload[] }>(
    resolveAuthServerUrl(baseUrl),
    '/api/admin/teachers',
    { token }
  );
}

export async function remoteCreateStudent(
  baseUrl: string | undefined,
  token: string,
  payload: { name: string; username: string; password: string; grade: string; className?: string; studentCode?: string }
) {
  return remoteRequest<{ success: boolean; student: RemoteUserPayload }>(
    resolveAuthServerUrl(baseUrl),
    '/api/admin/students',
    { method: 'POST', token, body: payload }
  );
}

export async function remoteCreateTeacher(
  baseUrl: string | undefined,
  token: string,
  payload: { name: string; username: string; password: string }
) {
  return remoteRequest<{ success: boolean; teacher: RemoteUserPayload }>(
    resolveAuthServerUrl(baseUrl),
    '/api/admin/teachers',
    { method: 'POST', token, body: payload }
  );
}

export async function remoteListAllUsers(baseUrl: string | undefined, token: string) {
  return remoteRequest<{ success: boolean; users: RemoteUserPayload[] }>(
    resolveAuthServerUrl(baseUrl),
    '/api/users',
    { token }
  );
}

export async function remoteCreateUser(
  baseUrl: string | undefined,
  token: string,
  payload: {
    name: string;
    fullName: string;
    username: string;
    password: string;
    role: UserRole;
    nationalId?: string;
    phone?: string;
    email?: string;
    grade?: string;
    gradeLevel?: string;
    className?: string;
    classId?: string;
    assignedClassIds?: string[];
    assignedSubjectIds?: string[];
    active?: boolean;
  }
) {
  return remoteRequest<{ success: boolean; user: RemoteUserPayload; message?: string }>(
    resolveAuthServerUrl(baseUrl),
    '/api/users',
    { method: 'POST', token, body: payload }
  );
}

export async function remoteUpdateUser(
  baseUrl: string | undefined,
  token: string,
  userId: string,
  payload: Record<string, unknown>
) {
  return remoteRequest<{ success: boolean; user: RemoteUserPayload; message?: string }>(
    resolveAuthServerUrl(baseUrl),
    `/api/users/${encodeURIComponent(userId)}`,
    { method: 'PATCH', token, body: payload }
  );
}

export async function remoteDeleteUser(baseUrl: string | undefined, token: string, userId: string) {
  return remoteRequest<{ success: boolean; message?: string }>(
    resolveAuthServerUrl(baseUrl),
    `/api/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE', token }
  );
}

export async function syncRemoteUserToKV(kv: SchoolKVStore, remoteUser: RemoteUserPayload): Promise<StoredUser> {
  const username = remoteUser.username.trim().toLowerCase();
  const now = new Date().toISOString();

  // Check if an older local user existed under this username with a different ID
  const existingByUsernameId = await kv.get(KV_KEYS.usernameIdx(username));
  let existing = await kvGetJson<StoredUser>(kv, KV_KEYS.user(remoteUser.id));

  if (!existing && existingByUsernameId && existingByUsernameId !== remoteUser.id) {
    const legacy = await kvGetJson<StoredUser>(kv, KV_KEYS.user(existingByUsernameId));
    if (legacy) {
      existing = legacy;
      await kv.delete(KV_KEYS.user(existingByUsernameId));
      await kvRemoveFromIndex(kv, KV_KEYS.USERS_INDEX, existingByUsernameId);
    }
  }

  let matchedClassId = existing?.classId;
  const rawClassHint = (remoteUser.classId ?? remoteUser.className ?? '').trim();
  if (remoteUser.role === 'student' && rawClassHint && !matchedClassId) {
    const allClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
    const found = allClasses.find((c) => c.id === rawClassHint || c.name.trim() === rawClassHint);
    matchedClassId = found ? found.id : rawClassHint;
  }

  // Fallback placeholder hash (actual authentication always validates against remote server)
  const fallbackCreds = existing?.passwordHash
    ? { hash: existing.passwordHash, salt: existing.passwordSalt }
    : await hashPassword(`remote:${remoteUser.id}:${now}`);

  const resolvedFullName = (remoteUser.fullName ?? remoteUser.name ?? existing?.fullName ?? username).trim();
  const synced: StoredUser = {
    id: remoteUser.id,
    username,
    nationalId: (remoteUser.nationalId ?? remoteUser.studentCode ?? existing?.nationalId ?? '').trim(),
    fullName: resolvedFullName,
    role: remoteUser.role,
    active: remoteUser.active !== false,
    phone: (remoteUser.phone ?? existing?.phone) || undefined,
    email: (remoteUser.email ?? existing?.email) || undefined,
    gradeLevel: (remoteUser.gradeLevel ?? remoteUser.grade ?? existing?.gradeLevel) || undefined,
    classId: remoteUser.role === 'student' ? matchedClassId : undefined,
    assignedClassIds:
      remoteUser.role === 'teacher'
        ? (Array.isArray(remoteUser.assignedClassIds) ? remoteUser.assignedClassIds : existing?.assignedClassIds ?? [])
        : undefined,
    assignedSubjectIds:
      remoteUser.role === 'teacher'
        ? (Array.isArray(remoteUser.assignedSubjectIds) ? remoteUser.assignedSubjectIds : existing?.assignedSubjectIds ?? [])
        : undefined,
    displayPassword: existing?.displayPassword,
    passwordHash: fallbackCreds.hash,
    passwordSalt: fallbackCreds.salt,
    createdAt: remoteUser.createdAt ?? existing?.createdAt ?? now,
    lastLoginAt: existing?.lastLoginAt,
  };

  await kvPutJson(kv, KV_KEYS.user(synced.id), synced);
  await kv.put(KV_KEYS.usernameIdx(username), synced.id);
  await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, synced.id);
  return synced;
}

export async function syncDirectoryFromRemote(
  kv: SchoolKVStore,
  baseUrl: string | undefined,
  remoteToken: string
): Promise<void> {
  try {
    const allRes = await remoteListAllUsers(baseUrl, remoteToken);
    if (Array.isArray(allRes.users) && allRes.users.length > 0) {
      for (const u of allRes.users) {
        await syncRemoteUserToKV(kv, u);
      }
      return;
    }
  } catch {
    // Fall back cleanly to legacy v1 student/teacher endpoints
  }

  const [studentsRes, teachersRes] = await Promise.allSettled([
    remoteListStudents(baseUrl, remoteToken),
    remoteListTeachers(baseUrl, remoteToken),
  ]);

  if (studentsRes.status === 'fulfilled' && Array.isArray(studentsRes.value.students)) {
    for (const s of studentsRes.value.students) {
      await syncRemoteUserToKV(kv, s);
    }
  }
  if (teachersRes.status === 'fulfilled' && Array.isArray(teachersRes.value.teachers)) {
    for (const t of teachersRes.value.teachers) {
      await syncRemoteUserToKV(kv, t);
    }
  }
}
