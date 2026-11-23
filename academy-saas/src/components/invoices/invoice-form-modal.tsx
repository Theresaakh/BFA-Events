'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { lineAmount, parseMoneyInput } from '@/lib/domain/finance';
import { addDays, currencyDigits, minorToInput } from '@/lib/format';
import { useResultToast } from '@/components/shared/result-toast';
import { currentTeamIds } from '@/components/shared/lookups';
import type { ChargeType } from '@/lib/types';

const CHARGES: ChargeType[] = ['membership', 'registration', 'tournament', 'camp', 'trip', 'custom'];
const FEE_BY_SPORT = { football: 12000, basketball: 15000 } as const;

type LineDraft = { chargeType: ChargeType; description: string; quantity: string; unit: string };

export function InvoiceFormModal({ onClose, playerId: initialPlayer, onSaved }: { onClose: () => void; playerId?: string; onSaved?: (id: string) => void }) {
  const t = useTranslations('invoices');
  const tc = useTranslations('common');
  const tch = useTranslations('enums.charge');
  const tAll = useTranslations();
  const { data, today, actions } = useStore();
  const fmt = useFmt();
  const show = useResultToast();
  const currency = data.academy.currency;
  const digits = currencyDigits(currency);
  const [playerId, setPlayerId] = useState(initialPlayer ?? '');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 14));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ chargeType: 'membership', description: '', quantity: '1', unit: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const defaultDescription = (c: ChargeType) => c === 'membership'
    ? `${tch('membership')} — ${new Intl.DateTimeFormat(fmt.locale === 'ar' ? 'ar-u-nu-latn' : fmt.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${issueDate}T00:00:00Z`))}`
    : tch(c);
  const suggestFee = (pid: string) => {
    const team = data.teams.find((x) => x.id === currentTeamIds(data, pid)[0]);
    return team ? minorToInput(FEE_BY_SPORT[team.sport], currency) : '';
  };
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const parsed = lines.map((l) => ({ chargeType: l.chargeType, description: l.description.trim() || defaultDescription(l.chargeType), quantity: Number(l.quantity.replace(',', '.')), unitAmount: parseMoneyInput(l.unit, digits) }));
  const total = parsed.reduce((s, l) => s + (l.unitAmount !== null && l.quantity > 0 ? lineAmount(l.quantity, l.unitAmount) : 0), 0);

  const submit = (issue: boolean) => {
    if (parsed.some((l) => l.unitAmount === null || !(l.quantity > 0))) { setErrors({ lines: 'validation.amount' }); return; }
    const res = actions.createInvoice({ playerId, issueDate, dueDate, notes, lines: parsed.map((l) => ({ ...l, unitAmount: l.unitAmount! })) }, data, issue);
    if (!res.ok) { setErrors(res.fields ?? {}); show(res); return; }
    show(res, issue ? 'invoices.issued' : 'invoices.draftSaved');
    onSaved?.(res.value);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={t('new')} description={t('newHint', { currency })}
      footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button onClick={() => submit(false)}>{t('saveDraft')}</Button><Button variant="primary" onClick={() => submit(true)}>{t('issue')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('player')} error={errors.playerId} required className="sm:col-span-3">
          <Select value={playerId} disabled={!!initialPlayer} invalid={!!errors.playerId} onChange={(e) => { setPlayerId(e.target.value); if (lines.length === 1 && !lines[0].unit) setLine(0, { unit: suggestFee(e.target.value) }); }}>
            <option value="">{t('selectPlayer')}</option>
            {data.players.filter((p) => p.status !== 'archived').sort((a, b) => a.lastName.localeCompare(b.lastName)).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.code}</option>)}
          </Select>
        </Field>
        <Field label={t('issueDate')} error={errors.issueDate}><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
        <Field label={t('dueDate')} error={errors.dueDate}><Input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} invalid={!!errors.dueDate} /></Field>
        <Field label={t('currency')}><Input value={currency} disabled /></Field>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold">{t('lines')}</p>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 rounded-xl border border-line p-3 sm:grid-cols-12 sm:items-end">
              <Field label={t('chargeType')} className="col-span-6 sm:col-span-3"><Select value={l.chargeType} onChange={(e) => setLine(i, { chargeType: e.target.value as ChargeType })}>{CHARGES.map((c) => <option key={c} value={c}>{tch(c)}</option>)}</Select></Field>
              <Field label={tc('description')} className="col-span-6 sm:col-span-4"><Input value={l.description} placeholder={defaultDescription(l.chargeType)} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
              <Field label={t('qty')} className="col-span-2 sm:col-span-1"><Input inputMode="decimal" dir="ltr" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></Field>
              <Field label={t('unitPrice')} className="col-span-3 sm:col-span-2"><Input inputMode="decimal" dir="ltr" value={l.unit} placeholder={minorToInput(0, currency)} onChange={(e) => setLine(i, { unit: e.target.value })} invalid={l.unit !== '' && parseMoneyInput(l.unit, digits) === null} /></Field>
              <div className="col-span-1 flex items-end justify-end pb-1 sm:col-span-2 sm:justify-between">
                <span className="tabular hidden text-sm font-medium sm:inline">{fmt.money(parsed[i].unitAmount !== null && parsed[i].quantity > 0 ? lineAmount(parsed[i].quantity, parsed[i].unitAmount!) : 0)}</span>
                <button type="button" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={tc('remove')}><Trash2 className="size-4" /></button>
              </div>
            </div>
          ))}
        </div>
        {errors.lines && <p className="mt-2 text-xs text-red-600">{tAll(errors.lines as never)}</p>}
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines((ls) => [...ls, { chargeType: 'custom', description: '', quantity: '1', unit: '' }])}><Plus className="size-4" />{t('addLine')}</Button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-navy-900 px-5 py-4 text-white">
        <span className="text-sm">{tc('total')}</span><span className="tabular text-xl font-semibold">{fmt.money(total)}</span>
      </div>
      <Field label={t('notes')} className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} /></Field>
    </Modal>
  );
}
