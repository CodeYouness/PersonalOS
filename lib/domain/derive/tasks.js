/**
 * Everything about a task that is computed rather than stored.
 *
 * "Overdue" is the reason this file exists. It is a state a task reaches by
 * time passing, so it must never be a value anybody can write -- otherwise
 * the data and the calendar can disagree, and the data wins by accident.
 */

import { TEMPERATURES, URGENCY_BANDS } from '../../../personalos.config.js';
import { dayKeyRange } from '../dates.js';

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
 * @returns {import('../types.js').DisplayBand}
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

/**
 * The CRM board: every open task in its display column, each column in
 * urgency order. A completed task is on no column -- it has left the board.
 *
 * @param {import('../types.js').Task[]} tasks
 * @param {string} todayKey
 * @returns {Record<import('../types.js').DisplayBand, import('../types.js').Task[]>}
 */
export function boardColumns(tasks, todayKey) {
  /** @type {Record<import('../types.js').DisplayBand, import('../types.js').Task[]>} */
  const columns = { overdue: [], today: [], week: [], later: [] };
  const open = tasks.filter((task) => task.completedAt === null);
  for (const task of sortByUrgency(open, todayKey)) {
    columns[displayBand(task, todayKey)].push(task);
  }
  return columns;
}

/**
 * Whole days since the task was created -- how long it has been waiting.
 * The same meaning in every column, overdue or not. The creation instant is
 * turned into a day key by the caller's `dayKeyOf` (pass `toDayKey`), so the
 * day it was created is the user's day, not UTC's. A task stamped after
 * today (a skewed clock, a hand-edited file) is 0 days old, never negative.
 *
 * @param {import('../types.js').Task} task
 * @param {string} todayKey
 * @param {(instant: Date) => string} dayKeyOf
 * @returns {number}
 */
export function ticketAge(task, todayKey, dayKeyOf) {
  const createdKey = dayKeyOf(new Date(task.createdAt));
  if (createdKey >= todayKey) return 0;
  return dayKeyRange(createdKey, todayKey).length - 1;
}

/**
 * The CRM's By person view: open tasks grouped by who they are owed to.
 * Groups are ordered by each person's most urgent task -- whoever waits
 * hardest comes first -- and tasks inside a group keep the board's urgency
 * order. Tasks owed to no one form the last group, `personId: null`. A
 * person with nothing open does not appear.
 *
 * `personOf` answers who a task involves (the store's `involves` link);
 * this stays pure by being handed the answer.
 *
 * @param {import('../types.js').Task[]} tasks
 * @param {(taskId: string) => string | null} personOf
 * @param {string} todayKey
 * @returns {{ personId: string | null, tasks: import('../types.js').Task[] }[]}
 */
export function personGroups(tasks, personOf, todayKey) {
  /** @type {Map<string | null, import('../types.js').Task[]>} */
  const groups = new Map();
  const open = tasks.filter((task) => task.completedAt === null);
  // Walking the tasks most urgent first means a group is created at its
  // person's most urgent task, so insertion order is the order we want.
  for (const task of sortByUrgency(open, todayKey)) {
    const personId = personOf(task.id);
    groups.set(personId, [...(groups.get(personId) ?? []), task]);
  }
  const named = [...groups].filter(([personId]) => personId !== null);
  const nobody = groups.get(null);
  return [
    ...named.map(([personId, grouped]) => ({ personId, tasks: grouped })),
    ...(nobody === undefined ? [] : [{ personId: null, tasks: nobody }]),
  ];
}
