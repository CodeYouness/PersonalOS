#!/usr/bin/env node
/**
 * Manually runs the Google Calendar sync (ticket #31, ADR 0010/0014). Never
 * called by a request handler -- a sync runs from a script, a scheduled job,
 * or an agent session, and only this path ever reads the iCal URL.
 *
 * Plain Node, like every script under scripts/: relative imports only, reuse
 * of the real data layer through lib/store.js instead of reaching around it.
 *
 * The run is recorded in the run log as `sync-calendar` started by `user`,
 * through the same job the scheduler runs (ADR 0063).
 */

import { env } from '../lib/config/env.js';
import { runManually } from '../lib/scheduler/run-manually.js';
import { makeCalendarSyncJob } from '../lib/scheduler/sync-jobs.js';
import * as store from '../lib/store.js';

/** @type {any} */
let result = null;
const run = await runManually('sync-calendar', {
  job: makeCalendarSyncJob({ onResult: (synced) => { result = synced; } }),
  store,
  timezone: env.timezone,
});
if (result !== null) {
  console.log('synced ' + result.written + ' appointment(s), skipped ' + result.skipped);
  for (const warning of result.warnings) console.log('  ' + warning);
}
if (run === null) {
  console.error('the run could not be recorded in the run log');
  process.exitCode = 1;
} else if (run.outcome === 'skipped') {
  console.error('GOOGLE_CALENDAR_ICAL_URL is not set -- nothing to sync.');
  process.exitCode = 1;
} else if (run.outcome === 'failed') {
  console.error('calendar sync failed: ' + run.reason);
  process.exitCode = 1;
}
