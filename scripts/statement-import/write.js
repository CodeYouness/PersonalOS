/**
 * The statement import's write: the plan the dry run printed, through
 * lib/store.js after a backup. Every refusal is in the plan and checked
 * before the backup and the first write, so a refused run writes nothing; a
 * run with nothing to change takes no backup either.
 *
 * Per account: created when it does not exist (cash, valued by balance, no
 * origin -- the account is yours, the statement only feeds it, so you can
 * still type a balance on it), its opening balance recorded when the plan
 * has one, then each new or changed movement through
 * `upsertTransactionByOrigin` with origin `{ source: 'statement',
 * externalId, detail }`: the source's zone is written and your zone --
 * category, note, tags, counter account, not counted, links -- is never
 * touched (ADR 0023). An unchanged movement is not written at all.
 *
 * The writes are separate store calls, serialised in this process (ADR 0011)
 * but not against another one: stop `npm run serve` (and `dev`) first.
 */

import { ORIGIN_SOURCES } from '../../personalos.config.js';
import { syncedOrigin } from '../../lib/domain/origin.js';
import { backupData, createAccount, describeStorage, recordObservation, upsertTransactionByOrigin } from '../../lib/store.js';
import { externalIdFor } from './identity.js';

/**
 * @param {import('./plan.js').StatementPlan} plan
 * @param {(line: string) => void} print
 * @returns {Promise<{ backupPath?: string, written: { accounts: number, balances: number, created: number, updated: number } }>}
 */
export async function writePlan(plan, print) {
  if (plan.blocking.length > 0) throw new Error('refused, nothing was written:\n  ' + plan.blocking.join('\n  '));

  const written = { accounts: 0, balances: 0, created: 0, updated: 0 };
  const pending = plan.accounts.some(
    (account) => account.account === null || account.opening !== null || account.counts.new > 0 || account.counts.changed > 0
  );
  if (!pending) {
    print('Nothing to change: the statement is already imported.');
    return { written };
  }
  const { backupPath } = await backupData('statement-import');
  print('The data before the import is backed up at ' + backupPath);

  try {
    for (const account of plan.accounts) {
      let accountId = account.account?.id;
      if (accountId === undefined) {
        accountId = (await createAccount({ name: account.name, kind: 'cash', valuation: 'balance', currency: account.currency, source: 'integration' })).id;
        written.accounts += 1;
      }
      if (account.opening !== null) {
        await recordObservation({
          accountId,
          kind: 'balance',
          amount: account.opening.amount,
          currency: account.currency,
          date: account.opening.date,
          source: 'integration',
          origin: syncedOrigin(ORIGIN_SOURCES.statement, externalIdFor(accountId, 'opening:' + account.opening.date)),
        });
        written.balances += 1;
      }
      for (const movement of account.movements) {
        if (movement.status === 'unchanged') continue;
        await upsertTransactionByOrigin({
          date: movement.date,
          amount: movement.amount,
          currency: movement.currency,
          description: movement.description,
          accountId,
          origin: { ...syncedOrigin(ORIGIN_SOURCES.statement, externalIdFor(accountId, movement.key)), detail: movement.detail },
          source: 'integration',
        });
        written[movement.status === 'new' ? 'created' : 'updated'] += 1;
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'the import stopped part way: ' + reason + '. Your data is partly written; restore it with: cp "' + backupPath + '" "' + describeStorage() + '"'
    );
  }
  return { backupPath, written };
}
