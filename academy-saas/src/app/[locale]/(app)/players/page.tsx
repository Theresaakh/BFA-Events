import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PlayersView } from '@/components/players/players-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/players'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('players') };
}

export default async function Page({ params }: PageProps<'/[locale]/players'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayersView />;
}
