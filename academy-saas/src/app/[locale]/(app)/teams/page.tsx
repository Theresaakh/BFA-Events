import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TeamsView } from '@/components/teams/teams-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/teams'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('teams') };
}

export default async function Page({ params }: PageProps<'/[locale]/teams'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamsView />;
}
