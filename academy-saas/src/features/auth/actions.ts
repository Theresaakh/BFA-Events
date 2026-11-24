'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import { auth } from '@/lib/server/auth';
import { accountsEnabled } from '@/lib/accounts-enabled';
import { fieldErrors } from '@/lib/validation/schemas';
import { emailSchema, newPasswordSchema, safeNext, signInSchema, signUpSchema, type AuthState } from './schemas';

const notConfigured: AuthState = { error: 'auth.errors.notConfigured' };
const localeOf = (fd: FormData) => (['en', 'ar', 'fr'].includes(String(fd.get('locale'))) ? String(fd.get('locale')) : 'en');
const keep = (fd: FormData) => ({ email: String(fd.get('email') ?? '').slice(0, 200), fullName: String(fd.get('fullName') ?? '').slice(0, 100) });
const codeOf = (e: unknown) => (e instanceof APIError ? String((e.body as { code?: string } | undefined)?.code ?? '') : '');

export async function signIn(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!accountsEnabled) return notConfigured;
  const parsed = signInSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error), values: keep(fd) };
  try {
    await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: await headers() });
  } catch (e) {
    // One message for unknown email and wrong password: never reveal which accounts exist.
    const code = codeOf(e);
    if (code === 'EMAIL_NOT_VERIFIED') return { error: 'auth.errors.notConfirmed', values: keep(fd) };
    if (e instanceof APIError && e.status === 'TOO_MANY_REQUESTS') return { error: 'auth.errors.tooMany', values: keep(fd) };
    return { error: e instanceof APIError ? 'auth.errors.invalidCredentials' : 'auth.errors.generic', values: keep(fd) };
  }
  redirect(`/${localeOf(fd)}${safeNext(parsed.data.next)}`);
}

export async function signUp(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!accountsEnabled) return notConfigured;
  const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error), values: keep(fd) };
  const locale = localeOf(fd);
  try {
    await auth.api.signUpEmail({
      body: { name: parsed.data.fullName, email: parsed.data.email, password: parsed.data.password, locale, callbackURL: `/${locale}/dashboard` },
      headers: await headers(),
    });
  } catch (e) {
    const code = codeOf(e);
    if (code.startsWith('PASSWORD_')) return { error: 'auth.errors.weakPassword', values: keep(fd) };
    // An existing email gets the same answer as a new one (no account enumeration).
    if (!code.startsWith('USER_ALREADY_EXISTS')) return { error: 'auth.errors.generic', values: keep(fd) };
  }
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'false') redirect(`/${locale}/login?created=1`);
  return { success: 'auth.signup.checkEmail' };
}

export async function requestPasswordReset(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!accountsEnabled) return notConfigured;
  const parsed = emailSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error), values: keep(fd) };
  try {
    await auth.api.requestPasswordReset({ body: { email: parsed.data.email, redirectTo: `/${localeOf(fd)}/reset-password` }, headers: await headers() });
  } catch { /* same answer either way */ }
  return { success: 'auth.forgot.sent' };
}

export async function updatePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!accountsEnabled) return notConfigured;
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error) };
  const token = String(fd.get('token') ?? '');
  if (!token) return { error: 'auth.errors.linkExpired' };
  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token }, headers: await headers() });
  } catch (e) {
    return { error: codeOf(e).startsWith('PASSWORD_') ? 'auth.errors.weakPassword' : 'auth.errors.linkExpired' };
  }
  redirect(`/${localeOf(fd)}/login?reset=1`);
}

export async function signOut(fd: FormData): Promise<void> {
  if (accountsEnabled) await auth.api.signOut({ headers: await headers() }).catch(() => {});
  redirect(`/${localeOf(fd)}/login`);
}
