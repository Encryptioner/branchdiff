import { queryOptions } from '@tanstack/react-query';
import { fetchBranchComparison, fetchBranches, fetchBranchConfig, fetchFileDiff, fetchBranchCommits } from '../lib/api';

export function branchesOptions() {
  return queryOptions({
    queryKey: ['branches'],
    queryFn: () => fetchBranches(),
  });
}

export function branchComparisonOptions(b1: string, b2: string) {
  return queryOptions({
    queryKey: ['branch-comparison', b1, b2],
    queryFn: () => fetchBranchComparison(b1, b2),
  });
}

export function fileDiffOptions(b1: string, b2: string, file: string) {
  return queryOptions({
    queryKey: ['file-diff', b1, b2, file],
    queryFn: () => fetchFileDiff(b1, b2, file),
  });
}

export function branchConfigOptions(b1?: string, b2?: string, mode?: string) {
  return queryOptions({
    queryKey: ['branch-config', b1 ?? null, b2 ?? null, mode ?? null],
    queryFn: () => fetchBranchConfig(b1, b2, mode),
  });
}

export function branchCommitsOptions(b1: string, b2: string) {
  return queryOptions({
    queryKey: ['branch-commits', b1, b2],
    queryFn: () => fetchBranchCommits(b1, b2),
  });
}
