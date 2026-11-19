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
    // One segmented control, as Income & spending's (components/Segmented.js).
    expect(html).toContain('<div class="segmented is-joined finance-span-switch" role="group" aria-label="Span">');
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
      expect(html).toContain('<span class="caption">· not counted</span>');
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

  describe('a row is one line (ADR 0049)', () => {
    const long = 'Card payment at a very long merchant name that goes on and on, Lisboa PT';

    it('cuts a long description with an ellipsis, the whole of it in its title, still the link to its panel', () => {
      const html = render({ transactions: [t('tx_long', long, { notCounted: true })] });

      expect(html).toContain('<td><span class="finance-cut"><a ');
      // The title names the category and the account too: a narrow card hides their columns (ADR 0053).
      expect(html).toContain(
        'class="finance-account-link finance-cut-text" title="' + long + ' — Uncategorised · Current" href="/finances?month=2026-03&amp;transaction=tx_long">' + long + '</a>'
      );
      // The note is outside the cut text, so it is never the part cut away.
      expect(html).toContain('</a><span class="caption">· not counted</span></span></td>');
    });

    it('keeps the category and the account on one line, each whole in its title', () => {
      const html = render({ transactions: [t('tx_move', 'To savings', { amount: -30000, counterAccountId: 'account_b' })] });

      expect(html).toContain('<span class="finance-cut-text" title="Transfer">Transfer</span>');
      expect(html).toContain('<span class="finance-cut-text" title="Current → Savings">Current → Savings</span>');
    });
  });

  describe('a movement counted over months (ADR 0052)', () => {
    it('stays on the day it was paid, with a quiet note of the months it counts in', () => {
      const html = render({
        transactions: [t('tx_pay', 'Salary', { date: '2026-03-12', amount: 300000, categoryId: 'cat_pay', countedOver: { from: '2026-01', to: '2026-03' } })],
      });

      expect(html).toContain('<td class="num finance-date">12 Mar</td>');
      expect(html).toContain('<td class="num finance-amount up">+\u20093,000.00</td>');
      expect(html).toContain('</a><span class="caption">· counted over Jan–Mar</span></span></td>');
    });

    it('names the years of a range across one, and says nothing on a transfer or a movement not counted', () => {
      const across = { from: '2025-11', to: '2026-01' };
      expect(render({ transactions: [t('tx_pay', 'Salary', { countedOver: across })] })).toContain('· counted over Nov 2025–Jan 2026');
      expect(render({ transactions: [t('tx_move', 'Moved', { counterAccountId: 'account_b', countedOver: across })] })).not.toContain('counted over');
      expect(render({ transactions: [t('tx_aside', 'Aside', { notCounted: true, countedOver: across })] })).not.toContain('counted over');
    });
  });

  describe('a refund paired with its purchase (ADR 0055)', () => {
    const jacket = t('tx_jacket', 'Jacket', { amount: -4197 });
    const partly = new Map([['tx_jacket', { kind: 'purchase', refunded: 262, net: -3935, whole: false }]]);

    it('shows a purchase partly refunded at what is left of it, saying of how much', () => {
      const html = render({ transactions: [jacket], standings: partly });

      expect(html).toContain('<td class="num finance-amount">−\u200939.35</td>');
      expect(html).toContain('<span class="caption">· of 41.97, 2.62 refunded</span>');
    });

    it('says how many refunded movements it left out, and offers them with the other parameters kept', () => {
      const html = render({ transactions: [jacket], standings: partly, refunded: 3, place: { month: '2026-03', category: 'cat_1', span: 'all' } });

      expect(html).toContain('3 refunded movements hidden — ');
      expect(html).toContain('aria-label="Show the 3 refunded movements" href="/finances?month=2026-03&amp;category=cat_1&amp;span=all&amp;refunded=show">show</a>');
    });

    it('shown, each end says what it is at its own amount, and hide replaces show', () => {
      const back = t('tx_back', 'Jacket return', { amount: 4197 });
      const standings = new Map([
        ['tx_back', { kind: 'refund', purchase: { id: 'tx_jacket', description: 'Jacket' } }],
        ['tx_jacket', { kind: 'purchase', refunded: 4197, net: 0, whole: true }],
      ]);
      const html = render({ transactions: [back, jacket], standings, refunded: 2, place: { month: '2026-03', refunded: 'show' } });

      expect(html).toContain('<span class="caption">· refund of Jacket</span>');
      expect(html).toContain('<span class="caption">· refunded</span>');
      expect(html).toContain('<td class="num finance-amount">−\u200941.97</td>');
      expect(html).toContain('2 refunded movements shown — ');
      expect(html).toContain('aria-label="Hide the 2 refunded movements" href="/finances?month=2026-03">hide</a>');
    });

    it('says nothing of refunds when none was left out', () => {
      expect(render({})).not.toContain('refunded');
    });

    it('says the rest is empty when everything listed was refunded', () => {
      expect(render({ transactions: [], refunded: 2 })).toContain('Nothing else recorded in March 2026.');
    });
  });

  describe("a deposit's interest, one row per account and month (ADR 0056)", () => {
    /** @type {import('@/lib/domain/derive/interest.js').InterestRun} */
    const run = {
      kind: 'interest', id: 'interest:account_b:2026-03', accountId: 'account_b', month: '2026-03', date: '2026-03-31',
      amount: 372, count: 62, days: 31, ids: ['tx_31', 'tx_31_fee'], categoryIds: ['cat_interest', 'cat_tax'],
    };
    const categories = [{ id: 'cat_interest', name: 'Interest' }, { id: 'cat_tax', name: 'Taxes' }];

    it('shows the run as one net row, on its newest day, whose name lists it day by day', () => {
      const html = render({ transactions: [run, t('tx_1', 'Pastéis')], categories, interest: 62 });

      expect(html).toContain('<td class="num finance-date">31 Mar</td>');
      expect(html).toContain(
        '<a class="finance-account-link finance-cut-text" title="Interest · 31 days — Interest, Taxes · Savings" href="/finances?month=2026-03&amp;interest=show">Interest · 31 days</a><span class="caption">· 62 movements</span>'
      );
      expect(html).toContain('<span class="finance-cut-text" title="Interest, Taxes">Interest, Taxes</span>');
      expect(html).toContain('<td class="num finance-amount up">+\u20093.72</td>');
      expect(html).toContain('62 interest movements folded by month — ');
      expect(html).toContain('aria-label="Show the 62 interest movements one by one" href="/finances?month=2026-03&amp;interest=show">show</a>');
    });

    it('marks the run selected when it holds the selected movement', () => {
      const html = render({ transactions: [run], categories, interest: 62, place: { month: '2026-03', transaction: 'tx_31_fee' } });

      expect(html).toContain('<tr class="is-selected"><td class="num finance-date">31 Mar</td>');
    });

    it('shown, offers to fold them again, keeping the other parameters', () => {
      const html = render({ interest: 62, place: { month: '2026-03', refunded: 'show', interest: 'show' } });

      expect(html).toContain('62 interest movements shown one by one — ');
      expect(html).toContain('aria-label="Fold the 62 interest movements by month" href="/finances?month=2026-03&amp;refunded=show">fold</a>');
    });

    it('says nothing of interest when there is none to fold', () => {
      expect(render({})).not.toContain('interest');
    });
  });

  it('offers no span without a tag', () => {
    expect(render({ lineName: 'Food', place: { month: '2026-03', category: 'cat_food' } })).not.toContain('All time');
  });
});
