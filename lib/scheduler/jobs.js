/**
 * The job of every schedule declared in `personalos.config.js`, by schedule
 * id. Adding a schedule is adding its entry there and its job here; a test
 * fails when the two lists disagree, and the scheduler refuses to start a
 * schedule with no job. The contract of a job is documented in scheduler.js.
 */
import { backupJob } from './backup.js';
import { env } from '../config/env.js';
import { questionsFor } from '../checkin/day.js';
import { telegramSender } from '../telegram/send.js';
import { pruneRunsJob } from './prune-runs.js';
import { makeEveningReminderJob } from './reminder.js';
import { calendarSyncJob, scalableSyncJob } from './sync-jobs.js';

/** @type {Record<string, import('./scheduler.js').Job>} */
export const JOBS = Object.freeze({
  'prune-runs': pruneRunsJob,
  'sync-calendar': calendarSyncJob,
  'sync-scalable': scalableSyncJob,
  'nightly-backup': backupJob,
  'evening-reminder': makeEveningReminderJob({
    send: telegramSender(),
    isDone: async (day) => (await questionsFor(day)).done,
    baseUrl: env.baseUrl,
  }),
});
