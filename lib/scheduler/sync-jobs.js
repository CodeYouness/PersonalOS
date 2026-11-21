/**
 * The scheduled syncs (#287): thin jobs over the same functions the scripts
 * call. Nothing is reimplemented here; a job only maps the outcome to a run.
 */

import { RUN_REASONS } from '../../personalos.config.js';
import { errorMessage } from '../domain/error-message.js';
import { runCalendarSync } from '../integrations/google-calendar/run-sync.js';
import { ScCommandError } from '../integrations/scalable/client.js';
import { makeScRunner } from '../integrations/scalable/run-sc.js';
import { runScalableSync, ScalableRefusal } from '../integrations/scalable/run-sync.js';

/** `sc`'s exit code for an auth or config failure. */
const SC_AUTH_EXIT_CODE = 20;

/**
 * `onResult` receives the sync's own result when it ran, so a script can
 * print its report; the run itself keeps only the counts.
 *
 * @param {{ integration?: import('../integrations/contract.js').Integration, onResult?: (result: any) => void }} [options]
 * @returns {import('./scheduler.js').Job}
 */
export function makeCalendarSyncJob({ integration, onResult } = {}) {
  return async ({ store, timezone }) => {
    try {
      const outcome = await runCalendarSync({ store, timezone, integration });
      if (!outcome.configured) return { outcome: 'skipped', reason: RUN_REASONS.notConfigured };
      onResult?.(outcome.result);
      return { wrote: { appointments: outcome.result.written } };
    } catch (error) {
      return { outcome: 'failed', reason: errorMessage(error) };
    }
  };
}

/**
 * `onResult` receives the sync's own report when it ran, as for the calendar.
 *
 * @param {{ makeRunner?: () => import('../integrations/scalable/client.js').ScRunner, onResult?: (result: any) => void }} [options]
 * @returns {import('./scheduler.js').Job}
 */
export function makeScalableSyncJob({ makeRunner = makeScRunner, onResult } = {}) {
  return async ({ store }) => {
    try {
      const report = await runScalableSync({ store, run: makeRunner() });
      onResult?.(report);
      return { wrote: report.writtenByKind };
    } catch (error) {
      if (error instanceof ScalableRefusal) return { outcome: 'failed', reason: error.message };
      if (error instanceof ScCommandError) {
        if (error.reason === 'not-installed') return { outcome: 'skipped', reason: RUN_REASONS.notConfigured };
        if (error.exitCode === SC_AUTH_EXIT_CODE) return { outcome: 'failed', reason: RUN_REASONS.needsLogin };
      }
      return { outcome: 'failed', reason: errorMessage(error) };
    }
  };
}

export const calendarSyncJob = makeCalendarSyncJob();
export const scalableSyncJob = makeScalableSyncJob();
