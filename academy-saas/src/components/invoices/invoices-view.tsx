'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Download, Plus, Receipt, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { invoiceTotal, sumByCurrency } from '@/lib/domain/finance';
import { minorToInput } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { PaymentStatusBadge } from '@/components/ui/status';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireCapability, useCan } from '@/components/shared/guard';
import { useLookups } from '@/components/shared/lookups';
import { downloadCSV } from '@/components/shared/csv';
import { AlertTriangle, CircleDollarSign, HandCoins } from 'lucide-react';
import { InvoiceFormModal } from './invoice-form-modal';
import type { ChargeType, PaymentStatus } from '@/lib/types';

type Filter = 'all' | 'open' | PaymentStatus;

export function InvoicesView() {
  return <RequireCapability cap="finance.view"><InvoicesInner /></RequireCapability>;
}

function InvoicesInner() {
  const t = useTranslations('invoices');
  const tps = useTranslations('enums.paymentStatus');
  const tch = useTranslations('enums.charge');
  const params = useSearchParams();
  const router = useRouter();
  const { data, today } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const balances = useInvoiceBalances();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [charge, setCharge] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');

  const months = useMemo(() => [...new Set(data.invoices.map((i) => i.issueDate.slice(0, 7)))].sort().reverse(), [data.invoices]);
  const base = useMemo(() => data.invoices.filter((i) => {
    if (month && !i.issueDate.startsWith(month)) return false;
    if (charge && !i.lines.some((l) => l.chargeType === charge)) return false;
    if (q) { const n = q.toLowerCase(); if (!`${i.number} ${lk.playerName(i.playerId)} ${lk.players.get(i.playerId)?.code}`.toLowerCase().includes(n)) return false; }
    return true;
  }), [data.invoices, month, charge, q, lk]);
  const matches = (f: Filter, s: PaymentStatus) => f === 'all' || (f === 'open' ? ['unpaid', 'partially_paid', 'overdue'].includes(s) : s === f);
  const rows = base.filter((i) => matches(filter, balances.get(i.id)!.status)).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

  const issued = base.filter((i) => i.status === 'issued');
  const totals = {
    invoiced: sumByCurrency(issued, (i) => i.currency, (i) => invoiceTotal(i)),
    paid: sumByCurrency(issued, (i) => i.currency, (i) => balances.get(i.id)!.paid),
    outstanding: sumByCurrency(issued, (i) => i.currency, (i) => Math.max(0, balances.get(i.id)!.balance)),
    overdue: sumByCurrency(issued.filter((i) => balances.get(i.id)!.status === 'overdue'), (i) => i.currency, (i) => balances.get(i.id)!.balance),
  };
  const multi = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => fmt.money(v, c)).join(' · ') || fmt.money(0);
  const filters: Filter[] = ['all', 'open', 'overdue', 'partially_paid', 'unpaid', 'paid', 'draft', 'void'];

  const exportCsv = () => downloadCSV(`invoices-${today}.csv`, [
    [t('number'), t('player'), t('issueDate'), t('dueDate'), t('currency'), t('total'), t('paid'), t('balance'), t('status')],
    ...rows.map((i) => { const b = balances.get(i.id)!; return [i.number, lk.playerName(i.playerId), i.issueDate, i.dueDate, i.currency, minorToInput(b.total, i.currency), minorToInput(b.paid, i.currency), minorToInput(b.balance, i.currency), tps(b.status)]; }),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<>
        <Button onClick={exportCsv}><Download className="size-4" />{t('export')}</Button>
        {can('finance.edit') && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" />{t('new')}</Button>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('totalInvoiced')} value={multi(totals.invoiced)} icon={Receipt} />
        <StatCard label={t('totalPaid')} value={multi(totals.paid)} icon={CircleDollarSign} tone="green" />
        <StatCard label={t('outstanding')} value={multi(totals.outstanding)} icon={HandCoins} tone="amber" />
        <StatCard label={t('overdue')} value={multi(totals.overdue)} icon={AlertTriangle} tone="red" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="ps-9" /></div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="sm:w-44"><option value="">{t('allMonths')}</option>{months.map((m) => <option key={m} value={m}>{new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))}</option>)}</Select>
            <Select value={charge} onChange={(e) => setCharge(e.target.value)} className="sm:w-44"><option value="">{t('allCharges')}</option>{(['membership', 'registration', 'tournament', 'camp', 'trip', 'custom'] as ChargeType[]).map((c) => <option key={c} value={c}>{tch(c)}</option>)}</Select>
          </div>
        </div>
        <div className="border-b border-line px-4 py-3">
          <Segmented value={filter} onChange={setFilter} options={filters.map((f) => ({ value: f, label: f === 'all' || f === 'open' ? t(`filter.${f}`) : tps(f), count: base.filter((i) => matches(f, balances.get(i.id)!.status)).length }))} />
        </div>
        {rows.length ? (
          <Table>
            <thead><tr><Th>{t('number')}</Th><Th>{t('player')}</Th><Th className="hidden md:table-cell">{t('issueDate')}</Th><Th className="hidden md:table-cell">{t('dueDate')}</Th><Th numeric>{t('total')}</Th><Th numeric className="hidden lg:table-cell">{t('paid')}</Th><Th numeric>{t('balance')}</Th><Th>{t('status')}</Th></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((i) => {
                const b = balances.get(i.id)!;
                return (
                  <Tr key={i.id} onClick={() => router.push(`/invoices/${i.id}`)}>
                    <Td className="tabular font-medium">{i.number}<p className="text-xs font-normal text-muted">{tch(i.lines[0].chargeType)}{i.lines.length > 1 && ` +${i.lines.length - 1}`}</p></Td>
                    <Td>{lk.playerName(i.playerId)}</Td>
                    <Td className="hidden text-muted md:table-cell">{fmt.date(i.issueDate)}</Td>
                    <Td className={`hidden md:table-cell ${b.status === 'overdue' ? 'font-medium text-red-600' : 'text-muted'}`}>{fmt.date(i.dueDate)}</Td>
                    <Td numeric>{fmt.money(b.total, i.currency)}</Td>
                    <Td numeric className="hidden text-brand-700 lg:table-cell">{fmt.money(b.paid, i.currency)}</Td>
                    <Td numeric className="font-semibold">{fmt.money(b.balance, i.currency)}</Td>
                    <Td><PaymentStatusBadge status={b.status} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState icon={Receipt} title={t('empty')} />}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">{t('showing', { n: Math.min(rows.length, 300), total: rows.length })}</p>
      </Card>
      {creating && <InvoiceFormModal playerId={params.get('player') ?? undefined} onClose={() => { setCreating(false); if (params.get('new')) router.replace('/invoices'); }} onSaved={(id) => router.push(`/invoices/${id}`)} />}
    </div>
  );
}
