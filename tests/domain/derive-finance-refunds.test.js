/**
 * A refund paired with the purchase it gives money back for (ADR 0055): it
 * counts as a reduction of the purchase's spending, in the purchase's
 * category, on its own date, and the lists leave the pair out unless asked.
 * Every row here is invented.
 */

import { describe, expect, it } from 'vitest';

import {
  calendarYearFlows,
  dayColumns,
  lineHolds,
  lineMovements,
  listedTransactions,
  monthFlows,
  tagFlows,
  totalsBetween,
  uncategorisedCounts,
  UNCATEGORISED_INCOME,
  UNCATEGORISED_SPENDING,
  yearFlows,
} from '@/lib/domain/derive/finance.js';
import {
  hiddenAsRefunded,
  NO_REFUNDS,
  refundCandidates,
  refundedAmount,
  pairBrokenBy,
  refundPairs,
  refundPanel,
  refundRefusal,
  refundStanding,
} from '@/lib/domain/derive/refunds.js';

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_salary', name: 'Salary', kind: 'income' }),
  category({ id: 'cat_shopping', name: 'Shopping', kind: 'expense' }),
  category({ id: 'cat_clothes', name: 'Clothes', parentId: 'cat_shopping' }),
  category({ id: 'cat_eating', name: 'Eating out', kind: 'expense' }),
];

