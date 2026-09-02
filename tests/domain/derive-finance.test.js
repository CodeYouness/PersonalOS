import { describe, expect, it } from 'vitest';

import {
  latestObservationByAccount,
  netWorthAt,
  periodTotals,
  totalsByCategory,
} from '@/lib/domain/derive/finance.js';

/** @returns {any} */
const account = (/** @type {any} */ o) => ({
  id: 'account_x', name: 'a', kind: 'cash', currency: 'EUR', origin: null, archived: false,
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @returns {any} */
const observation = (/** @type {any} */ o) => ({
  id: 'observation_x', accountId: 'account_x', kind: 'balance', amount: 0, currency: 'EUR',
  date: '2026-01-05', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @returns {any} */
const transaction = (/** @type {any} */ o) => ({
  id: 'transaction_x', date: '2026-01-05', amount: 0, currency: 'EUR', description: '',
  kind: 'expense', accountId: 'account_x', counterAccountId: null, categoryId: null, note: '',
  origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

describe('net worth comes from observations, not from transactions', () => {
  it('adds assets and subtracts liabilities', () => {
    const accounts = [
      account({ id: 'account_cash', kind: 'cash' }),
      account({ id: 'account_pf', kind: 'investment' }),
      account({ id: 'account_flat', kind: 'asset' }),
      account({ id: 'account_loan', kind: 'liability' }),
    ];
    const observations = [
      observation({ accountId: 'account_cash', amount: 1000000 }),
      observation({ accountId: 'account_pf', amount: 5000000 }),
      observation({ accountId: 'account_flat', amount: 20000000 }),
      observation({ accountId: 'account_loan', amount: -715000 }),
    ];

    const result = netWorthAt(accounts, observations, '2026-01-05');
    expect(result.netWorth).toBe(1000000 + 5000000 + 20000000 - 715000);
    expect(result.liabilities).toBe(715000);
  });

  it('uses the latest observation at or before the date', () => {
    const observations = [
      observation({ id: 'observation_old', amount: 100, date: '2026-01-01' }),
      observation({ id: 'observation_mid', amount: 200, date: '2026-01-03' }),
      observation({ id: 'observation_future', amount: 999, date: '2026-02-01' }),
    ];

    const latest = latestObservationByAccount(observations, '2026-01-05');
    expect(latest.get('account_x')?.amount).toBe(200);
  });

  it('never treats an unmeasured account as empty', () => {
    // An account nobody has measured is unknown. Calling it zero would
    // quietly understate the position and nothing would say so.
    const accounts = [account({ id: 'account_cash' }), account({ id: 'account_pension', kind: 'investment' })];
    const observations = [observation({ accountId: 'account_cash', amount: 500000 })];

    const result = netWorthAt(accounts, observations, '2026-01-05');
    expect(result.netWorth).toBe(500000);
    expect(result.unmeasuredAccounts).toBe(1);
  });
});

describe('flows', () => {
  it('excludes transfers, which are not income and not spending', () => {
    // Counting a move between your own accounts doubles the month, and the
    // number looks plausible enough that you would believe it.
    const transactions = [
      transaction({ kind: 'income', amount: 250000 }),
      transaction({ kind: 'expense', amount: 95000 }),
      transaction({ kind: 'transfer', amount: 100000, counterAccountId: 'account_y' }),
    ];

    const totals = periodTotals(transactions, '2026-01-01', '2026-01-31');
    expect(totals.income).toBe(250000);
    expect(totals.expense).toBe(95000);
    expect(totals.net).toBe(155000);
    expect(totals.count).toBe(2);
  });

  it('stays inside the period', () => {
    const transactions = [
      transaction({ kind: 'expense', amount: 100, date: '2025-12-31' }),
      transaction({ kind: 'expense', amount: 200, date: '2026-01-01' }),
      transaction({ kind: 'expense', amount: 400, date: '2026-02-01' }),
    ];

    expect(periodTotals(transactions, '2026-01-01', '2026-01-31').expense).toBe(200);
  });

  it('groups by category and shows what is not filed yet', () => {
    const transactions = [
      transaction({ kind: 'expense', amount: 95000, categoryId: 'cat_rent' }),
      transaction({ kind: 'expense', amount: 6250, categoryId: 'cat_groceries' }),
      transaction({ kind: 'expense', amount: 3300, categoryId: 'cat_groceries' }),
      transaction({ kind: 'expense', amount: 1200, categoryId: null }),
      transaction({ kind: 'income', amount: 250000, categoryId: 'cat_consulting' }),
    ];

    const spending = totalsByCategory(transactions, 'expense', '2026-01-01', '2026-01-31');
    expect(spending.cat_rent).toBe(95000);
    expect(spending.cat_groceries).toBe(9550);
    // Uncategorised is shown, not dropped: a total that silently omits what
    // you have not filed is worse than one that shows you the gap.
    expect(spending['']).toBe(1200);
    expect(spending.cat_consulting).toBeUndefined();

    const income = totalsByCategory(transactions, 'income', '2026-01-01', '2026-01-31');
    expect(income.cat_consulting).toBe(250000);
  });
});
