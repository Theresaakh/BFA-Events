/** Standalone build of AcademyOS: same screens, in-browser data, no server. */
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'use-intl';
import en from '../messages/en.json';
import ar from '../messages/ar.json';
import fr from '../messages/fr.json';
import './demo.css';
import { useRoute } from './shims/router';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { PlayersView } from '@/components/players/players-view';
import { PlayerProfile } from '@/components/players/player-profile';
import { TeamsView } from '@/components/teams/teams-view';
import { AttendanceView } from '@/components/attendance/attendance-view';
import { ScheduleView } from '@/components/schedule/schedule-view';
import { InvoicesView } from '@/components/invoices/invoices-view';
import { InvoiceDetail } from '@/components/invoices/invoice-detail';
import { PaymentsView } from '@/components/payments/payments-view';
import { ReportsView } from '@/components/reports/reports-view';
import { SettingsView } from '@/components/settings/settings-view';

const MESSAGES = { en, ar, fr };

function routeView(path: string): ReactNode {
  const [, section, id] = path.split('/');
  switch (section) {
    case 'players': return id ? <PlayerProfile id={id} /> : <PlayersView />;
    case 'teams': return <TeamsView />;
    case 'attendance': return <AttendanceView />;
    case 'schedule': return <ScheduleView />;
    case 'invoices': return id ? <InvoiceDetail id={id} /> : <InvoicesView />;
    case 'payments': return <PaymentsView />;
    case 'reports': return <ReportsView />;
    case 'settings': return <SettingsView />;
    default: return <DashboardView />;
  }
}

function App() {
  const { locale, path, query } = useRoute();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC" onError={() => {}}>
      <AppShell><div key={path + JSON.stringify(query)}>{routeView(path)}</div></AppShell>
    </IntlProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
