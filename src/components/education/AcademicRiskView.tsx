import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Eye,
  Info,
  MessageSquarePlus,
  Search,
  TrendingDown,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RiskCategory, StudentRiskAssessment } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { CircularSpinner } from '../ui/StatCard';
import { useToast } from '../ui/Toast';

export function AcademicRiskView() {
  const { tr, fmtNum, fmtDigits, fmtDateTime } = useI18n();
  const { showToast } = useToast();

  const [assessments, setAssessments] = useState<StudentRiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskLoaded, setRiskLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const [activeNoteStudentId, setActiveNoteStudentId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadRisk = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ assessments: StudentRiskAssessment[] }>('/api/academic-risk');
      setAssessments(res.assessments ?? []);
      setRiskLoaded(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت تحلیل افت تحصیلی', 'Failed to load risk report'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr]);

  useEffect(() => {
    void loadRisk();
  }, [loadRisk]);

  const counts = useMemo(() => {
    const map: Record<RiskCategory | 'all', number> = {
      all: assessments.length,
      attention_center: 0,
      teacher_review: 0,
      stable: 0,
      exemplary: 0,
    };
    for (const a of assessments) {
      map[a.category] = (map[a.category] || 0) + 1;
    }
    return map;
  }, [assessments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessments.filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (q && !a.studentName.toLowerCase().includes(q) && !a.className.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assessments, categoryFilter, search]);

  const handleAddNote = async (e: FormEvent, studentId: string) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await apiRequest('/api/academic-risk/notes', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          note: noteText.trim(),
          actionTaken: actionTaken.trim() || undefined,
        }),
      });
      setNoteText('');
      setActionTaken('');
      setActiveNoteStudentId(null);
      await loadRisk();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت یادداشت', 'Failed to save note'), 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const categoryMeta = (cat: RiskCategory) => {
    if (cat === 'attention_center') {
      return {
        icon: AlertTriangle,
        colorCls: 'text-red-700 dark:text-red-400',
        borderCls: 'border-red-200 dark:border-red-900/70',
      };
    }
    if (cat === 'teacher_review') {
      return {
        icon: Eye,
        colorCls: 'text-amber-700 dark:text-amber-400',
        borderCls: 'border-amber-200 dark:border-amber-900/70',
      };
    }
    if (cat === 'exemplary') {
      return {
        icon: Award,
        colorCls: 'text-emerald-700 dark:text-emerald-400',
        borderCls: 'border-emerald-200 dark:border-emerald-900/70',
      };
    }
    return {
      icon: CheckCircle2,
      colorCls: 'text-sky-700 dark:text-sky-400',
      borderCls: 'border-slate-200 dark:border-slate-800',
    };
  };

  return (
    <div className="space-y-5">
      {/* Header & Advisory Disclaimer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-[#0F274A] dark:text-sky-400" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {tr('سامانه پایش و پیش‌بینی افت تحصیلی', 'Academic Risk & Early Attention Radar')}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {tr(
                'تشخیص روند نزولی نمرات متوالی، غیبت‌های مکرر، افت تحویل تکالیف و عملکرد آزمون‌های آنلاین برای مداخله آموزشی به‌موقع.',
                'Detects declining score trends, subject absences, homework drops, and exam results to support timely intervention.'
              )}
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('جستجوی دانش‌آموز یا کلاس...', 'Search student or class...')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 ps-9 pe-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/20 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-5">
            {tr(
              'یادآوری حرفه‌ای: این فقط نمونه نمایشی تحلیل داده‌هاست؛ تصمیم‌گیری آموزشی درباره دانش‌آموز نباید صرفاً بر اساس یک شاخص الگوریتمی انجام شود و شواهد باید توسط دبیر، مشاور و مدیریت بررسی گردد.',
              'Advisory Notice: This analytical summary is supportive evidence only; academic decisions must never rely solely on a single automated metric and require teacher & counselor review.'
            )}
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'all', label: tr('همه دانش‌آموزان', 'All Students') },
              { id: 'attention_center', label: tr('مرکز توجه آموزشی', 'Attention Center') },
              { id: 'teacher_review', label: tr('نیازمند بررسی معلم', 'Teacher Review') },
              { id: 'stable', label: tr('وضعیت پایدار', 'Stable') },
              { id: 'exemplary', label: tr('دانش‌آموز نمونه', 'Exemplary') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                categoryFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-[#0F274A] dark:text-sky-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <span>{tab.label} (</span>
                {loading || !riskLoaded ? <CircularSpinner size="xs" /> : <span>{fmtDigits(counts[tab.id] ?? 0)}</span>}
                <span>)</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading || !riskLoaded ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <CircularSpinner size="md" />
          <span>{tr('در حال تحلیل پرونده‌های تحصیلی...', 'Analyzing academic risk factors...')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500">
          {tr('دانش‌آموزی مطابق با فیلتر انتخابی یافت نشد.', 'No students match the selected filter.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const meta = categoryMeta(item.category);
            const Icon = meta.icon;
            const isAddingNote = activeNoteStudentId === item.studentId;

            return (
              <div
                key={item.studentId}
                className={`bg-white dark:bg-slate-900 border ${meta.borderCls} rounded-xl p-5 flex flex-col justify-between gap-4`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.className} · {tr('پایه', 'Grade')} {item.gradeLevel}
                      </p>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                        {item.studentName}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${meta.colorCls}`}>
                      <Icon className="w-4 h-4" />
                      <span>{tr(item.categoryLabelFa, item.categoryLabelEn)}</span>
                    </span>
                  </div>

                  {/* Multi-factor KPI Row */}
                  <div className="grid grid-cols-4 gap-2 text-xs tabular-nums">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('میانگین', 'GPA')}</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {item.gradesCount > 0 ? fmtNum(item.averageScore) : '—'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('غیبت / تأخیر', 'Abs / Late')}</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {fmtDigits(item.absencesCount)} / {fmtDigits(item.latesCount)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('تحویل تکلیف', 'Homework')}</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {fmtDigits(item.assignmentSubmissionRate)}{tr('٪', '%')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tr('آزمون آنلاین', 'Exams')}</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {item.examAveragePercent !== null ? `${fmtDigits(item.examAveragePercent)}${tr('٪', '%')}` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Evidence bullets */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {tr('شواهد مشاهده‌شده در داده‌ها:', 'Observed Evidence:')}
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                      {item.evidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-xs text-[#0F274A] dark:text-sky-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-lg p-2.5 leading-5">
                    <span className="font-bold">{tr('پیشنهاد پیگیری:', 'Suggested Action:')} </span>
                    {item.suggestedAction}
                  </p>

                  {/* Teacher / Admin Review Notes */}
                  {item.reviewNotes.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {tr('یادداشت‌های بررسی دبیران و مدیریت:', 'Review Notes:')}
                      </p>
                      {item.reviewNotes.map((rn) => (
                        <div key={rn.id} className="text-xs bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2.5 space-y-0.5">
                          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold">{rn.authorName}</span>
                            <span className="tabular-nums">{fmtDateTime(rn.createdAt)}</span>
                          </div>
                          <p className="text-slate-800 dark:text-slate-200">{rn.note}</p>
                          {rn.actionTaken && (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              {tr('اقدام:', 'Action:')} {rn.actionTaken}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Note Action */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  {isAddingNote ? (
                    <form onSubmit={(e) => void handleAddNote(e, item.studentId)} className="space-y-2">
                      <input
                        type="text"
                        required
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder={tr('تحلیل و یادداشت دبیر/مشاور...', 'Teacher / counselor observation...')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={actionTaken}
                        onChange={(e) => setActionTaken(e.target.value)}
                        placeholder={tr('اقدام انجام‌شده (مثلاً تماس با والدین / جلسه رفع اشکال)', 'Action taken (optional)')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveNoteStudentId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          {tr('انصراف', 'Cancel')}
                        </button>
                        <button
                          type="submit"
                          disabled={savingNote}
                          className="px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {savingNote ? tr('در حال ثبت...', 'Saving...') : tr('ثبت یادداشت', 'Save Note')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveNoteStudentId(item.studentId)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>{tr('ثبت یادداشت و اقدام پیگیری', 'Add Review Note')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
