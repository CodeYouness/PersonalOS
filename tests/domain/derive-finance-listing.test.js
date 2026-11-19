/**
 * What the Transactions card lists for a month (ADR 0058): a movement not
 * counted is in no total, so the list leaves it out behind a "show" as it
 * leaves out a refunded one; the movement open in the panel is never left
 * out; and a search lists every matching movement of all time, nothing
 * hidden or folded. Display only: no figure changes. Every row here is
 * invented.
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
import { refundPairs } from '@/lib/domain/derive/refunds.js';
import { INTEREST_MOVEMENT_TYPES, limits } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_groceries', name: 'Groceries', kind: 'expense' }),
  category({ id: 'cat_clothes', name: 'Clothes', kind: 'expense' }),
  category({ id: 'cat_interest', name: 'Interest', kind: 'income' }),
];
/** @returns {any} */
const account = (/** @type {any} */ o) => ({ kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance', createdAt: '', updatedAt: '', source: 'user', ...o });
const accounts = [account({ id: 'account_current', name: 'Everyday' }), account({ id: 'account_pot', name: 'Pot' })];

/** @returns {Transaction} */
const transaction = (/** @type {any} */ o) => ({
  id: 'tx', date: '2026-10-05', amount: -1000, currency: 'EUR', description: '', accountId: 'account_current',
  counterAccountId: null, categoryId: null, notCounted: false, countedOver: null, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** A day of a deposit's interest, as a statement types it (ADR 0056). */
const interest = (/** @type {string} */ date) =>
  transaction({
    id: 'tx_interest_' + date, date, amount: 12, accountId: 'account_pot', categoryId: 'cat_interest', description: 'Interest earned',
    origin: { source: 'statement', externalId: 'pot:' + date, syncedAt: '', sourceUpdatedAt: null, detail: { type: INTEREST_MOVEMENT_TYPES[0] } },
  });

// October: groceries, a loan to a friend and its repayment (both not
// counted), money put aside in the pot (a transfer, not flagged), a jacket
// refunded whole, and five days of interest on the pot. September: an older
// grocery run, and an older loan.
const rows = [
  transaction({ id: 'tx_loan_back', date: '2026-10-20', amount: 5000, description: 'Loan repaid by a friend', notCounted: true }),
  transaction({ id: 'tx_jacket_back', date: '2026-10-18', amount: 4000, description: 'Jacket returned' }),
  transaction({ id: 'tx_groceries_2', date: '2026-10-15', amount: -2350, description: 'Grocer', categoryId: 'cat_groceries' }),
  transaction({ id: 'tx_aside', date: '2026-10-12', amount: -10000, description: 'Put aside', counterAccountId: 'account_pot' }),
  transaction({ id: 'tx_jacket', date: '2026-10-10', amount: -4000, description: 'Jacket', categoryId: 'cat_clothes' }),
  ...['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'].map(interest),
  transaction({ id: 'tx_loan', date: '2026-10-04', amount: -5000, description: 'Loan to a friend', notCounted: true }),
  transaction({ id: 'tx_groceries_1', date: '2026-10-02', amount: -1250, description: 'Grocer', categoryId: 'cat_groceries', note: 'Weekly shop' }),
  transaction({ id: 'tx_groceries_0', date: '2026-09-28', amount: -900, description: 'Grocér', categoryId: 'cat_groceries' }),
  transaction({ id: 'tx_loan_old', date: '2026-09-03', amount: -3000, description: 'Loan to a friend', notCounted: true }),
];
const refunds = refundPairs(rows, [{ from: 'tx_jacket_back', to: 'tx_jacket', rel: 'refund_of' }]);
const selection = { categories, accounts, months: ['2026-10'], category: null, tag: null, span: null, max: 50, refunds };

/** @param {{ rows: any[] }} list */
const ids = (list) => list.rows.map((row) => row.id);

describe('a movement not counted, behind a "show" (ADR 0058)', () => {
  it('is left out with nothing selected, and counted so the card can offer it', () => {
    const listed = listedTransactions(rows, selection);

    expect(ids(listed)).toEqual(['tx_groceries_2', 'tx_aside', 'interest:account_pot:2026-10', 'tx_groceries_1']);
    expect(listed.uncounted).toBe(2);
    expect(listed.refunded).toBe(2);
    expect(listed.interest).toBe(5);
  });

  it('keeps a linked transfer that is not flagged', () => {
    expect(ids(listedTransactions(rows, selection))).toContain('tx_aside');
  });

  it('is listed when shown, still counted', () => {
    const listed = listedTransactions(rows, { ...selection, uncounted: 'show' });

    expect(ids(listed)).toEqual(['tx_loan_back', 'tx_groceries_2', 'tx_aside', 'interest:account_pot:2026-10', 'tx_loan', 'tx_groceries_1']);
    expect(listed.uncounted).toBe(2);
  });

  it('caps and counts the rows as shown', () => {
    const hidden = listedTransactions(rows, { ...selection, max: 3 });
    expect(ids(hidden)).toEqual(['tx_groceries_2', 'tx_aside', 'interest:account_pot:2026-10']);
    expect(hidden.more).toBe(1);

    const shown = listedTransactions(rows, { ...selection, uncounted: 'show', max: 3 });
    expect(ids(shown)).toEqual(['tx_loan_back', 'tx_groceries_2', 'tx_aside']);
    expect(shown.more).toBe(3);
  });

  it('is never in a line\'s or a tag\'s list, which hold only counted movements', () => {
    const tagged = rows.map((row) => (row.id === 'tx_loan' || row.id === 'tx_groceries_1' ? { ...row, tags: ['autumn'] } : row));
    expect(ids(listedTransactions(tagged, { ...selection, tag: 'autumn' }))).toEqual(['tx_groceries_1']);
    expect(listedTransactions(tagged, { ...selection, tag: 'autumn' }).uncounted).toBe(0);
    expect(ids(listedTransactions(rows, { ...selection, category: 'cat_groceries' }))).toEqual(['tx_groceries_2', 'tx_groceries_1']);
  });
});

describe('the movement open in the panel is never left out (ADR 0058)', () => {
  it('lists a selected movement not counted, without counting it as hidden', () => {
    const listed = listedTransactions(rows, { ...selection, selected: 'tx_loan' });

    expect(ids(listed)).toContain('tx_loan');
    expect(listed.uncounted).toBe(1);
  });

  it('lists a selected refunded movement the same way', () => {
    const listed = listedTransactions(rows, { ...selection, selected: 'tx_jacket' });

    expect(ids(listed)).toContain('tx_jacket');
    expect(ids(listed)).not.toContain('tx_jacket_back');
    expect(listed.refunded).toBe(1);
    expect(listed.standings.get('tx_jacket')).toMatchObject({ kind: 'purchase', whole: true });
  });
});

describe('a search lists every matching movement of all time (ADR 0058)', () => {
  it('finds across months, newest first, hiding and folding nothing', () => {
    const listed = listedTransactions(rows, { ...selection, query: 'loan' });

    expect(ids(listed)).toEqual(['tx_loan_back', 'tx_loan', 'tx_loan_old']);
    expect(listed).toMatchObject({ more: 0, refunded: 0, uncounted: 0, interest: 0 });
  });

  it('finds a refunded purchase, keeping its standing so it keeps its mark', () => {
    const listed = listedTransactions(rows, { ...selection, query: 'jacket' });

    expect(ids(listed)).toEqual(['tx_jacket_back', 'tx_jacket']);
    expect(listed.standings.get('tx_jacket')).toMatchObject({ kind: 'purchase', whole: true });
    expect(listed.standings.get('tx_jacket_back')).toMatchObject({ kind: 'refund' });
  });

  it('lists interest one by one', () => {
    expect(ids(listedTransactions(rows, { ...selection, query: 'interest earned' }))).toHaveLength(5);
  });

  it('matches accents, notes, categories and amounts', () => {
    expect(ids(listedTransactions(rows, { ...selection, query: 'grocer' }))).toEqual(['tx_groceries_2', 'tx_groceries_1', 'tx_groceries_0']);
    expect(ids(listedTransactions(rows, { ...selection, query: 'weekly' }))).toEqual(['tx_groceries_1']);
    expect(ids(listedTransactions(rows, { ...selection, query: '23,50' }))).toEqual(['tx_groceries_2']);
    expect(ids(listedTransactions(rows, { ...selection, query: 'pot' }))).toHaveLength(6);
  });

  it('caps the matches at the newest, says how many more, and lists them all on the "all" span', () => {
    const capped = listedTransactions(rows, { ...selection, query: 'grocer', max: 2 });
    expect(ids(capped)).toEqual(['tx_groceries_2', 'tx_groceries_1']);
    expect(capped.more).toBe(1);

    const all = listedTransactions(rows, { ...selection, query: 'grocer', max: 2, span: 'all' });
    expect(ids(all)).toHaveLength(3);
    expect(all.more).toBe(0);
  });

  it('ignores the selected line or tag: it searches everything', () => {
    expect(ids(listedTransactions(rows, { ...selection, category: 'cat_groceries', query: 'loan' }))).toEqual(['tx_loan_back', 'tx_loan', 'tx_loan_old']);
  });
});

describe('the figures are display-blind (ADR 0058)', () => {
  it('leaves every figure equal whatever the list hides, shows or finds', () => {
    const inputs = {
      accounts,
      observations: [
        { id: 'observation_current', accountId: 'account_current', kind: 'balance', amount: 300000, currency: 'EUR', date: '2026-08-31', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user' },
      ],
      trades: [],
      prices: [],
      transactions: rows,
      refundLinks: [{ from: 'tx_jacket_back', to: 'tx_jacket', rel: 'refund_of' }],
    };
    const figures = () => ({
      month: monthFlows(rows, categories, '2026-10', refunds),
      year: calendarYearFlows(rows, categories, '2026-10', ['2026-09', '2026-10'], refunds),
      days: dayColumns(rows, categories, '2026-10', '2026-10-31', refunds),
      months: yearColumns(rows, categories, '2026', ['2026-09', '2026-10'], refunds),
      tags: tagFlows(rows, categories, ['2026-10'], refunds),
      uncategorised: uncategorisedCounts(rows, categories, ['2026-10'], refunds),
      lines: lineMovements(rows, categories, { months: ['2026-10'], lines: movementLines(monthFlows(rows, categories, '2026-10', refunds)), max: 50, refunds }),
      overview: financeOverview(/** @type {any} */ (inputs), '2026-10-31'),
    });
    const before = figures();

    listedTransactions(rows, selection);
    listedTransactions(rows, { ...selection, uncounted: 'show', refunded: 'show', interest: 'show' });
    listedTransactions(rows, { ...selection, selected: 'tx_loan' });
    listedTransactions(rows, { ...selection, query: 'loan' });

    expect(figures()).toEqual(before);
  });
});

describe('the cap (ADR 0058)', () => {
  it('lists a hundred rows before it says "the newest"', () => {
    expect(limits.financeListMax).toBe(100);
  });

  it('caps a search query at a length the address can carry', () => {
    expect(limits.financeSearchMaxLength).toBeGreaterThanOrEqual(20);
  });
});
