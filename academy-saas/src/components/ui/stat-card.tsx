import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TONE = {
  navy: 'bg-brand-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-400 text-navy-950',
  red: 'bg-red-500 text-white',
  blue: 'bg-navy-900 text-volt-400',
} as const;

export function StatCard({ label, value, hint, icon: Icon, tone = 'navy' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: keyof typeof TONE }) {
  return (
    <div className="lift relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-card)] sm:p-5">
      <Icon aria-hidden className="pointer-events-none absolute -bottom-3 -end-3 size-20 text-navy-900/[0.04]" />
      <div className="flex items-center gap-2.5">
        <span className={clsx('grid size-7 shrink-0 place-items-center rounded-md shadow-sm', TONE[tone])}><Icon className="size-3.5" /></span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      </div>
      <p className="tabular font-display mt-3 text-3xl font-bold leading-none text-ink sm:text-[34px]">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
