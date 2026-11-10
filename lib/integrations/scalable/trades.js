/**
 * The trades part of the Scalable sync: settled BUY and SELL rows become the
 * trades of one holding per ISIN. Swaps, transfers, cash and everything else
 * are other parts' (or nobody's, and then warned about).
 *
 * @typedef {import('./sync.js').SyncPart} SyncPart
 */

import { fetchTradeDetails } from './client.js';
import { BASE_CURRENCY, mapTradeRow } from './map.js';

/**
 * Registers a holding's trades with the run. The one way any part adds to a
 * holding, so the sets of two parts for one ISIN are merged, not replaced.
 *
 * @param {import('./sync.js').SyncContext} ctx
 * @param {string} isin
 * @param {string} fallbackName the name to create the holding with when the
 *   broker's holdings list does not carry it
 * @param {import('./map.js').SyncedTrade[]} trades
 */
export function contributeTrades(ctx, isin, fallbackName, trades) {
  const entry = ctx.holdings.get(isin) ?? { name: ctx.holdingNames.get(isin) ?? fallbackName, trades: [] };
  entry.trades.push(...trades);
  ctx.holdings.set(isin, entry);
}

/** @type {SyncPart} */
export const tradesPart = {
  name: 'trades',

  /** Reads the details of every single order: the only place its fee lives. */
  async fetch(ctx) {
    for (const row of ctx.groups.trade) {
      if (row.security_transaction_type !== 'SINGLE') continue;
      ctx.details.set(row.id, await fetchTradeDetails(ctx.run, row.id));
    }
  },

  contribute(ctx) {
    ctx.claimed.add('trade');
    ctx.claimed.add('cancelled');
    ctx.claimed.add('foreignCurrency');
    for (const row of ctx.groups.foreignCurrency) {
      ctx.warnings.push('transaction ' + row.id + ' is in ' + row.currency + ', not ' + BASE_CURRENCY + ': skipped');
    }
    for (const row of ctx.groups.trade) {
      if (ctx.foreignIsins.has(row.isin)) {
        ctx.warnings.push('transaction ' + row.id + ' of ' + row.isin + ' skipped: the holding is not in ' + BASE_CURRENCY);
        continue;
      }
      const { trade, warning } = mapTradeRow(row, ctx.details.get(row.id) ?? null);
      if (warning !== null) ctx.warnings.push(warning);
      contributeTrades(ctx, row.isin, String(row.description ?? row.isin), [trade]);
    }
  },
};
