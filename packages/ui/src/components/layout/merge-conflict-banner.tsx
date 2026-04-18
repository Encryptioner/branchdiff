import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mergeConflictsOptions } from '../../queries/branch-comparison';
import type { MergeConflictFile } from '../../lib/api';

interface MergeConflictBannerProps {
  b1: string;
  b2: string;
}

function ConflictTypeLabel({ type }: { type: string }) {
  if (type === 'potential') {
    return <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300">potential</span>;
  }
  return <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-300">{type}</span>;
}

function ConflictFileList({ files, method }: { files: MergeConflictFile[]; method: string }) {
  if (files.length === 0) {
    return (
      <div className="text-xs text-green-700 dark:text-green-400 font-medium">
        No merge conflicts — branches merge cleanly.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-red-700 dark:text-red-400">
          {files.length} conflicting file{files.length !== 1 ? 's' : ''}
        </span>
        {method === 'intersection' && (
          <span className="text-[10px] text-text-muted italic">
            (heuristic — git &lt; 2.38 detected)
          </span>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {files.map(f => (
          <div key={f.path} className="flex items-center gap-2 text-xs font-mono">
            <ConflictTypeLabel type={f.type} />
            <span className="text-text truncate">{f.path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MergeConflictBanner({ b1, b2 }: MergeConflictBannerProps) {
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, isError } = useQuery({
    ...mergeConflictsOptions(b1, b2),
    enabled,
  });

  const hasConflicts = data && data.total > 0;

  return (
    <div className={`mx-4 mt-3 mb-1 rounded-lg border text-sm overflow-hidden transition-colors ${
      hasConflicts
        ? 'border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950/30'
        : enabled && data
          ? 'border-green-300 dark:border-green-800 bg-green-100 dark:bg-green-950/30'
          : 'border-border bg-bg-secondary'
    }`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <svg
          className={`w-4 h-4 shrink-0 ${hasConflicts ? 'text-red-500' : enabled && data ? 'text-green-600 dark:text-green-400' : 'text-text-muted'}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          {hasConflicts || (!data && !isLoading) ? (
            <path d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z" />
          ) : (
            <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13A6.5 6.5 0 008 1.5zM0 8a8 8 0 1116 0A8 8 0 010 8zm11.78-1.72a.75.75 0 00-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l4.5-4.5z" />
          )}
        </svg>
        <span className="text-xs font-medium text-text">
          Merge conflict check
        </span>
        <div className="flex-1" />
        {!enabled ? (
          <button
            onClick={() => setEnabled(true)}
            className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer font-medium"
          >
            Check now
          </button>
        ) : isLoading ? (
          <span className="text-xs text-text-muted flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            Checking…
          </span>
        ) : isError ? (
          <span className="text-xs text-red-500">Check failed</span>
        ) : (
          <button
            onClick={() => setEnabled(false)}
            className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
      {enabled && data && (
        <div className={`border-t px-3 py-2.5 ${
          hasConflicts
            ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20'
            : 'border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/20'
        }`}>
          <ConflictFileList files={data.conflicts} method={data.method} />
        </div>
      )}
    </div>
  );
}
