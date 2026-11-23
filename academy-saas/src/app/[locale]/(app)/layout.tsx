import { AppShell } from '@/components/layout/app-shell';

export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <AppShell>{children}</AppShell>;
}