/** @returns {import('@/lib/domain/types.js').Transaction} */
const transaction = (/** @type {any} */ o) => ({
  id: 'transaction_' + o.date + o.amount, date: '2026-10-05', amount: 0, currency: 'EUR', description: '',
  accountId: 'account_current', counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '',
  countedOver: null, origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

/** @param {string} from @param {string} to */
const link = (from, to) => ({ from, to, rel: 'refund_of' });

// A jacket bought for 41.97 on 3 October, filed under Clothes.
const jacket = transaction({ id: 'transaction_jacket', date: '2026-10-03', amount: -4197, categoryId: 'cat_clothes', description: 'Jacket' });
const dinner = transaction({ id: 'transaction_dinner', date: '2026-10-04', amount: -3000, categoryId: 'cat_eating', description: 'Dinner' });

/** @param {import('@/lib/domain/types.js').Transaction[]} rows @param {[string, string][]} pairs */
const read = (rows, pairs) => refundPairs(rows, pairs.map(([from, to]) => link(from, to)));

/** @param {ReturnType<typeof monthFlows>} flows @param {string} id */
const line = (flows, id) => [...flows.spendingCategories, ...flows.incomeCategories].flatMap((row) => [row, ...row.children]).find((row) => row.id === id);

describe('reading the pairs (ADR 0055)', () => {
  it('reads each refund_of link both ways, the refunds of a purchase oldest first', () => {
    const later = transaction({ id: 'transaction_back_2', date: '2026-10-20', amount: 500 });
    const first = transaction({ id: 'transaction_back_1', date: '2026-10-10', amount: 262 });
    const pairs = read([jacket, later, first], [['transaction_back_2', 'transaction_jacket'], ['transaction_back_1', 'transaction_jacket']]);

    expect(pairs.purchaseOf.get('transaction_back_1')).toBe(jacket);
    expect(pairs.refundsOf.get('transaction_jacket')?.map((row) => row.id)).toEqual(['transaction_back_1', 'transaction_back_2']);
    expect(refundedAmount('transaction_jacket', pairs)).toBe(762);
  });

  it('pairs nothing for a link whose end is not among the movements, or another relation', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-10', amount: 262 });
    const pairs = refundPairs([back], [link('transaction_back', 'transaction_gone'), { from: 'transaction_back', to: 'transaction_jacket', rel: 'about' }]);

    expect(pairs.purchaseOf.size).toBe(0);
    expect(pairs.refundsOf.size).toBe(0);
  });
});

describe('a paired refund counts where its purchase counts (ADR 0055)', () => {
  it('a full refund in the same month nets the line, its parent and the spending to zero', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 4197, categoryId: 'cat_clothes' });
    const rows = [jacket, back];
    const flows = monthFlows(rows, categories, '2026-10', read(rows, [['transaction_back', 'transaction_jacket']]));

    // A line at zero this month and the last is not listed (periodFlows).
    expect(line(flows, 'cat_clothes')).toBeUndefined();
    expect(line(flows, 'cat_shopping')).toBeUndefined();
    expect(flows.spending).toBe(0);
    expect(flows.income).toBe(0);
  });

  it('a partial refund reduces the line by what came back', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 262 });
    const rows = [jacket, dinner, back];
    const flows = monthFlows(rows, categories, '2026-10', read(rows, [['transaction_back', 'transaction_jacket']]));

    expect(line(flows, 'cat_clothes')?.total).toBe(3935);
    expect(flows.spending).toBe(3935 + 3000);
    expect(flows.uncategorisedIncome.total).toBe(0);
  });

  it('a refund in a later month reduces that month, not the purchase\'s', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-11-02', amount: 1000 });
    const rows = [jacket, back];
    const pairs = read(rows, [['transaction_back', 'transaction_jacket']]);

    expect(line(monthFlows(rows, categories, '2026-10', pairs), 'cat_clothes')?.total).toBe(4197);
    const november = monthFlows(rows, categories, '2026-11', pairs);
    expect(line(november, 'cat_clothes')?.total).toBe(-1000);
    expect(november.spending).toBe(-1000);
    expect(november.income).toBe(0);
  });

  it('a purchase not counted takes its refund out of every flow', () => {
    const quiet = { ...jacket, notCounted: true };
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 1000 });
    const rows = [quiet, back];
    const pairs = read(rows, [['transaction_back', 'transaction_jacket']]);
    const flows = monthFlows(rows, categories, '2026-10', pairs);

    expect(flows.spending).toBe(0);
    expect(flows.income).toBe(0);
    expect(flows.uncategorisedIncome.total).toBe(0);
    expect(uncategorisedCounts(rows, categories, ['2026-10'], pairs)).toEqual({ spending: 0, income: 0 });
    expect(totalsBetween(rows, categories, '2026-10-01', '2026-10-31', pairs).flows).toBe(0);
  });

  it('counts under the purchase\'s category whatever the refund carries, which is left as it is', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 1000, categoryId: 'cat_salary' });
    const rows = [jacket, back];
    const flows = monthFlows(rows, categories, '2026-10', read(rows, [['transaction_back', 'transaction_jacket']]));

    expect(line(flows, 'cat_clothes')?.total).toBe(3197);
    expect(line(flows, 'cat_salary')).toBeUndefined();
    expect(flows.income).toBe(0);
    expect(back.categoryId).toBe('cat_salary');
    // Unpaired, it is what it says it is: income.
    expect(monthFlows(rows, categories, '2026-10').income).toBe(1000);
  });

  it('a refund of an uncategorised purchase reduces uncategorised spending, never income', () => {
    const coffee = transaction({ id: 'transaction_coffee', date: '2026-10-03', amount: -800 });
    const back = transaction({ id: 'transaction_back', date: '2026-10-04', amount: 300 });
    const rows = [coffee, back];
    const pairs = read(rows, [['transaction_back', 'transaction_coffee']]);
    const flows = monthFlows(rows, categories, '2026-10', pairs);

    expect(flows.uncategorisedSpending.total).toBe(500);
    expect(flows.uncategorisedIncome.total).toBe(0);
    expect(flows.income).toBe(0);
    expect(lineHolds(back, UNCATEGORISED_SPENDING, categories, pairs)).toBe(true);
    expect(lineHolds(back, UNCATEGORISED_INCOME, categories, pairs)).toBe(false);
    expect(uncategorisedCounts(rows, categories, ['2026-10'], pairs)).toEqual({ spending: 2, income: 0 });
  });

  it('counts on its own date when the purchase is counted over several months', () => {
    const spread = { ...jacket, countedOver: { from: '2026-10', to: '2026-12' } };
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 600 });
    const rows = [spread, back];
    const pairs = read(rows, [['transaction_back', 'transaction_jacket']]);

    // 41.97 over three months is 13.99 each; the refund lands whole in October.
    expect(line(monthFlows(rows, categories, '2026-10', pairs), 'cat_clothes')?.total).toBe(1399 - 600);
    expect(line(monthFlows(rows, categories, '2026-11', pairs), 'cat_clothes')?.total).toBe(1399);
  });

  it('every reading agrees: the year, the twelve months, the days, a tag and a week', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 262, tags: ['autumn'] });
    const tagged = { ...jacket, tags: ['autumn'] };
    const rows = [tagged, back];
    const pairs = read(rows, [['transaction_back', 'transaction_jacket']]);

    expect(calendarYearFlows(rows, categories, '2026-10', ['2026-10'], pairs).spending).toBe(3935);
    expect(yearFlows(rows, categories, '2026-10', pairs)).toEqual({ income: 0, spending: 3935 });
    const days = dayColumns(rows, categories, '2026-10', '2026-10-31', pairs).days;
    expect(days.find((day) => day.day === '2026-10-09')).toMatchObject({ income: 0, spending: -262 });
    expect(tagFlows(rows, categories, ['2026-10'], pairs)).toMatchObject([{ tag: 'autumn', spending: 3935, income: 0 }]);
    expect(totalsBetween(rows, categories, '2026-10-01', '2026-10-31', pairs)).toMatchObject({ spending: 3935, income: 0 });
  });

  it('pairs nothing without the pairs: the refund counts as before', () => {
    const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 262 });
    const flows = monthFlows([jacket, back], categories, '2026-10', NO_REFUNDS);

    expect(flows.uncategorisedIncome.total).toBe(262);
    expect(line(flows, 'cat_clothes')?.total).toBe(4197);
  });
});

