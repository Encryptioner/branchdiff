import { useQuery } from '@tanstack/react-query';
import { branchComparisonOptions } from '../queries/branch-comparison';
import type { BranchComparison } from '../lib/api';

export function useBranchComparison(b1: string, b2: string, mode?: string): {
  data: BranchComparison | undefined;
  error: string | null;
  isLoading: boolean;
} {
  const { data, error, isLoading } = useQuery(branchComparisonOptions(b1, b2, mode));
  return { data, error: error?.message ?? null, isLoading };
}
