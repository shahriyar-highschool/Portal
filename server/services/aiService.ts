import {
  type AIMessage,
  type AppLanguage,
  type Assignment,
  type AssignmentSubmission,
  type AttendanceRecord,
  type GradeRecord,
  type OnlineExam,
  type ScheduleSlot,
  type SchoolClass,
  type SchoolSettings,
  type StoredUser,
  type StudyPlanTask,
  type Subject,
} from '../../shared/types.ts';
import {
  KV_KEYS,
  kvGetCollection,
  kvGetJson,
  type SchoolKVStore,
} from '../kv/kvStore.ts';

export const DEFAULT_AI_SERVER_URL = 'https://mokhyar.ghaheri-maryam.workers.dev/v1/chat/completions';

export function resolveAiEndpoint(customUrl?: string): string {
  const raw = (customUrl || process.env.AI_SERVER_URL || DEFAULT_AI_SERVER_URL).trim();
  if (!raw) return DEFAULT_AI_SERVER_URL;
  const normalized = raw.replace(/\/+$/, '');
  if (normalized.endsWith('/v1/chat/completions')) {
    return normalized;
  }
  return `${normalized}/v1/chat/completions`;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

export async function buildScopedContextForUser(kv: SchoolKVStore, user: StoredUser): Promise<string> {
  const [
    settings,
    classes,
    subjects,
    grades,
    attendance,
    assignments,
    submissions,
    schedules,
    users,
    exams,
    studyPlans,
  ] = await Promise.all([
    kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS),
    kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem),
    kvGetCollection<Subject>(kv, KV_KEYS.SUBJECTS_INDEX, KV_KEYS.subjectItem),
    kvGetCollection<GradeRecord>(kv, KV_KEYS.GRADES_INDEX, KV_KEYS.gradeItem),
    kvGetCollection<AttendanceRecord>(kv, KV_KEYS.ATTENDANCE_INDEX, KV_KEYS.attendanceItem),
    kvGetCollection<Assignment>(kv, KV_KEYS.ASSIGNMENTS_INDEX, KV_KEYS.assignmentItem),
    kvGetCollection<AssignmentSubmission>(kv, KV_KEYS.SUBMISSIONS_INDEX, KV_KEYS.submissionItem),
    kvGetCollection<ScheduleSlot>(kv, KV_KEYS.SCHEDULES_INDEX, KV_KEYS.scheduleItem),
    kvGetCollection<StoredUser>(kv, KV_KEYS.USERS_INDEX, KV_KEYS.user),
    kvGetCollection<OnlineExam>(kv, KV_KEYS.EXAMS_INDEX, KV_KEYS.examItem),
    kvGetCollection<StudyPlanTask>(kv, KV_KEYS.STUDY_PLANS_INDEX, KV_KEYS.studyPlanItem),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const schoolHeader = `مدرسه: ${settings?.schoolName ?? 'دبیرستان استعدادهای درخشان استاد شهریار'} | سال تحصیلی: ${settings?.academicYear ?? '۱۴۰۵-۱۴۰۶'} | نوبت فعلی: ${settings?.currentTerm ?? 'نوبت اول'}`;

  if (user.role === 'student') {
    const effectiveStudentId = user.id;
    const effectiveClassId = user.classId;
    const myClass = effectiveClassId ? classMap.get(effectiveClassId) : undefined;
    const myGrades = grades.filter((g) => g.studentId === effectiveStudentId);
    const myAttendance = attendance.filter((a) => a.studentId === effectiveStudentId);
    const myAssignments = effectiveClassId ? assignments.filter((a) => a.classId === effectiveClassId) : [];
    const mySubmissions = submissions.filter((s) => s.studentId === effectiveStudentId);
    const mySchedule = effectiveClassId ? schedules.filter((s) => s.classId === effectiveClassId) : [];
    const myExams = effectiveClassId ? exams.filter((ex) => ex.classId === effectiveClassId && ex.active) : [];
    const myPlans = studyPlans.filter((p) => p.studentId === effectiveStudentId || p.studentId === user.id);

    const avg = average(myGrades.map((g) => (g.score / g.maxScore) * 20));
    const gradesSummary =
      myGrades.length > 0
        ? myGrades
            .map((g) => `- ${subjectMap.get(g.subjectId)?.name ?? 'درس'} (${g.title} - ${g.term}): ${g.score} از ${g.maxScore}`)
            .join('\n')
        : 'هنوز نمره‌ای ثبت نشده است.';

    const attCounts = {
      present: myAttendance.filter((a) => a.status === 'present').length,
      absent: myAttendance.filter((a) => a.status === 'absent').length,
      late: myAttendance.filter((a) => a.status === 'late').length,
      excused: myAttendance.filter((a) => a.status === 'excused').length,
    };

    const asgSummary =
      myAssignments.length > 0
        ? myAssignments
            .map((a) => {
              const sub = mySubmissions.find((s) => s.assignmentId === a.id);
              return `- ${a.title} (${subjectMap.get(a.subjectId)?.name ?? 'درس'}) | مهلت: ${a.dueDate} | وضعیت: ${sub?.status ?? 'تحویل داده نشده'}`;
            })
            .join('\n')
        : 'تکلیف فعالی ثبت نشده است.';

    const classSubjects = myClass
      ? myClass.subjectIds.map((id) => subjectMap.get(id)?.name).filter(Boolean).join('، ')
      : 'نامشخص';

    return [
      schoolHeader,
      `نقش کاربر: دانش‌آموز | نام: ${user.fullName} | پایه: ${user.gradeLevel ?? 'ثبت‌نشده'} | کلاس: ${myClass?.name ?? 'تخصیص‌نیافته'}`,
      `دروس کلاس: ${classSubjects || 'ثبت‌نشده'}`,
      `معدل فعلی محاسبه‌شده: ${myGrades.length > 0 ? avg : 'بدون نمره'}`,
      `نمرات ثبت‌شده فقط برای این دانش‌آموز:\n${gradesSummary}`,
      `آمار حضور و غیاب: حاضر ${attCounts.present}، غایب ${attCounts.absent}، تأخیر ${attCounts.late}، موجه ${attCounts.excused}`,
      `تکالیف کلاس:\n${asgSummary}`,
      `آزمون‌های آنلاین فعال کلاس: ${myExams.length} | زنگ‌های برنامه هفتگی: ${mySchedule.length} | برنامه‌های مطالعه ثبت‌شده: ${myPlans.length}`,
    ].join('\n\n');
  }

  if (user.role === 'teacher') {
    const allowedClassIds = new Set(user.assignedClassIds ?? []);
    const myClasses = classes.filter((c) => allowedClassIds.has(c.id) || c.teacherIds.includes(user.id));
    const myClassIds = new Set(myClasses.map((c) => c.id));
    const myStudents = users.filter((u) => u.role === 'student' && u.classId && myClassIds.has(u.classId));
    const myGrades = grades.filter((g) => myClassIds.has(g.classId) || g.teacherId === user.id);
    const myAttendance = attendance.filter((a) => myClassIds.has(a.classId));
    const myAssignments = assignments.filter((a) => myClassIds.has(a.classId));
    const myExams = exams.filter((ex) => myClassIds.has(ex.classId) || ex.teacherId === user.id);

    const classStats = myClasses
      .map((c) => {
        const clsGrades = myGrades.filter((g) => g.classId === c.id);
        const clsAvg = average(clsGrades.map((g) => (g.score / g.maxScore) * 20));
        const clsStudents = myStudents.filter((s) => s.classId === c.id).length;
        const weakGrades = clsGrades.filter((g) => (g.score / g.maxScore) * 20 < (settings?.passingScore ?? 10) + 3);
        return `- کلاس ${c.name} (پایه ${c.gradeLevel}): ${clsStudents} دانش‌آموز | میانگین نمرات: ${clsGrades.length ? clsAvg : 'بدون نمره'} | تعداد نمرات نیازمند توجه (<۱۳): ${weakGrades.length}`;
      })
      .join('\n');

    const mySubjects = subjects
      .filter((s) => (user.assignedSubjectIds ?? []).includes(s.id) || s.teacherId === user.id)
      .map((s) => `${s.name} (پایه ${s.gradeLevel})`)
      .join('، ');

    return [
      schoolHeader,
      `نقش کاربر: معلم | نام: ${user.fullName}`,
      `دروس تخصصی معلم: ${mySubjects || 'تخصیص‌نیافته'}`,
      `آمار کلاس‌های اختصاص‌یافته به این معلم:\n${classStats || 'هنوز کلاسی اختصاص نیافته است.'}`,
      `تعداد کل نمرات ثبت‌شده در کلاس‌های مجاز: ${myGrades.length}`,
      `تعداد کل رکوردهای حضور و غیاب کلاس‌های مجاز: ${myAttendance.length} (غایب: ${myAttendance.filter((a) => a.status === 'absent').length})`,
      `تکالیف تعریف‌شده: ${myAssignments.length} | آزمون‌های آنلاین: ${myExams.length}`,
    ].join('\n\n');
  }

  // Admin context: school-wide aggregated statistics
  const studentsCount = users.filter((u) => u.role === 'student' && u.active).length;
  const teachersCount = users.filter((u) => u.role === 'teacher' && u.active).length;
  const schoolAvg = average(grades.map((g) => (g.score / g.maxScore) * 20));
  const totalAttendance = attendance.length;
  const absences = attendance.filter((a) => a.status === 'absent').length;
  const lates = attendance.filter((a) => a.status === 'late').length;

  const classBreakdown = classes
    .map((c) => {
      const clsStudents = users.filter((u) => u.role === 'student' && u.classId === c.id).length;
      const clsGrades = grades.filter((g) => g.classId === c.id);
      const clsAvg = average(clsGrades.map((g) => (g.score / g.maxScore) * 20));
      const clsAbs = attendance.filter((a) => a.classId === c.id && a.status === 'absent').length;
      return `- ${c.name} (${c.gradeLevel}): ${clsStudents} دانش‌آموز | میانگین نمره: ${clsGrades.length ? clsAvg : 'ندارد'} | غیبت‌ها: ${clsAbs}`;
    })
    .join('\n');

  return [
    schoolHeader,
    `نقش کاربر: مدیر مدرسه | نام: ${user.fullName}`,
    `آمار کل مدرسه: ${studentsCount} دانش‌آموز فعال، ${teachersCount} معلم فعال، ${classes.length} کلاس، ${subjects.length} درس`,
    `میانگین کل نمرات ثبت‌شده مدرسه: ${grades.length ? schoolAvg : 'هنوز نمره‌ای ثبت نشده است'} (از ${grades.length} رکورد نمره)`,
    `وضعیت حضور و غیاب کل: ${totalAttendance} رکورد (${absences} غیبت، ${lates} تأخیر) | آزمون‌های آنلاین: ${exams.length}`,
    `وضعیت به تفکیک کلاس‌ها:\n${classBreakdown || 'هنوز کلاسی ایجاد نشده است.'}`,
  ].join('\n\n');
}

export function buildRoleSystemInstruction(
  role: StoredUser['role'],
  mode: string,
  scopedContext: string,
  lang: AppLanguage = 'fa'
): string {
  const languageDirective =
    lang === 'en'
      ? 'Respond in clear, natural, well-structured English unless the user explicitly writes in Persian and asks for Persian.'
      : 'تمام پاسخ‌ها را به زبان فارسی روان، دقیق، محترمانه و حرفه‌ای بنویس (مگر اینکه کاربر صراحتاً به زبان دیگری سؤال بپرسد).';

  const sharedRules = `
تو دستیار هوش مصنوعی رسمی «دبیرستان استعدادهای درخشان استاد شهریار» (Ostad Shahriyar Gifted High School) هستی.
قوانین الزامی:
1. ${languageDirective}
2. از داده‌های واقعی ارائه شده در «اطلاعات مجاز کاربر» استفاده کن و هرگز آمار، نمره یا اطلاعات ساختگی اختراع نکن. اگر داده‌ای وجود ندارد، صادقانه اعلام کن که هنوز ثبت نشده است.
3. برای فرمول‌های ریاضی، فیزیک و شیمی از علامت LaTeX استاندارد ($...$ برای درون‌خطی و $$...$$ برای بلوکی) استفاده کن.
4. برای خوانایی بالا، پاسخ را با Markdown استاندارد قالب‌بندی کن: از **متن پررنگ** برای مفاهیم کلیدی، تیترها (##، ###)، فهرست‌های منظم، نقل‌قول (>)، بلوک کد و در صورت نیاز جدول‌های Markdown (| ستون | ...) استفاده کن.
5. هرگز اطلاعات محرمانه سایر کاربران یا دانش‌آموزان غیرمجاز را افشا نکن یا حدس نزن.
`.trim();

  if (role === 'student') {
    return `${sharedRules}

نقش اختصاصی تو: معلم خصوصی و مشاور تحصیلی دانش‌آموز در حالت «${mode}».
وظایف مجاز تو:
- پاسخگویی به پرسش‌های درسی (ریاضی، فیزیک، شیمی، زیست، ادبیات، علوم و...) با زبان آموزشی دقیق
- حل مرحله‌به‌مرحله تمرین‌ها و مسائل درسی
- ساخت نمونه سؤال تمرینی و آزمون کوتاه و بررسی پاسخ‌ها
- خلاصه‌سازی مطالب درسی
- کمک به برنامه‌ریزی مطالعه صرفاً بر اساس اطلاعات واقعی حساب مرتبط.
محدودیت امنیتی: به هیچ وجه نباید اطلاعات نمرات یا وضعیت سایر دانش‌آموزان مدرسه افشا شود.

اطلاعات مجاز حساب:
${scopedContext}`;
  }

  if (role === 'teacher') {
    return `${sharedRules}

نقش اختصاصی تو: دستیار تخصصی آموزشی و طراحی آزمون برای معلم در حالت «${mode}».
وظایف مجاز تو برای معلم:
- کمک به طراحی سؤال‌های امتحانی و ساخت آزمون با سطوح دشواری قابل تنظیم همراه با کلید پاسخ
- طراحی تمرین، تکلیف و کاربرگ کلاسی
- پیشنهاد روش‌های نوین تدریس و تولید محتوای آموزشی
- تحلیل نتایج آزمون‌ها و مباحث نیازمند توجه صرفاً بر اساس کلاس‌های اختصاص‌یافته به این معلم.

اطلاعات مجاز کلاس‌های این معلم:
${scopedContext}`;
  }

  return `${sharedRules}

نقش اختصاصی تو: مشاور هوشمند مدیریت آموزشی دبیرستان استعدادهای درخشان استاد شهریار (مدیریت مدرسه) در حالت «${mode}».
وظایف مجاز تو:
- تحلیل وضعیت تحصیلی کل مدرسه و روند نمرات و حضور و غیاب
- شناسایی کلاس‌ها یا دروسی که نیاز به بررسی و حمایت بیشتری دارند
- تهیه گزارش‌های مدیریتی و نگارش اطلاعیه‌های رسمی مدرسه.

اطلاعات مجاز وضعیت کلی مدرسه:
${scopedContext}`;
}

type WorkerChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function extractDeltaFromWorkerEvent(parsed: Record<string, unknown>): string {
  if (parsed.error) {
    const errObj = parsed.error;
    const message =
      typeof errObj === 'string'
        ? errObj
        : (errObj as { message?: string })?.message || JSON.stringify(errObj);
    throw new Error(message || 'خطا در سرور هوش مصنوعی');
  }

  const choices = parsed.choices as Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }> | undefined;
  const content =
    choices?.[0]?.delta?.content ??
    choices?.[0]?.message?.content ??
    parsed.delta ??
    parsed.response ??
    parsed.text;

  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part as { text?: string })?.text || ''))
      .join('');
  }
  return '';
}

