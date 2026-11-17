import { formatMoney, formatMoneyChange, monthSpan } from '@/components/format.js';
import { financesAddress } from '@/lib/domain/addresses.js';
import { UNCATEGORISED_INCOME, UNCATEGORISED_SPENDING } from '@/lib/domain/derive/finance.js';
import { CATEGORY_KINDS } from '@/personalos.config.js';

/**
 * Helpers the Finances screen's components share (CODING_STANDARDS.md):
 * its addresses, how a movement's direction maps to a signed amount, and how
 * a movement's amount is shown in a list.
 */

/**
 * Where you are on the Finances screen (lib/domain/addresses.js).
 *
 * @typedef {import('@/lib/domain/addresses.js').FinancesPlace} FinancesPlace
 */

/**
 * A line of the month as a heading names it: a category's name, or
 * "Uncategorised" with its direction. Null for a line that does not exist.
 *
 * @param {string} line
 * @param {import('@/lib/domain/types.js').FinanceCategory[]} categories
 * @returns {string | null}
 */
export function lineName(line, categories) {
  if (line === UNCATEGORISED_SPENDING) return 'Uncategorised spending';
  if (line === UNCATEGORISED_INCOME) return 'Uncategorised income';
  return categories.find((category) => category.id === line)?.name ?? null;
}

/**
 * A Finances address. One place builds them, so selecting an account keeps
 * the month you were reading and the reverse.
 *
 * @param {FinancesPlace} [place]
 * @returns {string}
 */
export function financesHref(place = {}) {
  return financesAddress(place);
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
 * Tags as typed in one field -- "Home, gift" -- to the list the store keeps:
 * trimmed, lowercased, each once, so the panel shows what was saved.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseTags(text) {
  return [...new Set(text.split(',').map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ''))];
}

/**
 * Which way a transfer ran (ADR 0023): money that left `accountId` went to
 * the counter account; money that arrived came from it.
 *
 * @param {Pick<import('@/lib/domain/types.js').Transaction, 'amount' | 'accountId' | 'counterAccountId'>} transaction
 *   a transfer
 * @returns {{ from: string, to: string }}
 */
export function transferEnds(transaction) {
  const counter = /** @type {string} */ (transaction.counterAccountId);
  return transaction.amount < 0
    ? { from: transaction.accountId, to: counter }
    : { from: counter, to: transaction.accountId };
}

/**
 * A movement's amount as a list's last cell, money in or out (ADR 0048): "+
 * 12.40" in the up tone for money in, "− 12.40" in the ink for money out, the
 * sign always printed. Not counted: the same sign, quieter. A transfer: the
 * amount moved, quieter, since the money stayed yours. The Transactions card
 * and the movements Income & spending opens in place both print it here, so
 * they never sign a movement differently.
 *
 * @param {{ amount: number, transfer?: boolean, notCounted?: boolean }} props
 *   amount in minor units, signed from the account's side
 */
export function MovementAmount({ amount, transfer = false, notCounted = false }) {
  if (transfer) return <td className="num finance-amount is-quiet">{formatMoney(Math.abs(amount), { cents: true })}</td>;
  const shown = formatMoneyChange(amount, { cents: true });
  if (notCounted) return <td className="num finance-amount is-quiet">{shown}</td>;
  return <td className={'num finance-amount' + (amount > 0 ? ' up' : '')}>{shown}</td>;
}

/**
 * The note a movement counted over months carries in a list by date (ADR
 * 0052): "counted over Sep–Nov". Null when it counts in the month of its
 * date, and on a transfer or a movement not counted, which are in no flow.
 *
 * @param {Pick<import('@/lib/domain/types.js').Transaction, 'counterAccountId' | 'notCounted' | 'countedOver'>} transaction
 * @returns {string | null}
 */
export function countedOverNote(transaction) {
  const range = transaction.countedOver ?? null;
  if (range === null || transaction.counterAccountId !== null || transaction.notCounted) return null;
  return 'counted over ' + monthSpan(range.from, range.to);
}

/** How the account panel names a kind, as the mockup does: "invested", "debt". */
/** @type {Record<import('@/lib/domain/types.js').FinanceAccount['kind'], string>} */
export const KIND_LABELS = { cash: 'cash', investment: 'invested', asset: 'asset', liability: 'debt' };

/** @param {string} id */
export function accountUrl(id) {
  return '/api/accounts/' + encodeURIComponent(id);
}

/** @type {Record<'income' | 'expense', string>} */
const CATEGORY_KIND_LABELS = { expense: 'Spending', income: 'Income' };

/**
 * The kinds of category (CATEGORY_KINDS), in the order the screen lists
 * them: spending first, as the money that needs watching.
 *
 * @type {readonly { kind: 'expense' | 'income', label: string }[]}
 */
export const CATEGORY_GROUPS = [...CATEGORY_KINDS]
  .sort((a, b) => (a === 'expense' ? -1 : b === 'expense' ? 1 : 0))
  .map((kind) => ({ kind: /** @type {'income' | 'expense'} */ (kind), label: CATEGORY_KIND_LABELS[/** @type {'income' | 'expense'} */ (kind)] }));

/**
 * The categories a movement can be filed on, two levels deep (#136): per
 * kind, each parent followed by its subcategories. An archived category --
 * or one under an archived parent -- leaves the picker but keeps its
 * transactions; the one already chosen stays, so a filed movement still
 * shows where it is.
 *
 * @param {import('@/lib/domain/types.js').FinanceCategory[]} categories
 * @param {string} chosen the category already chosen, or ''
 * @returns {{ kind: 'expense' | 'income', label: string, options: { id: string, name: string, child: boolean }[] }[]}
 */
export function categoryOptions(categories, chosen) {
  const parents = categories.filter((category) => category.parentId === null);
  /** @param {import('@/lib/domain/types.js').FinanceCategory} category */
  const offered = (category) => {
    if (category.id === chosen) return true;
    const parent = parents.find((row) => row.id === category.parentId);
    return !category.archived && !(parent?.archived ?? false);
  };
  return CATEGORY_GROUPS.map(({ kind, label }) => ({
    kind,
    label,
    options: parents
      .filter((parent) => parent.kind === kind)
      .flatMap((parent) => [parent, ...categories.filter((category) => category.parentId === parent.id)])
      .filter(offered)
      .map((category) => ({ id: category.id, name: category.name, child: category.parentId !== null })),
  }));
}

/** @param {string} id */
export function categoryUrl(id) {
  return '/api/finance-categories/' + encodeURIComponent(id);
}

/** @param {string} id */
export function transactionUrl(id) {
  return '/api/transactions/' + encodeURIComponent(id);
}

/**
 * The note a synced account's panel shows in place of its forms (ADR 0031):
 * one sentence for holdings and cash alike, since trades, prices and balances
 * are all the broker's.
 *
 * @param {string | undefined} source the account's origin source
 * @returns {string}
 */
export function syncedNote(source) {
  return 'Synced from ' + source + ': its trades, prices and balances are the broker’s and are not corrected here.';
}
