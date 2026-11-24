import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  History,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AIConversation, UserAccount, UserRole } from '../../../shared/types';
import { apiRequest, streamSseRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { MarkdownMathRenderer } from '../ui/MarkdownMathRenderer';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

const EMBLEM_IMG = '/assets/aistudio/image_1b3c1aaa.png';

const ROTATING_TAGLINES_FA = [
  'یادگیری عمیق‌تر با معلم خصوصی هوشمند دبیرستان استاد شهریار',
  'مسائل ریاضی، فیزیک و شیمی را گام‌به‌گام و با فرمول‌های دقیق حل کنید',
  'برنامه‌ریزی شخصی‌سازی‌شده بر اساس کارنامه و روند پیشرفت واقعی شما',
  'طراحی آزمون‌های استاندارد، تحلیل کلاس‌ها و گزارش‌گیری مدیریتی در لحظه',
];

const ROTATING_TAGLINES_EN = [
  'Deeper mastery with the Ostad Shahriyar Gifted High School AI Tutor',
  'Solve math, physics, and chemistry step-by-step with clear LaTeX equations',
  'Personalized study plans grounded in your real academic records and schedule',
  'Instant exam design, class performance diagnostics, and leadership reporting',
];

interface StarterItem {
  labelFa: string;
  labelEn: string;
  modeFa: string;
  modeEn: string;
  promptFa: string;
  promptEn: string;
}

const ROLE_CONFIG: Record<
  UserRole,
  {
    subtitleFa: string;
    subtitleEn: string;
    modesFa: string[];
    modesEn: string[];
    starters: StarterItem[];
  }
> = {
  student: {
    subtitleFa: 'معلم خصوصی و مشاور هوشمند تحصیلی با دسترسی امن به نمرات و برنامه خود شما',
    subtitleEn: 'Personal AI tutor & academic advisor scoped strictly to your grades and schedule',
    modesFa: [
      'پاسخگویی و آموزش مفاهیم درسی',
      'حل مرحله‌به‌مرحله تمرین و مسئله',
      'ساخت نمونه سؤال و آزمون تمرینی',
      'خلاصه‌سازی مطالب درسی',
      'برنامه‌ریزی مطالعه و بهبود عملکرد',
    ],
    modesEn: [
      'Concept Explanation & Tutoring',
      'Step-by-Step Problem Solving',
      'Practice Quiz Generator',
      'Lesson Summarization',
      'Study Planning & Improvement',
    ],
    starters: [
      {
        labelFa: 'برنامه مطالعه بر اساس نمراتم',
        labelEn: 'Study plan based on my grades',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'با توجه به نمرات و تکالیف ثبت‌شده من در سامانه، یک برنامه مطالعه هفتگی در قالب جدول منظم و پیشنهاد برای تقویت دروسم ارائه بده.',
        promptEn: 'Based on my recorded grades and assignments, create a weekly study plan in a structured table and highlight subjects that need practice.',
      },
      {
        labelFa: 'آزمون تمرینی ریاضی',
        labelEn: 'Math practice quiz',
        modeFa: 'ساخت نمونه سؤال و آزمون تمرینی',
        modeEn: 'Practice Quiz Generator',
        promptFa: 'یک آزمون تمرینی ۵ سؤالی در سطح استعدادهای درخشان از درس ریاضی طراحی کن و پس از پاسخ من تصحیحش کن.',
        promptEn: 'Create a 5-question gifted-level mathematics practice quiz and review my answers afterwards.',
      },
      {
        labelFa: 'آزمون تمرینی فیزیک',
        labelEn: 'Physics practice quiz',
        modeFa: 'ساخت نمونه سؤال و آزمون تمرینی',
        modeEn: 'Practice Quiz Generator',
        promptFa: 'یک آزمون ۵ سؤالی مفهومی و محاسباتی از فیزیک (حرکت، نیرو یا الکتریسیته) برایم بساز.',
        promptEn: 'Build a 5-question conceptual and numerical physics quiz on mechanics or electricity.',
      },
      {
        labelFa: 'حل مرحله‌به‌مرحله معادله',
        labelEn: 'Step-by-step quadratic formula',
        modeFa: 'حل مرحله‌به‌مرحله تمرین و مسئله',
        modeEn: 'Step-by-Step Problem Solving',
        promptFa: 'روش حل مرحله‌به‌مرحله معادله درجه دوم با روش دلتا را همراه با فرمول LaTeX و یک مثال عددی توضیح بده.',
        promptEn: 'Explain how to solve quadratic equations step-by-step using the discriminant formula with a worked numerical example.',
      },
      {
        labelFa: 'خلاصه قوانین نیوتن',
        labelEn: 'Summarize Newton’s Laws',
        modeFa: 'خلاصه‌سازی مطالب درسی',
        modeEn: 'Lesson Summarization',
        promptFa: 'مفاهیم کلیدی قوانین نیوتن در فیزیک را به زبان ساده، همراه با جدول مقایسه، فرمول و مثال‌های کاربردی خلاصه کن.',
        promptEn: 'Summarize Newton’s three laws of motion clearly with a comparison table, formulas, and everyday physics examples.',
      },
      {
        labelFa: 'آمادگی امتحان ترم',
        labelEn: 'Exam prep checklist',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'یک چک‌لیست مرور سریع و تکنیک‌های جلوگیری از بی‌دقتی در جلسه امتحان پیشنهاد بده.',
        promptEn: 'Give me an effective exam revision checklist and strategies to avoid careless mistakes during timed tests.',
      },
      {
        labelFa: 'جدول فرمول‌های فیزیک و ریاضی',
        labelEn: 'Math & physics formula sheet',
        modeFa: 'خلاصه‌سازی مطالب درسی',
        modeEn: 'Lesson Summarization',
        promptFa: 'مهم‌ترین فرمول‌های پرکاربرد ریاضی و فیزیک دبیرستان را در قالب یک جدول مرتب همراه با توضیح نمادها بنویس.',
        promptEn: 'Organize the most essential high-school math and physics formulas into a clean table with variable definitions.',
      },
      {
        labelFa: 'نکات شیمی و استوکیومتری',
        labelEn: 'Chemistry stoichiometry guide',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'روش حل مسائل استوکیومتری و موازنه واکنش‌های شیمیایی را گام‌به‌گام با یک مثال کامل آموزش بده.',
        promptEn: 'Teach me how to balance chemical equations and solve stoichiometry problems step-by-step with a worked example.',
      },
      {
        labelFa: 'مرور زیست‌شناسی و ژنتیک',
        labelEn: 'Biology & genetics review',
        modeFa: 'خلاصه‌سازی مطالب درسی',
        modeEn: 'Lesson Summarization',
        promptFa: 'مفاهیم اصلی همانندسازی DNA، رونویسی و ترجمه را به صورت ساختاریافته و جدول مقایسه‌ای توضیح بده.',
        promptEn: 'Explain DNA replication, transcription, and translation in a structured summary with a comparison table.',
      },
      {
        labelFa: 'تمرین المپیاد و تفکر تحلیلی',
        labelEn: 'Olympiad problem challenge',
        modeFa: 'حل مرحله‌به‌مرحله تمرین و مسئله',
        modeEn: 'Step-by-Step Problem Solving',
        promptFa: 'یک مسئله چالشی در سطح المپیاد ریاضی یا کامپیوتر به من بده و بدون گفتن جواب نهایی، قدم‌به‌قدم راهنمایی‌ام کن.',
        promptEn: 'Give me an Olympiad-level math or informatics challenge and guide me with hints without spoiling the solution.',
      },
      {
        labelFa: 'تکنیک‌های تندخوانی و خلاصه‌نویسی',
        labelEn: 'Active recall & note-taking',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'بهترین روش‌های یادداشت‌برداری (مثل کرنل) و مرور فاصله‌دار (Active Recall) برای دروس حفظی و مفهومی را معرفی کن.',
        promptEn: 'Explain the Cornell note-taking method and spaced repetition active recall for mastering dense subjects.',
      },
      {
        labelFa: 'آرایه‌های ادبی و دستور زبان',
        labelEn: 'Persian literature & grammar',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'آرایه‌های ادبی مهم مثل تشبیه، استعاره، کنایه و ایهام را همراه با جدول تفاوت‌ها و مثال شعری توضیح بده.',
        promptEn: 'Explain key literary devices such as metaphor, simile, and allusion with a clear comparison table and examples.',
      },
      {
        labelFa: 'تقویت گرامر و لغات انگلیسی',
        labelEn: 'English grammar & vocabulary',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'تفاوت زمان‌های پرکاربرد انگلیسی (Present Perfect vs Past Simple) را در جدول مقایسه همراه با ۵ مثال و تمرین بگو.',
        promptEn: 'Compare Present Perfect and Past Simple in a clear table with 5 examples and a mini practice drill.',
      },
      {
        labelFa: 'آموزش الگوریتم و پایتون',
        labelEn: 'Python & algorithms basics',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'مفهوم جستجوی دودویی (Binary Search) را همراه با کد تمیز پایتون و تحلیل پیچیدگی زمانی آموزش بده.',
        promptEn: 'Explain Binary Search with clean Python code and time complexity analysis.',
      },
      {
        labelFa: 'برنامه‌ریزی امتحانات نهایی و کنکور',
        labelEn: 'Final exam & study schedule',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'یک الگوی برنامه مطالعه روزانه متعادل برای جمع‌بندی دروس تخصصی و عمومی قبل از امتحانات طراحی کن.',
        promptEn: 'Design a balanced daily revision schedule for wrapping up core and general subjects before finals.',
      },
      {
        labelFa: 'مدیریت زمان و رفع اضطراب آزمون',
        labelEn: 'Test anxiety & time management',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'راهکارهای عملی برای مدیریت زمان سر جلسه آزمون‌های تستی و تشریحی و کاهش استرس امتحان بده.',
        promptEn: 'Share practical time-management techniques and stress-reduction tips for written and multiple-choice exams.',
      },
      {
        labelFa: 'تحلیل اشتباهات و دفترچه خطا',
        labelEn: 'Mistake notebook analysis',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: 'چطور یک دفترچه خطای هوشمند برای تحلیل بی‌دقتی‌ها و اشتباهات مفهومی آزمون‌هایم بسازم و مرور کنم؟',
        promptEn: 'How should I structure a smart mistake notebook to track careless errors and conceptual gaps across exams?',
      },
      {
        labelFa: 'خلاصه ترمودینامیک و گازها',
        labelEn: 'Thermodynamics & gas laws summary',
        modeFa: 'خلاصه‌سازی مطالب درسی',
        modeEn: 'Lesson Summarization',
        promptFa: 'قوانین گازهای کامل، کار و گرما در ترمودینامیک را با جدول فرمول‌ها و نکات دامی امتحانی خلاصه کن.',
        promptEn: 'Summarize ideal gas laws, work, and heat in thermodynamics with formulas and common exam pitfalls.',
      },
      {
        labelFa: 'آموزش الکتریسیته و مدارها',
        labelEn: 'Circuits & electricity guide',
        modeFa: 'حل مرحله‌به‌مرحله تمرین و مسئله',
        modeEn: 'Step-by-Step Problem Solving',
        promptFa: 'روش تحلیل مدارهای متوالی و موازی و محاسبه مقاومت معادل، جریان و اختلاف پتانسیل را گام‌به‌گام با مثال حل کن.',
        promptEn: 'Walk me through analyzing series and parallel circuits to compute equivalent resistance, current, and voltage.',
      },
      {
        labelFa: 'نام‌گذاری و نکات شیمی آلی',
        labelEn: 'Organic chemistry nomenclature',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'قواعد نام‌گذاری آیوپاک آلکان‌ها، آلکن‌ها و گروه‌های عاملی مهم را همراه با مثال‌های طبقه‌بندی‌شده توضیح بده.',
        promptEn: 'Explain IUPAC naming rules for alkanes, alkenes, and major functional groups with step-by-step examples.',
      },
      {
        labelFa: 'آزمون تمرینی شیمی و اسید و باز',
        labelEn: 'Chemistry acids & bases quiz',
        modeFa: 'ساخت نمونه سؤال و آزمون تمرینی',
        modeEn: 'Practice Quiz Generator',
        promptFa: 'یک آزمون تمرینی ۵ سؤالی از مباحث محلول‌ها، pH و اسید و باز طراحی کن و منتظر پاسخ من بمان.',
        promptEn: 'Create a 5-question practice quiz on solutions, pH, and acids & bases and wait for my answers.',
      },
      {
        labelFa: 'آموزش حد، پیوستگی و مشتق',
        labelEn: 'Limits & derivatives primer',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'مفهوم حد و پیوستگی و کاربردهای اساسی مشتق را با فرمول‌های LaTeX و ۲ مثال امتحانی توضیح بده.',
        promptEn: 'Explain limits, continuity, and core derivative rules with LaTeX formulas and 2 exam-style examples.',
      },
      {
        labelFa: 'ترکیبیات و احتمال المپیادی',
        labelEn: 'Combinatorics & probability drill',
        modeFa: 'حل مرحله‌به‌مرحله تمرین و مسئله',
        modeEn: 'Step-by-Step Problem Solving',
        promptFa: 'اصول شمارش، جایگشت، ترکیب و احتمال شرطی را با ۳ مسئله سطح بالا و راه‌حل دقیق بررسی کن.',
        promptEn: 'Review counting principles, permutations, combinations, and conditional probability with 3 challenging problems.',
      },
      {
        labelFa: 'مهارت‌های درک مطلب و رایتینگ انگلیسی',
        labelEn: 'English reading & writing skills',
        modeFa: 'پاسخگویی و آموزش مفاهیم درسی',
        modeEn: 'Concept Explanation & Tutoring',
        promptFa: 'ساختار نوشتن یک پاراگراف انگلیسی استاندارد (Topic Sentence تا Concluding) و تکنیک‌های پاسخ به Reading را یاد بده.',
        promptEn: 'Teach me how to write a structured English paragraph and tackle timed reading comprehension passages.',
      },
      {
        labelFa: 'قواعد عربی و تحلیل صرفی و نحوی',
        labelEn: 'Arabic grammar & parsing tips',
        modeFa: 'خلاصه‌سازی مطالب درسی',
        modeEn: 'Lesson Summarization',
        promptFa: 'نکات کلیدی ترجمه و قواعد پرکاربرد عربی دبیرستان (اسلوب شرط، حال، تمییز و افعال) را در یک جدول خلاصه کن.',
        promptEn: 'Summarize key high-school Arabic grammar and translation rules in a structured comparison table.',
      },
      {
        labelFa: 'ایده و ساختار پروژه پژوهش‌سرا',
        labelEn: 'Science fair & research project guide',
        modeFa: 'برنامه‌ریزی مطالعه و بهبود عملکرد',
        modeEn: 'Study Planning & Improvement',
        promptFa: '۳ ایده پژوهشی علمی مناسب جشنواره خوارزمی همراه با ساختار نوشتن پروپوزال و روش آزمایش پیشنهاد بده.',
        promptEn: 'Suggest 3 science research project ideas suitable for competitions along with a clear proposal outline.',
      },
    ],
  },
  teacher: {
    subtitleFa: 'دستیار تخصصی طراحی آزمون، تولید محتوای آموزشی و تحلیل عملکرد کلاس‌های اختصاص‌یافته شما',
    subtitleEn: 'Specialist assistant for exam design, pedagogy, and analytics for your assigned classes',
    modesFa: [
      'طراحی سؤال امتحانی و آزمون',
      'طراحی تمرین و تکلیف کلاسی',
      'پیشنهاد روش تدریس و محتوای آموزشی',
      'تحلیل نتایج و مباحث ضعیف کلاس',
      'تنظیم برنامه و گزارش آموزشی',
    ],
    modesEn: [
      'Exam & Question Design',
      'Homework & Worksheet Design',
      'Teaching Methods & Lesson Plans',
      'Class Performance Diagnostics',
      'Academic Progress Reports',
    ],
    starters: [
      {
        labelFa: 'تحلیل عملکرد کلاس‌های من',
        labelEn: 'Analyze my assigned classes',
        modeFa: 'تحلیل نتایج و مباحث ضعیف کلاس',
        modeEn: 'Class Performance Diagnostics',
        promptFa: 'بر اساس نمرات و حضور و غیاب کلاس‌های اختصاص‌یافته به من، وضعیت عملکرد کلاس‌ها و نقاط نیازمند توجه را تحلیل کن.',
        promptEn: 'Analyze performance across my assigned classes using recorded grades and attendance data, and highlight topics needing attention.',
      },
      {
        labelFa: 'طراحی آزمون ۳ سطحی با کلید',
        labelEn: 'Design a 3-tier exam with key',
        modeFa: 'طراحی سؤال امتحانی و آزمون',
        modeEn: 'Exam & Question Design',
        promptFa: 'یک نمونه آزمون ۶ سؤالی شامل ۲ سؤال ساده، ۲ سؤال متوسط و ۲ سؤال دشوار همراه با جدول بارم‌بندی و کلید پاسخ طراحی کن.',
        promptEn: 'Create a 6-question exam (2 easy, 2 medium, 2 challenging) complete with a grading rubric table and a full answer key.',
      },
      {
        labelFa: 'طراحی آزمون تستی ۴ گزینه‌ای',
        labelEn: 'Multiple-choice quiz builder',
        modeFa: 'طراحی سؤال امتحانی و آزمون',
        modeEn: 'Exam & Question Design',
        promptFa: '۸ سؤال تستی ۴ گزینه‌ای استاندارد (با گزینه‌های انحرافی هوشمند) همراه با پاسخ تشریحی طراحی کن.',
        promptEn: 'Generate 8 standard 4-option multiple-choice questions with plausible distractors and detailed solutions.',
      },
      {
        labelFa: 'طراحی تکلیف مهارتی',
        labelEn: 'Problem-based assignment',
        modeFa: 'طراحی تمرین و تکلیف کلاسی',
        modeEn: 'Homework & Worksheet Design',
        promptFa: 'یک تکلیف کلاسی خلاقانه و مسئله‌محور برای سنجش درک عمیق دانش‌آموزان در پایان فصل طراحی کن.',
        promptEn: 'Design an engaging problem-based class assignment to assess deep conceptual understanding at the end of a unit.',
      },
      {
        labelFa: 'سناریوی تدریس ۴۵ دقیقه‌ای',
        labelEn: '45-minute active lesson plan',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'یک سناریوی تدریس ۴۵ دقیقه‌ای فعال و مشارکتی در قالب جدول زمان‌بندی برای آموزش مفاهیم انتزاعی پیشنهاد بده.',
        promptEn: 'Outline an interactive 45-minute lesson plan in a timed table for teaching abstract concepts.',
      },
      {
        labelFa: 'روبریک و معیار نمره‌دهی',
        labelEn: 'Create a grading rubric',
        modeFa: 'تنظیم برنامه و گزارش آموزشی',
        modeEn: 'Academic Progress Reports',
        promptFa: 'یک جدول روبریک (معیار ارزیابی ۴ سطحی) برای تصحیح پروژه‌ها و تکالیف تشریحی دانش‌آموزان طراحی کن.',
        promptEn: 'Design a 4-level grading rubric table for evaluating student projects and open-ended assignments.',
      },
      {
        labelFa: 'سؤالات چالشی سمپاد و تیزهوشان',
        labelEn: 'Gifted-level challenge bank',
        modeFa: 'طراحی سؤال امتحانی و آزمون',
        modeEn: 'Exam & Question Design',
        promptFa: '۴ مسئله ترکیبی و تحلیلی ویژه دانش‌آموزان استعدادهای درخشان با راهنمای گام‌به‌گام حل بنویس.',
        promptEn: 'Create 4 multi-concept analytical challenge problems tailored for gifted students with step-by-step solutions.',
      },
      {
        labelFa: 'آموزش معکوس (Flipped Classroom)',
        labelEn: 'Flipped classroom activity',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'یک طرح اجرای روش تدریس معکوس (Flipped Classroom) شامل تکلیف پیش از کلاس و فعالیت گروهی سر کلاس بنویس.',
        promptEn: 'Design a flipped classroom workflow including pre-class prep and interactive in-class group activities.',
      },
      {
        labelFa: 'برگه تمرین جبرانی دانش‌آموزان',
        labelEn: 'Remedial practice worksheet',
        modeFa: 'طراحی تمرین و تکلیف کلاسی',
        modeEn: 'Homework & Worksheet Design',
        promptFa: 'یک کاربرگ تمرین تقویتی و جبرانی پلکانی برای دانش‌آموزانی که در آزمون قبلی نمره پایین‌تری گرفته‌اند تهیه کن.',
        promptEn: 'Build a scaffolded remedial practice worksheet for students who struggled on the last assessment.',
      },
      {
        labelFa: 'پیشنهاد پروژه گروهی بین‌رشته‌ای',
        labelEn: 'Interdisciplinary group project',
        modeFa: 'طراحی تمرین و تکلیف کلاسی',
        modeEn: 'Homework & Worksheet Design',
        promptFa: '۳ ایده پروژه گروهی خلاقانه که ریاضی، علوم و برنامه‌نویسی را به مسائل واقعی زندگی پیوند دهد پیشنهاد بده.',
        promptEn: 'Suggest 3 creative group project ideas connecting math, science, and coding to real-world problems.',
      },
      {
        labelFa: 'پیش‌نویس گزارش پیشرفت برای اولیا',
        labelEn: 'Parent progress report draft',
        modeFa: 'تنظیم برنامه و گزارش آموزشی',
        modeEn: 'Academic Progress Reports',
        promptFa: 'یک الگوی حرفه‌ای و محترمانه برای گزارش وضعیت تحصیلی دانش‌آموز به اولیا با نقاط قوت و برنامه بهبود بنویس.',
        promptEn: 'Draft a constructive, professional student progress report template for parents covering strengths and next steps.',
      },
      {
        labelFa: 'سؤالات تشریحی با خطاهای رایج',
        labelEn: 'Diagnostic misconception quiz',
        modeFa: 'تحلیل نتایج و مباحث ضعیف کلاس',
        modeEn: 'Class Performance Diagnostics',
        promptFa: 'مجموعه‌ای از ۵ سؤال تشخیصی برای کشف بدفهمی‌های رایج دانش‌آموزان همراه با تحلیل هر خطا طراحی کن.',
        promptEn: 'Design 5 diagnostic questions targeting common student misconceptions with explanations for each wrong answer.',
      },
      {
        labelFa: 'خلاصه درس برای توزیع در کلاس',
        labelEn: 'Printable lesson handout',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'یک جزوه خلاصه یک‌صفحه‌ای منظم شامل تعاریف کلیدی، فرمول‌ها و ۲ مثال حل‌شده برای دانش‌آموزان آماده کن.',
        promptEn: 'Prepare a concise one-page handout with key definitions, formulas, and 2 worked examples for students.',
      },
      {
        labelFa: 'طراحی بازی یا رقابت کلاسی',
        labelEn: 'Gamified classroom review',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'یک فعالیت رقابتی و تیمی ۱۵ دقیقه‌ای برای مرور پایان فصل در کلاس طراحی کن.',
        promptEn: 'Design a 15-minute team-based classroom review game for wrapping up a chapter.',
      },
      {
        labelFa: 'بودجه‌بندی و برنامه تدریس ترم',
        labelEn: 'Term syllabus pacing plan',
        modeFa: 'تنظیم برنامه و گزارش آموزشی',
        modeEn: 'Academic Progress Reports',
        promptFa: 'یک جدول بودجه‌بندی ۱۲ هفته‌ای برای تدریس منظم فصل‌ها، مرورها و آزمون‌های میان‌ترم طراحی کن.',
        promptEn: 'Create a 12-week syllabus pacing table balancing new lessons, reviews, and midterm assessments.',
      },
      {
        labelFa: 'آزمون ترکیبی صحیح/غلط و جای‌خالی',
        labelEn: 'True/false & fill-blank exam',
        modeFa: 'طراحی سؤال امتحانی و آزمون',
        modeEn: 'Exam & Question Design',
        promptFa: '۱۰ سؤال ترکیبی (۵ صحیح و غلط نکته‌دار + ۵ جای‌خالی دقیق) برای ارزشیابی سریع ۱۰ دقیقه‌ای آغاز کلاس طراحی کن.',
        promptEn: 'Create a 10-minute warm-up quiz with 5 nuanced true/false and 5 precise fill-in-the-blank questions.',
      },
      {
        labelFa: 'ساخت دو نسخه موازی (A و B) آزمون',
        labelEn: 'Parallel exam versions A & B',
        modeFa: 'طراحی سؤال امتحانی و آزمون',
        modeEn: 'Exam & Question Design',
        promptFa: '۴ سؤال در دو نسخه موازی A و B با سطح دشواری کاملاً برابر و اعداد متفاوت برای جلوگیری از تقلب طراحی کن.',
        promptEn: 'Generate 4 questions in parallel Form A and Form B versions with identical difficulty and varied parameters.',
      },
      {
        labelFa: 'تدریس تفکیک‌شده برای سطوح مختلف',
        labelEn: 'Differentiated instruction plan',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'چگونه یک مبحث درسی را هم‌زمان در سه سطح (تقویتی، استاندارد و پیشرفته المپیادی) در یک کلاس تدریس و تمرین کنم؟',
        promptEn: 'How can I differentiate one lesson across remedial, standard, and Olympiad-track students in the same classroom?',
      },
      {
        labelFa: 'بانک تمرین پلکانی آخر هفته',
        labelEn: 'Tiered weekend practice set',
        modeFa: 'طراحی تمرین و تکلیف کلاسی',
        modeEn: 'Homework & Worksheet Design',
        promptFa: 'یک مجموعه تمرین ۶ سؤالی پلکانی (از تسلط پایه تا سؤال ترکیبی خلاقانه) برای تکلیف آخر هفته بساز.',
        promptEn: 'Build a 6-question tiered weekend practice sheet progressing from foundational fluency to creative synthesis.',
      },
      {
        labelFa: 'ارزیابی کیفی و توصیفی دانش‌آموزان',
        labelEn: 'Qualitative assessment notes',
        modeFa: 'تنظیم برنامه و گزارش آموزشی',
        modeEn: 'Academic Progress Reports',
        promptFa: 'مجموعه‌ای از جملات حرفه‌ای، دقیق و انگیزشی برای ثبت بازخورد توصیفی در کارنامه دانش‌آموزان در سطوح مختلف بنویس.',
        promptEn: 'Provide a bank of constructive, encouraging qualitative feedback phrases for student report cards.',
      },
      {
        labelFa: 'تحلیل توزیع نمرات و سختی آزمون',
        labelEn: 'Exam difficulty & score audit',
        modeFa: 'تحلیل نتایج و مباحث ضعیف کلاس',
        modeEn: 'Class Performance Diagnostics',
        promptFa: 'با توجه به نمرات ثبت‌شده کلاس‌هایم، آیا امتحانات و تکالیف متعادل بوده‌اند یا نیاز به بازتنظیم سطح دشواری هست؟',
        promptEn: 'Based on my recorded class scores, evaluate whether exam difficulty is well-calibrated or needs adjustment.',
      },
      {
        labelFa: 'پرسش‌های سقراطی برای شروع درس',
        labelEn: 'Socratic hook questions',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: '۵ پرسش چالشی و سقراطی برای ۵ دقیقه ابتدای کلاس پیشنهاد بده که کنجکاوی دانش‌آموزان را برانگیزد.',
        promptEn: 'Suggest 5 Socratic hook questions for the first 5 minutes of class to spark curiosity and discussion.',
      },
      {
        labelFa: 'سناریوی کارگاه عملی و آزمایشگاهی',
        labelEn: 'Hands-on lab workshop plan',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'یک کاربرگ آزمایشگاهی/کارگاهی شامل هدف آزمایش، پیش‌بینی، ثبت مشاهدات و پرسش‌های تحلیل نتیجه بنویس.',
        promptEn: 'Create a structured lab workshop sheet with hypothesis, observation log, and post-lab analysis prompts.',
      },
      {
        labelFa: 'برنامه مرور فشرده پیش از نوبت',
        labelEn: 'Pre-exam review blueprint',
        modeFa: 'تنظیم برنامه و گزارش آموزشی',
        modeEn: 'Academic Progress Reports',
        promptFa: 'یک طرح مرور ۲ جلسه‌ای برای جمع‌بندی تمام سرفصل‌های کلیدی پیش از امتحان نوبت اول طراحی کن.',
        promptEn: 'Design a focused 2-session review blueprint covering all high-yield topics right before semester exams.',
      },
      {
        labelFa: 'هدایت دانش‌آموزان مستعد المپیاد',
        labelEn: 'Mentoring Olympiad students',
        modeFa: 'تحلیل نتایج و مباحث ضعیف کلاس',
        modeEn: 'Class Performance Diagnostics',
        promptFa: 'چطور دانش‌آموزان برتر کلاس‌هایم را شناسایی کنم و برای آن‌ها مسیر مطالعه مکمل المپیادی تعریف کنم؟',
        promptEn: 'How should I identify top-performing students in my classes and design an enrichment track for Olympiads?',
      },
      {
        labelFa: 'ایده منبع و جزوه برای معلم خصوصی',
        labelEn: 'Authoring AI tutor source notes',
        modeFa: 'پیشنهاد روش تدریس و محتوای آموزشی',
        modeEn: 'Teaching Methods & Lesson Plans',
        promptFa: 'ساختار یک جزوه استاندارد و دقیق برای بارگذاری در بخش منابع معلم خصوصی هوشمند بنویس تا پاسخ‌های AI دقیق‌تر شود.',
        promptEn: 'Outline a clear, structured lesson note template to upload into the Private Tutor knowledge base.',
      },
    ],
  },
  admin: {
    subtitleFa: 'مشاور هوشمند مدیریت دبیرستان استاد شهریار با دسترسی به آمار و روندهای واقعی کل مدرسه',
    subtitleEn: 'Executive school management advisor grounded in live school-wide metrics and trends',
    modesFa: [
      'تحلیل وضعیت تحصیلی مدرسه',
      'گزارش مدیریتی و خلاصه‌سازی',
      'تحلیل روند نمرات و حضور و غیاب',
      'شناسایی کلاس‌های نیازمند بررسی',
      'نگارش اطلاعیه و پیام رسمی',
    ],
    modesEn: [
      'School-Wide Academic Analysis',
      'Executive Reporting & Summaries',
      'Grades & Attendance Trends',
      'Identify At-Risk Classes',
      'Official Announcements & Memos',
    ],
    starters: [
      {
        labelFa: 'تحلیل جامع وضعیت مدرسه',
        labelEn: 'Comprehensive school overview',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'بر اساس آمار واقعی نمرات و حضور و غیاب مدرسه، وضعیت کلی مدرسه را تحلیل کن و کلاس‌هایی که به بررسی بیشتر نیاز دارند مشخص کن.',
        promptEn: 'Analyze overall school academic performance and attendance using real records, and flag classes needing administrative support.',
      },
      {
        labelFa: 'پیش‌نویس اطلاعیه رسمی امتحانات',
        labelEn: 'Official exam schedule memo',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'یک اطلاعیه رسمی و محترمانه برای اولیا و دانش‌آموزان درباره زمان‌بندی امتحانات نوبت اول و اهمیت حضور منظم بنویس.',
        promptEn: 'Draft a formal, clear school announcement for students and parents regarding semester exam schedules and regular attendance.',
      },
      {
        labelFa: 'گزارش خلاصه مدیریتی با جدول',
        labelEn: 'Executive summary with table',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'یک گزارش مدیریتی منظم همراه با جدول خلاصه از وضعیت فعلی دانش‌آموزان، معلمان، میانگین نمرات و غیبت‌ها تهیه کن.',
        promptEn: 'Prepare a structured executive summary with a summary table covering enrollment, teachers, overall grade averages, and attendance rates.',
      },
      {
        labelFa: 'راهکار بهبود حضور و انضباط',
        labelEn: 'Attendance improvement plan',
        modeFa: 'تحلیل روند نمرات و حضور و غیاب',
        modeEn: 'Grades & Attendance Trends',
        promptFa: 'با توجه به نرخ حضور و غیاب و تأخیرها در سامانه، چه راهکارهای اجرایی برای کاهش غیبت‌ها پیشنهاد می‌کنی؟',
        promptEn: 'Based on recorded attendance and tardiness patterns, suggest actionable policies to improve punctuality and attendance.',
      },
      {
        labelFa: 'شناسایی کلاس‌های نیازمند حمایت',
        labelEn: 'Identify at-risk classes',
        modeFa: 'شناسایی کلاس‌های نیازمند بررسی',
        modeEn: 'Identify At-Risk Classes',
        promptFa: 'بر اساس داده‌های موجود، کدام کلاس‌ها از نظر میانگین نمره یا نرخ غیبت به توجه فوری و جلسه با دبیران نیاز دارند؟',
        promptEn: 'Using live data, which classes show lower grade averages or elevated absences and need prompt teacher follow-up?',
      },
      {
        labelFa: 'دستور جلسه شورای دبیران',
        labelEn: 'Faculty meeting agenda',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'یک دستور جلسه ساختاریافته و زمان‌بندی‌شده در قالب جدول برای نشست ماهانه شورای دبیران دبیرستان تیزهوشان تهیه کن.',
        promptEn: 'Create a structured, timed faculty council meeting agenda in a table format.',
      },
      {
        labelFa: 'دعوت‌نامه نشست انجمن اولیا و مربیان',
        labelEn: 'PTA meeting invitation',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'متن دعوت‌نامه رسمی و صمیمی برای برگزاری جلسه هم‌اندیشی اولیا و مربیان همراه با محورهای جلسه بنویس.',
        promptEn: 'Draft a formal, welcoming invitation for a Parent-Teacher Association meeting including key discussion topics.',
      },
      {
        labelFa: 'برنامه حمایتی المپیاد و پژوهش',
        labelEn: 'Olympiad & research roadmap',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'یک نقشه راه اجرایی فصلی برای تقویت المپیادهای علمی و پژوهش‌سرای دانش‌آموزی دبیرستان طراحی کن.',
        promptEn: 'Design a semester roadmap for strengthening scientific Olympiads and student research programs.',
      },
      {
        labelFa: 'پیشنهاد تقویم رویدادهای ترم',
        labelEn: 'Term academic calendar plan',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'یک جدول پیشنهادی برای رویدادهای آموزشی ترم (آزمون‌های پیشرفت، کارگاه‌ها، جلسات اولیا و اردوی علمی) بنویس.',
        promptEn: 'Propose a term academic calendar table covering benchmark exams, workshops, parent meetings, and science events.',
      },
      {
        labelFa: 'پیام تبریک افتخارات دانش‌آموزان',
        labelEn: 'Student achievement announcement',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'یک متن رسمی و انگیزشی برای تقدیر از برگزیدگان المپیادها و رتبه‌های برتر نوبت در تابلوی اعلانات مدرسه بنویس.',
        promptEn: 'Write an inspiring official congratulatory notice honoring top-achieving and Olympiad students.',
      },
      {
        labelFa: 'چک‌لیست آمادگی آغاز ترم جدید',
        labelEn: 'New term readiness checklist',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'یک چک‌لیست مدیریتی کامل برای بررسی برنامه هفتگی، انتصاب دبیران، ظرفیت کلاس‌ها و تنظیمات سامانه پیش از شروع ترم بساز.',
        promptEn: 'Build an administrative readiness checklist covering schedules, teacher assignments, class capacities, and portal settings.',
      },
      {
        labelFa: 'پایش کیفیت تکالیف و آزمون‌ها',
        labelEn: 'Assignments & exams quality audit',
        modeFa: 'تحلیل روند نمرات و حضور و غیاب',
        modeEn: 'Grades & Attendance Trends',
        promptFa: 'معیارهای کلیدی برای ارزیابی توازن حجم تکالیف هفتگی و کیفیت آزمون‌های آنلاین در پایه‌های مختلف را در یک جدول پیشنهاد بده.',
        promptEn: 'Suggest a framework table for auditing weekly homework load balance and online exam quality across grade levels.',
      },
      {
        labelFa: 'اطلاعیه تعطیلی یا تغییر ساعت کلاس',
        labelEn: 'Schedule change notice',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'یک الگوی کوتاه و شفاف برای اطلاع‌رسانی فوری تغییر برنامه زنگ‌ها یا برگزاری کلاس به صورت آنلاین بنویس.',
        promptEn: 'Draft a clear, concise urgent notice template for schedule adjustments or temporary online classes.',
      },
      {
        labelFa: 'الگوی ارزیابی و تقدیر از دبیران',
        labelEn: 'Teacher recognition framework',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'شاخص‌های منصفانه و حرفه‌ای برای تقدیر از دبیران برتر بر اساس کیفیت تدریس، تعامل با کلاس و بازخورد منظم پیشنهاد بده.',
        promptEn: 'Outline fair, constructive criteria for recognizing outstanding teachers based on engagement and feedback quality.',
      },
      {
        labelFa: 'تحلیل مقایسه‌ای پایه‌های تحصیلی',
        labelEn: 'Grade-level comparison report',
        modeFa: 'تحلیل روند نمرات و حضور و غیاب',
        modeEn: 'Grades & Attendance Trends',
        promptFa: 'عملکرد پایه‌های مختلف مدرسه را از نظر میانگین نمرات، تعداد دانش‌آموزان و حضور و غیاب مقایسه و تحلیل کن.',
        promptEn: 'Compare academic averages, student counts, and attendance trends across different grade levels in the school.',
      },
      {
        labelFa: 'طراحی برنامه کلاس‌های تقویتی و جبرانی',
        labelEn: 'School-wide remedial program',
        modeFa: 'شناسایی کلاس‌های نیازمند بررسی',
        modeEn: 'Identify At-Risk Classes',
        promptFa: 'بر اساس دروس با میانگین پایین‌تر، یک برنامه منظم برای برگزاری کلاس‌های رفع اشکال و جبرانی مدرسه طراحی کن.',
        promptEn: 'Design a school-wide tutoring and remedial workshop plan targeting the lowest-scoring subjects.',
      },
      {
        labelFa: 'منشور انضباطی و فرهنگی دبیرستان',
        labelEn: 'School code of conduct memo',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'یک منشور انضباطی و رفتاری شفاف و محترمانه برای دانش‌آموزان دبیرستان استعدادهای درخشان تدوین کن.',
        promptEn: 'Draft a clear, respectful student code of conduct and academic integrity charter.',
      },
      {
        labelFa: 'پایش دانش‌آموزان در معرض افت تحصیلی',
        labelEn: 'Early warning risk review',
        modeFa: 'شناسایی کلاس‌های نیازمند بررسی',
        modeEn: 'Identify At-Risk Classes',
        promptFa: 'الگوی مداخله ۵ مرحله‌ای (معلم، مشاور، معاون، مدیر، اولیا) برای حمایت از دانش‌آموزان در معرض افت تحصیلی بنویس.',
        promptEn: 'Outline a 5-step early intervention protocol involving teachers, counselors, leadership, and parents.',
      },
      {
        labelFa: 'دستور جلسه شورای دانش‌آموزی',
        labelEn: 'Student council agenda',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'محورهای کلیدی و دستور جلسه نشست مشترک مدیریت با نمایندگان شورای دانش‌آموزی برای بهبود فضای مدرسه بنویس.',
        promptEn: 'Create an agenda for a joint meeting between school leadership and the student council.',
      },
      {
        labelFa: 'برنامه توانمندسازی حرفه‌ای دبیران',
        labelEn: 'Faculty professional development',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'یک برنامه کارگاهی ترم برای آموزش روش‌های نوین ارزیابی، طراحی سؤال استاندارد و بهره‌گیری از هوش مصنوعی به دبیران بنویس.',
        promptEn: 'Design a semester professional development plan for teachers covering modern assessment and AI tools.',
      },
      {
        labelFa: 'گزارش فصلی ویژه هیئت امنا یا ناحیه',
        labelEn: 'Board & district quarterly brief',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'یک گزارش رسمی فصلی در قالب جدول شاخص‌های کلیدی (KPI) از دستاوردها، میانگین‌ها و نرخ مشارکت مدرسه بساز.',
        promptEn: 'Prepare a formal quarterly KPI brief highlighting school achievements, averages, and engagement metrics.',
      },
      {
        labelFa: 'پیشنهاد برنامه جشنواره و نمایشگاه علمی',
        labelEn: 'Annual science fair blueprint',
        modeFa: 'گزارش مدیریتی و خلاصه‌سازی',
        modeEn: 'Executive Reporting & Summaries',
        promptFa: 'طرح اجرایی کامل برگزاری جشنواره دستاوردهای علمی و پژوهشی دبیرستان استاد شهریار همراه با کمیته‌ها بنویس.',
        promptEn: 'Draft an execution plan with committee roles for hosting the annual Ostad Shahriyar Science Exhibition.',
      },
      {
        labelFa: 'پیش‌نویس پیام آغاز نیم‌سال تحصیلی',
        labelEn: 'New semester welcome letter',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: 'یک پیام صمیمی، انگیزشی و رسمی از طرف مدیر دبیرستان برای دانش‌آموزان، دبیران و اولیا در آغاز نیم‌سال بنویس.',
        promptEn: 'Write an inspiring welcome message from the principal to students, faculty, and parents for the new term.',
      },
      {
        labelFa: 'بررسی توازن ظرفیت کلاس‌ها و برنامه هفتگی',
        labelEn: 'Class capacity & schedule audit',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'وضعیت توزیع دانش‌آموزان در کلاس‌ها، توازن ساعات هفتگی دروس و انتصاب دبیران را بررسی و نقاط بهینه‌سازی را بگو.',
        promptEn: 'Audit student distribution across classes, weekly schedule balance, and teacher coverage.',
      },
      {
        labelFa: 'الگوی پاسخ رسمی به درخواست‌های اولیا',
        labelEn: 'Parent inquiry response templates',
        modeFa: 'نگارش اطلاعیه و پیام رسمی',
        modeEn: 'Official Announcements & Memos',
        promptFa: '۳ الگوی پاسخ رسمی، محترمانه و راه‌حل‌محور برای درخواست‌های رایج اولیا (تغییر کلاس، مرخصی، پیگیری نمره) بنویس.',
        promptEn: 'Draft 3 respectful, solution-oriented response templates for common parent requests.',
      },
      {
        labelFa: 'طراحی سیستم تشویق و کارنامه افتخارات',
        labelEn: 'Student honors & badge policy',
        modeFa: 'تحلیل وضعیت تحصیلی مدرسه',
        modeEn: 'School-Wide Academic Analysis',
        promptFa: 'ضوابط شفاف و انگیزشی برای ثبت افتخارات علمی، المپیادی، اخلاقی و پژوهشی دانش‌آموزان در سامانه پیشنهاد بده.',
        promptEn: 'Propose transparent criteria for awarding academic, Olympiad, conduct, and research honors in the school portal.',
      },
    ],
  },
};

export function AIAssistantView({ user }: { user: UserAccount }) {
  const { lang, isRtl, tr, fmtDigits, fmtDateTime } = useI18n();
  const { showToast } = useToast();
  const config = ROLE_CONFIG[user.role];
  const modes = lang === 'fa' ? config.modesFa : config.modesEn;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchConv, setSearchConv] = useState('');
  const [activeConv, setActiveConv] = useState<AIConversation | null>(null);
  const [selectedMode, setSelectedMode] = useState<string>(modes[0]);
  const [input, setInput] = useState('');
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConv, setLoadingConv] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emblemError, setEmblemError] = useState(false);

  // Rotating tagline
  const taglines = lang === 'fa' ? ROTATING_TAGLINES_FA : ROTATING_TAGLINES_EN;
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Rename & Delete confirmation modals
  const [renameTarget, setRenameTarget] = useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Horizontal drag-scroll refs for suggestion strip
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const isDraggingStripRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const didDragStripRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '44px';
    if (input.length > 0 && el.scrollHeight > 44) {
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  }, [input]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTaglineIdx((prev) => (prev + 1) % taglines.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [taglines.length]);

  useEffect(() => {
    setSelectedMode(modes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyOpen]);

  const loadConversations = async (autoOpenFirst = false) => {
    try {
      setLoadingList(true);
      const data = await apiRequest<{ conversations: ConversationSummary[] }>('/api/ai/conversations', {
        silentError: true,
      });
      setConversations(data.conversations);
      if (autoOpenFirst && data.conversations.length > 0 && !activeConv) {
        await openConversation(data.conversations[0].id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت تاریخچه گفت‌وگوها', 'Failed to load chat history'), 'error');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadConversations(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [activeConv?.messages.length, streamingText, pendingUserText, streaming]);

  const filteredConversations = useMemo(() => {
    const q = searchConv.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.mode.toLowerCase().includes(q)
    );
  }, [conversations, searchConv]);

  const openConversation = async (id: string) => {
    try {
      setLoadingConv(true);
      setErrorBanner(null);
      setLastFailedPrompt(null);
      const data = await apiRequest<{ conversation: AIConversation }>(`/api/ai/conversations/${id}`);
      setActiveConv(data.conversation);
      setSelectedMode(data.conversation.mode || modes[0]);
      setHistoryOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در باز کردن گفت‌وگو', 'Failed to open chat'), 'error');
    } finally {
      setLoadingConv(false);
    }
  };

  const createNewConversation = async (initialMode?: string) => {
    try {
      setErrorBanner(null);
      setLastFailedPrompt(null);
      const modeToUse = initialMode || selectedMode || modes[0];
      const data = await apiRequest<{ conversation: AIConversation }>('/api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({
          title: tr('گفت‌وگوی جدید', 'New Chat'),
          mode: modeToUse,
        }),
      });
      setActiveConv(data.conversation);
      setSelectedMode(modeToUse);
      setHistoryOpen(false);
      await loadConversations(false);
      return data.conversation;
    } catch (err) {
      const msg = err instanceof Error ? err.message : tr('خطا در ایجاد گفت‌وگو', 'Failed to create chat');
      showToast(msg, 'error');
      return null;
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const res = await apiRequest<{ conversation: AIConversation }>(`/api/ai/conversations/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (activeConv?.id === renameTarget.id) {
        setActiveConv(res.conversation);
      }
      setRenameTarget(null);
      await loadConversations(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تغییر عنوان', 'Rename failed'), 'error');
    }
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await apiRequest(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (activeConv?.id === id) {
        setActiveConv(null);
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف گفت‌وگو', 'Delete failed'), 'error');
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const sendMessage = async (overridePrompt?: string, overrideMode?: string) => {
    const content = (overridePrompt ?? input).trim();
    if (!content || streaming) return;

    setErrorBanner(null);
    setLastFailedPrompt(null);
    const modeToUse = overrideMode || selectedMode;

    let convId = activeConv?.id;
    if (!convId) {
      const created = await createNewConversation(modeToUse);
      if (!created) return;
      convId = created.id;
    }

    if (!overridePrompt) setInput('');
    setPendingUserText(content);
    setStreamingText('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let updatedConv: AIConversation | null = null;
      await streamSseRequest<{ conversation?: AIConversation }>(
        `/api/ai/conversations/${convId}/messages/stream`,
        { content, mode: modeToUse, lang },
        {
          onDelta: (delta) => {
            setStreamingText((prev) => prev + delta);
          },
          onDone: (payload) => {
            if (payload.conversation) {
              updatedConv = payload.conversation;
            }
          },
        },
        controller.signal
      );

      if (updatedConv) {
        setActiveConv(updatedConv);
      } else {
        const refreshed = await apiRequest<{ conversation: AIConversation }>(`/api/ai/conversations/${convId}`, {
          silentError: true,
        });
        setActiveConv(refreshed.conversation);
      }
      await loadConversations(false);
    } catch (err) {
      if (controller.signal.aborted) {
        try {
          const refreshed = await apiRequest<{ conversation: AIConversation }>(`/api/ai/conversations/${convId}`, {
            silentError: true,
          });
          setActiveConv(refreshed.conversation);
          await loadConversations(false);
        } catch {
          // ignore
        }
      } else {
        const msg = err instanceof Error ? err.message : tr('خطا در دریافت پاسخ از هوش مصنوعی', 'AI generation failed');
        setErrorBanner(msg);
        setLastFailedPrompt(content);
        try {
          const refreshed = await apiRequest<{ conversation: AIConversation }>(`/api/ai/conversations/${convId}`, {
            silentError: true,
          });
          setActiveConv(refreshed.conversation);
        } catch {
          // ignore
        }
      }
    } finally {
      setStreaming(false);
      setPendingUserText(null);
      setStreamingText('');
      abortRef.current = null;
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      showToast(tr('امکان کپی در حافظه موقت مرورگر وجود ندارد.', 'Clipboard copy failed.'), 'error');
    }
  };

  const handleStripMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !suggestionsRef.current) return;
    isDraggingStripRef.current = true;
    didDragStripRef.current = false;
    dragStartXRef.current = e.pageX;
    dragStartScrollRef.current = suggestionsRef.current.scrollLeft;
  };

  const handleStripMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingStripRef.current || !suggestionsRef.current) return;
    const dx = e.pageX - dragStartXRef.current;
    if (Math.abs(dx) > 5) {
      didDragStripRef.current = true;
    }
    if (didDragStripRef.current) {
      suggestionsRef.current.scrollLeft = dragStartScrollRef.current - dx;
    }
  };

  const handleStripMouseEnd = () => {
    isDraggingStripRef.current = false;
    window.setTimeout(() => {
      didDragStripRef.current = false;
    }, 0);
  };

  const scrollSuggestionsBy = (direction: 'prev' | 'next') => {
    const el = suggestionsRef.current;
    if (!el) return;
    const step = 220;
    const delta = isRtl ? (direction === 'next' ? -step : step) : direction === 'next' ? step : -step;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-145px)]">
      {/* Main Full-Width Chat Workspace */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-[560px] max-h-[calc(100vh-145px)]">
        {/* AI Header & Controls */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/90 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                {tr('دستیار هوش مصنوعی دبیرستان استعدادهای درخشان استاد شهریار', 'Ostad Shahriyar School AI Assistant')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {lang === 'fa' ? config.subtitleFa : config.subtitleEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              id="ai-mode-select"
              aria-label={tr('حالت دستیار', 'Assistant mode')}
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0F274A] max-w-[220px]"
            >
              {modes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void createNewConversation()}
              title={tr('گفت‌وگوی جدید', 'New Chat')}
              aria-label={tr('گفت‌وگوی جدید', 'New Chat')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span className="hidden md:inline">{tr('گفت‌وگوی جدید', 'New Chat')}</span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-expanded={historyOpen}
              aria-label={tr('گفت‌وگوهای اخیر', 'Recent Conversations')}
              title={tr('گفت‌وگوهای اخیر', 'Recent Conversations')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <History className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
              <span className="hidden sm:inline">{tr('گفت‌وگوهای اخیر', 'History')}</span>
            </button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-white dark:bg-slate-900">
          {loadingConv ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{tr('در حال بارگذاری گفت‌وگو...', 'Loading conversation...')}</span>
            </div>
          ) : (!activeConv || activeConv.messages.length === 0) && !pendingUserText ? (
            <div className="h-full flex flex-col items-center justify-center py-8 max-w-xl mx-auto text-center">
              {!emblemError ? (
                <img
                  src={EMBLEM_IMG}
                  alt={tr('لوگوی دبیرستان استاد شهریار', 'Ostad Shahriyar Emblem')}
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="w-16 h-16 rounded-2xl object-contain bg-white p-2 border border-slate-200 dark:border-slate-700 mx-auto mb-3 shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#0F274A] dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-7 h-7" />
                </div>
              )}

              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {tr('چطور می‌توانم کمکتان کنم؟', 'How can I help you today?')}
              </h3>

              {/* Rotating animated tagline every 5 seconds */}
              <div className="h-10 flex items-center justify-center mt-1.5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${lang}_${taglineIdx}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="text-xs text-slate-500 dark:text-slate-400 leading-5"
                  >
                    {taglines[taglineIdx]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <>
              {(activeConv?.messages ?? []).map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}>
                    <div
                      className={`max-w-[94%] sm:max-w-[84%] rounded-xl px-4 py-3.5 border ${
                        isUser
                          ? 'bg-[#0F274A] dark:bg-sky-700 text-white border-[#0F274A] dark:border-sky-700'
                          : msg.error
                          ? 'bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-300 border-red-200 dark:border-red-900'
                          : 'bg-[#f8f9fb] dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-2 text-[11px]">
                        <span className={isUser ? 'text-blue-200 font-semibold' : 'text-slate-500 dark:text-slate-400 font-semibold'}>
                          {isUser ? user.fullName : tr('دستیار هوش مصنوعی', 'AI Assistant')} · {fmtDateTime(msg.createdAt)}
                        </span>
                        {!isUser && !msg.error && (
                          <button
                            type="button"
                            onClick={() => void handleCopy(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400">{tr('کپی شد', 'Copied')}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>{tr('کپی پاسخ', 'Copy')}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {isUser ? (
                        <p className="text-sm leading-7 whitespace-pre-wrap">{msg.content}</p>
                      ) : msg.error ? (
                        <div className="flex items-start gap-2 text-xs leading-6">
                          <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-1" />
                          <span>{msg.content}</span>
                        </div>
                      ) : (
                        <MarkdownMathRenderer content={msg.content} />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live optimistic streaming user message + live assistant SSE stream */}
              {pendingUserText && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[94%] sm:max-w-[84%] rounded-xl px-4 py-3.5 border bg-[#0F274A] dark:bg-sky-700 text-white border-[#0F274A] dark:border-sky-700">
                    <div className="text-[11px] text-blue-200 font-semibold mb-2">{user.fullName}</div>
                    <p className="text-sm leading-7 whitespace-pre-wrap">{pendingUserText}</p>
                  </div>
                </div>
              )}

              {streaming && (
                <div className="flex flex-col items-end">
                  <div className="max-w-[94%] sm:max-w-[84%] rounded-xl px-4 py-3.5 border bg-[#f8f9fb] dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-4 mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0F274A] dark:text-sky-400" />
                        <span>{tr('در حال نگارش پاسخ...', 'Generating response...')}</span>
                      </span>
                    </div>
                    {streamingText ? (
                      <MarkdownMathRenderer content={streamingText} />
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('در حال تحلیل اطلاعات مجاز و آماده‌سازی پاسخ...', 'Analyzing scoped data...')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Alert with Retry */}
        {errorBanner && (
          <div className="mx-4 mb-2 px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center justify-between gap-2 text-xs text-red-800 dark:text-red-300">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorBanner}</span>
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => void sendMessage(lastFailedPrompt)}
                  className="inline-flex items-center gap-1 font-semibold text-red-900 dark:text-red-200 hover:underline"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{tr('تلاش مجدد', 'Retry')}</span>
                </button>
              )}
              <button type="button" onClick={() => setErrorBanner(null)} className="underline">
                {tr('بستن', 'Dismiss')}
              </button>
            </div>
          </div>
        )}

        {/* Compact Horizontal Scrollable Suggestions Bar above Composer */}
        <div className="px-3 sm:px-4 pt-2.5 pb-1.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollSuggestionsBy('prev')}
              aria-label={tr('پیشنهادهای قبلی', 'Previous suggestions')}
              className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors shrink-0"
            >
              {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>

            <div
              ref={suggestionsRef}
              onMouseDown={handleStripMouseDown}
              onMouseMove={handleStripMouseMove}
              onMouseUp={handleStripMouseEnd}
              onMouseLeave={handleStripMouseEnd}
              className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar select-none touch-pan-x cursor-grab active:cursor-grabbing py-0.5"
            >
              {config.starters.map((st) => {
                const label = lang === 'fa' ? st.labelFa : st.labelEn;
                const mode = lang === 'fa' ? st.modeFa : st.modeEn;
                const prompt = lang === 'fa' ? st.promptFa : st.promptEn;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-disabled={streaming}
                    onClick={(e) => {
                      if (didDragStripRef.current) {
                        e.preventDefault();
                        return;
                      }
                      if (streaming) return;
                      setSelectedMode(mode);
                      void sendMessage(prompt, mode);
                    }}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors ${
                      streaming
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-[#0F274A] dark:hover:border-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => scrollSuggestionsBy('next')}
              aria-label={tr('پیشنهادهای بعدی', 'Next suggestions')}
              className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors shrink-0"
            >
              {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="p-3 sm:p-4 pt-2 bg-slate-50/70 dark:bg-slate-800/40"
        >
          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={tr(
                'پرسش درسی، درخواست طراحی آزمون یا تحلیل آموزشی خود را بنویسید... (Enter ارسال · Shift+Enter خط جدید)',
                'Ask a question, generate a quiz, or analyze performance... (Enter to send · Shift+Enter newline)'
              )}
              className="flex-1 min-h-[44px] max-h-32 h-11 resize-none overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm leading-6 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A] dark:focus:border-sky-400 focus:ring-4 focus:ring-[#0F274A]/10 transition-all"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                aria-label={tr('توقف تولید', 'Stop generation')}
                title={tr('توقف تولید', 'Stop generation')}
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label={tr('ارسال پیام', 'Send message')}
                title={tr('ارسال', 'Send')}
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#0F274A] dark:bg-sky-600 text-white hover:bg-[#163663] dark:hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Slide-Over Drawer for Recent Conversations */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{ x: isRtl ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRtl ? '-100%' : '100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              aria-label={tr('گفت‌وگوهای اخیر', 'Recent Conversations')}
              className={`fixed inset-y-0 ${
                isRtl ? 'left-0 border-r' : 'right-0 border-l'
              } w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl flex flex-col z-10`}
            >
              <div className="p-4 border-b border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessagesSquare className="w-4 h-4 text-[#0F274A] dark:text-sky-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr('گفت‌وگوهای اخیر', 'Recent Conversations')}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void createNewConversation()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] dark:hover:bg-sky-500 transition-colors whitespace-nowrap"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>{tr('جدید', 'New')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    aria-label={tr('بستن', 'Close')}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Search
                    className={`w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                      isRtl ? 'right-3' : 'left-3'
                    }`}
                  />
                  <input
                    type="text"
                    value={searchConv}
                    onChange={(e) => setSearchConv(e.target.value)}
                    placeholder={tr('جستجو در تاریخچه...', 'Search history...')}
                    className={`w-full py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-[#0F274A] ${
                      isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'
                    }`}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {loadingList ? (
                  <div className="p-4 space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 leading-6">
                    {conversations.length === 0
                      ? tr('هنوز گفت‌وگویی آغاز نکرده‌اید.', 'No saved conversations yet.')
                      : tr('موردی با این عنوان یافت نشد.', 'No matching conversations found.')}
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isSelected = activeConv?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`p-3.5 flex items-start justify-between gap-2 transition-colors ${
                          isSelected ? 'bg-slate-100/90 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void openConversation(c.id)}
                          className={`flex-1 min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}
                        >
                          <p
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-[#0F274A] dark:text-sky-300' : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {c.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {c.mode} · {fmtDigits(c.messageCount)} {tr('پیام', 'msgs')}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                            {fmtDateTime(c.updatedAt)}
                          </p>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(c);
                              setRenameValue(c.title);
                            }}
                            aria-label={tr('تغییر عنوان', 'Rename')}
                            className="p-1.5 rounded text-slate-400 hover:text-[#0F274A] dark:hover:text-sky-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            aria-label={tr('حذف گفت‌وگو', 'Delete chat')}
                            className="p-1.5 rounded text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={tr('تغییر عنوان گفت‌وگو', 'Rename Conversation')}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleRenameSubmit()}
              className="px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold"
            >
              {tr('ذخیره عنوان', 'Save Title')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={tr('تأیید حذف گفت‌وگو', 'Confirm Delete Chat')}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
            {tr(
              `آیا از حذف گفت‌وگوی «${deleteTarget?.title ?? ''}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.`,
              `Are you sure you want to delete "${deleteTarget?.title ?? ''}"? This cannot be undone.`
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              {tr('انصراف', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => void confirmDeleteConversation()}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
            >
              {tr('حذف گفت‌وگو', 'Delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
