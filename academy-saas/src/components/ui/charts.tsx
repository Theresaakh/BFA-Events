'use client';
/** Small dependency-free SVG charts. They follow the document direction (RTL-safe). */
import { useLocale } from 'next-intl';

export function BarChart({ data, series, height = 220, format }: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  format: (n: number) => string;
}) {
  const locale = useLocale();
  const rtl = locale === 'ar';
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const W = 600, H = height, top = 12, bottom = 28, left = 8, right = 8;
  const bw = (W - left - right) / Math.max(1, data.length);
  const inner = H - top - bottom;
  const group = bw * 0.62, bar = group / series.length;
  const ordered = rtl ? [...data].reverse() : data;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={left} x2={W - right} y1={top + inner * (1 - g)} y2={top + inner * (1 - g)} stroke="var(--color-line)" strokeDasharray="3 4" />
        ))}
        <line x1={left} x2={W - right} y1={top + inner} y2={top + inner} stroke="var(--color-slate-300)" />
        {ordered.map((d, i) => {
          const x0 = left + i * bw + (bw - group) / 2;
          return (
            <g key={d.label}>
              {d.values.map((v, s) => {
                const h = (v / max) * inner;
                return (
                  <rect key={s} x={x0 + s * bar + 1} y={top + inner - h} width={Math.max(2, bar - 2)} height={Math.max(0, h)} rx={3} fill={series[s].color}>
                    <title>{`${series[s].name} · ${d.label}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              <text x={left + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export function Donut({ parts, size = 140, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: React.ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  const segments = parts.map((p, i) => ({ ...p, len: (p.value / total) * c, offset: parts.slice(0, i).reduce((s, q) => s + (q.value / total) * c, 0) }));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="14" />
        {segments.map((p) => (
          <circle key={p.label} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${p.len} ${c - p.len}`} strokeDashoffset={-p.offset}><title>{p.label}</title></circle>
        ))}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
