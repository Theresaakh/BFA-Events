'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { CalendarX2, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Download, Lock, MapPin } from 'lucide-react';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { can as canRole } from '@/lib/domain/permissions';
import { addDays, dateIn } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { SessionStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/charts';
import { useLookups } from '@/components/shared/lookups';
import { useResultToast } from '@/components/shared/result-toast';
import { downloadCSV } from '@/components/shared/csv';
import type { AttendanceStatus, TrainingSession } from '@/lib/types';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused'];

export function AttendanceView() {
  const t = useTranslations('attendance');
  const [tab, setTab] = useState<'record' | 'reports'>('record');
  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'record', label: t('tabRecord') }, { value: 'reports', label: t('tabReports') }]} /></div>
      {tab === 'record' ? <RecordAttendance /> : <AttendanceReports />}
    </div>
  );
}

function RecordAttendance() {
  const t = useTranslations('attendance');
  const { data, today, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const [date, setDate] = useState(today);
  const sessions = useMemo(() => data.sessions
    .filter((s) => visibleTeams.has(s.teamId) && dateIn(s.startsAt, fmt.timezone) === date)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [data.sessions, visibleTeams, date, fmt.timezone]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions.find((s) => s.status !== 'cancelled') ?? sessions[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label={t('previousDay')}><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9" />
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, 1))} aria-label={t('nextDay')}><ChevronRight className="size-4 rtl:rotate-180" /></Button>
        </div>
        <p className="px-4 pb-1 pt-3 text-xs font-medium text-muted">{fmt.date(date, 'long')}{date === today && ` · ${t('today')}`}</p>
        {sessions.length ? (
          <ul className="space-y-1 p-2">
            {sessions.map((s) => {
              const roster = lk.rosterOf.get(s.teamId)?.length ?? 0;
              const marked = data.attendance.filter((a) => a.sessionId === s.id).length;
              return (
                <li key={s.id}>
                  <button onClick={() => setSelectedId(s.id)} className={clsx('w-full rounded-xl border px-3 py-2.5 text-start transition',
                    selected?.id === s.id ? 'border-brand-500 bg-brand-50/60 ring-4 ring-brand-500/10' : 'border-transparent hover:bg-surface')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('truncate text-sm font-medium', s.status === 'cancelled' && 'text-muted line-through')}>{lk.teams.get(s.teamId)?.name}</span>
                      {s.status === 'cancelled' ? <SessionStatusBadge status="cancelled" /> : <span className={clsx('tabular text-xs', marked >= roster && roster ? 'text-brand-700' : 'text-muted')}>{marked}/{roster}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{fmt.time(s.startsAt)}–{fmt.time(s.endsAt)} · {lk.locations.get(s.locationId ?? '')?.name}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon={CalendarX2} title={t('noSessions')} description={t('noSessionsHint')} />}
      </Card>
      {selected ? <SessionSheet key={selected.id + date} session={selected} /> : <Card><EmptyState icon={ClipboardCheck} title={t('pickSession')} /></Card>}
    </div>
  );
}

function SessionSheet({ session }: { session: TrainingSession }) {
  const t = useTranslations('attendance');
  const ta = useTranslations('enums.attendance');
  const tc = useTranslations('common');
  const { data, user, today, actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const show = useResultToast();
  const date = dateIn(session.startsAt, fmt.timezone);
  const roster = data.assignments
    .filter((a) => a.teamId === session.teamId && a.startDate <= date && (!a.endDate || a.endDate >= date))
    .map((a) => lk.players.get(a.playerId)!).filter(Boolean)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const existing = new Map(data.attendance.filter((a) => a.sessionId === session.id).map((a) => [a.playerId, a]));
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() => Object.fromEntries([...existing].map(([k, v]) => [k, v.status])));
  const [reason, setReason] = useState('');
  const [openedAt] = useState(() => Date.now());

  const isFuture = date > today;
  const cancelled = session.status === 'cancelled';
  const isStaff = canRole(user.role, 'attendance.correct');
  const corrections = [...existing].filter(([pid, rec]) => marks[pid] && marks[pid] !== rec.status);
  const lockedForCoach = !isStaff && [...existing.values()].some((r) => r.recordedBy !== user.id || openedAt - new Date(r.recordedAt).getTime() > 48 * 3600_000);
  const readOnly = isFuture || cancelled || lockedForCoach;
  const counts = STATUSES.map((s) => Object.values(marks).filter((m) => m === s).length);
  const unmarked = roster.filter((p) => !marks[p.id]).length;
  const changed = roster.filter((p) => marks[p.id] && marks[p.id] !== existing.get(p.id)?.status).length;

  const save = () => {
    const toSave = Object.fromEntries(Object.entries(marks).filter(([pid, st]) => existing.get(pid)?.status !== st));
    const res = actions.saveAttendance(session.id, toSave, data, reason);
    if (show(res, 'attendance.saved')) setReason('');
  };

  const firstRecord = [...existing.values()][0];
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2">{lk.teams.get(session.teamId)?.name}<SessionStatusBadge status={session.status} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{fmt.time(session.startsAt)}–{fmt.time(session.endsAt)}</span><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{lk.locations.get(session.locationId ?? '')?.name}</span><span>{lk.coaches.get(session.coachId ?? '')?.fullName}</span></span>}
        action={!readOnly && roster.length > 0 && <Button size="sm" onClick={() => setMarks(Object.fromEntries(roster.map((p) => [p.id, marks[p.id] ?? 'present'])))}><CheckCheck className="size-4" /><span className="hidden sm:inline">{t('markRestPresent')}</span></Button>}
      />
      {(isFuture || cancelled || lockedForCoach) && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {cancelled ? t('cancelledNotice', { reason: session.cancelReason ?? '—' }) : isFuture ? t('futureNotice') : t('lockedNotice')}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 p-5 pb-2 sm:grid-cols-4">
        {STATUSES.map((s, i) => <div key={s} className="rounded-xl bg-surface px-3 py-2"><p className="text-[11px] text-muted">{ta(s)}</p><p className="tabular text-lg font-semibold">{counts[i]}</p></div>)}
        <div className="hidden rounded-xl bg-surface px-3 py-2 sm:block"><p className="text-[11px] text-muted">{t('unmarked')}</p><p className="tabular text-lg font-semibold">{unmarked}</p></div>
      </div>
      {roster.length ? (
        <ul className="divide-y divide-line">
          {roster.map((p) => {
            const rec = existing.get(p.id);
            return (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800">{p.firstName[0]}{p.lastName[0]}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted">{p.code}{rec?.updatedAt && ` · ${t('corrected')}`}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:flex">
                  {STATUSES.map((s) => (
                    <button key={s} disabled={readOnly} onClick={() => setMarks((m) => ({ ...m, [p.id]: s }))}
                      className={clsx('flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition sm:h-9 sm:min-w-24 disabled:cursor-not-allowed',
                        marks[p.id] === s
                          ? s === 'present' ? 'border-brand-500 bg-brand-500 text-white' : s === 'absent' ? 'border-red-500 bg-red-500 text-white' : 'border-amber-500 bg-amber-500 text-white'
                          : 'border-line bg-white text-muted hover:border-slate-300 hover:text-ink disabled:hover:border-line')}>
                      {marks[p.id] === s && <Check className="size-3.5" />}{ta(s)}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState icon={ClipboardCheck} title={t('emptyRoster')} />}
      {!readOnly && roster.length > 0 && (
        <div className="space-y-3 border-t border-line bg-surface/50 p-5">
          {corrections.length > 0 && isStaff && (
            <Field label={t('correctionReason')} hint={t('correctionHint', { n: corrections.length })} required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('correctionPlaceholder')} />
            </Field>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">{firstRecord ? t('recordedBy', { name: lk.users.get(firstRecord.recordedBy)?.fullName ?? '—', at: fmt.dateTime(firstRecord.recordedAt) }) : t('notRecorded')}</p>
            <Button variant="primary" onClick={save} disabled={!changed}><Check className="size-4" />{changed ? t('saveN', { n: changed }) : tc('saved')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AttendanceReports() {
  const t = useTranslations('attendance');
  const ta = useTranslations('enums.attendance');
  const { data, today, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [team, setTeam] = useState('');
  const [coach, setCoach] = useState('');
  const [group, setGroup] = useState<'player' | 'team' | 'coach'>('player');

  const rows = useMemo(() => {
    const sessions = new Map(data.sessions.filter((s) => {
      const d = dateIn(s.startsAt, fmt.timezone);
      return visibleTeams.has(s.teamId) && d >= from && d <= to && (!team || s.teamId === team) && (!coach || s.coachId === coach);
    }).map((s) => [s.id, s]));
    const agg = new Map<string, { label: string; sub?: string; present: number; absent: number; excused: number }>();
    for (const a of data.attendance) {
      const s = sessions.get(a.sessionId);
      if (!s) continue;
      const key = group === 'player' ? a.playerId : group === 'team' ? s.teamId : s.coachId ?? '—';
      const label = group === 'player' ? lk.playerName(a.playerId) : group === 'team' ? lk.teams.get(s.teamId)?.name ?? '—' : lk.coaches.get(s.coachId ?? '')?.fullName ?? '—';
      const sub = group === 'player' ? lk.teams.get(s.teamId)?.name : undefined;
      const x = agg.get(key) ?? { label, sub, present: 0, absent: 0, excused: 0 };
      x[a.status] += 1;
      agg.set(key, x);
    }
    return [...agg.values()].map((x) => ({ ...x, total: x.present + x.absent + x.excused })).map((x) => ({ ...x, rate: x.total ? x.present / x.total : 0 }))
      .sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label));
  }, [data, fmt.timezone, visibleTeams, from, to, team, coach, group, lk]);

  const exportCsv = () => downloadCSV(`attendance-${group}-${from}-${to}.csv`, [
    [t(`by.${group}`), ...(group === 'player' ? [t('team')] : []), ta('present'), ta('absent'), ta('excused'), t('total'), t('rate')],
    ...rows.map((r) => [r.label, ...(group === 'player' ? [r.sub] : []), r.present, r.absent, r.excused, r.total, Math.round(r.rate * 100) + '%']),
  ]);

  return (
    <Card>
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={t('team')}><Select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">{t('allTeams')}</option>{data.teams.filter((x) => visibleTeams.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label={t('coach')}><Select value={coach} onChange={(e) => setCoach(e.target.value)}><option value="">{t('allCoaches')}</option>{data.coaches.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></Field>
        <div className="flex items-end"><Button className="w-full" onClick={exportCsv}><Download className="size-4" />{t('export')}</Button></div>
      </div>
      <div className="border-b border-line px-4 py-3">
        <Segmented value={group} onChange={setGroup} options={(['player', 'team', 'coach'] as const).map((g) => ({ value: g, label: t(`by.${g}`) }))} />
      </div>
      {rows.length ? (
        <Table>
          <thead><tr><Th>{t(`by.${group}`)}</Th><Th numeric>{ta('present')}</Th><Th numeric>{ta('absent')}</Th><Th numeric>{ta('excused')}</Th><Th numeric>{t('total')}</Th><Th className="w-40">{t('rate')}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.label + r.sub}>
                <Td><p className="font-medium">{r.label}</p>{r.sub && <p className="text-xs text-muted">{r.sub}</p>}</Td>
                <Td numeric>{r.present}</Td><Td numeric>{r.absent}</Td><Td numeric>{r.excused}</Td><Td numeric>{r.total}</Td>
                <Td><div className="flex items-center gap-2"><ProgressBar value={r.rate} tone={r.rate >= 0.8 ? 'green' : r.rate >= 0.6 ? 'amber' : 'red'} /><span className="tabular w-10 text-end text-xs font-medium">{fmt.percent(r.rate)}</span></div></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState icon={ClipboardCheck} title={t('noData')} />}
    </Card>
  );
}
