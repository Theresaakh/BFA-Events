import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 renamed "middleware" to "proxy". This adds the locale prefix (/en, /ar, /fr).
// Phase 2 will also refresh the Supabase auth session here.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and files with an extension (images, favicon…)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
