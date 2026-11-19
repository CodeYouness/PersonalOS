/**
 * The fixed costs of a period (ADR 0060): which categories marked as a fixed
 * cost hold the period's fixed spending, each with what it counted -- by
 * exactly the rules the fixed figure adds up by (totalsOver), so the list
 * always adds up to it -- and the one line that splits what was spent into
 * fixed costs and the rest, said only when it says something. Every row here
 * is invented.
 */

import { describe, expect, it } from 'vitest';

import { calendarYearFlows, fixedCostSplit, monthFlows } from '@/lib/domain/derive/finance.js';
import { refundPairs } from '@/lib/domain/derive/refunds.js';

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_salary', name: 'Salary', kind: 'income', fixedCost: true }),
  category({ id: 'cat_home', name: 'Home', kind: 'expense' }),
  category({ id: 'cat_rent', name: 'Rent', parentId: 'cat_home', fixedCost: true }),
  category({ id: 'cat_power', name: 'Power', parentId: 'cat_home', fixedCost: true }),
  category({ id: 'cat_cover', name: 'Cover', kind: 'expense', fixedCost: true }),
  category({ id: 'cat_phone', name: 'Phone', kind: 'expense', fixedCost: true, archived: true }),
  category({ id: 'cat_food', name: 'Food', kind: 'expense' }),
];

/** @returns {any} */
const transaction = (/** @type {any} */ o) => ({
  id: 'tx_' + o.date + o.amount, date: '2026-03-05', amount: 0, currency: 'EUR', description: '',
  accountId: 'account_current', counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '',
  countedOver: null, origin: null, createdAt: '', updatedAt: '', source: 'user', ...o,
});

// March: 2,000.00 in; out 500.00 Rent, 60.00 Power, 40.00 on Home itself,
// 30.00 Phone (archived), 120.00 Food -- 750.00, of which 590.00 is fixed.
const march = [
  transaction({ id: 'tx_salary', date: '2026-03-01', amount: 200000, categoryId: 'cat_salary' }),
  transaction({ id: 'tx_rent', date: '2026-03-02', amount: -50000, categoryId: 'cat_rent' }),
  transaction({ id: 'tx_power', date: '2026-03-03', amount: -6000, categoryId: 'cat_power' }),
  transaction({ id: 'tx_home', date: '2026-03-04', amount: -4000, categoryId: 'cat_home' }),
  transaction({ id: 'tx_phone', date: '2026-03-05', amount: -3000, categoryId: 'cat_phone' }),
  transaction({ id: 'tx_food', date: '2026-03-06', amount: -12000, categoryId: 'cat_food' }),
];

