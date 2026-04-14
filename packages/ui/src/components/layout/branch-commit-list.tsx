import type { Commit } from '../../lib/api';

interface BranchCommitListProps {
  commits: Commit[];
}

export function BranchCommitList({ commits }: BranchCommitListProps) {
  if (commits.length === 0) {
    return (
      <p className="text-sm text-text-muted px-3 py-2">
        No commits between branches
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-y-auto">
      {commits.map((commit) => (
        <li key={commit.hash} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-accent shrink-0">
              {commit.shortHash}
            </code>
            <span className="text-sm text-text truncate flex-1">
              {commit.message}
            </span>
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
      ))}
    </ul>
  );
}
