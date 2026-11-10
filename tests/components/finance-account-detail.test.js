/**
 * What the account panel's actions render (#115, ticket #212 follow-up).
 * Rendered to static markup: a hand-made account offers Archive and Delete;
 * a synced one offers Archive only, since the next sync would create it
 * again.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));

import FinanceAccountDetail from '@/components/FinanceAccountDetail.js';

const stamp = { createdAt: '2026-04-02T09:00:00.000Z', updatedAt: '2026-04-02T09:00:00.000Z', source: 'integration' };

/** @param {Record<string, unknown>} [account] */
function render(account = {}) {
  const row = {
    id: 'account_1', name: 'Test World ETF', kind: 'investment', currency: 'EUR', origin: null,
    archivedOn: null, valuation: 'units', ...stamp, ...account,
  };
  return renderToStaticMarkup(
    createElement(FinanceAccountDetail, /** @type {any} */ ({
      account: row, balances: [], trades: [], prices: [], todayKey: '2026-05-10',
      place: { account: 'account_1' },
    }))
  );
}

describe('FinanceAccountDetail', () => {
  it('offers Archive and Delete on a hand-made account', () => {
    const html = render();
    expect(html).toContain('>Archive<');
    expect(html).toContain('>Delete<');
  });

  it('offers Archive but no Delete on a synced account', () => {
    const html = render({ origin: { source: 'scalable', externalId: 'XX0000000001', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null } });
    expect(html).toContain('>Archive<');
    expect(html).not.toContain('>Delete<');
  });
});
