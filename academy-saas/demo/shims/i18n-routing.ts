export const locales = ['en', 'ar', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const routing = { locales, defaultLocale: 'en' as const };
export const rtlLocales: readonly Locale[] = ['ar'];
export const isRtl = (locale: string) => (rtlLocales as readonly string[]).includes(locale);
