/**
 * The nightly backup (#288): the data file and the finance folder copied to
 * a dated folder in the configured destination, then old copies pruned by the
 * retention in lib/domain/derive/backup-retention.js. Pruning runs only after
 * the new copy succeeded, and only on folders the backup made.
 */

import { env } from '../config/env.js';
import { toDayKey } from '../domain/dates.js';
import { backupFolderName, selectBackups } from '../domain/derive/backup-retention.js';

/**
 * @param {() => string | null} destination read at run time, so an
 *   unconfigured value is a skipped run and never a start-up failure
 * @returns {import('./scheduler.js').Job}
 */
export function createBackupJob(destination) {
  return async ({ now, timezone, store }) => {
    const directory = destination();
    if (directory === null) return { outcome: 'skipped', reason: 'PERSONALOS_BACKUP_DIR is not set' };

    const day = toDayKey(now, timezone);
    try {
      await store.backupTo(directory, backupFolderName(day));
    } catch (error) {
      return { outcome: 'failed', reason: 'the copy failed: ' + (error instanceof Error ? error.message : String(error)) };
    }

    // The copy is whole: from here a failure is the pruning's, not the backup's.
    const { keep, remove } = selectBackups(await store.listBackups(directory), day);
    const removed = await store.removeBackups(directory, remove);
    return { wrote: { backups: 1, backupsKept: keep.length, backupsRemoved: removed } };
  };
}

export const backupJob = createBackupJob(() => env.backupDir);