describe('the lists leave a pair out unless asked (ADR 0055)', () => {
  const whole = transaction({ id: 'transaction_mug', date: '2026-10-06', amount: -1200, categoryId: 'cat_shopping', description: 'Mug' });
  const wholeBack = transaction({ id: 'transaction_mug_back', date: '2026-10-08', amount: 1200, description: 'Mug returned' });
  const partBack = transaction({ id: 'transaction_jacket_back', date: '2026-10-09', amount: 262, description: 'Jacket, a button' });
  const rows = [partBack, wholeBack, whole, dinner, jacket];
  const pairs = read(rows, [['transaction_mug_back', 'transaction_mug'], ['transaction_jacket_back', 'transaction_jacket']]);
  const selection = { categories, months: ['2026-10'], category: null, tag: null, span: null, max: 50, refunds: pairs };

  it('hides a paired refund and a purchase all of which came back, and counts them', () => {
    const listed = listedTransactions(rows, selection);

    expect(listed.rows.map((row) => row.id)).toEqual(['transaction_dinner', 'transaction_jacket']);
    expect(listed.refunded).toBe(3);
    expect(listed.standings.get('transaction_jacket')).toEqual({ kind: 'purchase', refunded: 262, net: -3935, whole: false });
  });

  it('shows them all when asked, each end saying what it is', () => {
    const listed = listedTransactions(rows, { ...selection, refunded: 'show' });

    expect(listed.rows).toHaveLength(5);
    expect(listed.refunded).toBe(3);
    expect(listed.standings.get('transaction_mug_back')).toEqual({ kind: 'refund', purchase: { id: 'transaction_mug', description: 'Mug' } });
    expect(listed.standings.get('transaction_mug')).toMatchObject({ kind: 'purchase', whole: true, net: 0 });
  });

  it('caps and counts what is listed, not what is hidden', () => {
    const listed = listedTransactions(rows, { ...selection, max: 1 });

    expect(listed.rows.map((row) => row.id)).toEqual(['transaction_dinner']);
    expect(listed.more).toBe(1);
    expect(listed.refunded).toBe(3);
  });

  it('lists a paired refund under its purchase\'s line, hidden by default', () => {
    const clothes = { ...selection, category: 'cat_clothes' };

    expect(listedTransactions(rows, clothes).rows.map((row) => row.id)).toEqual(['transaction_jacket']);
    expect(listedTransactions(rows, { ...clothes, refunded: 'show' }).rows.map((row) => row.id)).toEqual(['transaction_jacket_back', 'transaction_jacket']);
  });

  it('opens a line in place by the same rule: net, and the hidden counted', () => {
    const lists = lineMovements(rows, categories, { months: ['2026-10'], lines: ['cat_clothes', 'cat_shopping'], max: 50, refunds: pairs });

    expect(lists.get('cat_clothes')).toMatchObject({ rows: [{ id: 'transaction_jacket', amount: -3935, refund: { kind: 'purchase', refunded: 262 } }], refunded: 1 });
    // A parent's list holds its subcategories' movements too (lineHolds).
    expect(lists.get('cat_shopping')).toMatchObject({ rows: [{ id: 'transaction_jacket', amount: -3935 }], refunded: 3 });

    const shown = lineMovements(rows, categories, { months: ['2026-10'], lines: ['cat_clothes'], max: 50, refunds: pairs, refunded: 'show' });
    expect(shown.get('cat_clothes')?.rows.map((row) => [row.id, row.amount])).toEqual([['transaction_jacket_back', 262], ['transaction_jacket', -4197]]);
  });
});

