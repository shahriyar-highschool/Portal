import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Coins,
  Globe,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type { Announcement, DirectMessage, SchoolSettings, UserAccount } from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  accent?: boolean;
  section?: string;
}

interface AppShellProps {
  user: UserAccount;
  settings: SchoolSettings | null;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onLogout: () => void;
  announcements?: Announcement[];
  unreadMessages?: DirectMessage[];
  onNavigateNotifications?: () => void;
  children: ReactNode;
}

const EMBLEM_SRC = '/assets/aistudio/image_1b3c1aaa.png';

export function AppShell({
  user,
  settings,
  navItems,
  activeTab,
  onSelectTab,
  onLogout,
  announcements = [],
  unreadMessages = [],
  onNavigateNotifications,
  children,
}: AppShellProps) {
  const { lang, isRtl, toggleLang, tr, fmtDigits, fmtDateTime, roleLabel, termLabel, schoolTitle } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);

  const activeNav = navItems.find((n) => n.id === activeTab);
  const notifCount = unreadMessages.length + announcements.slice(0, 3).length;

  const handleNavClick = (id: string) => {
    onSelectTab(id);
    setMobileMenuOpen(false);
  };

  const handleLanguageSwitch = () => {
    const nextLang = lang === 'fa' ? 'en' : 'fa';
    toggleLang();
    void apiRequest('/api/auth/me', {
      method: 'PATCH',
      notify: false,
      silentError: true,
      body: JSON.stringify({ preferredLanguage: nextLang }),
    }).catch(() => {});
  };

  const handleThemeSwitch = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    toggleTheme();
    void apiRequest('/api/auth/me', {
      method: 'PATCH',
      notify: false,
      silentError: true,
      body: JSON.stringify({ preferredTheme: nextTheme }),
    }).catch(() => {});
  };

  const groupedSections: Array<{ title: string; items: NavItem[] }> = [];
  for (const item of navItems) {
    const secTitle = item.section ?? '';
    const last = groupedSections[groupedSections.length - 1];
    if (!last || last.title !== secTitle) {
      groupedSections.push({ title: secTitle, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  const SidebarContent = () => (
    <div
      className={`flex flex-col h-full bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 ${
        isRtl ? 'border-l' : 'border-r'
      }`}
    >
      {/* Brand Lockup */}
      <div className="px-5 py-4 border-b border-slate-200/90 dark:border-slate-800 flex items-center gap-3">
        {!emblemFailed ? (
          <img
            src={EMBLEM_SRC}
            alt={schoolTitle(settings?.schoolName)}
            referrerPolicy="no-referrer"
            onError={() => setEmblemFailed(true)}
            className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-slate-200 dark:border-slate-700 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-[#0F274A] text-white flex items-center justify-center font-bold text-sm shrink-0">
            {tr('ش', 'S')}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
            {schoolTitle(settings?.schoolName)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
            {roleLabel(user.role)} · {fmtDigits(settings?.academicYear ?? '1404-1405')}
          </p>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav aria-label={tr('منوی اصلی', 'Primary Navigation')} className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groupedSections.map((group, gi) => (
          <div key={`${group.title}_${gi}`} className="space-y-1">
            {group.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A] dark:focus-visible:ring-sky-400 ${
                    isActive
                      ? 'bg-[#0F274A] dark:bg-sky-600 text-white'
                      : item.accent
                      ? 'text-[#0F274A] dark:text-sky-300 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-white'
                          : item.accent
                          ? 'text-[#0F274A] dark:text-sky-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-[11px] tabular-nums font-bold px-1.5 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {fmtDigits(item.badge)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Account Footer */}
      <div className="p-3 border-t border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/70 space-y-2">
        <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user.fullName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono" dir="ltr">
              @{user.username}
            </p>
          </div>
          {user.coins !== undefined && (
            <span
              title={tr('امتیاز و سکه تحصیلی', 'Academic Coins')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-bold tabular-nums shrink-0"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{fmtDigits(user.coins)}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>{tr('خروج از حساب کاربری', 'Sign Out')}</span>
        </button>
      </div>
    </div>
  );

  const BreadcrumbChevron = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="print-shell-root min-h-screen bg-[#f6f7f9] dark:bg-slate-950 flex text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[272px] shrink-0 sticky top-0 h-screen no-print">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-72 max-w-[85vw] h-full relative z-10 shadow-xl">
            <SidebarContent />
          </div>
          <button
            type="button"
            aria-label={tr('بستن منو', 'Close menu')}
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-900/50 backdrop-blur-[1px]"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="print-shell-content flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-7 py-3 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={tr('باز کردن منوی کناری', 'Open navigation menu')}
              className="lg:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="min-w-0 flex items-center gap-2 text-xs sm:text-sm">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500 font-medium truncate">
                {roleLabel(user.role)}
              </span>
              <BreadcrumbChevron className="hidden sm:inline w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                {activeNav?.label ?? tr('داشبورد', 'Dashboard')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
            <span className="hidden xl:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
              {termLabel(settings?.currentTerm ?? 'نوبت اول')} · {fmtDigits(settings?.academicYear ?? '1404-1405')}
            </span>

            {/* Language Toggle */}
            <button
              type="button"
              onClick={handleLanguageSwitch}
              title={tr('تغییر زبان به انگلیسی', 'Switch language to Persian')}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
              <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={handleThemeSwitch}
              aria-label={isDark ? tr('حالت روشن', 'Light Mode') : tr('حالت تیره', 'Dark Mode')}
              title={isDark ? tr('حالت روشن', 'Light Mode') : tr('حالت تیره', 'Dark Mode')}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label={tr('اعلان‌ها و پیام‌ها', 'Notifications and messages')}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadMessages.length > 0 && (
                <span
                  className={`absolute -top-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ${
                    isRtl ? '-left-1.5' : '-right-1.5'
                  }`}
                >
                  {fmtDigits(unreadMessages.length)}
                </span>
              )}
            </button>

            <div
              className={`hidden sm:flex items-center gap-2.5 border-slate-200 dark:border-slate-700 ${
                isRtl ? 'pr-3 border-r' : 'pl-3 border-l'
              }`}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {user.fullName.trim().slice(0, 1)}
                </div>
              )}
              <div className="flex flex-col items-start">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">{user.fullName}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{roleLabel(user.role)}</span>
              </div>
            </div>

            {notifOpen && (
              <div
                className={`absolute top-12 w-80 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 overflow-hidden ${
                  isRtl ? 'left-0' : 'right-0'
                }`}
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/60">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {tr('اعلان‌ها و پیام‌های اخیر', 'Recent Alerts & Messages')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifCount === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      {tr('اعلان یا پیام خوانده‌نشده‌ای وجود ندارد.', 'No unread messages or alerts.')}
                    </div>
                  ) : (
                    <>
                      {unreadMessages.slice(0, 4).map((m) => (
                        <div key={m.id} className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{m.subject}</p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{m.body}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {m.senderName} · {fmtDateTime(m.createdAt)}
                          </p>
                        </div>
                      ))}
                      {announcements.slice(0, 3).map((a) => (
                        <div key={a.id} className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {tr('اطلاعیه:', 'Announcement:')} {a.title}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{a.body}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {a.authorName} · {fmtDateTime(a.createdAt)}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                {onNavigateNotifications && (
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigateNotifications();
                    }}
                    className="w-full py-2.5 text-xs font-semibold text-[#0F274A] dark:text-sky-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    {tr('مشاهده همه پیام‌ها و اطلاعیه‌ها', 'View All Messages & Announcements')}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="print-shell-main flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto">
          <motion.div
            key={activeTab}
            className="print-shell-motion"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
