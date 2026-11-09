/**
 * The DEGIRO import's write (ticket #219): the plan the dry run printed,
 * created through lib/store.js after a backup. Every refusal is checked before
 * the backup and before the first write, so a refused run writes nothing.
 *
 * Per holding: the account is found by origin `{ degiro, <ISIN> }` or created
 * (a name you gave it stays), its trades are replaced as one set under the
 * source `degiro`, it is archived on the day its units reached zero, and its
 * month-end prices are written where they differ. A second run finds
 * everything as it left it and changes nothing -- and takes no backup.
 */

import { DEGIRO_SOURCE } from './plan.js';
import {
  backupData,
  createAccount,
  getAccounts,
  getPrices,
  getTrades,
  hasDemoFinance,
  replaceSyncedTrades,
  setSyncedAccountArchivedOn,
  upsertSyncedPrice,
} from '../../lib/store.js';

/**
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} accounts
 * @param {string} isin
 */
export function findDegiroHolding(accounts, isin) {
  return accounts.find((account) => account.origin?.source === DEGIRO_SOURCE && account.origin.externalId === isin);
}

/**
 * Whether writing the plan would change anything.
 *
 * @param {import('./plan.js').DegiroPlan} plan
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} accounts
 * @param {import('../../lib/domain/types.js').Trade[]} trades
 * @param {import('../../lib/domain/types.js').Price[]} prices
 */
function pendingChanges(plan, accounts, trades, prices) {
  let changes = 0;
  for (const holding of plan.holdings) {
    const account = findDegiroHolding(accounts, holding.isin);
    if (account === undefined) {
      changes += 1;
      continue;
    }
    if (account.archivedOn !== holding.archivedOn) changes += 1;
    const mine = new Map(trades.filter((t) => t.accountId === account.id && t.origin?.source === DEGIRO_SOURCE).map((t) => [t.origin?.externalId, t]));
    for (const want of holding.trades) {
      const old = mine.get(want.externalId);
      if (old === undefined || old.date !== want.date || old.direction !== want.direction || old.units !== want.units || old.price !== want.price || old.fee !== want.fee) changes += 1;
      mine.delete(want.externalId);
    }
    changes += mine.size;
    const stored = new Map(prices.filter((p) => p.accountId === account.id).map((p) => [p.date, p.price]));
    for (const price of holding.prices) if (stored.get(price.date) !== price.price) changes += 1;
  }
  return changes;
}

/**
 * @param {import('./plan.js').DegiroPlan} plan
 * @param {(line: string) => void} print
 * @returns {Promise<{ backupPath?: string }>}
 */
export async function writePlan(plan, print) {
  const refusals = [...plan.blocking];
  if (await hasDemoFinance()) refusals.unshift('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');
  if (refusals.length > 0) throw new Error('refused, nothing was written:\n  ' + refusals.join('\n  '));

  const accounts = await getAccounts();
  const changes = pendingChanges(plan, accounts, await getTrades(), await getPrices());
  if (changes === 0) {
    print('Nothing to change: the export is already imported.');
    return {};
  }
  const { backupPath } = await backupData('degiro-import');
  print('The data before the import is backed up at ' + backupPath);

  try {
    for (const holding of plan.holdings) {
      let account = findDegiroHolding(await getAccounts(), holding.isin);
      account ??= await createAccount({
        name: holding.name,
        kind: 'investment',
        valuation: 'units',
        currency: 'EUR',
        source: 'integration',
        origin: { source: DEGIRO_SOURCE, externalId: holding.isin, syncedAt: new Date().toISOString(), sourceUpdatedAt: null },
      });
      await replaceSyncedTrades({ accountId: account.id, source: DEGIRO_SOURCE, trades: holding.trades });
      if (account.archivedOn !== holding.archivedOn) await setSyncedAccountArchivedOn(account.id, holding.archivedOn);
      const stored = new Map((await getPrices({ accountId: account.id })).map((p) => [p.date, p.price]));
      for (const price of holding.prices) {
        if (stored.get(price.date) !== price.price) await upsertSyncedPrice({ accountId: account.id, date: price.date, price: price.price, currency: 'EUR' });
      }
    }
  } catch (error) {
    throw new Error(
      'the import stopped part way: ' + (error instanceof Error ? error.message : String(error)) + '. Restore ' + backupPath + ' to start again.'
    );
  }
  return { backupPath };
}
