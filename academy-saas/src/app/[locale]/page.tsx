import { redirect } from '@/i18n/navigation';

export default async function LocaleHome({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  redirect({ href: '/dashboard', locale });
}
