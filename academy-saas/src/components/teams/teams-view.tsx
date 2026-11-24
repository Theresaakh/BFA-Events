'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Pencil, Plus, Search, Shield, UserRound, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { ageOn } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ProgressBar } from '@/components/ui/charts';
import { EmptyState } from '@/components/ui/empty-state';
import { PlayerStatusBadge } from '@/components/ui/status';
import { useLookups } from '@/components/shared/lookups';
import { useCan } from '@/components/shared/guard';
import { useResultToast } from '@/components/shared/result-toast';
import type { Team } from '@/lib/types';

export function TeamsView() {
  const t = useTranslations('teams');
  const tsp = useTranslations('enums.sport');
  const { data, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const [tab, setTab] = useState<'teams' | 'coaches'>('teams');
  const [sport, setSport] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [rosterOf, setRosterOf] = useState<Team | null>(null);

  const attendanceRate = useMemo(() => {
    const bySession = new Map(data.sessions.map((s) => [s.id, s.teamId]));
    const m = new Map<string, { p: number; n: number }>();
    for (const a of data.attendance) {
      const teamId = bySession.get(a.sessionId);
      if (!teamId) continue;
      const x = m.get(teamId) ?? { p: 0, n: 0 };
      x.n += 1; if (a.status === 'present') x.p += 1;
      m.set(teamId, x);
    }
    return m;
  }, [data.attendance, data.sessions]);

  const teams = data.teams.filter((x) => visibleTeams.has(x.id) && (!sport || x.sport === sport) && (!branch || x.branchId === branch));

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('teams.edit') && tab === 'teams' && <Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" />{t('newTeam')}</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'teams', label: t('tabTeams'), count: teams.length }, { value: 'coaches', label: t('tabCoaches'), count: data.coaches.length }]} />
        {tab === 'teams' && (
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select value={sport} onChange={(e) => setSport(e.target.value)} className="sm:w-40"><option value="">{t('allSports')}</option>{(['football', 'basketball'] as const).map((s) => <option key={s} value={s}>{tsp(s)}</option>)}</Select>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="sm:w-48"><option value="">{t('allBranches')}</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </div>
        )}
      </div>

      {tab === 'teams' ? (
        teams.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => {
              const roster = lk.rosterOf.get(team.id) ?? [];
              const coaches = (lk.coachesOfTeam.get(team.id) ?? []).map((id) => lk.coaches.get(id)?.fullName).filter(Boolean);
              const att = attendanceRate.get(team.id);
              const rate = att && att.n ? att.p / att.n : 0;
              return (
                <Card key={team.id} className="lift flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-10 place-items-center rounded-xl text-white ${team.sport === 'football' ? 'bg-navy-900 text-volt-400' : 'bg-coral-500'}`}><Shield className="size-5" /></span>
                      <div><p className="font-semibold">{team.name}</p><p className="text-xs text-muted">{[team.ageGroup, team.category, team.season].filter(Boolean).join(' · ')}</p></div>
                    </div>
                    <Badge tone={team.sport === 'football' ? 'navy' : 'violet'} dot={false}>{tsp(team.sport)}</Badge>
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted"><MapPin className="size-4" />{lk.branches.get(team.branchId ?? '')?.name ?? '—'}</div>
                    <div className="flex items-center gap-2 text-muted"><UserRound className="size-4" /><span className="truncate">{coaches.join(', ') || t('noCoach')}</span></div>
                    <div className="flex items-center gap-2 text-muted"><Users className="size-4" />{t('playersCount', { n: roster.length })}</div>
                  </dl>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{t('attendance')}</span><span className="tabular font-medium">{att ? fmt.percent(rate) : '—'}</span></div>
                    <ProgressBar value={rate} tone={rate >= 0.8 ? 'green' : rate >= 0.6 ? 'amber' : 'red'} />
                  </div>
                  <div className="mt-5 flex gap-2 border-t border-line pt-4">
                    <Button size="sm" className="flex-1" onClick={() => setRosterOf(team)}><Users className="size-4" />{t('roster')}</Button>
                    {can('teams.edit') && <Button size="sm" variant="ghost" onClick={() => setEditing(team)}><Pencil className="size-4" />{t('edit')}</Button>}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : <Card><EmptyState icon={Shield} title={t('empty')} /></Card>
      ) : (
        <Card>
          <Table>
            <thead><tr><Th>{t('coach')}</Th><Th>{t('teamsCol')}</Th><Th className="hidden md:table-cell">{t('branch')}</Th><Th className="hidden lg:table-cell">{t('contact')}</Th><Th>{t('login')}</Th></tr></thead>
            <tbody>
              {data.coaches.map((c) => {
                const ts = data.teamCoaches.filter((tc) => tc.coachId === c.id).map((tc) => lk.teams.get(tc.teamId)?.name).filter(Boolean);
                const hasLogin = data.users.some((u) => u.coachId === c.id);
                return (
                  <Tr key={c.id}>
                    <Td><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{c.fullName.split(' ').map((x) => x[0]).join('')}</span><span className="font-medium">{c.fullName}</span></div></Td>
                    <Td><div className="flex flex-wrap gap-1">{ts.length ? ts.map((n) => <Badge key={n} tone="navy" dot={false}>{n}</Badge>) : <span className="text-muted">—</span>}</div></Td>
                    <Td className="hidden text-muted md:table-cell">{lk.branches.get(c.branchId ?? '')?.name}</Td>
                    <Td className="hidden lg:table-cell"><p className="text-sm">{c.email}</p><p className="text-xs text-muted" dir="ltr">{c.phone}</p></Td>
                    <Td>{hasLogin ? <Badge tone="green">{t('hasLogin')}</Badge> : <Badge tone="gray">{t('noLogin')}</Badge>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {editing && <TeamFormModal team={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {rosterOf && <RosterModal team={rosterOf} onClose={() => setRosterOf(null)} />}
    </div>
  );
}

function TeamFormModal({ team, onClose }: { team?: Team; onClose: () => void }) {
  const t = useTranslations('teams');
  const tc = useTranslations('common');
  const tsp = useTranslations('enums.sport');
  const { data, actions } = useStore();
  const show = useResultToast();
  const [v, setV] = useState({
    name: team?.name ?? '', sport: team?.sport ?? 'football', ageGroup: team?.ageGroup ?? '', category: team?.category ?? '',
    season: team?.season ?? '', branchId: team?.branchId ?? data.branches[0]?.id ?? '',
  });
  const [coachIds, setCoachIds] = useState<string[]>(team ? data.teamCoaches.filter((tc) => tc.teamId === team.id).sort((a, b) => Number(b.isHead) - Number(a.isHead)).map((tc) => tc.coachId) : []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = () => {
    const res = actions.saveTeam({ ...v, coachIds }, team?.id);
    if (!res.ok) { setErrors(res.fields ?? {}); show(res); return; }
    show(res, 'teams.saved'); onClose();
  };
  return (
    <Modal open onClose={onClose} title={team ? t('editTeam') : t('newTeam')} footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button variant="primary" onClick={submit}>{tc('save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('name')} error={errors.name} required className="sm:col-span-2"><Input value={v.name} onChange={set('name')} placeholder="Football U12" /></Field>
        <Field label={t('sport')}><Select value={v.sport} onChange={set('sport')}>{(['football', 'basketball'] as const).map((s) => <option key={s} value={s}>{tsp(s)}</option>)}</Select></Field>
        <Field label={t('branch')}><Select value={v.branchId} onChange={set('branchId')}>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label={t('ageGroup')}><Input value={v.ageGroup} onChange={set('ageGroup')} placeholder="U12" /></Field>
        <Field label={t('category')}><Input value={v.category} onChange={set('category')} placeholder={t('categoryPlaceholder')} /></Field>
        <Field label={t('season')}><Input value={v.season} onChange={set('season')} placeholder="2026/27" /></Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-medium text-slate-600">{t('coaches')} <span className="font-normal text-muted">— {t('firstIsHead')}</span></p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.coaches.filter((c) => c.active).map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface">
                <input type="checkbox" className="size-4 accent-brand-500" checked={coachIds.includes(c.id)} onChange={(e) => setCoachIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                {c.fullName}{coachIds[0] === c.id && <Badge tone="green" dot={false}>{t('head')}</Badge>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RosterModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const t = useTranslations('teams');
  const tc = useTranslations('common');
  const { data, today, actions } = useStore();
  const lk = useLookups();
  const can = useCan();
  const show = useResultToast();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const current = lk.rosterOf.get(team.id) ?? [];
  const [selected, setSelected] = useState<string[]>(current);
  const players = data.players.filter((p) => p.status !== 'archived');
  const shown = editing
    ? players.filter((p) => `${p.firstName} ${p.lastName} ${p.code}`.toLowerCase().includes(q.toLowerCase()))
    : players.filter((p) => current.includes(p.id));
  return (
    <Modal open onClose={onClose} size="lg" title={`${team.name} — ${t('roster')}`} description={t('playersCount', { n: current.length })}
      footer={editing
        ? <><Button onClick={() => { setEditing(false); setSelected(current); }}>{tc('cancel')}</Button><Button variant="primary" onClick={() => { if (show(actions.setTeamPlayers(team.id, selected), 'teams.rosterSaved')) onClose(); }}>{t('saveRoster', { n: selected.length })}</Button></>
        : can('teams.edit') ? <Button variant="navy" onClick={() => setEditing(true)}><Users className="size-4" />{t('manageRoster')}</Button> : undefined}>
      {editing && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlayers')} className="ps-9" />
        </div>
      )}
      {shown.length ? (
        <Table>
          <thead><tr>{editing && <Th className="w-10" />}<Th>{t('player')}</Th><Th>{t('age')}</Th><Th>{t('otherTeams')}</Th><Th>{tc('status')}</Th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <Tr key={p.id}>
                {editing && <Td><input type="checkbox" className="size-4 accent-brand-500" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} /></Td>}
                <Td><Link href={`/players/${p.id}`} className="font-medium hover:text-brand-700">{p.firstName} {p.lastName}</Link><p className="tabular text-xs text-muted">{p.code}</p></Td>
                <Td className="tabular">{ageOn(p.dateOfBirth, today) ?? '—'}</Td>
                <Td className="text-xs text-muted">{(lk.teamsOfPlayer.get(p.id) ?? []).filter((x) => x.id !== team.id).map((x) => x.name).join(', ') || '—'}</Td>
                <Td><PlayerStatusBadge status={p.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState icon={Users} title={t('emptyRoster')} />}
    </Modal>
  );
}