function buildWorkerMessages(
  systemInstruction: string,
  history: AIMessage[],
  userMessage: string
): WorkerChatMessage[] {
  const cleanHistory: WorkerChatMessage[] = history
    .filter((m) => !m.error && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-14)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.trim(),
    }));

  const messages: WorkerChatMessage[] = [];
  if (systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }
  messages.push(...cleanHistory);
  messages.push({ role: 'user', content: userMessage.trim() });
  return messages;
}

export async function generateSchoolAIResponse(params: {
  apiKey?: string | undefined;
  aiServerUrl?: string | undefined;
  kv: SchoolKVStore;
  user: StoredUser;
  mode: string;
  history: AIMessage[];
  userMessage: string;
  lang?: AppLanguage;
}): Promise<string> {
  let fullText = '';
  for await (const delta of streamSchoolAIResponse(params)) {
    fullText += delta;
  }
  const trimmed = fullText.trim();
  if (!trimmed) {
    throw new Error('پاسخی از سرور هوش مصنوعی دریافت نشد.');
  }
  return trimmed;
}

export async function* streamMokhyarRaw(params: {
  aiServerUrl?: string;
  messages: WorkerChatMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const endpoint = resolveAiEndpoint(params.aiServerUrl);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: params.messages,
        max_tokens: params.maxTokens ?? 4096,
      }),
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) return;
    const msg = err instanceof Error ? err.message : 'خطای شبکه';
    throw new Error(`خطا در اتصال به سرور هوش مصنوعی: ${msg}`);
  }

  if (!response.ok) {
    let errDetail = `خطا در سرور هوش مصنوعی (کد ${response.status})`;
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            errDetail = parsed.error.trim();
          } else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
            errDetail = parsed.error.message;
          } else if (typeof parsed.message === 'string' && parsed.message.trim()) {
            errDetail = parsed.message.trim();
          }
        } catch {
          errDetail = text.slice(0, 240);
        }
      }
    } catch {
      // ignore body read error
    }
    throw new Error(errDetail);
  }

  if (!response.body) {
    throw new Error('جریان پاسخ از سرور هوش مصنوعی دریافت نشد.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let yieldedAny = false;

  const parseEventBlock = (eventBlock: string): string[] => {
    const out: string[] = [];
    const dataPayload = eventBlock
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();

    if (!dataPayload || dataPayload === '[DONE]') {
      return out;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataPayload) as Record<string, unknown>;
    } catch {
      return out;
    }

    const delta = extractDeltaFromWorkerEvent(parsed);
    if (delta) {
      out.push(delta);
    }
    return out;
  };

  try {
    while (true) {
      if (params.signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separatorIdx = buffer.indexOf('\n\n');
      while (separatorIdx !== -1) {
        const eventBlock = buffer.slice(0, separatorIdx);
        buffer = buffer.slice(separatorIdx + 2);
        for (const delta of parseEventBlock(eventBlock)) {
          yieldedAny = true;
          yield delta;
        }
        separatorIdx = buffer.indexOf('\n\n');
      }
    }

    if (!params.signal?.aborted) {
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.trim()) {
        for (const delta of parseEventBlock(buffer)) {
          yieldedAny = true;
          yield delta;
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore lock release error
    }
  }

  if (!params.signal?.aborted && !yieldedAny) {
    throw new Error('پاسخی از سرور هوش مصنوعی دریافت نشد.');
  }
}

export async function completeMokhyarText(params: {
  aiServerUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  let full = '';
  for await (const d of streamMokhyarRaw({
    aiServerUrl: params.aiServerUrl,
    maxTokens: params.maxTokens ?? 4096,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
  })) {
    full += d;
  }
  return full.trim();
}

export async function* streamSchoolAIResponse(params: {
  apiKey?: string | undefined;
  aiServerUrl?: string | undefined;
  kv: SchoolKVStore;
  user: StoredUser;
  mode: string;
  history: AIMessage[];
  userMessage: string;
  lang?: AppLanguage;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { aiServerUrl, kv, user, mode, history, userMessage, lang = 'fa', signal } = params;
  const scopedContext = await buildScopedContextForUser(kv, user);
  const systemInstruction = buildRoleSystemInstruction(user.role, mode, scopedContext, lang);
  const messages = buildWorkerMessages(systemInstruction, history, userMessage);

  yield* streamMokhyarRaw({
    aiServerUrl,
    messages,
    maxTokens: 4096,
    signal,
  });
}
