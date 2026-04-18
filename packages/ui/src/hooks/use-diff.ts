import { useQuery } from '@tanstack/react-query';
import { diffOptions } from '../queries/diff';

export function useDiff(hideWhitespace = false, ref?: string) {
  const { data, error, isLoading } = useQuery(diffOptions(hideWhitespace, ref));

  return {
    data,
    error: error?.message ?? null,
    isLoading,
  };
}
