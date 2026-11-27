/**
 * The failure alert rule (#292, ADR 0069): a pure derivation over one
 * schedule's runs. A failure alerts when the run before it had not failed;
 * a run that skipped is neither.
 */

import { describe, expect, it } from 'vitest';

import { failureAlert } from '@/lib/domain/derive/run-alerts.js';

/**
 * Runs oldest first, as they happened, a minute apart. An entry is an
 * outcome, or an outcome with its reason.
 *
 * @param {...('ok'|'failed'|'skipped'|['failed', string])} entries
 */
function log(...entries) {
  return entries.map((entry, minute) => {
    const [outcome, reason] = typeof entry === 'string' ? [entry, ''] : entry;
    return /** @type {any} */ ({ schedule: 'sync-scalable', outcome, reason, startedAt: new Date(Date.UTC(2026, 5, 15, 7, minute)).toISOString() });
  });
}

describe('failureAlert', () => {
  it('is nothing for a schedule that never ran', () => {
    expect(failureAlert([])).toBeNull();
  });

  it('is nothing when the newest run did not fail', () => {
    expect(failureAlert(log('failed', 'ok'))).toBeNull();
    expect(failureAlert(log('failed', 'skipped'))).toBeNull();
  });

  it('alerts on the first failure, with or without a run before it', () => {
    expect(failureAlert(log('failed'))).toBe('failed');
    expect(failureAlert(log('ok', 'failed'))).toBe('failed');
  });

  it('does not alert on a second consecutive failure', () => {
    expect(failureAlert(log('ok', 'failed', 'failed'))).toBeNull();
  });

  it('alerts again on a failure after a success', () => {
    expect(failureAlert(log('failed', 'failed', 'ok', 'failed'))).toBe('failed');
  });

  it('does not take a skipped run for a success: nothing more until it succeeds', () => {
    expect(failureAlert(log('failed', 'skipped', 'failed'))).toBeNull();
    expect(failureAlert(log('ok', 'skipped', 'failed'))).toBe('failed');
  });

  it('says a login is needed when that is why it failed', () => {
    expect(failureAlert(log('ok', ['failed', 'needs-login']))).toBe('needs-login');
  });

  it('reads the runs in the order they happened, whatever order it is given', () => {
    expect(failureAlert(log('ok', 'failed').reverse())).toBe('failed');
    expect(failureAlert(log('failed', 'ok').reverse())).toBeNull();
  });
});
