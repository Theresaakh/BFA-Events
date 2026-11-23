import clsx from 'clsx';
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ className, numeric, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <th className={clsx('whitespace-nowrap border-b border-line bg-surface/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted', numeric ? 'text-end' : 'text-start', className)} {...rest} />;
}
export function Td({ className, numeric, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={clsx('border-b border-line/70 px-4 py-3 align-middle', numeric && 'tabular whitespace-nowrap text-end', className)} {...rest} />;
}
export function Tr({ className, onClick, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx('transition-colors last:[&>td]:border-b-0', onClick && 'cursor-pointer hover:bg-brand-50/50', className)} onClick={onClick} {...rest} />;
}
