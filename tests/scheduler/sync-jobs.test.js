/**
 * The scheduled syncs (#287): the calendar and the broker jobs call the same
 * sync functions the scripts call. Driven with a fixture feed and a fake `sc`
 * on a throwaway DATA_DIR -- no network, no real CLI.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fakeSc, savingsPlanBuy } from '../integrations/scalable-fake.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/scheduler/sync-jobs.js')} */
let jobs;
/** @type {typeof import('@/lib/integrations/google-calendar/index.js')} */
let calendar;
/** @type {typeof import('@/lib/integrations/scalable/client.js')} */
let client;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-sync-jobs-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  dates = await import('@/lib/domain/dates.js');
  dates.setDefaultTimezone('Europe/Rome');
  jobs = await import('@/lib/scheduler/sync-jobs.js');
  calendar = await import('@/lib/integrations/google-calendar/index.js');
  client = await import('@/lib/integrations/scalable/client.js');
});

beforeEach(async () => {
  await store.resetToSeed();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

const NOW = new Date('2026-11-23T06:00:00Z');
/** @returns {any} */
const context = () => ({ scheduleId: 'x', startedBy: 'schedule', now: NOW, timezone: 'Europe/Rome', store });

/**
 * An integration whose fetch is replaced by a fixture feed of two events tomorrow.
 *
 * @param {boolean} configured
 * @param {Error | null} [failure]
 */
function feedIntegration(configured, failure = null) {
  const day = dates.shiftDayKey(dates.today(), 1).replaceAll('-', '');
  const vevent = (/** @type {string} */ uid, /** @type {string} */ hour) =>
    ['BEGIN:VEVENT', 'DTSTART:' + day + 'T' + hour + '0000Z', 'DTEND:' + day + 'T' + hour + '3000Z', 'DTSTAMP:20260101T000000Z', 'UID:' + uid, 'SUMMARY:Example', 'END:VEVENT'].join('\r\n');
  const text = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + vevent('a', '10') + '\r\n' + vevent('b', '12') + '\r\nEND:VCALENDAR\r\n';
  return {
    name: calendar.name,
    kind: /** @type {const} */ ('calendar'),
    isConfigured: () => configured,
    sync: async (/** @type {any} */ ctx) => {
      if (failure !== null) throw failure;
      return calendar.syncFromIcs(text, ctx);
    },
  };
}

describe('the calendar job', () => {
  it('writes what the sync writes and counts it', async () => {
    const result = await jobs.makeCalendarSyncJob({ integration: feedIntegration(true) })(context());

    expect(result).toEqual({ wrote: { appointments: 2 } });
    const synced = (await store.getAppointments()).filter((a) => a.origin?.source === calendar.name);
    expect(synced).toHaveLength(2);
    const state = (await store.getSyncStates()).find((s) => s.integration === calendar.name);
    expect(state?.status).toBe('ok');
    expect(state?.itemCount).toBe(2);
  });

  it('is skipped, not failed, with no calendar configured', async () => {
    const result = await jobs.makeCalendarSyncJob({ integration: feedIntegration(false) })(context());
    expect(result).toEqual({ outcome: 'skipped', reason: 'not-configured' });
  });

  it('on failure keeps the last good data and its date, and says why', async () => {
    await jobs.makeCalendarSyncJob({ integration: feedIntegration(true) })(context());
    const before = (await store.getSyncStates()).find((s) => s.integration === calendar.name);

    const result = await jobs.makeCalendarSyncJob({ integration: feedIntegration(true, new Error('HTTP 500')) })(context());

    expect(result).toEqual({ outcome: 'failed', reason: 'HTTP 500' });
    expect((await store.getAppointments()).filter((a) => a.origin?.source === calendar.name)).toHaveLength(2);
    const after = (await store.getSyncStates()).find((s) => s.integration === calendar.name);
    expect(after?.status).toBe('error');
    expect(before?.status).toBe('ok');
  });
});

describe('the broker job', () => {
  beforeEach(async () => {
    await store.removeDemoFinance();
  });

  const scenario = () => fakeSc({
    holdings: [],
    transactions: [savingsPlanBuy({ id: 'tx-1', isin: 'XX0000000001', description: 'Example ETF', amount: 100, quantity: 2, last_event_datetime: '2026-11-02T10:00:00Z' })],
    cashBalance: 0,
  });

  it('writes through the same sync and its run counts match what was written', async () => {
    const result = await jobs.makeScalableSyncJob({ makeRunner: () => scenario().run })(context());

    expect(result?.outcome).toBeUndefined();
    const total = Object.values(result?.wrote ?? {}).reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(0);
    const state = (await store.getSyncStates()).find((s) => s.integration === 'scalable');
    expect(state?.status).toBe('ok');
    expect(state?.itemCount).toBe(total);
  });

  it('records an auth failure of the CLI as needs-login and keeps the last success date', async () => {
    await jobs.makeScalableSyncJob({ makeRunner: () => scenario().run })(context());
    const before = (await store.getSyncStates()).find((s) => s.integration === 'scalable');
    const failing = async () => { throw new client.ScCommandError(20, 'session expired'); };

    const result = await jobs.makeScalableSyncJob({ makeRunner: () => failing })(context());

    expect(result).toEqual({ outcome: 'failed', reason: 'needs-login' });
    const after = (await store.getSyncStates()).find((s) => s.integration === 'scalable');
    expect(after?.status).toBe('error');
    expect(after?.lastRunAt).toBe(before?.lastRunAt);
  });

  it('is skipped when the CLI is not installed', async () => {
    const missing = async () => { throw new client.ScCommandError(1, 'could not run `sc`', 'not-installed'); };
    const result = await jobs.makeScalableSyncJob({ makeRunner: () => missing })(context());
    expect(result).toEqual({ outcome: 'skipped', reason: 'not-configured' });
  });

  it('refuses on demo finance rows and records no sync state', async () => {
    await store.resetToSeed();
    const result = await jobs.makeScalableSyncJob({ makeRunner: () => scenario().run })(context());

    expect(result?.outcome).toBe('failed');
    expect(result?.reason).toMatch(/demo finance/);
    expect((await store.getSyncStates()).find((s) => s.integration === 'scalable')?.status ?? 'never').toBe('never');
  });
});
