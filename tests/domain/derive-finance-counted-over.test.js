/**
 * A movement counted over the months it is for (ADR 0052): its date stays the
 * day the money moved -- balances and net worth follow the bank -- and only
 * the flow readings spread it, in equal whole cents, over its months. Every
 * row here is invented.
 */

import { describe, expect, it } from 'vitest';

import {
  accountValueOn,
  calendarYearFlows,
  countedParts,
  dayColumns,
  financeOverview,
  flowMonths,
  flowTrend,
  lineMovements,
  listedTransactions,
  monthFlows,
  movementLines,
  netWorthOn,
  savingsRate,
  splitEvenly,
  tagFlows,
  totalsBetween,
  uncategorisedCounts,
  UNCATEGORISED_SPENDING,
  yearFlows,
} from '@/lib/domain/derive/finance.js';

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_salary', name: 'Salary', kind: 'income' }),
  category({ id: 'cat_home', name: 'Home', kind: 'expense' }),
  category({ id: 'cat_rent', name: 'Rent', parentId: 'cat_home', fixedCost: true }),
  category({ id: 'cat_insurance', name: 'Insurance', kind: 'expense', fixedCost: true }),
];

/** @returns {any} */
const transaction = (/** @type {any} */ o) => ({
  id: 'tx_' + o.date + o.amount, date: '2026-01-05', amount: 0, currency: 'EUR', description: '',
  accountId: 'account_current', counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '',
  countedOver: null, origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

// Three months' salary arrived at once on 12 November; September spent 800.
const salary = transaction({
  id: 'tx_salary', date: '2026-11-12', amount: 300000, categoryId: 'cat_salary', description: 'Salary Sep-Nov',
  countedOver: { from: '2026-09', to: '2026-11' },
});
const september = [
  transaction({ id: 'tx_rent_sep', date: '2026-09-01', amount: -60000, categoryId: 'cat_rent' }),
  transaction({ id: 'tx_shop_sep', date: '2026-09-14', amount: -20000, categoryId: 'cat_home' }),
];
const rows = [salary, ...september];

describe('the equal split, in whole cents (ADR 0052)', () => {
  it('divides an amount equally, the first months taking the cents left over', () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(100001, 3)).toEqual([33334, 33334, 33333]);
    expect(splitEvenly(300000, 3)).toEqual([100000, 100000, 100000]);
  });

  it('keeps the sign, and never writes a negative zero', () => {
    expect(splitEvenly(-100, 3)).toEqual([-34, -33, -33]);
    const parts = splitEvenly(-2, 3);
    expect(parts).toEqual([-1, -1, 0]);
    expect(Object.is(parts[2], -0)).toBe(false);
  });

  it('always adds up exactly to the amount', () => {
    for (const amount of [1, -1, 7, 99, -12345, 100000, 999999, -500001]) {
      for (let count = 1; count <= 24; count += 1) {
        const parts = splitEvenly(amount, count);
        expect(parts).toHaveLength(count);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amount);
        expect(parts.every(Number.isInteger)).toBe(true);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('refuses a count that is not a whole number of months, and an amount that is not whole cents', () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(100, 1.5)).toThrow();
    expect(() => splitEvenly(10.5, 2)).toThrow();
  });
});

describe('the months a movement counts in (ADR 0052)', () => {
  it('is the month of its date when it says nothing', () => {
    expect(countedParts(transaction({ date: '2026-03-04', amount: -500 }))).toEqual([{ month: '2026-03', amount: -500, index: 1, of: 1 }]);
    const { countedOver, ...older } = transaction({ date: '2026-03-04', amount: -500 });
    expect(countedParts(/** @type {any} */ (older))).toEqual([{ month: '2026-03', amount: -500, index: 1, of: 1 }]);
  });

  it('is each month of its range, with its equal part', () => {
    expect(countedParts(salary)).toEqual([
      { month: '2026-09', amount: 100000, index: 1, of: 3 },
      { month: '2026-10', amount: 100000, index: 2, of: 3 },
      { month: '2026-11', amount: 100000, index: 3, of: 3 },
    ]);
  });
});

describe('the flows read a spread movement in the months it is for (ADR 0052)', () => {
  it('counts a third of the salary in each month, so September no longer spent more than it earned', () => {
    const sep = monthFlows(rows, categories, '2026-09');
    expect(sep).toMatchObject({ income: 100000, spending: 80000, left: 20000, fixed: 60000, variable: 20000 });
    expect(savingsRate(sep)).toBeCloseTo(0.2);
    expect(sep.incomeCategories.find((line) => line.id === 'cat_salary')).toMatchObject({ total: 100000, share: 1 });

    expect(monthFlows(rows, categories, '2026-10').income).toBe(100000);
    // November: its own third, compared with October's.
    expect(monthFlows(rows, categories, '2026-11').incomeCategories[0]).toMatchObject({ total: 100000, previous: 100000, change: 0 });
  });

  it('reads the month of its date as before when it says nothing', () => {
    const plain = { ...salary, countedOver: null };
    expect(monthFlows([plain, ...september], categories, '2026-09').income).toBe(0);
    expect(monthFlows([plain, ...september], categories, '2026-11').income).toBe(300000);
  });

  it('adds up to the amount over its months, the remainder included', () => {
    const odd = { ...salary, amount: 100001 };
    const months = ['2026-09', '2026-10', '2026-11'].map((month) => monthFlows([odd], categories, month).income);
    expect(months).toEqual([33334, 33334, 33333]);
    expect(months.reduce((sum, value) => sum + value, 0)).toBe(100001);
  });

  it('draws each month of the trend with its part, a month holding only a part included', () => {
    const trend = flowTrend(rows, categories, ['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(trend).toEqual([
      { month: '2026-08', income: null, spending: null, left: null },
      { month: '2026-09', income: 100000, spending: 80000, left: 20000 },
      { month: '2026-10', income: 100000, spending: 0, left: 100000 },
      { month: '2026-11', income: 100000, spending: 0, left: 100000 },
    ]);
  });

  it('puts a spread movement on no day of a month\'s columns, and says what is apart (ADR 0053)', () => {
    const today = '2026-11-20';
    const nov = dayColumns(rows, categories, '2026-11', today);
    // Paid on 12 November, but only a third of it is November's: on no day.
    expect(nov.days[11]).toEqual({ day: '2026-11-12', income: 0, spending: 0, movements: 0 });
    expect(nov.apart).toEqual({ income: 100000, spending: 0, movements: 1 });

    const sep = dayColumns(rows, categories, '2026-09', today);
    expect(sep.days[0]).toEqual({ day: '2026-09-01', income: 0, spending: 60000, movements: 1 });
    expect(sep.apart).toEqual({ income: 100000, spending: 0, movements: 1 });
    // The days and what is apart add up to the month.
    const flows = monthFlows(rows, categories, '2026-09');
    expect(sep.days.reduce((sum, day) => sum + (day.income ?? 0), 0) + sep.apart.income).toBe(flows.income);
    expect(sep.days.reduce((sum, day) => sum + (day.spending ?? 0), 0) + sep.apart.spending).toBe(flows.spending);
  });

  it('keeps a movement counted over its own month alone on its day', () => {
    const own = { ...salary, countedOver: { from: '2026-11', to: '2026-11' } };
    expect(dayColumns([own], categories, '2026-11', '2026-11-20').days[11]).toEqual({ day: '2026-11-12', income: 300000, spending: 0, movements: 1 });
  });

  it('reads the twelve months ending with a month by the same parts', () => {
    expect(yearFlows(rows, categories, '2026-10')).toEqual({ income: 200000, spending: 80000 });
    expect(yearFlows(rows, categories, '2027-10')).toEqual({ income: 100000, spending: 0 });
  });

  it('takes only its months of the year in a year reading, across a year boundary', () => {
    // A year's insurance paid on 10 January 2027, for November 2026 to October 2027.
    const insurance = transaction({
      id: 'tx_insurance', date: '2027-01-10', amount: -120000, categoryId: 'cat_insurance',
      countedOver: { from: '2026-11', to: '2027-10' },
    });
    const offered = ['2027-01', '2026-12', '2026-11', '2026-10', '2026-09'];

    const year2026 = calendarYearFlows([insurance], categories, '2026-12', offered);
    expect(year2026.spending).toBe(20000);
    expect(year2026.fixed).toBe(20000);
    const year2027 = calendarYearFlows([insurance], categories, '2027-01', offered);
    expect(year2027.spending).toBe(10000);
  });

  it('spreads a refund like any counted movement, reducing the spending of each of its months', () => {
    const refund = transaction({ date: '2026-03-15', amount: 3000, categoryId: 'cat_home', countedOver: { from: '2026-01', to: '2026-03' } });
    const january = transaction({ date: '2026-01-10', amount: -10000, categoryId: 'cat_home' });

    expect(monthFlows([refund, january], categories, '2026-01').spending).toBe(9000);
    expect(monthFlows([refund, january], categories, '2026-03').spending).toBe(-1000);
  });

  it('has no effect on a transfer or a movement not counted: they are in no flow', () => {
    const transfer = { ...salary, id: 'tx_transfer', categoryId: null, counterAccountId: 'account_savings' };
    const notCounted = { ...salary, id: 'tx_not_counted', notCounted: true };
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      expect(monthFlows([transfer, notCounted], categories, month)).toMatchObject({ income: 0, spending: 0 });
    }
  });

  it('counts a spread movement without a category in each of its months', () => {
    const loose = transaction({ id: 'tx_loose', date: '2026-11-03', amount: -9000, countedOver: { from: '2026-09', to: '2026-11' } });
    expect(uncategorisedCounts([loose], categories, ['2026-09'])).toEqual({ spending: 1, income: 0 });
    expect(monthFlows([loose], categories, '2026-09').uncategorisedSpending.total).toBe(3000);
  });

  it('offers the first month a movement counts in when nothing says when tracking started', () => {
    expect(flowMonths([salary], '2026-11-17').at(-1)).toBe('2026-09');
    expect(flowMonths([salary], '2026-11-17', '2026-10-01').at(-1)).toBe('2026-10');
  });

  it('leaves a week reading by the day the money moved', () => {
    // The week review compares spending by days; a part of a month is not a part of a week.
    expect(totalsBetween(rows, categories, '2026-11-09', '2026-11-15').income).toBe(300000);
    expect(totalsBetween(rows, categories, '2026-09-01', '2026-09-30').income).toBe(0);
  });
});

