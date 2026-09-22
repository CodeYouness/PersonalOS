#!/usr/bin/env node
/**
 * Manually runs the Google Calendar sync (ticket #31, ADR 0010/0014). Never
 * called by a request handler -- a sync runs from a script, a scheduled job,
 * or an agent session, and only this path ever reads the iCal URL.
 *
 * Plain Node, like every script under scripts/: relative imports only, reuse
 * of the real data layer through lib/store.js instead of reaching around it.
 */

import { env } from '../lib/config/env.js';
import { findIntegration } from '../lib/integrations/registry.js';
import * as store from '../lib/store.js';

const integration = findIntegration('google-calendar');
if (integration === null) {
  console.error('google-calendar is not registered in lib/integrations/registry.js');
  process.exitCode = 1;
} else if (!integration.isConfigured()) {
  console.error('GOOGLE_CALENDAR_ICAL_URL is not set -- nothing to sync.');
  process.exitCode = 1;
} else {
  const profile = await store.getProfile();

  try {
    const result = await integration.sync({ store, timezone: env.timezone, baseCurrency: profile.baseCurrency });
    await store.updateSyncState('google-calendar', {
      lastRunAt: result.syncedAt,
      status: 'ok',
      error: '',
      itemCount: result.written,
    });
    console.log('synced ' + result.written + ' appointment(s), skipped ' + result.skipped);
    for (const warning of result.warnings) console.log('  ' + warning);
  } catch (error) {
    await store.updateSyncState('google-calendar', {
      lastRunAt: new Date().toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      itemCount: 0,
    });
    console.error('calendar sync failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
