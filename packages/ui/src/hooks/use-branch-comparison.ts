import { useSuspenseQuery } from '@tanstack/react-query';
import { branchComparisonOptions } from '../queries/branch-comparison';
import type { BranchComparison } from '../lib/api';

export function useBranchComparison(b1: string, b2: string, mode?: string): {
  data: BranchComparison;
  error: string | null;
} {
  const { data, error } = useSuspenseQuery(branchComparisonOptions(b1, b2, mode));
  return { data, error: error?.message ?? null };
}
