'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { can, type Capability } from '@/lib/domain/permissions';
import { useStore } from '@/lib/store/academy-store';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

/** Hides a page for roles without the capability. (Real enforcement = database RLS.) */
export function RequireCapability({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { user } = useStore();
  const t = useTranslations('errors');
  if (!can(user.role, cap)) return <Card><EmptyState icon={Lock} title={t('noAccessTitle')} description={t('noAccessText')} /></Card>;
  return <>{children}</>;
}

export function useCan() {
  const { user } = useStore();
  return (cap: Capability) => can(user.role, cap);
}
