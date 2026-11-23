import {
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Inbox,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  type Announcement,
  type DirectMessage,
  type ProfileChangeFields,
  type ProfileChangeRequest,
  type SchoolClass,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { UserChatView } from './UserChatView';

export function AnnouncementsView({
  user,
  announcements,
  classes,
  onReload,
}: {
  user: UserAccount;
  announcements: Announcement[];
  classes: SchoolClass[];
  onReload: () => Promise<void>;
}) {
  const { tr, fmtDateTime, roleLabel, priorityLabel } = useI18n();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<Announcement['targetType']>(
    user.role === 'teacher' ? 'class' : 'all'
  );
  const [targetClassId, setTargetClassId] = useState(classes[0]?.id ?? '');
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [submitting, setSubmitting] = useState(false);

  const canCreate = user.role === 'admin' || (user.role === 'teacher' && classes.length > 0);
  const filtered = announcements.filter(
    (a) => priorityFilter === 'all' || a.priority === priorityFilter
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          targetType: user.role === 'teacher' ? 'class' : targetType,
          targetClassId:
            user.role === 'teacher' || targetType === 'class' ? targetClassId || classes[0]?.id : undefined,
          priority,
        }),
      });
      setTitle('');
      setBody('');
      setModalOpen(false);
      await onReload();
      showToast(tr('اطلاعیه با موفقیت منتشر شد.', 'Announcement published successfully.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در انتشار اطلاعیه', 'Failed to publish announcement'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/announcements/${id}`, { method: 'DELETE' });
      await onReload();
      showToast(tr('اطلاعیه حذف شد.', 'Announcement deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف اطلاعیه', 'Failed to delete announcement'), 'error');
    }
  };

  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {[
            { id: 'all', label: tr('همه', 'All') },
            { id: 'urgent', label: tr('فوری', 'Urgent') },
            { id: 'important', label: tr('مهم', 'Important') },
            { id: 'normal', label: tr('عادی', 'Normal') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPriorityFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                priorityFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => {
              if (!targetClassId && classes[0]) setTargetClassId(classes[0].id);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('ثبت اطلاعیه جدید', 'New Announcement')}</span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
          <Megaphone className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tr('اطلاعیه‌ای برای نمایش وجود ندارد', 'No announcements to display')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {tr(
              'اطلاعیه‌های جدید مدرسه یا کلاس‌های مرتبط در این بخش نمایش داده می‌شوند.',
              'New school or class announcements will appear here.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const pColor =
              a.priority === 'urgent'
                ? 'text-red-700 dark:text-red-400'
                : a.priority === 'important'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400';

            const targetText =
              a.targetType === 'all'
                ? tr('همه اعضای مدرسه', 'All School Members')
                : a.targetType === 'students'
                ? tr('دانش‌آموزان', 'Students')
                : a.targetType === 'teachers'
                ? tr('معلمان', 'Teachers')
                : `${tr('کلاس', 'Class')} ${classMap.get(a.targetClassId ?? '') ?? tr('مشخص', 'Specific')}`;

            const canDelete = user.role === 'admin' || a.authorId === user.id;

            return (
              <div
                key={a.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      <span className={`font-semibold ${pColor}`}>{priorityLabel(a.priority)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {tr('مخاطب:', 'Audience:')} {targetText}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{fmtDateTime(a.createdAt)}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{a.title}</h3>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(a.id)}
                      aria-label={tr('حذف اطلاعیه', 'Delete announcement')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-7 whitespace-pre-wrap">
                  {a.body}
                </p>
                <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  {tr('منتشرکننده:', 'Published by:')} {a.authorName} ({roleLabel(a.authorRole)})
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={tr('انتشار اطلاعیه جدید', 'Publish Announcement')}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('عنوان اطلاعیه', 'Announcement Title')}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {tr('اولویت', 'Priority')}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Announcement['priority'])}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="normal">{tr('عادی', 'Normal')}</option>
                <option value="important">{tr('مهم', 'Important')}</option>
                <option value="urgent">{tr('فوری', 'Urgent')}</option>
              </select>
            </div>

            {user.role === 'admin' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('مخاطبان', 'Audience')}
                </label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as Announcement['targetType'])}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">{tr('همه کاربران', 'All Users')}</option>
                  <option value="students">{tr('همه دانش‌آموزان', 'All Students')}</option>
                  <option value="teachers">{tr('همه معلمان', 'All Teachers')}</option>
                  <option value="class">{tr('یک کلاس مشخص', 'Specific Class')}</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('کلاس مقصد', 'Target Class')}
                </label>
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {user.role === 'admin' && targetType === 'class' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {tr('انتخاب کلاس', 'Select Class')}
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('متن اطلاعیه', 'Announcement Body')}
            </label>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
            >
              {submitting ? tr('در حال انتشار...', 'Publishing...') : tr('انتشار اطلاعیه', 'Publish')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function MessagesView({
  user,
  messages,
  recipients,
  onReload,
  chatUnreadCount = 0,
  onChatUnreadChange,
}: {
  user: UserAccount;
  messages: DirectMessage[];
  recipients: Array<{ id: string; fullName: string; role: string }>;
  onReload: () => Promise<void>;
  chatUnreadCount?: number;
  onChatUnreadChange?: (count: number) => void;
}) {
  const { tr, fmtDigits, fmtDateTime, roleLabel } = useI18n();
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'chat' | 'inbox'>('chat');
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const unreadInboxCount = messages.filter((m) => m.senderId !== user.id && !m.readBy.includes(user.id)).length;

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!recipientId) {
      showToast(tr('گیرنده پیام را انتخاب کنید.', 'Please select a recipient.'), 'error');
      return;
    }
    setSending(true);
    try {
      await apiRequest('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId, subject, body }),
      });
      setSubject('');
      setBody('');
      setComposeOpen(false);
      await onReload();
      showToast(tr('پیام با موفقیت ارسال شد.', 'Message sent successfully.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ارسال پیام', 'Failed to send message'), 'error');
    } finally {
      setSending(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      await apiRequest(`/api/messages/${id}/read`, { method: 'POST' });
      await onReload();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('chat')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              subTab === 'chat'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{tr('چت آنلاین کاربران', 'Live User Chat')}</span>
            {chatUnreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#0F274A] dark:bg-sky-600 text-white text-[10px] font-bold tabular-nums">
                {fmtDigits(chatUnreadCount)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('inbox')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              subTab === 'inbox'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>{tr('صندوق پیام‌های سیستمی', 'System & Admin Inbox')}</span>
            {unreadInboxCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                {fmtDigits(unreadInboxCount)}
              </span>
            )}
          </button>
        </div>

        {subTab === 'inbox' && (
          <button
            type="button"
            onClick={() => {
              if (!recipientId && recipients[0]) setRecipientId(recipients[0].id);
              setComposeOpen(true);
            }}
            disabled={recipients.length === 0 && user.role !== 'admin'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{tr('ارسال نامه رسمی', 'Send Official Message')}</span>
          </button>
        )}
      </div>

      {subTab === 'chat' ? (
        <UserChatView user={user} onUnreadCountChange={onChatUnreadChange} />
      ) : (
        <>
          {messages.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
          <Inbox className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tr('صندوق پیام‌ها خالی است', 'Inbox is empty')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {tr('هنوز پیامی دریافت یا ارسال نکرده‌اید.', 'You have not sent or received any messages yet.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const isRead = m.readBy.includes(user.id);
            const isMine = m.senderId === user.id;
            return (
              <div
                key={m.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-5 ${
                  !isRead && !isMine
                    ? 'border-blue-300 dark:border-sky-700 bg-blue-50/20 dark:bg-sky-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <Mail className="w-3.5 h-3.5" />
                      <span>
                        {isMine
                          ? tr('ارسالی به گیرنده', 'Sent message')
                          : `${tr('فرستنده:', 'From:')} ${m.senderName} (${roleLabel(m.senderRole)})`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{fmtDateTime(m.createdAt)}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{m.subject}</h3>
                  </div>

                  {!isRead && !isMine ? (
                    <button
                      type="button"
                      onClick={() => void markRead(m.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#0F274A]/20 dark:border-sky-500/30 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F274A] dark:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('ثبت به عنوان خوانده‌شده', 'Mark as Read')}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">{tr('خوانده‌شده', 'Read')}</span>
                  )}
                </div>
                <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-7 whitespace-pre-wrap">
                  {m.body}
                </p>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title={tr('ارسال پیام جدید', 'Send New Message')}>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('گیرنده', 'Recipient')}
            </label>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {user.role === 'admin' && <option value="all">{tr('همه کاربران سامانه', 'All Users')}</option>}
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} ({roleLabel(r.role as UserAccount['role'])})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('موضوع', 'Subject')}
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {tr('متن پیام', 'Message Body')}
            </label>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposeOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
            >
              {sending ? tr('در حال ارسال...', 'Sending...') : tr('ارسال پیام', 'Send')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ProfileView({
  user,
  classNameLabel,
  onUpdated,
}: {
  user: UserAccount;
  classNameLabel?: string;
  onUpdated: (user: UserAccount) => void;
}) {
  const { tr, fmtDigits, fmtDateTime, roleLabel } = useI18n();
  const { showToast } = useToast();

  // Admin direct edit OR Student/Teacher request change values
  const [fullName, setFullName] = useState(user.fullName);
  const [age, setAge] = useState(user.age ? String(user.age) : '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [reason, setReason] = useState('');

  // Direct password change (allowed for all roles)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [myRequests, setMyRequests] = useState<ProfileChangeRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);

  const loadMyRequests = useCallback(async () => {
    if (user.role === 'admin') return;
    setLoadingReqs(true);
    try {
      const res = await apiRequest<{ requests: ProfileChangeRequest[] }>('/api/profile-requests');
      setMyRequests(res.requests);
    } catch {
      // ignore
    } finally {
      setLoadingReqs(false);
    }
  }, [user.role]);

  useEffect(() => {
    void loadMyRequests();
  }, [loadMyRequests]);

  useEffect(() => {
    setFullName(user.fullName);
    setAge(user.age ? String(user.age) : '');
    setPhone(user.phone ?? '');
    setEmail(user.email ?? '');
    setAvatarUrl(user.avatarUrl ?? '');
  }, [user]);

  const handleSaveAdminDirect = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiRequest<{ user: UserAccount }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          age: age ? Number(age) : undefined,
          phone: phone.trim(),
          email: email.trim(),
          avatarUrl: avatarUrl.trim(),
        }),
      });
      onUpdated(data.user);
      showToast(tr('اطلاعات پروفایل با موفقیت به‌روزرسانی شد.', 'Profile updated successfully.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره اطلاعات', 'Failed to save profile'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitChangeRequest = async (e: FormEvent) => {
    e.preventDefault();
    const requestedValues: ProfileChangeFields = {};
    if (fullName.trim() !== user.fullName) requestedValues.fullName = fullName.trim();
    if (age && Number(age) !== user.age) requestedValues.age = Number(age);
    if (phone.trim() !== (user.phone ?? '')) requestedValues.phone = phone.trim();
    if (email.trim() !== (user.email ?? '')) requestedValues.email = email.trim();
    if (avatarUrl.trim() !== (user.avatarUrl ?? '')) requestedValues.avatarUrl = avatarUrl.trim();

    if (Object.keys(requestedValues).length === 0) {
      showToast(tr('هیچ تغییری نسبت به اطلاعات فعلی وارد نشده است.', 'No changes were made to submit.'), 'error');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/api/profile-requests', {
        method: 'POST',
        body: JSON.stringify({ requestedValues, reason: reason.trim() || undefined }),
      });
      setReason('');
      await loadMyRequests();
      showToast(
        tr(
          'درخواست تغییر پروفایل ثبت شد و پس از تأیید مدیر اعمال می‌شود.',
          'Profile change request submitted for administrator approval.'
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت درخواست', 'Failed to submit request'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    setSavingPass(true);
    try {
      const data = await apiRequest<{ user: UserAccount }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      onUpdated(data.user);
      setCurrentPassword('');
      setNewPassword('');
      showToast(tr('رمز عبور با موفقیت تغییر یافت.', 'Password updated successfully.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تغییر رمز عبور', 'Failed to update password'), 'error');
    } finally {
      setSavingPass(false);
    }
  };

  const handleAvatarFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 150 * 1024) {
      showToast(tr('حجم تصویر باید کمتر از ۱۵۰ کیلوبایت باشد.', 'Avatar image must be under 150 KB.'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Identity Summary Card */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3.5 pb-4 border-b border-slate-200 dark:border-slate-800">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#0F274A] dark:text-sky-300 shrink-0">
                <User className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{user.fullName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{roleLabel(user.role)}</p>
            </div>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{tr('نام کاربری:', 'Username:')}</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100" dir="ltr">
                {user.username}
              </dd>
            </div>
            <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{tr('کد ملی:', 'National ID:')}</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums" dir="ltr">
                {user.nationalId ? fmtDigits(user.nationalId) : tr('ثبت‌نشده', 'Not set')}
              </dd>
            </div>
            <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{tr('سن:', 'Age:')}</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {user.age ? `${fmtDigits(user.age)} ${tr('سال', 'yrs')}` : tr('ثبت‌نشده', 'Not set')}
              </dd>
            </div>
            {user.role === 'student' && (
              <>
                <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400">{tr('پایه تحصیلی:', 'Grade Level:')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {user.gradeLevel || tr('ثبت‌نشده', 'Not set')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400">{tr('کلاس:', 'Class:')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {classNameLabel || tr('تخصیص‌نیافته', 'Unassigned')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-600" />
                    <span>{tr('سکه آموزشی:', 'Study Coins:')}</span>
                  </dt>
                  <dd className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {fmtDigits(user.coins ?? 0)}
                  </dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-2 py-1.5">
              <dt className="text-slate-500 dark:text-slate-400">{tr('آخرین ورود:', 'Last Login:')}</dt>
              <dd className="text-slate-700 dark:text-slate-300 tabular-nums">{fmtDateTime(user.lastLoginAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Profile Edit / Change Request + Password Card */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
              {user.role === 'admin'
                ? tr('ویرایش اطلاعات پروفایل', 'Edit Profile Information')
                : tr('درخواست تغییر اطلاعات پروفایل (با تأیید مدیر)', 'Request Profile Changes (Admin Approval)')}
            </h3>

            {user.role !== 'admin' && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  {tr(
                    'تغییر نام، سن، اطلاعات تماس یا تصویر پروفایل برای دانش‌آموزان و معلمان پس از ارسال درخواست و تأیید مدیر سامانه اعمال می‌شود.',
                    'Changes to name, age, contact details, or avatar for students and teachers take effect once approved by a school administrator.'
                  )}
                </p>
              </div>
            )}

            <form
              onSubmit={user.role === 'admin' ? handleSaveAdminDirect : handleSubmitChangeRequest}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('نام و نام خانوادگی', 'Full Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('سن', 'Age')}
                  </label>
                  <input
                    type="number"
                    min="7"
                    max="99"
                    dir="ltr"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('شماره تماس', 'Phone Number')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('پست الکترونیک', 'Email')}
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('لینک تصویر پروفایل (اختیاری)', 'Avatar Image URL (Optional)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('یا بارگذاری تصویر کوچک (< ۱۵۰KB)', 'Or upload image (< 150KB)')}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleAvatarFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-slate-600 dark:text-slate-300 file:me-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                  />
                </div>
              </div>

              {user.role !== 'admin' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('علت درخواست تغییر (اختیاری)', 'Reason for Change (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={tr('مثلاً اصلاح املای نام یا به‌روزرسانی شماره تماس', 'e.g. Correcting spelling or updating phone')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving
                    ? tr('در حال ثبت...', 'Submitting...')
                    : user.role === 'admin'
                    ? tr('ذخیره تغییرات', 'Save Profile')
                    : tr('ارسال درخواست تغییر برای تأیید مدیر', 'Submit Request for Admin Review')}
                </button>
              </div>
            </form>
          </div>

          {/* Direct Password Change */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
              {tr('تغییر رمز عبور حساب', 'Account Password')}
            </h3>
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {tr('رمز عبور فعلی', 'Current Password')}
                  </label>
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {tr('رمز عبور جدید (حداقل ۶ کاراکتر)', 'New Password (min 6 chars)')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono text-left"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPass || !newPassword}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingPass ? tr('در حال تغییر...', 'Updating...') : tr('به‌روزرسانی رمز عبور', 'Update Password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Request History Table for Student & Teacher */}
      {user.role !== 'admin' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            {tr('سابقه درخواست‌های تغییر پروفایل شما', 'Your Profile Change Request History')}
          </h3>
          {loadingReqs ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">{tr('در حال دریافت...', 'Loading...')}</p>
          ) : myRequests.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
              {tr('هنوز درخواست تغییر پروفایلی ثبت نکرده‌اید.', 'You have not submitted any profile change requests yet.')}
            </p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((reqItem) => {
                const statusBadge =
                  reqItem.status === 'approved'
                    ? { icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-400', label: tr('تأیید شده', 'Approved') }
                    : reqItem.status === 'rejected'
                    ? { icon: XCircle, cls: 'text-red-700 dark:text-red-400', label: tr('رد شده', 'Rejected') }
                    : { icon: Clock, cls: 'text-amber-700 dark:text-amber-400', label: tr('در انتظار بررسی مدیر', 'Pending Admin Review') };
                const StatusIcon = statusBadge.icon;

                return (
                  <div
                    key={reqItem.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/30 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 font-bold ${statusBadge.cls}`}>
                        <StatusIcon className="w-4 h-4" />
                        <span>{statusBadge.label}</span>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {fmtDateTime(reqItem.createdAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(reqItem.requestedValues).map(([key, newVal]) => {
                        const oldVal = reqItem.currentValues[key as keyof ProfileChangeFields];
                        const fieldLabel =
                          key === 'fullName'
                            ? tr('نام کامل', 'Full Name')
                            : key === 'age'
                            ? tr('سن', 'Age')
                            : key === 'phone'
                            ? tr('تلفن', 'Phone')
                            : key === 'email'
                            ? tr('ایمیل', 'Email')
                            : tr('تصویر پروفایل', 'Avatar');
                        const displayOld =
                          key === 'avatarUrl' ? (oldVal ? tr('تصویر قبلی', 'Previous image') : '—') : String(oldVal ?? '—');
                        const displayNew =
                          key === 'avatarUrl' ? tr('تصویر جدید', 'New image') : String(newVal ?? '—');
                        return (
                          <div
                            key={key}
                            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          >
                            <span className="text-slate-500 dark:text-slate-400 font-medium">{fieldLabel}: </span>
                            <span className="line-through text-slate-400 me-1.5">{displayOld}</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{displayNew}</span>
                          </div>
                        );
                      })}
                    </div>
                    {reqItem.reason && (
                      <p className="text-slate-600 dark:text-slate-300">
                        {tr('علت:', 'Reason:')} {reqItem.reason}
                      </p>
                    )}
                    {reqItem.rejectionReason && (
                      <p className="text-red-700 dark:text-red-400 font-medium">
                        {tr('دلیل رد توسط مدیر:', 'Rejection reason:')} {reqItem.rejectionReason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
