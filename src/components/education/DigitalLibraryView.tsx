import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Film,
  Library,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type DigitalLibraryItem,
  type LibraryResourceCategory,
  type Subject,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { GRADE_LEVELS_FA } from '../../lib/persian';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

function isSafeOpenUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:';
  } catch {
    return false;
  }
}

export function DigitalLibraryView({
  user,
  subjects,
}: {
  user: UserAccount;
  subjects: Subject[];
}) {
  const { tr, fmtDateTime } = useI18n();
  const { showToast } = useToast();

  const [items, setItems] = useState<DigitalLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<LibraryResourceCategory | 'all'>('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [previewItem, setPreviewItem] = useState<DigitalLibraryItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LibraryResourceCategory>('handout');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [gradeLevel, setGradeLevel] = useState('هفتم');
  const [fileUrl, setFileUrl] = useState('');
  const [durationOrPages, setDurationOrPages] = useState('');
  const [contentPreview, setContentPreview] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = user.role !== 'student';

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ items: DigitalLibraryItem[] }>('/api/library');
      setItems(res.items ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در بارگذاری کتابخانه', 'Failed to load library'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const categoryLabels: Record<LibraryResourceCategory, string> = {
    handout: tr('جزوه درسی', 'Handouts'),
    book: tr('کتاب', 'Books'),
    video: tr('ویدئوی آموزشی', 'Videos'),
    sample_exam: tr('نمونه‌سؤال', 'Sample Exams'),
    verified_teacher_resource: tr('منبع تأییدشده دبیران', 'Verified Teacher Resources'),
  };

  const categoryIcon = (cat: LibraryResourceCategory) => {
    if (cat === 'video') return Film;
    if (cat === 'book') return BookOpen;
    if (cat === 'verified_teacher_resource') return CheckCircle2;
    return FileText;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (gradeFilter !== 'all' && item.gradeLevel !== gradeFilter) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !(item.subjectName ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, categoryFilter, gradeFilter, search]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await apiRequest('/api/library', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          subjectId: subjectId || undefined,
          gradeLevel,
          fileUrl: fileUrl.trim() || undefined,
          durationOrPages: durationOrPages.trim() || undefined,
          contentPreview: contentPreview.trim() || undefined,
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setFileUrl('');
      setDurationOrPages('');
      setContentPreview('');
      await loadItems();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در افزودن منبع', 'Failed to add item'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleApprove = async (item: DigitalLibraryItem) => {
    try {
      await apiRequest(`/api/library/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: !item.approved }),
      });
      await loadItems();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در تغییر وضعیت', 'Update failed'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/library/${id}`, { method: 'DELETE' });
      await loadItems();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف منبع', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Library className="w-5 h-5 text-[#0F274A] dark:text-sky-400" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {tr('کتابخانه دیجیتال و بانک منابع مدرسه', 'School Digital Library')}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {tr(
                'دسترسی طبقه‌بندی‌شده به جزوه‌ها، کتاب‌ها، ویدئوهای آموزشی، نمونه‌سؤالات امتحانی و منابع تأییدشده دبیران.',
                'Categorized handouts, textbooks, video lectures, sample exams, and verified teacher resources.'
              )}
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('افزودن منبع به کتابخانه', 'Add Resource')}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-[#0F274A] dark:text-sky-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tr('همه منابع', 'All')}
            </button>
            {(Object.keys(categoryLabels) as LibraryResourceCategory[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategoryFilter(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  categoryFilter === k
                    ? 'bg-white dark:bg-slate-900 text-[#0F274A] dark:text-sky-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {categoryLabels[k]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
            >
              <option value="all">{tr('همه پایه‌ها', 'All Grades')}</option>
              {GRADE_LEVELS_FA.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 start-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('جستجو در کتابخانه...', 'Search library...')}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 ps-8 pe-3 py-1.5 text-xs w-52"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500">
          {tr('در حال بارگذاری کتابخانه دیجیتال...', 'Loading resources...')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <Library className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {tr('منبعی مطابق فیلتر یافت نشد', 'No library resources found')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const Icon = categoryIcon(item.category);
            const canEditOrDelete = user.role === 'admin' || item.authorId === user.id;
            const safeUrl = isSafeOpenUrl(item.fileUrl);

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <Icon className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
                      <span>{categoryLabels[item.category]}</span>
                      <span>·</span>
                      <span>{item.subjectName || tr('عمومی', 'General')}</span>
                      <span>·</span>
                      <span>{item.gradeLevel}</span>
                      {!item.approved && (
                        <>
                          <span>·</span>
                          <span className="text-amber-700 dark:text-amber-400">
                            {tr('در انتظار تأیید', 'Pending')}
                          </span>
                        </>
                      )}
                    </p>
                    {canEditOrDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                        aria-label={tr('حذف منبع', 'Delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{item.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-5 line-clamp-3">
                    {item.description}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {tr('ارائه‌دهنده:', 'By:')} {item.authorName}
                    {item.durationOrPages ? ` · ${item.durationOrPages}` : ''}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{tr('مشاهده متن / جزئیات', 'Preview')}</span>
                    </button>
                    {safeUrl && item.fileUrl && (
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{tr('گشودن پیوند', 'Open Link')}</span>
                      </a>
                    )}
                  </div>
                  {user.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => void toggleApprove(item)}
                      className="text-xs font-semibold text-[#0F274A] dark:text-sky-400 hover:underline"
                    >
                      {item.approved ? tr('عدم انتشار', 'Unpublish') : tr('تأیید انتشار', 'Approve')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.title ?? ''}
        maxWidthClass="max-w-2xl"
      >
        {previewItem && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {categoryLabels[previewItem.category]} · {previewItem.subjectName || tr('عمومی', 'General')} ·{' '}
              {previewItem.gradeLevel} · {previewItem.authorName} · {fmtDateTime(previewItem.createdAt)}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-6">{previewItem.description}</p>
            {previewItem.contentPreview && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-6 max-h-80 overflow-y-auto">
                {previewItem.contentPreview}
              </div>
            )}
            {isSafeOpenUrl(previewItem.fileUrl) && previewItem.fileUrl && (
              <div className="flex justify-end">
                <a
                  href={previewItem.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{tr('باز کردن فایل / ویدئوی منبع', 'Open External Resource')}</span>
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={tr('افزودن منبع به کتابخانه دیجیتال', 'Add Digital Library Resource')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('عنوان منبع', 'Title')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('دسته‌بندی', 'Category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LibraryResourceCategory)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {(Object.keys(categoryLabels) as LibraryResourceCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {categoryLabels[k]}
                  </option>
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
                <option value="">{tr('عمومی', 'General')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('پایه تحصیلی', 'Grade')}</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {GRADE_LEVELS_FA.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('لینک فایل / ویدئو (اختیاری)', 'Resource URL (Optional)')}</label>
              <input
                type="url"
                dir="ltr"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('تعداد صفحه یا زمان (اختیاری)', 'Pages / Duration (Optional)')}</label>
              <input
                type="text"
                value={durationOrPages}
                onChange={(e) => setDurationOrPages(e.target.value)}
                placeholder={tr('مثلاً ۲۴ صفحه یا ۳۵ دقیقه', 'e.g. 24 pages / 35 min')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('توضیحات منبع', 'Description')}</label>
            <textarea
              rows={2}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('متن یا خلاصه محتوا برای پیش‌نمایش (اختیاری)', 'Inline Text Preview (Optional)')}</label>
            <textarea
              rows={4}
              value={contentPreview}
              onChange={(e) => setContentPreview(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
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
              className="px-5 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? tr('در حال ذخیره...', 'Saving...') : tr('انتشار در کتابخانه', 'Publish Resource')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
