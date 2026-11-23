/**
 * The shipped schedule: runs older than 90 days are removed, a newer one
 * stays. And the declared schedules and their jobs agree.
 */

import { describe, expect, it } from 'vitest';

import { JOBS } from '@/lib/scheduler/jobs.js';
import { pruneRunsJob } from '@/lib/scheduler/prune-runs.js';
import { SCHEDULE_NEEDS, SCHEDULES } from '@/personalos.config.js';

describe('prune-runs', () => {
  it('removes the runs older than the retention and reports how many', async () => {
    /** @type {string | null} */
    let cutoff = null;
    const store = { removeRunsBefore: async (/** @type {string} */ before) => { cutoff = before; return 4; } };

    const result = await pruneRunsJob(/** @type {any} */ ({ now: new Date('2026-11-21T02:30:00Z'), store }));

    expect(cutoff).toBe('2026-08-23T02:30:00.000Z');
    expect(result).toEqual({ wrote: { runs: 4 } });
  });
});

describe('the declared schedules', () => {
  it('each has a job and each job a schedule', () => {
    expect(Object.keys(JOBS).sort()).toEqual(SCHEDULES.map((schedule) => schedule.id).sort());
  });

  it('each need is one of the closed list, and the broker sync waits for the Mac to be unlocked', () => {
    for (const schedule of SCHEDULES) {
      if (schedule.needs !== undefined) expect(SCHEDULE_NEEDS).toContain(schedule.needs);
    }
    expect(SCHEDULES.find((schedule) => schedule.id === 'sync-scalable')?.needs).toBe('unlocked');
  });
});
