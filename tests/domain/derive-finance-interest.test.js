/**
 * A deposit's interest, one row per account and month in the lists (ADR
 * 0056): a statement writes a few cents of interest every day, and often the
 * tax withheld on it as a fee of its own. The lists fold a month's run of
 * them into one net row; nothing is stored and no figure changes. Every row
 * here is invented.
 */

import { describe, expect, it } from 'vitest';

import {
  calendarYearFlows,
  dayColumns,
  financeOverview,
  lineMovements,
  listedTransactions,
  monthFlows,
  movementLines,
  tagFlows,
  uncategorisedCounts,
  yearColumns,
} from '@/lib/domain/derive/finance.js';
import { foldInterest, foldsAsInterest, isInterestMovement } from '@/lib/domain/derive/interest.js';
import { refundPairs } from '@/lib/domain/derive/refunds.js';
import { INTEREST_MOVEMENT_TYPES, limits } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_interest', name: 'Interest', kind: 'income' }),
  category({ id: 'cat_tax', name: 'Taxes', kind: 'expense' }),
  category({ id: 'cat_eating', name: 'Eating out', kind: 'expense' }),
];

/** @returns {Transaction} */
const transaction = (/** @type {any} */ o) => ({
  id: 'transaction_' + o.date + o.amount, date: '2026-10-05', amount: 0, currency: 'EUR', description: '',
  accountId: 'account_current', counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '',
  countedOver: null, origin: null, createdAt: '', updatedAt: '', source: 'integration', ...o,
});

/** The statement's word for interest, whatever the configuration holds first. */
const INTEREST = INTEREST_MOVEMENT_TYPES[0];

/**
 * A day of a deposit's interest as a statement writes it: the interest, and
 * the tax withheld on it as a fee of its own (`:fee`, `part: 'fee'`).
 *
 * @param {string} date
 * @param {{ account?: string, interest?: number, fee?: number }} [options]
 * @returns {Transaction[]} the fee first: newest first within a day is any order
 */
function interestDay(date, { account = 'account_deposit', interest = 16, fee = 4 } = {}) {
  const id = 'transaction_' + account + '_' + date;
  const origin = (/** @type {string} */ suffix, /** @type {Record<string, string>} */ extra) => ({
    source: 'statement', externalId: account + ':' + date + suffix, syncedAt: '', sourceUpdatedAt: null,
    detail: { type: INTEREST, product: 'Deposit', completedAt: date + ' 04:00:00', ...extra },
  });
  return [
    ...(fee === 0
      ? []
      : [transaction({ id: id + '_fee', date, amount: -fee, accountId: account, categoryId: 'cat_tax', description: 'Fee: Interest earned on ' + date, origin: origin(':fee', { part: 'fee' }) })]),
    transaction({ id, date, amount: interest, accountId: account, categoryId: 'cat_interest', description: 'Interest earned on ' + date, origin: origin('', {}) }),
  ];
}

/** @param {string} date @param {number} amount */
const coffee = (date, amount = -350) =>
  transaction({
    id: 'transaction_coffee_' + date, date, amount, categoryId: 'cat_eating', description: 'Corner café',
    origin: { source: 'statement', externalId: 'account_current:' + date, syncedAt: '', sourceUpdatedAt: null, detail: { type: 'Card payment', product: 'Current' } },
  });

/** @param {Transaction[]} rows */
const newestFirst = (rows) => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// November: ten days of interest on the deposit (16 in, 4 withheld), a coffee
// every few days at the same café, and two movements of interest on a
// savings pot -- too few to fold. October: two days on the deposit.
const november = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((day) => interestDay('2026-11-' + String(day).padStart(2, '0'))),
  coffee('2026-11-03'), coffee('2026-11-06'), coffee('2026-11-09'), coffee('2026-11-12'),
  ...interestDay('2026-11-11', { account: 'account_pot', interest: 5, fee: 1 }),
];
const october = [...interestDay('2026-10-30'), ...interestDay('2026-10-31')];
const rows = newestFirst([...november, ...october]);
const selection = { categories, months: ['2026-11'], category: null, tag: null, span: null, max: 50 };

