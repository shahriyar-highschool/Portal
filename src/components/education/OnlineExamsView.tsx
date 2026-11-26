import {
  Award,
  BarChart3,
  BookMarked,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Eye,
  FileQuestion,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  type ExamAttempt,
  type ExamDifficulty,
  type ExamQualityAnalytics,
  type ExamQuestionType,
  type OnlineExam,
  type SchoolClass,
  type Subject,
  type TeacherBankQuestion,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { GRADE_LEVELS_FA } from '../../lib/persian';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface EnrichedExam extends OnlineExam {
  myAttempt?: ExamAttempt | null;
  attemptsCount?: number;
  averageScore?: number;
  pendingManualCount?: number;
}

interface DraftQuestion {
  type: ExamQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  correctText: string;
  points: number;
  chapter: string;
  topic: string;
  difficulty: ExamDifficulty;
  explanation: string;
}

const createEmptyQuestion = (type: ExamQuestionType = 'mcq'): DraftQuestion => ({
  type,
  prompt: '',
  options: type === 'true_false' ? ['صحیح', 'غلط'] : ['', '', '', ''],
  correctIndex: 0,
  correctText: '',
  points: 2,
  chapter: '',
  topic: '',
  difficulty: 'medium',
  explanation: '',
});

export function OnlineExamsView({
  user,
  exams,
  classes,
  subjects,
  onReload,
}: {
  user: UserAccount;
  exams: EnrichedExam[];
  classes: SchoolClass[];
  subjects: Subject[];
  onReload: () => Promise<void>;
}) {
  const { tr, fmtDigits, fmtNum, fmtDate, fmtDateTime } = useI18n();
  const { showToast } = useToast();

  const isLearnerSide = user.role === 'student';
  const canCreate = user.role === 'admin' || (user.role === 'teacher' && classes.length > 0);

  const [subTab, setSubTab] = useState<'list' | 'ai_builder' | 'bank'>('list');

  // Manual Exam Creation Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [gradeLevel, setGradeLevel] = useState('هفتم');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<ExamDifficulty>('medium');
  const [durationMinutes, setDurationMinutes] = useState('25');
  const [dueDate, setDueDate] = useState('1404/10/15');
  const [questions, setQuestions] = useState<DraftQuestion[]>([createEmptyQuestion('mcq')]);
  const [saving, setSaving] = useState(false);

  // AI Exam Builder state
  const [aiGrade, setAiGrade] = useState('هفتم');
  const [aiSubjectId, setAiSubjectId] = useState(subjects[0]?.id ?? '');
  const [aiClassId, setAiClassId] = useState(classes[0]?.id ?? '');
  const [aiChapter, setAiChapter] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<ExamDifficulty>('medium');
  const [aiCount, setAiCount] = useState('5');
  const [aiTypes, setAiTypes] = useState<ExamQuestionType[]>(['mcq', 'descriptive']);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftTitle, setAiDraftTitle] = useState('');
  const [aiDraftDuration, setAiDraftDuration] = useState('30');
  const [aiDraftDueDate, setAiDraftDueDate] = useState('1404/10/20');
  const [aiQuestions, setAiQuestions] = useState<DraftQuestion[]>([]);
  const [publishingAi, setPublishingAi] = useState(false);

  // Teacher Question Bank state
  const [bankItems, setBankItems] = useState<TeacherBankQuestion[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [bankFilterSubject, setBankFilterSubject] = useState('all');
  const [bankFilterType, setBankFilterType] = useState('all');
  const [bankSearch, setBankSearch] = useState('');
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankDraft, setBankDraft] = useState<DraftQuestion>(createEmptyQuestion('mcq'));
  const [bankSubjectId, setBankSubjectId] = useState(subjects[0]?.id ?? '');
  const [bankGradeLevel, setBankGradeLevel] = useState('هفتم');
  const [savingBankItem, setSavingBankItem] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);

  // Student timed exam runner + review
  const [activeExam, setActiveExam] = useState<EnrichedExam | null>(null);
  const [answers, setAnswers] = useState<Array<number | string>>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewExam, setReviewExam] = useState<EnrichedExam | null>(null);

  // Teacher/Admin Modals: Clone Versions, Attempts Grading, Quality Analytics
  const [cloneTarget, setCloneTarget] = useState<EnrichedExam | null>(null);
  const [cloneLabelsText, setCloneLabelsText] = useState('نسخه B، نسخه C');
  const [cloning, setCloning] = useState(false);

  const [attemptsTarget, setAttemptsTarget] = useState<EnrichedExam | null>(null);
  const [attemptsList, setAttemptsList] = useState<ExamAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<ExamAttempt | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { score: string; comment: string }>>({});
  const [savingGrading, setSavingGrading] = useState(false);

  const [analyticsTarget, setAnalyticsTarget] = useState<EnrichedExam | null>(null);
  const [analyticsData, setAnalyticsData] = useState<ExamQualityAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  const typeLabel = (t?: ExamQuestionType) => {
    switch (t) {
      case 'descriptive':
        return tr('تشریحی', 'Descriptive');
      case 'fill_blank':
        return tr('جای‌خالی', 'Fill in the Blank');
      case 'true_false':
        return tr('صحیح و غلط', 'True / False');
      default:
        return tr('چهارگزینه‌ای', 'Multiple Choice');
    }
  };

  const difficultyLabel = (d?: ExamDifficulty) => {
    switch (d) {
      case 'easy':
        return tr('ساده', 'Easy');
      case 'hard':
        return tr('دشوار', 'Hard');
      case 'olympiad':
        return tr('المپیادی', 'Olympiad');
      default:
        return tr('متوسط', 'Medium');
    }
  };

  const loadQuestionBank = useCallback(async () => {
    if (isLearnerSide) return;
    setLoadingBank(true);
    try {
      const res = await apiRequest<{ questions: TeacherBankQuestion[] }>('/api/question-bank');
      setBankItems(res.questions ?? []);
    } catch {
      // handled by apiRequest
    } finally {
      setLoadingBank(false);
    }
  }, [isLearnerSide]);

  useEffect(() => {
    if (!isLearnerSide && (subTab === 'bank' || createOpen)) {
      void loadQuestionBank();
    }
  }, [isLearnerSide, subTab, createOpen, loadQuestionBank]);

  const latestSubmitRef = useRef<((auto?: boolean) => Promise<void>) | null>(null);
  const autoSubmittedExamRef = useRef<string | null>(null);

  // Persist active exam answers in sessionStorage so accidental refreshes don't discard answers
  useEffect(() => {
    if (!activeExam || !startedAt) return;
    try {
      sessionStorage.setItem(
        `shahriar_exam_draft_${activeExam.id}`,
        JSON.stringify({ startedAt, answers })
      );
    } catch {
      // ignore storage limits
    }
  }, [activeExam, startedAt, answers]);

  const startExam = (ex: EnrichedExam) => {
    autoSubmittedExamRef.current = null;
    const defaultAnswers: Array<number | string> = ex.questions.map((q) =>
      q.type === 'descriptive' || q.type === 'fill_blank' ? '' : -1
    );
    let restoredAnswers: Array<number | string> = defaultAnswers;
    let restoredStartedAt = new Date().toISOString();
    let remainingSecs = ex.durationMinutes * 60;

    try {
      const raw = sessionStorage.getItem(`shahriar_exam_draft_${ex.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { startedAt?: string; answers?: Array<number | string> };
        if (parsed.startedAt && Array.isArray(parsed.answers) && parsed.answers.length === ex.questions.length) {
          const elapsed = Math.floor((Date.now() - new Date(parsed.startedAt).getTime()) / 1000);
          if (elapsed >= 0 && elapsed < ex.durationMinutes * 60) {
            restoredAnswers = parsed.answers;
            restoredStartedAt = parsed.startedAt;
            remainingSecs = Math.max(1, ex.durationMinutes * 60 - elapsed);
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    setActiveExam(ex);
    setAnswers(restoredAnswers);
    setSecondsLeft(remainingSecs);
    setStartedAt(restoredStartedAt);
  };

  const handleStudentSubmit = async (auto = false) => {
    if (!activeExam || submitting) return;
    setSubmitting(true);
    const submittingExamId = activeExam.id;
    try {
      const res = await apiRequest<{ message?: string }>(`/api/exams/${submittingExamId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, startedAt }),
      });
      try {
        sessionStorage.removeItem(`shahriar_exam_draft_${submittingExamId}`);
      } catch {
        // ignore
      }
      setActiveExam(null);
      await onReload();
      showToast(
        auto
          ? tr('زمان آزمون به پایان رسید و پاسخ‌ها ثبت شد.', 'Time expired. Exam submitted automatically.')
          : res.message || tr('آزمون با موفقیت ثبت شد.', 'Exam submitted successfully.')
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت آزمون', 'Failed to submit exam'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  latestSubmitRef.current = handleStudentSubmit;

  useEffect(() => {
    if (!activeExam) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam]);

  useEffect(() => {
    if (!activeExam || secondsLeft > 0) return;
    if (autoSubmittedExamRef.current === activeExam.id) return;
    autoSubmittedExamRef.current = activeExam.id;
    void latestSubmitRef.current?.(true);
  }, [activeExam, secondsLeft]);

  const mapDraftForPayload = (q: DraftQuestion) => ({
    type: q.type,
    prompt: q.prompt.trim(),
    options: q.type === 'true_false' ? ['صحیح', 'غلط'] : q.type === 'mcq' ? q.options.map((o) => o.trim()) : [],
    correctIndex: q.type === 'mcq' || q.type === 'true_false' ? q.correctIndex : -1,
    correctText: q.type === 'descriptive' || q.type === 'fill_blank' ? q.correctText.trim() : undefined,
    points: Number(q.points) || 2,
    chapter: q.chapter.trim() || undefined,
    topic: q.topic.trim() || undefined,
    difficulty: q.difficulty,
    explanation: q.explanation.trim() || undefined,
  });

  const isValidDraftQuestion = (q: DraftQuestion) => {
    if (!q.prompt.trim()) return false;
    if (q.type === 'mcq') return q.options.every((o) => o.trim());
    return true;
  };

  const handleCreateExam = async (e: FormEvent) => {
    e.preventDefault();
    const validQs = questions.filter(isValidDraftQuestion);
    if (validQs.length === 0) {
      showToast(
        tr('حداقل یک سؤال کامل وارد کنید (در سؤالات تستی هر ۴ گزینه الزامی است).', 'Please complete at least one question.'),
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          classId: classId || classes[0]?.id,
          subjectId: subjectId || subjects[0]?.id,
          gradeLevel,
          chapter: chapter.trim() || undefined,
          topic: topic.trim() || undefined,
          difficulty,
          durationMinutes: Number(durationMinutes) || 25,
          dueDate: dueDate.trim(),
          questions: validQs.map(mapDraftForPayload),
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setChapter('');
      setTopic('');
      setQuestions([createEmptyQuestion('mcq')]);
      await onReload();
      showToast(tr('آزمون آنلاین ایجاد و منتشر شد.', 'Online exam published.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ایجاد آزمون', 'Failed to create exam'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAIExam = async (e: FormEvent) => {
    e.preventDefault();
    if (aiTypes.length === 0) {
      showToast(tr('حداقل یک نوع سؤال را انتخاب کنید.', 'Select at least one question type.'), 'error');
      return;
    }
    setAiGenerating(true);
    try {
      const targetSubId = aiSubjectId || subjects[0]?.id || '';
      const subName = subjectMap.get(targetSubId) ?? 'ریاضی';
      const res = await apiRequest<{
        questions: Array<{
          type?: ExamQuestionType;
          prompt: string;
          options?: string[];
          correctIndex?: number;
          correctText?: string;
          points?: number;
          chapter?: string;
          topic?: string;
          difficulty?: ExamDifficulty;
          explanation?: string;
        }>;
        message?: string;
      }>('/api/exams/ai-generate', {
        method: 'POST',
        body: JSON.stringify({
          gradeLevel: aiGrade,
          subjectId: targetSubId,
          subjectName: subName,
          chapter: aiChapter.trim(),
          topic: aiTopic.trim(),
          difficulty: aiDifficulty,
          count: Number(aiCount) || 5,
          questionTypes: aiTypes,
        }),
      });

      const mapped: DraftQuestion[] = (res.questions ?? []).map((q) => {
        const qt: ExamQuestionType = q.type || 'mcq';
        return {
          type: qt,
          prompt: q.prompt || '',
          options:
            qt === 'true_false'
              ? ['صحیح', 'غلط']
              : qt === 'mcq'
              ? [0, 1, 2, 3].map((i) => q.options?.[i] ?? '')
              : ['', '', '', ''],
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          correctText: q.correctText ?? '',
          points: Number(q.points) || 2,
          chapter: q.chapter || aiChapter,
          topic: q.topic || aiTopic,
          difficulty: q.difficulty || aiDifficulty,
          explanation: q.explanation ?? '',
        };
      });
      setAiQuestions(mapped);
      if (!aiDraftTitle.trim()) {
        setAiDraftTitle(
          `${tr('آزمون هوشمند', 'Smart Exam')} ${subName}${aiTopic ? ` - ${aiTopic}` : aiChapter ? ` - ${aiChapter}` : ''}`
        );
      }
      showToast(res.message || tr('سؤالات آزمون با هوش مصنوعی تولید شد.', 'AI questions generated.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تولید سؤال با هوش مصنوعی', 'AI generation failed'), 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const handlePublishAiExam = async () => {
    const validQs = aiQuestions.filter(isValidDraftQuestion);
    if (validQs.length === 0) {
      showToast(tr('سؤال معتبری برای انتشار وجود ندارد.', 'No valid questions to publish.'), 'error');
      return;
    }
    setPublishingAi(true);
    try {
      await apiRequest('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          title: aiDraftTitle.trim() || tr('آزمون هوشمند درسی', 'AI Generated Exam'),
          description: `${tr('طراحی‌شده با هوش مصنوعی', 'AI Generated')} · ${difficultyLabel(aiDifficulty)}${aiChapter ? ` · ${aiChapter}` : ''}`,
          classId: aiClassId || classes[0]?.id,
          subjectId: aiSubjectId || subjects[0]?.id,
          gradeLevel: aiGrade,
          chapter: aiChapter.trim() || undefined,
          topic: aiTopic.trim() || undefined,
          difficulty: aiDifficulty,
          generatedByAI: true,
          durationMinutes: Number(aiDraftDuration) || 30,
          dueDate: aiDraftDueDate.trim() || '1404/10/20',
          questions: validQs.map(mapDraftForPayload),
        }),
      });
      setAiQuestions([]);
      setAiDraftTitle('');
      setSubTab('list');
      await onReload();
      showToast(tr('آزمون هوشمند با موفقیت منتشر شد.', 'Smart exam published!'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در انتشار آزمون', 'Failed to publish exam'), 'error');
    } finally {
      setPublishingAi(false);
    }
  };

  const saveQuestionToBank = async (q: DraftQuestion, subId: string, grd: string) => {
    if (!q.prompt.trim() || !subId) {
      showToast(tr('صورت سؤال و درس الزامی است.', 'Prompt and subject are required.'), 'error');
      return;
    }
    try {
      await apiRequest('/api/question-bank', {
        method: 'POST',
        body: JSON.stringify({
          ...mapDraftForPayload(q),
          subjectId: subId,
          gradeLevel: grd,
        }),
      });
      await loadQuestionBank();
      showToast(tr('سؤال در بانک اختصاصی ذخیره شد.', 'Question saved to bank.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ذخیره در بانک سؤال', 'Save failed'), 'error');
    }
  };

  const handleSaveBankModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidDraftQuestion(bankDraft)) {
      showToast(tr('اطلاعات سؤال را کامل وارد کنید.', 'Please complete question fields.'), 'error');
      return;
    }
    setSavingBankItem(true);
    try {
      await saveQuestionToBank(bankDraft, bankSubjectId || subjects[0]?.id || '', bankGradeLevel);
      setBankModalOpen(false);
      setBankDraft(createEmptyQuestion('mcq'));
    } finally {
      setSavingBankItem(false);
    }
  };

  const handleDeleteBankItem = async (id: string) => {
    try {
      await apiRequest(`/api/question-bank/${id}`, { method: 'DELETE' });
      setBankItems((prev) => prev.filter((item) => item.id !== id));
      showToast(tr('سؤال از بانک حذف شد.', 'Deleted from question bank.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف سؤال', 'Delete failed'), 'error');
    }
  };

  const insertBankQuestionIntoManual = (item: TeacherBankQuestion) => {
    const draft: DraftQuestion = {
      type: item.type,
      prompt: item.prompt,
      options:
        item.type === 'true_false'
          ? ['صحیح', 'غلط']
          : item.type === 'mcq'
          ? [0, 1, 2, 3].map((i) => item.options[i] ?? '')
          : ['', '', '', ''],
      correctIndex: item.correctIndex ?? 0,
      correctText: item.correctText ?? '',
      points: item.points || 2,
      chapter: item.chapter ?? '',
      topic: item.topic ?? '',
      difficulty: item.difficulty ?? 'medium',
      explanation: item.explanation ?? '',
    };
    setQuestions((prev) => {
      const onlyBlank = prev.length === 1 && !prev[0].prompt.trim();
      return onlyBlank ? [draft] : [...prev, draft];
    });
    setBankPickerOpen(false);
    if (!createOpen) {
      if (!classId && classes[0]) setClassId(classes[0].id);
      setSubjectId(item.subjectId || subjects[0]?.id || '');
      setGradeLevel(item.gradeLevel || 'هفتم');
      setCreateOpen(true);
    }
    showToast(tr('سؤال به پیش‌نویس آزمون اضافه شد.', 'Question added to exam draft.'));
  };

  const handleDeleteExam = async (id: string) => {
    try {
      await apiRequest(`/api/exams/${id}`, { method: 'DELETE' });
      await onReload();
      showToast(tr('آزمون حذف شد.', 'Exam deleted.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف آزمون', 'Delete failed'), 'error');
    }
  };

  const handleCloneVersions = async (e: FormEvent) => {
    e.preventDefault();
    if (!cloneTarget) return;
    const labels = cloneLabelsText
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length === 0) return;
    setCloning(true);
    try {
      const res = await apiRequest<{ message?: string }>(`/api/exams/${cloneTarget.id}/clone-versions`, {
        method: 'POST',
        body: JSON.stringify({ labels }),
      });
      setCloneTarget(null);
      await onReload();
      showToast(res.message || tr('نسخه‌های متفاوت ساخته شد.', 'Exam versions cloned.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ساخت نسخه‌ها', 'Clone failed'), 'error');
    } finally {
      setCloning(false);
    }
  };

  const openAttemptsModal = async (ex: EnrichedExam) => {
    setAttemptsTarget(ex);
    setSelectedAttempt(null);
    setLoadingAttempts(true);
    try {
      const res = await apiRequest<{ exam: OnlineExam; attempts: ExamAttempt[] }>(`/api/exams/${ex.id}/attempts`);
      const list = res.attempts ?? [];
      setAttemptsList(list);
      if (list[0]) selectAttemptForGrading(ex, list[0]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت برگه‌ها', 'Failed to load attempts'), 'error');
    } finally {
      setLoadingAttempts(false);
    }
  };

  const selectAttemptForGrading = (ex: OnlineExam, att: ExamAttempt) => {
    setSelectedAttempt(att);
    const next: Record<string, { score: string; comment: string }> = {};
    ex.questions.forEach((q, idx) => {
      const det = att.questionScores?.find((d) => d.questionId === q.id) ?? att.questionScores?.[idx];
      next[q.id] = {
        score: String(det?.finalScore ?? 0),
        comment: det?.teacherComment ?? '',
      };
    });
    setGradeDrafts(next);
  };

  const handleSubmitManualGrading = async (e: FormEvent) => {
    e.preventDefault();
    if (!attemptsTarget || !selectedAttempt) return;
    setSavingGrading(true);
    try {
      const scores = attemptsTarget.questions.map((q) => ({
        questionId: q.id,
        finalScore: Number(gradeDrafts[q.id]?.score ?? 0),
        teacherComment: gradeDrafts[q.id]?.comment?.trim() || undefined,
      }));
      const res = await apiRequest<{ attempt: ExamAttempt; message?: string }>(
        `/api/exams/${attemptsTarget.id}/attempts/${selectedAttempt.id}/grade`,
        {
          method: 'POST',
          body: JSON.stringify({ scores }),
        }
      );
      setAttemptsList((prev) => prev.map((a) => (a.id === res.attempt.id ? res.attempt : a)));
      setSelectedAttempt(res.attempt);
      await onReload();
      showToast(res.message || tr('تصحیح برگه ثبت و تأیید شد.', 'Attempt grading saved.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت نمره', 'Grading failed'), 'error');
    } finally {
      setSavingGrading(false);
    }
  };

  const openAnalyticsModal = async (ex: EnrichedExam) => {
    setAnalyticsTarget(ex);
    setAnalyticsData(null);
    setLoadingAnalytics(true);
    try {
      const res = await apiRequest<{ analytics: ExamQualityAnalytics }>(`/api/exams/${ex.id}/analytics`);
      setAnalyticsData(res.analytics);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تحلیل کیفیت آزمون', 'Failed to load analytics'), 'error');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const filteredBankItems = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return bankItems.filter((item) => {
      if (bankFilterSubject !== 'all' && item.subjectId !== bankFilterSubject) return false;
      if (bankFilterType !== 'all' && item.type !== bankFilterType) return false;
      if (!q) return true;
      return (
        item.prompt.toLowerCase().includes(q) ||
        (item.topic ?? '').toLowerCase().includes(q) ||
        (item.chapter ?? '').toLowerCase().includes(q)
      );
    });
  }, [bankItems, bankFilterSubject, bankFilterType, bankSearch]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return fmtDigits(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
  };

  const renderQuestionDraftEditor = (
    q: DraftQuestion,
    qi: number,
    list: DraftQuestion[],
    setList: (updater: (prev: DraftQuestion[]) => DraftQuestion[]) => void,
    saveSubjectId: string,
    saveGradeLevel: string
  ) => (
    <div key={qi} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
            {tr('سؤال', 'Q')} {fmtDigits(qi + 1)}
          </span>
          <select
            value={q.type}
            onChange={(e) => {
              const nextType = e.target.value as ExamQuestionType;
              setList((prev) =>
                prev.map((item, idx) =>
                  idx === qi
                    ? {
                        ...item,
                        type: nextType,
                        options: nextType === 'true_false' ? ['صحیح', 'غلط'] : ['', '', '', ''],
                        correctIndex: 0,
                      }
                    : item
                )
              );
            }}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
          >
            <option value="mcq">{tr('چهارگزینه‌ای', 'Multiple Choice')}</option>
            <option value="true_false">{tr('صحیح و غلط', 'True / False')}</option>
            <option value="fill_blank">{tr('جای‌خالی', 'Fill in the Blank')}</option>
            <option value="descriptive">{tr('تشریحی', 'Descriptive')}</option>
          </select>
          <input
            type="text"
            placeholder={tr('مبحث سؤال (برای تحلیل کیفیت)', 'Topic')}
            value={q.topic}
            onChange={(e) =>
              setList((prev) => prev.map((item, idx) => (idx === qi ? { ...item, topic: e.target.value } : item)))
            }
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs w-36"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500">{tr('بارم:', 'Pts:')}</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={q.points}
            onChange={(e) =>
              setList((prev) =>
                prev.map((item, idx) => (idx === qi ? { ...item, points: Number(e.target.value) || 1 } : item))
              )
            }
            className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs tabular-nums"
          />
          <button
            type="button"
            onClick={() => void saveQuestionToBank(q, saveSubjectId, saveGradeLevel)}
            title={tr('ذخیره در بانک سؤال اختصاصی', 'Save to personal question bank')}
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <BookMarked className="w-3.5 h-3.5" />
          </button>
          {list.length > 1 && (
            <button
              type="button"
              onClick={() => setList((prev) => prev.filter((_, idx) => idx !== qi))}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <textarea
        rows={2}
        required
        placeholder={tr('صورت سؤال را بنویسید...', 'Question prompt...')}
        value={q.prompt}
        onChange={(e) =>
          setList((prev) => prev.map((item, idx) => (idx === qi ? { ...item, prompt: e.target.value } : item)))
        }
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
      />

      {q.type === 'mcq' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`correct_${qi}_${q.type}`}
                checked={q.correctIndex === oi}
                onChange={() =>
                  setList((prev) => prev.map((item, idx) => (idx === qi ? { ...item, correctIndex: oi } : item)))
                }
                title={tr('گزینه صحیح', 'Correct option')}
              />
              <input
                type="text"
                required
                placeholder={`${tr('گزینه', 'Option')} ${fmtDigits(oi + 1)}`}
                value={opt}
                onChange={(e) =>
                  setList((prev) =>
                    prev.map((item, idx) =>
                      idx === qi
                        ? { ...item, options: item.options.map((o, k) => (k === oi ? e.target.value : o)) }
                        : item
                    )
                  )
                }
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {q.type === 'true_false' && (
        <div className="flex items-center gap-4 text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">{tr('پاسخ صحیح:', 'Correct Answer:')}</span>
          {['صحیح', 'غلط'].map((lbl, oi) => (
            <label key={lbl} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`tf_${qi}`}
                checked={q.correctIndex === oi}
                onChange={() =>
                  setList((prev) => prev.map((item, idx) => (idx === qi ? { ...item, correctIndex: oi } : item)))
                }
              />
              <span>{lbl}</span>
            </label>
          ))}
        </div>
      )}

      {(q.type === 'fill_blank' || q.type === 'descriptive') && (
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
            {q.type === 'fill_blank'
              ? tr('پاسخ دقیق جای‌خالی (برای تصحیح خودکار)', 'Exact expected blank answer (auto-graded)')
              : tr('پاسخ نمونه / کلید تصحیح دبیر (تصحیح با تأیید معلم)', 'Model answer / grading key (teacher review)')}
          </label>
          <input
            type="text"
            value={q.correctText}
            onChange={(e) =>
              setList((prev) => prev.map((item, idx) => (idx === qi ? { ...item, correctText: e.target.value } : item)))
            }
            placeholder={q.type === 'fill_blank' ? tr('مثلاً ۲۴', 'e.g. 24') : tr('نکات کلیدی پاسخ تشریحی...', 'Key points expected...')}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header + Sub-Navigation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {tr('آزمون‌های آنلاین و ارزشیابی هوشمند', 'Online Exams & Smart Assessment Center')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isLearnerSide
                ? tr(
                    'آزمون‌های فعال را در زمان تعیین‌شده پاسخ دهید و کارنامه و تحلیل سؤالات خود را مشاهده کنید.',
                    'Take active timed exams with auto-grading and review detailed feedback.'
                  )
                : tr(
                    'طراحی دستی و هوشمند آزمون (چهارگزینه‌ای، تشریحی، جای‌خالی، صحیح/غلط)، ساخت چند نسخه، تصحیح تشریحی و تحلیل کیفیت سؤالات.',
                    'Manual & AI exam authoring, personal question bank, multi-version cloning, descriptive grading, and question quality analytics.'
                  )}
            </p>
          </div>

          {canCreate && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!classId && classes[0]) setClassId(classes[0].id);
                  if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('طراحی دستی آزمون', 'Manual Exam')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('ai_builder')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                <span>{tr('طراحی آزمون با هوش مصنوعی', 'AI Exam Builder')}</span>
              </button>
            </div>
          )}
        </div>

        {!isLearnerSide && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 overflow-x-auto">
            {[
              { id: 'list' as const, label: tr('فهرست آزمون‌ها', 'Exam List'), icon: FileQuestion },
              { id: 'ai_builder' as const, label: tr('تولید آزمون هوشمند', 'AI Generator'), icon: Sparkles },
              { id: 'bank' as const, label: tr('بانک سؤال اختصاصی', 'Question Bank'), icon: BookMarked },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    subTab === t.id
                      ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* SUB-TAB 1: EXAMS LIST */}
      {(isLearnerSide || subTab === 'list') && (
        <>
          {exams.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-14 px-4 text-center">
              <FileQuestion className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {tr('هنوز آزمون آنلاینی ثبت نشده است', 'No online exams available yet')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isLearnerSide
                  ? tr('پس از انتشار آزمون توسط دبیران، در این صفحه نمایش داده می‌شود.', 'Exams published by teachers appear here.')
                  : tr('می‌توانید به‌صورت دستی یا با کمک هوش مصنوعی اولین آزمون را طراحی کنید.', 'Create a manual or AI-generated exam above.')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.map((ex) => {
                const totalPts = ex.questions.reduce((s, q) => s + (q.points || 1), 0);
                const attempt = ex.myAttempt;
                const hasDescriptive = ex.questions.some((q) => q.type === 'descriptive');
                return (
                  <div
                    key={ex.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-[#0F274A] dark:text-sky-400">
                              {subjectMap.get(ex.subjectId) ?? tr('درس', 'Subject')}
                            </span>
                            <span>·</span>
                            <span>
                              {tr('کلاس', 'Class')} {classMap.get(ex.classId) ?? '—'}
                            </span>
                            {ex.versionLabel && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                                {ex.versionLabel}
                              </span>
                            )}
                            {ex.generatedByAI && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold">
                                {tr('هوش مصنوعی', 'AI')}
                              </span>
                            )}
                            {ex.difficulty && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                {difficultyLabel(ex.difficulty)}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1.5">{ex.title}</h3>
                        </div>
                        {(user.role === 'admin' || ex.teacherId === user.id) && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteExam(ex.id)}
                            aria-label={tr('حذف آزمون', 'Delete exam')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {ex.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-5">{ex.description}</p>
                      )}
                      {(ex.chapter || ex.topic) && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                          {[ex.chapter, ex.topic].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {fmtDigits(ex.durationMinutes)} {tr('دقیقه', 'min')}
                        </span>
                        <span>·</span>
                        <span>
                          {fmtDigits(ex.questions.length)} {tr('سؤال', 'questions')}
                        </span>
                        <span>·</span>
                        <span>
                          {tr('بارم:', 'Max:')} {fmtDigits(totalPts)}
                        </span>
                        <span>·</span>
                        <span>{fmtDate(ex.dueDate)}</span>
                        {hasDescriptive && (
                          <>
                            <span>·</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {tr('شامل سؤال تشریحی', 'Has descriptive')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {isLearnerSide ? (
                      attempt ? (
                        <div className="space-y-2">
                          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                              <CheckCircle2 className="w-4 h-4" />
                              {attempt.needsManualGrading
                                ? tr('ثبت‌شده (در انتظار تصحیح تشریحی)', 'Submitted (Pending Teacher Review)')
                                : tr('تکمیل شده', 'Completed')}
                            </span>
                            <span className="font-extrabold text-emerald-900 dark:text-emerald-200 tabular-nums">
                              {tr('نمره:', 'Score:')} {fmtNum(attempt.score)} / {fmtDigits(attempt.maxScore)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReviewExam(ex)}
                            className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{tr('مشاهده پاسخ‌ها و تحلیل سؤال', 'Review Answers & Solutions')}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startExam(ex)}
                          className="w-full py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors"
                        >
                          {tr('شروع آزمون آنلاین', 'Start Timed Exam')}
                        </button>
                      )
                    ) : (
                      <div className="space-y-2.5">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                          <span>
                            {tr('شرکت‌کنندگان:', 'Attempts:')} {fmtDigits(ex.attemptsCount ?? 0)}
                          </span>
                          {(ex.pendingManualCount ?? 0) > 0 && (
                            <span className="text-amber-700 dark:text-amber-400 font-bold">
                              {fmtDigits(ex.pendingManualCount ?? 0)} {tr('برگه منتظر تصحیح', 'pending review')}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 font-bold text-[#0F274A] dark:text-sky-300">
                            <Award className="w-3.5 h-3.5" />
                            {tr('میانگین:', 'Avg:')} {ex.attemptsCount ? fmtNum(ex.averageScore) : '—'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => void openAttemptsModal(ex)}
                            className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400 shrink-0" />
                            <span>{tr('برگه‌ها و تصحیح', 'Grade')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void openAnalyticsModal(ex)}
                            className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{tr('تحلیل کیفیت', 'Quality')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCloneTarget(ex)}
                            className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span>{tr('چند نسخه', 'Clone')}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SUB-TAB 2: AI EXAM GENERATOR */}
      {!isLearnerSide && subTab === 'ai_builder' && (
        <div className="space-y-5">
          <form
            onSubmit={handleGenerateAIExam}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
              <span>{tr('تولید خودکار آزمون استاندارد با هوش مصنوعی', 'AI Exam & Question Generator')}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('پایه تحصیلی', 'Grade Level')}</label>
                <select
                  value={aiGrade}
                  onChange={(e) => setAiGrade(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                >
                  {GRADE_LEVELS_FA.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('درس', 'Subject')}</label>
                <select
                  value={aiSubjectId}
                  onChange={(e) => setAiSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('فصل درسی', 'Chapter')}</label>
                <input
                  type="text"
                  value={aiChapter}
                  onChange={(e) => setAiChapter(e.target.value)}
                  placeholder={tr('مثلاً فصل ۲: معادله و نامعادله', 'e.g. Chapter 2')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('مبحث دقیق', 'Specific Topic')}</label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder={tr('مثلاً حل معادله درجه دوم با دلتا', 'e.g. Quadratic discriminant')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('سطح دشواری', 'Difficulty')}</label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as ExamDifficulty)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                >
                  <option value="easy">{tr('ساده (آموزشی)', 'Easy')}</option>
                  <option value="medium">{tr('متوسط (استاندارد مدرسه)', 'Medium')}</option>
                  <option value="hard">{tr('دشوار (تکمیلی)', 'Hard')}</option>
                  <option value="olympiad">{tr('تیزهوشان و المپیادی', 'Olympiad')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">{tr('تعداد سؤال', 'Number of Questions')}</label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={aiCount}
                  onChange={(e) => setAiCount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={aiGenerating}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{aiGenerating ? tr('در حال طراحی سؤالات...', 'Generating...') : tr('تولید سؤالات با هوش مصنوعی', 'Generate Questions')}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{tr('انواع سؤال در آزمون:', 'Question Types:')}</span>
              {(['mcq', 'descriptive', 'fill_blank', 'true_false'] as ExamQuestionType[]).map((qt) => {
                const checked = aiTypes.includes(qt);
                return (
                  <label key={qt} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setAiTypes((prev) => (e.target.checked ? [...prev, qt] : prev.filter((x) => x !== qt)))
                      }
                    />
                    <span>{typeLabel(qt)}</span>
                  </label>
                );
              })}
            </div>
          </form>

          {aiQuestions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {tr('بازبینی، ویرایش و انتشار آزمون هوشمند', 'Review & Publish AI Exam')} ({fmtDigits(aiQuestions.length)})
                </h4>
                <button
                  type="button"
                  onClick={() => setAiQuestions((prev) => [...prev, createEmptyQuestion('mcq')])}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  + {tr('افزودن سؤال دستی', 'Add Question')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">{tr('عنوان آزمون', 'Exam Title')}</label>
                  <input
                    type="text"
                    value={aiDraftTitle}
                    onChange={(e) => setAiDraftTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">{tr('کلاس هدف', 'Target Class')}</label>
                  <select
                    value={aiClassId}
                    onChange={(e) => setAiClassId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">{tr('مدت (دقیقه)', 'Duration (min)')}</label>
                  <input
                    type="number"
                    min={5}
                    value={aiDraftDuration}
                    onChange={(e) => setAiDraftDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">{tr('مهلت برگزاری', 'Due Date')}</label>
                  <input
                    type="text"
                    value={aiDraftDueDate}
                    onChange={(e) => setAiDraftDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {aiQuestions.map((q, qi) =>
                  renderQuestionDraftEditor(q, qi, aiQuestions, setAiQuestions, aiSubjectId || subjects[0]?.id || '', aiGrade)
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={publishingAi}
                  onClick={() => void handlePublishAiExam()}
                  className="px-5 py-2.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
                >
                  {publishingAi ? tr('در حال انتشار...', 'Publishing...') : tr('تأیید و انتشار آزمون برای کلاس', 'Approve & Publish Exam')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: PERSONAL TEACHER QUESTION BANK */}
      {!isLearnerSide && subTab === 'bank' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {tr('بانک سؤال اختصاصی دبیر', 'Personal Teacher Question Bank')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr('سؤالات برگزیده خود را دسته‌بندی کنید و در طراحی آزمون‌های جدید از آن‌ها استفاده کنید.', 'Organize reusable questions across all formats for instant exam assembly.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBankDraft(createEmptyQuestion('mcq'));
                if (!bankSubjectId && subjects[0]) setBankSubjectId(subjects[0].id);
                setBankModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('افزودن سؤال به بانک', 'Add Bank Question')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder={tr('جستجو در متن سؤال، فصل یا مبحث...', 'Search prompt, chapter or topic...')}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
            <select
              value={bankFilterSubject}
              onChange={(e) => setBankFilterSubject(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              <option value="all">{tr('همه دروس', 'All Subjects')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={bankFilterType}
              onChange={(e) => setBankFilterType(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            >
              <option value="all">{tr('همه انواع سؤال', 'All Types')}</option>
              <option value="mcq">{typeLabel('mcq')}</option>
              <option value="true_false">{typeLabel('true_false')}</option>
              <option value="fill_blank">{typeLabel('fill_blank')}</option>
              <option value="descriptive">{typeLabel('descriptive')}</option>
            </select>
          </div>

          {loadingBank ? (
            <div className="py-10 text-center text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              {tr('در حال بارگذاری بانک سؤال...', 'Loading question bank...')}
            </div>
          ) : filteredBankItems.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-500">
              {tr('هنوز سؤالی مطابق فیلتر در بانک سؤال وجود ندارد.', 'No questions found in your bank.')}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBankItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-[#0F274A] dark:text-sky-400">{typeLabel(item.type)}</span>
                      <span>·</span>
                      <span>{subjectMap.get(item.subjectId) ?? tr('درس', 'Subject')}</span>
                      <span>·</span>
                      <span>{item.gradeLevel}</span>
                      <span>·</span>
                      <span>{difficultyLabel(item.difficulty)}</span>
                      {item.topic && (
                        <>
                          <span>·</span>
                          <span>{item.topic}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.prompt}</p>
                    {item.options.length > 0 && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {tr('پاسخ صحیح:', 'Answer:')} {item.options[item.correctIndex] ?? '—'}
                      </p>
                    )}
                    {item.correctText && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {tr('کلید:', 'Key:')} {item.correctText}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => insertBankQuestionIntoManual(item)}
                      className="px-3 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-[11px] font-semibold hover:bg-[#163663]"
                    >
                      {tr('افزودن به آزمون', 'Use in Exam')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBankItem(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TIMED EXAM MODAL (Student / Parent) */}
      <Modal
        open={Boolean(activeExam)}
        onClose={() => setActiveExam(null)}
        title={activeExam?.title ?? ''}
        maxWidthClass="max-w-2xl"
      >
        {activeExam && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                {tr('زمان باقی‌مانده آزمون', 'Remaining Time')}
              </span>
              <span className="font-mono font-extrabold text-sm text-amber-950 dark:text-amber-100 tabular-nums">
                {formatTimer(secondsLeft)}
              </span>
            </div>

            <div className="space-y-4">
              {activeExam.questions.map((q, qi) => {
                const qType: ExamQuestionType = q.type || 'mcq';
                return (
                  <div
                    key={q.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold text-[#0F274A] dark:text-sky-400">
                          {typeLabel(qType)}{q.topic ? ` · ${q.topic}` : ''}
                        </span>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {fmtDigits(qi + 1)}. {q.prompt}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                        ({fmtDigits(q.points)} {tr('نمره', 'pts')})
                      </span>
                    </div>

                    {(qType === 'mcq' || qType === 'true_false') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oi) => {
                          const selected = answers[qi] === oi;
                          return (
                            <button
                              key={oi}
                              type="button"
                              onClick={() =>
                                setAnswers((prev) => {
                                  const next = [...prev];
                                  next[qi] = oi;
                                  return next;
                                })
                              }
                              className={`p-2.5 rounded-lg border text-xs font-medium text-start transition-colors ${
                                selected
                                  ? 'bg-[#0F274A] dark:bg-sky-600 text-white border-[#0F274A] dark:border-sky-600'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-[#0F274A]'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {qType === 'fill_blank' && (
                      <input
                        type="text"
                        value={String(answers[qi] ?? '')}
                        onChange={(e) =>
                          setAnswers((prev) => {
                            const next = [...prev];
                            next[qi] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={tr('عبارت یا عدد جای‌خالی را وارد کنید...', 'Enter blank answer...')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                    )}

                    {qType === 'descriptive' && (
                      <textarea
                        rows={3}
                        value={String(answers[qi] ?? '')}
                        onChange={(e) =>
                          setAnswers((prev) => {
                            const next = [...prev];
                            next[qi] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={tr('پاسخ تشریحی کامل و مراحل حل خود را بنویسید...', 'Write your detailed descriptive answer...')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveExam(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {tr('انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleStudentSubmit(false)}
                className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
              >
                {submitting ? tr('در حال ثبت...', 'Submitting...') : tr('ثبت نهایی و دریافت نمره', 'Submit Exam')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* STUDENT ATTEMPT REVIEW MODAL */}
      <Modal
        open={Boolean(reviewExam && reviewExam.myAttempt)}
        onClose={() => setReviewExam(null)}
        title={reviewExam ? `${tr('کارنامه و مرور سؤالات:', 'Attempt Review:')} ${reviewExam.title}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {reviewExam && reviewExam.myAttempt && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs tabular-nums">
              <span className="font-semibold">
                {reviewExam.myAttempt.needsManualGrading
                  ? tr('وضعیت: سؤالات تستی تصحیح شده و بخش تشریحی منتظر تأیید دبیر است.', 'Objective questions auto-graded; descriptive answers awaiting teacher confirmation.')
                  : tr('وضعیت: تصحیح نهایی تکمیل شده', 'Status: Final Grading Completed')}
              </span>
              <span className="font-extrabold text-[#0F274A] dark:text-sky-300">
                {fmtNum(reviewExam.myAttempt.score)} / {fmtDigits(reviewExam.myAttempt.maxScore)}
              </span>
            </div>

            {reviewExam.questions.map((q, qi) => {
              const det = reviewExam.myAttempt?.questionScores?.[qi];
              const ans = reviewExam.myAttempt?.answers[qi];
              const ansDisplay =
                typeof ans === 'number'
                  ? q.options[ans] ?? tr('بدون پاسخ', 'Unanswered')
                  : String(ans || '').trim() || tr('بدون پاسخ', 'Unanswered');
              const expectedDisplay =
                q.type === 'descriptive' || q.type === 'fill_blank'
                  ? q.correctText
                  : q.options[q.correctIndex];
              return (
                <div key={q.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {fmtDigits(qi + 1)}. {q.prompt}
                    </p>
                    <span className="font-bold tabular-nums shrink-0 text-[#0F274A] dark:text-sky-300">
                      {det?.needsReview
                        ? tr('در انتظار دبیر', 'Pending')
                        : `${fmtNum(det?.finalScore ?? 0)} / ${fmtDigits(q.points)}`}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{tr('پاسخ شما:', 'Your Answer:')}</span> {ansDisplay}
                  </p>
                  {expectedDisplay && (
                    <p className="text-emerald-700 dark:text-emerald-400">
                      <span className="font-semibold">{tr('پاسخ صحیح / معیار:', 'Expected:')}</span> {expectedDisplay}
                    </p>
                  )}
                  {det?.teacherComment && (
                    <p className="text-indigo-700 dark:text-indigo-300">
                      <span className="font-semibold">{tr('بازخورد دبیر:', 'Teacher Note:')}</span> {det.teacherComment}
                    </p>
                  )}
                  {q.explanation && (
                    <p className="text-slate-500 dark:text-slate-400">{q.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* MANUAL EXAM CREATION MODAL (Teacher / Admin / Deputy) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={tr('طراحی آزمون آنلاین جدید', 'Create New Online Exam')}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleCreateExam} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">{tr('عنوان آزمون', 'Exam Title')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">{tr('مهلت / تاریخ برگزاری', 'Due Date')}</label>
              <input
                type="text"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('کلاس', 'Class')}</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('درس', 'Subject')}</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('پایه', 'Grade')}</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('مدت (دقیقه)', 'Duration')}</label>
              <input
                type="number"
                min={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('فصل', 'Chapter')}</label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('مبحث', 'Topic')}</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('سطح دشواری', 'Difficulty')}</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ExamDifficulty)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
              >
                <option value="easy">{difficultyLabel('easy')}</option>
                <option value="medium">{difficultyLabel('medium')}</option>
                <option value="hard">{difficultyLabel('hard')}</option>
                <option value="olympiad">{difficultyLabel('olympiad')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('توضیحات (اختیاری)', 'Description (optional)')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold">{tr('سؤالات آزمون (چهارگزینه‌ای، تشریحی، جای‌خالی، صحیح/غلط)', 'Exam Questions')}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBankPickerOpen((v) => !v)}
                  className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:underline"
                >
                  {tr('درج از بانک سؤال', 'Insert from Bank')} ({fmtDigits(bankItems.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => [...prev, createEmptyQuestion('mcq')])}
                  className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                >
                  + {tr('افزودن سؤال', 'Add Question')}
                </button>
              </div>
            </div>

            {bankPickerOpen && (
              <div className="p-3 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30 max-h-48 overflow-y-auto space-y-1.5">
                {bankItems.length === 0 ? (
                  <p className="text-xs text-slate-500">{tr('بانک سؤال شما خالی است.', 'Question bank is empty.')}</p>
                ) : (
                  bankItems.map((bi) => (
                    <div key={bi.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800 text-xs">
                      <span className="truncate">{bi.prompt}</span>
                      <button
                        type="button"
                        onClick={() => insertBankQuestionIntoManual(bi)}
                        className="px-2 py-1 rounded bg-[#0F274A] dark:bg-sky-600 text-white text-[11px] shrink-0"
                      >
                        {tr('درج', 'Add')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {questions.map((q, qi) =>
              renderQuestionDraftEditor(q, qi, questions, setQuestions, subjectId || subjects[0]?.id || '', gradeLevel)
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
            >
              {saving ? tr('در حال ذخیره...', 'Saving...') : tr('انتشار آزمون', 'Publish Exam')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ADD TO QUESTION BANK MODAL */}
      <Modal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title={tr('افزودن سؤال به بانک اختصاصی', 'Add Question to Personal Bank')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveBankModal} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('درس', 'Subject')}</label>
              <select
                value={bankSubjectId}
                onChange={(e) => setBankSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('پایه تحصیلی', 'Grade Level')}</label>
              <select
                value={bankGradeLevel}
                onChange={(e) => setBankGradeLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              >
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          {renderQuestionDraftEditor(
            bankDraft,
            0,
            [bankDraft],
            (updater) => setBankDraft((prev) => updater([prev])[0] ?? prev),
            bankSubjectId || subjects[0]?.id || '',
            bankGradeLevel
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBankModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingBankItem}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {savingBankItem ? tr('در حال ذخیره...', 'Saving...') : tr('ذخیره در بانک سؤال', 'Save to Bank')}
            </button>
          </div>
        </form>
      </Modal>

      {/* CLONE MULTI-VERSION MODAL */}
      <Modal
        open={Boolean(cloneTarget)}
        onClose={() => setCloneTarget(null)}
        title={tr('ساخت چند نسخه متفاوت از آزمون', 'Clone Randomized Exam Versions')}
      >
        <form onSubmit={handleCloneVersions} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-6">
            {tr(
              'با ساخت نسخه‌های متفاوت، ترتیب سؤالات و گزینه‌های تستی به‌صورت خودکار و تصادفی برای جلوگیری از تقلب بازچینی می‌شوند.',
              'Questions and multiple-choice options are automatically shuffled across each cloned version.'
            )}
          </p>
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              {tr('نام نسخه‌ها (با ویرگول جدا کنید)', 'Version labels (comma separated)')}
            </label>
            <input
              type="text"
              required
              value={cloneLabelsText}
              onChange={(e) => setCloneLabelsText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCloneTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={cloning}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {cloning ? tr('در حال ساخت...', 'Cloning...') : tr('ساخت نسخه‌ها', 'Create Versions')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ATTEMPTS & DESCRIPTIVE GRADING MODAL */}
      <Modal
        open={Boolean(attemptsTarget)}
        onClose={() => setAttemptsTarget(null)}
        title={attemptsTarget ? `${tr('برگه‌ها و تصحیح:', 'Attempts & Grading:')} ${attemptsTarget.title}` : ''}
        maxWidthClass="max-w-3xl"
      >
        {attemptsTarget && (
          <div className="space-y-4">
            {loadingAttempts ? (
              <div className="py-10 text-center text-xs text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                {tr('در حال بارگذاری برگه‌های پاسخ...', 'Loading attempts...')}
              </div>
            ) : attemptsList.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                {tr('هنوز دانش‌آموزی در این آزمون شرکت نکرده است.', 'No student attempts submitted yet.')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4 space-y-2 border-e border-slate-200 dark:border-slate-800 pe-2">
                  {attemptsList.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => selectAttemptForGrading(attemptsTarget, att)}
                      className={`w-full text-start p-2.5 rounded-lg border text-xs transition-colors ${
                        selectedAttempt?.id === att.id
                          ? 'bg-[#0F274A] dark:bg-sky-600 text-white border-[#0F274A]'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold truncate">{att.studentName}</p>
                      <p className="text-[11px] opacity-85 mt-0.5 tabular-nums">
                        {fmtNum(att.score)} / {fmtDigits(att.maxScore)} · {att.needsManualGrading ? tr('منتظر تأیید تشریحی', 'Needs review') : tr('تکمیل‌شده', 'Graded')}
                      </p>
                      <p className="text-[10px] opacity-70 tabular-nums mt-0.5">{fmtDateTime(att.submittedAt)}</p>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmitManualGrading} className="md:col-span-8 space-y-3">
                  {selectedAttempt && (
                    <>
                      {attemptsTarget.questions.map((q, qi) => {
                        const ans = selectedAttempt.answers[qi];
                        const ansText =
                          typeof ans === 'number'
                            ? q.options[ans] ?? tr('بدون پاسخ', 'Unanswered')
                            : String(ans || '').trim() || tr('بدون پاسخ', 'Unanswered');
                        const det = selectedAttempt.questionScores?.[qi];
                        return (
                          <div
                            key={q.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-slate-900 dark:text-white">
                                {fmtDigits(qi + 1)}. {q.prompt} ({typeLabel(q.type)})
                              </p>
                              <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                                {tr('حداکثر:', 'Max:')} {fmtDigits(q.points)}
                              </span>
                            </div>
                            <p className="p-2 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                              <span className="font-semibold">{tr('پاسخ دانش‌آموز:', 'Student:')}</span> {ansText}
                            </p>
                            {q.correctText && (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                {tr('معیار دبیر:', 'Key:')} {q.correctText}
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                              <div>
                                <label className="block text-[10px] font-semibold mb-0.5">
                                  {tr('نمره تأییدشده', 'Final Score')} {det?.needsReview ? ' *' : ''}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={q.points}
                                  step={0.25}
                                  value={gradeDrafts[q.id]?.score ?? '0'}
                                  onChange={(e) =>
                                    setGradeDrafts((prev) => ({
                                      ...prev,
                                      [q.id]: { ...(prev[q.id] ?? { comment: '' }), score: e.target.value },
                                    }))
                                  }
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs tabular-nums"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-semibold mb-0.5">{tr('یادداشت برای دانش‌آموز', 'Teacher Feedback')}</label>
                                <input
                                  type="text"
                                  value={gradeDrafts[q.id]?.comment ?? ''}
                                  onChange={(e) =>
                                    setGradeDrafts((prev) => ({
                                      ...prev,
                                      [q.id]: { ...(prev[q.id] ?? { score: '0' }), comment: e.target.value },
                                    }))
                                  }
                                  placeholder={tr('توضیح کوتاه تصحیح...', 'Optional feedback...')}
                                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={savingGrading}
                          className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
                        >
                          {savingGrading ? tr('در حال ثبت...', 'Saving...') : tr('تأیید و ثبت نمره نهایی برگه', 'Confirm & Save Grading')}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* QUESTION QUALITY ANALYTICS MODAL */}
      <Modal
        open={Boolean(analyticsTarget)}
        onClose={() => setAnalyticsTarget(null)}
        title={analyticsTarget ? `${tr('تحلیل کیفیت سؤالات:', 'Question Quality Analytics:')} ${analyticsTarget.title}` : ''}
        maxWidthClass="max-w-3xl"
      >
        {loadingAnalytics ? (
          <div className="py-10 text-center text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            {tr('در حال محاسبه شاخص‌های کیفیت سؤالات...', 'Analyzing exam quality...')}
          </div>
        ) : analyticsData ? (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3 tabular-nums">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">{tr('تعداد پاسخ‌نامه', 'Attempts')}</p>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {fmtDigits(analyticsData.attemptsCount)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">{tr('میانگین نمره', 'Average Score')}</p>
                <p className="text-base font-extrabold text-[#0F274A] dark:text-sky-300 mt-0.5">
                  {fmtNum(analyticsData.averageScore)} / {fmtDigits(analyticsData.maxScore)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 dark:text-slate-400">{tr('منتظر تصحیح تشریحی', 'Pending Review')}</p>
                <p className="text-base font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                  {fmtDigits(analyticsData.pendingManualCount)}
                </p>
              </div>
            </div>

            {analyticsData.attemptsCount === 0 ? (
              <p className="py-6 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                {tr('پس از شرکت دانش‌آموزان در آزمون، شاخص‌های تحلیل کیفیت هر سؤال در این بخش نمایش داده می‌شود.', 'Question quality diagnostics appear once students submit attempts.')}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 space-y-1">
                    <p className="font-bold text-red-800 dark:text-red-300">
                      {tr('سؤال با بیشترین پاسخ اشتباه', 'Highest Wrong-Answer Rate')}
                    </p>
                    {analyticsData.hardestQuestion ? (
                      <>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {tr('سؤال', 'Q')} {fmtDigits(analyticsData.hardestQuestion.questionIndex + 1)}: {analyticsData.hardestQuestion.prompt}
                        </p>
                        <p className="text-red-700 dark:text-red-400 tabular-nums">
                          {fmtNum(analyticsData.hardestQuestion.wrongRate, 0)}{tr('٪ اشتباه', '% wrong')} ({fmtDigits(analyticsData.hardestQuestion.wrongCount)} {tr('از', 'of')} {fmtDigits(analyticsData.hardestQuestion.totalResponses)})
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500">—</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      {tr('ساده‌ترین / بیش از حد آسان‌ترین سؤال', 'Easiest Question')}
                    </p>
                    {analyticsData.easiestQuestion ? (
                      <>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {tr('سؤال', 'Q')} {fmtDigits(analyticsData.easiestQuestion.questionIndex + 1)}: {analyticsData.easiestQuestion.prompt}
                        </p>
                        <p className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {fmtNum(analyticsData.easiestQuestion.correctRate, 0)}{tr('٪ پاسخ صحیح', '% correct')}
                          {analyticsData.easiestQuestion.correctRate >= 90 ? ` · ${tr('بیش از حد آسان', 'Too Easy')}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500">—</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-1">
                    <p className="font-bold text-amber-900 dark:text-amber-300">
                      {tr('مباحث دارای مشکل بیشتر', 'Most Challenging Topics')}
                    </p>
                    {analyticsData.weakestTopics.length > 0 ? (
                      <ul className="space-y-1">
                        {analyticsData.weakestTopics.slice(0, 3).map((tp) => (
                          <li key={tp.topic} className="flex justify-between gap-2 tabular-nums">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{tp.topic}</span>
                            <span className="text-amber-800 dark:text-amber-300 font-bold">
                              {fmtNum(tp.wrongRate, 0)}{tr('٪ خطا', '% error')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500">{tr('خطای مبحثی قابل توجهی ثبت نشده است.', 'No weak topic flagged.')}</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-1">
                    <p className="font-bold text-indigo-900 dark:text-indigo-300">
                      {tr('پرتکرارترین گزینه انحرافی اشتباه', 'Top Selected Wrong Distractor')}
                    </p>
                    {analyticsData.topDistractorQuestion ? (
                      <>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {tr('سؤال', 'Q')} {fmtDigits(analyticsData.topDistractorQuestion.questionIndex + 1)}: {analyticsData.topDistractorQuestion.prompt}
                        </p>
                        <p className="text-indigo-800 dark:text-indigo-300 tabular-nums">
                          {tr('گزینه «', 'Option "')}{analyticsData.topDistractorQuestion.optionText}{tr('»:', '":')}{' '}
                          {fmtDigits(analyticsData.topDistractorQuestion.selectedCount)} {tr('انتخاب از', 'out of')} {fmtDigits(analyticsData.topDistractorQuestion.totalResponses)}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500">{tr('گزینه اشتباه پرتکراری ثبت نشده است.', 'No dominant distractor detected.')}</p>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 font-bold text-slate-800 dark:text-slate-200">
                    {tr('تحلیل عملکرد تک‌تک سؤالات', 'Per-Question Breakdown')}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {analyticsData.questionStats.map((qs) => (
                      <div key={qs.questionId} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {fmtDigits(qs.questionIndex + 1)}. {qs.prompt}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {typeLabel(qs.type)} · {qs.topic}
                            {qs.mostChosenWrongOptionText
                              ? ` · ${tr('گزینه اشتباه پرتکرار:', 'Top wrong option:')} «${qs.mostChosenWrongOptionText}» (${fmtDigits(qs.mostChosenWrongCount ?? 0)})`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 tabular-nums shrink-0">
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {fmtNum(qs.correctRate, 0)}{tr('٪ صحیح', '%')}
                          </span>
                          <span className="text-red-700 dark:text-red-400 font-bold">
                            {fmtNum(qs.wrongRate, 0)}{tr('٪ اشتباه', '%')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
