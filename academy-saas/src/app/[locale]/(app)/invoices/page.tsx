import { getTranslations, setRequestLocale } from 'next-intl/server';
import { InvoicesView } from '@/components/invoices/invoices-view';

export async function generateMetadata({ params }: PageProps<'/[locale]/invoices'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('invoices') };
}

export default async function Page({ params }: PageProps<'/[locale]/invoices'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InvoicesView />;
}
