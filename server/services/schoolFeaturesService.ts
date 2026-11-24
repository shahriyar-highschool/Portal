import {
  type AcademicHistoryRecord,
  type AppLanguage,
  type Assignment,
  type AssignmentSubmission,
  type AttendanceRecord,
  type CalendarEvent,
  type ExamAttempt,
  type ExamDifficulty,
  type ExamQualityAnalytics,
  type ExamQuestion,
  type ExamQuestionQualityStat,
  type ExamQuestionScoreDetail,
  type ExamQuestionType,
  type GradeRecord,
  type LearningDiagnosisResult,
  type OnlineExam,
  type PracticeExerciseItem,
  type PrivateTutorCitation,
  type PrivateTutorMessage,
  type RemedialPlanItem,
  type RiskCategory,
  type RiskReviewNote,
  type ScheduleSlot,
  type SchoolClass,
  type SchoolSettings,
  type StoredUser,
  type StudentMistakeRecord,
  type StudentRiskAssessment,
  type Subject,
  type TeacherSourceMaterial,
} from '../../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetCollection,
  kvGetJson,
  kvPutJson,
  type SchoolKVStore,
} from '../kv/kvStore.ts';
import { generateId } from '../utils/crypto.ts';
import { completeMokhyarText, streamMokhyarRaw } from './aiService.ts';

function normalizePersianText(text: string): string {
  return String(text || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u200c\u200f]/g, ' ')
    .toLowerCase()
    .trim();
}

