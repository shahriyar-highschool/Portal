import type { UserAccount } from '../../shared/types';

export interface DeletedUserTombstone {
  id: string;
  username: string;
  deletedAt: string;
}

const ADMIN_DELETED_USERS_KEY = 'shahriar_admin_deleted_users';
const WK_DELETED_USERS_KEY = 'shahriar_wk_deleted_users';
const WK_USER_OVERRIDES_KEY = 'shahriar_wk_user_overrides';

function safeReadJson<T>(storage: Storage | undefined, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(storage: Storage | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function getStorages(): { local?: Storage; session?: Storage } {
  if (typeof window === 'undefined') return {};
  return {
    local: window.localStorage,
    session: window.sessionStorage,
  };
}

function normalizeEntries(entries: unknown): DeletedUserTombstone[] {
  if (!Array.isArray(entries)) return [];
  const byKey = new Map<string, DeletedUserTombstone>();
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<DeletedUserTombstone>;
    const id = String(raw.id ?? '').trim();
    const username = String(raw.username ?? '').trim().toLowerCase();
    const deletedAt = typeof raw.deletedAt === 'string' && raw.deletedAt ? raw.deletedAt : '';
    if (!id && !username) continue;
    const key = id ? `id:${id}` : `un:${username}`;
    const prev = byKey.get(key);
    if (!prev || deletedAt > prev.deletedAt) {
      byKey.set(key, {
        id,
        username: username || prev?.username || '',
        deletedAt: deletedAt || prev?.deletedAt || new Date().toISOString(),
      });
    }
  }
  return Array.from(byKey.values());
}

export function getAdminDeletedUserTombstones(): DeletedUserTombstone[] {
  const { local, session } = getStorages();
  const fromLocal = normalizeEntries(safeReadJson<unknown>(local, ADMIN_DELETED_USERS_KEY, []));
  const fromSession = normalizeEntries(safeReadJson<unknown>(session, ADMIN_DELETED_USERS_KEY, []));

  const wkDeletedLocal = safeReadJson<{ ids?: string[]; usernames?: string[] }>(local, WK_DELETED_USERS_KEY, {});
  const wkDeletedSession = safeReadJson<{ ids?: string[]; usernames?: string[] }>(session, WK_DELETED_USERS_KEY, {});
  const wkOverrides = safeReadJson<Record<string, { deleted?: boolean }>>(local, WK_USER_OVERRIDES_KEY, {});

  const merged = new Map<string, DeletedUserTombstone>();
  const addEntry = (id: string, username: string, deletedAt: string) => {
    const cleanId = id.trim();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanId && !cleanUser) return;
    const key = cleanId ? `id:${cleanId}` : `un:${cleanUser}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { id: cleanId, username: cleanUser, deletedAt });
    } else {
      merged.set(key, {
        id: cleanId || existing.id,
        username: cleanUser || existing.username,
        deletedAt: deletedAt > existing.deletedAt ? deletedAt : existing.deletedAt,
      });
    }
  };

  for (const item of [...fromLocal, ...fromSession]) {
    addEntry(item.id, item.username, item.deletedAt);
  }

  // Only include legacy fallback deleted IDs when exact ID match exists (empty deletedAt -> only match by ID)
  for (const id of [...(wkDeletedLocal.ids ?? []), ...(wkDeletedSession.ids ?? [])]) {
    const clean = String(id ?? '').trim();
    if (clean && !merged.has(`id:${clean}`)) {
      addEntry(clean, '', '');
    }
  }
  for (const [id, ov] of Object.entries(wkOverrides)) {
    if (ov?.deleted && !merged.has(`id:${id.trim()}`)) {
      addEntry(id.trim(), '', '');
    }
  }

  return Array.from(merged.values());
}

function persistAdminTombstones(list: DeletedUserTombstone[]): void {
  const { local, session } = getStorages();
  const normalized = normalizeEntries(list);
  safeWriteJson(local, ADMIN_DELETED_USERS_KEY, normalized);
  safeWriteJson(session, ADMIN_DELETED_USERS_KEY, normalized);
}

export function recordAdminDeletedUserTombstone(userId: string, username?: string): void {
  const cleanId = userId.trim();
  const cleanUsername = (username ?? '').trim().toLowerCase();
  if (!cleanId && !cleanUsername) return;

  const { local, session } = getStorages();
  const existing = normalizeEntries([
    ...safeReadJson<unknown[]>(local, ADMIN_DELETED_USERS_KEY, []),
    ...safeReadJson<unknown[]>(session, ADMIN_DELETED_USERS_KEY, []),
  ]);
  const now = new Date().toISOString();
  const next = existing.filter(
    (entry) => !(cleanId && entry.id === cleanId) && !(cleanUsername && entry.username === cleanUsername && !entry.id)
  );
  next.push({ id: cleanId, username: cleanUsername, deletedAt: now });
  persistAdminTombstones(next);

  // Keep fallback tombstones aligned too
  for (const storage of [local, session]) {
    if (!storage) continue;
    const wk = safeReadJson<{ ids?: string[]; usernames?: string[] }>(storage, WK_DELETED_USERS_KEY, {
      ids: [],
      usernames: [],
    });
    const ids = new Set((wk.ids ?? []).map((x) => String(x).trim()).filter(Boolean));
    const usernames = new Set((wk.usernames ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean));
    if (cleanId) ids.add(cleanId);
    if (cleanUsername) usernames.add(cleanUsername);
    safeWriteJson(storage, WK_DELETED_USERS_KEY, {
      ids: Array.from(ids),
      usernames: Array.from(usernames),
    });
  }
}

export function clearAdminDeletedUserTombstone(userId?: string, username?: string): void {
  const cleanId = (userId ?? '').trim();
  const cleanUsername = (username ?? '').trim().toLowerCase();
  if (!cleanId && !cleanUsername) return;

  const { local, session } = getStorages();
  const existing = normalizeEntries([
    ...safeReadJson<unknown[]>(local, ADMIN_DELETED_USERS_KEY, []),
    ...safeReadJson<unknown[]>(session, ADMIN_DELETED_USERS_KEY, []),
  ]);
  const filtered = existing.filter(
    (entry) => !(cleanId && entry.id === cleanId) && !(cleanUsername && entry.username === cleanUsername)
  );
  if (filtered.length !== existing.length) {
    persistAdminTombstones(filtered);
  }
}

export function isUserHiddenByAdminTombstone(
  user: Pick<UserAccount, 'id' | 'username' | 'createdAt'>,
  tombstones: DeletedUserTombstone[]
): boolean {
  const uid = user.id.trim();
  const uname = (user.username ?? '').trim().toLowerCase();
  const userCreatedMs = user.createdAt ? Date.parse(user.createdAt) : NaN;

  for (const t of tombstones) {
    if (t.id && t.id === uid) {
      return true;
    }
    if (t.username && uname && t.username === uname && t.deletedAt) {
      const deletedMs = Date.parse(t.deletedAt);
      if (Number.isFinite(deletedMs)) {
        if (!Number.isFinite(userCreatedMs) || userCreatedMs <= deletedMs + 1000) {
          return true;
        }
      }
    }
  }
  return false;
}
