/**
 * What the holdings earned (ADR 0051), computed. A holding is an account
 * valued by units (docs/domain.md, FinanceAccount); this module says, for
 * each one and for all of them, what the spreadsheet it replaces said:
 *
 *   cost basis     what the units held today cost, at their average cost
 *   value          today's, from accountValueOn -- never valued again here
 *   gain           value minus cost basis, and its share of the cost
 *   after tax      the gain less `limits.financeCapitalGainsTaxPercent`
 *   realised       what the sells made over the cost of the units they sold
 *   change         today's units at today's price against the price in use
 *                  on the last price day before the newest
 *   year to date   the value's change since 1 January that money put in or
 *                  taken out does not explain
 *
 * Integers in minor units throughout; a ratio is the only float. An unknown
 * is null, never zero, and a total leaves it out and says so. Pure: it is
 * handed what the store holds, and calls neither the model nor anything else.
 */

import { limits } from '../../../personalos.config.js';
import { daysBetween, monthOf, shiftDayKey, yearOf } from '../dates.js';
import { accountValueOn, holdingPriceOn, tradeCash, valueOfUnits, wasArchivedAtZero } from './finance.js';
import { pricePerUnit } from './pricing.js';

/** @typedef {import('../types.js').Trade} Trade */
/** @typedef {import('./finance.js').FinanceInputs} FinanceInputs */

/**
 * A holding's units, the cost of those units and what its sells realised,
 * at the weighted average cost (ADR 0051): a buy adds its units and its
 * price times units plus its fee to the cost; a sell takes its units out at
 * the average cost of the units held, rounded half up to the cent, and
 * realises its price times units less its fee minus that cost. The trades
 * are read by day, a day settled whole -- its buys before its sells, as the
 * store judges "never below zero units" (#116). Null when the trades sell a
 * unit that was never bought, which the store refuses: a cost then is a
 * guess.
 *
 * @param {Pick<Trade, 'date' | 'direction' | 'units' | 'price' | 'fee'>[]} trades one holding's
 * @returns {{ units: number, cost: number, realised: number } | null}
 */
export function averageCost(trades) {
  const ordered = [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.direction === b.direction ? 0 : a.direction === 'buy' ? -1 : 1)
  );
  let units = 0;
  let cost = 0;
  let realised = 0;
  for (const trade of ordered) {
    const cash = tradeCash(trade);
    if (trade.direction === 'buy') {
      units += trade.units;
      cost += cash;
      continue;
    }
    if (trade.units > units) return null;
    const costOfSold = Number((2n * BigInt(cost) * BigInt(trade.units) + BigInt(units)) / (2n * BigInt(units)));
    units -= trade.units;
    cost -= costOfSold;
    realised += -cash - costOfSold;
  }
  return { units, cost, realised };
}

/**
 * A gain less the tax on it, at `percent`, the tax rounded half up to the
 * cent. A loss, or nothing, is left as it is: no tax is paid on it.
 *
 * @param {number} gain minor units
 * @param {number} percent e.g. 26
 * @returns {number} minor units
 */
export function netOfTax(gain, percent) {
  return gain > 0 ? gain - Math.round((gain * percent) / 100) : gain;
}

/**
 * What a sum of money did over a period, and its share of the money at work
 * (the modified Dietz return): the value at the start, plus each sum put in
 * -- or less each taken out -- weighted by the share of the period it was
 * in. A sum on the first day counts whole, one on the last day not at all.
 * Null when nothing was at work.
 *
 * @param {{ start: number, now: number, flows: { date: string, cash: number }[] }} parts
 * @param {string} from the period's first day
 * @param {string} todayKey its last
 * @returns {{ amount: number, ratio: number | null }}
 */
function dietz({ start, now, flows }, from, todayKey) {
  const days = daysBetween(from, todayKey);
  let net = 0;
  let atWork = start;
  for (const flow of flows) {
    net += flow.cash;
    atWork += days === 0 ? flow.cash : (flow.cash * (days - daysBetween(from, flow.date))) / days;
  }
  const amount = now - start - net;
  return { amount, ratio: atWork > 0 ? amount / atWork : null };
}

/**
 * One holding, with every number it earned. Every amount in minor units,
 * null when unknown.
 *
 * @typedef {object} HoldingReturn
 * @property {import('../types.js').FinanceAccount} account
 * @property {number} units held today, 10^-8
 * @property {number | null} cost what the units held cost, at their average
 *   cost; null with no trade, or trades that sell what was never bought
 * @property {number | null} averagePrice the cost per whole unit; null with
 *   no unit held
 * @property {number | null} value today's, as the accounts table shows it
 * @property {string | null} valueDate the day of the price it is valued at
 * @property {number | null} gain value minus cost
 * @property {number | null} gainRatio gain over cost; null with no cost
 * @property {number | null} afterTax the gain less the tax on it
 * @property {number | null} afterTaxRatio over the cost
 * @property {number | null} realised by every sell to date
 * @property {number | null} change since the returns' `since` day
 * @property {number | null} changeRatio over `valueSince`
 * @property {number | null} valueSince today's units at the price in use on
 *   the `since` day
 * @property {number | null} ytd the year to date
 * @property {number | null} ytdRatio over the money at work (dietz)
 * @property {string | null} ytdFrom its first day: 1 January, or the first
 *   trade when later
 */

