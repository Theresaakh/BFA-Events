import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/features/auth/auth-shell';
import { SignUpForm } from '@/features/auth/auth-forms';

export async function generateMetadata({ params }: PageProps<'/[locale]/signup'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signup.title') };
}

export default async function Page({ params }: PageProps<'/[locale]/signup'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  return <AuthShell title={t('signup.title')} subtitle={t('signup.subtitle')}><Suspense><SignUpForm /></Suspense></AuthShell>;
}
