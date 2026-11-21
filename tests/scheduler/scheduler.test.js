/**
 * The scheduler takes its clock, its schedules, its jobs and its store as
 * arguments, so a test drives it with no waiting and no disk.
 */

import { describe, expect, it } from 'vitest';

import { createScheduler } from '@/lib/scheduler/scheduler.js';

const ROME = 'Europe/Rome';
/** @param {string} id @param {string} [time] */
const schedule = (id, time = '07:00') => /** @type {any} */ ({
  id, time, days: [1, 2, 3, 4, 5, 6, 7], engine: 'script', catchUp: 'once',
});

/** An in-memory store with the two functions the scheduler uses. */
function fakeStore() {
  /** @type {any[]} */
  const runs = [];
  return {
    runs,
    getRuns: async () => [...runs].reverse(),
    recordRun: async (/** @type {any} */ input) => {
      const run = { id: 'run_' + runs.length, reason: '', wrote: {}, model: null, inputTokens: null, outputTokens: null, ...input };
      runs.push(run);
      return run;
    },
  };
}

/** @param {string} iso */
function clockAt(iso) {
  let current = new Date(iso);
  return { now: () => current, set: (/** @type {string} */ next) => { current = new Date(next); } };
}

describe('the scheduler', () => {
  it('runs a due schedule once and records who started it, when, and what it wrote', async () => {
    const store = fakeStore();
    const clock = clockAt('2026-06-15T08:00:00Z');
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clock.now, timezone: ROME,
      jobs: { a: async () => ({ wrote: { runs: 3 } }) },
    });

    await scheduler.tick();
    await scheduler.tick();

    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      schedule: 'a', startedBy: 'schedule', engine: 'script', outcome: 'ok',
      startedAt: '2026-06-15T08:00:00.000Z', wrote: { runs: 3 },
    });
    expect(store.runs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('starts nothing while a run of the same schedule is in flight', async () => {
    const store = fakeStore();
    const clock = clockAt('2026-06-15T08:00:00Z');
    /** @type {() => void} */
    let release = () => {};
    let started = 0;
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clock.now, timezone: ROME,
      jobs: { a: () => { started += 1; return new Promise((resolve) => { release = () => resolve(undefined); }); } },
    });

    const first = scheduler.tick();
    await Promise.resolve();
    await scheduler.tick();
    expect(started).toBe(1);
    expect(scheduler.running()).toEqual(['a']);

    release();
    await first;
    expect(store.runs).toHaveLength(1);
    expect(scheduler.running()).toEqual([]);
  });

  it('records a job that throws as failed with its error, and still runs the next schedule', async () => {
    const store = fakeStore();
    const scheduler = createScheduler({
      schedules: [schedule('a'), schedule('b')], store, clock: clockAt('2026-06-15T08:00:00Z').now, timezone: ROME,
      jobs: { a: async () => { throw new Error('boom'); }, b: async () => ({ outcome: 'skipped', reason: 'nothing configured' }) },
    });

    await scheduler.tick();

    expect(store.runs.find((run) => run.schedule === 'a')).toMatchObject({ outcome: 'failed', reason: 'boom' });
    expect(store.runs.find((run) => run.schedule === 'b')).toMatchObject({ outcome: 'skipped', reason: 'nothing configured' });
  });

  it('lets a job report a failure it understands, with a reason', async () => {
    const store = fakeStore();
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clockAt('2026-06-15T08:00:00Z').now, timezone: ROME,
      jobs: { a: async () => ({ outcome: 'failed', reason: 'needs-login' }) },
    });
    await scheduler.tick();
    expect(store.runs[0]).toMatchObject({ outcome: 'failed', reason: 'needs-login' });
  });

  it('keeps a model run\'s model and token counts', async () => {
    const store = fakeStore();
    const scheduler = createScheduler({
      schedules: [{ ...schedule('a'), engine: 'small-model' }], store, clock: clockAt('2026-06-15T08:00:00Z').now, timezone: ROME,
      jobs: { a: async () => ({ model: { name: 'm', inputTokens: 5, outputTokens: 2 } }) },
    });
    await scheduler.tick();
    expect(store.runs[0]).toMatchObject({ engine: 'small-model', model: 'm', inputTokens: 5, outputTokens: 2 });
  });

  it('catches up once after a sleep across several days', async () => {
    const store = fakeStore();
    const clock = clockAt('2026-06-10T08:00:00Z');
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clock.now, timezone: ROME, jobs: { a: async () => undefined },
    });
    await scheduler.tick();
    clock.set('2026-06-15T08:00:00Z');
    await scheduler.tick();
    await scheduler.tick();
    expect(store.runs).toHaveLength(2);
  });

  it('does not retry a slot in the same process when the run could not be recorded', async () => {
    const store = fakeStore();
    store.recordRun = async () => { throw new Error('disk full'); };
    let calls = 0;
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clockAt('2026-06-15T08:00:00Z').now, timezone: ROME,
      jobs: { a: async () => { calls += 1; } }, log: () => {},
    });
    await scheduler.tick();
    await scheduler.tick();
    expect(calls).toBe(1);
  });

  it('runNow starts a schedule for the user and refuses while it runs', async () => {
    const store = fakeStore();
    const scheduler = createScheduler({
      schedules: [schedule('a')], store, clock: clockAt('2026-06-15T04:00:00Z').now, timezone: ROME,
      jobs: { a: async () => ({ wrote: { runs: 1 } }) },
    });
    const run = await scheduler.runNow('a', 'user');
    expect(run).toMatchObject({ startedBy: 'user', outcome: 'ok' });
    await expect(scheduler.runNow('nope', 'user')).rejects.toThrow();
  });

  it('refuses a schedule with no job', () => {
    expect(() => createScheduler({
      schedules: [schedule('a')], store: fakeStore(), clock: () => new Date(), timezone: ROME, jobs: {},
    })).toThrow(/no job/);
  });
});
