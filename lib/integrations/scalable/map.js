/**
 * Meaning of `sc`'s rows, pure: which transaction rows are trades this
 * ticket writes, which belong to a later part of the sync, and what a trade's
 * units, price, fee and day are (ADR 0031). No store, no process, no clock.
 */

import { toDayKey } from '../../domain/dates.js';
import { pricePerUnit } from '../../domain/derive/pricing.js';

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
 * @param {number} quantity a broker quantity (up to 8 decimals)
 * @returns {number} units in 10^-8
 */
export function toUnits(quantity) {
  return Math.round(quantity * 1e8);
}

/**
 * The one conversion from `sc`'s euros (a JSON number) to integer cents,
 * rounded half up (toward +infinity on a tie). It reads the number's decimal
 * digits -- to 8 places, far past any amount -- instead of multiplying a
 * float by 100, so a value like 1.005 is a tie, not 1.00499999.
 *
 * @param {number} amount euros
 * @returns {number} cents
 */
export function toCents(amount) {
  if (!Number.isFinite(amount)) throw new Error('not an amount: ' + amount);
  const text = Math.abs(amount).toFixed(8).replace('.', '');
  const tenMillionths = BigInt(text) * (amount < 0 ? -1n : 1n);
  const scale = 1000000n;
  const half = scale / 2n;
  let cents = (tenMillionths + half) / scale;
  if ((tenMillionths + half) % scale < 0n) cents -= 1n;
  return Number(cents);
}

/**
 * The units of a row, or a refusal: a run with a row it cannot read writes
 * nothing. The one guard for every mapped row.
 *
 * @param {any} row
 * @returns {number} units in 10^-8
 */
export function requireRowUnits(row) {
  const units = toUnits(Number(row.quantity));
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error('transaction ' + row.id + ' has no usable quantity');
  return units;
}

/**
 * The size of a row's amount in euros, or a refusal: `sc` output is
 * untrusted, and a missing or non-numeric amount fails the run before any
 * write.
 *
 * @param {any} row
 * @returns {number} euros, not signed
 */
export function requireRowAmount(row) {
  const amount = typeof row.amount === 'number' ? row.amount : NaN;
  if (!Number.isFinite(amount)) throw new Error('transaction ' + row.id + ' has no usable amount');
  return Math.abs(amount);
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
  const units = requireRowUnits(row);

  const amounts = details?.trade_transaction_amounts ?? null;
  const valuation = amounts !== null && typeof amounts.market_valuation === 'number' ? amounts.market_valuation : null;
  const warning =
    details !== null && valuation === null
      ? 'order ' + row.id + ' has no market valuation in its details: priced from its amount, fee 0'
      : null;

  const cost = valuation ?? requireRowAmount(row);
  const fee = valuation !== null && typeof amounts.transaction_fee === 'number' ? toCents(amounts.transaction_fee) : 0;
  return {
    trade: {
      externalId: String(row.id),
      date: toDayKey(new Date(row.last_event_datetime)),
      direction: row.side === 'SELL' ? 'sell' : 'buy',
      units,
      price: pricePerUnit(toCents(cost), units),
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
