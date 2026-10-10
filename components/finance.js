import { UNCATEGORISED_INCOME, UNCATEGORISED_SPENDING } from '@/lib/domain/derive/finance.js';
import { CATEGORY_KINDS } from '@/personalos.config.js';

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
 * @property {string | null} [category] a line of the month: a category id,
 *   or one of the Uncategorised lines (lib/domain/derive/finance.js)
 */

/** @type {(keyof FinancesPlace)[]} */
const PLACE_KEYS = ['account', 'month', 'category', 'transaction'];

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

/** How the table names a kind, as the mockup does: "invested", "debt". */
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
