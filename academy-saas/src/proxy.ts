import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from './lib/supabase/env';

const intl = createMiddleware(routing);
/** Pages reachable without being signed in. */
const PUBLIC_SECTIONS = new Set(['login', 'signup', 'forgot-password', 'reset-password', 'auth']);

/**
 * Runs before every page (Next.js 16 "proxy", formerly middleware):
 * 1. adds the locale prefix (/en, /ar, /fr);
 * 2. refreshes the Supabase session cookie;
 * 3. sends signed-out visitors to the login page.
 * This is a convenience gate — data access is still enforced by RLS in the database.
 */
export default async function proxy(request: NextRequest) {
  const response = intl(request);
  if (!supabaseConfigured || response.headers.get('location')) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  let signedIn = false;
  try { signedIn = Boolean((await supabase.auth.getUser()).data.user); } catch { signedIn = false; }

  const [, locale = routing.defaultLocale, section = ''] = request.nextUrl.pathname.split('/');
  const isPublic = PUBLIC_SECTIONS.has(section);
  const redirectTo = (path: string, keepNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${path}`;
    url.search = keepNext ? `?next=${encodeURIComponent(request.nextUrl.pathname.replace(`/${locale}`, '') || '/dashboard')}` : '';
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (!signedIn && !isPublic) return redirectTo('/login', true);
  if (signedIn && (section === 'login' || section === 'signup')) return redirectTo('/dashboard');
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
