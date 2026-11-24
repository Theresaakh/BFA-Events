'use client';
import { useLocale } from 'next-intl';
import clsx from 'clsx';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function AuthLanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
      {routing.locales.map((l) => (
        <button key={l} onClick={() => router.replace(pathname, { locale: l })}
          className={clsx('rounded-md px-2.5 py-1 font-semibold uppercase', l === locale ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink')}>{l}</button>
      ))}
    </div>
  );
}
