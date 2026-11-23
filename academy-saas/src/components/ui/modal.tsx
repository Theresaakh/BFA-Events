'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const t = useTranslations('common');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/45 p-0 backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[8vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" className={clsx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[var(--shadow-pop)] animate-pop-in sm:rounded-2xl',
        size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-xl', size === 'lg' && 'sm:max-w-3xl', size === 'xl' && 'sm:max-w-5xl')}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label={t('close')}><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface/60 px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
