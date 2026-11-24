import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/features/auth/auth-shell';
import { ForgotForm } from '@/features/auth/auth-forms';

export async function generateMetadata({ params }: PageProps<'/[locale]/forgot-password'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('forgot.title') };
}

export default async function Page({ params }: PageProps<'/[locale]/forgot-password'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  return <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitle')}><Suspense><ForgotForm /></Suspense></AuthShell>;
}
