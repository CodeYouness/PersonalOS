/**
 * Searching the movements by text (ADR 0058).
 *
 * The Transactions card's search field lists, over all time, the movements
 * whose words or amount match what was typed. This module is the one rule
 * for "matches": what a movement is searched by, how text is compared, and
 * how an amount typed as a person types it is read.
 *
 * Display only: nothing is stored and no figure reads this. Pure, plain
 * Node -- it runs on a page load, so it never calls the model or an
 * integration (rule 3).
 */

/** @typedef {import('../types.js').Transaction} Transaction */
/** @typedef {import('../types.js').FinanceCategory} FinanceCategory */
/** @typedef {import('../types.js').FinanceAccount} FinanceAccount */

/**
 * What a search reads a movement's names from: its category and the
 * category's parent, its account and a transfer's other end.
 *
 * @typedef {object} SearchContext
 * @property {Pick<FinanceCategory, 'id' | 'name' | 'parentId'>[]} categories
 * @property {Pick<FinanceAccount, 'id' | 'name'>[]} accounts
 */

/**
 * Text as a search compares it: no case, no accents (é, ç, å read as e, c,
 * a), spaces collapsed and trimmed.
 *
 * @param {string} text
 * @returns {string}
 */
export function foldText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * An amount typed as a person types it, in minor units: "12.50", "12,50",
 * "12,5", "250", "1.250,00", "1,250.00", with a sign or a euro sign around
 * it, which say nothing a search uses. A point or a comma followed by one or
 * two digits is the decimal separator; followed by three, a thousands
 * separator. Null for anything else -- a word, "12.", "1,2345" -- and for
 * zero, which no movement is.
 *
 * @param {string} text one word of a search
 * @returns {number | null}
 */
export function amountQuery(text) {
  const bare = text.trim().replace(/^[+\-−]/u, '').replace(/^€\s*|\s*€$/gu, '').replace(/^[+\-−]/u, '');
  const match = /^(\d{1,3}(?:([.,])\d{3})*|\d+)(?:([.,])(\d{1,2}))?$/u.exec(bare);
  if (match === null) return null;
  const [, whole, grouping, decimal, cents = ''] = match;
  // One separator for thousands and another for decimals, never the same.
  if (grouping !== undefined && decimal !== undefined && grouping === decimal) return null;
  const units = Number(whole.replace(/[.,]/gu, ''));
  const minor = units * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/**
 * Whether a movement matches a search (ADR 0058): every word of it is found
 * -- folded, anywhere -- in the movement's description, note, tags, category
 * name, the category's parent's name, its account's name or a transfer's
 * other account's name; or the word is an amount (amountQuery) equal to the
 * movement's, whichever way the money moved. An empty search matches
 * nothing.
 *
 * @param {Transaction} transaction
 * @param {string} query as typed
 * @param {SearchContext} context
 * @returns {boolean}
 */
export function transactionMatches(transaction, query, context) {
  const words = wordsOf(query);
  if (words.length === 0) return false;
  return matchesWords(transaction, words, haystack(transaction, namesOf(context)));
}

/**
 * The movements a search finds, in the order they are handed -- newest
 * first, as the store hands them -- over every month, whatever they are:
 * refunded, not counted, a day of interest. Nothing is hidden or folded:
 * finding a refunded purchase is the point.
 *
 * @param {Transaction[]} transactions
 * @param {string} query as typed
 * @param {SearchContext} context
 * @returns {Transaction[]}
 */
export function searchTransactions(transactions, query, context) {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const names = namesOf(context);
  return transactions.filter((transaction) => matchesWords(transaction, words, haystack(transaction, names)));
}

/**
 * The categories and the accounts by id, read once per search.
 *
 * @typedef {{ categories: Map<string, Pick<FinanceCategory, 'id' | 'name' | 'parentId'>>, accounts: Map<string, string> }} Names
 */

/**
 * @param {SearchContext} context
 * @returns {Names}
 */
function namesOf(context) {
  return {
    categories: new Map(context.categories.map((category) => [category.id, category])),
    accounts: new Map(context.accounts.map((account) => [account.id, account.name])),
  };
}

/**
 * @typedef {{ text: string, amount: number | null }} Word
 */

/**
 * @param {string} query
 * @returns {Word[]}
 */
function wordsOf(query) {
  const folded = foldText(query);
  return folded === '' ? [] : folded.split(' ').map((text) => ({ text, amount: amountQuery(text) }));
}

/**
 * @param {Transaction} transaction
 * @param {Word[]} words
 * @param {string} text the movement's folded names
 * @returns {boolean}
 */
function matchesWords(transaction, words, text) {
  const size = Math.abs(transaction.amount);
  return words.every((word) => text.includes(word.text) || word.amount === size);
}

/**
 * Everything a movement is searched by, folded, one field a line.
 *
 * @param {Transaction} transaction
 * @param {Names} names
 * @returns {string}
 */
function haystack(transaction, { categories, accounts }) {
  const categoryOf = (/** @type {string | null} */ id) => (id === null ? undefined : categories.get(id));
  const accountName = (/** @type {string | null} */ id) => (id === null ? undefined : accounts.get(id));
  const category = categoryOf(transaction.categoryId);
  const parent = category === undefined ? undefined : categoryOf(category.parentId);
  return [
    transaction.description,
    transaction.note,
    ...transaction.tags,
    category?.name,
    parent?.name,
    accountName(transaction.accountId),
    accountName(transaction.counterAccountId),
  ]
    .filter((field) => typeof field === 'string' && field !== '')
    .map((field) => foldText(/** @type {string} */ (field)))
    .join('\n');
}
