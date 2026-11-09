/**
 * The DEGIRO import's plan (ticket #219, ADR 0031): pure, no store, no `sc`.
 * It takes the parsed rows, Scalable's transfers in and the charts, and says
 * what each holding's trades, archive day and month-end prices would be, which
 * rows it skipped and why, what deserves a warning, and what blocks the write.
 *
 * Per ISIN, in this order:
 *  1. Zero-value rows that net to zero on their day are bookkeeping: skipped.
 *     If the holding has no other row and they net to zero over the holding,
 *     skipped too, with a warning. A zero-value sell that empties the holding
 *     is a delisting: a sell at the last chart price, with a warning. Any
 *     other zero-value row blocks the write.
 *  2. A sell and a buy of the same units on one day, neither with an order
 *     id, are a change of exchange: skipped both.
 *  3. A sell with no order id for an ISIN Scalable received by a transfer in
 *     takes Scalable's arrival day and value (the units are counted once).
 *  4. The rest are trades: units |quantity|, price |Valore EUR| / units half
 *     up, fee |AutoFX| + |costs|, origin the order id or a stable hash.
 */

import { createHash } from 'node:crypto';

import { dayUnitsReachedZero, firstDayUnitsGoNegative } from '../../lib/domain/derive/finance.js';
import { monthEndPrices } from '../../lib/integrations/scalable/prices.js';

/**
 * @typedef {import('../../lib/integrations/scalable/map.js').SyncedTrade} PlannedTrade
 * @typedef {{ day: string, price: number }} ChartPoint
 * @typedef {{ isin: string, date: string, units: number, price: number }} TransferIn Scalable's arrival of units
 *
 * @typedef {object} PlannedHolding
 * @property {string} isin
 * @property {string} name
 * @property {PlannedTrade[]} trades
 * @property {string | null} archivedOn
 * @property {{ date: string, price: number }[]} prices
 *
 * @typedef {object} DegiroPlan
 * @property {PlannedHolding[]} holdings
 * @property {{ line: number | null, isin?: string, reason: string }[]} skipped
 * @property {string[]} warnings
 * @property {string[]} blocking
 */

/**
 * @param {number} cents
 * @param {number} units 10^-8
 * @returns {number} cents per unit, half up, exact
 */
export function pricePerUnit(cents, units) {
  const c = BigInt(Math.abs(cents));
  const u = BigInt(units);
  return Number((2n * c * 100000000n + u) / (2n * u));
}

/**
 * @param {import('./parse.js').DegiroRow} row
 * @param {Map<string, number>} seen how many rows had this content already
 * @returns {string}
 */
function hashId(row, seen) {
  const count = (seen.get(row.content) ?? 0) + 1;
  seen.set(row.content, count);
  const hash = createHash('sha256').update(row.content).digest('hex').slice(0, 16);
  return 'row-' + hash + (count > 1 ? '-' + count : '');
}

/** @param {import('./parse.js').DegiroRow} row */
const sortKey = (row) => row.date + ' ' + row.time + ' ' + String(row.line).padStart(8, '0');

/**
 * @param {{
 *   rows: import('./parse.js').DegiroRow[],
 *   problems?: import('./parse.js').Problem[],
 *   transfersIn: TransferIn[],
 *   charts: Map<string, ChartPoint[]>,
 *   today: string,
 *   scalableSynced: boolean,
 * }} input
 * @returns {DegiroPlan}
 */
