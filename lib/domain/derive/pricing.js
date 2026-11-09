/**
 * What a holding's trades and prices cost per unit, pure (ADR 0031). Both
 * brokers' importers price through here, so a price has one implementation:
 * integers all the way, never a float division.
 */

import { monthOf, monthRange, shiftMonth } from '../dates.js';

/**
 * A cost over its units, in cents per unit, rounded half up, exactly. A sale
 * is priced by the size of its amount.
 *
 * @param {number} cents the cost, integer minor units
 * @param {number} units 10^-8, positive
 * @returns {number} cents per unit
 */
export function pricePerUnit(cents, units) {
  const cost = BigInt(Math.abs(cents));
  const size = BigInt(units);
  return Number((2n * cost * 100000000n + size) / (2n * size));
}

/**
 * The month-end prices of one holding.
 *
 * For every month from the first trade's through the last day it is priced,
 * the month's last day (when that day has come) gets the price of the last
 * chart point on or before it, in cents. A month-end before the first point
 * gets none, nor does one before the first trade.
 *
 * @param {{ points: { day: string, price: number }[], firstTradeDay: string, lastDay: string }} input
 *   `points` ascending by day; `lastDay` is today, or the archive day
 * @returns {{ date: string, price: number }[]}
 */
export function monthEndPrices({ points, firstTradeDay, lastDay }) {
  /** @type {{ date: string, price: number }[]} */
  const prices = [];
  const lastMonth = monthOf(lastDay);
  for (let month = monthOf(firstTradeDay); month <= lastMonth; month = shiftMonth(month, 1)) {
    const end = monthRange(month).to;
    if (end > lastDay) break;
    const point = points.findLast((p) => p.day <= end);
    if (point !== undefined) prices.push({ date: end, price: point.price });
  }
  return prices;
}
