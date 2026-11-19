/**
 * A refund paired with the purchase it gives money back for (ADR 0055).
 *
 * The pair is a link, `refund -> refund_of -> purchase`, never a field on
 * either movement: both are the statement's, and a re-import rewrites their
 * source's zone while the link, the user's, stays (ADR 0023). This module
 * reads the links into pairs, says whether two movements may be paired --
 * the one rule the store refuses by and the panel offers by -- and lists
 * the purchases a refund could be paired with. How a pair counts and how it
 * is listed is the flows' (lib/domain/derive/finance.js), through the pairs
 * read here.
 *
 * Pure, plain Node.
 */

import { daysBetween, shiftDayKey } from '../dates.js';
import { formatMoney } from '../format.js';
import { merchantKey } from '../merchant.js';
import { limits } from '../../../personalos.config.js';

/** @typedef {import('../types.js').Transaction} Transaction */

/**
 * The pairs, both ways: a refund's purchase, and a purchase's refunds.
 *
 * @typedef {object} RefundPairs
 * @property {ReadonlyMap<string, Transaction>} purchaseOf refund id -> the
 *   purchase it refunds
 * @property {ReadonlyMap<string, Transaction[]>} refundsOf purchase id ->
 *   its refunds, oldest first
 */

/** No pair at all: what a reading that is handed none reads by. */
export const NO_REFUNDS = /** @type {RefundPairs} */ (Object.freeze({ purchaseOf: new Map(), refundsOf: new Map() }));

/**
 * The pairs the `refund_of` links make among these movements. A link whose
 * end is not among them pairs nothing: a reading of some movements never
 * borrows a purchase it was not handed. The store keeps every pair valid
 * (refundRefusal), so nothing else is checked here.
 *
 * @param {Transaction[]} transactions
 * @param {Pick<import('../types.js').Link, 'from' | 'to' | 'rel'>[]} links any links; only `refund_of` is read
 * @returns {RefundPairs}
 */
