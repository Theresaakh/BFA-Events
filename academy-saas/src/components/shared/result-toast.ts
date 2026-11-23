'use client';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import type { Result } from '@/lib/store/academy-store';

/** Shows a translated toast for a store Result and returns whether it succeeded. */
export function useResultToast() {
  const t = useTranslations();
  const toast = useToast();
  return <T,>(res: Result<T>, successKey?: string): res is { ok: true; value: T } => {
    if (res.ok) { if (successKey) toast(t(successKey as never)); return true; }
    toast(t(res.error as never), 'error');
    return false;
  };
}
