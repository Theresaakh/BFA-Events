import clsx from 'clsx';
import type { ReactNode } from 'react';

export type Tone = 'green' | 'gray' | 'red' | 'amber' | 'blue' | 'navy' | 'violet';

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  navy: 'bg-navy-50 text-navy-800 ring-navy-700/15',
  violet: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

export function Badge({ tone = 'gray', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
