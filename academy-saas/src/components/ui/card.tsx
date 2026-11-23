import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
