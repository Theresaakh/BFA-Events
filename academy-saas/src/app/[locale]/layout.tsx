import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Inter, IBM_Plex_Sans_Arabic, Barlow_Condensed } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing, isRtl } from '@/i18n/routing';
import { APP_NAME } from '@/config/app';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-barlow', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: { default: APP_NAME, template: `%s · ${APP_NAME}` }, description: t('tagline') };
}

export const viewport: Viewport = { themeColor: '#15134A', width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html suppressHydrationWarning lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} className={`${inter.variable} ${arabic.variable} ${barlow.variable}`}>
      <body className="min-h-screen">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
