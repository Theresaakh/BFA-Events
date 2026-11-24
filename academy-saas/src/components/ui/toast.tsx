'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

type Toast = { id: number; message: string; tone: 'success' | 'error' };
const Ctx = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('pointer-events-auto flex items-start gap-3 rounded-xl border bg-panel p-3.5 text-sm shadow-[var(--shadow-pop)] animate-pop-in',
            t.tone === 'success' ? 'border-brand-100' : 'border-red-200')}>
            {t.tone === 'success' ? <CheckCircle2 className="size-5 shrink-0 text-emerald-500" /> : <AlertCircle className="size-5 shrink-0 text-red-500" />}
            <span className="text-ink">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
