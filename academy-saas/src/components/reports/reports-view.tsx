'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Printer } from 'lucide-react';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { can } from '@/lib/domain/permissions';
import { addDays, dateIn, minorToInput } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { BarChart, ProgressBar } from '@/components/ui/charts';
import { PaymentStatusBadge } from '@/components/ui/status';
import { useLookups } from '@/components/shared/lookups';
import { downloadCSV } from '@/components/shared/csv';

type Tab = 'financial' | 'attendance' | 'players' | 'teams';

function lastMonths(today: string, n: number) {
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (n - 1 - k));
    return d.toISOString().slice(0, 7);
  });
}

export function ReportsView() {
  const t = useTranslations('reports');
  const { user } = useStore();
  const finance = can(user.role, 'reports.finance');
  const tabs: Tab[] = finance ? ['financial', 'attendance', 'players', 'teams'] : ['attendance', 'players', 'teams'];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [months, setMonths] = useState(6);
  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-10 w-44">{[3, 6, 12].map((m) => <option key={m} value={m}>{t('lastMonths', { n: m })}</option>)}</Select>
        <Button onClick={() => window.print()}><Printer className="size-4" />{t('pdf')}</Button>
      </>} />
      <div className="no-print mb-4"><Segmented value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x, label: t(`tabs.${x}`) }))} /></div>
      {tab === 'financial' && finance && <Financial months={months} />}
      {tab === 'attendance' && <AttendanceReport months={months} />}
      {tab === 'players' && <PlayersReport months={months} />}
      {tab === 'teams' && <TeamsReport />}
      <p className="mt-6 text-xs text-muted">{t('exportNote')}</p>
    </div>
  );
}