/** @param {any[]} list */
const ids = (list) => list.map((row) => row.id);

describe("what a deposit's interest is (isInterestMovement)", () => {
  it('holds for the interest a statement types as such, and for the fee withheld on it', () => {
    const [fee, interest] = interestDay('2026-11-01');

    expect(isInterestMovement(interest)).toBe(true);
    expect(isInterestMovement(fee)).toBe(true);
  });

  it('reads the word whatever its case, as the bank may shout it', () => {
    const [, interest] = interestDay('2026-11-01');
    const origin = /** @type {NonNullable<Transaction['origin']>} */ (interest.origin);

    expect(isInterestMovement({ ...interest, origin: { ...origin, detail: { type: INTEREST.toUpperCase() } } })).toBe(true);
  });

  it('never holds for repeated purchases at one merchant, a typed movement or another source', () => {
    const [, interest] = interestDay('2026-11-01');
    const origin = /** @type {NonNullable<Transaction['origin']>} */ (interest.origin);

    expect(isInterestMovement(coffee('2026-11-03'))).toBe(false);
    expect(isInterestMovement({ ...interest, origin: null })).toBe(false);
    expect(isInterestMovement({ ...interest, origin: { ...origin, source: 'sheet' } })).toBe(false);
    expect(isInterestMovement({ ...interest, origin: { ...origin, detail: null } })).toBe(false);
    expect(isInterestMovement({ ...interest, origin: { ...origin, detail: { type: 'Interest-free' } } })).toBe(false);
  });

  it('folds only what a flow counts by its own date: never a transfer, a movement not counted or one counted over months', () => {
    const [, interest] = interestDay('2026-11-01');

    expect(foldsAsInterest(interest)).toBe(true);
    expect(foldsAsInterest({ ...interest, counterAccountId: 'account_current' })).toBe(false);
    expect(foldsAsInterest({ ...interest, notCounted: true })).toBe(false);
    expect(foldsAsInterest({ ...interest, countedOver: { from: '2026-10', to: '2026-11' } })).toBe(false);
  });
});

describe('folding a run (foldInterest)', () => {
  it('makes each account and month with enough of them one row, net, where its newest day puts it', () => {
    const { rows: folded, interest } = foldInterest(newestFirst(november), { min: 3 });

    expect(ids(folded)).toEqual([
      'transaction_coffee_2026-11-12',
      'transaction_account_pot_2026-11-11_fee',
      'transaction_account_pot_2026-11-11',
      'interest:account_deposit:2026-11',
      'transaction_coffee_2026-11-09',
      'transaction_coffee_2026-11-06',
      'transaction_coffee_2026-11-03',
    ]);
    expect(folded[3]).toEqual({
      kind: 'interest',
      id: 'interest:account_deposit:2026-11',
      accountId: 'account_deposit',
      month: '2026-11',
      date: '2026-11-10',
      amount: 120,
      count: 20,
      days: 10,
      ids: ids(newestFirst(november).filter((row) => row.accountId === 'account_deposit')),
      categoryIds: ['cat_tax', 'cat_interest'],
    });
    expect(interest).toBe(20);
  });

  it('keeps a run below the minimum as plain rows', () => {
    const { rows: folded, interest } = foldInterest(newestFirst(november), { min: 21 });

    expect(folded).toHaveLength(november.length);
    expect(interest).toBe(0);
  });

  it('lists them plainly when shown, still counting what would fold', () => {
    const plain = newestFirst(november);
    const { rows: shown, interest } = foldInterest(plain, { min: 3, show: true });

    expect(shown).toEqual(plain);
    expect(interest).toBe(20);
  });

  it('leaves a movement it is told to keep as a row of its own', () => {
    const { rows: folded } = foldInterest(newestFirst(november), { min: 3, keep: (row) => row.id === 'transaction_account_deposit_2026-11-05' });

    expect(ids(folded)).toContain('transaction_account_deposit_2026-11-05');
    expect(folded.find((row) => 'kind' in row)).toMatchObject({ count: 19, amount: 104, days: 10 });
  });
});