/**
 * @typedef {object} InvestmentReturns
 * @property {HoldingReturn[]} holdings the open ones, in the accounts' order
 * @property {HoldingReturn[]} archived the archived ones -- a holding sold
 *   completely is archived at zero units: only what they realised counts, in
 *   `totals.realised`, and the year to date of one archived at zero units
 * @property {HoldingReturn[]} unknown the open ones whose gain is unknown,
 *   left out of the totals' cost, value and gain
 * @property {number} changeLeftOut open holdings with units and no price on
 *   the `since` day -- first bought after it -- left out of the change
 * @property {number} byBalance open investment accounts valued by balance:
 *   not holdings, in none of these figures
 * @property {string | null} latest the newest day an open holding has a
 *   price for, on or before today
 * @property {string | null} since the price day before `latest`, the change
 *   is measured from; null with fewer than two
 * @property {number} taxPercent the rate `afterTax` is net of
 * @property {{
 *   cost: number | null, value: number | null, gain: number | null, gainRatio: number | null,
 *   afterTax: number | null, afterTaxRatio: number | null, realised: number | null,
 *   change: number | null, changeRatio: number | null,
 *   ytd: number | null, ytdRatio: number | null, ytdFrom: string | null,
 * }} totals
 */

/**
 * What every holding earned, and all of them together (ADR 0051). The
 * Finances screen -- the Invested section, the Investments fold, a
 * holding's panel -- and the question context read this one derivation.
 *
 * The change is measured from one day for every holding, so the rows add up
 * to the total: `since`, the last day before the newest on which any open
 * holding has a price -- a trade's or a Price -- because prices are not
 * daily (the broker sync writes one on each day it runs and one per
 * month-end, ADR 0031). A screen names it by its date, never "today".
 *
 * Trades dated after today are not counted, as `accountValueOn` counts none.
 *
 * @param {FinanceInputs} inputs
 * @param {string} todayKey
 * @param {{ taxPercent?: number }} [options]
 * @returns {InvestmentReturns}
 */
