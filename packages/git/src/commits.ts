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
  body?: string;
}

export function getBranchCommits(b1: string, b2: string): BranchCommit[] {
  // Use null-byte field separator + record separator so messages with "|" or "\n" don't break parsing.
  // Format: hash \0 shortHash \0 subject \0 relativeDate \0 author \0 timestamp \0 body
  // Record separator: ASCII RS (0x1e)
  const FIELD_SEP = '\x00';
  const RECORD_SEP = '\x1e';
  const format = `%H%x00%h%x00%s%x00%cr%x00%an%x00%ct%x00%b${RECORD_SEP}`;

  function parseCommits(output: string, side: 'b1' | 'b2'): Array<BranchCommit & { ts: number }> {
    if (!output) return [];
    return output
      .split(RECORD_SEP)
      .map(r => r.replace(/^\n/, ''))
      .filter(Boolean)
      .map((record) => {
        const [hash, shortHash, message, relativeDate, author, tsStr, body] = record.split(FIELD_SEP);
        return {
          hash,
          shortHash,
          message,
          relativeDate,
          author,
          side,
          body: (body || '').trim() || undefined,
          ts: parseInt(tsStr, 10) || 0,
        };
      });
  }

  const b1Commits = parseCommits(exec(`git log "${b2}..${b1}" --format="${format}"`), 'b1');
  const b2Commits = parseCommits(exec(`git log "${b1}..${b2}" --format="${format}"`), 'b2');

  return [...b1Commits, ...b2Commits]
    .sort((a, b) => b.ts - a.ts)
    .map(({ ts: _ts, ...c }) => c);
}
