/**
 * The movements part of the Scalable sync (ticket #220, ADR 0031): fund
 * mergers (SWAP_OUT / SWAP_IN) and transfers of units (TRANSFER_OUT /
 * TRANSFER_IN) become sells and buys at the value the broker reports; a
 * cancellation pair writes nothing; a synced trade the broker stopped
 * reporting is removed with a warning; and a holding that reaches zero units
 * is archived on that day, restored when units come back -- unless a hand
 * archived it while it still held units, which the sync leaves alone.
 *
 * @typedef {import('./sync.js').SyncPart} SyncPart
 */

import { ORIGIN_SOURCES } from '../../../personalos.config.js';
import { toDayKey } from '../../domain/dates.js';
import { dayUnitsReachedZero, wasArchivedAtZero } from '../../domain/derive/finance.js';
import { pricePerUnit } from '../../domain/derive/pricing.js';
import { BASE_CURRENCY, requireRowAmount, requireRowUnits, toCents } from './map.js';
import { contributeTrades } from './trades.js';

/**
 * One swap or transfer row as a trade. The broker's quantity is never
 * signed (the type says the direction) and its amount is negative on the way
 * out, so the price is the amount's size over the units. No fee. The value
 * can be a cost rather than a market price (ADR 0031).
 *
 * @param {any} row
 * @returns {import('./map.js').SyncedTrade}
 */
export function mapMovementRow(row) {
  const units = requireRowUnits(row);
  return {
    externalId: String(row.id),
    date: toDayKey(new Date(row.last_event_datetime)),
    direction: String(row.non_trade_security_transaction_type).endsWith('_OUT') ? 'sell' : 'buy',
    units,
    price: pricePerUnit(toCents(requireRowAmount(row)), units),
    fee: 0,
    currency: BASE_CURRENCY,
  };
}

/**
 * Removes each cancellation row together with the row it undoes (same
 * holding, kind, quantity and size). A cancellation that undoes nothing is
 * reported, and ignored.
 *
 * @param {any[]} rows
 * @returns {{ rows: any[], warnings: string[] }}
 */
export function dropCancellationPairs(rows) {
  const kept = rows.filter((row) => row.is_cancellation !== true);
  /** @type {string[]} */
  const warnings = [];
  for (const cancel of rows.filter((row) => row.is_cancellation === true)) {
    const at = kept.findIndex(
      (row) =>
        row.isin === cancel.isin &&
        row.non_trade_security_transaction_type === cancel.non_trade_security_transaction_type &&
        row.quantity === cancel.quantity &&
        Math.abs(row.amount) === Math.abs(cancel.amount)
    );
    if (at === -1) warnings.push('a cancellation of ' + cancel.isin + ' (' + cancel.id + ') matched no transaction and was ignored');
    else kept.splice(at, 1);
  }
  return { rows: kept, warnings };
}

/** @type {SyncPart} */
export const movementsPart = {
  name: 'movements',

  contribute(ctx) {
    ctx.claimed.add('swap');
    ctx.claimed.add('transfer');
    const { rows, warnings } = dropCancellationPairs([...ctx.groups.swap, ...ctx.groups.transfer]);
    ctx.warnings.push(...warnings);
    for (const row of rows) {
      if (typeof row.isin !== 'string') {
        ctx.warnings.push('transaction ' + row.id + ' has no security: skipped');
      } else if (ctx.foreignIsins.has(row.isin)) {
        ctx.warnings.push('transaction ' + row.id + ' of ' + row.isin + ' skipped: the holding is not in ' + BASE_CURRENCY);
      } else {
        contributeTrades(ctx, row.isin, String(row.description ?? row.isin), [mapMovementRow(row)]);
      }
    }
  },

  async plan(ctx) {
    const accounts = await ctx.store.getAccounts();
    const stored = await ctx.store.getTrades();
    for (const holding of ctx.plannedHoldings) {
      if (holding.diff.removed > 0) {
        ctx.warnings.push(
          holding.diff.removed + ' synced trade(s) of ' + holding.name + ' (' + holding.isin + ') are no longer reported as settled by the broker: removed'
        );
      }
      const account = accounts.find((row) => row.id === holding.accountId);
      const others = stored.filter((t) => t.accountId === holding.accountId && t.origin?.source !== ORIGIN_SOURCES.scalable);
      const all = [...others, .../** @type {any[]} */ (holding.trades)];
      if (account?.archivedOn && !wasArchivedAtZero(account.archivedOn, all)) continue;
      const day = dayUnitsReachedZero(all);
      if (day !== null && day !== account?.archivedOn) ctx.report.push('archive "' + holding.name + '" on ' + day + ': no units left');
      else if (day === null && account?.archivedOn) ctx.report.push('restore "' + holding.name + '": units are back');
    }
  },

  async apply(ctx) {
    let written = 0;
    for (const holding of ctx.plannedHoldings) {
      const accountId = ctx.accountIds.get(holding.isin);
      if (accountId === undefined) continue;
      const trades = await ctx.store.getTrades({ accountId });
      if (trades.length === 0) continue;
      const account = await ctx.store.getAccount(accountId);
      const day = dayUnitsReachedZero(trades);
      if (account === null || day === account.archivedOn) continue;
      // archived by hand while it held units: not the sync's to restore
      if (account.archivedOn && !wasArchivedAtZero(account.archivedOn, trades)) continue;
      await ctx.store.setSyncedAccountArchivedOn(accountId, day);
      written += 1;
    }
    return written;
  },
};
