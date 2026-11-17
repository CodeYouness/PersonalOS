/**
 * The selected movement's panel on Finances: its "Counts for" control (ADR
 * 0052) -- the month it was paid, by default, or a range of months the flows
 * spread it over, a from/to pair of month pickers. Absent on a transfer and
 * on a movement not counted, which are in no flow. Every row here is
 * invented.
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

/** @param {any} transaction */
function render(transaction) {
  return renderToStaticMarkup(
    createElement(FinanceTransactionDetail, { transaction, accounts, categories: [], place: { month: '2026-11', transaction: transaction.id } })
  );
}

describe('FinanceTransactionDetail', () => {
  describe('Counts for (ADR 0052)', () => {
    it('counts a movement in the month it was paid by default, with no month pickers', () => {
      const html = render(t());

      expect(html).toContain('Counts for');
      expect(html).toContain('aria-pressed="true">The month it was paid</button>');
      expect(html).toContain('aria-pressed="false">Spread over months</button>');
      expect(html).not.toContain('id="t-counted-from"');
    });

    it('shows the months a movement is spread over in a from/to pair of pickers, and says what it does', () => {
      const html = render(t({ countedOver: { from: '2026-09', to: '2026-11' } }));

      expect(html).toContain('aria-pressed="true">Spread over months</button>');
      expect(html).toMatch(/<select id="t-counted-from"[^>]*>.*<option value="2026-09" selected="">September 2026<\/option>/);
      expect(html).toMatch(/<select id="t-counted-to"[^>]*>.*<option value="2026-11" selected="">November 2026<\/option>/);
      expect(html).toContain('Income and spending count it over 3 months, Sept–Nov, in equal parts; the balance keeps the day it was paid.');
    });

    it('offers the months around the day it was paid, and a saved month further away', () => {
      // Paid in November 2026: from 23 months before to 23 after, as a range
      // of 24 months either side can reach.
      const html = render(t({ countedOver: { from: '2024-06', to: '2024-07' } }));

      expect(html).toContain('<option value="2024-06" selected="">June 2024</option>');
      expect(html).toContain('<option value="2024-12">December 2024</option>');
      expect(html).toContain('<option value="2028-10">October 2028</option>');
      expect(html).not.toContain('<option value="2028-11">');
    });

    it('is not there on a transfer or a movement not counted, which are in no flow', () => {
      expect(render(t({ counterAccountId: 'account_b' }))).not.toContain('Counts for');
      expect(render(t({ notCounted: true }))).not.toContain('Counts for');
    });
  });
});