describe('fixedCosts', () => {
  it('lists each fixed-cost category the period spent in, largest first, adding up to the fixed figure', () => {
    const flows = monthFlows(march, categories, '2026-03');

    expect(flows.fixedCosts).toEqual([
      { id: 'cat_rent', name: 'Rent', amount: 50000 },
      { id: 'cat_power', name: 'Power', amount: 6000 },
      { id: 'cat_phone', name: 'Phone', amount: 3000 },
    ]);
    expect(flows.fixed).toBe(59000);
    expect(flows.fixedCosts.reduce((sum, row) => sum + row.amount, 0)).toBe(flows.fixed);
  });

  it('reads a movement\'s own category, never its parent\'s, and never income', () => {
    const flaggedParent = categories.map((row) => (row.id === 'cat_rent' ? { ...row, fixedCost: false } : row.id === 'cat_home' ? { ...row, fixedCost: true } : row));
    const flows = monthFlows(march, flaggedParent, '2026-03');

    // Home's own 40.00 is fixed now; Rent, unflagged, is not -- whatever its parent says.
    expect(flows.fixedCosts.map((row) => row.id)).toEqual(['cat_power', 'cat_home', 'cat_phone']);
    expect(flows.fixedCosts.reduce((sum, row) => sum + row.amount, 0)).toBe(flows.fixed);
    // Salary is flagged too, and is income: no fixed cost.
    expect(flows.fixedCosts.some((row) => row.id === 'cat_salary')).toBe(false);
  });

  it('leaves out what the totals leave out: a transfer, a movement not counted', () => {
    const rows = [
      ...march,
      transaction({ id: 'tx_transfer', date: '2026-03-07', amount: -9000, categoryId: 'cat_cover', counterAccountId: 'account_savings' }),
      transaction({ id: 'tx_uncounted', date: '2026-03-08', amount: -8000, categoryId: 'cat_cover', notCounted: true }),
    ];
    const flows = monthFlows(rows, categories, '2026-03');

    expect(flows.fixedCosts.some((row) => row.id === 'cat_cover')).toBe(false);
    expect(flows.fixed).toBe(59000);
  });

  it('takes a paired refund off its purchase\'s category, and drops a category it brings to nothing', () => {
    const rows = [
      ...march,
      transaction({ id: 'tx_power_back', date: '2026-03-10', amount: 2000, categoryId: null }),
      transaction({ id: 'tx_phone_back', date: '2026-03-11', amount: 3000, categoryId: null }),
    ];
    const refunds = refundPairs(rows, [
      { from: 'tx_power_back', to: 'tx_power', rel: 'refund_of' },
      { from: 'tx_phone_back', to: 'tx_phone', rel: 'refund_of' },
    ]);
    const flows = monthFlows(rows, categories, '2026-03', refunds);

    expect(flows.fixedCosts).toEqual([
      { id: 'cat_rent', name: 'Rent', amount: 50000 },
      { id: 'cat_power', name: 'Power', amount: 4000 },
    ]);
    expect(flows.fixed).toBe(54000);
  });

  it('counts a movement spread over months by its part in the period', () => {
    const rows = [
      ...march,
      transaction({ id: 'tx_cover', date: '2026-03-15', amount: -30000, categoryId: 'cat_cover', countedOver: { from: '2026-03', to: '2026-05' } }),
    ];
    const flows = monthFlows(rows, categories, '2026-03');

    expect(flows.fixedCosts).toContainEqual({ id: 'cat_cover', name: 'Cover', amount: 10000 });
    expect(flows.fixedCosts.reduce((sum, row) => sum + row.amount, 0)).toBe(flows.fixed);
  });

  it('adds a year up over its months', () => {
    const april = [transaction({ id: 'tx_rent_apr', date: '2026-04-02', amount: -50000, categoryId: 'cat_rent' })];
    const year = calendarYearFlows([...march, ...april], categories, '2026-04', ['2026-04', '2026-03']);

    expect(year.fixedCosts[0]).toEqual({ id: 'cat_rent', name: 'Rent', amount: 100000 });
    expect(year.fixedCosts.reduce((sum, row) => sum + row.amount, 0)).toBe(year.fixed);
  });

  it('is empty when nothing is marked as a fixed cost', () => {
    const none = categories.map((row) => ({ ...row, fixedCost: false }));

    expect(monthFlows(march, none, '2026-03').fixedCosts).toEqual([]);
  });
});

describe('fixedCostSplit', () => {
  it('splits what was spent into fixed costs and the rest, the parts adding up to it', () => {
    const flows = monthFlows(march, categories, '2026-03');

    expect(fixedCostSplit(flows)).toEqual({ spent: 75000, fixed: 59000, rest: 16000, costs: flows.fixedCosts });
    expect(fixedCostSplit(flows)?.rest).toBe(flows.variable);
  });

  it('says nothing when no spending is a fixed cost', () => {
    const none = categories.map((row) => ({ ...row, fixedCost: false }));

    expect(fixedCostSplit(monthFlows(march, none, '2026-03'))).toBeNull();
    // Marked, but nothing spent on it this month.
    expect(fixedCostSplit(monthFlows(march.filter((row) => !['tx_rent', 'tx_power', 'tx_phone'].includes(row.id)), categories, '2026-03'))).toBeNull();
  });

  it('says nothing when nothing, or less than nothing, was spent', () => {
    const salaryOnly = march.filter((row) => row.id === 'tx_salary');

    expect(fixedCostSplit(monthFlows(salaryOnly, categories, '2026-03'))).toBeNull();
    // A month whose refunds outweigh its spending.
    const refunded = [transaction({ id: 'tx_food_back', date: '2026-03-09', amount: 5000, categoryId: 'cat_food' }), transaction({ id: 'tx_rent_small', date: '2026-03-02', amount: -1000, categoryId: 'cat_rent' })];
    expect(monthFlows(refunded, categories, '2026-03').spending).toBe(-4000);
    expect(fixedCostSplit(monthFlows(refunded, categories, '2026-03'))).toBeNull();
  });

  it('says nothing for fixed costs that net below zero', () => {
    const rows = [
      transaction({ id: 'tx_rent_back', date: '2026-03-02', amount: 2000, categoryId: 'cat_rent' }),
      transaction({ id: 'tx_food', date: '2026-03-06', amount: -12000, categoryId: 'cat_food' }),
    ];
    const flows = monthFlows(rows, categories, '2026-03');

    expect(flows.fixed).toBe(-2000);
    expect(fixedCostSplit(flows)).toBeNull();
  });
});