function Financial({ months }: { months: number }) {
  const t = useTranslations('reports');
  const tc = useTranslations('enums.charge');
  const { data, today } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const balances = useInvoiceBalances();
  const cur = data.academy.currency;
  const list = lastMonths(today, months);
  const issued = data.invoices.filter((i) => i.status === 'issued' && i.currency === cur);
  const live = data.payments.filter((p) => !p.voidedAt && p.currency === cur);
  const otherCurrencies = [...new Set([...data.invoices, ...data.payments].map((x) => x.currency))].filter((c) => c !== cur);

  const monthly = list.map((m) => {
    const inv = issued.filter((i) => i.issueDate.startsWith(m));
    return {
      m,
      invoiced: inv.reduce((s, i) => s + balances.get(i.id)!.total, 0),
      collected: live.filter((p) => p.paidOn.startsWith(m)).reduce((s, p) => s + p.amount, 0),
      outstanding: inv.reduce((s, i) => s + Math.max(0, balances.get(i.id)!.balance), 0),
      count: inv.length,
    };
  });
  const chargeTotals = new Map<string, number>();
  for (const i of issued) if (list.some((x) => i.issueDate.startsWith(x))) for (const l of i.lines) chargeTotals.set(l.chargeType, (chargeTotals.get(l.chargeType) ?? 0) + Math.round(l.quantity * l.unitAmount));
  const byCharge = [...chargeTotals.entries()].sort((a, b) => b[1] - a[1]);
  const overdue = issued.filter((i) => balances.get(i.id)!.status === 'overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const mName = (m: string) => new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  const sum = (k: 'invoiced' | 'collected' | 'outstanding') => monthly.reduce((s, x) => s + x[k], 0);

  return (
    <div className="space-y-6">
      {otherCurrencies.length > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('currencyNote', { currency: cur, others: otherCurrencies.join(', ') })}</p>}
      <Card>
        <CardHeader title={t('monthlyRevenue')} subtitle={t('inCurrency', { currency: cur })} action={<Button size="sm" className="no-print" onClick={() => downloadCSV(`financial-${today}.csv`, [[t('month'), t('invoiced'), t('collected'), t('outstanding'), t('invoices')], ...monthly.map((x) => [x.m, minorToInput(x.invoiced, cur), minorToInput(x.collected, cur), minorToInput(x.outstanding, cur), x.count])])}><Download className="size-4" />CSV</Button>} />
        <div className="p-5"><BarChart data={monthly.map((x) => ({ label: mName(x.m), values: [x.invoiced, x.collected] }))} series={[{ name: t('invoiced'), color: 'var(--chart-ink)' }, { name: t('collected'), color: 'var(--chart-accent)' }]} format={(n) => fmt.money(n)} /></div>
        <Table>
          <thead><tr><Th>{t('month')}</Th><Th numeric>{t('invoices')}</Th><Th numeric>{t('invoiced')}</Th><Th numeric>{t('collected')}</Th><Th numeric>{t('outstanding')}</Th><Th className="w-40">{t('collectionRate')}</Th></tr></thead>
          <tbody>
            {monthly.map((x) => (
              <Tr key={x.m}><Td className="font-medium">{mName(x.m)}</Td><Td numeric>{x.count}</Td><Td numeric>{fmt.money(x.invoiced)}</Td><Td numeric className="text-brand-700">{fmt.money(x.collected)}</Td><Td numeric className="text-amber-700">{fmt.money(x.outstanding)}</Td>
                <Td><div className="flex items-center gap-2"><ProgressBar value={x.invoiced ? (x.invoiced - x.outstanding) / x.invoiced : 0} /><span className="tabular w-10 text-end text-xs">{x.invoiced ? fmt.percent((x.invoiced - x.outstanding) / x.invoiced) : '—'}</span></div></Td></Tr>
            ))}
            <Tr className="bg-surface/70 font-semibold"><Td>{t('total')}</Td><Td numeric>{monthly.reduce((s, x) => s + x.count, 0)}</Td><Td numeric>{fmt.money(sum('invoiced'))}</Td><Td numeric>{fmt.money(sum('collected'))}</Td><Td numeric>{fmt.money(sum('outstanding'))}</Td><Td /></Tr>
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader title={t('byCharge')} />
          <ul className="space-y-3 p-5">
            {byCharge.map(([k, v]) => <li key={k}><div className="mb-1 flex justify-between text-sm"><span>{tc(k as never)}</span><span className="tabular font-medium">{fmt.money(v)}</span></div><ProgressBar value={v / (byCharge[0]?.[1] || 1)} /></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t('overdueInvoices', { n: overdue.length })} action={<Button size="sm" className="no-print" onClick={() => downloadCSV(`overdue-${today}.csv`, [[t('invoice'), t('player'), t('dueDate'), t('daysLate'), t('balance')], ...overdue.map((i) => [i.number, lk.playerName(i.playerId), i.dueDate, Math.round((Date.parse(today) - Date.parse(i.dueDate)) / 864e5), minorToInput(balances.get(i.id)!.balance, cur)])])}><Download className="size-4" />CSV</Button>} />
          <Table className="max-h-96">
            <thead><tr><Th>{t('invoice')}</Th><Th>{t('player')}</Th><Th numeric>{t('daysLate')}</Th><Th numeric>{t('balance')}</Th><Th>{t('status')}</Th></tr></thead>
            <tbody>{overdue.slice(0, 50).map((i) => (
              <Tr key={i.id}><Td className="tabular">{i.number}</Td><Td>{lk.playerName(i.playerId)}</Td><Td numeric className="text-red-600">{Math.round((Date.parse(today) - Date.parse(i.dueDate)) / 864e5)}</Td><Td numeric className="font-semibold">{fmt.money(balances.get(i.id)!.balance)}</Td><Td><PaymentStatusBadge status="overdue" /></Td></Tr>
            ))}</tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function AttendanceReport({ months }: { months: number }) {
  const t = useTranslations('reports');
  const { data, today, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const from = addDays(today, -30 * months);
  const rows = data.teams.filter((x) => visibleTeams.has(x.id)).map((team) => {
    const sessions = data.sessions.filter((s) => s.teamId === team.id && dateIn(s.startsAt, fmt.timezone) >= from && dateIn(s.startsAt, fmt.timezone) <= today);
    const ids = new Set(sessions.map((s) => s.id));
    const recs = data.attendance.filter((a) => ids.has(a.sessionId));
    const present = recs.filter((a) => a.status === 'present').length;
    return { team, held: sessions.filter((s) => s.status === 'completed').length, cancelled: sessions.filter((s) => s.status === 'cancelled').length, records: recs.length, rate: recs.length ? present / recs.length : 0, coach: lk.coaches.get(sessions[0]?.coachId ?? '')?.fullName };
  });
  return (
    <Card>
      <CardHeader title={t('attendanceByTeam')} subtitle={`${fmt.date(from)} – ${fmt.date(today)}`} action={<Button size="sm" className="no-print" onClick={() => downloadCSV(`attendance-teams-${today}.csv`, [[t('team'), t('coach'), t('sessionsHeld'), t('cancelled'), t('records'), t('rate')], ...rows.map((r) => [r.team.name, r.coach, r.held, r.cancelled, r.records, Math.round(r.rate * 100) + '%'])])}><Download className="size-4" />CSV</Button>} />
      <Table>
        <thead><tr><Th>{t('team')}</Th><Th className="hidden md:table-cell">{t('coach')}</Th><Th numeric>{t('sessionsHeld')}</Th><Th numeric>{t('cancelled')}</Th><Th numeric className="hidden sm:table-cell">{t('records')}</Th><Th className="w-44">{t('rate')}</Th></tr></thead>
        <tbody>{rows.map((r) => (
          <Tr key={r.team.id}><Td className="font-medium">{r.team.name}</Td><Td className="hidden text-muted md:table-cell">{r.coach}</Td><Td numeric>{r.held}</Td><Td numeric>{r.cancelled}</Td><Td numeric className="hidden sm:table-cell">{r.records}</Td>
            <Td><div className="flex items-center gap-2"><ProgressBar value={r.rate} tone={r.rate >= 0.8 ? 'green' : r.rate >= 0.6 ? 'amber' : 'red'} /><span className="tabular w-10 text-end text-xs font-medium">{fmt.percent(r.rate)}</span></div></Td></Tr>
        ))}</tbody>
      </Table>
    </Card>
  );
}

function PlayersReport({ months }: { months: number }) {
  const t = useTranslations('reports');
  const ts = useTranslations('enums.playerStatus');
  const { data, today, visiblePlayers } = useStore();
  const fmt = useFmt();
  const players = data.players.filter((p) => visiblePlayers.has(p.id) || p.status === 'archived');
  const list = lastMonths(today, months);
  const regs = list.map((m) => ({ label: new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`)), values: [players.filter((p) => p.registrationDate.startsWith(m)).length] }));
  const statuses = (['active', 'trial', 'inactive', 'suspended', 'archived'] as const).map((s) => [s, players.filter((p) => p.status === s).length] as const);
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader title={t('registrations')} action={<Button size="sm" className="no-print" onClick={() => downloadCSV(`registrations-${today}.csv`, [[t('month'), t('newPlayers')], ...list.map((m, i) => [m, regs[i].values[0]])])}><Download className="size-4" />CSV</Button>} />
        <div className="p-5"><BarChart data={regs} series={[{ name: t('newPlayers'), color: 'var(--chart-accent)' }]} format={(n) => fmt.number(n)} /></div>
      </Card>
      <Card>
        <CardHeader title={t('byStatus')} />
        <ul className="space-y-3 p-5">{statuses.map(([s, n]) => <li key={s}><div className="mb-1 flex justify-between text-sm"><span>{ts(s)}</span><span className="tabular font-medium">{n}</span></div><ProgressBar value={n / (players.length || 1)} tone={s === 'active' ? 'green' : 'amber'} /></li>)}</ul>
      </Card>
    </div>
  );
}

function TeamsReport() {
  const t = useTranslations('reports');
  const tsp = useTranslations('enums.sport');
  const { data, today, user, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const balances = useInvoiceBalances();
  const showMoney = can(user.role, 'reports.finance');
  const rows = data.teams.filter((x) => visibleTeams.has(x.id)).map((team) => {
    const roster = lk.rosterOf.get(team.id) ?? [];
    const set = new Set(roster);
    const inv = data.invoices.filter((i) => set.has(i.playerId) && i.status === 'issued' && i.currency === data.academy.currency);
    return { team, size: roster.length, coaches: (lk.coachesOfTeam.get(team.id) ?? []).map((c) => lk.coaches.get(c)?.fullName).join(', '), invoiced: inv.reduce((s, i) => s + balances.get(i.id)!.total, 0), outstanding: inv.reduce((s, i) => s + Math.max(0, balances.get(i.id)!.balance), 0) };
  });
  return (
    <Card>
      <CardHeader title={t('teamOverview')} action={<Button size="sm" className="no-print" onClick={() => downloadCSV(`teams-${today}.csv`, [[t('team'), t('sport'), t('players'), t('coach'), ...(showMoney ? [t('invoiced'), t('outstanding')] : [])], ...rows.map((r) => [r.team.name, tsp(r.team.sport), r.size, r.coaches, ...(showMoney ? [minorToInput(r.invoiced, data.academy.currency), minorToInput(r.outstanding, data.academy.currency)] : [])])])}><Download className="size-4" />CSV</Button>} />
      <Table>
        <thead><tr><Th>{t('team')}</Th><Th>{t('sport')}</Th><Th numeric>{t('players')}</Th><Th className="hidden md:table-cell">{t('coach')}</Th>{showMoney && <><Th numeric>{t('invoiced')}</Th><Th numeric>{t('outstanding')}</Th></>}</tr></thead>
        <tbody>{rows.map((r) => (
          <Tr key={r.team.id}><Td className="font-medium">{r.team.name}</Td><Td>{tsp(r.team.sport)}</Td><Td numeric>{r.size}</Td><Td className="hidden text-muted md:table-cell">{r.coaches}</Td>{showMoney && <><Td numeric>{fmt.money(r.invoiced)}</Td><Td numeric className="text-amber-700">{fmt.money(r.outstanding)}</Td></>}</Tr>
        ))}</tbody>
      </Table>
    </Card>
  );
}
