/**
 * The Net worth card of Finances (ADR 0048): the net worth line over all
 * tracked time under the headline, whatever month Income & spending reads,
 * with its change over the span, 30 days and a year; and the accounts table
 * with the quiet ones folded. Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import { financeOverview, quietAccounts, worthChart } from '@/lib/domain/derive/finance.js';

const TODAY = '2026-04-20';

/** @returns {any} */
const account = (/** @type {string} */ id, /** @type {string} */ name) => ({
  id, name, kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance',
  createdAt: '', updatedAt: '', source: 'user',
});
/** @returns {any} */
const balance = (/** @type {string} */ accountId, /** @type {string} */ date, /** @type {number} */ amount) => ({
  id: 'observation_' + accountId + date, accountId, kind: 'balance', amount, currency: 'EUR', date,
  observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user',
});

const inputs = {
  accounts: [account('account_current', 'Current'), account('account_old', 'Old card')],
  observations: [
    balance('account_current', '2025-10-10', 500000),
    balance('account_current', '2026-04-05', 650000),
    balance('account_old', '2025-10-20', 0),
  ],
  trades: [],
  prices: [],
  transactions: [],
};

/** @param {{ place?: any, observations?: any[] }} [options] */
function render({ place = { month: '2026-01' }, observations = inputs.observations } = {}) {
  const finance = { ...inputs, observations };
  const overview = financeOverview(finance, TODAY);
  return renderToStaticMarkup(
    createElement(FinanceBreakdown, {
      overview,
      chart: worthChart(overview.history, TODAY),
      accounts: quietAccounts(overview.accounts, finance, { todayKey: TODAY, selectedId: place.account ?? null }),
      archived: [],
      todayKey: TODAY,
      place,
      wide: place.account === undefined,
    })
  );
}

describe('FinanceBreakdown', () => {
  describe('the net worth line', () => {
    it('draws every month tracked, from the first value to today, whatever month is read', () => {
      const html = render();

      // October 2025 to April 2026: seven months, January read below changes nothing.
      expect(html).toContain('viewBox="0 0 7 100"');
      expect(html).toContain('aria-label="Net worth at the end of each month since October 2025"');
      expect(html).toContain('<li>October 2025: net worth €\u20095,000 on 31 Oct 2025</li>');
      expect(html).toContain('<li>April 2026: net worth €\u20096,500 on 20 Apr</li>');
      expect(render({ place: { month: '2026-04', period: 'year' } })).toContain('viewBox="0 0 7 100"');
    });

    it('sits under the headline, before the allocation and the accounts', () => {
      const html = render();

      expect(html.indexOf('finance-total')).toBeLessThan(html.indexOf('finance-worth'));
      expect(html.indexOf('finance-worth')).toBeLessThan(html.indexOf('class="alloc"'));
      expect(html.indexOf('class="alloc"')).toBeLessThan(html.indexOf('<table'));
    });

    it('prints the change over the whole span, over 30 days and over a year', () => {
      const html = render();

      expect(html).toContain('<span class="num">+\u20091,500</span> since 31 Oct 2025');
      expect(html).toContain('<span class="num">+\u20091,500</span> in 30 days');
      // A year ago nothing had a value: no change from zero.
      expect(html).not.toContain('in a year');
    });

    it('labels its months, and says nothing to draw before the first balance', () => {
      const html = render();
      // Seven months: each labelled when wide, the quarters when narrow; the first with its year.
      expect(html).toMatch(/finance-worth-tick is-narrow" style="left:7\.14\d*%">Oct<span class="finance-worth-year is-wide is-narrow">2025<\/span>/);
      expect(html).toMatch(/finance-worth-tick" style="left:21\.4\d*%">Nov</);
      expect(html.match(/class="finance-worth-tick[ "]/g)).toHaveLength(7);

      const empty = render({ observations: [] });
      expect(empty).toContain('No net worth to draw yet');
      expect(empty).not.toContain('finance-worth-line');
    });

    it('takes the whole row with no account selected, and leaves room for its panel otherwise', () => {
      expect(render()).toContain('class="card span-12"');
      expect(render({ place: { month: '2026-01', account: 'account_current' } })).toContain('class="card span-7"');
    });
  });

  describe('the accounts', () => {
    it('folds an account worth nothing and quiet under "N more accounts"', () => {
      const html = render();

      expect(html).toContain('<span class="finance-fold-name">1 more account</span>');
      expect(html.indexOf('>Current<')).toBeLessThan(html.indexOf('1 more account'));
      expect(html.indexOf('1 more account')).toBeLessThan(html.indexOf('>Old card<'));
    });

    it('never folds the selected account', () => {
      const html = render({ place: { month: '2026-01', account: 'account_old' } });

      expect(html).not.toContain('more account');
      expect(html).toContain('aria-current="true" href="/finances?account=account_old&amp;month=2026-01">Old card<');
    });
  });
});
