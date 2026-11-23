import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'ar', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
});

/** Right-to-left languages. */
export const rtlLocales: readonly Locale[] = ['ar'];
export const isRtl = (locale: string) => (rtlLocales as readonly string[]).includes(locale);
