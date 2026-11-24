'use client';
import { Suspense, useState, type ReactNode } from 'react';
import { AcademyStoreProvider, useMaybeStore } from '@/lib/store/academy-store';
import { ToastProvider } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Sidebar } from './sidebar';
import { Header } from './header';

function Shell({ children }: { children: ReactNode }) {
  const store = useMaybeStore();
  const [open, setOpen] = useState(false);
  if (!store) return <ShellSkeleton />;
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:ps-64">
        <Suspense><Header onMenu={() => setOpen(true)} /></Suspense>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="fixed inset-y-0 start-0 hidden w-64 bg-navy-900 lg:block" />
      <div className="lg:ps-64">
        <div className="h-16 border-b border-line bg-panel" />
        <div className="space-y-4 p-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AcademyStoreProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </AcademyStoreProvider>
  );
}
