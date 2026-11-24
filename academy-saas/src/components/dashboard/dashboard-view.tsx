'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarClock, CircleDollarSign, ClipboardCheck, HandCoins, Receipt, Shield, UserCheck, Users, UserRound } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { can } from '@/lib/domain/permissions';
import { sumByCurrency } from '@/lib/domain/finance';
import { addDays, dateIn } from '@/lib/format';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader } from '@/components/ui/card';
import { BarChart, Donut } from '@/components/ui/charts';
import { SessionStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClass } from '@/components/ui/button';
import { useLookups } from '@/components/shared/lookups';

export function DashboardView() {
  const t = useTranslations('dashboard');
  const tm = useTranslations('enums.paymentMethod');
  const { data, user, today, visibleTeams, visiblePlayers } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const balances = useInvoiceBalances();
  const showMoney = can(user.role, 'dashboard.finance');
  const tz = data.academy.timezone;
  const month = today.slice(0, 7);

  const ops = useMemo(() => {
    const players = data.players.filter((p) => visiblePlayers.has(p.id) && p.status !== 'archived');
    const sessions = data.sessions.filter((s) => visibleTeams.has(s.teamId));
    const todays = sessions.filter((s) => dateIn(s.startsAt, tz) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const upcoming = sessions.filter((s) => { const d = dateIn(s.startsAt, tz); return d > today && d <= addDays(today, 7) && s.status !== 'cancelled'; })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
    const from = addDays(today, -30);
    const sessionIds = new Set(sessions.filter((s) => dateIn(s.startsAt, tz) >= from).map((s) => s.id));
    const recent = data.attendance.filter((a) => sessionIds.has(a.sessionId));
    const count = (st: string) => recent.filter((a) => a.status === st).length;
    const coachIds = new Set(data.teamCoaches.filter((tc) => visibleTeams.has(tc.teamId)).map((tc) => tc.coachId));
    return {
      registered: players.length,
      active: players.filter((p) => p.status === 'active').length,
      teams: visibleTeams.size,
      coaches: user.role === 'coach' ? coachIds.size : data.coaches.filter((c) => c.active).length,
      todays, upcoming,
      att: { present: count('present'), absent: count('absent'), excused: count('excused'), total: recent.length },
    };
  }, [data, visiblePlayers, visibleTeams, today, tz, user.role]);

  const money = useMemo(() => {
    if (!showMoney) return null;
    const issued = data.invoices.filter((i) => i.status === 'issued');
    const invoicedMonth = sumByCurrency(issued.filter((i) => i.issueDate.startsWith(month)), (i) => i.currency, (i) => balances.get(i.id)!.total);
    const live = data.payments.filter((p) => !p.voidedAt);
    const collectedMonth = sumByCurrency(live.filter((p) => p.paidOn.startsWith(month)), (p) => p.currency, (p) => p.amount);
    const outstanding = sumByCurrency(issued, (i) => i.currency, (i) => Math.max(0, balances.get(i.id)!.balance));
    const overdueList = issued.filter((i) => balances.get(i.id)!.status === 'overdue');
    const overdue = sumByCurrency(overdueList, (i) => i.currency, (i) => balances.get(i.id)!.balance);
    const months = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (5 - k));
      return d.toISOString().slice(0, 7);
    });
    const cur = data.academy.currency;
    const chart = months.map((m) => ({
      label: new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`)),
      values: [
        issued.filter((i) => i.currency === cur && i.issueDate.startsWith(m)).reduce((s, i) => s + balances.get(i.id)!.total, 0),
        live.filter((p) => p.currency === cur && p.paidOn.startsWith(m)).reduce((s, p) => s + p.amount, 0),
      ],
    }));
    const recentPayments = [...live].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
    return { invoicedMonth, collectedMonth, outstanding, overdue, overdueCount: overdueList.length, chart, recentPayments };
  }, [showMoney, data, balances, month, fmt.locale]);

  /** Show multi-currency totals side by side, academy currency first. */
  const multi = (m: Record<string, number>) => {
    const entries = Object.entries(m).sort(([a], [b]) => (a === fmt.currency ? -1 : b === fmt.currency ? 1 : a.localeCompare(b)));
    if (!entries.length) return fmt.money(0);
    return entries.map(([c, v]) => fmt.money(v, c)).join(' · ');
  };
  const attRate = ops.att.total ? ops.att.present / ops.att.total : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('greetingMorning') : hour < 18 ? t('greetingAfternoon') : t('greetingEvening');

  return (
    <div>
      <section className="hero-glow relative mb-6 overflow-hidden rounded-2xl p-6 text-white shadow-[var(--shadow-pop)] sm:p-8">
        <svg aria-hidden viewBox="0 0 420 260" className="pointer-events-none absolute -end-10 top-1/2 hidden h-[130%] -translate-y-1/2 opacity-[0.13] md:block" fill="none" stroke="white" strokeWidth="2">
          <rect x="10" y="10" width="400" height="240" rx="4" /><path d="M210 10v240" /><circle cx="210" cy="130" r="42" /><circle cx="210" cy="130" r="3" fill="white" />
          <rect x="10" y="70" width="62" height="120" /><rect x="10" y="100" width="22" height="60" /><rect x="348" y="70" width="62" height="120" /><rect x="388" y="100" width="22" height="60" />
        </svg>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-volt-400">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-volt-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-volt-400" /></span>
              {t('matchday')} · {fmt.date(today, 'long')}
            </p>
            <h1 className="font-display mt-2 text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl">{greeting},<br className="sm:hidden" /> <span className="text-volt-400">{user.fullName.split(' ')[0]}</span></h1>
            <p className="mt-2 max-w-xl text-sm text-navy-100/75">{data.academy.name}</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {can(user.role, 'attendance.record') && <Link href="/attendance" className={buttonClass('secondary', 'md', 'border-white/15 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white')}><ClipboardCheck className="size-4" />{t('takeAttendance')}</Link>}
              {can(user.role, 'finance.edit') && <Link href="/payments?new=1" className={buttonClass('volt')}><HandCoins className="size-4" />{t('recordPayment')}</Link>}
            </div>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-sm">
            {[
              [t('todaysSessions'), fmt.number(ops.todays.filter((s) => s.status !== 'cancelled').length)],
              [t('attendanceRate'), fmt.percent(attRate)],
              [t('activePlayers'), fmt.number(ops.active)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 px-4 py-3 text-center [&:not(:last-child)]:border-e [&:not(:last-child)]:border-white/10 sm:px-6">
                <p className="tabular font-display text-3xl font-bold leading-none sm:text-4xl">{v}</p>
                <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-navy-100/70">{k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('registeredPlayers')} value={fmt.number(ops.registered)} icon={Users} />
        <StatCard label={t('activePlayers')} value={fmt.number(ops.active)} icon={UserCheck} tone="green" hint={ops.registered ? t('ofRegistered', { pct: fmt.percent(ops.active / ops.registered) }) : undefined} />
        <StatCard label={t('teams')} value={fmt.number(ops.teams)} icon={Shield} tone="blue" />
        <StatCard label={t('coaches')} value={fmt.number(ops.coaches)} icon={UserRound} tone="blue" />
        <StatCard label={t('todaysSessions')} value={fmt.number(ops.todays.filter((s) => s.status !== 'cancelled').length)} icon={CalendarClock} hint={ops.todays.some((s) => s.status === 'cancelled') ? t('cancelledCount', { n: ops.todays.filter((s) => s.status === 'cancelled').length }) : undefined} />
        <StatCard label={t('attendanceRate')} value={fmt.percent(attRate)} icon={ClipboardCheck} tone={attRate >= 0.8 ? 'green' : 'amber'} hint={t('last30days')} />
        {money && <>
          <StatCard label={t('invoicedThisMonth')} value={multi(money.invoicedMonth)} icon={Receipt} />
          <StatCard label={t('collectedThisMonth')} value={multi(money.collectedMonth)} icon={CircleDollarSign} tone="green" />
          <StatCard label={t('outstanding')} value={multi(money.outstanding)} icon={HandCoins} tone="amber" />
          <StatCard label={t('overdue')} value={multi(money.overdue)} icon={AlertTriangle} tone="red" hint={t('overdueInvoices', { n: money.overdueCount })} />
        </>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {money ? (
          <Card className="xl:col-span-2">
            <CardHeader title={t('revenueTitle')} subtitle={t('revenueSubtitle', { currency: fmt.currency })} />
            <div className="p-5"><BarChart data={money.chart} format={(n) => fmt.money(n)} series={[{ name: t('invoiced'), color: 'var(--chart-ink)' }, { name: t('collected'), color: 'var(--chart-accent)' }]} /></div>
          </Card>
        ) : (
          renderToday(ops.todays, 'xl:col-span-2')
        )}
        <Card>
          <CardHeader title={t('attendanceOverview')} subtitle={t('last30days')} />
          <div className="flex items-center gap-6 p-5">
            <Donut parts={[
              { label: 'present', value: ops.att.present, color: '#10B981' },
              { label: 'absent', value: ops.att.absent, color: '#ef4444' },
              { label: 'excused', value: ops.att.excused, color: '#f59e0b' },
            ]} center={<div><p className="tabular text-xl font-semibold">{fmt.percent(attRate)}</p><p className="text-[11px] text-muted">{t('present')}</p></div>} />
            <ul className="space-y-2.5 text-sm">
              {([['present', '#10B981'], ['absent', '#ef4444'], ['excused', '#f59e0b']] as const).map(([k, c]) => (
                <li key={k} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: c }} />{t(k)}<span className="tabular ms-auto ps-4 font-medium">{fmt.number(ops.att[k])}</span></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {money && renderToday(ops.todays)}
        <Card>
          <CardHeader title={t('upcoming')} subtitle={t('next7days')} action={<Link href="/schedule" className="text-xs font-medium text-brand-700 hover:underline">{t('viewSchedule')}</Link>} />
          {ops.upcoming.length ? (
            <ul className="divide-y divide-line">
              {ops.upcoming.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[11px] uppercase text-muted">{new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { weekday: 'short', timeZone: tz }).format(new Date(s.startsAt))}</p>
                    <p className="tabular text-sm font-semibold">{fmt.time(s.startsAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lk.teams.get(s.teamId)?.name}</p>
                    <p className="truncate text-xs text-muted">{lk.locations.get(s.locationId ?? '')?.name} · {lk.coaches.get(s.coachId ?? '')?.fullName}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarClock} title={t('nothingUpcoming')} />}
        </Card>
        {money && (
          <Card>
            <CardHeader title={t('recentPayments')} action={<Link href="/payments" className="text-xs font-medium text-brand-700 hover:underline">{t('viewAll')}</Link>} />
            <ul className="divide-y divide-line">
              {money.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lk.playerName(p.playerId)}</p>
                    <p className="text-xs text-muted">{fmt.date(p.paidOn)} · {tm(p.method)}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-brand-700">{fmt.money(p.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );

  function renderToday(sessions: typeof ops.todays, className?: string) {
    return (
      <Card className={className}>
        <CardHeader title={t('todaysSessions')} subtitle={fmt.date(today, 'long')} action={<Link href="/attendance" className="text-xs font-medium text-brand-700 hover:underline">{t('openAttendance')}</Link>} />
        {sessions.length ? (
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const roster = lk.rosterOf.get(s.teamId)?.length ?? 0;
              const marked = data.attendance.filter((a) => a.sessionId === s.id).length;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lk.teams.get(s.teamId)?.name}</p>
                    <p className="text-xs text-muted">{fmt.time(s.startsAt)}–{fmt.time(s.endsAt)} · {lk.locations.get(s.locationId ?? '')?.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular hidden text-xs text-muted sm:inline">{t('marked', { marked, total: roster })}</span>
                    <SessionStatusBadge status={s.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon={CalendarClock} title={t('noSessionsToday')} />}
      </Card>
    );
  }
}
