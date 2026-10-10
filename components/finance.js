/**
 * Helpers the Finances screen's components share (CODING_STANDARDS.md):
 * its addresses, and how a movement's direction maps to a signed amount.
 */

/**
 * Where you are on the Finances screen: the selected account, the month
 * read, the selected transaction. Each by id or key, never by place in a
 * list.
 *
 * @typedef {object} FinancesPlace
 * @property {string | null} [account]
 * @property {string | null} [month] YYYY-MM
 * @property {string | null} [transaction]
 */

/** @type {(keyof FinancesPlace)[]} */
const PLACE_KEYS = ['account', 'month', 'transaction'];

/**
 * A Finances address. One place builds them, so selecting an account keeps
 * the month you were reading and the reverse.
 *
 * @param {FinancesPlace} [place]
 * @returns {string}
 */
export function financesHref(place = {}) {
  const params = new URLSearchParams();
  for (const key of PLACE_KEYS) {
    const value = place[key];
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  const query = params.toString();
  return query === '' ? '/finances' : '/finances?' + query;
}

/**
 * Which way money moves, as the movement form offers it, so nobody types a
 * sign: out of the account, into it, or to another of your accounts.
 *
 * @typedef {'out' | 'in' | 'transfer'} Direction
 */

/** @type {Record<Direction, string>} */
export const DIRECTION_LABELS = { out: 'Money out', in: 'Money in', transfer: 'Transfer' };

/**
 * A transaction's direction (ADR 0023): a transfer when it has a counter
 * account, else by the sign of its amount.
 *
 * @param {Pick<import('@/lib/domain/types.js').Transaction, 'amount' | 'counterAccountId'>} transaction
 * @returns {Direction}
 */
export function directionOf(transaction) {
  if (transaction.counterAccountId !== null) return 'transfer';
  return transaction.amount < 0 ? 'out' : 'in';
}

/**
 * The signed amount a direction stores, from a magnitude: money out and a
 * transfer leave the account, money in arrives.
 *
 * @param {Direction} direction
 * @param {number} magnitude minor units, positive
 * @returns {number}
 */
export function signedAmount(direction, magnitude) {
  return direction === 'in' ? Math.abs(magnitude) : -Math.abs(magnitude);
}

/**
 * Tags as typed in one field -- "home, gift" -- to the list the store keeps.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseTags(text) {
  return text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
}

/** @param {string} id */
export function transactionUrl(id) {
  return '/api/transactions/' + encodeURIComponent(id);
}
