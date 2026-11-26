import { ArrowDownUp, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search, Inbox, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  align?: 'right' | 'left' | 'center';
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
  toolbarExtra?: ReactNode;
  defaultPageSize?: number;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  searchPlaceholder,
  searchFilter,
  emptyTitle,
  emptyDescription,
  emptyAction,
  loading = false,
  toolbarExtra,
  defaultPageSize = 25,
}: DataTableProps<T>) {
  const { lang, isRtl, tr, fmtDigits } = useI18n();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);

  const resolvedSearchPlaceholder = searchPlaceholder ?? tr('جستجو...', 'Search...');
  const resolvedEmptyTitle = emptyTitle ?? tr('اطلاعاتی یافت نشد', 'No records found');
  const resolvedEmptyDesc =
    emptyDescription ?? tr('هنوز رکوردی در این بخش ثبت نشده است.', 'No records have been added here yet.');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchFilter) return data;
    return data.filter((item) => searchFilter(item, q));
  }, [data, query, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const getVal = col.sortValue;
    return [...filtered].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === 'asc' ? sa.localeCompare(sb, lang) : sb.localeCompare(sa, lang);
    });
  }, [filtered, sortKey, sortDir, columns, lang]);

  const effectiveSize = pageSize <= 0 ? Math.max(1, sorted.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sorted.length / effectiveSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    if (pageSize <= 0 || sorted.length <= pageSize) return sorted;
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSize, safePage]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getAlignClass = (align?: 'right' | 'left' | 'center') => {
    if (align === 'center') return 'text-center';
    if (align === 'left') return 'text-left';
    if (align === 'right') return 'text-right';
    return isRtl ? 'text-right' : 'text-left';
  };

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
      {(searchFilter || toolbarExtra) && (
        <div className="px-4 py-3.5 border-b border-slate-200/90 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          {searchFilter ? (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                  isRtl ? 'right-3' : 'left-3'
                }`}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={resolvedSearchPlaceholder}
                className={`w-full py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-[#0F274A] dark:focus:border-sky-400 focus:ring-4 focus:ring-[#0F274A]/10 dark:focus:ring-sky-500/15 transition-all ${
                  isRtl ? 'pr-9 pl-8' : 'pl-9 pr-8'
                }`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={tr('پاک کردن جستجو', 'Clear search')}
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded ${
                    isRtl ? 'left-2.5' : 'right-2.5'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div />
          )}
          {toolbarExtra && <div className="flex flex-wrap items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-14 px-4 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 mb-3">
            <Inbox className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{resolvedEmptyTitle}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-5">{resolvedEmptyDesc}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {columns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th key={col.key} className={`px-4 py-3 whitespace-nowrap ${getAlignClass(col.align)}`}>
                      {col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white focus-visible:outline-none focus-visible:underline"
                        >
                          <span>{col.header}</span>
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#0F274A] dark:text-sky-400" />
                            )
                          ) : (
                            <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {visibleRows.map((row) => (
                <tr key={keyExtractor(row)} className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-slate-800 dark:text-slate-200 ${getAlignClass(col.align)}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {tr(
                `نمایش ${fmtDigits(visibleRows.length)} از ${fmtDigits(sorted.length)} مورد${
                  sorted.length !== data.length ? ` (مجموع ${fmtDigits(data.length)})` : ''
                }`,
                `Showing ${fmtDigits(visibleRows.length)} of ${fmtDigits(sorted.length)} records${
                  sorted.length !== data.length ? ` (${fmtDigits(data.length)} total)` : ''
                }`
              )}
            </span>
            {query && (
              <span className="text-slate-600 dark:text-slate-300">
                · {tr(`فیلترشده بر اساس «${query}»`, `Filtered by "${query}"`)}
              </span>
            )}
          </div>

          {sorted.length > defaultPageSize && (
            <div className="flex items-center gap-2">
              <select
                aria-label={tr('تعداد ردیف در هر صفحه', 'Rows per page')}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value={25}>{fmtDigits(25)} / {tr('صفحه', 'page')}</option>
                <option value={50}>{fmtDigits(50)} / {tr('صفحه', 'page')}</option>
                <option value={0}>{tr('نمایش همه', 'All')}</option>
              </select>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label={tr('صفحه قبلی', 'Previous page')}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <PrevIcon className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-semibold text-slate-700 dark:text-slate-200">
                    {fmtDigits(safePage)} / {fmtDigits(totalPages)}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label={tr('صفحه بعدی', 'Next page')}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <NextIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
