import { getTranslations, setRequestLocale } from 'next-intl/server';
import { InvoiceDetail } from '@/components/invoices/invoice-detail';

export async function generateMetadata({ params }: PageProps<'/[locale]/invoices/[id]'>) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'invoices' });
  return { title: t('invoice') };
}

export default async function Page({ params }: PageProps<'/[locale]/invoices/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <InvoiceDetail id={id} />;
}
