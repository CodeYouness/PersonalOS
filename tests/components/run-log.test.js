/**
 * The run log page's body (#289): each schedule with its last run and next
 * slot on top, the runs below. Static markup, as the server renders it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RunLog from '@/components/RunLog.js';
import { runLogView } from '@/lib/domain/derive/run-log.js';

const ROME = 'Europe/Rome';
const NOW = new Date('2026-06-15T10:00:00Z');
const PRICES = { 'claude-haiku-5-5': { inputPerMTok: 100_000, outputPerMTok: 500_000 } };
/** @param {string} id */
const schedule = (id) => /** @type {any} */ ({ id, time: '03:30', days: [1, 2, 3, 4, 5, 6, 7], engine: 'script', catchUp: 'once' });
/** @param {Record<string, unknown>} over */
const run = (over) => /** @type {any} */ ({
  id: 'r', schedule: 'prune-runs', startedBy: 'schedule', engine: 'script', startedAt: '2026-06-15T01:30:00.000Z',
  durationMs: 840, outcome: 'ok', reason: '', wrote: {}, model: null, inputTokens: null, outputTokens: null,
  createdAt: '2026-06-15T01:30:00.000Z', ...over,
});

/**
 * @param {any[]} schedules
 * @param {any[]} runs
 * @param {number} [limit]
 */
function render(schedules, runs, limit) {
  const view = runLogView({ schedules, runs, now: NOW, timezone: ROME, limit });
  return renderToStaticMarkup(createElement(RunLog, { view, timezone: ROME, prices: PRICES }));
}

describe('RunLog', () => {
  it('lists a schedule that never ran as "never", with when it is next due', () => {
    const html = render([schedule('prune-runs')], []);

    expect(html).toContain('prune-runs');
    expect(html).toContain('Never');
    expect(html).toContain('16 Jun, 03:30');
    expect(html).toContain('No runs yet');
  });

  it('lists every schedule it is given, one with runs and one without', () => {
    const html = render([schedule('prune-runs'), schedule('sync-broker')], [run({})]);

    expect(html).toContain('sync-broker');
    expect(html.match(/data-schedule-row/g)).toHaveLength(2);
  });

  it('shows a failed run with its error and a skipped run with its reason', () => {
    const html = render(
      [schedule('prune-runs')],
      [
        run({ id: 'a', outcome: 'failed', reason: 'The data file was locked', startedAt: '2026-06-15T01:30:00Z' }),
        run({ id: 'b', outcome: 'skipped', reason: 'Nothing configured', startedAt: '2026-06-14T01:30:00Z' }),
      ]
    );

    expect(html).toContain('The data file was locked');
    expect(html).toContain('Nothing configured');
    expect(html).toContain('Failed');
    expect(html).toContain('Skipped');
  });

  it('says how many runs it shows out of how many there are, newest first', () => {
    const runs = [1, 2, 3].map((n) => run({ id: 'r' + n, startedAt: '2026-06-1' + n + 'T01:00:00Z', durationMs: n * 1000 }));
    const html = render([schedule('prune-runs')], runs, 2);

    expect(html).toContain('Showing the newest 2 of 3 runs');
    expect(html.indexOf('3.0 s')).toBeLessThan(html.indexOf('2.0 s'));
    expect(html).not.toContain('1.0 s');
  });

  it('says all of them when it shows every run', () => {
    expect(render([schedule('prune-runs')], [run({})])).toContain('Showing 1 run');
  });

  it('shows a model run with its tokens and the cost derived from them, and what a run wrote', () => {
    const html = render(
      [schedule('prune-runs')],
      [run({ engine: 'small-model', model: 'claude-haiku-5-5', inputTokens: 2000, outputTokens: 400, wrote: { runs: 3 } })]
    );

    expect(html).toContain('2,000 in');
    expect(html).toContain('400 out');
    expect(html).toContain('$0.0004');
    expect(html).toContain('runs 3');
  });

  it('shows the start and the duration in the formats the screens share', () => {
    const html = render([schedule('prune-runs')], [run({ startedBy: 'user' })]);

    expect(html).toContain('15 Jun, 03:30');
    expect(html).toContain('840 ms');
    expect(html).toContain('You');
  });
});