describe('what may be paired (refundRefusal, ADR 0055)', () => {
  const back = transaction({ date: '2026-10-09', amount: 262 });
  const cash = { refundAccountKind: 'cash', refundedBefore: 0 };

  it('allows money in on a cash account for money out before it, in one currency, up to what it cost', () => {
    expect(refundRefusal(back, jacket, cash)).toBeNull();
    expect(refundRefusal({ ...back, amount: 4197, date: jacket.date }, jacket, cash)).toBeNull();
  });

  it('refuses the wrong directions, a transfer at either end, another currency or account kind', () => {
    expect(refundRefusal({ ...back, amount: -262 }, jacket, cash)).toMatch(/money in/);
    expect(refundRefusal(back, { ...jacket, amount: 4197 }, cash)).toMatch(/money out/);
    expect(refundRefusal({ ...back, counterAccountId: 'account_savings' }, jacket, cash)).toMatch(/transfer/);
    expect(refundRefusal(back, { ...jacket, counterAccountId: 'account_savings' }, cash)).toMatch(/transfer/);
    expect(refundRefusal({ ...back, currency: 'USD' }, jacket, cash)).toMatch(/currency/);
    expect(refundRefusal(back, jacket, { ...cash, refundAccountKind: 'liability' })).toMatch(/cash account/);
  });

  it('refuses a refund dated before its purchase, and refunds coming to more than it cost', () => {
    expect(refundRefusal({ ...back, date: '2026-10-02' }, jacket, cash)).toMatch(/before its purchase/);
    expect(refundRefusal(back, jacket, { ...cash, refundedBefore: 4000 })).toBe(
      'the refunds of a purchase may not come to more than it cost: 42.62 back of 41.97'
    );
  });
});

describe('the purchases a refund could be paired with (refundCandidates, ADR 0055)', () => {
  const back = transaction({ id: 'transaction_back', date: '2026-10-20', amount: 1000, description: 'Shop Ltd 456', accountId: 'account_card' });
  const elsewhere = transaction({ id: 'transaction_far', date: '2026-10-19', amount: -2000, description: 'Grocer', accountId: 'account_current' });
  const shop = transaction({ id: 'transaction_shop', date: '2026-10-01', amount: -2500, description: 'Shop Ltd 123', accountId: 'account_current' });
  const sameAccount = transaction({ id: 'transaction_card', date: '2026-09-01', amount: -1500, description: 'Bookshop', accountId: 'account_card' });
  const small = transaction({ id: 'transaction_small', date: '2026-10-19', amount: -500, accountId: 'account_card' });
  const after = transaction({ id: 'transaction_after', date: '2026-10-21', amount: -5000, accountId: 'account_card' });
  const old = transaction({ id: 'transaction_old', date: '2026-07-21', amount: -5000, accountId: 'account_card' });
  const moved = transaction({ id: 'transaction_moved', date: '2026-10-19', amount: -5000, accountId: 'account_card', counterAccountId: 'account_current' });
  const dollars = transaction({ id: 'transaction_usd', date: '2026-10-19', amount: -5000, accountId: 'account_card', currency: 'USD' });
  const rows = [back, elsewhere, shop, sameAccount, small, after, old, moved, dollars];

  it('offers money out before it, within the window, large enough: same account, then same merchant, then nearest', () => {
    const { rows: found, more } = refundCandidates(back, rows, NO_REFUNDS, { days: 90, max: 20 });

    expect(found.map((row) => row.purchase.id)).toEqual(['transaction_card', 'transaction_shop', 'transaction_far']);
    expect(found[0].remaining).toBe(1500);
    expect(more).toBe(0);
  });

  it('counts what was refunded already, and caps the list saying how many more', () => {
    const earlier = transaction({ id: 'transaction_earlier', date: '2026-09-05', amount: 600 });
    const pairs = refundPairs([...rows, earlier], [link('transaction_earlier', 'transaction_card')]);
    const { rows: found, more } = refundCandidates(back, [...rows, earlier], pairs, { days: 90, max: 1 });

    expect(found.map((row) => row.purchase.id)).toEqual(['transaction_shop']);
    expect(more).toBe(1);
  });
});

