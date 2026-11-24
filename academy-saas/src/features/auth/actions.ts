'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { fieldErrors } from '@/lib/validation/schemas';
import { emailSchema, newPasswordSchema, safeNext, signInSchema, signUpSchema, type AuthState } from './schemas';

const notConfigured: AuthState = { error: 'auth.errors.notConfigured' };

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
}
const localeOf = (fd: FormData) => (['en', 'ar', 'fr'].includes(String(fd.get('locale'))) ? String(fd.get('locale')) : 'en');

export async function signIn(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!supabaseConfigured) return notConfigured;
  const parsed = signInSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // Same message for unknown email and wrong password: never reveal which accounts exist.
  if (error) return { error: error.code === 'email_not_confirmed' ? 'auth.errors.notConfirmed' : 'auth.errors.invalidCredentials' };
  redirect(`/${localeOf(fd)}${safeNext(parsed.data.next)}`);
}

export async function signUp(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!supabaseConfigured) return notConfigured;
  const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error) };
  const locale = localeOf(fd);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, locale },
      emailRedirectTo: `${await siteOrigin()}/${locale}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: error.code === 'weak_password' ? 'auth.errors.weakPassword' : 'auth.errors.generic' };
  return { success: 'auth.signup.checkEmail' };
}

export async function requestPasswordReset(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!supabaseConfigured) return notConfigured;
  const parsed = emailSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/${localeOf(fd)}/auth/callback?next=/reset-password`,
  });
  // Always the same answer, whether or not the email has an account.
  return { success: 'auth.forgot.sent' };
}

export async function updatePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!supabaseConfigured) return notConfigured;
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'errors.validation', fields: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === 'same_password' ? 'auth.errors.samePassword' : 'auth.errors.linkExpired' };
  redirect(`/${localeOf(fd)}/dashboard`);
}

export async function signOut(fd: FormData): Promise<void> {
  if (supabaseConfigured) await (await createSupabaseServerClient()).auth.signOut();
  redirect(`/${localeOf(fd)}/login`);
}
