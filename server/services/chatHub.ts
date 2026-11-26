import type { Server as HttpServer } from 'http';
import type { ChatMessage, SessionData, StoredUser } from '../../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetJson,
  kvPutJson,
  type SchoolKVStore,
} from '../kv/kvStore.ts';
import { generateId, verifySignedSessionToken } from '../utils/crypto.ts';

const MAX_MESSAGES_PER_THREAD = 400;
const SESSION_COOKIE_NAME = 'shahriar_session';
const WS_OPEN = 1;

interface MinimalWebSocket {
  readyState: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

const userSockets = new Map<string, Set<MinimalWebSocket>>();

export function getChatThreadId(userA: string, userB: string): string {
  return [userA, userB].sort().join('__');
}

export function getOnlineUserIds(): string[] {
  const online: string[] = [];
  for (const [userId, sockets] of userSockets.entries()) {
    for (const ws of sockets) {
      if (ws.readyState === WS_OPEN) {
        online.push(userId);
        break;
      }
    }
  }
  return online;
}

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  if (!sockets) return false;
  for (const ws of sockets) {
    if (ws.readyState === WS_OPEN) return true;
  }
  return false;
}

function sendToUser(userId: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WS_OPEN) {
      ws.send(serialized);
    }
  }
}

function broadcastAll(payload: unknown) {
  const serialized = JSON.stringify(payload);
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WS_OPEN) {
        ws.send(serialized);
      }
    }
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export async function getThreadMessages(kv: SchoolKVStore, userA: string, userB: string): Promise<ChatMessage[]> {
  const threadId = getChatThreadId(userA, userB);
  return (await kvGetJson<ChatMessage[]>(kv, KV_KEYS.chatThreadMessages(threadId))) ?? [];
}

export async function persistAndBroadcastChatMessage(
  kv: SchoolKVStore,
  sender: Pick<StoredUser, 'id' | 'fullName' | 'role'>,
  recipientId: string,
  rawBody: string,
  clientTempId?: string
): Promise<ChatMessage> {
  const body = rawBody.trim().slice(0, 2000);
  if (!body) {
    throw new Error('متن پیام نمی‌تواند خالی باشد.');
  }
  if (!recipientId || recipientId === sender.id) {
    throw new Error('گیرنده پیام نامعتبر است.');
  }

  const recipient = await kvGetJson<StoredUser>(kv, KV_KEYS.user(recipientId));
  if (!recipient || !recipient.active) {
    throw new Error('کاربر گیرنده یافت نشد یا غیرفعال است.');
  }

  const threadId = getChatThreadId(sender.id, recipient.id);
  const existing = (await kvGetJson<ChatMessage[]>(kv, KV_KEYS.chatThreadMessages(threadId))) ?? [];

  const msg: ChatMessage = {
    id: generateId('chat'),
    threadId,
    senderId: sender.id,
    senderName: sender.fullName,
    senderRole: sender.role,
    recipientId: recipient.id,
    body,
    readBy: [sender.id],
    createdAt: new Date().toISOString(),
  };

  const next = [...existing, msg].slice(-MAX_MESSAGES_PER_THREAD);
  await kvPutJson(kv, KV_KEYS.chatThreadMessages(threadId), next);
  await Promise.all([
    kvAddToIndex(kv, KV_KEYS.chatUserThreads(sender.id), recipient.id),
    kvAddToIndex(kv, KV_KEYS.chatUserThreads(recipient.id), sender.id),
  ]);

  const eventPayload = {
    type: 'chat:message',
    message: msg,
    clientTempId,
  };
  sendToUser(sender.id, eventPayload);
  sendToUser(recipient.id, eventPayload);

  return msg;
}

export async function markChatThreadReadAndBroadcast(
  kv: SchoolKVStore,
  readerId: string,
  peerId: string
): Promise<number> {
  if (!peerId || peerId === readerId) return 0;
  const threadId = getChatThreadId(readerId, peerId);
  const existing = (await kvGetJson<ChatMessage[]>(kv, KV_KEYS.chatThreadMessages(threadId))) ?? [];
  let changed = 0;

  const updated = existing.map((m) => {
    if (m.recipientId === readerId && !m.readBy.includes(readerId)) {
      changed++;
      return { ...m, readBy: [...m.readBy, readerId] };
    }
    return m;
  });

  if (changed > 0) {
    await kvPutJson(kv, KV_KEYS.chatThreadMessages(threadId), updated);
    const readEvent = {
      type: 'chat:read',
      threadId,
      readerId,
      peerId,
    };
    sendToUser(readerId, readEvent);
    sendToUser(peerId, readEvent);
  }
  return changed;
}

