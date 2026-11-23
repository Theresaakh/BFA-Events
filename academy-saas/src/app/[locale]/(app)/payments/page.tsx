import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PaymentsView } from '@/components/payments/payments-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/payments'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('payments') };
}

export default async function Page({ params }: PageProps<'/[locale]/payments'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PaymentsView />;
}