export function refundPairs(transactions, links) {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  /** @type {Map<string, Transaction>} */
  const purchaseOf = new Map();
  /** @type {Map<string, Transaction[]>} */
  const refundsOf = new Map();
  for (const link of links) {
    if (link.rel !== 'refund_of') continue;
    const refund = byId.get(link.from);
    const purchase = byId.get(link.to);
    if (refund === undefined || purchase === undefined || purchaseOf.has(refund.id)) continue;
    purchaseOf.set(refund.id, purchase);
    refundsOf.set(purchase.id, [...(refundsOf.get(purchase.id) ?? []), refund]);
  }
  for (const refunds of refundsOf.values()) {
    refunds.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  return { purchaseOf, refundsOf };
}

/**
 * How much of a purchase has come back: its refunds' amounts added up,
 * positive minor units; 0 for none.
 *
 * @param {string} purchaseId
 * @param {RefundPairs} pairs
 * @returns {number}
 */
export function refundedAmount(purchaseId, pairs) {
  return (pairs.refundsOf.get(purchaseId) ?? []).reduce((sum, refund) => sum + refund.amount, 0);
}

/**
 * Why a refund may not be paired with a purchase, or null when it may (ADR
 * 0055). The one rule: the store refuses a pair by it -- when it is made and
 * whenever either end changes -- and the panel offers only the purchases it
 * allows.
 *
 * - The refund is money in on a cash account, the purchase money out.
 * - Neither is a transfer: money that stayed yours was not spent or given back.
 * - One currency.
 * - The refund is not dated before the purchase. The same account is not
 *   required: a refund can land elsewhere.
 * - The refunds of a purchase never come to more than it cost.
 *
 * @param {Pick<Transaction, 'amount' | 'currency' | 'date' | 'counterAccountId'>} refund
 * @param {Pick<Transaction, 'amount' | 'currency' | 'date' | 'counterAccountId'>} purchase
 * @param {{ refundAccountKind: string, refundedBefore: number }} context the
 *   kind of the refund's account, and what the purchase's other refunds
 *   already come to (positive minor units)
 * @returns {string | null}
 */
export function refundRefusal(refund, purchase, { refundAccountKind, refundedBefore }) {
  if (refund.counterAccountId !== null) return 'a transfer is not a refund: money moved between your own accounts was never spent';
  if (purchase.counterAccountId !== null) return 'a transfer is not a purchase: money moved between your own accounts was never spent';
  if (refund.amount <= 0) return 'a refund is money in';
  if (purchase.amount >= 0) return 'the purchase a refund gives back is money out';
  if (refundAccountKind !== 'cash') return 'a refund is money in on a cash account';
  if (refund.currency !== purchase.currency) return 'a refund is in the currency of its purchase';
  if (refund.date < purchase.date) return 'a refund is not dated before its purchase (' + purchase.date + ')';
  const cost = -purchase.amount;
  if (refundedBefore + refund.amount > cost) {
    return (
      'the refunds of a purchase may not come to more than it cost: ' +
      formatMoney(refundedBefore + refund.amount, { cents: true }) +
      ' back of ' +
      formatMoney(cost, { cents: true })
    );
  }
  return null;
}

/**
 * Why a pair may not stand, read against the rest of the data (ADR 0055):
 * refundRefusal with the refund's account and what the purchase's other
 * refunds come to. `changed`, when given, is a movement as it would stand
 * after a write, read in place of the stored one -- so the store checks a
 * correction or a re-import of either end, and an import's plan finds it
 * before writing anything. Null when it may stand.
 *
 * @param {string} refundId
 * @param {string} purchaseId
 * @param {{
 *   transactions: Transaction[],
 *   links: Pick<import('../types.js').Link, 'from' | 'to' | 'rel'>[],
 *   accounts: Pick<import('../types.js').FinanceAccount, 'id' | 'kind'>[],
 *   changed?: Transaction | null,
 * }} data
 * @returns {string | null}
 */
export function pairRefusal(refundId, purchaseId, { transactions, links, accounts, changed = null }) {
  /** @param {string} id */
  const movement = (id) => (changed !== null && changed.id === id ? changed : transactions.find((row) => row.id === id));
  const refund = movement(refundId);
  const purchase = movement(purchaseId);
  if (refund === undefined) return 'no transaction with id ' + refundId;
  if (purchase === undefined) return 'no transaction with id ' + purchaseId;
  const refundedBefore = links
    .filter((link) => link.rel === 'refund_of' && link.to === purchaseId && link.from !== refundId)
    .reduce((sum, link) => sum + (movement(link.from)?.amount ?? 0), 0);
  const refundAccountKind = accounts.find((account) => account.id === refund.accountId)?.kind ?? '';
  return refundRefusal(refund, purchase, { refundAccountKind, refundedBefore });
}

/**
 * Why writing a movement as `changed` would break a pair it is an end of
 * (ADR 0055) -- "unpair it first" -- or null. A rule that reads a second
 * movement is enforced when either changes (CODING_STANDARDS).
 *
 * @param {Transaction} changed the movement as it would stand
 * @param {{
 *   transactions: Transaction[],
 *   links: Pick<import('../types.js').Link, 'from' | 'to' | 'rel'>[],
 *   accounts: Pick<import('../types.js').FinanceAccount, 'id' | 'kind'>[],
 * }} data as stored
 * @returns {string | null}
 */
export function pairBrokenBy(changed, data) {
  for (const link of data.links) {
    if (link.rel !== 'refund_of' || (link.from !== changed.id && link.to !== changed.id)) continue;
    const refusal = pairRefusal(link.from, link.to, { ...data, changed });
    if (refusal === null) continue;
    return (link.from === changed.id ? 'this movement is paired as a refund' : 'this movement has a refund paired with it') + ', and ' + refusal + ': unpair it first';
  }
  return null;
}

/**
 * One purchase a refund could be paired with.
 *
 * @typedef {object} RefundCandidate
 * @property {Transaction} purchase
 * @property {number} remaining what of it has not come back yet, positive
 *   minor units
 */

/**
 * The purchases a refund could be paired with (ADR 0055), for its panel:
 * money out, not a transfer, in its currency, dated at most `days` before it
 * and not after it, with at least the refund's amount not yet refunded. The
 * same account first, then the same merchant (merchantKey), then the nearest
 * date, then the larger remaining; the first `max`, and how many more.
 *
 * @param {Transaction} refund money in, not paired
 * @param {Transaction[]} transactions
 * @param {RefundPairs} pairs
 * @param {{ days?: number, max?: number }} [options]
 * @returns {{ rows: RefundCandidate[], more: number }}
 */
export function refundCandidates(refund, transactions, pairs, { days = limits.financeRefundWindowDays, max = limits.financeRefundCandidatesMax } = {}) {
  const earliest = shiftDayKey(refund.date, -days);
  const key = merchantKey(refund);
  const found = [];
  for (const purchase of transactions) {
    if (purchase.amount >= 0 || purchase.counterAccountId !== null || purchase.currency !== refund.currency) continue;
    if (purchase.date > refund.date || purchase.date < earliest) continue;
    const remaining = -purchase.amount - refundedAmount(purchase.id, pairs);
    if (remaining < refund.amount) continue;
    found.push({
      purchase,
      remaining,
      sameAccount: purchase.accountId === refund.accountId ? 0 : 1,
      sameMerchant: merchantKey(purchase) === key ? 0 : 1,
      apart: daysBetween(purchase.date, refund.date),
    });
  }
  found.sort(
    (a, b) =>
      a.sameAccount - b.sameAccount ||
      a.sameMerchant - b.sameMerchant ||
      a.apart - b.apart ||
      b.remaining - a.remaining ||
      a.purchase.id.localeCompare(b.purchase.id)
  );
  return {
    rows: found.slice(0, max).map(({ purchase, remaining }) => ({ purchase, remaining })),
    more: Math.max(0, found.length - max),
  };
}

/**
 * Where a movement stands as one end of a pair, as a list shows it (ADR
 * 0055): a paired refund, a purchase with refunds, or neither (null).
 *
 * - A refund names its purchase.
 * - A purchase says what came back and what is left: `net` is its amount
 *   with the refunds added (signed as the amount, 0 when all of it came
 *   back), `whole` whether all of it did.
 *
 * @typedef {{ kind: 'refund', purchase: { id: string, description: string } }
 *   | { kind: 'purchase', refunded: number, net: number, whole: boolean }} RefundStanding
 */

/**
 * @param {Transaction} transaction
 * @param {RefundPairs} pairs
 * @returns {RefundStanding | null}
 */
export function refundStanding(transaction, pairs) {
  const purchase = pairs.purchaseOf.get(transaction.id);
  if (purchase !== undefined) return { kind: 'refund', purchase: { id: purchase.id, description: purchase.description } };
  if (!pairs.refundsOf.has(transaction.id)) return null;
  const refunded = refundedAmount(transaction.id, pairs);
  const net = transaction.amount + refunded;
  return { kind: 'purchase', refunded, net: net > 0 ? 0 : net, whole: net >= 0 };
}

/**
 * Whether a list by default leaves a movement out (ADR 0055): a paired
 * refund, and a purchase all of which came back. A purchase partly refunded
 * stays, at what is left of it.
 *
 * @param {RefundStanding | null} standing
 * @returns {boolean}
 */
export function hiddenAsRefunded(standing) {
  return standing !== null && (standing.kind === 'refund' || standing.whole);
}

/**
 * A movement in a list a panel shows: what its row prints and opens.
 *
 * @typedef {object} PairedMovement
 * @property {string} id
 * @property {string} date day key
 * @property {string} description
 * @property {number} amount minor units, signed from its account's side
 */

/**
 * What a movement's panel shows of pairing (ADR 0055).
 *
 * - `purchase`: the purchase this refund is paired with, or null.
 * - `refunds`: the refunds paired with this purchase, oldest first, and
 *   `net`, its amount with them added (signed as the amount).
 * - `candidates`: the purchases it could be paired with (refundCandidates),
 *   offered only for money in on a cash account, not a transfer and not
 *   paired yet; null otherwise.
 *
 * @typedef {object} RefundPanel
 * @property {PairedMovement | null} purchase
 * @property {PairedMovement[]} refunds
 * @property {number} net
 * @property {{ rows: (PairedMovement & { remaining: number })[], more: number } | null} candidates
 */

/**
 * @param {Pick<Transaction, 'id' | 'date' | 'description' | 'amount'>} transaction
 * @returns {PairedMovement}
 */
function paired({ id, date, description, amount }) {
  return { id, date, description, amount };
}

/**
 * The pairing a movement's panel shows (ADR 0055): only what its rows
 * print, so the page hands little to the screen.
 *
 * @param {Transaction} transaction the selected movement
 * @param {Transaction[]} transactions every movement
 * @param {RefundPairs} pairs
 * @param {Pick<import('../types.js').FinanceAccount, 'id' | 'kind'>[]} accounts
 * @param {{ days?: number, max?: number }} [options]
 * @returns {RefundPanel}
 */
export function refundPanel(transaction, transactions, pairs, accounts, options) {
  const purchase = pairs.purchaseOf.get(transaction.id);
  const refunds = pairs.refundsOf.get(transaction.id) ?? [];
  const kind = accounts.find((account) => account.id === transaction.accountId)?.kind;
  const offered = purchase === undefined && transaction.amount > 0 && transaction.counterAccountId === null && kind === 'cash';
  const found = offered ? refundCandidates(transaction, transactions, pairs, options) : null;
  return {
    purchase: purchase === undefined ? null : paired(purchase),
    refunds: refunds.map(paired),
    net: transaction.amount + refundedAmount(transaction.id, pairs),
    candidates: found === null ? null : { rows: found.rows.map((row) => ({ ...paired(row.purchase), remaining: row.remaining })), more: found.more },
  };
}
