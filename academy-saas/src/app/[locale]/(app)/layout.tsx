import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { accountsEnabled } from '@/lib/accounts-enabled';

export default async function AppLayout({ children, params }: LayoutProps<'/[locale]'>) {
  if (accountsEnabled) {
    // Real check against the database (the proxy only looked for a cookie).
    const { auth } = await import('@/lib/server/auth');
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      const { locale } = await params;
      redirect(`/${locale}/login`);
    }
  }
  return <AppShell>{children}</AppShell>;
}
