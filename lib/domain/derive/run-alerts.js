/**
 * Whether a schedule's newest run is one to be told about (ADR 0069),
 * derived from the run log and stored nowhere.
 *
 * A failure alerts when the run before it had not failed: the first failure
 * says so once, and nothing more is said until the schedule succeeds again.
 * A run that skipped did not try, so it is neither a failure nor a success:
 * it is read past. `failed, skipped, failed` is still one failure.
 */

import { RUN_REASONS } from '../../../personalos.config.js';

/** @typedef {'failed' | 'needs-login'} AlertKind what the alert says: that it failed, or that only a login will fix it */

/**
 * @param {readonly import('../types.js').Run[]} runs the runs of one
 *   schedule, in any order
 * @returns {AlertKind | null} null when the newest run is not a failure, or
 *   is not the first of its streak
 */
export function failureAlert(runs) {
  const [newest, ...earlier] = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  if (newest === undefined || newest.outcome !== 'failed') return null;
  const before = earlier.find((run) => run.outcome !== 'skipped');
  if (before?.outcome === 'failed') return null;
  return newest.reason === RUN_REASONS.needsLogin ? 'needs-login' : 'failed';
}
