/**
 * The Finances staleness line (ticket #216, spec #212): what the broker's
 * saved SyncState says, in days, in the user's timezone.
 */

import { describe, expect, it } from 'vitest';

import { SCALABLE_SYNC_SOURCE, brokerStaleness } from '../../lib/domain/derive/sync-staleness.js';

const TZ = 'Europe/Berlin';
/** @param {Record<string, unknown>} patch @returns {import('../../lib/domain/types.js').SyncState} */
const state = (patch) => ({
  integration: SCALABLE_SYNC_SOURCE,
  lastRunAt: null,
  status: 'never',
  error: '',
  itemCount: 0,
  ...patch,
});

describe('brokerStaleness', () => {
  it('is the source key #214 writes', () => {
    expect(SCALABLE_SYNC_SOURCE).toBe('scalable');
  });

  it('is absent with no SyncState, or one that never ran', () => {
    expect(brokerStaleness([], '2026-11-09', TZ)).toBeNull();
    expect(brokerStaleness([state({})], '2026-11-09', TZ)).toBeNull();
    const other = state({ integration: 'google-calendar', status: 'ok', lastRunAt: '2026-11-09T08:00:00Z' });
    expect(brokerStaleness([other], '2026-11-09', TZ)).toBeNull();
  });

  it('reads a fresh run as today', () => {
    const result = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-09T08:00:00Z' })], '2026-11-09', TZ);
    expect(result).toEqual({ text: 'Scalable · synced today', tone: 'ok', error: null });
  });

  it('counts days in the user timezone, not UTC', () => {
    // 23:30 UTC on the 8th is already the 9th in Berlin.
    const result = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-08T23:30:00Z' })], '2026-11-09', TZ);
    expect(result?.text).toBe('Scalable · synced today');
  });

  it('says 1 day ago and N days ago', () => {
    const one = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-08T12:00:00Z' })], '2026-11-09', TZ);
    expect(one?.text).toBe('Scalable · synced 1 day ago');
    const three = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-06T12:00:00Z' })], '2026-11-09', TZ);
    expect(three?.text).toBe('Scalable · synced 3 days ago');
  });

  it('turns to warning after 7 days, not at 7', () => {
    const seven = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-02T12:00:00Z' })], '2026-11-09', TZ);
    expect(seven?.tone).toBe('ok');
    const eight = brokerStaleness([state({ status: 'ok', lastRunAt: '2026-11-01T12:00:00Z' })], '2026-11-09', TZ);
    expect(eight).toEqual({ text: 'Scalable · synced 8 days ago', tone: 'warning', error: null });
  });

  it('after a failed run shows the error and the last successful run', () => {
    const result = brokerStaleness(
      [state({ status: 'error', error: 'sc exited with code 20', lastRunAt: '2026-11-06T12:00:00Z' })],
      '2026-11-09',
      TZ
    );
    expect(result).toEqual({
      text: 'Scalable · last synced 3 days ago',
      tone: 'error',
      error: 'Last run failed: sc exited with code 20',
    });
  });

  it('shows a failure that never had a success', () => {
    const result = brokerStaleness([state({ status: 'error', error: 'network', lastRunAt: null })], '2026-11-09', TZ);
    expect(result).toEqual({ text: 'Scalable · never synced', tone: 'error', error: 'Last run failed: network' });
  });
});
