/**
 * The prices part of the Scalable sync (spec #212, ticket #215, ADR 0031): a
 * synced holding is priced by its broker. Each holding gets today's quote
 * (`sc broker quote`) and one price per month-end from its first trade on
 * (`sc broker chart --timeframe max`: the last point on or before the
 * month-end, read in USER_TIMEZONE). An archived holding is priced only up
 * to its archive day and takes no quote.
 *
 * Both reads happen in the plan stage -- after every holding is planned, so
 * a holding another part contributed (a swap's target) is priced too, and
 * still before anything is written. The store keeps one price per holding
 * per day, so a second run corrects instead of adding; only prices that
 * differ from what is stored are written.
 *
 * @typedef {import('./sync.js').SyncPart} SyncPart
 * @typedef {{ accountId: string | null, isin: string, date: string, price: number }} PlannedPrice
 */

import { dayUnitsReachedZero } from '../../domain/derive/finance.js';
import { monthEndPrices } from '../../domain/derive/pricing.js';
import { toDayKey, today } from '../../domain/dates.js';
import { callSc, callScResult } from './client.js';
import { BASE_CURRENCY, toCents } from './map.js';

/** @type {WeakMap<import('./sync.js').SyncContext, PlannedPrice[]>} */
const planned = new WeakMap();

/**
 * @param {Record<string, any>} data `sc broker chart` payload
 * @returns {{ day: string, price: number }[]} usable points, ascending by day
 */
export function chartPoints(data) {
  const raw = Array.isArray(data.data_points) ? data.data_points : [];
  return raw
    .filter((p) => typeof p?.mid_price === 'number' && Number.isFinite(p.mid_price) && p.mid_price >= 0 && !Number.isNaN(Date.parse(p.timestamp_utc)))
    .map((p) => ({ day: toDayKey(new Date(p.timestamp_utc)), price: toCents(p.mid_price) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** @type {SyncPart} */
export const pricesPart = {
  name: 'prices',

  async plan(ctx) {
    const stored = await ctx.store.getPrices();
    const day = today();
    /** @type {PlannedPrice[]} */
    const wanted = [];

    for (const holding of ctx.plannedHoldings) {
      if (holding.trades.length === 0) continue;
      // This run's planned trades decide the last day, not the stored archivedOn:
      // the movements part only writes that in apply, after this plan.
      const archivedOn = dayUnitsReachedZero(/** @type {any[]} */ (holding.trades));
      const lastDay = archivedOn !== null && archivedOn < day ? archivedOn : day;
      const firstTradeDay = holding.trades.map((t) => t.date).sort()[0];
      /** @type {{ date: string, price: number }[]} */
      let prices = [];

      const chart = await callSc(ctx.run, ['broker', 'chart', '--isin', holding.isin, '--timeframe', 'max']);
      const points = chartPoints(chart);
      if (points.length === 0) {
        ctx.warnings.push(holding.name + ' (' + holding.isin + ') has no chart data: its month-end prices were skipped');
      } else {
        prices = monthEndPrices({ points, firstTradeDay, lastDay });
      }

      if (archivedOn === null) {
        const quote = await callScResult(ctx.run, ['broker', 'quote', '--isin', holding.isin]);
        const currency = quote.quote_currency ?? BASE_CURRENCY;
        if (currency !== BASE_CURRENCY) {
          ctx.warnings.push(holding.name + ' (' + holding.isin + ') is quoted in ' + currency + ', not ' + BASE_CURRENCY + ': today\'s price was skipped');
        } else if (typeof quote.quote_mid_price !== 'number' || !Number.isFinite(quote.quote_mid_price) || quote.quote_mid_price < 0) {
          ctx.warnings.push(holding.name + ' (' + holding.isin + ') has no usable quote: today\'s price was skipped');
        } else {
          prices = prices.filter((p) => p.date !== day);
          prices.push({ date: day, price: toCents(quote.quote_mid_price) });
        }
      }

      const mine = new Map(stored.filter((p) => p.accountId === holding.accountId).map((p) => [p.date, p.price]));
      let created = 0;
      let corrected = 0;
      let unchanged = 0;
      for (const price of prices) {
        const old = mine.get(price.date);
        if (old === price.price) unchanged += 1;
        else {
          if (old === undefined) created += 1;
          else corrected += 1;
          wanted.push({ accountId: holding.accountId, isin: holding.isin, ...price });
        }
      }
      ctx.report.push(
        'prices for "' + holding.name + '" (' + holding.isin + '): ' + created + ' new, ' + corrected + ' changed, ' + unchanged + ' unchanged'
      );
    }
    planned.set(ctx, wanted);
  },

  async apply(ctx) {
    let written = 0;
    for (const price of planned.get(ctx) ?? []) {
      const accountId = price.accountId ?? ctx.accountIds.get(price.isin);
      if (accountId === undefined) continue;
      await ctx.store.upsertSyncedPrice({ accountId, date: price.date, price: price.price, currency: BASE_CURRENCY });
      written += 1;
    }
    return written;
  },
};
