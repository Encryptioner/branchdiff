import type { BranchCommit } from '../../lib/api';

interface BranchCommitListProps {
  commits: BranchCommit[];
  b1?: string;
  b2?: string;
}

export function BranchCommitList({ commits, b1, b2 }: BranchCommitListProps) {
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
        const branchLabel = commit.side === 'b1' ? b1 : b2;
        return (
          <li key={commit.hash} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-accent shrink-0">
                {commit.shortHash}
              </code>
              <span className="text-sm text-text truncate flex-1">
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
                <span className="text-xs text-text-muted">{commit.author}</span>
              )}
              <span className="text-xs text-text-muted ml-auto">
                {commit.relativeDate}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
