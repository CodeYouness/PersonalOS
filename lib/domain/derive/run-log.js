/**
 * What the run log page shows (ADR 0063), derived from saved values only:
 * each configured schedule with its last run and the next slot, and the
 * newest runs. "Next due" is `nextSlot`, the scheduler's own derivation.
 * Cost in money is derived here from tokens and a price, never stored.
 */

import { dueSlot, nextSlot } from './schedule.js';

/** How many runs the page lists; the rest are counted, not listed. */
export const RUN_LOG_LIMIT = 100;

/**
 * Cost of a model run in micro-dollars, or null when it has no tokens or its
 * model has no price (an unpriced run is shown without a cost, not at zero).
 *
 * @param {import('../types.js').Run} run
 * @param {Record<string, { inputPerMTok: number, outputPerMTok: number }>} prices micro-dollars per million tokens
 * @returns {number | null}
 */
export function runCostMicros(run, prices) {
  if (run.model === null || run.inputTokens === null || run.outputTokens === null) return null;
  const price = prices[run.model];
  if (price === undefined) return null;
  return Math.round((run.inputTokens * price.inputPerMTok + run.outputTokens * price.outputPerMTok) / 1_000_000);
}

/**
 * @typedef {object} ScheduleStatus
 * @property {string} id
 * @property {import('../types.js').Schedule} schedule
 * @property {import('../types.js').Run | null} last its newest run, any outcome
 * @property {string} nextAt ISO instant of the next slot
 * @property {boolean} due owed a run now: its latest slot is later than its
 *   last run. True for a moment before a tick, or for as long as the schedule
 *   waits for what it needs (ADR 0066)
 *
 * @typedef {object} RunLogView
 * @property {ScheduleStatus[]} schedules
 * @property {import('../types.js').Run[]} rows newest first, at most `limit`
 * @property {number} total every run in the log
 */

/**
 * @param {{
 *   schedules: readonly import('../types.js').Schedule[],
 *   runs: readonly import('../types.js').Run[],
 *   now: Date,
 *   timezone?: string,
 *   limit?: number,
 * }} input
 * @returns {RunLogView}
 */
export function runLogView({ schedules, runs, now, timezone, limit = RUN_LOG_LIMIT }) {
  const newestFirst = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return {
    schedules: schedules.map((schedule) => {
      const last = newestFirst.find((run) => run.schedule === schedule.id) ?? null;
      return {
        id: schedule.id,
        schedule,
        last,
        nextAt: nextSlot(schedule, now, timezone).toISOString(),
        due: dueSlot(schedule, last?.startedAt ?? null, now, timezone) !== null,
      };
    }),
    rows: newestFirst.slice(0, limit),
    total: newestFirst.length,
  };
}
