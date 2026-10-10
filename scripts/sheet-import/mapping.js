/**
 * The private mapping the sheet import reads (#139): the only place account
 * and category names exist. It lives in `.scratch/`, never in the
 * repository, and is untrusted until checked here -- every reference in it
 * must resolve before a single row is read.
 *
 * Shape:
 *
 *   accounts          sheet name -> { name, kind, valuation }
 *   holdings          ticker -> sheet name of an account valued by units
 *   categories        [{ name, parent?, kind?, fixedCost? }] -- kind at the
 *                     top level only; a subcategory takes its parent's
 *   pairs             "Categoria|Sottocategoria" -> a category path,
 *                     "investment" or "refund"
 *   openingBalanceTag the tag that marks an opening balance
 *   refundFallback    the category path a refund lands in when no row says
 *                     otherwise -- a spending one
 *   tags              tag -> its new name, or null to drop it
 *   defaultAccount    optional sheet name of an account valued by balance
 *   rows              Timestamp -> { skip?, category?, holding?, notCounted? }
 *
 * A category path is "Parent" or "Parent/Child".
 */

import { ACCOUNT_KINDS, ACCOUNT_VALUATIONS, CATEGORY_KINDS } from '../../personalos.config.js';

/**
 * @typedef {object} MappedAccount
 * @property {string} name
 * @property {'cash' | 'investment' | 'asset' | 'liability'} kind
 * @property {'balance' | 'units'} valuation
 */

/**
 * @typedef {object} MappedCategory
 * @property {string} path "Parent" or "Parent/Child"
 * @property {string} name
 * @property {string | null} parent the parent's name
 * @property {'income' | 'expense'} kind its own, or its parent's
 * @property {boolean} fixedCost
 */

/**
 * @typedef {object} RowOverride
 * @property {boolean} [skip]
 * @property {string} [category] a category path
 * @property {string} [holding] a ticker
 * @property {boolean} [notCounted]
 */

/**
 * @typedef {object} Mapping
 * @property {Record<string, MappedAccount>} accounts
 * @property {Record<string, string>} holdings
 * @property {MappedCategory[]} categories
 * @property {Record<string, string>} pairs
 * @property {string} openingBalanceTag
 * @property {string} refundFallback
 * @property {Record<string, string | null>} tags
 * @property {string | null} defaultAccount
 * @property {Record<string, RowOverride>} rows
 */

/** What a pair may map to besides a category. */
export const PAIR_INVESTMENT = 'investment';
export const PAIR_REFUND = 'refund';

/**
 * Checks a parsed mapping and returns it typed, or throws the first reason
 * it cannot be used.
 *
 * @param {unknown} input
 * @returns {Mapping}
 */
