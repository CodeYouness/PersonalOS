/**
 * What categorising reads in a statement movement (ADR 0043): the merchant
 * key it groups movements by, the direction, the bank's own category, and
 * whether the bank's movement type rules a movement in or out as one leg of
 * a transfer between your own accounts. Pure.
 *
 * The merchant key's rules live in lib/domain/merchant.js, since a refund's
 * panel reads the same key (ADR 0055); they are re-exported here for the
 * categorising scripts.
 */

export { BLANK_KEY, merchantKey, normaliseKey } from '../../lib/domain/merchant.js';

/**
 * @param {number} amount signed minor units
 * @returns {'in' | 'out'}
 */
export function directionOf(amount) {
  return amount < 0 ? 'out' : 'in';
}

/**
 * The bank's own category, "Category > Subcategory", or '' when it gives none.
 *
 * @param {Record<string, string> | null | undefined} detail
 * @returns {string}
 */
export function bankCategoryOf(detail) {
  return [detail?.category, detail?.subcategory].filter((part) => typeof part === 'string' && part !== '').join(' > ');
}

/**
 * The text with every run of digits replaced by "#": what is sent of a
 * description, so a card number, a reference, an amount or a date inside the
 * bank's text never leaves.
 *
 * @param {string} text
 * @returns {string}
 */
export function maskDigits(text) {
  return text.replace(/\d+/g, '#');
}

/** Movement types that are never a transfer between your own accounts. */
const NOT_A_TRANSFER = /carta|card|\bpos\b|addebito|rimborso|storno|commission|spese|interess|imposta|bollo|emolument|stipend|cambia valuta|cashback|prelievo|versamento contant/;

/** Movement types that say money moved between accounts. */
const A_TRANSFER = /giroconto|trasferiment|ricarica|top.?up|transfer/;

/**
 * What the bank's movement type says about a movement as one leg of a
 * transfer between two of your statement accounts:
 *
 * - `excluded` -- a card's own list (its rows are payments and refunds), a
 *   fee charged on a row, or a type that names a card payment, a refund, a
 *   reversal, a fee, interest, a tax, a salary, a currency exchange or cash;
 * - `confirmed` -- a type that names a transfer, a top-up or a giroconto;
 * - `unknown` -- no type, or one that says only the direction (Entrata,
 *   Uscita).
 *
 * Excluded wins: "a card top-up refunded" is not a transfer leg.
 *
 * @param {Record<string, string> | null | undefined} detail
 * @returns {'excluded' | 'confirmed' | 'unknown'}
 */
export function transferEvidence(detail) {
  if (detail === undefined || detail === null) return 'unknown';
  if (detail.merchant !== undefined || detail.part === 'fee') return 'excluded';
  const type = (detail.type ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (NOT_A_TRANSFER.test(type)) return 'excluded';
  if (A_TRANSFER.test(type)) return 'confirmed';
  return 'unknown';
}
