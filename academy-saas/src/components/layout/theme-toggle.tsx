'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Monitor, Moon, Sun } from 'lucide-react';

type Mode = 'light' | 'dark' | 'system';
const KEY = 'academyos.theme';
// Whatever the page started with (e.g. a host app's theme) is what "System" goes back to.
const initialAttr = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === 'system') { if (initialAttr) root.setAttribute('data-theme', initialAttr); else root.removeAttribute('data-theme'); }
  else root.setAttribute('data-theme', mode);
}

export function ThemeToggle() {
  const t = useTranslations('header');
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => {
    let saved: Mode = 'system';
    try { saved = (localStorage.getItem(KEY) as Mode) || 'system'; } catch { /* storage blocked */ }
    apply(saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with saved preference once on mount
    setMode(saved);
  }, []);
  const next: Record<Mode, Mode> = { light: 'dark', dark: 'system', system: 'light' };
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label = t(mode === 'light' ? 'themeLight' : mode === 'dark' ? 'themeDark' : 'themeSystem');
  return (
    <button type="button" title={label} aria-label={label}
      onClick={() => { const m = next[mode]; setMode(m); apply(m); try { localStorage.setItem(KEY, m); } catch { /* ignore */ } }}
      className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-surface">
      <Icon className="size-4 text-muted" /><span className="hidden lg:inline">{label}</span>
    </button>
  );
}
