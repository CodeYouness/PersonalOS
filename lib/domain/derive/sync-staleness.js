import { dayKeyRange, toDayKey } from '../dates.js';

/**
 * The SyncState key the Scalable sync (ticket #214) writes with
 * `store.updateSyncState(SCALABLE_SYNC_SOURCE, patch)`. Same string as the
 * `source` of its ExternalOrigin.
 *
 * The contract #214 keeps, so this line stays true:
 * - a successful run patches `{ lastRunAt: <ISO instant>, status: 'ok',
 *   error: '', itemCount }`;
 * - a failed run patches only `{ status: 'error', error: <message> }` and
 *   leaves `lastRunAt` alone, so it keeps naming the last SUCCESSFUL run.
 *   (The calendar sync overwrites it on failure; the broker's must not.)
 */
export const SCALABLE_SYNC_SOURCE = 'scalable';

/** Days after which the line turns to the warning colour. */
export const STALE_AFTER_DAYS = 7;

/**
 * @typedef {object} BrokerStaleness
 * @property {string} text what to show
 * @property {'ok'|'warning'|'error'} tone
 * @property {string | null} error shown beside the text after a failed run
 */

/**
 * The broker's staleness for the Finances screen, from the saved SyncStates
 * alone (rule 3: nothing is called). Null when the broker never ran: no
 * SyncState, or one still 'never'. Whole days between the last successful
 * run's day and today, both in the user's timezone.
 *
 * @param {import('../types.js').SyncState[]} syncStates
 * @param {string} todayKey
 * @param {string} [timezone] defaults to the configured USER_TIMEZONE
 * @returns {BrokerStaleness | null}
 */
export function brokerStaleness(syncStates, todayKey, timezone) {
  const state = syncStates.find((entry) => entry.integration === SCALABLE_SYNC_SOURCE);
  if (state === undefined || state.status === 'never') return null;
  const failed = state.status === 'error';

  let age = 'never synced';
  let days = 0;
  if (state.lastRunAt !== null) {
    const ranOn = toDayKey(new Date(state.lastRunAt), timezone);
    days = ranOn >= todayKey ? 0 : dayKeyRange(ranOn, todayKey).length - 1;
    const when = days === 0 ? 'today' : days === 1 ? '1 day ago' : days + ' days ago';
    age = (failed ? 'last synced ' : 'synced ') + when;
  }
  const tone = failed ? 'error' : days > STALE_AFTER_DAYS ? 'warning' : 'ok';
  return { text: 'Scalable · ' + age, tone, error: failed ? 'Last run failed: ' + state.error : null };
}
