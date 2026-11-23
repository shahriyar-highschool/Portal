import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  MessageSquare,
  Search,
  Send,
  User,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatContact, ChatMessage, ChatThreadSummary, UserAccount, UserRole } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useChatSocket } from '../../lib/useChatSocket';
import { useToast } from '../ui/Toast';

export function UserChatView({
  user,
  onUnreadCountChange,
}: {
  user: UserAccount;
  onUnreadCountChange?: (unreadCount: number) => void;
}) {
  const { tr, isRtl, fmtDigits, fmtDateTime, roleLabel } = useI18n();
  const { showToast } = useToast();

  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [messagesByPeer, setMessagesByPeer] = useState<Record<string, ChatMessage[]>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const selectedPeerRef = useRef<string | null>(null);
  selectedPeerRef.current = selectedPeerId;

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentRef = useRef<{ peerId: string; at: number } | null>(null);

  const loadContactsAndThreads = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const [cRes, tRes] = await Promise.all([
        apiRequest<{ contacts: ChatContact[] }>('/api/chat/contacts', { notify: false }),
        apiRequest<{ threads: ChatThreadSummary[] }>('/api/chat/threads', { notify: false }),
      ]);
      setContacts(cRes.contacts ?? []);
      setThreads(tRes.threads ?? []);
      if (onUnreadCountChange) {
        const totalUnread = (tRes.threads ?? []).reduce((sum, th) => sum + th.unreadCount, 0);
        onUnreadCountChange(totalUnread);
      }
    } catch (err) {
      if (!opts?.silent) {
        showToast(err instanceof Error ? err.message : tr('خطا در بارگذاری فهرست گفتگوها', 'Failed to load chat contacts'), 'error');
      }
    } finally {
      setLoadingList(false);
    }
  }, [onUnreadCountChange, showToast, tr]);

  const loadThreadMessages = useCallback(
    async (peerId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoadingThread(true);
      }
      try {
        const res = await apiRequest<{ messages: ChatMessage[] }>(`/api/chat/threads/${peerId}/messages`, {
          notify: false,
        });
        const serverMsgs = res.messages ?? [];
        setMessagesByPeer((prev) => {
          const existing = prev[peerId] ?? [];
          const pendingOptimistic = existing.filter(
            (m) =>
              m.id.startsWith('tmp_') &&
              !serverMsgs.some(
                (sm) =>
                  sm.senderId === m.senderId &&
                  sm.body === m.body &&
                  Math.abs(new Date(sm.createdAt).getTime() - new Date(m.createdAt).getTime()) < 60000
              )
          );
          return { ...prev, [peerId]: [...serverMsgs, ...pendingOptimistic] };
        });
        // Mark thread as read if needed
        const hasUnread = serverMsgs.some((m) => m.recipientId === user.id && !m.readBy.includes(user.id));
        if (hasUnread) {
          await apiRequest(`/api/chat/threads/${peerId}/read`, { method: 'POST', notify: false }).catch(() => {});
          setThreads((prev) =>
            prev.map((th) => (th.peer.id === peerId ? { ...th, unreadCount: 0 } : th))
          );
        }
      } catch (err) {
        if (!opts?.silent) {
          showToast(err instanceof Error ? err.message : tr('خطا در دریافت پیام‌های گفتگو', 'Failed to load messages'), 'error');
        }
      } finally {
        if (!opts?.silent) {
          setLoadingThread(false);
        }
      }
    },
    [showToast, tr, user.id]
  );

  useEffect(() => {
    void loadContactsAndThreads();
  }, [loadContactsAndThreads]);

  // Keep parent unread count synced whenever threads update
  useEffect(() => {
    if (onUnreadCountChange) {
      const totalUnread = threads.reduce((sum, th) => sum + th.unreadCount, 0);
      onUnreadCountChange(totalUnread);
    }
  }, [threads, onUnreadCountChange]);

  const socketSendReadRef = useRef<(peerId: string) => void>(() => {});

  const handleIncomingMessage = useCallback(
    (msg: ChatMessage, clientTempId?: string) => {
      const peerId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
      const isActivePeer = selectedPeerRef.current === peerId;

      setMessagesByPeer((prev) => {
        const current = prev[peerId] ?? [];
        // Replace optimistic placeholder if matching clientTempId
        if (clientTempId) {
          const tempIdx = current.findIndex((m) => m.id === clientTempId);
          if (tempIdx >= 0) {
            const replaced = [...current];
            replaced[tempIdx] = msg;
            // Deduplicate in case both HTTP fallback and WS arrived
            const seen = new Set<string>();
            return {
              ...prev,
              [peerId]: replaced.filter((m) => {
                if (seen.has(m.id)) return false;
                seen.add(m.id);
                return true;
              }),
            };
          }
        }
        // Idempotent check by message ID
        if (current.some((m) => m.id === msg.id)) {
          return prev;
        }
        return {
          ...prev,
          [peerId]: [...current, msg],
        };
      });

      // Update thread summaries cleanly
      setThreads((prev) => {
        const idx = prev.findIndex((th) => th.peer.id === peerId);
        const shouldIncrementUnread = msg.recipientId === user.id && !isActivePeer;
        if (idx >= 0) {
          const existing = prev[idx];
          // Avoid duplicate increment if same lastMessage id
          const alreadyLatest = existing.lastMessage?.id === msg.id;
          const nextUnread = isActivePeer
            ? 0
            : alreadyLatest
              ? existing.unreadCount
              : existing.unreadCount + (shouldIncrementUnread ? 1 : 0);

          const updatedThread: ChatThreadSummary = {
            ...existing,
            lastMessage: msg,
            unreadCount: nextUnread,
            updatedAt: msg.createdAt,
          };
          const rest = prev.filter((_, i) => i !== idx);
          return [updatedThread, ...rest];
        }

        const matchedContact = contacts.find((c) => c.id === peerId);
        if (!matchedContact) {
          void loadContactsAndThreads();
          return prev;
        }
        const newThread: ChatThreadSummary = {
          threadId: msg.threadId,
          peer: matchedContact,
          lastMessage: msg,
          unreadCount: shouldIncrementUnread ? 1 : 0,
          updatedAt: msg.createdAt,
        };
        return [newThread, ...prev];
      });

      if (isActivePeer && msg.recipientId === user.id) {
        socketSendReadRef.current(peerId);
      }
    },
    [contacts, loadContactsAndThreads, user.id]
  );

  const handleIncomingRead = useCallback(
    ({ readerId, peerId }: { threadId: string; readerId: string; peerId: string }) => {
      const targetPeer = readerId === user.id ? peerId : readerId;
      setMessagesByPeer((prev) => {
        const list = prev[targetPeer];
        if (!list) return prev;
        return {
          ...prev,
          [targetPeer]: list.map((m) =>
            m.readBy.includes(readerId) ? m : { ...m, readBy: [...m.readBy, readerId] }
          ),
        };
      });
      if (readerId === user.id) {
        setThreads((prev) =>
          prev.map((th) => (th.peer.id === targetPeer ? { ...th, unreadCount: 0 } : th))
        );
      }
    },
    [user.id]
  );

  const handleSocketError = useCallback(
    (error: string, clientTempId?: string) => {
      showToast(error, 'error');
      if (clientTempId && selectedPeerRef.current) {
        const peerId = selectedPeerRef.current;
        setMessagesByPeer((prev) => ({
          ...prev,
          [peerId]: (prev[peerId] ?? []).filter((m) => m.id !== clientTempId),
        }));
      }
    },
    [showToast]
  );

  const handleReconnect = useCallback(() => {
    void loadContactsAndThreads({ silent: true });
    if (selectedPeerRef.current) {
      void loadThreadMessages(selectedPeerRef.current, { silent: true });
    }
  }, [loadContactsAndThreads, loadThreadMessages]);

  const { connected, onlineUserIds, typingUsers, sendMessage, sendReadReceipt, sendTyping } = useChatSocket(
    user.id,
    {
      onMessage: handleIncomingMessage,
      onRead: handleIncomingRead,
      onReconnect: handleReconnect,
      onError: handleSocketError,
    }
  );
  socketSendReadRef.current = sendReadReceipt;

  const handleSelectPeer = (peerId: string) => {
    setSelectedPeerId(peerId);
    void loadThreadMessages(peerId);
  };

  // Scroll feed container to bottom when active messages change or peer switches
  const activeMessages = selectedPeerId ? messagesByPeer[selectedPeerId] ?? [] : [];
  useEffect(() => {
    const el = feedContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeMessages.length, selectedPeerId]);

  const threadMap = useMemo(() => new Map(threads.map((th) => [th.peer.id, th])), [threads]);

  // Combined sorted list of contacts (active conversations first, then online users, then alphabetical)
  const sortedContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (roleFilter !== 'all' && c.role !== roleFilter) return false;
        if (!q) return true;
        return (
          c.fullName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          (c.className ?? '').toLowerCase().includes(q) ||
          (c.gradeLevel ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ta = threadMap.get(a.id);
        const tb = threadMap.get(b.id);
        if (ta && tb) return tb.updatedAt.localeCompare(ta.updatedAt);
        if (ta) return -1;
        if (tb) return 1;
        const aOn = onlineUserIds.has(a.id) || Boolean(a.online);
        const bOn = onlineUserIds.has(b.id) || Boolean(b.online);
        if (aOn !== bOn) return aOn ? -1 : 1;
        return a.fullName.localeCompare(b.fullName, 'fa');
      });
  }, [contacts, searchQuery, roleFilter, threadMap, onlineUserIds]);

  const selectedPeer = useMemo(
    () =>
      contacts.find((c) => c.id === selectedPeerId) ??
      (selectedPeerId ? threadMap.get(selectedPeerId)?.peer ?? null : null),
    [contacts, selectedPeerId, threadMap]
  );

  const isPeerOnline = (peer: ChatContact) => onlineUserIds.has(peer.id) || Boolean(peer.online);

  const doSend = async () => {
    if (!selectedPeerId) return;
    const text = draft.trim();
    if (!text || sending) return;

    const clientTempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: ChatMessage = {
      id: clientTempId,
      threadId: [user.id, selectedPeerId].sort().join('__'),
      senderId: user.id,
      senderName: user.fullName,
      senderRole: user.role,
      recipientId: selectedPeerId,
      body: text,
      readBy: [user.id],
      createdAt: new Date().toISOString(),
    };

    setMessagesByPeer((prev) => ({
      ...prev,
      [selectedPeerId]: [...(prev[selectedPeerId] ?? []), optimisticMsg],
    }));
    setDraft('');
    sendTyping(selectedPeerId, false);
    setSending(true);
    try {
      await sendMessage(selectedPeerId, text, clientTempId);
    } catch (err) {
      setMessagesByPeer((prev) => ({
        ...prev,
        [selectedPeerId]: (prev[selectedPeerId] ?? []).filter((m) => m.id !== clientTempId),
      }));
      showToast(err instanceof Error ? err.message : tr('خطا در ارسال پیام', 'Failed to send message'), 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doSend();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void doSend();
    }
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!selectedPeerId) return;
    const now = Date.now();
    const last = lastTypingSentRef.current;
    if (!last || last.peerId !== selectedPeerId || now - last.at > 1500) {
      sendTyping(selectedPeerId, val.trim().length > 0);
      lastTypingSentRef.current = { peerId: selectedPeerId, at: now };
    }
  };

  const onlineCount = useMemo(
    () => contacts.filter((c) => onlineUserIds.has(c.id) || c.online).length,
    [contacts, onlineUserIds]
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {/* Top Status Bar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0F274A]/10 dark:bg-sky-500/15 flex items-center justify-center text-[#0F274A] dark:text-sky-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {tr('گفتگوی زنده و مستقیم با اعضای مدرسه', 'Real-Time School Messenger')}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {fmtDigits(contacts.length)} {tr('کاربر فعال', 'users')} · {fmtDigits(onlineCount)}{' '}
              {tr('آنلاین در این لحظه', 'online now')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <Wifi className="w-3.5 h-3.5" />
              <span>{tr('متصل به سرور زنده', 'Live Connected')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              <WifiOff className="w-3.5 h-3.5" />
              <span>{tr('در حال اتصال مجدد...', 'Reconnecting...')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Two-Pane Messenger Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 h-[600px] min-h-[500px]">
        {/* Contacts & Threads Sidebar */}
        <div
          className={`lg:col-span-4 min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/40 dark:bg-slate-950/30 ${
            selectedPeer ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr('جستجوی دانش‌آموز، معلم یا مدیر...', 'Search student, teacher or admin...')}
                className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-[11px]">
              {[
                { id: 'all', label: tr('همه', 'All') },
                { id: 'admin', label: tr('مدیر', 'Admin') },
                { id: 'teacher', label: tr('دبیر', 'Teacher') },
                { id: 'student', label: tr('دانش‌آموز', 'Student') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id as 'all' | UserRole)}
                  className={`py-1 px-1.5 rounded-md font-medium transition-colors truncate ${
                    roleFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
            {loadingList ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {tr('در حال بارگذاری مخاطبین...', 'Loading contacts...')}
              </div>
            ) : sortedContacts.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {tr('کاربری با این مشخصات یافت نشد', 'No matching contacts found')}
                </p>
              </div>
            ) : (
              sortedContacts.map((contact) => {
                const thread = threadMap.get(contact.id);
                const active = selectedPeerId === contact.id;
                const online = isPeerOnline(contact);
                const isTyping = Boolean(typingUsers[contact.id]);

                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectPeer(contact.id)}
                    className={`w-full px-3.5 py-3 text-start flex items-start gap-3 transition-colors ${
                      active
                        ? 'bg-[#0F274A]/5 dark:bg-sky-500/10 border-s-2 border-[#0F274A] dark:border-sky-400'
                        : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {contact.avatarUrl ? (
                        <img
                          src={contact.avatarUrl}
                          alt={contact.fullName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <span
                        title={online ? tr('آنلاین', 'Online') : tr('آفلاین', 'Offline')}
                        className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 absolute -bottom-0.5 -end-0.5 ${
                          online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {contact.fullName}
                        </span>
                        {thread && thread.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#0F274A] dark:bg-sky-600 text-white text-[10px] font-bold tabular-nums shrink-0">
                            {fmtDigits(thread.unreadCount)}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {roleLabel(contact.role)}
                        {contact.className ? ` · ${contact.className}` : contact.gradeLevel ? ` · ${contact.gradeLevel}` : ''}
                      </p>

                      {isTyping ? (
                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate mt-1">
                          {tr('در حال نوشتن...', 'typing...')}
                        </p>
                      ) : thread?.lastMessage ? (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-1">
                          {thread.lastMessage.senderId === user.id ? `${tr('شما:', 'You:')} ` : ''}
                          {thread.lastMessage.body}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active Conversation Pane */}
        <div className={`lg:col-span-8 min-h-0 overflow-hidden flex flex-col h-full bg-white dark:bg-slate-900 ${!selectedPeer ? 'hidden lg:flex' : 'flex'}`}>
          {!selectedPeer ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F274A] dark:text-sky-400 mb-3">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('یک مخاطب را برای گفتگو انتخاب کنید', 'Select a contact to start chatting')}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
                {tr(
                  'پیام‌های شما به صورت زنده از طریق سرور اختصاصی مدرسه منتقل و در پایگاه داده ذخیره می‌شوند.',
                  'Your messages are delivered in real time via the school server and persisted securely.'
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedPeerId(null)}
                    aria-label={tr('بازگشت به فهرست', 'Back to contacts')}
                    className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  </button>
                  <div className="relative shrink-0">
                    {selectedPeer.avatarUrl ? (
                      <img
                        src={selectedPeer.avatarUrl}
                        alt={selectedPeer.fullName}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F274A] dark:text-sky-300">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                    <span
                      className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 absolute -bottom-0.5 -end-0.5 ${
                        isPeerOnline(selectedPeer) ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {selectedPeer.fullName}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {typingUsers[selectedPeer.id] ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {tr('در حال نوشتن پیام...', 'typing...')}
                        </span>
                      ) : (
                        <>
                          {roleLabel(selectedPeer.role)}
                          {selectedPeer.className ? ` · ${selectedPeer.className}` : ''} ·{' '}
                          <span className={isPeerOnline(selectedPeer) ? 'text-emerald-700 dark:text-emerald-400 font-medium' : ''}>
                            {isPeerOnline(selectedPeer) ? tr('آنلاین', 'Online') : tr('آفلاین', 'Offline')}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Message Feed */}
              <div ref={feedContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/40 dark:bg-slate-950/30">
                {loadingThread && activeMessages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                    {tr('در حال دریافت تاریخچه گفتگو...', 'Loading conversation history...')}
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {tr('هنوز پیامی در این گفتگو رد و بدل نشده است.', 'No messages in this conversation yet.')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {tr('اولین پیام خود را در کادر پایین بنویسید و ارسال کنید.', 'Write your first message below to start.')}
                    </p>
                  </div>
                ) : (
                  activeMessages.map((m) => {
                    const isMine = m.senderId === user.id;
                    const isReadByPeer = m.readBy.includes(selectedPeer.id);
                    const isOptimistic = m.id.startsWith('tmp_');

                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 border text-sm leading-relaxed ${
                            isMine
                              ? 'bg-[#0F274A] dark:bg-sky-600 text-white border-transparent'
                              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-[13px]">{m.body}</p>
                          <div
                            className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums ${
                              isMine ? 'text-slate-200/90' : 'text-slate-400 dark:text-slate-400'
                            }`}
                          >
                            <span>{fmtDateTime(m.createdAt)}</span>
                            {isMine &&
                              (isOptimistic ? (
                                <Check className="w-3 h-3 opacity-60" />
                              ) : isReadByPeer ? (
                                <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                              ) : (
                                <Check className="w-3 h-3" />
                              ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSubmit}
                className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-end gap-2.5"
              >
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={tr('پیام خود را بنویسید... (Enter برای ارسال)', 'Write a message... (Enter to send)')}
                  className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-500 max-h-32"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-45 shrink-0 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{tr('ارسال', 'Send')}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
