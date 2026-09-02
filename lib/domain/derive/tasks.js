/**
 * Everything about a task that is computed rather than stored.
 *
 * "Overdue" is the reason this file exists. It is a state a task reaches by
 * time passing, so it must never be a value anybody can write -- otherwise
 * the data and the calendar can disagree, and the data wins by accident.
 */

import { TEMPERATURES, URGENCY_BANDS } from '../../../personalos.config.js';

/**
 * A task chosen for "today" on an earlier day, still not done, is late.
 *
 * Only the `today` band can go overdue. A `week` task has not promised a day,
 * so nothing about it is broken until you move it.
 *
 * @param {import('../types.js').Task} task
 * @param {string} todayKey
 * @returns {boolean}
 */
export function isOverdue(task, todayKey) {
  if (task.completedAt !== null) return false;
  return task.band === 'today' && task.bandSetOn < todayKey;
}

/**
 * The band as the board should show it: the stored band, or the derived
 * `overdue` column when time has moved on.
 *
 * @param {import('../types.js').Task} task
 * @param {string} todayKey
 * @returns {'overdue'|'today'|'week'|'later'}
 */
export function displayBand(task, todayKey) {
  return isOverdue(task, todayKey) ? 'overdue' : task.band;
}

/**
 * How many days a task has been late. Zero when it is not.
 *
 * @param {import('../types.js').Task} task
 * @param {string} todayKey
 * @param {(from: string, to: string) => string[]} rangeFn pass dayKeyRange
 * @returns {number}
 */
export function daysOverdue(task, todayKey, rangeFn) {
  if (!isOverdue(task, todayKey)) return 0;
  return rangeFn(task.bandSetOn, todayKey).length - 1;
}

const DISPLAY_BAND_ORDER = ['overdue', ...URGENCY_BANDS];

/**
 * The ordering the morning uses: band first, then temperature, then the
 * manual position you set by dragging. Session shows the top of this list.
 *
 * @param {import('../types.js').Task[]} tasks
 * @param {string} todayKey
 * @returns {import('../types.js').Task[]}
 */
export function sortByUrgency(tasks, todayKey) {
  return [...tasks].sort((left, right) => {
    const byBand =
      DISPLAY_BAND_ORDER.indexOf(displayBand(left, todayKey)) -
      DISPLAY_BAND_ORDER.indexOf(displayBand(right, todayKey));
    if (byBand !== 0) return byBand;

    const byHeat =
      TEMPERATURES.indexOf(left.temperature) - TEMPERATURES.indexOf(right.temperature);
    if (byHeat !== 0) return byHeat;

    return left.position - right.position;
  });
}

/**
 * Open tasks that need attention today, most urgent first.
 *
 * @param {import('../types.js').Task[]} tasks
 * @param {string} todayKey
 * @returns {import('../types.js').Task[]}
 */
export function dueToday(tasks, todayKey) {
  const open = tasks.filter(
    (task) => task.completedAt === null && (task.band === 'today' || isOverdue(task, todayKey))
  );
  return sortByUrgency(open, todayKey);
}
