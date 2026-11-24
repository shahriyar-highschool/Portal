import {
  BookOpenCheck,
  CheckSquare,
  Clock,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { StudyPlanTask, Subject, UserAccount } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface GeneratedSmartTask {
  title: string;
  targetDate: string;
  durationMinutes: number;
  notes?: string;
  category?: StudyPlanTask['category'];
  subjectId?: string;
}

export function StudyPlannerView({
  user,
  plans,
  subjects,
  onReload,
}: {
  user?: UserAccount;
  plans: StudyPlanTask[];
  subjects: Subject[];
  onReload: () => Promise<void>;
}) {
  const { tr, fmtDigits, fmtNum, fmtDate } = useI18n();
  const { showToast } = useToast();

  const isExecutive = user ? user.role === 'admin' : false;

  // Quick goal / manual add state
  const [quickGoal, setQuickGoal] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [targetDate, setTargetDate] = useState(() => new Date().toLocaleDateString('fa-IR'));
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Smart AI Planner modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [focusGoal, setFocusGoal] = useState('');
  const [daysCount, setDaysCount] = useState('5');
  const [dailyMinutes, setDailyMinutes] = useState('90');
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedSmartTask[]>([]);
  const [savingAllAi, setSavingAllAi] = useState(false);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  const completedCount = plans.filter((p) => p.completed).length;
  const totalMinutes = plans.reduce((s, p) => s + p.durationMinutes, 0);
  const completedMinutes = plans.filter((p) => p.completed).reduce((s, p) => s + p.durationMinutes, 0);
  const adherencePct = plans.length > 0 ? Math.round((completedCount / plans.length) * 100) : 0;

  const categoryLabel = (cat?: StudyPlanTask['category']) => {
    if (cat === 'remedial') return tr('جبرانی', 'Remedial');
    if (cat === 'administrative') return tr('اجرایی / مدیریتی', 'Executive');
    return tr('مطالعه', 'Study');
  };

  const handleQuickAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickGoal.trim() || saving) return;
    setSaving(true);
    try {
      await apiRequest('/api/study-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: quickGoal.trim(),
          targetDate: new Date().toLocaleDateString('fa-IR'),
          durationMinutes: 45,
          category: isExecutive ? 'administrative' : 'study',
        }),
      });
      setQuickGoal('');
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره برنامه', 'Failed to save task'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiRequest('/api/study-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          subjectId: subjectId || undefined,
          targetDate: targetDate.trim(),
          durationMinutes: Number(durationMinutes) || 45,
          notes: notes.trim() || undefined,
          category: isExecutive ? 'administrative' : 'study',
        }),
      });
      setTitle('');
      setNotes('');
      setAddModalOpen(false);
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره برنامه', 'Failed to save task'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSmartPlan = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiRequest<{ summary: string; tasks: GeneratedSmartTask[] }>('/api/smart-planner/generate', {
        method: 'POST',
        body: JSON.stringify({
          focusGoal: focusGoal.trim() || undefined,
          daysCount: Number(daysCount) || 5,
          dailyMinutes: Number(dailyMinutes) || 90,
        }),
      });
      setAiSummary(res.summary ?? '');
      setGeneratedTasks(res.tasks ?? []);
      showToast(tr('برنامه هوشمند با هوش مصنوعی پیشنهاد شد.', 'Smart plan generated.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تولید برنامه هوشمند', 'Failed to generate plan'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAllGenerated = async () => {
    if (generatedTasks.length === 0) return;
    setSavingAllAi(true);
    try {
      for (const task of generatedTasks) {
        await apiRequest('/api/study-plans', {
          method: 'POST',
          body: JSON.stringify({
            title: task.title,
            subjectId: task.subjectId,
            targetDate: task.targetDate,
            durationMinutes: task.durationMinutes || 45,
            notes: task.notes,
            category: task.category || (isExecutive ? 'administrative' : 'study'),
            aiGenerated: true,
          }),
        });
      }
      setGeneratedTasks([]);
      setAiSummary('');
      setAiModalOpen(false);
      await onReload();
      showToast(tr('تمام گام‌های برنامه هوشمند در تقویم مطالعه شما ذخیره شدند.', 'All generated tasks saved to your planner.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره گام‌های برنامه', 'Failed to save tasks'), 'error');
    } finally {
      setSavingAllAi(false);
    }
  };

  const toggleComplete = async (plan: StudyPlanTask) => {
    try {
      await apiRequest(`/api/study-plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !plan.completed }),
      });
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در به‌روزرسانی', 'Update failed'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/study-plans/${id}`, { method: 'DELETE' });
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف مورد', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[520px]">
      {/* Compact Header with Goal Progress & Small Icon Actions */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpenCheck className="w-4.5 h-4.5 text-[#0F274A] dark:text-sky-400 shrink-0" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
              {tr('فهرست برنامه‌ها و اهداف', 'Goals & Study Plan')}
            </h2>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              {fmtDigits(completedCount)}/{fmtDigits(plans.length)} · {fmtNum(adherencePct, 0)}٪
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (quickGoal.trim() && !title) setTitle(quickGoal.trim());
                setAddModalOpen(true);
              }}
              title={isExecutive ? tr('افزودن اقدام جدید', 'Add Task') : tr('افزودن هدف و برنامه جدید', 'Add Study Goal')}
              aria-label={tr('افزودن هدف جدید', 'Add Goal')}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (quickGoal.trim() && !focusGoal) setFocusGoal(quickGoal.trim());
                setAiModalOpen(true);
              }}
              title={tr('تولید برنامه با هوش مصنوعی', 'Generate Smart Plan with AI')}
              aria-label={tr('تولید برنامه با هوش مصنوعی', 'Generate Smart Plan with AI')}
              className="w-8 h-8 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white hover:bg-[#163663] dark:hover:bg-sky-500 flex items-center justify-center transition-colors"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Thin Goal Progress Line */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-[#0F274A] dark:bg-sky-500 transition-all duration-300"
              style={{ width: `${adherencePct}%` }}
            />
          </div>
          {totalMinutes > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
              {fmtDigits(completedMinutes)}/{fmtDigits(totalMinutes)} {tr('دقیقه', 'min')}
            </span>
          )}
        </div>
      </div>

      {/* Tasks & Goals List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {plans.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-14 text-center">
            <BookOpenCheck className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {tr('هنوز هدف یا برنامه‌ای ثبت نشده است', 'No goals or planner tasks yet')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {tr('هدف خود را در کادر پایین بنویسید یا از آیکون‌های بالا اضافه کنید.', 'Type a goal below or use the add icons above.')}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                  p.completed
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                    : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void toggleComplete(p)}
                  className="flex items-start gap-3 flex-1 min-w-0 text-start"
                >
                  {p.completed ? (
                    <CheckSquare className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-bold ${
                          p.completed ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {p.title}
                      </p>
                      {p.aiGenerated && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[10px] font-semibold">
                          {tr('هوش مصنوعی', 'AI')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2 tabular-nums">
                      <span>{categoryLabel(p.category)}</span>
                      <span>·</span>
                      <span>{p.subjectId ? subjectMap.get(p.subjectId) ?? tr('درس', 'Subject') : tr('عمومی', 'General')}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDigits(p.durationMinutes)} {tr('دقیقه', 'min')}
                      </span>
                      <span>·</span>
                      <span>{fmtDate(p.targetDate)}</span>
                    </p>
                    {p.notes && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{p.notes}</p>}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(p.id)}
                  aria-label={tr('حذف', 'Delete')}
                  title={tr('حذف', 'Delete')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compact Bottom Quick-Goal Bar */}
      <form
        onSubmit={handleQuickAdd}
        className="p-3 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80"
      >
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5">
          <input
            type="text"
            value={quickGoal}
            onChange={(e) => setQuickGoal(e.target.value)}
            placeholder={
              isExecutive
                ? tr('افزودن سریع هدف یا اقدام مدیریتی...', 'Quick add goal or action...')
                : tr('هدف یا برنامه جدید خود را بنویسید...', 'Type a study goal or task...')
            }
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none py-1"
          />
          <button
            type="button"
            onClick={() => {
              if (quickGoal.trim()) setFocusGoal(quickGoal.trim());
              setAiModalOpen(true);
            }}
            title={tr('تولید برنامه هوشمند برای این هدف', 'Generate AI plan for this goal')}
            aria-label={tr('تولید برنامه هوشمند', 'Generate AI plan')}
            className="w-8 h-8 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-[#0F274A] dark:hover:text-sky-300 flex items-center justify-center transition-colors shrink-0"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={saving || !quickGoal.trim()}
            title={tr('افزودن به فهرست', 'Add to list')}
            aria-label={tr('افزودن به فهرست', 'Add to list')}
            className="w-8 h-8 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {/* Detailed Add Goal / Task Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={isExecutive ? tr('افزودن اقدام یا هدف مدیریتی', 'Add Management Goal') : tr('افزودن هدف و برنامه مطالعه', 'Add Study Goal')}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleAdd} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">
              {isExecutive ? tr('عنوان هدف یا اقدام', 'Goal / Action Title') : tr('عنوان هدف یا مبحث مطالعه', 'Study Goal / Topic')}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isExecutive
                  ? tr('مثلاً جلسه هماهنگی دبیران ریاضی و فیزیک', 'e.g. Math & Physics faculty alignment meeting')
                  : tr('مثلاً حل تمرین‌های فصل سوم ریاضی', 'e.g. Solve Chapter 3 Calculus exercises')
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('درس مرتبط', 'Subject')}</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">{tr('عمومی / آزاد', 'General')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('مدت زمان (دقیقه)', 'Duration (min)')}</label>
              <input
                type="number"
                min={10}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('تاریخ هدف', 'Target Date')}</label>
            <input
              type="text"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('یادداشت (اختیاری)', 'Notes (optional)')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? tr('در حال ذخیره...', 'Saving...') : tr('افزودن به فهرست', 'Add to List')}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* AI Smart Planner Modal */}
      <Modal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={isExecutive ? tr('تولید برنامه هوشمند مدیریتی', 'Smart Leadership Planner') : tr('تولید برنامه هوشمند با هوش مصنوعی', 'AI Smart Study Planner')}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <form onSubmit={handleGenerateSmartPlan} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold mb-1">
                {isExecutive
                  ? tr('هدف برنامه‌ریزی مدیریتی (اختیاری)', 'Management Goal (optional)')
                  : tr('هدف یا دروس اولویت‌دار (اختیاری)', 'Study Goal / Focus (optional)')}
              </label>
              <input
                type="text"
                value={focusGoal}
                onChange={(e) => setFocusGoal(e.target.value)}
                placeholder={
                  isExecutive
                    ? tr('مثلاً پیگیری افت تحصیلی پایه هفتم', 'e.g. Grade 7 intervention follow-up')
                    : tr('مثلاً آمادگی امتحان ریاضی و فیزیک', 'e.g. Calculus & Physics exam prep')
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">{tr('تعداد روز', 'Days')}</label>
              <input
                type="number"
                min={2}
                max={14}
                value={daysCount}
                onChange={(e) => setDaysCount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">{tr('دقیقه/روز', 'Min/Day')}</label>
              <input
                type="number"
                min={30}
                max={360}
                step={15}
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={generating}
                className="w-full py-2 px-3 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{generating ? tr('ساخت...', 'Building...') : tr('تولید', 'Generate')}</span>
              </button>
            </div>
          </form>

          {generatedTasks.length > 0 && (
            <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{aiSummary || tr('پیشنهاد برنامه هوشمند:', 'Suggested Plan:')}</p>
                <button
                  type="button"
                  disabled={savingAllAi}
                  onClick={() => void handleSaveAllGenerated()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
                >
                  {savingAllAi ? tr('در حال ذخیره...', 'Saving...') : tr('افزودن همه به فهرست', 'Add All to List')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto">
                {generatedTasks.map((gt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{gt.title}</span>
                      <span className="text-[11px] font-semibold text-[#0F274A] dark:text-sky-400 tabular-nums shrink-0">
                        {fmtDigits(gt.durationMinutes)} {tr('دقیقه', 'min')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {categoryLabel(gt.category)} · {fmtDate(gt.targetDate)}
                    </p>
                    {gt.notes && <p className="text-slate-600 dark:text-slate-300 leading-5">{gt.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

