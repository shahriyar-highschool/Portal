import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../shared/types';
import { apiRequest, getSessionToken, isWorkerApiMode } from './api';

export interface IncomingChatMessageEvent {
  type: 'chat:message';
  message: ChatMessage;
  clientTempId?: string;
}

interface ChatSocketHandlers {
  onMessage?: (message: ChatMessage, clientTempId?: string) => void;
  onRead?: (payload: { threadId: string; readerId: string; peerId: string }) => void;
  onReconnect?: () => void;
  onError?: (error: string, clientTempId?: string) => void;
}

export function useChatSocket(userId: string, handlers: ChatSocketHandlers) {
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set([userId]));
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const fallbackPollRef = useRef<number | null>(null);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());
  const attemptRef = useRef(0);
  const hadConnectedOnceRef = useRef(false);
  const disposedRef = useRef(false);

  const buildWsUrl = useCallback(() => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';
    const token = getSessionToken();
    const query = token ? `?token=${encodeURIComponent(token)}` : '';

    if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
      const wsBase = apiBase.replace(/^http/, 'ws');
      return `${wsBase}/ws/chat${query}`;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/chat${query}`;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    hadConnectedOnceRef.current = false;
    attemptRef.current = 0;

    // In Cloudflare Worker / static hosting mode, use clean HTTP polling instead of broken WS retries
    if (isWorkerApiMode()) {
      setConnected(true);
      const pollId = window.setInterval(() => {
        if (!disposedRef.current) {
          handlersRef.current.onReconnect?.();
        }
      }, 4500);
      return () => {
        disposedRef.current = true;
        window.clearInterval(pollId);
      };
    }

    const startFallbackPolling = () => {
      if (fallbackPollRef.current !== null || disposedRef.current) return;
      fallbackPollRef.current = window.setInterval(() => {
        if (!disposedRef.current) {
          handlersRef.current.onReconnect?.();
        }
      }, 4000);
    };

    const stopFallbackPolling = () => {
      if (fallbackPollRef.current !== null) {
        window.clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
    };

    const clearTimers = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const connect = () => {
      if (disposedRef.current) return;
      clearTimers();

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (disposedRef.current) {
          ws.close();
          return;
        }
        const isReconnect = hadConnectedOnceRef.current;
        hadConnectedOnceRef.current = true;
        attemptRef.current = 0;
        stopFallbackPolling();
        setConnected(true);

        if (isReconnect) {
          handlersRef.current.onReconnect?.();
        }

        heartbeatTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = String(data.type || '');
        if (type === 'chat:init' || type === 'presence:update') {
          const ids = Array.isArray(data.onlineUserIds)
            ? (data.onlineUserIds.filter((x) => typeof x === 'string') as string[])
            : [];
          setOnlineUserIds(new Set([...ids, userId]));
          return;
        }

        if (type === 'chat:message' && data.message && typeof data.message === 'object') {
          const msg = data.message as ChatMessage;
          const clientTempId = typeof data.clientTempId === 'string' ? data.clientTempId : undefined;
          setTypingUsers((prev) => {
            if (!prev[msg.senderId]) return prev;
            return { ...prev, [msg.senderId]: false };
          });
          handlersRef.current.onMessage?.(msg, clientTempId);
          return;
        }

        if (type === 'chat:read') {
          const threadId = typeof data.threadId === 'string' ? data.threadId : '';
          const readerId = typeof data.readerId === 'string' ? data.readerId : '';
          const peerId = typeof data.peerId === 'string' ? data.peerId : '';
          if (threadId && readerId) {
            handlersRef.current.onRead?.({ threadId, readerId, peerId });
          }
          return;
        }

        if (type === 'chat:typing') {
          const senderId = typeof data.senderId === 'string' ? data.senderId : '';
          const isTyping = Boolean(data.isTyping);
          if (!senderId) return;

          const existingTimeout = typingTimeoutsRef.current.get(senderId);
          if (existingTimeout !== undefined) {
            window.clearTimeout(existingTimeout);
            typingTimeoutsRef.current.delete(senderId);
          }

          setTypingUsers((prev) => ({ ...prev, [senderId]: isTyping }));
          if (isTyping) {
            const t = window.setTimeout(() => {
              setTypingUsers((prev) => ({ ...prev, [senderId]: false }));
              typingTimeoutsRef.current.delete(senderId);
            }, 3500);
            typingTimeoutsRef.current.set(senderId, t);
          }
          return;
        }

        if (type === 'chat:error') {
          const error = typeof data.error === 'string' ? data.error : 'خطا در ارسال پیام';
          const clientTempId = typeof data.clientTempId === 'string' ? data.clientTempId : undefined;
          handlersRef.current.onError?.(error, clientTempId);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        clearTimers();
        if (!disposedRef.current) {
          startFallbackPolling();
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose handles reconnection cleanly
      };
    };

    const scheduleReconnect = () => {
      if (disposedRef.current || reconnectTimerRef.current !== null) return;
      const delay = Math.min(10000, 1000 * Math.pow(1.6, attemptRef.current));
      attemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    startFallbackPolling();
    connect();

    return () => {
      disposedRef.current = true;
      clearTimers();
      stopFallbackPolling();
      for (const timeoutId of typingTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      typingTimeoutsRef.current.clear();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [userId, buildWsUrl]);

  const sendMessage = useCallback(async (recipientId: string, body: string, clientTempId?: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'chat:send',
          recipientId,
          body,
          clientTempId,
        })
      );
      return;
    }

    // Fallback over REST if socket is momentarily reconnecting; server persists & broadcasts
    const res = await apiRequest<{ message?: ChatMessage; chatMessage?: ChatMessage }>('/api/chat/messages', {
      method: 'POST',
      notify: false,
      body: JSON.stringify({ recipientId, body, clientTempId }),
    });
    const delivered = res.message ?? res.chatMessage;
    if (delivered) {
      handlersRef.current.onMessage?.(delivered, clientTempId);
    }
  }, []);

  const sendReadReceipt = useCallback((peerId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat:read', peerId }));
    } else {
      void apiRequest(`/api/chat/threads/${peerId}/read`, { method: 'POST', notify: false }).catch(() => {});
    }
  }, []);

  const sendTyping = useCallback((recipientId: string, isTyping: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat:typing', recipientId, isTyping }));
    }
  }, []);

  return {
    connected,
    onlineUserIds,
    typingUsers,
    sendMessage,
    sendReadReceipt,
    sendTyping,
  };
}
