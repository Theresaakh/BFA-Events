import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ReportsView } from '@/components/reports/reports-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/reports'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('reports') };
}

export default async function Page({ params }: PageProps<'/[locale]/reports'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportsView />;
}
