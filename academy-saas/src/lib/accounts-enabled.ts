/**
 * Whether real accounts are switched on. Public flag (no secret): when false the app runs in
 * demo mode with fictional data and no login. Set NEXT_PUBLIC_ACCOUNTS_ENABLED=true together with
 * DATABASE_URL and BETTER_AUTH_SECRET.
 */
export const accountsEnabled = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true';
