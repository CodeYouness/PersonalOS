/**
 * What a holding's panel renders (#116, #117, ticket #213). Rendered to
 * static markup: a hand-made holding offers Edit and Delete on every row; a
 * synced one marks where its trades and prices come from and offers none.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceHoldings from '@/components/FinanceHoldings.js';

const stamp = { createdAt: '2026-04-02T09:00:00.000Z', updatedAt: '2026-04-02T09:00:00.000Z', source: 'integration' };

/** @param {Record<string, unknown>} [account] @param {Record<string, unknown> | null} [tradeOrigin] */
function render(account = {}, tradeOrigin = null) {
  const holding = {
    id: 'account_1', name: 'Test World ETF', kind: 'investment', currency: 'EUR', origin: null,
    archivedOn: null, valuation: 'units', ...stamp, ...account,
  };
  const trades = [
    { id: 'trade_1', accountId: 'account_1', date: '2026-04-02', direction: 'buy', units: 150000000, price: 10000, fee: 100, currency: 'EUR', origin: tradeOrigin, ...stamp },
  ];
  const prices = [{ id: 'price_1', accountId: 'account_1', date: '2026-04-30', price: 10500, currency: 'EUR', ...stamp }];
  return renderToStaticMarkup(
    createElement(FinanceHoldings, /** @type {any} */ ({
      account: holding, trades, prices, write: async () => true, refuse() {}, isSaving: false, todayKey: '2026-05-10',
    }))
  );
}

describe('FinanceHoldings', () => {
  it('offers Edit and Delete on a hand-made holding\'s trades and prices, and no source mark', () => {
    const html = render();

    expect(html.match(/>Edit</g)).toHaveLength(2);
    expect(html.match(/>Delete</g)).toHaveLength(2);
    expect(html).toContain('Record price');
    expect(html).not.toContain('from ');
  });

  it('marks a synced holding\'s trades and prices with their source, and offers no edit', () => {
    const origin = { source: 'scalable', externalId: 'order-1', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null };
    const html = render({ origin: { source: 'scalable', externalId: 'XX0000000001', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null } }, origin);

    expect(html.match(/>from scalable</g)).toHaveLength(2);
    expect(html).toContain('not corrected here');
    expect(html).not.toContain('>Edit<');
    expect(html).not.toContain('>Delete<');
    expect(html).not.toContain('Record price');
    expect(html).not.toContain('Record buy');
  });

  it('treats a demo origin as hand-made', () => {
    const html = render({ origin: { source: 'demo', externalId: 'x', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null } });

    expect(html).toContain('>Edit<');
    expect(html).toContain('Record price');
    expect(html).not.toContain('from demo');
  });
});
