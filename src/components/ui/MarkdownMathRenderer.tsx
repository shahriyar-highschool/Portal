import katex from 'katex';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return latex;
  }
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { tr } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div dir="ltr" className="my-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? tr('کپی شد', 'Copied') : tr('کپی', 'Copy')}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MathBlock({ latex }: { latex: string }) {
  const html = renderKatex(latex, true);
  return (
    <div
      dir="ltr"
      className="my-3 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 overflow-x-auto text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function isSafeHref(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}

const INLINE_TOKEN_REGEX =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\)|\$[^$\n]+?\$|`[^`\n]+?`|<br\s*\/?>|\[[^\]\n]+\]\([^)\s]+\)|\*\*\*[^*\n]+?\*\*\*|___[^_\n]+?___|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|(?<![\p{L}\p{N}_])_[^_\n]+?_(?![\p{L}\p{N}_]))/gu;

function renderInline(text: string, depth = 0): ReactNode[] {
  if (!text) return [];
  if (depth > 6) return [text];

  const regex = new RegExp(INLINE_TOKEN_REGEX.source, INLINE_TOKEN_REGEX.flags);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t_${depth}_${keyIdx++}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }

    const token = match[0];
    const key = `k_${depth}_${keyIdx++}`;

    if (/^<br\s*\/?>$/i.test(token)) {
      nodes.push(<br key={key} />);
    } else if (token.startsWith('$$') && token.endsWith('$$') && token.length > 4) {
      const html = renderKatex(token.slice(2, -2), true);
      nodes.push(
        <span
          key={key}
          dir="ltr"
          className="block my-2 overflow-x-auto text-center"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (token.startsWith('\\[') && token.endsWith('\\]') && token.length > 4) {
      const html = renderKatex(token.slice(2, -2), true);
      nodes.push(
        <span
          key={key}
          dir="ltr"
          className="block my-2 overflow-x-auto text-center"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (token.startsWith('\\(') && token.endsWith('\\)') && token.length > 4) {
      const html = renderKatex(token.slice(2, -2), false);
      nodes.push(
        <span key={key} dir="ltr" className="mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: html }} />
      );
    } else if (token.startsWith('$') && token.endsWith('$') && token.length > 2) {
      const html = renderKatex(token.slice(1, -1), false);
      nodes.push(
        <span key={key} dir="ltr" className="mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: html }} />
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      nodes.push(
        <code
          key={key}
          dir="ltr"
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[12px] text-slate-800 dark:text-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      if (linkMatch && isSafeHref(linkMatch[2])) {
        const external = linkMatch[2].startsWith('http');
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="text-[#0F274A] dark:text-sky-400 underline underline-offset-2 font-medium hover:opacity-80"
          >
            {renderInline(linkMatch[1], depth + 1)}
          </a>
        );
      } else {
        nodes.push(<Fragment key={key}>{token}</Fragment>);
      }
    } else if (
      (token.startsWith('***') && token.endsWith('***') && token.length > 6) ||
      (token.startsWith('___') && token.endsWith('___') && token.length > 6)
    ) {
      nodes.push(
        <strong key={key} className="font-bold italic text-slate-950 dark:text-white">
          {renderInline(token.slice(3, -3), depth + 1)}
        </strong>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**') && token.length > 4) ||
      (token.startsWith('__') && token.endsWith('__') && token.length > 4)
    ) {
      nodes.push(
        <strong key={key} className="font-bold text-slate-950 dark:text-white">
          {renderInline(token.slice(2, -2), depth + 1)}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length > 4) {
      nodes.push(
        <del key={key} className="line-through text-slate-500 dark:text-slate-400">
          {renderInline(token.slice(2, -2), depth + 1)}
        </del>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*') && token.length > 2) ||
      (token.startsWith('_') && token.endsWith('_') && token.length > 2)
    ) {
      nodes.push(
        <em key={key} className="italic text-slate-900 dark:text-slate-100">
          {renderInline(token.slice(1, -1), depth + 1)}
        </em>
      );
    } else {
      nodes.push(<Fragment key={key}>{token}</Fragment>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`tail_${depth}_${keyIdx}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}

