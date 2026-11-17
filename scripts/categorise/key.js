/**
 * What categorising reads in a statement movement (ADR 0043): the merchant
 * key it groups movements by, the direction, the bank's own category, and
 * whether the bank's movement type rules a movement in or out as one leg of
 * a transfer between your own accounts. Pure.
 *
 * The key is the merchant the statement names -- a card's `merchant`, a
 * bank's `counterparty` (scripts/statement-import/formats/) -- or else the
 * description, normalised so that one shop is one key across months:
 *
 *   1. lower case, accents dropped ("Caffè" is "caffe");
 *   2. a payment processor's prefix dropped -- a short name followed by a
 *      star or an underscore, "PAYPAL *", "SumUp *", "SQ *", "Zettle_";
 *   3. everything but letters and digits is a space, and every word holding
 *      a digit goes -- a reference, a date, a time, an amount, a card's last
 *      four -- wherever it sits;
 *   4. the words a bank puts before the merchant on a card payment go from
 *      the front ("pagamento pos", "pos"), unless nothing would be left;
 *   5. from the end, reference words ("ref", "del", "eur", "in data") and
 *      month names, whole or abbreviated, go, so "Salary June" and "Salary
 *      July" are one key, and so are "Interest on Aug 1" and "on Sep 1".
 *
 * Changing these rules regroups the movements: a review file made before
 * the change still applies by the ids it lists, and new movements join a
 * group only when their key is the row's.
 */

/** The key of a movement nothing readable is left of. */
export const BLANK_KEY = '(blank)';

/**
 * A processor's name before the merchant, joined by a star or an underscore.
 * The separator is required: "Stripe" alone is a merchant.
 */
const PROCESSOR_PREFIX = /^\s*(?:paypal|pp|sumup|sq|zettle|izettle|stripe|sp|klarna|satispay|nexi)\s*[*_]+\s*/;

/** Word sequences a bank puts before the merchant, longest first. */
const PAYMENT_PREFIXES = Object.freeze([
  ['pagamento', 'con', 'carta'],
  ['pagamento', 'pos'],
  ['pagamento', 'carta'],
  ['acquisto', 'pos'],
  ['acquisto', 'carta'],
  ['operazione', 'carta'],
  ['pag', 'pos'],
  ['pos'],
]);

/** Words that end a description without naming anyone. */
const TRAILING_WORDS = new Set([
  'ref', 'rif', 'n', 'nr', 'no', 'num', 'id', 'del', 'dd', 'data', 'ore', 'il', 'on', 'at', 'of', 'eur', 'euro',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'gen', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'dic', 'in',
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]);

/**
 * A text as a merchant key, by the rules above; '' when nothing is left.
 *
 * @param {string} text
 * @returns {string}
 */
export function normaliseKey(text) {
  const lower = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(PROCESSOR_PREFIX, '');
  let words = lower.split(/[^a-z0-9]+/).filter((word) => word !== '' && !/\d/.test(word));
  for (const prefix of PAYMENT_PREFIXES) {
    if (words.length > prefix.length && prefix.every((word, at) => words[at] === word)) {
      words = words.slice(prefix.length);
      break;
    }
  }
  while (words.length > 0 && TRAILING_WORDS.has(/** @type {string} */ (words.at(-1)))) words.pop();
  return words.join(' ');
}

/**
 * The movement's merchant key: the statement's merchant, else its
 * counterparty, else the description -- the first that leaves something.
 *
 * @param {import('../../lib/domain/types.js').Transaction} transaction
 * @returns {string}
 */
export function merchantKey(transaction) {
  const detail = transaction.origin?.detail ?? {};
  for (const text of [detail.merchant, detail.counterparty, transaction.description]) {
    if (typeof text !== 'string') continue;
    const key = normaliseKey(text);
    if (key !== '') return key;
  }
  return BLANK_KEY;
}

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