describe('the Transactions card (listedTransactions)', () => {
  it('shows one net row per account and month with nothing selected, and counts what it folded', () => {
    const listed = listedTransactions(rows, selection);

    expect(listed.rows.filter((row) => 'kind' in row)).toEqual([expect.objectContaining({ id: 'interest:account_deposit:2026-11', amount: 120, count: 20 })]);
    expect(listed.rows).toHaveLength(7);
    expect(listed.interest).toBe(20);
  });

  it('folds each month on its own in a year', () => {
    const listed = listedTransactions(rows, { ...selection, months: ['2026-10', '2026-11'] });

    expect(listed.rows.filter((row) => 'kind' in row).map((row) => [row.id, row.amount, row.count])).toEqual([
      ['interest:account_deposit:2026-11', 120, 20],
      ['interest:account_deposit:2026-10', 24, 4],
    ]);
    expect(listed.interest).toBe(24);
  });

  it('lists every movement when shown', () => {
    const listed = listedTransactions(rows, { ...selection, interest: 'show' });

    expect(listed.rows).toHaveLength(november.length);
    expect(listed.rows.some((row) => 'kind' in row)).toBe(false);
    expect(listed.interest).toBe(20);
  });

  it('caps and counts the rows as shown', () => {
    const listed = listedTransactions(rows, { ...selection, max: 4 });

    expect(ids(listed.rows)).toEqual([
      'transaction_coffee_2026-11-12',
      'transaction_account_pot_2026-11-11_fee',
      'transaction_account_pot_2026-11-11',
      'interest:account_deposit:2026-11',
    ]);
    expect(listed.more).toBe(3);
  });

  it("splits the run by line when a line is selected: each line's row holds only what the line counts", () => {
    const income = listedTransactions(rows, { ...selection, category: 'cat_interest' });
    const tax = listedTransactions(rows, { ...selection, category: 'cat_tax' });

    expect(income.rows).toEqual([
      expect.objectContaining({ id: 'transaction_account_pot_2026-11-11' }),
      expect.objectContaining({ kind: 'interest', amount: 160, count: 10, days: 10, categoryIds: ['cat_interest'] }),
    ]);
    expect(tax.rows).toEqual([
      expect.objectContaining({ id: 'transaction_account_pot_2026-11-11_fee' }),
      expect.objectContaining({ kind: 'interest', amount: -40, count: 10, categoryIds: ['cat_tax'] }),
    ]);
  });

  it('never folds one end of a refund pair, which says what it is', () => {
    // The tax on one day given back, paired with the fee it refunds (ADR 0055).
    const back = transaction({ id: 'transaction_tax_back', date: '2026-11-20', amount: 2, categoryId: 'cat_tax', description: 'Tax adjustment' });
    const all = newestFirst([...november, back]);
    const pairs = refundPairs(all, [{ from: 'transaction_tax_back', to: 'transaction_account_deposit_2026-11-05_fee', rel: 'refund_of' }]);
    const listed = listedTransactions(all, { ...selection, refunds: pairs });

    expect(ids(listed.rows)).toContain('transaction_account_deposit_2026-11-05_fee');
    expect(listed.rows.find((row) => 'kind' in row)).toMatchObject({ count: 19 });
  });
});

