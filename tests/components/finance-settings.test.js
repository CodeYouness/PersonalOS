/**
 * The Finances Settings card: "tracked since", the default account and the
 * target savings rate (ADR 0045), each with what it does in a line under it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const { default: FinanceSettings } = await import('@/components/FinanceSettings.js');

/** @param {number | null} savingsTarget */
function render(savingsTarget) {
  return renderToStaticMarkup(
    createElement(FinanceSettings, { trackedSince: null, defaultAccountId: null, savingsTarget, accounts: [], todayKey: '2026-04-20' })
  );
}

describe('FinanceSettings', () => {
  it('offers the target savings rate as a whole percent from 1 to 99', () => {
    const html = render(null);

    expect(html).toContain('<label class="caption" for="s-savings-target">Target savings rate (%)</label>');
    expect(html).toMatch(/id="s-savings-target" type="number"[^>]*min="1" max="99" step="1"/);
    expect(html).toContain('No target: each savings rate is shown alone.');
  });

  it('says what a target does once it is set, and offers to clear it', () => {
    const html = render(20);

    expect(html).toContain('value="20"');
    expect(html).toContain('Each savings rate says whether it meets 20%.');
    expect(html).toMatch(/<button type="button" class="btn-ghost">Clear target<\/button>/);
  });
});
