/**
 * What the holdings earned, on the Finances screen (ADR 0051): one line
 * under the Invested section's head, a signed share after a holding's name,
 * the Investments fold with every holding and the totals, and the top of a
 * holding's panel. Rendered to static markup from investmentReturns on
 * invented rows.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));

import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import FinanceHoldings from '@/components/FinanceHoldings.js';
import FinanceInvestments, { InvestedNote } from '@/components/FinanceInvestments.js';
import { financeOverview, quietAccounts, worthChart } from '@/lib/domain/derive/finance.js';
import { investmentReturns } from '@/lib/domain/derive/investments.js';

const TODAY = '2026-04-20';
const UNIT = 100_000_000;
const THIN = '\u2009';

/** @returns {any} */
const account = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ o = {}) => ({
  id, name, kind: 'investment', currency: 'EUR', origin: null, archivedOn: null, valuation: 'units',
  createdAt: '', updatedAt: '', source: 'user', ...o,
});
/** @returns {any} */
const trade = (/** @type {string} */ accountId, /** @type {string} */ date, /** @type {'buy' | 'sell'} */ direction, /** @type {number} */ units, /** @type {number} */ price, fee = 0) => ({
  id: 'trade_' + accountId + date + direction, accountId, date, direction, units: units * UNIT, price, fee, currency: 'EUR',
  origin: null, createdAt: '', updatedAt: '', source: 'user',
});
/** @returns {any} */
const price = (/** @type {string} */ accountId, /** @type {string} */ date, /** @type {number} */ amount) => ({
  id: 'price_' + accountId + date, accountId, date, price: amount, currency: 'EUR', createdAt: '', updatedAt: '', source: 'user',
});

