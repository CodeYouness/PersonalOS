import { describe, expect, it } from 'vitest';

import { runCostMicros, runLogView } from '@/lib/domain/derive/run-log.js';

const ROME = 'Europe/Rome';
/** @param {Record<string, unknown>} [over] */
const schedule = (over = {}) => /** @type {any} */ ({
  id: 'prune-runs', time: '03:30', days: [1, 2, 3, 4, 5, 6, 7], engine: 'script', catchUp: 'once', ...over,
});
/** @param {Record<string, unknown>} over */
const run = (over) => /** @type {any} */ ({
  id: 'r', schedule: 'prune-runs', startedBy: 'schedule', engine: 'script', startedAt: '2026-06-15T01:30:00.000Z',
  durationMs: 40, outcome: 'ok', reason: '', wrote: {}, model: null, inputTokens: null, outputTokens: null,
  createdAt: '2026-06-15T01:30:00.000Z', ...over,
});
const NOW = new Date('2026-06-15T10:00:00Z');

describe('runLogView', () => {
  it('lists a schedule that never ran with no last run, and when it is next due', () => {
    const view = runLogView({ schedules: [schedule()], runs: [], now: NOW, timezone: ROME });
    expect(view.schedules).toHaveLength(1);
    expect(view.schedules[0].last).toBeNull();
    // 03:30 Rome on the 16th, in summer time.
    expect(view.schedules[0].nextAt).toBe('2026-06-16T01:30:00.000Z');
    expect(view.total).toBe(0);
    expect(view.rows).toEqual([]);
  });

  it("takes each schedule's last run from the newest of its own runs", () => {
    const runs = [
      run({ id: 'old', startedAt: '2026-06-13T01:30:00Z' }),
      run({ id: 'new', startedAt: '2026-06-15T01:30:00Z', outcome: 'failed', reason: 'boom' }),
      run({ id: 'other', schedule: 'x', startedAt: '2026-06-15T09:00:00Z' }),
    ];
    const view = runLogView({ schedules: [schedule()], runs, now: NOW, timezone: ROME });
    expect(view.schedules[0].last?.id).toBe('new');
  });

  it('lists runs newest first, capped, with how many there are in all', () => {
    const runs = [1, 2, 3].map((n) => run({ id: 'r' + n, startedAt: '2026-06-1' + n + 'T01:00:00Z' }));
    const view = runLogView({ schedules: [schedule()], runs, now: NOW, timezone: ROME, limit: 2 });
    expect(view.rows.map((row) => row.id)).toEqual(['r3', 'r2']);
    expect(view.total).toBe(3);
  });

  it('derives the cost of a model run from its tokens, and none for a script run or an unpriced model', () => {
    const prices = { 'claude-haiku-5-5': { inputPerMTok: 100_000, outputPerMTok: 500_000 } };
    const model = run({ engine: 'small-model', model: 'claude-haiku-5-5', inputTokens: 2000, outputTokens: 400 });
    // 2000 x 0.1 + 400 x 0.5 micro-dollars per thousand tokens = 200 + 200.
    expect(runCostMicros(model, prices)).toBe(400);
    expect(runCostMicros(run({}), prices)).toBeNull();
    expect(runCostMicros({ ...model, model: 'unknown' }, prices)).toBeNull();
  });
});