export function planDegiro({ rows, problems = [], transfersIn, charts, today, scalableSynced }) {
  /** @type {DegiroPlan} */
  const plan = { holdings: [], skipped: [], warnings: [], blocking: [] };
  for (const problem of problems) plan.blocking.push('line ' + problem.line + ': ' + problem.reason);
  if (!scalableSynced) plan.blocking.push('the Scalable sync has not run: run `npm run sync:scalable` first, the handover needs its arrival day and value');

  /** @type {Map<string, import('./parse.js').DegiroRow[]>} */
  const byIsin = new Map();
  for (const row of [...rows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
    byIsin.set(row.isin, [...(byIsin.get(row.isin) ?? []), row]);
  }
  const unclaimed = [...transfersIn];

  for (const [isin, all] of byIsin) {
    const holding = planHolding(isin, all, unclaimed, charts.get(isin) ?? [], today, plan);
    if (holding !== null) plan.holdings.push(holding);
  }
  return plan;
}

/**
 * @param {string} isin
 * @param {import('./parse.js').DegiroRow[]} all the ISIN's rows, oldest first
 * @param {TransferIn[]} transfersIn all of Scalable's; claimed ones are removed
 * @param {ChartPoint[]} points
 * @param {string} today
 * @param {DegiroPlan} plan
 * @returns {PlannedHolding | null}
 */
function planHolding(isin, all, transfersIn, points, today, plan) {
  const name = all.at(-1)?.name ?? isin;
  const label = '"' + name + '" (' + isin + ')';
  /** @param {import('./parse.js').DegiroRow} row @param {string} reason */
  const skip = (row, reason) => plan.skipped.push({ line: row.line, isin, reason });
  /** @param {import('./parse.js').DegiroRow} row @param {string} reason */
  const block = (row, reason) => plan.blocking.push('line ' + row.line + ' ' + label + ': ' + reason);

  let zero = all.filter((row) => row.value === 0);
  let valued = all.filter((row) => row.value !== 0);

  // 1. bookkeeping rows that net to zero on their day
  /** @type {Map<string, import('./parse.js').DegiroRow[]>} */
  const zeroDays = new Map();
  for (const row of zero) zeroDays.set(row.date, [...(zeroDays.get(row.date) ?? []), row]);
  for (const [day, group] of zeroDays) {
    if (group.reduce((sum, row) => sum + row.units, 0) !== 0) continue;
    for (const row of group) skip(row, 'bookkeeping row: zero value, nets to zero with the others on ' + day);
    zero = zero.filter((row) => !group.includes(row));
  }
  if (valued.length === 0 && zero.length > 0 && zero.reduce((sum, row) => sum + row.units, 0) === 0) {
    for (const row of zero) skip(row, 'bookkeeping row: zero value, nets to zero over the holding');
    plan.warnings.push(label + ': zero-value rows on different days net to zero over the holding; skipped, the holding has no trade');
    return null;
  }

  // 2. a change of exchange: no order id, same units, one sell and one buy, one day
  const exchange = new Set();
  for (const sell of valued.filter((row) => row.units < 0 && row.orderId === null)) {
    if (exchange.has(sell)) continue;
    const buy = valued.find((row) => row.units === -sell.units && row.orderId === null && row.date === sell.date && !exchange.has(row));
    if (buy === undefined) continue;
    exchange.add(sell);
    exchange.add(buy);
    skip(sell, 'change of exchange: sold and bought again on ' + sell.date + ', the holding is unchanged');
    skip(buy, 'change of exchange: sold and bought again on ' + buy.date + ', the holding is unchanged');
  }
  valued = valued.filter((row) => !exchange.has(row));

  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Map<string, number>} */
  const idCounts = new Map();
  /** @param {import('./parse.js').DegiroRow} row */
  const originOf = (row) => {
    if (row.orderId === null) return hashId(row, seen);
    const count = (idCounts.get(row.orderId) ?? 0) + 1;
    idCounts.set(row.orderId, count);
    return count === 1 ? row.orderId : row.orderId + '-' + count;
  };

  /** @type {PlannedTrade[]} */
  const trades = [];
  // 3 and 4. the valued rows
  for (const row of valued) {
    const units = Math.abs(row.units);
    const id = originOf(row);
    if (row.units < 0 && row.orderId === null && transfersIn.some((t) => t.isin === isin)) {
      const at = transfersIn.findIndex((t) => t.isin === isin && t.units === units);
      if (at === -1) {
        block(row, 'a sell with no order id for an ISIN Scalable received, but no Scalable transfer of ' + units / 1e8 + ' units');
        continue;
      }
      const [arrival] = transfersIn.splice(at, 1);
      trades.push({ externalId: id, date: arrival.date, direction: 'sell', units, price: arrival.price, fee: 0, currency: 'EUR' });
      plan.warnings.push(label + ': ' + units / 1e8 + ' units handed over to Scalable, sold on its arrival day ' + arrival.date + ' at its value');
      continue;
    }
    trades.push({
      externalId: id, date: row.date, direction: row.units < 0 ? 'sell' : 'buy', units,
      price: pricePerUnit(row.value, units), fee: row.fee, currency: 'EUR',
    });
  }

  // 1 (rest). a zero-value sell that empties the holding is a delisting; anything else blocks
  for (const row of zero) {
    const units = Math.abs(row.units);
    const held = [...trades.filter((t) => t.date <= row.date), ...zero.filter((z) => z.date <= row.date && z !== row).map(asTrade)]
      .reduce((sum, t) => sum + (t.direction === 'buy' ? t.units : -t.units), 0);
    if (row.units > 0 || held - units !== 0) {
      block(row, 'a zero-value row that does not net to zero');
      continue;
    }
    const last = points.findLast((p) => p.day <= row.date);
    if (last === undefined) {
      block(row, 'a zero-value close, and no chart price on or before ' + row.date + ' to close it at');
      continue;
    }
    trades.push({ externalId: originOf(row), date: row.date, direction: 'sell', units, price: last.price, fee: row.fee, currency: 'EUR' });
    plan.warnings.push(label + ': DEGIRO closed it at zero value on ' + row.date + ' (a delisting); sold at the last chart price instead');
  }

  const negativeOn = firstDayUnitsGoNegative(trades);
  if (negativeOn !== null) plan.blocking.push(label + ': the trades take the holding below zero units on ' + negativeOn);
  if (trades.length === 0) return null;

  const archivedOn = dayUnitsReachedZero(trades);
  if (archivedOn === null) plan.warnings.push(label + ': still holds units after the last trade; it is not archived');
  const firstTradeDay = trades.map((t) => t.date).sort()[0];
  if (points.length === 0) plan.warnings.push(label + ' has no chart data: its month-end prices were skipped');
  const prices = points.length === 0 ? [] : monthEndPrices({ points, firstTradeDay, lastDay: archivedOn ?? today });
  return { isin, name, trades, archivedOn, prices };
}

/** @param {import('./parse.js').DegiroRow} row @returns {{ date: string, direction: 'buy' | 'sell', units: number }} */
function asTrade(row) {
  return { date: row.date, direction: row.units < 0 ? 'sell' : 'buy', units: Math.abs(row.units) };
}
