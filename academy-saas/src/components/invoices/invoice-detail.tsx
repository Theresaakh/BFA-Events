'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Ban, FileX, HandCoins, Printer, Send } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { lineAmount } from '@/lib/domain/finance';
import { Card, CardHeader } from '@/components/ui/card';
import { Button, buttonClass } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { PaymentStatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { RequireCapability, useCan } from '@/components/shared/guard';
import { useLookups } from '@/components/shared/lookups';
import { useResultToast } from '@/components/shared/result-toast';
import { RecordPaymentModal } from '@/components/payments/record-payment-modal';

export function InvoiceDetail({ id }: { id: string }) {
  return <RequireCapability cap="finance.view"><Inner id={id} /></RequireCapability>;
}

function Inner({ id }: { id: string }) {
  const t = useTranslations('invoices');
  const tc = useTranslations('common');
  const tch = useTranslations('enums.charge');
  const tm = useTranslations('enums.paymentMethod');
  const { data, actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const show = useResultToast();
  const balances = useInvoiceBalances();
  const [paying, setPaying] = useState(false);
  const inv = data.invoices.find((i) => i.id === id);
  if (!inv) return <Card><EmptyState icon={FileX} title={t('notFound')} action={<Link href="/invoices" className={buttonClass('secondary')}>{t('backToList')}</Link>} /></Card>;

  const b = balances.get(inv.id)!;
  const player = lk.players.get(inv.playerId);
  const guardian = data.contacts.find((c) => c.playerId === inv.playerId && c.kind === 'guardian' && c.isPrimary);
  const allocations = data.allocations.filter((a) => a.invoiceId === inv.id).map((a) => ({ a, p: data.payments.find((p) => p.id === a.paymentId)! })).sort((x, y) => x.p.paidOn.localeCompare(y.p.paidOn));

  return (
    <div>
      <Link href="/invoices" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" />{t('backToList')}</Link>
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><h1 className="tabular text-2xl font-semibold">{inv.number}</h1><PaymentStatusBadge status={b.status} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}><Printer className="size-4" />{t('print')}</Button>
          {can('finance.edit') && inv.status === 'draft' && <Button variant="navy" onClick={() => show(actions.issueInvoice(inv), 'invoices.issued')}><Send className="size-4" />{t('issue')}</Button>}
          {can('finance.edit') && inv.status !== 'void' && b.paid === 0 && <Button variant="danger" onClick={() => show(actions.voidInvoice(inv, data), 'invoices.voided')}><Ban className="size-4" />{t('void')}</Button>}
          {can('finance.edit') && inv.status === 'issued' && b.balance > 0 && <Button variant="primary" onClick={() => setPaying(true)}><HandCoins className="size-4" />{t('recordPayment')}</Button>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <p className="text-lg font-semibold">{data.academy.name}</p>
              <p className="mt-1 text-sm text-muted">{data.branches[0]?.address}, {data.branches[0]?.city}</p>
            </div>
            <div className="sm:text-end">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">{t('invoice')}</p>
              <p className="tabular text-lg font-semibold">{inv.number}</p>
              {inv.status !== 'issued' && <Badge tone="gray">{inv.status === 'draft' ? t('draftLabel') : t('voidLabel')}</Badge>}
            </div>
          </div>
          <div className="mt-8 grid gap-6 border-y border-line py-5 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted">{t('billTo')}</p><p className="mt-1 font-medium">{player ? `${player.firstName} ${player.lastName}` : '—'}</p><p className="text-muted">{player?.code}</p>{guardian && <p className="mt-1 text-muted">{guardian.fullName}</p>}</div>
            <div><p className="text-xs text-muted">{t('issueDate')}</p><p className="mt-1 font-medium">{fmt.date(inv.issueDate)}</p></div>
            <div><p className="text-xs text-muted">{t('dueDate')}</p><p className={`mt-1 font-medium ${b.status === 'overdue' ? 'text-red-600' : ''}`}>{fmt.date(inv.dueDate)}</p></div>
          </div>
          <Table className="mt-4">
            <thead><tr><Th>{tc('description')}</Th><Th className="hidden sm:table-cell">{t('chargeType')}</Th><Th numeric>{t('qty')}</Th><Th numeric>{t('unitPrice')}</Th><Th numeric>{tc('amount')}</Th></tr></thead>
            <tbody>{inv.lines.map((l) => (
              <Tr key={l.id}><Td className="font-medium">{l.description}</Td><Td className="hidden text-muted sm:table-cell">{tch(l.chargeType)}</Td><Td numeric>{l.quantity}</Td><Td numeric>{fmt.money(l.unitAmount, inv.currency)}</Td><Td numeric>{fmt.money(lineAmount(l.quantity, l.unitAmount), inv.currency)}</Td></Tr>
            ))}</tbody>
          </Table>
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t('total')}</dt><dd className="tabular font-medium">{fmt.money(b.total, inv.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t('paid')}</dt><dd className="tabular font-medium text-brand-700">− {fmt.money(b.paid, inv.currency)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-semibold">{t('balanceDue')}</dt><dd className="tabular font-semibold">{fmt.money(b.balance, inv.currency)}</dd></div>
            </dl>
          </div>
          {inv.notes && <p className="mt-6 rounded-lg bg-surface px-4 py-3 text-sm text-muted">{inv.notes}</p>}
        </Card>

        <div className="no-print space-y-6">
          <Card>
            <CardHeader title={t('paymentHistory')} subtitle={t('balanceExplained')} />
            {allocations.length ? (
              <ul className="divide-y divide-line">
                {allocations.map(({ a, p }) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <Link href={`/payments?receipt=${p.id}`} className="tabular text-sm font-medium hover:text-brand-700">{p.receiptNumber}</Link>
                      <p className="text-xs text-muted">{fmt.date(p.paidOn)} · {tm(p.method)}{p.reference && ` · ${p.reference}`}</p>
                      {p.voidedAt && <Badge tone="gray">{tc('voided')}</Badge>}
                    </div>
                    <span className={`tabular text-sm font-semibold ${p.voidedAt ? 'text-muted line-through' : 'text-brand-700'}`}>{fmt.money(a.amount, inv.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-muted">{t('noPayments')}</p>}
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted">{t('player')}</p>
            {player && <Link href={`/players/${player.id}`} className="mt-1 block font-medium hover:text-brand-700">{player.firstName} {player.lastName}</Link>}
            {guardian?.phone && <p className="mt-1 text-sm text-muted" dir="ltr">{guardian.phone}</p>}
          </Card>
        </div>
      </div>
      {paying && <RecordPaymentModal playerId={inv.playerId} invoiceId={inv.id} onClose={() => setPaying(false)} />}
    </div>
  );
}
