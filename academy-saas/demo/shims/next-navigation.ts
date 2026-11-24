import { useMemo } from 'react';
import { useRoute } from './router';

export function useSearchParams() {
  const { query } = useRoute();
  return useMemo(() => new URLSearchParams(query), [query]);
}
export function notFound(): never { throw new Error('not found'); }
