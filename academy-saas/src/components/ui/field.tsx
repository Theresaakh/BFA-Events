'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, error, hint, children, className, required }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  const t = useTranslations();
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{t(error as never)}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={clsx('control', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/15', className)} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={clsx('control pe-8', invalid && 'border-red-400', className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('control min-h-20', className)} {...rest} />;
}
