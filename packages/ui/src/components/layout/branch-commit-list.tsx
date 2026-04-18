import { useState } from 'react';
import type { BranchCommit } from '../../lib/api';
import { ChevronIcon } from '../icons/chevron-icon';

interface BranchCommitListProps {
  commits: BranchCommit[];
  b1?: string;
  b2?: string;
  onStagedFileClick?: (path: string) => void;
}

export function BranchCommitList({ commits, b1, b2, onStagedFileClick }: BranchCommitListProps) {
  const [expandedStaged, setExpandedStaged] = useState(false);

  if (commits.length === 0) {
    return (
      <p className="text-sm text-text-muted px-3 py-2">
        No commits between branches
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-y-auto">
      {commits.map((commit) => {
        const isStagedCommit = commit.hash === '__staged__';

        if (isStagedCommit) {
          return (
            <li key={commit.hash} className="px-3 py-2">
              <button
                onClick={() => setExpandedStaged(!expandedStaged)}
                className="w-full text-left flex items-center gap-2 hover:opacity-75 transition-opacity cursor-pointer"
              >
                <code className="text-xs font-mono text-accent shrink-0">
                  {commit.shortHash}
                </code>
                <span className="text-sm text-text truncate flex-1 min-w-0">
                  {commit.message}
                </span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-accent/15 text-accent">
                  {commit.stagedCount} file{commit.stagedCount !== 1 ? 's' : ''}
                </span>
                <ChevronIcon expanded={expandedStaged} />
              </button>
              {expandedStaged && commit.stagedFiles && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-bg/50 border border-border">
                  <ul className="divide-y divide-border/50">
                    {commit.stagedFiles.map((file) => {
                      const stats = commit.stagedStats?.[file];
                      return (
                        <li key={file}>
                          <button
                            onClick={() => onStagedFileClick?.(file)}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-text-secondary hover:bg-hover/30 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="truncate flex-1 min-w-0">{file}</span>
                            {stats && (
                              <span className="shrink-0 text-[10px] text-text-muted">
                                <span className="text-added">+{stats.additions}</span>
                                {' '}
                                <span className="text-deleted">-{stats.deletions}</span>
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        }

        const branchLabel = commit.side === 'b1' ? b1 : b2;
        const fullMessage = commit.body
          ? `${commit.message}\n\n${commit.body}`
          : commit.message;
        const metaTooltip = [
          commit.shortHash,
          commit.author && `by ${commit.author}`,
          commit.relativeDate,
        ].filter(Boolean).join(' · ');
        const tooltip = `${fullMessage}\n\n${metaTooltip}`;
        return (
          <li key={commit.hash} className="px-3 py-2" title={tooltip}>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-accent shrink-0">
                {commit.shortHash}
              </code>
              <span className="text-sm text-text truncate flex-1 min-w-0">
                {commit.message}
              </span>
              {branchLabel && (
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                  commit.side === 'b1'
                    ? 'bg-deleted/15 text-deleted'
                    : 'bg-added/15 text-added'
                }`}>
                  {branchLabel.split('/').pop()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {commit.author && (
                <span className="text-xs text-text-muted truncate">{commit.author}</span>
              )}
              <span className="text-xs text-text-muted ml-auto shrink-0">
                {commit.relativeDate}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
