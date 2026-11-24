/** In-page router for the standalone (artifact) build: same API surface the app uses from Next.js. */
import { useSyncExternalStore } from 'react';

export type Loc = 'en' | 'ar' | 'fr';
type State = { locale: Loc; path: string; query: Record<string, string> };
const KEY = 'academyos.demo.route';

function initial(): State {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.path) return { ...s, query: {} }; } catch { /* ignore */ }
  return { locale: 'en', path: '/dashboard', query: {} };
}
let state: State = initial();
const listeners = new Set<() => void>();
const emit = () => {
  try { localStorage.setItem(KEY, JSON.stringify({ locale: state.locale, path: state.path })); } catch { /* ignore */ }
  listeners.forEach((l) => l());
};
export const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const getState = () => state;
export const useRoute = () => useSyncExternalStore(subscribe, getState, getState);

export type Href = string | { pathname: string; query?: Record<string, string | undefined> };
export function navigate(href: Href, opts?: { locale?: string }) {
  let path: string; let query: Record<string, string> = {};
  if (typeof href === 'string') {
    const [p, q] = href.split('?');
    path = p; query = Object.fromEntries(new URLSearchParams(q ?? ''));
  } else {
    path = href.pathname;
    query = Object.fromEntries(Object.entries(href.query ?? {}).filter(([, v]) => v != null)) as Record<string, string>;
  }
  state = { locale: (opts?.locale as Loc) ?? state.locale, path: path || '/dashboard', query };
  window.scrollTo(0, 0);
  emit();
}