/** @type {any} */
const inputs = {
  accounts: [
    account('account_etf', 'Test World ETF'),
    account('account_bond', 'Test Bond Fund'),
    account('account_new', 'Test New Fund'),
    account('account_sold', 'Test Sold Fund', { archivedOn: '2025-09-01' }),
    account('account_current', 'Current', { kind: 'cash', valuation: 'balance' }),
  ],
  observations: [{ id: 'o1', accountId: 'account_current', kind: 'balance', amount: 500000, currency: 'EUR', date: '2026-04-01', observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user' }],
  trades: [
    trade('account_etf', '2025-11-03', 'buy', 10, 10000, 100),
    trade('account_etf', '2026-02-02', 'buy', 10, 12000, 100),
    trade('account_etf', '2026-03-02', 'sell', 5, 13000, 100),
    trade('account_bond', '2026-01-05', 'buy', 100, 1000),
    trade('account_sold', '2025-06-02', 'buy', 10, 5000),
    trade('account_sold', '2025-09-01', 'sell', 10, 6000, 200),
  ],
  prices: [
    price('account_etf', '2025-12-31', 11000),
    price('account_etf', '2026-04-10', 12500),
    price('account_etf', '2026-04-15', 12800),
    price('account_bond', '2026-04-15', 900),
  ],
  transactions: [],
};
const returns = investmentReturns(inputs, TODAY);

/** @param {{ place?: any }} [options] */
function renderCard({ place = { month: '2026-04' } } = {}) {
  const overview = financeOverview(inputs, TODAY);
  return renderToStaticMarkup(
    createElement(FinanceBreakdown, {
      overview,
      chart: worthChart(overview.history, TODAY),
      accounts: quietAccounts(overview.accounts, inputs, { todayKey: TODAY, selectedId: place.account ?? null }),
      archived: [],
      todayKey: TODAY,
      place,
      investments: returns,
    })
  );
}

describe('the Invested section of the accounts table', () => {
  const html = renderCard();

  it('says the cost, the profit or loss with its share, and the change since the last price day, under its head', () => {
    const note = /** @type {string} */ (html.match(/<tr class="finance-section-note">.*?<\/tr>/)?.[0]);
    expect(note).toBeDefined();
    // 1,651.50 + 1,000.00; 1,920.00 + 900.00 against it.
    expect(note).toContain('Cost <span class="num">2,652</span>');
    expect(note).toContain('P/L <span class="num up">+' + THIN + '169</span>');
    expect(note).toContain('<span class="num up">+6.4%</span>');
    expect(note).toContain('<span class="num down">−' + THIN + '55</span> since 10 Apr');
    expect(html.indexOf('finance-section-note')).toBeGreaterThan(html.indexOf('>Invested<'));
  });

  it('says the cost is the holdings\' when an investment valued by balance shares the section', () => {
    const withPortfolio = { ...inputs, accounts: [...inputs.accounts, account('account_portfolio', 'Test Portfolio', { valuation: 'balance' })] };
    const note = renderToStaticMarkup(createElement(InvestedNote, { returns: investmentReturns(withPortfolio, TODAY), todayKey: TODAY }));
    expect(note).toContain('Holdings cost <span class="num">2,652</span>');
  });

  it('keeps two columns, Account and Value, the value last', () => {
    expect(html).toContain('<th>Account</th><th class="num">Value</th></tr></thead>');
  });

  it('marks each holding with its signed share after its name, toned, and nothing when unknown', () => {
    expect(html).toMatch(/Test World ETF<\/a><span class="caption num finance-gain up" title="Profit or loss on its cost">\+16\.3%<\/span>/);
    expect(html).toMatch(/Test Bond Fund<\/a><span class="caption num finance-gain down"[^>]*>−10\.0%<\/span>/);
    expect(html).not.toMatch(/Test New Fund<\/a><span class="caption num finance-gain/);
  });

  it('has no line, no mark and no fold without the holdings\' returns', () => {
    const overview = financeOverview(inputs, TODAY);
    const plain = renderToStaticMarkup(
      createElement(FinanceBreakdown, {
        overview, chart: worthChart(overview.history, TODAY),
        accounts: quietAccounts(overview.accounts, inputs, { todayKey: TODAY, selectedId: null }),
        archived: [], todayKey: TODAY, place: {},
      })
    );
    expect(plain).not.toContain('finance-section-note');
    expect(plain).not.toContain('finance-gain');
    expect(plain).not.toContain('finance-investments');
  });
});

describe('the Investments fold', () => {
  const html = renderToStaticMarkup(createElement(FinanceInvestments, { returns, todayKey: TODAY, place: {}, selectedId: null }));

  it('is folded to one line, and sits in the Net worth card under the accounts', () => {
    expect(html).toMatch(/^<details class="finance-fold finance-investments"><summary><span class="finance-fold-name">Investments<\/span><span class="caption"> cost, value and profit of 3 holdings<\/span><\/summary>/);
    const card = renderCard();
    expect(card.indexOf('finance-investments')).toBeGreaterThan(card.indexOf('finance-accounts-table'));
  });

  it('lists every open holding with its cost, value, profit or loss and share, in a box that scrolls', () => {
    expect(html).toContain('<div class="finance-table-scroll"><table class="finance-table finance-investments-table">');
    expect(html).toContain('<th>Holding</th><th class="num">Cost</th><th class="num">Value</th><th class="num">P/L</th><th class="num">%</th>');
    expect(html).toMatch(/Test World ETF<\/a><\/span><\/td><td class="num">1,652<\/td><td class="num">1,920<\/td><td class="num"><span class="num up">\+\u2009269<\/span><\/td><td class="num"><span class="num up">\+16\.3%<\/span><\/td>/);
    expect(html).toMatch(/Test New Fund<\/a><\/span><\/td><td class="num caption" colSpan="4">unknown<\/td>/);
    expect(html).not.toContain('Test Sold Fund');
  });

  it('totals the holdings known', () => {
    expect(html).toContain('<tfoot><tr class="finance-investments-total"><th scope="row">Total</th><td class="num">2,652</td><td class="num">2,820</td>');
  });

  it('says what the totals do not: after tax, realised, since the last price day, the year to date, what was left out', () => {
    expect(html).toContain('After 26% tax <span class="num up">+' + THIN + '99</span>');
    expect(html).toContain('a loss is not reduced');
    // 98.50 on the ETF's sell, 98.00 on the fund sold completely.
    expect(html).toContain('Realised by sells <span class="num up">+' + THIN + '197</span>');
    expect(html).toContain('1 holding sold completely included');
    expect(html).toContain('Since 10 Apr <span class="num down">−' + THIN + '55</span>');
    expect(html).toContain('the last price day before 15 Apr');
    expect(html).toContain('2026 to date <span class="num up">+' + THIN + '168</span>');
    expect(html).toContain('since 1 Jan, money put in or taken out not counted');
    expect(html).toContain('Left out, value or cost unknown: Test New Fund.');
  });

  it('is absent with no holding at all', () => {
    const none = investmentReturns({ ...inputs, accounts: [inputs.accounts[4]] }, TODAY);
    expect(renderToStaticMarkup(createElement(FinanceInvestments, { returns: none, todayKey: TODAY, place: {}, selectedId: null }))).toBe('');
  });
});

describe('a holding\'s panel', () => {
  /** @param {string} id */
  function renderPanel(id) {
    const row = /** @type {any} */ ([...returns.holdings, ...returns.archived].find((each) => each.account.id === id));
    return renderToStaticMarkup(
      createElement(FinanceHoldings, /** @type {any} */ ({
        account: row.account,
        trades: inputs.trades.filter((/** @type {any} */ each) => each.accountId === id),
        prices: inputs.prices.filter((/** @type {any} */ each) => each.accountId === id),
        position: { row, since: returns.since, taxPercent: returns.taxPercent },
        write: async () => true, refuse() {}, isSaving: false, todayKey: TODAY,
      }))
    );
  }

  it('starts with what the holding earned, to the cent, before its trades', () => {
    const html = renderPanel('account_etf');
    expect(html).toMatch(/^<table class="finance-table finance-position">/);
    expect(html).toContain('<th scope="row">Units held</th><td class="num">15</td>');
    expect(html).toContain('<th scope="row">Cost</th><td class="num">1,651.50<span class="caption"> 110.10 a unit</span></td>');
    expect(html).toContain('<th scope="row">Value</th><td class="num">1,920.00</td>');
    expect(html).toContain('<th scope="row">Profit or loss</th><td class="num"><span class="num up">+' + THIN + '268.50</span> · <span class="num up">+16.3%</span></td>');
    expect(html).toContain('<th scope="row">After 26% tax</th><td class="num"><span class="num up">+' + THIN + '198.69</span>');
    expect(html).toContain('<th scope="row">Realised by sells</th><td class="num"><span class="num up">+' + THIN + '98.50</span></td>');
    expect(html).toContain('<th scope="row">Since 10 Apr</th><td class="num"><span class="num up">+' + THIN + '45.00</span> · <span class="num up">+2.4%</span></td>');
    expect(html).toContain('<th scope="row">2026 to date</th><td class="num"><span class="num up">+' + THIN + '268.00</span>');
    expect(html.indexOf('finance-position')).toBeLessThan(html.indexOf('<th>Trade</th>'));
  });

  it('says from when the year counts for a holding bought this year, and a loss after tax as it is', () => {
    const html = renderPanel('account_bond');
    expect(html).toContain('2026 to date<span class="caption"> from 5 Jan</span>');
    expect(html).toContain('<th scope="row">After 26% tax</th><td class="num"><span class="num down">−' + THIN + '100.00</span>');
  });

  it('keeps only what the sells realised for a holding sold and archived', () => {
    const html = renderPanel('account_sold');
    expect(html).toContain('<th scope="row">Realised by sells</th><td class="num"><span class="num up">+' + THIN + '98.00</span></td>');
    expect(html).not.toContain('Units held');
    expect(html).not.toContain('Profit or loss');
  });

  it('shows nothing earned before the first trade', () => {
    const row = /** @type {any} */ (returns.holdings.find((each) => each.account.id === 'account_new'));
    const html = renderToStaticMarkup(
      createElement(FinanceHoldings, /** @type {any} */ ({
        account: row.account, trades: [], prices: [], position: { row, since: returns.since, taxPercent: 26 },
        write: async () => true, refuse() {}, isSaving: false, todayKey: TODAY,
      }))
    );
    expect(html).not.toContain('finance-position');
    expect(html).toContain('No trade recorded yet');
  });
});