export function validateMapping(input) {
  const root = record(input, 'the mapping');

  /** @type {Record<string, MappedAccount>} */
  const accounts = {};
  for (const [sheetName, value] of Object.entries(record(root.accounts, 'accounts'))) {
    const account = record(value, 'accounts["' + sheetName + '"]');
    const where = 'accounts["' + sheetName + '"]';
    const kind = oneOf(account.kind, where + '.kind', ACCOUNT_KINDS);
    const valuation = account.valuation === undefined ? 'balance' : oneOf(account.valuation, where + '.valuation', ACCOUNT_VALUATIONS);
    if (valuation === 'units' && kind !== 'investment') throw new Error(where + ': only an investment can be valued by units');
    accounts[sheetName] = { name: nonBlank(account.name, where + '.name'), kind: /** @type {any} */ (kind), valuation: /** @type {any} */ (valuation) };
  }

  /** @type {Record<string, string>} */
  const holdings = {};
  for (const [ticker, value] of Object.entries(record(root.holdings ?? {}, 'holdings'))) {
    const sheetName = nonBlank(value, 'holdings["' + ticker + '"]');
    if (accounts[sheetName]?.valuation !== 'units') {
      throw new Error('holdings["' + ticker + '"] must name an account valued by units in accounts, received "' + sheetName + '"');
    }
    holdings[ticker] = sheetName;
  }

  const categories = validateCategories(root.categories);
  const paths = new Map(categories.map((category) => [category.path, category]));
  /** @param {unknown} value @param {string} where */
  const categoryPath = (value, where) => {
    const path = nonBlank(value, where);
    if (!paths.has(path)) throw new Error(where + ' names no category in categories: "' + path + '"');
    return path;
  };

  /** @type {Record<string, string>} */
  const pairs = {};
  for (const [pair, value] of Object.entries(record(root.pairs, 'pairs'))) {
    if (!pair.includes('|')) throw new Error('pairs: "' + pair + '" is not "Categoria|Sottocategoria"');
    pairs[pair] = value === PAIR_INVESTMENT || value === PAIR_REFUND ? value : categoryPath(value, 'pairs["' + pair + '"]');
  }

  const refundFallback = categoryPath(root.refundFallback, 'refundFallback');
  if (paths.get(refundFallback)?.kind !== 'expense') {
    throw new Error('refundFallback must be a spending category: a refund is never income');
  }

  /** @type {Record<string, string | null>} */
  const tags = {};
  for (const [tag, value] of Object.entries(record(root.tags ?? {}, 'tags'))) {
    tags[tag] = value === null ? null : nonBlank(value, 'tags["' + tag + '"]');
  }

  let defaultAccount = null;
  if (root.defaultAccount !== undefined && root.defaultAccount !== null) {
    defaultAccount = nonBlank(root.defaultAccount, 'defaultAccount');
    if (accounts[defaultAccount]?.valuation !== 'balance') {
      throw new Error('defaultAccount must name an account valued by balance in accounts');
    }
  }

  /** @type {Record<string, RowOverride>} */
  const rows = {};
  for (const [timestamp, value] of Object.entries(record(root.rows ?? {}, 'rows'))) {
    const where = 'rows["' + timestamp + '"]';
    const row = record(value, where);
    const unknown = Object.keys(row).filter((key) => !['skip', 'category', 'holding', 'notCounted'].includes(key));
    if (unknown.length > 0) throw new Error(where + ': unknown ' + unknown.join(', '));
    /** @type {RowOverride} */
    const override = {};
    if (row.skip !== undefined) override.skip = boolean(row.skip, where + '.skip');
    if (row.notCounted !== undefined) override.notCounted = boolean(row.notCounted, where + '.notCounted');
    if (row.category !== undefined) override.category = categoryPath(row.category, where + '.category');
    if (row.holding !== undefined) {
      const ticker = nonBlank(row.holding, where + '.holding');
      if (holdings[ticker] === undefined) throw new Error(where + '.holding names no ticker in holdings: "' + ticker + '"');
      override.holding = ticker;
    }
    rows[timestamp] = override;
  }

  return {
    accounts,
    holdings,
    categories,
    pairs,
    openingBalanceTag: nonBlank(root.openingBalanceTag, 'openingBalanceTag'),
    refundFallback,
    tags,
    defaultAccount,
    rows,
  };
}

/**
 * @param {unknown} input
 * @returns {MappedCategory[]}
 */
function validateCategories(input) {
  if (!Array.isArray(input)) throw new Error('categories must be a list');
  const entries = input.map((value, index) => {
    const category = record(value, 'categories[' + index + ']');
    const where = 'categories[' + index + ']';
    const name = nonBlank(category.name, where + '.name');
    if (name.includes('/')) throw new Error(where + '.name must not contain "/": it separates a parent from a child');
    return {
      where,
      name,
      parent: category.parent === undefined || category.parent === null ? null : nonBlank(category.parent, where + '.parent'),
      kind: category.kind,
      fixedCost: category.fixedCost === undefined ? false : boolean(category.fixedCost, where + '.fixedCost'),
    };
  });

  /** @type {Map<string, 'income' | 'expense'>} */
  const parents = new Map();
  for (const entry of entries.filter((row) => row.parent === null)) {
    if (parents.has(entry.name)) throw new Error(entry.where + ': "' + entry.name + '" is listed twice');
    parents.set(entry.name, /** @type {any} */ (oneOf(entry.kind, entry.where + '.kind', CATEGORY_KINDS)));
  }
  /** @type {Set<string>} */
  const seen = new Set();
  return entries.map((entry) => {
    if (entry.parent === null) {
      return { path: entry.name, name: entry.name, parent: null, kind: /** @type {any} */ (parents.get(entry.name)), fixedCost: entry.fixedCost };
    }
    const kind = parents.get(entry.parent);
    if (kind === undefined) throw new Error(entry.where + '.parent names no top-level category: "' + entry.parent + '"');
    if (entry.kind !== undefined && entry.kind !== kind) throw new Error(entry.where + ": a subcategory takes its parent's kind");
    const path = entry.parent + '/' + entry.name;
    if (seen.has(path)) throw new Error(entry.where + ': "' + path + '" is listed twice');
    seen.add(path);
    return { path, name: entry.name, parent: entry.parent, kind, fixedCost: entry.fixedCost };
  });
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {Record<string, unknown>}
 */
function record(value, where) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(where + ' must be an object');
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {string}
 */
function nonBlank(value, where) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(where + ' must be a non-empty string');
  return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} where
 * @param {readonly string[]} allowed
 * @returns {string}
 */
function oneOf(value, where, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(where + ' must be one of ' + allowed.join(', ') + ', received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {boolean}
 */
function boolean(value, where) {
  if (typeof value !== 'boolean') throw new Error(where + ' must be true or false');
  return value;
}
