import { Calendar, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { Assignment, CalendarEvent, OnlineExam, SchoolClass, UserAccount } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export function AcademicCalendarView({
  user,
  events,
  assignments,
  exams,
  classes,
  onReload,
}: {
  user: UserAccount;
  events: CalendarEvent[];
  assignments: Assignment[];
  exams: OnlineExam[];
  classes: SchoolClass[];
  onReload: () => Promise<void>;
}) {
  const { tr, fmtDate } = useI18n();
  const { showToast } = useToast();
  const [filterType, setFilterType] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('1404/10/05');
  const [time, setTime] = useState('09:00');
  const [type, setType] = useState<CalendarEvent['type']>('ceremony');
  const [classId, setClassId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const canAdd = user.role === 'admin' || user.role === 'teacher';

  const typeLabels: Record<CalendarEvent['type'], string> = {
    exam: tr('امتحان و آزمون', 'Exam'),
    deadline: tr('مهلت تکلیف', 'Assignment Deadline'),
    holiday: tr('تعطیلی رسمی', 'Holiday'),
    ceremony: tr('رویداد مدرسه', 'School Event'),
    meeting: tr('جلسه آموزشی', 'Academic Meeting'),
  };

  const mergedItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      date: string;
      time?: string;
      type: CalendarEvent['type'];
      description?: string;
      deletable: boolean;
    }> = events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      type: e.type,
      description: e.description,
      deletable: user.role === 'admin' || e.createdBy === user.id,
    }));

    for (const asg of assignments) {
      items.push({
        id: `asg_${asg.id}`,
        title: `${tr('مهلت تحویل:', 'Deadline:')} ${asg.title}`,
        date: asg.dueDate,
        type: 'deadline',
        description: asg.description,
        deletable: false,
      });
    }

    for (const ex of exams) {
      items.push({
        id: `exm_${ex.id}`,
        title: `${tr('آزمون آنلاین:', 'Online Exam:')} ${ex.title}`,
        date: ex.dueDate,
        type: 'exam',
        description: ex.description,
        deletable: false,
      });
    }

    return items
      .filter((it) => filterType === 'all' || it.type === filterType)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, assignments, exams, filterType, user.id, user.role, tr]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          date: date.trim(),
          time: time.trim() || undefined,
          type,
          classId: classId || undefined,
          description: description.trim() || undefined,
        }),
      });
      setModalOpen(false);
      setTitle('');
      setDescription('');
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت رویداد', 'Failed to add event'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/calendar-events/${id}`, { method: 'DELETE' });
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف رویداد', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(['all', 'exam', 'deadline', 'ceremony', 'meeting', 'holiday'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterType(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                filterType === k
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {k === 'all' ? tr('همه رویدادها', 'All Events') : typeLabels[k]}
            </button>
          ))}
        </div>

        {canAdd && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('افزودن رویداد', 'Add Event')}</span>
          </button>
        )}
      </div>

      {mergedItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {tr('رویدادی در تقویم آموزشی ثبت نشده است', 'No calendar events scheduled')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {tr('تاریخ امتحانات، مهلت تکالیف و مناسبت‌های مدرسه در این بخش نمایش داده می‌شوند.', 'Exam dates, assignment deadlines, and school events appear here.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mergedItems.map((it) => (
            <div
              key={it.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#0F274A] dark:text-sky-400">
                  {typeLabels[it.type]} · <span className="tabular-nums">{fmtDate(it.date)}</span>
                  {it.time ? ` · ${it.time}` : ''}
                </p>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">{it.title}</h3>
                {it.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">{it.description}</p>
                )}
              </div>
              {it.deletable && (
                <button
                  type="button"
                  onClick={() => void handleDelete(it.id)}
                  aria-label={tr('حذف رویداد', 'Delete event')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={tr('ثبت رویداد جدید در تقویم مدرسه', 'Add Calendar Event')}
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">{tr('عنوان رویداد', 'Event Title')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">{tr('تاریخ', 'Date')}</label>
              <input
                type="text"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{tr('ساعت', 'Time')}</label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{tr('نوع', 'Type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEvent['type'])}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                {Object.entries(typeLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">{tr('کلاس هدف (اختیاری)', 'Target Class (optional)')}</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="">{tr('همه کلاس‌های مدرسه', 'All Classes')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">{tr('توضیحات', 'Description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? tr('در حال ذخیره...', 'Saving...') : tr('ثبت رویداد', 'Save Event')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
