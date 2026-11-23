/**
 * Pure finance logic. No UI, no storage — easy to test and to reuse on the server.
 * Rule #1: balances are DERIVED from recorded payments/allocations, never typed in.
 * Rule #2: amounts in different currencies are never added together.
 */
import type { ID, Invoice, ISODate, Payment, PaymentAllocation, PaymentStatus } from '@/lib/types';

export function lineAmount(quantity: number, unitAmount: number): number {
  return Math.round(quantity * unitAmount);
}

export function invoiceTotal(invoice: Pick<Invoice, 'lines'>): number {
  return invoice.lines.reduce((sum, l) => sum + lineAmount(l.quantity, l.unitAmount), 0);
}

/** Allocations that count: those whose payment is not voided. */
export function liveAllocations(allocations: PaymentAllocation[], payments: Payment[]): PaymentAllocation[] {
  const voided = new Set(payments.filter((p) => p.voidedAt).map((p) => p.id));
  return allocations.filter((a) => !voided.has(a.paymentId));
}

export interface InvoiceBalance {
  total: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
}

export function invoiceBalance(
  invoice: Invoice,
  allocations: PaymentAllocation[],
  payments: Payment[],
  today: ISODate,
): InvoiceBalance {
  const total = invoiceTotal(invoice);
  const paid = liveAllocations(allocations, payments)
    .filter((a) => a.invoiceId === invoice.id)
    .reduce((s, a) => s + a.amount, 0);
  const balance = total - paid;
  return { total, paid, balance, status: paymentStatus(invoice, total, paid, today) };
}

export function paymentStatus(invoice: Pick<Invoice, 'status' | 'dueDate'>, total: number, paid: number, today: ISODate): PaymentStatus {
  if (invoice.status === 'void') return 'void';
  if (invoice.status === 'draft') return 'draft';
  if (total - paid <= 0) return 'paid';
  if (invoice.dueDate < today) return 'overdue';
  if (paid > 0) return 'partially_paid';
  return 'unpaid';
}

/** How much of a payment is already allocated / still free. */
export function paymentAllocated(paymentId: ID, allocations: PaymentAllocation[]): number {
  return allocations.filter((a) => a.paymentId === paymentId).reduce((s, a) => s + a.amount, 0);
}

export class AllocationError extends Error {}

/**
 * Validates allocations for a new payment — the same rules as the database trigger
 * app.check_allocation(): same currency, issued invoice, no over-allocation.
 */
export function validateAllocations(
  payment: Pick<Payment, 'amount' | 'currency' | 'playerId'>,
  requested: { invoiceId: ID; amount: number }[],
  invoices: Invoice[],
  allocations: PaymentAllocation[],
  payments: Payment[],
  today: ISODate,
): void {
  const sum = requested.reduce((s, r) => s + r.amount, 0);
  if (requested.some((r) => !Number.isInteger(r.amount) || r.amount <= 0)) throw new AllocationError('invalidAmount');
  if (sum > payment.amount) throw new AllocationError('exceedsPayment');
  for (const r of requested) {
    const inv = invoices.find((i) => i.id === r.invoiceId);
    if (!inv) throw new AllocationError('invoiceNotFound');
    if (inv.status !== 'issued') throw new AllocationError('invoiceNotIssued');
    if (inv.currency !== payment.currency) throw new AllocationError('currencyMismatch');
    if (inv.playerId !== payment.playerId) throw new AllocationError('otherPlayer');
    const { balance } = invoiceBalance(inv, allocations, payments, today);
    if (r.amount > balance) throw new AllocationError('exceedsBalance');
  }
}

/**
 * Suggest allocations: oldest due date first (FIFO), same currency & player, issued invoices only.
 */
export function suggestAllocations(
  payment: Pick<Payment, 'amount' | 'currency' | 'playerId'>,
  invoices: Invoice[],
  allocations: PaymentAllocation[],
  payments: Payment[],
  today: ISODate,
): { invoiceId: ID; amount: number }[] {
  let remaining = payment.amount;
  const open = invoices
    .filter((i) => i.playerId === payment.playerId && i.status === 'issued' && i.currency === payment.currency)
    .map((i) => ({ inv: i, bal: invoiceBalance(i, allocations, payments, today).balance }))
    .filter((x) => x.bal > 0)
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate) || a.inv.number.localeCompare(b.inv.number));
  const result: { invoiceId: ID; amount: number }[] = [];
  for (const { inv, bal } of open) {
    if (remaining <= 0) break;
    const amount = Math.min(bal, remaining);
    result.push({ invoiceId: inv.id, amount });
    remaining -= amount;
  }
  return result;
}

/** Sum amounts grouped by currency — the only safe way to "total" multi-currency money. */
export function sumByCurrency<T>(items: T[], currency: (t: T) => string, amount: (t: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const c = currency(it);
    out[c] = (out[c] ?? 0) + amount(it);
  }
  return out;
}

/** Parse user input like "40", "40.5", "1,250.75" into minor units. Returns null when invalid. */
export function parseMoneyInput(input: string, fractionDigits = 2): number | null {
  const cleaned = input.replace(/[\s,]/g, '').replace(/٫/g, '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [int, frac = ''] = cleaned.split('.');
  if (frac.length > fractionDigits) return null;
  return Number(int) * 10 ** fractionDigits + Number(frac.padEnd(fractionDigits, '0') || 0);
}