describe("a line's movements in place (lineMovements)", () => {
  it('folds each line on its own, at what the line counts', () => {
    const lists = lineMovements(rows, categories, { months: ['2026-11'], lines: ['cat_interest', 'cat_tax', 'cat_eating'], max: 50 });

    expect(lists.get('cat_interest')).toMatchObject({
      rows: [{ id: 'transaction_account_pot_2026-11-11', amount: 5 }, { kind: 'interest', accountId: 'account_deposit', amount: 160, count: 10, days: 10, date: '2026-11-10' }],
      interest: 10,
    });
    expect(lists.get('cat_tax')).toMatchObject({ rows: [{ amount: -1 }, { kind: 'interest', amount: -40 }], interest: 10 });
    // Four coffees at one café are four coffees.
    expect(lists.get('cat_eating')).toMatchObject({ interest: 0 });
    expect(lists.get('cat_eating')?.rows).toHaveLength(4);
  });

  it('caps the rows as shown, and lists them plainly when shown', () => {
    expect(lineMovements(rows, categories, { months: ['2026-11'], lines: ['cat_interest'], max: 1 }).get('cat_interest')).toMatchObject({ rows: [{ amount: 5 }], more: 1 });

    const shown = lineMovements(rows, categories, { months: ['2026-11'], lines: ['cat_interest'], max: 50, interest: 'show' }).get('cat_interest');
    expect(shown?.rows).toHaveLength(11);
    expect(shown?.interest).toBe(10);
  });
});

describe('the figures are display-blind (ADR 0056)', () => {
  it('leaves every figure equal with and without the folding, and a list adds up the same either way', () => {
    const inputs = {
      accounts: [
        { id: 'account_current', name: 'Current', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance', createdAt: '', updatedAt: '', source: 'user' },
        { id: 'account_deposit', name: 'Deposit', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance', createdAt: '', updatedAt: '', source: 'user' },
        { id: 'account_pot', name: 'Pot', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance', createdAt: '', updatedAt: '', source: 'user' },
      ],
      observations: [
        { id: 'observation_deposit', accountId: 'account_deposit', kind: 'balance', amount: 300000, currency: 'EUR', date: '2026-09-30', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user' },
      ],
      trades: [],
      prices: [],
      transactions: rows,
    };
    const figures = () => ({
      month: monthFlows(rows, categories, '2026-11'),
      year: calendarYearFlows(rows, categories, '2026-11', ['2026-10', '2026-11']),
      days: dayColumns(rows, categories, '2026-11', '2026-11-30'),
      months: yearColumns(rows, categories, '2026', ['2026-10', '2026-11']),
      tags: tagFlows(rows, categories, ['2026-11']),
      uncategorised: uncategorisedCounts(rows, categories, ['2026-11']),
      overview: financeOverview(/** @type {any} */ (inputs), '2026-11-30'),
    });
    const before = figures();
    const flows = monthFlows(rows, categories, '2026-11');
    const lines = movementLines(flows);

    const folded = listedTransactions(rows, selection);
    const shown = listedTransactions(rows, { ...selection, interest: 'show' });
    const foldedLines = lineMovements(rows, categories, { months: ['2026-11'], lines, max: 50 });
    const shownLines = lineMovements(rows, categories, { months: ['2026-11'], lines, max: 50, interest: 'show' });

    expect(figures()).toEqual(before);
    /** @param {{ amount: number }[]} list */
    const sum = (list) => list.reduce((total, row) => total + row.amount, 0);
    expect(sum(folded.rows)).toBe(sum(shown.rows));
    for (const line of [...flows.incomeCategories, ...flows.spendingCategories]) {
      const sign = line.id === 'cat_interest' ? 1 : -1;
      expect(sign * sum(foldedLines.get(line.id)?.rows ?? [])).toBe(line.total);
      expect(sign * sum(shownLines.get(line.id)?.rows ?? [])).toBe(line.total);
    }
  });

  it('folds from a small minimum, set in the configuration', () => {
    expect(limits.financeInterestRunMin).toBeGreaterThanOrEqual(2);
  });
});
