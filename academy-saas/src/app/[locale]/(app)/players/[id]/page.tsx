import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PlayerProfile } from '@/components/players/player-profile';

export async function generateMetadata({ params }: PageProps<'/[locale]/players/[id]'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'players' });
  return { title: t('profile') };
}

export default async function Page({ params }: PageProps<'/[locale]/players/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PlayerProfile id={id} />;
}
