#!/usr/bin/env node
/**
 * Runs the Scalable sync (spec #212, ADR 0031): reads the broker through its
 * own CLI, `sc`, and writes one holding per security with its trades.
 *
 *   npm run sync:scalable -- --dry-run   print the plan, write nothing
 *   npm run sync:scalable                write; the first run that creates an
 *                                        account backs the data file up first
 *
 * Needs `sc` logged in with `--local-read-only` on this Mac. Never called by a
 * request handler (ADR 0010). Stop `npm run serve` (and `dev`, if running)
 * first: a second process writing the same file is not safe (ADR 0011).
 *
 * A failed run (any non-zero exit from `sc`, output that is not JSON) writes
 * nothing but a failed SyncState, which leaves `lastRunAt` at the last
 * success. A refusal (demo rows still present) records no SyncState.
 *
 * A real run (not --dry-run) is recorded in the run log as `sync-scalable`
 * started by `user`, through the same job the scheduler runs (ADR 0063), so
 * the run log never says "failed" about a sync that has since worked.
 */

import { env } from '../lib/config/env.js';
import { makeScRunner } from '../lib/integrations/scalable/run-sc.js';
import { runScalableSync } from '../lib/integrations/scalable/run-sync.js';
import { errorMessage } from '../lib/domain/error-message.js';
import { runManually } from '../lib/scheduler/run-manually.js';
import { makeScalableSyncJob } from '../lib/scheduler/sync-jobs.js';
import * as store from '../lib/store.js';

const dryRun = process.argv.includes('--dry-run');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--dry-run');

/** @param {{ report: string[], warnings: string[] }} result */
function printReport(result) {
  for (const line of result.report) console.log('  ' + line);
  for (const warning of result.warnings) console.log('  warning: ' + warning);
}

if (unknown.length > 0) {
  console.error('unknown argument: ' + unknown.join(' ') + ' (only --dry-run)');
  process.exitCode = 1;
} else if (dryRun) {
  try {
    printReport(await runScalableSync({ run: makeScRunner(), store, dryRun }));
    console.log('dry run: nothing was written');
  } catch (error) {
    console.error('scalable sync failed: ' + errorMessage(error));
    process.exitCode = 1;
  }
} else {
  /** @type {any} */
  let result = null;
  const run = await runManually('sync-scalable', {
    job: makeScalableSyncJob({ onResult: (report) => { result = report; } }),
    store,
    timezone: env.timezone,
  });
  if (result !== null) {
    if (result.backupPath !== null) console.log('the data before the first sync is backed up at ' + result.backupPath);
    console.log('synced: ' + result.written + ' record(s) written, ' + result.skipped + ' row(s) left alone');
    printReport(result);
  }
  if (run === null) {
    console.error('the run could not be recorded in the run log');
    process.exitCode = 1;
  } else if (run.outcome !== 'ok') {
    console.error('scalable sync ' + run.outcome + ': ' + run.reason);
    process.exitCode = 1;
  }
}
