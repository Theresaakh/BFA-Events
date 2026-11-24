'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { canSeeNav } from '@/lib/domain/permissions';
import { useStore } from '@/lib/store/academy-store';
import { APP_NAME } from '@/config/app';
import { NAV_ITEMS } from './nav-items';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { user, data } = useStore();
  const items = NAV_ITEMS.filter((i) => canSeeNav(user.role, i.key));
  const sections = (['main', 'finance', 'system'] as const).map((s) => ({ s, items: items.filter((i) => i.section === s) })).filter((x) => x.items.length);

  return (
    <>
      {/* mobile backdrop */}
      <div onClick={onClose} className={clsx('fixed inset-0 z-30 bg-navy-950/40 transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <aside className={clsx(
        'no-print fixed inset-y-0 start-0 z-40 flex w-64 flex-col pitch-bg text-white transition-transform duration-200 lg:ltr:translate-x-0 lg:rtl:translate-x-0',
        open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
      )}>
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="grid size-8 place-items-center rounded-lg bg-volt-400 text-sm font-bold text-navy-950 shadow-[0_0_0_4px_rgb(212_255_63/0.15)]">A</span>
            <span className="font-display text-xl font-bold uppercase tracking-wide">{APP_NAME}</span>
          </Link>
          <button onClick={onClose} className="rounded-lg p-1.5 text-navy-100/70 hover:bg-white/10 lg:hidden" aria-label="Close menu"><X className="size-5" /></button>
        </div>
        <div className="mx-4 mb-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <p className="truncate text-xs font-semibold">{data.academy.name}</p>
          <p className="mt-0.5 text-[11px] text-navy-100/60">{data.academy.currency} · {data.academy.timezone}</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {sections.map(({ s, items }) => (
            <div key={s}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy-100/45">{t(`section.${s}`)}</p>
              <ul className="space-y-0.5">
                {items.map(({ key, href, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={key}>
                      <Link href={href} onClick={onClose}
                        className={clsx('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                          active ? 'bg-white/10 text-white' : 'text-navy-100/75 hover:bg-white/5 hover:text-white')}>
                        {active && <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-volt-400" />}
                        <Icon className={clsx('size-[18px]', active ? 'text-volt-400' : 'text-navy-100/55 group-hover:text-navy-100')} />
                        {t(key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <p className="px-5 pb-4 text-[10px] leading-relaxed text-navy-100/40">{t('demoNotice')}</p>
      </aside>
    </>
  );
}