function tokenizeQuery(text: string): string[] {
  const stopWords = new Set([
    'از',
    'به',
    'در',
    'با',
    'برای',
    'که',
    'این',
    'آن',
    'یک',
    'است',
    'هست',
    'را',
    'و',
    'یا',
    'چیست',
    'چطور',
    'چگونه',
    'توضیح',
    'بده',
    'لطفا',
    'من',
    'ما',
    'شما',
    'the',
    'is',
    'in',
    'of',
    'to',
    'and',
    'how',
    'what',
  ]);
  return normalizePersianText(text)
    .split(/[^a-z0-9\u0600-\u06ff]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

function extractJsonBlock<T>(rawText: string): T | null {
  const trimmed = rawText.trim();
  const candidates: string[] = [trimmed];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidates.unshift(fenceMatch[1].trim());
  }

  const firstArr = trimmed.indexOf('[');
  const lastArr = trimmed.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    candidates.push(trimmed.slice(firstArr, lastArr + 1));
  }

  const firstObj = trimmed.indexOf('{');
  const lastObj = trimmed.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    candidates.push(trimmed.slice(firstObj, lastObj + 1));
  }

  for (const cand of candidates) {
    try {
      return JSON.parse(cand) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function resolveEffectiveStudentUser(
  _kv: SchoolKVStore,
  user: StoredUser
): Promise<StoredUser> {
  return user;
}

export function retrieveRelevantTutorSources(
  sources: TeacherSourceMaterial[],
  query: string,
  subjectId?: string,
  maxPages = 5
): Array<{
  source: TeacherSourceMaterial;
  pageNumber: number;
  heading?: string;
  content: string;
  score: number;
}> {
  const approved = sources.filter((s) => s.approved);
  const queryTokens = tokenizeQuery(query);
  const scored: Array<{
    source: TeacherSourceMaterial;
    pageNumber: number;
    heading?: string;
    content: string;
    score: number;
  }> = [];

  for (const src of approved) {
    const subjectBoost = subjectId && src.subjectId === subjectId ? 6 : 0;
    const headerText = normalizePersianText(
      `${src.title} ${src.subjectName ?? ''} ${src.chapter ?? ''} ${src.topic ?? ''}`
    );

    for (const page of src.pages) {
      const bodyText = normalizePersianText(`${page.heading ?? ''} ${page.content}`);
      let score = subjectBoost;

      for (const tok of queryTokens) {
        if (headerText.includes(tok)) score += 3;
        if (bodyText.includes(tok)) {
          const matches = bodyText.split(tok).length - 1;
          score += Math.min(5, matches * 2);
        }
      }

      // Include even baseline pages from selected subject if no direct token hits
      if (score > 0 || (subjectId && src.subjectId === subjectId)) {
        scored.push({
          source: src,
          pageNumber: page.pageNumber,
          heading: page.heading,
          content: page.content,
          score,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0 && approved.length > 0) {
    for (const src of approved.slice(0, 2)) {
      if (src.pages[0]) {
        scored.push({
          source: src,
          pageNumber: src.pages[0].pageNumber,
          heading: src.pages[0].heading,
          content: src.pages[0].content,
          score: 0.1,
        });
      }
    }
  }

  return scored.slice(0, maxPages);
}

export function buildCitationsFromRetrieved(
  retrieved: ReturnType<typeof retrieveRelevantTutorSources>
): PrivateTutorCitation[] {
  return retrieved.map((r) => ({
    sourceId: r.source.id,
    sourceTitle: r.source.title,
    pageNumber: r.pageNumber,
    chapter: r.source.chapter,
    excerpt: r.content.slice(0, 170) + (r.content.length > 170 ? '...' : ''),
  }));
}

export async function* streamPrivateTutorResponse(params: {
  aiServerUrl?: string;
  kv: SchoolKVStore;
  user: StoredUser;
  question: string;
  subjectId?: string;
  history: PrivateTutorMessage[];
  lang?: AppLanguage;
  signal?: AbortSignal;
}): AsyncGenerator<{ delta?: string; citations?: PrivateTutorCitation[] }> {
  const [sources, mistakes] = await Promise.all([
    kvGetCollection<TeacherSourceMaterial>(kvGetKV(params.kv), KV_KEYS.TUTOR_SOURCES_INDEX, KV_KEYS.tutorSourceItem),
    kvGetCollection<StudentMistakeRecord>(params.kv, KV_KEYS.MISTAKES_INDEX, KV_KEYS.mistakeItem),
  ]);

  const effectiveUser = await resolveEffectiveStudentUser(params.kv, params.user);
  const retrieved = retrieveRelevantTutorSources(sources, params.question, params.subjectId, 5);
  const citations = buildCitationsFromRetrieved(retrieved);

  yield { citations };

  const studentMistakes = mistakes
    .filter((m) => m.studentId === effectiveUser.id)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sourceBlock =
    retrieved.length > 0
      ? retrieved
          .map(
            (r, idx) =>
              `[منبع ${idx + 1}: عنوان="${r.source.title}" | درس="${r.source.subjectName ?? 'عمومی'}" | فصل="${r.source.chapter ?? '—'}" | صفحه=${r.pageNumber}${r.heading ? ` | تیتر="${r.heading}"` : ''}]\nمتن:\n${r.content}`
          )
          .join('\n\n---\n\n')
      : 'هیچ جزوه یا منبع تأییدشده معلمی متناسب با این درس ثبت نشده است.';

  const mistakesBlock =
    studentMistakes.length > 0
      ? studentMistakes
          .map((m) => `- مبحث «${m.topic}» (${m.mistakeType}) — تکرار: ${m.count} بار`)
          .join('\n')
      : 'هنوز اشتباه پرتکراری ثبت نشده است.';

  const langRule =
    params.lang === 'en'
      ? 'Respond in clear English, while keeping Persian source titles intact in citations.'
      : 'پاسخ را به زبان فارسی دقیق، آموزشی و روان بنویس.';

  const systemPrompt = `تو «معلم خصوصی اختصاصی مدرسه» در دبیرستان استعدادهای درخشان استاد شهریار هستی (این بخش کاملاً مجزا از چت عمومی است).
قوانین حیاتی پاسخ‌دهی:
1. ${langRule}
2. پاسخ خود را **صرفاً بر اساس منابع واقعی و تأییدشده معلمان مدرسه** که در زیر آمده بنویس.
3. در پایان هر بخش یا فرمول مهم، حتماً ارجاع دقیق را به شکل «[منبع: عنوان منبع | صفحه X]» ذکر کن.
4. اگر پاسخ پرسش در منابع تأییدشده مدرسه پیدا نشد، صادقانه اعلام کن که «در جزوه‌های تأییدشده فعلی مدرسه مطلب مستقیمی برای این بخش یافت نشد» و راهنمایی کن معلم منبع مربوطه را اضافه کند؛ از حدس زدن خارج از جزوه خودداری کن.
5. اگر در پرسش دانش‌آموز اشتباه مفهومی یا موضوع دشواری دیده شد، با لحنی تشویق‌کننده نکته صحیح را توضیح بده.
6. برای فرمول‌های علمی از LaTeX استاندارد ($...$ و $$...$$) استفاده کن.

منابع واقعی و تأییدشده معلمان مدرسه:
${sourceBlock}

سوابق اشتباهات پرتکرار این دانش‌آموز:
${mistakesBlock}`;

  const cleanHistory = params.history
    .filter((m) => !m.error && m.content.trim())
    .slice(-10)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content.trim(),
    }));

  for await (const delta of streamMokhyarRaw({
    aiServerUrl: params.aiServerUrl,
    messages: [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: params.question.trim() },
    ],
    signal: params.signal,
  })) {
    yield { delta };
  }
}

function kvGetKV(kv: SchoolKVStore) {
  return kv;
}

export async function recordStudentMistake(
  kv: SchoolKVStore,
  input: {
    studentId: string;
    subjectId?: string;
    subjectName?: string;
    topic: string;
    mistakeType: string;
    questionPrompt?: string;
    studentAnswer?: string;
    expectedAnswer?: string;
    severity?: 'low' | 'medium' | 'high';
  }
): Promise<StudentMistakeRecord> {
  const existing = await kvGetCollection<StudentMistakeRecord>(
    kv,
    KV_KEYS.MISTAKES_INDEX,
    KV_KEYS.mistakeItem
  );
  const topicNorm = normalizePersianText(input.topic);
  const typeNorm = normalizePersianText(input.mistakeType);
  const found = existing.find(
    (m) =>
      m.studentId === input.studentId &&
      normalizePersianText(m.topic) === topicNorm &&
      normalizePersianText(m.mistakeType) === typeNorm
  );
  const now = new Date().toISOString();
  if (found) {
    found.count += 1;
    found.lastOccurredAt = now;
    if (input.questionPrompt) found.questionPrompt = input.questionPrompt;
    if (input.studentAnswer) found.studentAnswer = input.studentAnswer;
    if (input.expectedAnswer) found.expectedAnswer = input.expectedAnswer;
    if (input.severity) found.severity = input.severity;
    await kvPutJson(kv, KV_KEYS.mistakeItem(found.id), found);
    return found;
  }

  const created: StudentMistakeRecord = {
    id: generateId('mst'),
    studentId: input.studentId,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    topic: input.topic.trim(),
    mistakeType: input.mistakeType.trim(),
    questionPrompt: input.questionPrompt?.trim(),
    studentAnswer: input.studentAnswer?.trim(),
    expectedAnswer: input.expectedAnswer?.trim(),
    severity: input.severity ?? 'medium',
    count: 1,
    lastOccurredAt: now,
    createdAt: now,
  };
  await kvPutJson(kv, KV_KEYS.mistakeItem(created.id), created);
  await kvAddToIndex(kv, KV_KEYS.MISTAKES_INDEX, created.id);
  return created;
}

export async function computeLearningDiagnosis(
  kv: SchoolKVStore,
  studentId: string
): Promise<LearningDiagnosisResult> {
  const [grades, subjects, exams, attempts, mistakes, sources] = await Promise.all([
    kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
    kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
    kvGetCollection<StudentMistakeRecord>(kv, KV_KEYS.MISTAKES_INDEX, KV_KEYS.mistakeItem),
    kvGetCollection<TeacherSourceMaterial>(kv, KV_KEYS.TUTOR_SOURCES_INDEX, KV_KEYS.tutorSourceItem),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const myGrades = grades.filter((g) => g.studentId === studentId);
  const myAttempts = attempts.filter((a) => a.studentId === studentId);
  const myMistakes = mistakes
    .filter((m) => m.studentId === studentId)
    .sort((a, b) => b.count - a.count);

  const normScores = myGrades.map((g) => (g.score / (g.maxScore || 20)) * 20);
  const examScores = myAttempts
    .filter((a) => (a.maxScore || 0) > 0)
    .map((a) => (a.score / a.maxScore) * 20);
  const combinedScores = [...normScores, ...examScores];

  const learningLevel: LearningDiagnosisResult['learningLevel'] =
    combinedScores.length === 0
      ? 'در حال ارزیابی اولیه (بدون نمره ثبت‌شده)'
      : (() => {
          const avg = combinedScores.reduce((a, b) => a + b, 0) / combinedScores.length;
          return avg >= 18
            ? 'پیشرفته و المپیادی'
            : avg >= 14.5
            ? 'متوسط و رو به پیشرفت'
            : 'مبتدی و نیازمند مرور پایه';
        })();

  const weakMap = new Map<
    string,
    { topic: string; subjectName: string; evidence: string; priority: 'بالا' | 'متوسط' }
  >();

  // 1. From low grades (< 16)
  for (const g of myGrades) {
    const norm = (g.score / (g.maxScore || 20)) * 20;
    if (norm < 16) {
      const sName = subjectMap.get(g.subjectId)?.name ?? g.subjectName ?? 'درس';
      const topic = g.title || sName;
      weakMap.set(`${sName}:${topic}`, {
        topic,
        subjectName: sName,
        evidence: `نمره ${g.score} از ${g.maxScore} در ${g.title}`,
        priority: norm < 13 ? 'بالا' : 'متوسط',
      });
    }
  }

  // 2. From missed exam questions
  const examMap = new Map(exams.map((e) => [e.id, e]));
  for (const att of myAttempts) {
    const ex = examMap.get(att.examId);
    if (!ex) continue;
    const sName = subjectMap.get(ex.subjectId)?.name ?? 'آزمون';
    ex.questions.forEach((q, idx) => {
      const detail = att.questionScores?.find((d) => d.questionId === q.id);
      const isWrong =
        detail !== undefined
          ? !detail.needsReview && detail.finalScore < q.points * 0.6
          : q.type !== 'descriptive' && att.answers[idx] !== q.correctIndex;
      if (isWrong) {
        const topic = q.topic || ex.topic || ex.title;
        weakMap.set(`${sName}:${topic}`, {
          topic,
          subjectName: sName,
          evidence: `پاسخ نادرست در سؤال «${q.prompt.slice(0, 48)}...»`,
          priority: 'بالا',
        });
      }
    });
  }

  // 3. From recurring mistakes
  for (const m of myMistakes) {
    const sName = m.subjectName || subjectMap.get(m.subjectId ?? '')?.name || 'عمومی';
    if (!weakMap.has(`${sName}:${m.topic}`)) {
      weakMap.set(`${sName}:${m.topic}`, {
        topic: m.topic,
        subjectName: sName,
        evidence: `${m.count} بار تکرار در «${m.mistakeType}»`,
        priority: m.count >= 2 || m.severity === 'high' ? 'بالا' : 'متوسط',
      });
    }
  }

  const approvedSources = sources.filter((s) => s.approved);

  return {
    studentId,
    learningLevel,
    weakTopics: Array.from(weakMap.values()).slice(0, 8),
    recurringMistakes: myMistakes.slice(0, 10),
    recommendedSources: approvedSources.slice(0, 6).map((s) => ({
      sourceId: s.id,
      title: s.title,
      subjectName: s.subjectName,
      pageCount: s.pages.length,
    })),
  };
}

export async function generateAdaptivePracticeWithAI(params: {
  aiServerUrl?: string;
  kv: SchoolKVStore;
  studentId: string;
  topic: string;
  subjectId?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}): Promise<{ exercises: PracticeExerciseItem[]; level: string; learningLevel: string }> {
  const [diagnosis, sources] = await Promise.all([
    computeLearningDiagnosis(params.kv, params.studentId),
    kvGetCollection<TeacherSourceMaterial>(
      params.kv,
      KV_KEYS.TUTOR_SOURCES_INDEX,
      KV_KEYS.tutorSourceItem
    ),
  ]);

  const retrieved = retrieveRelevantTutorSources(sources, params.topic, params.subjectId, 3);
  const diff =
    params.difficulty ??
    (diagnosis.learningLevel.includes('پیشرفته')
      ? 'hard'
      : diagnosis.learningLevel.includes('مبتدی')
      ? 'easy'
      : 'medium');
  const count = Math.min(6, Math.max(2, params.count ?? 3));

  const sourceContext = retrieved
    .map((r) => `منبع «${r.source.title}» صفحه ${r.pageNumber}: ${r.content}`)
    .join('\n\n');

  const systemPrompt = `تو طراح تمرین هوشمند دبیرستان استعدادهای درخشان استاد شهریار هستی.
فقط یک آرایه JSON معتبر (بدون متن اضافه) برگردان.
هر آیتم باید دقیقاً این فیلدها را داشته باشد:
{
  "question": "متن سؤال",
  "type": "mcq" یا "short_answer",
  "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"] (اگر mcq است، وگرنه []),
  "correctIndex": 0,
  "correctAnswer": "متن پاسخ صحیح",
  "explanation": "توضیح آموزشی راه‌حل با اشاره به اشتباهات رایج",
  "topic": "${params.topic}",
  "difficulty": "${diff}",
  "sourceCitation": "عنوان جزوه | صفحه X"
}`;

  const userPrompt = `برای دانش‌آموز با سطح «${diagnosis.learningLevel}» دقیقاً ${count} تمرین درباره مبحث «${params.topic}» با سطح دشواری «${diff}» طراحی کن.
اشتباهات پرتکرار دانش‌آموز: ${diagnosis.recurringMistakes.map((m) => `${m.topic} (${m.mistakeType})`).join('، ') || 'مورد خاصی ثبت نشده'}.
منابع تأییدشده مدرسه:
${sourceContext || 'بر اساس سرفصل استاندارد دبیرستان استعدادهای درخشان طراحی شود.'}`;

  const raw = await completeMokhyarText({
    aiServerUrl: params.aiServerUrl,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJsonBlock<Array<Partial<PracticeExerciseItem>>>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('ساختار تمرین تولیدشده قابل پردازش نبود؛ لطفاً دوباره تلاش کنید.');
  }

  const exercises: PracticeExerciseItem[] = parsed.slice(0, count).map((item) => ({
    id: generateId('prc'),
    question: String(item.question || '').trim(),
    type: item.type === 'short_answer' ? 'short_answer' : 'mcq',
    options: Array.isArray(item.options) ? item.options.map(String) : [],
    correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : 0,
    correctAnswer: String(item.correctAnswer || item.options?.[Number(item.correctIndex || 0)] || '').trim(),
    explanation: String(item.explanation || '').trim(),
    topic: String(item.topic || params.topic).trim(),
    difficulty: (item.difficulty as 'easy' | 'medium' | 'hard') || diff,
    sourceCitation: item.sourceCitation ? String(item.sourceCitation) : undefined,
  }));

  return {
    exercises,
    level: diagnosis.learningLevel,
    learningLevel: diagnosis.learningLevel,
  };
}

export async function generateRemedialPlanWithAI(params: {
  aiServerUrl?: string;
  kv: SchoolKVStore;
  studentId: string;
  focusTopic?: string;
}): Promise<{
  summary: string;
  items: RemedialPlanItem[];
  plan: RemedialPlanItem[];
  diagnosis: LearningDiagnosisResult;
}> {
  const diagnosis = await computeLearningDiagnosis(params.kv, params.studentId);
  const weakSummary =
    diagnosis.weakTopics.map((w) => `- ${w.subjectName} / ${w.topic}: ${w.evidence}`).join('\n') ||
    `- مرور و تثبیت مباحث ${params.focusTopic || 'دروس کلیدی'}`;

  const mistakesSummary =
    diagnosis.recurringMistakes
      .map((m) => `- ${m.topic}: ${m.mistakeType} (${m.count} بار)`)
      .join('\n') || 'ندارد';

  const sourcesSummary =
    diagnosis.recommendedSources.map((s) => `- ${s.title} (${s.pageCount} صفحه)`).join('\n') || 'جزوه‌های درسی';

  const systemPrompt = `تو مشاور آموزشی تدوین برنامه جبرانی دبیرستان استاد شهریار هستی.
فقط یک آرایه JSON معتبر با ۵ تا ۷ گام جبرانی برگردان. هر آیتم شامل:
{
  "dayLabel": "روز اول" ... ,
  "focusTopic": "نام مبحث",
  "activity": "اقدام مشخص و تمرینی",
  "durationMinutes": 45,
  "sourceReference": "مرجع از جزوه یا منبع مدرسه"
}`;

  const userPrompt = `سطح دانش‌آموز: ${diagnosis.learningLevel}
تمرکز درخواستی: ${params.focusTopic || 'تقویت مباحث دارای افت'}
مباحث نیازمند جبران:
${weakSummary}
اشتباهات پرتکرار:
${mistakesSummary}
منابع در دسترس مدرسه:
${sourcesSummary}`;

  const raw = await completeMokhyarText({
    aiServerUrl: params.aiServerUrl,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJsonBlock<Array<Partial<RemedialPlanItem>>>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('برنامه جبرانی قابل تولید نبود؛ لطفاً دوباره تلاش کنید.');
  }

  const plan: RemedialPlanItem[] = parsed.map((p, idx) => ({
    dayLabel: String(p.dayLabel || `گام ${idx + 1}`),
    focusTopic: String(p.focusTopic || params.focusTopic || 'تقویت مفهومی'),
    activity: String(p.activity || 'مطالعه جزوه و حل تمرین'),
    durationMinutes: Math.max(15, Number(p.durationMinutes) || 45),
    sourceReference: p.sourceReference ? String(p.sourceReference) : undefined,
  }));

  const weakNames = diagnosis.weakTopics.slice(0, 3).map((w) => w.topic).join('، ');
  const summary = `برنامه جبرانی ${plan.length} گامه متناسب با سطح «${diagnosis.learningLevel}»${
    params.focusTopic
      ? ` با تمرکز بر «${params.focusTopic}»`
      : weakNames
        ? ` برای تقویت مباحث: ${weakNames}`
        : ''
  } تدوین شد.`;

  return { summary, items: plan, plan, diagnosis };
}

// --- Upgraded Exam Features ---

export async function generateAIExamQuestions(params: {
  aiServerUrl?: string;
  kv: SchoolKVStore;
  gradeLevel: string;
  subjectName: string;
  subjectId?: string;
  chapter: string;
  topic: string;
  difficulty: ExamDifficulty;
  count: number;
  questionTypes: ExamQuestionType[];
}): Promise<ExamQuestion[]> {
  const sources = await kvGetCollection<TeacherSourceMaterial>(
    params.kv,
    KV_KEYS.TUTOR_SOURCES_INDEX,
    KV_KEYS.tutorSourceItem
  );
  const retrieved = retrieveRelevantTutorSources(
    sources,
    `${params.subjectName} ${params.chapter} ${params.topic}`,
    params.subjectId,
    3
  );
  const refText = retrieved.map((r) => `${r.source.title} (ص ${r.pageNumber}): ${r.content}`).join('\n\n');

  const count = Math.min(20, Math.max(1, params.count));
  const types = params.questionTypes.length > 0 ? params.questionTypes : (['mcq'] as ExamQuestionType[]);

  const systemPrompt = `تو طراح آزمون استاندارد دبیرستان استعدادهای درخشان استاد شهریار هستی.
فقط یک آرایه JSON معتبر از سؤالات (بدون متن توضیحی اضافه) تولید کن.
انواع مجاز سؤال در این آزمون: ${types.join(', ')}
قالب دقیق هر عضو آرایه:
{
  "type": "mcq" | "descriptive" | "fill_blank" | "true_false",
  "prompt": "صورت دقیق سؤال (برای fill_blank جای خالی را با ..... نشان بده)",
  "options": ["...", "...", "...", "..."] (برای mcq دقیقاً ۴ گزینه، برای true_false دقیقاً ["صحیح", "غلط"]، برای descriptive و fill_blank آرایه []),
  "correctIndex": 0 (برای mcq بین 0..3، برای true_false عدد 0 برای صحیح و 1 برای غلط، برای descriptive و fill_blank عدد -1),
  "correctText": "پاسخ کوتاه یا کلید تصحیح تشریحی",
  "points": 2,
  "topic": "${params.topic || params.chapter}",
  "chapter": "${params.chapter}",
  "difficulty": "${params.difficulty}",
  "explanation": "توضیح کوتاه راهنما"
}`;

  const userPrompt = `مشخصات آزمون:
- پایه: ${params.gradeLevel}
- درس: ${params.subjectName}
- فصل: ${params.chapter || 'کلی'}
- مبحث: ${params.topic || 'کلی'}
- سطح دشواری: ${params.difficulty}
- تعداد دقیق سؤالات: ${count}
- توزیع انواع سؤالات درخواستی: ${types.join('، ')}
${refText ? `\nمتن جزوات مدرسه برای استناد:\n${refText}` : ''}`;

  const raw = await completeMokhyarText({
    aiServerUrl: params.aiServerUrl,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJsonBlock<Array<Partial<ExamQuestion>>>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('پاسخ هوش مصنوعی ساختار معتبر سؤالات آزمون را نداشت. لطفاً دوباره امتحان کنید.');
  }

  return parsed.slice(0, count).map((q) => {
    const qType: ExamQuestionType =
      q.type === 'descriptive' || q.type === 'fill_blank' || q.type === 'true_false' || q.type === 'mcq'
        ? q.type
        : types[0];
    let options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
    let correctIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;

    if (qType === 'true_false') {
      options = ['صحیح', 'غلط'];
      correctIndex = correctIndex === 1 ? 1 : 0;
    } else if (qType === 'mcq') {
      while (options.length < 4) {
        options.push(`گزینه ${options.length + 1}`);
      }
      options = options.slice(0, 4);
      if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;
    } else {
      options = [];
      correctIndex = -1;
    }

    return {
      id: generateId('q'),
      type: qType,
      prompt: String(q.prompt || 'سؤال آزمون').trim(),
      options,
      correctIndex,
      correctText: q.correctText ? String(q.correctText).trim() : undefined,
      points: Math.max(0.5, Number(q.points) || 2),
      chapter: String(q.chapter || params.chapter || '').trim() || undefined,
      topic: String(q.topic || params.topic || '').trim() || undefined,
      difficulty: q.difficulty || params.difficulty,
      explanation: q.explanation ? String(q.explanation).trim() : undefined,
    };
  });
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cloneExamVersions(
  sourceExam: OnlineExam,
  labels: string[],
  teacherId: string
): OnlineExam[] {
  const groupId = sourceExam.versionGroupId || sourceExam.id;
  const now = new Date().toISOString();

  return labels.map((label) => {
    const shuffledQuestions: ExamQuestion[] = shuffleArray(sourceExam.questions).map((q) => {
      const qType = q.type ?? 'mcq';
      if (qType === 'mcq' && q.options.length > 1) {
        const indexed = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correctIndex }));
        const mixed = shuffleArray(indexed);
        const newCorrectIdx = Math.max(0, mixed.findIndex((m) => m.isCorrect));
        return {
          ...q,
          id: generateId('q'),
          options: mixed.map((m) => m.text),
          correctIndex: newCorrectIdx,
        };
      }
      return { ...q, id: generateId('q') };
    });

    return {
      ...sourceExam,
      id: generateId('exm'),
      title: `${sourceExam.title.replace(/\s*—\s*نسخه.*$/, '')} — ${label}`,
      teacherId,
      versionGroupId: groupId,
      versionLabel: label,
      questions: shuffledQuestions,
      createdAt: now,
    };
  });
}

export function gradeExamSubmission(
  exam: OnlineExam,
  answers: Array<number | string>
): {
  score: number;
  maxScore: number;
  questionScores: ExamQuestionScoreDetail[];
  needsManualGrading: boolean;
} {
  let score = 0;
  let maxScore = 0;
  let needsManualGrading = false;
  const questionScores: ExamQuestionScoreDetail[] = [];

  exam.questions.forEach((q, idx) => {
    const pts = q.points || 1;
    maxScore += pts;
    const qType: ExamQuestionType = q.type ?? 'mcq';
    const ans = answers[idx];

    if (qType === 'descriptive') {
      needsManualGrading = true;
      questionScores.push({
        questionId: q.id,
        autoScore: 0,
        finalScore: 0,
        maxPoints: pts,
        needsReview: true,
      });
      return;
    }

    if (qType === 'fill_blank') {
      const expected = normalizePersianText(q.correctText || '');
      const given = normalizePersianText(typeof ans === 'string' ? ans : String(ans ?? ''));
      const matched = expected.length > 0 && given === expected;
      const ptsEarned = matched ? pts : 0;
      score += ptsEarned;
      questionScores.push({
        questionId: q.id,
        autoScore: ptsEarned,
        finalScore: ptsEarned,
        maxPoints: pts,
        needsReview: false,
        isCorrect: matched,
      });
      return;
    }

    // mcq or true_false
    const numericAns = typeof ans === 'number' ? ans : Number(ans);
    const isCorrect = !Number.isNaN(numericAns) && numericAns === q.correctIndex;
    const ptsEarned = isCorrect ? pts : 0;
    score += ptsEarned;
    questionScores.push({
      questionId: q.id,
      autoScore: ptsEarned,
      finalScore: ptsEarned,
      maxPoints: pts,
      needsReview: false,
      isCorrect,
    });
  });

  return {
    score: Number(score.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    questionScores,
    needsManualGrading,
  };
}

export function analyzeExamQuality(
  exam: OnlineExam,
  attempts: ExamAttempt[]
): ExamQualityAnalytics {
  const attemptsCount = attempts.length;
  const maxScore = exam.questions.reduce((s, q) => s + (q.points || 1), 0);
  const averageScore =
    attemptsCount > 0
      ? Number((attempts.reduce((s, a) => s + a.score, 0) / attemptsCount).toFixed(2))
      : 0;
  const pendingManualCount = attempts.filter((a) => a.needsManualGrading).length;

  const questionStats: ExamQuestionQualityStat[] = exam.questions.map((q, qi) => {
    const qType: ExamQuestionType = q.type ?? 'mcq';
    const pts = q.points || 1;
    let totalResponses = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const optionCounts =
      qType === 'mcq' || qType === 'true_false'
        ? new Array(q.options.length).fill(0)
        : undefined;

    for (const att of attempts) {
      const detail = att.questionScores?.find((d) => d.questionId === q.id);
      const ans = att.answers[qi];

      if (qType === 'descriptive') {
        if (detail && !detail.needsReview) {
          totalResponses += 1;
          if (detail.finalScore >= pts * 0.6) correctCount += 1;
          else wrongCount += 1;
        }
        continue;
      }

      if (qType === 'fill_blank') {
        totalResponses += 1;
        const ok =
          detail !== undefined
            ? Boolean(detail.isCorrect)
            : normalizePersianText(String(ans ?? '')) === normalizePersianText(q.correctText ?? '');
        if (ok) correctCount += 1;
        else wrongCount += 1;
        continue;
      }

      totalResponses += 1;
      const numericAns = typeof ans === 'number' ? ans : Number(ans);
      if (optionCounts && !Number.isNaN(numericAns) && numericAns >= 0 && numericAns < optionCounts.length) {
        optionCounts[numericAns] += 1;
      }
      if (numericAns === q.correctIndex) correctCount += 1;
      else wrongCount += 1;
    }

    const correctRate = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;
    const wrongRate = totalResponses > 0 ? Math.round((wrongCount / totalResponses) * 100) : 0;

    let mostChosenWrongOptionIndex: number | null = null;
    let mostChosenWrongOptionText: string | null = null;
    let mostChosenWrongCount = 0;

    if (optionCounts) {
      optionCounts.forEach((cnt, oi) => {
        if (oi !== q.correctIndex && cnt > mostChosenWrongCount) {
          mostChosenWrongCount = cnt;
          mostChosenWrongOptionIndex = oi;
          mostChosenWrongOptionText = q.options[oi] ?? null;
        }
      });
    }

    return {
      questionId: q.id,
      questionIndex: qi + 1,
      type: qType,
      prompt: q.prompt,
      topic: q.topic || exam.topic || exam.chapter || 'مبحث عمومی',
      totalResponses,
      correctCount,
      wrongCount,
      correctRate,
      wrongRate,
      optionCounts,
      mostChosenWrongOptionIndex,
      mostChosenWrongOptionText,
      mostChosenWrongCount,
    };
  });

  const responded = questionStats.filter((s) => s.totalResponses > 0);
  const hardestQuestion =
    responded.length > 0
      ? [...responded].sort((a, b) => b.wrongCount - a.wrongCount || b.wrongRate - a.wrongRate)[0]
      : null;

  const easiestQuestion =
    responded.length > 0
      ? [...responded].sort((a, b) => b.correctRate - a.correctRate || b.correctCount - a.correctCount)[0]
      : null;

  const topicMap = new Map<string, { questionsCount: number; wrongSum: number; correctSum: number; total: number }>();
  for (const qs of responded) {
    const entry = topicMap.get(qs.topic) ?? { questionsCount: 0, wrongSum: 0, correctSum: 0, total: 0 };
    entry.questionsCount += 1;
    entry.wrongSum += qs.wrongCount;
    entry.correctSum += qs.correctCount;
    entry.total += qs.totalResponses;
    topicMap.set(qs.topic, entry);
  }
  const weakestTopics = Array.from(topicMap.entries())
    .map(([topic, d]) => ({
      topic,
      questionsCount: d.questionsCount,
      wrongRate: d.total > 0 ? Math.round((d.wrongSum / d.total) * 100) : 0,
      correctRate: d.total > 0 ? Math.round((d.correctSum / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.wrongRate - a.wrongRate);

  const distractorCandidate = responded
    .filter((q) => (q.mostChosenWrongCount ?? 0) > 0 && q.mostChosenWrongOptionText)
    .sort((a, b) => (b.mostChosenWrongCount ?? 0) - (a.mostChosenWrongCount ?? 0))[0];

  const topDistractorQuestion = distractorCandidate
    ? {
        questionIndex: distractorCandidate.questionIndex,
        prompt: distractorCandidate.prompt,
        optionText: distractorCandidate.mostChosenWrongOptionText!,
        selectedCount: distractorCandidate.mostChosenWrongCount ?? 0,
        totalResponses: distractorCandidate.totalResponses,
      }
    : null;

  return {
    examId: exam.id,
    examTitle: exam.title,
    attemptsCount,
    averageScore,
    maxScore,
    pendingManualCount,
    questionStats,
    hardestQuestion,
    easiestQuestion,
    weakestTopics,
    topDistractorQuestion,
  };
}

// --- Academic Decline / Risk Prediction ---

export async function computeAcademicRiskReport(
  kv: SchoolKVStore,
  user: StoredUser
): Promise<StudentRiskAssessment[]> {
  const [users, classes, subjects, grades, attendance, assignments, submissions, exams, attempts, notes, settings] =
    await Promise.all([
      kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
      kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
      kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
      kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
      kvGetCollection<Assignment>(kv, KV_KEYS.ASSIGNMENTS_INDEX, KV_KEYS.assignmentItem),
      kvGetCollection<AssignmentSubmission>(kv, KV_KEYS.SUBMISSIONS_INDEX, KV_KEYS.submissionItem),
      kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
      kvGetCollection<ExamAttempt>(kv, KV_KEYS.EXAM_ATTEMPTS_INDEX, KV_KEYS.examAttemptItem),
      kvGetCollection<RiskReviewNote>(kv, KV_KEYS.RISK_NOTES_INDEX, KV_KEYS.riskNoteItem),
      kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS),
    ]);

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const passing = settings?.passingScore ?? 10;

  let targetStudents = users.filter((u) => u.role === 'student' && u.active);
  if (user.role !== 'admin') {
    const allowedClassIds = new Set<string>(user.assignedClassIds ?? []);
    for (const c of classes) {
      if (c.teacherIds.includes(user.id)) allowedClassIds.add(c.id);
    }
    targetStudents = targetStudents.filter((s) => s.classId && allowedClassIds.has(s.classId));
  }

  return targetStudents
    .map((stu) => {
      const stuGrades = grades
        .filter((g) => g.studentId === stu.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const normScores = stuGrades.map((g) => Number(((g.score / (g.maxScore || 20)) * 20).toFixed(2)));
      const avgScore =
        normScores.length > 0
          ? Number((normScores.reduce((a, b) => a + b, 0) / normScores.length).toFixed(2))
          : 0;

      // Consecutive drops across last 3 scores
      let consecutiveDrop = false;
      if (normScores.length >= 3) {
        const last3 = normScores.slice(-3);
        if (last3[1] < last3[0] - 0.75 && last3[2] < last3[1] - 0.75) {
          consecutiveDrop = true;
        }
      } else if (normScores.length === 2 && normScores[1] <= normScores[0] - 2.5) {
        consecutiveDrop = true;
      }

      const stuAtt = attendance.filter((a) => a.studentId === stu.id);
      const absencesCount = stuAtt.filter((a) => a.status === 'absent').length;
      const latesCount = stuAtt.filter((a) => a.status === 'late').length;

      // Subject-specific absences
      const subjectAbsMap = new Map<string, number>();
      for (const a of stuAtt) {
        if (a.status === 'absent' && a.subjectId) {
          const sName = subjectMap.get(a.subjectId) ?? a.subjectName ?? 'درس مشخص';
          subjectAbsMap.set(sName, (subjectAbsMap.get(sName) ?? 0) + 1);
        }
      }

      const clsAssignments = stu.classId ? assignments.filter((a) => a.classId === stu.classId) : [];
      const stuSubs = submissions.filter((s) => s.studentId === stu.id && s.status !== 'pending');
      const assignmentSubmissionRate =
        clsAssignments.length > 0
          ? Math.min(100, Math.round((stuSubs.length / clsAssignments.length) * 100))
          : 0;

      const stuAttempts = attempts.filter((a) => a.studentId === stu.id);
      const examAveragePercent =
        stuAttempts.length > 0
          ? Math.round(
              stuAttempts.reduce(
                (sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0),
                0
              ) / stuAttempts.length
            )
          : null;

      const evidence: string[] = [];
      let attentionSignals = 0;

      if (consecutiveDrop) {
        evidence.push('افت نمره در دو یا چند ارزیابی متوالی');
        attentionSignals += 2;
      }
      if (stuGrades.length > 0 && avgScore < passing + 4) {
        evidence.push(`میانگین نمرات (${avgScore} از ۲۰) نیازمند تقویت آموزشی است`);
        attentionSignals += avgScore < passing + 2 ? 2 : 1;
      }
      for (const [subName, cnt] of subjectAbsMap.entries()) {
        if (cnt >= 2) {
          evidence.push(`افزایش غیبت در درس ${subName} (${cnt} جلسه)`);
          attentionSignals += 1;
        }
      }
      if (absencesCount >= 2 && evidence.every((e) => !e.includes('غیبت'))) {
        evidence.push(`تعدد غیبت‌های ثبت‌شده (${absencesCount} مورد)`);
        attentionSignals += 1;
      }
      if (clsAssignments.length >= 1 && assignmentSubmissionRate < 60) {
        evidence.push(`کاهش تحویل تکالیف (${assignmentSubmissionRate}٪ تحویل‌شده)`);
        attentionSignals += 1;
      }
      if (examAveragePercent !== null && examAveragePercent < 60) {
        evidence.push(`میانگین پایین در آزمون‌های آنلاین (${examAveragePercent}٪)`);
        attentionSignals += 1;
      }

      let category: RiskCategory = 'stable';
      let categoryLabelFa = 'وضعیت پایدار';
      let categoryLabelEn = 'Stable Progress';
      let suggestedAction = 'ادامه روند عادی و پیگیری مستمر تکالیف کلاسی';

      if (attentionSignals >= 2) {
        category = 'attention_center';
        categoryLabelFa = 'مرکز توجه آموزشی';
        categoryLabelEn = 'Academic Attention Priority';
        suggestedAction = 'بررسی شرایط آموزشی، تدوین برنامه جبرانی و گفت‌وگو با دانش‌آموز و اولیا';
      } else if (attentionSignals === 1) {
        category = 'teacher_review';
        categoryLabelFa = 'نیازمند بررسی معلم';
        categoryLabelEn = 'Requires Teacher Check-in';
        suggestedAction = 'بررسی شرایط آموزشی و گفت‌وگوی کوتاه معلم با دانش‌آموز';
      } else if (
        stuGrades.length > 0 &&
        avgScore >= 18 &&
        absencesCount <= 1 &&
        (clsAssignments.length === 0 || assignmentSubmissionRate >= 80)
      ) {
        category = 'exemplary';
        categoryLabelFa = 'دانش‌آموز نمونه';
        categoryLabelEn = 'Exemplary Standing';
        suggestedAction = 'معرفی به کارگاه‌های المپیاد و تشویق در پرونده افتخارات';
        evidence.push('عملکرد درخشان در نمرات، حضور منظم و تحویل کامل تکالیف');
      } else if (evidence.length === 0) {
        if (stuGrades.length === 0 && absencesCount === 0 && clsAssignments.length === 0 && stuAttempts.length === 0) {
          evidence.push('هنوز داده آموزشی (نمره، غیبت، تکلیف یا آزمون) برای این دانش‌آموز ثبت نشده است');
        } else {
          evidence.push('روند نمرات و حضور و غیاب در وضعیت متعادل و طبیعی است');
        }
      }

      const stuNotes = notes
        .filter((n) => n.studentId === stu.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        studentId: stu.id,
        studentName: stu.fullName,
        classId: stu.classId,
        className: stu.classId ? classMap.get(stu.classId)?.name ?? '—' : 'تخصیص‌نیافته',
        gradeLevel: stu.gradeLevel || '—',
        category,
        categoryLabelFa,
        categoryLabelEn,
        averageScore: avgScore,
        gradesCount: stuGrades.length,
        absencesCount,
        latesCount,
        assignmentSubmissionRate,
        examAveragePercent,
        evidence,
        suggestedAction,
        reviewNotes: stuNotes,
      };
    })
    .sort((a, b) => {
      const order: Record<RiskCategory, number> = {
        attention_center: 0,
        teacher_review: 1,
        stable: 2,
        exemplary: 3,
      };
      return order[a.category] - order[b.category] || a.averageScore - b.averageScore;
    });
}

// --- Smart AI Planner (Student/Parent AND Admin/Deputy) ---

export async function generateSmartPlannerTasksWithAI(params: {
  aiServerUrl?: string;
  kv: SchoolKVStore;
  user: StoredUser;
  focusGoal?: string;
  daysCount?: number;
  dailyMinutes?: number;
}): Promise<{
  summary: string;
  tasks: Array<{
    title: string;
    subjectId?: string;
    targetDate: string;
    durationMinutes: number;
    notes: string;
    category: 'study' | 'remedial' | 'administrative';
  }>;
}> {
  const [classes, subjects, grades, attendance, assignments, exams, events, schedules, users] =
    await Promise.all([
      kvGetCollection<SchoolClass>(params.kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
      kvGetCollection<Subject>(params.kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
      kvGetCollection<GradeRecord>(params.kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
      kvGetCollection<AttendanceRecord>(params.kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
      kvGetCollection<Assignment>(params.kv, KV_KEYS.ASSIGNMENTS_INDEX, KV_KEYS.assignmentItem),
      kvGetCollection<OnlineExam>(params.kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
      kvGetCollection<CalendarEvent>(params.kv, KV_KEYS.CALENDAR_EVENTS_INDEX, KV_KEYS.calendarEventItem),
      kvGetCollection<ScheduleSlot>(params.kv, KV_KEYS.SCHEDULES_INDEX, KV_KEYS.scheduleItem),
      kvGetCollection<StoredUser>(params.kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
    ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const daysCount = Math.min(14, Math.max(3, params.daysCount ?? 5));
  const dailyMinutes = Math.min(360, Math.max(30, params.dailyMinutes ?? 90));
  const todayStr = new Date().toLocaleDateString('fa-IR');

  if (params.user.role === 'admin') {
    const classStats = classes
      .map((c) => {
        const clsGrades = grades.filter((g) => g.classId === c.id);
        const clsAvg = clsGrades.length
          ? (
              clsGrades.reduce((s, g) => s + (g.score / g.maxScore) * 20, 0) / clsGrades.length
            ).toFixed(2)
          : 'بدون نمره';
        const clsAbs = attendance.filter((a) => a.classId === c.id && a.status === 'absent').length;
        return `- ${c.name} (${c.gradeLevel}): میانگین ${clsAvg} | غیبت‌ها ${clsAbs}`;
      })
      .join('\n');

    const upcomingEvents = events.slice(0, 6).map((e) => `${e.date}: ${e.title}`).join(' | ');
    const activeExams = exams.filter((e) => e.active).map((e) => `${e.title} (${e.dueDate})`).join(' | ');

    const systemPrompt = `تو دستیار برنامه‌ریزی هوشمند مدیر دبیرستان استعدادهای درخشان استاد شهریار هستی.
فقط یک شیء JSON معتبر بدون متن اضافه برگردان:
{
  "summary": "خلاصه تحلیلی کوتاه از اولویت‌های مدیریتی",
  "tasks": [
    {
      "title": "عنوان اقدام یا جلسه مدیریتی/آموزشی",
      "subjectId": "",
      "targetDate": "تاریخ شمسی نزدیک به ${todayStr}",
      "durationMinutes": 45,
      "notes": "جزئیات اجرایی و مسئولین مرتبط",
      "category": "administrative"
    }
  ]
}`;

    const userPrompt = `نقش: مدیر مدرسه
هدف یا تمرکز درخواستی: ${params.focusGoal || 'بهبود کیفیت آموزشی، بررسی کلاس‌های نیازمند توجه و آماده‌سازی آزمون‌ها'}
تعداد برنامه‌ها: ${daysCount} تا ${daysCount + 2} اقدام عملی
آمار کلاس‌ها:
${classStats || 'هنوز کلاسی ثبت نشده است'}
تعداد کل دانش‌آموزان: ${users.filter((u) => u.role === 'student').length}
آزمون‌های فعال: ${activeExams || 'ندارد'}
رویدادهای تقویم: ${upcomingEvents || 'ندارد'}`;

    const raw = await completeMokhyarText({
      aiServerUrl: params.aiServerUrl,
      systemPrompt,
      userPrompt,
    });

    const parsed = extractJsonBlock<{
      summary?: string;
      tasks?: Array<Partial<{ title: string; targetDate: string; durationMinutes: number; notes: string }>>;
    }>(raw);

    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error('برنامه مدیریتی قابل تولید نبود؛ لطفاً دوباره تلاش کنید.');
    }

    return {
      summary: String(parsed.summary || 'برنامه عملیاتی مدیریت مدرسه'),
      tasks: parsed.tasks.map((t) => ({
        title: String(t.title || 'اقدام مدیریتی').trim(),
        targetDate: String(t.targetDate || todayStr).trim(),
        durationMinutes: Math.max(15, Number(t.durationMinutes) || 45),
        notes: String(t.notes || '').trim(),
        category: 'administrative' as const,
      })),
    };
  }

  // Student or Parent
  const effectiveStudent = await resolveEffectiveStudentUser(params.kv, params.user);
  const myGrades = grades.filter((g) => g.studentId === effectiveStudent.id);
  const myAsgs = effectiveStudent.classId
    ? assignments.filter((a) => a.classId === effectiveStudent.classId)
    : [];
  const myExams = effectiveStudent.classId
    ? exams.filter((e) => e.classId === effectiveStudent.classId && e.active)
    : [];
  const mySchedule = effectiveStudent.classId
    ? schedules.filter((s) => s.classId === effectiveStudent.classId)
    : [];

  const gradesInfo =
    myGrades
      .map(
        (g) =>
          `${subjectMap.get(g.subjectId)?.name ?? g.subjectName ?? 'درس'} (id=${g.subjectId}): ${g.score}/${g.maxScore} - ${g.title}`
      )
      .join('\n') || 'هنوز نمره‌ای ثبت نشده';

  const subjectsList = subjects.map((s) => `${s.name} (id=${s.id})`).join('، ');

  const systemPrompt = `تو برنامه‌ریز هوشمند تحصیلی دانش‌آموز در دبیرستان استعدادهای درخشان استاد شهریار هستی.
فقط یک شیء JSON معتبر بدون متن اضافه برگردان:
{
  "summary": "تحلیل کوتاه نقاط تمرکز مطالعه",
  "tasks": [
    {
      "title": "عنوان دقیق جلسه مطالعه",
      "subjectId": "شناسه درس متناظر یا رشته خالی",
      "targetDate": "تاریخ شمسی (شروع از ${todayStr})",
      "durationMinutes": 45,
      "notes": "روش مطالعه و منابع پیشنهادی",
      "category": "study" یا "remedial"
    }
  ]
}`;

  const userPrompt = `دانش‌آموز: ${effectiveStudent.fullName} (پایه ${effectiveStudent.gradeLevel ?? 'هفتم'})
هدف درخواستی: ${params.focusGoal || 'تعادل مطالعه دروس، تقویت نقاط ضعف و آمادگی آزمون‌ها'}
تعداد روز برنامه: ${daysCount} روز | زمان روزانه: حدود ${dailyMinutes} دقیقه
دروس موجود: ${subjectsList}
نمرات واقعی دانش‌آموز:
${gradesInfo}
تکالیف کلاس: ${myAsgs.map((a) => `${a.title} (مهلت ${a.dueDate})`).join(' | ') || 'ندارد'}
آزمون‌های فعال: ${myExams.map((e) => `${e.title} (${e.dueDate})`).join(' | ') || 'ندارد'}
تعداد زنگ‌های هفتگی: ${mySchedule.length}`;

  const raw = await completeMokhyarText({
    aiServerUrl: params.aiServerUrl,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJsonBlock<{
    summary?: string;
    tasks?: Array<
      Partial<{
        title: string;
        subjectId?: string;
        targetDate: string;
        durationMinutes: number;
        notes: string;
        category: 'study' | 'remedial';
      }>
    >;
  }>(raw);

  if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error('برنامه مطالعه قابل تولید نبود؛ لطفاً دوباره تلاش کنید.');
  }

  return {
    summary: String(parsed.summary || 'برنامه مطالعه هوشمند شخصی‌سازی‌شده'),
    tasks: parsed.tasks.map((t) => ({
      title: String(t.title || 'جلسه مطالعه').trim(),
      subjectId: t.subjectId && subjectMap.has(t.subjectId) ? t.subjectId : undefined,
      targetDate: String(t.targetDate || todayStr).trim(),
      durationMinutes: Math.max(15, Number(t.durationMinutes) || 45),
      notes: String(t.notes || '').trim(),
      category: t.category === 'remedial' ? 'remedial' : 'study',
    })),
  };
}
