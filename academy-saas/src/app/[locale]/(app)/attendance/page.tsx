import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AttendanceView } from '@/components/attendance/attendance-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/attendance'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('attendance') };
}

export default async function Page({ params }: PageProps<'/[locale]/attendance'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AttendanceView />;
}
