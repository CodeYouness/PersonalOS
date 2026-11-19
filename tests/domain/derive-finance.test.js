import { describe, expect, it } from 'vitest';

import {
  accountSections,
  allocationAccounts,
  accountStaleSince,
  accountValueOn,
  allocation,
  calendarYearFlows,
  circleArc,
  dayBars,
  dayColumns,
  dayHigh,
  dayMarkFloor,
  dayUnitsReachedZero,
  financeOverview,
  firstDayUnitsGoNegative,
  flowCircle,
  flowMonths,
  flowTrend,
  foldedLines,
  lineAverages,
  lineHolds,
  listedTransactions,
  meetsSavingsTarget,
  monthFlows,
  monthsWith,
  netWorthOn,
  periodInvested,
  quietAccounts,
  savingsRate,
  sparkBars,
  spendingParts,
  tagFlows,
  tagHolds,
  targetShortfall,
  trendBars,
  trendHigh,
  UNCATEGORISED_INCOME,
  UNCATEGORISED_SPENDING,
  uncategorisedCounts,
  WORTH_TICKS_NARROW,
  WORTH_TICKS_WIDE,
  worthChart,
  worthLine,
  worthMonths,
  worthTicks,
  worthTrend,
  yearColumns,
  yearFlows,
  yearMonths,
} from '@/lib/domain/derive/finance.js';
import { monthKeyRange } from '@/lib/domain/dates.js';
import { percent } from '@/lib/domain/format.js';
import { limits } from '@/personalos.config.js';

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

