/**
 * The job of every schedule declared in `personalos.config.js`, by schedule
 * id. Adding a schedule is adding its entry there and its job here; a test
 * fails when the two lists disagree, and the scheduler refuses to start a
 * schedule with no job. The contract of a job is documented in scheduler.js.
 */
import { pruneRunsJob } from './prune-runs.js';
import { calendarSyncJob, scalableSyncJob } from './sync-jobs.js';

/** @type {Record<string, import('./scheduler.js').Job>} */
export const JOBS = Object.freeze({
  'prune-runs': pruneRunsJob,
  'sync-calendar': calendarSyncJob,
  'sync-scalable': scalableSyncJob,
});
