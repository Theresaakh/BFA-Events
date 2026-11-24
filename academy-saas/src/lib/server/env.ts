import 'server-only';
/**
 * Server-only settings. None of these ever reach the browser.
 * DATABASE_URL: Neon (or any PostgreSQL) connection string for the app's login role.
 * BETTER_AUTH_SECRET: random 32+ character string used to sign sessions.
 */
export const DATABASE_URL = process.env.DATABASE_URL ?? '';
export const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
