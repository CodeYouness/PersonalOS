#!/usr/bin/env node
/**
 * Manually runs the Google Calendar sync (ticket #31, ADR 0010/0014). Never
 * called by a request handler -- a sync runs from a script, a scheduled job,
 * or an agent session, and only this path ever reads the iCal URL.
 *
 * Plain Node, like every script under scripts/: relative imports only, reuse
 * of the real data layer through lib/store.js instead of reaching around it.
 */

import { runCalendarSync } from '../lib/integrations/google-calendar/run-sync.js';
import * as store from '../lib/store.js';

try {
  const outcome = await runCalendarSync({ store });
  if (!outcome.configured) {
    console.error('GOOGLE_CALENDAR_ICAL_URL is not set -- nothing to sync.');
    process.exitCode = 1;
  } else {
    const { result } = outcome;
    console.log('synced ' + result.written + ' appointment(s), skipped ' + result.skipped);
    for (const warning of result.warnings) console.log('  ' + warning);
  }
} catch (error) {
  console.error('calendar sync failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
