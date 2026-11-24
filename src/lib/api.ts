import {
  clearWorkerAuthCache,
  getWorkerBaseUrl,
  hasFullWorkerSupport,
  invokeWorkerFallback,
  streamDedicatedAiWorkerFallback,
  streamPrivateTutorWorkerFallback,
} from './workerFallback';

const SESSION_TOKEN_KEY = 'shahriar_session_token';
let useWorkerFallback = false;

export interface ApiNotificationPayload {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  title?: string;
}

export interface ApiRequestOptions extends RequestInit {
  /** Set false to disable automatic toast notifications for this request */
  notify?: boolean;
  /** Suppress automatic error toast (useful for silent session checks) */
  silentError?: boolean;
  /** Optional fallback success message when server does not include one */
  successMessage?: string;
}

type ApiNotificationListener = (payload: ApiNotificationPayload) => void;
const notificationListeners = new Set<ApiNotificationListener>();

export function subscribeApiNotifications(listener: ApiNotificationListener): () => void {
  notificationListeners.add(listener);
  return () => {
    notificationListeners.delete(listener);
  };
}

function emitApiNotification(payload: ApiNotificationPayload) {
  for (const listener of notificationListeners) {
    try {
      listener(payload);
    } catch {
      // ignore listener errors
    }
  }
}

export function getStoredToken(): string | null {
  try {
    const sess = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (sess) return sess;
    const local = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (local) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, local);
      return local;
    }
    return null;
  } catch {
    try {
      return window.localStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export const getSessionToken = getStoredToken;

function setStoredToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage restriction
  }
  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage restriction
  }
  if (!token) {
    clearWorkerAuthCache();
  }
}

function getConfiguredApiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';
}

export function isWorkerApiMode(): boolean {
  if (useWorkerFallback) return true;
  if (import.meta.env.VITE_USE_LOCAL_API === 'true') return false;
  if (import.meta.env.VITE_USE_WORKER_API === 'true') return true;
  const apiBase = getConfiguredApiBase();
  if (apiBase && apiBase.includes('.workers.dev')) return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.stormkit.dev') || host.endsWith('.github.io')) {
      return true;
    }
  }
  return false;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isStaticFallbackNeeded(response: Response, text: string): boolean {
  if (response.status === 404 || response.status === 500 || response.status === 502 || response.status === 503) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return true;
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      // Real appRouter JSON errors have `{ error: '...' }`; plain static/CDN error pages do not
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return false;
      }
    } catch {
      return true;
    }
    return true;
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return true;
  }
  return false;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { notify = true, silentError = false, successMessage, ...fetchOptions } = options;

  const apiBase = getConfiguredApiBase();
  const token = getStoredToken();
  const workerMode = isWorkerApiMode();

  if (workerMode && path.startsWith('/api/')) {
    try {
      const workerBaseOverride = apiBase && apiBase.includes('.workers.dev') ? apiBase : undefined;
      const data = await invokeWorkerFallback<T>(path, {
        method: fetchOptions.method,
        body: fetchOptions.body,
        token,
        baseUrl: workerBaseOverride,
      });
      const obj = data as { token?: string; message?: unknown; notification?: unknown } | null;
      if (obj && typeof obj.token === 'string' && obj.token) {
        setStoredToken(obj.token);
      }
      if (path === '/api/auth/logout') {
        setStoredToken(null);
      }
      if (notify) {
        const msg =
          typeof obj?.notification === 'string' && obj.notification.trim()
            ? obj.notification.trim()
            : typeof obj?.message === 'string' && obj.message.trim()
              ? obj.message.trim()
              : successMessage?.trim();
        if (msg) {
          emitApiNotification({ type: 'success', title: 'عملیات موفق', message: msg });
        }
      }
      return data;
    } catch (err) {
      const e = err as { status?: number; message?: string };
      const status = typeof e?.status === 'number' ? e.status : 500;
      const errorMsg = e?.message || 'خطا در برقراری ارتباط با سرور احراز هویت.';
      if (status === 401 && path !== '/api/auth/login') {
        setStoredToken(null);
      }
      if (notify && !silentError) {
        emitApiNotification({ type: 'error', title: 'خطای سرور', message: errorMsg });
      }
      throw new ApiError(errorMsg, status);
    }
  }

  const targetUrl = path.startsWith('http') ? path : `${apiBase}${path}`;

  const headers = new Headers(fetchOptions.headers);
  if (fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });
  } catch {
    const networkMsg = 'خطا در برقراری ارتباط با سرور. لطفاً اتصال خود را بررسی کنید.';
    if (notify && !silentError) {
      emitApiNotification({
        type: 'error',
        title: 'خطای شبکه',
        message: networkMsg,
      });
    }
    throw new ApiError(networkMsg, 0);
  }

  const text = await response.text();

  if (!apiBase && path.startsWith('/api/') && isStaticFallbackNeeded(response, text)) {
    useWorkerFallback = true;
    return apiRequest<T>(path, options);
  }

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') {
      setStoredToken(null);
    }
    const errObj = parsed as { error?: string; message?: string } | null;
    const errorMsg =
      (typeof errObj?.error === 'string' && errObj.error.trim()) ||
      (typeof errObj?.message === 'string' && errObj.message.trim()) ||
      `خطا در ارتباط با سرور (کد ${response.status})`;

    if (notify && !silentError) {
      emitApiNotification({
        type: 'error',
        title: 'خطای سرور',
        message: errorMsg,
      });
    }
    throw new ApiError(errorMsg, response.status);
  }

  const obj = parsed as {
    token?: string;
    message?: unknown;
    notification?: unknown;
  } | null;

  if (obj && typeof obj.token === 'string' && obj.token) {
    setStoredToken(obj.token);
  }
  if (path === '/api/auth/logout') {
    setStoredToken(null);
  }

  if (notify) {
    const serverMessage =
      typeof obj?.notification === 'string' && obj.notification.trim()
        ? obj.notification.trim()
        : typeof obj?.message === 'string' && obj.message.trim()
          ? obj.message.trim()
          : successMessage?.trim();

    if (serverMessage) {
      emitApiNotification({
        type: 'success',
        title: 'عملیات موفق',
        message: serverMessage,
      });
    }
  }

  return parsed as T;
}

