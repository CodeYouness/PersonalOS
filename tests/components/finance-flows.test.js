/**
 * What the Income & spending card renders: the trend above the figures, the
 * composition bar, each spending line against its average in a month, and
 * the year reading with its comparison to the year before (or none).
 * Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }) }));

const { default: FinanceFlows } = await import('@/components/FinanceFlows.js');
const { calendarYearFlows, flowMonths, flowTrend, monthFlows, spendingAverages, trendMonths } = await import(
  '@/lib/domain/derive/finance.js'
);

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_home', name: 'Home', kind: 'expense' }),
  category({ id: 'cat_food', name: 'Food', kind: 'expense' }),
  category({ id: 'cat_pay', name: 'Pay', kind: 'income' }),
];
/** @returns {any} */
const t = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {string | null} */ categoryId) => ({
  id: 'tx_' + date + amount, date, amount, currency: 'EUR', description: '', accountId: 'account_a',
  counterAccountId: null, categoryId, notCounted: false, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user',
});
const transactions = [
  t('2026-01-01', 300000, 'cat_pay'),
  t('2026-01-02', -100000, 'cat_home'),
  t('2026-01-03', -20000, 'cat_food'),
  t('2026-03-01', 300000, 'cat_pay'),
  t('2026-03-02', -100000, 'cat_home'),
  t('2026-03-03', -10000, 'cat_food'),
  t('2026-04-01', 300000, 'cat_pay'),
  t('2026-04-02', -100000, 'cat_home'),
  t('2026-04-03', -50000, 'cat_food'),
];

/**
 * @param {'month' | 'year'} period
 * @param {string} month
 * @param {string} trackedSince
 */
function render(period, month, trackedSince = '2026-01-01') {
  const months = flowMonths(transactions, '2026-04-20', trackedSince);
  const year = period === 'year' ? calendarYearFlows(transactions, categories, month, months) : null;
  const flows = year ?? monthFlows(transactions, categories, month);
  return renderToStaticMarkup(
    createElement(FinanceFlows, {
      flows,
      period,
      yearRate: null,
      trend: flowTrend(transactions, categories, year?.months ?? trendMonths(months, month)),
      averages: period === 'year' ? null : spendingAverages(transactions, categories, month, months),
      months,
      month,
      place: { month, period },
    })
  );
}

describe('FinanceFlows', () => {
  it('draws a trend whose months read their month, the selected one marked and an empty one left empty', () => {
    const html = render('month', '2026-04');

    expect(html).toContain('href="/finances?month=2026-01"');
    expect(html).toMatch(/aria-current="true"[^>]*aria-label="April 2026: income/);
    expect(html).toMatch(/is-empty"[^>]*aria-label="February 2026: nothing recorded"/);
  });

  it('sets each spending line against its average month, and offers the year', () => {
    const html = render('month', '2026-04');

    // Food: 200 + 0 + 100 over January to March.
    expect(html).toContain('>Average<');
    expect(html).toContain('>100.00<');
    expect(html).toContain('>vs last month<');
    expect(html).toContain('href="/finances?month=2026-04&amp;period=year"');
    expect(html).toContain('Saved over 12 months');
  });

  it('shows no average with too few months before the selected one', () => {
    const html = render('month', '2026-03');

    expect(html).not.toContain('>Average<');
    expect(html).toContain('No average yet');
  });

  it('draws the composition of spending, named for a screen reader', () => {
    const html = render('month', '2026-04');

    expect(html).toContain('role="img" aria-label="Spending by category: Home 67%, Food 33%"');
  });

  it('reads a year: its own savings rate, no average, a trend of its months that open a month', () => {
    const html = render('year', '2026-03');

    expect(html).toContain('Saved in 2026');
    expect(html).not.toContain('Saved over 12 months');
    expect(html).not.toContain('>Average<');
    expect(html).toContain('aria-label="Year"');
    expect(html).toContain('href="/finances?month=2026-02"');
    expect(html).not.toContain('aria-current="true" aria-label="March 2026');
  });

  it('leaves the change blank when the year before has nothing to compare with', () => {
    const html = render('year', '2026-03');

    expect(html).toContain('>vs 2025<');
    expect(html).not.toContain('n.d.');
    expect(html).not.toMatch(/>\+\u2009/);
  });
});
