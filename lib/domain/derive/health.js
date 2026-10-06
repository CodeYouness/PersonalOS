/**
 * The Health card's numbers: one row per recorded day, and the weight trend.
 * The averages live with the nutrition totals they average
 * (`averagesOverRecordedDays`).
 */

import { averagesOverRecordedDays, dayTotals } from './nutrition.js';

/**
 * A day's weight: the one filed last that day, since several are all kept
 * (ADR 0020). By `createdAt`, not `recordedAt`, which is unknown for a weight
 * moved to an earlier day. `null` when the day has none.
 *
 * @param {import('../types.js').DailyLog} log
 * @returns {number | null}
 */
export function dayWeight(log) {
  const weights = log.measurements.filter((measurement) => measurement.metric === 'weight');
  if (weights.length === 0) return null;
  return weights.reduce((last, next) => (next.createdAt >= last.createdAt ? next : last)).value;
}

/**
 * The table's rows: every day with a meal or a weight, newest first. A day
 * with nothing recorded is left out, not shown as an empty row.
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {Array<ReturnType<typeof dayTotals> & { date: string, weight: number | null }>}
 */
export function healthRows(logs) {
  return logs
    .filter((log) => log.meals.length > 0 || dayWeight(log) !== null)
    .map((log) => ({ date: log.date, ...dayTotals(log), weight: dayWeight(log) }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

/**
 * The latest weight and how far it moved since the first one in the logs.
 * `null` when no day has a weight -- unknown, not zero; `change` is `null`
 * with only one day to compare. Rounded to the tenth a scale shows, so
 * floating point never reads as "−1.2000000000000028".
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {{ latest: number, change: number | null, since: string } | null}
 */
export function weightTrend(logs) {
  const weighed = [...logs]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((log) => ({ date: log.date, weight: dayWeight(log) }))
    .filter((day) => day.weight !== null);
  if (weighed.length === 0) return null;
  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  return {
    latest: /** @type {number} */ (last.weight),
    change: weighed.length === 1 ? null : Math.round((/** @type {number} */ (last.weight) - /** @type {number} */ (first.weight)) * 10) / 10,
    since: first.date,
  };
}

/**
 * The Health card's averages: the days before today only. Today is still
 * being eaten -- averaged at breakfast it would pull the month down every
 * morning (ADR 0020). It is shown in the table, never averaged.
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @param {string} todayKey
 * @returns {ReturnType<typeof averagesOverRecordedDays>}
 */
export function healthAverages(logs, todayKey) {
  return averagesOverRecordedDays(logs.filter((log) => log.date < todayKey));
}
