/**
 * What a balance account's panel renders (#114, #115, ticket #217). A
 * hand-made account offers the record form and Edit / Delete on every row; a
 * synced one marks each row with its source and offers none of it. A demo
 * origin is not a source.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceBalances from '@/components/FinanceBalances.js';

const stamp = { createdAt: '2026-04-02T09:00:00.000Z', updatedAt: '2026-04-02T09:00:00.000Z', source: 'integration' };

/** @param {Record<string, unknown> | null} origin */
function render(origin) {
  const account = {
    id: 'account_1', name: 'Scalable cash', kind: 'cash', currency: 'EUR', origin,
    archivedOn: null, valuation: 'balance', ...stamp,
  };
  const balances = [
    { id: 'obs_1', accountId: 'account_1', kind: 'balance', amount: 12345, currency: 'EUR', date: '2026-04-30', observedAt: stamp.createdAt, origin: null, ...stamp },
  ];
  return renderToStaticMarkup(
    createElement(FinanceBalances, /** @type {any} */ ({
      account, balances, write: async () => true, refuse() {}, isSaving: false, todayKey: '2026-05-10',
    }))
  );
}

describe('FinanceBalances', () => {
  it('offers the form, Edit and Delete on a hand-made account, and no source mark', () => {
    const html = render(null);

    expect(html).toContain('>Record<');
    expect(html).toContain('>Edit<');
    expect(html).toContain('>Delete<');
    expect(html).not.toContain('from ');
  });

  it('marks a synced account\'s balances with their source, and offers no form, Edit or Delete', () => {
    const html = render({ source: 'scalable', externalId: 'pf-1', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null });

    expect(html).toContain('>from scalable<');
    expect(html).toContain('not corrected here');
    expect(html).toContain('trades, prices and balances');
    expect(html).not.toContain('>Record<');
    expect(html).not.toContain('>Edit<');
    expect(html).not.toContain('>Delete<');
  });

  it('treats a demo origin as hand-made', () => {
    const html = render({ source: 'demo', externalId: 'x', syncedAt: '2026-05-01T00:00:00.000Z', sourceUpdatedAt: null });

    expect(html).toContain('>Edit<');
    expect(html).not.toContain('from demo');
  });
});
