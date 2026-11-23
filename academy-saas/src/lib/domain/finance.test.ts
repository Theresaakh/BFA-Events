import { describe, expect, it } from 'vitest';
import {
  AllocationError, invoiceBalance, invoiceTotal, parseMoneyInput, suggestAllocations, sumByCurrency, validateAllocations,
} from './finance';
import type { Invoice, Payment, PaymentAllocation } from '@/lib/types';

const today = '2026-11-23';
const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', number: 'INV-1', playerId: 'p1', currency: 'USD', issueDate: '2026-11-01', dueDate: '2026-11-30',
  status: 'issued', lines: [{ id: 'l1', chargeType: 'membership', description: 'Monthly fee', quantity: 1, unitAmount: 10000 }],
  createdAt: '2026-11-01T00:00:00Z', ...over,
});
const pay = (id: string, amount: number, over: Partial<Payment> = {}): Payment => ({
  id, receiptNumber: id, playerId: 'p1', amount, currency: 'USD', paidOn: today, method: 'cash', receivedBy: 'u1',
  createdAt: '2026-11-02T00:00:00Z', ...over,
});

describe('invoice balances', () => {
  it('the $100 invoice paid $40 + $30 has $30 remaining and is partially paid', () => {
    const payments = [pay('a', 4000), pay('b', 3000)];
    const allocations: PaymentAllocation[] = [
      { id: 'x', paymentId: 'a', invoiceId: 'inv1', amount: 4000 },
      { id: 'y', paymentId: 'b', invoiceId: 'inv1', amount: 3000 },
    ];
    expect(invoiceBalance(inv(), allocations, payments, today)).toEqual({ total: 10000, paid: 7000, balance: 3000, status: 'partially_paid' });
  });

  it('is paid when fully allocated, overdue when past due with a balance', () => {
    const payments = [pay('a', 10000)];
    const allocations = [{ id: 'x', paymentId: 'a', invoiceId: 'inv1', amount: 10000 }];
    expect(invoiceBalance(inv(), allocations, payments, today).status).toBe('paid');
    expect(invoiceBalance(inv({ dueDate: '2026-11-01' }), [], [], today).status).toBe('overdue');
  });

  it('ignores voided payments', () => {
    const payments = [pay('a', 4000, { voidedAt: '2026-11-03T00:00:00Z' })];
    const allocations = [{ id: 'x', paymentId: 'a', invoiceId: 'inv1', amount: 4000 }];
    expect(invoiceBalance(inv(), allocations, payments, today)).toMatchObject({ paid: 0, balance: 10000, status: 'unpaid' });
  });

  it('computes line totals with quantities', () => {
    expect(invoiceTotal({ lines: [{ id: '1', chargeType: 'camp', description: 'Camp day', quantity: 3, unitAmount: 2550 }] })).toBe(7650);
  });
});

describe('allocations', () => {
  it('rejects a different currency', () => {
    expect(() => validateAllocations({ amount: 1000, currency: 'EUR', playerId: 'p1' }, [{ invoiceId: 'inv1', amount: 1000 }], [inv()], [], [], today))
      .toThrow(AllocationError);
  });
  it('rejects allocating more than the balance or the payment', () => {
    expect(() => validateAllocations({ amount: 20000, currency: 'USD', playerId: 'p1' }, [{ invoiceId: 'inv1', amount: 15000 }], [inv()], [], [], today))
      .toThrow('exceedsBalance');
    expect(() => validateAllocations({ amount: 1000, currency: 'USD', playerId: 'p1' }, [{ invoiceId: 'inv1', amount: 2000 }], [inv()], [], [], today))
      .toThrow('exceedsPayment');
  });
  it('suggests oldest invoices first', () => {
    const invoices = [inv({ id: 'new', number: 'INV-2', dueDate: '2026-12-30' }), inv({ id: 'old', number: 'INV-1', dueDate: '2026-10-30' })];
    expect(suggestAllocations({ amount: 15000, currency: 'USD', playerId: 'p1' }, invoices, [], [], today))
      .toEqual([{ invoiceId: 'old', amount: 10000 }, { invoiceId: 'new', amount: 5000 }]);
  });
});

describe('helpers', () => {
  it('never mixes currencies when totalling', () => {
    expect(sumByCurrency([{ c: 'USD', a: 1 }, { c: 'EUR', a: 2 }, { c: 'USD', a: 3 }], (x) => x.c, (x) => x.a)).toEqual({ USD: 4, EUR: 2 });
  });
  it('parses money input safely', () => {
    expect(parseMoneyInput('40')).toBe(4000);
    expect(parseMoneyInput('1,250.75')).toBe(125075);
    expect(parseMoneyInput('12.345')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});
