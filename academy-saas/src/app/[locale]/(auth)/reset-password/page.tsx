import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/features/auth/auth-shell';
import { ResetForm } from '@/features/auth/auth-forms';

export async function generateMetadata({ params }: PageProps<'/[locale]/reset-password'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('reset.title') };
}

export default async function Page({ params }: PageProps<'/[locale]/reset-password'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  return <AuthShell title={t('reset.title')} subtitle={t('reset.subtitle')}><Suspense><ResetForm /></Suspense></AuthShell>;
}
