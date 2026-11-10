/**
 * Scalable Capital sync (spec #212, ADR 0031): holdings, trades and (in later
 * tickets) prices and cash from the broker's own CLI, `sc`. Never called
 * during a render (ADR 0010) -- only `scripts/sync-scalable.js` calls it.
 * The name is the SyncState key and the origin source, the same string.
 */

import { SCALABLE_SYNC_SOURCE } from '../../domain/derive/sync-staleness.js';
import { makeScRunner } from './run-sc.js';
import { syncScalable } from './sync.js';

export const name = SCALABLE_SYNC_SOURCE;

/** @returns {boolean} the session is in the Keychain; nothing in the environment to check */
export function isConfigured() {
  return true;
}

/**
 * @param {import('../contract.js').SyncContext} context
 * @returns {Promise<import('../contract.js').SyncResult>}
 */
export async function sync(context) {
  const result = await syncScalable({ run: makeScRunner(), store: /** @type {any} */ (context.store) });
  return { written: result.written, skipped: result.skipped, warnings: result.warnings, syncedAt: result.syncedAt };
}

export const scalableIntegration = { name, kind: /** @type {const} */ ('portfolio'), isConfigured, sync };
export default scalableIntegration;
