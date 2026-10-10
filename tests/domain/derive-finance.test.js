import { describe, expect, it } from 'vitest';

import {
  accountValueOn,
  allocation,
  financeOverview,
  firstDayUnitsGoNegative,
  flowMonths,
  lineHolds,
  monthFlows,
  netWorthOn,
  savingsRate,
  sparkBars,
  UNCATEGORISED_INCOME,
  UNCATEGORISED_SPENDING,
  yearFlows,
} from '@/lib/domain/derive/finance.js';

/** @returns {any} */
const account = (/** @type {any} */ o) => ({
  id: 'account_x', name: 'a', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance',
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @returns {any} */
const observation = (/** @type {any} */ o) => ({
  id: 'observation_x', accountId: 'account_x', kind: 'balance', amount: 0, currency: 'EUR',
  date: '2026-01-05', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @returns {any} */
const trade = (/** @type {any} */ o) => ({
  id: 'trade_x', accountId: 'account_etf', date: '2026-01-02', direction: 'buy', units: 0, price: 0,
  fee: 0, currency: 'EUR', createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @returns {any} */
const price = (/** @type {any} */ o) => ({
  id: 'price_x', accountId: 'account_etf', date: '2026-01-02', price: 0, currency: 'EUR',
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** One unit, in the 10^-8 units a trade counts in. */
const UNIT = 100_000_000;

/** @returns {any} */
const transaction = (/** @type {any} */ o) => ({
  id: 'transaction_x', date: '2026-01-05', amount: 0, currency: 'EUR', description: '',
  accountId: 'account_x', counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '',
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

    const result = netWorthOn({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-01-05');
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

    const result = netWorthOn({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-01-05');
    expect(result.cash).toBe(150000);
    expect(result.netWorth).toBe(150000);
  });

  it('uses the latest observation at or before the date', () => {
    const observations = [
      observation({ id: 'observation_old', amount: 100, date: '2026-01-01' }),
      observation({ id: 'observation_mid', amount: 200, date: '2026-01-03' }),
      observation({ id: 'observation_future', amount: 999, date: '2026-02-01' }),
    ];

    const value = accountValueOn(account({}), { accounts: [account({})], observations, trades: [], prices: [], transactions: [] }, '2026-01-05');
    expect(value).toEqual({ amount: 200, date: '2026-01-03' });
  });

  it('never treats an unmeasured account as empty', () => {
    // An account nobody has measured is unknown. Calling it zero would
    // quietly understate the position and nothing would say so.
    const accounts = [account({ id: 'account_cash' }), account({ id: 'account_pension', kind: 'investment' })];
    const observations = [observation({ accountId: 'account_cash', amount: 500000 })];

    const result = netWorthOn({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-01-05');
    expect(result.netWorth).toBe(500000);
    expect(result.unmeasuredAccounts).toBe(1);
  });
});

describe('the finance overview the screen renders from', () => {
  const accounts = [
    account({ id: 'account_current', name: 'Current', kind: 'cash' }),
    account({ id: 'account_pension', name: 'Pension', kind: 'investment' }),
    account({ id: 'account_flat', name: 'Flat', kind: 'asset' }),
    account({ id: 'account_loan', name: 'Loan', kind: 'liability' }),
    account({ id: 'account_closed', name: 'Closed', kind: 'cash', archivedOn: '2026-04-01' }),
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
    const overview = financeOverview({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-10');

    expect(overview.cash).toBe(120000);
    expect(overview.invested).toBe(0);
    expect(overview.otherAssets).toBe(20000000);
    expect(overview.liabilities).toBe(715000);
    expect(overview.netWorth).toBe(120000 + 20000000 - 715000);
  });

  it('lists each active account with its value and the date of that value', () => {
    const overview = financeOverview({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-10');

    expect(overview.accounts.map(({ account: a, value, valueDate }) => [a.id, value, valueDate])).toEqual([
      ['account_current', 120000, '2026-04-01'],
      ['account_pension', null, null],
      ['account_flat', 20000000, '2026-01-10'],
      ['account_loan', 715000, '2026-03-15'],
    ]);
  });

  it('counts an account with no value as unmeasured, never as zero', () => {
    const overview = financeOverview({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-10');

    expect(overview.unmeasuredAccounts).toBe(1);
    expect(overview.accounts.find((row) => row.account.id === 'account_pension')?.value).toBeNull();
  });

  it('counts an archived account on the days before it was archived, and not after', () => {
    // Closing a loan must not raise last year's net worth.
    expect(netWorthOn({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-03-31').cash).toBe(100000 + 50000);
    expect(netWorthOn({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-01').cash).toBe(120000);
  });

  it('leaves archived accounts out of the table and of net worth', () => {
    const overview = financeOverview({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-10');

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

describe('a holding is valued by units', () => {
  const etf = account({ id: 'account_etf', kind: 'investment', valuation: 'units' });
  const trades = [
    trade({ id: 'trade_1', date: '2026-01-02', direction: 'buy', units: 10 * UNIT, price: 10000, fee: 100 }),
    trade({ id: 'trade_2', date: '2026-02-02', direction: 'buy', units: 5.5 * UNIT, price: 10450 }),
    trade({ id: 'trade_3', date: '2026-03-02', direction: 'sell', units: 3 * UNIT, price: 11000, fee: 50 }),
  ];
  /** @param {any[]} t @param {string} date @param {any[]} [p] */
  const valueOn = (t, date, p = []) => accountValueOn(etf, { accounts: [etf], observations: [], trades: t, prices: p, transactions: [] }, date);

  it('is the units held times the price of the latest trade, dated by that trade', () => {
    expect(valueOn(trades, '2026-01-15')).toEqual({ amount: 100000, date: '2026-01-02' });
    expect(valueOn(trades, '2026-02-15')).toEqual({ amount: 161975, date: '2026-02-02' });
  });

  it('holds fewer units from the day of a sell', () => {
    expect(valueOn(trades, '2026-03-01')).toEqual({ amount: 161975, date: '2026-02-02' });
    expect(valueOn(trades, '2026-03-02')).toEqual({ amount: 137500, date: '2026-03-02' });
  });

  it('is unknown before the first trade', () => {
    expect(valueOn(trades, '2026-01-01')).toBeNull();
    expect(valueOn([], '2026-04-01')).toBeNull();
  });

  it('never counts the fee in what the holding is worth', () => {
    const noFees = trades.map((t) => ({ ...t, fee: 0 }));
    expect(valueOn(noFees, '2026-03-10')).toEqual(valueOn(trades, '2026-03-10'));
  });

  it('rounds half up to the cent once per holding, not once per trade', () => {
    const thirds = [1, 2, 3].map((n) =>
      trade({ id: 'trade_' + n, date: '2026-01-0' + n, units: 33_333_333, price: 1001 })
    );
    // 0.99999999 units at 10.01 is 1000.99998999 cents: 1001, where rounding
    // each trade's 333.666... first would have made 1002.
    expect(valueOn(thirds, '2026-01-05')?.amount).toBe(1001);
    expect(valueOn([trade({ units: UNIT / 2, price: 1 })], '2026-01-05')?.amount).toBe(1);
  });

  it('counts in net worth as invested, and ignores any balance', () => {
    const worth = netWorthOn(
      { accounts: [etf], observations: [observation({ accountId: 'account_etf', amount: 999 })], trades, prices: [], transactions: [] },
      '2026-03-10'
    );
    expect(worth.invested).toBe(137500);
  });
});

describe('a holding is valued at its latest price', () => {
  const etf = account({ id: 'account_etf', kind: 'investment', valuation: 'units' });
  const trades = [trade({ id: 'trade_1', date: '2026-01-02', units: 10 * UNIT, price: 10000 })];
  /** @param {any[]} p @param {string} date */
  const valueOn = (p, date) => accountValueOn(etf, { accounts: [etf], observations: [], trades, prices: p, transactions: [] }, date);

  it('uses a price recorded without a trade, dated by it', () => {
    const prices = [price({ id: 'price_1', date: '2026-03-31', price: 11500 })];

    expect(valueOn(prices, '2026-04-10')).toEqual({ amount: 115000, date: '2026-03-31' });
  });

  it('stays flat between two prices, and keeps a stale price\'s date', () => {
    const prices = [price({ id: 'price_1', date: '2026-03-31', price: 11500 })];

    expect(valueOn(prices, '2026-03-30')).toEqual({ amount: 100000, date: '2026-01-02' });
    expect(valueOn(prices, '2026-09-30')).toEqual({ amount: 115000, date: '2026-03-31' });
  });

  it('lets a Price beat a trade\'s price on the same date', () => {
    const prices = [price({ id: 'price_1', date: '2026-01-02', price: 10100 })];

    expect(valueOn(prices, '2026-01-02')).toEqual({ amount: 101000, date: '2026-01-02' });
  });

  it('is still unknown before the first trade, whatever the prices', () => {
    const prices = [price({ id: 'price_1', date: '2025-12-01', price: 9000 })];

    expect(valueOn(prices, '2025-12-15')).toBeNull();
  });
});

describe('the units a holding has can never go below zero', () => {
  it('finds the first day a sell takes more than is held', () => {
    expect(
      firstDayUnitsGoNegative([
        trade({ date: '2026-01-02', direction: 'buy', units: 10 }),
        trade({ date: '2026-02-02', direction: 'sell', units: 4 }),
        trade({ date: '2026-03-02', direction: 'sell', units: 7 }),
      ])
    ).toBe('2026-03-02');
  });

  it('settles a day as a whole, so a sell and a buy on one day are fine', () => {
    expect(
      firstDayUnitsGoNegative([
        trade({ date: '2026-01-02', direction: 'sell', units: 5 }),
        trade({ date: '2026-01-02', direction: 'buy', units: 5 }),
      ])
    ).toBeNull();
  });
});

describe('the history is derived month by month', () => {
  const accounts = [
    account({ id: 'account_current', kind: 'cash' }),
    account({ id: 'account_loan', kind: 'liability', archivedOn: '2026-03-10' }),
  ];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-01-20' }),
    observation({ id: 'observation_2', accountId: 'account_current', amount: 130000, date: '2026-03-05' }),
    observation({ id: 'observation_3', accountId: 'account_loan', amount: 40000, date: '2026-02-01' }),
  ];
  const inputs = { accounts, observations, trades: [], prices: [], transactions: [] };

  it('gives month-end net worth from the first value to today, newest first, the first change blank', () => {
    const { history } = financeOverview(inputs, '2026-04-12');

    expect(history).toEqual([
      { month: '2026-04', netWorth: 130000, change: 0 },
      // The loan was archived on 10 March: it counts before, not at month end.
      { month: '2026-03', netWorth: 130000, change: 70000 },
      { month: '2026-02', netWorth: 60000, change: -40000 },
      { month: '2026-01', netWorth: 100000, change: null },
    ]);
  });

  it('counts an archived account on the dates it had a value, so closing it never rewrites the past', () => {
    const { history } = financeOverview(inputs, '2026-04-12');

    expect(history.find((row) => row.month === '2026-02')?.netWorth).toBe(100000 - 40000);
  });

  it('is empty until there is something to show', () => {
    expect(financeOverview({ accounts, observations: [], trades: [], prices: [], transactions: [] }, '2026-04-12').history).toEqual([]);
  });

  it('starts a holding at its first trade and follows its prices', () => {
    const etf = account({ id: 'account_etf', kind: 'investment', valuation: 'units' });
    const { history } = financeOverview(
      {
        accounts: [etf],
        observations: [],
        trades: [trade({ date: '2026-02-10', units: 10 * UNIT, price: 10000 })],
        prices: [price({ date: '2026-03-31', price: 11000 })],
        transactions: [],
      },
      '2026-04-12'
    );

    expect(history.map((row) => [row.month, row.netWorth])).toEqual([
      ['2026-04', 110000],
      ['2026-03', 110000],
      ['2026-02', 100000],
    ]);
  });
});

describe('the 30-day change of an account', () => {
  const accounts = [account({ id: 'account_current', kind: 'cash' }), account({ id: 'account_new', kind: 'cash' })];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-02-20' }),
    observation({ id: 'observation_2', accountId: 'account_current', amount: 125000, date: '2026-04-01' }),
    observation({ id: 'observation_3', accountId: 'account_new', amount: 5000, date: '2026-04-01' }),
  ];

  it('is today\'s value minus the value 30 days ago, blank when there was none', () => {
    const { accounts: rows } = financeOverview({ accounts, observations, trades: [], prices: [], transactions: [] }, '2026-04-12');

    expect(rows.map((row) => [row.account.id, row.change30d])).toEqual([
      ['account_current', 25000],
      ['account_new', null],
    ]);
  });
});

describe('the pulse: changes, sparkline and as of', () => {
  const accounts = [account({ id: 'account_current', kind: 'cash' }), account({ id: 'account_pension', kind: 'investment' })];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-02-20' }),
    observation({ id: 'observation_2', accountId: 'account_current', amount: 125000, date: '2026-04-01' }),
    observation({ id: 'observation_3', accountId: 'account_pension', amount: 50000, date: '2026-03-15' }),
  ];
  const inputs = { accounts, observations, trades: [], prices: [], transactions: [] };

  it('changes net worth over 30 days, and hides the year with no value that far back', () => {
    const { changes } = financeOverview(inputs, '2026-04-12');

    // 30 days ago (13 March): 1,000 of cash, the pension not yet measured.
    expect(changes).toEqual({ days30: 175000 - 100000, year: null });
  });

  it('changes over a year once there is a value a year back', () => {
    const { changes } = financeOverview(inputs, '2027-02-25');

    expect(changes.year).toBe(175000 - 100000);
  });

  it('draws twelve month-ends, leaving the months before the first value empty', () => {
    const { sparkline } = financeOverview(inputs, '2026-04-12');

    // May 2025 to January 2026 had no value; then the ends of February and
    // March, and today.
    expect(sparkline).toEqual([null, null, null, null, null, null, null, null, null, 100000, 150000, 175000]);
  });

  it('is as of the newest value it counts', () => {
    expect(financeOverview(inputs, '2026-04-12').asOf).toBe('2026-04-01');
    expect(financeOverview(inputs, '2026-03-20').asOf).toBe('2026-03-15');
    expect(financeOverview({ ...inputs, observations: [] }, '2026-04-12').asOf).toBeNull();
  });
});

describe('the sparkline bars', () => {
  it('scales each value between the lowest and the highest, and marks a fall', () => {
    expect(sparkBars([null, 100, 200, 150])).toEqual([
      null,
      { height: 0.2, fell: false },
      { height: 1, fell: false },
      { height: 0.6, fell: true },
    ]);
  });

  it('draws a flat series at one height, and nothing for an empty month', () => {
    expect(sparkBars([null, 50, 50])).toEqual([null, { height: 0.6, fell: false }, { height: 0.6, fell: false }]);
  });
});

describe('a cash account follows its movements (ADR 0024)', () => {
  const current = account({ id: 'account_current', kind: 'cash' });
  const savings = account({ id: 'account_savings', kind: 'cash' });
  const loan = account({ id: 'account_loan', kind: 'liability' });
  const etf = account({ id: 'account_etf', kind: 'investment', valuation: 'units' });
  /** @param {any} o */
  const inputs = (o) => ({ accounts: [current, savings, loan, etf], observations: [], trades: [], prices: [], transactions: [], ...o });

  it('is its latest balance plus the movements dated after it', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-03-01' })],
      transactions: [
        transaction({ accountId: 'account_current', amount: -1840, date: '2026-03-02' }),
        transaction({ accountId: 'account_current', amount: 250000, date: '2026-03-05' }),
        transaction({ accountId: 'account_current', amount: -5000, date: '2026-03-20' }),
      ],
    });

    expect(accountValueOn(current, given, '2026-03-10')).toEqual({ amount: 348160, date: '2026-03-05' });
  });

  it('counts a not-counted movement: it moves the balance, only not the month', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-03-01' })],
      transactions: [transaction({ accountId: 'account_current', amount: 30000, date: '2026-03-02', notCounted: true })],
    });

    expect(accountValueOn(current, given, '2026-03-02')?.amount).toBe(130000);
  });

  it('includes in a balance the movements dated on its own day, adding only later days', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-03-01' })],
      transactions: [
        transaction({ accountId: 'account_current', amount: -9999, date: '2026-03-01' }),
        transaction({ accountId: 'account_current', amount: -1000, date: '2026-03-02' }),
      ],
    });

    expect(accountValueOn(current, given, '2026-03-02')).toEqual({ amount: 99000, date: '2026-03-02' });
  });

  it('takes a balance typed later as a reconciliation point', () => {
    const given = inputs({
      observations: [
        observation({ id: 'o1', accountId: 'account_current', amount: 100000, date: '2026-03-01' }),
        observation({ id: 'o2', accountId: 'account_current', amount: 90000, date: '2026-03-10' }),
      ],
      transactions: [
        transaction({ accountId: 'account_current', amount: -1840, date: '2026-03-02' }),
        transaction({ accountId: 'account_current', amount: -500, date: '2026-03-11' }),
      ],
    });

    // The forgotten movements before the 10th are absorbed, not carried.
    expect(accountValueOn(current, given, '2026-03-11')?.amount).toBe(89500);
  });

  it('takes the balance recorded last when two share a day', () => {
    const given = inputs({
      observations: [
        observation({ id: 'o1', accountId: 'account_current', amount: 100000, date: '2026-03-10' }),
        observation({ id: 'o2', accountId: 'account_current', amount: 90000, date: '2026-03-10' }),
      ],
    });

    expect(accountValueOn(current, given, '2026-03-10')?.amount).toBe(90000);
  });

  it('shows a debt paid off beyond what was owed as a negative amount owed', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_loan', amount: 10000, date: '2026-03-01' })],
      transactions: [transaction({ accountId: 'account_current', counterAccountId: 'account_loan', amount: -15000, date: '2026-03-02' })],
    });

    expect(accountValueOn(loan, given, '2026-03-02')?.amount).toBe(-5000);
  });

  it('stays unknown with movements but no balance on or before the date', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-03-15' })],
      transactions: [transaction({ accountId: 'account_current', amount: -1840, date: '2026-03-02' })],
    });

    expect(accountValueOn(current, given, '2026-03-10')).toBeNull();
  });

  it('takes a transfer out of one account and into the other', () => {
    const given = inputs({
      observations: [
        observation({ id: 'o1', accountId: 'account_current', amount: 100000, date: '2026-03-01' }),
        observation({ id: 'o2', accountId: 'account_savings', amount: 500000, date: '2026-02-01' }),
      ],
      transactions: [
        transaction({ accountId: 'account_current', counterAccountId: 'account_savings', amount: -40000, date: '2026-03-05' }),
      ],
    });

    expect(accountValueOn(current, given, '2026-03-31')?.amount).toBe(60000);
    // Saving shows up the day it happens, until the next balance.
    expect(accountValueOn(savings, given, '2026-03-31')?.amount).toBe(540000);
    expect(netWorthOn(given, '2026-03-31').netWorth).toBe(600000);
  });

  it('lowers the cash for a transfer into a holding and leaves the holding as its trades value it', () => {
    const given = inputs({
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-03-01' })],
      trades: [trade({ accountId: 'account_etf', date: '2026-03-05', units: 2 * UNIT, price: 10000 })],
      transactions: [
        transaction({ accountId: 'account_current', counterAccountId: 'account_etf', amount: -20000, date: '2026-03-05' }),
      ],
    });

    expect(accountValueOn(current, given, '2026-03-31')?.amount).toBe(80000);
    expect(accountValueOn(etf, given, '2026-03-31')?.amount).toBe(20000);
  });

  it('reduces what a liability owes when money lands in it, and raises it when money leaves', () => {
    const given = inputs({
      observations: [
        observation({ id: 'o1', accountId: 'account_current', amount: 100000, date: '2026-03-01' }),
        observation({ id: 'o2', accountId: 'account_loan', amount: 700000, date: '2026-03-01' }),
      ],
      transactions: [
        // A repayment: money leaves the current account and lands in the loan.
        transaction({ accountId: 'account_current', counterAccountId: 'account_loan', amount: -30000, date: '2026-03-05' }),
        // Drawing on it: money leaves the loan.
        transaction({ accountId: 'account_loan', amount: -5000, date: '2026-03-06' }),
      ],
    });

    expect(accountValueOn(loan, given, '2026-03-31')?.amount).toBe(675000);
    expect(netWorthOn(given, '2026-03-31').netWorth).toBe(70000 - 675000);
  });

  it('keeps counting an archived account, with its movements, on every day before it was archived', () => {
    const closed = account({ id: 'account_closed', kind: 'cash', archivedOn: '2026-04-01' });
    const given = {
      accounts: [closed], trades: [], prices: [],
      observations: [observation({ accountId: 'account_closed', amount: 50000, date: '2026-03-01' })],
      transactions: [transaction({ accountId: 'account_closed', amount: -10000, date: '2026-03-15' })],
    };

    expect(netWorthOn(given, '2026-03-31').netWorth).toBe(40000);
    expect(netWorthOn(given, '2026-04-01').netWorth).toBe(0);
  });

  it('follows its movements in the history and the account table', () => {
    const given = inputs({
      accounts: [current],
      observations: [observation({ accountId: 'account_current', amount: 100000, date: '2026-01-31' })],
      transactions: [
        transaction({ accountId: 'account_current', amount: -20000, date: '2026-02-10' }),
        transaction({ accountId: 'account_current', amount: 5000, date: '2026-03-03' }),
      ],
    });

    const overview = financeOverview(given, '2026-03-10');
    expect(overview.history.map((row) => [row.month, row.netWorth])).toEqual([
      ['2026-03', 85000], ['2026-02', 80000], ['2026-01', 100000],
    ]);
    // 30 days back is 8 Feb, before the 10 Feb movement.
    expect(overview.accounts[0]).toMatchObject({ value: 85000, valueDate: '2026-03-03', change30d: -15000 });
  });
});

describe("a month's flows (#137)", () => {
  /** @returns {any} */
  const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
  const categories = [
    category({ id: 'cat_home', kind: 'expense' }),
    category({ id: 'cat_rent', parentId: 'cat_home', fixedCost: true }),
    category({ id: 'cat_repairs', parentId: 'cat_home' }),
    category({ id: 'cat_shopping', kind: 'expense' }),
    category({ id: 'cat_salary', kind: 'income' }),
  ];
  /** @param {string} date @param {number} amount @param {string | null} categoryId @param {any} [o] */
  const t = (date, amount, categoryId, o = {}) => transaction({ date, amount, categoryId, ...o });

  it('counts a spending category\'s movements as spending, a refund reducing it', () => {
    const flows = monthFlows([t('2026-03-02', -10000, 'cat_shopping'), t('2026-03-09', 3000, 'cat_shopping')], categories, '2026-03');

    expect(flows.spending).toBe(7000);
    expect(flows.income).toBe(0);
  });

  it('counts an income category\'s movements as income, a chargeback reducing it', () => {
    const flows = monthFlows([t('2026-03-01', 250000, 'cat_salary'), t('2026-03-05', -20000, 'cat_salary')], categories, '2026-03');

    expect(flows.income).toBe(230000);
    expect(flows.spending).toBe(0);
    expect(flows.left).toBe(230000);
  });

  it('counts uncategorised money by its sign, on a line of its own', () => {
    const flows = monthFlows([t('2026-03-02', -1840, null), t('2026-03-03', 5000, null), t('2026-03-04', -160, null)], categories, '2026-03');

    expect(flows.uncategorisedSpending).toMatchObject({ id: UNCATEGORISED_SPENDING, total: 2000, share: 1 });
    expect(flows.uncategorisedIncome).toMatchObject({ id: UNCATEGORISED_INCOME, total: 5000, share: 1 });
    expect(flows.spending).toBe(2000);
    expect(flows.income).toBe(5000);
  });

  it('gives the Uncategorised lines a change from the previous month too', () => {
    const flows = monthFlows([t('2026-02-02', -1000, null), t('2026-03-02', -1500, null)], categories, '2026-03');

    expect(flows.uncategorisedSpending).toMatchObject({ previous: 1000, change: 500, changeRatio: 0.5 });
  });

  it('measures a change against the size of a negative previous month, not its sign', () => {
    // Last month was a net refund of 30; this month 100 was spent.
    const flows = monthFlows([t('2026-02-10', 3000, 'cat_shopping'), t('2026-03-10', -10000, 'cat_shopping')], categories, '2026-03');

    expect(flows.spendingCategories.find((row) => row.id === 'cat_shopping')).toMatchObject({ previous: -3000, change: 13000 });
    expect(flows.spendingCategories.find((row) => row.id === 'cat_shopping')?.changeRatio).toBeCloseTo(13000 / 3000);
  });

  it('keeps a parent whose subcategories cancel out, so they can still be opened', () => {
    const flows = monthFlows([t('2026-03-01', -5000, 'cat_rent'), t('2026-03-02', 5000, 'cat_repairs')], categories, '2026-03');

    const home = flows.spendingCategories.find((row) => row.id === 'cat_home');
    expect(home?.total).toBe(0);
    expect(home?.children.map((row) => row.id)).toEqual(['cat_rent', 'cat_repairs']);
  });

  it('leaves out transfers and not-counted transactions, and other months', () => {
    const flows = monthFlows(
      [
        t('2026-03-02', -50000, null, { counterAccountId: 'account_y' }),
        t('2026-03-03', -7000, 'cat_shopping', { notCounted: true }),
        t('2026-02-28', -9000, 'cat_shopping'),
        t('2026-04-01', -9000, 'cat_shopping'),
      ],
      categories,
      '2026-03'
    );

    expect(flows).toMatchObject({ income: 0, spending: 0, left: 0 });
  });

  it('rolls a parent up from its subcategories and its own movements, with each one\'s share of the month', () => {
    const flows = monthFlows(
      [t('2026-03-01', -90000, 'cat_rent'), t('2026-03-10', -6000, 'cat_repairs'), t('2026-03-11', -4000, 'cat_home'), t('2026-03-12', -100000, 'cat_shopping')],
      categories,
      '2026-03'
    );

    const home = flows.spendingCategories.find((row) => row.id === 'cat_home');
    expect(home).toMatchObject({ total: 100000, share: 0.5 });
    expect(home?.children.map((row) => [row.id, row.total])).toEqual([['cat_rent', 90000], ['cat_repairs', 6000]]);
    expect(home?.own).toBe(4000);
    expect(flows.spendingCategories.find((row) => row.id === 'cat_shopping')?.share).toBe(0.5);
  });

  it('gives each category\'s change from the previous month, in euros and percent, "n.d." when it was zero', () => {
    const flows = monthFlows(
      [t('2026-02-10', -8000, 'cat_shopping'), t('2026-03-10', -10000, 'cat_shopping'), t('2026-03-01', -90000, 'cat_rent')],
      categories,
      '2026-03'
    );

    expect(flows.spendingCategories.find((row) => row.id === 'cat_shopping')).toMatchObject({ previous: 8000, change: 2000, changeRatio: 0.25 });
    expect(flows.spendingCategories.find((row) => row.id === 'cat_home')).toMatchObject({ previous: 0, change: 90000, changeRatio: null });
  });

  it('lists a category that had money last month and none this month', () => {
    const flows = monthFlows([t('2026-02-10', -8000, 'cat_shopping')], categories, '2026-03');

    expect(flows.spendingCategories).toEqual([
      expect.objectContaining({ id: 'cat_shopping', total: 0, previous: 8000, change: -8000, changeRatio: -1, share: 0 }),
    ]);
  });

  it('splits spending into fixed and variable by each transaction\'s own category, with no inheritance', () => {
    const fixedParent = categories.map((row) => (row.id === 'cat_home' ? { ...row, fixedCost: true } : row));
    const flows = monthFlows(
      [t('2026-03-01', -90000, 'cat_rent'), t('2026-03-10', -6000, 'cat_repairs'), t('2026-03-11', -1000, null)],
      fixedParent,
      '2026-03'
    );

    // Repairs sits under a fixed parent and is still variable; so is uncategorised spending.
    expect(flows.fixed).toBe(90000);
    expect(flows.variable).toBe(7000);
  });
});

describe("which transactions a line of the month holds (#137)", () => {
  /** @returns {any} */
  const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
  const categories = [category({ id: 'cat_home', kind: 'expense' }), category({ id: 'cat_rent', parentId: 'cat_home' })];

  it('holds a category\'s flows and, for a parent, its subcategories\'', () => {
    expect(lineHolds(transaction({ amount: -100, categoryId: 'cat_rent' }), 'cat_home', categories)).toBe(true);
    expect(lineHolds(transaction({ amount: -100, categoryId: 'cat_rent' }), 'cat_rent', categories)).toBe(true);
    expect(lineHolds(transaction({ amount: -100, categoryId: 'cat_home' }), 'cat_rent', categories)).toBe(false);
  });

  it('holds nothing its total leaves out: no transfer, nothing not counted', () => {
    expect(lineHolds(transaction({ amount: -100, categoryId: 'cat_home', notCounted: true }), 'cat_home', categories)).toBe(false);
    expect(lineHolds(transaction({ amount: -100, counterAccountId: 'account_y' }), UNCATEGORISED_SPENDING, categories)).toBe(false);
  });

  it('splits uncategorised money by its direction, a missing category counting as none', () => {
    expect(lineHolds(transaction({ amount: -100 }), UNCATEGORISED_SPENDING, categories)).toBe(true);
    expect(lineHolds(transaction({ amount: -100 }), UNCATEGORISED_INCOME, categories)).toBe(false);
    expect(lineHolds(transaction({ amount: 100, categoryId: 'cat_gone' }), UNCATEGORISED_INCOME, categories)).toBe(true);
  });
});

describe('the savings rate (#137)', () => {
  it('is what was left as a share of income', () => {
    expect(savingsRate({ income: 200000, spending: 150000 })).toBe(0.25);
    expect(savingsRate({ income: 200000, spending: 250000 })).toBe(-0.25);
  });

  it('is blank when income is zero or less', () => {
    expect(savingsRate({ income: 0, spending: 5000 })).toBeNull();
    expect(savingsRate({ income: -100, spending: 0 })).toBeNull();
  });

  it('over 12 months, adds up the selected month and the eleven before it', () => {
    /** @returns {any} */
    const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
    const categories = [category({ id: 'cat_salary', kind: 'income' }), category({ id: 'cat_shopping', kind: 'expense' })];
    const transactions = [
      transaction({ date: '2025-03-31', amount: 999999, categoryId: 'cat_salary' }),
      transaction({ date: '2025-04-01', amount: 100000, categoryId: 'cat_salary' }),
      transaction({ date: '2026-03-31', amount: 100000, categoryId: 'cat_salary' }),
      transaction({ date: '2025-12-15', amount: -150000, categoryId: 'cat_shopping' }),
      transaction({ date: '2026-04-01', amount: -999999, categoryId: 'cat_shopping' }),
    ];

    expect(yearFlows(transactions, categories, '2026-03')).toEqual({ income: 200000, spending: 150000 });
    expect(savingsRate(yearFlows(transactions, categories, '2026-03'))).toBe(0.25);
  });
});

describe('the months the section offers (#137)', () => {
  it('runs from the first transaction\'s month to today\'s, newest first', () => {
    const transactions = [transaction({ date: '2026-01-20' }), transaction({ date: '2025-11-03' })];

    expect(flowMonths(transactions, '2026-02-10')).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('offers today\'s month alone when nothing is recorded, and never a future month', () => {
    expect(flowMonths([], '2026-02-10')).toEqual(['2026-02']);
    expect(flowMonths([transaction({ date: '2026-05-01' })], '2026-02-10')).toEqual(['2026-02']);
  });
});
