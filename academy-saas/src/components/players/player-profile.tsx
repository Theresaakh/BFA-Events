'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, ArrowLeft, Mail, Pencil, Phone, RotateCcw, ShieldAlert, UserX } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { ageOn, dateIn } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/card';
import { Button, buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { AttendanceBadge, PaymentStatusBadge, PlayerStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/charts';
import { useLookups } from '@/components/shared/lookups';
import { useCan } from '@/components/shared/guard';
import { useResultToast } from '@/components/shared/result-toast';
import { PlayerFormModal } from './player-form';

type Tab = 'overview' | 'attendance' | 'finance' | 'history';

export function PlayerProfile({ id }: { id: string }) {
  const t = useTranslations('players');
  const tc = useTranslations('common');
  const tsp = useTranslations('enums.sport');
  const tct = useTranslations('enums.charge');
  const { data, today, visiblePlayers, actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const show = useResultToast();
  const balances = useInvoiceBalances();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const player = data.players.find((p) => p.id === id);
  const allowed = player && (visiblePlayers.has(player.id) || can('players.viewAll'));

  const attendance = useMemo(() => {
    if (!player) return [];
    return data.attendance.filter((a) => a.playerId === player.id)
      .map((a) => ({ a, s: data.sessions.find((s) => s.id === a.sessionId)! }))
      .filter((x) => x.s).sort((x, y) => y.s.startsAt.localeCompare(x.s.startsAt));
  }, [data, player]);

  if (!player || !allowed) {
    return <Card><EmptyState icon={UserX} title={t('notFound')} action={<Link href="/players" className={buttonClass('secondary')}>{t('backToList')}</Link>} /></Card>;
  }

  const teams = lk.teamsOfPlayer.get(player.id) ?? [];
  const contacts = data.contacts.filter((c) => c.playerId === player.id);
  const invoices = data.invoices.filter((i) => i.playerId === player.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const payments = data.payments.filter((p) => p.playerId === player.id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const outstanding = invoices.filter((i) => i.status === 'issued' && i.currency === fmt.currency).reduce((s, i) => s + Math.max(0, balances.get(i.id)!.balance), 0);
  const present = attendance.filter((x) => x.a.status === 'present').length;
  const rate = attendance.length ? present / attendance.length : 0;
  const history = data.assignments.filter((a) => a.playerId === player.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const audit = data.audit.filter((e) => e.entityId === player.id);
  const age = ageOn(player.dateOfBirth, today);
  const tabs: Tab[] = ['overview', 'attendance', ...(can('finance.view') ? ['finance' as Tab] : []), 'history'];

  return (
    <div>
      <Link href="/players" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" />{t('backToList')}</Link>

      <Card className="mb-6 overflow-hidden">
        <div className="h-16 bg-gradient-to-r from-navy-900 to-navy-700" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-8 flex items-end gap-4">
            <span className="grid size-20 place-items-center rounded-2xl border-4 border-panel bg-brand-500 text-2xl font-semibold text-white shadow">{player.firstName[0]}{player.lastName[0]}</span>
            <div className="pb-1">
              <h1 className="text-xl font-semibold">{player.firstName} {player.lastName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="tabular">{player.code}</span>{age !== undefined && <span>· {t('age', { n: age })}</span>}<PlayerStatusBadge status={player.status} />
              </div>
            </div>
          </div>
          {can('players.edit') && (
            <div className="no-print flex gap-2">
              <Button onClick={() => setEditing(true)}><Pencil className="size-4" />{tc('edit')}</Button>
              {player.status === 'archived'
                ? <Button onClick={() => show(actions.setPlayerArchived(player, false), 'players.restored')}><RotateCcw className="size-4" />{t('restore')}</Button>
                : <Button variant="danger" onClick={() => show(actions.setPlayerArchived(player, true), 'players.archived')}><Archive className="size-4" />{t('archive')}</Button>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
          {[
            [t('team'), teams.map((x) => x.name).join(', ') || '—'],
            [t('registrationDate'), fmt.date(player.registrationDate)],
            [t('attendanceRate'), attendance.length ? fmt.percent(rate) : '—'],
            ...(can('finance.view') ? [[t('balance'), fmt.money(outstanding)]] : [[t('sport'), teams.map((x) => tsp(x.sport)).join(', ') || '—']]),
          ].map(([k, v], i) => (
            <div key={i} className="border-line px-5 py-3 [&:not(:last-child)]:border-e">
              <p className="text-xs text-muted">{k}</p><p className="mt-0.5 truncate text-sm font-medium">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="no-print mb-4"><Segmented value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x, label: t(`tabs.${x}`) }))} /></div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('details')} />
            <dl className="divide-y divide-line text-sm">
              {[
                [t('dateOfBirth'), player.dateOfBirth ? fmt.date(player.dateOfBirth) : '—'],
                [t('gender'), player.gender ? t(`genderValue.${player.gender}`) : '—'],
                [t('branch'), lk.branches.get(player.branchId ?? '')?.name ?? '—'],
                [t('sport'), teams.map((x) => tsp(x.sport)).join(', ') || '—'],
                [t('notes'), player.notes || '—'],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-5 py-3"><dt className="text-muted">{k}</dt><dd className="text-end font-medium">{v}</dd></div>)}
            </dl>
          </Card>
          <Card>
            <CardHeader title={t('contacts')} subtitle={t('contactsPrivacy')} />
            {can('contacts.view') ? (
              contacts.length ? (
                <ul className="divide-y divide-line">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium">{c.fullName}</p>
                        <p className="text-xs text-muted">{c.relationship}</p>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline" dir="ltr"><Phone className="size-3.5" />{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Mail className="size-3.5" />{c.email}</a>}
                        </div>
                      </div>
                      <Badge tone={c.kind === 'guardian' ? 'navy' : 'red'}>{t(c.kind === 'guardian' ? 'guardian' : 'emergency')}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={Phone} title={t('noContacts')} />
            ) : <EmptyState icon={ShieldAlert} title={t('contactsRestricted')} />}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title={t('attendanceHistory')} subtitle={t('attendanceSummary', { present, total: attendance.length })} action={<div className="w-32 pt-1"><ProgressBar value={rate} tone={rate >= 0.8 ? 'green' : rate >= 0.6 ? 'amber' : 'red'} /></div>} />
          {attendance.length ? (
            <Table><thead><tr><Th>{tc('date')}</Th><Th>{t('team')}</Th><Th>{tc('status')}</Th><Th className="hidden sm:table-cell">{tc('note')}</Th></tr></thead>
              <tbody>{attendance.slice(0, 60).map(({ a, s }) => (
                <Tr key={a.id}><Td>{fmt.date(dateIn(s.startsAt, fmt.timezone))} <span className="text-xs text-muted">{fmt.time(s.startsAt)}</span></Td><Td>{lk.teams.get(s.teamId)?.name}</Td><Td><AttendanceBadge status={a.status} /></Td><Td className="hidden text-muted sm:table-cell">{a.note ?? ''}{a.updatedAt && <span className="ms-1 text-xs">({t('corrected')})</span>}</Td></Tr>
              ))}</tbody></Table>
          ) : <EmptyState icon={UserX} title={t('noAttendance')} />}
        </Card>
      )}

      {tab === 'finance' && can('finance.view') && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={t('invoices')} action={<Link href={`/invoices?new=1&player=${player.id}`} className={buttonClass('secondary', 'sm')}>{t('newInvoice')}</Link>} />
            {invoices.length ? (
              <Table><thead><tr><Th>#</Th><Th className="hidden sm:table-cell">{tc('description')}</Th><Th numeric>{tc('total')}</Th><Th numeric>{tc('balance')}</Th><Th>{tc('status')}</Th></tr></thead>
                <tbody>{invoices.map((i) => { const b = balances.get(i.id)!; return (
                  <Tr key={i.id}><Td><Link href={`/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.number}</Link><p className="text-xs text-muted">{fmt.date(i.issueDate)}</p></Td>
                    <Td className="hidden text-muted sm:table-cell">{tct(i.lines[0].chargeType)}</Td><Td numeric>{fmt.money(b.total, i.currency)}</Td><Td numeric className="font-medium">{fmt.money(b.balance, i.currency)}</Td><Td><PaymentStatusBadge status={b.status} /></Td></Tr>); })}</tbody></Table>
            ) : <EmptyState icon={UserX} title={t('noInvoices')} />}
          </Card>
          <Card>
            <CardHeader title={t('payments')} />
            {payments.length ? (
              <Table><thead><tr><Th>{t('receipt')}</Th><Th>{tc('date')}</Th><Th numeric>{tc('amount')}</Th></tr></thead>
                <tbody>{payments.map((p) => (
                  <Tr key={p.id}><Td className="tabular">{p.receiptNumber}{p.voidedAt && <Badge tone="gray">{tc('voided')}</Badge>}</Td><Td>{fmt.date(p.paidOn)}</Td><Td numeric className={p.voidedAt ? 'text-muted line-through' : 'font-medium text-brand-700'}>{fmt.money(p.amount, p.currency)}</Td></Tr>
                ))}</tbody></Table>
            ) : <EmptyState icon={UserX} title={t('noPayments')} />}
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('teamHistory')} />
            <ul className="divide-y divide-line">
              {history.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium">{lk.teams.get(a.teamId)?.name}</span>
                  <span className="text-xs text-muted">{fmt.date(a.startDate)} → {a.endDate ? fmt.date(a.endDate) : t('present')}</span>
                </li>
              ))}
              {!history.length && <li className="px-5 py-6 text-center text-sm text-muted">—</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t('changeLog')} />
            <ul className="divide-y divide-line">
              {audit.map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm"><p>{e.summary}</p><p className="text-xs text-muted">{fmt.dateTime(e.at)} · {lk.users.get(e.actorId)?.fullName}</p></li>
              ))}
              {!audit.length && <li className="px-5 py-6 text-center text-sm text-muted">{t('noChanges')}</li>}
            </ul>
          </Card>
        </div>
      )}

      <PlayerFormModal open={editing} onClose={() => setEditing(false)} player={player} />
    </div>
  );
}
