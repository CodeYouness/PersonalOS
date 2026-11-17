/**
 * What the holdings earned (ADR 0051): the cost basis of the units held, at
 * the weighted average cost; the profit or loss against today's value, gross
 * and after tax; what the sells realised; the change since the last day a
 * price was recorded before the newest; and the year to date. Every row
 * here is invented.
 */

import { describe, expect, it } from 'vitest';

import { accountValueOn, periodInvested } from '@/lib/domain/derive/finance.js';
import { averageCost, investmentReturns, netOfTax } from '@/lib/domain/derive/investments.js';
import { limits } from '@/personalos.config.js';

const TODAY = '2026-04-20';

/** One unit, in the 10^-8 units a trade counts in. */
const UNIT = 100_000_000;

/** @returns {any} */
const holding = (/** @type {string} */ id, /** @type {any} */ o = {}) => ({
  id, name: id, kind: 'investment', currency: 'EUR', origin: null, archivedOn: null, valuation: 'units',
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

let tradeCount = 0;
/** @returns {any} */
const trade = (/** @type {string} */ accountId, /** @type {string} */ date, /** @type {'buy' | 'sell'} */ direction, /** @type {number} */ units, /** @type {number} */ price, fee = 0) => ({
  id: 'trade_' + (tradeCount += 1), accountId, date, direction, units: units * UNIT, price, fee, currency: 'EUR',
  origin: null, createdAt: '', updatedAt: '', source: 'user',
});

/** @returns {any} */
const price = (/** @type {string} */ accountId, /** @type {string} */ date, /** @type {number} */ amount) => ({
  id: 'price_' + accountId + date, accountId, date, price: amount, currency: 'EUR', createdAt: '', updatedAt: '', source: 'user',
});

/**
 * Two holdings and their trades:
 * - the ETF, bought before the year, priced at its end, bought again and
 *   partly sold in it, priced twice in April;
 * - the bond fund, bought in January, at a loss in April.
 */
const ETF_TRADES = [
  trade('account_etf', '2025-11-03', 'buy', 10, 10000, 100),
  trade('account_etf', '2026-02-02', 'buy', 10, 12000, 100),
  trade('account_etf', '2026-03-02', 'sell', 5, 13000, 100),
];
const BOND_TRADES = [trade('account_bond', '2026-01-05', 'buy', 100, 1000)];
const PRICES = [
  price('account_etf', '2025-12-31', 11000),
  price('account_etf', '2026-04-10', 12500),
  price('account_etf', '2026-04-15', 12800),
  price('account_bond', '2026-04-15', 900),
];

/** @param {{ accounts?: any[], trades?: any[], prices?: any[], observations?: any[] }} [o] */
function inputsOf(o = {}) {
  return {
    accounts: o.accounts ?? [holding('account_etf'), holding('account_bond')],
    observations: o.observations ?? [],
    trades: o.trades ?? [...ETF_TRADES, ...BOND_TRADES],
    prices: o.prices ?? PRICES,
    transactions: [],
  };
}

/** @param {ReturnType<typeof investmentReturns>} returns @param {string} id */
const row = (returns, id) => /** @type {any} */ (returns.holdings.find((each) => each.account.id === id));

describe('the cost of the units held, at their average cost', () => {
  it('adds every buy at its price and its fee, and a sell takes units out at the average', () => {
    // 20 units for 1,001 + 1,201; five of them sold at 1,300 less 1 of fee.
    expect(averageCost(ETF_TRADES)).toEqual({ units: 15 * UNIT, cost: 165150, realised: 64900 - 55050 });
  });

  it('leaves nothing of the cost once every unit is sold, and the whole difference realised', () => {
    const trades = [...ETF_TRADES, trade('account_etf', '2026-04-01', 'sell', 15, 9000)];
    expect(averageCost(trades)).toEqual({ units: 0, cost: 0, realised: 9850 + (135000 - 165150) });
  });

  it('reads the trades by day whatever their order, a day settled whole: its buys before its sells', () => {
    const trades = [
      trade('account_etf', '2026-03-03', 'sell', 5, 11000),
      trade('account_etf', '2026-03-03', 'buy', 5, 10000),
    ];
    expect(averageCost(trades)).toEqual({ units: 0, cost: 0, realised: 5000 });
    expect(averageCost([...ETF_TRADES].reverse())).toEqual(averageCost(ETF_TRADES));
  });

  it('rounds the cost of the units sold half up to the cent, so the cost left stays exact', () => {
    // 3 units for 10.00: one sold takes 3.33, the other two keep 6.67.
    const trades = [trade('account_etf', '2026-01-02', 'buy', 3, 333, 1), trade('account_etf', '2026-01-03', 'sell', 1, 333)];
    expect(averageCost(trades)).toEqual({ units: 2 * UNIT, cost: 667, realised: 0 });
  });

  it('knows no cost when the trades sell units that were never bought, which the store refuses', () => {
    expect(averageCost([trade('account_etf', '2026-01-02', 'sell', 1, 1000)])).toBeNull();
    expect(averageCost([trade('account_etf', '2026-01-02', 'buy', 1, 1000), trade('account_etf', '2026-01-03', 'sell', 2, 1000)])).toBeNull();
  });

  it('is nothing at all with no trade', () => {
    expect(averageCost([])).toEqual({ units: 0, cost: 0, realised: 0 });
  });
});

describe('net of tax', () => {
  it('takes the rate off a gain, rounded half up to the cent', () => {
    expect(netOfTax(1000, 26)).toBe(740);
    expect(netOfTax(1001, 12.5)).toBe(1001 - 125);
    expect(netOfTax(26850, limits.financeCapitalGainsTaxPercent)).toBe(26850 - 6981);
  });

  it('never reduces a loss, and nothing stays nothing', () => {
    expect(netOfTax(-1000, 26)).toBe(-1000);
    expect(netOfTax(0, 26)).toBe(0);
  });
});

describe('a holding\'s returns', () => {
  const returns = investmentReturns(inputsOf(), TODAY);
  const etf = row(returns, 'account_etf');
  const bond = row(returns, 'account_bond');

  it('values the units held as the accounts table does, and sets the cost against it', () => {
    expect(etf.value).toBe(/** @type {any} */ (accountValueOn(holding('account_etf'), inputsOf(), TODAY)).amount);
    expect(etf).toMatchObject({ units: 15 * UNIT, cost: 165150, averagePrice: 11010, value: 192000, gain: 26850 });
    expect(etf.gainRatio).toBeCloseTo(26850 / 165150, 10);
  });

  it('shows a gain after the tax, and a loss as it is', () => {
    expect(etf.afterTax).toBe(26850 - 6981);
    expect(etf.afterTaxRatio).toBeCloseTo((26850 - 6981) / 165150, 10);
    expect(bond).toMatchObject({ cost: 100000, value: 90000, gain: -10000, afterTax: -10000 });
    expect(bond.gainRatio).toBeCloseTo(-0.1, 10);
  });

  it('says what the sells realised, apart from the gain on the units still held', () => {
    expect(etf.realised).toBe(9850);
    expect(bond.realised).toBe(0);
  });

  it('values a holding with no price recorded at its last trade\'s price', () => {
    const only = investmentReturns(inputsOf({ prices: [] }), TODAY);
    expect(row(only, 'account_etf')).toMatchObject({ value: 15 * 13000, gain: 15 * 13000 - 165150 });
  });

  it('values a holding with one price at that price', () => {
    const one = investmentReturns(
      inputsOf({ accounts: [holding('account_etf')], trades: [trade('account_etf', '2026-04-01', 'buy', 10, 5000, 100)], prices: [price('account_etf', '2026-04-15', 5500)] }),
      TODAY
    );
    expect(row(one, 'account_etf')).toMatchObject({ cost: 50100, value: 55000, gain: 4900, change: 5000 });
    expect(one.since).toBe('2026-04-01');
  });

  it('knows no value, cost or gain for a holding with no trade, and none of its cost with impossible trades', () => {
    const odd = investmentReturns(
      inputsOf({
        accounts: [holding('account_etf'), holding('account_new'), holding('account_odd')],
        trades: [...ETF_TRADES, trade('account_odd', '2026-01-02', 'sell', 1, 1000)],
      }),
      TODAY
    );
    expect(row(odd, 'account_new')).toMatchObject({ value: null, cost: null, gain: null, gainRatio: null, afterTax: null, realised: null, ytd: null });
    expect(row(odd, 'account_odd')).toMatchObject({ cost: null, gain: null, realised: null });
  });
});

describe('the change since the day before the newest price', () => {
  const returns = investmentReturns(inputsOf(), TODAY);

  it('is the newest day a price is known for any holding, and the price day before it', () => {
    expect(returns.latest).toBe('2026-04-15');
    expect(returns.since).toBe('2026-04-10');
  });

  it('values the units held today at the price in use on that day, so a trade is never a change', () => {
    const etf = row(returns, 'account_etf');
    expect(etf.change).toBe(192000 - 15 * 12500);
    expect(etf.changeRatio).toBeCloseTo(4500 / 187500, 10);
    // The bond fund had no price on the 10th: its trade's, from January, was in use.
    expect(row(returns, 'account_bond').change).toBe(90000 - 100000);
  });

  it('adds up for all of them, against what they were worth then', () => {
    expect(returns.totals.change).toBe(4500 - 10000);
    expect(returns.totals.changeRatio).toBeCloseTo(-5500 / (187500 + 100000), 10);
  });

  it('leaves out a holding first bought after that day, and says how many', () => {
    const late = investmentReturns(
      inputsOf({ accounts: [holding('account_etf'), holding('account_late')], trades: [...ETF_TRADES, trade('account_late', '2026-04-15', 'buy', 1, 1000)] }),
      TODAY
    );
    expect(row(late, 'account_late').change).toBeNull();
    expect(late.totals.change).toBe(4500);
    expect(late.changeLeftOut).toBe(1);
  });

  it('is unknown with a single day of prices', () => {
    const one = investmentReturns(inputsOf({ accounts: [holding('account_bond')], trades: BOND_TRADES, prices: [] }), TODAY);
    expect(one.since).toBeNull();
    expect(row(one, 'account_bond').change).toBeNull();
    expect(one.totals.change).toBeNull();
  });
});

describe('the year to date', () => {
  const returns = investmentReturns(inputsOf(), TODAY);

  it('is the value now less the value at the year\'s start and the money put in since, across the year boundary', () => {
    const etf = row(returns, 'account_etf');
    // 10 units at 31 December's 110.00; 1,201 bought and 649 sold since.
    const invested = periodInvested(ETF_TRADES, ['2026-01', '2026-02', '2026-03', '2026-04']).net;
    expect(invested).toBe(120100 - 64900);
    expect(etf.ytd).toBe(192000 - 110000 - invested);
    expect(etf.ytdFrom).toBe('2026-01-01');
  });

  it('starts at the first trade for a holding bought this year, from nothing', () => {
    const bond = row(returns, 'account_bond');
    expect(bond.ytd).toBe(90000 - 0 - 100000);
    expect(bond.ytdFrom).toBe('2026-01-05');
    expect(bond.ytdRatio).toBeCloseTo(-0.1, 10);
  });

  it('is a share of the money at work: the start value and each sum put in, weighted by the days it was in', () => {
    // 109 days from 1 January; the buy was in for 77 of them, the sell out for 49.
    const atWork = 110000 + (120100 * 77) / 109 - (64900 * 49) / 109;
    expect(row(returns, 'account_etf').ytdRatio).toBeCloseTo(26800 / atWork, 10);
  });

  it('adds up for all of them, from the year\'s start', () => {
    expect(returns.totals.ytd).toBe(26800 - 10000);
    expect(returns.totals.ytdFrom).toBe('2026-01-01');
    const atWork = 110000 + (120100 * 77) / 109 - (64900 * 49) / 109 + (100000 * 105) / 109;
    expect(returns.totals.ytdRatio).toBeCloseTo(16800 / atWork, 10);
  });

  it('does not count a trade dated after today', () => {
    const future = investmentReturns(inputsOf({ trades: [...ETF_TRADES, ...BOND_TRADES, trade('account_bond', '2026-04-25', 'buy', 10, 900)] }), TODAY);
    expect(row(future, 'account_bond').ytd).toBe(-10000);
    expect(row(future, 'account_bond').units).toBe(100 * UNIT);
  });
});

describe('all the holdings together', () => {
  const sold = holding('account_sold', { archivedOn: '2025-09-01' });
  const soldTrades = [trade('account_sold', '2025-06-02', 'buy', 10, 5000), trade('account_sold', '2025-09-01', 'sell', 10, 6000, 200)];
  const returns = investmentReturns(
    inputsOf({
      accounts: [
        holding('account_etf'),
        holding('account_bond'),
        holding('account_new'),
        sold,
        holding('account_portfolio', { valuation: 'balance' }),
      ],
      trades: [...ETF_TRADES, ...BOND_TRADES, ...soldTrades],
    }),
    TODAY
  );

  it('lists the open holdings in the accounts\' order, and not the archived ones or one valued by balance', () => {
    expect(returns.holdings.map((each) => each.account.id)).toEqual(['account_etf', 'account_bond', 'account_new']);
    expect(returns.byBalance).toBe(1);
  });

  it('adds the cost, value and gain of the holdings known, and names the unknown left out', () => {
    expect(returns.totals).toMatchObject({ cost: 265150, value: 282000, gain: 16850 });
    expect(returns.totals.gainRatio).toBeCloseTo(16850 / 265150, 10);
    expect(returns.unknown.map((each) => each.account.id)).toEqual(['account_new']);
  });

  it('taxes each gain on its own: a loss elsewhere does not lower the tax on it', () => {
    expect(returns.totals.afterTax).toBe(26850 - 6981 - 10000);
    expect(returns.taxPercent).toBe(limits.financeCapitalGainsTaxPercent);
  });

  it('counts a holding sold completely only for what it realised', () => {
    expect(returns.totals.realised).toBe(9850 + (60000 - 200 - 50000));
    expect(returns.archived.map((each) => each.account.id)).toEqual(['account_sold']);
    expect(returns.totals.ytd).toBe(16800);
  });

  it('knows no total with no holding known', () => {
    const none = investmentReturns(inputsOf({ accounts: [holding('account_new')], trades: [], prices: [] }), TODAY);
    expect(none.totals).toMatchObject({ cost: null, value: null, gain: null, gainRatio: null, afterTax: null, realised: null, change: null, ytd: null });
  });
});
