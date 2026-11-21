/**
 * The scheduled syncs (#287): thin jobs over the same functions the scripts
 * call. Nothing is reimplemented here; a job only maps the outcome to a run.
 */

import { runCalendarSync } from '../integrations/google-calendar/run-sync.js';
import { ScCommandError } from '../integrations/scalable/client.js';
import { makeScRunner } from '../integrations/scalable/run-sc.js';
import { runScalableSync, ScalableRefusal } from '../integrations/scalable/run-sync.js';

/** `sc`'s exit code for an auth or config failure. */
const SC_AUTH_EXIT_CODE = 20;

/**
 * @param {{ integration?: import('../integrations/contract.js').Integration }} [options]
 * @returns {import('./scheduler.js').Job}
 */
export function makeCalendarSyncJob({ integration } = {}) {
  return async ({ store, timezone }) => {
    try {
      const outcome = await runCalendarSync({ store, timezone, integration });
      if (!outcome.configured) return { outcome: 'skipped', reason: 'not-configured' };
      return { wrote: { appointments: outcome.result.written } };
    } catch (error) {
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  };
}

/**
 * @param {{ makeRunner?: () => import('../integrations/scalable/client.js').ScRunner }} [options]
 * @returns {import('./scheduler.js').Job}
 */
export function makeScalableSyncJob({ makeRunner = makeScRunner } = {}) {
  return async ({ store }) => {
    try {
      const report = await runScalableSync({ store, run: makeRunner() });
      return { wrote: { records: report.written } };
    } catch (error) {
      if (error instanceof ScalableRefusal) return { outcome: 'failed', reason: error.message };
      if (error instanceof ScCommandError) {
        if (error.reason === 'not-installed') return { outcome: 'skipped', reason: 'not-configured' };
        if (error.exitCode === SC_AUTH_EXIT_CODE) return { outcome: 'failed', reason: 'needs-login' };
      }
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  };
}

export const calendarSyncJob = makeCalendarSyncJob();
export const scalableSyncJob = makeScalableSyncJob();
