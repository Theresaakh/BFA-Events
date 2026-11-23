import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('dashboard') };
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardView />;
}
