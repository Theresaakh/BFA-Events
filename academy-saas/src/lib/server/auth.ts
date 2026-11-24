import 'server-only';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { pool } from './db';
import { AUTH_SECRET, SITE_URL } from './env';
import { sendEmail } from './email';
import { authSchemaOptions } from './auth-schema';

/**
 * Accounts (Better Auth). Users, sessions and login methods live in our own PostgreSQL
 * tables (auth_user, auth_session, auth_account, auth_verification) — no outside login service.
 */
export const auth = betterAuth({
  appName: 'AcademyOS',
  baseURL: SITE_URL,
  secret: AUTH_SECRET,
  database: pool,
  ...authSchemaOptions,
  advanced: { ...authSchemaOptions.advanced, useSecureCookies: SITE_URL.startsWith('https://') },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 72,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, kind: 'reset', url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, kind: 'verify', url });
    },
  },
  rateLimit: { enabled: true, window: 60, max: 30, storage: 'database', modelName: 'auth_rate_limit' },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