export interface StreamSseHandlers<TDone = Record<string, unknown>> {
  onDelta: (delta: string) => void;
  onEvent?: (payload: Record<string, unknown>) => void;
  onDone?: (payload: TDone) => void;
}

export async function streamSseRequest<TDone = Record<string, unknown>>(
  path: string,
  body: unknown,
  handlers: StreamSseHandlers<TDone>,
  signal?: AbortSignal
): Promise<void> {
  const apiBase = getConfiguredApiBase();
  const workerMode = isWorkerApiMode();
  const token = getStoredToken();

  const workerBaseOverride = apiBase && apiBase.includes('.workers.dev') ? apiBase : undefined;
  const aiStreamMatch = path.match(/^\/api\/ai\/conversations\/([^/]+)\/messages\/stream$/);
  if (workerMode && aiStreamMatch) {
    const fullWorker = await hasFullWorkerSupport(workerBaseOverride).catch(() => false);
    if (!fullWorker) {
      const convId = decodeURIComponent(aiStreamMatch[1]);
      const payloadBody = (body ?? {}) as { content?: string; mode?: string; lang?: string };
      try {
        await streamDedicatedAiWorkerFallback({
          convId,
          content: String(payloadBody.content ?? ''),
          mode: payloadBody.mode,
          lang: payloadBody.lang,
          token,
          onDelta: handlers.onDelta,
          onDone: (donePayload) => handlers.onDone?.(donePayload as unknown as TDone),
          signal,
        });
        return;
      } catch (err) {
        const e = err as { status?: number; message?: string };
        throw new ApiError(e?.message || 'خطا در برقراری ارتباط با سرور هوش مصنوعی.', typeof e?.status === 'number' ? e.status : 502);
      }
    }
  }

  const tutorStreamMatch = path.match(/^\/api\/private-tutor\/sessions\/([^/]+)\/ask\/stream$/);
  if (workerMode && tutorStreamMatch) {
    const fullWorker = await hasFullWorkerSupport(workerBaseOverride).catch(() => false);
    if (!fullWorker) {
      const sessionId = decodeURIComponent(tutorStreamMatch[1]);
      const payloadBody = (body ?? {}) as { question?: string; subjectId?: string; lang?: string };
      try {
        await streamPrivateTutorWorkerFallback({
          sessionId,
          question: String(payloadBody.question ?? ''),
          subjectId: payloadBody.subjectId,
          lang: payloadBody.lang,
          token,
          baseUrl: workerBaseOverride,
          onEvent: handlers.onEvent,
          onDelta: handlers.onDelta,
          onDone: (donePayload) => handlers.onDone?.(donePayload as unknown as TDone),
          signal,
        });
        return;
      } catch (err) {
        const e = err as { status?: number; message?: string };
        throw new ApiError(
          e?.message || 'خطا در برقراری ارتباط با معلم خصوصی.',
          typeof e?.status === 'number' ? e.status : 502
        );
      }
    }
  }

  const effectiveBase = workerMode
    ? getWorkerBaseUrl(workerBaseOverride)
    : apiBase;
  const targetUrl = path.startsWith('http') ? path : `${effectiveBase}${path}`;

  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    credentials: workerMode ? 'omit' : 'include',
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (!apiBase && !workerMode && path.startsWith('/api/') && isStaticFallbackNeeded(response, errText)) {
      useWorkerFallback = true;
      return streamSseRequest<TDone>(path, body, handlers, signal);
    }
    let errMsg = `خطا در ارتباط با سرور (کد ${response.status})`;
    try {
      const parsed = JSON.parse(errText) as { error?: string; message?: string };
      if (parsed?.error) errMsg = parsed.error;
      else if (parsed?.message) errMsg = parsed.message;
    } catch {
      // ignore non-json
    }
    throw new ApiError(errMsg, response.status);
  }

  if (!response.body) {
    throw new ApiError('جریان پاسخ در دسترس نیست.', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processEvent = (evt: string) => {
    const dataPayload = evt
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();

    if (!dataPayload || dataPayload === '[DONE]') return;

    let payload: {
      delta?: string;
      done?: boolean;
      error?: string | { message?: string };
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    } & TDone &
      Record<string, unknown>;

    try {
      payload = JSON.parse(dataPayload);
    } catch {
      return;
    }

    if (payload.error) {
      const errText =
        typeof payload.error === 'string'
          ? payload.error
          : payload.error.message || 'خطا در دریافت پاسخ هوش مصنوعی';
      throw new ApiError(errText, 502);
    }

    handlers.onEvent?.(payload);

    const delta =
      payload.delta ??
      payload.choices?.[0]?.delta?.content ??
      payload.choices?.[0]?.message?.content;
    if (delta) {
      handlers.onDelta(delta);
    }
    if (payload.done) {
      handlers.onDone?.(payload);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const evt = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processEvent(evt);
        sepIdx = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      processEvent(buffer);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore lock release error
    }
  }
}
