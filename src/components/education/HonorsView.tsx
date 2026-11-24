import { Award, Medal, Plus, Printer, Trash2, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type HonorCategory,
  type HonorLevel,
  type StudentHonor,
  type UserAccount,
} from '../../../shared/types';
import { apiRequest } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export function HonorsView({
  user,
  students = [],
}: {
  user: UserAccount;
  students?: UserAccount[];
}) {
  const { tr, fmtDate } = useI18n();
  const { showToast } = useToast();

  const [honors, setHonors] = useState<StudentHonor[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<HonorCategory | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const [studentId, setStudentId] = useState(students[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HonorCategory>('olympiad');
  const [level, setLevel] = useState<HonorLevel>('province');
  const [rankOrMedal, setRankOrMedal] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('fa-IR'));
  const [issuer, setIssuer] = useState('');
  const [certificateRef, setCertificateRef] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = user.role !== 'student';

  const loadHonors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ honors: StudentHonor[] }>('/api/honors');
      setHonors(res.honors ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در دریافت پرونده افتخارات', 'Failed to load honors'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tr]);

  useEffect(() => {
    void loadHonors();
  }, [loadHonors]);

  const categoryLabels: Record<HonorCategory, string> = {
    olympiad: tr('المپیاد علمی', 'Scientific Olympiad'),
    academic: tr('برتری تحصیلی', 'Academic Excellence'),
    innovation: tr('پژوهش و خوارزمی', 'Research & Innovation'),
    cultural: tr('فرهنگی و هنری', 'Cultural & Arts'),
    sports: tr('ورزشی', 'Athletics'),
    ethics: tr('اخلاق و مسئولیت‌پذیری', 'Leadership & Ethics'),
  };

  const levelLabels: Record<HonorLevel, string> = {
    school: tr('سطح مدرسه', 'School'),
    district: tr('منطقه‌ای / ناحیه', 'District'),
    province: tr('استانی', 'Provincial'),
    national: tr('کشوری', 'National'),
    international: tr('بین‌المللی', 'International'),
  };

  const filtered = useMemo(
    () => honors.filter((h) => categoryFilter === 'all' || h.category === categoryFilter),
    [honors, categoryFilter]
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const targetStu = studentId || students[0]?.id;
    if (!targetStu || !title.trim()) return;
    setSaving(true);
    try {
      await apiRequest('/api/honors', {
        method: 'POST',
        body: JSON.stringify({
          studentId: targetStu,
          title: title.trim(),
          category,
          level,
          rankOrMedal: rankOrMedal.trim() || undefined,
          date: date.trim(),
          issuer: issuer.trim() || undefined,
          certificateRef: certificateRef.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setRankOrMedal('');
      setIssuer('');
      setCertificateRef('');
      setDescription('');
      await loadHonors();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در ثبت افتخار', 'Failed to record honor'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/honors/${id}`, { method: 'DELETE' });
      await loadHonors();
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr('خطا در حذف', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {tr('پرونده افتخارات و دستاوردهای دانش‌آموز', 'Student Honors & Achievements Portfolio')}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {canManage
                ? tr(
                    'ثبت رسمی مدال‌های المپیاد، جشنواره‌های علمی، رتبه‌های برتر تحصیلی و افتخارات ورزشی و فرهنگی دانش‌آموزان.',
                    'Official archive of olympiad medals, scientific awards, top academic honors, and competitions.'
                  )
                : tr(
                    'مشاهده و چاپ افتخارات علمی، المپیادی، پژوهشی و تقدیرنامه‌های ثبت‌شده در پرونده رسمی مدرسه.',
                    'View and print official school honors, olympiad ranks, and achievement certificates.'
                  )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('چاپ کارنامه افتخارات', 'Print Portfolio')}</span>
            </button>

            {canManage && (
              <button
                type="button"
                disabled={students.length === 0}
                onClick={() => {
                  if (!studentId && students[0]) setStudentId(students[0].id);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F274A] dark:bg-sky-600 text-white text-xs font-semibold hover:bg-[#163663] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('ثبت افتخار جدید', 'Add Honor')}</span>
              </button>
            )}
          </div>
        </div>

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
            {tr('همه افتخارات', 'All Honors')}
          </button>
          {(Object.keys(categoryLabels) as HonorCategory[]).map((k) => (
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
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-xs text-slate-500">
          {tr('در حال بارگذاری پرونده افتخارات...', 'Loading honors portfolio...')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <Award className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {tr('موردی در پرونده افتخارات ثبت نشده است', 'No honors recorded yet')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((h) => {
            const canDelete = user.role === 'admin' || h.createdBy === user.id;
            return (
              <div
                key={h.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        {categoryLabels[h.category]}
                      </span>
                      {' · '}
                      <span>{levelLabels[h.level]}</span>
                      {' · '}
                      <span className="tabular-nums">{fmtDate(h.date)}</span>
                    </p>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(h.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                        aria-label={tr('حذف افتخار', 'Delete honor')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Medal className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{h.title}</h3>
                      {h.rankOrMedal && (
                        <p className="text-xs font-bold text-[#0F274A] dark:text-sky-300 mt-0.5">
                          {h.rankOrMedal}
                        </p>
                      )}
                    </div>
                  </div>

                  {h.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">{h.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {tr('دانش‌آموز:', 'Student:')} {h.studentName || '—'}
                  </span>
                  <span>
                    {h.issuer ? `${tr('مرجع صدور:', 'Issuer:')} ${h.issuer}` : ''}
                    {h.certificateRef ? ` · #${h.certificateRef}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Honor Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={tr('ثبت دستاورد در پرونده افتخارات دانش‌آموز', 'Record Student Honor / Achievement')}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('دانش‌آموز', 'Student')}</label>
            <select
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.gradeLevel || '—'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{tr('عنوان افتخار یا رتبه', 'Honor Title')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('مثلاً مدال طلای المپیاد فیزیک مرحله استانی', 'e.g. Regional Physics Olympiad Gold Medal')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('حوزه', 'Category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as HonorCategory)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {(Object.keys(categoryLabels) as HonorCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {categoryLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('سطح دستاورد', 'Level')}</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as HonorLevel)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
              >
                {(Object.keys(levelLabels) as HonorLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {levelLabels[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('مدال یا رتبه کسب‌شده', 'Rank / Medal')}</label>
              <input
                type="text"
                value={rankOrMedal}
                onChange={(e) => setRankOrMedal(e.target.value)}
                placeholder={tr('مثلاً رتبه اول / مدال طلا', 'e.g. 1st Place')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('تاریخ', 'Date')}</label>
              <input
                type="text"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('نهاد صادرکننده (اختیاری)', 'Issuer (Optional)')}</label>
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder={tr('مثلاً باشگاه دانش‌پژوهان جوان', 'e.g. National Olympiad Committee')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{tr('شماره گواهینامه (اختیاری)', 'Certificate Ref')}</label>
              <input
                type="text"
                dir="ltr"
                value={certificateRef}
                onChange={(e) => setCertificateRef(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-left"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">{tr('توضیحات تکمیلی', 'Description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              {saving ? tr('در حال ثبت...', 'Saving...') : tr('ثبت در پرونده', 'Save Honor')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
