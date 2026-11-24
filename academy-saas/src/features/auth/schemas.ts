import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('auth.errors.email'),
  password: z.string().min(1, 'validation.required'),
  next: z.string().optional(),
});
export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.required').max(100, 'validation.tooLong'),
  email: z.email('auth.errors.email'),
  password: z.string().min(10, 'auth.errors.passwordLength').max(72, 'validation.tooLong'),
});
export const emailSchema = z.object({ email: z.email('auth.errors.email') });
export const newPasswordSchema = z.object({
  password: z.string().min(10, 'auth.errors.passwordLength').max(72, 'validation.tooLong'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.errors.mismatch' });

/** `values` echoes back non-secret inputs so the form keeps them after an error (passwords are never echoed). */
export type AuthState = { error?: string; fields?: Record<string, string>; success?: string; values?: { email?: string; fullName?: string } };

/** Only allow internal relative redirects after login (prevents open-redirect attacks). */
export function safeNext(next: string | undefined | null): string {
  return next && /^\/[a-z0-9/_-]*$/i.test(next) && !next.startsWith('//') ? next : '/dashboard';
}
