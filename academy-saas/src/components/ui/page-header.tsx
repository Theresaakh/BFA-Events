import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, kicker }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600"><span className="h-0.5 w-5 rounded-full bg-brand-500" />{kicker}</p>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