describe('the day a holding ran out of units', () => {
  it('is the day of the trade that took the last unit, or null while units remain or there are no trades', () => {
    const buy = trade({ date: '2026-01-02', direction: 'buy', units: 10 });
    expect(dayUnitsReachedZero([buy, trade({ date: '2026-03-02', direction: 'sell', units: 10 })])).toBe('2026-03-02');
    expect(dayUnitsReachedZero([buy, trade({ date: '2026-03-02', direction: 'sell', units: 4 })])).toBeNull();
    expect(dayUnitsReachedZero([])).toBeNull();
  });

  it('is null again once units come back, and settles a day as a whole', () => {
    expect(
      dayUnitsReachedZero([
        trade({ date: '2026-01-02', direction: 'buy', units: 10 }),
        trade({ date: '2026-03-02', direction: 'sell', units: 10 }),
        trade({ date: '2026-04-02', direction: 'buy', units: 1 }),
      ])
    ).toBeNull();
    expect(
      dayUnitsReachedZero([
        trade({ date: '2026-01-02', direction: 'buy', units: 10 }),
        trade({ date: '2026-03-02', direction: 'buy', units: 6 }),
        trade({ date: '2026-03-02', direction: 'sell', units: 16 }),
      ])
    ).toBe('2026-03-02');
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
      { month: '2026-04', netWorth: 130000, change: 0, measuredAccounts: 1 },
      // The loan was archived on 10 March: it counts before, not at month end.
      { month: '2026-03', netWorth: 130000, change: 70000, measuredAccounts: 1 },
      { month: '2026-02', netWorth: 60000, change: -40000, measuredAccounts: 2 },
      { month: '2026-01', netWorth: 100000, change: null, measuredAccounts: 1 },
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

describe('a selected transaction keeps its own month on offer (#173)', () => {
  it('adds the month of a transaction before "tracked since" or after today, newest first', () => {
    const months = flowMonths([], '2026-10-12', '2026-01-01');

    expect(monthsWith(months, '2025-12')).toEqual([...months, '2025-12']);
    expect(monthsWith(months, '2026-11')).toEqual(['2026-11', ...months]);
  });

  it('leaves the offer as it is when the month is already on it, or there is none', () => {
    const months = ['2026-10', '2026-09'];

    expect(monthsWith(months, '2026-09')).toBe(months);
    expect(monthsWith(months, null)).toBe(months);
  });
});

describe('"tracked since" bounds the history (ADR 0025)', () => {
  const current = account({ id: 'account_current', kind: 'cash' });
  const etf = account({ id: 'account_etf', kind: 'investment', valuation: 'units' });
  const given = {
    accounts: [current, etf],
    observations: [observation({ accountId: 'account_current', amount: 100000, date: '2024-06-30' })],
    trades: [trade({ accountId: 'account_etf', date: '2024-01-15', units: 10 * UNIT, price: 1000 })],
    prices: [],
    transactions: [],
  };

  it('is unchanged when it is not set', () => {
    const overview = financeOverview(given, '2026-02-10');

    expect(overview.history.at(-1)?.month).toBe('2024-01');
    expect(overview.changes.year).not.toBeNull();
  });

  it('starts the monthly history at the first month-end on or after the day', () => {
    const overview = financeOverview({ ...given, trackedSince: '2025-11-12' }, '2026-02-10');

    expect(overview.history.map((row) => row.month)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    // The first month drawn has no change: the month before it was not tracked.
    expect(overview.history.at(-1)?.change).toBeNull();
  });

  it('keeps a holding bought before the day valued with its units after it', () => {
    const overview = financeOverview({ ...given, trackedSince: '2025-11-12' }, '2026-02-10');

    // 10 units at 10.00 plus the 1,000.00 balance.
    expect(overview.history[0].netWorth).toBe(110000);
    expect(overview.accounts.find((row) => row.account.id === 'account_etf')?.value).toBe(10000);
  });

  it('leaves the 1-year change blank when its start falls before the first month-end drawn', () => {
    expect(financeOverview({ ...given, trackedSince: '2025-11-12' }, '2026-02-10').changes.year).toBeNull();
    // A year back is 10 Feb 2025, after the day but before 28 Feb, the first month-end drawn.
    expect(financeOverview({ ...given, trackedSince: '2025-02-05' }, '2026-02-10').changes.year).toBeNull();
    expect(financeOverview({ ...given, trackedSince: '2024-02-01' }, '2026-02-10').changes.year).not.toBeNull();
  });

  it('draws nothing in the sparkline before the day', () => {
    const { sparkline } = financeOverview({ ...given, trackedSince: '2025-11-12' }, '2026-02-10');

    expect(sparkline.filter((value) => value !== null)).toHaveLength(4);
  });

  it('starts the months the section offers at the day, not at earlier transactions', () => {
    expect(flowMonths([transaction({ date: '2025-06-01' })], '2026-02-10', '2025-12-03')).toEqual(['2026-02', '2026-01', '2025-12']);
  });
});

describe('spending over time: the trend, the average, the year', () => {
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
  /** The months on offer from `first` to `last`, newest first, as flowMonths gives them. */
  const offer = (/** @type {string} */ first, /** @type {string} */ last) => flowMonths([], last + '-15', first + '-01');

  describe('a year\'s columns (ADR 0053)', () => {
    const rows = [
      t('2026-01-05', 200000, 'cat_salary'),
      t('2026-01-10', -50000, 'cat_shopping'),
      t('2026-03-01', -20000, 'cat_rent'),
      // After today: in a month the year does not offer.
      t('2026-05-02', -9000, 'cat_shopping'),
    ];

    it('are the twelve months, January first, each read by the month\'s rules where the year offers it', () => {
      const columns = yearColumns(rows, categories, '2026', offer('2025-11', '2026-04'));

      expect(columns.map((row) => row.month)).toEqual(monthKeyRange('2026-01', '2026-12'));
      expect(columns[0]).toEqual({ month: '2026-01', income: 200000, spending: 50000, left: 150000, offered: true });
      expect(columns[1]).toEqual({ month: '2026-02', income: null, spending: null, left: null, offered: true });
      // May is after today: empty and not on offer, its movement nowhere.
      expect(columns[4]).toEqual({ month: '2026-05', income: null, spending: null, left: null, offered: false });
    });

    it('add up to the year\'s totals', () => {
      const offered = offer('2025-11', '2026-04');
      const year = calendarYearFlows(rows, categories, '2026-04', offered);
      const columns = yearColumns(rows, categories, '2026', offered);

      expect(columns.reduce((sum, row) => sum + (row.income ?? 0), 0)).toBe(year.income);
      expect(columns.reduce((sum, row) => sum + (row.spending ?? 0), 0)).toBe(year.spending);
    });

    it('leave out a month before "tracked since"', () => {
      const columns = yearColumns([t('2025-10-03', -4000, 'cat_shopping')], categories, '2025', offer('2025-11', '2026-04'));

      expect(columns[9]).toEqual({ month: '2025-10', income: null, spending: null, left: null, offered: false });
      expect(columns[10].offered).toBe(true);
    });
  });

  describe('a month\'s columns, one per day (ADR 0053)', () => {
    const sum = (/** @type {any[]} */ days, /** @type {'income' | 'spending'} */ key) => days.reduce((total, day) => total + (day[key] ?? 0), 0);

    it('gives each day of the month what came in and went out, by the month\'s rules', () => {
      const { days, apart } = dayColumns(
        [
          t('2026-03-01', 200000, 'cat_salary'),
          t('2026-03-01', -2500, 'cat_shopping'),
          t('2026-03-10', -50000, 'cat_rent'),
          // A refund reduces its day's spending.
          t('2026-03-10', 1000, 'cat_shopping'),
          t('2026-03-12', -700, null),
        ],
        categories,
        '2026-03',
        '2026-04-20'
      );

      expect(days).toHaveLength(31);
      expect(days[0]).toEqual({ day: '2026-03-01', income: 200000, spending: 2500, movements: 2 });
      expect(days[9]).toEqual({ day: '2026-03-10', income: 0, spending: 49000, movements: 2 });
      expect(days[11]).toEqual({ day: '2026-03-12', income: 0, spending: 700, movements: 1 });
      expect(days[1]).toEqual({ day: '2026-03-02', income: 0, spending: 0, movements: 0 });
      expect(apart).toEqual({ income: 0, spending: 0, movements: 0 });
    });

    it('add up to the month\'s totals', () => {
      const rows = [
        t('2026-03-01', 200000, 'cat_salary'),
        t('2026-03-04', -12345, 'cat_repairs'),
        t('2026-03-31', -999, null),
        t('2026-04-01', -5000, 'cat_shopping'),
      ];
      const { days, apart } = dayColumns(rows, categories, '2026-03', '2026-04-20');
      const flows = monthFlows(rows, categories, '2026-03');

      expect(sum(days, 'income') + apart.income).toBe(flows.income);
      expect(sum(days, 'spending') + apart.spending).toBe(flows.spending);
    });

    it('leaves out a transfer and a movement not counted', () => {
      const { days, apart } = dayColumns(
        [
          t('2026-03-03', -30000, null, { counterAccountId: 'account_y' }),
          t('2026-03-04', -9000, 'cat_shopping', { notCounted: true }),
        ],
        categories,
        '2026-03',
        '2026-04-20'
      );

      expect(days.every((day) => day.income === 0 && day.spending === 0 && day.movements === 0)).toBe(true);
      expect(apart.movements).toBe(0);
    });

    it('is a month of empty days when nothing was recorded, a day after today empty rather than zero', () => {
      const { days } = dayColumns([], categories, '2026-04', '2026-04-20');

      expect(days).toHaveLength(30);
      expect(days[19]).toEqual({ day: '2026-04-20', income: 0, spending: 0, movements: 0 });
      expect(days[20]).toEqual({ day: '2026-04-21', income: null, spending: null, movements: 0 });
      expect(days.slice(20).every((day) => day.income === null && day.spending === null)).toBe(true);
    });

    it('draws a day after today that already holds something', () => {
      const { days } = dayColumns([t('2026-04-25', -6000, 'cat_rent')], categories, '2026-04', '2026-04-20');

      expect(days[24]).toEqual({ day: '2026-04-25', income: 0, spending: 6000, movements: 1 });
    });

    it('puts a movement on the day it carries, at the edges of the month too', () => {
      const rows = [t('2026-02-28', -100, 'cat_shopping'), t('2026-03-01', -200, 'cat_shopping'), t('2026-03-31', -300, 'cat_shopping'), t('2026-04-01', -400, 'cat_shopping')];
      const { days } = dayColumns(rows, categories, '2026-03', '2026-04-20');

      expect(days[0]).toMatchObject({ day: '2026-03-01', spending: 200 });
      expect(days[30]).toMatchObject({ day: '2026-03-31', spending: 300 });
      expect(sum(days, 'spending')).toBe(500);
      expect(dayColumns([], categories, '2028-02', '2028-03-01').days.at(-1)?.day).toBe('2028-02-29');
    });
  });

  describe('a month\'s columns drawn (ADR 0053, amended)', () => {
    /** @returns {any} */
    const day = (/** @type {number} */ n, /** @type {number | null} */ income, /** @type {number | null} */ spending) => ({
      day: '2026-03-' + String(n).padStart(2, '0'), income, spending, movements: income === null ? 0 : 1,
    });

    it('scales the spending to the largest day\'s spending: a payday does not flatten the month', () => {
      const days = [day(1, 300000, 2000), day(2, 0, 4000), day(3, 0, 0), day(4, null, null)];

      expect(dayHigh(days)).toBe(4000);
      expect(dayBars(days, 300000)).toEqual([{ spending: 0.5, marked: true }, { spending: 1, marked: false }, { spending: 0, marked: false }, null]);
    });

    it('marks income only when some came in: a net chargeback is no mark and no height', () => {
      expect(dayBars([day(1, -5000, 1000)], -5000)).toEqual([{ spending: 1, marked: false }]);
      expect(dayBars([day(1, 0, -1000)], 0)).toEqual([{ spending: 0, marked: false }]);
    });

    it('draws a month with income and no spending as marks on a zero scale, never NaN', () => {
      const days = [day(1, 300000, 0), day(2, 0, 0), day(3, null, null)];

      expect(dayHigh(days)).toBe(0);
      expect(dayBars(days, 300000)).toEqual([{ spending: 0, marked: true }, { spending: 0, marked: false }, null]);
      expect(dayHigh([])).toBe(0);
      expect(dayBars([], 0)).toEqual([]);
    });

    it('leaves a rent day as tall as it is: no cap, no log scale, two decimals', () => {
      const days = [day(1, 0, 120000), day(2, 0, 1500), day(3, 0, 600)];

      expect(dayHigh(days)).toBe(120000);
      expect(dayBars(days, 0).map((bar) => bar?.spending)).toEqual([1, 0.01, 0.01]);
    });
  });

  describe('which days a month\'s columns mark for income (ADR 0053, amended)', () => {
    /** @returns {any} */
    const day = (/** @type {number} */ n, /** @type {number} */ income) => ({
      day: '2026-03-' + String(n).padStart(2, '0'), income, spending: 0, movements: 1,
    });

    it('marks a day with at least 1% of the month\'s income: exactly at it, and not a cent under', () => {
      // 5,000.00 in over the month: 1% is 50.00 exactly.
      expect(dayMarkFloor(500000)).toBe(5000);
      expect(dayBars([day(1, 5000), day(2, 4999), day(3, 490001)], 500000).map((bar) => bar?.marked)).toEqual([true, false, true]);
    });

    it('rounds the floor up to a whole euro, so the figure the card prints is the rule', () => {
      // 4,886.00 in: 1% is 48.86, a mark from 49.00.
      expect(dayMarkFloor(488600)).toBe(4900);
      expect(dayBars([day(1, 4886), day(2, 4899), day(3, 4900)], 488600).map((bar) => bar?.marked)).toEqual([false, false, true]);
      // A cent over 5,000.00 is a floor over 50.00: 51.00.
      expect(dayMarkFloor(500001)).toBe(5100);
      // Three euros a month: the floor is still a whole euro.
      expect(dayMarkFloor(300)).toBe(100);
    });

    it('leaves the cents of a deposit\'s daily interest unmarked beside a payday', () => {
      const days = [day(1, 300000), ...Array.from({ length: 29 }, (_, index) => day(index + 2, 12))];
      const bars = dayBars(days, 300000 + 29 * 12);

      expect(bars.filter((bar) => bar?.marked)).toHaveLength(1);
      expect(bars[0]?.marked).toBe(true);
    });

    it('marks every day of an income-only month that reaches the floor, on a zero scale', () => {
      const days = [day(1, 100000), day(2, 100000), day(3, 500)];

      // 2,005.00 in: a mark from 21.00.
      expect(dayBars(days, 200500)).toEqual([{ spending: 0, marked: true }, { spending: 0, marked: true }, { spending: 0, marked: false }]);
    });

    it('marks nothing in a month where nothing came in, or more was charged back than received', () => {
      expect(dayMarkFloor(0)).toBeNull();
      expect(dayMarkFloor(-2000)).toBeNull();
      expect(dayBars([day(1, 1000), day(2, -1000)], 0).map((bar) => bar?.marked)).toEqual([false, false]);
    });
  });

  describe('the months of a year', () => {
    it('are the year\'s months on offer: from "tracked since", to today\'s month', () => {
      const offered = offer('2025-11', '2026-04');

      expect(yearMonths(offered, '2026-02')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
      expect(yearMonths(offered, '2025-12')).toEqual(['2025-11', '2025-12']);
    });
  });

  describe('the trend', () => {
    it('gives income, spending and what was left per month, by the month\'s own rules', () => {
      const trend = flowTrend(
        [
          t('2026-01-05', 200000, 'cat_salary'),
          t('2026-01-10', -50000, 'cat_shopping'),
          t('2026-01-12', 10000, 'cat_shopping'),
          t('2026-03-01', -20000, 'cat_rent'),
          t('2026-03-02', -500, null),
        ],
        categories,
        ['2026-01', '2026-03']
      );

      // The refund reduces January's spending; uncategorised money out is spending.
      expect(trend).toEqual([
        { month: '2026-01', income: 200000, spending: 40000, left: 160000 },
        { month: '2026-03', income: 0, spending: 20500, left: -20500 },
      ]);
    });

    it('leaves a month with nothing counted empty -- a transfer and a not-counted movement are nothing', () => {
      const trend = flowTrend(
        [
          t('2026-02-03', -30000, null, { counterAccountId: 'account_y' }),
          t('2026-02-04', -9000, 'cat_shopping', { notCounted: true }),
        ],
        categories,
        ['2026-01', '2026-02']
      );

      expect(trend).toEqual([
        { month: '2026-01', income: null, spending: null, left: null },
        { month: '2026-02', income: null, spending: null, left: null },
      ]);
    });

    it('agrees with the month\'s own figures', () => {
      const transactions = [t('2026-01-05', 200000, 'cat_salary'), t('2026-01-10', -50000, 'cat_home'), t('2026-01-11', -700, null)];
      const flows = monthFlows(transactions, categories, '2026-01');

      expect(flowTrend(transactions, categories, ['2026-01'])[0]).toMatchObject({ income: flows.income, spending: flows.spending, left: flows.left });
    });
  });

  describe('the trend\'s bars', () => {
    it('scales every bar to the highest income or spending drawn, and marks what was left', () => {
      expect(
        trendBars([
          { month: '2026-01', income: 200000, spending: 50000, left: 150000 },
          { month: '2026-02', income: null, spending: null, left: null },
          { month: '2026-03', income: 0, spending: 100000, left: -100000 },
        ])
      ).toEqual([{ income: 1, spending: 0.25, left: 0.75 }, null, { income: 0, spending: 0.5, left: null }]);
    });

    it('draws a net chargeback as no income, and a month of nothing but refunds as no bar, never NaN', () => {
      expect(trendBars([{ month: '2026-01', income: -5000, spending: 20000, left: -25000 }])).toEqual([
        { income: 0, spending: 1, left: null },
      ]);
      expect(trendBars([{ month: '2026-01', income: 0, spending: 0, left: 0 }])).toEqual([{ income: 0, spending: 0, left: null }]);
      expect(trendBars([])).toEqual([]);
    });

    it('rounds to two decimals', () => {
      expect(trendBars([{ month: '2026-01', income: 300000, spending: 100000, left: 200000 }])).toEqual([
        { income: 1, spending: 0.33, left: 0.67 },
      ]);
    });

    it('draws a column with no "left" without its mark, and an empty one as nothing', () => {
      expect(
        trendBars([
          { income: 0, spending: 4000 },
          { income: 8000, spending: 2000 },
          { income: null, spending: null },
        ])
      ).toEqual([{ income: 0, spending: 0.5, left: null }, { income: 1, spending: 0.25, left: null }, null]);
    });

    it('scales to the highest income or spending drawn, which the axis prints', () => {
      expect(
        trendHigh([
          { month: '2026-01', income: 200000, spending: 50000, left: 150000 },
          { month: '2026-02', income: null, spending: null, left: null },
          { month: '2026-03', income: -5000, spending: 250000, left: -255000 },
        ])
      ).toBe(250000);
      expect(trendHigh([{ month: '2026-01', income: null, spending: null, left: null }])).toBe(0);
      expect(trendHigh([])).toBe(0);
    });
  });

  describe('net worth over the trend\'s months', () => {
    const accounts = [account({ id: 'account_current', kind: 'cash' }), account({ id: 'account_pension', kind: 'investment' })];
    const observations = [
      observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-02-10' }),
      observation({ id: 'observation_2', accountId: 'account_current', amount: 150000, date: '2026-04-05' }),
      observation({ id: 'observation_3', accountId: 'account_current', amount: 170000, date: '2026-05-03' }),
    ];
    const inputs = { accounts, observations, trades: [], prices: [], transactions: [] };
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];

    it('reads each month\'s end from the history, the current month as of today', () => {
      const { history } = financeOverview(inputs, '2026-05-12');

      // The pension has no value: it is left out, never counted as zero.
      expect(worthTrend(history, months, '2026-05-12')).toEqual([
        { month: '2026-01', netWorth: null, asOf: null },
        { month: '2026-02', netWorth: 100000, asOf: '2026-02-28' },
        { month: '2026-03', netWorth: 100000, asOf: '2026-03-31' },
        { month: '2026-04', netWorth: 150000, asOf: '2026-04-30' },
        { month: '2026-05', netWorth: 170000, asOf: '2026-05-12' },
      ]);
    });

    it('leaves a month the history does not draw unknown: before "tracked since", or after today', () => {
      const { history } = financeOverview({ ...inputs, trackedSince: '2026-03-15' }, '2026-05-12');

      expect(worthTrend(history, [...months, '2026-06'], '2026-05-12').map((row) => row.netWorth)).toEqual([
        null, null, 100000, 150000, 170000, null,
      ]);
    });

    it('agrees with the monthly history, month for month', () => {
      const { history } = financeOverview(inputs, '2026-05-12');
      const trend = worthTrend(history, months, '2026-05-12');

      for (const row of history) expect(trend.find((each) => each.month === row.month)?.netWorth).toBe(row.netWorth);
    });
  });

  describe('the net worth line', () => {
    /** @param {string} month @param {number | null} netWorth */
    const w = (month, netWorth) => ({ month, netWorth, asOf: netWorth === null ? null : month + '-28' });

    it('scales the line from its lowest month to its highest, leaves an unknown month a gap, and gives the change over the span', () => {
      expect(worthLine([w('2026-01', null), w('2026-02', 100000), w('2026-03', 120000), w('2026-04', null), w('2026-05', 150000)])).toEqual({
        points: [null, 0, 0.4, null, 1],
        low: 100000,
        high: 150000,
        first: w('2026-02', 100000),
        newest: w('2026-05', 150000),
        change: 50000,
      });
    });

    it('keeps a small wobble small: the scale spans at least a tenth of the largest value', () => {
      // 130,000.00 and 130,400.00: a 400.00 difference is not drawn as the chart's full height.
      const line = worthLine([w('2026-01', 13000000), w('2026-02', 13040000)]);

      expect(line.low).toBe(12368000);
      expect(line.high).toBe(13672000);
      expect(line.points).toEqual([0.48, 0.52]);
      expect(line.change).toBe(40000);
    });

    it('draws a flat line in the middle, never NaN', () => {
      expect(worthLine([w('2026-01', 100000), w('2026-02', 100000)]).points).toEqual([0.5, 0.5]);
      expect(worthLine([w('2026-01', 0), w('2026-02', 0)])).toMatchObject({ points: [0.5, 0.5], low: 0, high: 0, change: 0 });
    });

    it('crosses zero on its own scale', () => {
      expect(worthLine([w('2026-01', -50000), w('2026-02', 50000)])).toMatchObject({ points: [0, 1], low: -50000, high: 50000 });
    });

    it('has no change with one known month, and nothing at all with none', () => {
      expect(worthLine([w('2026-01', null), w('2026-02', 80000)])).toMatchObject({ change: null, newest: w('2026-02', 80000) });
      expect(worthLine([w('2026-01', null)])).toEqual({ points: [null], low: null, high: null, first: null, newest: null, change: null });
      expect(worthLine([])).toEqual({ points: [], low: null, high: null, first: null, newest: null, change: null });
    });

    it('rounds to two decimals', () => {
      expect(worthLine([w('2026-01', 0), w('2026-02', 100000), w('2026-03', 300000)]).points).toEqual([0, 0.33, 1]);
    });
  });

  describe('a calendar year, to date', () => {
    const transactions = [
      t('2025-02-01', 180000, 'cat_salary'),
      t('2025-02-03', -60000, 'cat_rent'),
      t('2025-03-04', -20000, 'cat_shopping'),
      t('2025-12-20', -999999, 'cat_shopping'), // last year
      t('2026-01-01', 200000, 'cat_salary'),
      t('2026-01-02', -60000, 'cat_rent'),
      t('2026-02-02', -60000, 'cat_rent'),
      t('2026-02-10', -30000, 'cat_shopping'),
      t('2026-02-12', 5000, 'cat_shopping'),
      t('2026-03-05', -10000, null),
      t('2026-03-06', -40000, null, { counterAccountId: 'account_y' }),
      t('2026-05-01', -999999, 'cat_shopping'), // after today's month: not on offer
    ];

    it('adds up the year\'s months on offer, by the month\'s rules', () => {
      const year = calendarYearFlows(transactions, categories, '2026-02', offer('2025-01', '2026-03'));

      expect(year.months).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(year).toMatchObject({ income: 200000, spending: 155000, left: 45000, fixed: 120000, variable: 35000 });
      expect(year.spendingCategories.find((line) => line.id === 'cat_home')).toMatchObject({ total: 120000 });
      expect(year.spendingCategories.find((line) => line.id === 'cat_shopping')?.share).toBeCloseTo(25000 / 155000);
      expect(year.uncategorisedSpending.total).toBe(10000);
      expect(savingsRate(year)).toBeCloseTo(45000 / 200000);
    });

    it('compares with the same months of the year before, when they were tracked and hold something', () => {
      const year = calendarYearFlows(transactions, categories, '2026-03', offer('2025-01', '2026-03'));

      expect(year.compared).toBe(true);
      // January to March 2025, not the whole of 2025.
      expect(year.spendingCategories.find((line) => line.id === 'cat_home')).toMatchObject({ previous: 60000, change: 60000, changeRatio: 1 });
      expect(year.spendingCategories.find((line) => line.id === 'cat_shopping')).toMatchObject({ previous: 20000, change: 5000 });
    });

    it('compares with nothing when the year before was not tracked, or held nothing counted', () => {
      expect(calendarYearFlows(transactions, categories, '2026-03', offer('2025-11', '2026-03')).compared).toBe(false);
      const onlyTransfers = [t('2025-01-10', -5000, null, { counterAccountId: 'account_y' }), t('2026-01-10', -5000, 'cat_shopping')];
      expect(calendarYearFlows(onlyTransfers, categories, '2026-03', offer('2025-01', '2026-03')).compared).toBe(false);
    });

    it('lists a line only for money this year when there is no comparison', () => {
      const year = calendarYearFlows(transactions, categories, '2025-12', offer('2025-11', '2026-03'));

      expect(year.months).toEqual(['2025-11', '2025-12']);
      expect(year.compared).toBe(false);
      expect(year.spendingCategories.map((line) => [line.id, line.total, line.previous])).toEqual([['cat_shopping', 999999, 0]]);
    });

    it('leaves the month\'s reading as it was: always compared with the month before', () => {
      expect(monthFlows([], categories, '2026-03').compared).toBe(true);
    });
  });

  describe('the composition of spending', () => {
    it('gives each line with money spent its part of the whole, in the table\'s order, Uncategorised last', () => {
      const flows = monthFlows(
        [t('2026-03-01', -60000, 'cat_rent'), t('2026-03-02', -15000, 'cat_repairs'), t('2026-03-03', -25000, null), t('2026-03-04', 3000, 'cat_shopping')],
        categories,
        '2026-03'
      );

      // Shopping is a net refund: it has no part, as a bar cannot be negative.
      expect(spendingParts(flows)).toEqual([
        { id: 'cat_home', name: 'cat_home', amount: 75000, share: 0.75 },
        { id: UNCATEGORISED_SPENDING, name: 'Uncategorised', amount: 25000, share: 0.25 },
      ]);
    });

    it('is empty when nothing was spent', () => {
      expect(spendingParts(monthFlows([], categories, '2026-03'))).toEqual([]);
    });
  });
});

describe('spending by tag', () => {
  /** @returns {any} */
  const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
  const categories = [
    category({ id: 'cat_travel', kind: 'expense' }),
    category({ id: 'cat_hotel', parentId: 'cat_travel' }),
    category({ id: 'cat_salary', kind: 'income' }),
  ];
  /** @param {string} date @param {number} amount @param {string | null} categoryId @param {string[]} tags @param {any} [o] */
  const t = (date, amount, categoryId, tags, o = {}) => transaction({ id: 'tx_' + date + amount, date, amount, categoryId, tags, ...o });
  const transactions = [
    t('2026-02-27', -40000, 'cat_hotel', ['lisbon trip']),
    t('2026-03-02', -12000, 'cat_travel', ['lisbon trip', 'work 2026']),
    t('2026-03-03', 2000, 'cat_travel', ['lisbon trip']), // a refund
    t('2026-03-04', -50000, null, ['lisbon trip'], { counterAccountId: 'account_y' }), // a transfer
    t('2026-03-05', -9000, 'cat_travel', ['lisbon trip'], { notCounted: true }),
    t('2026-03-10', 30000, 'cat_salary', ['work 2026']),
    t('2026-03-11', -3000, null, ['coffee']),
    t('2026-04-01', -5000, 'cat_travel', ['lisbon trip']),
    t('2026-03-12', -7000, 'cat_travel', []),
  ];

  it('counts each tag by the month\'s rules: a refund reduces spending, a transfer and a not-counted movement are left out', () => {
    const lisbon = tagFlows(transactions, categories, ['2026-03']).find((row) => row.tag === 'lisbon trip');

    expect(lisbon).toMatchObject({ movements: 2, spending: 10000, income: 0 });
  });

  it('counts a movement with several tags under each', () => {
    const rows = tagFlows(transactions, categories, ['2026-03']);

    expect(rows.find((row) => row.tag === 'work 2026')).toMatchObject({ movements: 2, spending: 12000, income: 30000 });
    expect(rows.find((row) => row.tag === 'lisbon trip')?.spending).toBe(10000);
  });

  it('lists only the tags with something counted in the period, largest spending first', () => {
    expect(tagFlows(transactions, categories, ['2026-03']).map((row) => [row.tag, row.spending])).toEqual([
      ['work 2026', 12000],
      ['lisbon trip', 10000],
      ['coffee', 3000],
    ]);
    expect(tagFlows(transactions, categories, ['2026-04']).map((row) => row.tag)).toEqual(['lisbon trip']);
    expect(tagFlows(transactions, categories, ['2026-05'])).toEqual([]);
  });

  it('gives each tag its total over all time and its first and last day, a trip rarely fitting one month', () => {
    const lisbon = tagFlows(transactions, categories, ['2026-03']).find((row) => row.tag === 'lisbon trip');

    expect(lisbon).toMatchObject({ allMovements: 4, allSpending: 55000, allIncome: 0, first: '2026-02-27', last: '2026-04-01' });
  });

  it('reads a year as its months', () => {
    const year = tagFlows(transactions, categories, ['2026-01', '2026-02', '2026-03', '2026-04']);

    expect(year.find((row) => row.tag === 'lisbon trip')).toMatchObject({ movements: 4, spending: 55000 });
  });

  it('holds what its total counts, so a tag\'s list is as long as its count', () => {
    const march = transactions.filter((one) => one.date.startsWith('2026-03') && tagHolds(one, 'lisbon trip'));

    expect(march.map((one) => one.amount)).toEqual([-12000, 2000]);
    expect(tagHolds(t('2026-03-01', -100, null, ['other']), 'lisbon trip')).toBe(false);
  });
});

describe('the savings target', () => {
  it('is met when the rate, as it is printed, is at or above the target', () => {
    expect(meetsSavingsTarget(0.25, 20)).toBe(true);
    expect(meetsSavingsTarget(0.2, 20)).toBe(true);
    expect(meetsSavingsTarget(0.15, 20)).toBe(false);
    expect(meetsSavingsTarget(-0.1, 20)).toBe(false);
  });

  it('agrees with the rounding the rate is printed with, at the boundary', () => {
    // 19.5% prints as 20%: it reads as met. 19.49% prints as 19%: it does not.
    expect(percent(savingsRate({ income: 100000, spending: 80500 }) ?? NaN)).toBe('20%');
    expect(meetsSavingsTarget(savingsRate({ income: 100000, spending: 80500 }), 20)).toBe(true);
    expect(meetsSavingsTarget(savingsRate({ income: 100000, spending: 80510 }), 20)).toBe(false);
    for (let spending = 78000; spending <= 82000; spending += 1) {
      const rate = /** @type {number} */ (savingsRate({ income: 100000, spending }));
      expect(meetsSavingsTarget(rate, 20)).toBe(Number(percent(rate).replace('%', '').replace('−', '-')) >= 20);
    }
  });

  it('is blank with no rate or no target', () => {
    expect(meetsSavingsTarget(null, 20)).toBeNull();
    expect(meetsSavingsTarget(0.3, null)).toBeNull();
  });

  it('says what would have to be left to meet it, only when it is not met', () => {
    expect(targetShortfall({ income: 200000, spending: 170000, left: 30000 }, 20)).toEqual({ needed: 40000, more: 10000 });
    // A cent is the least that can be left: the target's share rounds up.
    expect(targetShortfall({ income: 333, spending: 333, left: 0 }, 20)).toEqual({ needed: 67, more: 67 });
    expect(targetShortfall({ income: 100000, spending: 80500, left: 19500 }, 20)).toBeNull();
    expect(targetShortfall({ income: 0, spending: 5000, left: -5000 }, 20)).toBeNull();
    expect(targetShortfall({ income: 200000, spending: 170000, left: 30000 }, null)).toBeNull();
  });
});

describe('a month-end where no account has a value', () => {
  const accounts = [
    account({ id: 'account_old', kind: 'cash', archivedOn: '2026-02-10' }),
    account({ id: 'account_new', kind: 'cash' }),
  ];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_old', amount: 100000, date: '2026-01-05' }),
    observation({ id: 'observation_2', accountId: 'account_new', amount: 300000, date: '2026-04-02' }),
  ];
  const inputs = { accounts, observations, trades: [], prices: [], transactions: [] };
  const months = ['2026-01', '2026-02', '2026-03', '2026-04'];

  it('is a gap in the net worth line, not a zero', () => {
    const { history } = financeOverview(inputs, '2026-04-20');

    expect(worthTrend(history, months, '2026-04-20').map((row) => row.netWorth)).toEqual([100000, null, null, 300000]);
  });

  it('leaves the history\'s own figures as they were', () => {
    const { history } = financeOverview(inputs, '2026-04-20');

    expect(history.map((row) => [row.month, row.netWorth, row.change])).toEqual([
      ['2026-04', 300000, 300000],
      ['2026-03', 0, 0],
      ['2026-02', 0, -100000],
      ['2026-01', 100000, null],
    ]);
  });
});

describe('what the Transactions card lists', () => {
  /** @returns {any} */
  const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
  const categories = [category({ id: 'cat_food', kind: 'expense' })];
  // Newest first, as the store hands them.
  const transactions = [
    transaction({ id: 'tx_5', date: '2026-04-02', amount: -500, categoryId: 'cat_food' }),
    transaction({ id: 'tx_4', date: '2026-03-20', amount: -400, tags: ['trip'] }),
    transaction({ id: 'tx_3', date: '2026-03-10', amount: -300, categoryId: 'cat_food', tags: ['trip'] }),
    transaction({ id: 'tx_2', date: '2026-02-01', amount: -200, tags: ['trip'], counterAccountId: 'account_y' }),
    transaction({ id: 'tx_1', date: '2025-12-01', amount: -100, tags: ['trip'] }),
  ];
  const ids = (/** @type {{ rows: any[] }} */ list) => list.rows.map((row) => row.id);
  const base = { categories, category: null, tag: null, span: null, max: 2 };
  const year = ['2026-01', '2026-02', '2026-03', '2026-04'];

  it('lists only the newest of a month with nothing selected, and says how many more', () => {
    const list = listedTransactions(transactions, { ...base, months: ['2026-03'], max: 1 });

    expect(ids(list)).toEqual(['tx_4']);
    expect(list.more).toBe(1);
    expect(listedTransactions(transactions, { ...base, months: ['2026-03'] })).toEqual({ rows: [transactions[1], transactions[2]], more: 0, refunded: 0, standings: new Map() });
  });

  it('lists only the newest of a year with nothing selected, and says how many more', () => {
    const list = listedTransactions(transactions, { ...base, months: year });

    expect(ids(list)).toEqual(['tx_5', 'tx_4']);
    expect(list.more).toBe(2);
  });

  it('lists the whole period when asked, whatever its length', () => {
    expect(listedTransactions(transactions, { ...base, months: year, span: 'all', max: 1 })).toEqual({
      rows: transactions.slice(0, 4),
      more: 0,
      refunded: 0,
      standings: new Map(),
    });
  });

  it('lists a selected line or tag whole', () => {
    expect(listedTransactions(transactions, { ...base, months: year, category: 'cat_food', max: 1 })).toEqual({
      rows: [transactions[0], transactions[2]],
      more: 0,
      refunded: 0,
      standings: new Map(),
    });
    expect(ids(listedTransactions(transactions, { ...base, months: year, tag: 'trip', max: 1 }))).toEqual(['tx_4', 'tx_3']);
  });

  it('lists a tag\'s counted movements of all time when asked, never a transfer', () => {
    expect(ids(listedTransactions(transactions, { ...base, months: ['2026-03'], tag: 'trip', span: 'all' }))).toEqual([
      'tx_4', 'tx_3', 'tx_1',
    ]);
  });
});

describe('the net worth chart covers all tracked time', () => {
  const accounts = [account({ id: 'account_current', kind: 'cash' })];
  const observations = [
    observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2025-11-20' }),
    observation({ id: 'observation_2', accountId: 'account_current', amount: 160000, date: '2026-03-05' }),
  ];
  const inputs = { accounts, observations, trades: [], prices: [], transactions: [] };

  it('draws every month of the history, oldest first, from the first value to today', () => {
    const { history } = financeOverview(inputs, '2026-04-12');
    const chart = worthChart(history, '2026-04-12');

    expect(worthMonths(history)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']);
    expect(chart.series.map((row) => [row.month, row.netWorth])).toEqual([
      ['2025-11', 100000], ['2025-12', 100000], ['2026-01', 100000], ['2026-02', 100000], ['2026-03', 160000], ['2026-04', 160000],
    ]);
    expect(chart.series[5].asOf).toBe('2026-04-12');
    // The line over the whole span: from the first known month to today.
    expect(chart.line.change).toBe(60000);
    expect(chart.line.first?.month).toBe('2025-11');
  });

  it('starts at "tracked since" once it is set, and grows by itself as months pass', () => {
    const tracked = { ...inputs, trackedSince: '2026-01-01' };

    expect(worthMonths(financeOverview(tracked, '2026-04-12').history)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(worthMonths(financeOverview(tracked, '2026-06-02').history)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ]);
  });

  it('leaves a month-end with no account valued a gap, never a zero', () => {
    const old = account({ id: 'account_old', kind: 'cash', archivedOn: '2026-02-10' });
    const fresh = account({ id: 'account_new', kind: 'cash' });
    const { history } = financeOverview(
      {
        accounts: [old, fresh],
        observations: [
          observation({ id: 'observation_a', accountId: 'account_old', amount: 100000, date: '2026-01-05' }),
          observation({ id: 'observation_b', accountId: 'account_new', amount: 300000, date: '2026-04-02' }),
        ],
        trades: [], prices: [], transactions: [],
      },
      '2026-04-20'
    );

    expect(worthChart(history, '2026-04-20').line.points).toEqual([0, null, null, 1]);
  });

  it('is empty with no history', () => {
    expect(worthChart([], '2026-04-12')).toEqual({
      series: [],
      line: { points: [], low: null, high: null, first: null, newest: null, change: null },
      ticks: [],
    });
  });
});

describe('the net worth chart\'s month labels thin out', () => {
  /** @param {string} from YYYY-MM @param {number} count */
  const run = (from, count) => {
    const months = [from];
    while (months.length < count) {
      const [y, m] = months[months.length - 1].split('-').map(Number);
      months.push(m === 12 ? y + 1 + '-01' : y + '-' + String(m + 1).padStart(2, '0'));
    }
    return months;
  };
  /** @param {ReturnType<typeof worthTicks>} ticks */
  const wide = (ticks) => ticks.map((tick) => tick.month + (tick.year ? '*' : ''));
  /** @param {ReturnType<typeof worthTicks>} ticks */
  const narrow = (ticks) => ticks.filter((tick) => tick.narrow).map((tick) => tick.month + (tick.narrowYear ? '*' : ''));

  it('labels every month up to twelve when wide, the year under January and under the first', () => {
    const ticks = worthTicks(run('2025-12', 12));

    expect(wide(ticks)).toEqual([
      '2025-12*', '2026-01*', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ]);
    expect(ticks.map((tick) => tick.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('when narrow, labels the quarters -- January, April, July, October -- at most four', () => {
    expect(narrow(worthTicks(run('2025-12', 12)))).toEqual(['2026-01*', '2026-04', '2026-07', '2026-10']);
    expect(narrow(worthTicks(run('2026-01', 4)))).toEqual(['2026-01*', '2026-02', '2026-03', '2026-04']);
  });

  it('past twelve months, labels the quarters when wide and every half year when narrow', () => {
    const ticks = worthTicks(run('2025-02', 22));

    expect(wide(ticks)).toEqual(['2025-04*', '2025-07', '2025-10', '2026-01*', '2026-04', '2026-07', '2026-10']);
    expect(narrow(ticks)).toEqual(['2025-07*', '2026-01*', '2026-07']);
  });

  it('labels only each January, or every other one, over years', () => {
    const ticks = worthTicks(run('2017-01', 118));

    expect(wide(ticks)).toEqual(['2017-01*', '2018-01*', '2019-01*', '2020-01*', '2021-01*', '2022-01*', '2023-01*', '2024-01*', '2025-01*', '2026-01*']);
    expect(narrow(ticks)).toEqual(['2020-01*', '2024-01*']);
  });

  it('never labels more than its limits, whatever the span', () => {
    for (let count = 1; count <= 200; count += 1) {
      const ticks = worthTicks(run('2010-05', count));
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.length).toBeLessThanOrEqual(WORTH_TICKS_WIDE);
      expect(ticks.filter((tick) => tick.narrow).length).toBeGreaterThan(0);
      expect(ticks.filter((tick) => tick.narrow).length).toBeLessThanOrEqual(WORTH_TICKS_NARROW);
    }
    expect(worthTicks([])).toEqual([]);
  });
});

describe('the accounts table folds the quiet ones', () => {
  const inputs = {
    accounts: [
      account({ id: 'account_current', kind: 'cash' }),
      account({ id: 'account_old_card', kind: 'cash' }),
      account({ id: 'account_empty', kind: 'cash' }),
      account({ id: 'account_pension', kind: 'investment' }),
      account({ id: 'account_paid_loan', kind: 'liability' }),
      account({ id: 'account_spent_wallet', kind: 'cash' }),
    ],
    observations: [
      observation({ id: 'observation_1', accountId: 'account_current', amount: 100000, date: '2026-01-05' }),
      observation({ id: 'observation_2', accountId: 'account_old_card', amount: 0, date: '2025-06-01' }),
      observation({ id: 'observation_3', accountId: 'account_paid_loan', amount: 0, date: '2026-04-01' }),
      observation({ id: 'observation_4', accountId: 'account_spent_wallet', amount: 2000, date: '2025-12-01' }),
    ],
    trades: [],
    prices: [],
    transactions: [
      // Spent to zero within the last 90 days: not quiet.
      transaction({ id: 'tx_1', accountId: 'account_spent_wallet', amount: -2000, date: '2026-03-01' }),
      // Long ago: does not wake the old card.
      transaction({ id: 'tx_2', accountId: 'account_current', counterAccountId: 'account_old_card', amount: 0, date: '2025-07-01' }),
    ],
  };
  const today = '2026-04-20';
  const { accounts: rows } = financeOverview(inputs, today);
  const ids = (/** @type {{ account: { id: string } }[]} */ list) => list.map((row) => row.account.id);

  it('folds an account worth zero or unknown with nothing recorded on it in the last 90 days', () => {
    const { shown, quiet } = quietAccounts(rows, inputs, { todayKey: today, selectedId: null });

    expect(ids(shown)).toEqual(['account_current', 'account_spent_wallet', 'account_paid_loan']);
    expect(ids(quiet)).toEqual(['account_old_card', 'account_empty', 'account_pension']);
  });

  it('wakes an account with a balance, a trade or a movement on it within the window, a transfer\'s other end included', () => {
    const woken = {
      ...inputs,
      transactions: [
        ...inputs.transactions,
        transaction({ id: 'tx_3', accountId: 'account_current', counterAccountId: 'account_old_card', amount: -100, date: '2026-01-21' }),
      ],
      trades: [trade({ id: 'trade_1', accountId: 'account_pension', date: '2026-04-20' })],
    };

    expect(ids(quietAccounts(rows, woken, { todayKey: today, selectedId: null }).quiet)).toEqual(['account_empty']);
  });

  it('counts the window in days, its first day in, the day before out', () => {
    // 90 days before 20 April is 20 January.
    const at = (/** @type {string} */ date) =>
      ids(quietAccounts(rows, { ...inputs, observations: [...inputs.observations, observation({ id: 'observation_x', accountId: 'account_empty', date })] }, { todayKey: today, selectedId: null }).quiet);

    expect(at('2026-01-20')).not.toContain('account_empty');
    expect(at('2026-01-19')).toContain('account_empty');
    expect(limits.financeQuietAccountDays).toBe(90);
  });

  it('always shows the selected account', () => {
    expect(ids(quietAccounts(rows, inputs, { todayKey: today, selectedId: 'account_empty' }).shown)).toContain('account_empty');
  });
});

describe('a period\'s table folds the lines with nothing in it', () => {
  /** @returns {any} */
  const line = (/** @type {string} */ id, /** @type {number} */ total, /** @type {any[]} */ children = []) => ({
    id, name: id, total, own: total, share: 0, previous: 0, change: total, changeRatio: null, children,
  });

  it('keeps the lines with money in the period and folds the rest, in order, Uncategorised last', () => {
    const lines = [line('cat_home', 100000), line('cat_gym', 0), line('cat_food', -500), line('cat_gifts', 0)];

    expect(foldedLines(lines, line('uncategorised-spending', 0), true)).toEqual({
      lines: [lines[0], lines[2]],
      showUncategorised: false,
      quiet: [lines[1], lines[3], line('uncategorised-spending', 0)],
    });
  });

  it('keeps Uncategorised with money in its place, and folds nothing when nothing is zero', () => {
    const lines = [line('cat_home', 100000)];

    expect(foldedLines(lines, line('uncategorised-spending', 300), true)).toEqual({ lines, showUncategorised: true, quiet: [] });
    expect(foldedLines(lines, line('uncategorised-spending', 0), false)).toEqual({ lines, showUncategorised: false, quiet: [] });
  });
});

describe('the movements without a category', () => {
  /** @type {any[]} */
  const categories = [{ id: 'cat_food', name: 'Food', kind: 'expense', parentId: null, fixedCost: false, archived: false }];
  const transactions = [
    transaction({ id: 'tx_1', date: '2026-03-02', amount: -500 }),
    transaction({ id: 'tx_2', date: '2026-03-03', amount: -700 }),
    transaction({ id: 'tx_3', date: '2026-03-04', amount: 900 }),
    transaction({ id: 'tx_4', date: '2026-03-05', amount: -800, categoryId: 'cat_food' }),
    // Neither a transfer nor a movement not counted needs a category.
    transaction({ id: 'tx_5', date: '2026-03-06', amount: -100, counterAccountId: 'account_y' }),
    transaction({ id: 'tx_6', date: '2026-03-07', amount: -100, notCounted: true }),
    transaction({ id: 'tx_7', date: '2026-02-07', amount: -100 }),
  ];

  it('counts the period\'s counted movements on no category, by direction', () => {
    expect(uncategorisedCounts(transactions, categories, ['2026-03'])).toEqual({ spending: 2, income: 1 });
    expect(uncategorisedCounts(transactions, categories, ['2026-02', '2026-03'])).toEqual({ spending: 3, income: 1 });
    expect(uncategorisedCounts(transactions, categories, ['2026-04'])).toEqual({ spending: 0, income: 0 });
  });
});

describe('the accounts table, by kind', () => {
  const inputs = {
    accounts: [
      account({ id: 'account_loan', kind: 'liability' }),
      account({ id: 'account_current', kind: 'cash' }),
      account({ id: 'account_pension', kind: 'investment' }),
      account({ id: 'account_savings', kind: 'cash' }),
      account({ id: 'account_wallet', kind: 'cash' }),
      account({ id: 'account_crypto', kind: 'investment' }),
    ],
    observations: [
      observation({ id: 'observation_1', accountId: 'account_current', amount: 120000, date: '2026-04-01' }),
      observation({ id: 'observation_2', accountId: 'account_savings', amount: 500000, date: '2026-03-01' }),
      // An overdraft lowers the cash subtotal.
      observation({ id: 'observation_3', accountId: 'account_wallet', amount: -2000, date: '2026-04-10' }),
      observation({ id: 'observation_4', accountId: 'account_loan', amount: 715000, date: '2026-02-01' }),
    ],
    trades: [],
    prices: [],
    transactions: [],
  };
  const today = '2026-04-20';
  const overview = financeOverview(inputs, today);
  const ids = (/** @type {{ account: { id: string } }[]} */ list) => list.map((row) => row.account.id);

  it('groups the accounts as net worth is written -- cash, invested, other assets, debt -- leaving out a kind with none', () => {
    const sections = accountSections(overview, overview.accounts);

    expect(sections.map((section) => [section.kind, section.part, ids(section.rows)])).toEqual([
      ['cash', 'cash', ['account_current', 'account_savings', 'account_wallet']],
      ['investment', 'invested', ['account_pension', 'account_crypto']],
      ['liability', 'debt', ['account_loan']],
    ]);
  });

  it('subtotals each kind with the allocation bar\'s own amount, a debt as what is owed', () => {
    const sections = accountSections(overview, overview.accounts);
    const parts = allocation(overview);

    expect(sections.find((section) => section.kind === 'cash')?.subtotal).toBe(120000 + 500000 - 2000);
    expect(sections.find((section) => section.kind === 'liability')?.subtotal).toBe(715000);
    for (const section of sections) {
      if (section.subtotal === null) continue;
      expect(section.subtotal).toBe(parts.find((part) => part.key === section.part)?.amount);
    }
  });

  it('leaves an unknown value out of the subtotal, and a kind with no value at all is unknown, not zero', () => {
    const sections = accountSections(overview, overview.accounts);

    expect(sections.find((section) => section.kind === 'investment')?.subtotal).toBeNull();
    const known = financeOverview({ ...inputs, observations: [...inputs.observations, observation({ id: 'observation_5', accountId: 'account_pension', amount: 300000, date: '2026-04-02' })] }, today);
    expect(accountSections(known, known.accounts).find((section) => section.kind === 'investment')?.subtotal).toBe(300000);
  });

  it('groups any list of the rows -- the folded ones too -- and keeps the subtotal of the whole kind', () => {
    const shown = overview.accounts.filter((row) => row.account.id !== 'account_savings');

    expect(accountSections(overview, shown).find((section) => section.kind === 'cash')?.subtotal).toBe(120000 + 500000 - 2000);
    expect(accountSections(overview, [])).toEqual([]);
  });

  describe('what each part of the allocation bar is made of (ADR 0053)', () => {
    const named = financeOverview(
      {
        ...inputs,
        accounts: inputs.accounts.map((each) => ({ ...each, name: each.id.replace('account_', '') })),
        observations: [...inputs.observations, observation({ id: 'observation_5', accountId: 'account_crypto', amount: 40000, date: '2026-04-02' })],
      },
      today
    );

    it('lists each part\'s accounts with a value, largest first, adding up to the part', () => {
      const parts = allocationAccounts(named);

      expect(parts.map((part) => part.part)).toEqual(['cash', 'invested', 'debt']);
      const cash = /** @type {any} */ (parts[0]);
      expect(cash.accounts).toEqual([
        { id: 'account_savings', name: 'savings', value: 500000 },
        { id: 'account_current', name: 'current', value: 120000 },
        { id: 'account_wallet', name: 'wallet', value: -2000 },
      ]);
      for (const part of parts) {
        expect(part.accounts.reduce((total, row) => total + row.value, 0)).toBe(part.amount);
        expect(part.amount).toBe(allocation(named).find((row) => row.key === part.part)?.amount);
      }
    });

    it('leaves an account with no value out, counting it as unknown, never as zero', () => {
      const invested = /** @type {any} */ (allocationAccounts(named).find((part) => part.part === 'invested'));

      expect(invested.accounts).toEqual([{ id: 'account_crypto', name: 'crypto', value: 40000 }]);
      expect(invested.unknown).toBe(1);
      expect(allocationAccounts(overview).find((part) => part.part === 'invested')).toEqual({ part: 'invested', amount: null, accounts: [], unknown: 2 });
    });

    it('leaves an account worth exactly zero out: it makes up nothing', () => {
      const zero = financeOverview({ ...inputs, observations: [...inputs.observations, observation({ id: 'observation_6', accountId: 'account_crypto', amount: 0, date: '2026-04-02' })] }, today);

      expect(allocationAccounts(zero).find((part) => part.part === 'invested')).toEqual({ part: 'invested', amount: 0, accounts: [], unknown: 1 });
    });

    it('lists a debt as what is owed', () => {
      expect(allocationAccounts(named).find((part) => part.part === 'debt')?.accounts).toEqual([{ id: 'account_loan', name: 'loan', value: 715000 }]);
    });
  });
});

describe('an account nobody has updated in a while', () => {
  /** @returns {any} */
  const row = (/** @type {string | null} */ valueDate) => ({ account: account({}), value: valueDate === null ? null : 100, valueDate, change30d: null });

  it('is stale from the day after its value is 35 days old, and says since when', () => {
    // 35 days before 20 April is 16 March.
    expect(accountStaleSince(row('2026-03-16'), '2026-04-20')).toBeNull();
    expect(accountStaleSince(row('2026-03-15'), '2026-04-20')).toBe('2026-03-15');
    expect(accountStaleSince(row('2026-04-20'), '2026-04-20')).toBeNull();
    expect(limits.financeStaleAccountDays).toBe(35);
  });

  it('is never stale while unknown: it already says so', () => {
    expect(accountStaleSince(row(null), '2026-04-20')).toBeNull();
  });
});

describe('what was invested in a period, from the trades (ADR 0050)', () => {
  const trades = [
    // 2 units at 100.00, a 1.50 fee: 201.50 out of pocket.
    trade({ id: 'trade_1', date: '2026-03-05', direction: 'buy', units: 2 * UNIT, price: 10000, fee: 150 }),
    // Half a unit at 3.33: 1.665, rounded half up to 1.67, no fee.
    trade({ id: 'trade_2', date: '2026-03-20', direction: 'buy', units: UNIT / 2, price: 333, accountId: 'account_btc' }),
    // 1 unit at 120.00, a 1.00 fee: 119.00 back.
    trade({ id: 'trade_3', date: '2026-04-02', direction: 'sell', units: UNIT, price: 12000, fee: 100 }),
    trade({ id: 'trade_4', date: '2026-02-27', direction: 'buy', units: UNIT, price: 5000, fee: 0 }),
  ];

  it('adds up a month\'s buys at what they cost, fees included, across every holding', () => {
    expect(periodInvested(trades, ['2026-03'])).toEqual({ bought: 20317, sold: 0, net: 20317 });
  });

  it('takes a sell\'s proceeds, its fee taken off, from the buys', () => {
    expect(periodInvested(trades, ['2026-04'])).toEqual({ bought: 0, sold: 11900, net: -11900 });
  });

  it('reads a year as the sum of its months', () => {
    expect(periodInvested(trades, ['2026-01', '2026-02', '2026-03', '2026-04'])).toEqual({ bought: 25317, sold: 11900, net: 13417 });
  });

  it('is nothing in a period with no trades', () => {
    expect(periodInvested(trades, ['2026-05'])).toEqual({ bought: 0, sold: 0, net: 0 });
    expect(periodInvested([], ['2026-03'])).toEqual({ bought: 0, sold: 0, net: 0 });
  });
});

describe('the circle of a period: what came in, split into spent, invested and kept (ADR 0050)', () => {
  /** @param {number} income @param {number} spending */
  const flows = (income, spending) => ({ income, spending });
  /** @param {number} bought @param {number} [sold] */
  const put = (bought, sold = 0) => ({ bought, sold, net: bought - sold });
  /** @param {ReturnType<typeof flowCircle>} circle */
  const drawn = (circle) => circle.parts.map((part) => [part.key, part.amount, part.start, part.end]);

  it('splits the income, clockwise from the top: spent, invested, kept', () => {
    const circle = flowCircle(flows(300000, 150000), put(50000));

    expect(circle.state).toBe('parts');
    expect(circle.income).toBe(300000);
    expect(drawn(circle)).toEqual([
      ['spent', 150000, 0, 0.5],
      ['invested', 50000, 0.5, 0.6667],
      ['kept', 100000, 0.6667, 1],
    ]);
    expect(circle.parts.map((part) => part.name)).toEqual(['Spent', 'Invested', 'Kept']);
    expect(circle.parts.map((part) => part.share)).toEqual([0.5, 50000 / 300000, 100000 / 300000]);
    expect(circle).toMatchObject({ overspent: 0, excess: null, fromSavings: 0, sold: 0 });
  });

  it('draws the whole circle as spent when spending passes income, and the excess as an arc outside it', () => {
    const circle = flowCircle(flows(100000, 130000), put(0));

    expect(drawn(circle)).toEqual([
      ['spent', 130000, 0, 1],
      ['invested', 0, 1, 1],
      ['kept', 0, 1, 1],
    ]);
    expect(circle.parts[0].share).toBe(1.3);
    expect(circle.overspent).toBe(30000);
    expect(circle.excess).toBe(0.3);
  });

  it('caps the outer arc at a full turn when spending is more than twice the income', () => {
    const circle = flowCircle(flows(100000, 350000), put(0));

    expect(circle.overspent).toBe(250000);
    expect(circle.excess).toBe(1);
  });

  it('has no parts to draw without income, and says what was spent', () => {
    const circle = flowCircle(flows(0, 5000), put(0));

    expect(circle.state).toBe('no-income');
    expect(circle.income).toBe(0);
    expect(drawn(circle)).toEqual([
      ['spent', 5000, 0, 0],
      ['invested', 0, 0, 0],
      ['kept', 0, 0, 0],
    ]);
    expect(circle.parts.every((part) => part.share === null)).toBe(true);
    expect(circle).toMatchObject({ overspent: 5000, excess: null });
    // A net chargeback is no income either.
    expect(flowCircle(flows(-2000, 0), put(0)).state).toBe('no-income');
  });

  it('caps what was invested at what spending left, and says how much came from earlier savings', () => {
    const circle = flowCircle(flows(100000, 80000), put(50000));

    expect(drawn(circle)).toEqual([
      ['spent', 80000, 0, 0.8],
      ['invested', 50000, 0.8, 1],
      ['kept', 0, 1, 1],
    ]);
    expect(circle.fromSavings).toBe(30000);
  });

  it('reads all of an investment in an overspent period as from earlier savings', () => {
    const circle = flowCircle(flows(100000, 120000), put(40000));

    expect(circle.fromSavings).toBe(40000);
    expect(circle.parts[1]).toMatchObject({ amount: 40000, start: 1, end: 1 });
  });

  it('invests nothing in a period that sold more than it bought, and says what was sold', () => {
    const circle = flowCircle(flows(300000, 100000), put(10000, 40000));

    expect(drawn(circle)).toEqual([
      ['spent', 100000, 0, 0.3333],
      ['invested', 0, 0.3333, 0.3333],
      ['kept', 200000, 0.3333, 1],
    ]);
    expect(circle.sold).toBe(30000);
  });

  it('is empty when nothing came in, went out or was invested', () => {
    const circle = flowCircle(flows(0, 0), put(0));

    expect(circle.state).toBe('empty');
    expect(circle).toMatchObject({ overspent: 0, excess: null, fromSavings: 0, sold: 0 });
  });

  it('reads the savings rate\'s saved as invested and kept together', () => {
    const circle = flowCircle(flows(300000, 150000), put(50000));

    expect(circle.parts[1].amount + circle.parts[2].amount).toBe(300000 - 150000);
  });
});

describe('the circle\'s arcs (ADR 0050)', () => {
  it('draws an arc clockwise from the top, at a radius around a centre', () => {
    expect(circleArc(0, 0.25, 40, 50)).toBe('M 50 10 A 40 40 0 0 1 90 50');
    expect(circleArc(0.25, 0.5, 40, 50)).toBe('M 90 50 A 40 40 0 0 1 50 90');
  });

  it('takes the long way round past half a turn', () => {
    expect(circleArc(0, 0.75, 40, 50)).toBe('M 50 10 A 40 40 0 1 1 10 50');
  });

  it('draws a full turn as two halves, which one arc cannot', () => {
    expect(circleArc(0, 1, 40, 50)).toBe('M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10');
  });

  it('draws nothing for nothing', () => {
    expect(circleArc(0.5, 0.5, 40, 50)).toBe('');
  });

  it('rounds to two decimals', () => {
    expect(circleArc(0, 1 / 3, 40, 50)).toBe('M 50 10 A 40 40 0 0 1 84.64 70');
  });
});

describe('a line\'s average month in a year (ADR 0050)', () => {
  /** @returns {any} */
  const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
  const categories = [
    category({ id: 'cat_home', kind: 'expense' }),
    category({ id: 'cat_rent', parentId: 'cat_home' }),
    category({ id: 'cat_salary', kind: 'income' }),
  ];
  const offered = flowMonths([], '2026-03-15', '2026-01-01');
  const transactions = [
    transaction({ date: '2026-01-02', amount: -60000, categoryId: 'cat_rent' }),
    transaction({ date: '2026-02-02', amount: -40000, categoryId: 'cat_rent' }),
    transaction({ date: '2026-02-03', amount: -10001, categoryId: 'cat_home' }),
    transaction({ date: '2026-01-01', amount: 300000, categoryId: 'cat_salary' }),
    transaction({ date: '2026-03-05', amount: -900 }),
  ];

  it('is each line\'s total over the year\'s months on offer, a subcategory and Uncategorised included, rounded to a cent', () => {
    const year = calendarYearFlows(transactions, categories, '2026-03', offered);
    const averages = lineAverages(year);

    expect(year.months).toHaveLength(3);
    expect(averages.get('cat_home')).toBe(36667); // 1,100.01 / 3
    expect(averages.get('cat_rent')).toBe(33333);
    expect(averages.get('cat_salary')).toBe(100000);
    expect(averages.get(UNCATEGORISED_SPENDING)).toBe(300);
    expect(averages.get(UNCATEGORISED_INCOME)).toBe(0);
  });
});
