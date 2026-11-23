'use client';
import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Globe, Menu, Search, UserCog } from 'lucide-react';
import clsx from 'clsx';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { useStore } from '@/lib/store/academy-store';

const LANG_LABEL: Record<Locale, string> = { en: 'English', ar: 'العربية', fr: 'Français' };

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const t = useTranslations('header');
  const tr = useTranslations('enums.role');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, data, actions } = useStore();
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [q, setQ] = useState('');
  const langRef = useClickOutside(() => setLangOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));

  const switchLocale = (l: Locale) => {
    setLangOpen(false);
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: l });
  };
  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-muted hover:bg-surface lg:hidden" aria-label={t('menu')}><Menu className="size-5" /></button>

      <form className="relative hidden max-w-md flex-1 md:block" onSubmit={(e) => { e.preventDefault(); router.push({ pathname: '/players', query: q ? { q } : {} }); }}>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="control h-10 ps-9" />
      </form>
      <div className="flex-1 md:hidden" />

      {/* language */}
      <div ref={langRef} className="relative">
        <button onClick={() => setLangOpen((o) => !o)} className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-surface" aria-haspopup="menu">
          <Globe className="size-4 text-muted" /><span className="hidden sm:inline">{LANG_LABEL[locale]}</span><span className="uppercase sm:hidden">{locale}</span>
        </button>
        {langOpen && (
          <div className="absolute end-0 top-12 w-44 rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-pop)] animate-pop-in" role="menu">
            {routing.locales.map((l) => (
              <button key={l} onClick={() => switchLocale(l)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface" role="menuitem">
                {LANG_LABEL[l]} {l === locale && <Check className="size-4 text-brand-500" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* user / demo role switch */}
      <div ref={userRef} className="relative">
        <button onClick={() => setUserOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pe-2 hover:bg-surface">
          <span className="grid size-8 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{initials}</span>
          <span className="hidden text-start sm:block">
            <span className="block text-sm font-medium leading-tight">{user.fullName}</span>
            <span className="block text-[11px] leading-tight text-muted">{tr(user.role)}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted sm:block" />
        </button>
        {userOpen && (
          <div className="absolute end-0 top-12 w-72 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)] animate-pop-in">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <UserCog className="mt-0.5 size-4 shrink-0" />{t('viewAsHint')}
            </div>
            <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{t('viewAs')}</p>
            {data.users.map((u) => (
              <button key={u.id} onClick={() => { actions.switchUser(u.id); setUserOpen(false); router.push('/dashboard'); }}
                className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm hover:bg-surface', u.id === user.id && 'bg-brand-50')}>
                <span><span className="block font-medium">{u.fullName}</span><span className="block text-xs text-muted">{tr(u.role)}</span></span>
                {u.id === user.id && <Check className="size-4 text-brand-500" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
