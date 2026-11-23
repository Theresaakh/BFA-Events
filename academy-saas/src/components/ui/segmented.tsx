'use client';
import clsx from 'clsx';

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-white p-0.5 shadow-sm">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={clsx('flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition',
            value === o.value ? 'bg-navy-900 text-white shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
          {o.count !== undefined && <span className={clsx('tabular rounded px-1 text-[10px]', value === o.value ? 'bg-white/15' : 'bg-surface')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
