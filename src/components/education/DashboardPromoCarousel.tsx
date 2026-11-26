import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Crown,
  FileCheck2,
  FileText,
  Flame,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  Printer,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UserRole } from '../../../shared/types';
import { useI18n } from '../../lib/i18n';

export type DashboardPromoTargetTab =
  | 'league'
  | 'league_hall'
  | 'ai'
  | 'private_tutor'
  | 'announcements'
  | 'report_card'
  | 'attendance'
  | 'grades';

type ArtworkKind =
  | 'league'
  | 'ai'
  | 'report_card'
  | 'attendance'
  | 'grades'
  | 'announcements'
  | 'private_tutor';

interface PromoSlide {
  id: string;
  tabId: DashboardPromoTargetTab;
  artwork: ArtworkKind;
  shortLabel: string;
  kicker: string;
  subLabel: string;
  title: string;
  desc: string;
  cta: string;
  icon: typeof Trophy;
  accentText: string;
  accentRing: string;
  stageBg: string;
  ctaBg: string;
  highlights: Array<{ icon: typeof Target; text: string }>;
  secondaryAction?: {
    label: string;
    tabId: DashboardPromoTargetTab;
    icon: typeof Crown;
  };
}

function SlideArtwork({ kind }: { kind: ArtworkKind }) {
  if (kind === 'league') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="lg-navy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0f274a" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {/* Subtle orbital ring */}
        <circle cx="140" cy="74" r="56" fill="none" stroke="currentColor" className="text-amber-500/20 dark:text-amber-400/20" strokeWidth="1.5" strokeDasharray="5 5" />
        <circle cx="140" cy="74" r="40" fill="none" stroke="currentColor" className="text-sky-600/20 dark:text-sky-400/20" strokeWidth="1.2" />
        {/* Tiered Podium */}
        <rect x="44" y="114" width="54" height="44" rx="8" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        <rect x="112" y="96" width="56" height="62" rx="8" fill="url(#lg-navy)" />
        <rect x="182" y="122" width="54" height="36" rx="8" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        {/* Podium lines */}
        <rect x="56" y="126" width="30" height="4" rx="2" fill="currentColor" className="text-slate-400/60" />
        <rect x="125" y="112" width="30" height="4" rx="2" fill="#38bdf8" fillOpacity="0.85" />
        <rect x="194" y="134" width="30" height="4" rx="2" fill="currentColor" className="text-slate-400/60" />
        {/* Trophy Crest */}
        <path d="M122 42 H158 V58 C158 70 150 78 140 78 C130 78 122 70 122 58 Z" fill="url(#lg-gold)" />
        <path d="M122 47 H113 C110 47 109 50 110 55 C112 61 117 64 122 64" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <path d="M158 47 H167 C170 47 171 50 170 55 C168 61 163 64 158 64" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <rect x="136" y="78" width="8" height="10" fill="#d97706" />
        <rect x="128" y="87" width="24" height="5" rx="2.5" fill="#b45309" />
        {/* Laurel dots */}
        <circle cx="96" cy="48" r="3" fill="#f59e0b" fillOpacity="0.65" />
        <circle cx="184" cy="48" r="3" fill="#38bdf8" fillOpacity="0.7" />
        <circle cx="140" cy="24" r="3.5" fill="#f59e0b" />
      </svg>
    );
  }

  if (kind === 'ai') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="ai-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        {/* Neural connection arcs */}
        <path d="M46 52 C88 52, 98 88, 140 88" fill="none" stroke="currentColor" className="text-sky-500/35" strokeWidth="2" />
        <path d="M46 124 C88 124, 98 88, 140 88" fill="none" stroke="currentColor" className="text-indigo-500/35" strokeWidth="2" />
        <path d="M234 52 C192 52, 182 88, 140 88" fill="none" stroke="currentColor" className="text-sky-500/35" strokeWidth="2" />
        <path d="M234 124 C192 124, 182 88, 140 88" fill="none" stroke="currentColor" className="text-indigo-500/35" strokeWidth="2" />
        <line x1="140" y1="24" x2="140" y2="152" stroke="currentColor" className="text-sky-500/20" strokeWidth="1.5" strokeDasharray="4 4" />
        {/* Outer Nodes */}
        <rect x="28" y="38" width="32" height="28" rx="8" className="fill-white dark:fill-slate-800 stroke-sky-300 dark:stroke-slate-600" strokeWidth="1.5" />
        <rect x="28" y="110" width="32" height="28" rx="8" className="fill-white dark:fill-slate-800 stroke-indigo-300 dark:stroke-slate-600" strokeWidth="1.5" />
        <rect x="220" y="38" width="32" height="28" rx="8" className="fill-white dark:fill-slate-800 stroke-sky-300 dark:stroke-slate-600" strokeWidth="1.5" />
        <rect x="220" y="110" width="32" height="28" rx="8" className="fill-white dark:fill-slate-800 stroke-indigo-300 dark:stroke-slate-600" strokeWidth="1.5" />
        <circle cx="44" cy="52" r="5" fill="#0ea5e9" />
        <circle cx="44" cy="124" r="5" fill="#6366f1" />
        <circle cx="236" cy="52" r="5" fill="#0ea5e9" />
        <circle cx="236" cy="124" r="5" fill="#6366f1" />
        {/* Central Core Hexagon */}
        <circle cx="140" cy="88" r="36" fill="none" stroke="#0ea5e9" strokeOpacity="0.25" strokeWidth="1.5" />
        <polygon points="140,56 168,72 168,104 140,120 112,104 112,72" fill="url(#ai-core)" />
        {/* Four-point spark inside core */}
        <path d="M140 73 L144 84 L155 88 L144 92 L140 103 L136 92 L125 88 L136 84 Z" fill="#ffffff" />
      </svg>
    );
  }

  if (kind === 'report_card') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        {/* Back Sheet */}
        <rect x="74" y="20" width="138" height="136" rx="10" transform="rotate(-4 140 88)" fill="currentColor" className="text-slate-200/80 dark:text-slate-700/70" />
        {/* Main Report Card Sheet */}
        <rect x="72" y="22" width="136" height="134" rx="10" fill="currentColor" className="text-white dark:text-slate-800" />
        <rect x="72" y="22" width="136" height="26" rx="10" fill="#0f274a" />
        <rect x="72" y="38" width="136" height="10" fill="#0f274a" />
        <rect x="86" y="31" width="68" height="5" rx="2.5" fill="#ffffff" fillOpacity="0.9" />
        {/* Table Rows */}
        <rect x="86" y="60" width="108" height="6" rx="3" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        <rect x="86" y="74" width="84" height="6" rx="3" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        <rect x="86" y="88" width="96" height="6" rx="3" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        <rect x="86" y="102" width="76" height="6" rx="3" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        {/* Signature line */}
        <line x1="86" y1="136" x2="138" y2="136" stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeWidth="2" strokeLinecap="round" />
        {/* Official Seal */}
        <circle cx="182" cy="128" r="18" fill="#f59e0b" fillOpacity="0.18" stroke="#d97706" strokeWidth="2" />
        <path d="M174 128 L180 134 L191 122" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'attendance') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        {/* Calendar Frame */}
        <rect x="52" y="26" width="176" height="126" rx="12" fill="currentColor" className="text-white dark:text-slate-800" />
        <rect x="52" y="26" width="176" height="28" rx="12" fill="#0f274a" />
        <rect x="52" y="42" width="176" height="12" fill="#0f274a" />
        {/* Calendar Rings */}
        <rect x="92" y="18" width="8" height="16" rx="4" fill="#38bdf8" />
        <rect x="180" y="18" width="8" height="16" rx="4" fill="#38bdf8" />
        {/* Checkmark Tiles Grid */}
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => {
            const x = 68 + col * 38;
            const y = 66 + row * 26;
            const isWarn = row === 1 && col === 2;
            const isNeutral = row === 2 && col === 3;
            return (
              <g key={`${row}-${col}`}>
                <rect
                  x={x}
                  y={y}
                  width="30"
                  height="18"
                  rx="5"
                  fill={isWarn ? '#fef3c7' : isNeutral ? '#e2e8f0' : '#dcfce7'}
                />
                {isWarn ? (
                  <circle cx={x + 15} cy={y + 9} r="4" fill="#d97706" />
                ) : isNeutral ? (
                  <rect x={x + 9} y={y + 7.5} width="12" height="3" rx="1.5" fill="#64748b" />
                ) : (
                  <path
                    d={`M${x + 10} ${y + 9} L${x + 14} ${y + 13} L${x + 21} ${y + 6}`}
                    fill="none"
                    stroke="#15803d"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            );
          })
        )}
      </svg>
    );
  }

  if (kind === 'grades') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        {/* Card surface */}
        <rect x="44" y="24" width="192" height="128" rx="12" fill="currentColor" className="text-white dark:text-slate-800" />
        {/* Grid baselines */}
        <line x1="64" y1="126" x2="216" y2="126" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" />
        <line x1="64" y1="96" x2="216" y2="96" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="64" y1="66" x2="216" y2="66" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1" strokeDasharray="4 4" />
        {/* Bars */}
        <rect x="74" y="92" width="18" height="34" rx="4" fill="#93c5fd" />
        <rect x="108" y="76" width="18" height="50" rx="4" fill="#38bdf8" />
        <rect x="142" y="64" width="18" height="62" rx="4" fill="#0284c7" />
        <rect x="176" y="46" width="18" height="80" rx="4" fill="#0f274a" />
        {/* Trend Curve */}
        <polyline
          points="83,84 117,68 151,56 185,38"
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="83" cy="84" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="117" cy="68" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="151" cy="56" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="185" cy="38" r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === 'announcements') {
    return (
      <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
        {/* Stacked Notice Cards */}
        <rect x="64" y="34" width="152" height="106" rx="12" transform="rotate(3 140 88)" fill="currentColor" className="text-indigo-200/70 dark:text-indigo-900/50" />
        <rect x="60" y="32" width="156" height="108" rx="12" fill="currentColor" className="text-white dark:text-slate-800" />
        {/* Notice Content Bars */}
        <rect x="116" y="54" width="80" height="7" rx="3.5" fill="#4f46e5" fillOpacity="0.85" />
        <rect x="116" y="70" width="64" height="5" rx="2.5" fill="currentColor" className="text-slate-300 dark:text-slate-600" />
        <rect x="78" y="94" width="118" height="5" rx="2.5" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        <rect x="78" y="108" width="94" height="5" rx="2.5" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
        {/* Megaphone Emblem */}
        <circle cx="92" cy="62" r="18" fill="#eef2ff" />
        <path d="M84 60 L98 53 V71 L84 64 Z" fill="#4f46e5" />
        <rect x="81" y="59" width="4" height="6" rx="1" fill="#312e81" />
        {/* Broadcast Signal Arcs */}
        <path d="M224 60 C234 72, 234 94, 224 106" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5" />
        <path d="M234 50 C248 68, 248 98, 234 116" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.28" />
      </svg>
    );
  }

  // private_tutor
  return (
    <svg viewBox="0 0 280 176" className="w-full h-full" aria-hidden="true">
      {/* Open Book Pages */}
      <path
        d="M52 44 C82 36, 114 40, 140 54 C166 40, 198 36, 228 44 V136 C198 128, 166 132, 140 146 C114 132, 82 128, 52 136 Z"
        fill="currentColor"
        className="text-white dark:text-slate-800"
      />
      <line x1="140" y1="54" x2="140" y2="146" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="2" />
      {/* Left page lines */}
      <rect x="70" y="64" width="52" height="5" rx="2.5" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
      <rect x="70" y="78" width="44" height="5" rx="2.5" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
      <rect x="70" y="92" width="48" height="5" rx="2.5" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
      <rect x="70" y="106" width="36" height="5" rx="2.5" fill="#10b981" fillOpacity="0.6" />
      {/* Right page diagnostic target */}
      <circle cx="184" cy="88" r="22" fill="#ecfdf5" stroke="#10b981" strokeWidth="2" />
      <circle cx="184" cy="88" r="12" fill="none" stroke="#10b981" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M177 88 L182 93 L192 82" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Floating Mortarboard Cap */}
      <polygon points="140,18 170,30 140,42 110,30" fill="#0f274a" />
      <path d="M124 36 V46 C124 50, 156 50, 156 46 V36" fill="#1e3a8a" />
      <line x1="168" y1="31" x2="168" y2="44" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DashboardPromoCarousel({
  role,
  onNavigate,
}: {
  role: UserRole;
  onNavigate: (tab: DashboardPromoTargetTab) => void;
}) {
  const { tr, isRtl } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const DirectionalArrow = isRtl ? ArrowLeft : ArrowRight;
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  // Slide factory per domain so each role gets distinct ordered slides & role-tailored copy
  const slideRegistry: Record<
    'league' | 'ai' | 'report_card' | 'attendance' | 'grades' | 'announcements' | 'private_tutor',
    PromoSlide
  > = {
    league: {
      id: 'league',
      tabId: 'league',
      artwork: 'league',
      shortLabel: tr('لیگ مطالعاتی', 'Study League'),
      kicker:
        role === 'admin'
          ? tr('رقابت علمی و راهبری مدرسه', 'Schoolwide Competition Governance')
          : tr('انگیزه، رقابت و پیگیری مطالعه', 'Class Motivation & Study Tracking'),
      subLabel: tr('دوره ماهانه فعال', 'Monthly Season Active'),
      title:
        role === 'admin'
          ? tr(
              'لیگ مطالعاتی — مدیریت فصول، قوانین امتیازدهی و گزارش‌های جامع مدرسه',
              'Study League — Seasons, Scoring Governance & Executive Reports'
            )
          : tr(
              'لیگ مطالعاتی — رصد مطالعه دانش‌آموزان، تأیید گزارش‌ها و تحلیل کلاس',
              'Study League — Track Study Hours, Approve Logs & Class Insights'
            ),
      desc:
        role === 'admin'
          ? tr(
              'رقابت آموزشی ماهانه را در تمام پایه‌ها و کلاس‌ها مدیریت کنید، عملکردهای مشکوک را ممیزی نمایید و گزارش‌های ۵ شیتی اکسل و نموداری دریافت کنید.',
              'Lead monthly academic competition across all grades, audit flagged study logs, and export 5-sheet Excel analytical reports.'
            )
          : tr(
              'اهداف و عملکرد روزانه دانش‌آموزان کلاس‌های خود را دنبال کنید، گزارش‌های نیازمند بررسی را تأیید نمایید، پیام تشویقی بفرستید و نشان افتخار اعطا کنید.',
              'Monitor daily student goals and study logs, approve flagged submissions, send motivational coaching, and award achievement badges.'
            ),
      cta:
        role === 'admin'
          ? tr('ورود به لیگ و مرکز گزارش‌ها', 'Open Study League Console')
          : tr('ورود به پنل لیگ و کلاس‌ها', 'Open Class Study League'),
      icon: Trophy,
      accentText: 'text-amber-600 dark:text-amber-400',
      accentRing: 'border-amber-200/90 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40',
      stageBg: 'bg-gradient-to-br from-amber-50/90 via-slate-50 to-sky-50/70 dark:from-amber-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-[#0F274A] hover:bg-[#163663] dark:bg-amber-600 dark:hover:bg-amber-500',
      highlights:
        role === 'admin'
          ? [
              { icon: BarChart3, text: tr('گزارش جامع و خروجی ۵ شیتی اکسل', '5-Sheet Excel & Charts') },
              { icon: Trophy, text: tr('مدیریت فصول و ضرایب امتیاز', 'Seasons & Scoring Weights') },
              { icon: Crown, text: tr('رتبه‌بندی عادلانه پایه‌ها', 'Fair Cross-Grade Ranks') },
            ]
          : [
              { icon: BarChart3, text: tr('تحلیل عملکرد کلاس و دروس', 'Class & Subject Analytics') },
              { icon: Flame, text: tr('پایش استمرار و هشدار کم‌فعالی', 'Streaks & Activity Alerts') },
              { icon: Award, text: tr('اعطای نشان و بازخورد مستقیم', 'Badges & Coaching') },
            ],
      secondaryAction: {
        label: tr('مشاهده برترین‌های لیگ', 'Hall of Fame'),
        tabId: 'league_hall',
        icon: Crown,
      },
    },

    ai: {
      id: 'ai',
      tabId: 'ai',
      artwork: 'ai',
      shortLabel: tr('هوش مصنوعی', 'AI Assistant'),
      kicker:
        role === 'admin'
          ? tr('دستیار هوشمند مدیریت مدرسه', 'Executive School AI Copilot')
          : role === 'teacher'
            ? tr('دستیار هوشمند طراحی درس و سؤال', 'Teaching & Exam AI Copilot')
            : tr('پاسخگویی هوشمند و رفع اشکال فوری', 'Instant Academic Q&A'),
      subLabel: tr('پاسخگویی آنلاین و آنی', 'Instant Response'),
      title:
        role === 'admin'
          ? tr(
              'دستیار هوش مصنوعی مدیریت — تحلیل روندها، نگارش بخشنامه و مشاوره آموزشی',
              'AI Admin Assistant — Synthesize Insights & Draft School Notices'
            )
          : role === 'teacher'
            ? tr(
                'دستیار هوش مصنوعی معلم — طراحی سؤال استاندارد، طرح درس و تمرین تکمیلی',
                'AI Teaching Assistant — Draft Exams, Lesson Plans & Exercises'
              )
            : tr(
                'دستیار هوش مصنوعی درسی — حل گام‌به‌گام تمرین و توضیح ساده مفاهیم سخت',
                'AI Study Assistant — Step-by-Step Solutions & Concept Clarity'
              ),
      desc:
        role === 'admin'
          ? tr(
              'متون بخشنامه‌ها و اطلاعیه‌ها را حرفه‌ای بنویسید، گزارش‌های مدیریتی را خلاصه کنید و برای ارتقای کیفیت آموزشی مدرسه پیشنهادهای عملی بگیرید.',
              'Draft polished administrative notices, summarize academic trends, and explore data-backed school improvement ideas.'
            )
          : role === 'teacher'
            ? tr(
                'در کمترین زمان نمونه سؤال‌های طبقه‌بندی‌شده بسازید، طرح درس دقیق تدوین کنید و پاسخ‌نامه تشریحی تمرین‌ها را آماده نمایید.',
                'Create tiered assessment questions, build structured lesson plans, and generate step-by-step model solutions in seconds.'
              )
            : tr(
                'هر سؤال درسی را بپرسید، راه‌حل مرحله‌به‌مرحله دریافت کنید، مفاهیم کتاب درسی را خلاصه کنید و برای امتحانات آماده شوید.',
                'Ask questions across any subject, receive step-by-step explanations, and summarize chapters ahead of exams.'
              ),
      cta:
        role === 'admin'
          ? tr('ورود به دستیار هوشمند مدیریت', 'Open Admin AI')
          : role === 'teacher'
            ? tr('ورود به دستیار هوشمند معلم', 'Open Teacher AI')
            : tr('گفتگو با دستیار هوش مصنوعی', 'Open Study AI'),
      icon: Bot,
      accentText: 'text-sky-600 dark:text-sky-400',
      accentRing: 'border-sky-200/90 dark:border-sky-800/70 bg-sky-50/80 dark:bg-sky-950/40',
      stageBg: 'bg-gradient-to-br from-sky-50/90 via-slate-50 to-indigo-50/70 dark:from-sky-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500',
      highlights:
        role === 'admin'
          ? [
              { icon: FileText, text: tr('نگارش بخشنامه و مکاتبات رسمی', 'Draft Official Bulletins') },
              { icon: BarChart3, text: tr('خلاصه‌سازی شاخص‌های مدرسه', 'School Metric Summaries') },
              { icon: Sparkles, text: tr('ایده‌پردازی برنامه‌های آموزشی', 'Academic Planning Ideas') },
            ]
          : role === 'teacher'
            ? [
                { icon: FileText, text: tr('تولید طرح درس و نمونه سؤال', 'Lesson Plans & Quizzes') },
                { icon: Sparkles, text: tr('تنظیم تمرین در سطوح مختلف', 'Tiered Practice Sets') },
                { icon: MessageSquareText, text: tr('پاسخ‌نامه تشریحی سریع', 'Detailed Answer Keys') },
              ]
            : [
                { icon: Sparkles, text: tr('توضیح ساده و مرحله‌به‌مرحله', 'Step-by-Step Solutions') },
                { icon: BookOpenCheck, text: tr('خلاصه‌سازی مباحث درسی', 'Chapter Summaries') },
                { icon: MessageSquareText, text: tr('رفع اشکال نامحدود دروس', 'All-Subject Q&A') },
              ],
    },

    report_card: {
      id: 'report_card',
      tabId: 'report_card',
      artwork: 'report_card',
      shortLabel: tr('چاپ کارنامه', 'Report Cards'),
      kicker: tr('صدور و چاپ رسمی سوابق تحصیلی', 'Official Academic Transcripts'),
      subLabel: tr('قالب استاندارد و مقایسه‌ای', 'Print-Ready A4 Format'),
      title: tr(
        'چاپ کارنامه پیشرفته — صدور کارنامه تکی و گروهی با نمودار مقایسه میانگین کلاس',
        'Advanced Report Cards — Print Single or Batch Transcripts with Class Comparison'
      ),
      desc: tr(
        'کارنامه‌های رسمی دانش‌آموزان را در نوبت‌های مختلف با معدل دقیق، رتبه کلاسی، وضعیت حضور و غیاب و نمودار مقایسه نمره هر درس با میانگین کلاس چاپ یا ذخیره PDF کنید.',
        'Generate and print crisp A4 report cards featuring GPA, class rank, attendance breakdown, and subject-by-subject comparison charts.'
      ),
      cta: tr('ورود به بخش چاپ کارنامه', 'Open Report Cards'),
      icon: Printer,
      accentText: 'text-[#0F274A] dark:text-sky-300',
      accentRing: 'border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800',
      stageBg: 'bg-gradient-to-br from-slate-100/90 via-white to-amber-50/50 dark:from-slate-800/80 dark:via-slate-900 dark:to-slate-800',
      ctaBg: 'bg-[#0F274A] hover:bg-[#163663] dark:bg-sky-600 dark:hover:bg-sky-500',
      highlights: [
        { icon: Printer, text: tr('چاپ تکی و گروهی کلاس با قالب A4', 'Single & Batch A4 Print') },
        { icon: BarChart3, text: tr('نمودار مقایسه نمره با میانگین کلاس', 'Student vs Class Chart') },
        { icon: FileCheck2, text: tr('محاسبه خودکار معدل و رتبه', 'Auto GPA & Class Rank') },
      ],
    },

    attendance: {
      id: 'attendance',
      tabId: 'attendance',
      artwork: 'attendance',
      shortLabel: tr('حضور و غیاب', 'Attendance'),
      kicker: tr('نظارت دقیق انضباطی و کلاسی', 'Classroom Presence & Punctuality'),
      subLabel: tr('ثبت گروهی و گزارش‌گیری روزانه', 'Daily Batch Tracking'),
      title: tr(
        'حضور و غیاب هوشمند — پایش لحظه‌ای وضعیت حضور، تأخیر و غیبت‌های کل مدرسه',
        'Attendance Control — Monitor Daily Presence, Tardiness & Excused Records'
      ),
      desc: tr(
        'سوابق حضور و غیاب کلاس‌ها را بر اساس تاریخ، درس و دانش‌آموز بررسی کنید، ثبت گروهی انجام دهید و وضعیت غیبت‌های موجه و غیرموجه را پیگیری نمایید.',
        'Review attendance across every class and date, record batch roll calls effortlessly, and track late arrivals and excused absences.'
      ),
      cta: tr('ورود به بخش حضور و غیاب', 'Open Attendance'),
      icon: CalendarCheck2,
      accentText: 'text-emerald-700 dark:text-emerald-400',
      accentRing: 'border-emerald-200/90 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40',
      stageBg: 'bg-gradient-to-br from-emerald-50/85 via-slate-50 to-teal-50/70 dark:from-emerald-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500',
      highlights: [
        { icon: CheckCircle2, text: tr('ثبت و ویرایش سریع کلاسی', 'Fast Classroom Roll Call') },
        { icon: CalendarCheck2, text: tr('تفکیک حاضر، غایب، تأخیر و موجه', '4-State Attendance Log') },
        { icon: BarChart3, text: tr('تحلیل نرخ حضور دانش‌آموزان', 'Presence Rate Tracking') },
      ],
    },

    grades: {
      id: 'grades',
      tabId: 'grades',
      artwork: 'grades',
      shortLabel: tr('نمرات', 'Grades'),
      kicker:
        role === 'teacher'
          ? tr('ارزشیابی و ثبت نمرات کلاس‌ها', 'Class Assessment & Gradebook')
          : tr('کارنامه درسی و روند پیشرفت', 'Academic Scores & Progress'),
      subLabel:
        role === 'teacher'
          ? tr('ثبت تکی، گروهی و اکسل', 'Single & Batch Grading')
          : tr('شفافیت کامل در تمام نوبت‌ها', 'All-Term Visibility'),
      title:
        role === 'teacher'
          ? tr(
              'مدیریت نمرات — ثبت سریع نمرات نوبت‌ها، تحلیل عملکرد کلاس و پیگیری پیشرفت',
              'Gradebook — Fast Score Entry, Term Analysis & Student Progress'
            )
          : tr(
              'بخش نمرات — مشاهده ریز نمرات دروس، معدل نوبت‌ها و تحلیل نقاط قوت شما',
              'My Grades — Detailed Subject Scores, Term GPA & Growth Tracking'
            ),
      desc:
        role === 'teacher'
          ? tr(
              'نمرات مستمر و پایانی دانش‌آموزان کلاس‌های خود را به‌صورت سریع ثبت و ویرایش کنید و وضعیت دروس و میانگین کلاس را هم‌زمان پایش نمایید.',
              'Record and update continuous and final term scores for your assigned classes while monitoring class averages in real time.'
            )
          : tr(
              'نمرات ثبت‌شده در تمام دروس و نوبت‌های تحصیلی را مشاهده کنید، روند تغییر نمره خود را بسنجید و دروس نیازمند تمرین بیشتر را بشناسید.',
              'Inspect every recorded score across subjects and terms, review grade trends, and spot subjects ready for extra practice.'
            ),
      cta:
        role === 'teacher'
          ? tr('ورود به بخش ثبت و مدیریت نمرات', 'Open Gradebook')
          : tr('مشاهده نمرات و سوابق درسی', 'View My Grades'),
      icon: ClipboardCheck,
      accentText: 'text-sky-700 dark:text-sky-400',
      accentRing: 'border-sky-200/90 dark:border-sky-800/70 bg-sky-50/80 dark:bg-sky-950/40',
      stageBg: 'bg-gradient-to-br from-sky-50/85 via-white to-emerald-50/60 dark:from-sky-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-[#0F274A] hover:bg-[#163663] dark:bg-sky-600 dark:hover:bg-sky-500',
      highlights:
        role === 'teacher'
          ? [
              { icon: ClipboardCheck, text: tr('ثبت و ویرایش سریع نمرات دروس', 'Fast Subject Grade Entry') },
              { icon: TrendingUp, text: tr('مقایسه روند نوبت‌های تحصیلی', 'Cross-Term Trend View') },
              { icon: Award, text: tr('پشتیبانی از ۴ نوبت رسمی', '4 Official Term Support') },
            ]
          : [
              { icon: Award, text: tr('نمایش دقیق نمرات هر درس و نوبت', 'Per-Subject & Term Scores') },
              { icon: TrendingUp, text: tr('تحلیل روند صعودی یا افت نمره', 'Progress Trend Analysis') },
              { icon: Target, text: tr('شناسایی نقاط قوت و ضعف درسی', 'Strengths & Focus Areas') },
            ],
    },

    announcements: {
      id: 'announcements',
      tabId: 'announcements',
      artwork: 'announcements',
      shortLabel: tr('اطلاعیه‌ها', 'Announcements'),
      kicker:
        role === 'teacher'
          ? tr('ارتباط سریع با دانش‌آموزان کلاس', 'Class Updates & School Notices')
          : tr('خبرنامه رسمی و بخشنامه‌های مدرسه', 'Official Notices & Bulletins'),
      subLabel: tr('به‌روزرسانی لحظه‌ای', 'Real-Time Updates'),
      title:
        role === 'teacher'
          ? tr(
              'اطلاعیه‌ها — انتشار یادآوری آزمون و نکات مهم برای کلاس‌ها و اخبار مدرسه',
              'Announcements — Post Class Reminders & Read Official Bulletins'
            )
          : tr(
              'اطلاعیه‌های مدرسه — پیگیری بخشنامه‌ها، برنامه امتحانات و پیام‌های مهم دبیران',
              'Announcements — Stay Updated on Exam Dates, Notices & Class Updates'
            ),
      desc:
        role === 'teacher'
          ? tr(
              'اطلاعیه‌های هدفمند برای کلاس‌های خود منتشر کنید، تاریخ امتحانات و تکالیف مهم را یادآوری نمایید و بخشنامه‌های جدید مدیریت را دنبال کنید.',
              'Publish targeted notices for your classes, remind students of upcoming exams, and keep track of leadership updates.'
            )
          : tr(
              'آخرین اطلاعیه‌های فوری، مهم و عمومی مدرسه و دبیران خود را به‌صورت دسته‌بندی‌شده مشاهده کنید تا هیچ برنامه یا بخشنامه‌ای را از دست ندهید.',
              'Browse urgent, important, and general bulletins from school administration and teachers cleanly organized in one feed.'
            ),
      cta:
        role === 'teacher'
          ? tr('مشاهده و ثبت اطلاعیه کلاس', 'View & Post Notices')
          : tr('مشاهده همه اطلاعیه‌ها', 'View Announcements'),
      icon: Megaphone,
      accentText: 'text-indigo-600 dark:text-indigo-400',
      accentRing: 'border-indigo-200/90 dark:border-indigo-800/70 bg-indigo-50/80 dark:bg-indigo-950/40',
      stageBg: 'bg-gradient-to-br from-indigo-50/85 via-slate-50 to-sky-50/70 dark:from-indigo-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500',
      highlights: [
        { icon: Megaphone, text: tr('تفکیک فوری، مهم و عادی', 'Urgent, Important & Normal') },
        { icon: Target, text: tr('هدف‌گذاری کل مدرسه یا کلاس خاص', 'Schoolwide or Class Feed') },
        { icon: FileText, text: tr('آرشیو منظم تمام اخبار و اعلان‌ها', 'Full Notice Archive') },
      ],
    },

    private_tutor: {
      id: 'private_tutor',
      tabId: 'private_tutor',
      artwork: 'private_tutor',
      shortLabel: tr('معلم خصوصی', 'Private Tutor'),
      kicker: tr('یادگیری هوشمند و رفع نقاط ضعف', 'Personalized Mastery & Remediation'),
      subLabel: tr('آموزش تطبیقی بر پایه منابع درسی', 'Source-Grounded Tutoring'),
      title: tr(
        'معلم خصوصی هوشمند — عیب‌یابی نقاط ضعف، تمرین جبرانی و برنامه تقویتی اختصاصی',
        'Smart Private Tutor — Diagnose Gaps, Practice & Build Remedial Plans'
      ),
      desc: tr(
        'بر اساس منابع و جزوه‌های درسی تمرین کنید، ریشه اشتباهات خود را بشناسید و برنامه مطالعاتی و تمرین‌های جبرانی اختصاصی برای تسلط کامل دریافت نمایید.',
        'Study directly from verified course materials, identify root causes of mistakes, and receive tailored remedial practice sets.'
      ),
      cta: tr('ورود به بخش معلم خصوصی', 'Open Private Tutor'),
      icon: GraduationCap,
      accentText: 'text-emerald-600 dark:text-emerald-400',
      accentRing: 'border-emerald-200/90 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40',
      stageBg: 'bg-gradient-to-br from-emerald-50/85 via-white to-sky-50/70 dark:from-emerald-950/30 dark:via-slate-800/70 dark:to-slate-900',
      ctaBg: 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500',
      highlights: [
        { icon: Target, text: tr('تشخیص دقیق نقاط ضعف درسی', 'Weakness Diagnostics') },
        { icon: BookOpenCheck, text: tr('تمرین هدفمند از روی منابع درس', 'Source-Grounded Practice') },
        { icon: Sparkles, text: tr('تولید برنامه جبرانی شخصی', 'Custom Remedial Study Plan') },
      ],
    },
  };

  // Strict per-role slide order requested by user
  const slides: PromoSlide[] =
    role === 'admin'
      ? [
          slideRegistry.league,
          slideRegistry.ai,
          slideRegistry.report_card,
          slideRegistry.attendance,
        ]
      : role === 'teacher'
        ? [
            slideRegistry.ai,
            slideRegistry.league,
            slideRegistry.grades,
            slideRegistry.announcements,
          ]
        : [
            slideRegistry.private_tutor,
            slideRegistry.announcements,
            slideRegistry.ai,
            slideRegistry.grades,
          ];

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isPaused, slides.length]);

  const safeIndex = activeIndex % slides.length;
  const activeSlide = slides[safeIndex];
  const translatePercent = (isRtl ? 1 : -1) * (safeIndex * (100 / slides.length));

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % slides.length);

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      aria-roledescription="carousel"
      aria-label={tr('اسلایدر معرفی بخش‌های کاربردی سامانه', 'Featured Workspace Carousel')}
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden ${
        isPaused ? 'promo-carousel-paused' : ''
      }`}
    >
      {/* Top 5-Second Animated Progress Bar */}
      <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
        <div
          key={safeIndex}
          className={`h-full w-full ${
            isRtl ? 'origin-right' : 'origin-left'
          } bg-[#0F274A] dark:bg-sky-400 animate-promo-fill`}
        />
      </div>

      {/* Sliding Track */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{
            width: `${slides.length * 100}%`,
            transform: `translateX(${translatePercent}%)`,
          }}
        >
          {slides.map((slide) => {
            const SlideIcon = slide.icon;
            return (
              <div
                key={slide.id}
                role="button"
                tabIndex={slide.id === activeSlide.id ? 0 : -1}
                onClick={() => onNavigate(slide.tabId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(slide.tabId);
                  }
                }}
                style={{ width: `${100 / slides.length}%` }}
                className="group cursor-pointer px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 focus:outline-none focus-visible:bg-slate-50/70 dark:focus-visible:bg-slate-800/40"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Right-Side Architectural Vector Illustration Stage */}
                  <div
                    className={`lg:col-span-4 rtl:lg:order-1 ltr:lg:order-2 rounded-xl border border-slate-200/80 dark:border-slate-800 ${slide.stageBg} bg-arch-grid p-3 flex items-center justify-center min-h-[156px] overflow-hidden`}
                  >
                    <div className="w-full max-w-[260px] h-[152px] transition-transform duration-300 group-hover:scale-[1.03]">
                      <SlideArtwork kind={slide.artwork} />
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="lg:col-span-8 rtl:lg:order-2 ltr:lg:order-1 flex flex-col justify-between gap-4">
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={`inline-flex w-7 h-7 rounded-lg border items-center justify-center shrink-0 ${slide.accentRing}`}
                        >
                          <SlideIcon className={`w-4 h-4 ${slide.accentText}`} />
                        </span>
                        <span className="font-bold text-[#0F274A] dark:text-sky-400">{slide.kicker}</span>
                        <span aria-hidden="true">·</span>
                        <span>{slide.subLabel}</span>
                      </div>

                      <h3 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 leading-snug text-balance">
                        {slide.title}
                      </h3>

                      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                        {slide.desc}
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                        {slide.highlights.map((item) => {
                          const HIcon = item.icon;
                          return (
                            <span key={item.text} className="inline-flex items-center gap-1.5 font-medium">
                              <HIcon className={`w-3.5 h-3.5 shrink-0 ${slide.accentText}`} />
                              <span>{item.text}</span>
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          tabIndex={slide.id === activeSlide.id ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(slide.tabId);
                          }}
                          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${slide.ctaBg}`}
                        >
                          <span>{slide.cta}</span>
                          <DirectionalArrow className="w-4 h-4 transition-transform group-hover:-translate-x-0.5 rtl:group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5" />
                        </button>

                        {slide.secondaryAction && (
                          <button
                            type="button"
                            tabIndex={slide.id === activeSlide.id ? 0 : -1}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(slide.secondaryAction!.tabId);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                          >
                            <slide.secondaryAction.icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>{slide.secondaryAction.label}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact Bottom Navigation Controls */}
      <div className="px-5 sm:px-6 pb-3.5 pt-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label={tr('انتخاب اسلاید', 'Choose slide')}>
          {slides.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={idx === safeIndex}
              aria-label={s.shortLabel}
              onClick={() => setActiveIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === safeIndex
                  ? 'w-7 bg-[#0F274A] dark:bg-sky-400'
                  : 'w-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={goPrev}
            aria-label={tr('اسلاید قبلی', 'Previous slide')}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <PrevIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={tr('اسلاید بعدی', 'Next slide')}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <NextIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