export function investmentReturns(inputs, todayKey, { taxPercent = limits.financeCapitalGainsTaxPercent } = {}) {
  const accounts = inputs.accounts.filter((account) => account.kind === 'investment');
  const holdings = accounts.filter((account) => account.valuation === 'units');
  const open = holdings.filter((account) => account.archivedOn === null);
  const openIds = new Set(open.map((account) => account.id));
  const trades = inputs.trades.filter((trade) => trade.date <= todayKey);
  const priced = { ...inputs, trades };

  const priceDays = [...new Set([...trades, ...inputs.prices].filter((row) => openIds.has(row.accountId) && row.date <= todayKey).map((row) => row.date))].sort();
  const latest = priceDays[priceDays.length - 1] ?? null;
  const since = priceDays[priceDays.length - 2] ?? null;

  const yearStart = yearOf(monthOf(todayKey)) + '-01-01';
  /** @type {{ start: number, now: number, flows: { date: string, cash: number }[], from: string }[]} */
  const yearParts = [];

  /** @param {import('../types.js').FinanceAccount} account @returns {HoldingReturn} */
  const returnOf = (account) => {
    const own = trades.filter((trade) => trade.accountId === account.id);
    const units = own.reduce((sum, trade) => sum + (trade.direction === 'buy' ? trade.units : -trade.units), 0);
    const basis = own.length === 0 ? null : averageCost(own);
    const value = account.archivedOn === null ? accountValueOn(account, priced, todayKey) : null;
    const cost = value === null ? null : basis?.cost ?? null;
    const gain = cost === null || value === null ? null : value.amount - cost;
    const afterTax = gain === null ? null : netOfTax(gain, taxPercent);

    const then = since === null || value === null || units === 0 ? null : holdingPriceOn(account.id, priced, since);
    const valueSince = then === null ? null : valueOfUnits(units, then.price);
    const change = valueSince === null || value === null ? null : value.amount - valueSince;

    const year = yearToDate(account, own, priced, todayKey, yearStart);
    if (year !== null) yearParts.push(year.parts);

    return {
      account,
      units,
      cost,
      averagePrice: cost === null || units === 0 ? null : pricePerUnit(cost, units),
      value: value?.amount ?? null,
      valueDate: value?.date ?? null,
      gain,
      gainRatio: ratio(gain, cost),
      afterTax,
      afterTaxRatio: ratio(afterTax, cost),
      realised: basis?.realised ?? null,
      change,
      changeRatio: ratio(change, valueSince),
      valueSince,
      ytd: year?.amount ?? null,
      ytdRatio: year?.ratio ?? null,
      ytdFrom: year?.parts.from ?? null,
    };
  };

  const shown = open.map(returnOf);
  const archived = holdings.filter((account) => account.archivedOn !== null).map(returnOf);
  const known = shown.filter((row) => row.gain !== null);
  const moved = shown.filter((row) => row.change !== null);
  const realisedBy = [...shown, ...archived].filter((row) => row.realised !== null);

  const cost = known.length === 0 ? null : sum(known, 'cost');
  const value = known.length === 0 ? null : sum(known, 'value');
  const afterTax = known.length === 0 ? null : sum(known, 'afterTax');
  const change = moved.length === 0 ? null : sum(moved, 'change');
  const yearFrom = yearParts.length === 0 ? null : yearParts.map((part) => part.from).sort()[0];
  const year =
    yearFrom === null
      ? null
      : dietz(
          {
            start: yearParts.reduce((total, part) => total + part.start, 0),
            now: yearParts.reduce((total, part) => total + part.now, 0),
            flows: yearParts.flatMap((part) => part.flows),
          },
          yearFrom,
          todayKey
        );

  return {
    holdings: shown,
    archived,
    unknown: shown.filter((row) => row.gain === null),
    changeLeftOut: shown.filter((row) => row.units > 0 && row.value !== null && row.change === null).length,
    byBalance: accounts.filter((account) => account.valuation === 'balance' && account.archivedOn === null).length,
    latest,
    since,
    taxPercent,
    totals: {
      cost,
      value,
      gain: cost === null || value === null ? null : value - cost,
      gainRatio: cost === null || value === null ? null : ratio(value - cost, cost),
      afterTax,
      afterTaxRatio: ratio(afterTax, cost),
      realised: realisedBy.length === 0 ? null : sum(realisedBy, 'realised'),
      change,
      changeRatio: ratio(change, moved.length === 0 ? null : sum(moved, 'valueSince')),
      ytd: year?.amount ?? null,
      ytdRatio: year?.ratio ?? null,
      ytdFrom: yearFrom,
    },
  };
}

/**
 * A holding's year to date: its value now, less its value at the end of the
 * day before 1 January -- or nothing, when its first trade is later and the
 * period starts there -- less the money put in since (periodInvested, the
 * Income & spending circle's). Null for a holding with no trade, and for one
 * archived by hand while it held units: it left net worth that day with its
 * units, and what they did after is not known.
 *
 * @param {import('../types.js').FinanceAccount} account
 * @param {Trade[]} own its trades, none after today
 * @param {FinanceInputs} priced the inputs, with no trade after today
 * @param {string} todayKey
 * @param {string} yearStart 1 January of today's year
 * @returns {{ amount: number, ratio: number | null, parts: { start: number, now: number, flows: { date: string, cash: number }[], from: string } } | null}
 */
function yearToDate(account, own, priced, todayKey, yearStart) {
  if (own.length === 0) return null;
  if (account.archivedOn !== null && !wasArchivedAtZero(account.archivedOn, own)) return null;
  const first = own.reduce((day, trade) => (trade.date < day ? trade.date : day), own[0].date);
  const from = first > yearStart ? first : yearStart;
  const start = from === yearStart ? accountValueOn(account, priced, shiftDayKey(yearStart, -1))?.amount ?? 0 : 0;
  const now = /** @type {{ amount: number }} */ (accountValueOn(account, priced, todayKey)).amount;
  // Each trade's money is tradeCash, periodInvested's own rule: the same
  // money the circle calls invested, never a copy of it.
  const flows = own.filter((trade) => trade.date >= from).map((trade) => ({ date: trade.date, cash: tradeCash(trade) }));
  const parts = { start, now, flows, from };
  return { ...dietz(parts, from, todayKey), parts };
}

/**
 * @param {number | null} part
 * @param {number | null} whole
 * @returns {number | null} null when either is unknown or the whole is not above zero
 */
function ratio(part, whole) {
  return part === null || whole === null || whole <= 0 ? null : part / whole;
}

/**
 * @param {HoldingReturn[]} rows
 * @param {'cost' | 'value' | 'afterTax' | 'change' | 'valueSince' | 'realised'} key
 * @returns {number}
 */
function sum(rows, key) {
  return rows.reduce((total, row) => total + /** @type {number} */ (row[key]), 0);
}
