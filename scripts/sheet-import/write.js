/**
 * The sheet import's write (#140): the plan the dry run printed, created
 * through lib/store.js after a backup. Every refusal is checked before the
 * backup and before the first write, so a refused run writes nothing.
 *
 * Order: accounts, categories, opening balances, transactions, trades,
 * "tracked since". Accounts and categories that already exist under the same
 * name are reused, never duplicated. Each transaction goes through
 * `upsertTransactionByOrigin` with origin `{ source: 'sheet', externalId:
 * <Timestamp> }`: its category, counter account, tags and not-counted flag
 * are where it starts, and from then on they are yours (ADR 0023).
 *
 * The refusals are this importer's policy -- a one-off run against a clean
 * finance section -- not rules of an entity, so they live here rather than in
 * the store. The writes are separate store calls, serialised in this process
 * (ADR 0011) but not against another one: stop `npm run dev` while it writes.
 * A failure part way says how to restore the backup.
 */

import { firstDayUnitsGoNegative } from '../../lib/domain/derive/finance.js';
import { blockingReasons } from './plan.js';
import {
  backupData,
  createAccount,
  createFinanceCategory,
  createTrade,
  describeStorage,
  getAccounts,
  getProfile,
  getTransactions,
  hasDemoFinance,
  recordObservation,
  updateProfile,
  upsertTransactionByOrigin,
} from '../../lib/store.js';

/** The source every imported transaction carries in its origin. */
export const SHEET_SOURCE = 'sheet';

/**
 * @param {import('./plan.js').ImportPlan} plan
 * @param {import('./mapping.js').Mapping} mapping
 * @param {(line: string) => void} print
 * @returns {Promise<{ backupPath: string }>}
 */
export async function writePlan(plan, mapping, print) {
  const [accounts, profile, transactions, demo] = await Promise.all([getAccounts(), getProfile(), getTransactions(), hasDemoFinance()]);

  const refusals = blockingReasons(plan);
  if (demo) refusals.unshift('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');
  if (transactions.some((transaction) => transaction.origin?.source === SHEET_SOURCE)) {
    refusals.unshift('the sheet is already imported; this is a one-off -- restore the backup to run it again');
  }
  for (const key of plan.accounts) {
    const wanted = mapping.accounts[key];
    const existing = accountNamed(accounts, wanted.name);
    if (existing !== undefined && (existing.kind !== wanted.kind || existing.valuation !== wanted.valuation)) {
      refusals.push('an account named "' + wanted.name + '" already exists as ' + existing.kind + ' valued by ' + existing.valuation);
    }
    // Nothing moves on a closed account (ADR 0023): reusing one would stop
    // the write part way, so it is refused before it starts.
    if (existing?.archivedOn) refusals.push('the account "' + wanted.name + '" is archived; restore it before importing');
  }
  // What the store would refuse part way, checked against the plan first.
  for (const balance of plan.balances) {
    if (mapping.accounts[balance.account].valuation === 'units') {
      refusals.push('an opening balance lands on "' + mapping.accounts[balance.account].name + '", which is valued by units');
    }
  }
  for (const holding of new Set(plan.trades.map((trade) => trade.account))) {
    const day = firstDayUnitsGoNegative(plan.trades.filter((trade) => trade.account === holding));
    if (day !== null) refusals.push('the trades on "' + mapping.accounts[holding].name + '" would take the units held below zero on ' + day);
  }
  for (const category of mapping.categories.filter((row) => row.parent === null)) {
    const existing = topCategoryNamed(profile.financeCategories, category.name);
    if (existing !== undefined && existing.kind !== category.kind) {
      refusals.push('a category named "' + category.name + '" already exists as ' + existing.kind);
    }
  }
  if (refusals.length > 0) throw new Error(refusals.join('; '));

  const { backupPath } = await backupData('sheet-import');
  print('backed up ' + describeStorage() + ' to ' + backupPath);
  try {
    const accountIds = await writeAccounts(plan, mapping, accounts);
    const categoryIds = await writeCategories(mapping, profile.financeCategories);

    for (const balance of plan.balances) {
      await recordObservation({ accountId: accountIds.get(balance.account), kind: 'balance', amount: balance.amount, date: balance.date, source: 'integration' });
    }

    const syncedAt = new Date().toISOString();
    for (const transaction of plan.transactions) {
      await upsertTransactionByOrigin({
        date: transaction.date,
        amount: transaction.amount,
        accountId: accountIds.get(transaction.account),
        counterAccountId: transaction.counter === null ? null : accountIds.get(transaction.counter),
        categoryId: transaction.category === null ? null : categoryIds.get(transaction.category),
        notCounted: transaction.notCounted,
        tags: transaction.tags,
        description: transaction.description,
        origin: { source: SHEET_SOURCE, externalId: transaction.externalId, syncedAt, sourceUpdatedAt: null },
        source: 'integration',
      });
    }

    // By date, buys before sells on one day, so no sell ever runs ahead of
    // the units it sells.
    const trades = [...plan.trades].sort((a, b) => a.date.localeCompare(b.date) || (a.direction === b.direction ? 0 : a.direction === 'buy' ? -1 : 1));
    for (const trade of trades) {
      await createTrade({
        accountId: accountIds.get(trade.account),
        date: trade.date,
        direction: trade.direction,
        units: trade.units,
        price: trade.price,
        fee: trade.fee,
        source: 'integration',
      });
    }

    if (profile.financeTrackedSince === null && plan.trackedSince !== null) {
      await updateProfile({ financeTrackedSince: plan.trackedSince });
    }
    // Only when the mapping names one (ADR 0026).
    if (mapping.defaultAccount !== null) {
      await updateProfile({ defaultAccountId: accountIds.get(mapping.defaultAccount) });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'the import stopped part way: ' + reason + '. Your data is partly written; restore it with: cp "' + backupPath + '" "' + describeStorage() + '"'
    );
  }

  print(
    'imported ' + plan.accounts.length + ' accounts, ' + plan.balances.length + ' balances, ' + plan.transactions.length +
      ' transactions and ' + plan.trades.length + ' trades'
  );
  return { backupPath };
}

