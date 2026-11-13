/**
 * Time declared against areas (ADR 0037): a day's total and the time by area
 * over a span. The one implementation behind the Review screen's figures and
 * the question context's (rule 6).
 *
 * Only a declared day counts. A day never declared (`time` null, or a log
 * read before the field existed) is unknown, not zero; a day declared with
 * nothing (`{}`) is a known zero.
 */

import { TIME_AREA_KEYS } from '../day-time.js';

/**
 * @param {Pick<import('../types.js').DailyLog, 'time'> | { time?: undefined }} log
 * @returns {Record<string, number> | null} the day's declared minutes by area,
 *   or null when the day was not declared
 */
function declaredTime(log) {
  const time = log.time;
  return typeof time === 'object' && time !== null ? time : null;
}

/**
 * The minutes declared on one day, every area added; null when the day was
 * not declared.
 *
 * @param {Pick<import('../types.js').DailyLog, 'time'>} log
 * @returns {number | null}
 */
export function dayTimeTotal(log) {
  const time = declaredTime(log);
  if (time === null) return null;
  return TIME_AREA_KEYS.reduce((sum, area) => sum + (time[area] ?? 0), 0);
}

/**
 * @typedef {object} TimeByArea
 * @property {number} declaredDays days of the span that were declared,
 *   "nothing" included
 * @property {Record<string, number>} byArea minutes per area over those days,
 *   in the order of `TIME_AREAS`; an area with no time on any of them has no
 *   key
 * @property {number | null} total every area added; null when no day was
 *   declared, 0 when the declared days had nothing
 */

/**
 * The time declared against each area over the days from `from` to `to`, both
 * included, counting only the declared days.
 *
 * @param {Pick<import('../types.js').DailyLog, 'date' | 'time'>[]} logs any days;
 *   those outside the span are left out
 * @param {{ from: string, to: string }} span day keys
 * @returns {TimeByArea}
 */
export function timeByArea(logs, { from, to }) {
  let declaredDays = 0;
  /** @type {Record<string, number>} */
  const sums = {};
  for (const log of logs) {
    if (log.date < from || log.date > to) continue;
    const time = declaredTime(log);
    if (time === null) continue;
    declaredDays += 1;
    for (const area of TIME_AREA_KEYS) {
      const minutes = time[area] ?? 0;
      if (minutes > 0) sums[area] = (sums[area] ?? 0) + minutes;
    }
  }

  /** @type {Record<string, number>} */
  const byArea = {};
  for (const area of TIME_AREA_KEYS) if (sums[area] !== undefined) byArea[area] = sums[area];
  const total = Object.values(byArea).reduce((sum, minutes) => sum + minutes, 0);
  return { declaredDays, byArea, total: declaredDays === 0 ? null : total };
}
