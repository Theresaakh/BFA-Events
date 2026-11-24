import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/features/auth/auth-shell';
import { SignInForm } from '@/features/auth/auth-forms';

export async function generateMetadata({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signIn') };
}

export default async function Page({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  return <AuthShell title={t('signIn')} subtitle={t('signInSubtitle')}><Suspense><SignInForm /></Suspense></AuthShell>;
}
