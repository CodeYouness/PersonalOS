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
 * request handler (ADR 0010). Stop `npm run dev` first: a second process
 * writing the same file is not safe (ADR 0011).
 *
 * A failed run (any non-zero exit from `sc`, output that is not JSON) writes
 * nothing but a failed SyncState, which leaves `lastRunAt` at the last
 * success. A refusal (demo rows still present) is not a failed sync and
 * records nothing.
 */

import '../lib/config/env.js';
import { SCALABLE_SYNC_SOURCE } from '../lib/domain/derive/sync-staleness.js';
import { makeScRunner } from '../lib/integrations/scalable/run-sc.js';
import { syncScalable } from '../lib/integrations/scalable/sync.js';
import * as store from '../lib/store.js';

const dryRun = process.argv.includes('--dry-run');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--dry-run');

if (unknown.length > 0) {
  console.error('unknown argument: ' + unknown.join(' ') + ' (only --dry-run)');
  process.exitCode = 1;
} else if (await store.hasDemoFinance()) {
  console.error('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');
  process.exitCode = 1;
} else {
  try {
    const result = await syncScalable({ run: makeScRunner(), store, dryRun });
    if (dryRun) {
      console.log('dry run: nothing was written');
    } else {
      await store.updateSyncState(SCALABLE_SYNC_SOURCE, { lastRunAt: result.syncedAt, status: 'ok', error: '', itemCount: result.written });
      if (result.backupPath !== null) console.log('the data before the first sync is backed up at ' + result.backupPath);
      console.log('synced: ' + result.written + ' record(s) written, ' + result.skipped + ' row(s) left alone');
    }
    for (const line of result.report) console.log('  ' + line);
    for (const warning of result.warnings) console.log('  warning: ' + warning);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun) await store.updateSyncState(SCALABLE_SYNC_SOURCE, { status: 'error', error: message });
    console.error('scalable sync failed: ' + message);
    process.exitCode = 1;
  }
}
