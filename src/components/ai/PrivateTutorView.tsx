import {
  Activity,
  AlertCircle,
  ArrowUp,
  BookMarked,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderPlus,
  GraduationCap,
  History,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  type LearningDiagnosisResult,
  type PracticeExerciseItem,
  type PrivateTutorCitation,
  type PrivateTutorSession,
  type RemedialPlanItem,
  type Subject,
  type TeacherSourceMaterial,
  type TeacherSourcePage,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest, streamSseRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { GRADE_LEVELS_FA } from '../../lib/persian';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

type TutorTab = 'qa' | 'diagnosis' | 'practice' | 'remedial' | 'sources';

export function PrivateTutorView({
  user,
  subjects,
  students = [],
  onSavedToPlanner,
}: {
  user: UserAccount;
  subjects: Subject[];
  students?: UserAccount[];
  onSavedToPlanner?: () => Promise<void> | void;
}) {
  const { lang, tr, fmtDigits, fmtDateTime } = useI18n();
  const { showToast } = useToast();

  const canManageSources = user.role !== 'student';
  const [subTab, setSubTab] = useState<TutorTab>('qa');

  // Sources
  const [sources, setSources] = useState<TeacherSourceMaterial[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [srcTitle, setSrcTitle] = useState('');
  const [srcSubjectId, setSrcSubjectId] = useState(subjects[0]?.id ?? '');
  const [srcGradeLevel, setSrcGradeLevel] = useState('هفتم');
  const [srcChapter, setSrcChapter] = useState('');
  const [srcTopic, setSrcTopic] = useState('');
  const [srcSummary, setSrcSummary] = useState('');
  const [srcPages, setSrcPages] = useState<TeacherSourcePage[]>([
    { pageNumber: 1, heading: '', content: '' },
  ]);
  const [savingSource, setSavingSource] = useState(false);

  // Q&A Sessions
  const [sessions, setSessions] = useState<PrivateTutorSession[]>([]);
  const [activeSession, setActiveSession] = useState<PrivateTutorSession | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [qaSubjectId, setQaSubjectId] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [streamAnswer, setStreamAnswer] = useState('');
  const [streamCitations, setStreamCitations] = useState<PrivateTutorCitation[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Diagnosis & Mistakes
  const [diagnosis, setDiagnosis] = useState<LearningDiagnosisResult | null>(null);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const [diagStudentId, setDiagStudentId] = useState('');
  const [mistakeTopic, setMistakeTopic] = useState('');
  const [mistakeType, setMistakeType] = useState('اشتباه مفهومی / محاسباتی');
  const [mistakeSubjectId, setMistakeSubjectId] = useState('');
  const [mistakeSeverity, setMistakeSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [savingMistake, setSavingMistake] = useState(false);

  // Adaptive Practice
  const [pracTopic, setPracTopic] = useState('');
  const [pracSubjectId, setPracSubjectId] = useState('');
  const [pracDifficulty, setPracDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [pracCount, setPracCount] = useState('3');
  const [generatingPractice, setGeneratingPractice] = useState(false);
  const [practiceLevelLabel, setPracticeLevelLabel] = useState('');
  const [exercises, setExercises] = useState<PracticeExerciseItem[]>([]);
  const [userExAnswers, setUserExAnswers] = useState<Record<string, string | number>>({});
  const [checkedEx, setCheckedEx] = useState<Record<string, boolean>>({});

  // Remedial Plan
  const [remFocusTopic, setRemFocusTopic] = useState('');
  const [generatingRemedial, setGeneratingRemedial] = useState(false);
  const [remedialSummary, setRemedialSummary] = useState('');
  const [remedialItems, setRemedialItems] = useState<RemedialPlanItem[]>([]);
  const [savingRemedialToPlanner, setSavingRemedialToPlanner] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      setLoadingSources(true);
      const res = await apiRequest<{ sources: TeacherSourceMaterial[] }>('/api/private-tutor/sources', {
        silentError: true,
      });
      setSources(res.sources ?? []);
    } catch {
      // handled gracefully
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiRequest<{ sessions: PrivateTutorSession[] }>('/api/private-tutor/sessions', {
        silentError: true,
      });
      const list = res.sessions ?? [];
      setSessions(list);
      if (!activeSession && list.length > 0) {
        setActiveSession(list[0]);
      }
    } catch {
      // handled gracefully
    }
  }, [activeSession]);

  const loadDiagnosis = useCallback(
    async (targetStuId?: string) => {
      try {
        setLoadingDiagnosis(true);
        const query =
          canManageSources && targetStuId ? `?studentId=${encodeURIComponent(targetStuId)}` : '';
        const res = await apiRequest<{ diagnosis: LearningDiagnosisResult }>(
          `/api/private-tutor/diagnosis${query}`,
          { silentError: true }
        );
        setDiagnosis(res.diagnosis);
        if (!pracTopic && res.diagnosis.weakTopics.length > 0) {
          setPracTopic(res.diagnosis.weakTopics[0].topic);
        }
      } catch {
        // ignore
      } finally {
        setLoadingDiagnosis(false);
      }
    },
    [canManageSources, pracTopic]
  );

  useEffect(() => {
    void loadSources();
    void loadSessions();
    void loadDiagnosis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [activeSession?.messages.length, streamAnswer, pendingQuestion, streaming]);

  const approvedSourcesCount = useMemo(() => sources.filter((s) => s.approved).length, [sources]);

  const ensureSession = async (): Promise<PrivateTutorSession> => {
    if (activeSession) return activeSession;
    const res = await apiRequest<{ session: PrivateTutorSession }>('/api/private-tutor/sessions', {
      method: 'POST',
      notify: false,
      body: JSON.stringify({
        title: tr('جلسه پرسش از معلم خصوصی', 'Private Tutor Session'),
        subjectId: qaSubjectId || undefined,
      }),
    });
    setActiveSession(res.session);
    setSessions((prev) => [res.session, ...prev]);
    return res.session;
  };

  const handleNewSession = async () => {
    if (streaming) return;
    try {
      const res = await apiRequest<{ session: PrivateTutorSession }>('/api/private-tutor/sessions', {
        method: 'POST',
        notify: false,
        body: JSON.stringify({
          title: tr('جلسه جدید معلم خصوصی', 'New Private Tutor Session'),
          subjectId: qaSubjectId || undefined,
        }),
      });
      setActiveSession(res.session);
      setSessions((prev) => [res.session, ...prev]);
      setHistoryOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ایجاد جلسه', 'Failed to create session'), 'error');
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await apiRequest(`/api/private-tutor/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) {
        setActiveSession(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف جلسه', 'Delete failed'), 'error');
    }
  };

  const handleAsk = async (overrideText?: string) => {
    const q = (overrideText ?? questionInput).trim();
    if (!q || streaming) return;

    if (!overrideText) setQuestionInput('');
    setStreaming(true);
    setPendingQuestion(q);
    setStreamAnswer('');
    setStreamCitations([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const sess = await ensureSession();
      let finalSession: PrivateTutorSession | null = null;
      let capturedCitations: PrivateTutorCitation[] = [];

      await streamSseRequest<{ done?: boolean; session?: PrivateTutorSession }>(
        `/api/private-tutor/sessions/${sess.id}/ask/stream`,
        {
          question: q,
          subjectId: qaSubjectId || undefined,
          lang,
        },
        {
          onEvent: (payload) => {
            if (Array.isArray(payload.citations)) {
              capturedCitations = payload.citations as PrivateTutorCitation[];
              setStreamCitations(capturedCitations);
            }
          },
          onDelta: (delta) => {
            setStreamAnswer((prev) => prev + delta);
          },
          onDone: (payload) => {
            if (payload.session) finalSession = payload.session;
          },
        },
        controller.signal
      );

      if (finalSession) {
        setActiveSession(finalSession);
        setSessions((prev) => {
          const rest = prev.filter((s) => s.id !== finalSession!.id);
          return [finalSession!, ...rest];
        });
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        showToast(err instanceof Error ? err.message : tr('خطا در دریافت پاسخ معلم خصوصی', 'Tutor failed to reply'), 'error');
      }
    } finally {
      setStreaming(false);
      setPendingQuestion(null);
      setStreamAnswer('');
      setStreamCitations([]);
      abortRef.current = null;
    }
  };

  // Source management handlers (Teacher/Admin/Deputy only)
  const handleTextFileUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 500 * 1024) {
      showToast(tr('حجم فایل متنی نباید بیشتر از ۵۰۰ کیلوبایت باشد.', 'File must be under 500 KB.'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) return;
      if (!srcTitle) {
        setSrcTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      // Split by explicit ---page--- or double blank lines into pages of ~800 chars
      const chunks = text
        .split(/\n-{3,}\n|\n={3,}\n/)
        .map((c) => c.trim())
        .filter(Boolean);

      if (chunks.length > 1) {
        setSrcPages(
          chunks.map((c, idx) => ({
            pageNumber: idx + 1,
            heading: `${tr('صفحه', 'Page')} ${idx + 1}`,
            content: c,
          }))
        );
      } else {
        const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
        const built: TeacherSourcePage[] = [];
        let buf = '';
        for (const p of paragraphs) {
          if ((buf + '\n\n' + p).length > 900 && buf.trim()) {
            built.push({ pageNumber: built.length + 1, content: buf.trim() });
            buf = p;
          } else {
            buf = buf ? `${buf}\n\n${p}` : p;
          }
        }
        if (buf.trim()) built.push({ pageNumber: built.length + 1, content: buf.trim() });
        setSrcPages(built.length > 0 ? built : [{ pageNumber: 1, content: text.trim() }]);
      }
      showToast(tr('متن فایل در صفحات جزوه بارگذاری شد.', 'File content loaded into numbered pages.'));
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSaveSource = async (e: FormEvent) => {
    e.preventDefault();
    const validPages = srcPages.filter((p) => p.content.trim());
    if (!srcTitle.trim() || validPages.length === 0) {
      showToast(tr('عنوان و حداقل یک صفحه محتوا الزامی است.', 'Title and at least one page are required.'), 'error');
      return;
    }
    setSavingSource(true);
    try {
      const chosenSubjectName = subjects.find((s) => s.id === srcSubjectId)?.name || 'عمومی';
      await apiRequest('/api/private-tutor/sources', {
        method: 'POST',
        body: JSON.stringify({
          title: srcTitle.trim(),
          subjectId: srcSubjectId || undefined,
          subjectName: chosenSubjectName,
          gradeLevel: srcGradeLevel,
          chapter: srcChapter.trim() || undefined,
          topic: srcTopic.trim() || undefined,
          summary: srcSummary.trim() || undefined,
          approved: true,
          pages: validPages,
        }),
      });
      setSourceModalOpen(false);
      setSrcTitle('');
      setSrcChapter('');
      setSrcTopic('');
      setSrcSummary('');
      setSrcPages([{ pageNumber: 1, heading: '', content: '' }]);
      await loadSources();
      await loadDiagnosis(diagStudentId || undefined);
      showToast(
        tr(
          'منبع جدید ذخیره شد و هوش مصنوعی از این پس بر اساس آن پاسخ می‌دهد.',
          'Source saved and active for Private Tutor AI responses.'
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره جزوه', 'Failed to save source'), 'error');
    } finally {
      setSavingSource(false);
    }
  };

  const toggleSourceApproval = async (src: TeacherSourceMaterial) => {
    try {
      await apiRequest(`/api/private-tutor/sources/${src.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: !src.approved }),
      });
      await loadSources();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تغییر وضعیت تأیید', 'Failed to update approval'), 'error');
    }
  };

  const deleteSource = async (id: string) => {
    try {
      await apiRequest(`/api/private-tutor/sources/${id}`, { method: 'DELETE' });
      await loadSources();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف منبع', 'Delete failed'), 'error');
    }
  };

  // Mistake logging
  const handleAddMistake = async (e: FormEvent) => {
    e.preventDefault();
    if (!mistakeTopic.trim()) return;
    setSavingMistake(true);
    try {
      const subObj = subjects.find((s) => s.id === mistakeSubjectId);
      await apiRequest('/api/private-tutor/mistakes', {
        method: 'POST',
        body: JSON.stringify({
          studentId: canManageSources && diagStudentId ? diagStudentId : undefined,
          subjectId: mistakeSubjectId || undefined,
          subjectName: subObj?.name,
          topic: mistakeTopic.trim(),
          mistakeType: mistakeType.trim(),
          severity: mistakeSeverity,
        }),
      });
      setMistakeTopic('');
      await loadDiagnosis(diagStudentId || undefined);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت اشتباه', 'Failed to record mistake'), 'error');
    } finally {
      setSavingMistake(false);
    }
  };

  // Generate adaptive practice
  const handleGeneratePractice = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setGeneratingPractice(true);
    try {
      const res = await apiRequest<{
        learningLevel: string;
        exercises: PracticeExerciseItem[];
      }>('/api/private-tutor/generate-practice', {
        method: 'POST',
        body: JSON.stringify({
          topic: pracTopic.trim() || diagnosis?.weakTopics[0]?.topic || tr('مفاهیم پایه درس', 'Core Lesson Concepts'),
          subjectId: pracSubjectId || undefined,
          difficulty: pracDifficulty,
          count: Number(pracCount) || 3,
        }),
      });
      setPracticeLevelLabel(res.learningLevel || '');
      setExercises(res.exercises ?? []);
      setUserExAnswers({});
      setCheckedEx({});
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تولید تمرین', 'Practice generation failed'), 'error');
    } finally {
      setGeneratingPractice(false);
    }
  };

  const checkExercise = async (ex: PracticeExerciseItem) => {
    setCheckedEx((prev) => ({ ...prev, [ex.id]: true }));
    const ans = userExAnswers[ex.id];
    let isCorrect = false;
    if (ex.type === 'mcq') {
      isCorrect = Number(ans) === ex.correctIndex;
    } else {
      isCorrect = String(ans ?? '').trim().toLowerCase() === ex.correctAnswer.trim().toLowerCase();
    }
    if (!isCorrect) {
      // Automatically record recurring mistake in the student's diagnosis profile
      try {
        await apiRequest('/api/private-tutor/mistakes', {
          method: 'POST',
          notify: false,
          body: JSON.stringify({
            topic: ex.topic || pracTopic || 'تمرین معلم خصوصی',
            mistakeType: 'پاسخ نادرست در تمرین تطبیقی',
            questionPrompt: ex.question,
            studentAnswer:
              ex.type === 'mcq' && typeof ans === 'number' ? ex.options?.[ans] ?? String(ans) : String(ans ?? ''),
            expectedAnswer: ex.correctAnswer,
            severity: 'medium',
          }),
        });
        await loadDiagnosis(diagStudentId || undefined);
      } catch {
        // silent logging failure
      }
    }
  };

  // Generate remedial plan
  const handleGenerateRemedial = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setGeneratingRemedial(true);
    try {
      const res = await apiRequest<{ summary: string; items: RemedialPlanItem[] }>(
        '/api/private-tutor/generate-remedial-plan',
        {
          method: 'POST',
          body: JSON.stringify({ focusTopic: remFocusTopic.trim() || undefined }),
        }
      );
      setRemedialSummary(res.summary || '');
      setRemedialItems(res.items ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ساخت برنامه جبرانی', 'Remedial plan failed'), 'error');
    } finally {
      setGeneratingRemedial(false);
    }
  };

  const saveRemedialToStudyPlanner = async () => {
    if (remedialItems.length === 0) return;
    setSavingRemedialToPlanner(true);
    try {
      const todayStr = new Date().toLocaleDateString('fa-IR');
      for (const item of remedialItems) {
        await apiRequest('/api/study-plans', {
          method: 'POST',
          notify: false,
          body: JSON.stringify({
            title: `${item.dayLabel}: ${item.focusTopic} — ${item.activity}`,
            targetDate: todayStr,
            durationMinutes: item.durationMinutes || 45,
            notes: item.sourceReference ? `${tr('منبع:', 'Source:')} ${item.sourceReference}` : undefined,
            category: 'remedial',
            aiGenerated: true,
          }),
        });
      }
      if (onSavedToPlanner) await onSavedToPlanner();
      showToast(tr('تمام گام‌های برنامه جبرانی در برنامه‌ریز مطالعه ذخیره شد.', 'All remedial steps saved to your Study Planner.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره برنامه', 'Save failed'), 'error');
    } finally {
      setSavingRemedialToPlanner(false);
    }
  };

  const iconOptions: Array<{
    id: TutorTab;
    label: string;
    icon: typeof MessageSquare;
  }> = [
    { id: 'qa', label: tr('پرسش از منابع مدرسه', 'Source-Grounded Q&A'), icon: MessageSquare },
    { id: 'diagnosis', label: tr('تشخیص نقاط ضعف و اشتباهات', 'Weakness & Mistake Diagnosis'), icon: Activity },
    { id: 'practice', label: tr('تمرین متناسب با سطح یادگیری', 'Adaptive Practice'), icon: Sparkles },
    { id: 'remedial', label: tr('برنامه جبرانی آموزشی', 'Remedial Plan'), icon: CalendarPlus },
  ];
  if (canManageSources) {
    iconOptions.push({
      id: 'sources',
      label: `${tr('منابع و جزوه‌ها', 'Sources')} (${fmtDigits(sources.length)})`,
      icon: BookMarked,
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[560px]">
      <div className="relative flex-1 flex overflow-hidden">
        {historyOpen && (
          <div className="w-64 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 overflow-y-auto space-y-1.5">
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {tr('تاریخچه جلسات', 'Tutor History')}
              </span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label={tr('بستن', 'Close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                {tr('هنوز جلسه‌ای ثبت نشده است.', 'No sessions yet.')}
              </p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs cursor-pointer ${
                    activeSession?.id === s.id
                      ? 'bg-[#0F274A]/10 dark:bg-sky-900/30 text-[#0F274A] dark:text-sky-200 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                  onClick={() => {
                    setActiveSession(s);
                    setSubTab('qa');
                    setHistoryOpen(false);
                  }}
                >
                  <span className="truncate">{s.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteSession(s.id);
                    }}
                    className="opacity-60 hover:opacity-100 text-red-600 p-0.5 shrink-0"
                    aria-label={tr('حذف جلسه', 'Delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* TAB 1: SOURCE-GROUNDED Q&A */}
          {subTab === 'qa' && (
            <div className="h-full flex flex-col justify-center">
              {(!activeSession || activeSession.messages.length === 0) && !pendingQuestion ? (
                <div className="max-w-xl mx-auto py-8 text-center space-y-4">
                  <GraduationCap className="w-9 h-9 text-[#0F274A] dark:text-sky-400 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {tr('معلم خصوصی هوشمند مبتنی بر جزوه‌های مدرسه', 'School-Grounded Private Tutor')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {fmtDigits(approvedSourcesCount)}{' '}
                      {tr('منبع و جزوه تأییدشده آماده پاسخگویی', 'approved school sources active')}
                    </p>
                  </div>
                  {sources.filter((s) => s.approved).length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {sources
                        .filter((s) => s.approved)
                        .slice(0, 4)
                        .map((src) => (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() =>
                              void handleAsk(
                                tr(
                                  `نکات کلیدی «${src.title}» را با ذکر شماره صفحه توضیح بده.`,
                                  `Summarize key points of "${src.title}" with page numbers.`
                                )
                              )
                            }
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:border-[#0F274A] dark:hover:border-sky-500 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors max-w-[220px] truncate"
                            title={src.title}
                          >
                            {src.title}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-3xl w-full mx-auto space-y-4 mb-auto">
                  {(activeSession?.messages ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {m.content}
                      </div>
                      {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                        <div className="mt-2 max-w-[90%] space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {tr('منابع استخراج‌شده از جزوه‌های مدرسه:', 'Extracted School Source Citations:')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {m.citations.map((cit, ci) => (
                              <div
                                key={`${cit.sourceId}_${ci}`}
                                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs max-w-xs"
                              >
                                <p className="font-bold text-[#0F274A] dark:text-sky-300">
                                  {cit.sourceTitle} · {tr('صفحه', 'Page')} {fmtDigits(cit.pageNumber)}
                                </p>
                                {cit.excerpt && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                    {cit.excerpt}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {pendingQuestion && (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm bg-[#0F274A] dark:bg-sky-600 text-white">
                          {pendingQuestion}
                        </div>
                      </div>
                      <div className="flex flex-col items-start">
                        <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                          {streamAnswer || (
                            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {tr('در حال جستجو در جزوه‌های مدرسه و نگارش پاسخ...', 'Searching approved notes...')}
                            </span>
                          )}
                        </div>
                        {streamCitations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {streamCitations.map((cit, ci) => (
                              <div
                                key={`sc_${ci}`}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-[#0F274A] dark:text-sky-300"
                              >
                                {cit.sourceTitle} · {tr('صفحه', 'Page')} {fmtDigits(cit.pageNumber)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          )}

      {/* TAB 2: DIAGNOSIS & RECURRING MISTAKES */}
      {subTab === 'diagnosis' && (
        <div className="space-y-5">
          {canManageSources && students.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {tr('انتخاب دانش‌آموز برای بررسی تشخیص یادگیری:', 'Select Student for Learning Diagnosis:')}
              </span>
              <select
                value={diagStudentId}
                onChange={(e) => {
                  setDiagStudentId(e.target.value);
                  void loadDiagnosis(e.target.value);
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
              >
                <option value="">{tr('نمایه خود من', 'My Own Profile')}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.gradeLevel || '—'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingDiagnosis ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              {tr('در حال تحلیل عملکرد و تشخیص موضوعات نیازمند تقویت...', 'Analyzing learning profile...')}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('سطح یادگیری تشخیص‌داده‌شده', 'Detected Learning Level')}
                      </p>
                      <h3 className="text-base font-extrabold text-[#0F274A] dark:text-sky-300 mt-0.5">
                        {diagnosis?.learningLevel || tr('متوسط و رو به پیشرفت', 'Intermediate')}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSubTab('remedial');
                        void handleGenerateRemedial();
                      }}
                      className="px-3.5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
                    >
                      {tr('ساخت برنامه جبرانی خودکار', 'Build Remedial Plan')}
                    </button>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5">
                      {tr('موضوعاتی که نیاز به تمرین و رفع اشکال دارند:', 'Topics Needing Improvement:')}
                    </h4>
                    {!diagnosis?.weakTopics || diagnosis.weakTopics.length === 0 ? (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 py-4">
                        {tr(
                          'مورد ضعفی از نمرات یا آزمون‌ها شناسایی نشد. با شرکت در تمرین‌ها یا ثبت اشتباهات، تحلیل دقیق‌تر می‌شود.',
                          'No weak topics detected yet from recorded scores or mistakes.'
                        )}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {diagnosis.weakTopics.map((wt, idx) => (
                          <div
                            key={`${wt.topic}_${idx}`}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {wt.topic} ·{' '}
                                <span className="font-medium text-slate-500 dark:text-slate-400">
                                  {wt.subjectName}
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                                {wt.evidence}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPracTopic(wt.topic);
                                setSubTab('practice');
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold text-[#0F274A] dark:text-sky-300 hover:bg-white dark:hover:bg-slate-800 shrink-0"
                            >
                              {tr('تمرین این مبحث', 'Practice Topic')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recurring Mistakes List */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {tr('اشتباهات پرتکرار شناسایی‌شده در پاسخ‌ها', 'Recurring Mistakes Log')}
                  </h4>
                  {!diagnosis?.recurringMistakes || diagnosis.recurringMistakes.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                      {tr(
                        'هنوز اشتباه پرتکراری ثبت نشده است. با شرکت در آزمون‌های آنلاین یا حل تمرین تطبیقی، خطاها به صورت خودکار اینجا تحلیل می‌شوند.',
                        'No recurring mistakes logged yet. Objective exam errors and adaptive practice mistakes are logged here automatically.'
                      )}
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {diagnosis.recurringMistakes.map((m) => (
                        <div key={m.id} className="py-3 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {m.topic} · {m.mistakeType}
                            </span>
                            <span className="font-bold text-red-700 dark:text-red-400 tabular-nums shrink-0">
                              {fmtDigits(m.count)} {tr('بار تکرار', 'occurrences')}
                            </span>
                          </div>
                          {m.questionPrompt && (
                            <p className="text-slate-600 dark:text-slate-300">{m.questionPrompt}</p>
                          )}
                          {(m.studentAnswer || m.expectedAnswer) && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {m.studentAnswer ? `${tr('پاسخ ثبت‌شده:', 'Given:')} ${m.studentAnswer} · ` : ''}
                              {m.expectedAnswer ? `${tr('پاسخ صحیح:', 'Expected:')} ${m.expectedAnswer}` : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Log a new mistake + Recommended sources */}
              <div className="lg:col-span-5 space-y-4">
                <form
                  onSubmit={handleAddMistake}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {tr('ثبت اشکال یا اشتباه یادگیری برای تحلیل', 'Report a Learning Mistake or Difficulty')}
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold mb-1">{tr('مبحث درسی', 'Topic')}</label>
                    <input
                      type="text"
                      required
                      value={mistakeTopic}
                      onChange={(e) => setMistakeTopic(e.target.value)}
                      placeholder={tr('مثلاً انتگرال جزء‌به‌جزء یا قوانین نیوتن', 'e.g. Integration by parts')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold mb-1">{tr('درس', 'Subject')}</label>
                      <select
                        value={mistakeSubjectId}
                        onChange={(e) => setMistakeSubjectId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                      >
                        <option value="">{tr('عمومی', 'General')}</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">{tr('شدت اشکال', 'Severity')}</label>
                      <select
                        value={mistakeSeverity}
                        onChange={(e) => setMistakeSeverity(e.target.value as 'low' | 'medium' | 'high')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                      >
                        <option value="low">{tr('کم', 'Low')}</option>
                        <option value="medium">{tr('متوسط', 'Medium')}</option>
                        <option value="high">{tr('زیاد', 'High')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">{tr('نوع اشتباه', 'Mistake Type')}</label>
                    <input
                      type="text"
                      required
                      value={mistakeType}
                      onChange={(e) => setMistakeType(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingMistake}
                    className="w-full py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
                  >
                    {savingMistake ? tr('در حال ثبت...', 'Saving...') : tr('ثبت در پرونده عیب‌یابی', 'Log Mistake')}
                  </button>
                </form>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tr('جزوه‌های پیشنهادی دبیران برای مرور', 'Recommended School Sources')}
                  </h4>
                  {(diagnosis?.recommendedSources ?? []).map((rs) => (
                    <div
                      key={rs.sourceId}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {rs.title}
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                        {fmtDigits(rs.pageCount)} {tr('صفحه', 'pages')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ADAPTIVE PRACTICE */}
      {subTab === 'practice' && (
        <div className="space-y-5">
          <form
            onSubmit={handleGeneratePractice}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold mb-1.5">{tr('مبحث تمرین', 'Practice Topic')}</label>
              <input
                type="text"
                value={pracTopic}
                onChange={(e) => setPracTopic(e.target.value)}
                placeholder={tr('مثلاً معادله درجه دوم یا حرکت شتاب‌دار', 'e.g. Kinematics or Quadratic Equations')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold mb-1.5">{tr('درس مرتبط', 'Subject')}</label>
              <select
                value={pracSubjectId}
                onChange={(e) => setPracSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              >
                <option value="">{tr('همه دروس', 'All Subjects')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1.5">{tr('سطح دشواری', 'Difficulty')}</label>
              <select
                value={pracDifficulty}
                onChange={(e) => setPracDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              >
                <option value="easy">{tr('پایه و مرور', 'Foundational')}</option>
                <option value="medium">{tr('متوسط استاندارد', 'Standard')}</option>
                <option value="hard">{tr('پیشرفته تیزهوشان', 'Advanced / Gifted')}</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold mb-1.5">{tr('تعداد', 'Count')}</label>
              <input
                type="number"
                min={1}
                max={8}
                value={pracCount}
                onChange={(e) => setPracCount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={generatingPractice}
                className="w-full py-2 px-4 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {generatingPractice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{generatingPractice ? tr('در حال ساخت...', 'Building...') : tr('ساخت تمرین', 'Generate')}</span>
              </button>
            </div>
          </form>

          {exercises.length > 0 && (
            <div className="space-y-4">
              {practiceLevelLabel && (
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {tr('تمرین تنظیم‌شده متناسب با سطح شما:', 'Tailored for your learning level:')}{' '}
                  <span className="text-[#0F274A] dark:text-sky-300 font-bold">{practiceLevelLabel}</span>
                </p>
              )}
              {exercises.map((ex, idx) => {
                const isChecked = checkedEx[ex.id];
                const ans = userExAnswers[ex.id];
                const isRight =
                  ex.type === 'mcq'
                    ? Number(ans) === ex.correctIndex
                    : String(ans ?? '').trim().toLowerCase() === ex.correctAnswer.trim().toLowerCase();

                return (
                  <div
                    key={ex.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {fmtDigits(idx + 1)}. {ex.question}
                      </p>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {ex.topic}
                        {ex.sourceCitation ? ` · ${ex.sourceCitation}` : ''}
                      </span>
                    </div>

                    {ex.type === 'mcq' && ex.options && ex.options.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ex.options.map((opt, oi) => (
                          <button
                            key={oi}
                            type="button"
                            disabled={isChecked}
                            onClick={() => setUserExAnswers((prev) => ({ ...prev, [ex.id]: oi }))}
                            className={`p-2.5 rounded-lg border text-xs text-start font-medium transition-colors ${
                              ans === oi
                                ? 'bg-[#0F274A] dark:bg-sky-600 text-white border-[#0F274A]'
                                : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        disabled={isChecked}
                        value={String(ans ?? '')}
                        onChange={(e) => setUserExAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))}
                        placeholder={tr('پاسخ خود را بنویسید...', 'Type your answer...')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                      />
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {!isChecked ? (
                        <button
                          type="button"
                          onClick={() => void checkExercise(ex)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>{tr('بررسی پاسخ', 'Check Answer')}</span>
                        </button>
                      ) : (
                        <div
                          className={`w-full p-3 rounded-lg border text-xs space-y-1 ${
                            isRight
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
                          }`}
                        >
                          <p className="font-bold flex items-center gap-1.5">
                            {isRight ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {isRight
                              ? tr('آفرین! پاسخ شما صحیح است.', 'Correct answer!')
                              : `${tr('پاسخ صحیح:', 'Correct answer:')} ${ex.correctAnswer}`}
                          </p>
                          <p className="leading-5">{ex.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: REMEDIAL PLAN */}
      {subTab === 'remedial' && (
        <div className="space-y-5">
          <form
            onSubmit={handleGenerateRemedial}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold mb-1.5">
                {tr('تمرکز اصلی برنامه جبرانی (اختیاری)', 'Primary Remedial Focus (Optional)')}
              </label>
              <input
                type="text"
                value={remFocusTopic}
                onChange={(e) => setRemFocusTopic(e.target.value)}
                placeholder={tr(
                  'اگر خالی بگذارید، بر اساس نقاط ضعف و اشتباهات پرتکرار شما ساخته می‌شود',
                  'Leave blank to auto-target your detected weak topics & recurring mistakes'
                )}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={generatingRemedial}
              className="px-5 py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {generatingRemedial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{generatingRemedial ? tr('در حال طراحی...', 'Building Plan...') : tr('ساخت برنامه جبرانی آموزشی', 'Generate Remedial Plan')}</span>
            </button>
          </form>

          {remedialItems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {tr('برنامه جبرانی پیشنهادی معلم خصوصی', 'Recommended Remedial Action Plan')}
                  </h3>
                  {remedialSummary && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{remedialSummary}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={savingRemedialToPlanner}
                  onClick={() => void saveRemedialToStudyPlanner()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>
                    {savingRemedialToPlanner
                      ? tr('در حال ذخیره...', 'Saving...')
                      : tr('ذخیره همه در برنامه‌ریز مطالعه', 'Save All to Study Planner')}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {remedialItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#0F274A] dark:text-sky-300">{item.dayLabel}</span>
                      <span className="text-slate-500 tabular-nums">
                        {fmtDigits(item.durationMinutes)} {tr('دقیقه', 'min')}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.focusTopic}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">{item.activity}</p>
                    {item.sourceReference && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {tr('منبع پیشنهادی:', 'Source:')} {item.sourceReference}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TEACHER/ADMIN SOURCE MANAGEMENT */}
      {subTab === 'sources' && canManageSources && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {tr('جزوه‌ها و منابع تأییدشده معلمان', 'Teacher-Approved Notes & School Sources')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr(
                  'محتوای ثبت‌شده در اینجا مستقیماً به عنوان پایگاه دانش معلم خصوصی استفاده و با شماره صفحه ارجاع داده می‌شود.',
                  'Materials added here serve as the grounded knowledge base for Private Tutor citations with page numbers.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSourceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('افزودن جزوه و منبع جدید', 'Add Teacher Source')}</span>
            </button>
          </div>

          {loadingSources ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500">
              {tr('در حال بارگذاری منابع...', 'Loading sources...')}
            </div>
          ) : sources.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500">
              {tr('هنوز جزوه یا منبعی ثبت نشده است.', 'No teacher sources added yet.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map((src) => {
                const canDeleteOrEdit = user.role === 'admin' || src.authorId === user.id;
                return (
                  <div
                    key={src.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {src.subjectName || tr('عمومی', 'General')} · {src.gradeLevel} ·{' '}
                            {fmtDigits(src.pages.length)} {tr('صفحه', 'pages')} ·{' '}
                            <span
                              className={
                                src.approved
                                  ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                  : 'text-amber-700 dark:text-amber-400 font-semibold'
                              }
                            >
                              {src.approved ? tr('تأییدشده', 'Approved') : tr('در انتظار تأیید', 'Pending')}
                            </span>
                          </p>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">{src.title}</h4>
                        </div>
                        {canDeleteOrEdit && (
                          <button
                            type="button"
                            onClick={() => void deleteSource(src.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            aria-label={tr('حذف منبع', 'Delete source')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {src.summary && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{src.summary}</p>
                      )}
                      <div className="mt-2 space-y-1">
                        {src.pages.slice(0, 2).map((p) => (
                          <p key={p.pageNumber} className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            <FileText className="w-3 h-3 inline me-1" />
                            {tr('صفحه', 'Page')} {fmtDigits(p.pageNumber)}
                            {p.heading ? ` (${p.heading})` : ''}: {p.content}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {tr('دبیر:', 'Author:')} {src.authorName} · {fmtDateTime(src.updatedAt)}
                      </span>
                      {canDeleteOrEdit && (
                        <button
                          type="button"
                          onClick={() => void toggleSourceApproval(src)}
                          className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                        >
                          {src.approved ? tr('لغو تأیید', 'Unapprove') : tr('تأیید و انتشار', 'Approve Source')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Persistent Bottom Box with Compact Small Icons */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (subTab !== 'qa') setSubTab('qa');
          void handleAsk();
        }}
        className="p-3 sm:p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80"
      >
        <div className="max-w-3xl mx-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 space-y-2 shadow-sm">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder={tr(
                'پرسش خود را از جزوه‌ها و منابع دبیران بپرسید...',
                'Ask your private tutor based on school resources...'
              )}
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none py-1"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label={tr('توقف', 'Stop')}
                title={tr('توقف', 'Stop')}
                className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!questionInput.trim()}
                aria-label={tr('ارسال پرسش', 'Ask')}
                title={tr('ارسال پرسش', 'Ask')}
                className="w-8 h-8 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white flex items-center justify-center hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-40 transition-colors shrink-0"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/70">
            <div className="flex items-center gap-1">
              {iconOptions.map((opt) => {
                const Icon = opt.icon;
                const active = subTab === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSubTab(opt.id)}
                    title={opt.label}
                    aria-label={opt.label}
                    aria-pressed={active}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      active
                        ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}

              {canManageSources && (
                <button
                  type="button"
                  onClick={() => setSourceModalOpen(true)}
                  title={tr('افزودن منبع و جزوه جدید', 'Add New Source')}
                  aria-label={tr('افزودن منبع و جزوه جدید', 'Add New Source')}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-[#0F274A] dark:hover:text-sky-300 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={qaSubjectId}
                onChange={(e) => setQaSubjectId(e.target.value)}
                title={tr('فیلتر درس', 'Filter Subject')}
                aria-label={tr('فیلتر درس', 'Filter Subject')}
                className="h-8 max-w-[140px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="">{tr('همه دروس', 'All Subjects')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (subTab !== 'qa') setSubTab('qa');
                  setHistoryOpen((v) => !v);
                }}
                title={`${tr('جلسات قبلی', 'Sessions')} (${fmtDigits(sessions.length)})`}
                aria-label={tr('جلسات قبلی', 'Sessions')}
                aria-pressed={historyOpen}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  historyOpen
                    ? 'bg-slate-200 dark:bg-slate-700 text-[#0F274A] dark:text-sky-300'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <History className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubTab('qa');
                  void handleNewSession();
                }}
                title={tr('جلسه جدید', 'New Session')}
                aria-label={tr('جلسه جدید', 'New Session')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-[#0F274A] dark:hover:text-sky-300 transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Create Source Modal (available from any sub-tab for Teacher/Admin/Deputy) */}
      {canManageSources && (
        <Modal
          open={sourceModalOpen}
          onClose={() => setSourceModalOpen(false)}
          title={tr('افزودن جزوه و منبع درسی صفحه‌بندی‌شده', 'Add Teacher-Approved School Source')}
          maxWidthClass="max-w-2xl"
        >
          <form onSubmit={handleSaveSource} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('عنوان جزوه یا منبع', 'Source Title')}</label>
                <input
                  type="text"
                  required
                  value={srcTitle}
                  onChange={(e) => setSrcTitle(e.target.value)}
                  placeholder={tr('مثلاً جزوه کامل تابع و مثلثات', 'e.g. Trigonometry Lecture Notes')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  {tr('بارگذاری فایل متنی (.txt / .md) اختیاری', 'Upload Text/Markdown File (Optional)')}
                </label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{tr('انتخاب فایل برای صفحه‌بندی خودکار', 'Choose .txt / .md to auto-paginate')}</span>
                  <input
                    type="file"
                    accept=".txt,.md,.csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      handleTextFileUpload(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('درس', 'Subject')}</label>
                <select
                  value={srcSubjectId}
                  onChange={(e) => setSrcSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                >
                  <option value="">{tr('عمومی', 'General')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('پایه', 'Grade Level')}</label>
                <select
                  value={srcGradeLevel}
                  onChange={(e) => setSrcGradeLevel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                >
                  {GRADE_LEVELS_FA.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('فصل', 'Chapter')}</label>
                <input
                  type="text"
                  value={srcChapter}
                  onChange={(e) => setSrcChapter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('مبحث', 'Topic')}</label>
                <input
                  type="text"
                  value={srcTopic}
                  onChange={(e) => setSrcTopic(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{tr('صفحات محتوای جزوه', 'Numbered Source Pages')}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSrcPages((prev) => [
                      ...prev,
                      { pageNumber: prev.length + 1, heading: '', content: '' },
                    ])
                  }
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  + {tr('افزودن صفحه جدید', 'Add Page')}
                </button>
              </div>

              {srcPages.map((pg, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tabular-nums">
                      {tr('صفحه', 'Page')} {fmtDigits(pg.pageNumber)}
                    </span>
                    {srcPages.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSrcPages((prev) =>
                            prev
                              .filter((_, k) => k !== idx)
                              .map((item, k) => ({ ...item, pageNumber: k + 1 }))
                          )
                        }
                        className="text-xs text-red-600 hover:underline"
                      >
                        {tr('حذف صفحه', 'Remove')}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={pg.heading ?? ''}
                    onChange={(e) =>
                      setSrcPages((prev) =>
                        prev.map((item, k) => (k === idx ? { ...item, heading: e.target.value } : item))
                      )
                    }
                    placeholder={tr('تیتر صفحه (اختیاری)', 'Page heading (optional)')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                  />
                  <textarea
                    rows={4}
                    required
                    value={pg.content}
                    onChange={(e) =>
                      setSrcPages((prev) =>
                        prev.map((item, k) => (k === idx ? { ...item, content: e.target.value } : item))
                      )
                    }
                    placeholder={tr('متن علمی و نکات این صفحه را وارد کنید...', 'Enter verified lesson content for this page...')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSourceModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {tr('انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={savingSource}
                className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
              >
                {savingSource ? tr('در حال ذخیره...', 'Saving...') : tr('ثبت و تأیید منبع', 'Save Approved Source')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
