/**
 * One broker sync with its guards and SyncState bookkeeping. The script
 * (scripts/sync-scalable.js) and the scheduled job both call this.
 *
 * A refusal (demo finance rows present) throws `ScalableRefusal` and records
 * nothing: it is not a failed sync. Any other failure records an error state
 * that leaves `lastRunAt` at the last success and is rethrown.
 */

import { SCALABLE_SYNC_SOURCE } from '../../domain/derive/sync-staleness.js';
import { syncScalable } from './sync.js';

/** The broker sync was refused before it started. */
export class ScalableRefusal extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ScalableRefusal';
  }
}

/**
 * @param {object} options
 * @param {typeof import('../../store.js')} options.store
 * @param {import('./client.js').ScRunner} options.run
 * @param {boolean} [options.dryRun]
 * @returns {Promise<import('./sync.js').SyncReport>}
 */
export async function runScalableSync({ store, run, dryRun = false }) {
  if (await store.hasDemoFinance()) {
    throw new ScalableRefusal('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');
  }
  try {
    const result = await syncScalable({ run, store, dryRun });
    if (!dryRun) {
      await store.updateSyncState(SCALABLE_SYNC_SOURCE, { lastRunAt: result.syncedAt, status: 'ok', error: '', itemCount: result.written });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun) await store.updateSyncState(SCALABLE_SYNC_SOURCE, { status: 'error', error: message });
    throw error;
  }
}
