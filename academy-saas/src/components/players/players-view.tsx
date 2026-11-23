'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Download, Plus, Search, Upload, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { ageOn } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { PlayerStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { useLookups } from '@/components/shared/lookups';
import { useCan } from '@/components/shared/guard';
import { downloadCSV } from '@/components/shared/csv';
import { PlayerFormModal } from './player-form';
import { ImportPlayersModal } from './import-modal';

type Filter = 'current' | 'active' | 'trial' | 'inactive' | 'archived' | 'all';

export function PlayersView() {
  const t = useTranslations('players');
  const ts = useTranslations('enums.playerStatus');
  const tsp = useTranslations('enums.sport');
  const params = useSearchParams();
  const router = useRouter();
  const { data, today, visiblePlayers, visibleTeams } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const balances = useInvoiceBalances();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('current');
  const [team, setTeam] = useState('');
  const [sport, setSport] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const showMoney = can('finance.view');

  const balanceOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of data.invoices) {
      if (inv.status !== 'issued' || inv.currency !== data.academy.currency) continue;
      m.set(inv.playerId, (m.get(inv.playerId) ?? 0) + Math.max(0, balances.get(inv.id)!.balance));
    }
    return m;
  }, [data.invoices, data.academy.currency, balances]);

  const guardianOf = useMemo(() => new Map(data.contacts.filter((c) => c.kind === 'guardian' && c.isPrimary).map((c) => [c.playerId, c])), [data.contacts]);

  const base = data.players.filter((p) => visiblePlayers.has(p.id) || (filter === 'archived' && p.status === 'archived' && can('players.viewAll')));
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base.filter((p) => {
      if (filter === 'current' && p.status === 'archived') return false;
      if (filter !== 'current' && filter !== 'all' && p.status !== filter) return false;
      const teams = lk.teamsOfPlayer.get(p.id) ?? [];
      if (team && !teams.some((x) => x.id === team)) return false;
      if (sport && !teams.some((x) => x.sport === sport)) return false;
      if (!needle) return true;
      const g = guardianOf.get(p.id);
      return `${p.firstName} ${p.lastName} ${p.code} ${g?.fullName ?? ''} ${g?.phone ?? ''}`.toLowerCase().includes(needle);
    }).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [base, q, filter, team, sport, lk, guardianOf]);

  const count = (f: Filter) => base.filter((p) => f === 'all' ? true : f === 'current' ? p.status !== 'archived' : p.status === f).length;

  const exportCsv = () => downloadCSV(`players-${today}.csv`, [
    [t('code'), t('firstName'), t('lastName'), t('dateOfBirth'), t('team'), t('status'), t('registrationDate'), ...(can('contacts.view') ? [t('guardian'), t('phone')] : [])],
    ...rows.map((p) => [p.code, p.firstName, p.lastName, p.dateOfBirth, (lk.teamsOfPlayer.get(p.id) ?? []).map((x) => x.name).join(' / '), ts(p.status), p.registrationDate,
      ...(can('contacts.view') ? [guardianOf.get(p.id)?.fullName, guardianOf.get(p.id)?.phone] : [])]),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle', { n: count('current') })} actions={<>
        <Button onClick={exportCsv}><Download className="size-4" />{t('export')}</Button>
        {can('players.import') && <Button onClick={() => setImporting(true)}><Upload className="size-4" />{t('importCsv')}</Button>}
        {can('players.edit') && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />{t('addPlayer')}</Button>}
      </>} />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="ps-9" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select value={team} onChange={(e) => setTeam(e.target.value)} className="sm:w-48"><option value="">{t('allTeams')}</option>{data.teams.filter((x) => visibleTeams.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            <Select value={sport} onChange={(e) => setSport(e.target.value)} className="sm:w-40"><option value="">{t('allSports')}</option>{(['football', 'basketball'] as const).map((s) => <option key={s} value={s}>{tsp(s)}</option>)}</Select>
          </div>
        </div>
        <div className="border-b border-line px-4 py-3">
          <Segmented value={filter} onChange={setFilter} options={(['current', 'active', 'trial', 'inactive', 'archived', 'all'] as Filter[]).map((f) => ({ value: f, label: f === 'current' || f === 'all' ? t(`filter.${f}`) : ts(f), count: count(f) }))} />
        </div>
        {rows.length ? (
          <Table>
            <thead><tr>
              <Th>{t('player')}</Th><Th className="hidden md:table-cell">{t('code')}</Th><Th>{t('team')}</Th>
              <Th className="hidden lg:table-cell">{t('registrationDate')}</Th>{can('contacts.view') && <Th className="hidden xl:table-cell">{t('guardian')}</Th>}
              <Th>{t('status')}</Th>{showMoney && <Th numeric>{t('balance')}</Th>}
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const teams = lk.teamsOfPlayer.get(p.id) ?? [];
                const g = guardianOf.get(p.id);
                const bal = balanceOf.get(p.id) ?? 0;
                const age = ageOn(p.dateOfBirth, today);
                return (
                  <Tr key={p.id} onClick={() => router.push(`/players/${p.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800">{p.firstName[0]}{p.lastName[0]}</span>
                        <div className="min-w-0"><p className="truncate font-medium">{p.firstName} {p.lastName}</p><p className="text-xs text-muted">{age !== undefined ? t('age', { n: age }) : '—'}<span className="md:hidden"> · {p.code}</span></p></div>
                      </div>
                    </Td>
                    <Td className="tabular hidden text-muted md:table-cell">{p.code}</Td>
                    <Td>{teams.length ? <div className="flex flex-wrap gap-1">{teams.map((x) => <Badge key={x.id} tone={x.sport === 'football' ? 'navy' : 'violet'} dot={false}>{x.name}</Badge>)}</div> : <span className="text-muted">—</span>}</Td>
                    <Td className="hidden text-muted lg:table-cell">{fmt.date(p.registrationDate)}</Td>
                    {can('contacts.view') && <Td className="hidden xl:table-cell"><p className="text-sm">{g?.fullName ?? '—'}</p><p className="text-xs text-muted" dir="ltr">{g?.phone}</p></Td>}
                    <Td><PlayerStatusBadge status={p.status} /></Td>
                    {showMoney && <Td numeric className={bal > 0 ? 'font-medium text-amber-700' : 'text-muted'}>{fmt.money(bal)}</Td>}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState icon={Users} title={t('emptyTitle')} description={t('emptyText')} />}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">{t('showing', { n: rows.length })}</p>
      </Card>

      <PlayerFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/players/${id}`)} />
      <ImportPlayersModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
