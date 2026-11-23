'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Ban, CircleDollarSign, Download, FileText, HandCoins, Plus, Printer, Search, Wallet } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { paymentAllocated, sumByCurrency } from '@/lib/domain/finance';
import { minorToInput } from '@/lib/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireCapability, useCan } from '@/components/shared/guard';
import { useLookups } from '@/components/shared/lookups';
import { useResultToast } from '@/components/shared/result-toast';
import { downloadCSV } from '@/components/shared/csv';
import { RecordPaymentModal } from './record-payment-modal';
import type { Payment, PaymentMethod } from '@/lib/types';

export function PaymentsView() {
  return <RequireCapability cap="finance.view"><Inner /></RequireCapability>;
}

function Inner() {
  const t = useTranslations('payments');
  const tm = useTranslations('enums.paymentMethod');
  const tc = useTranslations('common');
  const params = useSearchParams();
  const router = useRouter();
  const { data, today } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recording, setRecording] = useState(params.get('new') === '1');
  const [receiptId, setReceiptId] = useState<string | null>(params.get('receipt'));
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const month = today.slice(0, 7);

  const rows = useMemo(() => data.payments.filter((p) => {
    if (method && p.method !== method) return false;
    if (from && p.paidOn < from) return false;
    if (to && p.paidOn > to) return false;
    if (q) { const n = q.toLowerCase(); if (!`${p.receiptNumber} ${p.reference ?? ''} ${lk.playerName(p.playerId)}`.toLowerCase().includes(n)) return false; }
    return true;
  }).sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.receiptNumber.localeCompare(a.receiptNumber)), [data.payments, method, from, to, q, lk]);

  const live = data.payments.filter((p) => !p.voidedAt);
  const multi = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => fmt.money(v, c)).join(' · ') || fmt.money(0);
  const invoiceNumbers = (pid: string) => data.allocations.filter((a) => a.paymentId === pid).map((a) => ({ id: a.invoiceId, n: data.invoices.find((i) => i.id === a.invoiceId)?.number }));

  const exportCsv = () => downloadCSV(`payments-${today}.csv`, [
    [t('receipt'), t('date'), t('player'), t('method'), t('reference'), t('currencyCol'), t('amountCol'), t('allocatedTo'), t('statusCol')],
    ...rows.map((p) => [p.receiptNumber, p.paidOn, lk.playerName(p.playerId), tm(p.method), p.reference, p.currency, minorToInput(p.amount, p.currency), invoiceNumbers(p.id).map((x) => x.n).join(' '), p.voidedAt ? tc('voided') : '']),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<>
        <Button onClick={exportCsv}><Download className="size-4" />{t('export')}</Button>
        {can('finance.edit') && <Button variant="primary" onClick={() => setRecording(true)}><Plus className="size-4" />{t('record')}</Button>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label={t('collectedThisMonth')} value={multi(sumByCurrency(live.filter((p) => p.paidOn.startsWith(month)), (p) => p.currency, (p) => p.amount))} icon={CircleDollarSign} tone="green" />
        <StatCard label={t('paymentsThisMonth')} value={fmt.number(live.filter((p) => p.paidOn.startsWith(month)).length)} icon={Wallet} />
        <StatCard label={t('unallocatedCredit')} value={multi(sumByCurrency(live, (p) => p.currency, (p) => p.amount - paymentAllocated(p.id, data.allocations)))} icon={HandCoins} tone="amber" hint={t('unallocatedHint')} />
      </div>
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_160px]">
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="ps-9" /></div>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">{t('allMethods')}</option>{(['cash', 'bank_transfer', 'card', 'cheque', 'mobile_money', 'other'] as PaymentMethod[]).map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('from')} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('to')} />
        </div>
        {rows.length ? (
          <Table>
            <thead><tr><Th>{t('receipt')}</Th><Th>{t('player')}</Th><Th className="hidden md:table-cell">{t('method')}</Th><Th className="hidden lg:table-cell">{t('allocatedTo')}</Th><Th numeric>{t('amountCol')}</Th><Th className="w-24" /></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((p) => (
                <Tr key={p.id} className={p.voidedAt ? 'opacity-60' : ''}>
                  <Td><p className="tabular font-medium">{p.receiptNumber}</p><p className="text-xs text-muted">{fmt.date(p.paidOn)}</p></Td>
                  <Td>{lk.playerName(p.playerId)}{p.voidedAt && <span className="ms-2"><Badge tone="gray">{tc('voided')}</Badge></span>}</Td>
                  <Td className="hidden md:table-cell"><p>{tm(p.method)}</p>{p.reference && <p className="text-xs text-muted">{p.reference}</p>}</Td>
                  <Td className="hidden lg:table-cell"><div className="flex flex-wrap gap-1">{invoiceNumbers(p.id).map((x) => <Link key={x.id} href={`/invoices/${x.id}`} className="tabular rounded bg-surface px-1.5 py-0.5 text-xs hover:bg-brand-50">{x.n}</Link>)}</div></Td>
                  <Td numeric className={p.voidedAt ? 'line-through' : 'font-semibold text-brand-700'}>{fmt.money(p.amount, p.currency)}</Td>
                  <Td><div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setReceiptId(p.id)} aria-label={t('receipt')}><FileText className="size-4" /></Button>
                    {can('finance.edit') && !p.voidedAt && <Button size="sm" variant="ghost" onClick={() => setVoiding(p)} aria-label={t('void')}><Ban className="size-4" /></Button>}
                  </div></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState icon={Wallet} title={t('empty')} />}
      </Card>
      {recording && <RecordPaymentModal onClose={() => { setRecording(false); if (params.get('new')) router.replace('/payments'); }} onSaved={(id) => setReceiptId(id)} />}
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}
      {voiding && <VoidModal payment={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function ReceiptModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const t = useTranslations('payments');
  const tm = useTranslations('enums.paymentMethod');
  const { data } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const p = data.payments.find((x) => x.id === paymentId);
  if (!p) return null;
  const allocs = data.allocations.filter((a) => a.paymentId === p.id);
  const unallocated = p.amount - allocs.reduce((s, a) => s + a.amount, 0);
  const print = () => {
    const el = document.getElementById('receipt-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    w.document.write(`<html dir="${document.dir}"><head><title>${p.receiptNumber}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#142B45}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #e4e8ee}.r{text-align:end}.big{font-size:28px;font-weight:700}.muted{color:#64748b;font-size:13px}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Modal open onClose={onClose} title={t('receiptTitle')} footer={<Button variant="navy" onClick={print}><Printer className="size-4" />{t('printReceipt')}</Button>}>
      <div id="receipt-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }} className="flex justify-between">
          <div><p className="font-semibold">{data.academy.name}</p><p className="muted text-sm text-muted">{t('receiptTitle')}</p></div>
          <div className="r text-end"><p className="tabular font-semibold">{p.receiptNumber}</p><p className="muted text-sm text-muted">{fmt.date(p.paidOn)}</p></div>
        </div>
        <div className="my-6 rounded-xl bg-brand-50 p-5 text-center">
          <p className="muted text-xs text-muted">{t('amountReceived')}</p>
          <p className="big tabular text-3xl font-bold text-brand-700">{fmt.money(p.amount, p.currency)}</p>
          {p.voidedAt && <p className="mt-1 text-sm font-semibold text-red-600">{t('voidedReceipt', { reason: p.voidReason ?? '' })}</p>}
        </div>
        <table className="w-full text-sm"><tbody>
          <tr><td className="py-1.5 text-muted">{t('receivedFrom')}</td><td className="r text-end font-medium">{lk.playerName(p.playerId)} · {lk.players.get(p.playerId)?.code}</td></tr>
          <tr><td className="py-1.5 text-muted">{t('method')}</td><td className="r text-end">{tm(p.method)}</td></tr>
          {p.reference && <tr><td className="py-1.5 text-muted">{t('reference')}</td><td className="r text-end">{p.reference}</td></tr>}
          {allocs.map((a) => <tr key={a.id}><td className="py-1.5 text-muted">{t('appliedTo', { n: data.invoices.find((i) => i.id === a.invoiceId)?.number ?? '' })}</td><td className="r tabular text-end">{fmt.money(a.amount, p.currency)}</td></tr>)}
          {unallocated > 0 && <tr><td className="py-1.5 text-muted">{t('unallocated')}</td><td className="r tabular text-end">{fmt.money(unallocated, p.currency)}</td></tr>}
          <tr><td className="py-1.5 text-muted">{t('receivedBy')}</td><td className="r text-end">{lk.users.get(p.receivedBy)?.fullName}</td></tr>
        </tbody></table>
      </div>
    </Modal>
  );
}

function VoidModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const { actions } = useStore();
  const fmt = useFmt();
  const show = useResultToast();
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onClose} size="sm" title={t('voidTitle', { n: payment.receiptNumber })} description={t('voidHint')}
      footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button variant="danger" onClick={() => { if (show(actions.voidPayment(payment, reason), 'payments.voided')) onClose(); }}>{t('void')}</Button></>}>
      <p className="mb-4 text-sm">{t('voidAmount', { amount: fmt.money(payment.amount, payment.currency) })}</p>
      <Field label={t('voidReason')} required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('voidPlaceholder')} /></Field>
    </Modal>
  );
}
