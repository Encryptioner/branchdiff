import { exec } from './exec.js';
import type { Commit } from './types.js';

interface CommitQuery {
  count: number;
  skip?: number;
  search?: string;
}

export function getRecentCommits(query: CommitQuery): Commit[] {
  const { count, skip = 0, search } = query;

  const args = [`-n ${count}`, `--skip=${skip}`, '--format="%H|%h|%s|%cr"'];
  if (search) {
    args.push(`--grep=${search}`, '-i');
  }

  const output = exec(`git log ${args.join(' ')}`);

  if (!output) {
    return [];
  }

  return output.split('\n').map((line) => {
    const [hash, shortHash, message, relativeDate] = line.split('|');
    return { hash, shortHash, message, relativeDate };
  });
}

export interface BranchCommit extends Commit {
  side: 'b1' | 'b2';
}

export function getBranchCommits(b1: string, b2: string): BranchCommit[] {
  // %ct = Unix commit timestamp for sorting; %cr = relative date for display
  const format = '%H|%h|%s|%cr|%an|%ct';

  function parseCommits(output: string, side: 'b1' | 'b2'): Array<BranchCommit & { ts: number }> {
    if (!output) return [];
    return output.split('\n').map((line) => {
      const [hash, shortHash, message, relativeDate, author, tsStr] = line.split('|');
      return { hash, shortHash, message, relativeDate, author, side, ts: parseInt(tsStr, 10) || 0 };
    });
  }

  const b1Commits = parseCommits(exec(`git log "${b2}..${b1}" --format="${format}"`), 'b1');
  const b2Commits = parseCommits(exec(`git log "${b1}..${b2}" --format="${format}"`), 'b2');

  return [...b1Commits, ...b2Commits]
    .sort((a, b) => b.ts - a.ts)
    .map(({ ts: _ts, ...c }) => c);
}
