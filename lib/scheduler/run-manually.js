/**
 * Runs one schedule's job by hand and records the run, started by `user`
 * (ADR 0063). The sync scripts use it, so a sync run with the server stopped
 * leaves the same run in the log as the scheduled one: the run log and the
 * sync state never disagree about whether the last attempt worked.
 *
 * It is the scheduler's own `runNow`, on a scheduler of one schedule that is
 * never ticked, so the run is recorded exactly as a scheduled one is.
 */

import { SCHEDULES } from '../../personalos.config.js';
import { createScheduler } from './scheduler.js';

/**
 * @param {string} scheduleId a schedule configured in SCHEDULES
 * @param {object} options
 * @param {import('./scheduler.js').Job} options.job
 * @param {{ getRuns: (options?: object) => Promise<any[]>, recordRun: (run: object) => Promise<any> }} options.store
 * @param {string} options.timezone
 * @param {() => Date} [options.clock]
 * @returns {Promise<any | null>} the recorded run, or null when it could not be recorded
 */
export async function runManually(scheduleId, { job, store, timezone, clock = () => new Date() }) {
  const schedule = SCHEDULES.find((entry) => entry.id === scheduleId);
  if (schedule === undefined) throw new Error('unknown schedule ' + JSON.stringify(scheduleId));
  const scheduler = createScheduler({ schedules: [schedule], jobs: { [scheduleId]: job }, store, clock, timezone });
  return scheduler.runNow(scheduleId, 'user');
}