describe('a movement\'s standing as one end of a pair', () => {
  it('is null for a movement in no pair, which is never hidden', () => {
    expect(refundStanding(dinner, NO_REFUNDS)).toBeNull();
    expect(hiddenAsRefunded(null)).toBe(false);
  });
});

describe('what a movement\'s panel shows of pairing (refundPanel)', () => {
  /** @type {Pick<import('../../lib/domain/types.js').FinanceAccount, 'id' | 'kind'>[]} */
  const accounts = [{ id: 'account_current', kind: 'cash' }, { id: 'account_card', kind: 'liability' }];
  const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 262 });

  it('offers money in on a cash account the purchases it could refund, until it is paired', () => {
    const open = refundPanel(back, [jacket, back], NO_REFUNDS, accounts);
    expect(open).toMatchObject({ purchase: null, refunds: [], candidates: { rows: [{ id: 'transaction_jacket', remaining: 4197 }], more: 0 } });

    const pairs = read([jacket, back], [['transaction_back', 'transaction_jacket']]);
    expect(refundPanel(back, [jacket, back], pairs, accounts)).toMatchObject({
      purchase: { id: 'transaction_jacket', description: 'Jacket', amount: -4197 },
      candidates: null,
    });
    expect(refundPanel(jacket, [jacket, back], pairs, accounts)).toMatchObject({ refunds: [{ id: 'transaction_back' }], net: -3935, candidates: null });
  });

  it('offers nothing to money out, a transfer or money in off a cash account', () => {
    expect(refundPanel(jacket, [jacket], NO_REFUNDS, accounts).candidates).toBeNull();
    expect(refundPanel({ ...back, counterAccountId: 'account_card' }, [jacket], NO_REFUNDS, accounts).candidates).toBeNull();
    expect(refundPanel({ ...back, accountId: 'account_card' }, [jacket], NO_REFUNDS, accounts).candidates).toBeNull();
  });
});

describe('a change that would break a pair (pairBrokenBy)', () => {
  const back = transaction({ id: 'transaction_back', date: '2026-10-09', amount: 262 });
  /** @type {Pick<import('../../lib/domain/types.js').FinanceAccount, 'id' | 'kind'>[]} */
  const dataAccounts = [{ id: 'account_current', kind: 'cash' }];
  const data = { transactions: [jacket, back], links: [link('transaction_back', 'transaction_jacket')], accounts: dataAccounts };

  it('names the end and the rule, and lets any other change through', () => {
    expect(pairBrokenBy({ ...back, amount: 5000 }, data)).toBe(
      'this movement is paired as a refund, and the refunds of a purchase may not come to more than it cost: 50.00 back of 41.97: unpair it first'
    );
    expect(pairBrokenBy({ ...jacket, date: '2026-10-10' }, data)).toMatch(/^this movement has a refund paired with it, and a refund is not dated before its purchase/);
    expect(pairBrokenBy({ ...back, categoryId: 'cat_eating', description: 'Button back' }, data)).toBeNull();
    expect(pairBrokenBy({ ...dinner, amount: 1 }, data)).toBeNull();
  });
});
