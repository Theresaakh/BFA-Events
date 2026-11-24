import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/config/app';
import { accountsEnabled } from '@/lib/accounts-enabled';
import { AuthLanguageSwitch } from './language-switch';

/** Split layout: brand panel (pitch markings) + form. Collapses to the form only on phones. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTranslations('auth');
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-glow relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-volt-400 font-bold text-navy-950">A</span>
          <span className="font-display text-2xl font-bold uppercase tracking-wide">{APP_NAME}</span>
        </div>
        <svg aria-hidden viewBox="0 0 420 260" className="pointer-events-none absolute -end-24 top-1/2 h-[70%] -translate-y-1/2 opacity-[0.12]" fill="none" stroke="white" strokeWidth="2">
          <rect x="10" y="10" width="400" height="240" rx="4" /><path d="M210 10v240" /><circle cx="210" cy="130" r="42" />
          <rect x="10" y="70" width="62" height="120" /><rect x="348" y="70" width="62" height="120" />
        </svg>
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-volt-400">{t('panelKicker')}</p>
          <p className="font-display mt-3 text-5xl font-bold uppercase leading-[0.95]">{t('panelTitle')}</p>
          <p className="mt-4 text-sm text-navy-100/75">{t('panelText')}</p>
        </div>
        <p className="relative text-xs text-navy-100/50">{t('panelFooter')}</p>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="font-display text-xl font-bold uppercase tracking-wide lg:invisible">{APP_NAME}</span>
          <AuthLanguageSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-4xl font-bold uppercase leading-none">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          {!accountsEnabled && <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('demoNotice')}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
