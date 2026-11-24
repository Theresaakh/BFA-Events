import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy' | 'volt';
export type ButtonSize = 'sm' | 'md';

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) {
  return clsx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
    variant === 'primary' && 'bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700',
    variant === 'volt' && 'bg-volt-400 text-navy-950 shadow-[0_6px_24px_rgb(212_255_63/0.35)] hover:bg-volt-300 active:bg-volt-500',
    variant === 'navy' && 'bg-navy-900 text-white shadow-sm hover:bg-navy-800',
    variant === 'secondary' && 'border border-line bg-panel text-ink shadow-sm hover:bg-surface',
    variant === 'ghost' && 'text-muted hover:bg-navy-50 hover:text-ink',
    variant === 'danger' && 'border border-red-200 bg-panel text-red-600 hover:bg-red-50',
    extra,
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant, size, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});