/**
 * The plan's accounts: reused by name when they exist, created from the
 * mapping otherwise.
 *
 * @param {import('./plan.js').ImportPlan} plan
 * @param {import('./mapping.js').Mapping} mapping
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} existing
 * @returns {Promise<Map<string, string>>} sheet name to account id
 */
async function writeAccounts(plan, mapping, existing) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  for (const key of plan.accounts) {
    const { name, kind, valuation } = mapping.accounts[key];
    const found = accountNamed(existing, name);
    ids.set(key, found?.id ?? (await createAccount({ name, kind, valuation, source: 'integration' })).id);
  }
  return ids;
}

/**
 * The mapping's categories, parents first: reused by name under the same
 * parent when they exist, created otherwise.
 *
 * @param {import('./mapping.js').Mapping} mapping
 * @param {import('../../lib/domain/types.js').FinanceCategory[]} existing
 * @returns {Promise<Map<string, string>>} category path to id
 */
async function writeCategories(mapping, existing) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  for (const category of mapping.categories.filter((row) => row.parent === null)) {
    const found = topCategoryNamed(existing, category.name);
    ids.set(category.path, found?.id ?? (await createFinanceCategory({ name: category.name, kind: category.kind, fixedCost: category.fixedCost })).id);
  }
  for (const category of mapping.categories.filter((row) => row.parent !== null)) {
    const parentId = /** @type {string} */ (ids.get(/** @type {string} */ (category.parent)));
    const found = existing.find((row) => row.parentId === parentId && row.name === category.name);
    ids.set(category.path, found?.id ?? (await createFinanceCategory({ name: category.name, parentId, fixedCost: category.fixedCost })).id);
  }
  return ids;
}

/**
 * The account a mapped one is reused as: the same name.
 *
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} accounts
 * @param {string} name
 */
function accountNamed(accounts, name) {
  return accounts.find((account) => account.name === name);
}

/**
 * The top-level category a mapped one is reused as: the same name.
 *
 * @param {import('../../lib/domain/types.js').FinanceCategory[]} categories
 * @param {string} name
 */
function topCategoryNamed(categories, name) {
  return categories.find((category) => category.parentId === null && category.name === name);
}
