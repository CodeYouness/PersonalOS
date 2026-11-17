/**
 * The ledger import's write (ADR 0042): the plan the dry run printed,
 * through lib/store.js after a backup. Every refusal is in the plan and
 * checked before the backup and the first write, so a refused run writes
 * nothing; a run with nothing to change takes no backup either.
 *
 * Order: the accounts the ledger feeds that do not exist (cash, valued by
 * balance, no origin), the categories (parents first), the opening balances,
 * the ledger's transactions through `upsertTransactionByOrigin` with origin
 * `{ source: 'sheet', externalId: <ledger id> }`, and last the matched
 * statement movements, each through `updateTransaction` with only the fields
 * of your zone that were still empty when the plan was made. A transfer's leg
 * an earlier run wrote on an account the ledger feeds, which a statement row
 * now carries through its counter account, is deleted before that row is
 * given the counter account, so the money is never on the account twice.
 *
 * The writes are separate store calls, serialised in this process (ADR 0011)
 * but not against another one: stop `npm run serve` (and `dev`) first.
 */

import { ORIGIN_SOURCES } from '../../personalos.config.js';
import { syncedOrigin } from '../../lib/domain/origin.js';
import {
  backupData,
  createAccount,
  createFinanceCategory,
  deleteTransaction,
  describeStorage,
  recordObservation,
  updateTransaction,
  upsertTransactionByOrigin,
} from '../../lib/store.js';
import { isPlaceholder } from './plan.js';

/**
 * What a write would change, counted from the plan.
 *
 * @param {import('./plan.js').LedgerPlan} plan
 */
export function pendingChanges(plan) {
  return {
    accounts: plan.accounts.filter((account) => account.account === null).length,
    categories: plan.categories.filter((category) => category.existing === null).length,
    openings: plan.openings.filter((opening) => opening.status === 'new').length,
    transactions: plan.transactions.filter((transaction) => transaction.status !== 'unchanged').length,
    updates: plan.updates.filter((update) => Object.keys(update.patch).length > 0).length,
    removals: plan.removals.length,
  };
}

/**
 * @param {import('./plan.js').LedgerPlan} plan
 * @param {(line: string) => void} print
 * @returns {Promise<{ backupPath?: string, written: ReturnType<typeof pendingChanges> }>}
 */
export async function writePlan(plan, print) {
  if (plan.blocking.length > 0) throw new Error('refused, nothing was written:\n  ' + plan.blocking.join('\n  '));

  const pending = pendingChanges(plan);
  if (Object.values(pending).every((count) => count === 0)) {
    print('Nothing to change: the ledger is already imported.');
    return { written: pending };
  }
  const { backupPath } = await backupData('ledger-import');
  print('The data before the import is backed up at ' + backupPath);

  /** @type {Map<string, string>} placeholder to the id it was created with */
  const created = new Map();
  /** @param {string} id */
  const resolve = (id) => {
    if (!isPlaceholder(id)) return id;
    const real = created.get(id);
    if (real === undefined) throw new Error('nothing was created for ' + id);
    return real;
  };
  /** @param {string | null} id */
  const resolveNullable = (id) => (id === null ? null : resolve(id));

  try {
    for (const account of plan.accounts) {
      if (account.account !== null) continue;
      const row = await createAccount({ name: account.name, kind: 'cash', valuation: 'balance', source: 'integration' });
      created.set(account.id, row.id);
    }
    for (const category of plan.categories) {
      if (category.existing !== null) continue;
      const row = category.parentKey === null
        ? await createFinanceCategory({ name: category.name, kind: category.kind, fixedCost: category.fixedCost })
        : await createFinanceCategory({
          name: category.name,
          parentId: resolve(/** @type {import('./plan.js').CategoryPlan} */ (plan.categories.find((parent) => parent.key === category.parentKey)).id),
          fixedCost: category.fixedCost,
        });
      created.set(category.id, row.id);
    }
    for (const opening of plan.openings) {
      if (opening.status !== 'new') continue;
      const accountId = resolve(opening.accountId);
      await recordObservation({
        accountId,
        kind: 'balance',
        amount: opening.amount,
        date: opening.date,
        source: 'integration',
        origin: syncedOrigin(ORIGIN_SOURCES.sheet, 'opening:' + opening.ledgerIds.join('+')),
      });
    }
    for (const transaction of plan.transactions) {
      if (transaction.status === 'unchanged') continue;
      await upsertTransactionByOrigin({
        date: transaction.date,
        amount: transaction.amount,
        description: transaction.description,
        accountId: resolve(transaction.accountId),
        counterAccountId: resolveNullable(transaction.counterAccountId),
        categoryId: resolveNullable(transaction.categoryId),
        notCounted: transaction.notCounted,
        tags: transaction.tags,
        origin: syncedOrigin(ORIGIN_SOURCES.sheet, transaction.externalId),
        source: 'integration',
      });
    }
    for (const removal of plan.removals) await deleteTransaction(removal.transaction.id);
    for (const update of plan.updates) {
      if (Object.keys(update.patch).length === 0) continue;
      const patch = { ...update.patch };
      if (patch.categoryId !== undefined) patch.categoryId = resolve(patch.categoryId);
      if (patch.counterAccountId !== undefined) patch.counterAccountId = resolve(patch.counterAccountId);
      await updateTransaction(update.transaction.id, patch);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'the import stopped part way: ' + reason + '. Your data is partly written; restore it with: cp "' + backupPath + '" "' + describeStorage() + '"'
    );
  }
  return { backupPath, written: pending };
}
