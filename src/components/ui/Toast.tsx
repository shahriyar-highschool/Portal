import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { subscribeApiNotifications } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title?: string;
  duration?: number;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 4;

const TOAST_META: Record<
  ToastType,
  {
    faTitle: string;
    enTitle: string;
    accentBar: string;
    border: string;
    iconBg: string;
    iconText: string;
    progressBar: string;
    Icon: typeof CheckCircle2;
  }
> = {
  success: {
    faTitle: 'عملیات موفق',
    enTitle: 'Success',
    accentBar: 'bg-emerald-600',
    border: 'border-emerald-200/90 dark:border-emerald-900',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    iconText: 'text-emerald-700 dark:text-emerald-400',
    progressBar: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  error: {
    faTitle: 'خطا',
    enTitle: 'Error',
    accentBar: 'bg-red-600',
    border: 'border-red-200/90 dark:border-red-900',
    iconBg: 'bg-red-50 dark:bg-red-950/60',
    iconText: 'text-red-700 dark:text-red-400',
    progressBar: 'bg-red-500',
    Icon: AlertCircle,
  },
  warning: {
    faTitle: 'هشدار',
    enTitle: 'Warning',
    accentBar: 'bg-amber-500',
    border: 'border-amber-200/90 dark:border-amber-900',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    iconText: 'text-amber-700 dark:text-amber-400',
    progressBar: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  info: {
    faTitle: 'اطلاعیه',
    enTitle: 'Notice',
    accentBar: 'bg-[#0F274A] dark:bg-sky-500',
    border: 'border-slate-200 dark:border-slate-800',
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconText: 'text-[#0F274A] dark:text-sky-400',
    progressBar: 'bg-[#0F274A] dark:bg-sky-500',
    Icon: Info,
  },
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastPopupCard({
  toast,
  isRtl,
  onDismiss,
}: {
  toast: ToastItem;
  isRtl: boolean;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, Math.max(200, remainingRef.current));

    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [paused, toast.id, onDismiss]);

  const meta = TOAST_META[toast.type];
  const Icon = meta.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isRtl ? -24 : 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: isRtl ? -20 : 20, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border bg-white dark:bg-slate-900 shadow-lg shadow-slate-900/10 dark:shadow-black/40 ${meta.border}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg ${meta.iconBg} ${meta.iconText} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className="w-4.5 h-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-5">{toast.title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-5 mt-0.5 break-words">{toast.message}</p>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={isRtl ? 'بستن اعلان' : 'Close notification'}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 p-1 rounded-md transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-800">
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
          className={`h-full w-full ${isRtl ? 'origin-right' : 'origin-left'} ${meta.progressBar} opacity-75`}
        />
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { lang, isRtl } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastEventRef = useRef<{
    type: ToastType;
    message: string;
    source: 'api' | 'manual';
    at: number;
  } | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const enqueueToast = useCallback(
    (
      message: string,
      type: ToastType = 'success',
      options: ToastOptions = {},
      source: 'api' | 'manual' = 'manual'
    ) => {
      const cleanMessage = message.trim();
      if (!cleanMessage) return;

      const now = Date.now();
      const prev = lastEventRef.current;

      if (prev) {
        const withinCooldown = now - prev.at < 1200;
        const isIdentical = prev.type === type && prev.message === cleanMessage;
        const isRedundantManualAfterApi =
          source === 'manual' && prev.source === 'api' && prev.type === type && now - prev.at < 350;
        if ((withinCooldown && isIdentical) || isRedundantManualAfterApi) {
          return;
        }
      }

      lastEventRef.current = { type, message: cleanMessage, source, at: now };

      const id = `${now}_${Math.random().toString(36).slice(2, 7)}`;
      const meta = TOAST_META[type];
      const item: ToastItem = {
        id,
        type,
        title: options.title || (lang === 'fa' ? meta.faTitle : meta.enTitle),
        message: cleanMessage,
        duration: options.duration ?? DEFAULT_DURATION_MS,
      };

      setToasts((current) => [...current.slice(-(MAX_VISIBLE_TOASTS - 1)), item]);
    },
    [lang]
  );

  const showToast = useCallback(
    (message: string, type: ToastType = 'success', options?: ToastOptions) => {
      enqueueToast(message, type, options, 'manual');
    },
    [enqueueToast]
  );

  useEffect(() => {
    return subscribeApiNotifications((payload) => {
      const meta = TOAST_META[payload.type];
      const localizedTitle =
        lang === 'en'
          ? meta.enTitle
          : payload.title || meta.faTitle;
      enqueueToast(payload.message, payload.type, { title: localizedTitle }, 'api');
    });
  }, [enqueueToast, lang]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearToasts }}>
      {children}
      <div
        aria-live="polite"
        aria-label={lang === 'fa' ? 'اعلانات سامانه' : 'System Notifications'}
        className={`fixed bottom-4 sm:bottom-5 z-50 flex flex-col gap-2.5 w-[min(24rem,calc(100vw-2rem))] pointer-events-none no-print ${
          isRtl ? 'left-4 sm:left-5' : 'right-4 sm:right-5'
        }`}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastPopupCard key={t.id} toast={t} isRtl={isRtl} onDismiss={dismissToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