describe('a spread movement changes no balance and no net worth (ADR 0052)', () => {
  const accounts = [
    { id: 'account_current', name: 'Current', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance', createdAt: '', updatedAt: '', source: 'user' },
  ];
  const observations = [
    { id: 'obs_1', accountId: 'account_current', kind: 'balance', amount: 500000, currency: 'EUR', date: '2026-08-31', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user' },
  ];
  /** @param {any[]} transactions @returns {any} */
  const inputs = (transactions) => ({ accounts, observations, trades: [], prices: [], transactions, trackedSince: '2026-08-01' });
  const plain = [{ ...salary, countedOver: null }, ...september];

  it('values the account by the day the money arrived', () => {
    for (const day of ['2026-09-30', '2026-10-31', '2026-11-11', '2026-11-12', '2026-11-30']) {
      expect(accountValueOn(/** @type {any} */ (accounts[0]), inputs(rows), day)).toEqual(
        accountValueOn(/** @type {any} */ (accounts[0]), inputs(plain), day)
      );
    }
    expect(accountValueOn(/** @type {any} */ (accounts[0]), inputs(rows), '2026-10-31')?.amount).toBe(420000);
    expect(accountValueOn(/** @type {any} */ (accounts[0]), inputs(rows), '2026-11-12')?.amount).toBe(720000);
  });

  it('leaves net worth and its history unchanged', () => {
    expect(netWorthOn(inputs(rows), '2026-10-31')).toEqual(netWorthOn(inputs(plain), '2026-10-31'));
    expect(financeOverview(inputs(rows), '2026-11-17')).toEqual(financeOverview(inputs(plain), '2026-11-17'));
  });
});

describe('a tag reads a spread movement in the months it is for (ADR 0052)', () => {
  const tagged = { ...salary, tags: ['contract'] };

  it('counts its part in the period, and the whole over all time, on its real day', () => {
    expect(tagFlows([tagged], categories, ['2026-09'])).toEqual([
      { tag: 'contract', movements: 1, spending: 0, income: 100000, allMovements: 1, allSpending: 0, allIncome: 300000, first: '2026-11-12', last: '2026-11-12' },
    ]);
    expect(tagFlows([tagged], categories, ['2026-12'])).toEqual([]);
  });
});

describe('the movements a list shows for a line (ADR 0052)', () => {
  it('lists a spread movement under a selected line in every month it counts in, and by date with nothing selected', () => {
    const base = { categories, tag: null, span: null, max: 50 };
    expect(listedTransactions(rows, { ...base, months: ['2026-09'], category: 'cat_salary' }).rows.map((row) => row.id)).toEqual(['tx_salary']);
    expect(listedTransactions(rows, { ...base, months: ['2026-09'], category: null }).rows.map((row) => row.id)).not.toContain('tx_salary');
    expect(listedTransactions(rows, { ...base, months: ['2026-11'], category: null }).rows.map((row) => row.id)).toEqual(['tx_salary']);
    expect(listedTransactions([{ ...salary, tags: ['contract'] }], { ...base, months: ['2026-10'], category: null, tag: 'contract' }).rows).toHaveLength(1);
  });

  it('gives each line asked for its movements of the period, newest first, with the part a spread one counts', () => {
    const lists = lineMovements(rows, categories, { months: ['2026-09'], lines: ['cat_salary', 'cat_rent', 'cat_insurance'], max: 50 });

    expect(lists.get('cat_salary')).toEqual({
      rows: [{ id: 'tx_salary', date: '2026-11-12', description: 'Salary Sep-Nov', amount: 100000, spread: { first: '2026-09', last: '2026-09', index: 1, count: 1, of: 3 }, refund: null }],
      more: 0,
      refunded: 0,
    });
    expect(lists.get('cat_rent')).toEqual({ rows: [{ id: 'tx_rent_sep', date: '2026-09-01', description: '', amount: -60000, spread: null, refund: null }], more: 0, refunded: 0 });
    expect(lists.get('cat_insurance')).toEqual({ rows: [], more: 0, refunded: 0 });
    // Only the lines asked for: Home's own movements were not.
    expect(lists.has('cat_home')).toBe(false);
  });

  it('adds up the parts a period holds, and keeps the same rule as the line\'s total', () => {
    const year = lineMovements(rows, categories, { months: ['2026-09', '2026-10'], lines: ['cat_salary'], max: 50 });
    expect(year.get('cat_salary')?.rows[0]).toMatchObject({ amount: 200000, spread: { first: '2026-09', last: '2026-10', index: 1, count: 2, of: 3 } });
  });

  it('caps a long list at the list limit and says how many more', () => {
    const many = Array.from({ length: 5 }, (_, day) =>
      transaction({ id: 'tx_' + day, date: '2026-09-1' + day, amount: -100 - day, categoryId: 'cat_home' })
    );
    const list = lineMovements(many, categories, { months: ['2026-09'], lines: ['cat_home'], max: 3 }).get('cat_home');

    expect(list?.rows.map((row) => row.id)).toEqual(['tx_4', 'tx_3', 'tx_2']);
    expect(list?.more).toBe(2);
  });

  it('holds the Uncategorised lines by direction, and never a transfer or a movement not counted', () => {
    const loose = [
      transaction({ id: 'tx_out', date: '2026-09-03', amount: -900 }),
      transaction({ id: 'tx_moved', date: '2026-09-04', amount: -900, counterAccountId: 'account_savings' }),
      transaction({ id: 'tx_aside', date: '2026-09-05', amount: -900, notCounted: true }),
    ];
    const list = lineMovements(loose, categories, { months: ['2026-09'], lines: [UNCATEGORISED_SPENDING], max: 50 }).get(UNCATEGORISED_SPENDING);
    expect(list?.rows.map((row) => row.id)).toEqual(['tx_out']);
  });

  it('asks for the lines whose name opens their movements: each subcategory, each line without, and Uncategorised', () => {
    expect(movementLines(monthFlows(rows, categories, '2026-09'))).toEqual(['cat_salary', 'cat_rent', 'uncategorised-income', 'uncategorised-spending']);
  });
});
