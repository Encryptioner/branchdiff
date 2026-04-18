import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileDiffOptions } from '../../queries/branch-comparison';
import type { BranchDiffFile } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useCopy } from '../../hooks/use-copy';
import { CopyIcon } from '../icons/copy-icon';
import { CheckIcon } from '../icons/check-icon';

export type DeltaCategory = 'git-only' | 'file-only' | 'shared';

interface DeltaFileRowProps {
  file: BranchDiffFile;
  category: DeltaCategory;
  b1: string;
  b2: string;
}

const PREVIEW_LINE_LIMIT = 20;

function StatPill({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-mono text-[11px] flex items-center gap-1 shrink-0">
      <span className="text-added">+{additions}</span>
      <span className="text-deleted">−{deletions}</span>
    </span>
  );
}

function categoryBorderClass(cat: DeltaCategory) {
  if (cat === 'git-only') return 'border-amber-400 dark:border-amber-600';
  if (cat === 'file-only') return 'border-blue-400 dark:border-blue-600';
  return 'border-border';
}

function categoryBgClass(cat: DeltaCategory) {
  if (cat === 'git-only') return 'bg-amber-100 dark:bg-amber-950/30';
  if (cat === 'file-only') return 'bg-blue-100 dark:bg-blue-950/30';
  return 'bg-bg-secondary';
}

function categoryBadge(cat: DeltaCategory) {
  if (cat === 'git-only') {
    return { label: 'git only', cls: 'bg-amber-200 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300' };
  }
  if (cat === 'file-only') {
    return { label: 'file only', cls: 'bg-blue-200 dark:bg-blue-900/50 text-blue-900 dark:text-blue-300' };
  }
  return { label: 'shared', cls: 'bg-bg-tertiary text-text-muted' };
}

function lineRowClass(type: 'add' | 'delete') {
  return type === 'add' ? 'bg-diff-add-bg' : 'bg-diff-del-bg';
}

function linePrefix(type: 'add' | 'delete') {
  return type === 'add' ? '+' : '−';
}

export function DeltaFileRow({ file, category, b1, b2 }: DeltaFileRowProps) {
  const [expanded, setExpanded] = useState(false);
  const diffMode = category === 'file-only' ? 'file' : 'git';
  const { copied: pathCopied, copy: copyPath } = useCopy();
  const { copied: oldPathCopied, copy: copyOldPath } = useCopy();
  const isRename = !!(file.oldPath && file.oldPath !== file.path);

  const { data: diffData } = useQuery({
    ...fileDiffOptions(b1, b2, file.path, diffMode, file.oldPath),
    enabled: expanded && category !== 'shared',
  });

  const toggleExpand = useCallback(() => setExpanded(p => !p), []);

  const badge = categoryBadge(category);
  const parsedFile = diffData?.files?.files?.[0];
  const changedLines = parsedFile?.hunks.flatMap(h =>
    h.lines.filter((l): l is typeof l & { type: 'add' | 'delete' } =>
      l.type === 'add' || l.type === 'delete'
    )
  ) ?? [];
  const previewLines = changedLines.slice(0, PREVIEW_LINE_LIMIT);
  const hiddenCount = changedLines.length - previewLines.length;

  const additions = parsedFile?.additions ?? 0;
  const deletions = parsedFile?.deletions ?? 0;

  const isExpandable = category !== 'shared';

  return (
    <div className={cn('border rounded-md overflow-hidden', categoryBorderClass(category))}>
      <div
        role={isExpandable ? 'button' : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        onClick={isExpandable ? toggleExpand : undefined}
        onKeyDown={isExpandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(); } : undefined}
        className={cn(
          'flex gap-2 px-3 py-2',
          isRename ? 'items-start' : 'items-center',
          categoryBgClass(category),
          isExpandable && 'cursor-pointer hover:brightness-95 dark:hover:brightness-110 select-none',
        )}
      >
        {isExpandable && (
          <svg
            className={cn('w-3 h-3 text-text-muted shrink-0 transition-transform', isRename && 'mt-0.5', expanded && 'rotate-90')}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
          </svg>
        )}
        {isRename ? (
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-xs text-text-muted line-through truncate flex-1 min-w-0" title={file.oldPath}>
                {file.oldPath}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); copyOldPath(file.oldPath!); }}
                className="shrink-0 text-text-muted hover:text-text transition-colors cursor-pointer"
                title="Copy old path"
              >
                {oldPathCopied ? <CheckIcon className="w-3 h-3 text-added" /> : <CopyIcon className="w-3 h-3" />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-text-muted text-xs shrink-0">→</span>
              <span className="font-mono text-xs text-text truncate flex-1 min-w-0" title={file.path}>
                {file.path}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); copyPath(file.path); }}
                className="shrink-0 text-text-muted hover:text-text transition-colors cursor-pointer"
                title="Copy new path"
              >
                {pathCopied ? <CheckIcon className="w-3 h-3 text-added" /> : <CopyIcon className="w-3 h-3" />}
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className="font-mono text-xs text-text truncate flex-1 min-w-0">{file.path}</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyPath(file.path); }}
              className="shrink-0 text-text-muted hover:text-text transition-colors cursor-pointer"
              title="Copy file path"
            >
              {pathCopied ? (
                <CheckIcon className="w-3 h-3 text-added" />
              ) : (
                <CopyIcon className="w-3 h-3" />
              )}
            </button>
          </>
        )}
        <div className={cn('flex items-center gap-2 shrink-0', isRename && 'mt-0.5')}>
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', badge.cls)}>
            {badge.label}
          </span>
          {expanded && parsedFile && (
            <StatPill additions={additions} deletions={deletions} />
          )}
        </div>
      </div>

      {expanded && category !== 'shared' && (
        <div className={cn('border-t', categoryBorderClass(category))}>
          {!diffData ? (
            <div className="px-4 py-3 text-xs text-text-muted animate-pulse">Loading…</div>
          ) : previewLines.length === 0 ? (
            <div className="px-4 py-3 text-xs text-text-muted italic">No changed lines</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <tbody>
                  {previewLines.map((line, i) => (
                    <tr key={i} className={lineRowClass(line.type)}>
                      <td className="pl-3 pr-2 py-px select-none text-text-muted w-5 text-right">
                        {linePrefix(line.type)}
                      </td>
                      <td className="pr-4 py-px whitespace-pre">{line.content}</td>
                    </tr>
                  ))}
                  {hiddenCount > 0 && (
                    <tr className="bg-bg-secondary">
                      <td colSpan={2} className="px-3 py-1.5 text-text-muted italic text-[11px]">
                        … {hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
