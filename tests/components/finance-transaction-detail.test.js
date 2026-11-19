/**
 * The selected movement's panel on Finances: no control for the months a
 * movement counts in (ADR 0059, retiring ADR 0052's "Counts for"), but one
 * quiet line saying what a movement already spread is counted over -- absent
 * on a transfer and on a movement not counted, which are in no flow -- and
 * its refund pairing (ADR 0055). Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));

const { default: FinanceTransactionDetail } = await import('@/components/FinanceTransactionDetail.js');

/** @returns {any} */
const t = (/** @type {any} */ over = {}) => ({
  id: 'tx_pay', date: '2026-11-12', amount: 300000, currency: 'EUR', description: 'Salary', accountId: 'account_a',
  counterAccountId: null, categoryId: null, notCounted: false, countedOver: null, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user', ...over,
});
const accounts = /** @type {any} */ ([
  { id: 'account_a', name: 'Current', valuation: 'balance', archivedOn: null },
  { id: 'account_b', name: 'Savings', valuation: 'balance', archivedOn: null },
]);

/** @param {any} transaction @param {any} [pairing] */
function render(transaction, pairing) {
  return renderToStaticMarkup(
    createElement(FinanceTransactionDetail, {
      transaction, accounts, categories: [], pairing, todayKey: '2026-11-19', place: { month: '2026-11', transaction: transaction.id },
    })
  );
}

describe('FinanceTransactionDetail', () => {
  describe('counted over months (ADRs 0052, 0059)', () => {
    it('offers no control for the months a movement counts in', () => {
      const html = render(t());

      expect(html).not.toContain('Counts for');
      expect(html).not.toContain('Spread over months');
      expect(html).not.toContain('id="t-counted-from"');
      expect(html).not.toContain('finance-counts-note');
    });

    it('says, read-only, what a movement already spread is counted over, in one quiet line', () => {
      const html = render(t({ countedOver: { from: '2026-09', to: '2026-11' } }));

      expect(html).toContain('<p class="caption finance-counts-note">Income and spending count it over 3 months, Sept–Nov, in equal parts; the balance keeps the day it was paid.</p>');
      expect(html).not.toContain('<select id="t-counted');
      expect(html).not.toContain('Spread over months');
      expect(render(t({ countedOver: { from: '2026-10', to: '2026-10' } }))).toContain('Income and spending count it over one month, Oct; the balance keeps the day it was paid.');
    });

    it('says nothing of it on a transfer or a movement not counted, which are in no flow', () => {
      const across = { from: '2026-09', to: '2026-11' };
      expect(render(t({ counterAccountId: 'account_b', amount: -300000, countedOver: across }))).not.toContain('count it over');
      expect(render(t({ notCounted: true, countedOver: across }))).not.toContain('count it over');
    });
  });

  describe('a refund and its purchase (ADR 0055)', () => {
    const none = { purchase: null, refunds: [], net: 0, candidates: null };
    const jacket = { id: 'tx_jacket', date: '2026-10-03', description: 'Jacket', amount: -4197 };

    it('offers money in that can be a refund the purchases it could give back for, folded', () => {
      const html = render(t({ amount: 262 }), { ...none, net: 262, candidates: { rows: [{ ...jacket, remaining: 4197 }], more: 0 } });

      expect(html).toContain('aria-expanded="false" aria-controls="t-refund-candidates">Refund of…</button>');
      expect(html).not.toContain('id="t-refund-candidates"');
    });

    it('names the purchase a refund is paired with, a link that opens it, and offers to unpair', () => {
      const html = render(t({ amount: 262 }), { ...none, purchase: jacket, net: 262 });

      expect(html).toContain('<span class="caption">Refund of</span>');
      expect(html).toContain('href="/finances?month=2026-10&amp;transaction=tx_jacket"');
      expect(html).toContain('>Jacket</a>');
      expect(html).toContain('3 Oct');
      expect(html).toContain('−\u200941.97');
      expect(html).toContain('>Unpair</button>');
      expect(html).not.toContain('Refund of…');
    });

    it('lists a purchase\'s refunds, each unpaired on its own, and its net', () => {
      const back = { id: 'tx_back', date: '2026-10-09', description: 'Button', amount: 262 };
      const html = render(t({ id: 'tx_jacket', amount: -4197 }), { ...none, refunds: [back], net: -3935 });

      expect(html).toContain('>Refunds</span>');
      expect(html).toContain('href="/finances?month=2026-10&amp;transaction=tx_back"');
      expect(html).toContain('aria-label="Unpair Button, 9 Oct">Unpair</button>');
      expect(html).toContain('Net <span class="num">−\u200939.35</span>');
    });

    it('shows nothing of pairing on a movement in no pair that cannot be a refund', () => {
      expect(render(t({ amount: -500 }), none)).not.toContain('finance-refund');
      expect(render(t({ amount: -500 }))).not.toContain('finance-refund');
    });
  });
});
