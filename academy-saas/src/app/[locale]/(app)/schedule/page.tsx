import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScheduleView } from '@/components/schedule/schedule-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/schedule'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('schedule') };
}

export default async function Page({ params }: PageProps<'/[locale]/schedule'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ScheduleView />;
}
