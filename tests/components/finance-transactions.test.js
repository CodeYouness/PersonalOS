/**
 * The Transactions card of Finances: the period's movements, or a line's,
 * or a tag's -- of the period or of all time (ADR 0046) -- and in a month or
 * a year with nothing selected only the newest, saying how many more and
 * offering them all (ADR 0048). Money in and money out each carry their
 * sign; a transfer and a movement not counted are quieter. Every row here
 * is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceTransactions from '@/components/FinanceTransactions.js';

const TODAY = '2026-04-20';
/** @returns {any} */
const t = (/** @type {string} */ id, /** @type {string} */ description, /** @type {any} */ over = {}) => ({
  id, date: '2026-03-02', amount: -1200, currency: 'EUR', description, accountId: 'account_a',
  counterAccountId: null, categoryId: null, notCounted: false, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user', ...over,
});
/** @returns {any} */
const accounts = [{ id: 'account_a', name: 'Current' }, { id: 'account_b', name: 'Savings' }];

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
      max: 50,
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

  it('says how many more there are in a year, and offers them all', () => {
    const html = render({ more: 212, periodLabel: '2026', place: { month: '2026-03', period: 'year' } });

    expect(html).toContain(
      'The newest 1 of 213 in 2026. <a class="finance-account-link" href="/finances?month=2026-03&amp;period=year&amp;span=all">Show all 213</a>, or pick a month, a category or a tag to narrow it.'
    );
    expect(render({})).not.toContain('The newest');
  });

  it('caps a month too, and once all are shown offers the newest only again', () => {
    expect(render({ more: 60 })).toContain('href="/finances?month=2026-03&amp;span=all">Show all 61</a>, or pick a category or a tag to narrow it.');

    const all = render({ transactions: [t('tx_1', 'a'), t('tx_2', 'b'), t('tx_3', 'c')], max: 2, place: { month: '2026-03', span: 'all' } });
    expect(all).toContain('All 3 in March 2026. <a class="finance-account-link" href="/finances?month=2026-03">Show the newest 2</a>');
  });

  describe('money in and money out', () => {
    it('signs money out with a minus in the ink, and money in with a plus in the up tone', () => {
      const html = render({ transactions: [t('tx_out', 'Pastéis'), t('tx_in', 'Salary', { amount: 250000 })] });

      expect(html).toContain('<td class="num finance-amount">−\u200912.00</td>');
      expect(html).toContain('<td class="num finance-amount up">+\u20092,500.00</td>');
    });

    it('keeps the sign of a movement not counted, quieter', () => {
      const html = render({ transactions: [t('tx_loan', 'Loan back', { amount: 5000, notCounted: true })] });

      expect(html).toContain('<td class="num finance-amount is-quiet">+\u200950.00</td>');
      expect(html).toContain(' · not counted');
    });

    it('shows a transfer as the amount moved, quieter, naming where it went', () => {
      const html = render({ transactions: [t('tx_move', 'To savings', { amount: -30000, counterAccountId: 'account_b' })] });

      expect(html).toContain('<td class="num finance-amount is-quiet">300.00</td>');
      expect(html).toContain('Current → Savings');
      expect(html).not.toContain('+\u2009300');
      expect(html).not.toContain('−\u2009300');
    });

    it('keeps a date on one line', () => {
      expect(render({})).toContain('<td class="num finance-date">2 Mar</td>');
    });
  });

  it('offers no span without a tag', () => {
    expect(render({ lineName: 'Food', place: { month: '2026-03', category: 'cat_food' } })).not.toContain('All time');
  });
});
