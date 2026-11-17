/**
 * Categorising's write (ADR 0043): the changes the apply's dry run printed,
 * through lib/store.js after a backup. Every refusal is in the plan and
 * checked before the backup and the first write, so a refused run writes
 * nothing; a run with nothing to change takes no backup either.
 *
 * Each change is one `updateTransaction` with only the fields that were
 * empty when the plan was made -- the category, the not-counted flag -- on a
 * movement that was still open. The writes are separate store calls,
 * serialised in this process (ADR 0011) but not against another one: stop
 * `npm run serve` (and `dev`) first.
 */

import { backupData, describeStorage, updateTransaction } from '../../lib/store.js';

/**
 * @param {import('./plan.js').ApplyPlan} plan
 * @param {(line: string) => void} print
 * @returns {Promise<{ backupPath?: string, written: number }>}
 */
export async function writeChanges(plan, print) {
  if (plan.blocking.length > 0) throw new Error('refused, nothing was written:\n  ' + plan.blocking.join('\n  '));
  if (plan.changes.length === 0) {
    print('Nothing to change: the review is already applied.');
    return { written: 0 };
  }
  const { backupPath } = await backupData('categorise');
  print('The data before categorising is backed up at ' + backupPath);
  let written = 0;
  try {
    for (const change of plan.changes) {
      await updateTransaction(change.transaction.id, change.patch);
      written += 1;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'categorising stopped part way: ' + reason + '. Your data is partly written; restore it with: cp "' + backupPath + '" "' + describeStorage() + '"'
    );
  }
  return { backupPath, written };
}
