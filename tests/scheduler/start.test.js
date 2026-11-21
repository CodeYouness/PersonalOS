/**
 * The scheduler starts only in the process `npm run serve` started: never
 * under dev, the sandbox or Vitest (ADR 0062).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  /** @type {any} */ (globalThis)[Symbol.for('personalos.scheduler.started')] = undefined;
});

describe('startScheduler', () => {
  it('does not start when the process was not started by serve', async () => {
    vi.stubEnv('PERSONALOS_SCHEDULER', '');
    const { startScheduler } = await import('@/lib/scheduler/start.js');
    expect(startScheduler()).toBe(false);
  });

  it('does not start under Vitest even if asked to by accident of a stale variable', async () => {
    vi.stubEnv('PERSONALOS_SCHEDULER', '1');
    vi.stubEnv('VITEST', 'true');
    const { startScheduler } = await import('@/lib/scheduler/start.js');
    expect(startScheduler()).toBe(false);
  });

  it('starts once under serve, and a second call starts nothing', async () => {
    vi.stubEnv('PERSONALOS_SCHEDULER', '1');
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('DATA_DIR', 'data');
    const { startScheduler, stopScheduler } = await import('@/lib/scheduler/start.js');
    expect(startScheduler({ tick: false })).toBe(true);
    expect(startScheduler({ tick: false })).toBe(false);
    stopScheduler();
  });
});
