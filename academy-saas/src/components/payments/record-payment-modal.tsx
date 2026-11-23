'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { PaymentStatusBadge } from '@/components/ui/status';
import { useFmt, useInvoiceBalances, useStore } from '@/lib/store/academy-store';
import { parseMoneyInput, suggestAllocations } from '@/lib/domain/finance';
import { currencyDigits, minorToInput } from '@/lib/format';
import { useResultToast } from '@/components/shared/result-toast';
import { useLookups } from '@/components/shared/lookups';
import type { PaymentMethod } from '@/lib/types';

const METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'card', 'cheque', 'mobile_money', 'other'];

export function RecordPaymentModal({ onClose, playerId: initialPlayer, invoiceId, onSaved }: { onClose: () => void; playerId?: string; invoiceId?: string; onSaved?: (id: string) => void }) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const tm = useTranslations('enums.paymentMethod');
  const tAll = useTranslations();
  const { data, today, actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const show = useResultToast();
  const balances = useInvoiceBalances();
  const currency = data.academy.currency;
  const digits = currencyDigits(currency);

  const [playerId, setPlayerId] = useState(initialPlayer ?? '');
  const openInvoices = useMemo(() => data.invoices
    .filter((i) => i.playerId === playerId && i.status === 'issued' && i.currency === currency && balances.get(i.id)!.balance > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [data.invoices, playerId, currency, balances]);
  const initialAmount = invoiceId ? balances.get(invoiceId)?.balance ?? 0 : 0;
  const [amountText, setAmountText] = useState(initialAmount ? minorToInput(initialAmount, currency) : '');
  const [alloc, setAlloc] = useState<Record<string, string>>(invoiceId && initialAmount ? { [invoiceId]: minorToInput(initialAmount, currency) } : {});
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const amount = parseMoneyInput(amountText, digits);
  const allocations = Object.entries(alloc).map(([id, v]) => ({ invoiceId: id, amount: parseMoneyInput(v, digits) ?? NaN })).filter((a) => a.amount !== 0 && !(Number.isNaN(a.amount) && alloc[a.invoiceId] === ''));
  const allocated = allocations.reduce((s, a) => s + (Number.isNaN(a.amount) ? 0 : a.amount), 0);
  const unallocated = (amount ?? 0) - allocated;

  const autoAllocate = (amt = amount) => {
    if (!amt) return;
    const s = suggestAllocations({ amount: amt, currency, playerId }, data.invoices, data.allocations, data.payments, today);
    setAlloc(Object.fromEntries(s.map((x) => [x.invoiceId, minorToInput(x.amount, currency)])));
  };

  const submit = () => {
    setError('');
    if (!playerId) return setError('validation.selectPlayer');
    if (amount === null || amount <= 0) return setError('validation.amount');
    if (allocations.some((a) => Number.isNaN(a.amount) || a.amount < 0)) return setError('validation.amount');
    const res = actions.recordPayment({ playerId, amount, paidOn, method, reference, allocations: allocations.filter((a) => a.amount > 0) }, data);
    if (!res.ok) { setError(res.error); show(res); return; }
    show(res, 'payments.recorded');
    onSaved?.(res.value);
    onClose();
  };

  const players = data.players.filter((p) => p.status !== 'archived' || p.id === playerId).sort((a, b) => a.lastName.localeCompare(b.lastName));
  return (
    <Modal open onClose={onClose} size="lg" title={t('record')} description={t('recordHint')}
      footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button variant="primary" onClick={submit}>{t('save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('player')} required className="sm:col-span-2">
          <Select value={playerId} onChange={(e) => { setPlayerId(e.target.value); setAlloc({}); }} disabled={!!initialPlayer}>
            <option value="">{t('selectPlayer')}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.code}</option>)}
          </Select>
        </Field>
        <Field label={t('amount', { currency })} required>
          <Input inputMode="decimal" dir="ltr" value={amountText} onChange={(e) => setAmountText(e.target.value)} onBlur={() => { if (amount && !Object.keys(alloc).length) autoAllocate(); }} placeholder={minorToInput(0, currency)} invalid={amountText !== '' && amount === null} />
        </Field>
        <Field label={t('date')} required><Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label={t('method')}><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{METHODS.map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select></Field>
        <Field label={t('reference')}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('referencePlaceholder')} /></Field>
      </div>

      {playerId && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{t('allocateTo')}</p>
            {openInvoices.length > 0 && <Button size="sm" variant="ghost" onClick={() => autoAllocate()} disabled={!amount}><Wand2 className="size-4" />{t('autoAllocate')}</Button>}
          </div>
          {openInvoices.length ? (
            <div className="rounded-xl border border-line">
              <Table>
                <thead><tr><Th>{t('invoice')}</Th><Th className="hidden sm:table-cell">{tc('dueDate')}</Th><Th numeric>{tc('balance')}</Th><Th className="w-36">{t('apply')}</Th></tr></thead>
                <tbody>
                  {openInvoices.map((i) => {
                    const b = balances.get(i.id)!;
                    return (
                      <Tr key={i.id}>
                        <Td><p className="font-medium">{i.number}</p><p className="text-xs text-muted">{i.lines[0]?.description}</p></Td>
                        <Td className="hidden sm:table-cell"><span className="me-2">{fmt.date(i.dueDate)}</span><PaymentStatusBadge status={b.status} /></Td>
                        <Td numeric>{fmt.money(b.balance)}</Td>
                        <Td><Input inputMode="decimal" dir="ltr" className="h-9 text-end" value={alloc[i.id] ?? ''} placeholder="0" onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))} /></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">{t('noOpenInvoices', { name: lk.playerName(playerId) })}</p>}
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-navy-50 p-4 text-sm">
            <div><p className="text-xs text-muted">{t('paymentAmount')}</p><p className="tabular font-semibold">{fmt.money(amount ?? 0)}</p></div>
            <div><p className="text-xs text-muted">{t('allocated')}</p><p className="tabular font-semibold">{fmt.money(allocated)}</p></div>
            <div><p className="text-xs text-muted">{t('unallocated')}</p><p className={`tabular font-semibold ${unallocated < 0 ? 'text-red-600' : unallocated > 0 ? 'text-amber-700' : 'text-brand-700'}`}>{fmt.money(unallocated)}</p></div>
          </div>
          {unallocated > 0 && <p className="mt-2 text-xs text-muted">{t('creditHint')}</p>}
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tAll(error as never)}</p>}
    </Modal>
  );
}
