import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { getSessionCookie } from 'better-auth/cookies';
import { routing } from './i18n/routing';
import { accountsEnabled } from './lib/accounts-enabled';

const intl = createMiddleware(routing);
/** Pages reachable without being signed in. */
const PUBLIC_SECTIONS = new Set(['login', 'signup', 'forgot-password', 'reset-password']);

/**
 * Runs before every page (Next.js 16 "proxy", formerly middleware):
 * 1. adds the locale prefix (/en, /ar, /fr);
 * 2. sends visitors without a session cookie to the login page.
 * This is a fast first gate only: the app layout verifies the session against the database,
 * and Row Level Security protects the data itself.
 */
export default function proxy(request: NextRequest) {
  const response = intl(request);
  if (!accountsEnabled || response.headers.get('location')) return response;

  const [, locale = routing.defaultLocale, section = ''] = request.nextUrl.pathname.split('/');
  const hasSession = Boolean(getSessionCookie(request));
  const redirectTo = (path: string, keepNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${path}`;
    url.search = keepNext ? `?next=${encodeURIComponent(request.nextUrl.pathname.replace(`/${locale}`, '') || '/dashboard')}` : '';
    return NextResponse.redirect(url);
  };
  if (!hasSession && !PUBLIC_SECTIONS.has(section)) return redirectTo('/login', true);
  if (hasSession && (section === 'login' || section === 'signup')) return redirectTo('/dashboard');
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
