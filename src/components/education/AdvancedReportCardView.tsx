import {
  Award,
  BookOpen,
  Medal,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  type AdvancedReportCard,
  type GradeTerm,
  type SchoolClass,
  type SchoolSettings,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { ReportCardComparisonChart } from '../ui/Charts';
import { useToast } from '../ui/Toast';

const ALL_CLASS_MODE = '__all_class__';

export function AdvancedReportCardView({
  user,
  settings,
  classes = [],
  students = [],
  initialClassId,
  initialStudentId,
}: {
  user: UserAccount;
  settings: SchoolSettings | null;
  classes?: SchoolClass[];
  students?: UserAccount[];
  initialClassId?: string;
  initialStudentId?: string;
}) {
  const { tr, fmtNum, fmtDigits, termLabel, schoolTitle } = useI18n();
  const { showToast } = useToast();

  const isStaff = user.role === 'admin' || user.role === 'teacher';

  const defaultClassId = useMemo(() => {
    if (!isStaff) return user.classId || '';
    if (initialStudentId) {
      const stu = students.find((s) => s.id === initialStudentId);
      if (stu?.classId && classes.some((c) => c.id === stu.classId)) {
        return stu.classId;
      }
    }
    if (initialClassId && classes.some((c) => c.id === initialClassId)) return initialClassId;
    const firstWithStudent = classes.find((c) => students.some((s) => s.classId === c.id));
    return firstWithStudent?.id ?? classes[0]?.id ?? '';
  }, [classes, initialClassId, initialStudentId, isStaff, students, user.classId]);

  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudentId || (!isStaff ? user.id : '')
  );
  const [termFilter, setTermFilter] = useState<'all' | GradeTerm>('all');

  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<AdvancedReportCard[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const pendingBatchPrintRef = useRef(false);
  const classCardsCacheRef = useRef<Map<string, AdvancedReportCard[]>>(new Map());

  // Sync default class when classes load
  useEffect(() => {
    if (isStaff && !selectedClassId && defaultClassId) {
      setSelectedClassId(defaultClassId);
    }
  }, [defaultClassId, isStaff, selectedClassId]);

  const classStudents = useMemo(() => {
    if (!isStaff) return [];
    const list = selectedClassId
      ? students.filter((s) => s.classId === selectedClassId)
      : students;
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'));
  }, [isStaff, selectedClassId, students]);

  // Ensure selectedStudentId belongs to selectedClassId when class changes
  useEffect(() => {
    if (!isStaff) return;
    if (selectedStudentId === ALL_CLASS_MODE) return;
    if (classStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!selectedStudentId || !classStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [classStudents, isStaff, selectedStudentId]);

  // Background preload class batch cards so "Print Entire Class" executes synchronously inside the user gesture
  useEffect(() => {
    if (!isStaff || !selectedClassId || classStudents.length === 0) return;
    const cacheKey = `${selectedClassId}::${termFilter}`;
    if (classCardsCacheRef.current.has(cacheKey)) return;
    let cancelled = false;
    apiRequest<{ reportCards: AdvancedReportCard[] }>(
      `/api/reports/class-cards?classId=${encodeURIComponent(selectedClassId)}&term=${encodeURIComponent(termFilter)}`,
      { silentError: true }
    )
      .then((res) => {
        if (!cancelled && Array.isArray(res.reportCards)) {
          classCardsCacheRef.current.set(cacheKey, res.reportCards);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [classStudents.length, isStaff, selectedClassId, termFilter]);

  const loadReportCards = useCallback(async () => {
    setErrorMsg('');
    if (isStaff && selectedStudentId === ALL_CLASS_MODE) {
      if (!selectedClassId) {
        setCards([]);
        pendingBatchPrintRef.current = false;
        return;
      }
      const cacheKey = `${selectedClassId}::${termFilter}`;
      setLoading(true);
      try {
        const res = await apiRequest<{ reportCards: AdvancedReportCard[] }>(
          `/api/reports/class-cards?classId=${encodeURIComponent(selectedClassId)}&term=${encodeURIComponent(termFilter)}`
        );
        const list = res.reportCards ?? [];
        classCardsCacheRef.current.set(cacheKey, list);
        setCards(list);
      } catch (err) {
        pendingBatchPrintRef.current = false;
        const msg = err instanceof Error ? err.message : tr('خطا در دریافت کارنامه‌های کلاس', 'Failed to load class report cards');
        setErrorMsg(msg);
        setCards([]);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isStaff && !selectedStudentId && !selectedClassId) {
      setCards([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('term', termFilter);
      if (isStaff) {
        if (selectedStudentId) params.set('studentId', selectedStudentId);
        if (selectedClassId) params.set('classId', selectedClassId);
      }
      const res = await apiRequest<{ reportCard: AdvancedReportCard }>(
        `/api/reports/card?${params.toString()}`
      );
      setCards(res.reportCard ? [res.reportCard] : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr('خطا در بارگذاری کارنامه پیشرفته', 'Failed to load report card');
      setErrorMsg(msg);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [isStaff, selectedClassId, selectedStudentId, showToast, termFilter, tr]);

  useEffect(() => {
    void loadReportCards();
  }, [loadReportCards]);

  useEffect(() => {
    if (!loading && pendingBatchPrintRef.current && selectedStudentId === ALL_CLASS_MODE && cards.length > 0) {
      pendingBatchPrintRef.current = false;
      const timer = window.setTimeout(() => {
        window.print();
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [cards.length, loading, selectedStudentId]);

  const handlePrint = () => {
    window.print();
  };

  const handlePrintEntireClass = () => {
    if (!isStaff || !selectedClassId || classStudents.length === 0) return;
    if (selectedStudentId === ALL_CLASS_MODE && !loading && cards.length > 0) {
      window.print();
      return;
    }
    const cacheKey = `${selectedClassId}::${termFilter}`;
    const cached = classCardsCacheRef.current.get(cacheKey);
    if (cached && cached.length > 0) {
      flushSync(() => {
        pendingBatchPrintRef.current = false;
        setErrorMsg('');
        setLoading(false);
        setSelectedStudentId(ALL_CLASS_MODE);
        setCards(cached);
      });
      window.print();
      return;
    }
    pendingBatchPrintRef.current = true;
    setSelectedStudentId(ALL_CLASS_MODE);
  };

  const todayFormatted = useMemo(() => new Date().toLocaleDateString('fa-IR'), []);

  return (
    <div className="space-y-6">
      {/* Control Toolbar (Hidden on Print) */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-[#0F274A] dark:text-sky-400" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {tr('ایجاد و چاپ کارنامه پیشرفته کلاسی', 'Advanced Printable Report Card')}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tr(
                'نمایش تمام دروس کلاس همراه با میانگین کلاس، میانگین و رتبه دانش‌آموز در هر درس، معدل کل، بیشترین/کمترین معدل و رتبه کلی در کلاس',
                'Full subject breakdown with class average, student rank per subject, overall GPA, highest/lowest class GPA and overall class rank'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isStaff && (
              <>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    if (selectedStudentId !== ALL_CLASS_MODE) {
                      setSelectedStudentId('');
                    }
                  }}
                  aria-label={tr('انتخاب کلاس', 'Select class')}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 min-w-[150px]"
                >
                  {classes.length === 0 ? (
                    <option value="">{tr('کلاسی یافت نشد', 'No classes')}</option>
                  ) : (
                    classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.gradeLevel})
                      </option>
                    ))
                  )}
                </select>

                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  aria-label={tr('انتخاب دانش‌آموز', 'Select student')}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 min-w-[185px]"
                >
                  {classStudents.length === 0 ? (
                    <option value="">{tr('دانش‌آموزی در این کلاس نیست', 'No students in class')}</option>
                  ) : (
                    <>
                      <option value={ALL_CLASS_MODE}>
                        {tr('همه دانش‌آموزان کلاس (چاپ گروهی)', 'All Class Students (Batch Print)')}
                      </option>
                      {classStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </>
            )}

            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value as 'all' | GradeTerm)}
              aria-label={tr('انتخاب نوبت', 'Select term')}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{tr('همه نوبت‌ها (سالانه)', 'All Terms (Annual)')}</option>
              <option value="مستمر اول">{termLabel('مستمر اول')}</option>
              <option value="نوبت اول">{termLabel('نوبت اول')}</option>
              <option value="مستمر دوم">{termLabel('مستمر دوم')}</option>
              <option value="نوبت دوم">{termLabel('نوبت دوم')}</option>
            </select>

            <button
              type="button"
              onClick={() => void loadReportCards()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{tr('بروزرسانی', 'Refresh')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || cards.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-bold hover:bg-[#163663] dark:hover:bg-sky-500 shadow-sm disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>
                {cards.length > 1
                  ? `${tr('چاپ کارنامه‌ها', 'Print Report Cards')} (${fmtDigits(cards.length)})`
                  : tr('چاپ کارنامه', 'Print Report Card')}
              </span>
            </button>

            {isStaff && (
              <button
                type="button"
                onClick={handlePrintEntireClass}
                disabled={loading || !selectedClassId || classStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#0F274A]/30 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-950/50 text-[#0F274A] dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 disabled:opacity-50"
              >
                <Users className="w-4 h-4" />
                <span>
                  {tr('چاپ یکجای کارنامه کل کلاس', 'Print Entire Class')}
                  {classStudents.length > 0 ? ` (${fmtDigits(classStudents.length)})` : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        {isStaff && selectedStudentId === ALL_CLASS_MODE && !loading && cards.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-900 dark:text-sky-200 bg-sky-50/70 dark:bg-sky-950/30 px-3.5 py-2.5 rounded-xl border border-sky-200/80 dark:border-sky-800/70">
            <span className="font-semibold">
              {tr(
                `حالت چاپ یکجا فعال است: ${fmtDigits(cards.length)} کارنامه برای این کلاس آماده چاپ در صفحات مجزا است.`,
                `Batch print mode active: ${cards.length} student report cards ready on separate pages.`
              )}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {tr('در پنجره چاپ فقط کارنامه‌ها چاپ می‌شوند.', 'Only report cards will be printed.')}
            </span>
          </div>
        )}
      </div>

      {/* Loading / Empty / Error States */}
      {loading && (
        <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-500 dark:text-slate-400">
          {tr('در حال محاسبه نمرات، میانگین دروس و رتبه‌بندی کلاس...', 'Calculating averages, class stats and student ranks...')}
        </div>
      )}

      {!loading && errorMsg && (
        <div className="no-print bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-8 text-center text-xs text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && cards.length === 0 && (
        <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {tr('کارنامه‌ای برای نمایش یافت نشد', 'No report card available')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isStaff
              ? tr('لطفاً کلاسی را انتخاب کنید که حداقل یک دانش‌آموز عضو آن باشد.', 'Select a class that has enrolled students.')
              : tr('اطلاعات کلاس یا نمرات شما هنوز ثبت نشده است.', 'Your class enrollment or grades have not been recorded yet.')}
          </p>
        </div>
      )}

      {/* Printable Report Card Sheets */}
      {!loading &&
        cards.map((card, cardIdx) => {
          const isLastCard = cardIdx === cards.length - 1;
          const passScore = card.passingScore ?? settings?.passingScore ?? 10;

          return (
            <article
              key={card.studentId}
              className={`print-report-sheet max-w-[840px] mx-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm ${
                !isLastCard ? 'print-page-break' : ''
              }`}
            >
              {/* Compact A4 Header with Class Title */}
              <div className="print-report-header bg-[#0F274A] text-white px-4 py-2.5 print-avoid-break">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/assets/aistudio/image_1b3c1aaa.png"
                      alt={schoolTitle(card.schoolName)}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 border border-white/20 shrink-0"
                    />
                    <div>
                      <p className="text-[10px] text-sky-200 font-medium leading-tight">
                        {schoolTitle(card.schoolName)} · {tr('سال تحصیلی', 'Academic Year')} {fmtDigits(card.academicYear)}
                      </p>
                      <h1 className="text-sm sm:text-base font-black tracking-tight leading-tight mt-0.5">
                        {tr('کارنامه تحصیلی', 'Report Card')} — {card.className}
                      </h1>
                    </div>
                  </div>

                  <div className="text-end text-[11px] flex items-center gap-2.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-white/10 border border-white/15 font-bold">
                      {card.term === 'all' ? tr('کارنامه سالانه (کل نوبت‌ها)', 'Full Academic Year') : termLabel(card.term)}
                    </span>
                    <span className="text-[10px] text-sky-200 tabular-nums">
                      {tr('صدور:', 'Issued:')} {fmtDigits(todayFormatted)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compact 4-Col Student Identity Strip */}
              <div className="print-grid-4 grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-[11px] print-avoid-break">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-tight">
                    {tr('دانش‌آموز', 'Student')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs leading-tight">
                    {card.studentName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-tight">
                    {tr('کلاس و پایه', 'Class & Grade')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                    {card.className} ({card.gradeLevel})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-tight">
                    {tr('کد ملی / کاربری', 'National ID / User')}
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums leading-tight">
                    {card.nationalId ? fmtDigits(card.nationalId) : card.username}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] block leading-tight">
                    {tr('تعداد نفرات کلاس', 'Class Size')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
                    {fmtDigits(card.totalClassStudents)} {tr('نفر', 'students')}
                  </span>
                </div>
              </div>

              {/* Compact Single-Page A4 Body */}
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
                    <span>
                      {tr('ریز دروس کلاس', 'Class Subjects')} ({fmtDigits(card.subjects.length)} {tr('درس', 'subjects')})
                    </span>
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {tr('مقیاس از ۲۰ · حدنصاب قبولی:', 'Scale /20 · Passing:')}{' '}
                    <strong className="tabular-nums">{fmtNum(passScore)}</strong>
                  </span>
                </div>

                {card.subjects.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    {tr('هنوز درسی برای این کلاس ثبت یا تعریف نشده است.', 'No subjects configured for this class yet.')}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px]">
                          <th className="px-1.5 py-1.5 text-center w-8">{tr('#', '#')}</th>
                          <th className="px-2.5 py-1.5 text-start">{tr('نام درس', 'Subject')}</th>
                          <th className="px-1.5 py-1.5 text-center">{tr('ضریب', 'Coeff')}</th>
                          <th className="px-2 py-1.5 text-center">{tr('میانگین کلاس', 'Class Avg')}</th>
                          <th className="px-2 py-1.5 text-center">{tr('میانگین دانش‌آموز', 'Student Avg')}</th>
                          <th className="px-2 py-1.5 text-center">{tr('اختلاف', 'Diff')}</th>
                          <th className="px-2 py-1.5 text-center">{tr('رتبه در کلاس', 'Rank')}</th>
                          <th className="px-2 py-1.5 text-center">{tr('وضعیت', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {card.subjects.map((row, idx) => {
                          const hasStudentScore = row.studentAverage !== null;
                          const hasClassScore = row.classAverage !== null;
                          const diff =
                            hasStudentScore && hasClassScore
                              ? Number(((row.studentAverage as number) - (row.classAverage as number)).toFixed(2))
                              : null;
                          const passed = hasStudentScore && (row.studentAverage as number) >= passScore;
                          const excellent = hasStudentScore && (row.studentAverage as number) >= 18;
                          const isTopThree = row.subjectRank !== null && row.subjectRank <= 3;

                          return (
                            <tr
                              key={row.subjectId}
                              className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 leading-tight"
                            >
                              <td className="px-1.5 py-1 text-center tabular-nums text-slate-500 dark:text-slate-400">
                                {fmtDigits(idx + 1)}
                              </td>
                              <td className="px-2.5 py-1 text-start font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                {row.subjectName}
                              </td>
                              <td className="px-1.5 py-1 text-center tabular-nums text-slate-600 dark:text-slate-300">
                                {fmtDigits(row.coefficient)}
                              </td>
                              <td className="px-2 py-1 text-center tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                                {hasClassScore ? fmtNum(row.classAverage as number) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center tabular-nums">
                                {hasStudentScore ? (
                                  <span
                                    className={`font-extrabold ${
                                      passed
                                        ? 'text-[#0F274A] dark:text-sky-300'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}
                                  >
                                    {fmtNum(row.studentAverage as number)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center tabular-nums text-[10.5px]">
                                {diff === null ? (
                                  <span className="text-slate-400">—</span>
                                ) : diff > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-emerald-700 dark:text-emerald-400">
                                    <TrendingUp className="w-3 h-3" />+{fmtNum(diff)}
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-red-600 dark:text-red-400">
                                    <TrendingDown className="w-3 h-3" />
                                    {fmtNum(diff)}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-slate-500">{fmtNum(0)}</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center tabular-nums">
                                {row.subjectRank !== null ? (
                                  <span
                                    className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      isTopThree
                                        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    {row.subjectRank === 1 && <Trophy className="w-2.5 h-2.5 text-amber-600" />}
                                    <span>
                                      {fmtDigits(row.subjectRank)}/{fmtDigits(row.subjectRankedTotal)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center text-[10px]">
                                {!hasStudentScore ? (
                                  <span className="text-slate-400">{tr('ثبت‌نشده', '—')}</span>
                                ) : excellent ? (
                                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                    {tr('عالی', 'Excellent')}
                                  </span>
                                ) : passed ? (
                                  <span className="font-semibold text-sky-700 dark:text-sky-400">
                                    {tr('قبول', 'Pass')}
                                  </span>
                                ) : (
                                  <span className="font-bold text-red-700 dark:text-red-400">
                                    {tr('نیاز به تلاش', 'Needs Work')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Visual Comparison Chart */}
                <ReportCardComparisonChart items={card.subjects} passingScore={passScore} />

                {/* Compact Bottom Summary Footer: معدل کل - بیشترین معدل کلاس - پایین‌ترین معدل کلاس - رتبه کلی */}
                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 print-avoid-break">
                  <div className="print-grid-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="px-2.5 py-2 rounded-lg bg-[#0F274A]/5 dark:bg-sky-950/40 border border-[#0F274A]/20 dark:border-sky-800/70">
                      <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">{tr('معدل کل دانش‌آموز', 'Overall GPA')}</span>
                        <Award className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
                      </div>
                      <p className="text-base sm:text-lg font-black tabular-nums text-[#0F274A] dark:text-sky-300 mt-0.5 leading-tight">
                        {card.overallGpa !== null ? fmtNum(card.overallGpa) : '—'}
                        {card.overallGpa !== null && (
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 ms-1">
                            {tr('از ۲۰', '/ 20')}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="px-2.5 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/70">
                      <div className="flex items-center justify-between text-[10px] text-emerald-800 dark:text-emerald-300">
                        <span className="font-semibold">{tr('بیشترین معدل کلاس', 'Highest Class GPA')}</span>
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <p className="text-base sm:text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5 leading-tight">
                        {card.classHighestGpa !== null ? fmtNum(card.classHighestGpa) : '—'}
                        {card.classHighestGpa !== null && (
                          <span className="text-[10px] font-medium text-emerald-700/70 dark:text-emerald-400/70 ms-1">
                            {tr('از ۲۰', '/ 20')}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="px-2.5 py-2 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70">
                      <div className="flex items-center justify-between text-[10px] text-rose-800 dark:text-rose-300">
                        <span className="font-semibold">{tr('پایین‌ترین معدل کلاس', 'Lowest Class GPA')}</span>
                        <TrendingDown className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                      </div>
                      <p className="text-base sm:text-lg font-black tabular-nums text-rose-700 dark:text-rose-400 mt-0.5 leading-tight">
                        {card.classLowestGpa !== null ? fmtNum(card.classLowestGpa) : '—'}
                        {card.classLowestGpa !== null && (
                          <span className="text-[10px] font-medium text-rose-700/70 dark:text-rose-400/70 ms-1">
                            {tr('از ۲۰', '/ 20')}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="px-2.5 py-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70">
                      <div className="flex items-center justify-between text-[10px] text-amber-900 dark:text-amber-300">
                        <span className="font-semibold">{tr('رتبه کلی در کلاس', 'Overall Rank')}</span>
                        <Medal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <p className="text-base sm:text-lg font-black tabular-nums text-amber-800 dark:text-amber-300 mt-0.5 leading-tight">
                        {card.overallRank !== null ? (
                          <>
                            {fmtDigits(card.overallRank)}
                            <span className="text-[11px] font-bold text-amber-700/80 dark:text-amber-400/80 ms-1">
                              {tr('از', '/')} {fmtDigits(card.rankedStudentsCount)} {tr('نفر', '')}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Compact Attendance & Official Print Signature Footer */}
                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[10.5px] text-slate-600 dark:text-slate-300 print-avoid-break">
                  <div className="flex flex-wrap items-center gap-3 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Users className="w-3 h-3 text-slate-400" />
                      {tr('حضور و غیاب:', 'Attendance:')}
                    </span>
                    <span>
                      {tr('حاضر:', 'Present:')} <strong>{fmtDigits(card.attendanceSummary.present)}</strong>
                    </span>
                    <span>
                      {tr('غیبت:', 'Absent:')} <strong className="text-red-700 dark:text-red-400">{fmtDigits(card.attendanceSummary.absent)}</strong>
                    </span>
                    <span>
                      {tr('تأخیر:', 'Late:')} <strong className="text-amber-700 dark:text-amber-400">{fmtDigits(card.attendanceSummary.late)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {tr('امضای دبیر / مشاور', 'Advisor Signature')}
                      </p>
                      <p className="mt-2.5 border-t border-dashed border-slate-300 dark:border-slate-600 w-24" />
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {tr('مهر و امضای مدیریت', 'Principal Seal')} ({card.principalName || tr('مدیر', 'Principal')})
                      </p>
                      <p className="mt-2.5 border-t border-dashed border-slate-300 dark:border-slate-600 w-28" />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
    </div>
  );
}
