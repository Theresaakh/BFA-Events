import { BarChart3, CalendarDays, ClipboardCheck, LayoutDashboard, Receipt, Settings, Shield, Users, Wallet } from 'lucide-react';
import type { NavKey } from '@/lib/domain/permissions';

export const NAV_ITEMS: { key: NavKey; href: string; icon: typeof LayoutDashboard; section: 'main' | 'finance' | 'system' }[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'main' },
  { key: 'players', href: '/players', icon: Users, section: 'main' },
  { key: 'teams', href: '/teams', icon: Shield, section: 'main' },
  { key: 'attendance', href: '/attendance', icon: ClipboardCheck, section: 'main' },
  { key: 'schedule', href: '/schedule', icon: CalendarDays, section: 'main' },
  { key: 'invoices', href: '/invoices', icon: Receipt, section: 'finance' },
  { key: 'payments', href: '/payments', icon: Wallet, section: 'finance' },
  { key: 'reports', href: '/reports', icon: BarChart3, section: 'finance' },
  { key: 'settings', href: '/settings', icon: Settings, section: 'system' },
];