function splitTableRow(rowLine: string): string[] {
  const trimmed = rowLine.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inBacktick = false;
  let inDollar = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    const prev = i > 0 ? stripped[i - 1] : '';

    if (ch === '\\' && stripped[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '`' && prev !== '\\') {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }
    if (ch === '$' && !inBacktick && prev !== '\\') {
      inDollar = !inDollar;
      current += ch;
      continue;
    }
    if (ch === '|' && !inBacktick && !inDollar) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparatorRow(line: string): boolean {
  if (!line.includes('|') || !line.includes('-')) return false;
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

type CellAlign = 'left' | 'center' | 'right' | null;

function parseTableAlignments(sepLine: string): CellAlign[] {
  return splitTableRow(sepLine).map((cell) => {
    const startsColon = cell.startsWith(':');
    const endsColon = cell.endsWith(':');
    if (startsColon && endsColon) return 'center';
    if (endsColon) return 'right';
    if (startsColon) return 'left';
    return null;
  });
}

function alignmentClass(align: CellAlign | undefined, isRtl: boolean): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  if (align === 'left') return 'text-left';
  return isRtl ? 'text-right' : 'text-left';
}

interface ParsedListItem {
  content: string;
  checked?: boolean;
  children: ReactNode[];
}

const UL_REGEX = /^(\s*)([-*•])\s+(.*)$/;
const OL_REGEX = /^(\s*)(\d+)[.)]\s+(.*)$/;

function renderBlocks(lines: string[], isRtl: boolean, keyPrefix: string, depth = 0): ReactNode[] {
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      i++;
      continue;
    }

    // 1. Fenced Code Blocks (``` or ~~~), including unclosed streaming blocks
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1][0];
      const fenceLen = fenceMatch[1].length;
      const lang = fenceMatch[2].trim();
      const closeRegex = new RegExp(`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !closeRegex.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && closeRegex.test(lines[i])) {
        i++;
      }
      blocks.push(<CodeBlock key={`${keyPrefix}_code_${i}`} code={codeLines.join('\n')} lang={lang} />);
      continue;
    }

    // 2. Display Math Blocks ($$ ... $$ or \[ ... \])
    const trimmed = line.trim();
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        blocks.push(<MathBlock key={`${keyPrefix}_m1_${i}`} latex={trimmed.slice(2, -2)} />);
        i++;
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const last = lines[i].trim();
        mathLines.push(last.slice(0, -2));
        i++;
      }
      blocks.push(<MathBlock key={`${keyPrefix}_mb_${i}`} latex={mathLines.join('\n')} />);
      continue;
    }

    if (trimmed.startsWith('\\[')) {
      if (trimmed.length > 4 && trimmed.endsWith('\\]')) {
        blocks.push(<MathBlock key={`${keyPrefix}_m2_${i}`} latex={trimmed.slice(2, -2)} />);
        i++;
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('\\]')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const last = lines[i].trim();
        mathLines.push(last.slice(0, -2));
        i++;
      }
      blocks.push(<MathBlock key={`${keyPrefix}_mb2_${i}`} latex={mathLines.join('\n')} />);
      continue;
    }

    // 3. Headings (# to ######)
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? 'text-base sm:text-lg font-extrabold text-slate-950 dark:text-white pt-2 pb-0.5'
          : level === 2
          ? 'text-[15px] font-bold text-slate-950 dark:text-white pt-1.5'
          : level === 3
          ? 'text-sm font-bold text-slate-900 dark:text-slate-100 pt-1'
          : 'text-sm font-semibold text-slate-800 dark:text-slate-200 pt-0.5';
      blocks.push(
        <p key={`${keyPrefix}_h_${i}`} className={cls}>
          {renderInline(text)}
        </p>
      );
      i++;
      continue;
    }

    // 4. Markdown Tables
    if (line.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;

      const bodyRows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        lines[i].includes('|') &&
        !/^\s*(`{3,}|~{3,}|#{1,6}\s|>)/.test(lines[i])
      ) {
        const rowCells = splitTableRow(lines[i]);
        const normalizedRow = Array.from({ length: headerCells.length }, (_, ci) => rowCells[ci] ?? '');
        bodyRows.push(normalizedRow);
        i++;
      }

      blocks.push(
        <div
          key={`${keyPrefix}_tbl_${i}`}
          className="overflow-x-auto my-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60"
        >
          <table className="w-full text-xs border-collapse tabular-nums">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {headerCells.map((h, hi) => (
                  <th
                    key={hi}
                    className={`px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap ${alignmentClass(
                      alignments[hi],
                      isRtl
                    )}`}
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {bodyRows.map((r, ri) => (
                <tr key={ri} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 text-slate-800 dark:text-slate-200 align-top ${alignmentClass(
                        alignments[ci],
                        isRtl
                      )}`}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 5. Horizontal Rule (---, ***, ___)
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={`${keyPrefix}_hr_${i}`} className="my-3 border-slate-200 dark:border-slate-700" />);
      i++;
      continue;
    }

    // 6. Blockquote (> ...)
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`${keyPrefix}_bq_${i}`}
          className="my-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/55 px-3.5 py-2.5 text-slate-700 dark:text-slate-300 space-y-1.5"
        >
          {depth < 4 ? renderBlocks(quoteLines, isRtl, `${keyPrefix}_bq_${i}`, depth + 1) : quoteLines.join('\n')}
        </blockquote>
      );
      continue;
    }

    // 7. Unordered / Ordered Lists (with nested sub-lists & task checkboxes)
    const ulFirst = line.match(UL_REGEX);
    const olFirst = !ulFirst ? line.match(OL_REGEX) : null;
    if (ulFirst || olFirst) {
      const isOrdered = Boolean(olFirst);
      const baseIndent = (ulFirst ? ulFirst[1] : olFirst![1]).length;
      const items: ParsedListItem[] = [];

      while (i < lines.length) {
        const cur = lines[i];
        const curUl = cur.match(UL_REGEX);
        const curOl = cur.match(OL_REGEX);
        const match = isOrdered ? curOl : curUl;

        if (!match) {
          // Check if it's an indented nested list of the OTHER type
          const otherMatch = isOrdered ? curUl : curOl;
          if (otherMatch && otherMatch[1].length > baseIndent && items.length > 0) {
            const subLines: string[] = [];
            const subIndent = otherMatch[1].length;
            while (i < lines.length) {
              const sLine = lines[i];
              if (!sLine.trim()) break;
              const sMatch = sLine.match(/^(\s*)/);
              const sIndent = sMatch ? sMatch[1].length : 0;
              if (sIndent < subIndent) break;
              subLines.push(sLine);
              i++;
            }
            if (depth < 4) {
              items[items.length - 1].children.push(
                ...renderBlocks(subLines, isRtl, `${keyPrefix}_sub_${i}`, depth + 1)
              );
            }
            continue;
          }
          break;
        }

        const itemIndent = match[1].length;
        if (itemIndent < baseIndent) break;

        if (itemIndent > baseIndent && items.length > 0) {
          const subLines: string[] = [];
          while (i < lines.length) {
            const sLine = lines[i];
            if (!sLine.trim()) break;
            const sUl = sLine.match(UL_REGEX);
            const sOl = sLine.match(OL_REGEX);
            const sAny = sUl || sOl;
            if (!sAny || sAny[1].length <= baseIndent) break;
            subLines.push(sLine);
            i++;
          }
          if (depth < 4) {
            items[items.length - 1].children.push(
              ...renderBlocks(subLines, isRtl, `${keyPrefix}_sub_${i}`, depth + 1)
            );
          }
          continue;
        }

        const rawItemText = isOrdered ? match[3] : match[3];
        const taskMatch = !isOrdered ? rawItemText.match(/^\[( |x|X)\]\s+(.*)$/) : null;
        items.push({
          content: taskMatch ? taskMatch[2] : rawItemText,
          checked: taskMatch ? taskMatch[1].toLowerCase() === 'x' : undefined,
          children: [],
        });
        i++;
      }

      const ListTag = isOrdered ? 'ol' : 'ul';
      const hasCheckboxes = items.some((it) => it.checked !== undefined);
      blocks.push(
        <ListTag
          key={`${keyPrefix}_${isOrdered ? 'ol' : 'ul'}_${i}`}
          className={`${
            hasCheckboxes ? 'list-none' : isOrdered ? 'list-decimal' : 'list-disc'
          } space-y-1.5 text-slate-800 dark:text-slate-200 ${
            hasCheckboxes ? '' : isRtl ? 'pr-5' : 'pl-5'
          }`}
        >
          {items.map((item, li) => (
            <li key={li} className="leading-7">
              {item.checked !== undefined ? (
                <span className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    readOnly
                    aria-label={item.content}
                    className="mt-1.5 rounded border-slate-300 dark:border-slate-600 accent-[#0F274A] dark:accent-sky-500"
                  />
                  <span className={item.checked ? 'line-through text-slate-500 dark:text-slate-400' : ''}>
                    {renderInline(item.content)}
                  </span>
                </span>
              ) : (
                renderInline(item.content)
              )}
              {item.children.length > 0 && <div className="mt-1 space-y-1">{item.children}</div>}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    // 8. Paragraph (group contiguous plain prose lines)
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextRaw = lines[i];
      const next = nextRaw.trimEnd();
      if (!next.trim()) break;
      if (
        /^\s*(`{3,}|~{3,}|#{1,6}\s|>|\$\$|\\\[|([-*_])(\s*\2){2,}\s*$)/.test(next) ||
        UL_REGEX.test(next) ||
        OL_REGEX.test(next) ||
        (next.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }

    blocks.push(
      <p key={`${keyPrefix}_p_${i}`} className="text-slate-800 dark:text-slate-200 leading-7">
        {paraLines.map((pl, pli) => (
          <Fragment key={pli}>
            {pli > 0 && <br />}
            {renderInline(pl)}
          </Fragment>
        ))}
      </p>
    );
  }

  return blocks;
}

function extractThinkingBlocks(content: string): { thinking: string | null; main: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const closedMatch = normalized.match(/<think>([\s\S]*?)<\/think>/i);
  if (closedMatch) {
    const thinking = closedMatch[1].trim();
    const main = normalized.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return { thinking: thinking || null, main };
  }
  const openIdx = normalized.search(/<think>/i);
  if (openIdx !== -1) {
    const before = normalized.slice(0, openIdx).trim();
    const thinking = normalized.slice(openIdx + 7).trim();
    return { thinking: thinking || null, main: before };
  }
  return { thinking: null, main: normalized };
}

export function MarkdownMathRenderer({ content }: { content: string }) {
  const { isRtl, tr } = useI18n();
  const [showThinking, setShowThinking] = useState(false);

  const { thinking, main } = extractThinkingBlocks(content || '');
  const lines = main.split('\n');

  return (
    <div className="space-y-2.5 text-sm leading-7 text-slate-800 dark:text-slate-200 break-words">
      {thinking && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <span>{tr('روند تحلیل مدل', 'Model reasoning')}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showThinking ? 'rotate-180' : ''}`} />
          </button>
          {showThinking && (
            <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-6">
              {thinking}
            </div>
          )}
        </div>
      )}
      {renderBlocks(lines, isRtl, 'md')}
    </div>
  );
}
