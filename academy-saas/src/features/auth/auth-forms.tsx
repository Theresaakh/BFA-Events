'use client';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { requestPasswordReset, signIn, signUp, updatePassword } from './actions';
import type { AuthState } from './schemas';

function Feedback({ state }: { state: AuthState }) {
  const t = useTranslations();
  if (state.success) return <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{t(state.success as never)}</p>;
  if (state.error && state.error !== 'errors.validation') return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t(state.error as never)}</p>;
  return null;
}

export function SignInForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, params.get('error') === 'link' ? { error: 'auth.errors.linkExpired' } : {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={params.get('next') ?? ''} />
      <Feedback state={state} />
      <Field label={t('email')} error={state.fields?.email}><Input name="email" type="email" autoComplete="email" dir="ltr" required invalid={!!state.fields?.email} /></Field>
      <Field label={<span className="flex justify-between"><span>{t('password')}</span><Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">{t('forgotLink')}</Link></span>} error={state.fields?.password}>
        <Input name="password" type="password" autoComplete="current-password" required invalid={!!state.fields?.password} />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? t('pleaseWait') : t('signIn')}</Button>
      <p className="text-center text-sm text-muted">{t('noAccount')} <Link href="/signup" className="font-semibold text-brand-700 hover:underline">{t('createAccount')}</Link></p>
    </form>
  );
}

export function SignUpForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action, pending] = useActionState(signUp, {});
  if (state.success) return <div className="space-y-4"><Feedback state={state} /><Link href="/login" className="block text-center text-sm font-semibold text-brand-700 hover:underline">{t('backToSignIn')}</Link></div>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Feedback state={state} />
      <Field label={t('fullName')} error={state.fields?.fullName}><Input name="fullName" autoComplete="name" required invalid={!!state.fields?.fullName} /></Field>
      <Field label={t('email')} error={state.fields?.email}><Input name="email" type="email" autoComplete="email" dir="ltr" required invalid={!!state.fields?.email} /></Field>
      <Field label={t('password')} hint={t('passwordHint')} error={state.fields?.password}><Input name="password" type="password" autoComplete="new-password" required invalid={!!state.fields?.password} /></Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? t('pleaseWait') : t('createAccount')}</Button>
      <p className="text-center text-xs text-muted">{t('termsNote')}</p>
      <p className="text-center text-sm text-muted">{t('haveAccount')} <Link href="/login" className="font-semibold text-brand-700 hover:underline">{t('signIn')}</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Feedback state={state} />
      {!state.success && <>
        <Field label={t('email')} error={state.fields?.email}><Input name="email" type="email" autoComplete="email" dir="ltr" required invalid={!!state.fields?.email} /></Field>
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? t('pleaseWait') : t('forgot.send')}</Button>
      </>}
      <Link href="/login" className="block text-center text-sm font-semibold text-brand-700 hover:underline">{t('backToSignIn')}</Link>
    </form>
  );
}

export function ResetForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action, pending] = useActionState(updatePassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Feedback state={state} />
      <Field label={t('newPassword')} hint={t('passwordHint')} error={state.fields?.password}><Input name="password" type="password" autoComplete="new-password" required invalid={!!state.fields?.password} /></Field>
      <Field label={t('confirmPassword')} error={state.fields?.confirm}><Input name="confirm" type="password" autoComplete="new-password" required invalid={!!state.fields?.confirm} /></Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>{pending ? t('pleaseWait') : t('reset.save')}</Button>
    </form>
  );
}