export function attachChatWebSocketServer(server: HttpServer, kv: SchoolKVStore) {
  void import('ws')
    .then(({ WebSocketServer }) => {
      const wss = new WebSocketServer({ noServer: true });
      const aliveMap = new WeakMap<MinimalWebSocket, boolean>();

      const heartbeat = setInterval(() => {
        for (const sockets of userSockets.values()) {
          for (const ws of sockets) {
            if (aliveMap.get(ws) === false) {
              ws.terminate();
              continue;
            }
            aliveMap.set(ws, false);
            try {
              ws.ping();
            } catch {
              // ignore
            }
          }
        }
      }, 30000);

      server.on('close', () => {
        clearInterval(heartbeat);
      });

      server.on('upgrade', async (req, socket, head) => {
        try {
          const reqUrl = new URL(req.url || '/', 'http://localhost');
          if (reqUrl.pathname !== '/ws/chat') {
            return;
          }

          const queryToken = reqUrl.searchParams.get('token')?.trim();
          const cookies = parseCookies(req.headers.cookie);
          const token = queryToken || cookies[SESSION_COOKIE_NAME] || null;

          if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          let userId: string | null = null;
          const session = await kvGetJson<SessionData>(kv, KV_KEYS.session(token));
          if (session) {
            if (new Date(session.expiresAt).getTime() <= Date.now()) {
              await kv.delete(KV_KEYS.session(token));
              socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
              socket.destroy();
              return;
            }
            userId = session.userId;
          } else {
            const signed = await verifySignedSessionToken(token, process.env.SESSION_SECRET);
            if (signed && signed.exp > Date.now()) {
              userId = signed.userId;
            }
          }

          if (!userId) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          const user = await kvGetJson<StoredUser>(kv, KV_KEYS.user(userId));
          if (!user || !user.active) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          wss.handleUpgrade(req, socket, head, (wsRaw) => {
            const ws = wsRaw as unknown as MinimalWebSocket;
            aliveMap.set(ws, true);
            let sockets = userSockets.get(user.id);
            if (!sockets) {
              sockets = new Set<MinimalWebSocket>();
              userSockets.set(user.id, sockets);
            }
            sockets.add(ws);

            ws.on('pong', () => {
              aliveMap.set(ws, true);
            });

            ws.send(
              JSON.stringify({
                type: 'chat:init',
                userId: user.id,
                onlineUserIds: getOnlineUserIds(),
              })
            );

            broadcastAll({
              type: 'presence:update',
              onlineUserIds: getOnlineUserIds(),
            });

            ws.on('message', async (raw) => {
              let payload: Record<string, unknown>;
              try {
                const rawStr =
                  typeof raw === 'string'
                    ? raw
                    : Buffer.isBuffer(raw)
                      ? raw.toString('utf8')
                      : Array.isArray(raw)
                        ? Buffer.concat(raw).toString('utf8')
                        : raw instanceof ArrayBuffer
                          ? Buffer.from(raw).toString('utf8')
                          : String(raw);
                payload = JSON.parse(rawStr) as Record<string, unknown>;
              } catch {
                return;
              }

          const type = String(payload.type || '');
          if (type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          if (type === 'chat:send') {
            const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : '';
            const body = typeof payload.body === 'string' ? payload.body : '';
            const clientTempId = typeof payload.clientTempId === 'string' ? payload.clientTempId : undefined;
            try {
              await persistAndBroadcastChatMessage(kv, user, recipientId, body, clientTempId);
            } catch (err) {
              ws.send(
                JSON.stringify({
                  type: 'chat:error',
                  clientTempId,
                  error: err instanceof Error ? err.message : 'خطا در ارسال پیام',
                })
              );
            }
            return;
          }

          if (type === 'chat:read') {
            const peerId = typeof payload.peerId === 'string' ? payload.peerId : '';
            if (peerId) {
              await markChatThreadReadAndBroadcast(kv, user.id, peerId).catch(() => {});
            }
            return;
          }

              if (type === 'chat:typing') {
                const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : '';
                if (recipientId && recipientId !== user.id) {
                  sendToUser(recipientId, {
                    type: 'chat:typing',
                    senderId: user.id,
                    isTyping: Boolean(payload.isTyping),
                  });
                }
              }
            });

            ws.on('close', () => {
              const set = userSockets.get(user.id);
              if (set) {
                set.delete(ws);
                if (set.size === 0) {
                  userSockets.delete(user.id);
                }
              }
              broadcastAll({
                type: 'presence:update',
                onlineUserIds: getOnlineUserIds(),
              });
            });
          });
        } catch {
          socket.destroy();
        }
      });
    })
    .catch((err) => {
      console.error('Failed to load WebSocketServer:', err);
    });
}
