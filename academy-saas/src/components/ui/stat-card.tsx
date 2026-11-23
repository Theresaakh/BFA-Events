import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatCard({ label, value, hint, icon: Icon, tone = 'navy' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: 'navy' | 'green' | 'amber' | 'red' | 'blue' }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg',
          tone === 'navy' && 'bg-navy-50 text-navy-800', tone === 'green' && 'bg-brand-50 text-brand-700',
          tone === 'amber' && 'bg-amber-50 text-amber-700', tone === 'red' && 'bg-red-50 text-red-600', tone === 'blue' && 'bg-sky-50 text-sky-700')}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tabular mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
