/**
 * The holdings the broker sync owns, as the sheet import needs them (#218).
 * The plan is pure and store-free, so this is where the stored synced trades
 * are read -- through lib/store.js -- and fed in as input. The store is not
 * touched at all when the mapping names no synced holding, so a mapping
 * without one keeps a dry run that never reads the data file.
 */

import { findHolding } from '../../lib/integrations/scalable/holdings.js';
import { getAccounts, getTrades } from '../../lib/store.js';

/**
 * @param {import('./mapping.js').Mapping} mapping
 * @returns {Promise<import('./plan.js').SyncedTrades>} by sheet account name;
 *   null for a synced account that is not in the data yet
 */
export async function loadSyncedTrades(mapping) {
  /** @type {import('./plan.js').SyncedTrades} */
  const synced = new Map();
  const named = Object.entries(mapping.accounts).filter(([, account]) => account.origin !== undefined);
  if (named.length === 0) return synced;

  const accounts = await getAccounts();
  for (const [sheetName, mapped] of named) {
    const holding = findHolding(accounts, /** @type {{ externalId: string }} */ (mapped.origin).externalId);
    synced.set(sheetName, holding === undefined ? null : await getTrades({ accountId: holding.id }));
  }
  return synced;
}

/**
 * The synced holdings' account ids by sheet name.
 *
 * @param {import('./mapping.js').Mapping} mapping
 * @param {import('./plan.js').ImportPlan} plan
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} accounts
 * @returns {Map<string, string>}
 */
export function syncedAccountIds(mapping, plan, accounts) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  for (const sheetName of plan.synced) {
    const holding = findHolding(accounts, /** @type {{ externalId: string }} */ (mapping.accounts[sheetName].origin).externalId);
    if (holding !== undefined) ids.set(sheetName, holding.id);
  }
  return ids;
}
