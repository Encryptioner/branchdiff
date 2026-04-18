import { useQuery } from '@tanstack/react-query';
import { branchComparisonOptions } from '../../queries/branch-comparison';
import type { BranchDiffFile } from '../../lib/api';
import { DeltaFileRow } from './delta-file-row';
import type { DeltaCategory } from './delta-file-row';

interface DeltaViewProps {
  b1: string;
  b2: string;
}

interface CategorisedFiles {
  gitOnly: BranchDiffFile[];
  fileOnly: BranchDiffFile[];
  shared: BranchDiffFile[];
}

function categorise(gitFiles: BranchDiffFile[], fileFiles: BranchDiffFile[]): CategorisedFiles {
  const gitPaths = new Set(gitFiles.map(f => f.path));
  const filePaths = new Set(fileFiles.map(f => f.path));
  return {
    gitOnly: gitFiles.filter(f => !filePaths.has(f.path)),
    fileOnly: fileFiles.filter(f => !gitPaths.has(f.path)),
    shared: gitFiles.filter(f => filePaths.has(f.path)),
  };
}

function Section({
  title,
  subtitle,
  count,
  category,
  files,
  b1,
  b2,
}: {
  title: string;
  subtitle: string;
  count: number;
  category: DeltaCategory;
  files: BranchDiffFile[];
  b1: string;
  b2: string;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <span className="text-xs text-text-muted">({count} file{count !== 1 ? 's' : ''})</span>
        <span className="text-xs text-text-muted hidden sm:inline">— {subtitle}</span>
      </div>
      <div className="space-y-1.5">
        {files.map(f => (
          <DeltaFileRow key={f.path} file={f} category={category} b1={b1} b2={b2} />
        ))}
      </div>
    </div>
  );
}

export function DeltaView({ b1, b2 }: DeltaViewProps) {
  const { data: gitComp, isLoading: gitLoading } = useQuery(branchComparisonOptions(b1, b2, 'git'));
  const { data: fileComp, isLoading: fileLoading } = useQuery(branchComparisonOptions(b1, b2, 'file'));

  if (gitLoading || fileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full gap-2 text-text-muted text-sm">
        <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        Loading both comparison modes…
      </div>
    );
  }

  if (!gitComp || !fileComp) {
    return (
      <div className="flex-1 flex items-center justify-center h-full text-text-muted text-sm">
        Failed to load comparison data
      </div>
    );
  }

  const { gitOnly, fileOnly, shared } = categorise(gitComp.files, fileComp.files);
  const totalDelta = gitOnly.length + fileOnly.length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Summary card */}
        <div className="p-4 rounded-lg border border-border bg-bg-secondary text-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold text-text">Mode Delta: file vs git</p>
            <span className="text-xs text-text-muted">
              <code className="font-mono bg-bg-tertiary px-1 rounded text-[11px]">{b1}</code>
              {' ↔ '}
              <code className="font-mono bg-bg-tertiary px-1 rounded text-[11px]">{b2}</code>
            </span>
          </div>
          <p className="text-text-muted text-xs leading-relaxed">
            Compares what{' '}
            <span className="font-medium text-text">file mode</span> (blob hash comparison) and{' '}
            <span className="font-medium text-text">git mode</span> (commit-based diff) each report.
          </p>
          {totalDelta === 0 ? (
            <p className="text-added text-xs font-medium">✓ Both modes report identical file sets</p>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              {gitOnly.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
                  {gitOnly.length} git-only
                </span>
              )}
              {fileOnly.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-400 bg-blue-100 text-blue-900 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                  {fileOnly.length} file-only
                </span>
              )}
              {shared.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-bg-tertiary text-text font-semibold">
                  <span className="w-2 h-2 rounded-full bg-text-muted shrink-0" />
                  {shared.length} shared
                </span>
              )}
            </div>
          )}
        </div>

        {/* Git-only + File-only: side by side on desktop, stacked on mobile */}
        {(gitOnly.length > 0 || fileOnly.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gitOnly.length > 0 && (
              <Section
                title="Git only"
                subtitle="in git diff but not file diff"
                count={gitOnly.length}
                category="git-only"
                files={gitOnly}
                b1={b1}
                b2={b2}
              />
            )}
            {fileOnly.length > 0 && (
              <Section
                title="File only"
                subtitle="in file diff but not git diff"
                count={fileOnly.length}
                category="file-only"
                files={fileOnly}
                b1={b1}
                b2={b2}
              />
            )}
          </div>
        )}

        {/* Shared: full width */}
        {shared.length > 0 && (
          <Section
            title="Shared"
            subtitle="both modes agree this file changed"
            count={shared.length}
            category="shared"
            files={shared}
            b1={b1}
            b2={b2}
          />
        )}

        {gitOnly.length === 0 && fileOnly.length === 0 && shared.length === 0 && (
          <div className="text-center text-text-muted text-sm py-16">
            No files found in either mode for this branch pair.
          </div>
        )}
      </div>
    </div>
  );
}
