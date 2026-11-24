'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock, MapPin, Pencil, Plus, RotateCcw, UserRound } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { addDays, dateIn, intlLocale, timeIn, weekdayIndex } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Segmented } from '@/components/ui/segmented';
import { SessionStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { useLookups } from '@/components/shared/lookups';
import { useCan } from '@/components/shared/guard';
import { useResultToast } from '@/components/shared/result-toast';
import type { TrainingSession } from '@/lib/types';

type View = 'month' | 'week' | 'day';

/** Monday-based week start */
const weekStart = (d: string) => addDays(d, -((weekdayIndex(d) + 6) % 7));

export function ScheduleView() {
  const t = useTranslations('schedule');
  const { data, today, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(today);
  const [team, setTeam] = useState('');
  const [branch, setBranch] = useState('');
  const [open, setOpen] = useState<TrainingSession | null>(null);
  const [form, setForm] = useState<{ session?: TrainingSession; date?: string } | null>(null);
  const L = intlLocale(fmt.locale);

  const byDate = useMemo(() => {
    const m = new Map<string, TrainingSession[]>();
    for (const s of data.sessions) {
      if (!visibleTeams.has(s.teamId) || (team && s.teamId !== team)) continue;
      if (branch && lk.teams.get(s.teamId)?.branchId !== branch) continue;
      const d = dateIn(s.startsAt, fmt.timezone);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    m.forEach((list) => list.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    return m;
  }, [data.sessions, visibleTeams, team, branch, lk, fmt.timezone]);

  const move = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir));
    else { const d = new Date(`${cursor.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + dir); setCursor(d.toISOString().slice(0, 10)); }
  };

  const title = view === 'month'
    ? new Intl.DateTimeFormat(L, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cursor}T00:00:00Z`))
    : view === 'week' ? `${fmt.date(weekStart(cursor))} – ${fmt.date(addDays(weekStart(cursor), 6))}` : fmt.date(cursor, 'long');
  const weekdayName = (d: string, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(L, { weekday: style, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

  const chip = (s: TrainingSession, compact = false) => {
    const tm = lk.teams.get(s.teamId);
    return (
      <button key={s.id} onClick={() => setOpen(s)} className={clsx('w-full rounded-lg border-s-[3px] px-2 py-1 text-start text-xs transition hover:brightness-95',
        s.status === 'cancelled' ? 'border-red-400 bg-red-50 text-red-800/70 line-through' : tm?.sport === 'basketball' ? 'border-coral-500 bg-orange-50 text-orange-900' : 'border-navy-700 bg-navy-50 text-navy-900')}>
        <span className="tabular font-semibold">{fmt.time(s.startsAt)}</span> <span className={compact ? 'hidden xl:inline' : ''}>{tm?.name}</span>
      </button>
    );
  };

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('schedule.edit') && <Button variant="primary" onClick={() => setForm({ date: cursor })}><Plus className="size-4" />{t('newSession')}</Button>} />
      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => move(-1)} aria-label={t('previous')}><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
          <Button size="sm" onClick={() => setCursor(today)}>{t('today')}</Button>
          <Button size="sm" variant="ghost" onClick={() => move(1)} aria-label={t('next')}><ChevronRight className="size-4 rtl:rotate-180" /></Button>
          <h2 className="ms-2 text-sm font-semibold sm:text-base">{title}</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-2">
            <Select value={team} onChange={(e) => setTeam(e.target.value)} className="h-9 py-1 sm:w-44"><option value="">{t('allTeams')}</option>{data.teams.filter((x) => visibleTeams.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-9 py-1 sm:w-44"><option value="">{t('allBranches')}</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </div>
          <Segmented value={view} onChange={setView} options={(['month', 'week', 'day'] as const).map((v) => ({ value: v, label: t(`view.${v}`) }))} />
        </div>
      </Card>

      {view === 'month' && (() => {
        const first = `${cursor.slice(0, 7)}-01`;
        const start = weekStart(first);
        const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-surface/70">
              {days.slice(0, 7).map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase text-muted">{weekdayName(d)}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const list = byDate.get(d) ?? [];
                const inMonth = d.slice(0, 7) === cursor.slice(0, 7);
                return (
                  <div key={d} onClick={() => { setCursor(d); setView('day'); }} className={clsx('min-h-20 cursor-pointer border-b border-e border-line p-1.5 transition hover:bg-brand-50/30 sm:min-h-28', !inMonth && 'bg-surface/40')}>
                    <p className={clsx('tabular mb-1 grid size-6 place-items-center rounded-full text-xs', d === today ? 'bg-brand-500 font-semibold text-white' : inMonth ? 'text-ink' : 'text-slate-400')}>{Number(d.slice(8))}</p>
                    <div className="hidden space-y-1 sm:block" onClick={(e) => e.stopPropagation()}>{list.slice(0, 3).map((s) => chip(s, true))}{list.length > 3 && <p className="px-1 text-[11px] text-muted">+{list.length - 3}</p>}</div>
                    {list.length > 0 && <p className="tabular text-[11px] text-muted sm:hidden">{list.length}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {view === 'week' && (() => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i));
        return (
          <div className="grid gap-3 md:grid-cols-7">
            {days.map((d) => (
              <Card key={d} className={clsx('min-h-40 p-2', d === today && 'ring-2 ring-brand-500/40')}>
                <button onClick={() => { setCursor(d); setView('day'); }} className="mb-2 flex w-full items-baseline justify-between px-1 text-start">
                  <span className="text-xs font-semibold uppercase text-muted">{weekdayName(d)}</span>
                  <span className={clsx('tabular text-sm font-semibold', d === today && 'text-brand-700')}>{Number(d.slice(8))}</span>
                </button>
                <div className="space-y-1.5">{(byDate.get(d) ?? []).map((s) => chip(s))}</div>
                {!(byDate.get(d) ?? []).length && <p className="px-1 text-xs text-slate-400">—</p>}
              </Card>
            ))}
          </div>
        );
      })()}

      {view === 'day' && (
        <Card>
          {(byDate.get(cursor) ?? []).length ? (
            <ul className="divide-y divide-line">
              {(byDate.get(cursor) ?? []).map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpen(s)} className="flex w-full items-center gap-4 px-5 py-4 text-start hover:bg-surface/60">
                    <div className="w-20 shrink-0"><p className="tabular text-sm font-semibold">{fmt.time(s.startsAt)}</p><p className="tabular text-xs text-muted">{fmt.time(s.endsAt)}</p></div>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('font-medium', s.status === 'cancelled' && 'text-muted line-through')}>{lk.teams.get(s.teamId)?.name}</p>
                      <p className="truncate text-xs text-muted">{lk.locations.get(s.locationId ?? '')?.name} · {lk.coaches.get(s.coachId ?? '')?.fullName}</p>
                    </div>
                    <SessionStatusBadge status={s.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarDays} title={t('emptyDay')} action={can('schedule.edit') && <Button onClick={() => setForm({ date: cursor })}><Plus className="size-4" />{t('newSession')}</Button>} />}
        </Card>
      )}

      {open && <SessionModal session={data.sessions.find((s) => s.id === open.id) ?? open} onClose={() => setOpen(null)} onEdit={() => { setForm({ session: open }); setOpen(null); }} />}
      {form && <SessionFormModal session={form.session} date={form.date} onClose={() => setForm(null)} />}
    </div>
  );
}

function SessionModal({ session, onClose, onEdit }: { session: TrainingSession; onClose: () => void; onEdit: () => void }) {
  const t = useTranslations('schedule');
  const tc = useTranslations('common');
  const { actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const show = useResultToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const team = lk.teams.get(session.teamId);
  return (
    <Modal open onClose={onClose} size="sm" title={team?.name} description={fmt.date(dateIn(session.startsAt, fmt.timezone), 'long')}
      footer={can('schedule.edit') ? (cancelling
        ? <><Button onClick={() => setCancelling(false)}>{tc('back')}</Button><Button variant="danger" onClick={() => { if (show(actions.setSessionCancelled(session.id, true, reason), 'schedule.cancelled')) onClose(); }}>{t('confirmCancel')}</Button></>
        : <>
          {session.status === 'cancelled'
            ? <Button onClick={() => show(actions.setSessionCancelled(session.id, false), 'schedule.restored')}><RotateCcw className="size-4" />{t('restore')}</Button>
            : <Button variant="danger" onClick={() => setCancelling(true)}><Ban className="size-4" />{t('cancelSession')}</Button>}
          <Button onClick={onEdit}><Pencil className="size-4" />{tc('edit')}</Button>
          <Link href="/attendance" className={buttonClass('primary')}><ClipboardCheck className="size-4" />{t('attendance')}</Link>
        </>) : <Link href="/attendance" className={buttonClass('primary')}><ClipboardCheck className="size-4" />{t('attendance')}</Link>}>
      <dl className="space-y-3 text-sm">
        <div className="flex items-center gap-3"><Clock className="size-4 text-muted" />{fmt.time(session.startsAt)}–{fmt.time(session.endsAt)} <SessionStatusBadge status={session.status} /></div>
        <div className="flex items-center gap-3"><MapPin className="size-4 text-muted" />{lk.locations.get(session.locationId ?? '')?.name ?? '—'} · {lk.branches.get(team?.branchId ?? '')?.name}</div>
        <div className="flex items-center gap-3"><UserRound className="size-4 text-muted" />{lk.coaches.get(session.coachId ?? '')?.fullName ?? '—'}</div>
        {session.cancelReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{t('reason')}: {session.cancelReason}</p>}
        {session.notes && <p className="rounded-lg bg-surface px-3 py-2">{session.notes}</p>}
      </dl>
      {cancelling && <Field label={t('cancelReason')} className="mt-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('cancelPlaceholder')} /></Field>}
    </Modal>
  );
}

function SessionFormModal({ session, date, onClose }: { session?: TrainingSession; date?: string; onClose: () => void }) {
  const t = useTranslations('schedule');
  const tc = useTranslations('common');
  const { data, actions, today } = useStore();
  const fmt = useFmt();
  const show = useResultToast();
  const firstTeam = session?.teamId ?? data.teams[0]?.id ?? '';
  const [v, setV] = useState({
    teamId: firstTeam,
    coachId: session?.coachId ?? data.teamCoaches.find((tc) => tc.teamId === firstTeam && tc.isHead)?.coachId ?? '',
    locationId: session?.locationId ?? '',
    date: session ? dateIn(session.startsAt, fmt.timezone) : date ?? today,
    start: session ? timeIn(session.startsAt, fmt.timezone) : '17:00',
    end: session ? timeIn(session.endsAt, fmt.timezone) : '18:30',
    notes: session?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => {
    const next = { ...s, [k]: e.target.value };
    if (k === 'teamId') next.coachId = data.teamCoaches.find((tc) => tc.teamId === e.target.value && tc.isHead)?.coachId ?? '';
    return next;
  });
  const submit = () => {
    const res = actions.saveSession(v, fmt.timezone, session?.id);
    if (!res.ok) { setErrors(res.fields ?? {}); show(res); return; }
    show(res, 'schedule.saved'); onClose();
  };
  return (
    <Modal open onClose={onClose} title={session ? t('editSession') : t('newSession')} description={t('timezoneHint', { tz: fmt.timezone })}
      footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button variant="primary" onClick={submit}>{tc('save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('team')} error={errors.teamId} required className="sm:col-span-2"><Select value={v.teamId} onChange={set('teamId')}>{data.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label={t('coach')}><Select value={v.coachId} onChange={set('coachId')}><option value="">—</option>{data.coaches.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></Field>
        <Field label={t('location')}><Select value={v.locationId} onChange={set('locationId')}><option value="">—</option>{data.branches.map((b) => <optgroup key={b.id} label={b.name}>{data.locations.filter((l) => l.branchId === b.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}</Select></Field>
        <Field label={t('date')} error={errors.date} required><Input type="date" value={v.date} onChange={set('date')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('start')} error={errors.start}><Input type="time" value={v.start} onChange={set('start')} /></Field>
          <Field label={t('end')} error={errors.end}><Input type="time" value={v.end} onChange={set('end')} invalid={!!errors.end} /></Field>
        </div>
        <Field label={t('notes')} className="sm:col-span-2"><Textarea value={v.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
