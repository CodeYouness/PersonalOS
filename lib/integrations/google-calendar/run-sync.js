/**
 * One calendar sync with its SyncState bookkeeping. The script
 * (scripts/sync-calendar.js) and the scheduled job (lib/scheduler/) both call
 * this, so there is one implementation and two ways to start it.
 */

import { errorMessage } from '../../domain/error-message.js';
import { env } from '../../config/env.js';
import calendarIntegration from './index.js';

/**
 * @param {object} options
 * @param {typeof import('../../store.js')} options.store
 * @param {string} [options.timezone]
 * @param {import('../contract.js').Integration} [options.integration]
 * @returns {Promise<{ configured: false } | { configured: true, result: import('../contract.js').SyncResult }>}
 *   rethrows after recording a failed SyncState
 */
export async function runCalendarSync({ store, timezone = env.timezone, integration = calendarIntegration }) {
  if (!integration.isConfigured()) return { configured: false };
  const profile = await store.getProfile();
  try {
    const result = await integration.sync({ store, timezone, baseCurrency: profile.baseCurrency });
    await store.updateSyncState(integration.name, {
      lastRunAt: result.syncedAt,
      status: 'ok',
      error: '',
      itemCount: result.written,
    });
    return { configured: true, result };
  } catch (error) {
    // lastRunAt and itemCount stay at the last success: the staleness line
    // names the last good run, and the status and error say this one failed.
    await store.updateSyncState(integration.name, { status: 'error', error: errorMessage(error) });
    throw error;
  }
}
