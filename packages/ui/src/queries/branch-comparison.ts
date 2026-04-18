import { queryOptions } from '@tanstack/react-query';
import { fetchBranchComparison, fetchBranches, fetchBranchConfig, fetchFileDiff, fetchBranchCommits } from '../lib/api';

export function branchesOptions() {
  return queryOptions({
    queryKey: ['branches'],
    queryFn: () => fetchBranches(),
  });
}

export function branchComparisonOptions(b1: string, b2: string, mode?: string) {
  return queryOptions({
    queryKey: ['branch-comparison', b1, b2, mode ?? null],
    queryFn: () => fetchBranchComparison(b1, b2, mode),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function fileDiffOptions(b1: string, b2: string, file: string, mode?: string) {
  return queryOptions({
    queryKey: ['file-diff', b1, b2, file, mode ?? null],
    queryFn: () => fetchFileDiff(b1, b2, file, mode),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function branchConfigOptions(b1?: string, b2?: string, mode?: string) {
  return queryOptions({
    queryKey: ['branch-config', b1 ?? null, b2 ?? null, mode ?? null],
    queryFn: () => fetchBranchConfig(b1, b2, mode),
    staleTime: 5 * 60_000,
  });
}

export function branchCommitsOptions(b1: string, b2: string) {
  return queryOptions({
    queryKey: ['branch-commits', b1, b2],
    queryFn: () => fetchBranchCommits(b1, b2),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
