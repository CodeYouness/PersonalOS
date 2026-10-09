import { describe, expect, it } from 'vitest';

import {
  allocation,
  financeOverview,
  accountValueOn,
  netWorthOn,
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
      // A liability is recorded as the positive amount owed.
      observation({ accountId: 'account_loan', amount: 715000 }),
    ];

    const result = netWorthOn({ accounts, observations }, '2026-01-05');
    expect(result.netWorth).toBe(1000000 + 5000000 + 20000000 - 715000);
    expect(result.liabilities).toBe(715000);
  });

  it('counts an overdraft against net worth, never as money you have', () => {
    const accounts = [
      account({ id: 'account_current', kind: 'cash' }),
      account({ id: 'account_savings', kind: 'cash' }),
    ];
    const observations = [
      observation({ accountId: 'account_current', amount: -50000 }),
      observation({ accountId: 'account_savings', amount: 200000 }),
    ];

    const result = netWorthOn({ accounts, observations }, '2026-01-05');
    expect(result.cash).toBe(150000);
    expect(result.netWorth).toBe(150000);
  });

  it('uses the latest observation at or before the date', () => {
    const observations = [
      observation({ id: 'observation_old', amount: 100, date: '2026-01-01' }),
      observation({ id: 'observation_mid', amount: 200, date: '2026-01-03' }),
      observation({ id: 'observation_future', amount: 999, date: '2026-02-01' }),
    ];

    const value = accountValueOn(account({}), { accounts: [account({})], observations }, '2026-01-05');
    expect(value).toEqual({ amount: 200, date: '2026-01-03' });
  });

  it('never treats an unmeasured account as empty', () => {
    // An account nobody has measured is unknown. Calling it zero would
    // quietly understate the position and nothing would say so.
    const accounts = [account({ id: 'account_cash' }), account({ id: 'account_pension', kind: 'investment' })];
    const observations = [observation({ accountId: 'account_cash', amount: 500000 })];

    const result = netWorthOn({ accounts, observations }, '2026-01-05');
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

describe('the finance overview the screen renders from', () => {
  const accounts = [
    account({ id: 'account_current', name: 'Current', kind: 'cash' }),
    account({ id: 'account_pension', name: 'Pension', kind: 'investment' }),
    account({ id: 'account_flat', name: 'Flat', kind: 'asset' }),
    account({ id: 'account_loan', name: 'Loan', kind: 'liability' }),
    account({ id: 'account_closed', name: 'Closed', kind: 'cash', archived: true }),
  ];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-03-01' }),
    observation({ id: 'observation_2', accountId: 'account_current', amount: 120000, date: '2026-04-01' }),
    // After today: not yet a value.
    observation({ id: 'observation_3', accountId: 'account_current', amount: 999999, date: '2026-05-01' }),
    observation({ id: 'observation_4', accountId: 'account_flat', amount: 20000000, date: '2026-01-10' }),
    observation({ id: 'observation_5', accountId: 'account_loan', amount: 715000, date: '2026-03-15' }),
    observation({ id: 'observation_6', accountId: 'account_closed', amount: 50000, date: '2026-03-15' }),
  ];

  it('adds up the components from the latest value on or before today', () => {
    const overview = financeOverview({ accounts, observations }, '2026-04-10');

    expect(overview.cash).toBe(120000);
    expect(overview.invested).toBe(0);
    expect(overview.otherAssets).toBe(20000000);
    expect(overview.liabilities).toBe(715000);
    expect(overview.netWorth).toBe(120000 + 20000000 - 715000);
  });

  it('lists each active account with its value and the date of that value', () => {
    const overview = financeOverview({ accounts, observations }, '2026-04-10');

    expect(overview.accounts.map(({ account: a, value, valueDate }) => [a.id, value, valueDate])).toEqual([
      ['account_current', 120000, '2026-04-01'],
      ['account_pension', null, null],
      ['account_flat', 20000000, '2026-01-10'],
      ['account_loan', 715000, '2026-03-15'],
    ]);
  });

  it('counts an account with no value as unmeasured, never as zero', () => {
    const overview = financeOverview({ accounts, observations }, '2026-04-10');

    expect(overview.unmeasuredAccounts).toBe(1);
    expect(overview.accounts.find((row) => row.account.id === 'account_pension')?.value).toBeNull();
  });

  it('leaves archived accounts out of the table and of net worth', () => {
    const overview = financeOverview({ accounts, observations }, '2026-04-10');

    expect(overview.accounts.map((row) => row.account.id)).not.toContain('account_closed');
    expect(overview.cash).toBe(120000);
  });
});

describe('the allocation bar', () => {
  it('shares out cash, invested, other assets and debt by size', () => {
    const shares = allocation({ cash: 30000, invested: 50000, otherAssets: 0, liabilities: 20000 });

    expect(shares).toEqual([
      { key: 'cash', amount: 30000, share: 0.3 },
      { key: 'invested', amount: 50000, share: 0.5 },
      { key: 'otherAssets', amount: 0, share: 0 },
      { key: 'debt', amount: 20000, share: 0.2 },
    ]);
  });

  it('gives an overdrawn cash balance no width, and is empty when there is nothing', () => {
    expect(allocation({ cash: -10000, invested: 10000, otherAssets: 0, liabilities: 0 })[0].share).toBe(0);
    expect(allocation({ cash: 0, invested: 0, otherAssets: 0, liabilities: 0 }).every((s) => s.share === 0)).toBe(true);
  });
});
