/**
 * The Transactions card of Finances: the period's movements, or a line's,
 * or a tag's -- of the period or of all time (ADR 0046) -- and in a year
 * with nothing selected only the newest, saying how many more. Every row
 * here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceTransactions from '@/components/FinanceTransactions.js';

const TODAY = '2026-04-20';
/** @returns {any} */
const t = (/** @type {string} */ id, /** @type {string} */ description) => ({
  id, date: '2026-03-02', amount: -1200, currency: 'EUR', description, accountId: 'account_a',
  counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user',
});
/** @returns {any} */
const accounts = [{ id: 'account_a', name: 'Current' }];

/** @param {any} props */
function render(props) {
  return renderToStaticMarkup(
    createElement(FinanceTransactions, {
      transactions: [t('tx_1', 'Pastéis')],
      accounts,
      categories: [],
      lineName: null,
      tag: null,
      more: 0,
      periodLabel: 'March 2026',
      todayKey: TODAY,
      place: { month: '2026-03' },
      ...props,
    })
  );
}

describe('FinanceTransactions', () => {
  it('names a selected tag and offers its movements of the period or of all time', () => {
    const html = render({ tag: 'lisbon trip', place: { month: '2026-03', tag: 'lisbon trip' } });

    expect(html).toContain('Transactions · tagged lisbon trip');
    expect(html).toContain('class="seg is-on" aria-current="true" href="/finances?month=2026-03&amp;tag=lisbon+trip">March 2026<');
    expect(html).toContain('class="seg" href="/finances?month=2026-03&amp;tag=lisbon+trip&amp;span=all">All time<');
    expect(html).toContain('href="/finances?month=2026-03">Show all<');
  });

  it('marks all time as chosen once it is', () => {
    const html = render({ tag: 'lisbon trip', place: { month: '2026-03', tag: 'lisbon trip', span: 'all' } });

    expect(html).toContain('class="seg is-on" aria-current="true" href="/finances?month=2026-03&amp;tag=lisbon+trip&amp;span=all">All time<');
  });

  it('says what is missing when a tag has nothing in the period', () => {
    const html = render({ transactions: [], tag: 'lisbon trip', place: { month: '2026-03', tag: 'lisbon trip' } });

    expect(html).toContain('Nothing tagged lisbon trip in March 2026.');
  });

  it('says how many more there are when only the newest are listed', () => {
    const html = render({ more: 212, periodLabel: '2026' });

    expect(html).toContain('The newest 1 of 213 in 2026. Pick a month, a category or a tag to narrow it.');
    expect(render({})).not.toContain('The newest');
  });

  it('offers no span without a tag', () => {
    expect(render({ lineName: 'Food', place: { month: '2026-03', category: 'cat_food' } })).not.toContain('All time');
  });
});
