/**
 * Meaning of `sc`'s rows, pure: which transaction rows are trades this
 * ticket writes, which belong to a later part of the sync, and what a trade's
 * units, price, fee and day are (ADR 0031). No store, no process, no clock.
 */

import { toDayKey } from '../../domain/dates.js';

export const BASE_CURRENCY = 'EUR';

/**
 * Row groups a part of the sync may claim. A group nobody claims is reported
 * as a warning, never written: that is how a row kind that no ticket has
 * mapped yet stays visible.
 *
 * @typedef {'trade' | 'swap' | 'transfer' | 'cash' | 'cancelled' | 'notSettled' | 'foreignCurrency' | 'other'} RowGroup
 */

/** How an unclaimed group reads in a warning. */
export const GROUP_LABELS = Object.freeze({
  swap: 'fund merger / swap',
  transfer: 'transfer of units',
  cash: 'cash movement',
  notSettled: 'not yet settled',
  other: 'unrecognised',
});

const SETTLED = new Set(['SETTLED', 'FILLED']);

/**
 * @param {any[]} rows `sc broker transactions` items
 * @returns {{ groups: Record<RowGroup, any[]>, warnings: string[] }} `trade`
 *   holds the settled BUY and SELL rows, cancellation pairs already removed
 */
export function partitionRows(rows) {
  /** @type {Record<RowGroup, any[]>} */
  const groups = { trade: [], swap: [], transfer: [], cash: [], cancelled: [], notSettled: [], foreignCurrency: [], other: [] };
  /** @type {string[]} */
  const warnings = [];
  /** @type {any[]} */
  const cancellations = [];

  for (const row of rows) {
    if (row.type === 'CASH_TRANSACTION') groups.cash.push(row);
    else if (row.status === 'CANCELLED') groups.cancelled.push(row);
    else if (!SETTLED.has(row.status)) groups.notSettled.push(row);
    else if (row.currency !== BASE_CURRENCY) groups.foreignCurrency.push(row);
    else if (row.type === 'NON_TRADE_SECURITY_TRANSACTION') {
      const kind = String(row.non_trade_security_transaction_type ?? '');
      if (kind.startsWith('SWAP_')) groups.swap.push(row);
      else if (kind.startsWith('TRANSFER_')) groups.transfer.push(row);
      else groups.other.push(row);
    } else if (row.type === 'SECURITY_TRANSACTION' && (row.side === 'BUY' || row.side === 'SELL') && typeof row.isin === 'string') {
      (row.is_cancellation === true ? cancellations : groups.trade).push(row);
    } else groups.other.push(row);
  }

  // A cancellation row undoes one order of the same size on the same side.
  for (const cancel of cancellations) {
    const at = groups.trade.findIndex(
      (row) => row.isin === cancel.isin && row.side === cancel.side && row.quantity === cancel.quantity && Math.abs(row.amount) === Math.abs(cancel.amount)
    );
    if (at === -1) warnings.push('a cancellation of ' + cancel.isin + ' (' + cancel.id + ') matched no order and was ignored');
    else groups.trade.splice(at, 1);
  }
  return { groups, warnings };
}

/**
 * Rounds half up to an integer, safe against float noise such as
 * 50.50000000000001 or 50.49999999999999 from a division.
 *
 * @param {number} value
 * @returns {number}
 */
export function roundHalfUp(value) {
  return Math.floor(Number(value.toFixed(6)) + 0.5);
}

/**
 * @param {number} quantity a broker quantity (up to 8 decimals)
 * @returns {number} units in 10^-8
 */
export function toUnits(quantity) {
  return Math.round(quantity * 1e8);
}

/**
 * @param {number} amount euros
 * @returns {number} cents
 */
export function toCents(amount) {
  return roundHalfUp(amount * 100);
}

/**
 * One settled BUY or SELL row as a trade for the store.
 *
 * A single order's list `amount` already includes its fee, so with the
 * order's details the price is the market valuation over the units and the
 * fee is the details' fee: units x price + fee is the amount, within
 * rounding cents. A savings plan has no fee and is priced from its amount.
 *
 * @param {any} row
 * @param {Record<string, any> | null} details the order's `security_trade`,
 *   present for single orders
 * @returns {{ trade: SyncedTrade, warning: string | null }}
 */
export function mapTradeRow(row, details) {
  const units = toUnits(Number(row.quantity));
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error('transaction ' + row.id + ' has no usable quantity');
  const quantity = units / 1e8;

  const amounts = details?.trade_transaction_amounts ?? null;
  const valuation = amounts !== null && typeof amounts.market_valuation === 'number' ? amounts.market_valuation : null;
  const warning =
    details !== null && valuation === null
      ? 'order ' + row.id + ' has no market valuation in its details: priced from its amount, fee 0'
      : null;

  const cost = valuation ?? Math.abs(Number(row.amount));
  const fee = valuation !== null && typeof amounts.transaction_fee === 'number' ? toCents(amounts.transaction_fee) : 0;
  return {
    trade: {
      externalId: String(row.id),
      date: toDayKey(new Date(row.last_event_datetime)),
      direction: row.side === 'SELL' ? 'sell' : 'buy',
      units,
      price: roundHalfUp((cost * 100) / quantity),
      fee,
      currency: BASE_CURRENCY,
    },
    warning,
  };
}

/**
 * @typedef {object} SyncedTrade a trade as the store's replaceSyncedTrades takes it
 * @property {string} externalId
 * @property {string} date
 * @property {'buy' | 'sell'} direction
 * @property {number} units 10^-8
 * @property {number} price cents per unit
 * @property {number} fee cents
 * @property {string} currency
 */
